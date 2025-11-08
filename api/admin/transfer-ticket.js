/**
 * Admin Manual Ticket Transfer API Endpoint
 * Allows admin staff to manually transfer ticket ownership
 */

import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import csrfService from "../../lib/csrf-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import timeUtils from "../../lib/time-utils.js";
import { getTicketEmailService } from "../../lib/ticket-email-service-brevo.js";

/**
 * Input validation schemas
 */
const INPUT_VALIDATION = {
  ticketId: {
    required: true,
    pattern: /^[A-Z0-9-]+$/,
    error: 'ticketId must be a valid ticket ID'
  },
  newEmail: {
    required: true,
    maxLength: 255,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    error: 'newEmail must be a valid email address'
  },
  newFirstName: {
    required: true,
    minLength: 1,
    maxLength: 100,
    error: 'newFirstName is required and must be under 100 characters'
  },
  newLastName: {
    required: false,
    maxLength: 100,
    error: 'newLastName must be under 100 characters'
  },
  newPhone: {
    required: false,
    maxLength: 50,
    pattern: /^[\d\s\-\+\(\)]+$/,
    error: 'newPhone must contain only numbers, spaces, and phone characters'
  },
  transferReason: {
    required: false,
    maxLength: 500,
    error: 'transferReason must be under 500 characters'
  }
};

/**
 * Validate input field
 */
function validateField(value, field, rules) {
  // Check required fields
  if (rules.required && (value === undefined || value === null || value === '')) {
    return { isValid: false, error: `${field} is required` };
  }

  // Skip further validation if field is not required and empty
  if (!rules.required && (value === undefined || value === null || value === '')) {
    return { isValid: true };
  }

  // String validation
  if (typeof value !== 'string' && rules.pattern) {
    return { isValid: false, error: rules.error };
  }

  const strValue = String(value);

  // Length validation
  if (rules.minLength && strValue.length < rules.minLength) {
    return { isValid: false, error: rules.error };
  }

  if (rules.maxLength && strValue.length > rules.maxLength) {
    return { isValid: false, error: rules.error };
  }

  // Pattern validation
  if (rules.pattern && !rules.pattern.test(strValue)) {
    return { isValid: false, error: rules.error };
  }

  // XSS and injection protection
  const dangerousPatterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /\$\{.*\}/,
    /__proto__/,
    /constructor/,
    /prototype/,
    /eval\s*\(/i,
    /function\s*\(/i,
    /\.\.\//,
    /union\s+select/i,
    /insert\s+into/i,
    /delete\s+from/i,
    /drop\s+table/i,
    new RegExp('[\\x00\\x08\\x0B\\x0C]')
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(strValue)) {
      return { isValid: false, error: 'Invalid characters detected' };
    }
  }

  return { isValid: true };
}

/**
 * Main handler function
 */
async function handler(req, res) {
  // Set security headers to prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // ========================================================================
    // STEP 1: Input Validation
    // ========================================================================
    const {
      ticketId,
      newEmail,
      newFirstName,
      newLastName,
      newPhone,
      transferReason
    } = req.body || {};

    // Validate required fields
    const validations = {
      ticketId: validateField(ticketId, 'ticketId', INPUT_VALIDATION.ticketId),
      newEmail: validateField(newEmail, 'newEmail', INPUT_VALIDATION.newEmail),
      newFirstName: validateField(newFirstName, 'newFirstName', INPUT_VALIDATION.newFirstName),
      newLastName: validateField(newLastName, 'newLastName', INPUT_VALIDATION.newLastName),
      newPhone: validateField(newPhone, 'newPhone', INPUT_VALIDATION.newPhone),
      transferReason: validateField(transferReason, 'transferReason', INPUT_VALIDATION.transferReason)
    };

    // Check for validation errors
    for (const [field, result] of Object.entries(validations)) {
      if (!result.isValid) {
        return res.status(400).json({ error: result.error, field });
      }
    }

    // Sanitize inputs
    const sanitizedNewEmail = newEmail.trim().toLowerCase();
    const sanitizedNewFirstName = newFirstName.trim();
    const sanitizedNewLastName = (newLastName || '').trim();
    const sanitizedNewPhone = newPhone ? newPhone.trim() : null;
    const sanitizedTransferReason = transferReason ? transferReason.trim() : null;

    // ========================================================================
    // ========================================================================
    // STEP 2: Get Admin Info (from JWT token)
    // ========================================================================
    // Validate admin ID exists in authentication context
    if (!req.admin?.id) {
      return res.status(401).json({
        error: 'Authentication required',
        details: 'Admin ID not found in authentication context'
      });
    }
    const adminId = req.admin.id;

    // ========================================================================
    // STEP 3-6: Get Ticket Info, Validate, and Perform Transfer (ATOMIC)
    // ========================================================================
    // Start transaction FIRST to ensure SELECT and UPDATE operate on same snapshot
    const db = await getDatabaseClient();
    const tx = await db.transaction();

    try {
      // STEP 3: Get Current Ticket Info (inside transaction)
      const ticketResult = await tx.execute({
        sql: `SELECT
                t.id,
                t.ticket_id,
                t.transaction_id,
                t.ticket_type,
                t.ticket_type_id,
                t.event_id,
                t.price_cents,
                t.attendee_first_name,
                t.attendee_last_name,
                t.attendee_email,
                t.attendee_phone,
                t.status,
                t.is_test,
                t.created_at,
                tr.customer_email as transaction_email,
                tr.customer_name as transaction_name
              FROM tickets t
              LEFT JOIN transactions tr ON t.transaction_id = tr.id
              WHERE t.ticket_id = ?`,
        args: [ticketId]
      });

      if (!ticketResult.rows || ticketResult.rows.length === 0) {
        await tx.rollback();
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const ticket = ticketResult.rows[0];

      // STEP 4: Validate Ticket Status
      // Prevent transfers of cancelled, refunded, or already transferred tickets
      if (ticket.status === 'cancelled') {
        await tx.rollback();
        return res.status(400).json({
          error: 'Cannot transfer cancelled ticket',
          details: 'This ticket has been cancelled and cannot be transferred'
        });
      }

      if (ticket.status === 'refunded') {
        await tx.rollback();
        return res.status(400).json({
          error: 'Cannot transfer refunded ticket',
          details: 'This ticket has been refunded and cannot be transferred'
        });
      }

      // Check if already being transferred to the same email
      if (ticket.attendee_email && ticket.attendee_email.toLowerCase() === sanitizedNewEmail) {
        await tx.rollback();
        return res.status(400).json({
          error: 'Ticket already belongs to this email',
          details: `This ticket is already assigned to ${sanitizedNewEmail}`
        });
      }

      // STEP 5 & 6: Update Ticket & Record History (already in transaction)
      // Update ticket ownership
      const updateResult = await tx.execute(
        `UPDATE tickets
         SET attendee_first_name = ?,
             attendee_last_name = ?,
             attendee_email = ?,
             attendee_phone = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE ticket_id = ?`,
        [
          sanitizedNewFirstName,
          sanitizedNewLastName,
          sanitizedNewEmail,
          sanitizedNewPhone,
          ticketId
        ]
      );

      // Use portable rows changed check for different database implementations
      // libSQL transactions may return 'changes' instead of 'rowsAffected'
      const rowsChanged = updateResult?.rowsAffected ?? updateResult?.changes ?? 0;
      if (!updateResult || rowsChanged === 0) {
        await tx.rollback();
        return res.status(500).json({
          error: 'Failed to update ticket',
          details: 'Ticket update operation did not affect any rows'
        });
      }


      // Validate from_email for audit trail integrity
      const fromEmail = ticket.attendee_email || ticket.transaction_email;
      if (!fromEmail) {
        console.warn(`Transfer ${ticketId}: no reliable from_email available (attendee_email and transaction_email both null), using fallback`);
      }
      const auditFromEmail = fromEmail || 'unknown@system';

      // Record transfer history
      await tx.execute(
        `INSERT INTO ticket_transfers (
           ticket_id,
           transaction_id,
           from_email,
           from_first_name,
           from_last_name,
           from_phone,
           to_email,
           to_first_name,
           to_last_name,
           to_phone,
           transferred_by,
           transfer_reason,
           transfer_method,
           is_test,
           transferred_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          ticketId,
          ticket.transaction_id,
          auditFromEmail,
          ticket.attendee_first_name || '',
          ticket.attendee_last_name || '',
          ticket.attendee_phone || null,
          sanitizedNewEmail,
          sanitizedNewFirstName,
          sanitizedNewLastName,
          sanitizedNewPhone,
          adminId,
          sanitizedTransferReason,
          'admin_manual',
          ticket.is_test ? 1 : 0
        ]
      );

      // Commit transaction - both operations succeed together
      await tx.commit();
      
    } catch (error) {
      // Rollback on any error
      await tx.rollback();
      console.error('Transaction rollback due to error:', error);
      throw error;
    }
    console.log(`Ticket ${ticketId} transferred from ${ticket.attendee_email || 'unassigned'} to ${sanitizedNewEmail} by ${adminId}`);

    // ========================================================================
    // STEP 7: Get Updated Ticket
    // ========================================================================
    const updatedTicketResult = await db.execute({
      sql: `SELECT * FROM tickets WHERE ticket_id = ?`,
      args: [ticketId]
    });

    const updatedTicket = updatedTicketResult.rows[0];

    // ========================================================================
    // STEP 8: Send Email Notifications (Non-Blocking)
    // ========================================================================
    try {
      const ticketEmailService = getTicketEmailService();

      // Send email to new owner
      // Note: This uses the existing ticket confirmation email
      // You may want to create a custom "ticket transferred to you" template
      await ticketEmailService.sendTicketConfirmation({
        id: ticket.transaction_id,
        transaction_id: ticket.ticket_id,
        customer_email: sanitizedNewEmail,
        customer_name: `${sanitizedNewFirstName} ${sanitizedNewLastName}`.trim(),
        order_number: `TRANSFER-${ticketId}`,
        amount_cents: ticket.price_cents,
        created_at: new Date().toISOString()
      });

      console.log(`Transfer notification sent to new owner: ${sanitizedNewEmail}`);

      // Optionally send notification to previous owner
      if (ticket.attendee_email) {
        // You may want to create a custom "your ticket was transferred" template
        console.log(`Previous owner notification: ${ticket.attendee_email} (not implemented yet)`);
      }
    } catch (emailError) {
      console.error('Failed to send transfer notification (non-critical):', emailError);
      // Continue - transfer was successful even if email fails
    }

    // ========================================================================
    // STEP 9: Return Success Response with Mountain Time Fields
    // ========================================================================
    const enhancedTicket = timeUtils.enhanceApiResponse(
      {
        ticket_id: updatedTicket.ticket_id,
        attendee_first_name: updatedTicket.attendee_first_name,
        attendee_last_name: updatedTicket.attendee_last_name,
        attendee_email: updatedTicket.attendee_email,
        attendee_phone: updatedTicket.attendee_phone,
        status: updatedTicket.status,
        created_at: updatedTicket.created_at,
        updated_at: updatedTicket.updated_at
      },
      ['created_at', 'updated_at'],
      { includeDeadline: false }
    );

    return res.status(200).json(
      processDatabaseResult({
        success: true,
        message: 'Ticket transferred successfully',
        ticket: enhancedTicket,
        transfer: {
          from: {
            email: ticket.attendee_email || ticket.transaction_email || 'unassigned',
            firstName: ticket.attendee_first_name || '',
            lastName: ticket.attendee_last_name || ''
          },
          to: {
            email: sanitizedNewEmail,
            firstName: sanitizedNewFirstName,
            lastName: sanitizedNewLastName,
            phone: sanitizedNewPhone
          },
          transferredBy: adminId,
          transferredAt: new Date().toISOString()
        }
      })
    );

  } catch (error) {
    console.error('Ticket transfer error:', error);

    // Handle specific error types
    if (error.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(400).json({
        error: 'Invalid ticket ID',
        details: 'The specified ticket does not exist'
      });
    }

    // Generic error response
    return res.status(500).json({
      error: 'Failed to transfer ticket',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Build middleware chain with security features
// IMPORTANT: Order matters - audit must be outside auth to capture unauthorized access
const securedHandler = withSecurityHeaders(
  withAdminAudit(
    authService.requireAuth(
      csrfService.validateCSRF(handler, {
        skipOriginValidation: false,
        requireHttps: process.env.NODE_ENV === 'production'
      })
    ),
    {
      logBody: true, // Log transfer details for audit trail
      logMetadata: true,
      skipMethods: [] // Log all methods
    }
  )
);

// Wrap in error-handling function to ensure all errors are returned as JSON
async function safeHandler(req, res) {
  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in ticket transfer endpoint:', error);

    // Check for authentication errors
    if (error.message?.includes('ADMIN_SECRET') || error.message?.includes('Authentication')) {
      return res.status(500).json({
        error: 'Authentication service unavailable',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? `Auth configuration error: ${error.message}`
          : 'Authentication service is temporarily unavailable',
        timestamp: new Date().toISOString()
      });
    }

    // Generic error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? error.message
          : 'A server error occurred while processing your request',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default safeHandler;
