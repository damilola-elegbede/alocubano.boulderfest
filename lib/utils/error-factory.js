/**
 * Error Factory Utility
 * Provides standardized error creation with consistent error codes,
 * context information, and error handling patterns across the application.
 */

/**
 * Standard error codes used throughout the application
 * Frozen to prevent accidental modification
 */
export const ErrorCodes = Object.freeze({
  // Database errors
  DB_CONFIG_ERROR: 'DB_CONFIG_ERROR',
  DB_CONNECTION_ERROR: 'DB_CONNECTION_ERROR',
  DB_AUTH_ERROR: 'DB_AUTH_ERROR',
  DB_QUERY_ERROR: 'DB_QUERY_ERROR',
  DB_TIMEOUT_ERROR: 'DB_TIMEOUT_ERROR',
  DB_MIGRATION_ERROR: 'DB_MIGRATION_ERROR',
  DB_TRANSACTION_ERROR: 'DB_TRANSACTION_ERROR',
  
  // Authentication errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_MFA_REQUIRED: 'AUTH_MFA_REQUIRED',
  AUTH_MFA_INVALID: 'AUTH_MFA_INVALID',
  
  // Validation errors
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_OUT_OF_RANGE: 'VALIDATION_OUT_OF_RANGE',
  VALIDATION_INVALID_EMAIL: 'VALIDATION_INVALID_EMAIL',
  VALIDATION_INVALID_PHONE: 'VALIDATION_INVALID_PHONE',
  VALIDATION_DUPLICATE_VALUE: 'VALIDATION_DUPLICATE_VALUE',
  
  // API errors
  API_NOT_FOUND: 'API_NOT_FOUND',
  API_METHOD_NOT_ALLOWED: 'API_METHOD_NOT_ALLOWED',
  API_RATE_LIMITED: 'API_RATE_LIMITED',
  API_EXTERNAL_SERVICE_ERROR: 'API_EXTERNAL_SERVICE_ERROR',
  API_INVALID_REQUEST: 'API_INVALID_REQUEST',
  API_SERVER_ERROR: 'API_SERVER_ERROR',
  API_SERVICE_UNAVAILABLE: 'API_SERVICE_UNAVAILABLE',
  
  // Business logic errors
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  TICKET_ALREADY_USED: 'TICKET_ALREADY_USED',
  TICKET_EXPIRED: 'TICKET_EXPIRED',
  TICKET_INVALID_TYPE: 'TICKET_INVALID_TYPE',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  PAYMENT_REFUND_FAILED: 'PAYMENT_REFUND_FAILED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  EMAIL_INVALID_TEMPLATE: 'EMAIL_INVALID_TEMPLATE',
  NEWSLETTER_SUBSCRIPTION_FAILED: 'NEWSLETTER_SUBSCRIPTION_FAILED',
  
  // Registration errors
  REGISTRATION_NOT_FOUND: 'REGISTRATION_NOT_FOUND',
  REGISTRATION_ALREADY_COMPLETE: 'REGISTRATION_ALREADY_COMPLETE',
  REGISTRATION_EXPIRED: 'REGISTRATION_EXPIRED',
  REGISTRATION_INVALID_TOKEN: 'REGISTRATION_INVALID_TOKEN',
  
  // File/Upload errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_INVALID_TYPE: 'FILE_INVALID_TYPE',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  
  // Configuration errors
  CONFIG_MISSING_REQUIRED: 'CONFIG_MISSING_REQUIRED',
  CONFIG_INVALID_VALUE: 'CONFIG_INVALID_VALUE',
  
  // General system errors
  SYSTEM_MAINTENANCE: 'SYSTEM_MAINTENANCE',
  SYSTEM_OVERLOADED: 'SYSTEM_OVERLOADED',
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE'
});

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
    const messageMap = Object.freeze({
      // Database errors
      [ErrorCodes.DB_CONFIG_ERROR]: 'Service configuration error. Please try again later.',
      [ErrorCodes.DB_CONNECTION_ERROR]: 'Database connection error. Please try again later.',
      [ErrorCodes.DB_AUTH_ERROR]: 'Database authentication error. Please try again later.',
      [ErrorCodes.DB_QUERY_ERROR]: 'Database query error. Please try again later.',
      [ErrorCodes.DB_TIMEOUT_ERROR]: 'Database operation timed out. Please try again later.',
      
      // Authentication errors
      [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 'Invalid credentials. Please check your login information.',
      [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
      [ErrorCodes.AUTH_TOKEN_INVALID]: 'Invalid authentication token. Please log in again.',
      [ErrorCodes.AUTH_REQUIRED]: 'Authentication required. Please log in to continue.',
      [ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action.',
      [ErrorCodes.AUTH_SESSION_EXPIRED]: 'Your session has expired. Please log in again.',
      [ErrorCodes.AUTH_MFA_REQUIRED]: 'Multi-factor authentication is required.',
      [ErrorCodes.AUTH_MFA_INVALID]: 'Invalid verification code. Please try again.',
      
      // Validation errors
      [ErrorCodes.VALIDATION_REQUIRED_FIELD]: 'Required field is missing.',
      [ErrorCodes.VALIDATION_INVALID_FORMAT]: 'Invalid format provided.',
      [ErrorCodes.VALIDATION_OUT_OF_RANGE]: 'Value is out of acceptable range.',
      [ErrorCodes.VALIDATION_INVALID_EMAIL]: 'Please enter a valid email address.',
      [ErrorCodes.VALIDATION_INVALID_PHONE]: 'Please enter a valid phone number.',
      [ErrorCodes.VALIDATION_DUPLICATE_VALUE]: 'This value is already in use.',
      
      // API errors
      [ErrorCodes.API_NOT_FOUND]: 'Resource not found.',
      [ErrorCodes.API_METHOD_NOT_ALLOWED]: 'Request method not allowed.',
      [ErrorCodes.API_RATE_LIMITED]: 'Too many requests. Please try again later.',
      [ErrorCodes.API_EXTERNAL_SERVICE_ERROR]: 'External service error. Please try again later.',
      [ErrorCodes.API_INVALID_REQUEST]: 'Invalid request. Please check your input.',
      [ErrorCodes.API_SERVER_ERROR]: 'Server error. Please try again later.',
      [ErrorCodes.API_SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again later.',
      
      // Business logic errors
      [ErrorCodes.TICKET_NOT_FOUND]: 'Ticket not found.',
      [ErrorCodes.TICKET_ALREADY_USED]: 'This ticket has already been used.',
      [ErrorCodes.TICKET_EXPIRED]: 'This ticket has expired.',
      [ErrorCodes.TICKET_INVALID_TYPE]: 'Invalid ticket type.',
      [ErrorCodes.PAYMENT_FAILED]: 'Payment processing failed. Please try again.',
      [ErrorCodes.PAYMENT_CANCELLED]: 'Payment was cancelled.',
      [ErrorCodes.PAYMENT_REFUND_FAILED]: 'Refund processing failed. Please contact support.',
      [ErrorCodes.EMAIL_SEND_FAILED]: 'Failed to send email. Please try again later.',
      [ErrorCodes.EMAIL_INVALID_TEMPLATE]: 'Email template error. Please contact support.',
      [ErrorCodes.NEWSLETTER_SUBSCRIPTION_FAILED]: 'Newsletter subscription failed. Please try again.',
      
      // Registration errors
      [ErrorCodes.REGISTRATION_NOT_FOUND]: 'Registration not found.',
      [ErrorCodes.REGISTRATION_ALREADY_COMPLETE]: 'Registration is already complete.',
      [ErrorCodes.REGISTRATION_EXPIRED]: 'Registration link has expired.',
      [ErrorCodes.REGISTRATION_INVALID_TOKEN]: 'Invalid registration token.',
      
      // File errors
      [ErrorCodes.FILE_NOT_FOUND]: 'File not found.',
      [ErrorCodes.FILE_TOO_LARGE]: 'File is too large. Please choose a smaller file.',
      [ErrorCodes.FILE_INVALID_TYPE]: 'Invalid file type. Please choose a different file.',
      [ErrorCodes.FILE_UPLOAD_FAILED]: 'File upload failed. Please try again.',
      
      // Configuration errors
      [ErrorCodes.CONFIG_MISSING_REQUIRED]: 'Missing required configuration. Please contact support.',
      [ErrorCodes.CONFIG_INVALID_VALUE]: 'Invalid configuration value. Please contact support.',
      
      // System errors
      [ErrorCodes.SYSTEM_MAINTENANCE]: 'System is under maintenance. Please try again later.',
      [ErrorCodes.SYSTEM_OVERLOADED]: 'System is temporarily overloaded. Please try again later.',
      [ErrorCodes.FEATURE_NOT_AVAILABLE]: 'This feature is not currently available.'
    });

    return messageMap[error.code] || 'An unexpected error occurred. Please try again.';
  }
}

export default ErrorFactory;
