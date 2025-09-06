/**
 * Checkout Success API Endpoint
 * Handles successful Stripe Checkout returns
 */

import Stripe from "stripe";

// Initialize Stripe with strict error handling
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("❌ FATAL: STRIPE_SECRET_KEY not found in environment");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { session_id } = req.query;

    // Validate session_id parameter
    if (!session_id || !session_id.startsWith("cs_")) {
      return res.status(400).json({
        error: "Invalid session ID",
        message: "Valid Stripe session ID required",
      });
    }

    // Retrieve and validate Checkout Session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Verify the session is in a successful state
    if (session.payment_status !== "paid") {
      return res.status(400).json({
        error: "Payment not completed",
        status: session.payment_status,
      });
    }

    console.log("Checkout session verified as successful:", {
      sessionId: session.id,
      customerEmail: session.customer_email || session.customer_details?.email,
      amount: session.amount_total / 100,
      orderId: session.metadata?.orderId,
    });

    // Return success response
    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        amount: session.amount_total / 100,
        currency: session.currency,
        customer_email:
          session.customer_email || session.customer_details?.email,
        metadata: session.metadata,
      },
    });
  } catch (error) {
    console.error("Error handling checkout success:", error);

    // Handle specific Stripe errors
    if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        error: "Invalid request",
        message: error.message,
      });
    }

    // Generic error response
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to process checkout success",
    });
  }
}
