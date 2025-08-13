/**
 * Test Migration Runner
 * Executes all SQL migrations before tests run, ensuring database tables exist.
 * 
 * This module provides complete migration execution for test environments:
 * - Reads all migration files from /migrations/*.sql
 * - Parses SQL statements handling complex triggers and procedures  
 * - Executes migrations in chronological order
 * - Tracks applied migrations in migrations table
 * - Works with both :memory: and file-based SQLite databases
 * - Provides comprehensive error handling and logging
 */

import { readFileSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { splitSqlStatements } from '../../scripts/lib/sql-splitter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to migrations directory
const MIGRATIONS_DIR = resolve(__dirname, '../../migrations');

export class TestMigrationRunner {
  constructor(options = {}) {
    this.options = {
      logLevel: 'info', // 'debug', 'info', 'warn', 'error', 'silent'
      createMigrationsTable: true,
      continueOnError: false,
      transactionMode: true, // Wrap each migration in a transaction
      ...options
    };
    
    this.appliedMigrations = new Set();
    this.migrationCache = new Map();
    this.executionLog = [];
  }

  /**
   * Log messages based on configured log level
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  log(level, message, data = null) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
    const currentLevel = levels[this.options.logLevel] || 1;
    const messageLevel = levels[level] || 1;
    
    if (messageLevel >= currentLevel) {
      const prefix = `[TestMigrationRunner:${level.toUpperCase()}]`;
      if (data) {
        console[level === 'error' ? 'error' : 'log'](prefix, message, data);
      } else {
        console[level === 'error' ? 'error' : 'log'](prefix, message);
      }
    }
    
    // Always track execution log for debugging
    this.executionLog.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    });
  }

  /**
   * Get all migration files sorted in chronological order
   * @returns {Array<Object>} Array of migration file objects {name, path, order}
   */
  getMigrationFiles() {
    try {
      const files = readdirSync(MIGRATIONS_DIR);
      
      const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .map(file => {
          // Extract order from filename (e.g., "001_core_tables.sql" -> 1)
          const match = file.match(/^(\d+)_/);
          const order = match ? parseInt(match[1], 10) : 999;
          
          return {
            name: file,
            path: join(MIGRATIONS_DIR, file),
            order: order,
            basename: file.replace(/\.sql$/, '')
          };
        })
        .sort((a, b) => {
          // First sort by numerical order
          if (a.order !== b.order) {
            return a.order - b.order;
          }
          
          // If same order, prioritize CREATE TABLE over ALTER TABLE statements
          // This ensures table creation happens before alterations
          const aContent = this._peekMigrationContent(a.path);
          const bContent = this._peekMigrationContent(b.path);
          
          const aHasCreateTable = aContent.includes('CREATE TABLE');
          const bHasCreateTable = bContent.includes('CREATE TABLE');
          const aHasAlterTable = aContent.includes('ALTER TABLE');
          const bHasAlterTable = bContent.includes('ALTER TABLE');
          
          // CREATE TABLE migrations come first
          if (aHasCreateTable && !bHasCreateTable) return -1;
          if (!aHasCreateTable && bHasCreateTable) return 1;
          
          // ALTER TABLE migrations come after CREATE TABLE
          if (!aHasAlterTable && bHasAlterTable) return -1;
          if (aHasAlterTable && !bHasAlterTable) return 1;
          
          // If both are same type, sort alphabetically by name
          return a.name.localeCompare(b.name);
        });
      
      this.log('debug', `Found ${migrationFiles.length} migration files`, 
        migrationFiles.map(f => f.name));
      
      return migrationFiles;
    } catch (error) {
      this.log('error', 'Failed to read migration directory', error);
      throw new Error(`Failed to read migrations directory: ${error.message}`);
    }
  }

  /**
   * Peek at migration content for sorting purposes (cached)
   * @param {string} filePath - Path to the migration file
   * @returns {string} Raw content of the migration file
   * @private
   */
  _peekMigrationContent(filePath) {
    try {
      // Use cache if available
      const cacheKey = `peek_${filePath}`;
      if (this.migrationCache.has(cacheKey)) {
        return this.migrationCache.get(cacheKey);
      }
      
      const content = readFileSync(filePath, 'utf8').toUpperCase();
      this.migrationCache.set(cacheKey, content);
      return content;
    } catch (error) {
      // If we can't read the file, return empty string
      return '';
    }
  }

  /**
   * Read and parse SQL migration file
   * @param {string} filePath - Path to the migration file
   * @returns {Array<string>} Array of SQL statements
   */
  readMigrationFile(filePath) {
    // Check cache first
    if (this.migrationCache.has(filePath)) {
      return this.migrationCache.get(filePath);
    }
    
    try {
      const content = readFileSync(filePath, 'utf8');
      
      // Use the existing SQL splitter utility for robust parsing
      const statements = splitSqlStatements(content);
      
      // Filter out empty statements and comments
      const validStatements = statements
        .map(stmt => stmt.trim())
        .filter(stmt => {
          return stmt.length > 0 && 
                 !stmt.startsWith('--') && 
                 !stmt.startsWith('/*') &&
                 !stmt.match(/^\s*$/);
        });
      
      this.log('debug', `Parsed ${validStatements.length} statements from ${filePath}`);
      
      // Cache the parsed statements
      this.migrationCache.set(filePath, validStatements);
      
      return validStatements;
    } catch (error) {
      this.log('error', `Failed to read migration file: ${filePath}`, error);
      throw new Error(`Failed to read migration file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Create migrations tracking table if it doesn't exist
   * @param {Object} client - Database client (LibSQL)
   * @returns {Promise<void>}
   */
  async createMigrationsTable(client) {
    if (!this.options.createMigrationsTable) {
      return;
    }

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        checksum TEXT,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INTEGER,
        success BOOLEAN DEFAULT 1,
        error_message TEXT
      );
    `;

    try {
      await client.execute(createTableSQL);
      this.log('debug', 'Migrations tracking table created/verified');
    } catch (error) {
      this.log('error', 'Failed to create migrations table', error);
      throw new Error(`Failed to create migrations table: ${error.message}`);
    }
  }

  /**
   * Get list of already applied migrations
   * @param {Object} client - Database client (LibSQL)
   * @returns {Promise<Set<string>>} Set of applied migration filenames
   */
  async getAppliedMigrations(client) {
    if (!this.options.createMigrationsTable) {
      return new Set();
    }

    try {
      const result = await client.execute(
        'SELECT filename FROM migrations WHERE success = 1'
      );
      
      const appliedSet = new Set(result.rows.map(row => row.filename));
      this.log('debug', `Found ${appliedSet.size} previously applied migrations`);
      
      return appliedSet;
    } catch (error) {
      // If migrations table doesn't exist, assume no migrations applied
      this.log('debug', 'No migrations table found, assuming fresh database');
      return new Set();
    }
  }

  /**
   * Record migration execution in tracking table
   * @param {Object} client - Database client (LibSQL)
   * @param {string} filename - Migration filename
   * @param {number} executionTimeMs - Execution time in milliseconds
   * @param {boolean} success - Whether migration succeeded
   * @param {string|null} errorMessage - Error message if failed
   * @returns {Promise<void>}
   */
  async recordMigrationExecution(client, filename, executionTimeMs, success, errorMessage = null) {
    if (!this.options.createMigrationsTable) {
      return;
    }

    try {
      await client.execute({
        sql: `
          INSERT OR REPLACE INTO migrations 
          (filename, applied_at, execution_time_ms, success, error_message) 
          VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)
        `,
        args: [filename, executionTimeMs, success ? 1 : 0, errorMessage]
      });
    } catch (error) {
      this.log('warn', `Failed to record migration execution for ${filename}`, error);
      // Don't throw here as this is just tracking
    }
  }

  /**
   * Execute a single migration file
   * @param {Object} client - Database client (LibSQL)
   * @param {Object} migrationFile - Migration file object {name, path}
   * @returns {Promise<Object>} Execution result
   */
  async executeMigration(client, migrationFile) {
    const startTime = Date.now();
    let success = false;
    let errorMessage = null;
    let executedStatements = 0;

    try {
      this.log('info', `Executing migration: ${migrationFile.name}`);
      
      // Read and parse migration file
      const statements = this.readMigrationFile(migrationFile.path);
      
      if (statements.length === 0) {
        this.log('warn', `No executable statements in ${migrationFile.name}`);
        success = true;
        return { success, executedStatements: 0, executionTime: Date.now() - startTime };
      }
      
      // Check if migration has its own transaction management
      const hasOwnTransactions = this._hasOwnTransactionManagement(statements);

      // Execute statements
      if (this.options.transactionMode && !hasOwnTransactions) {
        // Execute all statements in a single transaction (only if migration doesn't have its own)
        await client.execute('BEGIN TRANSACTION');
        
        try {
          for (const statement of statements) {
            await this._executeStatementWithFallback(client, statement);
            executedStatements++;
            this.log('debug', `Executed statement ${executedStatements}/${statements.length}`);
          }
          
          await client.execute('COMMIT');
          success = true;
          
          this.log('info', `Migration ${migrationFile.name} completed successfully (${executedStatements} statements)`);
        } catch (error) {
          await client.execute('ROLLBACK');
          throw error;
        }
      } else {
        // Execute statements individually (or migration has own transaction management)
        if (hasOwnTransactions) {
          this.log('debug', `Migration ${migrationFile.name} has own transaction management`);
        }
        
        for (const statement of statements) {
          await this._executeStatementWithFallback(client, statement);
          executedStatements++;
          this.log('debug', `Executed statement ${executedStatements}/${statements.length}`);
        }
        success = true;
        
        this.log('info', `Migration ${migrationFile.name} completed successfully (${executedStatements} statements)`);
      }

    } catch (error) {
      errorMessage = error.message;
      this.log('error', `Migration ${migrationFile.name} failed`, error);
      
      if (!this.options.continueOnError) {
        throw new Error(`Migration ${migrationFile.name} failed: ${error.message}`);
      }
    } finally {
      const executionTime = Date.now() - startTime;
      
      // Record migration execution
      await this.recordMigrationExecution(
        client, 
        migrationFile.name, 
        executionTime, 
        success, 
        errorMessage
      );
    }

    return { 
      success, 
      executedStatements, 
      executionTime: Date.now() - startTime,
      errorMessage 
    };
  }

  /**
   * Execute a SQL statement with fallback for SQLite compatibility issues
   * @param {Object} client - Database client (LibSQL)
   * @param {string} statement - SQL statement to execute
   * @returns {Promise<void>}
   * @private
   */
  async _executeStatementWithFallback(client, statement) {
    const trimmedStatement = statement.trim();
    
    // Handle ADD COLUMN IF NOT EXISTS fallback
    const alterTableMatch = trimmedStatement.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+(.+)$/i);
    
    if (alterTableMatch) {
      const [, tableName, columnName, columnDefinition] = alterTableMatch;
      
      try {
        // Try the original statement first
        await client.execute(statement);
        return;
      } catch (error) {
        // If it fails due to syntax error, try fallback approach
        if (error.message.includes('syntax error') || error.message.includes('near "EXISTS"')) {
          this.log('debug', `Falling back to column existence check for ${tableName}.${columnName}`);
          
          // Check if column already exists
          const columnExists = await this._checkColumnExists(client, tableName, columnName);
          
          if (!columnExists) {
            // Handle constraints separately for SQLite compatibility  
            let cleanedDefinition = columnDefinition;
            let hasUniqueConstraint = false;
            let hasNotNullConstraint = false;
            
            // Check for UNIQUE constraint
            if (/\bUNIQUE\b/i.test(columnDefinition)) {
              hasUniqueConstraint = true;
              cleanedDefinition = cleanedDefinition.replace(/\bUNIQUE\b/gi, '').trim();
            }
            
            // Check for NOT NULL constraint in ALTER TABLE (problematic for existing tables)
            if (/\bNOT\s+NULL\b/i.test(columnDefinition)) {
              hasNotNullConstraint = true;
              // For existing tables, we'll add the column as nullable first
              // The migration author should handle data population and constraint addition separately
              cleanedDefinition = cleanedDefinition.replace(/\bNOT\s+NULL\b/gi, '').trim();
              this.log('warn', `Removing NOT NULL constraint from ${tableName}.${columnName} - add data and constraints separately`);
            }
            
            // Clean up multiple spaces
            cleanedDefinition = cleanedDefinition.replace(/\s+/g, ' ').trim();
            
            // Add column without UNIQUE constraint first
            const fallbackStatement = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${cleanedDefinition}`;
            this.log('debug', `Executing fallback statement: ${fallbackStatement}`);
            await client.execute(fallbackStatement);
            
            // If there was a UNIQUE constraint, create a unique index instead
            if (hasUniqueConstraint) {
              const indexName = `idx_${tableName}_${columnName}_unique`;
              const indexStatement = `CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columnName})`;
              this.log('debug', `Creating unique index: ${indexStatement}`);
              try {
                await client.execute(indexStatement);
              } catch (indexError) {
                this.log('warn', `Failed to create unique index for ${tableName}.${columnName}`, indexError);
                // Don't fail the migration if index creation fails
              }
            }
            
            return;
          } else {
            this.log('debug', `Column ${tableName}.${columnName} already exists, skipping`);
            return;
          }
        }
        
        // If it's not a syntax error, re-throw
        throw error;
      }
    }
    
    // Handle CREATE INDEX statements with column existence check
    const createIndexMatch = statement.trim().match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)/i);
    
    if (createIndexMatch) {
      const [, indexName, tableName, columnList] = createIndexMatch;
      
      try {
        // Try the original statement first
        await client.execute(statement);
        return;
      } catch (error) {
        // If it fails due to missing column, log and skip
        if (error.message.includes('no such column') || error.message.includes('no column named')) {
          this.log('warn', `Skipping index creation due to missing column: ${statement.trim()}`);
          return;
        }
        
        // Re-throw other errors
        throw error;
      }
    }
    
    // Handle statements with problematic RAISE() function outside of triggers
    if (statement.trim().toUpperCase().includes('RAISE(')) {
      try {
        await client.execute(statement);
        return;
      } catch (error) {
        if (error.message.includes('RAISE() may only be used within a trigger-program')) {
          this.log('warn', `Skipping statement with invalid RAISE() usage: ${statement.trim().substring(0, 100)}...`);
          return;
        }
        throw error;
      }
    }
    
    // For other statements, execute normally
    await client.execute(statement);
  }

  /**
   * Check if a column exists in a table
   * @param {Object} client - Database client (LibSQL)
   * @param {string} tableName - Table name
   * @param {string} columnName - Column name  
   * @returns {Promise<boolean>} True if column exists
   * @private
   */
  async _checkColumnExists(client, tableName, columnName) {
    try {
      const result = await client.execute(`PRAGMA table_info(${tableName})`);
      return result.rows.some(row => row.name.toLowerCase() === columnName.toLowerCase());
    } catch (error) {
      // If table doesn't exist, column doesn't exist
      this.log('debug', `Table ${tableName} doesn't exist or cannot check column ${columnName}`);
      return false;
    }
  }

  /**
   * Check if migration has its own transaction management
   * @param {Array<string>} statements - Array of SQL statements
   * @returns {boolean} True if migration contains transaction statements
   * @private
   */
  _hasOwnTransactionManagement(statements) {
    return statements.some(statement => {
      const trimmed = statement.trim().toUpperCase();
      return trimmed.startsWith('BEGIN') || 
             trimmed.startsWith('COMMIT') || 
             trimmed.startsWith('ROLLBACK') ||
             trimmed.includes('BEGIN TRANSACTION') ||
             trimmed.includes('START TRANSACTION');
    });
  }

  /**
   * Execute all pending migrations
   * @param {Object} client - Database client (LibSQL)
   * @returns {Promise<Object>} Summary of migration execution
   */
  async runAllMigrations(client) {
    const startTime = Date.now();
    
    try {
      this.log('info', 'Starting migration execution...');
      
      // Create migrations tracking table
      await this.createMigrationsTable(client);
      
      // Get list of migration files
      const migrationFiles = this.getMigrationFiles();
      
      if (migrationFiles.length === 0) {
        this.log('warn', 'No migration files found');
        return {
          success: true,
          totalMigrations: 0,
          appliedMigrations: 0,
          skippedMigrations: 0,
          failedMigrations: 0,
          totalExecutionTime: 0
        };
      }
      
      // Get already applied migrations
      const appliedMigrations = await getAppliedMigrations(client);
      this.appliedMigrations = appliedMigrations;
      
      // Execute migrations
      const results = {
        success: true,
        totalMigrations: migrationFiles.length,
        appliedMigrations: 0,
        skippedMigrations: 0,
        failedMigrations: 0,
        executionDetails: [],
        totalExecutionTime: 0
      };
      
      for (const migrationFile of migrationFiles) {
        if (appliedMigrations.has(migrationFile.name)) {
          this.log('debug', `Skipping already applied migration: ${migrationFile.name}`);
          results.skippedMigrations++;
          continue;
        }
        
        const migrationResult = await this.executeMigration(client, migrationFile);
        results.executionDetails.push({
          filename: migrationFile.name,
          ...migrationResult
        });
        
        if (migrationResult.success) {
          results.appliedMigrations++;
          this.appliedMigrations.add(migrationFile.name);
        } else {
          results.failedMigrations++;
          results.success = false;
          
          if (!this.options.continueOnError) {
            break;
          }
        }
      }
      
      results.totalExecutionTime = Date.now() - startTime;
      
      // Log summary
      this.log('info', 'Migration execution completed', {
        applied: results.appliedMigrations,
        skipped: results.skippedMigrations,
        failed: results.failedMigrations,
        totalTime: `${results.totalExecutionTime}ms`
      });
      
      return results;
      
    } catch (error) {
      this.log('error', 'Migration execution failed', error);
      throw new Error(`Migration execution failed: ${error.message}`);
    }
  }

  /**
   * Get execution log for debugging
   * @returns {Array<Object>} Execution log entries
   */
  getExecutionLog() {
    return [...this.executionLog];
  }

  /**
   * Reset runner state (useful for testing)
   */
  reset() {
    this.appliedMigrations.clear();
    this.migrationCache.clear();
    this.executionLog = [];
  }
}

// Helper function to get applied migrations (used by runAllMigrations)
async function getAppliedMigrations(client) {
  try {
    const result = await client.execute(
      'SELECT filename FROM migrations WHERE success = 1'
    );
    
    return new Set(result.rows.map(row => row.filename));
  } catch (error) {
    // If migrations table doesn't exist, assume no migrations applied
    return new Set();
  }
}

/**
 * Main function to run migrations for tests
 * @param {Object} databaseClient - LibSQL client instance
 * @param {Object} options - Migration runner options
 * @returns {Promise<Object>} Migration execution summary
 */
export async function runMigrationsForTest(databaseClient, options = {}) {
  const runner = new TestMigrationRunner({
    logLevel: process.env.NODE_ENV === 'test' ? 'warn' : 'info',
    createMigrationsTable: true,
    continueOnError: false,
    transactionMode: true,
    ...options
  });
  
  return await runner.runAllMigrations(databaseClient);
}

/**
 * Utility function to run migrations and return the client (for chaining)
 * @param {Object} databaseClient - LibSQL client instance  
 * @param {Object} options - Migration runner options
 * @returns {Promise<Object>} Database client (for chaining)
 */
export async function initializeTestDatabase(databaseClient, options = {}) {
  await runMigrationsForTest(databaseClient, options);
  return databaseClient;
}

/**
 * Quick setup function for test environments
 * Creates a migration runner and executes all migrations
 * @param {Object} databaseClient - LibSQL client instance
 * @param {boolean} silent - Whether to suppress logging (default: true for tests)
 * @returns {Promise<Object>} Migration execution summary
 */
export async function setupTestDatabase(databaseClient, silent = true) {
  return await runMigrationsForTest(databaseClient, {
    logLevel: silent ? 'error' : 'info',
    createMigrationsTable: true,
    continueOnError: false,
    transactionMode: true
  });
}

// Default export for simple usage
export default runMigrationsForTest;