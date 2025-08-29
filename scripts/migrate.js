/**
 * Database Migration System
 * Handles automated database schema migrations for A Lo Cubano Boulder Fest
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDatabase } from "../api/lib/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MigrationSystem {
  constructor() {
    this.db = getDatabase();
    this.migrationsDir = path.join(__dirname, "..", "migrations");
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
      await this.db.execute(createTableSQL);
      await this.db.execute(createIndexSQL);
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
      const result = await this.db.execute(
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
   * Execute a single migration file
   */
  async executeMigration(migration) {
    console.log(`🔄 Executing migration: ${migration.filename}`);

    // Use proper transaction API with timeout protection (60s for migrations)
    const transaction = await this.db.transaction(60000);

    try {
      // First ensure migrations table exists within the transaction scope
      await transaction.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL UNIQUE,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          checksum TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Execute each statement in the migration within the transaction
      for (let idx = 0; idx < migration.statements.length; idx++) {
        const statement = migration.statements[idx];
        if (statement.trim()) {
          try {
            console.log(`   Executing statement ${idx + 1}/${migration.statements.length}...`);
            await transaction.execute(statement);
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
            // Re-throw non-idempotent errors
            throw statementError;
          }
        }
      }

      // Generate checksum for verification
      const checksum = await this.generateChecksum(migration.content);

      // Record migration as executed within the transaction
      // Ensure filename is not null or empty
      if (!migration.filename || migration.filename.trim() === '') {
        throw new Error(`Migration filename is invalid: ${migration.filename}`);
      }
      
      await transaction.execute(
        "INSERT INTO migrations (filename, checksum) VALUES (?, ?)",
        [migration.filename, checksum],
      );

      // Commit the transaction on success
      await transaction.commit();

      console.log(`✅ Migration completed: ${migration.filename}`);
    } catch (error) {
      // Rollback the transaction on failure with better error handling
      try {
        console.log(`🔄 Rolling back transaction for ${migration.filename}...`);
        await transaction.rollback();
        console.log(`✅ Transaction rolled back successfully`);
      } catch (rollbackError) {
        console.error(
          "❌ Failed to rollback transaction:",
          rollbackError.message,
        );
        
        // If rollback fails due to LibSQL client issues, force database service reset
        if (rollbackError.message.includes("no transaction") || 
            rollbackError.message.includes("timeout")) {
          console.warn("⚠️  Transaction state may be corrupted, resetting database service...");
          try {
            await this.db.resetForTesting();
            console.log("✅ Database service reset successfully");
          } catch (resetError) {
            console.error("❌ Failed to reset database service:", resetError.message);
          }
        }
      }

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
    
    // Handle duplicate column errors
    if (errorLower.includes('duplicate column name') || 
        errorLower.includes('column') && errorLower.includes('already exists')) {
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
    
    // Handle duplicate table errors
    if (errorLower.includes('table') && errorLower.includes('already exists')) {
      if (statementUpper.includes('CREATE TABLE IF NOT EXISTS')) {
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
      const connectionTest = await this.db.testConnection();
      if (!connectionTest) {
        throw new Error("Database connection test failed - cannot proceed with migrations");
      }
      console.log("✅ Database connection verified");

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
      return {
        executed: executedCount,
        skipped: availableMigrations.length - pendingMigrations.length,
      };
    } catch (error) {
      console.error("❌ Migration system failed:", error.message);
      
      // Attempt to clean up database connections on failure
      try {
        console.log("🧹 Cleaning up database connections after migration failure...");
        await this.db.close(5000);
        console.log("✅ Database connections cleaned up");
      } catch (cleanupError) {
        console.warn("⚠️  Failed to clean up database connections:", cleanupError.message);
      }
      
      throw error;
    }
  }

  /**
   * Verify migration integrity
   */
  async verifyMigrations() {
    console.log("🔍 Verifying migration integrity...");

    try {
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
      let checksumErrors = 0;
      for (const migrationFile of availableMigrations) {
        if (executedMigrations.includes(migrationFile)) {
          try {
            const migration = await this.readMigrationFile(migrationFile);
            const currentChecksum = await this.generateChecksum(
              migration.content,
            );

            const result = await this.db.execute(
              "SELECT checksum FROM migrations WHERE filename = ?",
              [migrationFile],
            );

            if (
              result.rows.length > 0 &&
              result.rows[0].checksum !== currentChecksum
            ) {
              console.error(`❌ Checksum mismatch for ${migrationFile}`);
              checksumErrors++;
            }
          } catch (error) {
            console.error(
              `❌ Failed to verify ${migrationFile}:`,
              error.message,
            );
            checksumErrors++;
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
   */
  async status() {
    console.log("📊 Migration Status Report");
    console.log("========================");

    try {
      const [executedMigrations, availableMigrations] = await Promise.all([
        this.getExecutedMigrations(),
        this.getAvailableMigrations(),
      ]);

      console.log(`Available migrations: ${availableMigrations.length}`);
      console.log(`Executed migrations:  ${executedMigrations.length}`);
      console.log(
        `Pending migrations:   ${availableMigrations.length - executedMigrations.length}`,
      );

      if (availableMigrations.length > 0) {
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
        executed: executedMigrations.length,
        pending: availableMigrations.length - executedMigrations.length,
      };
    } catch (error) {
      console.error("❌ Failed to get migration status:", error.message);
      throw error;
    }
  }
}

/**
 * CLI interface for migration system
 */
async function main() {
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