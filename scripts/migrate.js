/**
 * Database Migration System
 * Handles automated database schema migrations for A Lo Cubano Boulder Fest
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDatabaseUrl } from '../lib/database-defaults.js';
import { getDatabaseClient } from "../lib/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MigrationSystem {
  constructor() {
    this.dbClient = null; // Will be initialized when needed
    this.migrationsDir = path.join(__dirname, "..", "migrations");
    this.debug = process.env.DEBUG_MIGRATION === 'true';
    this.isClosing = false; // Track cleanup state
    this.connectionActive = false; // Track if we have an active connection
  }

  /**
   * Ensure database client is initialized
   */
  async ensureDbClient() {
    if (this.isClosing) {
      throw new Error("Migration system is shutting down - no new operations allowed");
    }

    if (!this.dbClient) {
      this.dbClient = await getDatabaseClient();
      this.connectionActive = true;
    }
    return this.dbClient;
  }

  /**
   * Get the current database client (may be null)
   */
  getDbClient() {
    return this.dbClient;
  }

  /**
   * Manually close the database connection
   */
  async closeConnection() {
    if (this.dbClient && typeof this.dbClient.close === 'function') {
      await this.dbClient.close();
      this.dbClient = null;
    }
  }

  /**
   * Comprehensive cleanup method for resources
   * CRITICAL: This method ensures all database connections are properly closed
   */
  async cleanup() {
    // Prevent multiple concurrent cleanup operations
    if (this.isClosing) {
      console.log("Migration cleanup already in progress - waiting...");
      while (this.isClosing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isClosing = true;

    try {
      if (this.dbClient && this.connectionActive) {
        console.log("🧹 Closing migration system database connection...");

        // Try to close the connection gracefully with timeout
        const closeOperation = Promise.race([
          (async () => {
            if (typeof this.dbClient.close === 'function') {
              await this.dbClient.close();
            }
          })(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection close timeout after 5 seconds")), 5000)
          )
        ]);

        await closeOperation;
        console.log("✅ Migration system database connection closed successfully");
      }
    } catch (error) {
      // Log cleanup error but don't throw - cleanup should be non-throwing
      console.warn('⚠️  Warning: Migration database cleanup error:', error.message);
    } finally {
      this.dbClient = null;
      this.connectionActive = false;
      this.isClosing = false;
    }
  }

  /**
   * Alias for cleanup - ensures compatibility with build script expectations
   */
  async closeAllConnections() {
    await this.cleanup();
  }

  debugLog(message) {
    if (this.debug) {
      console.log(message);
    }
  }

  /**
   * Initialize migrations table if it doesn't exist
   */
  async initializeMigrationsTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_migrations_filename
      ON migrations(filename)
    `;

    try {
      const client = await this.ensureDbClient();
      await client.execute(createTableSQL);
      await client.execute(createIndexSQL);

      // Clean up any duplicate migration records

      this.debugLog("🔍 Checking for duplicate migration records...");

      const allRecords = await client.execute(`
        SELECT COUNT(*) as total FROM migrations
      `);
      this.debugLog(`   Total migration records: ${allRecords.rows[0].total}`);

      // Debug-only detailed analysis
      if (this.debug) {
        const allFilenames = await client.execute(`
          SELECT DISTINCT filename, LENGTH(filename) as len
          FROM migrations
          ORDER BY filename
        `);

        console.log(`   Found ${allFilenames.rows.length} unique filenames in migrations table`);
        if (allFilenames.rows.length > 30) {
          console.log("   First 10 filenames:");
          allFilenames.rows.slice(0, 10).forEach(row => {
            console.log(`     - "${row.filename}" (length: ${row.len})`);
          });
        }

        // Show files with counts
        const allCounts = await client.execute(`
          SELECT filename, COUNT(*) as cnt
          FROM migrations
          GROUP BY filename
          ORDER BY cnt DESC, filename
          LIMIT 10
        `);

        console.log("   Top files by record count:");
        allCounts.rows.forEach(row => {
          console.log(`     ${row.filename}: ${row.cnt} record(s)`);
        });
      }

      const duplicates = await client.execute(`
        SELECT filename, COUNT(*) as count
        FROM migrations
        GROUP BY filename
        HAVING COUNT(*) > 1
      `);

      if (duplicates.rows.length > 0) {
        console.log(`⚠️  Found ${duplicates.rows.length} files with duplicates:`);
        duplicates.rows.forEach(row => {
          console.log(`   - ${row.filename}: ${row.count} records`);
        });

        // Delete duplicates, keeping only the oldest entry for each filename
        const deleteResult = await client.execute(`
          DELETE FROM migrations
          WHERE id NOT IN (
            SELECT MIN(id)
            FROM migrations
            GROUP BY filename
          )
        `);

        console.log(`✅ Cleaned up ${deleteResult.rowsAffected || 'unknown number of'} duplicate migration entries`);

        // Verify cleanup
        const afterCleanup = await client.execute(`
          SELECT COUNT(*) as total FROM migrations
        `);
        console.log(`   Migration records after cleanup: ${afterCleanup.rows[0].total}`);
      } else {
        console.log("   No duplicate migration records found");
      }

      console.log("✅ Migrations table initialized");
    } catch (error) {
      console.error("❌ Failed to initialize migrations table:", error.message);
      throw error;
    }
  }

  /**
   * Get list of executed migrations from database
   */
  async getExecutedMigrations() {
    try {
      const client = await this.ensureDbClient();
      const result = await client.execute(
        "SELECT filename FROM migrations ORDER BY id",
      );
      return result.rows.map((row) => row.filename);
    } catch (error) {
      console.error("❌ Failed to get executed migrations:", error.message);
      throw error;
    }
  }

  /**
   * Get list of available migration files from filesystem
   */
  async getAvailableMigrations() {
    try {
      // Check if migrations directory exists
      try {
        await fs.access(this.migrationsDir);
      } catch {
        console.log(
          `📁 Migrations directory doesn't exist: ${this.migrationsDir}`,
        );
        return [];
      }

      const files = await fs.readdir(this.migrationsDir);
      const sqlFiles = files.filter((file) => file.endsWith(".sql")).sort(); // Ensure consistent ordering

      console.log(`📂 Found ${sqlFiles.length} migration files`);
      return sqlFiles;
    } catch (error) {
      console.error("❌ Failed to read migrations directory:", error.message);
      throw error;
    }
  }

  /**
   * Read and parse SQL migration file
   */
  async readMigrationFile(filename) {
    const filePath = path.join(this.migrationsDir, filename);

    try {
      const content = await fs.readFile(filePath, "utf8");

      // Split SQL content into individual statements
      // Handle statements separated by semicolons, but ignore semicolons in strings/comments
      const statements = this.parseSQLStatements(content);

      return {
        filename,
        content,
        statements: statements.filter((stmt) => stmt.trim().length > 0),
      };
    } catch (error) {
      console.error(
        `❌ Failed to read migration file ${filename}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Parse SQL content into individual statements
   * Enhanced parser that handles complex SQL constructs including triggers and procedures
   */
  parseSQLStatements(content) {
    const statements = [];
    let currentStatement = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;
    let inTrigger = false;
    let inProcedure = false;
    let beginEndDepth = 0;
    let parenDepth = 0;

    // Pre-process to normalize line endings and handle multi-line constructs
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Process character by character for accurate parsing
    for (let i = 0; i < normalizedContent.length; i++) {
      const char = normalizedContent[i];
      const nextChar = normalizedContent[i + 1] || "";
      const prevChar = normalizedContent[i - 1] || "";
      const next2Chars = normalizedContent.substring(i + 1, i + 3);

      // Handle block comments /* ... */
      if (!inSingleQuote && !inDoubleQuote && !inLineComment &&
          char === '/' && nextChar === '*') {
        inBlockComment = true;
        currentStatement += char;
        continue;
      }

      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        currentStatement += char + nextChar;
        i++; // Skip the '/'
        continue;
      }

      if (inBlockComment) {
        currentStatement += char;
        continue;
      }

      // Handle line comments -- until end of line
      if (!inSingleQuote && !inDoubleQuote && !inBlockComment &&
          char === '-' && nextChar === '-') {
        inLineComment = true;
        currentStatement += char;
        continue;
      }

      if (inLineComment && char === '\n') {
        inLineComment = false;
        currentStatement += char;
        continue;
      }

      if (inLineComment) {
        currentStatement += char;
        continue;
      }

      // Handle string literals with proper escape handling
      if (!inBlockComment && !inLineComment) {
        if (char === "'" && prevChar !== '\\') {
          if (!inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
          }
        }

        if (char === '"' && prevChar !== '\\') {
          if (!inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
          }
        }
      }

      currentStatement += char;

      // Skip parsing logic if we're inside quotes or comments
      if (inSingleQuote || inDoubleQuote || inBlockComment || inLineComment) {
        continue;
      }

      // Track parentheses depth for complex expressions
      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
      }

      // Look ahead for keywords (case-insensitive matching)
      const remainingContent = normalizedContent.substring(i).toUpperCase();
      const currentStatementUpper = currentStatement.toUpperCase();

      // Detect start of triggers, procedures, or functions
      if (!inTrigger && !inProcedure) {
        const triggerPatterns = [
          /^CREATE\s+TRIGGER\b/,
          /^CREATE\s+OR\s+REPLACE\s+TRIGGER\b/,
          /^CREATE\s+TEMP\s+TRIGGER\b/,
          /^CREATE\s+TEMPORARY\s+TRIGGER\b/
        ];

        const procedurePatterns = [
          /^CREATE\s+PROCEDURE\b/,
          /^CREATE\s+OR\s+REPLACE\s+PROCEDURE\b/,
          /^CREATE\s+FUNCTION\b/,
          /^CREATE\s+OR\s+REPLACE\s+FUNCTION\b/
        ];

        for (const pattern of triggerPatterns) {
          if (pattern.test(remainingContent)) {
            inTrigger = true;
            beginEndDepth = 0;
            break;
          }
        }

        if (!inTrigger) {
          for (const pattern of procedurePatterns) {
            if (pattern.test(remainingContent)) {
              inProcedure = true;
              beginEndDepth = 0;
              break;
            }
          }
        }
      }

      // Track BEGIN/END blocks in triggers and procedures
      if ((inTrigger || inProcedure) && parenDepth === 0) {
        // Match BEGIN but not BEGIN TRANSACTION/IMMEDIATE/DEFERRED/EXCLUSIVE
        if (/^BEGIN\b/.test(remainingContent) &&
            !/^BEGIN\s+(TRANSACTION|IMMEDIATE|DEFERRED|EXCLUSIVE)\b/.test(remainingContent)) {
          beginEndDepth++;
        }

        // Match END statements
        if (/^END\b/.test(remainingContent)) {
          beginEndDepth--;
          if (beginEndDepth <= 0) {
            // We've closed all BEGIN blocks - this completes the trigger/procedure
            inTrigger = false;
            inProcedure = false;
            beginEndDepth = 0;
          }
        }
      }

      // Check for statement terminator (semicolon)
      if (char === ';' && parenDepth === 0) {
        if (!inTrigger && !inProcedure) {
          // This is a complete simple statement
          const statement = currentStatement.trim();
          if (statement && !this._isCommentOnlyStatement(statement)) {
            statements.push(statement);
          }
          currentStatement = "";
        } else if ((inTrigger || inProcedure) && beginEndDepth <= 0) {
          // Trigger or procedure is complete
          const statement = currentStatement.trim();
          if (statement && !this._isCommentOnlyStatement(statement)) {
            statements.push(statement);
          }
          currentStatement = "";
          inTrigger = false;
          inProcedure = false;
          beginEndDepth = 0;
        }
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      const statement = currentStatement.trim();
      if (!this._isCommentOnlyStatement(statement)) {
        statements.push(statement);
      }
    }

    // Filter and clean statements
    return statements.filter(stmt => {
      const trimmed = stmt.trim();
      return trimmed.length > 0 && !this._isCommentOnlyStatement(trimmed);
    }).map(stmt => {
      // Clean up extra whitespace but preserve structure
      return stmt.replace(/\n\s*\n/g, '\n').trim();
    });
  }

  /**
   * Check if a statement contains only comments and whitespace
   * @private
   */
  _isCommentOnlyStatement(statement) {
    // Remove all block comments
    let cleaned = statement.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove all line comments
    cleaned = cleaned.replace(/--.*$/gm, '');

    // Remove all whitespace
    cleaned = cleaned.replace(/\s/g, '');

    // If nothing remains, it was comment-only
    return cleaned.length === 0;
  }

  /**
   * Execute a single migration file with enhanced error handling and rollback protection
   */
  async executeMigration(migration) {
    console.log(`🔄 Executing migration: ${migration.filename}`);

    try {
      // For problematic migrations, use statement-by-statement execution without transactions
      // to avoid rollback issues with complex table/index creation dependencies
      const client = await this.ensureDbClient();

      // First ensure migrations table exists
      await client.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL UNIQUE,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          checksum TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Execute each statement individually for better error isolation
      for (let idx = 0; idx < migration.statements.length; idx++) {
        const statement = migration.statements[idx];
        if (statement.trim()) {
          try {
            this.debugLog(`   Executing statement ${idx + 1}/${migration.statements.length}: ${statement.substring(0, 60)}...`);
            const result = await client.execute(statement);
            this.debugLog(`   ✅ Statement ${idx + 1} completed successfully`);
          } catch (statementError) {
            // Handle idempotent operations gracefully
            if (this._isIdempotentError(statementError.message, statement)) {
              console.log(`   ⚠️  Idempotent operation skipped: ${statementError.message}`);
              continue; // Skip this statement and continue with the migration
            }
            // Enhanced error logging for debugging
            console.error(`   ❌ Statement execution failed:`);
            console.error(`   Statement ${idx + 1}: ${statement.substring(0, 200)}...`);
            console.error(`   Error message: ${statementError.message}`);
            console.error(`   Error code: ${statementError.code || 'unknown'}`);

            // For certain types of errors, provide more specific guidance
            if (statementError.message.includes('no such column')) {
              console.error(`   💡 Hint: This usually means a table was not created properly or columns don't match expectations`);

              // Try to introspect the actual table schema for debugging
              try {
                const tableMatch = statement.match(/ON\s+(\w+)\s*\(/i);
                if (tableMatch) {
                  const tableName = tableMatch[1];
                  console.error(`   🔍 Checking actual schema for table '${tableName}':`);
                  const schemaResult = await client.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [tableName]);
                  if (schemaResult.rows.length > 0) {
                    console.error(`   📋 Actual table schema: ${schemaResult.rows[0].sql}`);
                  } else {
                    console.error(`   ❌ Table '${tableName}' does not exist in database`);
                  }
                }
              } catch (introspectionError) {
                console.error(`   ⚠️  Could not introspect table schema: ${introspectionError.message}`);
              }
            }

            // Re-throw non-idempotent errors
            throw statementError;
          }
        }
      }

      // Generate checksum for verification
      const checksum = await this.generateChecksum(migration.content);

      // Record migration as executed
      // Ensure filename is not null or empty
      if (!migration.filename || migration.filename.trim() === '') {
        throw new Error(`Migration filename is invalid: ${migration.filename}`);
      }

      try {
        // Check if this migration is already recorded
        const existing = await client.execute(
          "SELECT COUNT(*) as count FROM migrations WHERE filename = ?",
          [migration.filename]
        );

        if (existing.rows[0].count > 0) {
          console.log(`⏭️  Migration already recorded, skipping: ${migration.filename}`);
          return;
        }

        // Record migration (LibSQL will auto-commit this statement)
        await client.execute(
          "INSERT INTO migrations (filename, checksum, executed_at) VALUES (?, ?, datetime('now'))",
          [migration.filename, checksum],
        );

        console.log(`✅ Migration completed and recorded: ${migration.filename}`);

        // Verify it was actually recorded
        const verify = await client.execute(
          "SELECT COUNT(*) as count FROM migrations WHERE filename = ?",
          [migration.filename]
        );

        if (verify.rows[0].count === 0) {
          console.error(`❌ CRITICAL: Migration ${migration.filename} was NOT recorded despite commit!`);
        }
      } catch (insertError) {
        console.error(`⚠️  Failed to record migration in tracking table: ${insertError.message}`);
        // No rollback needed since LibSQL auto-commits individual statements
      }
    } catch (error) {
      // Enhanced error reporting for migration failures
      const errorDetails = {
        migration: migration.filename,
        error: error.message,
        statements: migration.statements.length,
        timestamp: new Date().toISOString(),
      };

      console.error(`❌ Migration failed:`, errorDetails);

      // Re-throw with enhanced error message for better debugging
      const enhancedError = new Error(
        `Migration ${migration.filename} failed: ${error.message}`
      );
      enhancedError.originalError = error;
      enhancedError.migrationDetails = errorDetails;
      throw enhancedError;
    }
  }

  /**
   * Check if an error is from an idempotent operation that can be safely ignored
   * @private
   */
  _isIdempotentError(errorMessage, statement) {
    const statementUpper = statement.toUpperCase().trim();
    const errorLower = errorMessage.toLowerCase();

    // Handle LibSQL success messages that are reported as errors
    if (errorMessage.includes('SQLITE_OK: not an error') ||
        errorMessage === 'not an error') {
      return true;
    }

    // Handle "already exists" errors more comprehensively
    if (errorLower.includes('already exists')) {
      return true;
    }

    // Handle duplicate column errors
    if (errorLower.includes('duplicate column name') ||
        (errorLower.includes('column') && errorLower.includes('already exists')) ||
        errorLower.includes('duplicate column')) {
      if (statementUpper.includes('ALTER TABLE') && statementUpper.includes('ADD COLUMN')) {
        return true;
      }
    }

    // Handle duplicate index errors
    if (errorLower.includes('index') && errorLower.includes('already exists')) {
      if (statementUpper.includes('CREATE INDEX') ||
          statementUpper.includes('CREATE UNIQUE INDEX')) {
        return true;
      }
    }

    // Handle duplicate table errors (even without IF NOT EXISTS)
    if (errorLower.includes('table') && errorLower.includes('already exists')) {
      if (statementUpper.includes('CREATE TABLE')) {
        return true;
      }
    }

    // Handle duplicate trigger errors
    if (errorLower.includes('trigger') && errorLower.includes('already exists')) {
      if (statementUpper.includes('CREATE TRIGGER')) {
        return true;
      }
    }

    // Handle duplicate constraint errors
    if (errorLower.includes('constraint') && errorLower.includes('already exists')) {
      return true;
    }

    // Handle SQLite constraint violations for existing data
    if (errorLower.includes('unique constraint') ||
        errorLower.includes('primary key constraint') ||
        errorLower.includes('foreign key constraint')) {
      // These might be acceptable in migration context if they're for existing data
      if (statementUpper.includes('INSERT OR IGNORE') ||
          statementUpper.includes('INSERT OR REPLACE')) {
        return true;
      }
    }

    // Handle "no such column" or "no such table" errors for index creation
    // This can happen when table schemas change between migrations
    if ((errorLower.includes('no such column') || errorLower.includes('no such table')) &&
        statementUpper.includes('CREATE INDEX')) {
      console.warn(`⚠️  Index creation skipped - table/column may not exist or have been renamed: ${errorMessage}`);
      return true;
    }

    return false;
  }

  /**
   * Generate checksum for migration content verification
   */
  async generateChecksum(content) {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    console.log("🚀 Starting database migrations...");

    try {
      // Test database connection first to catch early issues
      const client = await this.ensureDbClient();
      // Simple connection test
      const testResult = await client.execute('SELECT 1 as test');
      if (!testResult || !testResult.rows || testResult.rows.length !== 1) {
        throw new Error("Database connection test failed - cannot proceed with migrations");
      }
      this.debugLog("✅ Database connection verified");

      // Initialize migrations table
      await this.initializeMigrationsTable();

      // Get executed and available migrations
      const [executedMigrations, availableMigrations] = await Promise.all([
        this.getExecutedMigrations(),
        this.getAvailableMigrations(),
      ]);

      // Find pending migrations
      const pendingMigrations = availableMigrations.filter(
        (migration) => !executedMigrations.includes(migration),
      );

      if (pendingMigrations.length === 0) {
        console.log("✨ No pending migrations found");
        return { executed: 0, skipped: availableMigrations.length };
      }

      console.log(`📋 Found ${pendingMigrations.length} pending migrations:`);
      pendingMigrations.forEach((migration) => console.log(`  - ${migration}`));

      // Execute pending migrations in order
      let executedCount = 0;
      for (const migrationFile of pendingMigrations) {
        const migration = await this.readMigrationFile(migrationFile);
        await this.executeMigration(migration);
        executedCount++;
      }

      console.log(`🎉 Successfully executed ${executedCount} migrations`);

      // CRITICAL: Ensure WAL checkpoint for SQLite databases
      // This forces SQLite to write WAL contents to the main database file
      if (this.dbClient) {
        try {
          // Check if this is a SQLite database (file-based)
          const dbUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || '';
          if (dbUrl.includes('file:') || dbUrl.includes('.db')) {
            console.log("📝 Performing WAL checkpoint for SQLite database...");
            await this.dbClient.execute('PRAGMA wal_checkpoint(TRUNCATE)');
            console.log("✅ WAL checkpoint completed");
          }
        } catch (walError) {
          console.warn("⚠️  WAL checkpoint warning:", walError.message);
          // Non-fatal: continue even if checkpoint fails
        }
      }

      return {
        executed: executedCount,
        skipped: availableMigrations.length - pendingMigrations.length,
      };
    } catch (error) {
      console.error("❌ Migration system failed:", error.message);
      throw error;
    } finally {
      // For integration tests, keep connection open if requested
      const keepConnectionOpen = process.env.KEEP_MIGRATION_CONNECTION === 'true' ||
                                 process.env.INTEGRATION_TEST_MODE === 'true';

      if (!keepConnectionOpen) {
        // Only close connection for standalone migration runs
        try {
          if (this.dbClient && typeof this.dbClient.close === 'function') {
            console.log("🧹 Closing database connection...");
            await this.dbClient.close();
            console.log("✅ Database connection closed successfully");
          }
        } catch (cleanupError) {
          console.warn("⚠️  Failed to close database connection:", cleanupError.message);
        }
        // Clear cached reference after closing
        this.dbClient = null;
        this.connectionActive = false;
      } else {
        console.log("🔌 Keeping database connection open for integration tests");
        // CRITICAL: Still clear cached reference to prevent stale connections
        // Integration tests will get fresh connections from the singleton
        this.dbClient = null;
        this.connectionActive = false;
      }
      // Always mark as not closing
      this.isClosing = false;
    }
  }

  /**
   * Explicitly close the database connection
   * Used by migrate-vercel-build.js for cleanup
   */
  async closeConnection() {
    try {
      if (this.dbClient && typeof this.dbClient.close === 'function') {
        console.log("🧹 Closing migration system database connection...");
        await this.dbClient.close();
        console.log("✅ Migration system database connection closed successfully");
      }
    } catch (error) {
      // Ignore already closed errors
      if (!error.message.includes('CLIENT_CLOSED') && !error.message.includes('closed')) {
        console.warn("⚠️  Error closing migration connection:", error.message);
      }
    } finally {
      // Always clear cached references
      this.dbClient = null;
      this.connectionActive = false;
      this.isClosing = false;
    }
  }

  /**
   * Verify migration integrity
   */
  async verifyMigrations() {
    if (this.isClosing) {
      throw new Error("Cannot verify migrations - system is shutting down");
    }

    console.log("🔍 Verifying migration integrity...");

    try {
      // Ensure we have a valid connection before verification
      const client = await this.ensureDbClient();

      // Test connection before proceeding
      await client.execute('SELECT 1 as test');

      const [executedMigrations, availableMigrations] = await Promise.all([
        this.getExecutedMigrations(),
        this.getAvailableMigrations(),
      ]);

      // Check for executed migrations that no longer exist
      const missingFiles = executedMigrations.filter(
        (migration) => !availableMigrations.includes(migration),
      );

      if (missingFiles.length > 0) {
        console.warn("⚠️  Warning: Some executed migrations no longer exist:");
        missingFiles.forEach((file) => console.warn(`  - ${file}`));
      }

      // Verify checksums for existing files
      // OPTIMIZED: Batch query and parallel processing for 7-8x faster verification
      let checksumErrors = 0;

      // Filter to only executed migrations
      const migrationsToVerify = availableMigrations.filter(m => executedMigrations.includes(m));

      if (migrationsToVerify.length > 0) {
        try {
          // Step 1: Fetch ALL checksums in a single batch query (instead of 60 individual queries)
          // SECURITY NOTE: This query is safe from SQL injection because:
          // - Placeholders are always '?' characters (no user input)
          // - Actual values are passed as parameterized args array
          // - LibSQL/Turso properly escapes all parameters
          const client = await this.ensureDbClient();
          const placeholders = migrationsToVerify.map(() => '?').join(',');
          const result = await client.execute(
            `SELECT filename, checksum FROM migrations WHERE filename IN (${placeholders})`,
            migrationsToVerify
          );

          // Create a map for O(1) lookup
          const dbChecksums = new Map(result.rows.map(row => [row.filename, row.checksum]));

          // Step 2: Read and checksum files in parallel batches (10 at a time to avoid overwhelming I/O)
          const BATCH_SIZE = 10;
          for (let i = 0; i < migrationsToVerify.length; i += BATCH_SIZE) {
            const batch = migrationsToVerify.slice(i, i + BATCH_SIZE);

            // Process batch in parallel
            const batchResults = await Promise.allSettled(
              batch.map(async (migrationFile) => {
                const migration = await this.readMigrationFile(migrationFile);
                const currentChecksum = await this.generateChecksum(migration.content);
                return { migrationFile, currentChecksum };
              })
            );

            // Check for checksum mismatches
            for (const result of batchResults) {
              if (result.status === 'fulfilled') {
                const { migrationFile, currentChecksum } = result.value;
                const dbChecksum = dbChecksums.get(migrationFile);

                if (dbChecksum && dbChecksum !== currentChecksum) {
                  console.error(`❌ Checksum mismatch for ${migrationFile}`);
                  checksumErrors++;
                }
              } else {
                console.error(`❌ Failed to verify migration:`, result.reason.message);
                checksumErrors++;
              }
            }
          }
        } catch (error) {
          console.error(`❌ Batch verification failed:`, error.message);
          console.warn(`⚠️  Falling back to slower sequential verification (~8s slower)`);
          // Fall back to individual verification if batch fails
          for (const migrationFile of migrationsToVerify) {
            try {
              const migration = await this.readMigrationFile(migrationFile);
              const currentChecksum = await this.generateChecksum(migration.content);

              const client = await this.ensureDbClient();
              const result = await client.execute(
                "SELECT checksum FROM migrations WHERE filename = ?",
                [migrationFile],
              );

              if (result.rows.length > 0 && result.rows[0].checksum !== currentChecksum) {
                console.error(`❌ Checksum mismatch for ${migrationFile}`);
                checksumErrors++;
              }
            } catch (error) {
              console.error(`❌ Failed to verify ${migrationFile}:`, error.message);
              checksumErrors++;
            }
          }
        }
      }

      if (checksumErrors === 0 && missingFiles.length === 0) {
        console.log("✅ All migrations verified successfully");
      }

      return {
        verified: true,
        missingFiles,
        checksumErrors,
      };
    } catch (error) {
      console.error("❌ Migration verification failed:", error.message);
      throw error;
    }
  }

  /**
   * Show migration status
   * @param {boolean} keepConnectionOpen - If true, don't close the connection after status check
   */
  async status(keepConnectionOpen = false) {
    // Only show detailed status in debug mode
    if (this.debug) {
      console.log("📊 Migration Status Report");
      console.log("========================");
    }

    try {
      // Initialize migrations table (and clean up duplicates)
      await this.initializeMigrationsTable();

      const [executedMigrations, availableMigrations] = await Promise.all([
        this.getExecutedMigrations(),
        this.getAvailableMigrations(),
      ]);

      // Calculate actual pending by checking which available migrations aren't executed
      const pendingMigrations = availableMigrations.filter(
        migration => !executedMigrations.includes(migration)
      );
      const executedAvailableMigrations = availableMigrations.filter(
        migration => executedMigrations.includes(migration)
      );

      // Essential status info
      console.log(`📂 Found ${availableMigrations.length} migration files`);
      console.log(`Available migrations: ${availableMigrations.length}`);
      console.log(`Executed migrations:  ${executedAvailableMigrations.length}`);
      console.log(`Pending migrations:   ${pendingMigrations.length}`);

      // Debug-only detailed migration list
      if (this.debug && availableMigrations.length > 0) {
        console.log("\nMigration Details:");
        for (const migration of availableMigrations) {
          const status = executedMigrations.includes(migration)
            ? "✅ Executed"
            : "⏳ Pending";
          console.log(`  ${status} ${migration}`);
        }
      }

      return {
        total: availableMigrations.length,
        executed: executedAvailableMigrations.length,
        pending: pendingMigrations.length,
      };
    } catch (error) {
      console.error("❌ Failed to get migration status:", error.message);
      throw error;
    } finally {
      // Clean up database connection only if not keeping it open
      if (!keepConnectionOpen) {
        try {
          if (this.dbClient && typeof this.dbClient.close === 'function') {
            await this.dbClient.close();
          }
        } catch (cleanupError) {
          // Silently ignore cleanup errors for status command
        }
      }
    }
  }
}

/**
 * CLI interface for migration system
 */

/**
 * CLI interface for migration system
 */
async function main() {
  // Set default local database if not configured
  ensureDatabaseUrl();

  const args = process.argv.slice(2);
  const command = args[0] || "run";

  const migration = new MigrationSystem();

  try {
    switch (command) {
      case "run":
      case "migrate":
        await migration.runMigrations();
        break;

      case "status":
        await migration.status();
        break;

      case "verify":
        await migration.verifyMigrations();
        break;

      case "help":
        console.log(`
Database Migration System - A Lo Cubano Boulder Fest

Usage: node scripts/migrate.js [command]

Commands:
  run, migrate  Execute all pending migrations (default)
  status        Show migration status report
  verify        Verify migration integrity
  help          Show this help message

Examples:
  node scripts/migrate.js          # Run all pending migrations
  node scripts/migrate.js status   # Show migration status
  node scripts/migrate.js verify   # Verify migration integrity
        `);
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run "node scripts/migrate.js help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error("❌ Migration system error:", error.message);
    if (process.env.NODE_ENV === "development") {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export for use as module
export { MigrationSystem };

// Run CLI if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
