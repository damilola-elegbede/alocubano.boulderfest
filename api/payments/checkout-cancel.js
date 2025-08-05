/**
 * Checkout Cancel API Endpoint
 * Handles cancelled Stripe Checkout returns
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.session_id] - Stripe checkout session ID
 * @param {string} [req.query.order_id] - Internal order ID
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with cancellation status and instructions
 */

import { openDb } from "../lib/database.js";

export default async function handler(req, res) {
  // Set CORS headers with proper security
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'https://alocubano.boulderfest.com',
    'https://alocubanoboulderfest.vercel.app',
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null,
    process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : null
  ].filter(Boolean);
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
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
    const { session_id, order_id } = req.query;

    // Track cancellation event

    // If we have an order ID, mark it as cancelled
    if (order_id) {
      try {
        const db = await openDb();

        // Check if order exists and is in awaiting_payment status
        const existingOrder = await db.get(
          `
                    SELECT id, fulfillment_status 
                    FROM orders 
                    WHERE id = ?
                `,
          [order_id],
        );

        if (existingOrder) {
          // Only update if order is still pending payment
          if (existingOrder.fulfillment_status === "awaiting_payment") {
            const result = await db.run(
              `
                            UPDATE orders 
                            SET fulfillment_status = 'cancelled',
                                updated_at = datetime('now')
                            WHERE id = ? AND fulfillment_status = 'awaiting_payment'
                        `,
              [order_id],
            );

            // Order successfully marked as cancelled
            // This is the expected flow for cancellations
          }
          // Order status is not awaiting_payment, skip update
          // This occurs when the order has already been processed
        }
        // Order not found in database - this is ok for cancelled checkouts
        // Some cancellations may occur before order creation completes
      } catch (dbError) {
        // Database error - continue anyway, cancellation isn't critical
        // Continue anyway - cancellation isn't critical for database consistency
      }
    }

    // Return cancellation response with instructions
    res.status(200).json({
      cancelled: true,
      message: "Checkout was cancelled. Your cart items have been preserved.",
      instructions: {
        preserveCart: true, // Don't clear the cart
        redirectUrl: "/tickets", // Redirect back to tickets page
        redirectDelay: 20000, // 20 seconds
        nextSteps: [
          "Your cart items are still saved",
          "You can complete your purchase anytime",
          "Contact us if you experienced any issues",
        ],
      },
      supportInfo: {
        email: "alocubanoboulderfest@gmail.com",
        instagram: "@alocubano.boulderfest",
        message: "Need help? Contact us for assistance with your purchase.",
      },
    });
  } catch (error) {
    // Error processing cancellation - return graceful response

    // Even if there's an error, we want to handle the cancellation gracefully
    res.status(200).json({
      cancelled: true,
      message: "Checkout was cancelled. You can try again anytime.",
      instructions: {
        preserveCart: true,
        redirectUrl: "/tickets",
        redirectDelay: 3000,
        nextSteps: [
          "Return to the tickets page to try again",
          "Contact us if you continue to experience issues",
        ],
      },
      supportInfo: {
        email: "alocubanoboulderfest@gmail.com",
        instagram: "@alocubano.boulderfest",
      },
      error:
        "There was an issue processing your cancellation, but your checkout was cancelled successfully.",
    });
  }
}
