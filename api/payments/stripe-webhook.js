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
 */

import Stripe from "stripe";

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

    // Handle the event based on type
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log("Checkout session completed:", {
          sessionId: session.id,
          paymentStatus: session.payment_status,
          customerEmail: session.customer_email || session.customer_details?.email,
          amount: session.amount_total / 100,
          orderId: session.metadata?.orderId,
        });
        
        // In a production app, you would:
        // 1. Send confirmation email
        // 2. Update your database
        // 3. Trigger fulfillment
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        console.log("Async payment succeeded for session:", session.id);
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        console.log("Async payment failed for session:", session.id);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        console.log("Checkout session expired:", session.id);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        console.log("Payment intent succeeded:", {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          customerEmail: paymentIntent.receipt_email,
        });
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        console.log("Payment intent failed:", paymentIntent.id);
        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object;
        console.log("Payment intent canceled:", paymentIntent.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
}