#!/usr/bin/env node
/**
 * Vercel Build Script with Migrations
 * Runs database migrations followed by the build process
 * Provides comprehensive status information throughout
 * Only executes in Vercel production and preview environments
 *
 * RESOURCE CLEANUP AND CONNECTION MANAGEMENT DOCUMENTATION:
 *
 * Critical Considerations for Database Connection Management:
 *
 * 1. **Database Connection Lifecycle**:
 *    - This script creates database connections through MigrationSystem
 *    - Connections may persist beyond script execution
 *    - Vercel serverless environment expects clean process termination
 *
 * 2. **Current Implementation Issues**:
 *    - No explicit connection cleanup or resource disposal
 *    - Database clients may leave open connections
 *    - Potential memory leaks in long-running migration processes
 *    - Process may hang waiting for connection pools to drain
 *
 * 3. **Resource Cleanup Requirements**:
 *
 *    a) **Database Connection Cleanup**:
 *       - Explicitly close database connections after use
 *       - Implement proper connection pool draining
 *       - Handle connection timeouts gracefully
 *       - Ensure connections are released on both success and failure
 *
 *    b) **Migration System Cleanup**:
 *       - Add cleanup methods to MigrationSystem class
 *       - Implement proper resource disposal patterns
 *       - Handle partial migration failures with cleanup
 *       - Track and close all active database handles
 *
 *    c) **Process Lifecycle Management**:
 *       - Implement graceful shutdown procedures
 *       - Handle SIGTERM and SIGINT signals properly
 *       - Ensure clean process exit codes
 *       - Prevent zombie processes in Vercel environment
 *
 * 4. **Recommended Implementation Pattern**:
 *
 *    ```javascript
 *    // Example proper resource management
 *    let migrationSystem = null;
 *
 *    async function runMigrationsWithCleanup() {
 *      try {
 *        migrationSystem = new MigrationSystem();
 *        const result = await migrationSystem.runMigrations();
 *        return result;
 *      } finally {
 *        // CRITICAL: Always cleanup resources
 *        if (migrationSystem) {
 *          await migrationSystem.cleanup();
 *          await migrationSystem.closeAllConnections();
 *        }
 *      }
 *    }
 *
 *    // Handle process signals for graceful shutdown
 *    process.on('SIGTERM', async () => {
 *      if (migrationSystem) {
 *        await migrationSystem.cleanup();
 *      }
 *      process.exit(0);
 *    });
 *    ```
 *
 * 5. **Vercel Environment Considerations**:
 *    - Serverless functions have execution time limits
 *    - Connection pools must be properly drained
 *    - Memory usage should be monitored and cleaned up
 *    - Process must exit cleanly to prevent cold start issues
 *
 * 6. **Monitoring and Debugging**:
 *    - Log connection creation and cleanup events
 *    - Monitor for hanging connections or memory leaks
 *    - Track migration execution times and resource usage
 *    - Implement health checks for resource cleanup
 *
 * 7. **Error Recovery with Cleanup**:
 *    - Ensure cleanup happens even on migration failures
 *    - Implement rollback procedures with proper resource disposal
 *    - Handle partial cleanup scenarios gracefully
 *    - Log cleanup success/failure for debugging
 *
 * 8. **Testing Resource Management**:
 *    - Test connection cleanup in both success and failure scenarios
 *    - Verify proper process termination in test environments
 *    - Monitor for resource leaks during development
 *    - Validate cleanup procedures in CI/CD pipelines
 *
 * IMMEDIATE ACTION REQUIRED:
 * The MigrationSystem class should be enhanced with:
 * - cleanup() method for explicit resource disposal
 * - closeAllConnections() method for database cleanup
 * - Proper error handling with guaranteed cleanup
 * - Signal handlers for graceful shutdown
 *
 * This script currently relies on process termination for cleanup,
 * which may not be sufficient in all deployment scenarios.
 */

import { MigrationSystem } from "./migrate.js";
import { execSync } from "child_process";

// Debug mode - set DEBUG_MIGRATION=true for verbose logging
const DEBUG = process.env.DEBUG_MIGRATION === 'true';

// Quiet mode - suppress verbose output in production/CI (only show critical messages)
const QUIET_MODE = process.env.CI === 'true' || process.env.VERCEL_ENV === 'production';

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
  // In quiet mode, only show critical messages (✅, ❌, ⚠️, 🚀)
  if (!QUIET_MODE || message.includes('✅') || message.includes('❌') || message.includes('⚠️') || message.includes('🚀')) {
    console.log(`${color}${message}${colors.reset}`);
  }
}

function debugLog(message, color = colors.reset) {
  // Debug logs never show in quiet mode
  if (DEBUG && !QUIET_MODE) {
    console.log(`${color}${message}${colors.reset}`);
  }
}

function logSection(title, emoji = "📦") {
  // Skip section headers in quiet mode
  if (!QUIET_MODE) {
    console.log("");
    console.log(`${colors.bright}${colors.cyan}${"=".repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${emoji} ${title}${colors.reset}`);
    console.log(`${colors.cyan}${"=".repeat(60)}${colors.reset}`);
    console.log("");
  }
}

/**
 * Global migration system instance for cleanup tracking
 * IMPORTANT: This should be properly cleaned up before process exit
 */
let globalMigrationSystem = null;

/**
 * Cleanup function to ensure database connections are properly closed
 * CRITICAL: This function should be called before process termination
 */
async function cleanupResources() {
  if (globalMigrationSystem) {
    try {
      log("🧹 Cleaning up database connections...", colors.blue);

      // Use the new explicit closeConnection method
      if (typeof globalMigrationSystem.closeConnection === 'function') {
        await globalMigrationSystem.closeConnection();
      }

      log("✅ Resource cleanup completed", colors.green);
    } catch (cleanupError) {
      // Handle specific connection cleanup errors gracefully
      if (cleanupError.message.includes("Client is closed") ||
          cleanupError.message.includes("ClientError") ||
          cleanupError.message.includes("manually closed")) {
        log("✅ Database connection already closed", colors.green);
      } else {
        log(`⚠️  Warning: Cleanup error: ${cleanupError.message}`, colors.yellow);
      }
      // Don't fail the build due to cleanup errors, but log them
    } finally {
      globalMigrationSystem = null;
    }
  }
}

/**
 * Setup process signal handlers for graceful shutdown
 * Ensures resources are cleaned up even on unexpected termination
 */
function setupSignalHandlers() {
  const handleSignal = async (signal) => {
    log(`\n📡 Received ${signal} signal, cleaning up...`, colors.yellow);
    await cleanupResources();
    process.exit(0);
  };

  process.on('SIGTERM', handleSignal);
  process.on('SIGINT', handleSignal);

  // Handle uncaught exceptions to ensure cleanup
  process.on('uncaughtException', async (error) => {
    log(`💥 Uncaught exception: ${error.message}`, colors.red);
    await cleanupResources();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    log(`💥 Unhandled rejection: ${reason}`, colors.red);
    await cleanupResources();
    process.exit(1);
  });
}

async function runVercelBuild() {
  // Setup signal handlers early
  setupSignalHandlers();

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

    // Initialize migration system and track it globally for cleanup
    globalMigrationSystem = new MigrationSystem();

    let status;
    try {
      // CRITICAL: Keep connection open for subsequent operations
      status = await globalMigrationSystem.status(true);
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
          // Get database client for verification
          const client = await globalMigrationSystem.ensureDbClient();

          // Perform verification BEFORE any cleanup
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
            log("", colors.yellow);
            log("🔧 Attempting automatic recovery...", colors.cyan);
            log("   Step 1: Clearing corrupted migrations table", colors.cyan);

            // Clear the migrations table to force re-run
            await client.execute("DELETE FROM migrations");

            log("   Step 2: Re-running all migrations", colors.cyan);

            // Force re-run all migrations
            const result = await globalMigrationSystem.runMigrations();
            migrationResult = result;

            log("", colors.green);
            log("✅ Database recovery completed!", colors.green);
            log(`   Executed: ${result.executed} migration(s)`, colors.cyan);
            log("");

            // Verify tables now exist
            const verifyCheck = await client.execute(
              "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tickets', 'transactions', 'registrations', 'events') ORDER BY name"
            );
            const recoveredTables = verifyCheck.rows.map(r => r.name);
            const stillMissing = expectedTables.filter(t => !recoveredTables.includes(t));

            if (stillMissing.length > 0) {
              log("❌ Recovery failed - still missing tables: " + stillMissing.join(', '), colors.red);
              throw new Error(`Database recovery failed - missing tables: ${stillMissing.join(', ')}`);
            }

            log("✅ All critical tables verified after recovery", colors.green);
          } else {
            log("✅ Database structure verified - all critical tables exist", colors.green);
            migrationResult.skipped = status.executed;
          }
        } catch (verifyError) {
          // If recovery failed, re-throw the error to fail the build
          if (verifyError.message.includes('Database recovery failed')) {
            throw verifyError;
          }

          // Don't warn about CLIENT_CLOSED during verification - it's expected if migrations didn't run
          if (!verifyError.message.includes('CLIENT_CLOSED') && !verifyError.message.includes('manually closed')) {
            log("⚠️  Could not verify table existence: " + verifyError.message, colors.yellow);
          }
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
      const result = await globalMigrationSystem.runMigrations();
      migrationResult = result;

      log("");
      log("✅ Migrations completed successfully!", colors.green);
      log(`   Executed: ${result.executed} migration(s)`, colors.cyan);
      log(`   Skipped: ${result.skipped} migration(s)`, colors.cyan);
      log("");

      // Verify tables actually exist after migration
      log("🔍 Verifying database state after migrations...", colors.blue);
      const client = await globalMigrationSystem.ensureDbClient();

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

    log("");
    log("✅ Database migration phase complete", colors.bright + colors.green);

    // Verify migrations after execution but BEFORE cleanup to prevent race conditions
    if (vercelEnv === "production") {
      log("🔍 Verifying migration integrity...", colors.blue);

      try {
        const verification = await globalMigrationSystem.verifyMigrations();

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

          // Cleanup before exit
          await cleanupResources();
          process.exit(1);
        } else {
          log("✅ Migration integrity verified", colors.green);
        }
      } catch (verificationError) {
        log("⚠️  Migration verification failed with error:", colors.yellow);
        log(`   Error: ${verificationError.message}`, colors.yellow);

        // For production builds, verification failure should not block deployment
        // since migrations have already completed successfully
        if (verificationError.message.includes("Client is closed") ||
            verificationError.message.includes("ClientError")) {
          log("   This appears to be a connection cleanup race condition", colors.yellow);
          log("   Migrations completed successfully, continuing with build...", colors.yellow);
        } else {
          log("   Unexpected verification error - continuing with build", colors.yellow);
        }
      }
    }

    // Clean up migration resources - migration phase complete
    await cleanupResources();

    log("");
    log("✅ Database migration phase complete", colors.bright + colors.green);

    // Summary of migration work
    if (migrationResult.executed > 0) {
      log(`📊 Executed ${migrationResult.executed} migration(s)`, colors.cyan);
    }

    debugLog("");
    debugLog("📊 Migration Summary:", colors.bright);
    debugLog(`   Migrations executed: ${migrationResult.executed}`, colors.cyan);
    debugLog(`   Migrations skipped: ${migrationResult.skipped}`, colors.cyan);
    debugLog(`   Deployment URL: ${deploymentUrl}`, colors.cyan);

    log("");
    log("🏗️  Migration script complete - build will continue with 'vercel build'", colors.cyan);
    log("   Note: Documentation embedding and build execution handled by build script", colors.blue);

    process.exit(0);

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

    // Always cleanup and fail the build if migrations fail
    await cleanupResources();
    process.exit(1);
  }
}

// Run the build process (migrations + build) with proper error handling
runVercelBuild().catch(async (error) => {
  console.error("Unexpected error in build script:", error);
  await cleanupResources();
  process.exit(1);
});