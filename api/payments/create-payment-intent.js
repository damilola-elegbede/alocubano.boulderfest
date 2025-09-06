/**
 * Create Payment Intent API Endpoint
 * Legacy endpoint for direct payment intent creation
 * (Kept for backward compatibility - new flow uses checkout sessions)
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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      amount,
      currency = "usd",
      metadata = {},
      receipt_email,
      description,
    } = req.body;

    // Validate amount
    if (!amount || amount < 100) {
      return res.status(400).json({
        error: "Invalid amount. Minimum charge is $1.00",
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Ensure it's an integer
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        ...metadata,
        source: "api",
      },
      receipt_email,
      description,
    });

    console.log("Payment intent created:", {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({
      error: "Failed to create payment intent",
      message: error.message,
    });
  }
}
