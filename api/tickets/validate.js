import { getDatabase } from "../lib/database.js";
import jwt from "jsonwebtoken";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, validateOnly } = req.method === "GET" ? req.query : req.body;

  // Detect source from headers or query
  let source = "web";
  if (req.headers["x-wallet-source"]) {
    source = req.headers["x-wallet-source"];
  } else if (req.headers["user-agent"]?.includes("Apple")) {
    source = "apple_wallet";
  } else if (req.headers["user-agent"]?.includes("Google")) {
    source = "google_wallet";
  }

  if (!token) {
    return res.status(400).json({ error: "Token required" });
  }

  const db = getDatabase();

  try {
    let ticketId;

    // Try JWT token first
    try {
      const decoded = jwt.verify(token, process.env.QR_SECRET_KEY);
      ticketId = decoded.tid;
    } catch {
      // Fallback to direct ticket ID for backward compatibility
      ticketId = token;
    }

    // Get ticket details
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

    // For web preview, don't increment scan count
    if (!validateOnly) {
      if (ticket.scan_count >= ticket.max_scan_count) {
        throw new Error("Maximum scans exceeded");
      }

      // Update scan count and track access method
      await db.execute({
        sql: `
          UPDATE tickets 
          SET scan_count = scan_count + 1,
              qr_access_method = ?,
              first_scanned_at = COALESCE(first_scanned_at, CURRENT_TIMESTAMP),
              last_scanned_at = CURRENT_TIMESTAMP
          WHERE ticket_id = ?
        `,
        args: [source, ticketId],
      });

      // Log validation
      await db.execute({
        sql: `
          INSERT INTO qr_validations (
            ticket_id, validation_token, validation_result, 
            validation_source, ip_address, device_info
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          ticket.id,
          token,
          "success",
          source,
          req.headers["x-forwarded-for"] || req.connection.remoteAddress,
          req.headers["user-agent"],
        ],
      });
    }

    // Return success
    res.status(200).json({
      valid: true,
      ticket: {
        id: ticketId,
        type: ticket.ticket_type,
        eventName: ticket.event_name,
        eventDate: ticket.event_date,
        attendeeName:
          `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim(),
        scanCount: ticket.scan_count + (validateOnly ? 0 : 1),
        maxScans: ticket.max_scan_count,
        source: source,
      },
      message: validateOnly
        ? "Ticket verified"
        : `Welcome ${ticket.attendee_first_name}!`,
    });
  } catch (error) {
    console.error("Validation error:", error);

    // Log failed validation
    await db
      .execute({
        sql: `
        INSERT INTO qr_validations (
          validation_token, validation_result, failure_reason,
          validation_source, ip_address
        ) VALUES (?, ?, ?, ?, ?)
      `,
        args: [
          token,
          "failed",
          error.message,
          source,
          req.headers["x-forwarded-for"] || req.connection.remoteAddress,
        ],
      })
      .catch(console.error);

    res.status(400).json({
      valid: false,
      error: error.message || "Invalid token",
    });
  }
}
