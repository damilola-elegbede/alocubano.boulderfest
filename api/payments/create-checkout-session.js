/**
 * Create Checkout Session API Endpoint
 * Handles Stripe Checkout Session creation and preliminary order storage
 */

import Stripe from "stripe";
import { openDb } from "../lib/database.js";

// Initialize Stripe with API key
let stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not configured");
  } else {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch (error) {
  console.error("Failed to initialize Stripe:", error);
}

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

  // Check if Stripe is properly initialized
  if (!stripe) {
    console.error("Stripe is not initialized - check STRIPE_SECRET_KEY environment variable");
    return res.status(500).json({ 
      error: "Payment service not configured",
      message: "Stripe payment processing is not available. Please check server configuration."
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

    // Generate order ID
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store preliminary order in database with 'awaiting_payment' status
    const db = await openDb();

    try {
      await db.run(
        `
                INSERT INTO orders (
                    id, 
                    stripe_checkout_session_id,
                    payment_method,
                    customer_email, 
                    customer_name, 
                    customer_phone, 
                    order_type, 
                    order_details, 
                    order_total,
                    fulfillment_status,
                    special_requests
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        [
          orderId,
          null, // Will be updated after creating checkout session
          'checkout_session',
          customerInfo?.email || 'pending@stripe.checkout',
          customerInfo?.firstName && customerInfo?.lastName 
            ? `${customerInfo.firstName} ${customerInfo.lastName}`
            : 'Pending Stripe Checkout',
          customerInfo?.phone || null,
          orderType,
          JSON.stringify({
            items: cartItems,
            totalAmount: totalAmount,
          }),
          Math.round(totalAmount * 100), // Store in cents
          "awaiting_payment",
          customerInfo?.specialRequests || null,
        ],
      );

      // Preliminary order created
    } catch (dbError) {
      // Database error occurred
      return res
        .status(500)
        .json({ error: "Failed to create preliminary order" });
    }

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

    // Update order with actual Checkout Session ID
    try {
      await db.run(
        `
                UPDATE orders 
                SET stripe_checkout_session_id = ?,
                    checkout_session_url = ?,
                    checkout_session_expires_at = ?
                WHERE id = ?
            `,
        [
          session.id, 
          session.url,
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
          orderId
        ],
      );

      // Order updated with session ID
    } catch (dbError) {
      // Error updating order
      // Continue anyway - we have the session created
    }

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
