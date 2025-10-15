import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import ticketService from "../../lib/ticket-service.js";
import { getValidationService } from "../../lib/validation-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { columnExists } from "../../lib/db-utils.js";
import csrfService from "../../lib/csrf-service.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import timeUtils from "../../lib/time-utils.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { getTicketColorService } from "../../lib/ticket-color-service.js";

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
        tr.customer_email as purchaser_email,
        tr.payment_processor,
        tr.stripe_session_id,
        tr.paypal_order_id,
        tr.paypal_capture_id
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE 1=1
    `;

      const args = [];

      // Add event filtering if eventId is provided and column exists
      if (sanitized.eventId && ticketsHasEventId) {
        sql += ' AND t.event_id = ?';
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

      if (sanitized.paymentMethod) {
        sql += ' AND tr.payment_processor = ?';
        args.push(sanitized.paymentMethod);
      }

      if (sanitized.checkedIn === 'true') {
        sql += ' AND t.checked_in_at IS NOT NULL';
      } else if (sanitized.checkedIn === 'false') {
        sql += ' AND t.checked_in_at IS NULL';
      }

      // Filter by today's check-ins (using Mountain Time, not UTC)
      // SQLite's DATE('now') returns UTC, so we apply -7 hour offset for Mountain Time
      // This ensures "today" matches the festival's local timezone near midnight boundaries
      if (sanitized.checkedInToday === 'true') {
        sql += ` AND DATE(t.checked_in_at, '-7 hours') = DATE('now', '-7 hours')`;
      }

      // Filter by wallet access
      if (sanitized.walletAccess === 'true') {
        sql += ` AND t.qr_access_method = 'wallet'`;
      }

      // Whitelist allowed columns for ORDER BY to prevent SQL injection
      const allowedSortColumns = ['created_at', 'updated_at', 'checked_in_at', 'ticket_id', 'status', 'ticket_type'];
      const allowedSortOrders = ['ASC', 'DESC'];

      // Validate sortBy column is in whitelist
      const safeColumn = allowedSortColumns.includes(sanitized.sortBy) ? sanitized.sortBy : 'created_at';

      // Validate sortOrder is in whitelist
      const safeSortOrder = allowedSortOrders.includes(sanitized.sortOrder?.toUpperCase()) ? sanitized.sortOrder.toUpperCase() : 'DESC';

      sql += ` ORDER BY t.${safeColumn} ${safeSortOrder}`;
      sql += ' LIMIT ? OFFSET ?';
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
        countSql += ' AND t.event_id = ?';
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

      if (sanitized.status) {
        countSql += ' AND t.status = ?';
      }
      if (sanitized.ticketType) {
        countSql += ' AND t.ticket_type = ?';
      }
      if (sanitized.paymentMethod) {
        countSql += ' AND tr.payment_processor = ?';
      }
      if (sanitized.checkedIn === 'true') {
        countSql += ' AND t.checked_in_at IS NOT NULL';
      } else if (sanitized.checkedIn === 'false') {
        countSql += ' AND t.checked_in_at IS NULL';
      }

      // Filter by today's check-ins (same as main query - using Mountain Time, not UTC)
      if (sanitized.checkedInToday === 'true') {
        countSql += ` AND DATE(t.checked_in_at, '-7 hours') = DATE('now', '-7 hours')`;
      }

      // Filter by wallet access (same as main query)
      if (sanitized.walletAccess === 'true') {
        countSql += ` AND t.qr_access_method = 'wallet'`;
      }

      const countResult = await db.execute({ sql: countSql, args: countArgs });

      // Set security headers to prevent caching of customer PII data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Enrich tickets with color data
      const colorService = getTicketColorService();
      const enrichmentResults = await Promise.allSettled(
        result.rows.map(async (ticket) => {
          try {
            const color = await colorService.getColorForTicketType(ticket.ticket_type);
            return {
              ...ticket,
              color_name: color.name,
              color_rgb: color.rgb
            };
          } catch (error) {
            console.error(`[Admin] Failed to get color for ticket ${ticket.ticket_id}:`, error);
            return {
              ...ticket,
              color_name: 'Default',
              color_rgb: 'rgb(255, 255, 255)'
            };
          }
        })
      );

      // Handle enrichment results gracefully
      const enrichedRegistrations = enrichmentResults.map((enrichmentResult, index) => {
        if (enrichmentResult.status === 'fulfilled') {
          return enrichmentResult.value;
        } else {
          const originalTicket = result.rows[index];
          console.error(`[Admin] Failed to enrich ticket ${originalTicket?.ticket_id}:`, enrichmentResult.reason);
          return {
            ...originalTicket,
            color_name: 'Default',
            color_rgb: 'rgb(255, 255, 255)'
          };
        }
      });

      const responseData = {
        registrations: timeUtils.enhanceApiResponse(enrichedRegistrations, ['created_at', 'updated_at', 'checked_in_at', 'registered_at', 'registration_deadline']),
        total: countResult.rows[0].total,
        limit: sanitized.limit,
        offset: sanitized.offset,
        hasMore: sanitized.offset + sanitized.limit < countResult.rows[0].total,
        eventId: sanitized.eventId || null,
        hasEventFiltering: {
          tickets: ticketsHasEventId
        },
        filters: {
          eventId: sanitized.eventId || null,
          searchTerm: sanitized.searchTerm || null,
          status: sanitized.status || null,
          ticketType: sanitized.ticketType || null,
          paymentMethod: sanitized.paymentMethod || null,
          checkedIn: sanitized.checkedIn !== undefined ? sanitized.checkedIn : null
        },
        timezone: 'America/Denver',
        currentTime: timeUtils.getCurrentTime()
      };

      res.status(200).json(processDatabaseResult(responseData));
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

// Build the middleware chain once, outside of request handling
const securedHandler = withSecurityHeaders(
  csrfService.validateCSRF(
    authService.requireAuth(
      withAdminAudit(handler, {
        logBody: true, // Log registration modifications
        logMetadata: true,
        skipMethods: [] // Log all methods for registration management
      })
    )
  )
);

// Wrap the secured handler in an error-handling function
// to ensure all errors are returned as JSON
async function safeHandler(req, res) {
  console.log(`🔍 [${new Date().toISOString()}] Registrations endpoint called`);
  console.log(`📡 Request: ${req.method} ${req.url}`);
  console.log('🏷️  Headers:', Object.keys(req.headers));
  console.log(`🔧 Environment: NODE_ENV=${process.env.NODE_ENV}, VERCEL_ENV=${process.env.VERCEL_ENV}`);

  try {
    console.log('🚀 Executing pre-built middleware chain...');

    const result = await securedHandler(req, res);

    console.log('✅ Request completed successfully');
    return result;

  } catch (error) {
    console.error('💥 FATAL ERROR in registrations endpoint:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headerKeys: Object.keys(req.headers).slice(0, 10), // Log only header names, not values
      query: req.query
    });

    // Detailed error classification for debugging
    let errorType = 'UNKNOWN';
    let debugMessage = error.message;

    if (error.message.includes('ADMIN_SECRET')) {
      errorType = 'AUTH_CONFIG';
      debugMessage = `Auth configuration error: ${error.message}`;
    } else if (error.message.includes('CSRF')) {
      errorType = 'CSRF_ERROR';
      debugMessage = `CSRF validation error: ${error.message}`;
    } else if (error.message.includes('database') || error.message.includes('Database')) {
      errorType = 'DATABASE_ERROR';
      debugMessage = `Database error: ${error.message}`;
    } else if (error.message.includes('Auth middleware')) {
      errorType = 'AUTH_MIDDLEWARE';
      debugMessage = error.message;
    } else if (error.message.includes('CSRF middleware')) {
      errorType = 'CSRF_MIDDLEWARE';
      debugMessage = error.message;
    } else if (error.message.includes('Security headers middleware')) {
      errorType = 'SECURITY_MIDDLEWARE';
      debugMessage = error.message;
    }

    console.error(`🏷️  Error classified as: ${errorType}`);

    // Always return JSON error response
    if (!res.headersSent) {
      const errorResponse = {
        error: 'Internal server error',
        errorType: errorType,
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? debugMessage
          : 'A server error occurred while processing your request',
        timestamp: new Date().toISOString(),
        requestId: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      };

      console.log('📤 Returning error response:', errorResponse);

      res.status(500).json(errorResponse);
    } else {
      console.warn('⚠️  Headers already sent, cannot return JSON error response');
    }
  }
}

export default safeHandler;
