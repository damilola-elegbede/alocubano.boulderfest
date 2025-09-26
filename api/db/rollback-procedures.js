/**
 * Database Migration Runner with Rollback Procedures
 * Provides safe migration execution with automatic backup and rollback capabilities
 */

import fs from 'fs/promises';
import path from 'path';
import { BackupManager } from './backup-manager.js';
import { getDatabaseClient } from "../../lib/database.js";

class MigrationRunner {
  constructor(database = null, backupManager = null) {
    this.database = database;
    this.backupManager = backupManager || new BackupManager();
    this.migrationsDir = path.resolve(process.cwd(), 'migrations');
    this.logFile = path.resolve(process.cwd(), 'migration.log');
  }

  /**
   * Log migration activity
   */
  async log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;

    console.log(logEntry.trim());

    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Ensure database client is initialized
   */
  async ensureDatabase() {
    if (!this.database) {
      this.database = await getDatabaseClient();
    }
    return this.database;
  }

  /**
   * Get migration status from database
   */
  async getMigrationStatus() {
    try {
      const db = await this.ensureDatabase();
      // Check if schema_migrations table exists
      const tableExists = await db.execute(
        'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'schema_migrations\''
      );

      if (!tableExists.rows || tableExists.rows.length === 0) {
        await this.log('schema_migrations table does not exist', 'WARN');
        return {
          tableExists: false,
          appliedMigrations: [],
          lastMigration: null
        };
      }

      // Get applied migrations
      const migrations = await db.execute(
        'SELECT version, applied_at, description FROM schema_migrations ORDER BY version'
      );

      const appliedMigrations = migrations.rows.map((row) => ({
        version: row.version,
        appliedAt: row.applied_at,
        description: row.description
      }));

      return {
        tableExists: true,
        appliedMigrations,
        lastMigration: appliedMigrations[appliedMigrations.length - 1] || null
      };
    } catch (error) {
      await this.log(
        `Failed to get migration status: ${error.message}`,
        'ERROR'
      );
      throw error;
    }
  }

  /**
   * Parse SQL file and extract statements
   */
  async parseMigrationFile(migrationFile) {
    try {
      const content = await fs.readFile(migrationFile, 'utf8');

      // Remove comments and split by semicolons
      const statements = content
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);

      return statements;
    } catch (error) {
      throw new Error(`Failed to parse migration file: ${error.message}`);
    }
  }

  /**
   * Run migration with automatic backup
   */
  async runMigration(migrationFile, options = {}) {
    const { skipBackup = false, dryRun = false, force = false } = options;

    const migrationPath = path.isAbsolute(migrationFile)
      ? migrationFile
      : path.resolve(this.migrationsDir, migrationFile);

    const migrationName = path.basename(migrationFile);
    const version = migrationName.split('_')[0];

    await this.log(`Starting migration: ${migrationName}`, 'INFO');

    try {
      // Check if migration was already applied
      const status = await this.getMigrationStatus();
      const isApplied = status.appliedMigrations.some(
        (m) => m.version === version
      );

      if (isApplied && !force) {
        await this.log(
          `Migration ${version} already applied. Use force option to reapply.`,
          'WARN'
        );
        return {
          success: false,
          reason: 'already_applied',
          version,
          message: 'Migration already applied'
        };
      }

      // Create backup unless explicitly skipped
      let backupMetadata = null;
      if (!skipBackup && !dryRun) {
        await this.log('Creating backup before migration...', 'INFO');
        backupMetadata = await this.backupManager.createBackup(
          `pre_migration_${version}`
        );
        await this.log(`Backup created: ${backupMetadata.filename}`, 'INFO');
      }

      // Read and parse migration file
      const fileContent = await fs.readFile(migrationPath, 'utf8');

      if (dryRun) {
        await this.log('DRY RUN MODE - No changes will be applied', 'INFO');
        await this.log(
          `Would execute migration from: ${migrationPath}`,
          'INFO'
        );

        // Parse statements for dry run analysis
        const statements = fileContent
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s && !s.startsWith('--'));

        return {
          success: true,
          dryRun: true,
          version,
          statements: statements.length,
          wouldExecute: statements.map(
            (s) => s.substring(0, 50) + (s.length > 50 ? '...' : '')
          )
        };
      }

      // Execute migration
      await this.log('Executing migration statements...', 'INFO');

      try {
        // Parse migration file into atomic statements for better error handling
        const statements = await this.parseMigrationFile(migrationPath);

        if (statements.length === 0) {
          throw new Error('No valid statements found in migration file');
        }

        await this.log(`Executing ${statements.length} statements...`, 'INFO');

        // Execute statements atomically within a transaction
        const db = await this.ensureDatabase();
        const batchStatements = statements.map((sql) => ({ sql, args: [] }));
        await db.batch(batchStatements);

        await this.log(`Migration ${version} completed successfully`, 'INFO');

        // Validate migration
        const validationResult = await this.validateMigration(version);

        return {
          success: true,
          version,
          backup: backupMetadata,
          validation: validationResult,
          appliedAt: new Date().toISOString()
        };
      } catch (error) {
        await this.log(`Migration execution failed: ${error.message}`, 'ERROR');

        // Attempt automatic rollback if backup exists
        if (backupMetadata && !skipBackup) {
          await this.log('Attempting automatic rollback...', 'WARN');
          try {
            await this.backupManager.restoreFromBackup(backupMetadata.path);
            await this.log('Rollback successful', 'INFO');

            return {
              success: false,
              version,
              error: error.message,
              rollbackSuccess: true,
              restoredFrom: backupMetadata.filename
            };
          } catch (rollbackError) {
            await this.log(
              `Rollback failed: ${rollbackError.message}`,
              'ERROR'
            );

            return {
              success: false,
              version,
              error: error.message,
              rollbackSuccess: false,
              rollbackError: rollbackError.message,
              backup: backupMetadata
            };
          }
        }

        throw error;
      }
    } catch (error) {
      await this.log(`Migration failed: ${error.message}`, 'ERROR');
      throw new Error(`Migration ${migrationName} failed: ${error.message}`);
    }
  }

  /**
   * Rollback a specific migration
   */
  async rollbackMigration(migrationVersion) {
    await this.log(
      `Starting rollback for migration ${migrationVersion}`,
      'INFO'
    );

    try {
      // Get available backups
      const backups = await this.backupManager.listAvailableBackups();

      // Find the most recent backup before this migration
      const relevantBackup = backups.find(
        (b) =>
          b.description &&
          b.description.includes(`pre_migration_${migrationVersion}`)
      );

      if (!relevantBackup) {
        throw new Error(`No backup found for migration ${migrationVersion}`);
      }

      // Verify backup integrity
      await this.log('Verifying backup integrity...', 'INFO');
      const integrity = await this.backupManager.verifyBackupIntegrity(
        relevantBackup.path
      );

      if (!integrity.valid) {
        throw new Error('Backup integrity check failed');
      }

      // Restore from backup
      await this.log(
        `Restoring from backup: ${relevantBackup.filename}`,
        'INFO'
      );
      const restoreResult = await this.backupManager.restoreFromBackup(
        relevantBackup.path
      );

      // Remove migration record
      const db = await this.ensureDatabase();
      await db.execute(
        'DELETE FROM schema_migrations WHERE version = ?',
        [migrationVersion]
      );

      await this.log(
        `Rollback completed for migration ${migrationVersion}`,
        'INFO'
      );

      return {
        success: true,
        version: migrationVersion,
        restoredFrom: relevantBackup.filename,
        restoredTables: restoreResult.restoredTables,
        restoredRows: restoreResult.restoredRows
      };
    } catch (error) {
      await this.log(`Rollback failed: ${error.message}`, 'ERROR');
      throw new Error(
        `Rollback failed for migration ${migrationVersion}: ${error.message}`
      );
    }
  }

  /**
   * Validate that a migration was applied correctly
   */
  async validateMigration(migrationVersion) {
    await this.log(`Validating migration ${migrationVersion}...`, 'INFO');

    const validationResults = {
      version: migrationVersion,
      valid: true,
      checks: []
    };

    try {
      // Check if migration is recorded
      const status = await this.getMigrationStatus();
      const isRecorded = status.appliedMigrations.some(
        (m) => m.version === migrationVersion
      );

      validationResults.checks.push({
        check: 'migration_recorded',
        passed: isRecorded,
        message: isRecorded
          ? 'Migration recorded in schema_migrations'
          : 'Migration not recorded'
      });

      // Special validation for migration 009 (wallet tracking)
      if (migrationVersion === '009') {
        const db = await this.ensureDatabase();
        // Check wallet_source column exists using correct PRAGMA syntax
        const walletSourceCheck = await db.execute(
          'SELECT COUNT(*) as count FROM PRAGMA_TABLE_INFO(\'tickets\') WHERE name = \'wallet_source\''
        );

        const walletSourceExists = walletSourceCheck.rows[0].count > 0;

        validationResults.checks.push({
          check: 'wallet_source_column',
          passed: walletSourceExists,
          message: walletSourceExists
            ? 'wallet_source column exists'
            : 'wallet_source column missing'
        });

        // Check indexes exist
        const indexCheck = await db.execute(
          'SELECT name FROM sqlite_master WHERE type = \'index\' AND name LIKE \'idx_tickets_wallet%\''
        );

        const indexCount = indexCheck.rows.length;
        const expectedIndexes = 2; // idx_tickets_wallet_source and idx_tickets_wallet_analytics

        validationResults.checks.push({
          check: 'wallet_indexes',
          passed: indexCount >= expectedIndexes,
          message: `Found ${indexCount} wallet-related indexes (expected at least ${expectedIndexes})`
        });
      }

      // Set overall validation status
      validationResults.valid = validationResults.checks.every((c) => c.passed);

      if (validationResults.valid) {
        await this.log(
          `Migration ${migrationVersion} validated successfully`,
          'INFO'
        );
      } else {
        await this.log(
          `Migration ${migrationVersion} validation failed`,
          'WARN'
        );
      }

      return validationResults;
    } catch (error) {
      await this.log(`Validation failed: ${error.message}`, 'ERROR');
      validationResults.valid = false;
      validationResults.error = error.message;
      return validationResults;
    }
  }

  /**
   * Dry run a migration to preview changes
   */
  async dryRunMigration(migrationFile) {
    return this.runMigration(migrationFile, { dryRun: true });
  }

  /**
   * Recover from a partial migration failure
   */
  async recoverFromPartialMigration() {
    await this.log('Starting recovery from partial migration...', 'WARN');

    try {
      // Get the most recent backup
      const backups = await this.backupManager.listAvailableBackups();

      if (backups.length === 0) {
        throw new Error('No backups available for recovery');
      }

      const mostRecentBackup = backups[0];

      // Verify backup integrity
      await this.log('Verifying backup integrity...', 'INFO');
      const integrity = await this.backupManager.verifyBackupIntegrity(
        mostRecentBackup.path
      );

      if (!integrity.valid) {
        throw new Error('Most recent backup failed integrity check');
      }

      // Restore from backup
      await this.log(
        `Recovering from backup: ${mostRecentBackup.filename}`,
        'INFO'
      );
      const restoreResult = await this.backupManager.restoreFromBackup(
        mostRecentBackup.path
      );

      await this.log('Recovery completed successfully', 'INFO');

      return {
        success: true,
        recoveredFrom: mostRecentBackup.filename,
        restoredTables: restoreResult.restoredTables,
        restoredRows: restoreResult.restoredRows,
        backupDate: mostRecentBackup.created
      };
    } catch (error) {
      await this.log(`Recovery failed: ${error.message}`, 'ERROR');
      throw new Error(
        `Recovery from partial migration failed: ${error.message}`
      );
    }
  }

  /**
   * Validate overall schema integrity
   */
  async validateSchemaIntegrity() {
    await this.log('Validating schema integrity...', 'INFO');

    const integrityResults = {
      valid: true,
      tables: {},
      indexes: {},
      issues: []
    };

    try {
      const db = await this.ensureDatabase();
      // Get all tables
      const tables = await db.execute(
        'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\''
      );

      for (const table of tables.rows) {
        const tableName = table.name;

        // Get table info using correct PRAGMA syntax
        const columns = await db.execute(
          `PRAGMA table_info('${tableName}')`
        );

        // Get row count
        const rowCount = await db.execute(
          `SELECT COUNT(*) as count FROM ${tableName}`
        );

        integrityResults.tables[tableName] = {
          columns: columns.rows.length,
          rows: rowCount.rows[0].count,
          columnNames: columns.rows.map((c) => c.name)
        };
      }

      // Get all indexes
      const indexes = await db.execute(
        'SELECT name, tbl_name FROM sqlite_master WHERE type = \'index\''
      );

      for (const index of indexes.rows) {
        if (!integrityResults.indexes[index.tbl_name]) {
          integrityResults.indexes[index.tbl_name] = [];
        }
        integrityResults.indexes[index.tbl_name].push(index.name);
      }

      // Check for critical tables
      const criticalTables = ['tickets', 'transactions', 'subscribers'];
      for (const tableName of criticalTables) {
        if (!integrityResults.tables[tableName]) {
          integrityResults.valid = false;
          integrityResults.issues.push(
            `Critical table '${tableName}' is missing`
          );
        }
      }

      // Check for wallet tracking columns in tickets table
      if (integrityResults.tables.tickets) {
        const requiredColumns = ['wallet_source', 'qr_access_method'];
        const missingColumns = requiredColumns.filter(
          (col) => !integrityResults.tables.tickets.columnNames.includes(col)
        );

        if (missingColumns.length > 0) {
          integrityResults.valid = false;
          integrityResults.issues.push(
            `Tickets table missing columns: ${missingColumns.join(', ')}`
          );
        }
      }

      await this.log(
        `Schema integrity check completed. Valid: ${integrityResults.valid}`,
        integrityResults.valid ? 'INFO' : 'WARN'
      );

      return integrityResults;
    } catch (error) {
      await this.log(
        `Schema integrity check failed: ${error.message}`,
        'ERROR'
      );
      integrityResults.valid = false;
      integrityResults.error = error.message;
      return integrityResults;
    }
  }

  /**
   * Get list of pending migrations
   */
  async getPendingMigrations() {
    try {
      // Get applied migrations
      const status = await this.getMigrationStatus();
      const appliedVersions = status.appliedMigrations.map((m) => m.version);

      // Get all migration files
      const files = await fs.readdir(path.resolve(this.migrationsDir));
      const migrationFiles = files.filter((f) => f.endsWith('.sql')).sort();

      // Find pending migrations
      const pendingMigrations = migrationFiles
        .map((file) => ({
          file,
          version: file.split('_')[0],
          name: file.replace('.sql', '')
        }))
        .filter((m) => !appliedVersions.includes(m.version));

      return pendingMigrations;
    } catch (error) {
      await this.log(
        `Failed to get pending migrations: ${error.message}`,
        'ERROR'
      );
      throw error;
    }
  }
}

export default MigrationRunner;
export { MigrationRunner };
