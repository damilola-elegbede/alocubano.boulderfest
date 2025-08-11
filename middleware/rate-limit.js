/**
 * Rate Limiting Middleware Integration
 * 
 * Provides easy integration of the advanced rate limiter with API endpoints.
 * Supports various endpoint types with appropriate configurations.
 */

import { getRateLimiter } from '../api/lib/security/rate-limiter.js';
import { ApplicationError } from './error-handler.js';

/**
 * Create rate limiting middleware for specific endpoint type
 */
export function createRateLimitMiddleware(endpointType, options = {}) {
  const rateLimiter = getRateLimiter();
  const { failOpen = true, ...otherOptions } = options;
  
  return async function rateLimitMiddleware(req, res, next) {
    const startTime = Date.now();
    
    try {
      // Skip rate limiting in development if specified
      if (process.env.NODE_ENV === 'development' && options.skipInDevelopment) {
        return next ? next() : undefined;
      }
      
      // Check rate limit
      const result = await rateLimiter.checkRateLimit(req, endpointType, {
        clientType: options.clientType || 'ip',
        ...options
      });
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Endpoint', endpointType);
      res.setHeader('X-RateLimit-Client', result.clientId || 'unknown');
      res.setHeader('X-RateLimit-Performance', `${Date.now() - startTime}ms`);
      
      // Add standard rate limit headers using limiter result or config fallback
      if (result.limit !== undefined) {
        res.setHeader('X-RateLimit-Limit', result.limit);
      } else {
        // Fallback to shared config - access through rateLimiter instance
        const config = rateLimiter.getEndpointConfigs()[endpointType] || rateLimiter.getEndpointConfigs().general;
        if (config) {
          // Check for different limit types (ipLimit, userLimit, deviceLimit, etc.)
          const limitConfig = config.ipLimit || config.userLimit || config.deviceLimit;
          if (limitConfig) {
            res.setHeader('X-RateLimit-Limit', limitConfig.requests);
          }
        }
      }
      
      if (result.windowMs !== undefined) {
        res.setHeader('X-RateLimit-Window', Math.floor(result.windowMs / 1000)); // Convert to seconds
      } else {
        // Fallback to shared config
        const config = rateLimiter.getEndpointConfigs()[endpointType] || rateLimiter.getEndpointConfigs().general;
        if (config) {
          // Check for different limit types (ipLimit, userLimit, deviceLimit, etc.)
          const limitConfig = config.ipLimit || config.userLimit || config.deviceLimit;
          if (limitConfig) {
            res.setHeader('X-RateLimit-Window', Math.floor(limitConfig.windowMs / 1000));
          }
        }
      }
      
      if (result.allowed) {
        // Add success headers
        if (result.remaining !== undefined) {
          res.setHeader('X-RateLimit-Remaining', result.remaining);
        }
        if (result.resetTime) {
          res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
        }
        
        // Continue to next middleware or handler
        return next ? next() : undefined;
        
      } else {
        // Rate limit exceeded
        res.setHeader('X-RateLimit-Exceeded', 'true');
        if (result.retryAfter) {
          res.setHeader('Retry-After', result.retryAfter);
          res.setHeader('X-RateLimit-Retry-After', result.retryAfter);
        }
        
        // Enhanced error information
        const errorDetails = {
          reason: result.reason || 'rate_limit_exceeded',
          endpoint: endpointType,
          clientId: result.clientId,
          retryAfter: result.retryAfter
        };
        
        if (result.penaltyMultiplier > 1) {
          errorDetails.penaltyMultiplier = result.penaltyMultiplier;
          errorDetails.message = `Rate limit exceeded. Due to previous violations, your limits are temporarily reduced by ${result.penaltyMultiplier}x.`;
        }
        
        // Create appropriate error message based on reason
        let message = 'Rate limit exceeded. Please try again later.';
        let statusCode = 429;
        
        switch (result.reason) {
          case 'blacklisted':
            message = 'Access denied due to suspicious activity.';
            statusCode = 403;
            break;
          case 'rate_limit_exceeded':
            if (result.retryAfter) {
              const minutes = Math.ceil(result.retryAfter / 60);
              message = `Rate limit exceeded. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`;
            }
            break;
        }
        
        const error = new ApplicationError(message, 'RateLimitError', statusCode, errorDetails);
        
        if (next) {
          return next(error);
        } else {
          // Direct response if no next middleware
          return res.status(statusCode).json({
            error: {
              type: 'RateLimitError',
              message,
              details: errorDetails,
              timestamp: new Date().toISOString()
            }
          });
        }
      }
      
    } catch (error) {
      console.error('Rate limiting middleware error:', error);
      
      // Configurable fail-open vs fail-closed behavior
      if (failOpen) {
        // Fail open - allow request to continue but log the error
        if (next) {
          return next();
        }
      } else {
        // Fail closed - return 503 Service Unavailable
        const serviceError = new ApplicationError(
          'Rate limiting service temporarily unavailable',
          'ServiceUnavailable',
          503,
          { reason: 'rate_limiter_error', temporary: true }
        );
        
        if (next) {
          return next(serviceError);
        } else {
          return res.status(503).json({
            error: {
              type: 'ServiceUnavailable',
              message: 'Rate limiting service temporarily unavailable. Please try again later.',
              details: { reason: 'rate_limiter_error', temporary: true },
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    }
  };
}

/**
 * Endpoint-specific middleware creators
 */

/**
 * Payment endpoint rate limiting
 * - 5 requests per minute per IP
 * - 10 requests per hour per user
 */
export function paymentRateLimit(options = {}) {
  return createRateLimitMiddleware('payment', {
    clientType: 'ip',
    ...options
  });
}

/**
 * QR validation rate limiting
 * - 100 requests per minute per device
 */
export function qrValidationRateLimit(options = {}) {
  return createRateLimitMiddleware('qrValidation', {
    clientType: 'device',
    ...options
  });
}

/**
 * Authentication rate limiting
 * - 5 attempts per minute per IP
 * - Progressive penalties for repeated failures
 */
export function authRateLimit(options = {}) {
  return createRateLimitMiddleware('auth', {
    clientType: 'ip',
    ...options
  });
}

/**
 * Email subscription rate limiting
 * - 10 requests per hour per IP
 */
export function emailRateLimit(options = {}) {
  return createRateLimitMiddleware('email', {
    clientType: 'ip',
    ...options
  });
}

/**
 * General API rate limiting
 * - 60 requests per minute per IP
 */
export function generalApiRateLimit(options = {}) {
  return createRateLimitMiddleware('general', {
    clientType: 'ip',
    ...options
  });
}

/**
 * Wrapper function for easy API endpoint protection
 * 
 * @param {Function} handler - The API handler function
 * @param {string} endpointType - Type of endpoint (payment, auth, email, etc.)
 * @param {Object} options - Rate limiting options
 * @returns {Function} Protected handler function
 */
export function withRateLimit(handler, endpointType = 'general', options = {}) {
  const rateLimitMiddleware = createRateLimitMiddleware(endpointType, options);
  
  return async function rateLimitedHandler(req, res) {
    let rateLimitPassed = true;
    
    // Apply rate limiting
    await rateLimitMiddleware(req, res, (error) => {
      if (error) {
        rateLimitPassed = false;
        // Handle error - response should already be sent by middleware
        if (!res.headersSent) {
          res.status(error.statusCode || 429).json({
            error: {
              type: error.type || 'RateLimitError',
              message: error.message,
              details: error.details,
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    });
    
    // If rate limit check failed or response was already sent, don't continue
    if (!rateLimitPassed || res.headersSent) {
      return;
    }
    
    // Continue with original handler
    return await handler(req, res);
  };
}

/**
 * Express-style middleware factory
 * Creates middleware that can be used with Express-like frameworks
 */
export function expressRateLimit(endpointType = 'general', options = {}) {
  return createRateLimitMiddleware(endpointType, options);
}

/**
 * Advanced middleware with custom logic
 * Allows for endpoint-specific customization
 */
export function customRateLimit(config) {
  const {
    endpointType = 'general',
    customCheck = null,
    onExceeded = null,
    onAllowed = null,
    ...options
  } = config;
  
  const rateLimiter = getRateLimiter();
  
  return async function customRateLimitMiddleware(req, res, next) {
    try {
      // Custom pre-check logic
      if (customCheck) {
        const customResult = await customCheck(req, res);
        if (customResult === false) {
          return next ? next() : undefined; // Skip rate limiting
        }
      }
      
      const result = await rateLimiter.checkRateLimit(req, endpointType, options);
      
      if (result.allowed) {
        // Custom success logic
        if (onAllowed) {
          await onAllowed(req, res, result);
        }
        
        return next ? next() : undefined;
        
      } else {
        // Custom exceeded logic
        if (onExceeded) {
          return await onExceeded(req, res, result);
        } else {
          // Default exceeded behavior
          const error = new ApplicationError(
            'Rate limit exceeded',
            'RateLimitError',
            429,
            { reason: result.reason, retryAfter: result.retryAfter }
          );
          
          if (next) {
            return next(error);
          } else {
            return res.status(429).json({
              error: {
                type: 'RateLimitError',
                message: 'Rate limit exceeded',
                retryAfter: result.retryAfter
              }
            });
          }
        }
      }
      
    } catch (error) {
      console.error('Custom rate limit middleware error:', error);
      return next ? next() : undefined;
    }
  };
}

/**
 * Bulk protection for multiple endpoints
 * Useful for protecting entire API routes
 */
export function bulkRateLimit(endpoints) {
  const middlewares = {};
  
  for (const [path, config] of Object.entries(endpoints)) {
    const { type = 'general', ...options } = config;
    middlewares[path] = createRateLimitMiddleware(type, options);
  }
  
  return middlewares;
}

/**
 * Rate limit status endpoint
 * Provides current rate limit status for debugging
 */
export function rateLimitStatus() {
  return async function rateLimitStatusHandler(req, res) {
    const rateLimiter = getRateLimiter();
    const analytics = rateLimiter.getAnalytics();
    
    // Get client information
    const clientId = rateLimiter.getClientId(req);
    const isWhitelisted = rateLimiter.isWhitelisted(clientId);
    const isBlacklisted = rateLimiter.isBlacklisted(clientId);
    
    // Hide sensitive information in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    const response = {
      timestamp: new Date().toISOString()
    };
    
    if (isProduction) {
      // Only include basic status in production
      response.client = {
        whitelisted: isWhitelisted,
        blacklisted: isBlacklisted
      };
      response.endpoints = Object.keys(rateLimiter.constructor.ENDPOINT_CONFIGS || {});
    } else {
      // Include full details in non-production environments
      response.client = {
        id: clientId,
        whitelisted: isWhitelisted,
        blacklisted: isBlacklisted
      };
      response.analytics = analytics;
      response.endpoints = Object.keys(rateLimiter.constructor.ENDPOINT_CONFIGS || {});
    }
    
    res.json(response);
  };
}

export default {
  createRateLimitMiddleware,
  paymentRateLimit,
  qrValidationRateLimit,
  authRateLimit,
  emailRateLimit,
  generalApiRateLimit,
  withRateLimit,
  expressRateLimit,
  customRateLimit,
  bulkRateLimit,
  rateLimitStatus
};