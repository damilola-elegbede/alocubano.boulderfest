import { getDatabaseClient } from "./lib/database.js";
import { addSecurityHeaders } from "./lib/security-headers.js";

export default async function handler(req, res) {
  // Set performance headers immediately
  const startTime = Date.now();
  
  // Add fast caching headers for test endpoints
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('X-Test-Endpoint', 'true');

  try {
    // Apply standard API security headers
    await addSecurityHeaders(req, res, { isAPI: true });

    // Disable in production unless explicitly enabled
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_ENDPOINT !== "true") {
      return res.status(404).json({ error: "Not found" });
    }

    // Method guard: only allow GET
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    console.log("Test endpoint called");
    
    // Optimize for E2E tests - use cached connection if available
    const isE2ETest = req.headers['user-agent']?.includes('Playwright') || 
                     process.env.E2E_TEST_MODE === 'true';
    
    // Test database connection with timeout for E2E
    const dbPromise = getDatabaseClient();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout')), 5000)
    );
    
    const db = await Promise.race([dbPromise, timeoutPromise]);
    console.log("Database client obtained");
    
    // Use fast query with query timeout
    const queryStartTime = Date.now();
    const result = await db.execute({
      sql: "SELECT COUNT(*) as total FROM tickets LIMIT 1",
      args: []
    });
    const queryTime = Date.now() - queryStartTime;
    
    console.log(`Query executed successfully in ${queryTime}ms`);
    
    const responseTime = Date.now() - startTime;
    
    // Add performance metrics for E2E monitoring
    res.setHeader('X-Response-Time', responseTime);
    res.setHeader('X-DB-Query-Time', queryTime);
    
    return res.status(200).json({
      success: true,
      total: result.rows[0].total,
      message: "Database connection working",
      performance: {
        responseTime,
        queryTime,
        isE2ETest
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Test endpoint error:", error);
    const responseTime = Date.now() - startTime;
    res.setHeader('X-Response-Time', responseTime);
    
    const payload = { 
      error: "Database error",
      performance: {
        responseTime,
        failed: true
      },
      timestamp: new Date().toISOString()
    };
    
    if (process.env.NODE_ENV !== "production") {
      payload.details = error.message;
    }
    return res.status(500).json(payload);
  }
}