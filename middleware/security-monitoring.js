import {
  logAPIViolation,
  logRateLimitViolation,
  logSuspiciousUserAgent
} from '../lib/security/security-logger.js';
import { getSecurityMonitor } from '../lib/security/security-monitor.js';

/**
 * Security monitoring middleware for API endpoints
 * Detects and logs suspicious patterns in real-time
 */

/**
 * Configurable suspicious user agent patterns
 * Can be overridden via environment variables for production flexibility
 */
const getAggressivePatterns = () => {
  // Only use aggressive patterns if explicitly enabled
  if (process.env.ENABLE_AGGRESSIVE_UA_BLOCKING !== 'true') {
    return [];
  }

  return [
    // Automated tools (configurable - may block legitimate monitoring)
    /curl|wget|python-requests|apache-httpclient|java|go-http-client/i
  ];
};

const SUSPICIOUS_USER_AGENT_PATTERNS = [
  // Always block security scanners and malicious tools
  /nmap|nikto|sqlmap|burp|metasploit|nessus|openvas/i,
  // Always block obvious malicious patterns
  /exploit|hack|injection|payload|vulnerability|scanner/i,
  // Always block empty or very short user agents
  /^.{0,5}$/,
  // Always block unusual patterns that aren't legitimate browsers
  /^mozilla\/[0-9]\.0$/i,
  // Add aggressive patterns only if configured
  ...getAggressivePatterns()
];

/**
 * Suspicious request patterns
 */
const SUSPICIOUS_REQUEST_PATTERNS = {
  // Path traversal attempts
  pathTraversal: /\.\.\/|\.\.\\|%2e%2e|%252e%252e/i,

  // SQL injection patterns
  sqlInjection: /(\'|\"|;|--|\||\/\*|\*\/|union|select|insert|delete|update|drop|exec|execute)/i,

  // XSS patterns
  xss: /<script[^>]*>|javascript:|on\w+\s*=|<iframe|<object|<embed/i,

  // Command injection
  commandInjection: /[;&|`$(){}[\]\\]/,

  // File inclusion
  fileInclusion: /(\.php|\.asp|\.jsp|passwd|etc\/passwd|boot\.ini)/i,

  // Suspicious headers patterns
  suspiciousHeaders: /x-forwarded-host|x-original-url|x-rewrite-url/i
};

/**
 * Get client IP with proper forwarding support
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Check for suspicious user agent
 */
function isSuspiciousUserAgent(userAgent) {
  if (!userAgent) {
    return { suspicious: true, reason: 'missing_user_agent' };
  }

  for (const pattern of SUSPICIOUS_USER_AGENT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return {
        suspicious: true,
        reason: 'matches_suspicious_pattern',
        pattern: pattern.toString()
      };
    }
  }

  // Check for unusual characteristics
  if (userAgent.length > 1000) {
    return { suspicious: true, reason: 'excessive_length' };
  }

  if (userAgent.includes('\x00') || userAgent.includes('\r') || userAgent.includes('\n')) {
    return { suspicious: true, reason: 'contains_control_characters' };
  }

  return { suspicious: false };
}

/**
 * Check for suspicious request patterns
 */
function checkSuspiciousRequestPatterns(req) {
  const violations = [];
  const url = req.url || '';
  const userAgent = req.headers['user-agent'] || '';

  // Check URL path
  if (SUSPICIOUS_REQUEST_PATTERNS.pathTraversal.test(url)) {
    violations.push('path_traversal_attempt');
  }

  if (SUSPICIOUS_REQUEST_PATTERNS.sqlInjection.test(url)) {
    violations.push('sql_injection_attempt');
  }

  if (SUSPICIOUS_REQUEST_PATTERNS.xss.test(url)) {
    violations.push('xss_attempt');
  }

  if (SUSPICIOUS_REQUEST_PATTERNS.commandInjection.test(url)) {
    violations.push('command_injection_attempt');
  }

  if (SUSPICIOUS_REQUEST_PATTERNS.fileInclusion.test(url)) {
    violations.push('file_inclusion_attempt');
  }

  // Check request body if present
  if (req.body) {
    const bodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    if (SUSPICIOUS_REQUEST_PATTERNS.sqlInjection.test(bodyString)) {
      violations.push('sql_injection_in_body');
    }

    if (SUSPICIOUS_REQUEST_PATTERNS.xss.test(bodyString)) {
      violations.push('xss_in_body');
    }

    if (SUSPICIOUS_REQUEST_PATTERNS.commandInjection.test(bodyString)) {
      violations.push('command_injection_in_body');
    }
  }

  // Check headers
  for (const [headerName, headerValue] of Object.entries(req.headers)) {
    if (SUSPICIOUS_REQUEST_PATTERNS.suspiciousHeaders.test(headerName)) {
      violations.push(`suspicious_header_${headerName}`);
    }

    if (typeof headerValue === 'string' && headerValue.length > 2000) {
      violations.push(`oversized_header_${headerName}`);
    }
  }

  return violations;
}

/**
 * Check for rate limiting violations using actual rate limiter
 */
async function checkRateLimitViolation(req, clientIP) {
  try {
    // Get actual request count from rate limiter
    const requestsPerMinute = await getRequestCount(clientIP);

    // Configure thresholds based on environment
    const threshold = parseInt(process.env.SECURITY_MONITOR_RATE_LIMIT) || 60;

    if (requestsPerMinute > threshold) {
      return {
        violated: true,
        limitType: 'requests_per_minute',
        requestCount: requestsPerMinute,
        timeWindow: '1 minute',
        threshold
      };
    }

    return { violated: false, requestCount: requestsPerMinute };
  } catch (error) {
    console.warn('[SecurityMonitoring] Rate limit check failed:', error.message);
    // Return safe default - don't block on error
    return { violated: false, error: error.message };
  }
}

/**
 * Get actual request count from rate limiter service
 * This function integrates with the Redis rate limiter for accurate counts
 */
async function getRequestCount(clientIP) {
  try {
    // Import rate limiter dynamically to avoid circular dependencies
    const { getRedisRateLimiter } = await import('../lib/redis-rate-limiter.js');
    const rateLimiter = getRedisRateLimiter();

    // Use rate limiter's internal tracking for accurate request counts
    const mockReq = { headers: { 'x-forwarded-for': clientIP } };
    const result = await rateLimiter.checkRateLimit(mockReq, 'general', { dryRun: true });

    return result.count || 0;
  } catch (error) {
    console.warn('[SecurityMonitoring] Could not get request count from rate limiter:', error.message);
    // Return safe default that won't trigger false positives
    return 0;
  }
}

/**
 * Check if request size is suspicious
 */
function checkRequestSize(req) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);

  if (contentLength > 10 * 1024 * 1024) { // 10MB
    return {
      suspicious: true,
      reason: 'excessive_payload_size',
      size: contentLength
    };
  }

  return { suspicious: false };
}

/**
 * Main security monitoring middleware
 */
export function securityMonitoringMiddleware(options = {}) {
  const {
    enableUserAgentCheck = true,
    enablePatternCheck = true,
    enableRateLimitCheck = false, // Disabled by default to avoid false positives
    enableSizeCheck = true,
    logViolations = true,
    blockSuspiciousRequests = false
  } = options;

  return async (req, res, next) => {
    try {
      const startTime = Date.now();
      const clientIP = getClientIP(req);
      const userAgent = req.headers['user-agent'];
      const endpoint = req.path || req.url;
      const method = req.method;

      const violations = [];
      const metadata = {
        method,
        endpoint,
        userAgent,
        clientIP,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      };

      // Check for suspicious user agent
      if (enableUserAgentCheck) {
        const userAgentCheck = isSuspiciousUserAgent(userAgent);
        if (userAgentCheck.suspicious) {
          violations.push('suspicious_user_agent');

          if (logViolations) {
            await logSuspiciousUserAgent(clientIP, userAgent, userAgentCheck.reason, {
              ...metadata,
              pattern: userAgentCheck.pattern
            });
          }
        }
      }

      // Check for suspicious request patterns
      if (enablePatternCheck) {
        const patternViolations = checkSuspiciousRequestPatterns(req);
        if (patternViolations.length > 0) {
          violations.push(...patternViolations);

          if (logViolations) {
            for (const violation of patternViolations) {
              await logAPIViolation(clientIP, endpoint, violation, {
                ...metadata,
                violationDetails: violation
              });
            }
          }
        }
      }

      // Check rate limiting (async)
      if (enableRateLimitCheck) {
        const rateLimitCheck = await checkRateLimitViolation(req, clientIP);
        if (rateLimitCheck.violated) {
          violations.push('rate_limit_exceeded');

          if (logViolations) {
            await logRateLimitViolation(clientIP, endpoint, rateLimitCheck.limitType, {
              ...metadata,
              requestCount: rateLimitCheck.requestCount,
              timeWindow: rateLimitCheck.timeWindow,
              threshold: rateLimitCheck.threshold
            });
          }
        }
      }

      // Check request size
      if (enableSizeCheck) {
        const sizeCheck = checkRequestSize(req);
        if (sizeCheck.suspicious) {
          violations.push('excessive_payload_size');

          if (logViolations) {
            await logAPIViolation(clientIP, endpoint, 'excessive_payload_size', {
              ...metadata,
              payloadSize: sizeCheck.size,
              reason: sizeCheck.reason
            });
          }
        }
      }

      // Block suspicious requests if enabled
      if (blockSuspiciousRequests && violations.length > 0) {
        const criticalViolations = violations.filter(v =>
          v.includes('injection') ||
          v.includes('traversal') ||
          v.includes('xss')
        );

        if (criticalViolations.length > 0) {
          return res.status(403).json({
            error: 'Request blocked due to security policy violation',
            requestId: metadata.requestId
          });
        }
      }

      // Add security metadata to request for downstream handlers
      req.securityContext = {
        clientIP,
        violations,
        metadata,
        riskScore: calculateRiskScore(violations)
      };

      // Monitor the response
      const originalSend = res.send;
      res.send = function(data) {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Log API activity for monitoring
        const securityMonitor = getSecurityMonitor();
        securityMonitor.monitorAPIActivity(clientIP, endpoint, statusCode, responseTime, {
          method,
          userAgent,
          violations,
          riskScore: req.securityContext.riskScore,
          requestId: metadata.requestId
        });

        return originalSend.call(this, data);
      };

      next();

    } catch (error) {
      console.error('Security monitoring middleware error:', error);
      // Don't block the request due to monitoring errors
      next();
    }
  };
}

/**
 * Calculate risk score based on violations
 */
function calculateRiskScore(violations) {
  const riskWeights = {
    'sql_injection_attempt': 90,
    'sql_injection_in_body': 90,
    'command_injection_attempt': 85,
    'command_injection_in_body': 85,
    'path_traversal_attempt': 70,
    'xss_attempt': 60,
    'xss_in_body': 60,
    'file_inclusion_attempt': 75,
    'excessive_payload_size': 40,
    'suspicious_user_agent': 30,
    'rate_limit_exceeded': 50,
    'missing_user_agent': 20
  };

  let totalScore = 0;
  for (const violation of violations) {
    totalScore += riskWeights[violation] || 10; // Default weight for unknown violations
  }

  return Math.min(totalScore, 100); // Cap at 100
}

/**
 * Middleware factory for specific endpoints
 */
export function createSecurityMiddleware(endpointConfig = {}) {
  return securityMonitoringMiddleware({
    enableUserAgentCheck: endpointConfig.checkUserAgent !== false,
    enablePatternCheck: endpointConfig.checkPatterns !== false,
    enableRateLimitCheck: endpointConfig.enableRateLimit === true,
    enableSizeCheck: endpointConfig.checkSize !== false,
    logViolations: endpointConfig.logViolations !== false,
    blockSuspiciousRequests: endpointConfig.blockSuspicious === true
  });
}

/**
 * High-security middleware for admin endpoints
 */
export const adminSecurityMiddleware = createSecurityMiddleware({
  checkUserAgent: true,
  checkPatterns: true,
  enableRateLimit: true,
  checkSize: true,
  logViolations: true,
  blockSuspicious: true
});

/**
 * Medium-security middleware for API endpoints
 */
export const apiSecurityMiddleware = createSecurityMiddleware({
  checkUserAgent: true,
  checkPatterns: true,
  enableRateLimit: false,
  checkSize: true,
  logViolations: true,
  blockSuspicious: false
});

/**
 * Basic security middleware for public endpoints
 */
export const basicSecurityMiddleware = createSecurityMiddleware({
  checkUserAgent: false,
  checkPatterns: true,
  enableRateLimit: false,
  checkSize: true,
  logViolations: true,
  blockSuspicious: false
});

export default {
  securityMonitoringMiddleware,
  createSecurityMiddleware,
  adminSecurityMiddleware,
  apiSecurityMiddleware,
  basicSecurityMiddleware
};