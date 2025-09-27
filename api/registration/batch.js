import { getDatabaseClient } from "../../lib/database.js";
import { getBrevoClient } from "../../lib/brevo-client.js";
import rateLimit from "../../lib/rate-limit-middleware.js";
import auditService from "../../lib/audit-service.js";

// Input validation regex patterns
const NAME_REGEX = /^[a-zA-Z\s\-']{2,50}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limiting: 10 attempts per 15 minutes (increased for better UX)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many registration attempts. Please try again in a few minutes.'
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

// Removed redundant batch summary email function

    // If no template ID is configured, send detailed plain text email
    if (isNaN(summaryTemplateId)) {
      await sendPlainTextSummaryEmail(brevo, db, transactionInfo, results, registrations, tickets);
      return;
    }

    // Prepare structured data for template
    const orderNumber = transactionInfo.order_number || `ALO-${new Date().getFullYear()}-${String(transactionInfo.id).padStart(4, '0')}`;
    const registeredAttendees = results.map((result, index) => {
      const registration = registrations[index];
      const ticket = tickets.find(t => t.ticket_id === result.ticketId);
      return {
        name: `${registration.firstName} ${registration.lastName}`,
        email: registration.email,
        ticketType: ticket?.ticket_type || 'Festival Pass',
        ticketId: result.ticketId,
        walletLinks: {
          apple: `${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/apple-wallet/${result.ticketId}`,
          google: `${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/google-wallet/${result.ticketId}`
        }
      };
    });

    // Send template-based email
    await brevo.sendTransactionalEmail({
      to: [{
        email: transactionInfo.customer_email,
        name: transactionInfo.customer_name || 'Festival Attendee'
      }],
      templateId: summaryTemplateId,
      params: {
        ORDER_NUMBER: orderNumber,
        CUSTOMER_NAME: transactionInfo.customer_name || 'Festival Attendee',
        TOTAL_TICKETS: results.length,
        REGISTRATION_DATE: new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        ATTENDEES_LIST: registeredAttendees.map(attendee =>
          `${attendee.name} (${attendee.email}) - ${attendee.ticketType}`
        ).join('\n'),
        WALLET_DOWNLOADS: registeredAttendees.map(attendee =>
          `${attendee.name}: Apple Wallet: ${attendee.walletLinks.apple} | Google Pay: ${attendee.walletLinks.google}`
        ).join('\n'),
        VIEW_TICKETS_URL: `${process.env.NEXT_PUBLIC_BASE_URL}/my-tickets`,
        FESTIVAL_DATES: 'May 15-17, 2026',
        FESTIVAL_VENUE: 'Avalon Ballroom, Boulder, CO'
      }
    });

    // Log summary email sent
    await db.execute({
      sql: `
        INSERT INTO registration_emails (ticket_id, email_type, recipient_email, sent_at)
        VALUES (?, ?, ?, datetime('now'))
      `,
      args: [results[0]?.ticketId || 'BATCH', 'batch_summary', transactionInfo.customer_email]
    });

  } catch (error) {
    console.error('Failed to send batch registration summary email:', error);

    // Fallback to plain text email
    try {
      await sendPlainTextSummaryEmail(brevo, db, transactionInfo, results, registrations, tickets);
    } catch (fallbackError) {
      console.error('Fallback plain text summary email also failed:', fallbackError);
    }
  }
}

/**
 * Send plain text summary email as fallback
 */
async function sendPlainTextSummaryEmail(brevo, db, transactionInfo, results, registrations, tickets) {
  const orderNumber = transactionInfo.order_number || `ALO-${new Date().getFullYear()}-${String(transactionInfo.id).padStart(4, '0')}`;

  const attendeesText = results.map((result, index) => {
    const registration = registrations[index];
    const ticket = tickets.find(t => t.ticket_id === result.ticketId);
    return `• ${registration.firstName} ${registration.lastName} (${registration.email})
  Ticket Type: ${ticket?.ticket_type || 'Festival Pass'}
  Ticket ID: ${result.ticketId}
  Apple Wallet: ${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/apple-wallet/${result.ticketId}
  Google Pay: ${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/google-wallet/${result.ticketId}`;
  }).join('\n\n');

  const emailSubject = `Registration Complete - Order #${orderNumber}`;
  const emailText = `Hi ${transactionInfo.customer_name || 'there'},

🎉 Great news! Your ticket registration is now complete for A Lo Cubano Boulder Fest 2026.

ORDER SUMMARY
Order Number: ${orderNumber}
Registration Date: ${new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })}
Total Tickets Registered: ${results.length}

REGISTERED ATTENDEES
${attendeesText}

NEXT STEPS
📱 Add tickets to your phone's wallet using the links above
📅 Mark your calendar: May 15-17, 2026
📍 Venue: Avalon Ballroom, Boulder, CO
📧 Save this email for your records
🎺 Follow us on Instagram @alocubano.boulderfest for updates

NEED HELP?
View all your tickets: ${process.env.NEXT_PUBLIC_BASE_URL}/my-tickets
Contact us: alocubanoboulderfest@gmail.com

¡Nos vemos en la pista de baile!
The A Lo Cubano Boulder Fest Team

---
This is an automated confirmation email for your ticket registration.`;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="color: #d32f2f; text-align: center;">🎉 Registration Complete!</h1>

      <p>Hi ${transactionInfo.customer_name || 'there'},</p>

      <p>Great news! Your ticket registration is now complete for <strong>A Lo Cubano Boulder Fest 2026</strong>.</p>

      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="color: #d32f2f; margin-top: 0;">Order Summary</h2>
        <p><strong>Order Number:</strong> ${orderNumber}</p>
        <p><strong>Registration Date:</strong> ${new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}</p>
        <p><strong>Total Tickets Registered:</strong> ${results.length}</p>
      </div>

      <h2 style="color: #d32f2f;">Registered Attendees</h2>
      ${results.map((result, index) => {
        const registration = registrations[index];
        const ticket = tickets.find(t => t.ticket_id === result.ticketId);
        return `
          <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px;">
            <h3 style="margin-top: 0; color: #333;">${registration.firstName} ${registration.lastName}</h3>
            <p><strong>Email:</strong> ${registration.email}</p>
            <p><strong>Ticket Type:</strong> ${ticket?.ticket_type || 'Festival Pass'}</p>
            <p><strong>Ticket ID:</strong> ${result.ticketId}</p>
            <p>
              <a href="${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/apple-wallet/${result.ticketId}"
                 style="background: #000; color: white; padding: 8px 12px; text-decoration: none; border-radius: 4px; margin-right: 10px;">
                📱 Add to Apple Wallet
              </a>
              <a href="${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/google-wallet/${result.ticketId}"
                 style="background: #4285f4; color: white; padding: 8px 12px; text-decoration: none; border-radius: 4px;">
                📱 Add to Google Pay
              </a>
            </p>
          </div>
        `;
      }).join('')}

      <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="color: #2e7d32; margin-top: 0;">Next Steps</h2>
        <ul style="line-height: 1.6;">
          <li>📱 Add tickets to your phone's wallet using the buttons above</li>
          <li>📅 Mark your calendar: <strong>May 15-17, 2026</strong></li>
          <li>📍 Venue: <strong>Avalon Ballroom, Boulder, CO</strong></li>
          <li>📧 Save this email for your records</li>
          <li>🎺 Follow us on Instagram <a href="https://www.instagram.com/alocubano.boulderfest/">@alocubano.boulderfest</a> for updates</li>
        </ul>
      </div>

      <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #f57c00; margin-top: 0;">Need Help?</h3>
        <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/my-tickets">View all your tickets</a></p>
        <p>Contact us: <a href="mailto:alocubanoboulderfest@gmail.com">alocubanoboulderfest@gmail.com</a></p>
      </div>

      <p style="text-align: center; color: #666; font-style: italic;">¡Nos vemos en la pista de baile!</p>
      <p style="text-align: center; color: #666;"><strong>The A Lo Cubano Boulder Fest Team</strong></p>

      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #999; text-align: center;">
        This is an automated confirmation email for your ticket registration.
      </p>
    </div>
  `;

  await brevo.sendTransactionalEmail({
    to: [{
      email: transactionInfo.customer_email,
      name: transactionInfo.customer_name || 'Festival Attendee'
    }],
    subject: emailSubject,
    textContent: emailText,
    htmlContent: emailHtml
  });

  // Log plain text summary email sent
  await db.execute({
    sql: `
      INSERT INTO registration_emails (ticket_id, email_type, recipient_email, sent_at)
      VALUES (?, ?, ?, datetime('now'))
    `,
    args: [results[0]?.ticketId || 'BATCH', 'batch_summary_plaintext', transactionInfo.customer_email]
  });
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
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { registrations } = req.body;

  if (!registrations || !Array.isArray(registrations) || registrations.length === 0) {
    return res.status(400).json({
      error: 'Registrations array is required',
      details: 'Please provide an array of ticket registrations to process.'
    });
  }

  if (registrations.length > 10) {
    return res.status(400).json({
      error: 'Maximum 10 tickets per batch',
      details: `You attempted to register ${registrations.length} tickets. Please register in batches of 10 or fewer.`
    });
  }

  // Validate all registrations first
  const validationResults = registrations.map(validateRegistration);
  const allErrors = validationResults.flatMap(r => r.errors);

  if (allErrors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: allErrors,
      message: 'Please correct the validation errors and try again.'
    });
  }

  const sanitizedRegistrations = validationResults.map(r => r.sanitized);

  try {
    const db = await getDatabaseClient();

    // Fetch all tickets with transaction info
    const ticketIds = sanitizedRegistrations.map(r => r.ticketId);
    const ticketsResult = await db.execute({
      sql: `
        SELECT
          t.ticket_id,
          t.ticket_type,
          t.registration_status,
          t.registration_deadline,
          t.transaction_id,
          t.attendee_first_name,
          t.attendee_last_name,
          t.attendee_email,
          tx.customer_email as purchaser_email
        FROM tickets t
        LEFT JOIN transactions tx ON t.transaction_id = tx.id
        WHERE t.ticket_id IN (${ticketIds.map(() => '?').join(',')})
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

    // Build batch operations for atomicity
    const results = [];
    const emailTasks = [];
    const batchOperations = [];
    const auditTasks = [];

    try {
      // Build all operations first
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

        // Add ticket update operation
        batchOperations.push({
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

        // Add reminder cancellation operation
        batchOperations.push({
          sql: `
            UPDATE registration_reminders
            SET status = 'cancelled'
            WHERE ticket_id = ? AND status = 'scheduled'
          `,
          args: [registration.ticketId]
        });

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

        // Queue audit task for after transaction
        auditTasks.push({
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
          isPurchaser: ticket.purchaser_email ?
            registration.email.toLowerCase() === ticket.purchaser_email.toLowerCase() :
            false
        });
      }

      // Execute all operations in a single batch (transaction is automatic)
      const batchResults = await db.batch(batchOperations);

      // Check that all ticket updates succeeded
      // Each UPDATE operation returns a result with rowsAffected
      for (let i = 0; i < sanitizedRegistrations.length; i++) {
        // Each registration has 2 operations: ticket update and reminder cancel
        // So ticket update is at index: i * 2
        const updateResultIndex = i * 2;
        const updateResult = batchResults[updateResultIndex];
        const rowsChanged = updateResult?.rowsAffected ?? updateResult?.changes ?? 0;

        if (rowsChanged === 0) {
          throw new Error(`Concurrent update detected for ticket ${sanitizedRegistrations[i].ticketId}`);
        }
      }

      // Perform audit logging after successful transaction
      for (const auditTask of auditTasks) {
        try {
          await auditRegistrationChange(auditTask);
        } catch (auditError) {
          // Log but don't fail the registration
          console.error('Audit logging failed (non-blocking):', auditError.message);
        }
      }

    } catch (error) {
      // Rollback is automatic if batch fails
      console.error('Batch transaction failed:', error);
      throw error;
    }

    // SEND EMAILS OUTSIDE TRANSACTION (after successful commit)
    const emailResults = [];

    // Get transaction information for order number and purchaser details (declare outside try block)
    const transactionIds = [...new Set(ticketsResult.rows.map(t => t.transaction_id))];
    let transactionInfo = null;

    try {
      const brevo = await getBrevoClient();

      if (transactionIds.length === 1) {
        // Single transaction - get order details for summary email
        const transactionResult = await db.execute({
          sql: `SELECT id, order_number, customer_email, customer_name, total_amount, amount_cents, completed_at, created_at FROM transactions WHERE id = ?`,
          args: [transactionIds[0]]
        });

        if (transactionResult.rows.length > 0) {
          transactionInfo = transactionResult.rows[0];
        }
      }

      // Send individual confirmation emails
      for (const task of emailTasks) {
        try {
          // Validate attendee template ID (simplified - single template for all)
          const attendeeTemplateId = parseInt(process.env.BREVO_ATTENDEE_CONFIRMATION_TEMPLATE_ID);

          if (isNaN(attendeeTemplateId)) {
            console.error('Invalid Brevo attendee template ID in environment variables');
            throw new Error('Email configuration error');
          }

          await brevo.sendTransactionalEmail({
            to: [{
              email: task.registration.email,
              name: `${task.registration.firstName} ${task.registration.lastName}`
            }],
            templateId: attendeeTemplateId,
            params: {
              firstName: task.registration.firstName,
              lastName: task.registration.lastName,
              ticketId: task.registration.ticketId,
              ticketType: task.ticket.ticket_type,
              walletPassUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/tickets/apple-wallet/${task.registration.ticketId}`,
              orderNumber: transactionInfo ? (transactionInfo.order_number || transactionInfo.id) : 'N/A'
            }
          });

          // Log email sent
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

      // Note: Batch summary email removed - individual confirmations only

    } catch (emailServiceError) {
      console.error('Email service error (non-blocking):', emailServiceError);
      // Continue - registration was successful even if emails fail
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

    // Return success response with enhanced data for frontend
    res.status(200).json({
      success: true,
      message: `Successfully registered ${results.length} tickets`,
      registrations: results,
      emailStatus: emailResults,
      orderNumber: transactionInfo ? (transactionInfo.order_number || `ALO-${new Date().getFullYear()}-${String(transactionInfo.id).padStart(4, '0')}`) : null,
      registeredTickets: results.map((result, index) => {
        const registration = sanitizedRegistrations[index];
        const ticket = ticketsResult.rows.find(t => t.ticket_id === result.ticketId);
        return {
          ticketId: result.ticketId,
          ticketType: ticket?.ticket_type || 'Festival Pass',
          attendeeName: `${registration.firstName} ${registration.lastName}`,
          attendeeEmail: registration.email
        };
      }),
      summary: {
        totalRegistered: results.length,
        purchaserEmail: transactionInfo?.customer_email,
        registrationDate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Batch registration error:', error);
    res.status(500).json({ error: 'Failed to process batch registration' });
  }
}