import ticketService from "../../lib/ticket-service.js";
import tokenService from "../../lib/token-service.js";
import { TOKEN_ACTIONS } from "../../lib/ticket-config.js";
import { getDatabaseClient } from "../../lib/database.js";
import timeUtils from "../../lib/time-utils.js";
import { maskEmail } from "../../lib/volunteer-helpers.js";
import { optionalField } from "../../lib/value-utils.js";

export default async function handler(req, res) {
  // Initialize database client
  await getDatabaseClient();
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Handle CI/test environment - return 404 for unsupported functionality
  if (
    (process.env.CI || process.env.NODE_ENV === 'test') &&
    (!process.env.TURSO_DATABASE_URL ||
      process.env.TURSO_DATABASE_URL.includes('memory'))
  ) {
    return res.status(404).json({
      error: 'Ticket transfer not available in test environment'
    });
  }

  try {
    const { ticketId, actionToken, newAttendee } = req.body;

    if (!ticketId || !actionToken || !newAttendee) {
      return res.status(400).json({
        error: 'ticketId, actionToken, and newAttendee are required'
      });
    }

    if (!newAttendee.email || !newAttendee.firstName) {
      return res.status(400).json({
        error: 'New attendee must have email and firstName'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newAttendee.email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Validate action token
    const tokenValidation = await tokenService.validateActionToken(
      actionToken,
      TOKEN_ACTIONS.TRANSFER,
      ticketId
    );

    if (!tokenValidation.valid) {
      return res.status(401).json({ error: tokenValidation.error });
    }

    // Get original owner email from validated token
    const originalOwnerEmail = tokenValidation.email;

    if (!originalOwnerEmail) {
      console.error('Token validation missing email:', tokenValidation);
      return res.status(500).json({
        error: 'Token validation failed: missing email'
      });
    }

    // Sanitize and validate inputs
    const sanitizedAttendee = {
      firstName: newAttendee.firstName.trim().substring(0, 100),
      lastName: (newAttendee.lastName || '').trim().substring(0, 100),
      email: newAttendee.email.trim().toLowerCase(),
      phone: newAttendee.phone
        ? newAttendee.phone.trim().substring(0, 20)
        : null
    };

    // Perform transfer
    const originalTicket = await ticketService.getByTicketId(ticketId);
    const transferredTicket = await ticketService.transferTicket(
      ticketId,
      sanitizedAttendee
    );

    // Send email notifications to both parties
    const ticketEmailService = await import('../../lib/ticket-email-service-brevo.js');
    const emailService = ticketEmailService.default;

    const transferDate = timeUtils.formatDateTime(new Date());

    // Prepare names
    const newOwnerName = `${sanitizedAttendee.firstName} ${sanitizedAttendee.lastName || ''}`.trim();
    const previousOwnerName = `${originalTicket.attendee_first_name || ''} ${originalTicket.attendee_last_name || ''}`.trim() || 'Previous Owner';

    console.log('🎫 [Transfer] Sending notification emails...', {
      newOwnerEmail: maskEmail(sanitizedAttendee.email),
      originalOwnerEmail: maskEmail(originalOwnerEmail),
      ticketId,
      transactionId: transferredTicket.transaction_id
    });

    // Notify new owner
    await emailService.sendTransferNotification({
      newOwnerName,
      newOwnerEmail: sanitizedAttendee.email,
      previousOwnerName,
      ticketId: ticketId,
      ticketType: transferredTicket.ticket_type,
      transferDate,
      transferReason: '',
      transactionId: transferredTicket.transaction_id
    });

    // Confirm with original owner
    await emailService.sendTransferConfirmation({
      originalOwnerName: previousOwnerName,
      originalOwnerEmail: originalOwnerEmail,
      newOwnerName,
      newOwnerEmail: sanitizedAttendee.email,
      ticketId: ticketId,
      ticketType: transferredTicket.ticket_type,
      transferDate,
      transferReason: '',
      transferredBy: 'Self-Service'
    });

    // Record transfer in audit table
    const db = await getDatabaseClient();
    await db.execute({
      sql: `INSERT INTO ticket_transfers
            (ticket_id, transaction_id, from_email, from_first_name, from_last_name,
             to_email, to_first_name, to_last_name, to_phone,
             transferred_by, transfer_method, transferred_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user_self_service', CURRENT_TIMESTAMP)`,
      args: [
        ticketId,
        transferredTicket.transaction_id,
        originalTicket.attendee_email,
        originalTicket.attendee_first_name,
        originalTicket.attendee_last_name,
        sanitizedAttendee.email,
        sanitizedAttendee.firstName,
        optionalField(sanitizedAttendee.lastName),
        optionalField(sanitizedAttendee.phone),
        originalOwnerEmail
      ]
    });

    return res.status(200).json({
      success: true,
      ticket: transferredTicket,
      message: 'Ticket successfully transferred'
    });
  } catch (error) {
    console.error('Ticket transfer error:', {
      message: error.message,
      stack: error.stack,
      ticketId: req.body.ticketId
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
