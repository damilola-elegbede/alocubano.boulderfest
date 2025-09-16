#!/usr/bin/env node
/**
 * Vercel Build Script with Migrations
 * Runs database migrations followed by the build process
 * Provides comprehensive status information throughout
 * Only executes in Vercel production and preview environments
 */

import { MigrationSystem } from "./migrate.js";
import { execSync } from "child_process";

// Debug mode - set DEBUG_MIGRATION=true for verbose logging
const DEBUG = process.env.DEBUG_MIGRATION === 'true';

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

function debugLog(message, color = colors.reset) {
  if (DEBUG) {
    console.log(`${color}${message}${colors.reset}`);
  }
}

function logSection(title, emoji = "📦") {
  console.log("");
  console.log(`${colors.bright}${colors.cyan}${"=".repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${emoji} ${title}${colors.reset}`);
  console.log(`${colors.cyan}${"=".repeat(60)}${colors.reset}`);
  console.log("");
}

async function runVercelBuild() {
  // Environment detection
  const isVercel = process.env.VERCEL === "1";
  const vercelEnv = process.env.VERCEL_ENV; // production, preview, or development
  const hasTursoUrl = !!process.env.TURSO_DATABASE_URL;
  const hasTursoToken = !!process.env.TURSO_AUTH_TOKEN;
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF || 'unknown';
  const gitCommit = process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
  const deploymentUrl = process.env.VERCEL_URL || 'unknown';

  let migrationResult = { executed: 0, skipped: 0 }; // Track migration results

  // Essential startup info
  log("🚀 Starting Vercel deployment with auto-migrations", colors.bright);
  log(`📍 ${vercelEnv} environment • ${gitCommit.substring(0, 8)}`, colors.cyan);

  // Debug-only detailed info
  debugLog("", colors.reset);
  debugLog("📋 Detailed Build Environment:", colors.bright);
  debugLog(`   Environment Type: ${vercelEnv || 'unknown'}`, colors.cyan);
  debugLog(`   Is Vercel: ${isVercel ? 'Yes' : 'No'}`, colors.cyan);
  debugLog(`   Git Branch: ${gitBranch}`, colors.cyan);
  debugLog(`   Git Commit: ${gitCommit}`, colors.cyan);
  debugLog(`   Deployment URL: ${deploymentUrl}`, colors.cyan);
  debugLog("");

  debugLog("🔐 Database Configuration:", colors.bright);
  debugLog(`   Turso URL Configured: ${hasTursoUrl ? '✅ Yes' : '❌ No'}`, hasTursoUrl ? colors.green : colors.red);
  debugLog(`   Turso Token Configured: ${hasTursoToken ? '✅ Yes' : '❌ No'}`, hasTursoToken ? colors.green : colors.red);

  // Essential database check
  if (!hasTursoUrl || !hasTursoToken) {
    log("❌ Missing Turso database credentials", colors.red);
  } else {
    log("✅ Database credentials configured", colors.green);
  }

  // Skip migrations for development builds or if not in Vercel
  if (!isVercel) {
    log("⏭️  Skipping migrations: Not running in Vercel environment", colors.yellow);
    process.exit(0);
  }

  if (vercelEnv === "development") {
    log("⏭️  Skipping migrations: Development environment", colors.yellow);
    process.exit(0);
  }

  // Verify Turso credentials are available
  if (!hasTursoUrl || !hasTursoToken) {
    log("❌ FATAL: Missing Turso credentials", colors.red);
    log("   Required environment variables:", colors.red);
    log("   - TURSO_DATABASE_URL: " + (hasTursoUrl ? "✓" : "✗"), colors.red);
    log("   - TURSO_AUTH_TOKEN: " + (hasTursoToken ? "✓" : "✗"), colors.red);
    log("");
    log("   Please add these as environment variables in your Vercel project settings.", colors.yellow);
    log("   Go to: Settings → Environment Variables", colors.yellow);

    // Always fail the build if Turso credentials are missing
    // Both production and preview need a working database
    log("❌ Build failed: Database configuration required", colors.red);
    log("   Vercel deployments require Turso credentials to function properly", colors.red);
    process.exit(1);
  }

  try {
    log("");
    log("🗄️ Running database migrations...", colors.bright);

    // Debug-only database details
    debugLog("");
    const dbUrl = process.env.TURSO_DATABASE_URL || 'NOT SET';
    const dbHost = dbUrl.includes('//') ? dbUrl.split('//')[1]?.split('.')[0] : 'unknown';
    debugLog(`   Database URL: ${dbUrl.substring(0, 50)}...`, colors.cyan);
    debugLog(`   Database Host: ${dbHost}`, colors.cyan);
    debugLog(`   Auth Token: ${process.env.TURSO_AUTH_TOKEN ? 'Configured' : 'MISSING'}`, colors.cyan);
    debugLog("");

    const migration = new MigrationSystem();

    let status;
    try {
      status = await migration.status();
      log(`   Database connection: ✅ Success`, colors.green);
    } catch (statusError) {
      log(`   Database connection: ❌ Failed`, colors.red);
      log(`   Error: ${statusError.message}`, colors.red);
      throw statusError;
    }

    if (status.pending === 0) {
      log("📋 Migration status check:", colors.blue);
      log(`   Total migrations: ${status.total}`, colors.cyan);
      log(`   Executed migrations: ${status.executed}`, colors.cyan);
      log(`   Pending migrations: ${status.pending}`, colors.cyan);

      // Only verify consistency if we have NO pending migrations AND some executed
      // If we have pending migrations, let them run first before checking
      if (status.executed > 0 && status.pending === 0) {
        try {
          const client = await migration.db.ensureInitialized();
          const tableCheck = await client.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tickets', 'transactions', 'registrations', 'events') ORDER BY name"
          );

          const existingTables = tableCheck.rows.map(r => r.name);
          const expectedTables = ['events', 'registrations', 'tickets', 'transactions'];
          const missingTables = expectedTables.filter(t => !existingTables.includes(t));

          if (missingTables.length > 0) {
            log("", colors.red);
            log("⚠️  WARNING: Database inconsistency detected!", colors.yellow);
            log(`   Migrations table shows ${status.executed} completed`, colors.yellow);
            log(`   But critical tables are missing: ${missingTables.join(', ')}`, colors.red);
            log(`   This indicates corrupted migration tracking`, colors.red);
            log("   Will attempt to run all pending migrations to fix", colors.yellow);
            // Don't exit - let the migration system handle it
          } else {
            log("✅ Database structure verified - all critical tables exist", colors.green);
            migrationResult.skipped = status.executed;
          }
        } catch (verifyError) {
          log("⚠️  Could not verify table existence: " + verifyError.message, colors.yellow);
          migrationResult.skipped = status.executed;
        }
      } else if (status.pending > 0) {
        log(`📌 ${status.pending} pending migrations will be executed - skipping consistency check`, colors.cyan);
        migrationResult.skipped = status.executed;
      } else {
        log("📌 Fresh database - skipping consistency check", colors.cyan);
        migrationResult.skipped = status.executed;
      }
    } else {
      log(`📋 Found ${status.pending} pending migration(s)`, colors.yellow);
      log("");

      // Run the migrations
      const result = await migration.runMigrations();
      migrationResult = result;

      log("");
      log("✅ Migrations completed successfully!", colors.green);
      log(`   Executed: ${result.executed} migration(s)`, colors.cyan);
      log(`   Skipped: ${result.skipped} migration(s)`, colors.cyan);
      log("");

      // Verify tables actually exist after migration
      log("🔍 Verifying database state after migrations...", colors.blue);
      const client = await migration.db.ensureInitialized();

      const tableCheck = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      log(`   Tables found: ${tableCheck.rows.length}`, colors.cyan);

      const migrationCheck = await client.execute(
        "SELECT COUNT(*) as count FROM migrations"
      );
      log(`   Migrations recorded: ${migrationCheck.rows[0].count}`, colors.cyan);

      if (tableCheck.rows.length < 10) {
        log("❌ WARNING: Very few tables exist after migration!", colors.red);
        log(`   Tables: ${tableCheck.rows.map(r => r.name).join(', ')}`, colors.red);
      }
    }

    // Verify migrations after execution
    if (vercelEnv === "production") {
      log("🔍 Verifying migration integrity...", colors.blue);
      const verification = await migration.verifyMigrations();

      if (verification.checksumErrors > 0 || verification.missingFiles.length > 0) {
        log("❌ CRITICAL: Migration verification failed!", colors.red);
        if (verification.checksumErrors > 0) {
          log(`   - Checksum errors: ${verification.checksumErrors}`, colors.red);
        }
        if (verification.missingFiles.length > 0) {
          log(`   - Missing files: ${verification.missingFiles.join(", ")}`, colors.red);
        }
        log("");
        log("🛑 Failing build due to migration integrity issues", colors.red);
        log("   Production deployments require verified migrations", colors.red);
        process.exit(1);
      } else {
        log("✅ Migration integrity verified", colors.green);
      }
    }

    log("");
    log("✅ Database migration phase complete", colors.bright + colors.green);

    // Now run the actual build process
    logSection("BUILD PHASE", "🏗️");

    try {
      log("📦 Running build process...", colors.blue);
      log("");

      // Run npm build command
      execSync("npm run build", {
        stdio: 'inherit',
        env: { ...process.env }
      });

      log("");
      log("✅ Build completed successfully!", colors.bright + colors.green);

      // Clean summary
      log("");
      log("✅ Migration and build completed successfully!", colors.bright + colors.green);
      if (migrationResult.executed > 0) {
        log(`📊 Executed ${migrationResult.executed} migration(s)`, colors.cyan);
      }

      debugLog("");
      debugLog("📊 Detailed Summary:", colors.bright);
      debugLog(`   Migrations executed: ${migrationResult.executed}`, colors.cyan);
      debugLog(`   Migrations skipped: ${migrationResult.skipped}`, colors.cyan);
      debugLog(`   Deployment URL: ${deploymentUrl}`, colors.cyan);

      process.exit(0);
    } catch (buildError) {
      log("");
      log("❌ Build failed after successful migrations!", colors.red);
      log(`   Error: ${buildError.message}`, colors.red);
      log("");
      log("⚠️  The database migrations were successful, but the build failed.", colors.yellow);
      log("   Please check the build output above for specific errors.", colors.yellow);
      process.exit(1);
    }

  } catch (error) {
    log("");
    log("❌ Migration failed!", colors.red);
    log(`   Error: ${error.message}`, colors.red);

    if (error.originalError) {
      log(`   Original error: ${error.originalError.message}`, colors.red);
    }

    if (error.migrationDetails) {
      log(`   Migration: ${error.migrationDetails.migration}`, colors.red);
      log(`   Timestamp: ${error.migrationDetails.timestamp}`, colors.red);
    }

    log("");

    // In preview environments, we might want to be more lenient
    if (vercelEnv === "preview") {
      log("⚠️  Migration failed in preview environment", colors.yellow);
      log("   The build will be terminated to prevent deploying with an inconsistent database state.", colors.yellow);
      log("   Please check the migration files and try again.", colors.yellow);
    } else {
      log("💥 Migration failed in production environment", colors.red);
      log("   The build has been terminated to prevent deployment.", colors.red);
    }

    log("");
    log("📚 Troubleshooting:", colors.cyan);
    log("   1. Check that your migration SQL files are valid", colors.cyan);
    log("   2. Ensure the database connection is working", colors.cyan);
    log("   3. Review the error message above for specific issues", colors.cyan);
    log("   4. Test migrations locally first with: npm run migrate:up", colors.cyan);

    // Always fail the build if migrations fail
    process.exit(1);
  }
}

// Run the build process (migrations + build)
runVercelBuild().catch(error => {
  console.error("Unexpected error in build script:", error);
  process.exit(1);
});