import authService from '../lib/auth-service.js';
import { getDatabaseClient } from '../lib/database.js';
import ticketService from '../lib/ticket-service.js';
import { getValidationService } from '../lib/validation-service.js';
import { withSecurityHeaders } from '../lib/security-headers.js';
import { columnExists } from '../lib/db-utils.js';
import csrfService from '../lib/csrf-service.js';

async function handler(req, res) {
  let db;

  try {
    db = await getDatabaseClient();

    if (req.method === 'GET') {
      const validationService = getValidationService();

      // Validate all search parameters
      const validation = validationService.validateRegistrationSearchParams(
        req.query
      );

      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.errors
        });
      }

      const { sanitized } = validation;

    // Check if event_id column exists in tickets table
    const ticketsHasEventId = await columnExists(db, 'tickets', 'event_id');

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

    // Add event filtering if eventId is provided and column exists
    if (sanitized.eventId && ticketsHasEventId) {
      sql += ` AND t.event_id = ?`;
      args.push(sanitized.eventId);
    }

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
          sanitized.searchTerm
        );
      }

      if (sanitized.status) {
        sql += ' AND t.status = ?';
        args.push(sanitized.status);
      }

      if (sanitized.ticketType) {
        sql += ' AND t.ticket_type = ?';
        args.push(sanitized.ticketType);
      }

      if (sanitized.checkedIn === 'true') {
        sql += ' AND t.checked_in_at IS NOT NULL';
      } else if (sanitized.checkedIn === 'false') {
        sql += ' AND t.checked_in_at IS NULL';
      }

    sql += ` ORDER BY t.${sanitized.sortBy} ${sanitized.sortOrder}`;
    sql += ` LIMIT ? OFFSET ?`;
    args.push(sanitized.limit, sanitized.offset);

      const result = await db.execute({ sql, args });

      // Get total count for pagination
      let countSql = `
        SELECT COUNT(*) as total 
        FROM tickets t
        JOIN transactions tr ON t.transaction_id = tr.id
        WHERE 1=1
      `;

      const countArgs = args.slice(0, -2); // Remove limit and offset

      // Add event filtering to count query
      if (sanitized.eventId && ticketsHasEventId) {
        countSql += ` AND t.event_id = ?`;
      }

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

      const countResult = await db.execute({ sql: countSql, args: countArgs });

      res.status(200).json({
        registrations: result.rows,
        total: countResult.rows[0].total,
        limit: sanitized.limit,
        offset: sanitized.offset,
        hasMore: sanitized.offset + sanitized.limit < countResult.rows[0].total,
        eventId: sanitized.eventId || null,
        hasEventFiltering: {
          tickets: ticketsHasEventId,
        },
        filters: {
          eventId: sanitized.eventId || null,
          searchTerm: sanitized.searchTerm || null,
          status: sanitized.status || null,
          ticketType: sanitized.ticketType || null,
          checkedIn: sanitized.checkedIn !== undefined ? sanitized.checkedIn : null,
        }
      });
    } else if (req.method === 'PUT') {
      // Update registration (check-in, edit details)
      const { ticketId } = req.query;
      const { action, ...data } = req.body;
      const validationService = getValidationService();

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
          allowedValues: actionValidation.allowedValues
        });
      }

      switch (action) {
      case 'checkin': {
        await db.execute({
          sql: `UPDATE tickets 
                  SET checked_in_at = CURRENT_TIMESTAMP,
                      checked_in_by = ?,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ticket_id = ?`,
          args: [req.admin.id, ticketId]
        });

        res
          .status(200)
          .json({ success: true, message: 'Checked in successfully' });
        break;
      }

      case 'undo_checkin': {
        await db.execute({
          sql: `UPDATE tickets 
                  SET checked_in_at = NULL,
                      checked_in_by = NULL,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ticket_id = ?`,
          args: [ticketId]
        });

        res.status(200).json({ success: true, message: 'Check-in undone' });
        break;
      }

      case 'update': {
        const updated = await ticketService.updateAttendeeInfo(
          ticketId,
          data
        );
        res.status(200).json({ success: true, ticket: updated });
        break;
      }

      case 'cancel': {
        const cancelled = await ticketService.cancelTicket(
          ticketId,
          data.reason
        );
        res.status(200).json({ success: true, ticket: cancelled });
        break;
      }

      default:
        res.status(400).json({ error: 'Invalid action' });
      }
    } else {
      res.setHeader('Allow', ['GET', 'PUT']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Registration API error:', error);
    
    // Provide more specific error messages for debugging
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error.message.includes('validation')) {
      errorMessage = 'Invalid request parameters';
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      errorMessage = 'Resource not found';
      statusCode = 404;
    } else if (error.message.includes('database') || error.message.includes('SQL')) {
      errorMessage = 'Database operation failed';
      statusCode = 503;
    } else if (error.message.includes('auth') || error.message.includes('permission')) {
      errorMessage = 'Authentication or permission error';
      statusCode = 403;
    }
    
    // In development, provide more detailed error information
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';
    
    res.status(statusCode).json({
      error: errorMessage,
      ...(isDevelopment && {
        details: error.message,
        stack: error.stack?.substring(0, 500) // Limit stack trace size
      })
    });
  }
}

export default withSecurityHeaders(
  csrfService.validateCSRF(
    authService.requireAuth(handler)
  )
);