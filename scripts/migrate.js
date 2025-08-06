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
   * Handles semicolons within strings and comments
   */
  parseSQLStatements(content) {
    const statements = [];
    let currentStatement = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inComment = false;
    let inMultiLineComment = false;

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

      // Handle statement separation
      if (char === ";" && !inSingleQuote && !inDoubleQuote) {
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

    // Start transaction to ensure atomicity
    await this.db.execute("BEGIN TRANSACTION");

    try {
      // Execute each statement in the migration
      for (const statement of migration.statements) {
        if (statement.trim()) {
          await this.db.execute(statement);
        }
      }

      // Generate checksum for verification
      const checksum = await this.generateChecksum(migration.content);

      // Record migration as executed
      await this.db.execute(
        "INSERT INTO migrations (filename, checksum) VALUES (?, ?)",
        [migration.filename, checksum],
      );

      // Commit the transaction on success
      await this.db.execute("COMMIT");

      console.log(`✅ Migration completed: ${migration.filename}`);
    } catch (error) {
      // Rollback the transaction on failure
      try {
        await this.db.execute("ROLLBACK");
      } catch (rollbackError) {
        console.error("❌ Failed to rollback transaction:", rollbackError.message);
      }
      
      console.error(
        `❌ Migration failed: ${migration.filename}`,
        error.message,
      );
      throw error;
    }
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
