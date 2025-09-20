/**
 * Serverless-Compatible Security Headers
 * Implements security headers without Helmet.js dependency for Vercel Functions
 */

/**
 * Environment configuration
 */
function isProduction() {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

/**
 * Apply security headers directly without Helmet
 * Compatible with Vercel serverless functions
 */
export function addSecurityHeaders(res, options = {}) {
  const { isAPI = false } = options;

  // Core security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()'
  );

  // HSTS for production
  if (isProduction()) {
    res.setHeader('Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://vercel.live",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://vercel.com",
    "font-src 'self' data: https://fonts.gstatic.com https://vercel.live",
    "img-src 'self' data: https: https://drive.google.com https://*.googleusercontent.com https://vercel.com",
    "connect-src 'self' https://api.stripe.com https://m.stripe.com https://m.stripe.network https://api.brevo.com https://www.google-analytics.com https://vercel.live https://*.pusher.com wss://*.pusher.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://vercel.live",
    "media-src 'self' https://drive.google.com https://*.googleusercontent.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "manifest-src 'self'"
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  // Additional headers for APIs
  if (isAPI) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  // CORS headers for admin endpoints
  const allowedOrigins = [
    'https://alocubano.boulderfest.com',
    'https://alocubanoboulderfest.ngrok.io'
  ];

  // In development, allow localhost
  if (!isProduction()) {
    allowedOrigins.push('http://localhost:3000');
    allowedOrigins.push('http://localhost:3001');
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Additional security headers
  res.setHeader('X-Robots-Tag', 'noindex');

  // Google Drive preconnect
  res.setHeader('Link', '<https://drive.google.com>; rel=preconnect; crossorigin');
}

/**
 * Wrapper function for handlers with security headers
 * Compatible with Vercel serverless functions
 */
export function withSecurityHeaders(handler, options = {}) {
  return async (req, res) => {
    try {
      // Add security headers
      addSecurityHeaders(res, options);

      // Execute the handler
      return await handler(req, res);
    } catch (error) {
      console.error("Handler error:", error);

      // Ensure security headers are set even on error
      if (!res.headersSent) {
        addSecurityHeaders(res, options);
        res.status(500).json({
          error: 'Internal server error',
          message: process.env.NODE_ENV !== 'production' ? error.message : undefined
        });
      }
    }
  };
}

export default {
  addSecurityHeaders,
  withSecurityHeaders,
  isProduction: isProduction()
};