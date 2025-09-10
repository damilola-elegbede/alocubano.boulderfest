/**
 * Database utility functions for shared operations
 */

/**
 * Check if a column exists in a table
 * @param {Object} db - Database client
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column
 * @returns {Promise<boolean>} - True if column exists, false otherwise
 */
export async function columnExists(db, tableName, columnName) {
  try {
    const result = await db.execute(`PRAGMA table_info(${tableName})`);
    return result.rows.some(row => row[1] === columnName); // column name is second field
  } catch (error) {
    console.warn(`Could not check column existence for ${tableName}.${columnName}:`, error);
    return false;
  }
}

/**
 * Safely parse an integer with proper NaN handling
 * @param {string|number} value - Value to parse
 * @param {number} radix - Radix for parseInt (default 10)
 * @returns {number|null} - Parsed integer or null if invalid
 */
export function safeParseInt(value, radix = 10) {
  if (value === null || value === undefined) return null;
  const parsedValue = parseInt(value, radix);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

/**
 * Parse and validate query parameters with bounds checking
 * @param {string} value - Parameter value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @param {Object} options - Validation options with min/max
 * @returns {number|null} Parsed value or null if invalid
 */
export function parseQueryParam(value, defaultValue, options = {}) {
  if (!value) return defaultValue;
  
  const parsed = safeParseInt(value);
  if (parsed === null) return null;
  
  if (options.min !== undefined && parsed < options.min) return null;
  if (options.max !== undefined && parsed > options.max) return null;
  
  return parsed;
}

/**
 * Safely get environment variable as integer
 * @param {string} envVar - Environment variable name
 * @param {number} defaultValue - Default value if not set or invalid
 * @returns {number} - Parsed integer or default value
 */
export function getEnvInt(envVar, defaultValue) {
  const value = process.env[envVar];
  const parsed = safeParseInt(value);
  return parsed !== null ? parsed : defaultValue;
}

/**
 * Build dynamic WHERE clause with parameters
 * @param {Object} filters - Object containing filter conditions
 * @param {Array} params - Array to collect parameters
 * @returns {string} - WHERE clause string
 */
export function buildWhereClause(filters, params) {
  const conditions = [];
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      if (key.endsWith('_search')) {
        // Handle search terms with LIKE
        const field = key.replace('_search', '');
        conditions.push(`${field} LIKE ? ESCAPE '\\'`);
        params.push(`%${value}%`);
      } else if (key.endsWith('_in')) {
        // Handle IN clauses
        const field = key.replace('_in', '');
        const placeholders = Array(value.length).fill('?').join(',');
        conditions.push(`${field} IN (${placeholders})`);
        params.push(...value);
      } else {
        // Handle exact matches
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }
  });
  
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}
