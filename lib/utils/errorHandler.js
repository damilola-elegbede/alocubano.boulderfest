/**
 * Comprehensive Error Handling Utilities
 * Centralized error processing with secure logging
 */

import { ERROR_MESSAGES } from '../payment/config.js';

/**
 * Custom error classes
 */
export class PaymentError extends Error {
  constructor(message, code = 'PAYMENT_ERROR', statusCode = 400) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class InventoryError extends Error {
  constructor(message, code = 'INVENTORY_ERROR', statusCode = 409) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class SecurityError extends Error {
  constructor(message, code = 'SECURITY_ERROR', statusCode = 403) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends Error {
  constructor(message, field = null, code = 'VALIDATION_ERROR', statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Error types and their handling
 */
const ERROR_TYPES = {
  // Stripe Errors
  StripeCardError: {
    statusCode: 400,
    userMessage: 'Your card was declined. Please try a different payment method.',
    logLevel: 'warn'
  },
  StripeRateLimitError: {
    statusCode: 429,
    userMessage: 'Service temporarily unavailable. Please try again in a moment.',
    logLevel: 'warn'
  },
  StripeInvalidRequestError: {
    statusCode: 400,
    userMessage: 'Invalid request. Please check your information and try again.',
    logLevel: 'error'
  },
  StripeAPIError: {
    statusCode: 502,
    userMessage: 'Payment service error. Please try again.',
    logLevel: 'error'
  },
  StripeConnectionError: {
    statusCode: 502,
    userMessage: 'Connection error. Please try again.',
    logLevel: 'error'
  },
  StripeAuthenticationError: {
    statusCode: 500,
    userMessage: ERROR_MESSAGES.INTERNAL_ERROR,
    logLevel: 'critical'
  },

  // Custom Errors
  ValidationError: {
    statusCode: 400,
    userMessage: (error) => error.message,
    logLevel: 'info'
  },
  PaymentError: {
    statusCode: (error) => error.statusCode || 400,
    userMessage: (error) => error.message,
    logLevel: 'warn'
  },
  InventoryError: {
    statusCode: (error) => error.statusCode || 409,
    userMessage: (error) => error.message,
    logLevel: 'warn'
  },
  SecurityError: {
    statusCode: (error) => error.statusCode || 403,
    userMessage: 'Access denied',
    logLevel: 'critical'
  }
};

/**
 * Sanitize error data for logging (remove sensitive information)
 */
function sanitizeErrorData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data };
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'cardNumber', 'cvv', 'ssn',
    'creditCard', 'paymentMethod', 'bankAccount', 'routing'
  ];

  function deepSanitize(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        obj[key] = deepSanitize(value);
      }
    }
    
    return obj;
  }

  return deepSanitize(sanitized);
}

/**
 * Enhanced logging with structured format
 */
export class Logger {
  static log(level, message, data = {}, error = null) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...sanitizeErrorData(data)
    };

    if (error) {
      logData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        type: error.type
      };
    }

    // In production, send to monitoring service (Sentry, DataDog, etc.)
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to external logging service
      console.log(JSON.stringify(logData));
    } else {
      // Development logging
      console.log(`[${level.toUpperCase()}] ${message}`, logData);
    }

    // Critical errors should trigger alerts
    if (level === 'critical') {
      // TODO: Send alert (email, Slack, PagerDuty, etc.)
      console.error('CRITICAL ERROR ALERT:', logData);
    }
  }

  static info(message, data = {}) {
    this.log('info', message, data);
  }

  static warn(message, data = {}, error = null) {
    this.log('warn', message, data, error);
  }

  static error(message, data = {}, error = null) {
    this.log('error', message, data, error);
  }

  static critical(message, data = {}, error = null) {
    this.log('critical', message, data, error);
  }
}

/**
 * Process and handle errors with appropriate responses
 */
export function handleError(error, req = null, additionalContext = {}) {
  const context = {
    timestamp: new Date().toISOString(),
    ...additionalContext
  };

  if (req) {
    context.request = {
      method: req.method,
      url: req.url,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer']
    };
  }

  const errorType = ERROR_TYPES[error.name] || ERROR_TYPES[error.type];
  
  if (errorType) {
    const statusCode = typeof errorType.statusCode === 'function' 
      ? errorType.statusCode(error) 
      : errorType.statusCode;
    
    const userMessage = typeof errorType.userMessage === 'function' 
      ? errorType.userMessage(error) 
      : errorType.userMessage;

    // Log based on severity
    Logger[errorType.logLevel](error.message, context, error);

    return {
      statusCode,
      error: userMessage,
      code: error.code || error.type,
      type: error.name || 'ServerError'
    };
  }

  // Unknown error - log as critical and return generic message
  Logger.critical('Unknown error occurred', context, error);
  
  return {
    statusCode: 500,
    error: ERROR_MESSAGES.INTERNAL_ERROR,
    code: 'UNKNOWN_ERROR',
    type: 'ServerError'
  };
}

/**
 * Express-style error handling middleware
 */
export function errorMiddleware(error, req, res, next) {
  const handledError = handleError(error, req);
  
  res.status(handledError.statusCode).json({
    error: handledError.error,
    code: handledError.code,
    type: handledError.type,
    timestamp: new Date().toISOString()
  });
}

/**
 * Async handler wrapper to catch errors
 */
export function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      const handledError = handleError(error, req);
      res.status(handledError.statusCode).json({
        error: handledError.error,
        code: handledError.code,
        type: handledError.type,
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Track error metrics
 */
export function trackErrorMetrics(error, context = {}) {
  const metrics = {
    errorType: error.name || error.type,
    errorCode: error.code,
    timestamp: new Date().toISOString(),
    ...context
  };

  // TODO: Send to metrics service (DataDog, New Relic, etc.)
  Logger.info('Error metrics tracked', metrics);
}

/**
 * Security event logger
 */
export function logSecurityEvent(eventType, details, req = null) {
  const event = {
    type: 'SECURITY_EVENT',
    eventType,
    timestamp: new Date().toISOString(),
    ...sanitizeErrorData(details)
  };

  if (req) {
    event.request = {
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      method: req.method,
      url: req.url
    };
  }

  Logger.critical(`Security Event: ${eventType}`, event);
  
  // TODO: Send to security monitoring service
}

/**
 * Performance monitoring
 */
export function trackPerformance(operation, duration, context = {}) {
  const performanceData = {
    operation,
    duration,
    timestamp: new Date().toISOString(),
    ...context
  };

  if (duration > 5000) { // Log slow operations
    Logger.warn(`Slow operation detected: ${operation}`, performanceData);
  } else {
    Logger.info('Performance tracked', performanceData);
  }

  // TODO: Send to performance monitoring service
}

/**
 * Rate limiting event logger
 */
export function logRateLimitEvent(key, limit, current, req = null) {
  const event = {
    type: 'RATE_LIMIT_EXCEEDED',
    key,
    limit,
    current,
    timestamp: new Date().toISOString()
  };

  if (req) {
    event.request = {
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent']
    };
  }

  Logger.warn('Rate limit exceeded', event);
}

/**
 * Health check utilities
 */
export function createHealthCheck(checks = {}) {
  return async () => {
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    for (const [name, checkFunction] of Object.entries(checks)) {
      try {
        const result = await checkFunction();
        results.checks[name] = {
          status: 'healthy',
          ...result
        };
      } catch (error) {
        results.checks[name] = {
          status: 'unhealthy',
          error: error.message
        };
        results.status = 'unhealthy';
      }
    }

    return results;
  };
}