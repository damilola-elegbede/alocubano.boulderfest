/**
 * Simple in-memory rate limiter for serverless functions
 * Tracks request counts per IP address
 */

// Store for tracking requests
const requestStore = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestStore.entries()) {
    if (now - data.resetTime > 60000) {
      requestStore.delete(key);
    }
  }
}, 300000);

/**
 * Rate limiting middleware for serverless functions
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000)
 * @param {number} options.max - Maximum requests per window (default: 100)
 * @param {string} options.message - Error message when rate limit exceeded
 * @returns {Function} Middleware function
 */
export function createRateLimiter(options = {}) {
  const config = {
    windowMs: options.windowMs || 60000, // 1 minute default
    max: options.max || 100, // 100 requests per minute default
    message: options.message || 'Too many requests, please try again later.'
  };

  return async function rateLimiter(req, res, next) {
    // Extract client identifier (IP address)
    const clientId = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress || 
                     'unknown';

    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get or create client data
    let clientData = requestStore.get(clientId);
    
    if (!clientData || clientData.resetTime < windowStart) {
      // Create new window for client
      clientData = {
        count: 0,
        resetTime: now + config.windowMs
      };
      requestStore.set(clientId, clientData);
    }

    // Increment request count
    clientData.count++;

    // Check if rate limit exceeded
    if (clientData.count > config.max) {
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(clientData.resetTime).toISOString());
      res.setHeader('Retry-After', Math.ceil((clientData.resetTime - now) / 1000));

      // Return rate limit error
      return res.status(429).json({
        error: config.message,
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', config.max - clientData.count);
    res.setHeader('X-RateLimit-Reset', new Date(clientData.resetTime).toISOString());

    // Continue to next middleware
    if (next) {
      return next();
    }
  };
}

/**
 * Apply rate limiting to a handler function
 * @param {Function} handler - The handler function to protect
 * @param {Object} options - Rate limiting options
 * @returns {Function} Protected handler
 */
export function withRateLimit(handler, options = {}) {
  const rateLimiter = createRateLimiter(options);
  
  return async function rateLimitedHandler(req, res) {
    // Apply rate limiting
    let rateLimitPassed = true;
    await rateLimiter(req, res, () => {
      rateLimitPassed = true;
    });

    // If rate limit check failed, response was already sent
    if (!rateLimitPassed || res.headersSent) {
      return;
    }

    // Continue with original handler
    return handler(req, res);
  };
}

export default { createRateLimiter, withRateLimit };