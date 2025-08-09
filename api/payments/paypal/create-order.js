/**
 * PayPal Create Order API Endpoint
 * Creates a PayPal order for processing payments
 */

import { withRateLimit } from "../../utils/rate-limiter.js";
import { setCorsHeaders, isOriginAllowed } from "../../utils/cors.js";

// PayPal API base URL configuration
const PAYPAL_API_URL =
  process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com";

// Maximum request body size (100KB)
const MAX_BODY_SIZE = 100 * 1024;

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message:
    "Too many payment attempts. Please wait a moment before trying again.",
};

async function createOrderHandler(req, res) {
  // Set CORS headers with origin validation
  setCorsHeaders(req, res, {
    methods: "POST, OPTIONS",
    headers: "Content-Type, Authorization",
  });

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check request body size
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    return res.status(413).json({ error: "Request body too large" });
  }

  try {
    const { cartItems, customerInfo } = req.body;

    // Validate required fields
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: "Cart items required" });
    }

    // Validate cart items limit (prevent abuse)
    if (cartItems.length > 50) {
      return res
        .status(400)
        .json({ error: "Too many items in cart (maximum 50)" });
    }

    // Calculate total and validate items
    let totalAmount = 0;
    const orderItems = [];

    for (const item of cartItems) {
      // Comprehensive validation
      if (
        !item.name ||
        typeof item.name !== "string" ||
        item.name.length > 200
      ) {
        return res.status(400).json({
          error: `Invalid item name: ${item.name || "Unknown"}`,
        });
      }

      if (typeof item.price !== "number" || item.price < 0) {
        return res.status(400).json({
          error: `Invalid price for item: ${item.name}`,
        });
      }

      if (
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 100
      ) {
        return res.status(400).json({
          error: `Invalid quantity for item: ${item.name}`,
        });
      }

      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      // Prepare sanitized item for PayPal
      orderItems.push({
        name: item.name.substring(0, 127), // PayPal name limit
        price: item.price,
        quantity: item.quantity,
        description:
          item.description || `A Lo Cubano Boulder Fest - ${item.name}`,
      });
    }

    // Validate total amount
    if (totalAmount <= 0 || totalAmount > 10000) {
      return res.status(400).json({
        error: "Invalid order total. Amount must be between $0.01 and $10,000",
      });
    }

    // Check if PayPal credentials are configured
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      console.error("PayPal credentials not configured");
      // Return a user-friendly error
      return res.status(503).json({
        error: "PayPal payment processing is temporarily unavailable",
        message: "Please try using a credit card instead, or contact support.",
        fallbackUrl: "/api/payments/create-checkout-session", // Suggest Stripe as fallback
      });
    }

    // Get PayPal access token
    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
    ).toString("base64");

    const tokenResponse = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to authenticate with PayPal");
    }

    const { access_token } = await tokenResponse.json();

    // Validate and determine return URLs
    const origin = req.headers.origin;
    let baseUrl = "https://alocubano.boulderfest.com";

    if (origin && isOriginAllowed(origin)) {
      baseUrl = origin;
    }

    // Store customer info for order tracking (if provided)
    const orderMetadata = {};
    if (customerInfo && typeof customerInfo === "object") {
      // Sanitize and store customer info
      if (customerInfo.email && typeof customerInfo.email === "string") {
        orderMetadata.email = customerInfo.email.substring(0, 254);
      }
      if (
        customerInfo.firstName &&
        typeof customerInfo.firstName === "string"
      ) {
        orderMetadata.firstName = customerInfo.firstName.substring(0, 50);
      }
      if (customerInfo.lastName && typeof customerInfo.lastName === "string") {
        orderMetadata.lastName = customerInfo.lastName.substring(0, 50);
      }
      if (customerInfo.phone && typeof customerInfo.phone === "string") {
        orderMetadata.phone = customerInfo.phone.substring(0, 20);
      }
    }

    // Create PayPal order
    const orderResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: totalAmount.toFixed(2),
              breakdown: {
                item_total: {
                  currency_code: "USD",
                  value: totalAmount.toFixed(2),
                },
              },
            },
            items: orderItems.map((item) => ({
              name: item.name,
              unit_amount: {
                currency_code: "USD",
                value: item.price.toFixed(2),
              },
              quantity: item.quantity.toString(),
              description: item.description,
            })),
            description: "A Lo Cubano Boulder Fest Purchase",
            custom_id: orderMetadata.email || undefined, // Store email for reference
            invoice_id: `ALCBF-${Date.now()}`, // Unique invoice ID
          },
        ],
        application_context: {
          brand_name: "A Lo Cubano Boulder Fest",
          landing_page: "BILLING",
          user_action: "PAY_NOW",
          return_url: `${baseUrl}/success`,
          cancel_url: `${baseUrl}/failure`,
          shipping_preference: "NO_SHIPPING", // Digital tickets, no shipping needed
        },
      }),
    });

    if (!orderResponse.ok) {
      const errorData = await orderResponse.json();
      console.error("PayPal order creation failed:", errorData);
      throw new Error("Failed to create PayPal order");
    }

    const order = await orderResponse.json();

    // Return order ID for client-side approval
    res.status(200).json({
      orderId: order.id,
      approvalUrl: order.links.find((link) => link.rel === "approve")?.href,
    });
  } catch (error) {
    console.error("PayPal order creation error:", error);

    // Return user-friendly error with Stripe fallback suggestion
    res.status(500).json({
      error: "PayPal payment initialization failed",
      message: "Please try using a credit card instead, or try again later.",
      fallbackUrl: "/api/payments/create-checkout-session",
    });
  }
}

// Export handler with rate limiting
export default withRateLimit(createOrderHandler, RATE_LIMIT_CONFIG);
