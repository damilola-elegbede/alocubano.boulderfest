/**
 * Bootstrap Database Helper Functions
 *
 * Advanced database operations and safety mechanisms for the bootstrap system
 * Handles batch operations, transactions, idempotency, and error recovery
 */

import { getDatabaseClient } from './database.js';
import { createLogger, retry, withTimeout } from './bootstrap-helpers.js';

const logger = createLogger('DBHelpers');

/**
 * SQL identifier validation regex - allows alphanumeric, underscores, periods for qualified names
 * Prevents SQL injection by restricting to safe characters
 */
const SQL_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

/**
 * Validates and quotes SQL identifiers to prevent injection attacks
 * @param {string} identifier - Table or column name to validate and quote
 * @param {string} context - Context for error messages (e.g., 'table name', 'column name')
 * @returns {string} Quoted identifier safe for SQL queries
 * @throws {Error} If identifier contains invalid characters
 */
function quoteSqlIdentifier(identifier, context = 'identifier') {
  if (typeof identifier !== 'string' || !identifier.trim()) {
    throw new Error(`Invalid ${context}: must be a non-empty string`);
  }

  const trimmed = identifier.trim();

  if (!SQL_IDENTIFIER_REGEX.test(trimmed)) {
    throw new Error(`Invalid ${context} '${trimmed}': contains unsafe characters. Only alphanumeric characters, underscores, and periods are allowed.`);
  }

  // Quote each part of qualified names (table.column)
  return trimmed.split('.').map(part => `"${part}"`).join('.');
}

/**
 * Validates multiple SQL identifiers
 * @param {Array<string>} identifiers - Array of identifiers to validate
 * @param {string} context - Context for error messages
 * @returns {Array<string>} Array of quoted identifiers
 */
function quoteSqlIdentifiers(identifiers, context = 'identifiers') {
  if (!Array.isArray(identifiers)) {
    throw new Error(`Invalid ${context}: must be an array`);
  }

  return identifiers.map((id, index) => quoteSqlIdentifier(id, `${context}[${index}]`));
}

/**
 * Database operations helper class for bootstrap system
 */
export class BootstrapDatabaseHelpers {
  constructor(options = {}) {
    this.db = null;
    this.transactionActive = false;
    this.operationStats = {
      queries: 0,
      inserts: 0,
      updates: 0,
      deletes: 0,
      errors: 0,
      startTime: null
    };

    // Configurable column names instead of assuming they exist
    this.config = {
      idColumn: options.idColumn || 'id',
      updatedAtColumn: options.updatedAtColumn || 'updated_at',
      ...options
    };
  }

  /**
   * Initialize database connection with shared client and busy timeout
   */
  async init(sharedClient = null) {
    if (!this.db) {
      this.db = sharedClient || await getDatabaseClient();
      this.operationStats.startTime = Date.now();

      // Set PRAGMA busy_timeout to handle SQLITE_BUSY errors
      try {
        await this.db.execute('PRAGMA busy_timeout = 5000');
      } catch (error) {
        // Log warning but continue - some database types don't support this pragma
        logger.warn('Warning: Could not set busy_timeout pragma:', error.message);
      }
    }
    return this.db;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      ...this.operationStats,
      duration: this.operationStats.startTime ? Date.now() - this.operationStats.startTime : 0
    };
  }

  /**
   * Execute database operation with retry logic for SQLITE_BUSY errors
   * @private
   */
  async _exec(operation, maxRetries = 3) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if this is a SQLITE_BUSY error that we should retry
        const isBusyError = error.message?.includes('SQLITE_BUSY') ||
                           error.message?.includes('database is locked') ||
                           error.code === 'SQLITE_BUSY';

        if (isBusyError && attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delayMs = 100 * Math.pow(2, attempt);
          logger.debug(`   ⏳ Database busy, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        // If not a busy error or we've exhausted retries, throw the error
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Safe batch insert with conflict resolution
   * Handles large datasets by breaking them into chunks
   *
   * @param {string} table - Table name
   * @param {Array} columns - Column names
   * @param {Array} rows - Array of row data arrays
   * @param {Object} options - Options for batch insert
   * @returns {Promise<Object>} Result statistics
   */
  async safeBatchInsert(table, columns, rows, options = {}) {
    const {
      chunkSize = 100,
      conflictAction = 'IGNORE', // IGNORE, REPLACE, or ABORT
      retryCount = 3,
      validateData = true
    } = options;

    await this.init();

    const results = {
      totalRows: rows.length,
      processed: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      chunks: 0
    };

    // Validate input
    if (!table || !columns || !Array.isArray(rows)) {
      throw new Error('Invalid parameters for safeBatchInsert');
    }

    if (rows.length === 0) {
      logger.info(`   📭 No rows to insert into ${table}`);
      return results;
    }

    // Validate data structure if requested
    if (validateData) {
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length !== columns.length) {
          throw new Error(`Row ${i} has ${row.length} values but ${columns.length} columns expected`);
        }
      }
    }

    logger.info(`   📊 Batch inserting ${rows.length} rows into ${table} (chunks of ${chunkSize})`);

    // Process in chunks
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      results.chunks++;

      try {
        const chunkResult = await retry(async () => {
          return await this._insertChunk(table, columns, chunk, conflictAction);
        }, retryCount);

        results.processed += chunk.length;
        results.inserted += chunkResult.inserted;
        results.skipped += chunkResult.skipped;
        this.operationStats.inserts += chunkResult.inserted;

        logger.debug(`     ✅ Chunk ${results.chunks}: ${chunkResult.inserted} inserted, ${chunkResult.skipped} skipped`);

      } catch (error) {
        results.errors.push({
          chunk: results.chunks,
          range: `${i}-${i + chunk.length - 1}`,
          error: error.message
        });
        this.operationStats.errors++;
        logger.error(`     ❌ Chunk ${results.chunks} failed: ${error.message}`);
      }
    }

    logger.info(`   📊 Batch insert complete: ${results.inserted} inserted, ${results.skipped} skipped, ${results.errors.length} errors`);
    return results;
  }

  /**
   * Insert a single chunk with proper conflict handling
   * @private
   */
  async _insertChunk(table, columns, rows, conflictAction) {
    // Validate and quote table and column names to prevent SQL injection
    const quotedTable = quoteSqlIdentifier(table, "table name");
    const quotedColumns = quoteSqlIdentifiers(columns, "column names");

    const placeholders = columns.map(() => '?').join(', ');
    const quotedColumnList = quotedColumns.join(', ');

    let sql;
    switch (conflictAction.toUpperCase()) {
      case 'IGNORE':
        sql = `INSERT OR IGNORE INTO ${quotedTable} (${quotedColumnList}) VALUES `;
        break;
      case 'REPLACE':
        sql = `INSERT OR REPLACE INTO ${quotedTable} (${quotedColumnList}) VALUES `;
        break;
      case 'ABORT':
        sql = `INSERT INTO ${quotedTable} (${quotedColumnList}) VALUES `;
        break;
      default:
        throw new Error(`Invalid conflict action: ${conflictAction}`);
    }

    // Build multi-row insert
    const valuesClauses = rows.map(() => `(${placeholders})`).join(', ');
    sql += valuesClauses;

    // Flatten row data for parameters
    const params = rows.flat();

    const result = await this._exec(() => this.db.execute({ sql, args: params }));

    return {
      inserted: result.rowsAffected || 0,
      skipped: rows.length - (result.rowsAffected || 0)
    };
  }

  /**
   * Safe transactional operation with automatic rollback
   *
   * @param {Function} operation - Async function to execute in transaction
   * @param {Object} options - Transaction options
   * @returns {Promise<*>} Result of the operation
   */
  async safeTransaction(operation, options = {}) {
    const {
      timeoutMs = 30000,
      retryCount = 2,
      rollbackOnError = true
    } = options;

    await this.init();

    if (this.transactionActive) {
      throw new Error('Cannot start nested transaction');
    }

    let transaction = null;
    this.transactionActive = true;

    try {
      // CRITICAL FIX: Always use fallback transaction for consistent behavior
      // libsql client.transaction() creates new connections for in-memory databases
      // causing tables to disappear. Fallback uses SQL BEGIN/COMMIT on same connection

      // Create transaction with timeout
      transaction = await withTimeout(
        () => this._createFallbackTransaction(),
        timeoutMs,
        `Transaction creation timeout after ${timeoutMs}ms`
      );

      logger.debug('   🔄 Transaction started');

      // Execute operation within transaction
      const result = await withTimeout(
        () => operation(transaction),
        timeoutMs,
        `Transaction operation timeout after ${timeoutMs}ms`
      );

      // Commit transaction
      await transaction.commit();
      logger.debug('   ✅ Transaction committed');

      return result;

    } catch (error) {
      logger.error(`   ❌ Transaction failed: ${error.message}`);

      if (transaction && rollbackOnError) {
        try {
          await transaction.rollback();
          logger.debug('   🔄 Transaction rolled back');
        } catch (rollbackError) {
          logger.error(`   ❌ Rollback failed: ${rollbackError.message}`);
        }
      }

      throw error;
    } finally {
      this.transactionActive = false;
    }
  }

  /**
   * Create fallback transaction for databases without native transaction support
   * @private
   */
  async _createFallbackTransaction() {
    let started = false;
    let completed = false;

    const self = this; // Capture 'this' context for use in transaction methods

    return {
      execute: async (sql, params = []) => {
        if (completed) throw new Error('Transaction already completed');

        if (!started) {
          await self._exec(() => self.db.execute('BEGIN IMMEDIATE'));
          started = true;
        }

        return await self._exec(() => self.db.execute({ sql, args: params }));
      },

      commit: async () => {
        if (completed) throw new Error('Transaction already completed');
        if (started) {
          await self._exec(() => self.db.execute('COMMIT'));
        }
        completed = true;
      },

      rollback: async () => {
        if (completed) throw new Error('Transaction already completed');
        if (started) {
          await self._exec(() => self.db.execute('ROLLBACK'));
        }
        completed = true;
      }
    };
  }

  /**
   * Check if a record exists with comprehensive conflict detection
   *
   * @param {string} table - Table name
   * @param {Object} conditions - Conditions to check
   * @returns {Promise<Object>} Existence check result
   */
  async checkRecordExists(table, conditions) {
    await this.init();

    // Validate and quote table and column names to prevent SQL injection
    const quotedTable = quoteSqlIdentifier(table, 'table name');
    const quotedIdColumn = quoteSqlIdentifier(this.config.idColumn, 'id column');

    const conditionKeys = Object.keys(conditions);
    const quotedConditionKeys = quoteSqlIdentifiers(conditionKeys, 'condition column names');
    const whereClause = quotedConditionKeys.map(key => `${key} = ?`).join(' AND ');
    const values = Object.values(conditions);

    const sql = `SELECT COUNT(*) as count, MAX(${quotedIdColumn}) as id FROM ${quotedTable} WHERE ${whereClause}`;

    const result = await this._exec(() => this.db.execute({ sql, args: values }));
    this.operationStats.queries++;

    const exists = result.rows[0].count > 0;
    const existingId = result.rows[0].id;

    return {
      exists,
      count: result.rows[0].count,
      id: existingId,
      hasConflict: result.rows[0].count > 1
    };
  }

  /**
   * Safe upsert operation with conflict resolution
   *
   * @param {string} table - Table name
   * @param {Object} data - Data to insert/update
   * @param {Array} conflictColumns - Columns to check for conflicts
   * @param {Object} options - Upsert options
   * @returns {Promise<Object>} Upsert result
   */
  async safeUpsert(table, data, conflictColumns, options = {}) {
    const {
      updateOnConflict = true,
      returnId = true
    } = options;

    await this.init();

    // Check for existing record
    const conditions = {};
    for (const col of conflictColumns) {
      conditions[col] = data[col];
    }

    const existsResult = await this.checkRecordExists(table, conditions);

    if (existsResult.exists) {
      if (updateOnConflict) {
        // Update existing record
        // Validate and quote table and column names to prevent SQL injection
        const quotedTable = quoteSqlIdentifier(table, 'table name');
        const quotedUpdatedAtColumn = quoteSqlIdentifier(this.config.updatedAtColumn, 'updated_at column');

        const updateColumns = Object.keys(data).filter(key => !conflictColumns.includes(key));
        const quotedUpdateColumns = quoteSqlIdentifiers(updateColumns, 'update column names');
        const quotedConflictColumns = quoteSqlIdentifiers(conflictColumns, 'conflict column names');

        const setClause = quotedUpdateColumns.map(key => `${key} = ?`).join(', ');

        if (setClause) {
          const whereClause = quotedConflictColumns.map(key => `${key} = ?`).join(' AND ');
          const updateValues = [
            ...updateColumns.map(key => data[key]),
            ...conflictColumns.map(key => data[key])
          ];

          const sql = `UPDATE ${quotedTable} SET ${setClause}, ${quotedUpdatedAtColumn} = CURRENT_TIMESTAMP WHERE ${whereClause}`;
          await this._exec(() => this.db.execute({ sql, args: updateValues }));
          this.operationStats.updates++;

          return {
            action: 'updated',
            id: existsResult.id,
            conflict: existsResult.hasConflict
          };
        } else {
          return {
            action: 'skipped',
            id: existsResult.id,
            reason: 'no_update_needed'
          };
        }
      } else {
        return {
          action: 'skipped',
          id: existsResult.id,
          reason: 'exists_no_update'
        };
      }
    } else {
      // Insert new record
      // Validate and quote table and column names to prevent SQL injection
      const quotedTable = quoteSqlIdentifier(table, 'table name');

      const columns = Object.keys(data);
      const quotedColumns = quoteSqlIdentifiers(columns, 'insert column names');
      const placeholders = columns.map(() => '?').join(', ');
      const values = Object.values(data);

      const sql = `INSERT INTO ${quotedTable} (${quotedColumns.join(', ')}) VALUES (${placeholders})`;
      const result = await this._exec(() => this.db.execute({ sql, args: values }));
      this.operationStats.inserts++;

      return {
        action: 'inserted',
        id: returnId ? result.lastInsertRowid : null,
        rowsAffected: result.rowsAffected
      };
    }
  }

  /**
   * Verify database integrity after bootstrap operations
   *
   * @param {Object} expectations - Expected data counts and constraints
   * @returns {Promise<Object>} Verification results
   */
  async verifyIntegrity(expectations = {}) {
    await this.init();

    const results = {
      passed: true,
      checks: [],
      errors: [],
      warnings: []
    };

    logger.info('   🔍 Verifying database integrity...');

    // Check expected table counts
    if (expectations.tableCounts) {
      for (const [table, expectedCount] of Object.entries(expectations.tableCounts)) {
        try {
          // Validate and quote table name to prevent SQL injection
          const quotedTable = quoteSqlIdentifier(table, 'table name');
          const result = await this._exec(() => this.db.execute(`SELECT COUNT(*) as count FROM ${quotedTable}`));
          const actualCount = result.rows[0].count;

          if (actualCount >= expectedCount) {
            results.checks.push({
              type: 'count',
              table,
              expected: expectedCount,
              actual: actualCount,
              status: 'passed'
            });
          } else {
            results.passed = false;
            results.errors.push({
              type: 'count',
              table,
              expected: expectedCount,
              actual: actualCount,
              message: `Table ${table} has ${actualCount} rows, expected at least ${expectedCount}`
            });
          }
        } catch (error) {
          results.passed = false;
          results.errors.push({
            type: 'count',
            table,
            error: error.message
          });
        }
      }
    }

    // Check foreign key constraints
    if (expectations.foreignKeys) {
      for (const constraint of expectations.foreignKeys) {
        try {
          // Validate and quote table and column names to prevent SQL injection
          const quotedTable = quoteSqlIdentifier(constraint.table, 'constraint table');
          const quotedColumn = quoteSqlIdentifier(constraint.column, 'constraint column');
          const quotedRefTable = quoteSqlIdentifier(constraint.refTable, 'reference table');
          const quotedRefColumn = quoteSqlIdentifier(constraint.refColumn, 'reference column');

          const sql = `
            SELECT COUNT(*) as violations
            FROM ${quotedTable}
            WHERE ${quotedColumn} IS NOT NULL
            AND ${quotedColumn} NOT IN (
              SELECT ${quotedRefColumn} FROM ${quotedRefTable}
            )
          `;

          const result = await this._exec(() => this.db.execute(sql));
          const violations = result.rows[0].violations;

          if (violations === 0) {
            results.checks.push({
              type: 'foreign_key',
              constraint: `${constraint.table}.${constraint.column} -> ${constraint.refTable}.${constraint.refColumn}`,
              status: 'passed'
            });
          } else {
            results.passed = false;
            results.errors.push({
              type: 'foreign_key',
              constraint: `${constraint.table}.${constraint.column} -> ${constraint.refTable}.${constraint.refColumn}`,
              violations,
              message: `Found ${violations} foreign key violations`
            });
          }
        } catch (error) {
          results.warnings.push({
            type: 'foreign_key',
            constraint: `${constraint.table}.${constraint.column} -> ${constraint.refTable}.${constraint.refColumn}`,
            error: error.message
          });
        }
      }
    }

    // Check unique constraints
    if (expectations.uniqueConstraints) {
      for (const constraint of expectations.uniqueConstraints) {
        try {
          // Validate and quote table and column names to prevent SQL injection
          const quotedTable = quoteSqlIdentifier(constraint.table, 'constraint table');

          const columns = Array.isArray(constraint.columns) ? constraint.columns : [constraint.columns];
          const quotedColumns = quoteSqlIdentifiers(columns, 'constraint columns');
          const groupBy = quotedColumns.join(', ');

          const sql = `
            SELECT ${groupBy}, COUNT(*) as cnt
            FROM ${quotedTable}
            GROUP BY ${groupBy}
            HAVING COUNT(*) > 1
          `;

          const result = await this._exec(() => this.db.execute(sql));

          if (result.rows.length === 0) {
            results.checks.push({
              type: 'unique',
              constraint: `${constraint.table}(${columns.join(', ')})`,
              status: 'passed'
            });
          } else {
            results.passed = false;
            results.errors.push({
              type: 'unique',
              constraint: `${constraint.table}(${columns.join(', ')})`,
              duplicates: result.rows.length,
              message: `Found ${result.rows.length} duplicate groups violating unique constraint`
            });
          }
        } catch (error) {
          results.warnings.push({
            type: 'unique',
            constraint: `${constraint.table}(${constraint.columns})`,
            error: error.message
          });
        }
      }
    }

    logger.info(`   📊 Integrity check: ${results.checks.length} passed, ${results.errors.length} errors, ${results.warnings.length} warnings`);

    return results;
  }

  /**
   * Clean up resources and connections
   */
  async cleanup() {
    if (this.transactionActive) {
      logger.warn('   ⚠️  Cleaning up with active transaction');
    }

    // Database cleanup is handled by the database service
    this.db = null;
    this.transactionActive = false;

    const stats = this.getStats();
    logger.info(`   📊 Database operations summary: ${stats.queries} queries, ${stats.inserts} inserts, ${stats.updates} updates, ${stats.errors} errors (${stats.duration}ms)`);
  }
}

/**
 * Pre-defined integrity expectations for bootstrap verification
 */
export const BOOTSTRAP_INTEGRITY_EXPECTATIONS = {
  tableCounts: {
    events: 1, // At least one event should exist
    event_settings: 5, // At least some basic settings
  },
  foreignKeys: [
    {
      table: 'event_settings',
      column: 'event_id',
      refTable: 'events',
      refColumn: 'id'
    },
    {
      table: 'event_access',
      column: 'event_id',
      refTable: 'events',
      refColumn: 'id'
    },
    {
      table: 'tickets',
      column: 'event_id',
      refTable: 'events',
      refColumn: 'id'
    }
  ],
  uniqueConstraints: [
    {
      table: 'events',
      columns: 'slug'
    },
    {
      table: 'event_settings',
      columns: ['event_id', 'key']
    },
    {
      table: 'event_access',
      columns: ['event_id', 'user_email']
    }
  ]
};

/**
 * Create a new database helpers instance
 * @returns {BootstrapDatabaseHelpers} Configured database helpers instance
 */
export function createDatabaseHelpers() {
  return new BootstrapDatabaseHelpers();
}

/**
 * Execute a function with database helpers and automatic cleanup
 * @param {Function} operation - Function to execute with helpers
 * @param {Object} sharedClient - Optional shared database client
 * @returns {Promise<*>} Result of the operation
 */
export async function withDatabaseHelpers(operation, sharedClient = null) {
  const helpers = new BootstrapDatabaseHelpers();

  try {
    await helpers.init(sharedClient);
    return await operation(helpers);
  } finally {
    await helpers.cleanup();
  }
}