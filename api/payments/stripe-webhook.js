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
import transactionService from "../../lib/transaction-service.js";
import paymentEventLogger from "../../lib/payment-event-logger.js";
import ticketService from "../../lib/ticket-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import auditService from "../../lib/audit-service.js";
import { createOrRetrieveTickets } from "../../lib/ticket-creation-service.js";

// Initialize Stripe with strict error handling
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('❌ FATAL: STRIPE_SECRET_KEY secret not configured');
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error('❌ FATAL: STRIPE_WEBHOOK_SECRET secret not configured');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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

export default async function handler(req, res) {
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
      const isTestTransaction = session.metadata?.testMode === 'true' ||
                               session.metadata?.testTransaction === 'true' ||
                               session.id?.includes('test');

      console.log(`Processing ${isTestTransaction ? 'TEST ' : ''}checkout.session.completed for ${session.id}`);

      try {
        // Expand the session to get line items
        const fullSession = await stripe.checkout.sessions.retrieve(
          session.id,
          {
            expand: ['line_items', 'line_items.data.price.product']
          }
        );

        // Use centralized ticket creation service for idempotency
        try {
          const result = await createOrRetrieveTickets(fullSession);
          const transaction = result.transaction;

          console.log(`Webhook: Transaction ${result.created ? 'created' : 'already exists'}: ${transaction.uuid}`);
          console.log(`Webhook: ${result.ticketCount} tickets ${result.created ? 'created' : 'found'}`);

          // Update the payment event with transaction ID
          await paymentEventLogger.updateEventTransactionId(
            event.id,
            transaction.id
          );

          // Log financial audit for successful payment
          await logFinancialAudit({
            requestId: `stripe_${event.id}`,
            action: isTestTransaction ? 'TEST_PAYMENT_SUCCESSFUL' : 'PAYMENT_SUCCESSFUL',
            amountCents: fullSession.amount_total,
            currency: fullSession.currency?.toUpperCase() || 'USD',
            transactionReference: transaction.uuid,
            paymentStatus: 'completed',
            targetType: 'stripe_session',
            targetId: session.id,
            metadata: {
              stripe_event_id: event.id,
              stripe_session_id: session.id,
              payment_intent_id: fullSession.payment_intent,
              customer_email: fullSession.customer_details?.email,
              customer_name: fullSession.customer_details?.name,
              payment_method_types: fullSession.payment_method_types,
              mode: fullSession.mode,
              line_items_count: fullSession.line_items?.data?.length || 0,
              checkout_url: fullSession.url,
              test_mode: isTestTransaction,
              test_transaction: isTestTransaction,
              tickets_created: result.created,
              ticket_count: result.ticketCount
            },
            severity: isTestTransaction ? 'debug' : 'info'
          });

          // Return success - tickets were created or already existed
          return res.json({ received: true, status: result.created ? 'created' : 'already_exists' });

        } catch (ticketError) {
          console.error('Webhook: Failed to process checkout:', ticketError);
          await paymentEventLogger.logError(event, ticketError);
          throw ticketError; // Let top-level catch return non-2xx for retry
        }
      } catch (error) {
        console.error('Failed to process checkout session:', error);
        await paymentEventLogger.logError(event, error);
        // Don't throw - we've logged the error, let Stripe retry if needed
      }

      break;
    }

    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      const isTestTransaction = session.metadata?.testMode === 'true' ||
                               session.metadata?.testTransaction === 'true' ||
                               session.id?.includes('test');

      console.log(`${isTestTransaction ? 'TEST ' : ''}Async payment succeeded for session:`, session.id);

      // Process similar to checkout.session.completed
      try {
        const fullSession = await stripe.checkout.sessions.retrieve(
          session.id,
          {
            expand: ['line_items', 'line_items.data.price.product']
          }
        );

        // Use centralized ticket creation service for async payments too
        try {
          const result = await createOrRetrieveTickets(fullSession);
          const transaction = result.transaction;

          console.log(`Async payment: Transaction ${result.created ? 'created' : 'already exists'}: ${transaction.uuid}`);
          console.log(`Async payment: ${result.ticketCount} tickets ${result.created ? 'created' : 'found'}`);

          // Log financial audit for async payment success
          await logFinancialAudit({
            requestId: `stripe_${event.id}`,
            action: isTestTransaction ? 'TEST_ASYNC_PAYMENT_SUCCESSFUL' : 'ASYNC_PAYMENT_SUCCESSFUL',
            amountCents: fullSession.amount_total,
            currency: fullSession.currency?.toUpperCase() || 'USD',
            transactionReference: transaction.uuid,
            paymentStatus: 'completed',
            targetType: 'stripe_session',
            targetId: session.id,
            metadata: {
              stripe_event_id: event.id,
              stripe_session_id: session.id,
              payment_intent_id: fullSession.payment_intent,
              customer_email: fullSession.customer_details?.email,
              customer_name: fullSession.customer_details?.name,
              payment_method_types: fullSession.payment_method_types,
              mode: fullSession.mode,
              async_payment: true,
              test_mode: isTestTransaction,
              test_transaction: isTestTransaction,
              tickets_created: result.created,
              ticket_count: result.ticketCount
            },
            severity: isTestTransaction ? 'debug' : 'info'
          });
        } catch (ticketError) {
          console.error('Failed to process async payment:', ticketError);
          await paymentEventLogger.logError(event, ticketError);
          throw ticketError; // Let top-level catch return non-2xx for retry
        }
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
