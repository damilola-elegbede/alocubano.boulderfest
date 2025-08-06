/**
 * PayPal Create Order API Endpoint
 * Creates a PayPal order for processing payments
 */

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
    const { cartItems, customerInfo } = req.body;

    // Validate required fields
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: "Cart items required" });
    }

    // Calculate total
    let totalAmount = 0;
    for (const item of cartItems) {
      if (!item.name || !item.price || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          error: `Invalid item: ${item.name || "Unknown"}`,
        });
      }
      totalAmount += item.price * item.quantity;
    }

    // Check if PayPal credentials are configured
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      console.error("PayPal credentials not configured");
      // Return a user-friendly error
      return res.status(503).json({
        error: "PayPal payment processing is temporarily unavailable",
        message: "Please try using a credit card instead, or contact support.",
        fallbackUrl: "/api/payments/create-checkout-session" // Suggest Stripe as fallback
      });
    }

    // Get PayPal access token
    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const tokenResponse = await fetch(
      `${process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com"}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      }
    );

    if (!tokenResponse.ok) {
      throw new Error("Failed to authenticate with PayPal");
    }

    const { access_token } = await tokenResponse.json();

    // Create PayPal order
    const orderResponse = await fetch(
      `${process.env.PAYPAL_API_URL || "https://api-m.sandbox.paypal.com"}/v2/checkout/orders`,
      {
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
              items: cartItems.map((item) => ({
                name: item.name,
                unit_amount: {
                  currency_code: "USD",
                  value: item.price.toFixed(2),
                },
                quantity: item.quantity.toString(),
                description: item.description || `A Lo Cubano Boulder Fest - ${item.name}`,
              })),
              description: "A Lo Cubano Boulder Fest Purchase",
            },
          ],
          application_context: {
            brand_name: "A Lo Cubano Boulder Fest",
            landing_page: "BILLING",
            user_action: "PAY_NOW",
            return_url: `${req.headers.origin || "https://alocubano.boulderfest.com"}/success`,
            cancel_url: `${req.headers.origin || "https://alocubano.boulderfest.com"}/failure`,
          },
        }),
      }
    );

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
      fallbackUrl: "/api/payments/create-checkout-session"
    });
  }
}