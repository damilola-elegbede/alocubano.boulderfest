/**
 * Database Connection Health Monitor
 *
 * Monitors database connection health and implements circuit breaker patterns
 * specifically optimized for Turso + Vercel serverless environments.
 */

import { logger } from './logger.js';
import { getDatabaseClient } from './database.js';

class DatabaseConnectionMonitor {
  constructor() {
    this.healthHistory = [];
    this.maxHistorySize = 50; // Keep last 50 health checks
    this.circuitBreakerState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.failureThreshold = 3; // Open circuit after 3 consecutive failures
    this.recoveryTimeout = 30000; // 30 seconds
    this.lastFailureTime = null;
    this.performanceMetrics = {
      averageResponseTime: 0,
      slowQueryCount: 0,
      timeoutCount: 0,
      connectionRecycles: 0
    };
  }

  /**
   * Check database connection health with circuit breaker pattern
   * @returns {Promise<Object>} Health status and metrics
   */
  async checkHealth() {
    const startTime = Date.now();

    try {
      // Check circuit breaker state
      if (this.circuitBreakerState === 'OPEN') {
        const timeSinceFailure = Date.now() - this.lastFailureTime;

        if (timeSinceFailure < this.recoveryTimeout) {
          return this._createHealthReport('circuit_open', startTime, {
            message: 'Circuit breaker is OPEN - database connections blocked',
            retryAfter: this.recoveryTimeout - timeSinceFailure
          });
        } else {
          // Try to move to half-open state
          this.circuitBreakerState = 'HALF_OPEN';
          logger.log('Circuit breaker moving to HALF_OPEN state for testing');
        }
      }

      // Perform health check
      const healthResult = await this._performHealthCheck();

      // Update circuit breaker based on result
      this._updateCircuitBreaker(healthResult.success);

      // Record health history
      this._recordHealthCheck(healthResult, startTime);

      return this._createHealthReport(
        healthResult.success ? 'healthy' : 'unhealthy',
        startTime,
        healthResult
      );

    } catch (error) {
      this._updateCircuitBreaker(false);
      logger.error('Database health check failed:', error.message);

      return this._createHealthReport('error', startTime, {
        error: error.message,
        circuitState: this.circuitBreakerState
      });
    }
  }

  /**
   * Perform the actual health check with comprehensive testing
   * @private
   */
  async _performHealthCheck() {
    const client = await getDatabaseClient();
    const checks = [];

    // 1. Basic connectivity test
    try {
      const start = Date.now();
      await client.execute('SELECT 1 as test');
      const duration = Date.now() - start;
      checks.push({
        name: 'connectivity',
        success: true,
        duration,
        slow: duration > 1000
      });
    } catch (error) {
      checks.push({
        name: 'connectivity',
        success: false,
        error: error.message
      });
    }

    // 2. Batch operations test (important for Turso)
    try {
      const start = Date.now();
      await client.batch([
        { sql: 'SELECT 2 as batch_test', args: [] }
      ]);
      const duration = Date.now() - start;
      checks.push({
        name: 'batch_operations',
        success: true,
        duration,
        slow: duration > 2000
      });
    } catch (error) {
      checks.push({
        name: 'batch_operations',
        success: false,
        error: error.message
      });
    }

    // 3. Check if connection needs recycling
    try {
      // This check verifies the connection is not stale
      const start = Date.now();
      await client.execute('SELECT datetime("now") as current_time');
      const duration = Date.now() - start;
      checks.push({
        name: 'connection_freshness',
        success: true,
        duration,
        slow: duration > 1500
      });
    } catch (error) {
      checks.push({
        name: 'connection_freshness',
        success: false,
        error: error.message
      });
    }

    const successfulChecks = checks.filter(c => c.success).length;
    const totalChecks = checks.length;
    const success = successfulChecks === totalChecks;

    // Update performance metrics
    const totalDuration = checks.reduce((sum, check) => sum + (check.duration || 0), 0);
    this._updatePerformanceMetrics(totalDuration, checks);

    return {
      success,
      checks,
      successRate: successfulChecks / totalChecks,
      totalDuration,
      hasSlowQueries: checks.some(c => c.slow)
    };
  }

  /**
   * Update circuit breaker state based on health check result
   * @private
   */
  _updateCircuitBreaker(success) {
    if (success) {
      // Reset failure count on success
      this.failureCount = 0;

      if (this.circuitBreakerState === 'HALF_OPEN') {
        this.circuitBreakerState = 'CLOSED';
        logger.log('Circuit breaker closed - database health restored');
      }
    } else {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold &&
          this.circuitBreakerState !== 'OPEN') {
        this.circuitBreakerState = 'OPEN';
        logger.error(`Circuit breaker opened after ${this.failureCount} failures`);
      }
    }
  }

  /**
   * Update performance metrics
   * @private
   */
  _updatePerformanceMetrics(duration, checks) {
    const history = this.healthHistory;

    // Calculate rolling average response time
    if (history.length > 0) {
      const recent = history.slice(-10); // Last 10 checks
      const avgTime = recent.reduce((sum, h) => sum + (h.duration || 0), 0) / recent.length;
      this.performanceMetrics.averageResponseTime = Math.round(avgTime);
    }

    // Count slow queries
    if (checks.some(c => c.slow)) {
      this.performanceMetrics.slowQueryCount++;
    }

    // Count timeouts (checks that failed with timeout errors)
    if (checks.some(c => c.error && c.error.includes('timeout'))) {
      this.performanceMetrics.timeoutCount++;
    }
  }

  /**
   * Record health check in history
   * @private
   */
  _recordHealthCheck(result, startTime) {
    this.healthHistory.push({
      timestamp: new Date().toISOString(),
      success: result.success,
      duration: Date.now() - startTime,
      successRate: result.successRate,
      circuitState: this.circuitBreakerState
    });

    // Trim history to max size
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Create standardized health report
   * @private
   */
  _createHealthReport(status, startTime, data = {}) {
    const responseTime = Date.now() - startTime;

    return {
      status,
      responseTime: `${responseTime}ms`,
      circuitBreaker: {
        state: this.circuitBreakerState,
        failureCount: this.failureCount,
        failureThreshold: this.failureThreshold
      },
      performance: {
        ...this.performanceMetrics,
        recentResponseTime: responseTime
      },
      timestamp: new Date().toISOString(),
      ...data
    };
  }

  /**
   * Get circuit breaker state
   * @returns {string} Current circuit breaker state
   */
  getCircuitState() {
    return this.circuitBreakerState;
  }

  /**
   * Force circuit breaker to closed state (for manual recovery)
   */
  resetCircuitBreaker() {
    this.circuitBreakerState = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    logger.log('Circuit breaker manually reset to CLOSED state');
  }

  /**
   * Get performance metrics summary
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    const recentHistory = this.healthHistory.slice(-20);
    const successfulChecks = recentHistory.filter(h => h.success).length;
    const successRate = recentHistory.length > 0 ? (successfulChecks / recentHistory.length) : 0;

    return {
      ...this.performanceMetrics,
      recentSuccessRate: Math.round(successRate * 100),
      totalHealthChecks: this.healthHistory.length,
      circuitBreakerState: this.circuitBreakerState
    };
  }
}

// Singleton instance
let monitorInstance = null;

/**
 * Get the database connection monitor instance
 * @returns {DatabaseConnectionMonitor} Monitor instance
 */
export function getDatabaseConnectionMonitor() {
  if (!monitorInstance) {
    monitorInstance = new DatabaseConnectionMonitor();
  }
  return monitorInstance;
}

/**
 * Quick health check function for use in API endpoints
 * @returns {Promise<Object>} Health status
 */
export async function quickHealthCheck() {
  const monitor = getDatabaseConnectionMonitor();
  return monitor.checkHealth();
}

/**
 * Reset the connection monitor (for testing)
 */
export function resetConnectionMonitor() {
  monitorInstance = null;
}

export { DatabaseConnectionMonitor };