/**
 * Checkout Success API Endpoint
 * Handles successful Stripe Checkout returns
 */

import Stripe from "stripe";
import { openDb } from "../lib/database.js";

// Initialize Stripe with API key
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

    if (!session) {
      return res.status(404).json({
        error: "Session not found",
        message: "Checkout session could not be found",
      });
    }

    // Check if payment was successful
    if (session.payment_status !== "paid") {
      return res.status(400).json({
        error: "Payment not completed",
        message: "Payment was not successfully completed",
        paymentStatus: session.payment_status,
      });
    }

    // Update order status in database
    const db = await openDb();
    const orderId = session.metadata?.orderId;

    if (orderId) {
      try {
        // Update order status to paid
        const result = await db.run(
          `
                    UPDATE orders 
                    SET fulfillment_status = 'paid',
                        stripe_payment_intent_id = ?,
                        updated_at = datetime('now')
                    WHERE id = ?
                `,
          [session_id, orderId],
        );

        if (result.changes > 0) {
          // Order marked as paid
        } else {
          // Order not found in database
        }

        // Get order details for confirmation
        const order = await db.get(
          `
                    SELECT * FROM orders WHERE id = ?
                `,
          [orderId],
        );

        if (order) {
          let orderDetails = {};
          try {
            orderDetails = JSON.parse(order.order_details || "{}");
          } catch (error) {
            // Database error occurred
            orderDetails = {};
          }

          // Return success response with order information
          return res.status(200).json({
            success: true,
            message: "Payment successful! Thank you for your purchase.",
            order: {
              id: order.id,
              customerEmail: order.customer_email,
              customerName: order.customer_name,
              orderType: order.order_type,
              totalAmount: order.order_total / 100, // Convert from cents
              items: orderDetails.items || [],
              createdAt: order.created_at,
            },
            session: {
              id: session.id,
              paymentStatus: session.payment_status,
              customerEmail: session.customer_details?.email,
              amountTotal: session.amount_total / 100, // Convert from cents
            },
            instructions: {
              clearCart: true,
              redirectDelay: 20000, // 20 seconds // 5 seconds
              nextSteps: [
                "Check your email for order confirmation",
                "Save your order confirmation number",
                "Contact us if you have any questions",
              ],
            },
          });
        }
      } catch (dbError) {
        // Database error occurred
        // Continue to return success even if DB update fails
        // The payment was successful according to Stripe
      }
    }

    // Return success response even if we couldn't find/update the order
    // The payment was successful according to Stripe
    res.status(200).json({
      success: true,
      message: "Payment successful! Thank you for your purchase.",
      session: {
        id: session.id,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email,
        amountTotal: session.amount_total / 100, // Convert from cents
      },
      instructions: {
        clearCart: true,
        redirectDelay: 20000, // 20 seconds
        nextSteps: [
          "Check your email for order confirmation",
          "Contact us if you have any questions about your order",
        ],
      },
      warning: orderId
        ? "Order details could not be retrieved"
        : "Order ID not found in session",
    });
  } catch (error) {
    // Checkout processing failed

    // Handle specific Stripe errors
    if (error.type === "StripeInvalidRequestError") {
      return res.status(400).json({
        error: "Invalid session",
        message: "The provided session ID is invalid",
      });
    } else if (error.type === "StripeAPIError") {
      return res.status(500).json({
        error: "Stripe API error",
        message: "Unable to verify payment status",
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
      return res.status(500).json({
        error: "Payment verification failed",
        message: "An unexpected error occurred while verifying your payment",
      });
    }
  }
}
