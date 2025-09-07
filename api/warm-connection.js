/**
 * Connection Warmup Endpoint
 * Pre-warms database connections and services for E2E tests
 */

import { getDatabaseClient } from "./lib/database.js";
import { addSecurityHeaders } from "./lib/security-headers.js";

export default async function handler(req, res) {
  const startTime = Date.now();
  
  try {
    // Apply security headers
    await addSecurityHeaders(req, res, { isAPI: true });

    // Only allow POST requests for warmup
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Only allow in test/preview environments
    const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                               process.env.CI === 'true' || 
                               process.env.E2E_TEST_MODE === 'true' ||
                               process.env.VERCEL_ENV === 'preview' ||
                               req.headers['user-agent']?.includes('Playwright');

    if (!isTestEnvironment) {
      return res.status(404).json({ error: 'Not found' });
    }

    const operations = [];
    const timings = {};

    // 1. Warm up database connection
    const dbStartTime = Date.now();
    try {
      const db = await getDatabaseClient();
      await db.execute({ sql: "SELECT 1", args: [] });
      timings.database = Date.now() - dbStartTime;
      operations.push({ name: 'database', status: 'warmed', time: timings.database });
    } catch (error) {
      timings.database = Date.now() - dbStartTime;
      operations.push({ name: 'database', status: 'failed', time: timings.database, error: error.message });
    }

    // 2. Test authentication service if available
    const authStartTime = Date.now();
    try {
      // Import auth service to warm up the module
      const authService = await import("./lib/auth-service.js");
      timings.authService = Date.now() - authStartTime;
      operations.push({ name: 'authService', status: 'loaded', time: timings.authService });
    } catch (error) {
      timings.authService = Date.now() - authStartTime;
      operations.push({ name: 'authService', status: 'failed', time: timings.authService, error: error.message });
    }

    // 3. Pre-load security headers service
    const securityStartTime = Date.now();
    try {
      // Security headers service is already loaded, just mark timing
      timings.security = Date.now() - securityStartTime;
      operations.push({ name: 'security', status: 'loaded', time: timings.security });
    } catch (error) {
      timings.security = Date.now() - securityStartTime;
      operations.push({ name: 'security', status: 'failed', time: timings.security, error: error.message });
    }

    const totalTime = Date.now() - startTime;

    res.setHeader('X-Warmup-Time', totalTime);
    res.setHeader('X-E2E-Warmup', 'complete');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.status(200).json({
      success: true,
      message: 'Connection warmup completed',
      timestamp: new Date().toISOString(),
      performance: {
        totalTime,
        operations: operations.length
      },
      operations,
      timings
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    res.setHeader('X-Warmup-Time', totalTime);
    res.setHeader('X-E2E-Warmup', 'failed');
    
    res.status(500).json({
      success: false,
      error: 'Warmup failed',
      message: error.message,
      timestamp: new Date().toISOString(),
      performance: {
        totalTime,
        failed: true
      }
    });
  }
}