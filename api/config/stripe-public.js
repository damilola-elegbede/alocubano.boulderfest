/**
 * Stripe Public Configuration Endpoint
 * Returns the Stripe publishable key from environment variables
 * This allows the frontend to access the key without hardcoding it
 */

export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get the publishable key from environment
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    console.error(
      "Stripe publishable key not configured in environment variables",
    );
    return res.status(500).json({
      error: "Payment system not configured",
      message: "Please contact support",
    });
  }

  // Return the key
  // Note: This is safe because publishable keys are meant to be public
  return res.status(200).json({
    publishableKey: publishableKey,
    environment: publishableKey.startsWith("pk_test_") ? "test" : "live",
  });
}
