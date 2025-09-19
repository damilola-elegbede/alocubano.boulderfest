import { getDatabaseClient } from '../../lib/database.js';
import { getBrevoClient } from '../../lib/brevo-client.js';
import rateLimit from '../../lib/rate-limiter.js';
import auditService from '../../lib/audit-service.js';

// Input validation regex patterns
const NAME_REGEX = /^[a-zA-Z\s\-']{2,50}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limiting: 3 attempts per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts. Please try again later.'
});

// XSS prevention
function sanitizeInput(input) {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

/**
 * Extract client IP address from request headers
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Audit ticket registration operation (non-blocking)
 */
async function auditTicketRegistration(params) {
  try {
    await auditService.logDataChange({
      requestId: params.requestId,
      action: 'INDIVIDUAL_TICKET_REGISTRATION',
      targetType: 'ticket',
      targetId: params.ticketId,
      beforeValue: {
        registration_status: params.beforeStatus,
        attendee_first_name: params.beforeFirstName || null,
        attendee_last_name: params.beforeLastName || null,
        attendee_email: params.beforeEmail || null
      },
      afterValue: {
        registration_status: 'completed',
        attendee_first_name: params.afterFirstName,
        attendee_last_name: params.afterLastName,
        attendee_email: params.afterEmail,
        registered_at: new Date().toISOString()
      },
      changedFields: params.changedFields,
      adminUser: params.adminUser,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        registration_method: 'individual',
        ticket_type: params.ticketType,
        is_purchaser: params.isPurchaser,
        registration_deadline: params.registrationDeadline,
        processing_time_ms: params.processingTimeMs,
        deadline_compliance: params.deadlineCompliance,
        concurrent_prevention: params.concurrentPrevention || false
      },
      severity: 'info'
    });
  } catch (auditError) {
    // Non-blocking: log error but don't fail the operation
    console.error('Individual ticket registration audit failed (non-blocking):', auditError.message);
  }
}

export default async function handler(req, res) {
  const startTime = Date.now();
  // Ensure audit service is initialized to prevent race conditions
  if (auditService.ensureInitialized) {
    await auditService.ensureInitialized();
  }

  const requestId = auditService.generateRequestId();
  const clientIP = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';

  // Apply rate limiting with early return on limit
  try {
    await new Promise((resolve, reject) => {
      limiter(req, res, (err) => (err ? reject(err) : resolve()));
    });
  } catch {
    return res.status(429).json({ error: 'Too many registration attempts' });
  }

  if (req.method !== 'POST') {
    res.setHeader("Allow", "POST, OPTIONS");    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticketId, firstName, lastName, email } = req.body;

  // Validate required fields
  if (!ticketId || !firstName || !lastName || !email) {
    return res.status(400).json({ 
      error: 'All fields are required: ticketId, firstName, lastName, email' 
    });
  }

  // Sanitize inputs
  const cleanFirstName = sanitizeInput(firstName);
  const cleanLastName = sanitizeInput(lastName);
  const cleanEmail = sanitizeInput(email);

  // Validate inputs
  if (!NAME_REGEX.test(cleanFirstName)) {
    return res.status(400).json({ 
      error: 'First name must be 2-50 characters, letters, spaces, and hyphens only' 
    });
  }

  if (!NAME_REGEX.test(cleanLastName)) {
    return res.status(400).json({ 
      error: 'Last name must be 2-50 characters, letters, spaces, and hyphens only' 
    });
  }

  if (!EMAIL_REGEX.test(cleanEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    const db = await getDatabaseClient();
    
    // Fetch ticket details
    const ticketResult = await db.execute({
      sql: `
        SELECT 
          ticket_id,
          ticket_type,
          registration_status,
          registration_deadline,
          stripe_payment_intent,
          customer_email
        FROM tickets
        WHERE ticket_id = ?
      `,
      args: [ticketId]
    });

    if (!ticketResult.rows || ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    // Capture before state for audit
    const beforeState = {
      status: ticket.registration_status,
      firstName: ticket.attendee_first_name,
      lastName: ticket.attendee_last_name,
      email: ticket.attendee_email
    };

    // Check if ticket is already registered
    if (ticket.registration_status === 'completed') {
      return res.status(400).json({ error: 'Ticket is already registered' });
    }

    // Check if ticket is expired
    const now = new Date();
    const deadline = new Date(ticket.registration_deadline);
    const deadlineCompliance = now <= deadline;

    if (!deadlineCompliance) {
      // Update status to expired
      await db.execute({
        sql: 'UPDATE tickets SET registration_status = ? WHERE ticket_id = ?',
        args: ['expired', ticketId]
      });
      return res.status(400).json({ error: 'Registration deadline has passed' });
    }

    // Update ticket with attendee information (guard against concurrent completion)
    const updateRes = await db.execute({
      sql: `
        UPDATE tickets 
        SET 
          attendee_first_name = ?,
          attendee_last_name = ?,
          attendee_email = ?,
          registration_status = ?,
          registered_at = datetime('now')
        WHERE ticket_id = ? AND registration_status != 'completed'
      `,
      args: [cleanFirstName, cleanLastName, cleanEmail, 'completed', ticketId]
    });
    
    // Use portable rows changed check for different database implementations (prevents double registration)
    const rowsChanged = updateRes?.rowsAffected ?? updateRes?.changes ?? 0;
    const concurrentPrevention = rowsChanged === 0;
    if (concurrentPrevention) {
      return res.status(409).json({ error: 'Ticket was registered concurrently; please refresh.' });
    }

    // Determine changed fields for audit
    const changedFields = [];
    if (beforeState.status !== 'completed') changedFields.push('registration_status');
    if (beforeState.firstName !== cleanFirstName) changedFields.push('attendee_first_name');
    if (beforeState.lastName !== cleanLastName) changedFields.push('attendee_last_name');
    if (beforeState.email !== cleanEmail) changedFields.push('attendee_email');
    changedFields.push('registered_at');

    // Audit individual registration (non-blocking)
    const processingTime = Date.now() - startTime;
    const isPurchaser = cleanEmail.toLowerCase() === ticket.customer_email.toLowerCase();

    auditTicketRegistration({
      requestId: requestId,
      ticketId: ticketId,
      beforeStatus: beforeState.status,
      beforeFirstName: beforeState.firstName,
      beforeLastName: beforeState.lastName,
      beforeEmail: beforeState.email,
      afterFirstName: cleanFirstName,
      afterLastName: cleanLastName,
      afterEmail: cleanEmail,
      changedFields: changedFields,
      adminUser: null, // Individual registrations are self-service
      sessionId: null,
      ipAddress: clientIP,
      userAgent: userAgent,
      ticketType: ticket.ticket_type,
      isPurchaser: isPurchaser,
      registrationDeadline: ticket.registration_deadline,
      processingTimeMs: processingTime,
      deadlineCompliance: deadlineCompliance,
      concurrentPrevention: concurrentPrevention
    });

    // Cancel remaining reminders
    await db.execute({
      sql: `
        UPDATE registration_reminders 
        SET status = 'cancelled'
        WHERE ticket_id = ? AND status = 'scheduled'
      `,
      args: [ticketId]
    });

    // Send confirmation email
    try {
      const brevo = await getBrevoClient();
      const isPurchaser = cleanEmail.toLowerCase() === ticket.customer_email.toLowerCase();
      
      await brevo.sendTransactionalEmail({
        to: [{ email: cleanEmail, name: `${cleanFirstName} ${cleanLastName}` }],
        templateId: isPurchaser ? 
          parseInt(process.env.BREVO_PURCHASER_CONFIRMATION_TEMPLATE_ID) : 
          parseInt(process.env.BREVO_ATTENDEE_CONFIRMATION_TEMPLATE_ID),
        params: {
          firstName: cleanFirstName,
          lastName: cleanLastName,
          ticketId: ticketId,
          ticketType: ticket.ticket_type,
          walletPassUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/apple-wallet/${ticketId}`
        }
      });

      // Log email sent
      await db.execute({
        sql: `
          INSERT INTO registration_emails (ticket_id, email_type, recipient_email, sent_at)
          VALUES (?, ?, ?, datetime('now'))
        `,
        args: [ticketId, 'confirmation', cleanEmail]
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Continue - registration is still successful
    }

    // Check if all tickets in transaction are registered
    const transactionTickets = await db.execute({
      sql: `
        SELECT COUNT(*) as total, 
               SUM(CASE WHEN registration_status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM tickets
        WHERE stripe_payment_intent = ?
      `,
      args: [ticket.stripe_payment_intent]
    });

    const allRegistered = transactionTickets.rows[0].total === transactionTickets.rows[0].completed;

    res.status(200).json({
      success: true,
      message: 'Ticket registered successfully',
      ticketId: ticketId,
      attendee: {
        firstName: cleanFirstName,
        lastName: cleanLastName,
        email: cleanEmail
      },
      allTicketsRegistered: allRegistered
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register ticket' });
  }
}