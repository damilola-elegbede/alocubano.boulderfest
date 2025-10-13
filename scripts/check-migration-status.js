#!/usr/bin/env node
/**
 * Migration Status Checker
 * Verifies migration consistency between database and filesystem
 * Identifies orphaned entries and provides detailed migration status
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MigrationSystem } from "./migrate.js";
import { ensureDatabaseUrl } from "../lib/database-defaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function checkMigrationStatus() {
  try {
    // Set default local database if not configured
    ensureDatabaseUrl();

    log("\n🔍 Migration Status Check", colors.bright + colors.blue);
    log("=" .repeat(60), colors.blue);

    // Create migration system instance
    const migration = new MigrationSystem();

    // Initialize migrations table if needed
    await migration.initializeMigrationsTable();

    // Get database client from migration system
    const client = await migration.db.ensureInitialized();

    // Check if migrations table exists
    const tableCheck = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
    );

    if (tableCheck.rows.length === 0) {
      log("\n⚠️  Migrations table doesn't exist yet", colors.yellow);
      log("   Run 'npm run migrate:up' to initialize", colors.yellow);
      return;
    }

    // Get all migrations from database
    const dbMigrations = await client.execute(
      "SELECT filename, executed_at, checksum FROM migrations ORDER BY id"
    );

    // Get all migration files from filesystem
    const migrationsDir = path.join(__dirname, "..", "migrations");
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith(".sql")).sort();

    // Create maps for easier lookup
    const dbMap = new Map(dbMigrations.rows.map(row => [row.filename, row]));
    const fileSet = new Set(sqlFiles);

    // Analysis
    log("\n📊 Summary:", colors.cyan);
    log(`   Files on disk: ${sqlFiles.length}`, colors.cyan);
    log(`   Entries in database: ${dbMigrations.rows.length}`, colors.cyan);

    // Check for orphaned database entries (migrations in DB but not on disk)
    const orphanedEntries = dbMigrations.rows.filter(row => !fileSet.has(row.filename));

    if (orphanedEntries.length > 0) {
      log("\n❌ Orphaned Database Entries (in DB but not on disk):", colors.red);
      for (const entry of orphanedEntries) {
        log(`   - ${entry.filename}`, colors.red);
        log(`     Executed: ${new Date(entry.executed_at).toLocaleString()}`, colors.red);
      }
    }

    // Check for pending migrations (files on disk but not in DB)
    const pendingMigrations = sqlFiles.filter(file => !dbMap.has(file));

    if (pendingMigrations.length > 0) {
      log("\n⏳ Pending Migrations (on disk but not executed):", colors.yellow);
      for (const file of pendingMigrations) {
        log(`   - ${file}`, colors.yellow);
      }
    }

    // Check for executed migrations
    const executedMigrations = sqlFiles.filter(file => dbMap.has(file));

    if (executedMigrations.length > 0) {
      log("\n✅ Executed Migrations:", colors.green);
      for (const file of executedMigrations) {
        const dbEntry = dbMap.get(file);
        log(`   - ${file}`, colors.green);
        log(`     Executed: ${new Date(dbEntry.executed_at).toLocaleString()}`, colors.green);
      }
    }

    // Detailed Status Report
    log("\n" + "=".repeat(60), colors.blue);
    log("📈 Migration Status Details:", colors.bright);

    // Migration execution tracking indicators
    log("\n🎯 How to Read Migration Logs:", colors.magenta);
    log("\n   When migrations RUN (new migrations applied):", colors.cyan);
    log("   • '🔄 Executing migration: [filename]'", colors.cyan);
    log("   • '✅ Migration completed: [filename]'", colors.cyan);
    log("   • '✅ Migrations completed successfully!'", colors.cyan);
    log("   • 'Executed: X migration(s)' (X > 0)", colors.cyan);

    log("\n   When migrations are SKIPPED (already applied):", colors.cyan);
    log("   • '✨ No pending migrations found'", colors.cyan);
    log("   • 'Executed: 0 migration(s)'", colors.cyan);
    log("   • 'Skipped: X migration(s)' (X = total migrations)", colors.cyan);

    log("\n   Error Indicators:", colors.red);
    log("   • '❌ Migration failed: [filename]'", colors.red);
    log("   • '❌ Statement execution failed'", colors.red);
    log("   • Build fails if migrations fail", colors.red);

    // Health check
    const isHealthy = orphanedEntries.length === 0 &&
                      pendingMigrations.length === 0 &&
                      dbMigrations.rows.length === sqlFiles.length;

    log("\n" + "=".repeat(60), colors.blue);
    if (isHealthy) {
      log("✨ Database migrations are in sync!", colors.bright + colors.green);
      log(`   All ${sqlFiles.length} migrations have been executed.`, colors.green);
    } else {
      if (orphanedEntries.length > 0) {
        log("⚠️  Database has orphaned entries that need cleanup", colors.yellow);
      }
      if (pendingMigrations.length > 0) {
        log("📌 You have pending migrations to run", colors.yellow);
        log("   Run 'npm run migrate:up' to execute them", colors.cyan);
      }
    }

    // Recommendations
    if (orphanedEntries.length > 0) {
      log("\n💡 To clean orphaned entries:", colors.cyan);
      log("   1. Verify these migrations are truly not needed", colors.cyan);
      log("   2. If safe, manually remove from migrations table:", colors.cyan);
      for (const entry of orphanedEntries) {
        log(`      DELETE FROM migrations WHERE filename='${entry.filename}';`, colors.cyan);
      }
    }

    log("\n");

  } catch (error) {
    log("\n❌ Error checking migration status:", colors.red);
    log(`   ${error.message}`, colors.red);

    if (error.message.includes("TURSO_DATABASE_URL")) {
      log("\n💡 To check local database:", colors.cyan);
      log("   Set DATABASE_URL=file:./data/development.db", colors.cyan);
    }
  }
}

// Run the checker
checkMigrationStatus().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
