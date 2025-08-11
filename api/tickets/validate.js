import { getDatabase } from "../lib/database.js";
import jwt from "jsonwebtoken";

// Rate limiting map (simple in-memory for now, use Redis in production)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute

/**
 * Check rate limiting for an IP address
 * @param {string} ip - IP address to check
 * @returns {boolean} - true if rate limit exceeded
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  record.count++;
  return record.count > RATE_LIMIT_MAX;
}

/**
 * Extract ticket ID from token
 * @param {string} token - JWT token or raw ticket ID
 * @returns {string} - Ticket ID
 */
function extractTicketId(token) {
  try {
    const decoded = jwt.verify(token, process.env.QR_SECRET_KEY);
    return decoded.tid;
  } catch {
    // Fallback to direct ticket ID for backward compatibility
    return token;
  }
}

/**
 * Detect validation source from request
 * @param {object} req - Request object
 * @returns {string} - Validation source
 */
function detectSource(req) {
  if (req.headers["x-wallet-source"]) {
    return req.headers["x-wallet-source"];
  } else if (req.headers["user-agent"]?.includes("Apple")) {
    return "apple_wallet";
  } else if (req.headers["user-agent"]?.includes("Google")) {
    return "google_wallet";
  }
  return "web";
}

/**
 * Validate ticket and update scan count atomically
 * @param {object} db - Database instance
 * @param {string} ticketId - Ticket ID to validate
 * @param {string} source - Validation source
 * @returns {object} - Validation result
 */
async function validateTicket(db, ticketId, source) {
  // Start transaction for atomic operations
  const tx = await db.transaction();

  try {
    // Get ticket with lock for update (prevents race conditions)
    const result = await tx.execute({
      sql: `
        SELECT t.*, e.name as event_name, e.date as event_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.ticket_id = ?
        FOR UPDATE
      `,
      args: [ticketId],
    });

    const ticket = result.rows[0];

    if (!ticket) {
      throw new Error("Ticket not found");
    }

    if (ticket.status !== "valid") {
      throw new Error(`Ticket is ${ticket.status}`);
    }

    if (ticket.scan_count >= ticket.max_scan_count) {
      throw new Error("Maximum scans exceeded");
    }

    // Atomic update with condition check (prevents race condition)
    const updateResult = await tx.execute({
      sql: `
        UPDATE tickets 
        SET scan_count = scan_count + 1,
            qr_access_method = ?,
            first_scanned_at = COALESCE(first_scanned_at, CURRENT_TIMESTAMP),
            last_scanned_at = CURRENT_TIMESTAMP
        WHERE ticket_id = ? 
          AND scan_count < max_scan_count
          AND status = 'valid'
      `,
      args: [source, ticketId],
    });

    if (updateResult.rowsAffected === 0) {
      throw new Error("Validation failed - ticket may have reached scan limit");
    }

    // Commit transaction
    await tx.commit();

    return {
      success: true,
      ticket: {
        ...ticket,
        scan_count: ticket.scan_count + 1,
      },
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Log validation attempt
 * @param {object} db - Database instance
 * @param {object} params - Logging parameters
 */
async function logValidation(db, params) {
  try {
    await db.execute({
      sql: `
        INSERT INTO qr_validations (
          ticket_id, validation_token, validation_result, 
          validation_source, ip_address, device_info, failure_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        params.ticketId || null,
        params.token,
        params.result,
        params.source,
        params.ip,
        params.deviceInfo || null,
        params.failureReason || null,
      ],
    });
  } catch (error) {
    // Log error but don't throw - validation logging is not critical
    console.error("Failed to log validation:", error.message);
  }
}

/**
 * Handle ticket validation endpoint
 * @param {object} req - Request object
 * @param {object} res - Response object
 */
export default async function handler(req, res) {
  // Only accept POST for security (tokens should not be in URL)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed - use POST" });
  }

  // Extract IP for rate limiting
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.connection.remoteAddress ||
    "unknown";

  // Check rate limit
  if (checkRateLimit(ip)) {
    return res.status(429).json({
      error: "Rate limit exceeded. Please try again later.",
    });
  }

  const { token, validateOnly } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token required in request body" });
  }

  const source = detectSource(req);
  const db = await getDatabase().ensureInitialized();

  try {
    const ticketId = extractTicketId(token);

    if (validateOnly) {
      // For preview only - no updates
      const result = await db.execute({
        sql: `
          SELECT t.*, e.name as event_name, e.date as event_date
          FROM tickets t
          JOIN events e ON t.event_id = e.id
          WHERE t.ticket_id = ?
        `,
        args: [ticketId],
      });

      const ticket = result.rows[0];

      if (!ticket) {
        throw new Error("Ticket not found");
      }

      if (ticket.status !== "valid") {
        throw new Error(`Ticket is ${ticket.status}`);
      }

      return res.status(200).json({
        valid: true,
        ticket: {
          id: ticketId,
          type: ticket.ticket_type,
          eventName: ticket.event_name,
          eventDate: ticket.event_date,
          attendeeName:
            `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim(),
          scanCount: ticket.scan_count,
          maxScans: ticket.max_scan_count,
          source: source,
        },
        message: "Ticket verified",
      });
    }

    // Actual validation with scan count update
    const validationResult = await validateTicket(db, ticketId, source);
    const ticket = validationResult.ticket;

    // Log successful validation
    await logValidation(db, {
      ticketId: ticket.id,
      token: token.substring(0, 10) + "...", // Don't log full token
      result: "success",
      source: source,
      ip: ip,
      deviceInfo: req.headers["user-agent"],
    });

    res.status(200).json({
      valid: true,
      ticket: {
        id: ticketId,
        type: ticket.ticket_type,
        eventName: ticket.event_name,
        eventDate: ticket.event_date,
        attendeeName:
          `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim(),
        scanCount: ticket.scan_count,
        maxScans: ticket.max_scan_count,
        source: source,
      },
      message: `Welcome ${ticket.attendee_first_name}!`,
    });
  } catch (error) {
    // Handle initialization errors
    if (error.message.includes("Failed to initialize database client")) {
      return res.status(503).json({
        valid: false,
        error: "Service temporarily unavailable. Please try again.",
      });
    }

    // Sanitize error for logging
    const safeError = {
      message: error.message || "Validation failed",
      timestamp: new Date().toISOString(),
    };
    console.error("Validation error:", safeError);

    // Log failed validation (only if db is available)
    try {
      await logValidation(db, {
        token: token ? token.substring(0, 10) + "..." : "invalid",
        result: "failed",
        failureReason: error.message,
        source: source,
        ip: ip,
      });
    } catch (logError) {
      console.error("Failed to log validation error:", logError.message);
    }

    res.status(400).json({
      valid: false,
      error: error.message || "Invalid token",
    });
  }
}
