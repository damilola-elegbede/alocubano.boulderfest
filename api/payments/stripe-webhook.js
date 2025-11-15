/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events for payment status updates
 * Enhanced with comprehensive financial audit logging for compliance
 *
 * Supported Events:
 * - checkout.session.completed - Main success event for Checkout
 * - checkout.session.async_payment_succeeded - Delayed payment methods success
 * - checkout.session.async_payment_failed - Delayed payment methods failure
 * - checkout.session.expired - Session timeout
 * - payment_intent.succeeded - Direct Payment Intent success
 * - payment_intent.payment_failed - Payment Intent failure
 * - payment_intent.canceled - Payment Intent cancellation
 * - charge.refunded - Charge refund event
 * - charge.dispute.created - Dispute initiated
 * - payout.created - Settlement/payout to bank account
 */

import Stripe from 'stripe';
import transactionService from '../../lib/transaction-service.js';
import paymentEventLogger from '../../lib/payment-event-logger.js';
import ticketService from '../../lib/ticket-service.js';
import { getDatabaseClient } from '../../lib/database.js';
import auditService from '../../lib/audit-service.js';
import { getTicketEmailService } from '../../lib/ticket-email-service-brevo.js';
import { fulfillReservation, releaseReservation } from '../../lib/ticket-availability-service.js';
import { extractTestModeFromStripeSession } from '../../lib/test-mode-utils.js';

// Lazy initialization pattern - validate environment variables when handler is called
// This allows integration tests to import the module without errors
let stripe;
let webhookSecret;
let initialized = false;

/**
 * Ensures Stripe is initialized with proper secrets.
 * In production: Fails fast if secrets are missing.
 * In test environments: Allows fallback values for integration testing.
 * @throws {Error} If secrets are missing in production environment
 */
function ensureStripeInitialized() {
  if (initialized) return;

  // Detect test environment (integration tests or explicit test mode)
  const isTestEnv = process.env.INTEGRATION_TEST_MODE === 'true' ||
                    process.env.NODE_ENV === 'test';

  // Use environment variables or test fallbacks
  const stripeKey = process.env.STRIPE_SECRET_KEY ||
    (isTestEnv ? 'sk_test_integration_fallback_key' : null);

  const webhookKey = process.env.STRIPE_WEBHOOK_SECRET ||
    (isTestEnv ? 'whsec_integration_fallback_secret' : null);

  // Validate that secrets are present (either real or test fallbacks)
  if (!stripeKey || !webhookKey) {
    throw new Error('❌ FATAL: Stripe secrets not configured (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET required)');
  }

  // Initialize Stripe with validated secrets
  stripe = new Stripe(stripeKey);
  webhookSecret = webhookKey;
  initialized = true;

  if (isTestEnv) {
    console.log('⚠️  Stripe initialized with test fallback values (integration test mode)');
  }
}

// Note: Customer name parsing moved to ticket-creation-service.js

// Helper to log financial audit events (non-blocking)
async function logFinancialAudit(params) {
  try {
    await auditService.logFinancialEvent(params);
  } catch (auditError) {
    console.error('Financial audit logging failed (non-blocking):', auditError.message);
    // Never throw - audit failures must not break payment processing
  }
}

// Note: processUniversalRegistration has been replaced by centralized ticket-creation-service.js
// This ensures both webhook and checkout-success use the same idempotent logic

// For Vercel, we need the raw body for webhook verification
export const config = {
  api: {
    bodyParser: false
  }
};

// Helper to get raw body
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Handle Stripe webhook POST requests and process payment-, refund-, dispute-, and payout-related events.
 *
 * Verifies the Stripe signature, ensures required services are initialized, logs the raw Stripe event (idempotently),
 * and dispatches event-specific processing such as ticket creation, transaction status updates, reservation fulfillment/release,
 * and non-blocking financial audit logging. Responds with HTTP 200 when the event is acknowledged or 400 on verification/processing errors.
 *
 * @param {import('express').Request} req - Incoming HTTP request (expects raw body and `stripe-signature` header).
 * @param {import('express').Response} res - HTTP response used to acknowledge the webhook and send status codes.
 */
export default async function handler(req, res) {
  // Ensure Stripe is initialized (lazy initialization)
  ensureStripeInitialized();

  // Ensure all services are initialized to prevent race conditions
  if (auditService.ensureInitialized) {
    await auditService.ensureInitialized();
  }
  if (transactionService.ensureInitialized) {
    await transactionService.ensureInitialized();
  }
  if (paymentEventLogger.ensureInitialized) {
    await paymentEventLogger.ensureInitialized();
  }
  if (ticketService.ensureInitialized) {
    await ticketService.ensureInitialized();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    // Construct and verify the webhook event
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    console.log(`Webhook received: ${event.type}`, {
      id: event.id,
      type: event.type
    });

    // Log the event first (for idempotency)
    try {
      const logResult = await paymentEventLogger.logStripeEvent(event);

      if (logResult.status === 'already_processed') {
        console.log(`Skipping already processed event: ${event.id}`);
        return res.json({ received: true, status: 'already_processed' });
      }
    } catch (error) {
      console.error('Failed to log event:', error);
      // Continue processing even if logging fails
    }

    // Handle the event based on type
    switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // Use centralized secure detection (checks livemode flag and metadata)
      const testModeInfo = extractTestModeFromStripeSession(session);
      const isTestTransaction = testModeInfo.is_test === 1;

      console.log(`Processing ${isTestTransaction ? 'TEST ' : ''}checkout.session.completed for ${session.id}`);

      try {
        // Find existing transaction by Stripe session ID
        const db = await getDatabaseClient();
        const txResult = await db.execute({
          sql: 'SELECT * FROM transactions WHERE stripe_session_id = ? LIMIT 1',
          args: [session.id]
        });

        if (!txResult.rows || txResult.rows.length === 0) {
          console.error('Transaction not found for session:', session.id);
          await paymentEventLogger.logError(event, new Error('Transaction not found'));
          return res.json({ received: true, status: 'transaction_not_found' });
        }

        const transaction = txResult.rows[0];
        console.log(`Webhook: Found transaction ${transaction.uuid} for session ${session.id}`);

        // Update transaction payment_status and status to completed
        await db.execute({
          sql: `UPDATE transactions
                SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: ['completed', 'completed', transaction.id]
        });

        // Update all tickets for this transaction to completed status
        const ticketUpdateResult = await db.execute({
          sql: `UPDATE tickets
                SET registration_status = ?, registered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = ? AND registration_status = ?`,
          args: ['completed', transaction.id, 'pending_payment']
        });

        console.log(`Webhook: Updated ${ticketUpdateResult.rowsAffected || 0} tickets to completed status`);

        // Update event logger with transaction ID (non-blocking)
        paymentEventLogger.updateEventTransactionId(event.id, transaction.id)
          .catch(error => {
            console.error('Event logger transaction ID update failed (non-blocking):', error.message);
          });

        // Fulfill reservation - mark as completed (fire-and-forget)
        fulfillReservation(session.id, transaction.id)
          .then(() => {
            console.log(`✅ Reservation fulfilled for session: ${session.id}`);
          })
          .catch(fulfillError => {
            console.error(`❌ Reservation fulfillment failed for session: ${session.id}`, fulfillError);
          });

        // Send attendee confirmation emails
        try {
          const emailService = getTicketEmailService();
          const updatedTransaction = await transactionService.getByUUID(transaction.uuid);
          await emailService.sendTicketConfirmation(updatedTransaction);
          console.log(`Webhook: Sent confirmation emails for transaction ${transaction.uuid}`);
        } catch (emailError) {
          console.error('Webhook: Failed to send confirmation emails:', emailError);
          // Don't fail webhook - emails can be resent
        }

        // Log financial audit for successful payment
        await logFinancialAudit({
          requestId: `stripe_${event.id}`,
          action: isTestTransaction ? 'TEST_PAYMENT_SUCCESSFUL' : 'PAYMENT_SUCCESSFUL',
          amountCents: session.amount_total,
          currency: session.currency?.toUpperCase() || 'USD',
          transactionReference: transaction.uuid,
          paymentStatus: 'completed',
          targetType: 'stripe_session',
          targetId: session.id,
          metadata: {
            stripe_event_id: event.id,
            stripe_session_id: session.id,
            payment_intent_id: session.payment_intent,
            customer_email: session.customer_details?.email,
            customer_name: session.customer_details?.name,
            payment_method_types: session.payment_method_types,
            mode: session.mode,
            test_mode: isTestTransaction,
            test_transaction: isTestTransaction
          },
          severity: isTestTransaction ? 'debug' : 'info'
        });

        // Return success
        return res.json({ received: true, status: 'completed' });

      } catch (error) {
        console.error('Failed to process checkout session:', error);
        await paymentEventLogger.logError(event, error);
        // Don't throw - we've logged the error, let Stripe retry if needed
      }

      break;
    }

    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      // Use centralized secure detection (checks livemode flag and metadata)
      const testModeInfo = extractTestModeFromStripeSession(session);
      const isTestTransaction = testModeInfo.is_test === 1;

      console.log(`${isTestTransaction ? 'TEST ' : ''}Async payment succeeded for session:`, session.id);

      // Process similar to checkout.session.completed
      try {
        // Find existing transaction by Stripe session ID
        const db = await getDatabaseClient();
        const txResult = await db.execute({
          sql: 'SELECT * FROM transactions WHERE stripe_session_id = ? LIMIT 1',
          args: [session.id]
        });

        if (!txResult.rows || txResult.rows.length === 0) {
          console.error('Transaction not found for async payment session:', session.id);
          await paymentEventLogger.logError(event, new Error('Transaction not found'));
          return res.json({ received: true, status: 'transaction_not_found' });
        }

        const transaction = txResult.rows[0];
        console.log(`Async payment: Found transaction ${transaction.uuid} for session ${session.id}`);

        // Update transaction to completed
        await db.execute({
          sql: `UPDATE transactions
                SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: ['completed', 'completed', transaction.id]
        });

        // Update all tickets to completed
        await db.execute({
          sql: `UPDATE tickets
                SET registration_status = ?, registered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = ? AND registration_status = ?`,
          args: ['completed', transaction.id, 'pending_payment']
        });

        // Send confirmation emails
        try {
          const emailService = getTicketEmailService();
          const updatedTransaction = await transactionService.getByUUID(transaction.uuid);
          await emailService.sendTicketConfirmation(updatedTransaction);
          console.log(`Async payment: Sent confirmation emails for transaction ${transaction.uuid}`);
        } catch (emailError) {
          console.error('Async payment: Failed to send confirmation emails:', emailError);
        }

        // Log financial audit for async payment success
        await logFinancialAudit({
          requestId: `stripe_${event.id}`,
          action: isTestTransaction ? 'TEST_ASYNC_PAYMENT_SUCCESSFUL' : 'ASYNC_PAYMENT_SUCCESSFUL',
          amountCents: session.amount_total,
          currency: session.currency?.toUpperCase() || 'USD',
          transactionReference: transaction.uuid,
          paymentStatus: 'completed',
          targetType: 'stripe_session',
          targetId: session.id,
          metadata: {
            stripe_event_id: event.id,
            stripe_session_id: session.id,
            payment_intent_id: session.payment_intent,
            customer_email: session.customer_details?.email,
            customer_name: session.customer_details?.name,
            payment_method_types: session.payment_method_types,
            mode: session.mode,
            async_payment: true,
            test_mode: isTestTransaction,
            test_transaction: isTestTransaction
          },
          severity: isTestTransaction ? 'debug' : 'info'
        });
      } catch (error) {
        console.error('Failed to process async payment:', error);
        await paymentEventLogger.logError(event, error);
      }

      break;
    }

    case 'checkout.session.async_payment_failed': {
      const session = event.data.object;
      console.log('Async payment failed for session:', session.id);

      // Update transaction status if it exists
      try {
        const transaction = await transactionService.getByStripeSessionId(
          session.id
        );
        if (transaction) {
          await transactionService.updateStatus(transaction.uuid, 'failed');

          // Log financial audit for payment failure
          await logFinancialAudit({
            requestId: `stripe_${event.id}`,
            action: 'ASYNC_PAYMENT_FAILED',
            amountCents: session.amount_total || 0,
            currency: session.currency?.toUpperCase() || 'USD',
            transactionReference: transaction.uuid,
            paymentStatus: 'failed',
            targetType: 'stripe_session',
            targetId: session.id,
            metadata: {
              stripe_event_id: event.id,
              stripe_session_id: session.id,
              payment_intent_id: session.payment_intent,
              failure_reason: 'async_payment_failed',
              async_payment: true
            },
            severity: 'warning'
          });
        }
      } catch (error) {
        console.error(
          'Failed to update transaction status for async_payment_failed:',
          error
        );
        // Don't throw - let webhook succeed to prevent Stripe retries
      }

      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      console.log(`Checkout session expired: ${session.id}`);

      // Release reservation - tickets are no longer held
      try {
        await releaseReservation(session.id);

        // Also release temp session ID if it exists in metadata
        const tempSessionId = session.metadata?.tempSessionId;
        if (tempSessionId) {
          await releaseReservation(tempSessionId);
        }
      } catch (releaseError) {
        // Non-critical - log but continue
        console.warn('Failed to release reservation (non-critical):', releaseError.message);
      }

      // Update transaction status if it exists
      try {
        const transaction = await transactionService.getByStripeSessionId(
          session.id
        );
        if (transaction) {
          await transactionService.updateStatus(
            transaction.uuid,
            'cancelled'
          );
        }
      } catch (error) {
        console.error(
          'Failed to update transaction status for session.expired:',
          error
        );
        // Don't throw - let webhook succeed to prevent Stripe retries
      }

      break;
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      console.log(`Payment succeeded: ${paymentIntent.id}`);

      // Event already logged at line 70

      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      console.log(`Payment failed: ${paymentIntent.id}`);

      // Update transaction status if it exists
      try {
        const transaction = await transactionService.getByPaymentIntentId(
          paymentIntent.id
        );

        if (transaction) {
          await transactionService.updateStatus(transaction.uuid, 'failed');

          // Log financial audit for payment failure
          await logFinancialAudit({
            requestId: `stripe_${event.id}`,
            action: 'PAYMENT_FAILED',
            amountCents: paymentIntent.amount || 0,
            currency: paymentIntent.currency?.toUpperCase() || 'USD',
            transactionReference: transaction.uuid,
            paymentStatus: 'failed',
            targetType: 'payment_intent',
            targetId: paymentIntent.id,
            metadata: {
              stripe_event_id: event.id,
              payment_intent_id: paymentIntent.id,
              failure_code: paymentIntent.last_payment_error?.code,
              failure_message: paymentIntent.last_payment_error?.message,
              failure_type: paymentIntent.last_payment_error?.type,
              payment_method_id: paymentIntent.payment_method,
              client_secret: paymentIntent.client_secret ? '[REDACTED]' : null,
              confirmation_method: paymentIntent.confirmation_method
            },
            severity: 'warning'
          });
        }
      } catch (error) {
        console.error(
          'Failed to update transaction status for payment_intent.payment_failed:',
          error
        );
        // Don't throw - let webhook succeed to prevent Stripe retries
      }

      // Event already logged at line 70

      break;
    }

    case 'payment_intent.canceled': {
      const paymentIntent = event.data.object;
      console.log('Payment intent canceled:', paymentIntent.id);

      // Update transaction status if it exists
      try {
        const transaction = await transactionService.getByPaymentIntentId(
          paymentIntent.id
        );

        if (transaction) {
          await transactionService.updateStatus(
            transaction.uuid,
            'cancelled'
          );
        }
      } catch (error) {
        console.error(
          'Failed to update transaction status for payment_intent.canceled:',
          error
        );
        // Don't throw - let webhook succeed to prevent Stripe retries
      }

      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      console.log(`Charge refunded: ${charge.id}`);

      // Update transaction status based on payment intent
      if (charge.payment_intent) {
        try {
          const transaction = await transactionService.getByPaymentIntentId(
            charge.payment_intent
          );

          if (transaction) {
            const isFullRefund = charge.amount_refunded === charge.amount;
            const status = isFullRefund ? 'refunded' : 'partially_refunded';
            await transactionService.updateStatus(transaction.uuid, status);

            // Log comprehensive refund audit
            await logFinancialAudit({
              requestId: `stripe_${event.id}`,
              action: isFullRefund ? 'REFUND_FULL' : 'REFUND_PARTIAL',
              amountCents: charge.amount_refunded || 0,
              currency: charge.currency?.toUpperCase() || 'USD',
              transactionReference: transaction.uuid,
              paymentStatus: status,
              targetType: 'charge',
              targetId: charge.id,
              metadata: {
                stripe_event_id: event.id,
                charge_id: charge.id,
                payment_intent_id: charge.payment_intent,
                original_amount_cents: charge.amount,
                refunded_amount_cents: charge.amount_refunded,
                refund_count: charge.refunds?.data?.length || 0,
                refund_reason: charge.refunds?.data?.[0]?.reason || 'unknown',
                refund_status: charge.refunds?.data?.[0]?.status || 'unknown',
                refund_id: charge.refunds?.data?.[0]?.id,
                is_full_refund: isFullRefund,
                balance_transaction_id: charge.balance_transaction,
                receipt_url: charge.receipt_url,
                customer_id: charge.customer
              },
              severity: 'warning'
            });
          }
        } catch (error) {
          console.error(
            'Failed to update transaction status for charge.refunded:',
            error
          );
          // Don't throw - let webhook succeed to prevent Stripe retries
        }
      }

      // Event already logged at line 70

      break;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object;
      console.log(`Dispute created: ${dispute.id} for charge ${dispute.charge}`);

      // Log financial audit for dispute creation
      try {
        // Try to find associated transaction via charge payment intent
        let transaction = null;
        try {
          const charge = await stripe.charges.retrieve(dispute.charge);
          if (charge.payment_intent) {
            transaction = await transactionService.getByPaymentIntentId(
              charge.payment_intent
            );
          }
        } catch (chargeError) {
          console.error('Failed to retrieve charge for dispute:', chargeError.message);
        }

        await logFinancialAudit({
          requestId: `stripe_${event.id}`,
          action: 'DISPUTE_CREATED',
          amountCents: dispute.amount || 0,
          currency: dispute.currency?.toUpperCase() || 'USD',
          transactionReference: transaction?.uuid || null,
          paymentStatus: 'disputed',
          targetType: 'dispute',
          targetId: dispute.id,
          metadata: {
            stripe_event_id: event.id,
            dispute_id: dispute.id,
            charge_id: dispute.charge,
            dispute_reason: dispute.reason,
            dispute_status: dispute.status,
            evidence_due_by: dispute.evidence_details?.due_by,
            evidence_has_evidence: dispute.evidence_details?.has_evidence,
            evidence_submission_count: dispute.evidence_details?.submission_count,
            is_charge_refundable: dispute.is_charge_refundable,
            network_reason_code: dispute.network_reason_code,
            created_timestamp: dispute.created
          },
          severity: 'error'
        });
      } catch (error) {
        console.error('Failed to process dispute audit logging:', error.message);
        // Don't throw - let webhook succeed to prevent Stripe retries
      }

      break;
    }

    case 'payout.created': {
      const payout = event.data.object;
      console.log(`Payout created: ${payout.id} for ${payout.amount / 100} ${payout.currency}`);

      // Log financial audit for settlement/payout
      try {
        await logFinancialAudit({
          requestId: `stripe_${event.id}`,
          action: 'SETTLEMENT_PAYOUT',
          amountCents: payout.amount || 0,
          currency: payout.currency?.toUpperCase() || 'USD',
          transactionReference: null, // Payouts don't map to specific transactions
          paymentStatus: payout.status,
          targetType: 'payout',
          targetId: payout.id,
          metadata: {
            stripe_event_id: event.id,
            payout_id: payout.id,
            payout_type: payout.type,
            payout_method: payout.method,
            payout_status: payout.status,
            arrival_date: payout.arrival_date,
            automatic: payout.automatic,
            balance_transaction_id: payout.balance_transaction,
            destination_bank_account: payout.destination ? '[REDACTED]' : null,
            failure_code: payout.failure_code,
            failure_message: payout.failure_message,
            statement_descriptor: payout.statement_descriptor,
            source_type: payout.source_type
          },
          severity: 'info'
        });
      } catch (error) {
        console.error('Failed to process payout audit logging:', error.message);
        // Don't throw - let webhook succeed to prevent Stripe retries
      }

      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
      // Event already logged at line 70
    }

    // Return a response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);

    // Try to log the error
    if (event) {
      await paymentEventLogger.logError(event, err);
    }

    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
}
