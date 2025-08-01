/**
 * Webhook Security Middleware for A Lo Cubano Boulder Fest
 * 
 * Provides comprehensive security measures for webhook endpoints:
 * - Rate limiting per IP
 * - Request validation
 * - IP allowlisting for known providers
 * - DDOS protection
 * - Request logging
 */

import crypto from 'crypto';

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();
const REQUEST_LOG_STORE = new Map();

// Configuration
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // Max requests per window per IP
  blockDuration: 5 * 60 * 1000 // 5 minutes block duration
};

// Known webhook IP ranges (Stripe's webhook IPs)
const ALLOWED_IP_RANGES = [
  // Stripe webhook IPs (update these based on current Stripe documentation)
  '54.187.174.169',
  '54.187.205.235', 
  '54.187.216.72',
  '54.241.31.99',
  '54.241.31.102',
  '54.241.34.107'
  // Add PayPal IPs if using PayPal webhooks
];

/**
 * Check if IP is within allowed ranges
 */
function isIPAllowed(ip) {
  // In development, allow all IPs
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Remove IPv6 prefix if present
  const cleanIP = ip.replace(/^::ffff:/, '');
  
  // Allow localhost
  if (cleanIP === '127.0.0.1' || cleanIP === '::1') {
    return process.env.NODE_ENV !== 'production';
  }

  // Check against allowed ranges
  return ALLOWED_IP_RANGES.includes(cleanIP);
}

/**
 * Rate limiting implementation
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const key = `rate_limit:${ip}`;
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
      blockedUntil: null
    });
    return { allowed: true, remaining: RATE_LIMIT.maxRequests - 1 };
  }

  const record = rateLimitStore.get(key);
  
  // Check if IP is currently blocked
  if (record.blockedUntil && now < record.blockedUntil) {
    return { 
      allowed: false, 
      blocked: true,
      blockedUntil: record.blockedUntil,
      remaining: 0 
    };
  }

  // Reset window if expired
  if (now - record.windowStart > RATE_LIMIT.windowMs) {
    record.count = 1;
    record.windowStart = now;
    record.blockedUntil = null;
    return { allowed: true, remaining: RATE_LIMIT.maxRequests - 1 };
  }

  // Check if limit exceeded
  if (record.count >= RATE_LIMIT.maxRequests) {
    record.blockedUntil = now + RATE_LIMIT.blockDuration;
    return { 
      allowed: false, 
      blocked: true,
      blockedUntil: record.blockedUntil,
      remaining: 0 
    };
  }

  // Increment counter
  record.count++;
  return { 
    allowed: true, 
    remaining: RATE_LIMIT.maxRequests - record.count 
  };
}

/**
 * Get client IP from request
 */
function getClientIP(req) {
  // Check various headers for IP
  const forwarded = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  const cfConnectingIP = req.headers['cf-connecting-ip']; // Cloudflare
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         req.ip || 
         'unknown';
}

/**
 * Log request for security monitoring
 */
function logRequest(req, metadata = {}) {
  const timestamp = new Date().toISOString();
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'];
  const contentLength = req.headers['content-length'];
  
  const logEntry = {
    timestamp,
    ip,
    method: req.method,
    url: req.url,
    userAgent,
    contentLength,
    ...metadata
  };

  // Store in memory (use proper logging service in production)
  const logKey = `${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
  REQUEST_LOG_STORE.set(logKey, logEntry);
  
  // Clean old logs (keep last 1000 entries)
  if (REQUEST_LOG_STORE.size > 1000) {
    const oldestKey = REQUEST_LOG_STORE.keys().next().value;
    REQUEST_LOG_STORE.delete(oldestKey);
  }

  console.log('Webhook request:', logEntry);
}

/**
 * Validate request structure
 */
function validateRequest(req) {
  const errors = [];

  // Check required headers
  if (!req.headers['content-type']) {
    errors.push('Missing Content-Type header');
  }

  if (!req.headers['user-agent']) {
    errors.push('Missing User-Agent header');
  }

  // Check content length
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 1024 * 1024) { // 1MB limit
    errors.push('Request body too large');
  }

  if (contentLength === 0) {
    errors.push('Empty request body');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Webhook security middleware
 */
export function webhookSecurityMiddleware(options = {}) {
  const config = {
    enableIPFiltering: options.enableIPFiltering !== false,
    enableRateLimit: options.enableRateLimit !== false,
    enableRequestValidation: options.enableRequestValidation !== false,
    enableLogging: options.enableLogging !== false,
    ...options
  };

  return async function securityMiddleware(req, res, next) {
    const startTime = Date.now();
    const ip = getClientIP(req);

    try {
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      // Log request if enabled
      if (config.enableLogging) {
        logRequest(req, { securityCheck: true });
      }

      // Validate request structure
      if (config.enableRequestValidation) {
        const validation = validateRequest(req);
        if (!validation.isValid) {
          console.error('Request validation failed:', validation.errors);
          return res.status(400).json({
            error: 'Invalid request',
            details: validation.errors
          });
        }
      }

      // Check IP allowlist
      if (config.enableIPFiltering) {
        if (!isIPAllowed(ip)) {
          console.warn(`Rejected request from unauthorized IP: ${ip}`);
          if (config.enableLogging) {
            logRequest(req, { blocked: true, reason: 'unauthorized_ip' });
          }
          return res.status(403).json({
            error: 'Forbidden',
            message: 'IP not authorized for webhook access'
          });
        }
      }

      // Check rate limits
      if (config.enableRateLimit) {
        const rateCheck = checkRateLimit(ip);
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests);
        res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
        res.setHeader('X-RateLimit-Window', RATE_LIMIT.windowMs);

        if (!rateCheck.allowed) {
          if (rateCheck.blocked) {
            res.setHeader('X-RateLimit-Reset', rateCheck.blockedUntil);
            console.warn(`Rate limit exceeded for IP: ${ip}`);
            if (config.enableLogging) {
              logRequest(req, { blocked: true, reason: 'rate_limit_exceeded' });
            }
          }
          
          return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            retryAfter: Math.ceil((rateCheck.blockedUntil - Date.now()) / 1000)
          });
        }
      }

      // Add security metadata to request
      req.security = {
        ip,
        startTime,
        rateLimitRemaining: config.enableRateLimit ? 
          checkRateLimit(ip).remaining : null
      };

      // Continue to next middleware/handler
      if (typeof next === 'function') {
        next();
      }

    } catch (error) {
      console.error('Security middleware error:', error);
      
      if (config.enableLogging) {
        logRequest(req, { 
          error: true, 
          errorMessage: error.message,
          processingTime: Date.now() - startTime
        });
      }

      return res.status(500).json({
        error: 'Security check failed',
        message: 'An error occurred during security validation'
      });
    }
  };
}

/**
 * Idempotency middleware
 */
export function idempotencyMiddleware(db) {
  return async function idempotency(req, res, next) {
    // For webhooks, idempotency is usually handled by the event ID
    // This middleware can be used for API endpoints that need idempotency keys
    
    const idempotencyKey = req.headers['idempotency-key'];
    
    if (!idempotencyKey) {
      // Idempotency key not required for webhooks
      if (typeof next === 'function') {
        next();
      }
      return;
    }

    try {
      // Check if request with this key was already processed
      const existingResponse = await db.getIdempotentResponse(idempotencyKey);
      
      if (existingResponse) {
        console.log(`Returning cached response for idempotency key: ${idempotencyKey}`);
        return res.status(existingResponse.status).json(existingResponse.body);
      }

      // Store the original res.json to intercept the response
      const originalJson = res.json.bind(res);
      let responseIntercepted = false;

      res.json = function(body) {
        if (!responseIntercepted) {
          responseIntercepted = true;
          
          // Cache the response for future requests
          db.storeIdempotentResponse(idempotencyKey, {
            status: res.statusCode,
            body: body,
            timestamp: new Date().toISOString()
          }).catch(error => {
            console.error('Error storing idempotent response:', error);
          });
        }
        
        return originalJson(body);
      };

      if (typeof next === 'function') {
        next();
      }

    } catch (error) {
      console.error('Idempotency middleware error:', error);
      if (typeof next === 'function') {
        next();
      }
    }
  };
}

/**
 * Get security metrics
 */
export function getSecurityMetrics() {
  const now = Date.now();
  const recentRequests = Array.from(REQUEST_LOG_STORE.values())
    .filter(log => now - new Date(log.timestamp).getTime() < 3600000); // Last hour

  const blocked = recentRequests.filter(log => log.blocked);
  const byIP = recentRequests.reduce((acc, log) => {
    acc[log.ip] = (acc[log.ip] || 0) + 1;
    return acc;
  }, {});

  return {
    totalRequests: recentRequests.length,
    blockedRequests: blocked.length,
    uniqueIPs: Object.keys(byIP).length,
    topIPs: Object.entries(byIP)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10),
    rateLimitedIPs: Array.from(rateLimitStore.entries())
      .filter(([, record]) => record.blockedUntil && record.blockedUntil > now)
      .map(([ip]) => ip)
  };
}

// Export the main middleware function
export default webhookSecurityMiddleware;