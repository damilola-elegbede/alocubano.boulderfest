/**
 * Sentry Configuration for Payment System Monitoring
 * Comprehensive error tracking with payment-specific contexts
 */

import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

// Payment-specific error types for better categorization
export const PAYMENT_ERROR_TYPES = {
  PAYMENT_FAILED: 'payment_failed',
  VALIDATION_ERROR: 'validation_error',
  INVENTORY_ERROR: 'inventory_error',
  STRIPE_ERROR: 'stripe_error',
  DATABASE_ERROR: 'database_error',
  INTEGRATION_ERROR: 'integration_error',
  SECURITY_VIOLATION: 'security_violation',
  PERFORMANCE_ISSUE: 'performance_issue'
};

// Payment severity levels
export const PAYMENT_SEVERITY = {
  CRITICAL: 'fatal',    // Payment system down
  HIGH: 'error',        // Payment failures
  MEDIUM: 'warning',    // Performance issues
  LOW: 'info'          // Normal operations
};

/**
 * Initialize Sentry with payment-specific configuration
 */
export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    
    // Sample rate for error events
    sampleRate: process.env.NODE_ENV === 'production' ? 0.8 : 1.0,
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Profiling integration
    integrations: [
      new ProfilingIntegration(),
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({
        app: undefined // Will be set when Express app is available
      })
    ],
    
    // Release tracking
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'development',
    
    // Performance monitoring
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
    
    // Before send hook for data sanitization
    beforeSend(event, hint) {
      // Remove sensitive payment data
      if (event.exception) {
        const sanitizedEvent = sanitizePaymentData(event);
        return sanitizedEvent;
      }
      return event;
    },
    
    // Before send transaction hook
    beforeSendTransaction(event) {
      // Add payment-specific tags
      if (event.transaction?.includes('payment') || event.transaction?.includes('checkout')) {
        event.tags = {
          ...event.tags,
          payment_flow: true,
          critical_path: true
        };
      }
      return event;
    },
    
    // Initial scope configuration
    initialScope: {
      tags: {
        component: 'payment-system',
        service: 'alocubano-boulderfest'
      }
    }
  });
  
  console.log('Sentry initialized for payment monitoring');
}

/**
 * Sanitize sensitive payment data before sending to Sentry
 */
function sanitizePaymentData(event) {
  const sensitiveFields = [
    'card_number',
    'cvv',
    'ssn',
    'bank_account',
    'stripe_secret_key',
    'api_key',
    'password',
    'token'
  ];
  
  // Recursively sanitize object
  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  return sanitizeObject(event);
}

/**
 * Track payment-specific errors with enhanced context
 */
export function trackPaymentError(error, context = {}) {
  Sentry.withScope((scope) => {
    // Set payment-specific tags
    scope.setTag('error_category', 'payment');
    scope.setTag('payment_flow', context.flow || 'unknown');
    scope.setTag('payment_method', context.paymentMethod || 'unknown');
    scope.setTag('error_type', context.errorType || PAYMENT_ERROR_TYPES.PAYMENT_FAILED);
    
    // Set user context (without sensitive data)
    if (context.user) {
      scope.setUser({
        id: context.user.email ? hashEmail(context.user.email) : 'anonymous',
        email: context.user.email ? maskEmail(context.user.email) : undefined,
        username: context.user.name || 'unknown'
      });
    }
    
    // Set payment context
    scope.setContext('payment', {
      orderId: context.orderId,
      sessionId: context.sessionId,
      amount: context.amount,
      currency: context.currency,
      items: context.items?.map(item => ({
        type: item.type,
        quantity: item.quantity,
        // Remove pricing info for privacy
      })),
      processingTime: context.processingTime,
      retryCount: context.retryCount || 0
    });
    
    // Set technical context
    scope.setContext('technical', {
      apiEndpoint: context.endpoint,
      httpMethod: context.method,
      statusCode: context.statusCode,
      requestId: context.requestId,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress ? maskIP(context.ipAddress) : undefined
    });
    
    // Set fingerprint for better grouping
    if (context.errorType) {
      scope.setFingerprint([
        context.errorType,
        error.message || 'unknown',
        context.endpoint || 'unknown'
      ]);
    }
    
    // Set severity based on error type
    const severity = getErrorSeverity(context.errorType, error);
    scope.setLevel(severity);
    
    // Capture the error
    Sentry.captureException(error);
  });
}

/**
 * Track successful payment transactions
 */
export function trackPaymentSuccess(context = {}) {
  Sentry.addBreadcrumb({
    category: 'payment',
    message: 'Payment completed successfully',
    level: 'info',
    data: {
      orderId: context.orderId,
      amount: context.amount,
      currency: context.currency,
      paymentMethod: context.paymentMethod,
      processingTime: context.processingTime
    }
  });
  
  // Track as custom event
  Sentry.withScope((scope) => {
    scope.setTag('event_type', 'payment_success');
    scope.setTag('payment_method', context.paymentMethod);
    scope.setLevel('info');
    
    scope.setContext('payment_success', {
      orderId: context.orderId,
      amount: context.amount,
      currency: context.currency,
      processingTime: context.processingTime,
      timestamp: new Date().toISOString()
    });
    
    Sentry.captureMessage('Payment completed successfully', 'info');
  });
}

/**
 * Track performance metrics
 */
export function trackPerformanceMetric(metric, value, context = {}) {
  Sentry.addBreadcrumb({
    category: 'performance',
    message: `${metric}: ${value}ms`,
    level: value > 3000 ? 'warning' : 'info',
    data: {
      metric,
      value,
      threshold: context.threshold,
      endpoint: context.endpoint
    }
  });
  
  // Alert on slow performance
  if (value > (context.threshold || 5000)) {
    Sentry.withScope((scope) => {
      scope.setTag('performance_issue', true);
      scope.setTag('metric_type', metric);
      scope.setLevel('warning');
      
      scope.setContext('performance', {
        metric,
        value,
        threshold: context.threshold,
        endpoint: context.endpoint,
        timestamp: new Date().toISOString()
      });
      
      Sentry.captureMessage(`Slow performance detected: ${metric} = ${value}ms`, 'warning');
    });
  }
}

/**
 * Track security events
 */
export function trackSecurityEvent(eventType, details = {}) {
  Sentry.withScope((scope) => {
    scope.setTag('security_event', true);
    scope.setTag('event_type', eventType);
    scope.setLevel('error');
    
    scope.setContext('security', {
      eventType,
      timestamp: new Date().toISOString(),
      ...details
    });
    
    scope.setFingerprint(['security', eventType, details.endpoint || 'unknown']);
    
    Sentry.captureMessage(`Security event: ${eventType}`, 'error');
  });
}

/**
 * Determine error severity based on type and error details
 */
function getErrorSeverity(errorType, error) {
  switch (errorType) {
    case PAYMENT_ERROR_TYPES.SECURITY_VIOLATION:
      return PAYMENT_SEVERITY.CRITICAL;
    
    case PAYMENT_ERROR_TYPES.STRIPE_ERROR:
    case PAYMENT_ERROR_TYPES.PAYMENT_FAILED:
      return error.code === 'card_declined' ? PAYMENT_SEVERITY.MEDIUM : PAYMENT_SEVERITY.HIGH;
    
    case PAYMENT_ERROR_TYPES.DATABASE_ERROR:
      return PAYMENT_SEVERITY.HIGH;
    
    case PAYMENT_ERROR_TYPES.PERFORMANCE_ISSUE:
      return PAYMENT_SEVERITY.MEDIUM;
    
    case PAYMENT_ERROR_TYPES.VALIDATION_ERROR:
      return PAYMENT_SEVERITY.LOW;
    
    default:
      return PAYMENT_SEVERITY.HIGH;
  }
}

/**
 * Utility functions for data privacy
 */
function hashEmail(email) {
  // Simple hash for user identification without exposing email
  return Buffer.from(email).toString('base64').substring(0, 8);
}

function maskEmail(email) {
  const [username, domain] = email.split('@');
  return `${username.substring(0, 2)}***@${domain}`;
}

function maskIP(ip) {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.xxx.xxx`;
}

/**
 * Express middleware for automatic error tracking
 */
export function sentryErrorMiddleware() {
  return (err, req, res, next) => {
    const context = {
      endpoint: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      requestId: req.headers['x-request-id'],
      errorType: err.type || PAYMENT_ERROR_TYPES.INTEGRATION_ERROR
    };
    
    // Extract payment context from request
    if (req.body) {
      context.user = req.body.customerInfo;
      context.amount = req.body.totalAmount;
      context.orderId = req.body.orderId;
    }
    
    trackPaymentError(err, context);
    next(err);
  };
}

/**
 * Payment transaction wrapper with automatic monitoring
 */
export function withPaymentMonitoring(operationName, operation) {
  return async (...args) => {
    const startTime = Date.now();
    const transaction = Sentry.startTransaction({
      name: operationName,
      op: 'payment_operation'
    });
    
    try {
      Sentry.getCurrentHub().configureScope(scope => {
        scope.setSpan(transaction);
      });
      
      const result = await operation(...args);
      
      const processingTime = Date.now() - startTime;
      trackPerformanceMetric('payment_processing_time', processingTime, {
        endpoint: operationName,
        threshold: 3000
      });
      
      transaction.setStatus('ok');
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      trackPaymentError(error, {
        endpoint: operationName,
        processingTime,
        errorType: PAYMENT_ERROR_TYPES.PAYMENT_FAILED
      });
      
      transaction.setStatus('internal_error');
      throw error;
      
    } finally {
      transaction.finish();
    }
  };
}

export default {
  initSentry,
  trackPaymentError,
  trackPaymentSuccess,
  trackPerformanceMetric,
  trackSecurityEvent,
  sentryErrorMiddleware,
  withPaymentMonitoring,
  PAYMENT_ERROR_TYPES,
  PAYMENT_SEVERITY
};