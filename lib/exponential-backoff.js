/**
 * Exponential Backoff Utility
 * Provides retry logic with exponential delays for transient failures
 *
 * Features:
 * - Configurable retry attempts and delays
 * - Exponential backoff with jitter to prevent thundering herd
 * - Custom retry predicates for fine-grained control
 * - Error aggregation for debugging
 * - Timeout support for each attempt
 * - Detailed logging for monitoring
 */

import { logger } from './logger.js';

/**
 * Default retry predicate - determines if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error) {
  // Network-level errors (ECONNREFUSED, ETIMEDOUT, etc.)
  const networkErrors = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
    'EPIPE',
    'ENOTFOUND',
    'EAI_AGAIN'
  ];

  if (error.code && networkErrors.includes(error.code)) {
    return true;
  }

  // HTTP status codes
  const statusCode = error.statusCode || error.status || error.response?.status;

  // Retryable HTTP status codes
  const retryableStatusCodes = [
    408, // Request Timeout
    429, // Too Many Requests (Rate Limit)
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
  ];

  if (statusCode && retryableStatusCodes.includes(statusCode)) {
    return true;
  }

  // Service-specific errors
  const errorMessage = error.message?.toLowerCase() || '';

  // Brevo rate limiting
  if (errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')) {
    return true;
  }

  // Stripe temporary failures
  if (errorMessage.includes('temporary failure') ||
      errorMessage.includes('try again later')) {
    return true;
  }

  // Google Drive quota/rate limit errors
  if (errorMessage.includes('quota') ||
      errorMessage.includes('userratelimitexceeded') ||
      errorMessage.includes('ratelimitexceeded')) {
    return true;
  }

  // Generic transient errors
  const transientPatterns = [
    'timeout',
    'temporary',
    'unavailable',
    'connection',
    'network',
    'socket hang up'
  ];

  return transientPatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Calculate exponential backoff delay with jitter
 * @param {number} retryCount - Current retry attempt (0-based)
 * @param {number} initialDelay - Initial delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @param {number} factor - Exponential backoff factor
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(retryCount, initialDelay, maxDelay, factor) {
  // Calculate exponential delay: initialDelay * (factor ^ retryCount)
  const exponentialDelay = initialDelay * Math.pow(factor, retryCount);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (±10%) to prevent thundering herd
  const jitterRange = cappedDelay * 0.1;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // Random value between -10% and +10%

  return Math.floor(cappedDelay + jitter);
}

/**
 * Execute function with timeout
 * @param {Function} fn - Async function to execute
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise} Result of function execution
 */
async function executeWithTimeout(fn, timeout) {
  if (!timeout || timeout <= 0) {
    return fn();
  }

  return Promise.race([
    fn(),
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Operation timed out after ${timeout}ms`);
        error.code = 'TIMEOUT';
        reject(error);
      }, timeout);
    })
  ]);
}

/**
 * Execute a function with exponential backoff retry logic
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Configuration options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.initialDelay=1000] - Initial delay in ms
 * @param {number} [options.maxDelay=30000] - Maximum delay in ms
 * @param {number} [options.factor=2] - Exponential backoff factor
 * @param {Function} [options.shouldRetry] - Custom retry predicate
 * @param {number} [options.timeout] - Timeout for each attempt in ms (optional)
 * @param {string} [options.operationName] - Name for logging purposes
 * @returns {Promise} Result of function execution
 * @throws {Error} Last error if all retries exhausted
 *
 * @example
 * // Basic usage
 * const result = await withExponentialBackoff(
 *   () => fetchFromAPI(),
 *   { maxRetries: 3 }
 * );
 *
 * @example
 * // With custom retry predicate
 * const result = await withExponentialBackoff(
 *   () => updateDatabase(),
 *   {
 *     maxRetries: 5,
 *     initialDelay: 500,
 *     shouldRetry: (error) => error.code === 'SQLITE_BUSY'
 *   }
 * );
 */
export async function withExponentialBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    shouldRetry = isRetryableError,
    timeout = null,
    operationName = 'operation'
  } = options;

  // Validate options
  if (typeof fn !== 'function') {
    throw new Error('First argument must be a function');
  }

  if (maxRetries < 0) {
    throw new Error('maxRetries must be non-negative');
  }

  if (initialDelay <= 0 || maxDelay <= 0) {
    throw new Error('Delays must be positive');
  }

  if (factor <= 1) {
    throw new Error('Backoff factor must be greater than 1');
  }

  const errors = [];
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`[Backoff] ${operationName}: Attempt ${attempt + 1}/${maxRetries + 1}`);

      // Execute with timeout if specified
      const result = timeout
        ? await executeWithTimeout(fn, timeout)
        : await fn();

      // Success - log if retries were needed
      if (attempt > 0) {
        const totalTime = Date.now() - startTime;
        logger.log(`[Backoff] ${operationName}: Succeeded after ${attempt + 1} attempts (${totalTime}ms total)`);
      }

      return result;

    } catch (error) {
      errors.push({
        attempt: attempt + 1,
        timestamp: new Date().toISOString(),
        error: error.message,
        code: error.code,
        statusCode: error.statusCode || error.status
      });

      // Check if we should retry
      const isLastAttempt = attempt === maxRetries;
      const canRetry = !isLastAttempt && shouldRetry(error);

      if (!canRetry) {
        // Log aggregated errors
        const totalTime = Date.now() - startTime;
        logger.error(`[Backoff] ${operationName}: Failed after ${attempt + 1} attempts (${totalTime}ms)`, {
          errors,
          lastError: error.message
        });

        // Enhance error with retry context
        const enhancedError = new Error(
          `${operationName} failed after ${attempt + 1} attempts: ${error.message}`
        );
        enhancedError.originalError = error;
        enhancedError.attempts = attempt + 1;
        enhancedError.retryHistory = errors;
        enhancedError.totalTime = totalTime;

        throw enhancedError;
      }

      // Calculate delay for next retry
      const delay = calculateBackoffDelay(attempt, initialDelay, maxDelay, factor);

      logger.warn(`[Backoff] ${operationName}: Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
        error: error.message,
        code: error.code,
        nextAttempt: attempt + 2,
        maxAttempts: maxRetries + 1
      });

      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but just in case
  throw new Error(`${operationName}: Unexpected error - exhausted all retries`);
}

/**
 * Create a wrapped function with exponential backoff
 * Useful for wrapping service methods
 *
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Backoff options (same as withExponentialBackoff)
 * @returns {Function} Wrapped function with retry logic
 *
 * @example
 * const resilientFetch = withBackoff(
 *   (url) => fetch(url).then(r => r.json()),
 *   { maxRetries: 3, operationName: 'API fetch' }
 * );
 *
 * const data = await resilientFetch('https://api.example.com/data');
 */
export function withBackoff(fn, options = {}) {
  return async (...args) => {
    return withExponentialBackoff(
      () => fn(...args),
      options
    );
  };
}

/**
 * Batch retry - execute multiple operations with exponential backoff
 * Continues with remaining operations even if some fail
 *
 * @param {Array<Function>} operations - Array of async functions to execute
 * @param {Object} options - Backoff options
 * @returns {Promise<Object>} Object with successful and failed operations
 *
 * @example
 * const results = await batchRetry([
 *   () => sendEmail1(),
 *   () => sendEmail2(),
 *   () => sendEmail3()
 * ], { maxRetries: 2 });
 *
 * console.log(results.successful); // Array of successful results
 * console.log(results.failed); // Array of { operation, error }
 */
export async function batchRetry(operations, options = {}) {
  const results = await Promise.allSettled(
    operations.map((op, index) =>
      withExponentialBackoff(op, {
        ...options,
        operationName: options.operationName
          ? `${options.operationName}[${index}]`
          : `operation[${index}]`
      })
    )
  );

  return {
    successful: results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value),
    failed: results
      .filter(r => r.status === 'rejected')
      .map((r, index) => ({
        operationIndex: index,
        error: r.reason
      }))
  };
}

/**
 * Export default retry predicate for reuse
 */
export { isRetryableError };
