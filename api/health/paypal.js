/**
 * PayPal Health Check Endpoint
 * Tests PayPal connectivity and configuration
 * Returns environment mode, configuration status, and authentication test results
 */

import { validatePayPalConfig, getPayPalEnvironmentInfo } from '../../lib/paypal-config-validator.js';

// PayPal API base URL
const PAYPAL_API_URL = process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com';

/**
 * Tests PayPal authentication by requesting an access token
 * @returns {Promise<Object>} Authentication test result
 */
async function testPayPalAuth() {
  try {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      return {
        success: false,
        error: 'Missing credentials',
        details: 'PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET not configured'
      };
    }

    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');

    const startTime = Date.now();
    const tokenResponse = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    const responseTime = Date.now() - startTime;

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      return {
        success: false,
        statusCode: tokenResponse.status,
        error: 'Authentication failed',
        details: errorData.error_description || errorData.error || 'Unknown error',
        responseTime
      };
    }

    const tokenData = await tokenResponse.json();

    return {
      success: true,
      statusCode: 200,
      message: 'Authentication successful',
      responseTime,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope
    };
  } catch (error) {
    return {
      success: false,
      error: 'Connection error',
      details: error.message
    };
  }
}

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get configuration validation
    const validation = validatePayPalConfig();

    // Get environment info
    const envInfo = getPayPalEnvironmentInfo();

    // Test authentication
    const authTest = await testPayPalAuth();

    // Build response
    const response = {
      status: validation.valid && authTest.success ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: {
        mode: envInfo.mode,
        apiUrl: envInfo.apiUrl,
        isSandbox: envInfo.isSandbox,
        hasCredentials: envInfo.hasCredentials,
        configuredExplicitly: envInfo.configuredExplicitly
      },
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        info: validation.info
      },
      authentication: authTest,
      recommendations: []
    };

    // Add recommendations based on findings
    if (!validation.valid) {
      response.recommendations.push(
        'Fix configuration errors listed above before using PayPal in production'
      );
    }

    if (validation.warnings.length > 0) {
      response.recommendations.push(
        'Review warnings to ensure correct environment configuration'
      );
    }

    if (!authTest.success) {
      response.recommendations.push(
        'Authentication test failed. Verify credentials in PayPal Developer Dashboard'
      );

      if (envInfo.isSandbox && !envInfo.configuredExplicitly) {
        response.recommendations.push(
          'Using default sandbox URL. For production, set PAYPAL_API_URL=https://api-m.paypal.com'
        );
      }
    }

    if (authTest.success && envInfo.isSandbox && process.env.NODE_ENV === 'production') {
      response.recommendations.push(
        '⚠️  WARNING: Production environment detected but using sandbox PayPal. Set PAYPAL_MODE=production and PAYPAL_API_URL=https://api-m.paypal.com'
      );
    }

    // Return appropriate status code
    const statusCode = response.status === 'healthy' ? 200 : 503;
    return res.status(statusCode).json(response);

  } catch (error) {
    console.error('PayPal health check error:', error);
    return res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      message: 'Health check failed'
    });
  }
}
