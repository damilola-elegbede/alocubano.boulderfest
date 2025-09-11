import { getAuthService } from '../../lib/auth-service.js';
import { withSecurityHeaders } from '../../lib/security-headers.js';

/**
 * Secure debug endpoint for testing import functionality
 * SECURITY: Requires admin authentication and development environment
 */
async function debugImportsHandler(req, res) {
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
    console.log(`[${timestamp}] Debug imports: Starting import test`);
    
    const results = {
      timestamp,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
        isProduction: process.env.NODE_ENV === 'production'
      },
      tests: []
    };

    // Test individual imports with error handling
    const importTests = [
      { name: 'authService', path: '../../lib/auth-service.js' },
      { name: 'database', path: '../../lib/database.js' },
      { name: 'securityHeaders', path: '../../lib/security-headers.js' },
      { name: 'mfaMiddleware', path: '../../lib/mfa-middleware.js' },
      { name: 'rateLimitService', path: '../../lib/rate-limit-service.js' }
    ];

    for (const test of importTests) {
      try {
        const module = await import(test.path);
        results.tests.push({
          name: test.name,
          status: 'success',
          hasDefault: typeof module.default !== 'undefined',
          exportedKeys: Object.keys(module).filter(key => key !== 'default')
        });
        console.log(`[${timestamp}] Debug imports: ${test.name} imported successfully`);
      } catch (error) {
        results.tests.push({
          name: test.name,
          status: 'failed',
          error: process.env.NODE_ENV === 'development' ? error.message : 'Import failed'
        });
        console.error(`[${timestamp}] Debug imports: ${test.name} failed:`, 
          process.env.NODE_ENV === 'development' ? error.message : 'Import failed');
      }
    }

    // Test rate limit service functionality if imported successfully
    const rateLimitTest = results.tests.find(t => t.name === 'rateLimitService');
    if (rateLimitTest && rateLimitTest.status === 'success') {
      try {
        const { getRateLimitService } = await import("../../lib/rate-limit-service.js");
        const service = getRateLimitService();
        results.rateLimitService = {
          available: true,
          hasRecordMethod: typeof service.recordFailedAttempt === 'function',
          methods: Object.getOwnPropertyNames(service).filter(name => typeof service[name] === 'function')
        };
      } catch (error) {
        results.rateLimitService = {
          available: false,
          error: process.env.NODE_ENV === 'development' ? error.message : 'Service test failed'
        };
      }
    }

    console.log(`[${timestamp}] Debug imports: Test completed successfully`);
    
    res.status(200).json({
      success: true,
      message: "Import diagnostics completed",
      data: results
    });
    
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Debug imports: Test failed:`, error);
    
    // SECURITY: Don't expose stack traces in production
    const errorResponse = {
      success: false,
      error: "Import diagnostic test failed",
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
    return await authService.requireAuth(debugImportsHandler)(req, res);
  } catch (error) {
    console.error('Debug imports auth middleware error:', error);
    
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