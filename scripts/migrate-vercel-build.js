#!/usr/bin/env node
/**
 * Vercel Build Migration Script
 * Automatically runs database migrations during Vercel build process
 * Only executes in Vercel production and preview environments
 */

import { MigrationSystem } from "./migrate.js";

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

async function runVercelMigrations() {
  // Environment detection
  const isVercel = process.env.VERCEL === "1";
  const vercelEnv = process.env.VERCEL_ENV; // production, preview, or development
  const hasTursoUrl = !!process.env.TURSO_DATABASE_URL;
  const hasTursoToken = !!process.env.TURSO_AUTH_TOKEN;

  log("🔍 Vercel Migration Build Script", colors.bright);
  log(`   Environment: ${vercelEnv || 'unknown'}`, colors.cyan);
  log(`   Is Vercel: ${isVercel}`, colors.cyan);
  log(`   Has Turso URL: ${hasTursoUrl}`, colors.cyan);
  log(`   Has Turso Token: ${hasTursoToken}`, colors.cyan);
  log(`   Branch: ${process.env.VERCEL_GIT_COMMIT_REF || 'unknown'}`, colors.cyan);
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
      process.exit(0);
    }

    log(`📋 Found ${status.pending} pending migration(s)`, colors.yellow);
    log("");

    // Run the migrations
    const result = await migration.runMigrations();

    log("");
    log("✅ Migrations completed successfully!", colors.green);
    log(`   Executed: ${result.executed} migration(s)`, colors.cyan);
    log(`   Skipped: ${result.skipped} migration(s)`, colors.cyan);
    log("");

    // Verify migrations after execution
    if (vercelEnv === "production") {
      log("🔍 Verifying migration integrity...", colors.blue);
      const verification = await migration.verifyMigrations();

      if (verification.checksumErrors > 0 || verification.missingFiles.length > 0) {
        log("⚠️  WARNING: Migration verification found issues:", colors.yellow);
        if (verification.checksumErrors > 0) {
          log(`   - Checksum errors: ${verification.checksumErrors}`, colors.yellow);
        }
        if (verification.missingFiles.length > 0) {
          log(`   - Missing files: ${verification.missingFiles.join(", ")}`, colors.yellow);
        }
      } else {
        log("✅ Migration integrity verified", colors.green);
      }
    }

    log("");
    log("🎉 Database migration phase complete - proceeding with build", colors.bright + colors.green);
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

    // Always fail the build if migrations fail
    process.exit(1);
  }
}

// Run migrations
runVercelMigrations().catch(error => {
  console.error("Unexpected error in migration script:", error);
  process.exit(1);
});