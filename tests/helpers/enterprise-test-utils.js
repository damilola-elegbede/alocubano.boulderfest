/**
 * Enterprise Database Testing Utilities
 *
 * Provides specialized utilities for testing the enterprise database architecture
 * including connection management, state machines, and circuit breakers.
 */

import { vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { getConnectionManager, resetConnectionManager } from '../../lib/connection-manager.js';
import { createConnectionStateMachine } from '../../lib/connection-state-machine.js';
import DatabaseCircuitBreaker, { CircuitStates } from '../../lib/circuit-breaker.js';
import { DatabaseOperationWrapper } from '../../lib/database-circuit-breaker-integration.js';

/**
 * Mock Database Client for Controlled Testing
 */
export class MockDatabaseClient {
  constructor(options = {}) {
    this.shouldFail = options.shouldFail || false;
    this.failureRate = options.failureRate || 0;
    this.latency = options.latency || 0;
    this.operationCount = 0;
    this.results = [];
    this.isConnected = true;
  }

  async execute(sql, params = []) {
    this.operationCount++;

    // Simulate latency
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }

    // Simulate failures
    if (this.shouldFail || (this.failureRate > 0 && Math.random() < this.failureRate)) {
      throw new Error(`Simulated database error on operation ${this.operationCount}`);
    }

    // Simulate successful result
    const result = {
      rows: [{ id: this.operationCount, sql, params }],
      rowsAffected: 1
    };

    this.results.push(result);
    return result;
  }

  async transaction(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Transaction callback must be a function');
    }

    // Simple transaction simulation
    const tx = {
      execute: this.execute.bind(this)
    };

    try {
      return await callback(tx);
    } catch (error) {
      throw error; // In real implementation, this would trigger rollback
    }
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      const result = await this.execute(statement.sql, statement.params);
      results.push(result);
    }
    return results;
  }

  async close() {
    this.isConnected = false;
  }

  // Test utilities
  setFailureMode(shouldFail, failureRate = 0) {
    this.shouldFail = shouldFail;
    this.failureRate = failureRate;
  }

  setLatency(latency) {
    this.latency = latency;
  }

  getOperationCount() {
    return this.operationCount;
  }

  getResults() {
    return [...this.results];
  }

  reset() {
    this.operationCount = 0;
    this.results = [];
    this.shouldFail = false;
    this.failureRate = 0;
    this.latency = 0;
    this.isConnected = true;
  }
}

/**
 * Performance Monitor for Testing
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      operationTimes: [],
      connectionAcquisitionTimes: [],
      memoryUsage: [],
      circuitBreakerStates: []
    };
    this.startTime = Date.now();
  }

  recordOperation(duration, success = true) {
    this.metrics.operationTimes.push({
      duration,
      success,
      timestamp: Date.now()
    });
  }

  recordConnectionAcquisition(duration) {
    this.metrics.connectionAcquisitionTimes.push({
      duration,
      timestamp: Date.now()
    });
  }

  recordMemoryUsage() {
    this.metrics.memoryUsage.push({
      ...process.memoryUsage(),
      timestamp: Date.now()
    });
  }

  recordCircuitBreakerState(state, metrics) {
    this.metrics.circuitBreakerStates.push({
      state,
      metrics: { ...metrics },
      timestamp: Date.now()
    });
  }

  getStatistics() {
    const operationTimes = this.metrics.operationTimes.map(o => o.duration);
    const connectionTimes = this.metrics.connectionAcquisitionTimes.map(c => c.duration);

    return {
      operations: {
        total: this.metrics.operationTimes.length,
        successful: this.metrics.operationTimes.filter(o => o.success).length,
        failed: this.metrics.operationTimes.filter(o => !o.success).length,
        averageTime: operationTimes.length > 0
          ? operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length
          : 0,
        maxTime: operationTimes.length > 0 ? Math.max(...operationTimes) : 0,
        minTime: operationTimes.length > 0 ? Math.min(...operationTimes) : 0
      },
      connections: {
        total: connectionTimes.length,
        averageAcquisitionTime: connectionTimes.length > 0
          ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
          : 0,
        maxAcquisitionTime: connectionTimes.length > 0 ? Math.max(...connectionTimes) : 0
      },
      memory: {
        samples: this.metrics.memoryUsage.length,
        peakHeapUsed: this.metrics.memoryUsage.length > 0
          ? Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed))
          : 0,
        heapGrowth: this.metrics.memoryUsage.length > 1
          ? this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1].heapUsed -
            this.metrics.memoryUsage[0].heapUsed
          : 0
      },
      circuitBreaker: {
        stateChanges: this.metrics.circuitBreakerStates.length,
        states: this.getStateFrequency()
      },
      duration: Date.now() - this.startTime
    };
  }

  getStateFrequency() {
    const frequency = {};
    this.metrics.circuitBreakerStates.forEach(record => {
      frequency[record.state] = (frequency[record.state] || 0) + 1;
    });
    return frequency;
  }

  reset() {
    this.metrics = {
      operationTimes: [],
      connectionAcquisitionTimes: [],
      memoryUsage: [],
      circuitBreakerStates: []
    };
    this.startTime = Date.now();
  }
}

/**
 * Test Scenario Builder
 */
export class TestScenarioBuilder {
  constructor() {
    this.scenarios = [];
  }

  addConcurrentOperations(count, operationFn, description = '') {
    this.scenarios.push({
      type: 'concurrent',
      count,
      operation: operationFn,
      description
    });
    return this;
  }

  addSequentialOperations(operations, description = '') {
    this.scenarios.push({
      type: 'sequential',
      operations,
      description
    });
    return this;
  }

  addFailureScenario(failureRate, duration, description = '') {
    this.scenarios.push({
      type: 'failure',
      failureRate,
      duration,
      description
    });
    return this;
  }

  addLoadTest(rampUpTime, steadyStateTime, rampDownTime, maxConcurrency, description = '') {
    this.scenarios.push({
      type: 'load',
      rampUpTime,
      steadyStateTime,
      rampDownTime,
      maxConcurrency,
      description
    });
    return this;
  }

  async execute(dbWrapper, monitor) {
    const results = [];

    for (const scenario of this.scenarios) {
      console.log(`Executing scenario: ${scenario.description || scenario.type}`);

      const scenarioStart = Date.now();
      let scenarioResult;

      try {
        switch (scenario.type) {
          case 'concurrent':
            scenarioResult = await this.executeConcurrent(scenario, dbWrapper, monitor);
            break;
          case 'sequential':
            scenarioResult = await this.executeSequential(scenario, dbWrapper, monitor);
            break;
          case 'failure':
            scenarioResult = await this.executeFailure(scenario, dbWrapper, monitor);
            break;
          case 'load':
            scenarioResult = await this.executeLoad(scenario, dbWrapper, monitor);
            break;
          default:
            throw new Error(`Unknown scenario type: ${scenario.type}`);
        }

        results.push({
          ...scenarioResult,
          duration: Date.now() - scenarioStart,
          success: true
        });
      } catch (error) {
        results.push({
          type: scenario.type,
          error: error.message,
          duration: Date.now() - scenarioStart,
          success: false
        });
      }
    }

    return results;
  }

  async executeConcurrent(scenario, dbWrapper, monitor) {
    const operations = [];

    for (let i = 0; i < scenario.count; i++) {
      operations.push(this.monitoredOperation(scenario.operation(i), monitor));
    }

    const results = await Promise.allSettled(operations);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return {
      type: 'concurrent',
      total: scenario.count,
      successful,
      failed,
      description: scenario.description
    };
  }

  async executeSequential(scenario, dbWrapper, monitor) {
    const results = [];

    for (const operation of scenario.operations) {
      try {
        const result = await this.monitoredOperation(operation(), monitor);
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      type: 'sequential',
      total: scenario.operations.length,
      successful,
      failed,
      description: scenario.description
    };
  }

  async executeFailure(scenario, dbWrapper, monitor) {
    // This would need to be implemented based on specific failure injection needs
    throw new Error('Failure scenario execution not implemented yet');
  }

  async executeLoad(scenario, dbWrapper, monitor) {
    // This would need to be implemented for load testing
    throw new Error('Load scenario execution not implemented yet');
  }

  async monitoredOperation(operationPromise, monitor) {
    const startTime = Date.now();

    try {
      const result = await operationPromise;
      monitor.recordOperation(Date.now() - startTime, true);
      return result;
    } catch (error) {
      monitor.recordOperation(Date.now() - startTime, false);
      throw error;
    }
  }

  reset() {
    this.scenarios = [];
    return this;
  }
}

/**
 * Connection Pool Test Utilities
 */
export class ConnectionPoolTestUtils {
  static async createTestPool(options = {}) {
    await resetConnectionManager();
    return getConnectionManager({
      maxConnections: 3,
      acquireTimeout: 5000,
      leaseTimeout: 10000,
      ...options
    });
  }

  static async acquireMultipleLeases(manager, count, operationPrefix = 'test') {
    const leases = [];

    for (let i = 0; i < count; i++) {
      const lease = await manager.acquireLease(`${operationPrefix}-${i}`);
      leases.push(lease);
    }

    return leases;
  }

  static releaseAllLeases(leases) {
    leases.forEach(lease => {
      if (!lease.isReleased) {
        lease.release();
      }
    });
  }

  static async validatePoolCleanup(manager, expectedActiveLeases = 0) {
    const stats = manager.getPoolStatistics();

    if (stats.pool.activeLeases !== expectedActiveLeases) {
      throw new Error(
        `Pool cleanup validation failed: expected ${expectedActiveLeases} active leases, got ${stats.pool.activeLeases}`
      );
    }

    if (stats.metrics.totalLeasesGranted !== stats.metrics.totalLeasesReleased + expectedActiveLeases) {
      throw new Error(
        `Lease accounting error: granted ${stats.metrics.totalLeasesGranted}, released ${stats.metrics.totalLeasesReleased}, active ${expectedActiveLeases}`
      );
    }

    return true;
  }
}

/**
 * Circuit Breaker Test Utilities
 */
export class CircuitBreakerTestUtils {
  static createTestWrapper(options = {}) {
    return new DatabaseOperationWrapper({
      failureThreshold: 3,
      recoveryTimeout: 1000,
      timeoutThreshold: 2000,
      halfOpenMaxAttempts: 2,
      ...options
    });
  }

  static async forceCircuitOpen(wrapper, failureCount = null) {
    const threshold = failureCount || wrapper.circuitBreaker.config.failureThreshold;

    for (let i = 0; i < threshold; i++) {
      try {
        await wrapper.executeQuery('INVALID SQL STATEMENT');
      } catch (error) {
        // Expected failure
      }
    }

    const metrics = wrapper.getMetrics();
    if (metrics.state !== CircuitStates.OPEN) {
      throw new Error(`Failed to open circuit: state is ${metrics.state}, expected ${CircuitStates.OPEN}`);
    }

    return metrics;
  }

  static async waitForRecoveryTimeout(wrapper) {
    const config = wrapper.circuitBreaker.config;
    await new Promise(resolve => setTimeout(resolve, config.recoveryTimeout + 100));
  }

  static validateMetrics(metrics, expectations = {}) {
    const validations = [];

    if (expectations.state !== undefined) {
      if (metrics.state !== expectations.state) {
        validations.push(`Expected state ${expectations.state}, got ${metrics.state}`);
      }
    }

    if (expectations.minRequests !== undefined) {
      if (metrics.totalRequests < expectations.minRequests) {
        validations.push(`Expected at least ${expectations.minRequests} requests, got ${metrics.totalRequests}`);
      }
    }

    if (expectations.maxFailureRate !== undefined) {
      if (metrics.failureRate > expectations.maxFailureRate) {
        validations.push(`Expected failure rate <= ${expectations.maxFailureRate}%, got ${metrics.failureRate}%`);
      }
    }

    if (expectations.isHealthy !== undefined) {
      if (metrics.isHealthy !== expectations.isHealthy) {
        validations.push(`Expected healthy=${expectations.isHealthy}, got ${metrics.isHealthy}`);
      }
    }

    if (validations.length > 0) {
      throw new Error(`Metric validation failed: ${validations.join(', ')}`);
    }

    return true;
  }
}

/**
 * State Machine Test Utilities
 */
export class StateMachineTestUtils {
  static createTestStateMachine(connectionId = 'test', mockConnection = null) {
    const connection = mockConnection || new MockDatabaseClient();
    return createConnectionStateMachine(connectionId, connection);
  }

  static async transitionThroughNormalFlow(stateMachine) {
    const { CONNECTION_STATES } = await import('../../lib/connection-state-machine.js');

    await stateMachine.transition(CONNECTION_STATES.CONNECTED);
    await stateMachine.transition(CONNECTION_STATES.IDLE);

    return stateMachine.getState();
  }

  static createStateObserver() {
    const observations = [];

    const observer = (event) => {
      observations.push({
        ...event,
        observedAt: Date.now()
      });
    };

    observer.getObservations = () => [...observations];
    observer.reset = () => observations.length = 0;

    return observer;
  }

  static async validateStateTransition(stateMachine, expectedState, timeout = 1000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const currentState = stateMachine.getState();
      if (currentState.state === expectedState) {
        return currentState;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const finalState = stateMachine.getState();
    throw new Error(
      `State transition timeout: expected ${expectedState}, got ${finalState.state} after ${timeout}ms`
    );
  }
}

/**
 * Test Data Generator
 */
export class TestDataGenerator {
  static generateInsertOperations(tableName, count, baseData = {}) {
    const operations = [];

    for (let i = 0; i < count; i++) {
      const data = {
        test_id: i,
        created_at: new Date().toISOString(),
        ...baseData
      };

      const columns = Object.keys(data);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      const params = Object.values(data);

      operations.push({ sql, params, data });
    }

    return operations;
  }

  static generateConcurrentScenarios(operationCounts = [1, 5, 10, 20]) {
    return operationCounts.map(count => ({
      name: `${count} concurrent operations`,
      count,
      operation: (index) => async () => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        return { operationIndex: index, timestamp: Date.now() };
      }
    }));
  }

  static generateFailurePatterns() {
    return [
      { name: 'timeout-errors', pattern: () => new Error('Operation timed out') },
      { name: 'connection-errors', pattern: () => new Error('Connection refused') },
      { name: 'query-errors', pattern: () => new Error('Syntax error in SQL') },
      { name: 'intermittent-errors', pattern: () => Math.random() < 0.3 ? new Error('Random failure') : null }
    ];
  }
}

/**
 * Test Environment Setup
 */
export class TestEnvironmentSetup {
  static async setupIntegrationTest() {
    // Set test environment variables
    const originalEnv = { ...process.env };

    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_TEST_MODE = 'true';

    // Initialize test database
    const testDb = await getDatabaseClient();

    return {
      testDb,
      originalEnv,
      cleanup: async () => {
        process.env = originalEnv;
        if (testDb) {
          await testDb.close();
        }
      }
    };
  }

  static async createTestTables(db, tableDefinitions) {
    for (const [tableName, definition] of Object.entries(tableDefinitions)) {
      await db.execute(`CREATE TABLE IF NOT EXISTS ${tableName} (${definition})`);
    }
  }

  static async cleanupTestTables(db, tableNames) {
    for (const tableName of tableNames) {
      await db.execute(`DROP TABLE IF EXISTS ${tableName}`);
    }
  }

  static createResourceTracker() {
    const resources = new Set();

    return {
      track: (resource) => {
        resources.add(resource);
        return resource;
      },
      cleanup: async () => {
        const cleanupPromises = [];

        for (const resource of resources) {
          if (resource && typeof resource.cleanup === 'function') {
            cleanupPromises.push(resource.cleanup());
          } else if (resource && typeof resource.close === 'function') {
            cleanupPromises.push(resource.close());
          } else if (resource && typeof resource.shutdown === 'function') {
            cleanupPromises.push(resource.shutdown());
          }
        }

        await Promise.allSettled(cleanupPromises);
        resources.clear();
      },
      size: () => resources.size
    };
  }
}

// Export all utilities
export default {
  MockDatabaseClient,
  PerformanceMonitor,
  TestScenarioBuilder,
  ConnectionPoolTestUtils,
  CircuitBreakerTestUtils,
  StateMachineTestUtils,
  TestDataGenerator,
  TestEnvironmentSetup
};