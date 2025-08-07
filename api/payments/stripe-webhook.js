/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events for payment status updates
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
 */

import Stripe from "stripe";
import transactionService from '../lib/transaction-service.js';
import paymentEventLogger from '../lib/payment-event-logger.js';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// For Vercel, we need the raw body for webhook verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to get raw body
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers["stripe-signature"];

    // Construct and verify the webhook event
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } else {
      // For testing without webhook secret
      event = JSON.parse(rawBody.toString());
    }

    console.log(`Webhook received: ${event.type}`, {
      id: event.id,
      type: event.type,
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
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log(`Processing checkout.session.completed for ${session.id}`);
        
        try {
          // Expand the session to get line items
          const fullSession = await stripe.checkout.sessions.retrieve(
            session.id,
            {
              expand: ['line_items', 'line_items.data.price.product']
            }
          );
          
          // Check if transaction already exists (idempotency)
          const existingTransaction = await transactionService.getByStripeSessionId(session.id);
          
          if (existingTransaction) {
            console.log(`Transaction already exists for session ${session.id}`);
            return res.json({ received: true, status: 'already_exists' });
          }
          
          // Create transaction record
          const transaction = await transactionService.createFromStripeSession(fullSession);
          console.log(`Created transaction: ${transaction.uuid}`);
          
          // Update the payment event with transaction ID
          await paymentEventLogger.updateEventTransactionId(event.id, transaction.id);
          
          // TODO: In Phase 3, we'll create tickets here
          // TODO: In Phase 4, we'll generate QR codes here
          
        } catch (error) {
          console.error('Failed to process checkout session:', error);
          await paymentEventLogger.logError(event, error);
          // Don't throw - we've logged the error, let Stripe retry if needed
        }
        
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        console.log("Async payment succeeded for session:", session.id);
        
        // Process similar to checkout.session.completed
        try {
          const fullSession = await stripe.checkout.sessions.retrieve(
            session.id,
            {
              expand: ['line_items', 'line_items.data.price.product']
            }
          );
          
          const existingTransaction = await transactionService.getByStripeSessionId(session.id);
          if (!existingTransaction) {
            const transaction = await transactionService.createFromStripeSession(fullSession);
            console.log(`Created transaction from async payment: ${transaction.uuid}`);
          }
        } catch (error) {
          console.error('Failed to process async payment:', error);
          await paymentEventLogger.logError(event, error);
        }
        
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        console.log("Async payment failed for session:", session.id);
        
        // Update transaction status if it exists
        try {
          const transaction = await transactionService.getByStripeSessionId(session.id);
          if (transaction) {
            await transactionService.updateStatus(transaction.uuid, 'failed');
          }
        } catch (error) {
          console.error('Failed to update transaction status for async_payment_failed:', error);
          // Don't throw - let webhook succeed to prevent Stripe retries
        }
        
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        console.log(`Checkout session expired: ${session.id}`);
        
        // Update transaction status if it exists
        try {
          const transaction = await transactionService.getByStripeSessionId(session.id);
          if (transaction) {
            await transactionService.updateStatus(transaction.uuid, 'cancelled');
          }
        } catch (error) {
          console.error('Failed to update transaction status for session.expired:', error);
          // Don't throw - let webhook succeed to prevent Stripe retries
        }
        
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        console.log(`Payment succeeded: ${paymentIntent.id}`);
        
        // Event already logged at line 70
        
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        console.log(`Payment failed: ${paymentIntent.id}`);
        
        // Update transaction status if it exists
        try {
          const transaction = await transactionService.getByPaymentIntentId(paymentIntent.id);
          
          if (transaction) {
            await transactionService.updateStatus(transaction.uuid, 'failed');
          }
        } catch (error) {
          console.error('Failed to update transaction status for payment_intent.payment_failed:', error);
          // Don't throw - let webhook succeed to prevent Stripe retries
        }
        
        // Event already logged at line 70
        
        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object;
        console.log("Payment intent canceled:", paymentIntent.id);
        
        // Update transaction status if it exists
        try {
          const transaction = await transactionService.getByPaymentIntentId(paymentIntent.id);
          
          if (transaction) {
            await transactionService.updateStatus(transaction.uuid, 'cancelled');
          }
        } catch (error) {
          console.error('Failed to update transaction status for payment_intent.canceled:', error);
          // Don't throw - let webhook succeed to prevent Stripe retries
        }
        
        break;
      }
      
      case "charge.refunded": {
        const charge = event.data.object;
        console.log(`Charge refunded: ${charge.id}`);
        
        // Update transaction status based on payment intent
        if (charge.payment_intent) {
          try {
            const transaction = await transactionService.getByPaymentIntentId(charge.payment_intent);
            
            if (transaction) {
              const status = charge.amount_refunded === charge.amount ? 'refunded' : 'partially_refunded';
              await transactionService.updateStatus(transaction.uuid, status);
            }
          } catch (error) {
            console.error('Failed to update transaction status for charge.refunded:', error);
            // Don't throw - let webhook succeed to prevent Stripe retries
          }
        }
        
        // Event already logged at line 70
        
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
        // Event already logged at line 70
    }

    // Return a response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    
    // Try to log the error
    if (event) {
      await paymentEventLogger.logError(event, err);
    }
    
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
}