/**
 * Debug endpoint to test security secret accessibility
 * This endpoint tests if missing or inaccessible secrets are causing the crash
 */

export default async function handler(req, res) {
  try {
    // Test 1: Basic response capability
    const response = {
      timestamp: new Date().toISOString(),
      tests: []
    };

    // Test 2: Check all security-related environment variables
    const secrets = [
      'ADMIN_SECRET',
      'ADMIN_PASSWORD', 
      'TEST_ADMIN_PASSWORD',
      'TURSO_AUTH_TOKEN',
      'TURSO_DATABASE_URL'
    ];

    for (const secret of secrets) {
      try {
        const value = process.env[secret];
        response.tests.push({
          secret,
          status: value ? 'present' : 'missing',
          length: value?.length || 0,
          type: typeof value,
          accessible: true
        });
      } catch (error) {
        response.tests.push({
          secret,
          status: 'error',
          error: error.message,
          accessible: false
        });
      }
    }

    // Test 3: Try to instantiate AuthService
    try {
      const { AuthService } = await import("../../lib/auth-service.js");
      const authService = new AuthService();
      response.tests.push({
        test: 'AuthService',
        status: 'success',
        accessible: true
      });
    } catch (error) {
      response.tests.push({
        test: 'AuthService',
        status: 'error',
        error: error.message,
        accessible: false
      });
    }

    // Test 4: Try bcrypt operations
    try {
      const bcrypt = await import("bcryptjs");
      const testHash = await bcrypt.hash("test", 10);
      response.tests.push({
        test: 'bcrypt',
        status: 'success',
        accessible: true,
        hashLength: testHash.length
      });
    } catch (error) {
      response.tests.push({
        test: 'bcrypt',
        status: 'error',
        error: error.message,
        accessible: false
      });
    }

    // Test 5: Try rate limit service instantiation
    try {
      const { getRateLimitService } = await import("../../lib/rate-limit-service.js");
      const rateLimitService = getRateLimitService();
      response.tests.push({
        test: 'RateLimitService',
        status: 'success',
        accessible: true,
        methods: Object.keys(rateLimitService)
      });
    } catch (error) {
      response.tests.push({
        test: 'RateLimitService', 
        status: 'error',
        error: error.message,
        accessible: false
      });
    }

    // Test 6: Check Vercel runtime environment
    response.tests.push({
      test: 'Runtime',
      status: 'success',
      vercel: process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
      platform: process.platform,
      runtime: typeof process.versions?.node ? 'node' : 'edge'
    });

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: "Debug endpoint failed",
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}