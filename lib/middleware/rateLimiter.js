/**
 * Rate Limiting Middleware
 * Protects payment endpoints from abuse
 */

import { ERROR_MESSAGES } from '../payment/config.js';

// Simple in-memory store for rate limiting
// In production, use Redis for distributed rate limiting
const requestStore = new Map();

/**
 * Creates rate limiting middleware
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 10, // limit each IP to 10 requests per windowMs
    message = ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
    skipSuccessfulRequests = false,
    keyGenerator = (req) => req.ip || req.connection.remoteAddress || 'unknown'
  } = options;

  return function rateLimitMiddleware(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    
    // Clean up old entries
    cleanupExpiredRequests(windowMs);
    
    // Get or create request history for this key
    if (!requestStore.has(key)) {
      requestStore.set(key, []);
    }
    
    const requests = requestStore.get(key);
    
    // Filter out requests outside the time window
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    if (validRequests.length >= max) {
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
        limit: max,
        current: validRequests.length
      });
    }
    
    // Add current request
    validRequests.push(now);
    requestStore.set(key, validRequests);
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': Math.max(0, max - validRequests.length),
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
    });
    
    // If configured to skip successful requests, remove this request on success
    if (skipSuccessfulRequests) {
      const originalSend = res.send;
      res.send = function(body) {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          const currentRequests = requestStore.get(key) || [];
          const index = currentRequests.lastIndexOf(now);
          if (index > -1) {
            currentRequests.splice(index, 1);
            requestStore.set(key, currentRequests);
          }
        }
        return originalSend.call(this, body);
      };
    }
    
    next();
  };
}

/**
 * Cleanup expired request entries
 */
function cleanupExpiredRequests(windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  
  for (const [key, requests] of requestStore.entries()) {
    const validRequests = requests.filter(timestamp => timestamp > cutoff);
    
    if (validRequests.length === 0) {
      requestStore.delete(key);
    } else if (validRequests.length !== requests.length) {
      requestStore.set(key, validRequests);
    }
  }
}

/**
 * Payment-specific rate limiter
 */
export function paymentRateLimiter() {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 payment attempts per 15 minutes
    message: 'Too many payment attempts. Please try again later.',
    keyGenerator: (req) => {
      // Rate limit by IP and email combination for payment attempts
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const email = req.body?.customerInfo?.email || 'anonymous';
      return `payment:${ip}:${email}`;
    }
  });
}

/**
 * Webhook rate limiter
 */
export function webhookRateLimiter() {
  return createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Allow more for webhooks
    message: 'Webhook rate limit exceeded',
    keyGenerator: (req) => {
      // Rate limit webhooks by source
      const forwardedFor = req.headers['x-forwarded-for'];
      const ip = forwardedFor ? forwardedFor.split(',')[0] : req.connection.remoteAddress;
      return `webhook:${ip}`;
    }
  });
}

/**
 * General API rate limiter
 */
export function apiRateLimiter() {
  return createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: 'API rate limit exceeded. Please try again later.',
  });
}

/**
 * Higher security rate limiter for sensitive operations
 */
export function strictRateLimiter() {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Only 5 attempts per 15 minutes
    message: 'Rate limit exceeded for security reasons. Please try again later.',
  });
}

/**
 * Middleware wrapper that applies rate limiting
 */
export function withRateLimit(handler, limiterType = 'api') {
  const limiters = {
    api: apiRateLimiter(),
    payment: paymentRateLimiter(),
    webhook: webhookRateLimiter(),
    strict: strictRateLimiter()
  };

  const limiter = limiters[limiterType] || limiters.api;

  return async function rateLimitedHandler(req, res) {
    return new Promise((resolve, reject) => {
      limiter(req, res, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(handler(req, res));
        }
      });
    });
  };
}

/**
 * Get current rate limit status for a key
 */
export function getRateLimitStatus(key, windowMs, max) {
  const requests = requestStore.get(key) || [];
  const now = Date.now();
  const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
  
  return {
    current: validRequests.length,
    limit: max,
    remaining: Math.max(0, max - validRequests.length),
    resetTime: validRequests.length > 0 ? new Date(Math.max(...validRequests) + windowMs) : new Date()
  };
}

/**
 * Reset rate limit for a specific key (admin function)
 */
export function resetRateLimit(key) {
  requestStore.delete(key);
  return true;
}

/**
 * Get all rate limit statistics (monitoring function)
 */
export function getRateLimitStats() {
  const stats = {
    totalKeys: requestStore.size,
    totalRequests: 0,
    keyDetails: []
  };

  for (const [key, requests] of requestStore.entries()) {
    stats.totalRequests += requests.length;
    stats.keyDetails.push({
      key,
      requestCount: requests.length,
      oldestRequest: requests.length > 0 ? new Date(Math.min(...requests)) : null,
      newestRequest: requests.length > 0 ? new Date(Math.max(...requests)) : null
    });
  }

  return stats;
}