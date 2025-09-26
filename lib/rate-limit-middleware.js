/**
 * Simple Rate Limiting Middleware
 * Provides Express middleware for rate limiting API endpoints
 */

import { getRateLimiter } from './rate-limiter.js';

/**
 * Creates an Express middleware for rate limiting
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests per window
 * @param {string} options.message - Error message when rate limit is exceeded
 */
export default function rateLimit(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 3, // 3 requests default
    message = 'Too many requests, please try again later.'
  } = options;

  const rateLimiter = getRateLimiter();

  return async function rateLimitMiddleware(req, res, next) {
    // Use IP address as identifier
    const identifier = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                      req.headers['x-real-ip'] ||
                      req.connection?.remoteAddress ||
                      req.socket?.remoteAddress ||
                      'unknown';

    try {
      const result = await rateLimiter.checkRateLimit(identifier);

      if (!result.allowed) {
        return res.status(429).json({
          error: message,
          retryAfter: result.resetTime
        });
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', result.remaining);

      if (result.resetTime) {
        res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
      }

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Fail open - allow request if rate limiter fails
      next();
    }
  };
}

// Export named function for compatibility
export { rateLimit };