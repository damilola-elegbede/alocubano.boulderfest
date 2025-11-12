import ticketService from "../../lib/ticket-service.js";
import tokenService from "../../lib/token-service.js";
import { TOKEN_ACTIONS } from "../../lib/ticket-config.js";
import { getDatabaseClient } from "../../lib/database.js";

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
    const ticketEmailService = await import('../lib/ticket-email-service-brevo.js');
    const emailService = ticketEmailService.default;

    // Notify new owner
    await emailService.sendTransferNotification({
      email: sanitizedAttendee.email,
      firstName: sanitizedAttendee.firstName,
      ticketId: ticketId,
      ticketType: transferredTicket.ticket_type,
      eventDate: transferredTicket.event_date
    });

    // Confirm with original owner
    const decodedToken = jwt.verify(actionToken, process.env.REGISTRATION_SECRET);
    await emailService.sendTransferConfirmation({
      email: decodedToken.email,
      ticketId: ticketId,
      newOwnerEmail: sanitizedAttendee.email,
      newOwnerName: `${sanitizedAttendee.firstName} ${sanitizedAttendee.lastName || ''}`.trim()
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
        sanitizedAttendee.lastName || null,
        sanitizedAttendee.phone || null,
        decodedToken.email
      ]
    });

    return res.status(200).json({
      success: true,
      ticket: transferredTicket,
      message: 'Ticket successfully transferred'
    });
  } catch (error) {
    console.error('Ticket transfer error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
