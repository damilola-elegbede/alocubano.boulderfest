/**
 * Admin Flagged Tickets API Endpoint
 * Returns tickets flagged for security review due to webhook validation failures
 */

import authService from "../../lib/auth-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import timeUtils from "../../lib/time-utils.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import { getValidationService } from "../../lib/validation-service.js";

async function handler(req, res) {
  let db;

  try {
    db = await getDatabaseClient();

    if (req.method === 'GET') {
      // Get pagination parameters
      const validationService = getValidationService();
      const limit = parseInt(req.query?.limit) || 50;
      const offset = parseInt(req.query?.offset) || 0;

      // Use validation service to sanitize pagination
      const sanitized = validationService.validatePagination({
        limit,
        offset
      });

      // Query flagged tickets with transaction and validation details
      const sql = `
        SELECT
          t.id,
          t.ticket_id,
          t.ticket_type,
          t.price_cents,
          t.attendee_first_name,
          t.attendee_last_name,
          t.attendee_email,
          t.status,
          t.ticket_metadata,
          t.created_at,
          t.updated_at,
          t.event_id,
          t.event_date,
          tr.id as transaction_db_id,
          tr.transaction_id as order_id,
          tr.customer_email,
          tr.customer_name,
          tr.amount_cents,
          tr.payment_processor,
          tr.stripe_session_id,
          tr.paypal_order_id,
          tr.status as transaction_status
        FROM tickets t
        JOIN transactions tr ON t.transaction_id = tr.id
        WHERE t.status = 'flagged_for_review'
        ORDER BY t.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const result = await db.execute({
        sql,
        args: [sanitized.limit, sanitized.offset]
      });

      // Get total count for pagination
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as total FROM tickets WHERE status = 'flagged_for_review'`,
        args: []
      });

      const total = countResult.rows[0]?.total || 0;

      // Parse validation metadata from ticket_metadata JSON
      const flaggedTickets = (result.rows || []).map(ticket => {
        let validationErrors = [];
        let validationMetadata = null;

        try {
          if (ticket.ticket_metadata) {
            const metadata = JSON.parse(ticket.ticket_metadata);
            if (metadata.validation) {
              validationMetadata = metadata.validation;
              validationErrors = metadata.validation.errors || [];
            }
          }
        } catch (parseError) {
          console.error('Failed to parse ticket metadata:', parseError);
        }

        return {
          ...ticket,
          validation_errors: validationErrors,
          validation_metadata: validationMetadata,
          severity: determineSeverity(validationErrors)
        };
      });

      // Set security headers to prevent caching
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const responseData = {
        flaggedTickets: timeUtils.enhanceApiResponse(flaggedTickets, ['created_at', 'updated_at', 'event_date']),
        total,
        limit: sanitized.limit,
        offset: sanitized.offset,
        hasMore: sanitized.offset + sanitized.limit < total,
        timezone: 'America/Denver',
        currentTime: timeUtils.getCurrentTime()
      };

      res.status(200).json(processDatabaseResult(responseData));

    } else if (req.method === 'PUT') {
      // Update flagged ticket status (mark as safe or cancel)
      const { ticketId } = req.query;
      const { action } = req.body;

      const validationService = getValidationService();

      // Validate ticket ID
      const ticketIdValidation = validationService.validateTicketId(ticketId);
      if (!ticketIdValidation.isValid) {
        return res.status(400).json({ error: ticketIdValidation.error });
      }

      // Validate action
      const allowedActions = ['mark_safe', 'cancel_ticket'];
      if (!allowedActions.includes(action)) {
        return res.status(400).json({
          error: 'Invalid action',
          allowedActions
        });
      }

      // Verify ticket is flagged
      const ticketResult = await db.execute({
        sql: 'SELECT id, status FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      if (!ticketResult.rows || ticketResult.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const ticket = ticketResult.rows[0];
      if (ticket.status !== 'flagged_for_review') {
        return res.status(400).json({
          error: 'Ticket is not flagged for review',
          currentStatus: ticket.status
        });
      }

      // Perform action
      switch (action) {
      case 'mark_safe': {
        await db.execute({
          sql: `UPDATE tickets
                  SET status = 'valid',
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ticket_id = ?`,
          args: [ticketId]
        });

        // Log the action
        const auditService = (await import('../../lib/audit-service.js')).default;
        await auditService.logDataChange({
          action: 'ADMIN_MARKED_TICKET_SAFE',
          targetType: 'ticket',
          targetId: ticketId,
          metadata: {
            admin_id: req.admin?.id,
            previous_status: 'flagged_for_review',
            new_status: 'valid'
          },
          severity: 'info'
        });

        res.status(200).json({
          success: true,
          message: 'Ticket marked as safe',
          ticketId,
          newStatus: 'valid'
        });
        break;
      }

      case 'cancel_ticket': {
        await db.execute({
          sql: `UPDATE tickets
                  SET status = 'cancelled',
                      cancellation_reason = 'Security validation failure - flagged for review',
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ticket_id = ?`,
          args: [ticketId]
        });

        // Log the action
        const auditService = (await import('../../lib/audit-service.js')).default;
        await auditService.logDataChange({
          action: 'ADMIN_CANCELLED_FLAGGED_TICKET',
          targetType: 'ticket',
          targetId: ticketId,
          metadata: {
            admin_id: req.admin?.id,
            previous_status: 'flagged_for_review',
            new_status: 'cancelled',
            reason: 'Security validation failure'
          },
          severity: 'warning'
        });

        res.status(200).json({
          success: true,
          message: 'Ticket cancelled',
          ticketId,
          newStatus: 'cancelled'
        });
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
    console.error('Flagged tickets API error:', error);

    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';

    res.status(500).json({
      error: 'Internal server error',
      ...(isDevelopment && {
        details: error.message,
        stack: error.stack?.substring(0, 500)
      })
    });
  }
}

/**
 * Determine severity level based on validation errors
 */
function determineSeverity(errors) {
  if (!errors || errors.length === 0) {
    return 'low';
  }

  const errorText = errors.join(' ').toLowerCase();

  // Critical indicators
  if (errorText.includes('price mismatch') ||
      errorText.includes('price manipulation') ||
      errorText.includes('tampering')) {
    return 'critical';
  }

  // High severity indicators
  if (errorText.includes('ticket type') ||
      errorText.includes('event') ||
      errorText.includes('quantity exceeds')) {
    return 'high';
  }

  // Medium severity
  if (errorText.includes('validation') ||
      errorText.includes('invalid')) {
    return 'medium';
  }

  return 'low';
}

// Build middleware chain
const securedHandler = withSecurityHeaders(
  authService.requireAuth(
    withAdminAudit(handler, {
      logBody: true, // Log flagged ticket modifications
      logMetadata: true,
      skipMethods: [] // Log all methods
    })
  )
);

// Wrap in error handler
async function safeHandler(req, res) {
  console.log(`[${new Date().toISOString()}] Flagged tickets endpoint called`);
  console.log(`Request: ${req.method} ${req.url}`);

  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in flagged tickets endpoint:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? error.message
          : 'A server error occurred',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default safeHandler;