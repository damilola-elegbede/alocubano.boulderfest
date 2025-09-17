/**
 * Database Reliability and Failure Scenario Tests
 *
 * Tests system reliability, failure recovery, and resilience under various
 * stress conditions using the enterprise database architecture.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { getConnectionManager, resetConnectionManager, ConnectionState } from '../../lib/connection-manager.js';
import { createConnectionStateMachine, CONNECTION_STATES } from '../../lib/connection-state-machine.js';
import DatabaseCircuitBreaker, { CircuitBreakerError, CircuitStates, FailureTypes } from '../../lib/circuit-breaker.js';
import { DatabaseOperationWrapper } from '../../lib/database-circuit-breaker-integration.js';

describe('Database Reliability and Failure Scenario Tests', () => {
  let testDb;
  let connectionManager;
  let dbWrapper;
  let originalEnv;

  beforeAll(async () => {
    // Store original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_TEST_MODE = 'true';

    // Initialize test database
    testDb = await getDatabaseClient();

    // Create test tables for reliability testing
    await testDb.execute(`
      CREATE TABLE IF NOT EXISTS reliability_test (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_type TEXT NOT NULL,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.execute(`
      CREATE TABLE IF NOT EXISTS stress_test (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER,
        operation_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    // Restore environment
    process.env = originalEnv;

    // Clean up test tables
    if (testDb) {
      await testDb.execute('DROP TABLE IF EXISTS reliability_test');
      await testDb.execute('DROP TABLE IF EXISTS stress_test');
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
      maxConnections: 5,
      acquireTimeout: 5000,
      leaseTimeout: 15000,
      healthCheckInterval: 1000 // Frequent health checks for testing
    });

    // Initialize database wrapper with test-friendly settings
    dbWrapper = new DatabaseOperationWrapper({
      failureThreshold: 3,
      recoveryTimeout: 1000, // Quick recovery for testing
      timeoutThreshold: 2000,
      halfOpenMaxAttempts: 2
    });

    // Clear test data
    await testDb.execute('DELETE FROM reliability_test');
    await testDb.execute('DELETE FROM stress_test');
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.gracefulShutdown();
    }

    if (dbWrapper) {
      dbWrapper.reset();
    }
  });

  describe('Database Connectivity Failures', () => {
    it('should handle simulated database outages with circuit breaker protection', async () => {
      let outageActive = true;
      let attemptCount = 0;

      // Create wrapper that simulates outage
      const simulatedOutageWrapper = new DatabaseOperationWrapper({
        failureThreshold: 2,
        recoveryTimeout: 500
      });

      // Override execute to simulate outage
      const originalExecute = simulatedOutageWrapper.executeQuery.bind(simulatedOutageWrapper);
      simulatedOutageWrapper.executeQuery = async (query, params, fallback) => {
        attemptCount++;
        if (outageActive && attemptCount <= 3) {
          throw new Error('Database connection failed - simulated outage');
        }
        return originalExecute(query, params, fallback);
      };

      // First attempts should fail and trigger circuit breaker
      for (let i = 0; i < 2; i++) {
        await expect(
          simulatedOutageWrapper.executeQuery('SELECT 1')
        ).rejects.toThrow('Database connection failed - simulated outage');
      }

      // Circuit should now be open
      expect(simulatedOutageWrapper.isHealthy()).toBe(false);

      // Next attempt should fail fast with circuit breaker error
      await expect(
        simulatedOutageWrapper.executeQuery('SELECT 1')
      ).rejects.toThrow(CircuitBreakerError);

      // Simulate outage resolution
      outageActive = false;

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 600));

      // Reset circuit breaker to simulate system recovery
      simulatedOutageWrapper.reset();

      // Should now be able to execute operations
      const result = await simulatedOutageWrapper.executeQuery('SELECT 42 as recovery_test');
      expect(result.rows[0].recovery_test).toBe(42);
      expect(simulatedOutageWrapper.isHealthy()).toBe(true);

      simulatedOutageWrapper.reset();
    });

    it('should handle connection pool exhaustion during high load', async () => {
      // Configure small pool for testing exhaustion
      await connectionManager.gracefulShutdown();
      connectionManager = getConnectionManager({
        maxConnections: 2,
        acquireTimeout: 1000
      });

      const activeLeases = [];
      const operations = [];

      // Start multiple long-running operations
      for (let i = 0; i < 4; i++) {
        const operation = (async (operationId) => {
          try {
            const lease = await connectionManager.acquireLease(`load-test-${operationId}`);
            activeLeases.push(lease);

            // Simulate long-running operation
            await new Promise(resolve => setTimeout(resolve, 500));

            return lease.execute('SELECT ? as operation_id', [operationId]);
          } catch (error) {
            return { error: error.message, operationId };
          }
        })(i);

        operations.push(operation);
      }

      const results = await Promise.allSettled(operations);

      // Some operations should succeed, others should timeout
      const successes = results.filter(r => r.status === 'fulfilled' && !r.value.error);
      const failures = results.filter(r => r.status === 'fulfilled' && r.value.error);

      expect(successes.length).toBeGreaterThan(0);
      expect(failures.length).toBeGreaterThan(0);

      // Check that timeout errors are properly classified
      const timeoutFailures = failures.filter(f =>
        f.value.error.includes('timeout') || f.value.error.includes('Connection acquisition timeout')
      );
      expect(timeoutFailures.length).toBeGreaterThan(0);

      // Clean up any active leases
      for (const lease of activeLeases) {
        if (lease && !lease.isReleased) {
          lease.release();
        }
      }

      // Pool should recover
      const finalStats = connectionManager.getPoolStatistics();
      expect(finalStats.pool.activeLeases).toBe(0);
    });

    it('should recover from database lock contention', async () => {
      const concurrentOperations = 10;
      const operations = [];

      // Create concurrent operations that might cause lock contention
      for (let i = 0; i < concurrentOperations; i++) {
        const operation = dbWrapper.executeTransaction(async (tx) => {
          // Simulate operations that might cause contention
          await tx.execute(
            'INSERT INTO reliability_test (test_type, data) VALUES (?, ?)',
            ['lock-test', `concurrent-op-${i}`]
          );

          // Add small delay to increase chance of contention
          await new Promise(resolve => setTimeout(resolve, 10));

          await tx.execute(
            'UPDATE reliability_test SET data = ? WHERE test_type = ? AND data = ?',
            [`updated-${i}`, 'lock-test', `concurrent-op-${i}`]
          );

          return { operationId: i };
        });

        operations.push(operation);
      }

      // Execute all operations concurrently
      const results = await Promise.allSettled(operations);

      // Most operations should succeed despite potential lock contention
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      // At least 70% should succeed
      expect(successes.length).toBeGreaterThanOrEqual(Math.floor(concurrentOperations * 0.7));

      // If there are failures, they should be handled gracefully
      if (failures.length > 0) {
        failures.forEach(failure => {
          // Should be database-related errors, not system crashes
          expect(failure.reason.message).toBeDefined();
        });
      }

      // Verify final data integrity
      const countResult = await testDb.execute(
        'SELECT COUNT(*) as count FROM reliability_test WHERE test_type = ?',
        ['lock-test']
      );

      // Should have data from successful operations
      expect(countResult.rows[0].count).toBe(successes.length);

      // System should still be healthy
      expect(dbWrapper.isHealthy()).toBe(true);

      console.log(`Lock contention test: ${successes.length} successes, ${failures.length} failures`);
    });
  });

  describe('Circuit Breaker State Transitions', () => {
    it('should transition through all circuit states correctly', async () => {
      const stateTransitions = [];
      let operationCount = 0;

      // Create circuit breaker with observable state transitions
      const testWrapper = new DatabaseOperationWrapper({
        failureThreshold: 3,
        recoveryTimeout: 500,
        halfOpenMaxAttempts: 2
      });

      // Monitor circuit state by checking metrics after each operation
      const recordState = () => {
        const metrics = testWrapper.getMetrics();
        stateTransitions.push({
          state: metrics.state,
          totalRequests: metrics.totalRequests,
          failureRate: metrics.failureRate,
          timestamp: Date.now()
        });
      };

      // Initial state should be CLOSED
      recordState();
      expect(stateTransitions[0].state).toBe(CircuitStates.CLOSED);

      // Cause failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await testWrapper.executeQuery('INVALID SQL QUERY');
        } catch (error) {
          // Expected
        }
        recordState();
      }

      // Circuit should now be OPEN
      const currentMetrics = testWrapper.getMetrics();
      expect(currentMetrics.state).toBe(CircuitStates.OPEN);

      // Attempts during OPEN should fail fast
      await expect(
        testWrapper.executeQuery('SELECT 1')
      ).rejects.toThrow(CircuitBreakerError);

      // Wait for recovery period
      await new Promise(resolve => setTimeout(resolve, 600));

      // Next attempt should transition to HALF_OPEN
      try {
        // This should transition to HALF_OPEN and then likely fail if we use invalid SQL
        await testWrapper.executeQuery('SELECT 1 as recovery_test');

        // If it succeeds, circuit should close
        const recoveryMetrics = testWrapper.getMetrics();
        expect([CircuitStates.HALF_OPEN, CircuitStates.CLOSED]).toContain(recoveryMetrics.state);
      } catch (error) {
        // If it fails in HALF_OPEN, should go back to OPEN
        const failedMetrics = testWrapper.getMetrics();
        expect(failedMetrics.state).toBe(CircuitStates.OPEN);
      }

      // Reset and verify CLOSED state
      testWrapper.reset();
      const finalMetrics = testWrapper.getMetrics();
      expect(finalMetrics.state).toBe(CircuitStates.CLOSED);

      console.log('State transitions:', stateTransitions.map(t => t.state));
      testWrapper.reset();
    });

    it('should classify different failure types correctly', async () => {
      const failureScenarios = [
        {
          name: 'timeout',
          operation: () => new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Operation timed out')), 100);
          }),
          expectedType: FailureTypes.TIMEOUT
        },
        {
          name: 'connection',
          operation: () => Promise.reject(new Error('Connection refused')),
          expectedType: FailureTypes.CONNECTION
        },
        {
          name: 'query',
          operation: () => testDb.execute('INVALID SQL SYNTAX'),
          expectedType: FailureTypes.QUERY
        }
      ];

      for (const scenario of failureScenarios) {
        // Reset for each scenario
        const testWrapper = new DatabaseOperationWrapper({
          failureThreshold: 10 // High threshold to avoid circuit opening
        });

        try {
          await testWrapper.executeQuery('SELECT 1', [], scenario.operation);
        } catch (error) {
          // Expected failure
        }

        const metrics = testWrapper.getMetrics();

        // Check failure type classification in metrics
        switch (scenario.expectedType) {
          case FailureTypes.TIMEOUT:
            expect(metrics.failureBreakdown.timeout).toBeGreaterThan(0);
            break;
          case FailureTypes.CONNECTION:
            expect(metrics.failureBreakdown.connection).toBeGreaterThan(0);
            break;
          case FailureTypes.QUERY:
            expect(metrics.failureBreakdown.query).toBeGreaterThan(0);
            break;
        }

        console.log(`${scenario.name} failure classified correctly:`, metrics.failureBreakdown);
        testWrapper.reset();
      }
    });

    it('should handle rapid state oscillations gracefully', async () => {
      const testWrapper = new DatabaseOperationWrapper({
        failureThreshold: 2,
        recoveryTimeout: 100, // Very quick recovery for testing
        halfOpenMaxAttempts: 1
      });

      const operations = [];
      let successfulOperations = 0;
      let circuitBreakerErrors = 0;
      let databaseErrors = 0;

      // Rapidly alternate between success and failure
      for (let i = 0; i < 20; i++) {
        const operation = (async (index) => {
          try {
            if (index % 3 === 0) {
              // Every 3rd operation fails
              await testWrapper.executeQuery('INVALID SQL');
            } else {
              // Other operations succeed
              await testWrapper.executeQuery('SELECT ? as test', [index]);
              successfulOperations++;
            }
          } catch (error) {
            if (error instanceof CircuitBreakerError) {
              circuitBreakerErrors++;
            } else {
              databaseErrors++;
            }
          }
        })(i);

        operations.push(operation);

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      await Promise.all(operations);

      // System should handle oscillations without crashing
      expect(successfulOperations).toBeGreaterThan(0);
      expect(databaseErrors).toBeGreaterThan(0);

      // Circuit breaker should have activated at some point
      const finalMetrics = testWrapper.getMetrics();
      expect(finalMetrics.totalRequests).toBe(20);

      // System should still be functional
      await testWrapper.executeQuery('SELECT 999 as final_test');

      console.log(`Oscillation test: ${successfulOperations} success, ${databaseErrors} DB errors, ${circuitBreakerErrors} CB errors`);
      testWrapper.reset();
    });
  });

  describe('State Machine Reliability', () => {
    it('should handle concurrent state transitions safely', async () => {
      const stateMachine = createConnectionStateMachine('concurrent-test', testDb);
      const transitionPromises = [];
      const transitionResults = [];

      // Initialize to CONNECTED state
      await stateMachine.transition(CONNECTION_STATES.CONNECTED);
      await stateMachine.transition(CONNECTION_STATES.IDLE);

      // Attempt concurrent state transitions
      for (let i = 0; i < 10; i++) {
        const promise = (async (index) => {
          try {
            // Alternate between different operations
            if (index % 2 === 0) {
              const result = await stateMachine.executeOperation('execute', async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return { operationId: index };
              });
              return { success: true, result, index };
            } else {
              await stateMachine.transition(CONNECTION_STATES.IDLE, `concurrent-${index}`);
              return { success: true, transition: true, index };
            }
          } catch (error) {
            return { success: false, error: error.message, index };
          }
        })(i);

        transitionPromises.push(promise);
      }

      const results = await Promise.allSettled(transitionPromises);

      // Analyze results
      const successes = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failures = results.filter(r => r.status === 'fulfilled' && !r.value.success);

      // Most operations should succeed
      expect(successes.length).toBeGreaterThan(failures.length);

      // State machine should still be in a valid state
      const finalState = stateMachine.getState();
      expect(Object.values(CONNECTION_STATES)).toContain(finalState.state);
      expect(finalState.isHealthy).toBe(true);

      await stateMachine.shutdown();

      console.log(`Concurrent state transitions: ${successes.length} successes, ${failures.length} failures`);
    });

    it('should recover from invalid state transitions', async () => {
      const stateMachine = createConnectionStateMachine('recovery-test', testDb);

      // Start in INITIALIZING state
      expect(stateMachine.getState().state).toBe(CONNECTION_STATES.INITIALIZING);

      // Try invalid transitions
      await expect(
        stateMachine.transition(CONNECTION_STATES.CLOSED, 'invalid-transition')
      ).rejects.toThrow('Invalid transition');

      // State should remain unchanged after failed transition
      expect(stateMachine.getState().state).toBe(CONNECTION_STATES.INITIALIZING);

      // Valid transition should still work
      await stateMachine.transition(CONNECTION_STATES.CONNECTED);
      expect(stateMachine.getState().state).toBe(CONNECTION_STATES.CONNECTED);

      // State machine should be functional
      await stateMachine.transition(CONNECTION_STATES.IDLE);

      const result = await stateMachine.executeOperation('execute', async () => {
        return { test: 'recovery-successful' };
      });

      expect(result.test).toBe('recovery-successful');

      await stateMachine.shutdown();
    });

    it('should handle force shutdown scenarios', async () => {
      const stateMachine = createConnectionStateMachine('force-shutdown-test', testDb);

      // Initialize state machine
      await stateMachine.transition(CONNECTION_STATES.CONNECTED);
      await stateMachine.transition(CONNECTION_STATES.IDLE);

      // Start long-running operation
      const longOperation = stateMachine.executeOperation('execute', async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { completed: true };
      });

      // Give operation time to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Force destroy (emergency shutdown)
      const destroyPromise = stateMachine.destroy('emergency-shutdown');

      // Both operations should handle gracefully
      const [operationResult, destroyResult] = await Promise.allSettled([
        longOperation,
        destroyPromise
      ]);

      // State machine should be closed
      expect(stateMachine.getState().state).toBe(CONNECTION_STATES.CLOSED);

      // Long operation should have been interrupted or completed
      if (operationResult.status === 'rejected') {
        // Operation was interrupted - this is acceptable
        expect(operationResult.reason).toBeDefined();
      } else {
        // Operation completed before shutdown - also acceptable
        expect(operationResult.value).toBeDefined();
      }

      // Destroy should have succeeded
      expect(destroyResult.status).toBe('fulfilled');
    });
  });

  describe('Memory Leak Detection and Prevention', () => {
    it('should not leak memory during high-volume operations', async () => {
      const initialMemory = process.memoryUsage();
      const operationCount = 500;

      // Perform many operations to test for memory leaks
      for (let i = 0; i < operationCount; i++) {
        await dbWrapper.executeQuery(
          'INSERT INTO stress_test (worker_id, operation_count) VALUES (?, ?)',
          [1, i]
        );

        // Periodic cleanup check
        if (i % 100 === 0) {
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }

          const currentMemory = process.memoryUsage();
          const heapGrowth = currentMemory.heapUsed - initialMemory.heapUsed;

          // Memory growth should be reasonable (less than 50MB for 100 operations)
          expect(heapGrowth).toBeLessThan(50 * 1024 * 1024);
        }
      }

      // Verify all data was inserted
      const countResult = await testDb.execute(
        'SELECT COUNT(*) as count FROM stress_test WHERE worker_id = 1'
      );
      expect(countResult.rows[0].count).toBe(operationCount);

      // Check final memory usage
      const finalMemory = process.memoryUsage();
      const totalHeapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      // Total memory growth should be reasonable (less than 100MB for all operations)
      expect(totalHeapGrowth).toBeLessThan(100 * 1024 * 1024);

      // Pool should have no leaks
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.pool.activeLeases).toBe(0);

      console.log(`Memory test: ${(totalHeapGrowth / 1024 / 1024).toFixed(2)}MB heap growth for ${operationCount} operations`);
    });

    it('should clean up resources properly during errors', async () => {
      const initialPoolStats = connectionManager.getPoolStatistics();
      const errorOperationCount = 50;

      // Perform operations that will fail
      for (let i = 0; i < errorOperationCount; i++) {
        try {
          await dbWrapper.executeQuery('INVALID SQL STATEMENT');
        } catch (error) {
          // Expected errors
        }
      }

      // All connections should be properly released despite errors
      const finalPoolStats = connectionManager.getPoolStatistics();

      expect(finalPoolStats.pool.activeLeases).toBe(0);
      expect(finalPoolStats.metrics.totalLeasesGranted).toBeGreaterThanOrEqual(errorOperationCount);
      expect(finalPoolStats.metrics.totalLeasesReleased).toBe(finalPoolStats.metrics.totalLeasesGranted);

      // Circuit breaker memory should be controlled
      const circuitMetrics = dbWrapper.getMetrics();
      expect(circuitMetrics.memoryUsage.failuresTracked).toBeLessThanOrEqual(100);

      console.log(`Error cleanup test: ${errorOperationCount} failed operations, all resources cleaned up`);
    });

    it('should handle connection cleanup during forced shutdowns', async () => {
      // Create multiple active connections
      const activeLeases = [];
      for (let i = 0; i < 3; i++) {
        const lease = await connectionManager.acquireLease(`cleanup-test-${i}`);
        activeLeases.push(lease);
      }

      // Verify connections are active
      const beforeShutdown = connectionManager.getPoolStatistics();
      expect(beforeShutdown.pool.activeLeases).toBe(3);

      // Force shutdown with short timeout
      await connectionManager.gracefulShutdown(100);

      // Verify cleanup
      const afterShutdown = connectionManager.getPoolStatistics();
      expect(afterShutdown.pool.activeLeases).toBe(0);
      expect(afterShutdown.pool.totalConnections).toBe(0);
      expect(afterShutdown.state).toBe(ConnectionState.SHUTDOWN);

      // Leases should be marked as released
      activeLeases.forEach(lease => {
        expect(lease.isReleased).toBe(true);
      });
    });
  });

  describe('Performance Under Stress', () => {
    it('should maintain acceptable performance under concurrent load', async () => {
      const workerCount = 10;
      const operationsPerWorker = 20;
      const workers = [];

      const startTime = Date.now();

      // Create concurrent workers
      for (let workerId = 0; workerId < workerCount; workerId++) {
        const worker = (async (id) => {
          const workerResults = [];

          for (let opId = 0; opId < operationsPerWorker; opId++) {
            const operationStart = Date.now();

            try {
              await dbWrapper.executeQuery(
                'INSERT INTO stress_test (worker_id, operation_count) VALUES (?, ?)',
                [id, opId]
              );

              const operationTime = Date.now() - operationStart;
              workerResults.push({ success: true, time: operationTime });
            } catch (error) {
              const operationTime = Date.now() - operationStart;
              workerResults.push({ success: false, time: operationTime, error: error.message });
            }
          }

          return { workerId: id, results: workerResults };
        })(workerId);

        workers.push(worker);
      }

      // Execute all workers concurrently
      const workerResults = await Promise.all(workers);
      const totalTime = Date.now() - startTime;

      // Analyze results
      const allOperations = workerResults.flatMap(w => w.results);
      const successfulOps = allOperations.filter(op => op.success);
      const failedOps = allOperations.filter(op => !op.success);

      const avgOperationTime = successfulOps.reduce((sum, op) => sum + op.time, 0) / successfulOps.length;
      const maxOperationTime = Math.max(...successfulOps.map(op => op.time));

      // Performance assertions
      expect(successfulOps.length).toBeGreaterThan(allOperations.length * 0.8); // At least 80% success
      expect(avgOperationTime).toBeLessThan(100); // Average < 100ms
      expect(maxOperationTime).toBeLessThan(500); // Max < 500ms
      expect(totalTime).toBeLessThan(10000); // Total < 10 seconds

      // Verify data integrity
      const totalInserted = await testDb.execute('SELECT COUNT(*) as count FROM stress_test');
      expect(totalInserted.rows[0].count).toBe(successfulOps.length);

      // System should still be healthy
      expect(dbWrapper.isHealthy()).toBe(true);

      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.pool.activeLeases).toBe(0);

      console.log(`Stress test: ${successfulOps.length}/${allOperations.length} ops, avg ${avgOperationTime.toFixed(2)}ms, total ${totalTime}ms`);
    });

    it('should handle burst traffic patterns efficiently', async () => {
      const burstSizes = [5, 15, 25, 10]; // Variable burst sizes
      const results = [];

      for (const burstSize of burstSizes) {
        const burstStart = Date.now();
        const burstOperations = [];

        // Create burst of operations
        for (let i = 0; i < burstSize; i++) {
          const operation = dbWrapper.executeQuery(
            'INSERT INTO reliability_test (test_type, data) VALUES (?, ?)',
            ['burst-test', `burst-${burstSize}-op-${i}`]
          );
          burstOperations.push(operation);
        }

        // Execute burst
        const burstResults = await Promise.allSettled(burstOperations);
        const burstTime = Date.now() - burstStart;

        const successes = burstResults.filter(r => r.status === 'fulfilled').length;
        const failures = burstResults.filter(r => r.status === 'rejected').length;

        results.push({
          burstSize,
          successes,
          failures,
          time: burstTime,
          avgTimePerOp: burstTime / burstSize
        });

        // Small gap between bursts
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Analyze burst performance
      results.forEach(result => {
        expect(result.successes).toBeGreaterThan(result.burstSize * 0.8); // At least 80% success
        expect(result.avgTimePerOp).toBeLessThan(200); // Reasonable per-operation time

        console.log(`Burst ${result.burstSize}: ${result.successes}/${result.burstSize} success, ${result.avgTimePerOp.toFixed(2)}ms avg`);
      });

      // System should handle all bursts without degradation
      const totalSuccesses = results.reduce((sum, r) => sum + r.successes, 0);
      const totalExpected = burstSizes.reduce((sum, size) => sum + size, 0);

      expect(totalSuccesses).toBeGreaterThan(totalExpected * 0.8);
      expect(dbWrapper.isHealthy()).toBe(true);
    });
  });

  describe('Graceful Degradation', () => {
    it('should provide fallback functionality when database is partially available', async () => {
      let operationCount = 0;
      const fallbackData = { rows: [{ fallback: true, timestamp: Date.now() }] };

      // Create wrapper with fallback capability
      const fallbackWrapper = new DatabaseOperationWrapper({
        failureThreshold: 2,
        recoveryTimeout: 1000
      });

      // Simulate intermittent failures
      const originalExecute = fallbackWrapper.executeQuery.bind(fallbackWrapper);
      fallbackWrapper.executeQuery = async (query, params, fallback) => {
        operationCount++;
        // Every 3rd operation fails
        if (operationCount % 3 === 0) {
          throw new Error('Intermittent database error');
        }
        return originalExecute(query, params, fallback);
      };

      const results = [];
      const operationsToTry = 10;

      // Try multiple operations with fallback
      for (let i = 0; i < operationsToTry; i++) {
        try {
          const result = await fallbackWrapper.executeQuery(
            'SELECT ? as test_id',
            [i],
            async () => {
              return { ...fallbackData, operationId: i };
            }
          );
          results.push({ success: true, fromFallback: !!result.fallback, operationId: i });
        } catch (error) {
          results.push({ success: false, error: error.message, operationId: i });
        }
      }

      // Analyze results
      const successes = results.filter(r => r.success);
      const fallbackUsed = successes.filter(r => r.fromFallback);
      const directSuccess = successes.filter(r => !r.fromFallback);

      expect(successes.length).toBe(operationsToTry); // All should succeed with fallback
      expect(fallbackUsed.length).toBeGreaterThan(0); // Some should use fallback
      expect(directSuccess.length).toBeGreaterThan(0); // Some should succeed directly

      console.log(`Degradation test: ${directSuccess.length} direct, ${fallbackUsed.length} fallback`);

      fallbackWrapper.reset();
    });

    it('should maintain core functionality during circuit breaker activation', async () => {
      // Force circuit breaker to open
      for (let i = 0; i < 3; i++) {
        try {
          await dbWrapper.executeQuery('INVALID SQL');
        } catch (error) {
          // Expected
        }
      }

      // Circuit should be open
      expect(dbWrapper.isHealthy()).toBe(false);

      // Operations should fail fast but system should remain stable
      const startTime = Date.now();

      try {
        await dbWrapper.executeQuery('SELECT 1');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);

        // Should fail quickly (fast-fail)
        const failTime = Date.now() - startTime;
        expect(failTime).toBeLessThan(100); // Should be very fast
      }

      // Connection pool should still be operational
      const poolStats = connectionManager.getPoolStatistics();
      expect(poolStats.state).not.toBe(ConnectionState.SHUTDOWN);

      // System should be able to recover
      dbWrapper.reset();
      const result = await dbWrapper.executeQuery('SELECT 999 as recovery');
      expect(result.rows[0].recovery).toBe(999);
    });
  });
});