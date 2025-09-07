import authService from "../lib/auth-service.js";
import { getDatabaseClient } from "../lib/database.js";
import ticketService from "../lib/ticket-service.js";
import { getValidationService } from "../lib/validation-service.js";
import { addSecurityHeaders } from "../lib/security-headers.js";

async function handler(req, res) {
  let db;
  try {
    db = await getDatabaseClient();
  } catch (dbError) {
    console.error("Database initialization error:", dbError);
    return res.status(500).json({ 
      error: "Database connection failed",
      message: dbError.message 
    });
  }

  if (req.method === "GET") {
    let validationService;
    try {
      validationService = getValidationService();
    } catch (validationError) {
      console.error("Validation service initialization error:", validationError);
      return res.status(500).json({ 
        error: "Validation service failed",
        message: validationError.message 
      });
    }

    // Validate all search parameters
    const validation = validationService.validateRegistrationSearchParams(
      req.query,
    );

    if (!validation.isValid) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.errors,
      });
    }

    const { sanitized } = validation;

    let sql = `
      SELECT 
        t.*,
        tr.transaction_id as order_number,
        tr.amount_cents / 100.0 as order_amount,
        tr.customer_email as purchaser_email,
        COALESCE(t.event_id, tr.event_id) as event_id
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE 1=1
    `;

    const args = [];

    if (sanitized.searchTerm) {
      sql += ` AND (
        t.attendee_email LIKE ? ESCAPE '\\' OR 
        t.attendee_first_name LIKE ? ESCAPE '\\' OR 
        t.attendee_last_name LIKE ? ESCAPE '\\' OR
        t.ticket_id LIKE ? ESCAPE '\\' OR
        tr.customer_email LIKE ? ESCAPE '\\'
      )`;
      args.push(
        sanitized.searchTerm,
        sanitized.searchTerm,
        sanitized.searchTerm,
        sanitized.searchTerm,
        sanitized.searchTerm,
      );
    }

    if (sanitized.status) {
      sql += ` AND t.status = ?`;
      args.push(sanitized.status);
    }

    if (sanitized.ticketType) {
      sql += ` AND t.ticket_type = ?`;
      args.push(sanitized.ticketType);
    }

    if (sanitized.checkedIn === "true") {
      sql += ` AND t.checked_in_at IS NOT NULL`;
    } else if (sanitized.checkedIn === "false") {
      sql += ` AND t.checked_in_at IS NULL`;
    }

    if (sanitized.eventId) {
      sql += ` AND t.event_id = ?`;
      args.push(sanitized.eventId);
    }

    sql += ` ORDER BY t.${sanitized.sortBy} ${sanitized.sortOrder}`;
    sql += ` LIMIT ? OFFSET ?`;
    args.push(sanitized.limit, sanitized.offset);

    try {
      const result = await db.execute({ sql, args });

      // Get total count for pagination
      let countSql = `
        SELECT COUNT(*) as total 
        FROM tickets t
        JOIN transactions tr ON t.transaction_id = tr.id
        WHERE 1=1
      `;

      const countArgs = args.slice(0, -2); // Remove limit and offset

      if (sanitized.searchTerm) {
        countSql += ` AND (
          t.attendee_email LIKE ? ESCAPE '\\' OR 
          t.attendee_first_name LIKE ? ESCAPE '\\' OR 
          t.attendee_last_name LIKE ? ESCAPE '\\' OR
          t.ticket_id LIKE ? ESCAPE '\\' OR
          tr.customer_email LIKE ? ESCAPE '\\'
        )`;
      }

      if (sanitized.status) countSql += ` AND t.status = ?`;
      if (sanitized.ticketType) countSql += ` AND t.ticket_type = ?`;
      if (sanitized.checkedIn === "true")
        countSql += ` AND t.checked_in_at IS NOT NULL`;
      else if (sanitized.checkedIn === "false")
        countSql += ` AND t.checked_in_at IS NULL`;
      if (sanitized.eventId) countSql += ` AND t.event_id = ?`;

      const countResult = await db.execute({ sql: countSql, args: countArgs });

      res.status(200).json({
        registrations: result.rows,
        total: countResult.rows[0].total,
        limit: sanitized.limit,
        offset: sanitized.offset,
        hasMore: sanitized.offset + sanitized.limit < countResult.rows[0].total,
        eventId: sanitized.eventId || null,
        filteredByEvent: !!sanitized.eventId,
      });
    } catch (error) {
      console.error("Registration search error:", error);
      res.status(500).json({ error: "Failed to fetch registrations" });
    }
  } else if (req.method === "PUT") {
    // Update registration (check-in, edit details)
    const { ticketId } = req.query;
    const { action, ...data } = req.body;
    
    let validationService;
    try {
      validationService = getValidationService();
    } catch (validationError) {
      console.error("Validation service initialization error:", validationError);
      return res.status(500).json({ 
        error: "Validation service failed",
        message: validationError.message 
      });
    }

    // Validate ticket ID
    const ticketIdValidation = validationService.validateTicketId(ticketId);
    if (!ticketIdValidation.isValid) {
      return res.status(400).json({ error: ticketIdValidation.error });
    }

    // Validate action
    const actionValidation = validationService.validateAdminAction(action);
    if (!actionValidation.isValid) {
      return res.status(400).json({
        error: actionValidation.error,
        allowedValues: actionValidation.allowedValues,
      });
    }

    try {
      switch (action) {
        case "checkin": {
          await db.execute({
            sql: `UPDATE tickets 
                  SET checked_in_at = CURRENT_TIMESTAMP,
                      checked_in_by = ?,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ticket_id = ?`,
            args: [req.admin.id, ticketId],
          });

          res
            .status(200)
            .json({ success: true, message: "Checked in successfully" });
          break;
        }

        case "undo_checkin": {
          await db.execute({
            sql: `UPDATE tickets 
                  SET checked_in_at = NULL,
                      checked_in_by = NULL,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ticket_id = ?`,
            args: [ticketId],
          });

          res.status(200).json({ success: true, message: "Check-in undone" });
          break;
        }

        case "update": {
          const updated = await ticketService.updateAttendeeInfo(
            ticketId,
            data,
          );
          res.status(200).json({ success: true, ticket: updated });
          break;
        }

        case "cancel": {
          const cancelled = await ticketService.cancelTicket(
            ticketId,
            data.reason,
          );
          res.status(200).json({ success: true, ticket: cancelled });
          break;
        }

        default:
          res.status(400).json({ error: "Invalid action" });
      }
    } catch (error) {
      console.error("Registration update error:", error);
      res.status(500).json({ error: "Failed to update registration" });
    }
  } else {
    res.setHeader("Allow", ["GET", "PUT"]);
    return res.status(405).json({ 
      error: "Method not allowed",
      message: `Method ${req.method} Not Allowed`,
      allowedMethods: ["GET", "PUT"]
    });
  }
}

// Wrap with try-catch to ensure JSON errors
async function wrappedHandler(req, res) {
  try {
    // Set Content-Type header early to ensure JSON responses
    res.setHeader('Content-Type', 'application/json');
    
    // Apply security headers first
    await addSecurityHeaders(req, res, { isAPI: true });
    
    // Check authentication
    const token = authService.getSessionFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const session = authService.verifySessionToken(token);
    if (!session.valid) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    
    // Add admin info to request
    req.admin = session.admin;
    
    // Call the actual handler
    return await handler(req, res);
  } catch (error) {
    console.error("Handler wrapper error:", error);
    // Always return JSON for errors
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ 
        error: "A server error occurred",
        message: error?.message || "Unknown error",
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default wrappedHandler;
