import { getAuthService } from '../../lib/auth-service.js';
import { withSecurityHeaders } from '../../lib/security-headers.js';

/**
 * Secure debug endpoint for testing environment configuration
 * SECURITY: Requires admin authentication and development environment
 * SECURITY: Redacts sensitive values to prevent information disclosure
 */
async function debugSecretsHandler(req, res) {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  // SECURITY: Only allow GET method
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Debug secrets: Starting configuration test`);

    const response = {
      timestamp,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        VERCEL: !!process.env.VERCEL,
        platform: process.platform,
        runtime: typeof process.versions?.node ? 'node' : 'edge'
      },
      tests: []
    };

    // SECURITY: Check environment variables without exposing values
    const secretsToCheck = [
      'ADMIN_SECRET',
      'ADMIN_PASSWORD', 
      'TEST_ADMIN_PASSWORD',
      'TURSO_AUTH_TOKEN',
      'TURSO_DATABASE_URL'
    ];

    for (const secretName of secretsToCheck) {
      try {
        const value = process.env[secretName];
        response.tests.push({
          name: secretName,
          status: value ? 'configured' : 'missing',
          // SECURITY: Don't expose actual values or lengths that could indicate content
          hasValue: !!value,
          type: value ? typeof value : 'undefined'
        });
      } catch (error) {
        response.tests.push({
          name: secretName,
          status: 'error',
          hasValue: false,
          error: process.env.NODE_ENV === 'development' ? error.message : 'Access error'
        });
      }
    }

    // Test service instantiation without exposing internal details
    const serviceTests = [
      {
        name: 'AuthService',
        test: async () => {
          const { getAuthService } = await import("../../lib/auth-service.js");
          const authService = getAuthService();
          return { available: !!authService, initialized: true };
        }
      },
      {
        name: 'bcryptjs',
        test: async () => {
          const bcrypt = await import("bcryptjs");
          // Test basic functionality without exposing details
          const testResult = await bcrypt.hash("test", 10);
          return { available: true, functional: testResult.length > 0 };
        }
      },
      {
        name: 'RateLimitService',
        test: async () => {
          const { getRateLimitService } = await import("../../lib/rate-limit-service.js");
          const service = getRateLimitService();
          return { 
            available: !!service, 
            hasRequiredMethods: typeof service.recordFailedAttempt === 'function'
          };
        }
      }
    ];

    for (const serviceTest of serviceTests) {
      try {
        const result = await serviceTest.test();
        response.tests.push({
          name: serviceTest.name,
          status: 'success',
          ...result
        });
        console.log(`[${timestamp}] Debug secrets: ${serviceTest.name} test passed`);
      } catch (error) {
        response.tests.push({
          name: serviceTest.name,
          status: 'failed',
          error: process.env.NODE_ENV === 'development' ? error.message : 'Service test failed'
        });
        console.error(`[${timestamp}] Debug secrets: ${serviceTest.name} test failed:`, 
          process.env.NODE_ENV === 'development' ? error.message : 'Service test failed');
      }
    }

    console.log(`[${timestamp}] Debug secrets: Configuration test completed`);
    
    res.status(200).json({
      success: true,
      message: "Configuration diagnostics completed",
      data: response
    });

  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Debug secrets: Test failed:`, error);
    
    // SECURITY: Don't expose stack traces or internal details
    const errorResponse = {
      success: false,
      error: "Configuration diagnostic test failed",
      timestamp
    };

    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = error.message;
    }

    res.status(500).json(errorResponse);
  }
}

// SECURITY: Wrap with auth middleware and security headers
export default withSecurityHeaders(async (req, res) => {
  try {
    const authService = getAuthService();
    return await authService.requireAuth(debugSecretsHandler)(req, res);
  } catch (error) {
    console.error('Debug secrets auth middleware error:', error);
    
    // SECURITY: Don't expose service errors in production
    if (process.env.NODE_ENV === 'development') {
      return res.status(503).json({ 
        error: 'Service temporarily unavailable',
        details: error.message
      });
    }
    
    return res.status(404).json({ error: 'Not found' });
  }
});