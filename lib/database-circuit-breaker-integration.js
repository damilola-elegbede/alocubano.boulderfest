/**
 * Database Circuit Breaker Integration Example
 *
 * Demonstrates how to integrate the DatabaseCircuitBreaker with the existing database service
 * for automatic failure recovery and cascade failure prevention.
 */

import DatabaseCircuitBreaker, { CircuitBreakerError } from './circuit-breaker.js';
import { getDatabaseClient } from './database.js';
import { logger } from './logger.js';

/**
 * Database operation wrapper with circuit breaker protection
 */
export class DatabaseOperationWrapper {
  constructor(options = {}) {
    // Initialize circuit breaker with database-optimized defaults
    this.circuitBreaker = new DatabaseCircuitBreaker({
      failureThreshold: 5,           // Allow 5 failures before opening
      recoveryTimeout: 30000,        // 30 seconds before trying recovery
      halfOpenMaxAttempts: 3,        // Max 3 attempts in half-open state
      timeoutThreshold: 10000,       // 10 second query timeout
      monitoringPeriod: 60000,       // 1 minute sliding window
      memoryOptimization: true,      // Enable cleanup for long-running processes
      coldStartGracePeriod: 5000,    // Extra tolerance for serverless cold starts
      ...options
    });
  }

  /**
   * Execute a database query with circuit breaker protection
   *
   * @param {string} query - SQL query to execute
   * @param {Array} params - Query parameters
   * @param {Function} fallback - Optional fallback operation
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, params = [], fallback = null) {
    const operation = async () => {
      const client = await getDatabaseClient();
      return await client.execute(query, params);
    };

    try {
      return await this.circuitBreaker.execute(operation, fallback);
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        logger.warn('Database circuit breaker triggered', {
          state: error.circuitState,
          metrics: error.metrics
        });
      }
      throw error;
    }
  }

  /**
   * Execute a database transaction with circuit breaker protection
   *
   * @param {Function} transactionFn - Function that performs transaction operations
   * @param {Function} fallback - Optional fallback operation
   * @returns {Promise<any>} Transaction result
   */
  async executeTransaction(transactionFn, fallback = null) {
    const operation = async () => {
      const client = await getDatabaseClient();
      return await client.transaction(transactionFn);
    };

    try {
      return await this.circuitBreaker.execute(operation, fallback);
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        logger.warn('Database transaction circuit breaker triggered', {
          state: error.circuitState,
          metrics: error.metrics
        });
      }
      throw error;
    }
  }

  /**
   * Check if database operations are healthy
   *
   * @returns {boolean} True if database operations are healthy
   */
  isHealthy() {
    return this.circuitBreaker.isHealthy();
  }

  /**
   * Get comprehensive circuit breaker metrics
   *
   * @returns {Object} Circuit breaker metrics and database health status
   */
  getMetrics() {
    const cbMetrics = this.circuitBreaker.getMetrics();

    return {
      ...cbMetrics,
      service: 'database',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset circuit breaker state (for testing or manual recovery)
   */
  reset() {
    this.circuitBreaker.reset();
    logger.log('Database circuit breaker reset manually');
  }
}

/**
 * Global database operation wrapper instance
 */
let globalDatabaseWrapper = null;

/**
 * Get the global database wrapper instance with circuit breaker protection
 *
 * @param {Object} options - Circuit breaker configuration options
 * @returns {DatabaseOperationWrapper} Database wrapper instance
 */
export function getDatabaseWrapper(options = {}) {
  if (!globalDatabaseWrapper) {
    globalDatabaseWrapper = new DatabaseOperationWrapper(options);
    logger.debug('Database circuit breaker wrapper initialized');
  }
  return globalDatabaseWrapper;
}

/**
 * Example usage patterns
 */
export const examples = {
  /**
   * Basic query with circuit breaker protection
   */
  async basicQuery() {
    const db = getDatabaseWrapper();

    try {
      const result = await db.executeQuery(
        'SELECT * FROM tickets WHERE id = ?',
        ['ticket-123']
      );
      return result.rows;
    } catch (error) {
      logger.error('Query failed', { error: error.message });
      throw error;
    }
  },

  /**
   * Query with fallback to cached data
   */
  async queryWithFallback() {
    const db = getDatabaseWrapper();

    const fallback = async () => {
      // Return cached data or default response
      logger.warn('Using fallback for ticket lookup');
      return { rows: [], fromCache: true };
    };

    try {
      const result = await db.executeQuery(
        'SELECT * FROM tickets WHERE event_date > ?',
        [new Date().toISOString()],
        fallback
      );
      return result.rows;
    } catch (error) {
      logger.error('Query with fallback failed', { error: error.message });
      throw error;
    }
  },

  /**
   * Transaction with circuit breaker protection
   */
  async transactionExample() {
    const db = getDatabaseWrapper();

    try {
      const result = await db.executeTransaction(async (tx) => {
        // Execute multiple operations in transaction
        await tx.execute('INSERT INTO tickets (id, email) VALUES (?, ?)', ['t1', 'user@example.com']);
        await tx.execute('UPDATE ticket_count SET count = count + 1');
        return { ticketId: 't1', success: true };
      });

      return result;
    } catch (error) {
      logger.error('Transaction failed', { error: error.message });
      throw error;
    }
  },

  /**
   * Health check example
   */
  async healthCheck() {
    const db = getDatabaseWrapper();

    const isHealthy = db.isHealthy();
    const metrics = db.getMetrics();

    return {
      database: {
        healthy: isHealthy,
        metrics: {
          totalRequests: metrics.totalRequests,
          failureRate: metrics.failureRate,
          averageResponseTime: metrics.averageResponseTime,
          state: metrics.state
        }
      }
    };
  }
};

export default DatabaseOperationWrapper;