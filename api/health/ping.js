/**
 * Minimal synchronous health check endpoint
 *
 * This endpoint provides an instant health check without triggering
 * any database initialization or external service calls. Perfect for
 * Vercel dev server detection and basic liveness checks.
 */
export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = new Date().toISOString();

  // Immediate synchronous response
  res.status(200).json({
    status: 'healthy',
    service: 'a-lo-cubano-boulder-fest',
    timestamp: now,
    uptime: process.uptime(),
    version: process.env.npm_package_version || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    message: 'Server is running and responsive'
  });
}