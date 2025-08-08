import authService from "../lib/auth-service.js";
import { getDatabase } from "../lib/database.js";
import ticketService from "../lib/ticket-service.js";

async function handler(req, res) {
  const db = getDatabase();

  if (req.method === "GET") {
    // Search and filter registrations
    const {
      search,
      status,
      ticketType,
      checkedIn,
      limit = 50,
      offset = 0,
      sortBy = "created_at",
      sortOrder = "DESC",
    } = req.query;

    let sql = `
      SELECT 
        t.*,
        tr.transaction_id as order_number,
        tr.amount_cents / 100.0 as order_amount,
        tr.customer_email as purchaser_email
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE 1=1
    `;

    const args = [];

    if (search) {
      sql += ` AND (
        t.attendee_email LIKE ? OR 
        t.attendee_first_name LIKE ? OR 
        t.attendee_last_name LIKE ? OR
        t.ticket_id LIKE ? OR
        tr.customer_email LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      args.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      sql += ` AND t.status = ?`;
      args.push(status);
    }

    if (ticketType) {
      sql += ` AND t.ticket_type = ?`;
      args.push(ticketType);
    }

    if (checkedIn === "true") {
      sql += ` AND t.checked_in_at IS NOT NULL`;
    } else if (checkedIn === "false") {
      sql += ` AND t.checked_in_at IS NULL`;
    }

    // Validate sort column
    const allowedSortColumns = [
      "created_at",
      "attendee_last_name",
      "ticket_type",
      "checked_in_at",
    ];
    const sortColumn = allowedSortColumns.includes(sortBy)
      ? sortBy
      : "created_at";
    const sortDirection = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

    sql += ` ORDER BY t.${sortColumn} ${sortDirection}`;
    sql += ` LIMIT ? OFFSET ?`;
    args.push(parseInt(limit), parseInt(offset));

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

      if (search) {
        countSql += ` AND (
          t.attendee_email LIKE ? OR 
          t.attendee_first_name LIKE ? OR 
          t.attendee_last_name LIKE ? OR
          t.ticket_id LIKE ? OR
          tr.customer_email LIKE ?
        )`;
      }

      if (status) countSql += ` AND t.status = ?`;
      if (ticketType) countSql += ` AND t.ticket_type = ?`;
      if (checkedIn === "true") countSql += ` AND t.checked_in_at IS NOT NULL`;
      else if (checkedIn === "false")
        countSql += ` AND t.checked_in_at IS NULL`;

      const countResult = await db.execute({ sql: countSql, args: countArgs });

      res.status(200).json({
        registrations: result.rows,
        total: countResult.rows[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    } catch (error) {
      console.error("Registration search error:", error);
      res.status(500).json({ error: "Failed to fetch registrations" });
    }
  } else if (req.method === "PUT") {
    // Update registration (check-in, edit details)
    const { ticketId } = req.query;
    const { action, ...data } = req.body;

    if (!ticketId) {
      return res.status(400).json({ error: "Ticket ID required" });
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
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default authService.requireAuth(handler);
