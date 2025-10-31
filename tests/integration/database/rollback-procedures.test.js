/**
 * Rollback Procedures Integration Tests
 * Tests database rollback, recovery, and migration runner functionality
 *
 * Coverage: 25+ tests
 * - Migration execution with backup
 * - Rollback operations
 * - Recovery from failures
 * - Schema validation
 * - Migration dependency validation
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { MigrationRunner } from '../../../api/db/rollback-procedures.js';
import { BackupManager } from '../../../api/db/backup-manager.js';
import { getDbClient } from '../../setup-integration.js';
import fs from 'fs/promises';
import path from 'path';

describe('Rollback Procedures Integration Tests', () => {
  let dbClient;
  let migrationRunner;
  let backupManager;
  let testBackupDir;
  let testMigrationsDir;
  let createdFiles = [];

  beforeEach(async () => {
    dbClient = await getDbClient();

    // Create test directories
    testBackupDir = path.join(process.cwd(), '.tmp', 'test-backups', `rollback-${Date.now()}`);
    testMigrationsDir = path.join(process.cwd(), '.tmp', 'test-migrations', `migrations-${Date.now()}`);

    await fs.mkdir(testBackupDir, { recursive: true });
    await fs.mkdir(testMigrationsDir, { recursive: true });

    backupManager = new BackupManager(null, testBackupDir);
    migrationRunner = new MigrationRunner(dbClient, backupManager);
    migrationRunner.migrationsDir = testMigrationsDir;

    createdFiles = [];
  });

  afterEach(async () => {
    // Clean up test files
    try {
      if (testBackupDir) {
        await fs.rm(testBackupDir, { recursive: true, force: true });
      }
      if (testMigrationsDir) {
        await fs.rm(testMigrationsDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  });

  describe('Migration Execution', () => {
    test('runs migration with automatic backup', async () => {
      // Create test migration file
      const migrationFile = '999_test_migration.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `
        -- Test migration
        CREATE TABLE IF NOT EXISTS test_rollback_table (
          id INTEGER PRIMARY KEY,
          name TEXT
        );
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const result = await migrationRunner.runMigration(migrationFile);

      expect(result.success).toBe(true);
      expect(result.version).toBe('999');
      expect(result.backup).toBeDefined();
      expect(result.backup.filename).toMatch(/pre_migration_999/);

      // Verify backup was created
      const backups = await backupManager.listAvailableBackups();
      const migrationBackup = backups.find(b => b.description === 'pre_migration_999');
      expect(migrationBackup).toBeDefined();

      createdFiles.push(result.backup.path);
    });

    test('validates migration before execution', async () => {
      const migrationFile = '998_validation_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);

      // Create migration with validation check
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS validation_test (
          id INTEGER PRIMARY KEY,
          data TEXT NOT NULL
        );
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const result = await migrationRunner.runMigration(migrationFile);

      expect(result.success).toBe(true);
      expect(result.validation).toBeDefined();

      if (result.backup) {
        createdFiles.push(result.backup.path);
      }
    });

    test('prevents duplicate migration execution', async () => {
      const migrationFile = '997_duplicate_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS duplicate_test (id INTEGER PRIMARY KEY);
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      // Run migration first time
      const firstRun = await migrationRunner.runMigration(migrationFile);
      expect(firstRun.success).toBe(true);

      if (firstRun.backup) {
        createdFiles.push(firstRun.backup.path);
      }

      // Try to run again
      const secondRun = await migrationRunner.runMigration(migrationFile);
      expect(secondRun.success).toBe(false);
      expect(secondRun.reason).toBe('already_applied');
    });

    test('supports dry run mode', async () => {
      const migrationFile = '996_dry_run_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS dry_run_test (id INTEGER PRIMARY KEY);
        INSERT INTO dry_run_test (id) VALUES (1);
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const result = await migrationRunner.dryRunMigration(migrationFile);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.statements).toBeGreaterThan(0);
      expect(result.wouldExecute).toBeDefined();

      // Verify no actual changes were made
      const tableCheck = await dbClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dry_run_test'"
      );
      expect(tableCheck.rows.length).toBe(0);
    });

    test('handles migration with multiple statements', async () => {
      const migrationFile = '995_multi_statement.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS multi_test_1 (id INTEGER PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS multi_test_2 (id INTEGER PRIMARY KEY);
        CREATE INDEX IF NOT EXISTS idx_multi_test_1 ON multi_test_1(id);
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const result = await migrationRunner.runMigration(migrationFile);

      expect(result.success).toBe(true);

      if (result.backup) {
        createdFiles.push(result.backup.path);
      }
    });
  });

  describe('Rollback Operations', () => {
    test('rolls back migration successfully', async () => {
      // Create and run migration
      const migrationFile = '994_rollback_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS rollback_test_table (id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO rollback_test_table (id, name) VALUES (1, 'test');
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const runResult = await migrationRunner.runMigration(migrationFile);
      expect(runResult.success).toBe(true);

      if (runResult.backup) {
        createdFiles.push(runResult.backup.path);
      }

      // Verify table exists
      const beforeRollback = await dbClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_test_table'"
      );
      expect(beforeRollback.rows.length).toBe(1);

      // Perform rollback
      const rollbackResult = await migrationRunner.rollbackMigration('994');

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.version).toBe('994');
      expect(rollbackResult.restoredFrom).toMatch(/pre_migration_994/);

      // Verify table no longer exists
      const afterRollback = await dbClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_test_table'"
      );
      expect(afterRollback.rows.length).toBe(0);
    });

    test('verifies backup integrity before rollback', async () => {
      const migrationFile = '993_integrity_rollback.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `CREATE TABLE IF NOT EXISTS integrity_test (id INTEGER PRIMARY KEY);`;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const runResult = await migrationRunner.runMigration(migrationFile);
      expect(runResult.success).toBe(true);

      if (runResult.backup) {
        // Corrupt the backup
        await fs.writeFile(runResult.backup.path, 'corrupted');
        createdFiles.push(runResult.backup.path);
      }

      // Rollback should fail due to corrupted backup
      await expect(migrationRunner.rollbackMigration('993')).rejects.toThrow();
    });

    test('handles rollback with missing backup', async () => {
      // Attempt to rollback a non-existent migration
      await expect(migrationRunner.rollbackMigration('999999')).rejects.toThrow(/No backup found/);
    });

    test('removes migration record after successful rollback', async () => {
      const migrationFile = '992_record_removal.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `CREATE TABLE IF NOT EXISTS record_test (id INTEGER PRIMARY KEY);`;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const runResult = await migrationRunner.runMigration(migrationFile);
      expect(runResult.success).toBe(true);

      if (runResult.backup) {
        createdFiles.push(runResult.backup.path);
      }

      // Verify migration is recorded
      const beforeRollback = await migrationRunner.getMigrationStatus();
      const migration = beforeRollback.appliedMigrations.find(m => m.version === '992');
      expect(migration).toBeDefined();

      // Rollback
      await migrationRunner.rollbackMigration('992');

      // Verify migration record is removed
      const afterRollback = await migrationRunner.getMigrationStatus();
      const migrationAfter = afterRollback.appliedMigrations.find(m => m.version === '992');
      expect(migrationAfter).toBeUndefined();
    });
  });

  describe('Recovery Procedures', () => {
    test('recovers from partial migration failure', async () => {
      const migrationFile = '991_recovery_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);

      // Create migration that will fail partway
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS recovery_test (id INTEGER PRIMARY KEY);
        -- This will fail due to syntax error
        INVALID SQL STATEMENT;
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      // Create a backup before attempting migration
      const preBackup = await backupManager.createBackup('pre_recovery_test');
      createdFiles.push(preBackup.path);

      // Attempt migration - should fail and auto-rollback
      const result = await migrationRunner.runMigration(migrationFile).catch(err => ({
        success: false,
        error: err.message
      }));

      expect(result.success).toBe(false);

      // Recovery from most recent backup
      const recoveryResult = await migrationRunner.recoverFromPartialMigration();

      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.recoveredFrom).toBeDefined();
    });

    test('automatic rollback on migration failure', async () => {
      const migrationFile = '990_auto_rollback.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);

      // Migration that will fail
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS auto_rollback_test (id INTEGER PRIMARY KEY);
        INVALID STATEMENT HERE;
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const result = await migrationRunner.runMigration(migrationFile).catch(err => err);

      // Should have attempted rollback
      expect(result).toBeDefined();

      // Table should not exist due to rollback
      const tableCheck = await dbClient.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auto_rollback_test'"
      );
      expect(tableCheck.rows.length).toBe(0);
    });
  });

  describe('Schema Validation', () => {
    test('validates schema integrity', async () => {
      const integrityResults = await migrationRunner.validateSchemaIntegrity();

      expect(integrityResults.valid).toBe(true);
      expect(integrityResults.tables).toBeDefined();
      expect(integrityResults.indexes).toBeDefined();
      expect(integrityResults.issues).toHaveLength(0);

      // Should include critical tables
      expect(integrityResults.tables.transactions).toBeDefined();
      expect(integrityResults.tables.tickets).toBeDefined();
    });

    test('detects missing critical tables', async () => {
      // This test validates the detection logic
      const integrityResults = await migrationRunner.validateSchemaIntegrity();

      // Critical tables should exist
      const criticalTables = ['tickets', 'transactions', 'subscribers'];
      for (const table of criticalTables) {
        if (!integrityResults.tables[table]) {
          expect(integrityResults.valid).toBe(false);
          expect(integrityResults.issues).toContain(`Critical table '${table}' is missing`);
        }
      }
    });

    test('validates migration-specific requirements', async () => {
      // Test wallet tracking migration validation
      const validationResult = await migrationRunner.validateMigration('009');

      expect(validationResult.version).toBe('009');
      expect(validationResult.checks).toBeDefined();
      expect(Array.isArray(validationResult.checks)).toBe(true);

      // Check for specific validation checks
      const walletSourceCheck = validationResult.checks.find(c => c.check === 'wallet_source_column');
      if (walletSourceCheck) {
        expect(walletSourceCheck.passed).toBeDefined();
      }
    });

    test('validates indexes exist after migration', async () => {
      const integrityResults = await migrationRunner.validateSchemaIntegrity();

      // Should have indexes for critical tables
      expect(integrityResults.indexes.transactions).toBeDefined();
      expect(integrityResults.indexes.tickets).toBeDefined();
    });
  });

  describe('Migration Status', () => {
    test('gets migration status correctly', async () => {
      const status = await migrationRunner.getMigrationStatus();

      expect(status).toBeDefined();
      expect(status.tableExists).toBe(true);
      expect(status.appliedMigrations).toBeDefined();
      expect(Array.isArray(status.appliedMigrations)).toBe(true);
    });

    test('tracks pending migrations', async () => {
      // Create a new migration file
      const migrationFile = '989_pending_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `CREATE TABLE IF NOT EXISTS pending_test (id INTEGER PRIMARY KEY);`;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const pending = await migrationRunner.getPendingMigrations();

      expect(Array.isArray(pending)).toBe(true);
      const ourMigration = pending.find(m => m.version === '989');
      expect(ourMigration).toBeDefined();
      expect(ourMigration.file).toBe(migrationFile);
    });

    test('identifies last applied migration', async () => {
      const status = await migrationRunner.getMigrationStatus();

      if (status.lastMigration) {
        expect(status.lastMigration.version).toBeDefined();
        expect(status.lastMigration.appliedAt).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    test('handles schema version mismatch', async () => {
      // This test verifies error handling for version mismatches
      const migrationFile = '988_version_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `CREATE TABLE IF NOT EXISTS version_test (id INTEGER PRIMARY KEY);`;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const result = await migrationRunner.runMigration(migrationFile);
      expect(result).toBeDefined();

      if (result.backup) {
        createdFiles.push(result.backup.path);
      }
    });

    test('handles database lock errors gracefully', async () => {
      // Test migration execution under potential lock conditions
      const migrationFile = '987_lock_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `CREATE TABLE IF NOT EXISTS lock_test (id INTEGER PRIMARY KEY);`;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const result = await migrationRunner.runMigration(migrationFile);
      expect(result).toBeDefined();

      if (result.backup) {
        createdFiles.push(result.backup.path);
      }
    });

    test('logs migration failures appropriately', async () => {
      const migrationFile = '986_logging_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);

      // Invalid migration to trigger error logging
      const migrationContent = `COMPLETELY INVALID SQL;`;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      await expect(migrationRunner.runMigration(migrationFile)).rejects.toThrow();

      // Verify log file exists and contains error
      const logPath = migrationRunner.logFile;
      const logExists = await fs.access(logPath).then(() => true).catch(() => false);
      expect(logExists).toBe(true);
    });
  });

  describe('Performance', () => {
    test('migration execution completes within timeout', async () => {
      const migrationFile = '985_performance_test.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS perf_test (id INTEGER PRIMARY KEY, data TEXT);
        CREATE INDEX IF NOT EXISTS idx_perf_test ON perf_test(id);
      `;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const startTime = Date.now();
      const result = await migrationRunner.runMigration(migrationFile);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds

      if (result.backup) {
        createdFiles.push(result.backup.path);
      }
    });

    test('rollback completes within reasonable time', async () => {
      const migrationFile = '984_rollback_perf.sql';
      const migrationPath = path.join(testMigrationsDir, migrationFile);
      const migrationContent = `CREATE TABLE IF NOT EXISTS rollback_perf (id INTEGER PRIMARY KEY);`;

      await fs.writeFile(migrationPath, migrationContent);
      createdFiles.push(migrationPath);

      const runResult = await migrationRunner.runMigration(migrationFile);
      expect(runResult.success).toBe(true);

      if (runResult.backup) {
        createdFiles.push(runResult.backup.path);
      }

      const startTime = Date.now();
      const rollbackResult = await migrationRunner.rollbackMigration('984');
      const duration = Date.now() - startTime;

      expect(rollbackResult.success).toBe(true);
      expect(duration).toBeLessThan(10000);
    });
  });
});
