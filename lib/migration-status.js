/**
 * Migration Status Module
 * Provides dynamic migration status information from the database
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get real migration status from database
 */
export async function getMigrationStatus(database) {
  try {
    // Check if migrations table exists
    const tableExists = await checkMigrationsTableExists(database);
    if (!tableExists) {
      return {
        applied: [],
        pending: await getAllMigrationFiles(),
        lastMigration: null,
        migrationDate: null,
        status: "not_initialized",
      };
    }

    // Get applied migrations from database
    const appliedResult = await database.execute(
      "SELECT filename, checksum, applied_at FROM migrations ORDER BY filename",
    );

    const applied = appliedResult.rows.map((row) => row.filename);

    // Get all migration files from filesystem
    const allMigrations = await getAllMigrationFiles();

    // Determine pending migrations
    const pending = allMigrations.filter(
      (migration) => !applied.includes(migration),
    );

    // Get last migration info
    const lastMigrationResult = await database.execute(
      "SELECT filename, applied_at FROM migrations ORDER BY applied_at DESC LIMIT 1",
    );

    const lastMigration = lastMigrationResult.rows[0];

    return {
      applied,
      pending,
      lastMigration: lastMigration?.filename || null,
      migrationDate: lastMigration?.applied_at || null,
      status: pending.length > 0 ? "pending_migrations" : "up_to_date",
    };
  } catch (error) {
    console.error("Failed to get migration status:", error.message);
    return {
      applied: [],
      pending: [],
      lastMigration: null,
      migrationDate: null,
      status: "error",
      error: "Failed to retrieve migration status",
    };
  }
}

/**
 * Check if migrations table exists in database
 */
async function checkMigrationsTableExists(database) {
  try {
    const result = await database.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `);
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get all migration files from the migrations directory
 */
async function getAllMigrationFiles() {
  try {
    const migrationsDir = path.resolve(process.cwd(), "migrations");

    if (!fs.existsSync(migrationsDir)) {
      return [];
    }

    const files = fs.readdirSync(migrationsDir);

    // Filter for SQL migration files and sort them
    return files
      .filter((file) => file.endsWith(".sql") && !file.includes(".bak"))
      .sort();
  } catch (error) {
    console.error("Failed to read migration files:", error.message);
    return [];
  }
}
