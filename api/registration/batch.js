import { getDatabaseClient } from '../lib/database.js';
import { getBrevoClient } from '../lib/brevo-client.js';
import rateLimit from '../lib/rate-limiter.js';

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

function validateRegistration(registration) {
  const errors = [];
  
  if (!registration.ticketId) {
    errors.push('Ticket ID is required');
  }
  
  const cleanFirstName = sanitizeInput(registration.firstName);
  if (!cleanFirstName || !NAME_REGEX.test(cleanFirstName)) {
    errors.push(`Invalid first name for ticket ${registration.ticketId}`);
  }
  
  const cleanLastName = sanitizeInput(registration.lastName);
  if (!cleanLastName || !NAME_REGEX.test(cleanLastName)) {
    errors.push(`Invalid last name for ticket ${registration.ticketId}`);
  }
  
  const cleanEmail = sanitizeInput(registration.email);
  if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
    errors.push(`Invalid email for ticket ${registration.ticketId}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      ticketId: registration.ticketId,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      email: cleanEmail
    }
  };
}

export default async function handler(req, res) {
  // Apply rate limiting with early return on limit
  try {
    await new Promise((resolve, reject) => {
      limiter(req, res, (err) => (err ? reject(err) : resolve()));
    });
  } catch {
    return res.status(429).json({ error: 'Too many registration attempts' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { registrations } = req.body;

  if (!registrations || !Array.isArray(registrations) || registrations.length === 0) {
    return res.status(400).json({ error: 'Registrations array is required' });
  }

  if (registrations.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 tickets per batch' });
  }

  // Validate all registrations first
  const validationResults = registrations.map(validateRegistration);
  const allErrors = validationResults.flatMap(r => r.errors);
  
  if (allErrors.length > 0) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: allErrors
    });
  }

  const sanitizedRegistrations = validationResults.map(r => r.sanitized);

  try {
    const db = await getDatabaseClient();
    
    // Fetch all tickets
    const ticketIds = sanitizedRegistrations.map(r => r.ticketId);
    const ticketsResult = await db.execute({
      sql: `
        SELECT 
          ticket_id,
          ticket_type,
          registration_status,
          registration_deadline,
          stripe_payment_intent,
          customer_email
        FROM tickets
        WHERE ticket_id IN (${ticketIds.map(() => '?').join(',')})
      `,
      args: ticketIds
    });

    if (ticketsResult.rows.length !== ticketIds.length) {
      const foundIds = ticketsResult.rows.map(t => t.ticket_id);
      const missingIds = ticketIds.filter(id => !foundIds.includes(id));
      return res.status(404).json({ 
        error: 'Some tickets not found',
        missingTickets: missingIds
      });
    }

    // Check for already registered or expired tickets
    const issues = [];
    const now = new Date();
    
    for (const ticket of ticketsResult.rows) {
      if (ticket.registration_status === 'completed') {
        issues.push(`Ticket ${ticket.ticket_id} is already registered`);
      }
      
      const deadline = new Date(ticket.registration_deadline);
      if (now > deadline) {
        issues.push(`Ticket ${ticket.ticket_id} registration deadline has passed`);
      }
    }

    if (issues.length > 0) {
      return res.status(400).json({ 
        error: 'Registration validation failed',
        details: issues
      });
    }

    // Use transaction for atomicity
    const results = [];
    const emailTasks = [];

    // Start transaction
    await db.execute('BEGIN TRANSACTION');

    try {
      for (const registration of sanitizedRegistrations) {
        const ticket = ticketsResult.rows.find(t => t.ticket_id === registration.ticketId);
        
        // Update ticket (guard against concurrent completion)
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
          args: [
            registration.firstName,
            registration.lastName,
            registration.email,
            'completed',
            registration.ticketId
          ]
        });
        
        // Check if update affected any rows
        if (updateRes?.rowsAffected !== undefined && updateRes.rowsAffected === 0) {
          throw new Error(`Concurrent update detected for ticket ${registration.ticketId}`);
        }

        // Cancel reminders
        await db.execute({
          sql: `
            UPDATE registration_reminders 
            SET status = 'cancelled'
            WHERE ticket_id = ? AND status = 'scheduled'
          `,
          args: [registration.ticketId]
        });

        results.push({
          ticketId: registration.ticketId,
          status: 'registered',
          attendee: {
            firstName: registration.firstName,
            lastName: registration.lastName,
            email: registration.email
          }
        });

        // Queue email task
        emailTasks.push({
          ticket,
          registration,
          isPurchaser: registration.email.toLowerCase() === ticket.customer_email.toLowerCase()
        });
      }

      // Commit transaction
      await db.execute('COMMIT');

      // Send confirmation emails (after transaction commits)
      const brevo = await getBrevoClient();
      const emailResults = [];

      for (const task of emailTasks) {
        try {
          await brevo.sendTransactionalEmail({
            to: [{ 
              email: task.registration.email, 
              name: `${task.registration.firstName} ${task.registration.lastName}` 
            }],
            templateId: task.isPurchaser ? 
              parseInt(process.env.BREVO_PURCHASER_CONFIRMATION_TEMPLATE_ID) : 
              parseInt(process.env.BREVO_ATTENDEE_CONFIRMATION_TEMPLATE_ID),
            params: {
              firstName: task.registration.firstName,
              lastName: task.registration.lastName,
              ticketId: task.registration.ticketId,
              ticketType: task.ticket.ticket_type,
              walletPassUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/apple-wallet/${task.registration.ticketId}`
            }
          });

          // Log email
          await db.execute({
            sql: `
              INSERT INTO registration_emails (ticket_id, email_type, recipient_email, sent_at)
              VALUES (?, ?, ?, datetime('now'))
            `,
            args: [task.registration.ticketId, 'confirmation', task.registration.email]
          });

          emailResults.push({ 
            ticketId: task.registration.ticketId, 
            emailSent: true 
          });
        } catch (emailError) {
          console.error(`Failed to send email for ${task.registration.ticketId}:`, emailError);
          emailResults.push({ 
            ticketId: task.registration.ticketId, 
            emailSent: false 
          });
        }
      }

      res.status(200).json({
        success: true,
        message: `Successfully registered ${results.length} tickets`,
        registrations: results,
        emailStatus: emailResults
      });

    } catch (error) {
      // Rollback transaction on error
      await db.execute('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Batch registration error:', error);
    res.status(500).json({ error: 'Failed to process batch registration' });
  }
}