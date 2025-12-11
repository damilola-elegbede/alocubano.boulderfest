/**
 * Admin Audit Middleware
 * Automatically logs all admin endpoint access for security monitoring
 * Integrates with the audit service to provide comprehensive logging
 */

import auditService from './audit-service.js';
import auditCircuitBreaker from './audit-circuit-breaker.js';
import { logger } from './logger.js';
import { parse } from 'cookie';
import { optionalField } from './value-utils.js';

/**
 * Extract client IP address from request, handling various proxy headers
 */
function extractClientIP(req) {
  // Check various headers for real IP (Vercel, Cloudflare, etc.)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }

  // Check other common headers
  return (
    req.headers['x-real-ip'] ||
    req.headers['x-client-ip'] ||
    req.headers['cf-connecting-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

/**
 * Extract session information from request
 */
function extractSessionInfo(req) {
  let sessionId = null;
  let adminUser = null;

  // Try to get session from cookie
  const cookies = parse(req.headers.cookie || '');
  if (cookies.admin_session) {
    sessionId = cookies.admin_session;
  }

  // Try to get session from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessionId = authHeader.substring(7);
  }

  // If we have admin info from auth middleware, use it
  if (req.admin) {
    adminUser = req.admin.id || req.admin.email || 'admin';
  }

  return { sessionId, adminUser };
}

/**
 * Sanitize request body for logging (remove sensitive data)
 */
function sanitizeRequestBody(body, contentType = '') {
  if (!body) return null;

  try {
    let parsedBody = body;

    // Parse JSON if needed
    if (typeof body === 'string' && contentType.includes('application/json')) {
      parsedBody = JSON.parse(body);
    }

    // Remove sensitive fields
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'auth', 'session',
      'credentials', 'authorization', 'cookie', 'csrf',
      'firstName', 'lastName', 'customerFirstName', 'customerLastName'
    ];

    if (typeof parsedBody === 'object' && parsedBody !== null) {
      const sanitized = { ...parsedBody };

      for (const field of sensitiveFields) {
        for (const key in sanitized) {
          if (key.toLowerCase().includes(field.toLowerCase())) {
            sanitized[key] = '[REDACTED]';
          }
        }
      }

      return sanitized;
    }

    return parsedBody;
  } catch (error) {
    // If parsing fails, return truncated string
    return typeof body === 'string'
      ? body.substring(0, 200) + (body.length > 200 ? '...' : '')
      : '[UNPARSEABLE]';
  }
}

/**
 * Collect request metadata for audit logging
 */
function collectRequestMetadata(req) {
  return {
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    accept: req.headers['accept'],
    acceptLanguage: req.headers['accept-language'],
    referer: req.headers['referer'],
    origin: req.headers['origin'],
    host: req.headers['host'],
    queryParams: req.query ? Object.keys(req.query).length > 0 ? req.query : null : null,
    timestamp: new Date().toISOString()
  };
}

/**
 * Admin audit middleware factory
 * Creates middleware that logs all admin endpoint access
 */
export function withAdminAudit(handler, options = {}) {
  const {
    logBody = true,
    logMetadata = true,
    skipPaths = [],
    skipMethods = [],
    maxBodySize = 10000 // 10KB limit for logged request bodies
  } = options;

  return async (req, res) => {
    const startTime = Date.now();
    logger.debug('[AdminAudit] Generating request ID, auditService exists:', !!auditService);
    const requestId = auditService.generateRequestId();
    logger.debug('[AdminAudit] Generated request ID:', requestId);

    // Skip logging for specified paths or methods
    if (skipPaths.some(path => req.url?.includes(path)) ||
        skipMethods.includes(req.method)) {
      return handler(req, res);
    }

    // Extract request context
    const ipAddress = extractClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const { sessionId, adminUser } = extractSessionInfo(req);

    // Prepare request body for logging
    let requestBody = null;
    if (logBody && req.body) {
      const bodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (bodyString.length <= maxBodySize) {
        requestBody = sanitizeRequestBody(req.body, req.headers['content-type']);
      } else {
        requestBody = {
          note: `Body too large (${bodyString.length} bytes), truncated`,
          sample: bodyString.substring(0, 200) + '...'
        };
      }
    }

    // Collect metadata
    const metadata = logMetadata ? collectRequestMetadata(req) : null;

    // Wrap response to capture response details
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;

    let responseStatus = 200; // Default to 200, will be updated when response methods are called
    let responseLogged = false;

    // Function to log the audit entry with circuit breaker protection
    const logAuditEntry = async (error = null, finalResponseStatus = null) => {
      if (responseLogged) return; // Prevent duplicate logging
      responseLogged = true;

      const endTime = Date.now();
      const responseTimeMs = endTime - startTime;

      // Use the final response status if provided, otherwise use captured status
      const actualResponseStatus = finalResponseStatus || responseStatus;

      logger.debug('[AdminAudit] Logging audit entry with status:', actualResponseStatus,
                   'original responseStatus:', responseStatus, 'finalResponseStatus:', finalResponseStatus);

      // CRITICAL: Use circuit breaker to prevent audit failures from blocking business operations
      const auditResult = await auditCircuitBreaker.executeAudit(
        () => auditService.logAdminAccess({
          requestId,
          adminUser,
          sessionId,
          ipAddress,
          userAgent,
          requestMethod: req.method,
          requestUrl: req.url,
          requestBody,
          responseStatus: actualResponseStatus,
          responseTimeMs,
          metadata,
          error: optionalField(error?.message)
        }),
        {
          endpoint: req.url,
          method: req.method,
          adminUser,
          requestId
        }
      );

      // Log circuit breaker status for monitoring
      if (auditResult.bypassed) {
        logger.warn('[AdminAudit] Audit bypassed due to circuit breaker', {
          requestId,
          endpoint: req.url,
          circuitState: auditResult.circuitState,
          reason: auditResult.reason
        });
      } else if (!auditResult.success) {
        logger.error('[AdminAudit] Audit logging failed but business continues', {
          requestId,
          endpoint: req.url,
          error: auditResult.error,
          circuitState: auditResult.circuitState
        });
      }

      // Log successful audit completion
      if (auditResult.success) {
        logger.debug(`[AdminAudit] ${req.method} ${req.url} - ${responseStatus} (${responseTimeMs}ms) - Audit logged`);
      }
    };

    // Wrap response methods to capture status
    res.send = function(body) {
      // Capture the status code - use the current statusCode or default to 200 if not set
      const finalStatus = this.statusCode && this.statusCode > 0 ? this.statusCode : 200;
      responseStatus = finalStatus;
      logAuditEntry(null, finalStatus).catch(err => {
        logger.error('[AdminAudit] Failed to log audit entry on send:', err);
      });
      return originalSend.call(this, body);
    };

    res.json = function(obj) {
      // Capture the status code - use the current statusCode or default to 200 if not set
      const finalStatus = this.statusCode && this.statusCode > 0 ? this.statusCode : 200;
      responseStatus = finalStatus;
      logAuditEntry(null, finalStatus).catch(err => {
        logger.error('[AdminAudit] Failed to log audit entry on json:', err);
      });
      return originalJson.call(this, obj);
    };

    res.end = function(chunk, encoding) {
      // Capture the status code - use the current statusCode or default to 200 if not set
      const finalStatus = this.statusCode && this.statusCode > 0 ? this.statusCode : 200;
      responseStatus = finalStatus;
      logAuditEntry(null, finalStatus).catch(err => {
        logger.error('[AdminAudit] Failed to log audit entry on end:', err);
      });
      return originalEnd.call(this, chunk, encoding);
    };

    // Handle errors in the handler
    try {
      // Add request ID to request for correlation
      req.auditRequestId = requestId;

      // Call the actual handler
      const result = await handler(req, res);

      // If handler completed without sending response, log it
      if (!responseLogged) {
        const finalStatus = (res.statusCode && res.statusCode > 0) ? res.statusCode : 200;
        await logAuditEntry(null, finalStatus);
      }

      return result;
    } catch (error) {
      // Log the error - capture status code or default to 500 for errors
      const errorStatus = (res.statusCode && res.statusCode > 0) ? res.statusCode : 500;
      responseStatus = errorStatus;
      await logAuditEntry(error, errorStatus);

      // Re-throw the error for normal error handling
      throw error;
    }
  };
}

/**
 * Middleware specifically for admin authentication endpoints
 * Provides enhanced logging for login attempts and security events
 */
export function withAuthAudit(handler, options = {}) {
  const {
    logLoginAttempts = true,
    logFailedAttempts = true,
    logSessionEvents = true
  } = options;

  // Simply delegate to withAdminAudit which already logs to the correct event_type
  // The admin audit middleware handles all the logging with the proper 'admin_access' event type
  return withAdminAudit(handler, {
    ...options,
    // Ensure body logging is enabled for auth endpoints
    logBody: true,
    logMetadata: true
  });
}

/**
 * Middleware for high-sensitivity admin operations
 * Provides detailed logging for critical admin actions
 */
export function withHighSecurityAudit(handler, options = {}) {
  const {
    requireExplicitAction = true,
    logFullRequest = true,
    alertOnFailure = true
  } = options;

  return withAdminAudit(async (req, res) => {
    const { sessionId, adminUser } = extractSessionInfo(req);

    // Log high-security operation access
    try {
      await auditService.logDataChange({
        requestId: req.auditRequestId,
        action: 'high_security_access',
        targetType: 'admin_endpoint',
        targetId: req.url,
        adminUser,
        sessionId,
        ipAddress: extractClientIP(req),
        userAgent: req.headers['user-agent'],
        metadata: {
          method: req.method,
          url: req.url,
          body: logFullRequest ? sanitizeRequestBody(req.body, req.headers['content-type']) : null,
          query: req.query,
          timestamp: new Date().toISOString()
        },
        severity: 'warning'
      });
    } catch (error) {
      logger.warn('[HighSecurityAudit] Failed to log high-security access:', error.message);
    }

    return handler(req, res);
  }, {
    ...options,
    logBody: logFullRequest,
    logMetadata: true
  });
}

/**
 * Simple audit wrapper for API endpoints that need basic logging
 */
export function auditApiEndpoint(handler, action = 'api_call') {
  return withAdminAudit(handler, {
    logBody: false,
    logMetadata: false,
    skipMethods: ['GET'] // Usually skip GET requests for basic auditing
  });
}

/**
 * Alias for withAdminAudit to maintain backward compatibility
 */
export const withActivityAudit = withAdminAudit;

export default {
  withAdminAudit,
  withAuthAudit,
  withHighSecurityAudit,
  auditApiEndpoint,
  withActivityAudit
};