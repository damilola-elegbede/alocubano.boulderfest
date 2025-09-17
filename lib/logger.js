/**
 * Logger Utility
 * Provides conditional logging based on environment variables
 * 
 * Production logs only errors, development logs everything
 */

const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Log general information (only in debug mode)
   * @param {...any} args - Arguments to log
   */
  log: (...args) => DEBUG && console.log(...args),

  /**
   * Log errors (always logged regardless of environment)
   * @param {...any} args - Arguments to log
   */
  error: (...args) => console.error(...args),

  /**
   * Log debug information with [DEBUG] prefix
   * @param {...any} args - Arguments to log
   */
  debug: (...args) => DEBUG && console.log('[DEBUG]', ...args),

  /**
   * Log warnings (always logged regardless of environment)
   * @param {...any} args - Arguments to log
   */
  warn: (...args) => console.warn(...args),

  /**
   * Log informational messages
   * @param {...any} args - Arguments to log
   */
  info: (...args) => DEBUG && console.info(...args),

  /**
   * Generic level-based logging (for dynamic log levels)
   * @param {string} level - Log level
   * @param {...any} args - Arguments to log
   */
  logWithLevel: (level, ...args) => {
    const levels = {
      debug: logger.debug,
      info: logger.info,
      log: logger.log,
      warn: logger.warn,
      error: logger.error
    };

    const logFn = levels[level] || logger.log;
    logFn(...args);
  }
};

// Support array indexing for dynamic log levels (e.g., logger[level](...args))
Object.defineProperty(logger, 'length', { value: 0, writable: false });
const logProxy = new Proxy(logger, {
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }

    // Handle dynamic log levels
    if (typeof prop === 'string' && ['debug', 'info', 'log', 'warn', 'error'].includes(prop)) {
      return target[prop] || target.log;
    }

    // Fallback to log method for unknown levels
    return target.log;
  }
});

export { logProxy as logger };