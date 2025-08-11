/**
 * Security Middleware Composition
 * Combines all security middleware for comprehensive protection
 * Implements SPEC_04 Task 4.4 requirements
 */

import { withSecurityHeaders, addAPISecurityHeaders, addCSRFHeaders } from '../api/lib/security-headers.js';
import { withErrorHandling } from './error-handler.js';
import { createRateLimitMiddleware } from './rate-limit.js';

/**
 * Security middleware configuration
 */
const SECURITY_CONFIG = {
  // Rate limiting configuration
  rateLimit: {
    api: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // requests per window
      standardHeaders: true,
      legacyHeaders: false
    },
    admin: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20, // requests per window
      standardHeaders: true,
      legacyHeaders: false
    },
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // requests per window
      standardHeaders: true,
      legacyHeaders: false
    }
  },

  // HTTPS enforcement
  httpsEnforcement: {
    enabled: process.env.VERCEL_ENV === 'production',
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true
  },

  // CSRF protection
  csrf: {
    enabled: true,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.VERCEL_ENV === 'production',
      sameSite: 'strict',
      maxAge: 86400000 // 24 hours
    }
  }
};

/**
 * HTTPS Enforcement Middleware
 * Redirects HTTP to HTTPS in production
 */
export function enforceHTTPS(req, res, next) {
  const { httpsEnforcement } = SECURITY_CONFIG;
  
  if (!httpsEnforcement.enabled) {
    return next();
  }

  // Check if request is over HTTPS
  const isHTTPS = req.headers['x-forwarded-proto'] === 'https' || 
                  req.secure || 
                  req.connection.encrypted;

  if (!isHTTPS) {
    const httpsUrl = `https://${req.headers.host}${req.url}`;
    
    // Send 301 redirect to HTTPS
    res.writeHead(301, {
      Location: httpsUrl,
      'Strict-Transport-Security': `max-age=${httpsEnforcement.maxAge}; includeSubDomains; preload`
    });
    res.end();
    return;
  }

  next();
}

/**
 * Request sanitization middleware
 * Sanitizes and validates incoming requests
 */
export function sanitizeRequest(req, res, next) {
  // Remove potentially dangerous headers
  delete req.headers['x-cluster-client-ip'];
  delete req.headers['x-real-ip'];
  delete req.headers['x-forwarded-host'];
  
  // Limit request size (handled by Vercel, but add as safeguard)
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
    res.status(413).json({
      error: {
        type: 'PayloadTooLarge',
        message: 'Request payload too large'
      }
    });
    return;
  }

  // Validate Content-Type for POST/PUT requests
  if ((req.method === 'POST' || req.method === 'PUT') && 
      req.headers['content-type'] && 
      !req.headers['content-type'].match(/^(application\/json|application\/x-www-form-urlencoded|multipart\/form-data)/)) {
    res.status(400).json({
      error: {
        type: 'ValidationError',
        message: 'Invalid Content-Type'
      }
    });
    return;
  }

  next();
}

/**
 * Security logging middleware
 * Logs security-relevant events
 */
export function securityLogger(req, res, next) {
  const securityEvents = [];
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\.\//,  // Directory traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript protocol
    /data:text\/html/i // Data URI XSS
  ];

  const url = req.url || '';
  const userAgent = req.headers['user-agent'] || '';
  
  suspiciousPatterns.forEach(pattern => {
    if (pattern.test(url) || pattern.test(userAgent)) {
      securityEvents.push({
        type: 'suspicious_pattern',
        pattern: pattern.toString(),
        url,
        userAgent,
        ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Log security events
  if (securityEvents.length > 0) {
    console.warn('Security events detected:', {
      requestId: req.headers['x-request-id'] || 'unknown',
      events: securityEvents
    });
  }

  next();
}

/**
 * API Security Middleware
 * Comprehensive security for API endpoints
 */
export function createAPISecurityMiddleware(options = {}) {
  const {
    rateLimit = SECURITY_CONFIG.rateLimit.api,
    requireAuth = false,
    corsOrigins = ['https://alocubanoboulderfest.vercel.app'],
    maxAge = 0
  } = options;

  const rateLimiter = createRateLimitMiddleware('general', rateLimit);

  return function apiSecurityMiddleware(handler) {
    return withErrorHandling(
      withSecurityHeaders(
        async (req, res) => {
          // Apply rate limiting
          let rateLimitPassed = true;
          
          await rateLimiter(req, res, (error) => {
            if (error) {
              rateLimitPassed = false;
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

          // Add API-specific security headers
          addAPISecurityHeaders(req, res, {
            maxAge,
            corsOrigins,
            allowCredentials: requireAuth
          });

          // Handle OPTIONS preflight
          if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
          }

          // Execute handler
          return await handler(req, res);
        },
        { isAPI: true, maxAge }
      )
    );
  };
}

/**
 * Admin Security Middleware
 * Enhanced security for admin endpoints
 */
export function createAdminSecurityMiddleware(options = {}) {
  const {
    rateLimit = SECURITY_CONFIG.rateLimit.admin,
    requireCSRF = true
  } = options;

  const rateLimiter = createRateLimitMiddleware('admin', rateLimit);

  return function adminSecurityMiddleware(handler) {
    return withErrorHandling(
      withSecurityHeaders(
        async (req, res) => {
          // Apply stricter rate limiting for admin
          let rateLimitPassed = true;
          
          await rateLimiter(req, res, (error) => {
            if (error) {
              rateLimitPassed = false;
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

          // CSRF protection for admin endpoints
          if (requireCSRF && (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')) {
            const csrfToken = req.headers['x-csrf-token'] || req.body?._token;
            if (!csrfToken) {
              res.status(403).json({
                error: {
                  type: 'CSRFError',
                  message: 'CSRF token required'
                }
              });
              return;
            }
            
            addCSRFHeaders(res, csrfToken);
          }

          // Add admin-specific headers
          res.setHeader('X-Admin-Endpoint', 'true');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          
          return await handler(req, res);
        },
        { isAPI: true }
      )
    );
  };
}

/**
 * Authentication Security Middleware
 * Ultra-strict security for authentication endpoints
 */
export function createAuthSecurityMiddleware(options = {}) {
  const {
    rateLimit = SECURITY_CONFIG.rateLimit.auth
  } = options;

  const rateLimiter = createRateLimitMiddleware('auth', rateLimit);

  return function authSecurityMiddleware(handler) {
    return withErrorHandling(
      withSecurityHeaders(
        async (req, res) => {
          // Apply very strict rate limiting
          let rateLimitPassed = true;
          
          await rateLimiter(req, res, (error) => {
            if (error) {
              rateLimitPassed = false;
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

          // Additional security headers for auth endpoints
          res.setHeader('X-Auth-Endpoint', 'true');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          
          // Clear any existing authentication cookies on failed attempts
          res.setHeader('Clear-Site-Data', '"cookies", "storage"');
          
          return await handler(req, res);
        },
        { isAPI: true }
      )
    );
  };
}

/**
 * Complete security middleware stack
 * Applies all security measures
 */
export function createSecurityMiddleware(type = 'api', options = {}) {
  switch (type) {
    case 'admin':
      return createAdminSecurityMiddleware(options);
    case 'auth':
      return createAuthSecurityMiddleware(options);
    case 'api':
    default:
      return createAPISecurityMiddleware(options);
  }
}

/**
 * Security middleware utilities
 */
export const securityUtils = {
  enforceHTTPS,
  sanitizeRequest,
  securityLogger,
  SECURITY_CONFIG
};

export default {
  createSecurityMiddleware,
  createAPISecurityMiddleware,
  createAdminSecurityMiddleware,
  createAuthSecurityMiddleware,
  enforceHTTPS,
  sanitizeRequest,
  securityLogger,
  securityUtils
};