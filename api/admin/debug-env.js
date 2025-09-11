/**
 * Diagnostic endpoint to check environment variable availability
 * This helps debug Vercel deployment issues
 */

export default async function handler(req, res) {
  // Only allow in non-production for security
  if (process.env.VERCEL_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  // Check critical environment variables
  const envCheck = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'NOT_SET',
      VERCEL_ENV: process.env.VERCEL_ENV || 'NOT_SET',
      VERCEL: process.env.VERCEL || 'NOT_SET',
      CI: process.env.CI || 'NOT_SET'
    },
    adminConfig: {
      ADMIN_SECRET: process.env.ADMIN_SECRET ? 
        `SET (length: ${process.env.ADMIN_SECRET.length})` : 'NOT_SET',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? 
        `SET (starts with: ${process.env.ADMIN_PASSWORD.substring(0, 4)})` : 'NOT_SET',
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD ? 
        `SET (length: ${process.env.TEST_ADMIN_PASSWORD.length})` : 'NOT_SET',
      ADMIN_SESSION_DURATION: process.env.ADMIN_SESSION_DURATION || 'NOT_SET'
    },
    otherSecrets: {
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? 'SET' : 'NOT_SET',
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'SET' : 'NOT_SET',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'SET' : 'NOT_SET',
      BREVO_API_KEY: process.env.BREVO_API_KEY ? 'SET' : 'NOT_SET'
    },
    processInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    }
  };

  res.status(200).json(envCheck);
}