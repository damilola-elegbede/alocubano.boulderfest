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
import transactionService from "../lib/transaction-service.js";
import paymentEventLogger from "../lib/payment-event-logger.js";
import ticketService from "../lib/ticket-service.js";
import { getTicketEmailService } from "../lib/ticket-email-service-brevo.js";
import { RegistrationTokenService } from "../lib/registration-token-service.js";
import { generateTicketId } from "../lib/ticket-id-generator.js";
import { scheduleRegistrationReminders } from "../lib/reminder-scheduler.js";
import { getDatabaseClient } from "../lib/database.js";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Helper to parse Stripe's single name field into first and last name
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

// Helper to process universal registration flow for all tickets
// This encapsulates the complete registration logic to avoid duplication
async function processUniversalRegistration(fullSession, transaction) {
  const db = await getDatabaseClient();
  const tokenService = new RegistrationTokenService();
  const ticketEmailService = getTicketEmailService();
  
  let committed = false;
  const ticketsToSchedule = []; // Track tickets for post-commit reminder scheduling
  
  try {
    // Start transaction
    await db.execute('BEGIN IMMEDIATE');
    
    // Parse customer name for default values
    const { firstName, lastName } = parseCustomerName(
      fullSession.customer_details?.name || 'Guest'
    );
    
    // Calculate registration deadline (72 hours from now)
    const now = new Date();
    const registrationDeadline = new Date(now.getTime() + (72 * 60 * 60 * 1000));
    
    // Create tickets with pending registration status
    const tickets = [];
    const lineItems = fullSession.line_items?.data || [];
    
    for (const item of lineItems) {
      const quantity = item.quantity || 1;
      const ticketType = item.price?.lookup_key || item.price?.nickname || 'general';
      const priceInCents = item.amount_total || 0;
      
      // Extract event metadata from product or use defaults
      const product = item.price?.product;
      const meta = product?.metadata || {};
      const eventId = meta.event_id || process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
      const eventDate = meta.event_date || process.env.DEFAULT_EVENT_DATE || '2026-05-15';
      
      // Calculate cent-accurate price distribution
      const perTicketBase = Math.floor(priceInCents / quantity);
      const remainder = priceInCents % quantity;
      
      for (let i = 0; i < quantity; i++) {
        // Distribute remainder cents across first tickets
        const priceForThisTicket = perTicketBase + (i < remainder ? 1 : 0);
        const ticketId = await generateTicketId();
        
        // Create ticket with pending registration
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, event_id,
            event_date, price_cents,
            attendee_first_name, attendee_last_name,
            registration_status, registration_deadline,
            status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            ticketId,
            transaction.id,
            ticketType,
            eventId,
            eventDate,
            priceForThisTicket, // Preserves total cents across all tickets
            firstName, // Default first name from purchaser
            lastName,  // Default last name from purchaser
            'pending', // All tickets start pending
            registrationDeadline.toISOString(),
            'valid',
            now.toISOString()
          ]
        });
        
        // Defer scheduling reminders until after COMMIT
        ticketsToSchedule.push({ ticketId, registrationDeadline });
        
        tickets.push({
          id: ticketId,
          type: ticketType,
          ticket_id: ticketId
        });
      }
    }
    
    // Commit DB work before external side effects
    await db.execute('COMMIT');
    committed = true;
    
    // Post-commit side effects (best-effort, non-transactional)
    // 1) Generate registration token (uses its own DB client)
    const registrationToken = await tokenService.createToken(transaction.id);
    
    // 2) Send registration invitation email
    await ticketEmailService.sendRegistrationInvitation({
      transactionId: transaction.uuid,
      customerEmail: fullSession.customer_details?.email,
      customerName: fullSession.customer_details?.name || 'Guest',
      ticketCount: tickets.length,
      registrationToken,
      registrationDeadline,
      tickets
    });
    
    // 3) Log email sent (best-effort)
    if (tickets.length && fullSession.customer_details?.email) {
      await db.execute({
        sql: `INSERT INTO registration_emails (
          ticket_id, transaction_id, email_type, 
          recipient_email, sent_at
        ) VALUES (?, ?, ?, ?, ?)`,
        args: [
          tickets[0].id, // Associate with first ticket
          transaction.id,
          'registration_invitation',
          fullSession.customer_details?.email,
          now.toISOString()
        ]
      });
    }
    
    // 4) Schedule reminders for each ticket
    for (const { ticketId, registrationDeadline } of ticketsToSchedule) {
      await scheduleRegistrationReminders(ticketId, registrationDeadline);
    }
    
    console.log(`Universal registration initiated for transaction ${transaction.uuid}`);
    console.log(`${tickets.length} tickets created with pending status`);
    console.log(`Registration deadline: ${registrationDeadline.toISOString()}`);
    
    return { success: true, tickets };
  } catch (ticketError) {
    if (!committed) {
      await db.execute('ROLLBACK');
    }
    throw ticketError;
  }
}

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
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
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

      if (logResult.status === "already_processed") {
        console.log(`Skipping already processed event: ${event.id}`);
        return res.json({ received: true, status: "already_processed" });
      }
    } catch (error) {
      console.error("Failed to log event:", error);
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
              expand: ["line_items", "line_items.data.price.product"],
            },
          );

          // Check if transaction already exists (idempotency)
          const existingTransaction =
            await transactionService.getByStripeSessionId(session.id);

          if (existingTransaction) {
            console.log(`Transaction already exists for session ${session.id}`);
            return res.json({ received: true, status: "already_exists" });
          }

          // Create transaction record
          const transaction =
            await transactionService.createFromStripeSession(fullSession);
          console.log(`Created transaction: ${transaction.uuid}`);

          // Update the payment event with transaction ID
          await paymentEventLogger.updateEventTransactionId(
            event.id,
            transaction.id,
          );

          // Universal registration flow for all tickets
          try {
            await processUniversalRegistration(fullSession, transaction);
          } catch (ticketError) {
            console.error("Failed to process checkout with registration:", ticketError);
            await paymentEventLogger.logError(event, ticketError);
            throw ticketError; // Let top-level catch return non-2xx for retry
          }
        } catch (error) {
          console.error("Failed to process checkout session:", error);
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
              expand: ["line_items", "line_items.data.price.product"],
            },
          );

          const existingTransaction =
            await transactionService.getByStripeSessionId(session.id);
          if (!existingTransaction) {
            const transaction =
              await transactionService.createFromStripeSession(fullSession);
            console.log(
              `Created transaction from async payment: ${transaction.uuid}`,
            );

            // Universal registration flow for async payments
            try {
              await processUniversalRegistration(fullSession, transaction);
            } catch (ticketError) {
              console.error(
                "Failed to create tickets for async payment:",
                ticketError,
              );
              await paymentEventLogger.logError(event, ticketError);
              throw ticketError; // Let top-level catch return non-2xx for retry
            }
          }
        } catch (error) {
          console.error("Failed to process async payment:", error);
          await paymentEventLogger.logError(event, error);
        }

        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        console.log("Async payment failed for session:", session.id);

        // Update transaction status if it exists
        try {
          const transaction = await transactionService.getByStripeSessionId(
            session.id,
          );
          if (transaction) {
            await transactionService.updateStatus(transaction.uuid, "failed");
          }
        } catch (error) {
          console.error(
            "Failed to update transaction status for async_payment_failed:",
            error,
          );
          // Don't throw - let webhook succeed to prevent Stripe retries
        }

        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        console.log(`Checkout session expired: ${session.id}`);

        // Update transaction status if it exists
        try {
          const transaction = await transactionService.getByStripeSessionId(
            session.id,
          );
          if (transaction) {
            await transactionService.updateStatus(
              transaction.uuid,
              "cancelled",
            );
          }
        } catch (error) {
          console.error(
            "Failed to update transaction status for session.expired:",
            error,
          );
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
          const transaction = await transactionService.getByPaymentIntentId(
            paymentIntent.id,
          );

          if (transaction) {
            await transactionService.updateStatus(transaction.uuid, "failed");
          }
        } catch (error) {
          console.error(
            "Failed to update transaction status for payment_intent.payment_failed:",
            error,
          );
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
          const transaction = await transactionService.getByPaymentIntentId(
            paymentIntent.id,
          );

          if (transaction) {
            await transactionService.updateStatus(
              transaction.uuid,
              "cancelled",
            );
          }
        } catch (error) {
          console.error(
            "Failed to update transaction status for payment_intent.canceled:",
            error,
          );
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
            const transaction = await transactionService.getByPaymentIntentId(
              charge.payment_intent,
            );

            if (transaction) {
              const status =
                charge.amount_refunded === charge.amount
                  ? "refunded"
                  : "partially_refunded";
              await transactionService.updateStatus(transaction.uuid, status);
            }
          } catch (error) {
            console.error(
              "Failed to update transaction status for charge.refunded:",
              error,
            );
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
