/**
 * Attendee Information Editing API Endpoint
 * Allows users to edit attendee information for their tickets
 */

import { getDatabaseClient } from "../../../lib/database.js";
import { setSecureCorsHeaders } from '../../../lib/cors-config.js';
import { sendEmail } from '../../../lib/email-service.js';
import { generateAttendeeInfoChangedEmail } from '../../../lib/email-templates/attendee-info-changed.js';
import jwt from 'jsonwebtoken';
import timeUtils from '../../../lib/time-utils.js';

/**
 * Verify JWT access token
 */
function verifyAccessToken(token) {
  try {
    const secret = process.env.REGISTRATION_SECRET;

    if (!secret) {
      throw new Error('REGISTRATION_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'alocubano-tickets'
    });

    return {
      valid: true,
      email: decoded.email
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Get token from request
 */
function getTokenFromRequest(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter as fallback
  if (req.query.token) {
    return req.query.token;
  }

  return null;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Get client IP address
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * Attendee editing endpoint handler
 */
export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow PATCH requests
  if (req.method !== 'PATCH') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const { ticketId } = req.query;

    // Validate ticket ID
    if (!ticketId || typeof ticketId !== 'string') {
      return res.status(400).json({
        error: 'Invalid ticket ID'
      });
    }

    // Verify access token
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    const tokenVerification = verifyAccessToken(token);
    if (!tokenVerification.valid) {
      return res.status(401).json({
        error: 'Invalid or expired token'
      });
    }

    const userEmail = tokenVerification.email;

    // Get changes from request body
    const { firstName, lastName, email: newEmail } = req.body;

    // Validate at least one field is being updated
    if (!firstName && !lastName && !newEmail) {
      return res.status(400).json({
        error: 'At least one field (firstName, lastName, or email) must be provided'
      });
    }

    // Validate email format if provided
    if (newEmail && !isValidEmail(newEmail)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Get ticket from database
    const client = await getDatabaseClient();
    const ticketResult = await client.execute({
      sql: `
        SELECT t.*, e.event_date, e.event_end_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.ticket_id = ?
      `,
      args: [ticketId]
    });

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Ticket not found'
      });
    }

    const ticket = ticketResult.rows[0];

    // Verify user owns this ticket
    const ticketEmail = ticket.attendee_email?.toLowerCase();
    if (ticketEmail !== userEmail) {
      return res.status(403).json({
        error: 'You do not have permission to edit this ticket'
      });
    }

    // Check if ticket has been scanned
    if (ticket.scan_count > 0) {
      return res.status(400).json({
        error: 'Cannot edit ticket that has already been scanned'
      });
    }

    // Check if event has started
    const eventEndDate = new Date(ticket.event_end_date);
    const now = new Date();
    if (now > eventEndDate) {
      return res.status(400).json({
        error: 'Cannot edit ticket after event has ended'
      });
    }

    // Build update query
    const updates = [];
    const args = [];
    const changes = [];

    if (firstName && firstName.trim() !== ticket.attendee_first_name) {
      updates.push('attendee_first_name = ?');
      args.push(firstName.trim());
      changes.push({
        field: 'attendee_first_name',
        oldValue: ticket.attendee_first_name,
        newValue: firstName.trim()
      });
    }

    if (lastName && lastName.trim() !== ticket.attendee_last_name) {
      updates.push('attendee_last_name = ?');
      args.push(lastName.trim());
      changes.push({
        field: 'attendee_last_name',
        oldValue: ticket.attendee_last_name,
        newValue: lastName.trim()
      });
    }

    if (newEmail && newEmail.toLowerCase().trim() !== ticketEmail) {
      updates.push('attendee_email = ?');
      args.push(newEmail.toLowerCase().trim());
      changes.push({
        field: 'attendee_email',
        oldValue: ticket.attendee_email,
        newValue: newEmail.toLowerCase().trim()
      });
    }

    // If no actual changes, return success
    if (changes.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No changes detected',
        ticket: {
          ticket_id: ticket.ticket_id,
          attendee_first_name: ticket.attendee_first_name,
          attendee_last_name: ticket.attendee_last_name,
          attendee_email: ticket.attendee_email
        }
      });
    }

    // Update ticket
    args.push(ticket.id);
    await client.execute({
      sql: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`,
      args
    });

    // Log to audit trail
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    for (const change of changes) {
      await client.execute({
        sql: `
          INSERT INTO ticket_edit_audit_log
          (ticket_id, ticket_external_id, field_name, old_value, new_value, edited_by_email, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          ticket.id,
          ticket.ticket_id,
          change.field,
          change.oldValue,
          change.newValue,
          userEmail,
          ipAddress,
          userAgent
        ]
      });
    }

    // Send notification emails
    const eventDate = timeUtils.formatDate(ticket.event_date);
    const changedAt = timeUtils.formatDateTime(new Date().toISOString());

    // Check if email was changed
    const emailChanged = changes.some(c => c.field === 'attendee_email');

    if (emailChanged) {
      const oldEmailChange = changes.find(c => c.field === 'attendee_email');

      // Send to old email
      const oldEmailHtml = generateAttendeeInfoChangedEmail({
        ticketId: ticket.ticket_id,
        ticketType: ticket.ticket_type,
        eventDate,
        changes,
        changedAt,
        changedByEmail: userEmail,
        isRecipient: false
      });

      await sendEmail({
        to: oldEmailChange.oldValue,
        subject: 'Ticket Transferred - A Lo Cubano Boulder Fest',
        html: oldEmailHtml
      });

      // Send to new email
      const newEmailHtml = generateAttendeeInfoChangedEmail({
        ticketId: ticket.ticket_id,
        ticketType: ticket.ticket_type,
        eventDate,
        changes,
        changedAt,
        changedByEmail: userEmail,
        isRecipient: true
      });

      await sendEmail({
        to: oldEmailChange.newValue,
        subject: 'Ticket Information Updated - A Lo Cubano Boulder Fest',
        html: newEmailHtml
      });
    } else {
      // Just name changes, send single email
      const emailHtml = generateAttendeeInfoChangedEmail({
        ticketId: ticket.ticket_id,
        ticketType: ticket.ticket_type,
        eventDate,
        changes,
        changedAt,
        changedByEmail: userEmail,
        isRecipient: true
      });

      await sendEmail({
        to: userEmail,
        subject: 'Ticket Information Updated - A Lo Cubano Boulder Fest',
        html: emailHtml
      });
    }

    console.log(`[AttendeeEdit] Ticket ${ticket.ticket_id} updated by ${userEmail}`);

    // Return updated ticket info
    return res.status(200).json({
      success: true,
      message: 'Ticket information updated successfully',
      ticket: {
        ticket_id: ticket.ticket_id,
        attendee_first_name: firstName?.trim() || ticket.attendee_first_name,
        attendee_last_name: lastName?.trim() || ticket.attendee_last_name,
        attendee_email: newEmail?.toLowerCase().trim() || ticket.attendee_email
      },
      changes
    });

  } catch (error) {
    console.error('[AttendeeEdit] Error:', error);

    return res.status(500).json({
      error: 'Failed to update ticket information. Please try again later.'
    });
  }
}
