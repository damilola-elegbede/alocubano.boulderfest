/**
 * Centralized Ticket Creation Service
 * Handles ticket creation with idempotency for both webhook and checkout-success
 */

import { getDatabaseClient } from "./database.js";
import { generateTicketId } from "./ticket-id-generator.js";
import { generateOrderId } from "./order-id-generator.js";
import transactionService from "./transaction-service.js";
import { RegistrationTokenService } from "./registration-token-service.js";
import { scheduleRegistrationReminders } from "./reminder-scheduler.js";
import { getTicketEmailService } from "./ticket-email-service-brevo.js";

/**
 * Parse Stripe's single name field into first and last name
 */
function parseCustomerName(stripeCustomerName) {
  if (!stripeCustomerName) {
    return { firstName: 'Guest', lastName: 'Attendee' };
  }

  const parts = stripeCustomerName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  } else if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  } else {
    // Multiple parts - everything except last is first name
    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(' ');
    return { firstName, lastName };
  }
}

/**
 * Idempotently create or retrieve a transaction and its tickets for a Stripe session.
 *
 * If a transaction for the given Stripe session already exists, this function will
 * optionally update its payment method details, return existing tickets if present,
 * or create tickets for the existing transaction when none exist. If no transaction
 * exists, it creates a new transaction (propagating optional payment method data)
 * and creates tickets for it.
 *
 * @param {object} fullSession - The Stripe Checkout Session object (must include `id` and relevant line item/metadata fields).
 * @param {object|null} [paymentMethodData=null] - Optional payment method details extracted from Stripe (may include `card_brand`, `card_last4`, `payment_wallet`).
 * @returns {{transaction: object, ticketCount: number, created: boolean}} An object containing the transaction, the number of tickets present or created, and `created` which is `true` when tickets were created during this call and `false` when existing tickets were returned.
 */
export async function createOrRetrieveTickets(fullSession, paymentMethodData = null) {
  const db = await getDatabaseClient();

  try {
    // Check if transaction already exists
    let existingTransaction = await transactionService.getByStripeSessionId(fullSession.id);

    if (existingTransaction) {
      console.log(`Transaction already exists for session ${fullSession.id}`);

      // Update payment method details if provided and transaction exists
      if (paymentMethodData && (paymentMethodData.card_brand || paymentMethodData.card_last4)) {
        await db.execute({
          sql: `UPDATE transactions
                SET card_brand = ?, card_last4 = ?, payment_wallet = ?, payment_processor = 'stripe'
                WHERE id = ?`,
          args: [
            paymentMethodData.card_brand,
            paymentMethodData.card_last4,
            paymentMethodData.payment_wallet,
            existingTransaction.id
          ]
        });
        console.log('Updated payment method details for existing transaction');
      }

      // Check if tickets exist for this transaction (single query for both check and data)
      const ticketsResult = await db.execute({
        sql: `SELECT ticket_id, ticket_type FROM tickets WHERE transaction_id = ?`,
        args: [existingTransaction.id]
      });

      const ticketCount = ticketsResult.rows ? ticketsResult.rows.length : 0;

      if (ticketCount > 0) {
        console.log(`${ticketCount} tickets already exist for transaction ${existingTransaction.uuid}`);

        return {
          transaction: existingTransaction,
          ticketCount: ticketCount,
          created: false
        };
      }

      // Transaction exists but no tickets - create tickets
      console.log(`Transaction exists but no tickets found - creating tickets...`);
      const ticketResult = await createTicketsForTransaction(fullSession, existingTransaction);
      return {
        transaction: existingTransaction,
        ticketCount: ticketResult.ticketCount,
        created: true
      };
    }

    // No transaction exists - create both transaction and tickets
    console.log(`Creating new transaction and tickets for session ${fullSession.id}`);

    // Create transaction
    const transaction = await transactionService.createFromStripeSession(fullSession, paymentMethodData);
    console.log(`Created transaction: ${transaction.uuid}`);

    // Create tickets
    const ticketResult = await createTicketsForTransaction(fullSession, transaction);

    return {
      transaction,
      ticketCount: ticketResult.ticketCount,
      created: true
    };

  } catch (error) {
    console.error('Failed to create or retrieve tickets:', error);
    throw error;
  }
}

/**
 * Create tickets for an existing transaction
 * Internal function - checks for existing tickets first
 */
async function createTicketsForTransaction(fullSession, transaction) {
  const db = await getDatabaseClient();

  // Double-check tickets don't already exist (race condition protection)
  const existingTickets = await db.execute({
    sql: `SELECT ticket_id, ticket_type FROM tickets WHERE transaction_id = ?`,
    args: [transaction.id]
  });

  if (existingTickets.rows && existingTickets.rows.length > 0) {
    console.log(`Tickets already exist for transaction ${transaction.uuid} (race condition avoided)`);
    return {
      ticketCount: existingTickets.rows.length,
      created: false
    };
  }

  // Check if this is a test transaction
  const isTestTransaction = fullSession.metadata?.testMode === 'true' ||
                           fullSession.metadata?.testTransaction === 'true' ||
                           fullSession.id?.includes('test');

  // Parse customer name for default values
  const { firstName, lastName } = parseCustomerName(
    fullSession.customer_details?.name || 'Guest'
  );

  const now = new Date();

  // Prepare batch operations for atomic ticket creation
  const batchOperations = [];
  const tickets = [];
  const lineItems = fullSession.line_items?.data || [];
  let registrationDeadline = null; // Track deadline for transaction-level reminder scheduling

  for (const item of lineItems) {
    const quantity = item.quantity || 1;

    // Extract ticket type from Stripe metadata - NO SILENT DEFAULTS
    const product = item.price?.product;
    const meta = product?.metadata || {};

    // Skip donations - they don't need tickets
    if (meta.type === 'donation' || meta.donation_category) {
      console.log(`Skipping donation item: ${item.description || 'Donation'}`);
      continue;
    }

    // Try multiple sources for ticket type, but FAIL if none found
    const ticketType =
      meta.ticket_type ||                    // Primary source: product metadata
      item.price?.lookup_key ||              // Fallback: configured price lookup key
      item.price?.nickname;                  // Legacy: price nickname

    if (!ticketType) {
      console.error('CRITICAL: No ticket type found for line item:', {
        item_id: item.id,
        price_id: item.price?.id,
        product_id: product?.id,
        metadata: meta,
        description: item.description
      });
      throw new Error(`Ticket type missing from Stripe data for item: ${item.description || 'Unknown'}`);
    }

    const priceInCents = item.amount_total || 0;

    // No defaults - require explicit values
    const eventId = meta.event_id;
    if (!eventId) {
      console.error('CRITICAL: No event ID found for line item:', {
        item_id: item.id,
        product_id: product?.id,
        metadata: meta,
        description: item.description,
        ticketType: ticketType
      });
      throw new Error(`Event ID missing from Stripe data for item: ${item.description || 'Unknown'}`);
    }

    const eventDate = meta.event_date;
    if (!eventDate) {
      console.error('CRITICAL: No event date found for line item:', {
        item_id: item.id,
        product_id: product?.id,
        metadata: meta,
        description: item.description
      });
      throw new Error(`Event date missing from Stripe data for item: ${item.description || 'Unknown'}`);
    }

    // =============================================================================
    // CRITICAL SECURITY: Validate Stripe metadata against database
    // =============================================================================
    // Attack Vector: Attacker manipulates Stripe session metadata to purchase
    // invalid/expired/sold-out tickets at incorrect prices
    //
    // Defense: Re-validate all Stripe metadata against authoritative database state
    // =============================================================================

    let validationFailed = false;
    const validationErrors = [];
    let ticketTypeRecord = null;

    try {
      // Validation 1: Verify ticket type exists in database
      const ticketTypeResult = await db.execute({
        sql: `SELECT tt.*, e.status as event_status, e.name as event_name
              FROM ticket_types tt
              LEFT JOIN events e ON tt.event_id = e.id
              WHERE tt.id = ?`,
        args: [ticketType]
      });

      if (!ticketTypeResult.rows || ticketTypeResult.rows.length === 0) {
        validationErrors.push(`Ticket type '${ticketType}' does not exist in database`);
        validationFailed = true;
        console.error('SECURITY ALERT: Invalid ticket type in Stripe metadata:', {
          ticket_type: ticketType,
          stripe_session_id: fullSession.id,
          line_item_id: item.id
        });
      } else {
        ticketTypeRecord = ticketTypeResult.rows[0];

        // Validation 2: Verify ticket type status is available or test
        if (ticketTypeRecord.status !== 'available' && ticketTypeRecord.status !== 'test') {
          validationErrors.push(`Ticket type '${ticketType}' has invalid status: ${ticketTypeRecord.status}`);
          validationFailed = true;
          console.error('SECURITY ALERT: Ticket type not available:', {
            ticket_type: ticketType,
            status: ticketTypeRecord.status,
            stripe_session_id: fullSession.id
          });
        }

        // Validation 3: Verify event exists and is active or test
        if (!ticketTypeRecord.event_status || !['active', 'test'].includes(ticketTypeRecord.event_status)) {
          validationErrors.push(`Event for ticket type '${ticketType}' is not active or test: ${ticketTypeRecord.event_status || 'null'}`);
          validationFailed = true;
          console.error('SECURITY ALERT: Event not active or test:', {
            ticket_type: ticketType,
            event_id: eventId,
            event_status: ticketTypeRecord.event_status,
            stripe_session_id: fullSession.id
          });
        }

        // Validation 4: Verify event_id matches (convert BigInt to Number for comparison)
        if (Number(ticketTypeRecord.event_id) !== parseInt(eventId, 10)) {
          validationErrors.push(`Event ID mismatch: expected ${ticketTypeRecord.event_id}, got ${eventId}`);
          validationFailed = true;
          console.error('SECURITY ALERT: Event ID mismatch in metadata:', {
            ticket_type: ticketType,
            expected_event_id: Number(ticketTypeRecord.event_id),
            provided_event_id: eventId,
            stripe_session_id: fullSession.id
          });
        }

        // Validation 5: Verify quantity doesn't exceed max_quantity
        if (ticketTypeRecord.max_quantity && ticketTypeRecord.max_quantity > 0) {
          const availableQuantity = ticketTypeRecord.max_quantity - (ticketTypeRecord.sold_count || 0);
          if (quantity > availableQuantity) {
            validationErrors.push(`Insufficient quantity: requested ${quantity}, only ${availableQuantity} available`);
            validationFailed = true;
            console.error('SECURITY ALERT: Quantity exceeds availability:', {
              ticket_type: ticketType,
              requested_quantity: quantity,
              max_quantity: ticketTypeRecord.max_quantity,
              sold_count: ticketTypeRecord.sold_count,
              available_quantity: availableQuantity,
              stripe_session_id: fullSession.id
            });
          }
        }

        // Validation 6: Verify price matches (allow test transactions to bypass)
        if (!isTestTransaction) {
          const expectedPriceCents = ticketTypeRecord.price_cents * quantity;
          // Allow 1% variance for rounding or currency conversion
          const priceVariance = Math.abs(priceInCents - expectedPriceCents) / expectedPriceCents;
          if (priceVariance > 0.01) {
            validationErrors.push(`Price mismatch: expected ${expectedPriceCents} cents, got ${priceInCents} cents`);
            validationFailed = true;
            console.error('SECURITY ALERT: Price mismatch detected:', {
              ticket_type: ticketType,
              expected_price_cents: expectedPriceCents,
              actual_price_cents: priceInCents,
              variance_percent: (priceVariance * 100).toFixed(2),
              stripe_session_id: fullSession.id
            });
          }
        }
      }

      // Log security audit event for validation attempt
      const auditService = (await import('./audit-service.js')).default;
      await auditService.logDataChange({
        action: validationFailed ? 'WEBHOOK_METADATA_VALIDATION_FAILED' : 'WEBHOOK_METADATA_VALIDATION_PASSED',
        targetType: 'stripe_webhook_validation',
        targetId: fullSession.id,
        metadata: {
          ticket_type: ticketType,
          quantity: quantity,
          price_cents: priceInCents,
          event_id: eventId,
          validation_errors: validationErrors,
          ticket_type_record: ticketTypeRecord ? {
            status: ticketTypeRecord.status,
            event_status: ticketTypeRecord.event_status,
            max_quantity: ticketTypeRecord.max_quantity,
            sold_count: ticketTypeRecord.sold_count
          } : null,
          stripe_session_id: fullSession.id,
          is_test_transaction: isTestTransaction
        },
        severity: validationFailed ? 'critical' : 'info'
      });

      // If validation failed, trigger security alert
      if (validationFailed) {
        const securityAlertService = (await import('./security-alert-service.js')).default;
        await securityAlertService.triggerAlert({
          alertType: 'webhook_metadata_tampering',
          severity: 'critical',
          title: 'Stripe Webhook Metadata Tampering Detected',
          description: `Stripe session metadata validation failed: ${validationErrors.join('; ')}`,
          evidence: {
            stripe_session_id: fullSession.id,
            ticket_type: ticketType,
            quantity: quantity,
            price_cents: priceInCents,
            event_id: eventId,
            validation_errors: validationErrors,
            customer_email: fullSession.customer_details?.email,
            line_item_id: item.id
          },
          indicators: ['metadata_tampering', 'potential_fraud', 'price_manipulation'],
          correlationId: fullSession.id,
          affectedResources: [
            { type: 'stripe_session', id: fullSession.id },
            { type: 'ticket_type', id: ticketType },
            { type: 'transaction', id: transaction.uuid }
          ]
        });

        console.error('CRITICAL SECURITY WARNING: Creating tickets with FLAGGED_FOR_REVIEW status due to validation failure');
      }

    } catch (validationError) {
      console.error('CRITICAL: Validation check failed with error:', validationError);
      validationErrors.push(`Validation system error: ${validationError.message}`);
      validationFailed = true;

      // Log validation system failure
      const auditService = (await import('./audit-service.js')).default;
      await auditService.logDataChange({
        action: 'WEBHOOK_METADATA_VALIDATION_ERROR',
        targetType: 'stripe_webhook_validation',
        targetId: fullSession.id,
        metadata: {
          error: validationError.message,
          ticket_type: ticketType,
          stripe_session_id: fullSession.id
        },
        severity: 'error'
      });
    }

    // Calculate registration deadline: 1 week before event date
    // Store at transaction level (all tickets in transaction have same deadline)
    const eventDateObj = new Date(eventDate);
    const standardDeadline = new Date(eventDateObj.getTime() - (7 * 24 * 60 * 60 * 1000));

    // Calculate time until event for intelligent deadline fallback
    const hoursUntilEvent = (eventDateObj.getTime() - now.getTime()) / (1000 * 60 * 60);

    let registrationDeadline;
    let deadlineReason;

    if (standardDeadline > now) {
      // Standard case: Use 7-day-before deadline
      registrationDeadline = standardDeadline;
      deadlineReason = 'standard (7 days before event)';
    } else if (hoursUntilEvent > 72) {
      // Edge case 1: Event is 3-7 days away → 72-hour deadline
      // Allows: immediate (1hr), 24hr-post-purchase reminders
      registrationDeadline = new Date(now.getTime() + (72 * 60 * 60 * 1000));
      deadlineReason = 'late-purchase (72 hours from purchase)';
      console.warn(
        `Late purchase detected: Event ${eventDate} is ${hoursUntilEvent.toFixed(1)} hours away. ` +
        `Using 72-hour deadline to allow reminder scheduling.`
      );
    } else if (hoursUntilEvent > 24) {
      // Edge case 2: Event is 1-3 days away → Half the remaining time (minimum 24 hours)
      // Ensures customers have reasonable time to register while maximizing reminder coverage
      const hoursUntilDeadline = Math.max(24, Math.floor(hoursUntilEvent / 2));
      registrationDeadline = new Date(now.getTime() + (hoursUntilDeadline * 60 * 60 * 1000));
      deadlineReason = `very-late-purchase (${hoursUntilDeadline} hours from purchase, half of ${hoursUntilEvent.toFixed(1)}hr remaining)`;
      console.warn(
        `Very late purchase: Event ${eventDate} is ${hoursUntilEvent.toFixed(1)} hours away. ` +
        `Using ${hoursUntilDeadline}-hour deadline (half of remaining time).`
      );
    } else {
      // Edge case 3: Event is < 24 hours → 12-hour deadline (minimum viable)
      // At this point, we're in emergency mode - give them at least some time
      registrationDeadline = new Date(now.getTime() + (12 * 60 * 60 * 1000));
      deadlineReason = `emergency (12 hours from purchase, event in ${hoursUntilEvent.toFixed(1)}hr)`;
      console.warn(
        `Emergency purchase: Event ${eventDate} is only ${hoursUntilEvent.toFixed(1)} hours away! ` +
        `Using 12-hour deadline (minimum viable).`
      );
    }

    console.log(
      `Registration deadline calculation:`,
      {
        eventDate: eventDateObj.toISOString(),
        hoursUntilEvent: hoursUntilEvent.toFixed(1),
        standardDeadline: standardDeadline.toISOString(),
        actualDeadline: registrationDeadline.toISOString(),
        reason: deadlineReason
      }
    );

    // Calculate cent-accurate price distribution
    const perTicketBase = Math.floor(priceInCents / quantity);
    const remainder = priceInCents % quantity;

    for (let i = 0; i < quantity; i++) {
      // Distribute remainder cents across first tickets
      const priceForThisTicket = perTicketBase + (i < remainder ? 1 : 0);
      const ticketId = await generateTicketId();

      // Determine ticket status based on validation
      // If validation failed, mark ticket as 'flagged_for_review' instead of 'valid'
      // This allows payment to complete but flags suspicious tickets for admin review
      const ticketStatus = validationFailed ? 'flagged_for_review' : 'valid';

      // Build metadata object to store validation information
      const ticketMetadata = {
        validation: {
          passed: !validationFailed,
          errors: validationFailed ? validationErrors : [],
          timestamp: now.toISOString(),
          stripe_session_id: fullSession.id
        }
      };

      // Add ticket creation operation to batch
      batchOperations.push({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
          event_date, price_cents,
          attendee_first_name, attendee_last_name,
          registration_status, registration_deadline,
          status, created_at, is_test, ticket_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ticketId,
          transaction.id,
          ticketType,  // No TEST- prefix - already handled by admin dashboard
          ticketType,  // ticket_type_id uses same value (ticket_types.id is TEXT)
          eventId,
          eventDate,
          priceForThisTicket,
          isTestTransaction ? `TEST-${firstName}` : firstName,
          isTestTransaction ? `TEST-${lastName}` : lastName,
          'pending', // All tickets start pending
          registrationDeadline.toISOString(),
          ticketStatus, // 'valid' or 'flagged_for_review'
          now.toISOString(),
          isTestTransaction ? 1 : 0,
          JSON.stringify(ticketMetadata)
        ]
      });

      tickets.push({
        id: ticketId,
        type: ticketType,
        ticket_id: ticketId
      });
    }
  }

  // Execute all ticket creation operations atomically
  console.log(`Executing ${batchOperations.length} atomic ticket creation operations...`);
  await db.batch(batchOperations);
  console.log(`Batch operations completed successfully for transaction ${transaction.uuid}`);

  // Post-creation side effects (best-effort, non-blocking)
  try {
    // Generate registration token if missing
    if (!transaction.registration_token) {
      const tokenService = new RegistrationTokenService();
      await tokenService.ensureInitialized();
      const token = await tokenService.createToken(transaction.id);
      transaction.registration_token = token;
      console.log(`Generated registration token for transaction ${transaction.uuid}`);
    }

    // Send ticket confirmation email
    const ticketEmailService = getTicketEmailService();
    await ticketEmailService.sendTicketConfirmation(transaction);
    console.log(`Sent ticket confirmation email for transaction ${transaction.uuid}`);

    // Schedule reminders for the transaction (one email to purchaser about all tickets)
    if (registrationDeadline) {
      console.log(`Scheduling reminders for transaction ${transaction.id} with ${tickets.length} tickets`);
      const reminderCount = await scheduleRegistrationReminders(
        transaction.id,
        registrationDeadline,
        isTestTransaction
      );
      console.log(`Scheduled ${reminderCount} reminders for transaction ${transaction.id} (isTest: ${isTestTransaction})`);

      // Alert if no reminders were scheduled
      if (reminderCount === 0) {
        console.warn(
          `⚠️ ALERT: No reminders scheduled for transaction ${transaction.id}. ` +
          `Customer will not receive registration notifications! ` +
          `Deadline: ${registrationDeadline.toISOString()}, IsTest: ${isTestTransaction}`
        );
      }
    } else {
      console.warn(`No registration deadline set for transaction ${transaction.id}, skipping reminder scheduling`);
    }

  } catch (sideEffectError) {
    console.error('Non-critical side effect failed:', sideEffectError);
    // Continue - tickets are created successfully
  }

  console.log(`${isTestTransaction ? 'TEST ' : ''}${tickets.length} tickets created for transaction ${transaction.uuid}`);

  return {
    transaction,
    ticketCount: tickets.length,
    isTestTransaction,
    created: true
  };
}

export default {
  createOrRetrieveTickets
};