import { getDatabaseClient } from "../../lib/database.js";
import { getBrevoClient } from "../../lib/brevo-client.js";
import rateLimit from "../../lib/rate-limiter.js";
import auditService from "../../lib/audit-service.js";

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
  if (!input) {
    return '';
  }
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
 * Audit individual registration operation (non-blocking)
 */
async function auditRegistrationChange(params) {
  try {
    await auditService.logDataChange({
      requestId: params.requestId,
      action: 'TICKET_REGISTRATION_UPDATE',
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
        registration_method: 'batch',
        batch_size: params.batchSize,
        batch_position: params.batchPosition,
        ticket_type: params.ticketType,
        processing_time_ms: params.processingTimeMs
      },
      severity: 'info'
    });
  } catch (auditError) {
    // Non-blocking: log error but don't fail the operation
    console.error('Batch registration audit failed (non-blocking):', auditError.message);
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
    res.setHeader('Allow', 'POST, OPTIONS');    return res.status(405).json({ error: 'Method not allowed' });
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
      for (let i = 0; i < sanitizedRegistrations.length; i++) {
        const registration = sanitizedRegistrations[i];
        const ticket = ticketsResult.rows.find(t => t.ticket_id === registration.ticketId);
        const operationStartTime = Date.now();

        // Capture before state for audit
        const beforeState = {
          status: ticket.registration_status,
          firstName: ticket.attendee_first_name,
          lastName: ticket.attendee_last_name,
          email: ticket.attendee_email
        };

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

        // Use portable rows changed check for different database implementations
        const rowsChanged = updateRes?.rowsAffected ?? updateRes?.changes ?? 0;
        if (rowsChanged === 0) {
          throw new Error(`Concurrent update detected for ticket ${registration.ticketId}`);
        }

        // Determine changed fields for audit
        const changedFields = [];
        if (beforeState.status !== 'completed') {
          changedFields.push('registration_status');
        }
        if (beforeState.firstName !== registration.firstName) {
          changedFields.push('attendee_first_name');
        }
        if (beforeState.lastName !== registration.lastName) {
          changedFields.push('attendee_last_name');
        }
        if (beforeState.email !== registration.email) {
          changedFields.push('attendee_email');
        }
        if (!beforeState.firstName && !beforeState.lastName && !beforeState.email) {
          changedFields.push('registered_at');
        }

        // Audit individual registration change (non-blocking)
        auditRegistrationChange({
          requestId: requestId,
          ticketId: registration.ticketId,
          beforeStatus: beforeState.status,
          beforeFirstName: beforeState.firstName,
          beforeLastName: beforeState.lastName,
          beforeEmail: beforeState.email,
          afterFirstName: registration.firstName,
          afterLastName: registration.lastName,
          afterEmail: registration.email,
          changedFields: changedFields,
          adminUser: null, // Batch operations are typically self-service
          sessionId: null,
          ipAddress: clientIP,
          userAgent: userAgent,
          batchSize: sanitizedRegistrations.length,
          batchPosition: i + 1,
          ticketType: ticket.ticket_type,
          processingTimeMs: Date.now() - operationStartTime
        });

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

      // Log batch operation summary (non-blocking)
      const totalProcessingTime = Date.now() - startTime;
      auditService.logDataChange({
        requestId: requestId,
        action: 'BATCH_REGISTRATION_COMPLETED',
        targetType: 'registration_batch',
        targetId: requestId,
        beforeValue: null,
        afterValue: {
          total_tickets: results.length,
          successful_registrations: results.length,
          failed_registrations: 0,
          email_success_count: emailResults.filter(e => e.emailSent).length,
          email_failure_count: emailResults.filter(e => !e.emailSent).length
        },
        changedFields: ['registration_status', 'attendee_information'],
        adminUser: null,
        sessionId: null,
        ipAddress: clientIP,
        userAgent: userAgent,
        metadata: {
          processing_time_ms: totalProcessingTime,
          batch_size: sanitizedRegistrations.length,
          request_method: req.method,
          user_agent_details: userAgent.substring(0, 200) // Truncate for storage
        },
        severity: 'info'
      }).catch(auditError => {
        console.error('Batch operation audit failed (non-blocking):', auditError.message);
      });

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