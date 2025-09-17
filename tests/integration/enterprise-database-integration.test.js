/**
 * Enterprise Database Integration Tests
 *
 * Comprehensive testing of Connection Manager, State Machine, and Circuit Breaker
 * working together as an integrated enterprise system.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { getConnectionManager, resetConnectionManager, ConnectionState } from '../../lib/connection-manager.js';
import { createConnectionStateMachine, CONNECTION_STATES } from '../../lib/connection-state-machine.js';
import DatabaseCircuitBreaker, { CircuitBreakerError, CircuitStates } from '../../lib/circuit-breaker.js';
import { DatabaseOperationWrapper } from '../../lib/database-circuit-breaker-integration.js';

describe('Enterprise Database Integration Tests', () => {
  let testDb;
  let connectionManager;
  let dbWrapper;
  let originalEnv;

  beforeAll(async () => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_TEST_MODE = 'true';

    // Initialize test database
    testDb = await getDatabaseClient();

    // Create test table
    await testDb.execute(`
      CREATE TABLE IF NOT EXISTS enterprise_test_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    // Reset environment
    process.env = originalEnv;

    // Clean up connection manager
    if (connectionManager) {
      await connectionManager.gracefulShutdown();
    }

    // Note: Database cleanup is handled by the integration test environment
    // Individual test database clients are closed in afterEach
  });

  beforeEach(async () => {
    // Get a fresh database client for each test
    testDb = await getDatabaseClient();

    // Ensure clean state by resetting connection manager
    try {
      await resetConnectionManager();
    } catch (error) {
      // Ignore reset errors
    }

    // Create a fresh connection manager instance
    connectionManager = getConnectionManager({
      maxConnections: 3,
      acquireTimeout: 5000,
      leaseTimeout: 10000
    });

    // Initialize database wrapper with circuit breaker
    dbWrapper = new DatabaseOperationWrapper({
      failureThreshold: 3,
      recoveryTimeout: 2000,
      timeoutThreshold: 5000
    });

    // Clear test data
    try {
      await testDb.execute('DELETE FROM enterprise_test_table');
      await testDb.execute('DELETE FROM stress_test');
    } catch (error) {
      // Ignore if tables don't exist yet
    }
  });

  afterEach(async () => {
    // Clean up database wrapper first
    if (dbWrapper) {
      try {
        dbWrapper.reset();
      } catch (error) {
        // Ignore reset errors
      }
    }

    // Clean up connections after each test
    if (connectionManager) {
      try {
        await connectionManager.gracefulShutdown();
      } catch (error) {
        // Ignore shutdown errors - may already be shutdown
      }
    }

    // Close test database client
    if (testDb) {
      try {
        await testDb.close();
      } catch (error) {
        // Ignore close errors
      }
    }
  });

  describe('End-to-End Connection Management', () => {
    it('should successfully acquire and release connection leases through pool manager', async () => {
      // Acquire multiple leases
      const lease1 = await connectionManager.acquireLease('test-op-1');
      const lease2 = await connectionManager.acquireLease('test-op-2');

      expect(lease1).toBeDefined();
      expect(lease2).toBeDefined();
      expect(lease1.id).not.toBe(lease2.id);

      // Check pool statistics
      const stats = connectionManager.getPoolStatistics();
      expect(stats.pool.activeLeases).toBe(2);
      expect(stats.metrics.totalLeasesGranted).toBe(2);
      expect(stats.metrics.currentActiveLeases).toBe(2);

      // Execute operations through leases
      await lease1.execute('INSERT INTO enterprise_test_table (name) VALUES (?)', ['test-1']);
      await lease2.execute('INSERT INTO enterprise_test_table (name) VALUES (?)', ['test-2']);

      // Verify data was inserted
      const result = await lease1.execute('SELECT COUNT(*) as count FROM enterprise_test_table');
      expect(result.rows[0].count).toBe(2);

      // Release leases
      lease1.release();
      lease2.release();

      // Verify cleanup
      const finalStats = connectionManager.getPoolStatistics();
      expect(finalStats.pool.activeLeases).toBe(0);
      expect(finalStats.metrics.currentActiveLeases).toBe(0);
      expect(finalStats.metrics.totalLeasesReleased).toBe(2);
    });

    it('should handle connection pool exhaustion gracefully', async () => {
      // Configure small pool for testing
      await connectionManager.gracefulShutdown();
      connectionManager = getConnectionManager({
        maxConnections: 2,
        acquireTimeout: 1000
      });

      // Acquire all available connections
      const lease1 = await connectionManager.acquireLease('test-1');
      const lease2 = await connectionManager.acquireLease('test-2');

      // Third acquisition should timeout
      await expect(
        connectionManager.acquireLease('test-3', 500)
      ).rejects.toThrow('Connection acquisition timeout');

      // Release one lease
      lease1.release();

      // Now should be able to acquire again
      const lease3 = await connectionManager.acquireLease('test-3');
      expect(lease3).toBeDefined();

      // Clean up
      lease2.release();
      lease3.release();
    });

    it('should maintain proper resource cleanup during operation failures', async () => {
      const lease = await connectionManager.acquireLease('test-op');

      // Execute valid operation
      await lease.execute('INSERT INTO enterprise_test_table (name) VALUES (?)', ['test']);

      // Execute invalid operation (should fail but not break lease)
      await expect(
        lease.execute('INVALID SQL STATEMENT')
      ).rejects.toThrow();

      // Lease should still be functional for valid operations
      const result = await lease.execute('SELECT COUNT(*) as count FROM enterprise_test_table');
      expect(result.rows[0].count).toBe(1);

      // Release should work normally
      lease.release();

      // Pool should be clean
      const stats = connectionManager.getPoolStatistics();
      expect(stats.pool.activeLeases).toBe(0);
    });
  });

  describe('State Machine Integration', () => {
    it('should coordinate connection state transitions with pool manager', async () => {
      const stateMachine = createConnectionStateMachine('test-conn', testDb);
      const stateChanges = [];

      // Monitor state changes
      stateMachine.addObserver((event) => {
        stateChanges.push(event);
      });

      // Transition through normal lifecycle
      await stateMachine.transition(CONNECTION_STATES.CONNECTED, 'initialization');
      await stateMachine.transition(CONNECTION_STATES.IDLE, 'ready');

      // Execute operation through state machine
      const result = await stateMachine.executeOperation('execute', async () => {
        return await testDb.execute('SELECT 1 as test');
      });

      expect(result.rows[0].test).toBe(1);

      // Verify state transitions
      expect(stateChanges).toHaveLength(4); // CONNECTED, IDLE, IN_USE, back to IDLE
      expect(stateChanges[0].to).toBe(CONNECTION_STATES.CONNECTED);
      expect(stateChanges[1].to).toBe(CONNECTION_STATES.IDLE);
      expect(stateChanges[2].to).toBe(CONNECTION_STATES.IN_USE);
      expect(stateChanges[3].to).toBe(CONNECTION_STATES.IDLE);

      // Clean shutdown
      await stateMachine.shutdown();
      expect(stateMachine.getState().state).toBe(CONNECTION_STATES.CLOSED);
    });

    it('should handle operation failures with proper state recovery', async () => {
      const stateMachine = createConnectionStateMachine('test-conn', testDb);

      await stateMachine.transition(CONNECTION_STATES.CONNECTED);
      await stateMachine.transition(CONNECTION_STATES.IDLE);

      // Execute failing operation
      await expect(
        stateMachine.executeOperation('execute', async () => {
          throw new Error('Simulated database error');
        })
      ).rejects.toThrow('Simulated database error');

      // State should return to IDLE after operation failure
      const state = stateMachine.getState();
      expect(state.state).toBe(CONNECTION_STATES.IDLE);
      expect(state.isHealthy).toBe(true);

      // Should still be able to execute valid operations
      const result = await stateMachine.executeOperation('execute', async () => {
        return await testDb.execute('SELECT 2 as test');
      });

      expect(result.rows[0].test).toBe(2);

      await stateMachine.shutdown();
    });

    it('should prevent operations in invalid states', async () => {
      const stateMachine = createConnectionStateMachine('test-conn', testDb);

      // Try to execute operation without proper initialization
      await expect(
        stateMachine.executeOperation('execute', async () => {
          return await testDb.execute('SELECT 1');
        })
      ).rejects.toThrow('Operation execute not allowed in state INITIALIZING');

      // Properly initialize
      await stateMachine.transition(CONNECTION_STATES.CONNECTED);
      await stateMachine.transition(CONNECTION_STATES.IDLE);

      // Now operation should work
      const result = await stateMachine.executeOperation('execute', async () => {
        return await testDb.execute('SELECT 1 as test');
      });

      expect(result.rows[0].test).toBe(1);

      await stateMachine.shutdown();
    });
  });

  describe('Circuit Breaker Protection', () => {
    it('should protect against database failures and enable recovery', async () => {
      // Simulate multiple failures to trigger circuit breaker
      const failingOperation = () => {
        throw new Error('Database connection failed');
      };

      // Execute failing operations until circuit opens
      for (let i = 0; i < 3; i++) {
        await expect(
          dbWrapper.executeQuery('SELECT 1', [], failingOperation)
        ).rejects.toThrow();
      }

      // Circuit should now be open
      expect(dbWrapper.isHealthy()).toBe(false);

      // Next operation should fail fast with circuit breaker error
      await expect(
        dbWrapper.executeQuery('SELECT 1')
      ).rejects.toThrow(CircuitBreakerError);

      // Reset circuit breaker to simulate recovery
      dbWrapper.reset();

      // Should be able to execute operations again
      const result = await dbWrapper.executeQuery(
        'SELECT 3 as test'
      );

      expect(result.rows[0].test).toBe(3);
      expect(dbWrapper.isHealthy()).toBe(true);
    });

    it('should use fallback operations when available', async () => {
      const fallbackData = { rows: [{ test: 'fallback' }], fromCache: true };

      const fallbackFn = vi.fn().mockResolvedValue(fallbackData);

      // Force circuit to open by causing failures
      for (let i = 0; i < 3; i++) {
        await expect(
          dbWrapper.executeQuery('SELECT 1', [], () => {
            throw new Error('Database error');
          })
        ).rejects.toThrow();
      }

      // Now execute with fallback
      const result = await dbWrapper.executeQuery(
        'SELECT 1',
        [],
        fallbackFn
      );

      expect(result).toEqual(fallbackData);
      expect(fallbackFn).toHaveBeenCalled();
    });

    it('should track comprehensive metrics during operations', async () => {
      // Execute successful operations
      await dbWrapper.executeQuery('INSERT INTO enterprise_test_table (name) VALUES (?)', ['test1']);
      await dbWrapper.executeQuery('INSERT INTO enterprise_test_table (name) VALUES (?)', ['test2']);

      // Execute failing operation
      await expect(
        dbWrapper.executeQuery('INVALID SQL')
      ).rejects.toThrow();

      // Get metrics
      const metrics = dbWrapper.getMetrics();

      expect(metrics.totalRequests).toBe(3);
      expect(metrics.succeededRequests).toBe(2);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.failureRate).toBeCloseTo(33.33, 1); // 1/3 = 33.33%
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
      expect(metrics.isHealthy).toBe(true); // Under failure threshold
    });
  });

  describe('Concurrent Operations Integration', () => {
    it('should handle multiple concurrent operations efficiently', async () => {
      const operationCount = 10;
      const operations = [];

      // Create multiple concurrent operations
      for (let i = 0; i < operationCount; i++) {
        const operation = dbWrapper.executeQuery(
          'INSERT INTO enterprise_test_table (name) VALUES (?)',
          [`concurrent-test-${i}`]
        );
        operations.push(operation);
      }

      // Execute all operations concurrently
      const results = await Promise.allSettled(operations);

      // All operations should succeed
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes).toHaveLength(operationCount);

      // Verify data was inserted
      const countResult = await dbWrapper.executeQuery(
        'SELECT COUNT(*) as count FROM enterprise_test_table'
      );
      expect(countResult.rows[0].count).toBe(operationCount);

      // Check pool and circuit breaker metrics
      const poolStats = connectionManager.getPoolStatistics();
      const circuitMetrics = dbWrapper.getMetrics();

      expect(poolStats.metrics.totalLeasesGranted).toBeGreaterThanOrEqual(operationCount);
      expect(circuitMetrics.totalRequests).toBe(operationCount + 1); // +1 for count query
      expect(circuitMetrics.isHealthy).toBe(true);
    });

    it('should maintain data consistency during concurrent transactions', async () => {
      const transactionCount = 5;
      const transactions = [];

      // Create concurrent transactions
      for (let i = 0; i < transactionCount; i++) {
        const transaction = dbWrapper.executeTransaction(async (tx) => {
          // Each transaction inserts multiple records
          await tx.execute(
            'INSERT INTO enterprise_test_table (name) VALUES (?)',
            [`tx-${i}-record-1`]
          );
          await tx.execute(
            'INSERT INTO enterprise_test_table (name) VALUES (?)',
            [`tx-${i}-record-2`]
          );
          return { transactionId: i };
        });
        transactions.push(transaction);
      }

      // Execute all transactions
      const results = await Promise.allSettled(transactions);

      // All transactions should succeed
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes).toHaveLength(transactionCount);

      // Verify all records were inserted (2 per transaction)
      const countResult = await dbWrapper.executeQuery(
        'SELECT COUNT(*) as count FROM enterprise_test_table'
      );
      expect(countResult.rows[0].count).toBe(transactionCount * 2);
    });

    it('should handle mixed success and failure scenarios gracefully', async () => {
      const operations = [
        // Successful operations
        dbWrapper.executeQuery('INSERT INTO enterprise_test_table (name) VALUES (?)', ['success-1']),
        dbWrapper.executeQuery('INSERT INTO enterprise_test_table (name) VALUES (?)', ['success-2']),

        // Failing operations
        dbWrapper.executeQuery('INVALID SQL STATEMENT 1'),
        dbWrapper.executeQuery('INVALID SQL STATEMENT 2'),

        // More successful operations
        dbWrapper.executeQuery('INSERT INTO enterprise_test_table (name) VALUES (?)', ['success-3'])
      ];

      const results = await Promise.allSettled(operations);

      // Should have 3 successes and 2 failures
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes).toHaveLength(3);
      expect(failures).toHaveLength(2);

      // Verify successful operations inserted data
      const countResult = await dbWrapper.executeQuery(
        'SELECT COUNT(*) as count FROM enterprise_test_table'
      );
      expect(countResult.rows[0].count).toBe(3);

      // Circuit breaker should still be healthy (failures under threshold)
      expect(dbWrapper.isHealthy()).toBe(true);
    });
  });

  describe('Resource Leak Prevention', () => {
    it('should prevent connection leaks during normal operations', async () => {
      const initialStats = connectionManager.getPoolStatistics();
      const initialConnections = initialStats.pool.totalConnections;

      // Perform multiple operations
      for (let i = 0; i < 20; i++) {
        await dbWrapper.executeQuery(
          'INSERT INTO enterprise_test_table (name) VALUES (?)',
          [`leak-test-${i}`]
        );
      }

      // Check for leaks after operations
      const finalStats = connectionManager.getPoolStatistics();

      // Active leases should be 0
      expect(finalStats.pool.activeLeases).toBe(0);

      // Total connections should not have grown excessively
      expect(finalStats.pool.totalConnections).toBeLessThanOrEqual(
        Math.max(initialConnections, connectionManager.config.maxConnections)
      );

      // All leases should be properly released
      expect(finalStats.metrics.totalLeasesGranted).toBe(finalStats.metrics.totalLeasesReleased);
    });

    it('should clean up resources during forced shutdowns', async () => {
      // Acquire several leases
      const leases = [];
      for (let i = 0; i < 3; i++) {
        const lease = await connectionManager.acquireLease(`forced-shutdown-${i}`);
        leases.push(lease);
      }

      // Verify leases are active
      const beforeStats = connectionManager.getPoolStatistics();
      expect(beforeStats.pool.activeLeases).toBe(3);

      // Force shutdown without releasing leases
      await connectionManager.gracefulShutdown(1000); // Short timeout

      // Verify cleanup
      const afterStats = connectionManager.getPoolStatistics();
      expect(afterStats.state).toBe(ConnectionState.SHUTDOWN);
      expect(afterStats.pool.activeLeases).toBe(0);
      expect(afterStats.pool.totalConnections).toBe(0);
    });

    it('should handle memory cleanup in circuit breaker', async () => {
      // Configure circuit breaker with small history limits for testing
      const testWrapper = new DatabaseOperationWrapper({
        memoryOptimization: true,
        maxFailureAge: 1000, // 1 second
        failureThreshold: 10 // High threshold to avoid opening
      });

      // Generate many operations to create history
      for (let i = 0; i < 50; i++) {
        try {
          await testWrapper.executeQuery(
            'INSERT INTO enterprise_test_table (name) VALUES (?)',
            [`memory-test-${i}`]
          );
        } catch (error) {
          // Ignore errors for this test
        }
      }

      // Get initial metrics
      const initialMetrics = testWrapper.getMetrics();
      expect(initialMetrics.totalRequests).toBe(50);

      // Wait for memory cleanup
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Trigger another operation to force cleanup
      await testWrapper.executeQuery('SELECT 1');

      // Memory usage should be controlled
      const finalMetrics = testWrapper.getMetrics();
      expect(finalMetrics.memoryUsage.failuresTracked).toBeLessThanOrEqual(
        initialMetrics.memoryUsage.maxFailureHistory
      );
      expect(finalMetrics.memoryUsage.responseTimesTracked).toBeLessThanOrEqual(
        initialMetrics.memoryUsage.maxResponseTimeHistory
      );

      testWrapper.reset();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should maintain acceptable connection acquisition times', async () => {
      const acquisitionTimes = [];
      const operationCount = 10;

      for (let i = 0; i < operationCount; i++) {
        const startTime = Date.now();
        const lease = await connectionManager.acquireLease(`perf-test-${i}`);
        const acquisitionTime = Date.now() - startTime;

        acquisitionTimes.push(acquisitionTime);
        lease.release();
      }

      // Calculate statistics
      const avgTime = acquisitionTimes.reduce((a, b) => a + b, 0) / acquisitionTimes.length;
      const maxTime = Math.max(...acquisitionTimes);

      // Performance assertions (adjust thresholds based on requirements)
      expect(avgTime).toBeLessThan(50); // Average < 50ms
      expect(maxTime).toBeLessThan(100); // Max < 100ms

      console.log(`Connection acquisition - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime}ms`);
    });

    it('should maintain low operation overhead', async () => {
      const operationTimes = [];
      const operationCount = 20;

      for (let i = 0; i < operationCount; i++) {
        const startTime = Date.now();

        await dbWrapper.executeQuery(
          'INSERT INTO enterprise_test_table (name) VALUES (?)',
          [`overhead-test-${i}`]
        );

        const operationTime = Date.now() - startTime;
        operationTimes.push(operationTime);
      }

      // Calculate overhead statistics
      const avgTime = operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length;
      const maxTime = Math.max(...operationTimes);

      // Get circuit breaker metrics for comparison
      const metrics = dbWrapper.getMetrics();

      // Performance assertions
      expect(avgTime).toBeLessThan(100); // Average operation < 100ms
      expect(metrics.averageResponseTime).toBeLessThan(200); // Circuit breaker tracking < 200ms

      console.log(`Operation overhead - Avg: ${avgTime.toFixed(2)}ms, CB Avg: ${metrics.averageResponseTime.toFixed(2)}ms`);
    });

    it('should scale efficiently with concurrent load', async () => {
      const concurrentLevels = [1, 5, 10];
      const results = [];

      for (const concurrency of concurrentLevels) {
        const startTime = Date.now();
        const operations = [];

        // Create concurrent operations
        for (let i = 0; i < concurrency; i++) {
          const operation = dbWrapper.executeQuery(
            'INSERT INTO enterprise_test_table (name) VALUES (?)',
            [`scale-test-${concurrency}-${i}`]
          );
          operations.push(operation);
        }

        // Execute all operations
        await Promise.all(operations);
        const totalTime = Date.now() - startTime;

        results.push({
          concurrency,
          totalTime,
          avgTimePerOp: totalTime / concurrency
        });

        console.log(`Concurrency ${concurrency}: ${totalTime}ms total, ${(totalTime/concurrency).toFixed(2)}ms per op`);
      }

      // Verify reasonable scaling characteristics
      // Higher concurrency should not dramatically increase per-operation time
      const lowConcurrencyAvg = results[0].avgTimePerOp;
      const highConcurrencyAvg = results[results.length - 1].avgTimePerOp;

      // Per-operation time should not increase by more than 3x
      expect(highConcurrencyAvg).toBeLessThan(lowConcurrencyAvg * 3);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover gracefully from temporary database outages', async () => {
      // Simulate temporary outage by configuring circuit breaker to fail
      const testWrapper = new DatabaseOperationWrapper({
        failureThreshold: 2,
        recoveryTimeout: 1000 // Quick recovery for testing
      });

      // Cause failures to open circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          testWrapper.executeQuery('SELECT 1', [], () => {
            throw new Error('Simulated outage');
          })
        ).rejects.toThrow();
      }

      // Circuit should be open
      expect(testWrapper.isHealthy()).toBe(false);

      // Wait for recovery period
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Reset circuit breaker to simulate outage resolution
      testWrapper.reset();

      // Should be able to execute operations again
      const result = await testWrapper.executeQuery('SELECT 42 as recovery_test');
      expect(result.rows[0].recovery_test).toBe(42);
      expect(testWrapper.isHealthy()).toBe(true);

      testWrapper.reset();
    });

    it('should maintain system stability during cascading failures', async () => {
      const results = [];
      const operationCount = 20;

      // Mix of successful and failing operations to test stability
      for (let i = 0; i < operationCount; i++) {
        try {
          if (i % 4 === 0) {
            // Every 4th operation fails
            await dbWrapper.executeQuery('INVALID SQL');
          } else {
            // Other operations succeed
            await dbWrapper.executeQuery(
              'INSERT INTO enterprise_test_table (name) VALUES (?)',
              [`cascade-test-${i}`]
            );
          }
          results.push({ success: true, index: i });
        } catch (error) {
          results.push({ success: false, index: i, error: error.message });
        }
      }

      // Analyze results
      const successes = results.filter(r => r.success);
      const failures = results.filter(r => !r.success);

      // Should have ~75% success rate (3 out of every 4 operations)
      expect(successes.length).toBeGreaterThanOrEqual(12);
      expect(failures.length).toBeLessThanOrEqual(8);

      // System should still be healthy (under failure threshold)
      expect(dbWrapper.isHealthy()).toBe(true);

      // Pool should still be functional
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.state).not.toBe(ConnectionState.SHUTDOWN);
      expect(poolStats.pool.activeLeases).toBe(0); // All cleaned up
    });
  });
});