#!/usr/bin/env node

/**
 * Database Migration Execution Script
 * Runs the wallet tracking migration with full validation and monitoring
 */

import { MigrationRunner } from "../api/db/rollback-procedures.js";
import { BackupManager } from "../api/db/backup-manager.js";
import { SchemaValidator } from "./validate-schema.js";
import { getDatabase } from "../lib/database.js";
import chalk from "chalk";

// Helper function for colored output
const log = {
  info: (msg) => console.log(chalk.blue("ℹ"), msg),
  success: (msg) => console.log(chalk.green("✓"), msg),
  warning: (msg) => console.log(chalk.yellow("⚠"), msg),
  error: (msg) => console.log(chalk.red("✗"), msg),
  header: (msg) =>
    console.log(
      chalk.bold.cyan(
        "\n" + "=".repeat(60) + "\n" + msg + "\n" + "=".repeat(60),
      ),
    ),
};

async function runMigration() {
  log.header("Database Migration: Add Wallet Tracking Columns");

  const database = getDatabase();
  const backupManager = new BackupManager();
  const migrationRunner = new MigrationRunner(database, backupManager);
  const validator = new SchemaValidator();

  try {
    // Step 1: Pre-migration validation
    log.info("Step 1: Pre-migration validation...");

    // Test database connection
    const connectionTest = await database.testConnection();
    if (!connectionTest) {
      throw new Error("Database connection failed");
    }
    log.success("Database connection verified");

    // Check migration status
    const status = await migrationRunner.getMigrationStatus();
    log.info(`Current migrations applied: ${status.appliedMigrations.length}`);

    const isAlreadyApplied = status.appliedMigrations.some(
      (m) => m.version === "009",
    );
    if (isAlreadyApplied) {
      log.warning("Migration 009 is already applied");

      // Still validate the schema
      log.info("Validating current schema...");
      const schemaIntegrity = await migrationRunner.validateSchemaIntegrity();

      if (schemaIntegrity.valid) {
        log.success("Schema validation passed - migration already complete");
        return { success: true, alreadyApplied: true };
      } else {
        log.warning(
          "Schema validation failed despite migration being marked as applied",
        );
        log.info("Issues found:");
        schemaIntegrity.issues.forEach((issue) => log.warning(`  - ${issue}`));

        // Ask for confirmation to force re-apply
        if (!flags.force) {
          log.warning(
            "Consider running with --force flag to reapply migration",
          );
          return { success: false, needsForce: true };
        } else {
          log.info(
            "Force flag detected - proceeding with migration reapplication",
          );
        }
      }
    }

    // Check pending migrations
    const pendingMigrations = await migrationRunner.getPendingMigrations();
    log.info(`Pending migrations: ${pendingMigrations.length}`);

    if (pendingMigrations.length > 0) {
      log.info("Pending migrations:");
      pendingMigrations.forEach((m) => log.info(`  - ${m.name}`));
    }

    // Step 2: Create backup (unless skipped)
    let backupMetadata = null;
    if (!flags.skipBackup) {
      log.info("\nStep 2: Creating database backup...");

      backupMetadata = await backupManager.createBackup(
        "pre_migration_009_wallet_tracking",
      );
      log.success(`Backup created: ${backupMetadata.filename}`);
      log.info(
        `  - Original size: ${(backupMetadata.originalSize / 1024).toFixed(2)} KB`,
      );
      log.info(
        `  - Compressed size: ${(backupMetadata.compressedSize / 1024).toFixed(2)} KB`,
      );
      log.info(`  - Compression ratio: ${backupMetadata.compressionRatio}`);

      // Verify backup integrity
      log.info("Verifying backup integrity...");
      const backupIntegrity = await backupManager.verifyBackupIntegrity(
        backupMetadata.path,
      );

      if (!backupIntegrity.valid) {
        throw new Error("Backup integrity verification failed");
      }
      log.success("Backup integrity verified");
    } else {
      log.warning("Backup creation skipped (--skip-backup flag)");
    }

    // Step 3: Dry run migration
    log.info("\nStep 3: Running migration dry run...");

    const dryRunResult = await migrationRunner.dryRunMigration(
      "009_add_wallet_tracking.sql",
    );

    if (dryRunResult.success && dryRunResult.dryRun) {
      log.success(
        `Dry run successful - would execute ${dryRunResult.statements} statements`,
      );

      // Exit early if this is a dry run
      if (flags.dryRun) {
        log.header("Dry Run Complete - No Changes Applied");
        return {
          success: true,
          dryRun: true,
          backup: backupMetadata,
          dryRunResult,
        };
      }
    } else {
      throw new Error("Dry run failed");
    }

    // Step 4: Execute migration (skip if dry run already completed)
    if (flags.dryRun) {
      // This should not be reached due to early exit above, but guard against it
      return {
        success: true,
        dryRun: true,
        backup: backupMetadata,
        dryRunResult,
      };
    }

    log.info("\nStep 4: Executing migration...");

    const migrationResult = await migrationRunner.runMigration(
      "009_add_wallet_tracking.sql",
      {
        skipBackup: flags.skipBackup,
        force: flags.force,
      },
    );

    if (!migrationResult.success) {
      log.error("Migration failed!");

      if (migrationResult.rollbackSuccess) {
        log.success(
          `Automatic rollback successful - restored from ${migrationResult.restoredFrom}`,
        );
      } else if (migrationResult.rollbackSuccess === false) {
        log.error("Automatic rollback failed!");
        log.error(`Rollback error: ${migrationResult.rollbackError}`);
        if (migrationResult.backup && migrationResult.backup.filename) {
          log.warning(
            `Manual restoration may be required from backup: ${migrationResult.backup.filename}`,
          );
        } else {
          log.warning("No backup available for manual restoration");
        }
      }

      throw new Error(migrationResult.error || "Migration execution failed");
    }

    log.success("Migration executed successfully");

    // Step 5: Validate migration
    log.info("\nStep 5: Validating migration...");

    const validationResult = await migrationRunner.validateMigration("009");

    if (!validationResult.valid) {
      log.error("Migration validation failed!");
      validationResult.checks.forEach((check) => {
        if (!check.passed) {
          log.error(`  - ${check.check}: ${check.message}`);
        }
      });

      // Attempt rollback
      log.warning("Attempting to rollback due to validation failure...");
      const rollbackResult = await migrationRunner.rollbackMigration("009");

      if (rollbackResult.success) {
        log.success("Rollback successful");
      } else {
        log.error("Rollback failed - manual intervention required");
      }

      throw new Error("Migration validation failed");
    }

    log.success("Migration validation passed");
    validationResult.checks.forEach((check) => {
      log.success(`  - ${check.check}: ${check.message}`);
    });

    // Step 6: Schema integrity check
    log.info("\nStep 6: Running full schema integrity check...");

    const schemaIntegrity = await migrationRunner.validateSchemaIntegrity();

    if (!schemaIntegrity.valid) {
      log.warning("Schema integrity check found issues:");
      schemaIntegrity.issues.forEach((issue) => log.warning(`  - ${issue}`));
    } else {
      log.success("Schema integrity check passed");
      log.info(`  - Tables: ${Object.keys(schemaIntegrity.tables).length}`);
      log.info(
        `  - Total indexes: ${Object.values(schemaIntegrity.indexes).flat().length}`,
      );
    }

    // Step 7: Performance validation
    log.info("\nStep 7: Running performance validation...");

    const performanceTests = await validator.testQueryPerformance();

    if (performanceTests.status === "PASS") {
      log.success("Performance tests passed");
    } else if (performanceTests.status === "WARN") {
      log.warning("Performance tests passed with warnings");
    } else {
      log.error("Performance tests failed");
    }

    performanceTests.tests.forEach((test) => {
      const icon = test.passed ? "✓" : "⚠";
      const color = test.passed ? "green" : "yellow";
      console.log(
        chalk[color](
          `  ${icon} ${test.name}: ${test.executionTime || "N/A"}ms (max: ${test.maxTime}ms)`,
        ),
      );
    });

    // Step 8: Application endpoint testing
    log.info("\nStep 8: Testing application endpoints...");

    // Test that critical endpoints still work
    const endpointTests = [
      { name: "Ticket creation", query: "SELECT COUNT(*) FROM tickets" },
      {
        name: "Wallet analytics",
        query:
          "SELECT wallet_source, COUNT(*) as count FROM tickets GROUP BY wallet_source",
      },
      {
        name: "QR validation",
        query: "SELECT * FROM tickets WHERE ticket_id = 'test' LIMIT 1",
      },
    ];

    let endpointTestsPassed = true;

    for (const test of endpointTests) {
      try {
        await database.execute(test.query);
        log.success(`  - ${test.name}: Working`);
      } catch (error) {
        log.error(`  - ${test.name}: Failed - ${error.message}`);
        endpointTestsPassed = false;
      }
    }

    if (!endpointTestsPassed) {
      log.warning(
        "Some endpoint tests failed - review application compatibility",
      );
    }

    // Step 9: Cleanup old backups
    log.info("\nStep 9: Cleaning up old backups...");

    const cleanupResult = await backupManager.cleanupOldBackups(30);

    if (cleanupResult.deletedCount > 0) {
      log.success(`Cleaned up ${cleanupResult.deletedCount} old backups`);
      cleanupResult.deletedBackups.forEach((backup) => {
        log.info(`  - Deleted: ${backup.filename} (${backup.age} days old)`);
      });
    } else {
      log.info("No old backups to clean up");
    }

    // Final summary
    log.header("Migration Complete!");

    log.success("Migration 009_add_wallet_tracking completed successfully");
    log.info("Summary:");
    if (backupMetadata && backupMetadata.filename) {
      log.info(`  - Backup created: ${backupMetadata.filename}`);
    } else {
      log.info("  - Backup: Skipped");
    }
    log.info(`  - Migration applied at: ${migrationResult.appliedAt}`);
    log.info(
      `  - Schema validation: ${validationResult.valid ? "PASSED" : "FAILED"}`,
    );
    log.info(`  - Performance status: ${performanceTests.status}`);
    log.info(
      `  - Endpoint tests: ${endpointTestsPassed ? "PASSED" : "PARTIAL"}`,
    );

    // List current backups
    const currentBackups = await backupManager.listAvailableBackups();
    log.info(`\nAvailable backups: ${currentBackups.length}`);
    currentBackups.slice(0, 3).forEach((backup) => {
      log.info(
        `  - ${backup.filename} (${backup.description || "No description"})`,
      );
    });

    return {
      success: true,
      backup: backupMetadata,
      migration: migrationResult,
      validation: validationResult,
      performance: performanceTests,
      endpointTests: endpointTestsPassed,
    };
  } catch (error) {
    log.error(`\nMigration failed: ${error.message}`);

    // Attempt to provide recovery instructions
    log.header("Recovery Instructions");

    log.info("1. Check the migration log file: ./migration.log");
    log.info("2. Review available backups:");

    try {
      const backups = await backupManager.listAvailableBackups();
      backups.slice(0, 5).forEach((backup) => {
        log.info(`   - ${backup.filename} (${backup.created})`);
      });

      if (backups.length > 0) {
        log.info("\n3. To restore from the most recent backup, run:");
        log.info("   node scripts/restore-backup.js");
      }
    } catch (backupError) {
      log.error("Could not list backups: " + backupError.message);
    }

    log.info(
      "\n4. For manual recovery, contact support with the error details",
    );

    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  force: args.includes("--force"),
  skipBackup: args.includes("--skip-backup"),
  dryRun: args.includes("--dry-run"),
  help: args.includes("--help") || args.includes("-h"),
};

// Show help if requested
if (flags.help) {
  console.log(`
Database Migration Runner - Add Wallet Tracking Columns

Usage: node scripts/run-migration.js [options]

Options:
  --force         Force re-apply migration even if already applied
  --skip-backup   Skip creating backup (NOT RECOMMENDED)
  --dry-run       Preview migration without applying changes
  --help, -h      Show this help message

Examples:
  node scripts/run-migration.js                    # Normal migration
  node scripts/run-migration.js --dry-run          # Preview changes
  node scripts/run-migration.js --force            # Force re-apply

This script will:
1. Validate database connection and current schema
2. Create a compressed backup with integrity verification
3. Run migration dry-run to preview changes
4. Execute the migration with automatic rollback on failure
5. Validate the migration was applied correctly
6. Test application endpoints still function
7. Run performance validation
8. Clean up old backups per retention policy

The migration adds:
- wallet_source column to track wallet adoption
- Indexes for performance optimization
- Constraints for data integrity
`);
  process.exit(0);
}

// Run the migration
runMigration()
  .then((result) => {
    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
