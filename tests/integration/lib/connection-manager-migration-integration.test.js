/**
 * Connection Manager - Migration System Integration Test
 *
 * Demonstrates how the connection manager integrates with the existing
 * migration system for coordinated database operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { acquireDbLease, resetConnectionManager } from '../../../lib/connection-manager.js';
import { MigrationSystem } from '../../../scripts/migrate.js';

// Mock the database client - provide full implementation for migrations
vi.mock('../../../lib/database.js', () => ({
  getDatabaseClient: vi.fn().mockResolvedValue({
    execute: vi.fn().mockResolvedValue({ rows: [{ test: 1 }] }),
    transaction: vi.fn().mockResolvedValue({
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      commit: vi.fn().mockResolvedValue(),
      rollback: vi.fn().mockResolvedValue()
    }),
    batch: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue()
  }),
  resetDatabaseInstance: vi.fn().mockResolvedValue()
}));

// Mock the logger
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

import { getDatabaseClient } from '../../../lib/database.js';

describe('Connection Manager - Migration Integration', () => {
  let mockConnection;
  let migrationSystem;

  beforeEach(async () => {
    // Create enhanced mock connection for migration testing
    mockConnection = {
      execute: vi.fn().mockImplementation((sqlOrObject, params) => {
        // Handle both string and object SQL formats
        const sql = typeof sqlOrObject === 'string' ? sqlOrObject : sqlOrObject.sql;

        // Mock different responses based on SQL
        if (sql.includes('migrations')) {
          if (sql.includes('COUNT(*)')) {
            return Promise.resolve({ rows: [{ total: 0 }] });
          }
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('CREATE TABLE')) {
          return Promise.resolve({ rowsAffected: 0 });
        }
        if (sql.includes('SELECT 1')) {
          return Promise.resolve({ rows: [{ test: 1 }] });
        }
        if (sql.includes('SELECT ?')) {
          return Promise.resolve({ rows: [{ value: 42 }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      transaction: vi.fn().mockResolvedValue({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        commit: vi.fn().mockResolvedValue(),
        rollback: vi.fn().mockResolvedValue()
      }),
      batch: vi.fn().mockResolvedValue([]),
      close: vi.fn().mockResolvedValue()
    };

    getDatabaseClient.mockResolvedValue(mockConnection);

    // Reset connection manager
    await resetConnectionManager();

    // Create migration system instance
    migrationSystem = new MigrationSystem();

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up migration system
    if (migrationSystem) {
      await migrationSystem.cleanup();
    }

    // Reset connection manager
    await resetConnectionManager();
  });

  describe('Coordinated Database Operations', () => {
    it('should coordinate connection manager with migration operations', async () => {
      // Simulate migration initialization
      await migrationSystem.ensureDbClient();

      // Connection manager should work alongside migration system
      const lease = await acquireDbLease('migration-coordination-test');

      try {
        // Both systems should be able to operate
        const migrationResult = await migrationSystem.getDbClient().execute('SELECT 1');
        const leaseResult = await lease.execute('SELECT 1');

        expect(migrationResult.rows[0].test).toBe(1);
        expect(leaseResult.rows[0].test).toBe(1);

        // Both should use the same underlying connection type
        expect(getDatabaseClient).toHaveBeenCalled();
      } finally {
        lease.release();
      }
    });

    it('should handle database operations during migration process', async () => {
      // Start migration process
      const migrationPromise = (async () => {
        await migrationSystem.initializeMigrationsTable();
        return 'migration-complete';
      })();

      // Concurrent database operation through connection manager
      const operationPromise = (async () => {
        const lease = await acquireDbLease('concurrent-operation');
        try {
          return await lease.execute('SELECT COUNT(*) as count FROM migrations');
        } finally {
          lease.release();
        }
      })();

      // Both should complete successfully
      const [migrationResult, operationResult] = await Promise.all([
        migrationPromise,
        operationPromise
      ]);

      expect(migrationResult).toBe('migration-complete');
      expect(operationResult).toBeDefined();
    });

    it('should support migration-style batch operations through connection manager', async () => {
      const lease = await acquireDbLease('migration-batch-test');

      try {
        // Simulate migration-style batch operation
        const statements = [
          {
            sql: 'CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)',
            args: []
          },
          {
            sql: 'INSERT OR IGNORE INTO test_table (id) VALUES (?)',
            args: [1]
          }
        ];

        const results = await lease.batch(statements);

        expect(mockConnection.batch).toHaveBeenCalledWith(statements);
        expect(results).toBeDefined();
      } finally {
        lease.release();
      }
    });
  });

  describe('Resource Coordination', () => {
    it('should properly clean up resources when both systems are used', async () => {
      // Use both systems
      await migrationSystem.ensureDbClient();
      const lease = await acquireDbLease('cleanup-test');

      try {
        await lease.execute('SELECT 1');
        await migrationSystem.getDbClient().execute('SELECT 1');
      } finally {
        lease.release();
      }

      // Clean up migration system
      await migrationSystem.cleanup();

      // Connection manager should still work after migration cleanup
      const newLease = await acquireDbLease('post-cleanup-test');
      try {
        const result = await newLease.execute('SELECT 1');
        expect(result.rows[0].test).toBe(1);
      } finally {
        newLease.release();
      }
    });

    it('should handle migration system errors gracefully', async () => {
      // Simulate migration error
      getDatabaseClient.mockRejectedValueOnce(new Error('Migration connection failed'));

      // Migration system should fail
      await expect(migrationSystem.ensureDbClient()).rejects.toThrow('Migration connection failed');

      // But connection manager should still work with fresh connection
      getDatabaseClient.mockResolvedValueOnce(mockConnection);

      const lease = await acquireDbLease('post-migration-error-test');
      try {
        const result = await lease.execute('SELECT 1');
        expect(result.rows[0].test).toBe(1);
      } finally {
        lease.release();
      }
    });
  });

  describe('Transaction Coordination', () => {
    it('should support migration-style transactions through connection manager', async () => {
      const lease = await acquireDbLease('migration-transaction-test');

      try {
        const transaction = await lease.transaction();

        // Simulate migration transaction pattern
        await transaction.execute('CREATE TABLE IF NOT EXISTS temp_migration (id INTEGER)');
        await transaction.execute('INSERT INTO temp_migration (id) VALUES (?)', [1]);
        await transaction.commit();

        expect(mockConnection.transaction).toHaveBeenCalled();
      } finally {
        lease.release();
      }
    });

    it('should handle transaction rollback like migration system', async () => {
      const lease = await acquireDbLease('migration-rollback-test');

      try {
        const transaction = await lease.transaction();

        try {
          await transaction.execute('CREATE TABLE temp_table (id INTEGER)');

          // Simulate error by throwing manually
          throw new Error('Constraint violation');
        } catch (error) {
          await transaction.rollback();
          expect(error.message).toBe('Constraint violation');
        }
      } finally {
        lease.release();
      }
    });
  });

  describe('Performance and Compatibility', () => {
    it('should not significantly impact migration performance', async () => {
      const startTime = Date.now();

      // Simulate migration operations through connection manager
      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(
          (async () => {
            const lease = await acquireDbLease(`migration-perf-${i}`);
            try {
              return await lease.execute('SELECT 1');
            } finally {
              lease.release();
            }
          })()
        );
      }

      await Promise.all(operations);

      const duration = Date.now() - startTime;

      // Should complete quickly (allowing for test overhead)
      expect(duration).toBeLessThan(1000);
    });

    it('should maintain compatibility with existing migration patterns', async () => {
      // Test that existing migration code patterns work with connection manager

      // Pattern 1: Direct execution
      const lease1 = await acquireDbLease('pattern-1');
      try {
        await lease1.execute('SELECT 1');
      } finally {
        lease1.release();
      }

      // Pattern 2: Parameterized queries
      const lease2 = await acquireDbLease('pattern-2');
      try {
        await lease2.execute('SELECT ? as value', [42]);
      } finally {
        lease2.release();
      }

      // Pattern 3: Complex object parameters
      const lease3 = await acquireDbLease('pattern-3');
      try {
        await lease3.execute({
          sql: 'INSERT INTO test (name) VALUES (?)',
          args: ['test-value']
        });
      } finally {
        lease3.release();
      }

      // All patterns should work without issues
      expect(mockConnection.execute).toHaveBeenCalledTimes(3);
    });
  });
});