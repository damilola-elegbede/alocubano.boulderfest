/**
 * Brevo Webhook Handler
 * Processes incoming webhook events from Brevo
 */

import { getEmailSubscriberService } from "../lib/email-subscriber-service.js";
import { getBrevoService } from "../lib/brevo-service.js";
import * as ipRangeCheckModule from "ip-range-check";

// Handle both default and named exports
const ipRangeCheck = ipRangeCheckModule.default || ipRangeCheckModule;

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
 * Get client IP address
 */
function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    "127.0.0.1"
  );
}

/**
 * Validate webhook source (basic IP whitelist)
 */
function isValidWebhookSource(ip) {
  // Skip IP validation in test environment
  if (process.env.NODE_ENV === "test" || process.env.CI === "true") {
    return true;
  }

  // Official Brevo webhook IP ranges
  const allowedIPs = ["1.179.112.0/20", "172.246.240.0/20"];

  try {
    // Check if the IP falls within the allowed ranges
    if (typeof ipRangeCheck === "function") {
      return ipRangeCheck(ip, allowedIPs);
    } else if (ipRangeCheck && typeof ipRangeCheck.inRange === "function") {
      return ipRangeCheck.inRange(ip, allowedIPs);
    } else {
      console.error("ip-range-check module not properly loaded");
      return false;
    }
  } catch (error) {
    console.error("Error checking IP range:", error);
    return false;
  }
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
  const clientIP = getClientIp(req);

  try {
    // Validate webhook source
    if (!isValidWebhookSource(clientIP)) {
      console.warn("Webhook request from unauthorized IP:", clientIP);
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get raw body for signature verification
    const rawBody = await getRawBody(req);

    // Validate webhook signature if secret is configured
    if (process.env.BREVO_WEBHOOK_SECRET) {
      const signature = req.headers["x-brevo-signature"];
      if (!signature) {
        return res.status(401).json({ error: "Missing webhook signature" });
      }

      const brevoService = getBrevoService();
      const isValidSignature = brevoService.validateWebhookSignature(
        rawBody,
        signature,
      );

      if (!isValidSignature) {
        console.warn("Invalid webhook signature from IP:", clientIP);
        return res.status(401).json({ error: "Invalid signature" });
      }
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
      ip: clientIP,
    });

    // Get services
    const emailService = getEmailSubscriberService();

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
      ip: getClientIp(req),
      timestamp: new Date().toISOString(),
    });

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
