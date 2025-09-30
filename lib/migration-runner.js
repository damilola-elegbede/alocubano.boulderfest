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

      // Validate migration dependencies before applying any
      await this._validateMigrationDependencies(client, pendingMigrations, appliedSet);

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

  /**
   * Validate migration dependencies before applying
   * @param {Object} client - Database client
   * @param {Array} pendingMigrations - Array of pending migration filenames
   * @param {Set} appliedSet - Set of applied migration filenames
   * @private
   */
  async _validateMigrationDependencies(client, pendingMigrations, appliedSet) {
    logger.log('🔍 Validating migration dependencies...');

    for (const filename of pendingMigrations) {
      const migrationPath = path.join(this.migrationDir, filename);

      try {
        // Read migration content to parse dependencies
        const content = await readFile(migrationPath, 'utf8');
        const dependencies = this._parseMigrationDependencies(content);

        if (dependencies.length > 0) {
          logger.log(`📋 Checking ${dependencies.length} dependencies for ${filename}`);

          // Check each dependency
          for (const dep of dependencies) {
            await this._validateDependency(client, dep, appliedSet, filename);
          }
        }

        // Check for common patterns that indicate missing dependencies
        await this._validateCommonPatterns(client, content, filename);

      } catch (error) {
        logger.error(`❌ Dependency validation failed for ${filename}: ${error.message}`);
        throw new Error(`Migration dependency validation failed for ${filename}: ${error.message}`);
      }
    }

    logger.log('✅ All migration dependencies validated successfully');
  }

  /**
   * Parse migration dependencies from SQL comments
   * Looks for comments like: -- DEPENDS ON: 024_add_paypal_tables.sql
   * @param {string} content - Migration file content
   * @returns {Array} Array of dependency objects
   * @private
   */
  _parseMigrationDependencies(content) {
    const dependencies = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Look for dependency declarations in comments
      const dependsMatch = trimmed.match(/--\s*DEPENDS\s+ON:\s*(.+)/i);
      if (dependsMatch) {
        const depSpec = dependsMatch[1].trim();
        dependencies.push({
          type: 'migration',
          target: depSpec,
          line: line.trim()
        });
      }

      // Look for table requirements in comments
      const requiresTableMatch = trimmed.match(/--\s*REQUIRES\s+TABLE:\s*(.+)/i);
      if (requiresTableMatch) {
        const table = requiresTableMatch[1].trim();
        dependencies.push({
          type: 'table',
          target: table,
          line: line.trim()
        });
      }

      // Look for column requirements in comments
      const requiresColumnMatch = trimmed.match(/--\s*REQUIRES\s+COLUMN:\s*(.+)\.(.+)/i);
      if (requiresColumnMatch) {
        const table = requiresColumnMatch[1].trim();
        const column = requiresColumnMatch[2].trim();
        dependencies.push({
          type: 'column',
          target: { table, column },
          line: line.trim()
        });
      }
    }

    return dependencies;
  }

  /**
   * Validate a specific dependency
   * @param {Object} client - Database client
   * @param {Object} dependency - Dependency object
   * @param {Set} appliedSet - Set of applied migration filenames
   * @param {string} migrationFile - Current migration filename
   * @private
   */
  async _validateDependency(client, dependency, appliedSet, migrationFile) {
    switch (dependency.type) {
      case 'migration':
        if (!appliedSet.has(dependency.target)) {
          throw new Error(`Migration ${migrationFile} depends on ${dependency.target} which has not been applied`);
        }
        logger.log(`✅ Migration dependency satisfied: ${dependency.target}`);
        break;

      case 'table':
        const tableExists = await this._checkTableExists(client, dependency.target);
        if (!tableExists) {
          throw new Error(`Migration ${migrationFile} requires table '${dependency.target}' which does not exist`);
        }
        logger.log(`✅ Table dependency satisfied: ${dependency.target}`);
        break;

      case 'column':
        const columnExists = await this._checkColumnExists(client, dependency.target.table, dependency.target.column);
        if (!columnExists) {
          throw new Error(`Migration ${migrationFile} requires column '${dependency.target.table}.${dependency.target.column}' which does not exist`);
        }
        logger.log(`✅ Column dependency satisfied: ${dependency.target.table}.${dependency.target.column}`);
        break;

      default:
        logger.warn(`Unknown dependency type: ${dependency.type}`);
    }
  }

  /**
   * Validate common patterns that indicate missing dependencies
   * @param {Object} client - Database client
   * @param {string} content - Migration content
   * @param {string} filename - Migration filename
   * @private
   */
  async _validateCommonPatterns(client, content, filename) {
    // Check for references to common tables that might not exist
    const commonTables = ['paypal_webhook_events', 'stripe_webhook_events', 'email_retry_queue'];

    for (const table of commonTables) {
      if (content.includes(table)) {
        const exists = await this._checkTableExists(client, table);
        if (!exists) {
          logger.warn(`⚠️  Migration ${filename} references table '${table}' which may not exist yet`);
        }
      }
    }

    // Check for column references in views
    const viewMatch = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+\w+.*?AS\s+SELECT\s+(.+?)\s+FROM/is);
    if (viewMatch) {
      const selectClause = viewMatch[1];
      // Look for specific columns that commonly cause issues
      if (selectClause.includes('is_test')) {
        const tablesInView = this._extractTablesFromView(content);
        for (const table of tablesInView) {
          const hasColumn = await this._checkColumnExists(client, table, 'is_test');
          if (!hasColumn) {
            throw new Error(`Migration ${filename} creates view referencing 'is_test' column in table '${table}' which does not exist`);
          }
        }
      }
    }
  }

  /**
   * Extract table names from a view definition
   * @param {string} content - View content
   * @returns {Array} Array of table names
   * @private
   */
  _extractTablesFromView(content) {
    const tables = [];
    const fromMatch = content.match(/FROM\s+(\w+)/i);
    if (fromMatch) {
      tables.push(fromMatch[1]);
    }

    const joinMatches = content.matchAll(/JOIN\s+(\w+)/gi);
    for (const match of joinMatches) {
      tables.push(match[1]);
    }

    return tables;
  }

  /**
   * Check if a table exists in the database
   * @param {Object} client - Database client
   * @param {string} tableName - Table name to check
   * @returns {Promise<boolean>} True if table exists
   * @private
   */
  async _checkTableExists(client, tableName) {
    try {
      const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName]
      );
      return result.rows && result.rows.length > 0;
    } catch (error) {
      logger.warn(`Failed to check if table '${tableName}' exists: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a column exists in a table
   * @param {Object} client - Database client
   * @param {string} tableName - Table name
   * @param {string} columnName - Column name
   * @returns {Promise<boolean>} True if column exists
   * @private
   */
  async _checkColumnExists(client, tableName, columnName) {
    try {
      const result = await client.execute(`PRAGMA table_info(${tableName})`);
      if (!result.rows) return false;

      return result.rows.some(row => row.name === columnName);
    } catch (error) {
      logger.warn(`Failed to check if column '${tableName}.${columnName}' exists: ${error.message}`);
      return false;
    }
  }
}