/**
 * Migration System Enterprise Integration Tests
 *
 * Tests the integration of the enhanced migration system with the new enterprise
 * database architecture (Connection Manager, State Machine, Circuit Breaker).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseClient } from '../../lib/database.js';
import { getConnectionManager, resetConnectionManager } from '../../lib/connection-manager.js';
import { DatabaseOperationWrapper } from '../../lib/database-circuit-breaker-integration.js';
import { MigrationSystem } from '../../scripts/migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Migration System Enterprise Integration Tests', () => {
  let testDb;
  let connectionManager;
  let dbWrapper;
  let migrationSystem;
  let testMigrationsDir;
  let originalEnv;

  beforeAll(async () => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_TEST_MODE = 'true';
    process.env.KEEP_MIGRATION_CONNECTION = 'true';

    // Create test migrations directory
    testMigrationsDir = path.join(__dirname, '../../.tmp/test-migrations');
    await fs.mkdir(testMigrationsDir, { recursive: true });

    // Initialize test database
    testDb = await getDatabaseClient();
  });

  afterAll(async () => {
    // Restore environment
    process.env = originalEnv;

    // Clean up test migrations directory
    try {
      await fs.rm(testMigrationsDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clean up database
    if (testDb) {
      // Clean up test tables
      try {
        await testDb.execute('DROP TABLE IF EXISTS enterprise_migration_test');
        await testDb.execute('DROP TABLE IF EXISTS migration_performance_test');
        await testDb.execute('DROP TABLE IF EXISTS concurrent_migration_test');
      } catch (error) {
        // Ignore cleanup errors
      }
      await testDb.close();
    }

    if (connectionManager) {
      await connectionManager.gracefulShutdown();
    }
  });

  beforeEach(async () => {
    // Reset connection manager
    await resetConnectionManager();
    connectionManager = getConnectionManager({
      maxConnections: 3,
      acquireTimeout: 10000, // Longer timeout for migrations
      leaseTimeout: 30000
    });

    // Initialize database wrapper
    dbWrapper = new DatabaseOperationWrapper({
      failureThreshold: 5,
      recoveryTimeout: 3000,
      timeoutThreshold: 15000 // Longer timeout for migration operations
    });

    // Initialize migration system with test directory
    migrationSystem = new MigrationSystem();
    migrationSystem.migrationsDir = testMigrationsDir;

    // Clean up any existing test tables and migration records
    try {
      await testDb.execute('DELETE FROM migrations WHERE filename LIKE ?', ['%test%']);
      await testDb.execute('DROP TABLE IF EXISTS enterprise_migration_test');
      await testDb.execute('DROP TABLE IF EXISTS migration_performance_test');
      await testDb.execute('DROP TABLE IF EXISTS concurrent_migration_test');
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clean test migrations directory
    try {
      const files = await fs.readdir(testMigrationsDir);
      for (const file of files) {
        if (file.endsWith('.sql')) {
          await fs.unlink(path.join(testMigrationsDir, file));
        }
      }
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up migration system
    if (migrationSystem) {
      await migrationSystem.cleanup();
    }

    if (connectionManager) {
      await connectionManager.gracefulShutdown();
    }

    if (dbWrapper) {
      dbWrapper.reset();
    }
  });

  describe('Enhanced Migration System Integration', () => {
    it('should execute migrations using enterprise connection pool', async () => {
      // Create test migration
      const migrationContent = `
        -- Test migration using enterprise connection pool
        CREATE TABLE IF NOT EXISTS enterprise_migration_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO enterprise_migration_test (name) VALUES ('test-data-1');
        INSERT INTO enterprise_migration_test (name) VALUES ('test-data-2');
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '001_enterprise_test.sql'),
        migrationContent
      );

      // Track connection pool usage during migration
      const initialStats = connectionManager.getPoolStatistics();

      // Run migrations
      const result = await migrationSystem.runMigrations();

      expect(result.executed).toBe(1);
      expect(result.skipped).toBe(0);

      // Verify migration was recorded
      const executedMigrations = await migrationSystem.getExecutedMigrations();
      expect(executedMigrations).toContain('001_enterprise_test.sql');

      // Verify table was created and data inserted
      const tableResult = await testDb.execute(
        'SELECT COUNT(*) as count FROM enterprise_migration_test'
      );
      expect(tableResult.rows[0].count).toBe(2);

      // Verify connection pool was used efficiently
      const finalStats = connectionManager.getPoolStatistics();
      expect(finalStats.metrics.totalLeasesGranted).toBeGreaterThan(initialStats.metrics.totalLeasesGranted);
      expect(finalStats.pool.activeLeases).toBe(0); // Should be cleaned up
    });

    it('should handle migration failures with circuit breaker protection', async () => {
      // Create migration with intentional error
      const faultyMigrationContent = `
        -- Migration with syntax error
        CREATE TABLE enterprise_migration_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        );

        -- This will cause an error
        INSERT INTO non_existent_table (id) VALUES (1);
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '002_faulty_migration.sql'),
        faultyMigrationContent
      );

      // Track circuit breaker metrics
      const initialMetrics = dbWrapper.getMetrics();

      // Migration should fail but not crash the system
      await expect(migrationSystem.runMigrations()).rejects.toThrow();

      // Circuit breaker should still be healthy (single failure)
      expect(dbWrapper.isHealthy()).toBe(true);

      // Connection pool should be stable
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.pool.activeLeases).toBe(0);
      expect(poolStats.state).not.toBe('SHUTDOWN');

      // Migration should not be recorded as executed
      const executedMigrations = await migrationSystem.getExecutedMigrations();
      expect(executedMigrations).not.toContain('002_faulty_migration.sql');
    });

    it('should support concurrent migration operations safely', async () => {
      // Create multiple test migrations
      const migrations = [];
      for (let i = 1; i <= 3; i++) {
        const migrationContent = `
          CREATE TABLE IF NOT EXISTS concurrent_migration_test_${i} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number INTEGER DEFAULT ${i},
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          INSERT INTO concurrent_migration_test_${i} (table_number) VALUES (${i});
        `;

        const filename = `00${i}_concurrent_test_${i}.sql`;
        await fs.writeFile(
          path.join(testMigrationsDir, filename),
          migrationContent
        );
        migrations.push(filename);
      }

      // Run migrations (they will execute sequentially as designed)
      const result = await migrationSystem.runMigrations();

      expect(result.executed).toBe(3);

      // Verify all tables were created
      for (let i = 1; i <= 3; i++) {
        const tableResult = await testDb.execute(
          `SELECT COUNT(*) as count FROM concurrent_migration_test_${i}`
        );
        expect(tableResult.rows[0].count).toBe(1);
      }

      // Verify all migrations were recorded
      const executedMigrations = await migrationSystem.getExecutedMigrations();
      migrations.forEach(migration => {
        expect(executedMigrations).toContain(migration);
      });

      // Connection pool should be clean
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.pool.activeLeases).toBe(0);
    });

    it('should maintain connection pool efficiency during large migrations', async () => {
      // Create migration with many operations
      const largeInsertStatements = [];
      for (let i = 1; i <= 50; i++) {
        largeInsertStatements.push(
          `INSERT INTO migration_performance_test (batch_number, item_number) VALUES (1, ${i});`
        );
      }

      const largeMigrationContent = `
        CREATE TABLE IF NOT EXISTS migration_performance_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_number INTEGER NOT NULL,
          item_number INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        ${largeInsertStatements.join('\n        ')}
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '004_large_migration.sql'),
        largeMigrationContent
      );

      // Track performance metrics
      const startTime = Date.now();
      const initialPoolStats = connectionManager.getPoolStatistics();

      // Run migration
      const result = await migrationSystem.runMigrations();
      const executionTime = Date.now() - startTime;

      expect(result.executed).toBe(1);

      // Verify all data was inserted
      const dataResult = await testDb.execute(
        'SELECT COUNT(*) as count FROM migration_performance_test'
      );
      expect(dataResult.rows[0].count).toBe(50);

      // Check performance and efficiency
      const finalPoolStats = connectionManager.getPoolStatistics();

      // Should not have created excessive connections
      expect(finalPoolStats.pool.totalConnections).toBeLessThanOrEqual(
        connectionManager.config.maxConnections
      );

      // Should be efficient (adjust threshold based on system capabilities)
      expect(executionTime).toBeLessThan(10000); // Less than 10 seconds

      // All resources should be cleaned up
      expect(finalPoolStats.pool.activeLeases).toBe(0);

      console.log(`Large migration completed in ${executionTime}ms`);
    });
  });

  describe('Migration State Machine Integration', () => {
    it('should coordinate migration execution with connection state management', async () => {
      const migrationContent = `
        CREATE TABLE IF NOT EXISTS state_machine_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          status TEXT DEFAULT 'created',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO state_machine_test (status) VALUES ('initialized');
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '005_state_machine_test.sql'),
        migrationContent
      );

      // Monitor connection state during migration
      const stateChanges = [];
      let connectionLease;

      // Acquire a lease to monitor its state
      connectionLease = await connectionManager.acquireLease('migration-monitor');

      // Create mock state machine for monitoring (since migration system handles state internally)
      const mockStateMachine = {
        states: [],
        addStateChange: (state) => stateChanges.push(state)
      };

      // Run migration
      const result = await migrationSystem.runMigrations();

      expect(result.executed).toBe(1);

      // Verify table creation
      const tableResult = await testDb.execute(
        'SELECT COUNT(*) as count FROM state_machine_test WHERE status = ?',
        ['initialized']
      );
      expect(tableResult.rows[0].count).toBe(1);

      // Clean up lease
      if (connectionLease) {
        connectionLease.release();
      }

      // Verify connection pool is in proper state
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.state).toBe('IDLE');
      expect(poolStats.pool.activeLeases).toBe(0);
    });

    it('should handle migration rollback scenarios with proper state management', async () => {
      // Create migration that will partially succeed then fail
      const problematicMigrationContent = `
        CREATE TABLE IF NOT EXISTS rollback_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        );

        INSERT INTO rollback_test (name) VALUES ('first-record');

        -- This will cause a constraint violation
        INSERT INTO rollback_test (id, name) VALUES (1, 'duplicate-id');
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '006_rollback_test.sql'),
        problematicMigrationContent
      );

      // Migration should fail due to constraint violation
      await expect(migrationSystem.runMigrations()).rejects.toThrow();

      // Verify migration was not recorded as successful
      const executedMigrations = await migrationSystem.getExecutedMigrations();
      expect(executedMigrations).not.toContain('006_rollback_test.sql');

      // Connection pool should remain stable
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.pool.activeLeases).toBe(0);
      expect(poolStats.state).toBe('IDLE');

      // Circuit breaker should still be healthy
      expect(dbWrapper.isHealthy()).toBe(true);
    });
  });

  describe('Backward Compatibility and Integration', () => {
    it('should maintain compatibility with existing migration flows', async () => {
      // Create migration using traditional format
      const traditionalMigrationContent = `
        -- Traditional migration format
        CREATE TABLE IF NOT EXISTS compatibility_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          legacy_field TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Add some data
        INSERT INTO compatibility_test (legacy_field) VALUES ('legacy-data');
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '007_compatibility_test.sql'),
        traditionalMigrationContent
      );

      // Should work with new enterprise architecture
      const result = await migrationSystem.runMigrations();

      expect(result.executed).toBe(1);

      // Verify compatibility
      const dataResult = await testDb.execute(
        'SELECT * FROM compatibility_test WHERE legacy_field = ?',
        ['legacy-data']
      );
      expect(dataResult.rows).toHaveLength(1);

      // Verify integration with enterprise features
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.metrics.totalLeasesGranted).toBeGreaterThan(0);

      const circuitMetrics = dbWrapper.getMetrics();
      expect(circuitMetrics.isHealthy).toBe(true);
    });

    it('should support enhanced migration operations through enterprise architecture', async () => {
      // Create migration that uses advanced database features
      const enhancedMigrationContent = `
        -- Enhanced migration with complex operations
        CREATE TABLE IF NOT EXISTS enhanced_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          metadata JSON,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_enhanced_name ON enhanced_test(name);
        CREATE INDEX IF NOT EXISTS idx_enhanced_created ON enhanced_test(created_at);

        -- Insert test data
        INSERT INTO enhanced_test (name, metadata) VALUES
          ('test-1', '{"type": "test", "priority": 1}'),
          ('test-2', '{"type": "test", "priority": 2}');

        -- Create trigger for updated_at
        CREATE TRIGGER IF NOT EXISTS update_enhanced_timestamp
        AFTER UPDATE ON enhanced_test
        BEGIN
          UPDATE enhanced_test SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '008_enhanced_migration.sql'),
        enhancedMigrationContent
      );

      // Execute enhanced migration
      const result = await migrationSystem.runMigrations();

      expect(result.executed).toBe(1);

      // Verify all components were created
      const tableResult = await testDb.execute(
        'SELECT COUNT(*) as count FROM enhanced_test'
      );
      expect(tableResult.rows[0].count).toBe(2);

      // Verify indexes were created
      const indexResult = await testDb.execute(`
        SELECT COUNT(*) as count
        FROM sqlite_master
        WHERE type = 'index'
          AND name LIKE 'idx_enhanced_%'
      `);
      expect(indexResult.rows[0].count).toBe(2);

      // Verify trigger was created
      const triggerResult = await testDb.execute(`
        SELECT COUNT(*) as count
        FROM sqlite_master
        WHERE type = 'trigger'
          AND name = 'update_enhanced_timestamp'
      `);
      expect(triggerResult.rows[0].count).toBe(1);

      // Test trigger functionality
      await testDb.execute(
        'UPDATE enhanced_test SET name = ? WHERE id = ?',
        ['updated-test-1', 1]
      );

      const updatedResult = await testDb.execute(
        'SELECT name, updated_at FROM enhanced_test WHERE id = ?',
        [1]
      );
      expect(updatedResult.rows[0].name).toBe('updated-test-1');
      expect(updatedResult.rows[0].updated_at).toBeDefined();
    });
  });

  describe('Resource Management and Cleanup', () => {
    it('should properly manage resources during migration cleanup', async () => {
      // Create simple test migration
      const cleanupTestContent = `
        CREATE TABLE IF NOT EXISTS cleanup_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data TEXT
        );
        INSERT INTO cleanup_test (data) VALUES ('cleanup-test-data');
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '009_cleanup_test.sql'),
        cleanupTestContent
      );

      // Track resource usage before migration
      const initialPoolStats = connectionManager.getPoolStatistics();

      // Run migration
      await migrationSystem.runMigrations();

      // Perform explicit cleanup
      await migrationSystem.cleanup();

      // Verify resource cleanup
      const finalPoolStats = connectionManager.getPoolStatistics();
      expect(finalPoolStats.pool.activeLeases).toBe(0);

      // Migration connection should be properly closed
      expect(migrationSystem.getDbClient()).toBe(null);

      // Pool should still be functional for new operations
      const testLease = await connectionManager.acquireLease('post-cleanup-test');
      expect(testLease).toBeDefined();

      const testResult = await testLease.execute('SELECT 1 as test');
      expect(testResult.rows[0].test).toBe(1);

      testLease.release();
    });

    it('should handle graceful shutdown during active migrations', async () => {
      // This test simulates shutdown during migration execution
      const longMigrationContent = `
        CREATE TABLE IF NOT EXISTS shutdown_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data TEXT
        );

        -- Simulate long-running operation with multiple inserts
        ${Array.from({ length: 20 }, (_, i) =>
          `INSERT INTO shutdown_test (data) VALUES ('data-${i + 1}');`
        ).join('\n        ')}
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '010_shutdown_test.sql'),
        longMigrationContent
      );

      // Start migration and shutdown concurrently
      const migrationPromise = migrationSystem.runMigrations();

      // Give migration a moment to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Initiate graceful shutdown
      const shutdownPromise = connectionManager.gracefulShutdown(5000);

      // Wait for both to complete
      const [migrationResult] = await Promise.allSettled([
        migrationPromise,
        shutdownPromise
      ]);

      // Migration should either complete successfully or be interrupted gracefully
      if (migrationResult.status === 'fulfilled') {
        expect(migrationResult.value.executed).toBe(1);

        // Verify data was inserted
        const countResult = await testDb.execute(
          'SELECT COUNT(*) as count FROM shutdown_test'
        );
        expect(countResult.rows[0].count).toBe(20);
      } else {
        // If migration was interrupted, it should not be recorded as executed
        const executedMigrations = await migrationSystem.getExecutedMigrations();
        expect(executedMigrations).not.toContain('010_shutdown_test.sql');
      }

      // System should be in shutdown state
      const finalStats = connectionManager.getPoolStatistics();
      expect(finalStats.state).toBe('SHUTDOWN');
    });
  });

  describe('Performance and Scalability', () => {
    it('should maintain performance with multiple sequential migrations', async () => {
      const migrationCount = 5;
      const migrations = [];

      // Create multiple small migrations
      for (let i = 1; i <= migrationCount; i++) {
        const migrationContent = `
          CREATE TABLE IF NOT EXISTS perf_test_${i} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            migration_number INTEGER DEFAULT ${i},
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          INSERT INTO perf_test_${i} (migration_number) VALUES (${i});
        `;

        const filename = `${String(i).padStart(3, '0')}_perf_test_${i}.sql`;
        await fs.writeFile(
          path.join(testMigrationsDir, filename),
          migrationContent
        );
        migrations.push(filename);
      }

      // Execute migrations and measure performance
      const startTime = Date.now();
      const result = await migrationSystem.runMigrations();
      const executionTime = Date.now() - startTime;

      expect(result.executed).toBe(migrationCount);

      // Performance expectations
      expect(executionTime).toBeLessThan(5000); // Should complete in under 5 seconds

      // Verify all tables were created
      for (let i = 1; i <= migrationCount; i++) {
        const tableResult = await testDb.execute(
          `SELECT COUNT(*) as count FROM perf_test_${i}`
        );
        expect(tableResult.rows[0].count).toBe(1);
      }

      // Connection pool should be efficient
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.pool.activeLeases).toBe(0);
      expect(poolStats.metrics.totalLeasesGranted).toBeGreaterThanOrEqual(migrationCount);

      console.log(`${migrationCount} migrations completed in ${executionTime}ms`);
    });

    it('should handle large migration files efficiently', async () => {
      // Create large migration with many operations
      const operationCount = 100;
      const largeOperations = [];

      for (let i = 1; i <= operationCount; i++) {
        largeOperations.push(
          `INSERT INTO large_migration_test (item_number, data) VALUES (${i}, 'data-item-${i}');`
        );
      }

      const largeMigrationContent = `
        CREATE TABLE IF NOT EXISTS large_migration_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_number INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_large_item_number ON large_migration_test(item_number);

        ${largeOperations.join('\n        ')}
      `;

      await fs.writeFile(
        path.join(testMigrationsDir, '999_large_migration.sql'),
        largeMigrationContent
      );

      // Execute large migration
      const startTime = Date.now();
      const result = await migrationSystem.runMigrations();
      const executionTime = Date.now() - startTime;

      expect(result.executed).toBe(1);

      // Verify all data was inserted
      const countResult = await testDb.execute(
        'SELECT COUNT(*) as count FROM large_migration_test'
      );
      expect(countResult.rows[0].count).toBe(operationCount);

      // Performance should be reasonable for large operations
      expect(executionTime).toBeLessThan(15000); // Under 15 seconds

      // Memory usage should be controlled
      const circuitMetrics = dbWrapper.getMetrics();
      expect(circuitMetrics.memoryUsage.failuresTracked).toBeLessThan(50);

      console.log(`Large migration (${operationCount} operations) completed in ${executionTime}ms`);
    });
  });
});