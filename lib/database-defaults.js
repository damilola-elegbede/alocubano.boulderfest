/**
 * Database Defaults Utility
 * 
 * Centralizes database URL defaulting logic to prevent DRY violations.
 * Used by build scripts that need database access without explicit configuration.
 * 
 * @module lib/database-defaults
 */

import { logger } from './logger.js';

/**
 * Ensures a database URL is configured, defaulting to local.db if not set.
 * 
 * @param {boolean} shouldLog - Whether to log the default database message
 * @returns {string} The configured database URL
 * 
 * @example
 * import { ensureDatabaseUrl } from '../lib/database-defaults.js';
 * 
 * // Before database operations
 * ensureDatabaseUrl(); // Logs if default is used
 * 
 * // For silent initialization
 * ensureDatabaseUrl(false); // No logging
 */
export function ensureDatabaseUrl(shouldLog = true) {
  if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'file:local.db';
    if (shouldLog) {
      logger.log('📁 Using local database: local.db');
    }
  }
  return process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
}
