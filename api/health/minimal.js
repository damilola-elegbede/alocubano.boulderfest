/**
 * Minimal health check endpoint for basic connectivity testing
 * This endpoint bypasses all complex health checking and circuit breakers
 * to provide a simple way to test if the API is responding
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Just return basic system information
    const health = {
      status: "healthy",
      service: "a-lo-cubano-boulder-fest",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "unknown",
      environment: {
        node_env: process.env.NODE_ENV || "production",
        vercel: process.env.VERCEL || "false",
        vercel_env: process.env.VERCEL_ENV || "unknown",
        vercel_region: process.env.VERCEL_REGION || "unknown"
      },
      database: {
        turso_configured: !!process.env.TURSO_DATABASE_URL,
        auth_token_configured: !!process.env.TURSO_AUTH_TOKEN
      },
      memory: {
        heap_used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heap_total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      },
      message: "Minimal health check - API is responsive"
    };

    // Set cache headers to prevent caching
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Content-Type", "application/json");
    
    // Always return 200 OK for this minimal check
    res.status(200).json(health);

  } catch (error) {
    console.error("Minimal health check error:", error);

    res.status(503).json({
      status: "unhealthy",
      error: "Minimal health check failure",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}