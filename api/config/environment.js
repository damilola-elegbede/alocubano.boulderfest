/**
 * Environment Configuration Endpoint
 * Returns the current environment (development, preview, production)
 * Used for conditional rendering of test features
 */

export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get environment information
  const nodeEnv = process.env.NODE_ENV || 'development';
  const vercelEnv = process.env.VERCEL_ENV || nodeEnv;

  // Return environment information
  return res.status(200).json({
    environment: nodeEnv,
    vercelEnv: vercelEnv,
    isProduction: vercelEnv === 'production',
    isDevelopment: vercelEnv === 'development',
    isPreview: vercelEnv === 'preview'
  });
}