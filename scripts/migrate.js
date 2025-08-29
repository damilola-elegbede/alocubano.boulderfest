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

    try {
      await this.db.execute(createTableSQL);
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
   * Handles semicolons within strings, comments, and trigger blocks
   */
  parseSQLStatements(content) {
    const statements = [];
    let currentStatement = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inComment = false;
    let inMultiLineComment = false;
    let inTriggerBlock = false;
    let triggerDepth = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1] || "";
      const prevChar = content[i - 1] || "";

      // Handle multi-line comments /* */
      if (
        char === "/" &&
        nextChar === "*" &&
        !inSingleQuote &&
        !inDoubleQuote
      ) {
        inMultiLineComment = true;
        currentStatement += char;
        continue;
      }

      if (char === "*" && nextChar === "/" && inMultiLineComment) {
        inMultiLineComment = false;
        currentStatement += char;
        continue;
      }

      if (inMultiLineComment) {
        currentStatement += char;
        continue;
      }

      // Handle single line comments --
      if (
        char === "-" &&
        nextChar === "-" &&
        !inSingleQuote &&
        !inDoubleQuote
      ) {
        inComment = true;
        currentStatement += char;
        continue;
      }

      if (inComment && char === "\n") {
        inComment = false;
        currentStatement += char;
        continue;
      }

      if (inComment) {
        currentStatement += char;
        continue;
      }

      // Handle string literals
      if (char === "'" && !inDoubleQuote && prevChar !== "\\") {
        inSingleQuote = !inSingleQuote;
      }

      if (char === '"' && !inSingleQuote && prevChar !== "\\") {
        inDoubleQuote = !inDoubleQuote;
      }

      // Track CREATE TRIGGER blocks to handle BEGIN...END properly
      if (!inSingleQuote && !inDoubleQuote && !inComment && !inMultiLineComment) {
        // Check for CREATE TRIGGER statement start
        const remainingContent = content.slice(i).toUpperCase();
        if (remainingContent.startsWith('CREATE TRIGGER') || 
            remainingContent.startsWith('CREATE OR REPLACE TRIGGER')) {
          inTriggerBlock = true;
          triggerDepth = 0;
        }
        
        // Track BEGIN/END blocks within triggers
        if (inTriggerBlock) {
          if (remainingContent.startsWith('BEGIN')) {
            triggerDepth++;
          } else if (remainingContent.startsWith('END')) {
            triggerDepth--;
            // If we've closed all BEGIN blocks, we can end at the next semicolon
            if (triggerDepth <= 0) {
              inTriggerBlock = false;
            }
          }
        }
      }

      // Handle statement separation
      if (char === ";" && !inSingleQuote && !inDoubleQuote && !inTriggerBlock) {
        currentStatement += char;
        statements.push(currentStatement.trim());
        currentStatement = "";
        continue;
      }

      currentStatement += char;
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    return statements;
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
      for (const statement of migration.statements) {
        if (statement.trim()) {
          try {
            await transaction.execute(statement);
          } catch (statementError) {
            // Handle idempotent operations gracefully
            if (this._isIdempotentError(statementError.message, statement)) {
              console.log(`   ⚠️  Idempotent operation skipped: ${statementError.message}`);
              continue; // Skip this statement and continue with the migration
            }
            // Enhanced error logging for debugging
            console.error(`   ❌ Statement execution failed:`);
            console.error(`   Statement: ${statement.substring(0, 200)}...`);
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
    
    // Handle LibSQL success messages that are reported as errors
    if (errorMessage.includes('SQLITE_OK: not an error') || 
        errorMessage === 'not an error') {
      return true;
    }
    
    // Handle duplicate column errors
    if (errorMessage.includes('duplicate column name') || 
        errorMessage.includes('already exists')) {
      if (statementUpper.includes('ALTER TABLE') && statementUpper.includes('ADD COLUMN')) {
        return true;
      }
    }
    
    // Handle duplicate index errors  
    if (errorMessage.includes('already exists') || 
        errorMessage.includes('duplicate index')) {
      if (statementUpper.includes('CREATE INDEX') || 
          statementUpper.includes('CREATE UNIQUE INDEX')) {
        return true;
      }
    }
    
    // Handle duplicate table errors (CREATE TABLE IF NOT EXISTS should not fail, but just in case)
    if (errorMessage.includes('table') && errorMessage.includes('already exists')) {
      if (statementUpper.includes('CREATE TABLE IF NOT EXISTS')) {
        return true;
      }
    }
    
    // Handle duplicate trigger errors
    if (errorMessage.includes('trigger') && errorMessage.includes('already exists')) {
      if (statementUpper.includes('CREATE TRIGGER IF NOT EXISTS')) {
        return true;
      }
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
