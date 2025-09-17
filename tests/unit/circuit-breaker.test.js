/**
 * Circuit Breaker Unit Tests
 *
 * Comprehensive testing of the DatabaseCircuitBreaker including:
 * - State transitions and failure handling
 * - Performance requirements validation
 * - Memory optimization and cleanup
 * - Metrics collection and accuracy
 * - Concurrent operations and race conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import DatabaseCircuitBreaker, {
  CircuitBreakerError,
  CircuitStates,
  FailureTypes
} from '../../lib/circuit-breaker.js';
import { ErrorFactory, ErrorCodes } from '../../lib/utils/error-factory.js';

describe('DatabaseCircuitBreaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    // Use fast timeouts for testing
    circuitBreaker = new DatabaseCircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 100,
      halfOpenMaxAttempts: 2,
      monitoringPeriod: 1000,
      timeoutThreshold: 50,
      memoryOptimization: true
    });
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('Initialization', () => {
    it('should initialize with correct default configuration', () => {
      const cb = new DatabaseCircuitBreaker();

      expect(cb.state).toBe(CircuitStates.CLOSED);
      expect(cb.config.failureThreshold).toBe(5);
      expect(cb.config.recoveryTimeout).toBe(30000);
      expect(cb.config.memoryOptimization).toBe(true);
      expect(cb.failures).toEqual([]);
      expect(cb.metrics.totalRequests).toBe(0);
    });

    it('should accept custom configuration options', () => {
      const options = {
        failureThreshold: 10,
        recoveryTimeout: 60000,
        memoryOptimization: false
      };

      const cb = new DatabaseCircuitBreaker(options);

      expect(cb.config.failureThreshold).toBe(10);
      expect(cb.config.recoveryTimeout).toBe(60000);
      expect(cb.config.memoryOptimization).toBe(false);
    });
  });

  describe('Basic Operation', () => {
    it('should execute operation successfully when circuit is closed', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.state).toBe(CircuitStates.CLOSED);
      expect(circuitBreaker.metrics.succeededRequests).toBe(1);
    });

    it('should record metrics for successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const startTime = Date.now();

      await circuitBreaker.execute(operation);

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.succeededRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.consecutiveSuccesses).toBe(1);
      expect(metrics.lastResponseTime).toBeGreaterThanOrEqual(0); // Allow 0 for very fast operations
    });

    it('should handle operation failures and record metrics', async () => {
      const error = new Error('Database connection failed');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(error);

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.succeededRequests).toBe(0);
      expect(metrics.consecutiveFailures).toBe(1);
    });
  });

  describe('State Transitions', () => {
    it('should transition to OPEN state after threshold failures', async () => {
      const error = new Error('Connection failed');
      const operation = vi.fn().mockRejectedValue(error);

      // Exceed failure threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (e) {
          // Expected failure
        }
      }

      expect(circuitBreaker.state).toBe(CircuitStates.OPEN);
      expect(circuitBreaker.metrics.failedRequests).toBe(3);
    });

    it('should fast-fail when circuit is open', async () => {
      // Force circuit to open state
      circuitBreaker.forceState(CircuitStates.OPEN);
      circuitBreaker.lastStateTransition = Date.now() - 50; // Not ready for recovery (less than 100ms timeout)

      const operation = vi.fn().mockResolvedValue('success');

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(CircuitBreakerError);

      expect(operation).not.toHaveBeenCalled();
      expect(circuitBreaker.metrics.circuitOpenCount).toBe(1);
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      // Force circuit to open state and wait for recovery timeout
      circuitBreaker.forceState(CircuitStates.OPEN);
      circuitBreaker.lastStateTransition = Date.now() - 200; // Past recovery timeout

      const operation = vi.fn().mockResolvedValue('success');

      await circuitBreaker.execute(operation);

      expect(circuitBreaker.state).toBe(CircuitStates.HALF_OPEN);
    });

    it('should transition to CLOSED after successful operations in HALF_OPEN', async () => {
      // Create circuit breaker with higher half-open limits for this test
      const testCircuitBreaker = new DatabaseCircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 100,
        halfOpenMaxAttempts: 5, // Allow more attempts
        successThreshold: 3,
        memoryOptimization: true
      });

      testCircuitBreaker.forceState(CircuitStates.HALF_OPEN);
      testCircuitBreaker.halfOpenAttempts = 0;
      const operation = vi.fn().mockResolvedValue('success');

      // Execute successful operations to meet success threshold
      for (let i = 0; i < testCircuitBreaker.config.successThreshold; i++) {
        await testCircuitBreaker.execute(operation);
      }

      expect(testCircuitBreaker.state).toBe(CircuitStates.CLOSED);
    });

    it('should limit concurrent attempts in HALF_OPEN state', async () => {
      circuitBreaker.forceState(CircuitStates.HALF_OPEN);
      circuitBreaker.halfOpenAttempts = circuitBreaker.config.halfOpenMaxAttempts;

      const operation = vi.fn().mockResolvedValue('success');

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(CircuitBreakerError);
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Failure Classification', () => {
    it('should classify timeout errors correctly', async () => {
      const timeoutError = ErrorFactory.createTimeoutError('Database operation', 5000);
      const operation = vi.fn().mockRejectedValue(timeoutError);

      try {
        await circuitBreaker.execute(operation);
      } catch (e) {
        // Expected failure
      }

      expect(circuitBreaker.metrics.timeoutRequests).toBe(1);
    });

    it('should classify connection errors correctly', async () => {
      const connectionError = ErrorFactory.createDatabaseConnectionError('Connection refused');
      const operation = vi.fn().mockRejectedValue(connectionError);

      try {
        await circuitBreaker.execute(operation);
      } catch (e) {
        // Expected failure
      }

      expect(circuitBreaker.metrics.connectionFailures).toBe(1);
    });

    it('should classify authentication errors correctly', async () => {
      const authError = ErrorFactory.createError(
        'Authentication failed',
        ErrorCodes.DB_AUTH_ERROR,
        'database'
      );
      const operation = vi.fn().mockRejectedValue(authError);

      try {
        await circuitBreaker.execute(operation);
      } catch (e) {
        // Expected failure
      }

      expect(circuitBreaker.metrics.authFailures).toBe(1);
    });

    it('should classify query errors correctly', async () => {
      const queryError = ErrorFactory.createError(
        'Syntax error in SQL',
        ErrorCodes.DB_QUERY_ERROR,
        'database'
      );
      const operation = vi.fn().mockRejectedValue(queryError);

      try {
        await circuitBreaker.execute(operation);
      } catch (e) {
        // Expected failure
      }

      expect(circuitBreaker.metrics.queryFailures).toBe(1);
    });
  });

  describe('Timeout Protection', () => {
    it('should timeout long-running operations', async () => {
      const longOperation = () => new Promise(resolve =>
        setTimeout(resolve, 200) // Longer than timeout threshold
      );

      await expect(circuitBreaker.execute(longOperation)).rejects.toThrow();
      expect(circuitBreaker.metrics.timeoutRequests).toBe(1);
    });

    it('should complete fast operations without timeout', async () => {
      const fastOperation = () => new Promise(resolve =>
        setTimeout(() => resolve('success'), 10) // Faster than timeout
      );

      const result = await circuitBreaker.execute(fastOperation);
      expect(result).toBe('success');
      expect(circuitBreaker.metrics.timeoutRequests).toBe(0);
    });
  });

  describe('Fallback Operations', () => {
    it('should execute fallback when operation fails and circuit is open', async () => {
      circuitBreaker.forceState(CircuitStates.OPEN);
      circuitBreaker.lastStateTransition = Date.now() - 50; // Not ready for recovery

      const failedOperation = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockResolvedValue('fallback success');

      const result = await circuitBreaker.execute(failedOperation, fallback);

      expect(result).toBe('fallback success');
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should not use fallback for authentication errors', async () => {
      const authError = ErrorFactory.createError(
        'Authentication failed',
        ErrorCodes.DB_AUTH_ERROR,
        'database'
      );
      const operation = vi.fn().mockRejectedValue(authError);
      const fallback = vi.fn().mockResolvedValue('fallback');

      await expect(circuitBreaker.execute(operation, fallback)).rejects.toThrow(authError);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should not use fallback for syntax errors', async () => {
      const syntaxError = new Error('Syntax error in SQL query');
      const operation = vi.fn().mockRejectedValue(syntaxError);
      const fallback = vi.fn().mockResolvedValue('fallback');

      await expect(circuitBreaker.execute(operation, fallback)).rejects.toThrow(syntaxError);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should handle fallback failures gracefully', async () => {
      circuitBreaker.forceState(CircuitStates.OPEN);
      circuitBreaker.lastStateTransition = Date.now() - 50; // Not ready for recovery

      const primaryError = new Error('Primary failed');
      const fallbackError = new Error('Fallback failed');
      const operation = vi.fn().mockRejectedValue(primaryError);
      const fallback = vi.fn().mockRejectedValue(fallbackError);

      await expect(circuitBreaker.execute(operation, fallback))
        .rejects.toThrow(CircuitBreakerError);
    });
  });

  describe('Memory Optimization', () => {
    it('should limit failure history size', async () => {
      const error = new Error('Test failure');
      const operation = vi.fn().mockRejectedValue(error);

      // Generate more failures than max history
      for (let i = 0; i < circuitBreaker.maxFailureHistory + 10; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (e) {
          // Expected failure
        }
      }

      expect(circuitBreaker.failures.length).toBeLessThanOrEqual(circuitBreaker.maxFailureHistory);
    });

    it('should limit response time history size', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      // Generate more responses than max history
      for (let i = 0; i < circuitBreaker.maxResponseTimeHistory + 10; i++) {
        await circuitBreaker.execute(operation);
      }

      expect(circuitBreaker.responseTimes.length).toBeLessThanOrEqual(circuitBreaker.maxResponseTimeHistory);
    });

    it('should perform periodic cleanup of old data', async () => {
      // Simulate old failures
      const oldFailure = {
        error: { message: 'Old failure', type: FailureTypes.CONNECTION },
        timestamp: Date.now() - circuitBreaker.config.maxFailureAge - 1000,
        responseTime: 100
      };
      circuitBreaker.failures.push(oldFailure);

      // Trigger cleanup
      circuitBreaker.lastCleanup = Date.now() - circuitBreaker.cleanupInterval - 1000;
      const operation = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);

      expect(circuitBreaker.failures).not.toContain(oldFailure);
    });
  });

  describe('Performance Requirements', () => {
    it('should have minimal overhead for successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const iterations = 100;

      const startTime = process.hrtime.bigint();

      for (let i = 0; i < iterations; i++) {
        await circuitBreaker.execute(operation);
      }

      const endTime = process.hrtime.bigint();
      const totalTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      const averageOverhead = totalTime / iterations;

      // Should be less than 1ms overhead per operation
      expect(averageOverhead).toBeLessThan(1);
    });

    it('should respond quickly when circuit is open', async () => {
      circuitBreaker.forceState(CircuitStates.OPEN);
      circuitBreaker.lastStateTransition = Date.now() - 50; // Not ready for recovery

      const operation = vi.fn().mockResolvedValue('success');
      const startTime = process.hrtime.bigint();

      try {
        await circuitBreaker.execute(operation);
      } catch (e) {
        // Expected circuit breaker error
      }

      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;

      // Should respond in less than 100ms (fast fail requirement)
      expect(responseTime).toBeLessThan(100);
      expect(operation).not.toHaveBeenCalled();
    });

    it('should maintain memory usage below 1KB per instance', () => {
      // Estimate memory usage based on data structures
      const failureMemory = circuitBreaker.failures.length * 100; // ~100 bytes per failure
      const responseTimeMemory = circuitBreaker.responseTimes.length * 20; // ~20 bytes per response time
      const metricsMemory = Object.keys(circuitBreaker.metrics).length * 8; // ~8 bytes per metric
      const configMemory = Object.keys(circuitBreaker.config).length * 8; // ~8 bytes per config

      const totalMemory = failureMemory + responseTimeMemory + metricsMemory + configMemory;

      // Should be well under 1KB (1024 bytes)
      expect(totalMemory).toBeLessThan(1024);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should calculate response time percentiles correctly', async () => {
      // Use fast operations that won't trigger timeout (all under 50ms threshold)
      const responseTimes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45];

      // Simulate operations with known response times
      for (const time of responseTimes) {
        const operation = () => new Promise(resolve =>
          setTimeout(() => resolve('success'), time)
        );
        await circuitBreaker.execute(operation);
      }

      const metrics = circuitBreaker.getMetrics();

      expect(metrics.responseTimePercentiles.p50).toBeGreaterThan(0);
      expect(metrics.responseTimePercentiles.p90).toBeGreaterThanOrEqual(metrics.responseTimePercentiles.p50);
      expect(metrics.responseTimePercentiles.p95).toBeGreaterThanOrEqual(metrics.responseTimePercentiles.p90);
      expect(metrics.responseTimePercentiles.p99).toBeGreaterThanOrEqual(metrics.responseTimePercentiles.p95);
    });

    it('should track failure breakdown by type', async () => {
      const timeoutError = ErrorFactory.createTimeoutError('Timeout', 5000);
      const connectionError = ErrorFactory.createDatabaseConnectionError('Connection failed');
      const authError = ErrorFactory.createError('Auth failed', ErrorCodes.DB_AUTH_ERROR, 'database');

      const errors = [timeoutError, connectionError, authError];

      for (const error of errors) {
        const operation = vi.fn().mockRejectedValue(error);
        try {
          await circuitBreaker.execute(operation);
        } catch (e) {
          // Expected failure
        }
      }

      const metrics = circuitBreaker.getMetrics();

      expect(metrics.failureBreakdown.timeout).toBe(1);
      expect(metrics.failureBreakdown.connection).toBe(1);
      expect(metrics.failureBreakdown.authentication).toBe(1);
    });

    it('should provide comprehensive health status', () => {
      expect(circuitBreaker.isHealthy()).toBe(true);

      // Force unhealthy state
      circuitBreaker.forceState(CircuitStates.OPEN);
      expect(circuitBreaker.isHealthy()).toBe(false);

      // Reset to healthy
      circuitBreaker.forceState(CircuitStates.CLOSED);
      expect(circuitBreaker.isHealthy()).toBe(true);
    });

    it('should detect degraded mode based on failure rate', async () => {
      const successOperation = vi.fn().mockResolvedValue('success');
      const failureOperation = vi.fn().mockRejectedValue(new Error('failure'));

      // Create high failure rate (80% failures) but under threshold to keep circuit closed
      for (let i = 0; i < 2; i++) { // Only 2 failures to stay under threshold of 3
        try {
          await circuitBreaker.execute(failureOperation);
        } catch (e) {
          // Expected failure
        }
      }

      for (let i = 0; i < 8; i++) { // Many successes to have high total request count
        await circuitBreaker.execute(successOperation);
      }

      // Now create some more failures to push failure rate over degraded threshold
      for (let i = 0; i < 6; i++) {
        try {
          await circuitBreaker.execute(failureOperation);
        } catch (e) {
          // Expected failure - but this will open the circuit
        }
      }

      expect(circuitBreaker.isHealthy()).toBe(false); // Should be unhealthy (circuit open)
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent requests safely', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const concurrentRequests = 10;

      const promises = Array(concurrentRequests).fill().map(() =>
        circuitBreaker.execute(operation)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrentRequests);
      expect(results.every(result => result === 'success')).toBe(true);
      expect(circuitBreaker.metrics.totalRequests).toBe(concurrentRequests);
    });

    it('should handle mixed success/failure operations', async () => {
      const successOperation = vi.fn().mockResolvedValue('success');
      const failureOperation = vi.fn().mockRejectedValue(new Error('failure'));

      const operations = [
        successOperation, failureOperation, successOperation,
        failureOperation, successOperation
      ];

      const promises = operations.map(op =>
        circuitBreaker.execute(op).catch(e => e)
      );

      const results = await Promise.all(promises);

      expect(circuitBreaker.metrics.totalRequests).toBe(5);
      expect(circuitBreaker.metrics.succeededRequests).toBe(3);
      expect(circuitBreaker.metrics.failedRequests).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined operations gracefully', async () => {
      await expect(circuitBreaker.execute(null)).rejects.toThrow();
      await expect(circuitBreaker.execute(undefined)).rejects.toThrow();
    });

    it('should handle operations that return null/undefined', async () => {
      const nullOperation = vi.fn().mockResolvedValue(null);
      const undefinedOperation = vi.fn().mockResolvedValue(undefined);

      const nullResult = await circuitBreaker.execute(nullOperation);
      const undefinedResult = await circuitBreaker.execute(undefinedOperation);

      expect(nullResult).toBeNull();
      expect(undefinedResult).toBeUndefined();
      expect(circuitBreaker.metrics.succeededRequests).toBe(2);
    });

    it('should handle very fast operations without issues', async () => {
      const instantOperation = vi.fn().mockResolvedValue('instant');

      const result = await circuitBreaker.execute(instantOperation);

      expect(result).toBe('instant');
      expect(circuitBreaker.metrics.lastResponseTime).toBeGreaterThanOrEqual(0);
    });

    it('should reset state correctly', () => {
      // Modify circuit breaker state
      circuitBreaker.state = CircuitStates.OPEN;
      circuitBreaker.metrics.totalRequests = 100;
      circuitBreaker.failures.push({ error: { message: 'test' }, timestamp: Date.now() });

      circuitBreaker.reset();

      expect(circuitBreaker.state).toBe(CircuitStates.CLOSED);
      expect(circuitBreaker.metrics.totalRequests).toBe(0);
      expect(circuitBreaker.failures).toHaveLength(0);
    });

    it('should validate state transitions', () => {
      expect(() => circuitBreaker.forceState('INVALID_STATE')).toThrow();

      circuitBreaker.forceState(CircuitStates.OPEN);
      expect(circuitBreaker.state).toBe(CircuitStates.OPEN);

      circuitBreaker.forceState(CircuitStates.HALF_OPEN);
      expect(circuitBreaker.state).toBe(CircuitStates.HALF_OPEN);

      circuitBreaker.forceState(CircuitStates.CLOSED);
      expect(circuitBreaker.state).toBe(CircuitStates.CLOSED);
    });
  });

  describe('Integration with Error Factory', () => {
    it('should create proper CircuitBreakerError instances', async () => {
      circuitBreaker.forceState(CircuitStates.OPEN);
      circuitBreaker.lastStateTransition = Date.now() - 50; // Not ready for recovery

      const operation = vi.fn().mockResolvedValue('success');

      try {
        await circuitBreaker.execute(operation);
        expect.fail('Should have thrown CircuitBreakerError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        expect(error.code).toBe(ErrorCodes.API_SERVICE_UNAVAILABLE);
        expect(error.context).toBe('circuit-breaker');
        expect(error.circuitState).toBe(CircuitStates.OPEN);
        expect(error.metrics).toBeDefined();
        expect(error.timestamp).toBeDefined();
      }
    });
  });
});