/**
 * Email Subscription API Endpoint
 * Handles newsletter signup requests
 */

import { getEmailSubscriberService } from "../lib/email-subscriber-service.js";

// Rate limiting storage (in production, use Redis or similar)
const rateLimitMap = new Map();

/**
 * Rate limiting middleware
 */
function rateLimit(req, res) {
  const ip =
    req.headers["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    "127.0.0.1";
  const limit = parseInt(process.env.RATE_LIMIT_EMAIL_SUBSCRIPTION) || 20;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  const key = `subscribe_${ip}`;
  const now = Date.now();

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 0, resetTime: now + windowMs });
  }

  const rateData = rateLimitMap.get(key);

  if (now > rateData.resetTime) {
    rateData.count = 0;
    rateData.resetTime = now + windowMs;
  }

  if (rateData.count >= limit) {
    return res.status(429).json({
      error: "Too many requests. Please try again later.",
      retryAfter: Math.ceil((rateData.resetTime - now) / 1000),
    });
  }

  rateData.count++;
  return null;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize input data
 */
function sanitizeInput(data) {
  const sanitized = {};

  if (data.email) {
    sanitized.email = data.email.toLowerCase().trim();
  }

  if (data.firstName) {
    sanitized.firstName = data.firstName.trim().slice(0, 100);
  }

  if (data.lastName) {
    sanitized.lastName = data.lastName.trim().slice(0, 100);
  }

  if (data.phone) {
    sanitized.phone = data.phone.trim().slice(0, 50);
  }

  if (data.source) {
    sanitized.source = data.source.trim().slice(0, 100);
  }

  if (data.attributes && typeof data.attributes === "object") {
    sanitized.attributes = {};
    Object.keys(data.attributes).forEach((key) => {
      if (typeof data.attributes[key] === "string") {
        sanitized.attributes[key] = data.attributes[key].trim().slice(0, 500);
      }
    });
  }

  return sanitized;
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
 * Main handler function
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    // Rate limiting
    const rateLimitResponse = rateLimit(req, res);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Validate request body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "Invalid request body",
      });
    }

    // Sanitize input
    const sanitized = sanitizeInput(req.body);

    // Validate required fields
    if (!sanitized.email) {
      return res.status(400).json({
        error: "Email address is required",
      });
    }

    if (!isValidEmail(sanitized.email)) {
      return res.status(400).json({
        error: "Please enter a valid email address",
      });
    }

    // Check consent
    if (!req.body.consentToMarketing) {
      return res.status(400).json({
        error: "Marketing consent is required",
      });
    }

    // Ensure services are initialized
    const emailService = await getEmailSubscriberService().ensureInitialized();

    // Prepare subscriber data
    const subscriberData = {
      email: sanitized.email,
      firstName: sanitized.firstName,
      lastName: sanitized.lastName,
      phone: sanitized.phone,
      status:
        process.env.REQUIRE_EMAIL_VERIFICATION === "true"
          ? "pending"
          : "active",
      listIds: req.body.lists || [parseInt(process.env.BREVO_NEWSLETTER_LIST_ID) || (() => {
        throw new Error("❌ FATAL: BREVO_NEWSLETTER_LIST_ID secret not configured");
      })()], // Require newsletter list ID
      attributes: {
        SIGNUP_PAGE: req.body.source || "unknown",
        SIGNUP_DATE: new Date().toISOString(),
        CONSENT_DATE: new Date().toISOString(),
        ...sanitized.attributes,
      },
      consentSource: sanitized.source || "website",
      consentIp: getClientIp(req),
      verificationToken:
        process.env.REQUIRE_EMAIL_VERIFICATION === "true"
          ? emailService.generateVerificationToken()
          : null,
    };

    // Create subscriber
    const subscriber = await emailService.createSubscriber(subscriberData);

    // Send verification email if required
    if (
      process.env.REQUIRE_EMAIL_VERIFICATION === "true" &&
      subscriberData.verificationToken
    ) {
      await emailService.brevoService.sendVerificationEmail(
        subscriber.email,
        subscriberData.verificationToken,
        subscriber.first_name,
      );
    }

    // Success response
    const response = {
      success: true,
      message:
        process.env.REQUIRE_EMAIL_VERIFICATION === "true"
          ? "Please check your email to verify your subscription"
          : "Successfully subscribed to newsletter",
      subscriber: {
        email: subscriber.email,
        status: subscriber.status,
        requiresVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
      },
    };

    return res.status(201).json(response);
  } catch (error) {
    console.error("Newsletter subscription error:", {
      error: error.message,
      email: req.body?.email,
      ip: getClientIp(req),
      timestamp: new Date().toISOString(),
    });

    // Handle specific errors
    if (
      error.message.includes("Failed to initialize email subscriber service")
    ) {
      return res.status(503).json({
        error:
          "Email service is currently initializing. Please try again in a moment.",
      });
    }

    if (error.message.includes("already subscribed")) {
      return res.status(409).json({
        error: "This email address is already subscribed to our newsletter",
      });
    }

    if (error.message.includes("invalid email")) {
      return res.status(400).json({
        error: "Please enter a valid email address",
      });
    }

    if (error.message.includes("Brevo API error")) {
      return res.status(503).json({
        error: "Email service temporarily unavailable. Please try again later.",
      });
    }

    // Generic error response
    return res.status(500).json({
      error:
        "An error occurred while processing your subscription. Please try again.",
    });
  }
}
