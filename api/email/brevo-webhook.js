/**
 * Brevo Webhook Handler
 * Processes incoming webhook events from Brevo
 */

import crypto from "crypto";
import { getEmailSubscriberService } from "../lib/email-subscriber-service.js";

/**
 * Get raw body from request
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

/**
 * Validate webhook signature
 */
function validateSignature(rawBody, signature) {
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "BREVO_WEBHOOK_SECRET not configured, skipping signature validation",
    );
    return true; // Skip validation if not configured
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return signature === expectedSignature;
}

/**
 * Main handler function
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  let webhookData = null;

  try {
    // Get raw body
    const rawBody = await getRawBody(req);

    // Validate signature if provided
    const signature = req.headers["x-brevo-signature"];
    if (signature && !validateSignature(rawBody, signature)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse webhook data
    try {
      webhookData = JSON.parse(rawBody);
    } catch (error) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    // Validate required webhook fields
    if (!webhookData.event || !webhookData.email) {
      return res.status(400).json({
        error: "Missing required webhook fields (event, email)",
      });
    }

    console.log("Processing Brevo webhook:", {
      event: webhookData.event,
      email: webhookData.email,
      timestamp: webhookData.date || new Date().toISOString(),
    });

    // Ensure services are initialized
    const emailService = await getEmailSubscriberService().ensureInitialized();

    // Process the webhook event
    const processedEvent = await emailService.processWebhookEvent(webhookData);

    if (!processedEvent) {
      // Subscriber not found in our database, but that's OK
      console.log(
        "Webhook processed but subscriber not found:",
        webhookData.email,
      );
      return res.status(200).json({
        success: true,
        message: "Webhook processed (subscriber not found)",
      });
    }

    // Handle specific event types
    let responseMessage = "Webhook processed successfully";

    switch (webhookData.event) {
      case "delivered":
        responseMessage = "Email delivery recorded";
        break;

      case "opened":
        responseMessage = "Email open recorded";
        break;

      case "clicked":
        responseMessage = "Email click recorded";
        break;

      case "unsubscribed":
        responseMessage = "Unsubscribe processed";
        break;

      case "soft_bounce":
        responseMessage = "Soft bounce recorded";
        break;

      case "hard_bounce":
        responseMessage = "Hard bounce processed, contact marked as bounced";
        break;

      case "spam":
        responseMessage = "Spam complaint processed, contact marked as bounced";
        break;

      case "invalid_email":
        responseMessage = "Invalid email processed, contact marked as bounced";
        break;

      default:
        responseMessage = `Unknown event type processed: ${webhookData.event}`;
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: responseMessage,
      event: processedEvent,
    });
  } catch (error) {
    console.error("Brevo webhook processing error:", {
      error: error.message,
      stack: error.stack,
      webhook_data: webhookData,
      timestamp: new Date().toISOString(),
    });

    // Handle initialization errors specifically
    if (
      error.message.includes("Failed to initialize email subscriber service")
    ) {
      return res.status(503).json({
        error: "Email service is currently initializing",
      });
    }

    // Return error response (but don't expose internal details)
    return res.status(500).json({
      error: "Internal server error processing webhook",
    });
  }
}

/**
 * Vercel edge config (if using Vercel)
 */
export const config = {
  runtime: "nodejs",
  regions: ["iad1"], // Use region closest to Brevo servers
  maxDuration: 10, // 10 seconds max execution time
  api: {
    bodyParser: false, // Disable body parser to access raw body for signature verification
  },
};
