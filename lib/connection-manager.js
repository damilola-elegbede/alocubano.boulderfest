/**
 * Enterprise-Grade Database Connection Pool Manager
 *
 * Provides production-ready connection pooling for serverless environments with:
 * - Resource leasing system with timeout protection
 * - Connection pool management with lifecycle tracking
 * - State machine integration for graceful shutdown
 * - Serverless-optimized configurations
 * - Comprehensive error handling and circuit breaker preparation
 */

import { logger } from './logger.js';
import { getDatabaseClient } from './database.js';

/**
 * Connection states for state machine integration
 */
const ConnectionState = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  DRAINING: 'DRAINING',
  SHUTDOWN: 'SHUTDOWN'
};

/**
 * Lease object that wraps a database connection with lifecycle tracking
 */
class ConnectionLease {
  constructor(id, connection, manager, timeout = 30000) {
    this.id = id;
    this.connection = connection;
    this.manager = manager;
    this.createdAt = Date.now();
    this.lastUsed = Date.now();
    this.isReleased = false;
    this.operationId = null;

    // Set up automatic timeout cleanup
    this.timeoutId = setTimeout(() => {
      if (!this.isReleased) {
        logger.warn(`Connection lease ${this.id} timed out after ${timeout}ms, forcing release`);
        this.release();
      }
    }, timeout);
  }

  /**
   * Execute a query using this lease's connection
   */
  async execute(sql, params = []) {
    if (this.isReleased) {
      throw new Error(`Cannot execute query on released lease ${this.id}`);
    }

    try {
      const result = await this.connection.execute(sql, params);
      this.lastUsed = Date.now(); // Update after successful execution
      return result;
    } catch (error) {
      logger.error(`Query execution failed on lease ${this.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Start a transaction using this lease's connection
   */
  async transaction(timeoutMs = 30000) {
    if (this.isReleased) {
      throw new Error(`Cannot start transaction on released lease ${this.id}`);
    }

    try {
      const result = await this.connection.transaction(timeoutMs);
      this.lastUsed = Date.now(); // Update after successful execution
      return result;
    } catch (error) {
      logger.error(`Transaction start failed on lease ${this.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Execute batch operations using this lease's connection
   */
  async batch(statements) {
    if (this.isReleased) {
      throw new Error(`Cannot execute batch on released lease ${this.id}`);
    }

    try {
      const result = await this.connection.batch(statements);
      this.lastUsed = Date.now(); // Update after successful execution
      return result;
    } catch (error) {
      logger.error(`Batch execution failed on lease ${this.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Release this lease back to the pool
   */
  release() {
    if (this.isReleased) {
      return; // Already released
    }

    this.isReleased = true;

    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Return connection to pool
    this.manager.releaseLease(this.id);
  }

  /**
   * Get lease statistics
   */
  getStats() {
    return {
      id: this.id,
      operationId: this.operationId,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed,
      ageMs: Date.now() - this.createdAt,
      idleMs: Date.now() - this.lastUsed,
      isReleased: this.isReleased
    };
  }
}

/**
 * Enterprise Database Connection Pool Manager
 */
export class DatabaseConnectionManager {
  constructor(options = {}) {
    // Serverless-optimized defaults
    this.config = {
      maxConnections: process.env.VERCEL === '1' ? 2 : 5,
      minConnections: 1,
      acquireTimeout: process.env.VERCEL === '1' ? 5000 : 10000,
      leaseTimeout: 30000,
      shutdownTimeout: 15000,
      healthCheckInterval: 60000,
      connectionIdleTimeout: 300000, // 5 minutes
      maxConnectionAge: 3600000, // 1 hour
      ...options
    };

    // Connection pool state
    this.connections = new Map(); // connectionId -> connection
    this.leases = new Map(); // leaseId -> ConnectionLease
    this.availableConnections = new Set(); // Set of available connection IDs

    // State management
    this.state = ConnectionState.IDLE;
    this.nextConnectionId = 1;
    this.nextLeaseId = 1;

    // Metrics and monitoring
    this.metrics = {
      totalConnectionsCreated: 0,
      totalLeasesGranted: 0,
      totalLeasesReleased: 0,
      currentActiveLeases: 0,
      connectionCreationErrors: 0,
      leaseTimeouts: 0,
      healthCheckFailures: 0
    };

    // Health monitoring
    this.healthCheckTimer = null;
    this.isShuttingDown = false;

    // Initialize health check if configured
    if (this.config.healthCheckInterval > 0) {
      this.startHealthCheck();
    }

    logger.debug('DatabaseConnectionManager initialized with config:', this.config);
  }

  /**
   * Acquire a connection lease for database operations
   */
  async acquireLease(operationId = null, timeout = null) {
    const effectiveTimeout = timeout || this.config.acquireTimeout;
    const startTime = Date.now();

    if (this.isShuttingDown) {
      throw new Error('Connection manager is shutting down');
    }

    if (this.state === ConnectionState.SHUTDOWN) {
      throw new Error('Connection manager is shut down');
    }

    logger.debug(`Acquiring connection lease for operation: ${operationId || 'anonymous'}`);

    try {
      // Attempt to acquire a connection with timeout protection
      const connection = await Promise.race([
        this._acquireConnection(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Connection acquisition timeout after ${effectiveTimeout}ms`)), effectiveTimeout)
        )
      ]);

      // Create lease
      const leaseId = this.nextLeaseId++;
      const lease = new ConnectionLease(leaseId, connection, this, this.config.leaseTimeout);
      lease.operationId = operationId;

      this.leases.set(leaseId, lease);
      this.metrics.totalLeasesGranted++;
      this.metrics.currentActiveLeases++;

      const acquisitionTime = Date.now() - startTime;
      logger.debug(`Connection lease ${leaseId} acquired in ${acquisitionTime}ms for operation: ${operationId || 'anonymous'}`);

      return lease;
    } catch (error) {
      const acquisitionTime = Date.now() - startTime;
      logger.error(`Failed to acquire connection lease after ${acquisitionTime}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Internal method to acquire a connection from the pool
   * @private
   */
  async _acquireConnection() {
    // Try to reuse an available connection first
    if (this.availableConnections.size > 0) {
      const connectionId = this.availableConnections.values().next().value;
      this.availableConnections.delete(connectionId);

      const connection = this.connections.get(connectionId);
      if (connection) {
        logger.debug(`Reusing existing connection ${connectionId}`);
        return connection;
      }
    }

    // Create new connection if under limit
    if (this.connections.size < this.config.maxConnections) {
      try {
        const connection = await getDatabaseClient();
        const connectionId = this.nextConnectionId++;

        this.connections.set(connectionId, connection);
        this.metrics.totalConnectionsCreated++;

        logger.debug(`Created new connection ${connectionId} (total: ${this.connections.size})`);
        return connection;
      } catch (error) {
        this.metrics.connectionCreationErrors++;
        logger.error('Failed to create new database connection:', error.message);
        throw error;
      }
    }

    // Pool is full - wait for a connection to become available
    return new Promise((resolve, reject) => {
      const checkInterval = 100; // Check every 100ms
      const maxWait = this.config.acquireTimeout;
      let waited = 0;

      const checkForConnection = () => {
        if (this.availableConnections.size > 0) {
          const connectionId = this.availableConnections.values().next().value;
          this.availableConnections.delete(connectionId);

          const connection = this.connections.get(connectionId);
          if (connection) {
            resolve(connection);
            return;
          }
        }

        waited += checkInterval;
        if (waited >= maxWait) {
          reject(new Error(`No connections available after waiting ${maxWait}ms`));
          return;
        }

        setTimeout(checkForConnection, checkInterval);
      };

      checkForConnection();
    });
  }

  /**
   * Release a connection lease back to the pool
   */
  async releaseLease(leaseId) {
    const lease = this.leases.get(leaseId);
    if (!lease) {
      logger.warn(`Attempted to release unknown lease ${leaseId}`);
      return false;
    }

    try {
      // Find the connection ID for this lease's connection
      let connectionId = null;
      for (const [id, connection] of this.connections.entries()) {
        if (connection === lease.connection) {
          connectionId = id;
          break;
        }
      }

      if (connectionId !== null) {
        // Return connection to available pool
        this.availableConnections.add(connectionId);
        logger.debug(`Connection ${connectionId} returned to pool (lease ${leaseId})`);
      } else {
        logger.warn(`Could not find connection ID for lease ${leaseId}`);
      }

      // Clean up lease
      this.leases.delete(leaseId);
      this.metrics.totalLeasesReleased++;
      this.metrics.currentActiveLeases = Math.max(0, this.metrics.currentActiveLeases - 1);

      logger.debug(`Released lease ${leaseId} for operation: ${lease.operationId || 'anonymous'}`);
      return true;
    } catch (error) {
      logger.error(`Error releasing lease ${leaseId}:`, error.message);
      return false;
    }
  }

  /**
   * Perform graceful shutdown of the connection manager
   */
  async gracefulShutdown(timeout = null) {
    const effectiveTimeout = timeout || this.config.shutdownTimeout;
    const startTime = Date.now();

    logger.log(`Starting graceful shutdown with ${effectiveTimeout}ms timeout...`);

    this.isShuttingDown = true;
    this.state = ConnectionState.DRAINING;

    try {
      // Stop health check
      this.stopHealthCheck();

      // Wait for active leases to complete or timeout
      const shutdownPromise = this._waitForActiveLeases();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Shutdown timeout after ${effectiveTimeout}ms`)), effectiveTimeout)
      );

      try {
        await Promise.race([shutdownPromise, timeoutPromise]);
      } catch (error) {
        logger.warn(`Shutdown timeout reached, forcing release of ${this.leases.size} active leases`);

        // Force release all active leases
        for (const [leaseId, lease] of this.leases.entries()) {
          try {
            lease.release();
          } catch (releaseError) {
            logger.error(`Error force-releasing lease ${leaseId}:`, releaseError.message);
          }
        }
      }

      // Close all connections
      await this._closeAllConnections();

      this.state = ConnectionState.SHUTDOWN;

      const shutdownTime = Date.now() - startTime;
      logger.log(`Graceful shutdown completed in ${shutdownTime}ms`);

      return true;
    } catch (error) {
      const shutdownTime = Date.now() - startTime;
      logger.error(`Graceful shutdown failed after ${shutdownTime}ms:`, error.message);

      // Force cleanup
      await this._forceCleanup();
      this.state = ConnectionState.SHUTDOWN;

      return false;
    }
  }

  /**
   * Wait for all active leases to be released
   * @private
   */
  async _waitForActiveLeases() {
    while (this.leases.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Close all database connections
   * @private
   */
  async _closeAllConnections() {
    if (this.connections.size === 0) {
      logger.debug('No connections to close');
      return;
    }

    const closePromises = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection && typeof connection.close === 'function') {
        try {
          const closeResult = connection.close();
          // Handle both promise and non-promise return values
          if (closeResult && typeof closeResult.then === 'function') {
            // It's a promise
            const closePromise = closeResult.catch(error => {
              logger.error(`Error closing connection ${connectionId}:`, error.message);
              return null;
            });
            closePromises.push(closePromise);
          } else {
            // It's not a promise, close was synchronous
            logger.debug(`Connection ${connectionId} closed synchronously`);
          }
        } catch (error) {
          logger.error(`Error closing connection ${connectionId}:`, error.message);
        }
      } else {
        logger.warn(`Connection ${connectionId} has no close method or is null`);
      }
    }

    if (closePromises.length > 0) {
      try {
        await Promise.allSettled(closePromises);
        logger.debug(`Attempted to close ${closePromises.length} database connections`);
      } catch (error) {
        logger.error('Error during connection cleanup:', error.message);
      }
    }

    // Clear connection tracking
    this.connections.clear();
    this.availableConnections.clear();
  }

  /**
   * Force cleanup of all resources
   * @private
   */
  async _forceCleanup() {
    // Clear all leases
    for (const lease of this.leases.values()) {
      try {
        if (lease && typeof lease.release === 'function') {
          lease.release();
        }
      } catch (error) {
        // Ignore errors during force cleanup
        logger.debug(`Error during force lease cleanup: ${error.message}`);
      }
    }
    this.leases.clear();

    // Force close connections
    await this._closeAllConnections();

    // Reset metrics
    this.metrics.currentActiveLeases = 0;
  }

  /**
   * Start health check monitoring
   */
  startHealthCheck() {
    if (this.healthCheckTimer) {
      return; // Already running
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this._performHealthCheck();
      } catch (error) {
        logger.error('Health check failed:', error.message);
        this.metrics.healthCheckFailures++;
      }
    }, this.config.healthCheckInterval);

    logger.debug('Connection pool health check started');
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.debug('Connection pool health check stopped');
    }
  }

  /**
   * Perform health check on connections and clean up stale ones
   * @private
   */
  async _performHealthCheck() {
    const now = Date.now();
    const staleConnections = [];

    // Check for stale or old connections
    for (const [connectionId, connection] of this.connections.entries()) {
      // For now, we'll rely on the database service's own health monitoring
      // In the future, we could add connection-specific health checks here
    }

    // Clean up timed-out leases
    const timedOutLeases = [];
    for (const [leaseId, lease] of this.leases.entries()) {
      const leaseAge = now - lease.createdAt;
      if (leaseAge > this.config.leaseTimeout) {
        timedOutLeases.push(leaseId);
      }
    }

    // Force release timed-out leases
    for (const leaseId of timedOutLeases) {
      const lease = this.leases.get(leaseId);
      if (lease) {
        logger.warn(`Force releasing timed-out lease ${leaseId} (age: ${now - lease.createdAt}ms)`);
        lease.release();
        this.metrics.leaseTimeouts++;
      }
    }

    if (timedOutLeases.length > 0) {
      logger.debug(`Health check cleaned up ${timedOutLeases.length} timed-out leases`);
    }
  }

  /**
   * Get comprehensive connection pool statistics
   */
  getPoolStatistics() {
    const activeLeaseStats = Array.from(this.leases.values()).map(lease => lease.getStats());

    return {
      state: this.state,
      config: this.config,
      pool: {
        totalConnections: this.connections.size,
        availableConnections: this.availableConnections.size,
        activeLeases: this.leases.size,
        maxConnections: this.config.maxConnections
      },
      metrics: { ...this.metrics },
      activeLeases: activeLeaseStats,
      healthCheck: {
        enabled: !!this.healthCheckTimer,
        interval: this.config.healthCheckInterval
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get pool health status
   */
  async getHealthStatus() {
    try {
      const stats = this.getPoolStatistics();

      // Determine health based on various factors
      const isHealthy =
        this.state !== ConnectionState.SHUTDOWN &&
        !this.isShuttingDown &&
        this.connections.size > 0 &&
        this.metrics.connectionCreationErrors < 10; // Threshold for health

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        state: this.state,
        poolStatistics: stats,
        issues: this._getHealthIssues(stats),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        state: this.state,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Identify health issues
   * @private
   */
  _getHealthIssues(stats) {
    const issues = [];

    if (stats.pool.activeLeases > stats.pool.totalConnections * 0.9) {
      issues.push('High lease utilization');
    }

    if (stats.metrics.connectionCreationErrors > 5) {
      issues.push('Multiple connection creation errors');
    }

    if (stats.metrics.leaseTimeouts > 10) {
      issues.push('Frequent lease timeouts');
    }

    if (stats.metrics.healthCheckFailures > 3) {
      issues.push('Recent health check failures');
    }

    return issues;
  }
}

/**
 * Singleton instance for global access
 */
let connectionManagerInstance = null;

/**
 * Get the global connection manager instance
 */
export function getConnectionManager(options = {}) {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new DatabaseConnectionManager(options);
  }
  return connectionManagerInstance;
}

/**
 * Reset the connection manager instance (for testing)
 */
export async function resetConnectionManager() {
  if (connectionManagerInstance) {
    await connectionManagerInstance.gracefulShutdown();
    connectionManagerInstance = null;
  }
}

/**
 * Convenience function to acquire a database lease
 */
export async function acquireDbLease(operationId = null, timeout = null) {
  const manager = getConnectionManager();
  return manager.acquireLease(operationId, timeout);
}

/**
 * Convenience function to get connection pool statistics
 */
export function getPoolStatistics() {
  if (!connectionManagerInstance) {
    return {
      status: 'not_initialized',
      message: 'Connection manager not initialized'
    };
  }
  return connectionManagerInstance.getPoolStatistics();
}

/**
 * Convenience function to get pool health status
 */
export async function getPoolHealthStatus() {
  if (!connectionManagerInstance) {
    return {
      status: 'not_initialized',
      message: 'Connection manager not initialized'
    };
  }
  return connectionManagerInstance.getHealthStatus();
}

// Export connection states for external use
export { ConnectionState };