// Test endpoint to isolate the issue
export default async function handler(req, res) {
  try {
    // Test importing each module separately
    const results = {};
    
    try {
      const authService = await import('../../lib/auth-service.js');
      results.authService = 'loaded';
    } catch (e) {
      results.authService = `failed: ${e.message}`;
    }
    
    try {
      const { getDatabaseClient } = await import('../../lib/database.js');
      results.database = 'loaded';
    } catch (e) {
      results.database = `failed: ${e.message}`;
    }
    
    try {
      const { getRateLimitService } = await import('../../lib/rate-limit-service.js');
      results.rateLimitService = 'loaded';
    } catch (e) {
      results.rateLimitService = `failed: ${e.message}`;
    }
    
    try {
      const { withSecurityHeaders } = await import('../../lib/security-headers.js');
      results.securityHeaders = 'loaded';
    } catch (e) {
      results.securityHeaders = `failed: ${e.message}`;
    }
    
    res.status(200).json({
      success: true,
      modules: results,
      env: {
        hasAdminPassword: !!process.env.ADMIN_PASSWORD,
        hasAdminSecret: !!process.env.ADMIN_SECRET,
        hasTestAdminPassword: !!process.env.TEST_ADMIN_PASSWORD,
        vercelEnv: process.env.VERCEL_ENV
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}