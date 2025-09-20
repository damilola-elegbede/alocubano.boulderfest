import { getMobileAuthService } from "../../lib/mobile-auth-service.js";
import { addSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { getRateLimitService } from "../../lib/rate-limit-service.js";
import { withAuthAudit } from "../../lib/admin-audit-middleware.js";

/**
 * Mobile check-in login endpoint with extended 72-hour sessions
 * Simplified authentication for event staff
 */
async function handler(req, res) {
  // Apply security headers
  addSecurityHeaders(res);

  // Add no-store headers for sensitive authentication data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const mobileAuth = getMobileAuthService();
    const rateLimitService = getRateLimitService();

    // Get client IP address for rate limiting
    const clientId = rateLimitService.getClientId(req);

    // Check if client is locked out
    if (rateLimitService.isLockedOut(clientId)) {
      const remainingSeconds =
        rateLimitService.getRemainingLockoutTime(clientId);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      return res.status(429).json({
        error: 'Too many login attempts',
        details: `Account locked. Try again in ${remainingMinutes} minutes.`
      });
    }

    // Parse request body
    const { password } = req.body;

    // Note: CSRF protection is not needed for login endpoints since there's no existing session to protect
    // The login itself establishes the session

    // Validate input - ensure password is provided and is a string
    if (!password || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        details: 'Password is required'
      });
    }

    // Additional password validation
    if (password.length > 100) {
      return res.status(400).json({
        error: 'Invalid input',
        details: 'Password is too long'
      });
    }

    // Verify staff password
    const isValidPassword = await mobileAuth.verifyStaffPassword(password);

    if (!isValidPassword) {
      // Record failed attempt for rate limiting
      rateLimitService.recordFailedAttempt(clientId);

      // Log failed attempt
      console.log('Failed mobile login attempt from:', clientId);

      return res.status(401).json({
        error: 'Invalid password'
      });
    }

    // Clear rate limit attempts on successful login
    rateLimitService.clearFailedAttempts(clientId);

    // Create extended 72-hour session token for mobile check-in
    const sessionToken = mobileAuth.createMobileSessionToken(
      'checkin_staff',
      'checkin_staff'
    );

    // Create session cookie
    const sessionCookie = mobileAuth.createMobileSessionCookie(
      sessionToken,
      'checkin_staff'
    );

    // Set cookie
    res.setHeader('Set-Cookie', sessionCookie);

    // Log successful login
    console.log('Mobile check-in staff logged in successfully');

    // Get the configured session duration
    const sessionDuration =
      mobileAuth.roleDurations.checkin_staff || mobileAuth.sessionDuration;

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      role: 'checkin_staff',
      sessionDuration: '72 hours',
      expiresAt: new Date(Date.now() + sessionDuration).toISOString()
      // token removed for security - session token is provided via httpOnly cookie only
    });
  } catch (error) {
    console.error('Mobile login error:', error);
    return res.status(500).json({
      error: 'Login failed',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export default withAuthAudit(handler, {
  logLoginAttempts: true,
  logFailedAttempts: true,
  logSessionEvents: true
});
