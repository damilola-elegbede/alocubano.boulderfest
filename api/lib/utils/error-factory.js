/**
 * Error Factory Utility
 * Provides standardized error creation with consistent error codes,
 * context information, and error handling patterns across the application.
 */

/**
 * Standard error codes used throughout the application
 */
export const ErrorCodes = {
  // Database errors
  DB_CONFIG_ERROR: 'DB_CONFIG_ERROR',
  DB_CONNECTION_ERROR: 'DB_CONNECTION_ERROR',
  DB_AUTH_ERROR: 'DB_AUTH_ERROR',
  DB_QUERY_ERROR: 'DB_QUERY_ERROR',
  DB_TIMEOUT_ERROR: 'DB_TIMEOUT_ERROR',
  
  // Authentication errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  
  // Validation errors
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_OUT_OF_RANGE: 'VALIDATION_OUT_OF_RANGE',
  
  // API errors
  API_NOT_FOUND: 'API_NOT_FOUND',
  API_METHOD_NOT_ALLOWED: 'API_METHOD_NOT_ALLOWED',
  API_RATE_LIMITED: 'API_RATE_LIMITED',
  API_EXTERNAL_SERVICE_ERROR: 'API_EXTERNAL_SERVICE_ERROR',
  
  // Business logic errors
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  TICKET_ALREADY_USED: 'TICKET_ALREADY_USED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED'
};

/**
 * Error factory class for creating standardized errors
 */
export class ErrorFactory {
  /**
   * Create a standardized error with code and context
   * @param {string} message - Error message
   * @param {string} code - Error code from ErrorCodes
   * @param {string} context - Context where error occurred
   * @param {Object} metadata - Additional metadata
   * @returns {Error} Standardized error
   */
  static createError(message, code, context, metadata = {}) {
    const error = new Error(message);
    error.code = code;
    error.context = context;
    error.timestamp = new Date().toISOString();
    error.metadata = metadata;
    return error;
  }

  /**
   * Create database configuration error
   * @param {string} message - Error message
   * @param {string} context - Configuration context
   * @param {Object} metadata - Additional metadata
   * @returns {Error} Database config error
   */
  static createDatabaseConfigError(message, context, metadata = {}) {
    return this.createError(message, ErrorCodes.DB_CONFIG_ERROR, context, metadata);
  }

  /**
   * Create database connection error
   * @param {string} message - Error message
   * @param {Object} metadata - Additional metadata
   * @returns {Error} Database connection error
   */
  static createDatabaseConnectionError(message, metadata = {}) {
    return this.createError(message, ErrorCodes.DB_CONNECTION_ERROR, 'database-connection', metadata);
  }

  /**
   * Create authentication error
   * @param {string} message - Error message
   * @param {string} code - Authentication error code
   * @param {Object} metadata - Additional metadata
   * @returns {Error} Authentication error
   */
  static createAuthError(message, code = ErrorCodes.AUTH_INVALID_CREDENTIALS, metadata = {}) {
    return this.createError(message, code, 'authentication', metadata);
  }

  /**
   * Create validation error
   * @param {string} message - Error message
   * @param {string} field - Field that failed validation
   * @param {string} code - Validation error code
   * @param {Object} metadata - Additional metadata
   * @returns {Error} Validation error
   */
  static createValidationError(message, field, code = ErrorCodes.VALIDATION_REQUIRED_FIELD, metadata = {}) {
    return this.createError(message, code, 'validation', { field, ...metadata });
  }

  /**
   * Create API error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - API error code
   * @param {Object} metadata - Additional metadata
   * @returns {Error} API error
   */
  static createApiError(message, statusCode, code, metadata = {}) {
    const error = this.createError(message, code, 'api', { statusCode, ...metadata });
    error.statusCode = statusCode;
    return error;
  }

  /**
   * Create timeout error
   * @param {string} operation - Operation that timed out
   * @param {number} timeout - Timeout value in milliseconds
   * @param {Object} metadata - Additional metadata
   * @returns {Error} Timeout error
   */
  static createTimeoutError(operation, timeout, metadata = {}) {
    const message = `${operation} timed out after ${timeout}ms`;
    return this.createError(message, ErrorCodes.DB_TIMEOUT_ERROR, 'timeout', { operation, timeout, ...metadata });
  }

  /**
   * Check if error is retryable based on its code and context
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is retryable
   */
  static isRetryableError(error) {
    const retryableCodes = [
      ErrorCodes.DB_CONNECTION_ERROR,
      ErrorCodes.DB_TIMEOUT_ERROR,
      ErrorCodes.API_EXTERNAL_SERVICE_ERROR
    ];
    
    return retryableCodes.includes(error.code);
  }

  /**
   * Get user-friendly error message for display
   * @param {Error} error - Error to get message for
   * @returns {string} User-friendly message
   */
  static getUserFriendlyMessage(error) {
    const messageMap = {
      [ErrorCodes.DB_CONFIG_ERROR]: 'Service configuration error. Please try again later.',
      [ErrorCodes.DB_CONNECTION_ERROR]: 'Database connection error. Please try again later.',
      [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 'Invalid credentials. Please check your login information.',
      [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
      [ErrorCodes.VALIDATION_REQUIRED_FIELD]: 'Required field is missing.',
      [ErrorCodes.VALIDATION_INVALID_FORMAT]: 'Invalid format provided.',
      [ErrorCodes.API_NOT_FOUND]: 'Resource not found.',
      [ErrorCodes.API_RATE_LIMITED]: 'Too many requests. Please try again later.',
      [ErrorCodes.TICKET_NOT_FOUND]: 'Ticket not found.',
      [ErrorCodes.TICKET_ALREADY_USED]: 'This ticket has already been used.',
      [ErrorCodes.PAYMENT_FAILED]: 'Payment processing failed. Please try again.',
      [ErrorCodes.EMAIL_SEND_FAILED]: 'Failed to send email. Please try again later.'
    };

    return messageMap[error.code] || 'An unexpected error occurred. Please try again.';
  }
}

export default ErrorFactory;
