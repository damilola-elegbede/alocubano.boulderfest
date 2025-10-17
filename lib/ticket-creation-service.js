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
import { extractTestModeFromStripeSession } from "./test-mode-utils.js";

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
  // Use centralized secure detection (checks livemode flag and metadata)
  const testModeInfo = extractTestModeFromStripeSession(fullSession);
  const isTestTransaction = testModeInfo.is_test === 1 ||
                           process.env.INTEGRATION_TEST_MODE === 'true';

  // Parse customer name for default values
  const { firstName, lastName } = parseCustomerName(
    fullSession.customer_details?.name || 'Guest'
  );

  const now = new Date();

  // Parse and validate max_scan_count with NaN protection
  const parsedMaxScanEnv = Number.parseInt(process.env.QR_CODE_MAX_SCANS ?? "", 10);
  const maxScanCount = Number.isFinite(parsedMaxScanEnv) && parsedMaxScanEnv >= 0
    ? parsedMaxScanEnv
    : 3;

  // Prepare batch operations for atomic ticket creation
  const batchOperations = [];
  const tickets = [];
  const lineItems = fullSession.line_items?.data || [];
  const deadlineTracker = new Map(); // Track unique deadlines per event date for reminder scheduling

  // Migration 042/043: Track sold_count updates to prepend before ticket inserts
  // Group by ticket_type_id to aggregate quantities
  const soldCountUpdates = new Map();

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
    //
    // FALSE POSITIVE MITIGATION:
    // - Delayed webhook detection: Relaxes validation for webhooks >5min delayed
    // - Type-safe event ID comparison: Handles empty strings and type mismatches
    // - Increased price tolerance: 2% variance for multi-item rounding
    // =============================================================================

    let validationFailed = false;
    const validationErrors = [];
    const validationWarnings = []; // Non-critical issues for monitoring
    let ticketTypeRecord = null;

    // =============================================================================
    // WEBHOOK TIMING ANALYSIS - Detect delayed webhooks to prevent false positives
    // =============================================================================
    const sessionCreatedAt = new Date(fullSession.created * 1000);
    const validationTime = new Date();
    const webhookDelaySeconds = (validationTime - sessionCreatedAt) / 1000;
    const isDelayedWebhook = webhookDelaySeconds > 300; // 5 minutes threshold

    if (isDelayedWebhook) {
      console.warn(`⚠️ Delayed webhook detected: ${webhookDelaySeconds.toFixed(0)}s delay (threshold: 300s)`, {
        stripe_session_id: fullSession.id,
        created_at: sessionCreatedAt.toISOString(),
        validation_at: validationTime.toISOString(),
        delay_seconds: webhookDelaySeconds,
        mitigation: 'Using lenient validation rules to prevent false positives'
      });
      validationWarnings.push(`Delayed webhook: ${webhookDelaySeconds.toFixed(0)}s delay (using lenient validation)`);
    }

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
          line_item_id: item.id,
          webhook_delay_seconds: webhookDelaySeconds
        });
      } else {
        ticketTypeRecord = ticketTypeResult.rows[0];

        // Validation 2: Verify ticket type status is available or test
        // MITIGATION: Skip if delayed webhook (status may have legitimately changed)
        if (!isDelayedWebhook) {
          if (ticketTypeRecord.status !== 'available' && ticketTypeRecord.status !== 'test') {
            validationErrors.push(`Ticket type '${ticketType}' has invalid status: ${ticketTypeRecord.status}`);
            validationFailed = true;
            console.error('SECURITY ALERT: Ticket type not available:', {
              ticket_type: ticketType,
              status: ticketTypeRecord.status,
              stripe_session_id: fullSession.id,
              webhook_delay_seconds: webhookDelaySeconds
            });
          }
        } else {
          console.log(`⏭️  Skipping ticket status validation due to delayed webhook (${webhookDelaySeconds.toFixed(0)}s)`, {
            ticket_type: ticketType,
            current_status: ticketTypeRecord.status,
            reason: 'Status may have changed legitimately after checkout'
          });
          validationWarnings.push(`Skipped ticket status check (delayed webhook)`);
        }

        // Validation 3: Verify event exists and is active or test
        // MITIGATION: Skip if delayed webhook (status may have legitimately changed)
        if (!isDelayedWebhook) {
          if (!ticketTypeRecord.event_status || !['active', 'test'].includes(ticketTypeRecord.event_status)) {
            validationErrors.push(`Event for ticket type '${ticketType}' is not active or test: ${ticketTypeRecord.event_status || 'null'}`);
            validationFailed = true;
            console.error('SECURITY ALERT: Event not active or test:', {
              ticket_type: ticketType,
              event_id: eventId,
              event_status: ticketTypeRecord.event_status,
              stripe_session_id: fullSession.id,
              webhook_delay_seconds: webhookDelaySeconds
            });
          }
        } else {
          console.log(`⏭️  Skipping event status validation due to delayed webhook (${webhookDelaySeconds.toFixed(0)}s)`, {
            ticket_type: ticketType,
            current_event_status: ticketTypeRecord.event_status,
            reason: 'Event status may have changed legitimately after checkout'
          });
          validationWarnings.push(`Skipped event status check (delayed webhook)`);
        }

        // Validation 4: Verify event_id matches with TYPE-SAFE comparison
        // FIX: Handle empty strings, NaN, and type mismatches properly
        const dbEventId = Number(ticketTypeRecord.event_id);
        const stripeEventId = eventId ? parseInt(eventId, 10) : null;

        // Only fail if both are valid numbers and don't match
        if (stripeEventId !== null && !isNaN(stripeEventId) && !isNaN(dbEventId)) {
          if (dbEventId !== stripeEventId) {
            validationErrors.push(`Event ID mismatch: expected ${dbEventId}, got ${stripeEventId}`);
            validationFailed = true;
            console.error('SECURITY ALERT: Event ID mismatch in metadata:', {
              ticket_type: ticketType,
              expected_event_id: dbEventId,
              provided_event_id: stripeEventId,
              stripe_session_id: fullSession.id,
              webhook_delay_seconds: webhookDelaySeconds,
              raw_values: {
                db_raw: ticketTypeRecord.event_id,
                stripe_raw: eventId
              }
            });
          } else {
            console.log(`✓ Event ID validation passed: ${dbEventId} === ${stripeEventId}`);
          }
        } else if (!stripeEventId || isNaN(stripeEventId)) {
          // Log warning but don't fail - event_id might be optional for some tickets
          console.warn('⚠️  Event ID missing or invalid in Stripe metadata (non-critical):', {
            ticket_type: ticketType,
            provided_event_id: eventId,
            parsed_value: stripeEventId,
            stripe_session_id: fullSession.id
          });
          validationWarnings.push(`Event ID missing or invalid in Stripe: '${eventId}' (non-critical)`);
        }

        // Validation 5: Verify quantity doesn't exceed max_quantity
        // MITIGATION: Skip if delayed webhook (sold_count may have changed due to concurrent purchases)
        if (!isDelayedWebhook && ticketTypeRecord.max_quantity && ticketTypeRecord.max_quantity > 0) {
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
              stripe_session_id: fullSession.id,
              webhook_delay_seconds: webhookDelaySeconds
            });
          } else {
            console.log(`✓ Quantity validation passed: ${quantity} <= ${availableQuantity} available`);
          }
        } else if (isDelayedWebhook) {
          console.log(`⏭️  Skipping quantity validation due to delayed webhook (${webhookDelaySeconds.toFixed(0)}s)`, {
            ticket_type: ticketType,
            requested_quantity: quantity,
            current_sold_count: ticketTypeRecord.sold_count,
            max_quantity: ticketTypeRecord.max_quantity,
            reason: 'Sold count may have changed due to concurrent purchases'
          });
          validationWarnings.push(`Skipped quantity check (delayed webhook)`);
        }

        // Validation 6: Verify price matches (allow test transactions to bypass)
        // FIX: Increased tolerance from 1% to 2% for multi-item rounding edge cases
        if (!isTestTransaction) {
          const expectedPriceCents = ticketTypeRecord.price_cents * quantity;
          const priceVariance = Math.abs(priceInCents - expectedPriceCents) / expectedPriceCents;
          const priceVariancePercent = (priceVariance * 100).toFixed(2);
          const tolerancePercent = 2.0; // Increased from 1% to 2%

          if (priceVariance > (tolerancePercent / 100)) {
            validationErrors.push(`Price mismatch: expected ${expectedPriceCents} cents, got ${priceInCents} cents (${priceVariancePercent}% variance exceeds ${tolerancePercent}% tolerance)`);
            validationFailed = true;
            console.error('SECURITY ALERT: Price mismatch detected:', {
              ticket_type: ticketType,
              expected_price_cents: expectedPriceCents,
              actual_price_cents: priceInCents,
              variance_percent: priceVariancePercent,
              tolerance_percent: tolerancePercent,
              stripe_session_id: fullSession.id,
              webhook_delay_seconds: webhookDelaySeconds
            });
          } else {
            console.log(`✓ Price validation passed: ${priceInCents} cents (${priceVariancePercent}% variance within ${tolerancePercent}% tolerance)`);
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
          validation_warnings: validationWarnings,
          webhook_timing: {
            created_at: sessionCreatedAt.toISOString(),
            validated_at: validationTime.toISOString(),
            delay_seconds: webhookDelaySeconds,
            is_delayed: isDelayedWebhook,
            lenient_validation_applied: isDelayedWebhook
          },
          ticket_type_record: ticketTypeRecord ? {
            status: ticketTypeRecord.status,
            event_status: ticketTypeRecord.event_status,
            max_quantity: ticketTypeRecord.max_quantity,
            sold_count: ticketTypeRecord.sold_count,
            price_cents: ticketTypeRecord.price_cents,
            event_id: ticketTypeRecord.event_id
          } : null,
          stripe_session_id: fullSession.id,
          is_test_transaction: isTestTransaction
        },
        severity: validationFailed ? 'critical' : 'info'
      });

      // If validation failed, trigger security alert
      if (validationFailed) {
        const securityAlertService = (await import('./security-alert-service.js')).default;
        // CRITICAL: Must await triggerAlert to ensure alert is written before test queries
        await securityAlertService.ensureInitialized();
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
            validation_warnings: validationWarnings,
            webhook_timing: {
              delay_seconds: webhookDelaySeconds,
              is_delayed: isDelayedWebhook,
              lenient_validation_applied: isDelayedWebhook
            },
            // Redact PII: store masked email
            customer_email_masked: (() => {
              const e = fullSession.customer_details?.email || '';
              const [user, domain] = e.split('@');
              return user ? `${user.slice(0, 2)}***@${domain || ''}` : '';
            })(),
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

        console.error('CRITICAL SECURITY WARNING: Creating tickets with FLAGGED_FOR_REVIEW status due to validation failure', {
          webhook_delay: webhookDelaySeconds,
          lenient_validation: isDelayedWebhook,
          errors: validationErrors,
          warnings: validationWarnings
        });
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

    // Calculate registration deadline using AUTHORITATIVE database event_date
    // Changed from 7 days to 24 hours before event (per-ticket, not per-transaction)
    const authoritativeEventDate = ticketTypeRecord?.event_date || eventDate;
    const authoritativeEventTime = ticketTypeRecord?.event_time || '00:00';
    const [eh, em] = authoritativeEventTime.split(':').map(Number);
    const hours = Number.isFinite(eh) ? eh : 0;
    const minutes = Number.isFinite(em) ? em : 0;
    const isoString = `${authoritativeEventDate}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    const eventDateObj = new Date(isoString);
    const standardDeadline = new Date(eventDateObj.getTime() - (24 * 60 * 60 * 1000)); // 24 hours before

    // Calculate time until event for intelligent deadline fallback
    const hoursUntilEvent = (eventDateObj.getTime() - now.getTime()) / (1000 * 60 * 60);

    let registrationDeadline;
    let deadlineReason;

    if (standardDeadline > now) {
      // Standard case: Use 24-hour-before deadline
      registrationDeadline = standardDeadline;
      deadlineReason = 'standard (24 hours before event)';
    } else if (hoursUntilEvent > 12) {
      // Edge case 1: Event is 12-24 hours away → Give them until 1 hour before event
      registrationDeadline = new Date(eventDateObj.getTime() - (1 * 60 * 60 * 1000));
      deadlineReason = 'late-purchase (1 hour before event)';
      console.warn(
        `Late purchase detected: Event ${authoritativeEventDate} is ${hoursUntilEvent.toFixed(1)} hours away. ` +
        `Using 1-hour-before deadline to allow registration.`
      );
    } else if (hoursUntilEvent > 6) {
      // Edge case 2: Event is 6-12 hours away → Half the remaining time (minimum 30 minutes before)
      const hoursUntilDeadline = Math.max(0.5, hoursUntilEvent / 2);
      registrationDeadline = new Date(now.getTime() + (hoursUntilDeadline * 60 * 60 * 1000));
      deadlineReason = `very-late-purchase (${hoursUntilDeadline.toFixed(1)}hr from now, event in ${hoursUntilEvent.toFixed(1)}hr)`;
      console.warn(
        `Very late purchase: Event ${authoritativeEventDate} is ${hoursUntilEvent.toFixed(1)} hours away. ` +
        `Using ${hoursUntilDeadline.toFixed(1)}-hour deadline.`
      );
    } else {
      // Edge case 3: Event is < 6 hours → 30 minutes from now OR event_time - 15min (whichever is longer)
      const emergencyDeadline1 = new Date(now.getTime() + (30 * 60 * 1000)); // 30 min from now
      const emergencyDeadline2 = new Date(eventDateObj.getTime() - (15 * 60 * 1000)); // 15 min before event
      registrationDeadline = emergencyDeadline1 > emergencyDeadline2 ? emergencyDeadline1 : emergencyDeadline2;
      deadlineReason = `emergency (event in ${hoursUntilEvent.toFixed(1)}hr, deadline in ${((registrationDeadline.getTime() - now.getTime()) / (1000 * 60)).toFixed(0)}min)`;
      console.warn(
        `Emergency purchase: Event ${authoritativeEventDate} is only ${hoursUntilEvent.toFixed(1)} hours away! ` +
        `Using emergency deadline.`
      );
    }

    // Track this deadline for reminder scheduling (group by unique deadline timestamps)
    const deadlineKey = registrationDeadline.toISOString();
    if (!deadlineTracker.has(deadlineKey)) {
      deadlineTracker.set(deadlineKey, {
        deadline: registrationDeadline,
        eventDate: authoritativeEventDate,
        ticketCount: 0
      });
    }
    deadlineTracker.get(deadlineKey).ticketCount += quantity;

    console.log(
      `Registration deadline for ${ticketType}:`,
      {
        eventDate: eventDateObj.toISOString(),
        hoursUntilEvent: hoursUntilEvent.toFixed(1),
        standardDeadline: standardDeadline.toISOString(),
        actualDeadline: registrationDeadline.toISOString(),
        reason: deadlineReason,
        source: 'database (authoritative)'
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
          warnings: validationWarnings, // Non-critical validation warnings for monitoring
          timestamp: now.toISOString(),
          stripe_session_id: fullSession.id,
          webhook_timing: {
            delay_seconds: webhookDelaySeconds,
            is_delayed: isDelayedWebhook,
            lenient_validation_applied: isDelayedWebhook
          }
        }
      };

      // Use event_date and event_time from validated ticket_type record (authoritative source)
      const ticketEventDate = ticketTypeRecord?.event_date || eventDate;
      const ticketEventTime = ticketTypeRecord?.event_time || '00:00';

      // Add ticket creation operation to batch
      batchOperations.push({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
          event_date, event_time, price_cents,
          attendee_first_name, attendee_last_name,
          registration_status, registration_deadline,
          status, created_at, is_test, max_scan_count, ticket_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ticketId,
          transaction.id,
          ticketType,  // No TEST- prefix - already handled by admin dashboard
          ticketType,  // ticket_type_id uses same value (ticket_types.id is TEXT)
          eventId,
          ticketEventDate,
          ticketEventTime,
          priceForThisTicket,
          isTestTransaction ? `TEST-${firstName}` : firstName,
          isTestTransaction ? `TEST-${lastName}` : lastName,
          'pending', // All tickets start pending
          registrationDeadline.toISOString(),
          ticketStatus, // 'valid' or 'flagged_for_review'
          now.toISOString(),
          isTestTransaction ? 1 : 0,
          maxScanCount,
          JSON.stringify(ticketMetadata)
        ]
      });

      tickets.push({
        id: ticketId,
        type: ticketType,
        ticket_id: ticketId
      });
    }

    // Migration 042/043: Track sold_count updates by ticket type
    // Aggregate quantities for batch update
    const currentCount = soldCountUpdates.get(ticketType) || { quantity: 0, isTest: isTestTransaction };
    soldCountUpdates.set(ticketType, {
      quantity: currentCount.quantity + quantity,
      isTest: isTestTransaction
    });
  }

  // Migration 042/043: Prepend sold_count updates BEFORE ticket inserts
  // This ensures atomic counter updates without triggers
  const finalBatchOperations = [];

  for (const [ticketTypeId, updateInfo] of soldCountUpdates) {
    const columnToUpdate = updateInfo.isTest ? 'test_sold_count' : 'sold_count';

    finalBatchOperations.push({
      sql: `UPDATE ticket_types
            SET ${columnToUpdate} = ${columnToUpdate} + ?
            WHERE id = ?
              AND (${columnToUpdate} + ? <= max_quantity OR max_quantity IS NULL)`,
      args: [updateInfo.quantity, ticketTypeId, updateInfo.quantity]
    });

    console.log(
      `Queued ${columnToUpdate} update for ${ticketTypeId}: +${updateInfo.quantity} ` +
      `(${updateInfo.isTest ? 'TEST' : 'PRODUCTION'})`
    );
  }

  // Append ticket insert operations after sold_count updates
  finalBatchOperations.push(...batchOperations);

  // Execute all operations atomically (sold_count updates + ticket inserts)
  console.log(`Executing ${finalBatchOperations.length} atomic operations (${soldCountUpdates.size} sold_count updates + ${batchOperations.length} ticket inserts)...`);
  await db.batch(finalBatchOperations);
  console.log(`Batch operations completed successfully for transaction ${transaction.uuid}`);

  // Post-creation side effects (awaitable, serverless-safe)
  // CRITICAL: Must await in serverless environments to prevent function termination before completion
  const sideEffectsPromise = (async () => {
    let sideEffectStep = 'unknown';
    try {
      // Generate registration token if missing
      sideEffectStep = 'registration_token_generation';
      if (!transaction.registration_token) {
        const tokenService = new RegistrationTokenService();
        await tokenService.ensureInitialized();
        const token = await tokenService.createToken(transaction.id);
        transaction.registration_token = token;
        console.log(`Generated registration token for transaction ${transaction.uuid}`);
      }

      // Send ticket confirmation email (independent error handling)
      try {
        sideEffectStep = 'email_sending';
        console.log(`📧 [TicketCreation] About to send ticket confirmation email for transaction ${transaction.uuid}`);
        const ticketEmailService = getTicketEmailService();
        await ticketEmailService.sendTicketConfirmation(transaction);
        console.log(`✅ [TicketCreation] Sent ticket confirmation email for transaction ${transaction.uuid}`);
      } catch (emailError) {
        console.error('❌ [TicketCreation] Email sending failed, but continuing with reminder scheduling:', {
          transactionId: transaction.uuid,
          transactionInternalId: transaction.id,
          customerEmail: transaction.customer_email,
          error: emailError.message,
          stack: emailError.stack,
          errorName: emailError.name
        });
        console.error('🚨 [TicketCreation] EMAIL SENDING FAILED - Customer will not receive order confirmation!', {
          transactionId: transaction.uuid,
          customerEmail: transaction.customer_email,
          ticketCount: tickets.length,
          action: 'Manual email may be required'
        });
        // Continue - don't prevent reminder scheduling due to email failure
      }

      // Schedule reminders for each unique deadline (independent error handling)
      try {
        sideEffectStep = 'reminder_scheduling';
        if (deadlineTracker.size > 0) {
          console.log(`Scheduling reminders for transaction ${transaction.id} with ${deadlineTracker.size} unique deadline(s)`);
          let totalRemindersScheduled = 0;

          for (const [deadlineKey, deadlineInfo] of deadlineTracker) {
            const reminderCount = await scheduleRegistrationReminders(
              transaction.id,
              deadlineInfo.deadline,
              isTestTransaction
            );
            totalRemindersScheduled += reminderCount;
            console.log(
              `Scheduled ${reminderCount} reminders for deadline ${deadlineInfo.deadline.toISOString()} ` +
              `(${deadlineInfo.ticketCount} tickets, isTest: ${isTestTransaction})`
            );

            // Alert if no reminders were scheduled for this deadline
            if (reminderCount === 0) {
              console.warn(
                `⚠️ ALERT: No reminders scheduled for deadline ${deadlineInfo.deadline.toISOString()}. ` +
                `Customer will not receive registration notifications for ${deadlineInfo.ticketCount} ticket(s)! ` +
                `Event: ${deadlineInfo.eventDate}, IsTest: ${isTestTransaction}`
              );
            }
          }

          console.log(`Total reminders scheduled for transaction ${transaction.id}: ${totalRemindersScheduled}`);
        } else {
          console.warn(`No registration deadlines tracked for transaction ${transaction.id}, skipping reminder scheduling`);
        }
      } catch (reminderError) {
        console.error('❌ [TicketCreation] Reminder scheduling failed:', {
          transactionId: transaction.uuid,
          transactionInternalId: transaction.id,
          customerEmail: transaction.customer_email,
          error: reminderError.message,
          stack: reminderError.stack,
          errorName: reminderError.name
        });
        console.error('⚠️ [TicketCreation] REMINDER SCHEDULING FAILED - Customer will not receive registration reminders', {
          transactionId: transaction.uuid,
          customerEmail: transaction.customer_email
        });
        // Continue - tickets are created successfully, but reminder scheduling failed
      }
    } catch (sideEffectError) {
      // Handle errors from side effects (token generation, email, reminders)
      console.error('❌ [TicketCreation] Side effect processing failed:', {
        step: sideEffectStep,
        transactionId: transaction.uuid,
        transactionInternalId: transaction.id,
        error: sideEffectError.message,
        stack: sideEffectError.stack
      });
      // Continue - tickets are already created successfully
      console.warn('⚠️ [TicketCreation] Continuing despite side effect failure - tickets are created');
    }
  })();

  // Await side effects to ensure completion before function exits (serverless-safe)
  try {
    await sideEffectsPromise;
  } catch (sideEffectError) {
    // Side effects already logged their own errors, just log final failure
    console.error('Side effects failed (non-critical - tickets already created):', {
      error: sideEffectError.message,
      transactionId: transaction.uuid
    });
    // Continue - tickets are created, side effect failure is logged
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
