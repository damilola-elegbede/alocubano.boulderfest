/**
 * Simple Login Endpoint - Test Environment Only
 *
 * Provides a simplified login mechanism for test environments that bypasses MFA.
 * This endpoint is ONLY available in test environments and returns 404 in production.
 *
 * Security: This endpoint is intentionally restricted to test environments only.
 */

import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";
import { logger } from "../../lib/logger.js";

async function handler(req, res) {
  // Check if we're in a test environment
  const isTestEnvironment =
    process.env.NODE_ENV === 'test' ||
    process.env.CI === 'true' ||
    process.env.SKIP_MFA === 'true' ||
    process.env.E2E_TEST_MODE === 'true' ||
    process.env.VERCEL_ENV === 'preview';

  // Return 404 in production environments
  if (!isTestEnvironment) {
    return res.status(404).json({
      error: 'Not found'
    });
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username) {
      return res.status(400).json({
        error: 'Username is required'
      });
    }

    if (!password) {
      return res.status(400).json({
        error: 'Password is required'
      });
    }

    // Verify credentials - both username and password must be correct
    if (username !== 'admin') {
      logger.warn('[SimpleLogin] Failed login attempt - invalid username in test environment', {
        username,
        environment: process.env.NODE_ENV
      });

      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const isValid = await authService.verifyPassword(password);

    if (!isValid) {
      logger.warn('[SimpleLogin] Failed login attempt - invalid password in test environment', {
        username,
        environment: process.env.NODE_ENV
      });

      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Generate session token (no MFA required)
    const token = await authService.createSessionToken(username);

    // Set secure cookie
    const isSecure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';

    res.setHeader('Set-Cookie',
      `admin_session=${token}; ` +
      'HttpOnly; ' +
      'SameSite=Strict; ' +
      (isSecure ? 'Secure; ' : '') +
      'Path=/; ' +
      'Max-Age=3600'
    );

    logger.info('[SimpleLogin] Successful test environment login', {
      username,
      environment: process.env.NODE_ENV
    });

    return res.status(200).json({
      success: true,
      adminId: username,
      token: token,
      expiresIn: authService.sessionDuration,
      message: 'Login successful (test environment) - MFA bypassed'
    });

  } catch (error) {
    logger.error('[SimpleLogin] Login error:', error);

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

export default withSecurityHeaders(handler);