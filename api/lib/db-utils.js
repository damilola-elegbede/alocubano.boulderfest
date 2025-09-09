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