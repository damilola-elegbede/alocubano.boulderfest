/**
 * Database Migration Runner
 * Handles applying migrations to database instances
 */

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import crypto from 'crypto';

export class MigrationRunner {
  constructor(migrationDir = null) {
    this.migrationDir = migrationDir || path.join(process.cwd(), 'migrations');
  }

  /**
   * Run all pending migrations
   * @param {Object} client - Database client
   * @returns {Promise<Array>} Applied migrations
   */
  async runMigrations(client) {
    try {
      // Ensure migrations table exists
      await this._ensureMigrationsTable(client);

      // Get all migration files
      const migrationFiles = await this._getMigrationFiles();

      // Get applied migrations
      const appliedMigrations = await this._getAppliedMigrations(client);
      const appliedSet = new Set(appliedMigrations.map(m => m.filename));

      // Filter to pending migrations
      const pendingMigrations = migrationFiles.filter(file => !appliedSet.has(file));

      if (pendingMigrations.length === 0) {
        logger.log('✅ All migrations already applied');
        return [];
      }

      logger.log(`📋 Running ${pendingMigrations.length} pending migrations`);

      const appliedResults = [];

      // Apply each pending migration
      for (const filename of pendingMigrations) {
        try {
          const result = await this._applyMigration(client, filename);
          appliedResults.push(result);
          logger.log(`✅ Applied migration: ${filename}`);
        } catch (error) {
          logger.error(`❌ Failed to apply migration ${filename}:`, error.message);
          throw error;
        }
      }

      logger.log(`✅ Successfully applied ${appliedResults.length} migrations`);
      return appliedResults;

    } catch (error) {
      logger.error('❌ Migration runner failed:', error.message);
      throw error;
    }
  }

  /**
   * Get list of migration files sorted by filename
   * @private
   */
  async _getMigrationFiles() {
    try {
      const files = await readdir(this.migrationDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort(); // Lexicographic sort ensures proper order
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Migration directory not found: ${this.migrationDir}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Get applied migrations from database
   * @private
   */
  async _getAppliedMigrations(client) {
    try {
      const result = await client.execute('SELECT filename, checksum, applied_at FROM migrations ORDER BY applied_at');
      return result.rows || [];
    } catch (error) {
      logger.error('Failed to get applied migrations:', error.message);
      return [];
    }
  }

  /**
   * Apply a single migration
   * @private
   */
  async _applyMigration(client, filename) {
    const migrationPath = path.join(this.migrationDir, filename);

    try {
      // Read migration file
      const content = await readFile(migrationPath, 'utf8');

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      // Split content into statements
      const statements = this._parseMigrationContent(content);
      logger.log(`Parsed ${statements.length} statements from ${filename}`);

      // Execute all statements in a transaction-like manner
      for (const statement of statements) {
        const trimmedStatement = statement.trim();
        if (trimmedStatement && trimmedStatement !== ';') {
          try {
            await client.execute(trimmedStatement);
          } catch (statementError) {
            logger.error(`Failed to execute statement: ${trimmedStatement.substring(0, 100)}...`);
            logger.error(`Error: ${statementError.message}`);
            throw statementError;
          }
        }
      }

      // Record migration as applied
      await client.execute(
        'INSERT INTO migrations (filename, checksum) VALUES (?, ?)',
        [filename, checksum]
      );

      return {
        filename,
        checksum,
        statementsExecuted: statements.length,
        appliedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Failed to apply migration ${filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Parse migration content into individual statements
   * @private
   */
  _parseMigrationContent(content) {
    // Remove SQL comments (-- style and /* */ style)
    let cleanContent = content
      .replace(/--.*$/gm, '') // Remove -- comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Split by semicolon at the end of statements
    // This is a simple approach that works for most SQL
    const statements = cleanContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0)
      .map(stmt => stmt + ';'); // Add semicolon back

    // Remove trailing semicolon from last statement if empty
    if (statements.length > 0 && statements[statements.length - 1] === ';') {
      statements.pop();
    }

    return statements;
  }

  /**
   * Ensure migrations table exists
   * @private
   */
  async _ensureMigrationsTable(client) {
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT UNIQUE NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (error) {
      logger.error('Failed to create migrations table:', error.message);
      throw error;
    }
  }

  /**
   * Check if a specific migration has been applied
   * @param {Object} client - Database client
   * @param {string} filename - Migration filename
   * @returns {Promise<boolean>} True if migration is applied
   */
  async isMigrationApplied(client, filename) {
    try {
      const result = await client.execute(
        'SELECT COUNT(*) as count FROM migrations WHERE filename = ?',
        [filename]
      );
      return result.rows[0].count > 0;
    } catch (error) {
      logger.warn(`Failed to check migration status for ${filename}:`, error.message);
      return false;
    }
  }

  /**
   * Get migration status summary
   * @param {Object} client - Database client
   * @returns {Promise<Object>} Migration status
   */
  async getMigrationStatus(client) {
    try {
      const migrationFiles = await this._getMigrationFiles();
      const appliedMigrations = await this._getAppliedMigrations(client);
      const appliedSet = new Set(appliedMigrations.map(m => m.filename));

      const pending = migrationFiles.filter(file => !appliedSet.has(file));

      return {
        total: migrationFiles.length,
        applied: appliedMigrations.length,
        pending: pending.length,
        pendingFiles: pending,
        lastApplied: appliedMigrations[appliedMigrations.length - 1] || null
      };
    } catch (error) {
      logger.error('Failed to get migration status:', error.message);
      throw error;
    }
  }
}