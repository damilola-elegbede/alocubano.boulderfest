/**
 * Security Headers Test Endpoint
 * Demonstrates the comprehensive security headers implementation
 * Used for testing A+ security rating compliance
 */

import { createSecurityMiddleware } from "../../middleware/security.js";

/**
 * Test security headers implementation
 */
async function testSecurityHeaders(req, res) {
  // Only allow access in development or test environments
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.ENABLE_DEBUG_ENDPOINTS
  ) {
    return res.status(404).json({ error: "Not found" });
  }

  res.status(200).json({
    message: "Security headers test endpoint",
    security: {
      headers_applied: true,
      csp_enabled: true,
      hsts_enabled: process.env.VERCEL_ENV === "production",
      rate_limiting: "active",
      cors_configured: true,
    },
    request_info: {
      method: req.method,
      user_agent: req.headers["user-agent"] || "unknown",
      timestamp: new Date().toISOString(),
    },
    security_features: {
      content_security_policy: {
        enabled: true,
        report_uri: "/api/security/csp-report",
        trusted_domains: ["stripe.com", "brevo.com", "googleapis.com"],
      },
      strict_transport_security: {
        enabled: process.env.VERCEL_ENV === "production",
        max_age: 63072000,
        include_subdomains: true,
        preload: true,
      },
      permissions_policy: {
        enabled: true,
        restricted_features: [
          "camera",
          "microphone",
          "geolocation",
          "usb",
          "payment (self only)",
        ],
      },
      rate_limiting: {
        enabled: true,
        window: "15 minutes",
        max_requests: 100,
        endpoint_type: "api",
      },
    },
  });
}

// Apply API security middleware
export default createSecurityMiddleware("api", {
  maxAge: 300, // Cache for 5 minutes
  corsOrigins: [
    "https://alocubanoboulderfest.vercel.app",
    "https://alocubanoboulderfest-git-main.vercel.app",
  ],
})(testSecurityHeaders);
