/**
 * Fast E2E Health Check Endpoint
 * Optimized for E2E test validation with minimal latency
 */

import { getDatabaseClient } from "../lib/database.js";
import { addSecurityHeaders } from "../lib/security-headers.js";

export default async function handler(req, res) {
  const startTime = Date.now();
  
  try {
    // Apply security headers quickly
    await addSecurityHeaders(req, res, { isAPI: true });

    // Only allow GET requests
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Fast database connection check with timeout
    const dbPromise = getDatabaseClient();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database timeout')), 3000)
    );
    
    const db = await Promise.race([dbPromise, timeoutPromise]);
    
    // Super fast query - just check connection
    const dbStartTime = Date.now();
    await db.execute({ sql: "SELECT 1", args: [] });
    const dbTime = Date.now() - dbStartTime;

    const responseTime = Date.now() - startTime;

    // Set performance headers
    res.setHeader('X-Response-Time', responseTime);
    res.setHeader('X-DB-Time', dbTime);
    res.setHeader('X-E2E-Health', 'fast');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      performance: {
        responseTime,
        dbTime,
        target: 'e2e-fast'
      },
      services: {
        database: 'connected',
        api: 'operational'
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    res.setHeader('X-Response-Time', responseTime);
    res.setHeader('X-E2E-Health', 'fast-error');
    
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      performance: {
        responseTime,
        failed: true,
        target: 'e2e-fast'
      },
      services: {
        database: error.message.includes('Database') ? 'error' : 'unknown',
        api: 'partial'
      }
    });
  }
}