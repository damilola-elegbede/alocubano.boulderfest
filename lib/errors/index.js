/**
 * Structured Error Types for Enterprise Architecture
 *
 * Provides consistent error handling across all services with:
 * - Request correlation tracking
 * - Service layer identification
 * - Severity classification
 * - Recovery guidance
 * - JSON serialization for logging
 */

/**
 * Base error class with enhanced context
 */
export class BaseError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.requestId = context.requestId;
    this.traceId = context.traceId;
    this.serviceLayer = context.serviceLayer || 'unknown';
    this.severity = context.severity || 'error';
    this.recoverable = context.recoverable !== false;
    this.context = context;

    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      requestId: this.requestId,
      traceId: this.traceId,
      serviceLayer: this.serviceLayer,
      severity: this.severity,
      recoverable: this.recoverable,
      context: this.context,
      stack: this.stack
    };
  }

  toString() {
    return `${this.name}: ${this.message} [${this.serviceLayer}:${this.severity}]`;
  }
}

/**
 * Audit service specific errors
 */
export class AuditError extends BaseError {
  constructor(message, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'audit',
      severity: context.severity || 'warning'
    });

    this.auditOperation = context.operation;
    this.auditData = context.auditData;
  }
}

/**
 * Database operation errors
 */
export class DatabaseError extends BaseError {
  constructor(message, operation, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'database',
      severity: context.severity || 'error'
    });

    this.operation = operation;
    this.retryable = context.retryable !== false;
    this.sqlState = context.sqlState;
    this.connectionId = context.connectionId;
  }

  static isRetryable(error) {
    const retryablePatterns = [
      'CLIENT_CLOSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'SQLITE_BUSY',
      'SQLITE_LOCKED'
    ];

    return retryablePatterns.some(pattern =>
      error.message?.includes(pattern)
    );
  }
}

/**
 * Security related errors
 */
export class SecurityError extends BaseError {
  constructor(message, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'security',
      severity: context.severity || 'high'
    });

    this.securityLevel = context.level || 'medium';
    this.threatType = context.threatType;
    this.ipAddress = context.ipAddress;
    this.adminId = context.adminId;
    this.sessionId = context.sessionId;
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthError extends BaseError {
  constructor(message, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'auth',
      severity: context.severity || 'high'
    });

    this.authType = context.authType || 'unknown';
    this.attemptedResource = context.resource;
    this.userId = context.userId;
  }
}

/**
 * Business logic validation errors
 */
export class ValidationError extends BaseError {
  constructor(message, field, value, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'validation',
      severity: 'warning',
      recoverable: true
    });

    this.field = field;
    this.value = value;
    this.validationRules = context.rules || [];
  }
}

/**
 * External service integration errors
 */
export class ExternalServiceError extends BaseError {
  constructor(serviceName, message, context = {}) {
    super(`${serviceName}: ${message}`, {
      ...context,
      serviceLayer: 'external',
      severity: context.severity || 'error'
    });

    this.serviceName = serviceName;
    this.httpStatus = context.httpStatus;
    this.responseTime = context.responseTime;
    this.retryable = context.retryable !== false;
  }
}

/**
 * Configuration related errors
 */
export class ConfigError extends BaseError {
  constructor(message, configKey, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'config',
      severity: 'critical',
      recoverable: false
    });

    this.configKey = configKey;
    this.environment = process.env.NODE_ENV || 'unknown';
  }
}

/**
 * Middleware execution errors
 */
export class MiddlewareError extends BaseError {
  constructor(originalError, middlewareName, context = {}) {
    super(`Middleware '${middlewareName}' failed: ${originalError.message}`, {
      ...context,
      serviceLayer: 'middleware',
      severity: context.severity || 'error'
    });

    this.middlewareName = middlewareName;
    this.originalError = originalError;
    this.middlewareIndex = context.index;
  }
}

/**
 * Event processing errors
 */
export class EventProcessingError extends BaseError {
  constructor(message, eventType, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'events',
      severity: context.severity || 'error'
    });

    this.eventType = eventType;
    this.eventId = context.eventId;
    this.subscriberResults = context.subscriberResults || [];
  }
}

/**
 * Circuit breaker errors
 */
export class CircuitBreakerError extends BaseError {
  constructor(message, circuitName, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'circuit-breaker',
      severity: 'warning',
      recoverable: true
    });

    this.circuitName = circuitName;
    this.circuitState = context.state;
    this.failureCount = context.failures;
  }
}

/**
 * GDPR compliance errors
 */
export class GDPRError extends BaseError {
  constructor(message, operation, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'gdpr',
      severity: 'critical'
    });

    this.operation = operation;
    this.dataSubjectId = context.dataSubjectId;
    this.legalBasis = context.legalBasis;
    this.retentionPolicy = context.retentionPolicy;
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends BaseError {
  constructor(message, limit, context = {}) {
    super(message, {
      ...context,
      serviceLayer: 'rate-limit',
      severity: 'warning',
      recoverable: true
    });

    this.limit = limit;
    this.current = context.current;
    this.resetTime = context.resetTime;
    this.clientId = context.clientId;
  }
}

/**
 * Error factory for creating appropriate error types
 */
export class ErrorFactory {
  static create(type, message, context = {}) {
    const errorTypes = {
      audit: AuditError,
      database: DatabaseError,
      security: SecurityError,
      auth: AuthError,
      validation: ValidationError,
      external: ExternalServiceError,
      config: ConfigError,
      middleware: MiddlewareError,
      events: EventProcessingError,
      'circuit-breaker': CircuitBreakerError,
      gdpr: GDPRError,
      'rate-limit': RateLimitError
    };

    const ErrorClass = errorTypes[type] || BaseError;
    return new ErrorClass(message, context);
  }

  static fromError(originalError, newType, context = {}) {
    const newContext = {
      ...context,
      originalError: originalError.message,
      originalStack: originalError.stack
    };

    return this.create(newType, originalError.message, newContext);
  }
}

/**
 * Error correlation utilities
 */
export class ErrorCorrelation {
  static correlateErrors(errors) {
    const correlation = {
      total: errors.length,
      byService: {},
      bySeverity: {},
      byRecoverable: { true: 0, false: 0 },
      timeline: [],
      rootCauses: []
    };

    errors.forEach(error => {
      // Group by service layer
      const service = error.serviceLayer || 'unknown';
      correlation.byService[service] = (correlation.byService[service] || 0) + 1;

      // Group by severity
      const severity = error.severity || 'error';
      correlation.bySeverity[severity] = (correlation.bySeverity[severity] || 0) + 1;

      // Group by recoverability
      correlation.byRecoverable[error.recoverable ? 'true' : 'false']++;

      // Add to timeline
      correlation.timeline.push({
        timestamp: error.timestamp,
        service: service,
        severity: severity,
        message: error.message,
        requestId: error.requestId
      });
    });

    // Sort timeline chronologically
    correlation.timeline.sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Identify potential root causes (first critical/high severity errors)
    correlation.rootCauses = correlation.timeline
      .filter(e => ['critical', 'high'].includes(e.severity))
      .slice(0, 3);

    return correlation;
  }

  static generateErrorReport(errors, context = {}) {
    const correlation = this.correlateErrors(errors);

    return {
      summary: {
        requestId: context.requestId,
        traceId: context.traceId,
        errorCount: correlation.total,
        severity: this.determineMostSevereSeverity(errors),
        recoverable: correlation.byRecoverable.true > correlation.byRecoverable.false
      },
      breakdown: correlation,
      recommendations: this.generateRecommendations(correlation),
      timestamp: new Date().toISOString()
    };
  }

  static determineMostSevereSeverity(errors) {
    const severityOrder = ['critical', 'high', 'error', 'warning', 'info'];

    for (const severity of severityOrder) {
      if (errors.some(e => e.severity === severity)) {
        return severity;
      }
    }

    return 'unknown';
  }

  static generateRecommendations(correlation) {
    const recommendations = [];

    // Service-specific recommendations
    if (correlation.byService.database > 0) {
      recommendations.push('Check database connectivity and query performance');
    }

    if (correlation.byService.security > 0) {
      recommendations.push('Review security logs for potential threats');
    }

    if (correlation.byService.audit > 0) {
      recommendations.push('Verify audit system health and storage capacity');
    }

    // Severity-based recommendations
    if (correlation.bySeverity.critical > 0) {
      recommendations.push('URGENT: Address critical errors immediately');
    }

    if (correlation.bySeverity.high > 2) {
      recommendations.push('Multiple high-severity errors detected - investigate patterns');
    }

    // Pattern-based recommendations
    if (correlation.total > 10) {
      recommendations.push('High error volume - consider circuit breaker activation');
    }

    if (correlation.byRecoverable.false > correlation.byRecoverable.true) {
      recommendations.push('Many non-recoverable errors - manual intervention may be required');
    }

    return recommendations.length > 0 ? recommendations : ['No specific recommendations - monitor for patterns'];
  }
}

// Export all error types and utilities
export {
  BaseError,
  AuditError,
  DatabaseError,
  SecurityError,
  AuthError,
  ValidationError,
  ExternalServiceError,
  ConfigError,
  MiddlewareError,
  EventProcessingError,
  CircuitBreakerError,
  GDPRError,
  RateLimitError,
  ErrorFactory,
  ErrorCorrelation
};