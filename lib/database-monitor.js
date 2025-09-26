/**
 * Database Connection Monitoring Module
 * Provides observability for database connection health and performance
 */

import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

class DatabaseMonitor {
  constructor() {
    this.metrics = {
      connectionAttempts: 0,
      connectionSuccesses: 0,
      connectionFailures: 0,
      queryCount: 0,
      queryErrors: 0,
      avgQueryTime: 0,
      lastConnectionTime: null,
      lastQueryTime: null,
    };
    this.healthChecks = [];
    this.warningThresholds = {
      connectionFailureRate: 0.1, // 10% failure rate
      avgQueryTimeMs: 1000, // 1 second average
      staleConnectionMinutes: 30, // 30 minutes without activity
    };
  }

  /**
   * Record connection attempt
   */
  recordConnectionAttempt() {
    this.metrics.connectionAttempts++;
    this.metrics.lastConnectionTime = new Date().toISOString();
  }

  /**
   * Record successful connection
   */
  recordConnectionSuccess() {
    this.metrics.connectionSuccesses++;
  }

  /**
   * Record connection failure
   */
  recordConnectionFailure(error) {
    this.metrics.connectionFailures++;
    logger.warn('Database connection failure recorded:', error.message);
  }

  /**
   * Record query execution
   */
  recordQuery(executionTimeMs, error = null) {
    this.metrics.queryCount++;
    this.metrics.lastQueryTime = new Date().toISOString();

    if (error) {
      this.metrics.queryErrors++;
    }

    // Update rolling average query time
    const prevAvg = this.metrics.avgQueryTime;
    const count = this.metrics.queryCount;
    this.metrics.avgQueryTime = ((prevAvg * (count - 1)) + executionTimeMs) / count;
  }

  /**
   * Get current health status
   */
  async getHealthStatus() {
    // Note: Since we no longer have a persistent database service instance,
    // we'll return simplified connection stats
    const connectionStats = {
      activeConnections: 0,
      initialized: true,
      hasClient: true,
      timestamp: new Date().toISOString(),
    };

    const failureRate = this.metrics.connectionAttempts > 0
      ? this.metrics.connectionFailures / this.metrics.connectionAttempts
      : 0;

    const queryErrorRate = this.metrics.queryCount > 0
      ? this.metrics.queryErrors / this.metrics.queryCount
      : 0;

    const warnings = [];

    if (failureRate > this.warningThresholds.connectionFailureRate) {
      warnings.push(`High connection failure rate: ${(failureRate * 100).toFixed(1)}%`);
    }

    if (this.metrics.avgQueryTime > this.warningThresholds.avgQueryTimeMs) {
      warnings.push(`Slow average query time: ${this.metrics.avgQueryTime.toFixed(0)}ms`);
    }

    // Note: isClosing check removed since we no longer have persistent service

    return {
      status: warnings.length > 0 ? 'warning' : 'healthy',
      metrics: this.metrics,
      connectionStats,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    let status = 'healthy';
    const checks = [];

    try {
      // Test basic connectivity
      this.recordConnectionAttempt();
      const db = await getDatabaseClient();
      // Simple connectivity test
      const testResult = await db.execute("SELECT 1 as test");
      const isHealthy = testResult && testResult.rows && testResult.rows.length > 0;

      if (isHealthy) {
        this.recordConnectionSuccess();
        checks.push({ name: 'connectivity', status: 'pass', duration: Date.now() - startTime });
      } else {
        this.recordConnectionFailure(new Error('Connection test failed'));
        checks.push({ name: 'connectivity', status: 'fail', duration: Date.now() - startTime });
        status = 'unhealthy';
      }

    } catch (error) {
      this.recordConnectionFailure(error);
      checks.push({
        name: 'connectivity',
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime
      });
      status = 'unhealthy';
    }

    const healthStatus = await this.getHealthStatus();

    return {
      status,
      checks,
      overall: healthStatus,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics() {
    this.metrics = {
      connectionAttempts: 0,
      connectionSuccesses: 0,
      connectionFailures: 0,
      queryCount: 0,
      queryErrors: 0,
      avgQueryTime: 0,
      lastConnectionTime: null,
      lastQueryTime: null,
    };
    this.healthChecks = [];
  }
}

// Export singleton instance
let monitorInstance = null;

export function getDatabaseMonitor() {
  if (!monitorInstance) {
    monitorInstance = new DatabaseMonitor();
  }
  return monitorInstance;
}

export { DatabaseMonitor };