/**
 * BigInt Serializer Utility
 *
 * Handles the conversion of BigInt values to JSON-serializable formats for database responses.
 *
 * Problem:
 * - JavaScript's BigInt type cannot be directly serialized to JSON
 * - Database engines (SQLite, Turso) may return BigInt values for large integers
 * - JSON.stringify() throws "TypeError: Do not know how to serialize a BigInt"
 * - This commonly occurs with auto-incrementing IDs, timestamps, and large numeric fields
 *
 * Solution:
 * - Convert BigInt to Number if within safe integer range (< Number.MAX_SAFE_INTEGER)
 * - Convert to string for values that exceed safe integer limits
 * - Recursively process nested objects and arrays
 * - Provide both direct processing and JSON.stringify replacer functions
 *
 * Usage:
 * ```javascript
 * import { processDatabaseResult, bigIntReplacer, sanitizeBigInt } from './bigint-serializer.js';
 *
 * // Process database results
 * const safeResult = processDatabaseResult(databaseResult);
 *
 * // Use with JSON.stringify
 * const jsonString = JSON.stringify(data, bigIntReplacer);
 *
 * // Process single BigInt value
 * const safeValue = sanitizeBigInt(someBigIntValue);
 * ```
 */

/**
 * Maximum safe integer for JavaScript Number type
 * Values larger than this will be converted to strings to preserve precision
 */
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER; // 9007199254740991

/**
 * Sanitizes a single BigInt value to a JSON-serializable format
 *
 * @param {*} value - The value to sanitize (may or may not be BigInt)
 * @returns {number|string|*} - Converted value or original if not BigInt
 */
export function sanitizeBigInt(value) {
  if (typeof value === 'bigint') {
    // Convert to Number if within safe range, otherwise to string
    if (value <= MAX_SAFE_INTEGER && value >= -MAX_SAFE_INTEGER) {
      return Number(value);
    } else {
      return value.toString();
    }
  }
  return value;
}

/**
 * Recursively processes objects and arrays to convert BigInt values
 *
 * @param {*} data - The data to process (object, array, or primitive)
 * @returns {*} - Processed data with BigInt values converted
 */
export function processDatabaseResult(data) {
  // Handle null and undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle BigInt values
  if (typeof data === 'bigint') {
    return sanitizeBigInt(data);
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => processDatabaseResult(item));
  }

  // Handle objects (including Date, RegExp, etc.)
  if (typeof data === 'object') {
    // Handle special object types that shouldn't be processed
    if (data instanceof Date || data instanceof RegExp || data instanceof Error) {
      return data;
    }

    // Handle plain objects
    const processed = {};
    for (const [key, value] of Object.entries(data)) {
      processed[key] = processDatabaseResult(value);
    }
    return processed;
  }

  // Return primitives as-is (string, number, boolean, symbol, function)
  return data;
}

/**
 * JSON.stringify replacer function for handling BigInt values
 *
 * Use this as the second parameter to JSON.stringify() to automatically
 * handle BigInt conversion during serialization.
 *
 * @param {string} key - The object key being processed
 * @param {*} value - The value being processed
 * @returns {*} - Converted value or original if not BigInt
 */
export function bigIntReplacer(key, value) {
  return sanitizeBigInt(value);
}

/**
 * Safely stringifies data that may contain BigInt values
 *
 * @param {*} data - The data to stringify
 * @param {number} [space] - Optional spacing for pretty printing
 * @returns {string} - JSON string with BigInt values properly converted
 */
export function safeStringify(data, space) {
  return JSON.stringify(data, bigIntReplacer, space);
}

/**
 * Processes database query results commonly returned by SQLite/Turso
 *
 * Handles the standard database result format:
 * {
 *   rows: [...],
 *   columns: [...],
 *   meta: {...},
 *   rowsAffected: BigInt,
 *   lastInsertRowid: BigInt
 * }
 *
 * @param {Object} result - Database query result object
 * @returns {Object} - Processed result with BigInt values converted
 */
export function processDatabaseQueryResult(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const processed = {};

  // Process each property of the result
  for (const [key, value] of Object.entries(result)) {
    processed[key] = processDatabaseResult(value);
  }

  return processed;
}

/**
 * Batch processes multiple database results
 *
 * @param {Array} results - Array of database results to process
 * @returns {Array} - Array of processed results
 */
export function processBatchDatabaseResults(results) {
  if (!Array.isArray(results)) {
    return processDatabaseResult(results);
  }

  return results.map(result => processDatabaseQueryResult(result));
}

/**
 * Validates that a value is safe for JSON serialization
 *
 * @param {*} value - Value to validate
 * @returns {boolean} - True if safe for JSON serialization
 */
export function isJsonSafe(value) {
  try {
    JSON.stringify(value);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Creates a middleware function for API handlers to automatically process BigInt values
 *
 * @param {Function} handler - The original API handler function
 * @returns {Function} - Wrapped handler that processes BigInt values in responses
 */
export function createBigIntSafeHandler(handler) {
  return async (req, res) => {
    // Store original json method
    const originalJson = res.json;

    // Override res.json to process BigInt values
    res.json = function(data) {
      const processedData = processDatabaseResult(data);
      return originalJson.call(this, processedData);
    };

    // Call original handler
    return await handler(req, res);
  };
}

/**
 * Development helper to detect BigInt values in data structures
 *
 * @param {*} data - Data to inspect
 * @param {string} [path=''] - Current path in the data structure
 * @returns {Array} - Array of paths where BigInt values were found
 */
export function detectBigIntValues(data, path = '') {
  const bigIntPaths = [];

  if (typeof data === 'bigint') {
    bigIntPaths.push(path || 'root');
    return bigIntPaths;
  }

  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      const itemPath = path ? `${path}[${index}]` : `[${index}]`;
      bigIntPaths.push(...detectBigIntValues(item, itemPath));
    });
  } else if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      const keyPath = path ? `${path}.${key}` : key;
      bigIntPaths.push(...detectBigIntValues(value, keyPath));
    }
  }

  return bigIntPaths;
}

/**
 * Configuration object for BigInt handling behavior
 */
export const BigIntConfig = {
  // Whether to log BigInt conversions (useful for debugging)
  logConversions: process.env.NODE_ENV === 'development',

  // Maximum safe integer threshold (can be customized if needed)
  maxSafeInteger: MAX_SAFE_INTEGER,

  // Whether to throw errors on BigInt values that exceed safe range
  throwOnUnsafeConversion: false
};

/**
 * Updates the BigInt handling configuration
 *
 * @param {Object} newConfig - New configuration options
 */
export function configureBigIntHandling(newConfig) {
  Object.assign(BigIntConfig, newConfig);
}

// Export default object with all functions for convenient importing
export default {
  sanitizeBigInt,
  processDatabaseResult,
  processDatabaseQueryResult,
  processBatchDatabaseResults,
  bigIntReplacer,
  safeStringify,
  isJsonSafe,
  createBigIntSafeHandler,
  detectBigIntValues,
  BigIntConfig,
  configureBigIntHandling
};