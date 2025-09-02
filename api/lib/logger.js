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
  warn: (...args) => console.warn(...args)
};