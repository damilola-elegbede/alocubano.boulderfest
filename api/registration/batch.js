import { getDatabaseClient } from "../../lib/database.js";
import { getBrevoService } from "../../lib/brevo-service.js";
import rateLimit from "../../lib/rate-limit-middleware.js";
import auditService from "../../lib/audit-service.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";

console.log('[BATCH_MODULE] Module imports completed successfully');

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

// Removed redundant batch summary email function - functionality consolidated into individual confirmations

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
    day: 'numeric',
    timeZone: 'America/Denver'
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
          day: 'numeric',
          timeZone: 'America/Denver'
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
      INSERT INTO registration_emails (ticket_id, transaction_id, email_type, recipient_email, sent_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `,
    args: [results[0]?.ticketId || 'BATCH', transactionInfo.id, 'purchaser_completion', transactionInfo.customer_email]
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

console.log('[BATCH_MODULE] About to export handler function');

export default async function handler(req, res) {
  console.log('[BATCH_HANDLER] Handler function entered');
  const startTime = Date.now();

  // CRITICAL FIX: Skip audit service initialization in integration test mode
  // The audit service tries to get a database client which can hang when called from dynamically imported handlers
  if (process.env.INTEGRATION_TEST_MODE !== 'true') {
    console.log('[BATCH_HANDLER] About to initialize audit service');
    // Ensure audit service is initialized to prevent race conditions
    if (auditService.ensureInitialized) {
      await auditService.ensureInitialized();
    }
    console.log('[BATCH_HANDLER] Audit service initialized');
  } else {
    console.log('[BATCH_HANDLER] Skipping audit service initialization in integration test mode');
  }

  console.log('[BATCH_HANDLER] About to generate request ID');
  const requestId = auditService.generateRequestId();
  console.log('[BATCH_HANDLER] Request ID generated:', requestId);

  console.log('[BATCH_HANDLER] About to get client IP');
  const clientIP = getClientIP(req);
  console.log('[BATCH_HANDLER] Client IP obtained:', clientIP);

  console.log('[BATCH_HANDLER] About to get user agent');
  const userAgent = req.headers['user-agent'] || '';
  console.log('[BATCH_HANDLER] User agent obtained');

  // CRITICAL FIX: Skip rate limiting in integration test mode
  // Rate limiter uses middleware pattern (next callback) which doesn't work with mock req/res
  // UNLESS explicitly enabled via SKIP_RATE_LIMIT_IN_TESTS environment variable
  const shouldSkipRateLimit = process.env.INTEGRATION_TEST_MODE === 'true' &&
                               process.env.SKIP_RATE_LIMIT_IN_TESTS !== 'false';

  if (!shouldSkipRateLimit) {
    console.log('[BATCH_HANDLER] Applying rate limiting');
    // Apply rate limiting with early return on limit
    try {
      await new Promise((resolve, reject) => {
        limiter(req, res, (err) => (err ? reject(err) : resolve()));
      });
    } catch {
      return res.status(429).json({ error: 'Too many registration attempts' });
    }
    console.log('[BATCH_HANDLER] Rate limiting passed');
  } else {
    console.log('[BATCH_HANDLER] Skipping rate limiting in integration test mode');
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
    console.log('[BATCH_REG] About to get database client...');
    console.log('[BATCH_REG] INTEGRATION_TEST_MODE:', process.env.INTEGRATION_TEST_MODE);
    const db = await getDatabaseClient();
    console.log('[BATCH_REG] Database client obtained successfully');

    // Fetch all tickets with transaction info
    const ticketIds = sanitizedRegistrations.map(r => r.ticketId);

    console.log('[BATCH_REG] Starting batch registration for tickets:', ticketIds);
    console.log('[BATCH_REG] Request ID:', requestId);
    console.log('[BATCH_REG] Client IP:', clientIP);

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
          t.event_id,
          t.is_test,
          tx.customer_email as purchaser_email,
          e.name as event_name,
          e.venue_name,
          e.venue_city,
          e.venue_state,
          e.start_date,
          e.end_date
        FROM tickets t
        LEFT JOIN transactions tx ON t.transaction_id = tx.id
        LEFT JOIN events e ON t.event_id = e.id
        WHERE t.ticket_id IN (${ticketIds.map(() => '?').join(',')})
      `,
      args: ticketIds
    });

    // Process database result to handle BigInt values
    const processedTicketsResult = processDatabaseResult(ticketsResult);

    console.log('[BATCH_REG] Found tickets:', processedTicketsResult.rows.map(t => ({
      id: t.ticket_id,
      status: t.registration_status,
      hasAttendee: !!(t.attendee_first_name || t.attendee_email),
      attendeeName: `${t.attendee_first_name || 'NO_FIRST'} ${t.attendee_last_name || 'NO_LAST'}`,
      type: t.ticket_type
    })));

    if (processedTicketsResult.rows.length !== ticketIds.length) {
      const foundIds = processedTicketsResult.rows.map(t => t.ticket_id);
      const missingIds = ticketIds.filter(id => !foundIds.includes(id));
      return res.status(404).json({
        error: 'Some tickets not found',
        missingTickets: missingIds
      });
    }

    // Check for already registered or expired tickets
    const issues = [];
    const alreadyRegistered = [];
    const now = new Date();

    for (const ticket of processedTicketsResult.rows) {
      if (ticket.registration_status === 'completed') {
        console.log(`[BATCH_REG] WARNING: Ticket ${ticket.ticket_id} is already registered with status: ${ticket.registration_status}`);
        console.log(`[BATCH_REG] Existing attendee: ${ticket.attendee_first_name} ${ticket.attendee_last_name} (${ticket.attendee_email})`);
        alreadyRegistered.push({
          ticketId: ticket.ticket_id,
          attendeeName: `${ticket.attendee_first_name} ${ticket.attendee_last_name}`,
          attendeeEmail: ticket.attendee_email
        });
        // Don't add to issues - we'll handle gracefully below
      }

      const deadline = new Date(ticket.registration_deadline);
      if (now > deadline) {
        console.log(`[BATCH_REG] ERROR: Ticket ${ticket.ticket_id} registration deadline has passed`);
        issues.push(`Ticket ${ticket.ticket_id} registration deadline has passed`);
      }
    }

    // Only fail for expired tickets, not already registered ones
    if (issues.length > 0) {
      console.log('[BATCH_REG] Registration validation failed:', issues);
      return res.status(400).json({
        error: 'Registration validation failed',
        details: issues
      });
    }

    // If ALL tickets are already registered, return success with that info
    if (alreadyRegistered.length === ticketIds.length) {
      console.log('[BATCH_REG] All tickets already registered, returning success');

      // Get full ticket details for already registered tickets
      const registeredDetails = processedTicketsResult.rows.map(ticket => ({
        ticketId: ticket.ticket_id,
        ticketType: ticket.ticket_type,
        status: 'already_registered',
        attendee: {
          firstName: ticket.attendee_first_name,
          lastName: ticket.attendee_last_name,
          email: ticket.attendee_email
        },
        registeredAt: ticket.registered_at,
        eventName: ticket.event_name,
        eventLocation: `${ticket.venue_name}, ${ticket.venue_city}, ${ticket.venue_state}`
      }));

      return res.status(200).json({
        success: true,
        message: 'All tickets were already registered',
        alreadyRegistered: alreadyRegistered,
        registrations: registeredDetails,
        registeredTickets: registeredDetails, // Include this for frontend compatibility
        summary: {
          totalRegistered: 0,
          alreadyRegistered: alreadyRegistered.length,
          registrationDate: new Date().toISOString()
        }
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
        const ticket = processedTicketsResult.rows.find(t => t.ticket_id === registration.ticketId);
        const operationStartTime = Date.now();

        // Skip if already registered
        if (ticket.registration_status === 'completed') {
          console.log(`[BATCH_REG] Skipping already registered ticket ${ticket.ticket_id}`);
          results.push({
            ticketId: registration.ticketId,
            status: 'already_registered',
            ticketType: ticket.ticket_type,
            attendee: {
              firstName: ticket.attendee_first_name,
              lastName: ticket.attendee_last_name,
              email: ticket.attendee_email
            }
          });
          continue; // Skip to next ticket
        }

        console.log(`[BATCH_REG] Processing ticket ${registration.ticketId} (${i + 1}/${sanitizedRegistrations.length})`);

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

        // Add reminder cancellation operation (by transaction_id, not ticket_id)
        batchOperations.push({
          sql: `
            UPDATE registration_reminders
            SET status = 'cancelled'
            WHERE transaction_id = ? AND status IN ('sent', 'scheduled')
          `,
          args: [ticket.transaction_id]
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
          ticketType: ticket.ticket_type,
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
      console.log(`[BATCH_REG] Executing ${batchOperations.length} batch operations`);
      if (batchOperations.length === 0) {
        console.log('[BATCH_REG] No operations to execute (all tickets already registered)');
      } else {
        const batchResults = await db.batch(batchOperations);

        // Check that all ticket updates succeeded
        let successCount = 0;
        let actualUpdateIndex = 0;
        for (let i = 0; i < sanitizedRegistrations.length; i++) {
          const ticket = processedTicketsResult.rows.find(t => t.ticket_id === sanitizedRegistrations[i].ticketId);

          // Skip already registered tickets
          if (ticket.registration_status === 'completed') {
            continue;
          }

          // Each registration has 2 operations: ticket update and reminder cancel
          const updateResultIndex = actualUpdateIndex * 2;
          const updateResult = batchResults[updateResultIndex];
          const rowsChanged = updateResult?.rowsAffected ?? updateResult?.changes ?? 0;

          console.log(`[BATCH_REG] Update result for ${sanitizedRegistrations[i].ticketId}: ${rowsChanged} rows affected`);

          if (rowsChanged === 0) {
            console.error(`[BATCH_REG] WARNING: No rows updated for ticket ${sanitizedRegistrations[i].ticketId} - may be already registered`);
            // Don't throw error - ticket might have been registered by another process
          } else {
            successCount++;
          }
          actualUpdateIndex++;
        }

        console.log(`[BATCH_REG] Successfully updated ${successCount} tickets`);
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
      console.error('[BATCH_REG] Batch transaction failed:', error);
      console.error('[BATCH_REG] Error stack:', error.stack);
      throw error;
    }

    // SEND EMAILS OUTSIDE TRANSACTION (after successful commit)
    const emailResults = [];

    console.log('[BATCH_REG] Starting email sending phase');
    console.log('[BATCH_REG] INTEGRATION_TEST_MODE:', process.env.INTEGRATION_TEST_MODE);

    // Get transaction information for order number and purchaser details
    // IMPORTANT: Declare transactionInfo BEFORE try block to ensure scope visibility
    const transactionIds = [...new Set(processedTicketsResult.rows.map(t => t.transaction_id))];
    let transactionInfo = null;

    console.log('[BATCH_REG] Transaction IDs involved:', transactionIds);

    // Skip email sending in integration test mode to prevent timeouts
    if (process.env.INTEGRATION_TEST_MODE === 'true') {
      console.log('[BATCH_REG] Skipping email sending in integration test mode');

      // Insert mock email records into database for test verification
      for (const task of emailTasks) {
        try {
          await db.execute({
            sql: `
              INSERT INTO registration_emails (ticket_id, transaction_id, email_type, recipient_email, sent_at)
              VALUES (?, ?, ?, ?, datetime('now'))
            `,
            args: [task.registration.ticketId, task.ticket.transaction_id, 'attendee_confirmation', task.registration.email]
          });

          console.log(`[BATCH_REG] Mock email record inserted for ticket ${task.registration.ticketId}`);
          emailResults.push({
            ticketId: task.registration.ticketId,
            emailSent: true,
            mockMode: true
          });
        } catch (emailError) {
          console.error(`[BATCH_REG] Failed to insert mock email record for ${task.registration.ticketId}:`, emailError);
          emailResults.push({
            ticketId: task.registration.ticketId,
            emailSent: false,
            error: emailError.message,
            mockMode: true
          });
        }
      }
    } else {
      try {
        const brevo = getBrevoService();
        console.log('[BATCH_REG] Brevo service initialized');

      if (transactionIds.length === 1) {
        // Single transaction - get order details for summary email
        const transactionResult = await db.execute({
          sql: `SELECT id, order_number, customer_email, customer_name, total_amount, amount_cents, completed_at, created_at FROM transactions WHERE id = ?`,
          args: [transactionIds[0]]
        });

        // Process database result to handle BigInt values
        const processedTransactionResult = processDatabaseResult(transactionResult);
        if (processedTransactionResult.rows.length > 0) {
          transactionInfo = processedTransactionResult.rows[0];
        }
      }

      // Send individual confirmation emails
      console.log(`[BATCH_REG] Preparing to send ${emailTasks.length} confirmation emails`);

      for (const task of emailTasks) {
        try {
          console.log(`[BATCH_REG] Sending email for ticket ${task.registration.ticketId} to ${task.registration.email}`);

          // Determine base URL for email links
          let baseUrl;
          if (process.env.VERCEL_ENV === 'production') {
            baseUrl = "https://www.alocubanoboulderfest.org";
          } else if (process.env.VERCEL_URL) {
            baseUrl = `https://${process.env.VERCEL_URL}`;
          } else {
            baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://alocubanoboulderfest.org";
          }

          // Generate QR token for the ticket
          const { getQRTokenService } = await import('../../lib/qr-token-service.js');
          const qrService = getQRTokenService();
          const qrToken = await qrService.getOrCreateToken(task.registration.ticketId);

          // Format event date
          const eventDate = task.ticket.start_date && task.ticket.end_date
            ? `${new Date(task.ticket.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Denver' })}-${new Date(task.ticket.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' })}`
            : 'May 15-17, 2026';

          // Generate HTML email using template
          const { generateAttendeeConfirmationEmail } = await import('../../lib/email-templates/attendee-confirmation.js');
          const htmlContent = generateAttendeeConfirmationEmail({
            firstName: task.registration.firstName,
            lastName: task.registration.lastName,
            ticketId: task.ticket.ticket_id,
            ticketType: task.ticket.ticket_type,
            orderNumber: transactionInfo ? (transactionInfo.order_number || transactionInfo.id) : 'N/A',
            eventName: task.ticket.event_name,
            eventLocation: `${task.ticket.venue_name}, ${task.ticket.venue_city}, ${task.ticket.venue_state}`,
            eventDate: eventDate,
            qrCodeUrl: `${baseUrl}/api/qr/generate?token=${qrToken}`,
            walletPassUrl: `${baseUrl}/api/tickets/apple-wallet/${task.registration.ticketId}`,
            googleWalletUrl: `${baseUrl}/api/tickets/google-wallet/${task.registration.ticketId}`,
            appleWalletButtonUrl: `${baseUrl}/images/add-to-wallet-apple.png`,
            googleWalletButtonUrl: `${baseUrl}/images/add-to-wallet-google.png`
          });

          // Send email using Brevo API with custom HTML
          await brevo.makeRequest('/smtp/email', {
            method: 'POST',
            body: JSON.stringify({
              sender: {
                email: process.env.BREVO_SENDER_EMAIL || 'noreply@alocubano.com',
                name: 'A Lo Cubano Boulder Fest'
              },
              replyTo: {
                email: process.env.BREVO_REPLY_TO || 'alocubanoboulderfest@gmail.com',
                name: 'A Lo Cubano Boulder Fest'
              },
              to: [{
                email: task.registration.email,
                name: `${task.registration.firstName} ${task.registration.lastName}`
              }],
              subject: `Your ticket is ready for ${task.ticket.event_name || 'A Lo Cubano Boulder Fest'}!`,
              htmlContent: htmlContent,
              headers: {
                'X-Mailin-Tag': 'attendee-confirmation',
                'X-Ticket-ID': task.registration.ticketId,
                'X-Transaction-ID': String(task.ticket.transaction_id)
              }
            })
          });

          // Log email sent
          await db.execute({
            sql: `
              INSERT INTO registration_emails (ticket_id, transaction_id, email_type, recipient_email, sent_at)
              VALUES (?, ?, ?, ?, datetime('now'))
            `,
            args: [task.registration.ticketId, task.ticket.transaction_id, 'attendee_confirmation', task.registration.email]
          });

          console.log(`[BATCH_REG] Email sent successfully for ticket ${task.registration.ticketId}`);
          emailResults.push({
            ticketId: task.registration.ticketId,
            emailSent: true
          });
        } catch (emailError) {
          console.error(`[BATCH_REG] Failed to send email for ${task.registration.ticketId}:`, emailError);
          console.error(`[BATCH_REG] Email error details:`, emailError.message, emailError.stack);
          emailResults.push({
            ticketId: task.registration.ticketId,
            emailSent: false,
            error: emailError.message
          });
        }
      }

      // Note: Batch summary email removed - individual confirmations only

      } catch (emailServiceError) {
        console.error('[BATCH_REG] Email service error (non-blocking):', emailServiceError);
        console.error('[BATCH_REG] Email service error details:', emailServiceError.message, emailServiceError.stack);
        // Continue - registration was successful even if emails fail
      }
    }

    console.log('[BATCH_REG] Email results summary:', {
      total: emailResults.length,
      sent: emailResults.filter(e => e.emailSent).length,
      failed: emailResults.filter(e => !e.emailSent).length,
      failures: emailResults.filter(e => !e.emailSent)
    });

    // CRITICAL: Verify the tickets are actually marked as completed in the database
    console.log('[BATCH_REG] Verifying ticket status in database after registration...');
    const verifyResult = await db.execute({
      sql: `
        SELECT t.ticket_id, t.registration_status, t.attendee_first_name, t.attendee_last_name,
               t.attendee_email, t.registered_at, t.transaction_id, t.event_id, t.is_test,
               e.name as event_name, e.venue_name, e.venue_city, e.venue_state, e.start_date, e.end_date
        FROM tickets t
        LEFT JOIN events e ON t.event_id = e.id
        WHERE t.ticket_id IN (${sanitizedRegistrations.map(() => '?').join(',')})
      `,
      args: sanitizedRegistrations.map(r => r.ticketId)
    });

    // Process database result to handle BigInt values
    const processedVerifyResult = processDatabaseResult(verifyResult);

    console.log('[BATCH_REG] Database verification - tickets after registration:',
      processedVerifyResult.rows.map(t => ({
        id: t.ticket_id,
        status: t.registration_status,
        attendee: `${t.attendee_first_name} ${t.attendee_last_name}`,
        email: t.attendee_email,
        registeredAt: t.registered_at,
        transactionId: t.transaction_id
      }))
    );

    // Check for any tickets that are still pending
    const stillPending = processedVerifyResult.rows.filter(t => t.registration_status !== 'completed');
    if (stillPending.length > 0) {
      console.error('[BATCH_REG] WARNING: Some tickets are still pending after registration!', stillPending.map(t => t.ticket_id));
    } else {
      console.log('[BATCH_REG] SUCCESS: All tickets confirmed as completed in database');
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
    console.log('[BATCH_REG] Preparing final response with', results.length, 'results');
    console.log('[BATCH_REG] Final results:', results);

    res.status(200).json({
      success: true,
      message: `Successfully registered ${results.length} tickets`,
      registrations: results,
      emailStatus: emailResults,
      orderNumber: transactionInfo ? (transactionInfo.order_number || `ALO-${new Date().getFullYear()}-${String(transactionInfo.id).padStart(4, '0')}`) : null,
      registeredTickets: results.map((result) => {
        const registration = sanitizedRegistrations.find(r => r.ticketId === result.ticketId);
        const ticket = processedTicketsResult.rows.find(t => t.ticket_id === result.ticketId);
        return {
          ticketId: result.ticketId,
          ticketType: result.ticketType || ticket?.ticket_type,
          eventName: ticket?.event_name,
          eventLocation: ticket?.venue_name && ticket?.venue_city ?
            `${ticket.venue_name}, ${ticket.venue_city}, ${ticket.venue_state}` : null,
          attendeeName: result.attendee?.firstName && result.attendee?.lastName ?
            `${result.attendee.firstName} ${result.attendee.lastName}` :
            (registration ? `${registration.firstName} ${registration.lastName}` : 'Name not provided'),
          attendeeEmail: result.attendee?.email || registration?.email || 'Email not provided'
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