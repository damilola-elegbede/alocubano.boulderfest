/**
 * Create Checkout Session API Endpoint
 * Handles Stripe Checkout Session creation and preliminary order storage
 */

import Stripe from "stripe";

// Initialize Stripe with API key
let stripe;
try {
  // Log environment info for debugging (without exposing secrets)
  console.log("Environment check:", {
    NODE_ENV: process.env.NODE_ENV,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    stripeKeyLength: process.env.STRIPE_SECRET_KEY?.length || 0,
    availableEnvVars: Object.keys(process.env).filter(key => 
      !key.includes('SECRET') && 
      !key.includes('KEY') && 
      !key.includes('TOKEN') &&
      !key.includes('PASSWORD')
    ).sort(),
  });
  
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not configured");
  } else {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log("Stripe initialized successfully");
  }
} catch (error) {
  console.error("Failed to initialize Stripe:", error);
}

export default async function handler(req, res) {
  console.log("=== Checkout Session Handler Started ===");
  console.log("Request method:", req.method);
  console.log("Request URL:", req.url);
  
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

  // Check if Stripe is properly initialized
  if (!stripe) {
    console.error("Stripe is not initialized - check STRIPE_SECRET_KEY environment variable");
    return res.status(500).json({ 
      error: "Payment service not configured",
      message: "Stripe payment processing is not available. Please check server configuration.",
      debug: {
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        nodeEnv: process.env.NODE_ENV,
        availableEnvVars: Object.keys(process.env).filter(key => 
          !key.includes('SECRET') && 
          !key.includes('KEY') && 
          !key.includes('TOKEN') &&
          !key.includes('PASSWORD')
        ).length
      }
    });
  }

  try {
    const { cartItems, customerInfo } = req.body;

    // Log incoming request in development
    if (process.env.NODE_ENV !== "production") {
      console.log("Checkout session request:", {
        cartItems: cartItems,
        customerInfo: customerInfo,
        hasCartItems: !!cartItems,
        isArray: Array.isArray(cartItems),
        itemCount: cartItems?.length,
      });
    }

    // Validate required fields
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: "Cart items required" });
    }

    // Customer info is optional - Stripe Checkout will collect it
    // Only validate email if provided
    if (customerInfo?.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerInfo.email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
    }

    // Calculate total and create line items for Stripe
    let totalAmount = 0;
    const lineItems = [];
    let orderType = "tickets"; // Default to tickets, will be set to 'donation' if only donations

    // Track what types of items we have
    const hasTickets = cartItems.some((item) => item.type === "ticket");
    const hasDonations = cartItems.some((item) => item.type === "donation");

    // Set order type based on cart contents
    if (hasDonations && !hasTickets) {
      orderType = "donation";
    } else if (hasTickets) {
      orderType = "tickets";
    }

    for (const item of cartItems) {
      // Validate item structure
      if (!item.name || !item.price || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          error: `Invalid item: ${item.name || "Unknown"}`,
        });
      }

      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      // Create Stripe line item
      const lineItem = {
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name,
            description:
              item.description || `A Lo Cubano Boulder Fest - ${item.name}`,
          },
          unit_amount: Math.round(item.price * 100), // Convert to cents
        },
        quantity: item.quantity,
      };

      // Add metadata for different item types
      if (item.type === "ticket") {
        lineItem.price_data.product_data.metadata = {
          type: "ticket",
          ticket_type: item.ticketType || "general",
          event_date: item.eventDate || "2026-05-15",
        };
      } else if (item.type === "donation") {
        lineItem.price_data.product_data.metadata = {
          type: "donation",
          donation_category: item.category || "general",
        };
      }

      lineItems.push(lineItem);
    }

    // Generate order ID for tracking (no database storage)
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log("Creating checkout session for order:", orderId);

    // Determine origin from request headers
    const origin =
      req.headers.origin ||
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}` ||
      "https://alocubano.boulderfest.com";

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      // Enable all available payment methods including Apple Pay and Google Pay
      payment_method_types: ["card", "link"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/failure?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
      // Only include customer_email if provided
      ...(customerInfo?.email && { customer_email: customerInfo.email }),
      metadata: {
        orderId: orderId,
        orderType: orderType,
        customerName: customerInfo?.firstName && customerInfo?.lastName 
          ? `${customerInfo.firstName} ${customerInfo.lastName}`
          : 'Pending',
        environment: process.env.NODE_ENV || "development",
      },
      // Collect billing address for tax compliance
      billing_address_collection: "required",
      // Set session expiration (24 hours)
      expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    });

    // Log session creation for debugging
    console.log("Stripe checkout session created:", {
      sessionId: session.id,
      orderId: orderId,
      totalAmount: totalAmount
    });

    // Return checkout URL for redirect
    res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
      orderId: orderId,
      totalAmount: totalAmount,
    });
  } catch (error) {
    // Checkout session creation failed
    console.error("Checkout session error:", error);

    // Handle specific Stripe errors
    if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        error: "Invalid request",
        message: error.message,
      });
    } else if (error.type === "StripeAPIError") {
      return res.status(500).json({
        error: "Stripe API error",
        message: "Payment service temporarily unavailable",
      });
    } else if (error.type === "StripeConnectionError") {
      return res.status(500).json({
        error: "Connection error",
        message: "Unable to connect to payment service",
      });
    } else if (error.type === "StripeAuthenticationError") {
      // Stripe authentication error
      return res.status(500).json({
        error: "Configuration error",
        message: "Payment service configuration error",
      });
    } else {
      // Always log the error for debugging
      console.error("Unexpected error details:", {
        message: error.message,
        stack: error.stack,
        type: error.type,
        name: error.name,
      });
      
      // Return more detailed error info for debugging
      return res.status(500).json({
        error: "Checkout session creation failed",
        message: error.message || "An unexpected error occurred",
        // Include error details for debugging (remove in production later)
        details: {
          errorType: error.name,
          errorMessage: error.message,
        }
      });
    }
  }
}
