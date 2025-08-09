import { captureException, addBreadcrumb } from '../lib/monitoring/sentry-config.js';

/**
 * Error types and their severity levels
 */
const ERROR_SEVERITY = {
  ValidationError: 'warning',
  AuthenticationError: 'warning',
  AuthorizationError: 'warning',
  NotFoundError: 'info',
  RateLimitError: 'warning',
  PaymentError: 'error',
  DatabaseError: 'fatal',
  ExternalServiceError: 'error',
  InternalServerError: 'fatal'
};

/**
 * Map error to HTTP status code
 */
const ERROR_STATUS_CODES = {
  ValidationError: 400,
  AuthenticationError: 401,
  AuthorizationError: 403,
  NotFoundError: 404,
  RateLimitError: 429,
  PaymentError: 402,
  DatabaseError: 503,
  ExternalServiceError: 502,
  InternalServerError: 500
};

/**
 * Custom error class for application errors
 */
export class ApplicationError extends Error {
  constructor(message, type = 'InternalServerError', statusCode = null, details = {}) {
    super(message);
    this.name = type;
    this.type = type;
    this.statusCode = statusCode || ERROR_STATUS_CODES[type] || 500;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Classify error based on its characteristics
 */
function classifyError(error) {
  // Check for known error types
  if (error instanceof ApplicationError) {
    return error.type;
  }
  
  // Check error message patterns
  const message = error.message?.toLowerCase() || '';
  
  if (message.includes('validation') || message.includes('invalid')) {
    return 'ValidationError';
  }
  if (message.includes('unauthorized') || message.includes('authentication')) {
    return 'AuthenticationError';
  }
  if (message.includes('forbidden') || message.includes('permission')) {
    return 'AuthorizationError';
  }
  if (message.includes('not found') || message.includes('404')) {
    return 'NotFoundError';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'RateLimitError';
  }
  if (message.includes('payment') || message.includes('stripe') || message.includes('card')) {
    return 'PaymentError';
  }
  if (message.includes('database') || message.includes('sqlite') || message.includes('sql')) {
    return 'DatabaseError';
  }
  if (message.includes('api') || message.includes('external') || message.includes('third-party')) {
    return 'ExternalServiceError';
  }
  
  return 'InternalServerError';
}

/**
 * Extract useful context from request
 */
function extractRequestContext(req) {
  return {
    method: req.method,
    url: req.url,
    path: req.path || req.url?.split('?')[0],
    query: req.query,
    headers: {
      'user-agent': req.headers?.['user-agent'],
      'content-type': req.headers?.['content-type'],
      'referer': req.headers?.referer,
      'x-forwarded-for': req.headers?.['x-forwarded-for']
    },
    ip: req.ip || req.connection?.remoteAddress,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format error response for client
 */
function formatErrorResponse(error, isDevelopment = false) {
  const errorType = classifyError(error);
  const statusCode = error.statusCode || ERROR_STATUS_CODES[errorType] || 500;
  
  const response = {
    error: {
      type: errorType,
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  };
  
  // Add request ID if available
  if (error.requestId) {
    response.error.requestId = error.requestId;
  }
  
  // Add details in development or for client errors
  if (isDevelopment || statusCode < 500) {
    if (error.details) {
      response.error.details = error.details;
    }
    if (error.validationErrors) {
      response.error.validationErrors = error.validationErrors;
    }
  }
  
  // Add stack trace only in development
  if (isDevelopment && error.stack) {
    response.error.stack = error.stack.split('\n');
  }
  
  return { statusCode, response };
}

/**
 * Global error handling middleware for Vercel serverless functions
 */
export function createErrorHandler(options = {}) {
  const {
    captureErrors = true,
    logErrors = true,
    isDevelopment = process.env.VERCEL_ENV === 'development'
  } = options;
  
  return async function errorHandler(error, req, res) {
    try {
      // Generate request ID for tracking
      const requestId = req.headers?.['x-request-id'] || 
                       req.headers?.['x-vercel-id'] || 
                       `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Add request ID to error
      error.requestId = requestId;
      
      // Extract context
      const errorType = classifyError(error);
      const severity = ERROR_SEVERITY[errorType] || 'error';
      const requestContext = extractRequestContext(req);
      
      // Add breadcrumb for error tracking
      if (captureErrors) {
        addBreadcrumb({
          category: 'error',
          message: `${errorType}: ${error.message}`,
          level: severity,
          data: {
            requestId,
            path: requestContext.path,
            method: requestContext.method
          }
        });
      }
      
      // Log error
      if (logErrors) {
        console.error(`[${severity.toUpperCase()}] ${errorType}:`, {
          requestId,
          message: error.message,
          stack: error.stack,
          context: requestContext
        });
      }
      
      // Capture to Sentry for server errors
      if (captureErrors && error.statusCode >= 500) {
        captureException(error, {
          request: requestContext,
          errorType,
          severity,
          requestId
        });
      }
      
      // Format and send response
      const { statusCode, response } = formatErrorResponse(error, isDevelopment);
      
      // Set response headers
      res.setHeader('X-Request-Id', requestId);
      res.setHeader('Content-Type', 'application/json');
      
      // Send error response
      res.status(statusCode).json(response);
      
    } catch (handlerError) {
      // Fallback error handling if the error handler itself fails
      console.error('Error handler failed:', handlerError);
      
      res.status(500).json({
        error: {
          type: 'InternalServerError',
          message: 'An unexpected error occurred while processing the error',
          timestamp: new Date().toISOString()
        }
      });
    }
  };
}

/**
 * Wrap async handler to catch errors
 */
export function withErrorHandling(handler, options = {}) {
  const errorHandler = createErrorHandler(options);
  
  return async (req, res) => {
    try {
      // Add request start time for performance tracking
      req.startTime = Date.now();
      
      // Execute handler
      const result = await handler(req, res);
      
      // Log successful request timing
      const duration = Date.now() - req.startTime;
      if (duration > 1000) {
        console.warn(`Slow request: ${req.method} ${req.url} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      return errorHandler(error, req, res);
    }
  };
}

/**
 * Express-style error middleware wrapper for Vercel
 */
export function errorMiddleware(handler) {
  return withErrorHandling(handler);
}

export default {
  ApplicationError,
  createErrorHandler,
  withErrorHandling,
  errorMiddleware,
  ERROR_SEVERITY,
  ERROR_STATUS_CODES
};