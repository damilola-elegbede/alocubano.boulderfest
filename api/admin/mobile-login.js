import { getMobileAuthService } from "../lib/mobile-auth-service.js";
import { getCsrfService } from "../lib/csrf-service.js";
import { validateInput } from "../lib/validation-service.js";
import { applySecurityHeaders } from "../lib/security-headers.js";

/**
 * Mobile check-in login endpoint with extended 72-hour sessions
 * Simplified authentication for event staff
 */
export default async function handler(req, res) {
  // Apply security headers
  applySecurityHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const mobileAuth = getMobileAuthService();
    const csrfService = getCsrfService();

    // Parse request body
    const { password, csrfToken } = req.body;

    // Validate CSRF token
    const csrfValidation = csrfService.validateToken(
      csrfToken,
      req.headers["x-csrf-token"],
    );

    if (!csrfValidation.valid) {
      return res.status(403).json({
        error: "Invalid CSRF token",
        details: csrfValidation.error,
      });
    }

    // Validate input
    const validation = validateInput({ password }, { password: "password" });

    if (!validation.isValid) {
      return res.status(400).json({
        error: "Invalid input",
        details: validation.errors,
      });
    }

    // Verify staff password
    const isValidPassword = await mobileAuth.verifyStaffPassword(password);

    if (!isValidPassword) {
      // Log failed attempt
      console.log("Failed mobile login attempt from:", req.headers["x-forwarded-for"] || req.connection.remoteAddress);
      
      return res.status(401).json({
        error: "Invalid password",
      });
    }

    // Create extended 72-hour session token for mobile check-in
    const sessionToken = mobileAuth.createMobileSessionToken(
      "checkin_staff",
      "checkin_staff"
    );

    // Create session cookie
    const sessionCookie = mobileAuth.createMobileSessionCookie(
      sessionToken,
      "checkin_staff"
    );

    // Set cookie
    res.setHeader("Set-Cookie", sessionCookie);

    // Log successful login
    console.log("Mobile check-in staff logged in successfully");

    return res.status(200).json({
      success: true,
      message: "Login successful",
      role: "checkin_staff",
      sessionDuration: "72 hours",
      expiresAt: new Date(Date.now() + 259200000).toISOString(), // 72 hours from now
    });
  } catch (error) {
    console.error("Mobile login error:", error);
    return res.status(500).json({
      error: "Login failed",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}