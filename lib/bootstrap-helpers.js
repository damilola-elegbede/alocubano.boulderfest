/**
 * Bootstrap Helper Utilities
 *
 * Shared utilities for the bootstrap system including:
 * - Environment detection
 * - Configuration loading
 * - Settings flattening
 * - Logging utilities
 * - Validation functions
 */

import fs from 'fs';
import path from 'path';

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

/**
 * Create a colored logger instance
 * @param {string} prefix - Prefix for log messages
 * @returns {Object} Logger instance with colored methods
 */
export function createLogger(prefix = '') {
  const logPrefix = prefix ? `[${prefix}] ` : '';

  return {
    info: (message) => console.log(`${colors.cyan}${logPrefix}${message}${colors.reset}`),
    success: (message) => console.log(`${colors.green}${logPrefix}${message}${colors.reset}`),
    warn: (message) => console.log(`${colors.yellow}${logPrefix}${message}${colors.reset}`),
    error: (message) => console.log(`${colors.red}${logPrefix}${message}${colors.reset}`),
    debug: (message) => console.log(`${colors.blue}${logPrefix}${message}${colors.reset}`),
    log: (message) => console.log(`${logPrefix}${message}`),
  };
}

/**
 * Detect the current environment
 * @returns {string} Environment name (production, preview, development)
 */
export function detectEnvironment() {
  // Priority order:
  // 1. VERCEL_ENV (most reliable in Vercel)
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) {
    return vercelEnv; // 'production' | 'preview' | 'development'
  }

  // 2. NODE_ENV (fallback)
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }

  // 3. Default to development
  return 'development';
}

/**
 * Load configuration file for the specified environment
 * @param {string} environment - Environment name
 * @param {string} baseDir - Base directory (usually __dirname from calling script)
 * @returns {Object} Parsed configuration object
 */
export async function loadConfig(environment, baseDir) {
  const configFile = path.join(baseDir, `../bootstrap/${environment}.json`);

  if (!fs.existsSync(configFile)) {
    throw new Error(`Configuration file not found: ${configFile}`);
  }

  try {
    const configContent = fs.readFileSync(configFile, 'utf8');
    const config = JSON.parse(configContent);

    // Validate basic config structure
    if (!config.version) {
      throw new Error('Configuration missing version field');
    }

    if (!config.environment) {
      throw new Error('Configuration missing environment field');
    }

    if (config.environment !== environment) {
      throw new Error(`Configuration environment mismatch: expected ${environment}, got ${config.environment}`);
    }

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Flatten nested settings object to dot-notation keys
 * @param {Object} obj - Nested object to flatten
 * @param {string} prefix - Current prefix for keys
 * @returns {Object} Flattened key-value pairs
 */
export function flattenSettings(obj, prefix = '') {
  const flattened = {};

  for (const [key, value] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(flattened, flattenSettings(value, fullKey));
    } else {
      // Convert value to string
      flattened[fullKey] = Array.isArray(value) ?
        JSON.stringify(value) :
        String(value);
    }
  }

  return flattened;
}

/**
 * Validate required environment variables based on environment
 * @param {string} environment - Current environment
 * @throws {Error} If required environment variables are missing
 */
export function validateRequiredEnvVars(environment) {
  const logger = createLogger('EnvValidation');

  logger.info('🔍 Validating environment variables...');

  const requiredForProduction = [
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN'
  ];

  const requiredForPreview = [
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN'
  ];

  const optionalVars = [
    'ADMIN_EMAIL'
  ];

  let requiredVars = [];

  switch (environment) {
    case 'production':
      requiredVars = requiredForProduction;
      break;
    case 'preview':
      requiredVars = requiredForPreview;
      break;
    case 'development':
      // Development may use either Turso or local SQLite
      // We'll let the database service handle validation
      requiredVars = [];
      break;
    default:
      logger.warn(`Unknown environment: ${environment}, skipping validation`);
      return;
  }

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for ${environment}: ${missing.join(', ')}`);
  }

  // Check optional variables and warn if missing
  const missingOptional = optionalVars.filter(varName => !process.env[varName]);
  if (missingOptional.length > 0) {
    logger.warn(`Missing optional environment variables: ${missingOptional.join(', ')}`);
    logger.warn('Some bootstrap features may be skipped');
  }

  logger.success('✅ Environment variables validated');
}

/**
 * Create database connection using existing database service patterns
 * This is a helper that wraps the database service for bootstrap use
 * @returns {Promise<Object>} Database client instance
 */
export async function createDatabaseConnection() {
  try {
    // Use the existing database service from the project
    const { getDatabaseClient } = await import('./database.js');
    return await getDatabaseClient();
  } catch (error) {
    throw new Error(`Failed to create database connection: ${error.message}`);
  }
}

/**
 * Validate that a database client is properly configured
 * @param {Object} client - Database client instance
 * @returns {Promise<boolean>} True if client is valid
 */
export async function validateDatabaseClient(client) {
  if (!client) {
    return false;
  }

  if (typeof client.execute !== 'function') {
    return false;
  }

  try {
    const result = await client.execute('SELECT 1 as test');
    return result && result.rows && Array.isArray(result.rows);
  } catch (error) {
    return false;
  }
}

/**
 * Safe JSON parse with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed object or default value
 */
export function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
export function deepMerge(target, source) {
  const merged = JSON.parse(JSON.stringify(target)); // Deep clone

  function merge(dest, src) {
    for (const key in src) {
      if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
        dest[key] = dest[key] || {};
        merge(dest[key], src[key]);
      } else {
        dest[key] = src[key];
      }
    }
  }

  merge(merged, source);
  return merged;
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Validate event data structure
 * @param {Object} eventData - Event data to validate
 * @returns {Array} Array of validation errors (empty if valid)
 */
export function validateEventData(eventData) {
  const errors = [];

  // Required fields
  const requiredFields = ['slug', 'name', 'type', 'status'];
  for (const field of requiredFields) {
    if (!eventData[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate type
  const validTypes = ['festival', 'weekender', 'workshop', 'special'];
  if (eventData.type && !validTypes.includes(eventData.type)) {
    errors.push(`Invalid event type: ${eventData.type}. Must be one of: ${validTypes.join(', ')}`);
  }

  // Validate status
  const validStatuses = ['draft', 'upcoming', 'active', 'completed', 'cancelled'];
  if (eventData.status && !validStatuses.includes(eventData.status)) {
    errors.push(`Invalid event status: ${eventData.status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Validate dates if provided
  if (eventData.dates) {
    if (eventData.dates.start && !isValidDate(eventData.dates.start)) {
      errors.push(`Invalid start date: ${eventData.dates.start}`);
    }
    if (eventData.dates.end && !isValidDate(eventData.dates.end)) {
      errors.push(`Invalid end date: ${eventData.dates.end}`);
    }

    // Check date order
    if (eventData.dates.start && eventData.dates.end) {
      const startDate = new Date(eventData.dates.start);
      const endDate = new Date(eventData.dates.end);
      if (startDate >= endDate) {
        errors.push('Start date must be before end date');
      }
    }
  }

  return errors;
}

/**
 * Check if a string is a valid date
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid date
 */
function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<*>} Result of the function
 */
export async function retry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Create a timeout promise
 * @param {number} ms - Timeout in milliseconds
 * @param {string} message - Error message
 * @returns {Promise} Promise that rejects after timeout
 */
export function createTimeout(ms, message = 'Operation timed out') {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Run a function with timeout
 * @param {Function} fn - Function to run
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} timeoutMessage - Timeout error message
 * @returns {Promise<*>} Result of the function or timeout error
 */
export async function withTimeout(fn, timeoutMs, timeoutMessage) {
  return Promise.race([
    fn(),
    createTimeout(timeoutMs, timeoutMessage)
  ]);
}

// Export colors for direct use if needed
export { colors };