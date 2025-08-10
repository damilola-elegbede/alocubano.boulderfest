/**
 * Simple health check endpoint for debugging
 * Tests basic functionality without external dependencies
 */

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Basic health check without dependencies
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: {
        node_version: process.version,
        has_turso_url: !!process.env.TURSO_DATABASE_URL,
        has_turso_token: !!process.env.TURSO_AUTH_TOKEN,
        has_stripe_key: !!process.env.STRIPE_SECRET_KEY,
        has_brevo_key: !!process.env.BREVO_API_KEY
      },
      system: {
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      }
    };
    
    res.status(200).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}