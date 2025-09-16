#!/usr/bin/env node
/**
 * Vercel Build Script with Migrations
 * Runs database migrations followed by the build process
 * Provides comprehensive status information throughout
 * Only executes in Vercel production and preview environments
 */

import { MigrationSystem } from "./migrate.js";
import { execSync } from "child_process";

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

  logSection("VERCEL BUILD PROCESS", "🚀");

  log("📋 Build Environment Information:", colors.bright);
  log(`   Environment Type: ${vercelEnv || 'unknown'}`, colors.cyan);
  log(`   Is Vercel: ${isVercel ? 'Yes' : 'No'}`, colors.cyan);
  log(`   Git Branch: ${gitBranch}`, colors.cyan);
  log(`   Git Commit: ${gitCommit.substring(0, 8)}`, colors.cyan);
  log(`   Deployment URL: ${deploymentUrl}`, colors.cyan);
  log("");

  log("🔐 Database Configuration:", colors.bright);
  log(`   Turso URL Configured: ${hasTursoUrl ? '✅ Yes' : '❌ No'}`, hasTursoUrl ? colors.green : colors.red);
  log(`   Turso Token Configured: ${hasTursoToken ? '✅ Yes' : '❌ No'}`, hasTursoToken ? colors.green : colors.red);
  log("");

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

    // Fail the build if we're in production
    if (vercelEnv === "production") {
      process.exit(1);
    }

    // For preview deployments, warn but continue (allows testing without DB)
    log("⚠️  WARNING: Continuing build without migrations (preview environment)", colors.yellow);
    process.exit(0);
  }

  try {
    logSection("DATABASE MIGRATION PHASE", "🗄️");

    log("🚀 Starting database migrations for Vercel deployment...", colors.green);
    log("");

    const migration = new MigrationSystem();

    // First check migration status
    log("📊 Checking migration status...", colors.blue);
    const status = await migration.status();

    if (status.pending === 0) {
      log("✨ Database is up to date - no migrations to run", colors.green);
      log(`   Total migrations: ${status.total}`, colors.cyan);
      log(`   Executed migrations: ${status.executed}`, colors.cyan);
      migrationResult.skipped = status.executed;
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

      // Summary
      logSection("BUILD SUMMARY", "📊");
      log("✅ Database Migrations: Success", colors.green);
      log(`   • ${migrationResult.executed} migrations executed`, colors.cyan);
      log(`   • ${migrationResult.skipped} migrations skipped`, colors.cyan);
      log("");
      log("✅ Build Process: Success", colors.green);
      log("");
      log(`🎉 Deployment ready for: ${deploymentUrl}`, colors.bright + colors.green);

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