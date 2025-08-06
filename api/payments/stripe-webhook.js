/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events for payment status updates
 *
 * Supported Events:
 * - checkout.session.completed - Main success event for Checkout
 * - checkout.session.async_payment_succeeded - Delayed payment methods success
 * - checkout.session.async_payment_failed - Delayed payment methods failure
 * - checkout.session.expired - Session timeout
 * - payment_intent.succeeded - Direct Payment Intent success (backward compatibility)
 * - payment_intent.payment_failed - Payment Intent failure (backward compatibility)
 * - payment_intent.canceled - Payment Intent cancellation (backward compatibility)
 * - charge.refunded - Refund processing (backward compatibility)
 */

import Stripe from "stripe";
import { openDb } from "../lib/database.js";
import { getBrevoService } from "../lib/brevo-service.js";

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

// Helper function to handle successful payments
async function handleSuccessfulPayment(
  db,
  brevoService,
  paymentIntentId,
  eventSource,
) {
  // Update order status to paid
  const result = await db.run(
    `
        UPDATE orders 
        SET fulfillment_status = 'paid', 
            updated_at = datetime('now')
        WHERE stripe_payment_intent_id = ?
    `,
    [paymentIntentId],
  );

  if (result.changes > 0) {
    // Get order details for email
    const order = await db.get(
      `
            SELECT * FROM orders 
            WHERE stripe_payment_intent_id = ?
        `,
      [paymentIntentId],
    );

    if (order) {
      console.log(
        `Payment succeeded for order: ${order.id} (source: ${eventSource})`,
      );

      // Check if confirmation email was already sent to avoid duplicates
      // Handle backward compatibility where confirmation_email_sent column might not exist
      const emailAlreadySent = order.confirmation_email_sent === 1;
      if (!emailAlreadySent) {
        // Parse order details
        const orderDetails = JSON.parse(order.order_details);

        // Prepare email data
        const emailData = {
          email: order.customer_email,
          templateId: process.env.BREVO_ORDER_CONFIRMATION_TEMPLATE_ID || 2, // Default template ID
          params: {
            customerName: order.customer_name,
            orderId: order.id,
            orderType: order.order_type,
            totalAmount: (order.order_total / 100).toFixed(2), // Convert cents to dollars
            orderDetails: orderDetails,
            paymentDate: new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
          },
        };

        // Send confirmation email
        try {
          await brevoService.sendTransactionalEmail(
            emailData.email,
            emailData.templateId,
            emailData.params,
          );

          // Mark email as sent to prevent duplicates
          // Handle backward compatibility gracefully
          try {
            await db.run(
              `
                            UPDATE orders 
                            SET confirmation_email_sent = 1, 
                                updated_at = datetime('now')
                            WHERE id = ?
                        `,
              [order.id],
            );
          } catch (dbError) {
            // If column doesn't exist, log but don't fail
            console.warn(
              "Could not update confirmation_email_sent flag:",
              dbError.message,
            );
          }

          console.log(`Confirmation email sent to ${order.customer_email}`);
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
          // Don't fail the webhook if email fails
        }
      } else {
        console.log(`Confirmation email already sent for order: ${order.id}`);
      }
    }
  } else {
    console.warn(`No order found for payment intent: ${paymentIntentId}`);
  }
}

// Helper function to handle failed payments
async function handleFailedPayment(db, paymentIntentId, eventSource) {
  // Update order status to failed
  const result = await db.run(
    `
        UPDATE orders 
        SET fulfillment_status = 'failed', 
            updated_at = datetime('now')
        WHERE stripe_payment_intent_id = ?
    `,
    [paymentIntentId],
  );

  if (result.changes > 0) {
    console.log(
      `Payment failed for payment intent: ${paymentIntentId} (source: ${eventSource})`,
    );

    // Get order details
    const order = await db.get(
      `
            SELECT customer_email, customer_name 
            FROM orders 
            WHERE stripe_payment_intent_id = ?
        `,
      [paymentIntentId],
    );

    if (order) {
      // Optionally send failure notification email
      console.log(`Payment failed for customer: ${order.customer_email}`);
    }
  } else {
    console.warn(`No order found for payment intent: ${paymentIntentId}`);
  }
}

// Helper function to handle expired payments
async function handleExpiredPayment(db, paymentIntentId) {
  // Update order status to expired
  const result = await db.run(
    `
        UPDATE orders 
        SET fulfillment_status = 'expired', 
            updated_at = datetime('now')
        WHERE stripe_payment_intent_id = ?
    `,
    [paymentIntentId],
  );

  if (result.changes > 0) {
    console.log(`Payment expired for payment intent: ${paymentIntentId}`);
  } else {
    console.warn(`No order found for payment intent: ${paymentIntentId}`);
  }
}

// Helper function to handle successful payments by session ID
async function handleSuccessfulPaymentBySession(
  db,
  brevoService,
  sessionId,
  eventSource,
) {
  // Update order status to paid
  const result = await db.run(
    `
        UPDATE orders 
        SET fulfillment_status = 'paid', 
            updated_at = datetime('now')
        WHERE stripe_checkout_session_id = ?
    `,
    [sessionId],
  );

  if (result.changes > 0) {
    // Get order details for email
    const order = await db.get(
      `
            SELECT * FROM orders 
            WHERE stripe_checkout_session_id = ?
        `,
      [sessionId],
    );

    if (order) {
      console.log(
        `Payment succeeded for order: ${order.id} (source: ${eventSource})`,
      );

      // Check if confirmation email was already sent to avoid duplicates
      const emailAlreadySent = order.confirmation_email_sent === 1;
      if (!emailAlreadySent) {
        // Parse order details
        const orderDetails = JSON.parse(order.order_details);

        // Prepare email data
        const emailData = {
          email: order.customer_email,
          templateId: process.env.BREVO_ORDER_CONFIRMATION_TEMPLATE_ID || 2,
          params: {
            customerName: order.customer_name,
            orderId: order.id,
            orderType: order.order_type,
            totalAmount: (order.order_total / 100).toFixed(2),
            orderDetails: orderDetails,
            paymentDate: new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
          },
        };

        // Send confirmation email
        try {
          await brevoService.sendTransactionalEmail(
            emailData.email,
            emailData.templateId,
            emailData.params,
          );

          // Mark email as sent to prevent duplicates
          try {
            await db.run(
              `
                            UPDATE orders 
                            SET confirmation_email_sent = 1, 
                                updated_at = datetime('now')
                            WHERE id = ?
                        `,
              [order.id],
            );
          } catch (dbError) {
            console.warn(
              "Could not update confirmation_email_sent flag:",
              dbError.message,
            );
          }

          console.log(`Confirmation email sent to ${order.customer_email}`);
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
        }
      } else {
        console.log(`Confirmation email already sent for order: ${order.id}`);
      }
    }
  } else {
    console.warn(`No order found for checkout session: ${sessionId}`);
  }
}

// Helper function to handle failed payments by session ID
async function handleFailedPaymentBySession(db, sessionId, eventSource) {
  const result = await db.run(
    `
        UPDATE orders 
        SET fulfillment_status = 'failed', 
            updated_at = datetime('now')
        WHERE stripe_checkout_session_id = ?
    `,
    [sessionId],
  );

  if (result.changes > 0) {
    console.log(
      `Payment failed for checkout session: ${sessionId} (source: ${eventSource})`,
    );

    const order = await db.get(
      `
            SELECT customer_email, customer_name 
            FROM orders 
            WHERE stripe_checkout_session_id = ?
        `,
      [sessionId],
    );

    if (order) {
      console.log(`Payment failed for customer: ${order.customer_email}`);
    }
  } else {
    console.warn(`No order found for checkout session: ${sessionId}`);
  }
}

// Helper function to handle expired payments by session ID
async function handleExpiredPaymentBySession(db, sessionId) {
  const result = await db.run(
    `
        UPDATE orders 
        SET fulfillment_status = 'expired', 
            updated_at = datetime('now')
        WHERE stripe_checkout_session_id = ?
    `,
    [sessionId],
  );

  if (result.changes > 0) {
    console.log(`Payment expired for checkout session: ${sessionId}`);
  } else {
    console.warn(`No order found for checkout session: ${sessionId}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let event;
  let rawBody;

  try {
    // Get raw body for signature verification
    rawBody = await getRawBody(req);
    const sig = req.headers["stripe-signature"];

    if (!sig) {
      console.error("No Stripe signature found in headers");
      return res.status(400).json({ error: "No signature provided" });
    }

    // Verify webhook signature
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
  } catch (error) {
    console.error("Error processing webhook body:", error);
    return res.status(400).json({ error: "Invalid request body" });
  }

  // Process the event
  try {
    const db = await openDb();
    const brevoService = getBrevoService();

    console.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      // Checkout Session Events (Primary events for Checkout)
      case "checkout.session.completed": {
        const session = event.data.object;
        const paymentIntentId = session.payment_intent;
        const sessionId = session.id;

        console.log(
          `Checkout session completed: ${sessionId}, payment_intent: ${paymentIntentId}`,
        );

        // Always use session ID for checkout session events
        // This is the primary identifier for checkout-based orders
        await handleSuccessfulPaymentBySession(
          db,
          brevoService,
          sessionId,
          "checkout_session_completed",
        );
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const paymentIntentId = session.payment_intent;
        const sessionId = session.id;

        console.log(
          `Checkout session async payment succeeded: ${sessionId}, payment_intent: ${paymentIntentId}`,
        );

        // Always use session ID for checkout session events
        await handleSuccessfulPaymentBySession(
          db,
          brevoService,
          sessionId,
          "checkout_session_async_succeeded",
        );
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        const paymentIntentId = session.payment_intent;
        const sessionId = session.id;

        console.log(
          `Checkout session async payment failed: ${sessionId}, payment_intent: ${paymentIntentId}`,
        );

        // Always use session ID for checkout session events
        await handleFailedPaymentBySession(
          db,
          sessionId,
          "checkout_session_async_failed",
        );
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        const paymentIntentId = session.payment_intent;
        const sessionId = session.id;

        console.log(
          `Checkout session expired: ${sessionId}, payment_intent: ${paymentIntentId}`,
        );

        // Always use session ID for checkout session events
        await handleExpiredPaymentBySession(db, sessionId);
        break;
      }

      // Payment Intent Events (Backward compatibility)
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;

        console.log(`Payment intent succeeded: ${paymentIntent.id}`);

        await handleSuccessfulPayment(
          db,
          brevoService,
          paymentIntent.id,
          "payment_intent_succeeded",
        );
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;

        console.log(`Payment intent failed: ${paymentIntent.id}`);

        await handleFailedPayment(
          db,
          paymentIntent.id,
          "payment_intent_failed",
        );
        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object;

        // Update order status to cancelled
        await db.run(
          `
                    UPDATE orders 
                    SET fulfillment_status = 'cancelled', 
                        updated_at = datetime('now')
                    WHERE stripe_payment_intent_id = ?
                `,
          [paymentIntent.id],
        );

        console.log(
          `Payment cancelled for payment intent: ${paymentIntent.id}`,
        );
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;

        // Update order status to refunded
        await db.run(
          `
                    UPDATE orders 
                    SET fulfillment_status = 'refunded', 
                        updated_at = datetime('now')
                    WHERE stripe_payment_intent_id = ?
                `,
          [charge.payment_intent],
        );

        console.log(
          `Refund processed for payment intent: ${charge.payment_intent}`,
        );
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Return 200 anyway to prevent Stripe from retrying
    res.status(200).json({
      received: true,
      error: "Processing error logged",
    });
  }
}
