/**
 * SQL Compatibility Layer
 * Provides database-agnostic SQL functions that work across SQLite, PostgreSQL, and MySQL
 *
 * Primary focus: SQLite compatibility for testing while maintaining production compatibility
 * All functions return SQLite-compatible SQL strings that also work with Turso
 */

import { logger } from './logger.js';

export class SQLCompatibility {
  /**
   * Get current timestamp in database-compatible format
   * @returns {string} SQL expression for current timestamp
   */
  static getCurrentTimestamp() {
    // SQLite and Turso compatible
    // In DEFAULT clauses, use CURRENT_TIMESTAMP
    // In queries, use datetime('now')
    return "datetime('now')";
  }

  /**
   * Get current timestamp for DEFAULT clauses
   * @returns {string} SQL expression for DEFAULT timestamp
   */
  static getDefaultTimestamp() {
    // Works in all databases for DEFAULT clauses
    return 'CURRENT_TIMESTAMP';
  }

  /**
   * Get date with offset (e.g., 1 day ago, 7 days from now)
   * @param {number} interval - Number of units
   * @param {string} unit - Time unit (day, days, hour, hours, month, months, year, years)
   * @param {string} direction - 'ago' for past, 'from_now' for future
   * @returns {string} SQL expression for date with offset
   */
  static getDateOffset(interval, unit, direction = 'ago') {
    // Normalize unit to SQLite format (always plural)
    const normalizedUnit = unit.endsWith('s') ? unit : unit + 's';
    const operator = direction === 'ago' ? '-' : '+';

    return `datetime('now', '${operator}${interval} ${normalizedUnit}')`;
  }

  /**
   * Get date with specific offset for WHERE clauses
   * @param {string} field - Database field name
   * @param {string} operator - Comparison operator (>=, <=, >, <, =)
   * @param {number} interval - Number of units
   * @param {string} unit - Time unit
   * @returns {string} SQL WHERE clause fragment
   */
  static getDateComparison(field, operator, interval, unit) {
    const dateExpr = this.getDateOffset(interval, unit, 'ago');
    return `${field} ${operator} ${dateExpr}`;
  }

  /**
   * Extract date part from timestamp
   * @param {string} field - Database field name or 'now' for current time
   * @returns {string} SQL expression for date extraction
   */
  static getDateOnly(field = null) {
    if (!field || field === 'now') {
      return "DATE('now')";
    }
    return `DATE(${field})`;
  }

  /**
   * Format date using strftime (SQLite compatible)
   * @param {string} format - strftime format string
   * @param {string} field - Database field name or null for current time
   * @returns {string} SQL expression for date formatting
   */
  static formatDate(format, field = null) {
    const dateExpr = field || "'now'";
    return `strftime('${format}', ${dateExpr})`;
  }

  /**
   * Get year from date
   * @param {string} field - Database field name
   * @returns {string} SQL expression for year extraction
   */
  static getYear(field) {
    return `strftime('%Y', ${field})`;
  }

  /**
   * Get month from date
   * @param {string} field - Database field name
   * @returns {string} SQL expression for month extraction
   */
  static getMonth(field) {
    return `strftime('%m', ${field})`;
  }

  /**
   * Get day from date
   * @param {string} field - Database field name
   * @returns {string} SQL expression for day extraction
   */
  static getDay(field) {
    return `strftime('%d', ${field})`;
  }

  /**
   * Get week of year from date
   * @param {string} field - Database field name
   * @returns {string} SQL expression for week extraction
   */
  static getWeek(field) {
    return `strftime('%W', ${field})`;
  }

  /**
   * Calculate difference between two dates in days
   * @param {string} date1 - First date field or expression
   * @param {string} date2 - Second date field or expression
   * @returns {string} SQL expression for date difference in days
   */
  static getDateDifference(date1, date2) {
    return `CAST(julianday(${date1}) - julianday(${date2}) AS INTEGER)`;
  }

  /**
   * Get age of a record in days from now
   * @param {string} field - Database field name
   * @returns {string} SQL expression for age in days
   */
  static getAgeInDays(field) {
    return `CAST(julianday('now') - julianday(${field}) AS INTEGER)`;
  }

  /**
   * Build timeframe filter for queries
   * @param {string} field - Database field to filter
   * @param {string} timeframe - Timeframe string (1h, 24h, 7d, 30d, etc.)
   * @returns {string} SQL WHERE clause fragment
   */
  static getTimeframeFilter(field, timeframe) {
    let interval, unit;

    switch (timeframe) {
      case '1h':
        interval = 1;
        unit = 'hours';
        break;
      case '24h':
      case '1d':
        interval = 1;
        unit = 'days';
        break;
      case '7d':
        interval = 7;
        unit = 'days';
        break;
      case '30d':
        interval = 30;
        unit = 'days';
        break;
      case '90d':
        interval = 90;
        unit = 'days';
        break;
      case '1y':
        interval = 1;
        unit = 'years';
        break;
      default:
        // Default to 24 hours
        interval = 1;
        unit = 'days';
    }

    const dateExpr = this.getDateOffset(interval, unit, 'ago');
    return `${field} >= ${dateExpr}`;
  }

  /**
   * Create BETWEEN clause for date range
   * @param {string} field - Database field name
   * @param {string} startDate - Start date (ISO format or SQL expression)
   * @param {string} endDate - End date (ISO format or SQL expression)
   * @returns {string} SQL BETWEEN clause
   */
  static getDateRangeBetween(field, startDate, endDate) {
    return `${field} BETWEEN '${startDate}' AND '${endDate}'`;
  }

  /**
   * JSON extraction (SQLite compatible)
   * @param {string} field - JSON field name
   * @param {string} path - JSON path (e.g., '$.key' or '$.nested.key')
   * @returns {string} SQL expression for JSON extraction
   */
  static extractJSON(field, path) {
    // Ensure path starts with $
    const jsonPath = path.startsWith('$') ? path : `$.${path}`;
    return `JSON_EXTRACT(${field}, '${jsonPath}')`;
  }

  /**
   * String concatenation (SQLite compatible)
   * @param {...string} parts - String parts to concatenate
   * @returns {string} SQL expression for string concatenation
   */
  static concat(...parts) {
    return parts.join(' || ');
  }

  /**
   * COALESCE with proper NULL handling
   * @param {string} field - Field to check
   * @param {*} defaultValue - Default value if NULL
   * @returns {string} SQL COALESCE expression
   */
  static coalesce(field, defaultValue) {
    const quotedDefault = typeof defaultValue === 'string' ? `'${defaultValue}'` : defaultValue;
    return `COALESCE(${field}, ${quotedDefault})`;
  }

  /**
   * CASE statement builder for complex conditionals
   * @param {Array} conditions - Array of {when, then} objects
   * @param {*} elseValue - ELSE value
   * @returns {string} SQL CASE statement
   */
  static caseWhen(conditions, elseValue = null) {
    let sql = 'CASE';

    for (const condition of conditions) {
      sql += ` WHEN ${condition.when} THEN ${condition.then}`;
    }

    if (elseValue !== null) {
      const quotedElse = typeof elseValue === 'string' ? `'${elseValue}'` : elseValue;
      sql += ` ELSE ${quotedElse}`;
    }

    sql += ' END';
    return sql;
  }

  /**
   * Generate GROUP BY period expression for time-based aggregations
   * @param {string} field - Date field to group by
   * @param {string} period - Period type (day, week, month, year)
   * @returns {string} SQL expression for GROUP BY
   */
  static getGroupByPeriod(field, period) {
    switch (period) {
      case 'day':
        return `DATE(${field})`;
      case 'week':
        return `strftime('%Y-W%W', ${field})`;
      case 'month':
        return `strftime('%Y-%m', ${field})`;
      case 'year':
        return `strftime('%Y', ${field})`;
      case 'hour':
        return `strftime('%Y-%m-%d %H:00', ${field})`;
      default:
        return `DATE(${field})`;
    }
  }

  /**
   * Check if running in SQLite mode (for conditional SQL generation)
   * @returns {boolean} True if using SQLite
   */
  static isSQLite() {
    const dbUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || '';
    return dbUrl.includes('.db') ||
           dbUrl.includes('.sqlite') ||
           dbUrl === ':memory:' ||
           dbUrl.startsWith('libsql://');
  }

  /**
   * Log SQL compatibility warning for debugging
   * @param {string} context - Context where SQL is being used
   * @param {string} sql - SQL string being generated
   */
  static logSQL(context, sql) {
    if (process.env.DEBUG === 'true' || process.env.SQL_DEBUG === 'true') {
      logger.debug(`[SQL Compatibility] ${context}:`, sql);
    }
  }
}

// Export as default for convenience
export default SQLCompatibility;