/**
 * Brevo Webhook Handler
 * Processes incoming webhook events from Brevo
 */

import { getEmailSubscriberService } from "../../lib/email-subscriber-service.js";

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
 * Check if IP is in CIDR range
 */
function isIpInCidr(ip, cidr) {
  const [range, bits = 32] = cidr.split("/");
  const mask = ~(2 ** (32 - bits) - 1);

  const ipToNum = (ip) => {
    const parts = ip.split(".");
    return parts.reduce(
      (sum, part, i) => sum + (parseInt(part) << (8 * (3 - i))),
      0,
    );
  };

  const rangeNum = ipToNum(range);
  const ipNum = ipToNum(ip);

  return (rangeNum & mask) === (ipNum & mask);
}

/**
 * Validate webhook request
 * 
 * Security Note: Brevo does NOT provide HMAC signatures for webhooks.
 * Per Brevo's official documentation (https://developers.brevo.com/docs/username-and-password-authentication),
 * they recommend:
 * 1. IP whitelisting (implemented below with official CIDR ranges)
 * 2. Basic auth or Bearer token authentication (optional via BREVO_WEBHOOK_TOKEN)
 * 
 * This implementation follows Brevo's security best practices.
 */
function validateWebhookRequest(req) {
  // Get the client IP (prefer Vercel's trusted header for security)
  const forwarded =
    req.headers["x-vercel-forwarded-for"] || // Vercel-managed, sanitized
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "";
  const ipChain = String(forwarded)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const clientIp = (ipChain[0] || "").replace(/^::ffff:/, ""); // Remove IPv6 prefix for IPv4

  // Brevo webhook IP ranges (from official documentation)
  const BREVO_WEBHOOK_IPS = [
    "1.179.112.0/20", // 1.179.112.0 to 1.179.127.255
    "172.246.240.0/20", // 172.246.240.0 to 172.246.255.255
  ];

  // Enforce IP whitelist by default in production; allow explicit opt-out via env
  const enableIpWhitelist = process.env.BREVO_ENABLE_IP_WHITELIST
    ? process.env.BREVO_ENABLE_IP_WHITELIST === "true"
    : process.env.NODE_ENV === "production";

  if (enableIpWhitelist) {
    // Allow localhost IPs in development/test mode
    const isTestMode =
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test" ||
      process.env.BREVO_TEST_MODE === "development";

    const isLocalhost =
      clientIp === "127.0.0.1" ||
      clientIp === "::1" ||
      clientIp === "localhost" ||
      clientIp === "";

    if (isTestMode && isLocalhost) {
      console.log(
        `Webhook accepted from localhost in test mode: ${clientIp || "local"}`,
      );
    } else {
      // Validate IP is from Brevo
      const isValidIp = BREVO_WEBHOOK_IPS.some((cidr) => {
        try {
          return isIpInCidr(clientIp, cidr);
        } catch (error) {
          console.error(
            `Error checking IP ${clientIp} against ${cidr}:`,
            error,
          );
          return false;
        }
      });

      if (!isValidIp) {
        console.warn(
          `Webhook rejected - IP ${clientIp} not in Brevo whitelist`,
        );
        return false;
      }

      console.log(`Webhook accepted from Brevo IP: ${clientIp}`);
    }
  }

  // Check for webhook token (always required)
  const customToken =
    process.env.BREVO_WEBHOOK_TOKEN || process.env.BREVO_WEBHOOK_SECRET;
  const receivedToken =
    (req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ") &&
      req.headers.authorization.slice(7)) ||
    req.headers["x-brevo-token"] ||
    req.headers["x-webhook-token"];

  // Always require webhook token/secret
  if (!customToken) {
    console.error("❌ FATAL: BREVO_WEBHOOK_SECRET secret not configured");
    return false;
  }
  if (customToken && receivedToken !== customToken) {
    console.warn("Invalid webhook token received");
    return false;
  }

  // Log webhook receipt for monitoring
  if (!enableIpWhitelist) {
    console.log(
      `Brevo webhook received from IP: ${clientIp} (IP whitelist disabled)`,
    );
  }

  return true; // Accept webhook if it passes all configured checks
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
    // Validate webhook request (custom token, IP whitelist, etc.)
    if (!validateWebhookRequest(req)) {
      return res.status(401).json({ error: "Unauthorized webhook request" });
    }

    // Get raw body
    const rawBody = await getRawBody(req);

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
