/**
 * Enterprise Database Integration Layer
 *
 * Unified integration layer that coordinates all enterprise database components:
 * - Feature flag integration for controlled rollout
 * - Configuration management for runtime updates
 * - Connection management with state machines
 * - Circuit breaker integration for resilience
 * - Monitoring and health checks
 * - Backwards compatibility with legacy system
 */

import { logger } from './logger.js';
import { getDatabaseConfiguration } from './database-config.js';
import { getFeatureFlagManager, isFeatureEnabled, createContext } from './feature-flags.js';
import { getDatabaseClient } from './database.js';
import { getConnectionManager, acquireDbLease } from './connection-manager.js';
import { DatabaseCircuitBreaker } from './circuit-breaker.js';
import { ConnectionStateMachine, createConnectionStateMachine } from './connection-state-machine.js';
import { getMonitoringService } from './monitoring/monitoring-service.js';

/**
 * Enterprise Database Client
 *
 * High-level client that automatically selects between legacy and enterprise
 * database access patterns based on feature flags and system health.
 */
export class EnterpriseDatabaseClient {
  constructor(options = {}) {
    this.config = getDatabaseConfiguration();
    this.featureFlags = getFeatureFlagManager();
    this.monitoring = getMonitoringService();
    this.context = options.context || null;
    this.operationId = options.operationId || this._generateOperationId();

    // Enterprise components
    this.connectionManager = null;
    this.circuitBreaker = null;
    this.stateMachine = null;

    // Client state
    this.initialized = false;
    this.lastHealthCheck = null;
    this.operationCount = 0;
    this.errorCount = 0;

    // Performance tracking
    this.startTime = Date.now();
    this.lastOperation = null;
  }

  /**
   * Initialize enterprise database client
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      logger.debug(`Initializing enterprise database client: ${this.operationId}`);

      // Check if enterprise features are enabled
      const enterpriseFlags = this._checkEnterpriseFeatures();

      // Initialize enterprise components based on feature flags
      if (enterpriseFlags.connectionPool) {
        this.connectionManager = getConnectionManager(this._getConnectionPoolConfig());
        logger.debug('Connection pool manager initialized');
      }

      if (enterpriseFlags.circuitBreaker) {
        this.circuitBreaker = new DatabaseCircuitBreaker(this._getCircuitBreakerConfig());
        logger.debug('Circuit breaker initialized');
      }

      // Initialize monitoring
      if (enterpriseFlags.monitoring) {
        this.monitoring.startTransaction(this.operationId, {
          client: 'enterprise',
          features: enterpriseFlags
        });
      }

      this.initialized = true;
      this.lastHealthCheck = Date.now();

      logger.debug('Enterprise database client initialized successfully', {
        operationId: this.operationId,
        features: enterpriseFlags
      });

    } catch (error) {
      logger.error('Failed to initialize enterprise database client:', error.message);

      // Fall back to legacy mode on initialization failure
      if (isFeatureEnabled('ENABLE_LEGACY_FALLBACK', this.context)) {
        logger.warn('Falling back to legacy database mode');
        this.initialized = true; // Mark as initialized but without enterprise features
      } else {
        throw error;
      }
    }
  }

  /**
   * Execute database operation with enterprise features
   */
  async execute(sql, params = [], options = {}) {
    await this.initialize();

    const operationStart = Date.now();
    const operationContext = {
      sql: typeof sql === 'string' ? sql.substring(0, 100) : 'batch',
      operationId: this.operationId,
      timestamp: operationStart
    };

    this.operationCount++;

    try {
      // Check if we should use enterprise features
      const useEnterprise = this._shouldUseEnterpriseFeatures();

      let result;
      if (useEnterprise) {
        result = await this._executeWithEnterpriseFeatures(sql, params, options, operationContext);
      } else {
        result = await this._executeWithLegacyClient(sql, params, options, operationContext);
      }

      // Record successful operation
      this._recordOperationSuccess(operationStart, operationContext);

      return result;

    } catch (error) {
      // Record operation failure
      this._recordOperationFailure(error, operationStart, operationContext);

      // Attempt fallback if enterprise operation failed
      if (this._shouldAttemptFallback(error, options)) {
        logger.warn('Enterprise operation failed, attempting legacy fallback', {
          error: error.message,
          operationId: this.operationId
        });

        try {
          const fallbackResult = await this._executeWithLegacyClient(sql, params, options, operationContext);
          this._recordFallbackSuccess(operationStart, operationContext);
          return fallbackResult;
        } catch (fallbackError) {
          this._recordFallbackFailure(fallbackError, operationContext);
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Start a database transaction
   */
  async transaction(callback, options = {}) {
    await this.initialize();

    const transactionStart = Date.now();
    const transactionId = this._generateOperationId();

    try {
      // Check if we should use enterprise features for transactions
      const useEnterprise = this._shouldUseEnterpriseFeatures() &&
                           isFeatureEnabled('ENABLE_STATE_MACHINE', this.context);

      let result;
      if (useEnterprise && this.connectionManager) {
        result = await this._transactionWithConnectionPool(callback, options, transactionId);
      } else {
        result = await this._transactionWithLegacyClient(callback, options, transactionId);
      }

      this._recordTransactionSuccess(transactionStart, transactionId);
      return result;

    } catch (error) {
      this._recordTransactionFailure(error, transactionStart, transactionId);

      // Attempt fallback for transactions
      if (this._shouldAttemptFallback(error, options)) {
        logger.warn('Enterprise transaction failed, attempting legacy fallback');
        try {
          const fallbackResult = await this._transactionWithLegacyClient(callback, options, transactionId);
          this._recordFallbackSuccess(transactionStart, { transactionId });
          return fallbackResult;
        } catch (fallbackError) {
          this._recordFallbackFailure(fallbackError, { transactionId });
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Batch execute multiple statements
   */
  async batch(statements, options = {}) {
    await this.initialize();

    const batchStart = Date.now();
    const batchId = this._generateOperationId();

    try {
      const useEnterprise = this._shouldUseEnterpriseFeatures();

      let result;
      if (useEnterprise && this.connectionManager) {
        result = await this._batchWithConnectionPool(statements, options, batchId);
      } else {
        result = await this._batchWithLegacyClient(statements, options, batchId);
      }

      this._recordBatchSuccess(batchStart, batchId, statements.length);
      return result;

    } catch (error) {
      this._recordBatchFailure(error, batchStart, batchId, statements.length);

      if (this._shouldAttemptFallback(error, options)) {
        try {
          const fallbackResult = await this._batchWithLegacyClient(statements, options, batchId);
          this._recordFallbackSuccess(batchStart, { batchId, statementCount: statements.length });
          return fallbackResult;
        } catch (fallbackError) {
          this._recordFallbackFailure(fallbackError, { batchId });
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Get client health status
   */
  async getHealthStatus() {
    const status = {
      operationId: this.operationId,
      initialized: this.initialized,
      uptime: Date.now() - this.startTime,
      operationCount: this.operationCount,
      errorCount: this.errorCount,
      errorRate: this.operationCount > 0 ? this.errorCount / this.operationCount : 0,
      features: this._checkEnterpriseFeatures(),
      lastOperation: this.lastOperation,
      timestamp: Date.now()
    };

    // Add enterprise component health if available
    if (this.connectionManager) {
      status.connectionPool = await this.connectionManager.getHealthStatus();
    }

    if (this.circuitBreaker) {
      status.circuitBreaker = {
        state: this.circuitBreaker.state,
        metrics: this.circuitBreaker.getMetrics(),
        isHealthy: this.circuitBreaker.isHealthy()
      };
    }

    return status;
  }

  /**
   * Close and cleanup resources
   */
  async close() {
    try {
      if (this.connectionManager) {
        await this.connectionManager.gracefulShutdown();
      }

      if (this.monitoring && this.operationId) {
        this.monitoring.endTransaction(this.operationId, 'success', {
          operationCount: this.operationCount,
          errorCount: this.errorCount,
          uptime: Date.now() - this.startTime
        });
      }

      logger.debug('Enterprise database client closed', { operationId: this.operationId });

    } catch (error) {
      logger.error('Error closing enterprise database client:', error.message);
    }
  }

  // Private methods

  _checkEnterpriseFeatures() {
    return {
      connectionPool: isFeatureEnabled('ENABLE_CONNECTION_POOL', this.context),
      stateMachine: isFeatureEnabled('ENABLE_STATE_MACHINE', this.context),
      circuitBreaker: isFeatureEnabled('ENABLE_CIRCUIT_BREAKER', this.context),
      monitoring: isFeatureEnabled('ENABLE_ENTERPRISE_MONITORING', this.context),
      performance: isFeatureEnabled('ENABLE_PERFORMANCE_OPTIMIZATION', this.context),
      legacyFallback: isFeatureEnabled('ENABLE_LEGACY_FALLBACK', this.context)
    };
  }

  _shouldUseEnterpriseFeatures() {
    const features = this._checkEnterpriseFeatures();

    // Use enterprise features if connection pool is enabled and circuit breaker is healthy
    return features.connectionPool &&
           (!this.circuitBreaker || this.circuitBreaker.isHealthy());
  }

  _shouldAttemptFallback(error, options = {}) {
    // Don't fallback if explicitly disabled
    if (options.noFallback) {
      return false;
    }

    // Don't fallback if legacy fallback is disabled
    if (!isFeatureEnabled('ENABLE_LEGACY_FALLBACK', this.context)) {
      return false;
    }

    // Don't fallback for certain error types
    const noFallbackErrors = ['syntax error', 'constraint violation', 'authentication'];
    const errorMessage = error.message.toLowerCase();

    return !noFallbackErrors.some(pattern => errorMessage.includes(pattern));
  }

  async _executeWithEnterpriseFeatures(sql, params, options, operationContext) {
    // Use circuit breaker if available
    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(async () => {
        return this._executeWithConnectionPool(sql, params, options, operationContext);
      });
    } else {
      return this._executeWithConnectionPool(sql, params, options, operationContext);
    }
  }

  async _executeWithConnectionPool(sql, params, options, operationContext) {
    const lease = await acquireDbLease(this.operationId, options.timeout);

    try {
      if (typeof sql === 'string') {
        return await lease.execute(sql, params);
      } else {
        // Handle query object format
        return await lease.execute(sql.sql, sql.args || params);
      }
    } finally {
      lease.release();
    }
  }

  async _executeWithLegacyClient(sql, params, options, operationContext) {
    const client = await getDatabaseClient();

    if (typeof sql === 'string') {
      return await client.execute({ sql, args: params });
    } else {
      return await client.execute(sql);
    }
  }

  async _transactionWithConnectionPool(callback, options, transactionId) {
    const lease = await acquireDbLease(transactionId, options.timeout);

    try {
      const transaction = await lease.transaction(options.timeoutMs);

      try {
        const result = await callback(transaction);
        await transaction.commit();
        return result;
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } finally {
      lease.release();
    }
  }

  async _transactionWithLegacyClient(callback, options, transactionId) {
    const client = await getDatabaseClient();
    const transaction = await client.transaction(options.timeoutMs);

    try {
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async _batchWithConnectionPool(statements, options, batchId) {
    const lease = await acquireDbLease(batchId, options.timeout);

    try {
      return await lease.batch(statements);
    } finally {
      lease.release();
    }
  }

  async _batchWithLegacyClient(statements, options, batchId) {
    const client = await getDatabaseClient();
    return await client.batch(statements);
  }

  _getConnectionPoolConfig() {
    return this.config.getConnectionPoolConfig();
  }

  _getCircuitBreakerConfig() {
    return this.config.getCircuitBreakerConfig();
  }

  _recordOperationSuccess(startTime, context) {
    const duration = Date.now() - startTime;
    this.lastOperation = { ...context, duration, status: 'success' };

    if (this.monitoring) {
      this.monitoring.trackApiRequest(
        context.operationId,
        'database_operation',
        200,
        duration,
        context
      );
    }
  }

  _recordOperationFailure(error, startTime, context) {
    const duration = Date.now() - startTime;
    this.errorCount++;
    this.lastOperation = { ...context, duration, status: 'failure', error: error.message };

    if (this.monitoring) {
      this.monitoring.trackError(error, context);
      this.monitoring.trackApiRequest(
        context.operationId,
        'database_operation',
        500,
        duration,
        { ...context, error: error.message }
      );
    }
  }

  _recordTransactionSuccess(startTime, transactionId) {
    const duration = Date.now() - startTime;

    if (this.monitoring) {
      this.monitoring.trackApiRequest(
        transactionId,
        'database_transaction',
        200,
        duration,
        { type: 'transaction' }
      );
    }
  }

  _recordTransactionFailure(error, startTime, transactionId) {
    const duration = Date.now() - startTime;
    this.errorCount++;

    if (this.monitoring) {
      this.monitoring.trackError(error, { transactionId, type: 'transaction' });
      this.monitoring.trackApiRequest(
        transactionId,
        'database_transaction',
        500,
        duration,
        { type: 'transaction', error: error.message }
      );
    }
  }

  _recordBatchSuccess(startTime, batchId, statementCount) {
    const duration = Date.now() - startTime;

    if (this.monitoring) {
      this.monitoring.trackApiRequest(
        batchId,
        'database_batch',
        200,
        duration,
        { type: 'batch', statementCount }
      );
    }
  }

  _recordBatchFailure(error, startTime, batchId, statementCount) {
    const duration = Date.now() - startTime;
    this.errorCount++;

    if (this.monitoring) {
      this.monitoring.trackError(error, { batchId, type: 'batch', statementCount });
      this.monitoring.trackApiRequest(
        batchId,
        'database_batch',
        500,
        duration,
        { type: 'batch', statementCount, error: error.message }
      );
    }
  }

  _recordFallbackSuccess(startTime, context) {
    const duration = Date.now() - startTime;

    if (this.monitoring) {
      this.monitoring.trackApiRequest(
        context.operationId || context.transactionId || context.batchId,
        'database_fallback',
        200,
        duration,
        { ...context, fallback: true }
      );
    }
  }

  _recordFallbackFailure(error, context) {
    if (this.monitoring) {
      this.monitoring.trackError(error, { ...context, fallback: true });
    }
  }

  _generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Factory function to create enterprise database clients
 */
export function createEnterpriseDatabaseClient(options = {}) {
  return new EnterpriseDatabaseClient(options);
}

/**
 * Convenience function for backward compatibility
 *
 * This function provides a drop-in replacement for getDatabaseClient()
 * that automatically uses enterprise features when available.
 */
export async function getEnterpriseClient(options = {}) {
  const client = new EnterpriseDatabaseClient(options);
  await client.initialize();
  return client;
}

/**
 * Enterprise Database Service
 *
 * Singleton service that manages enterprise database operations
 */
class EnterpriseDatabaseService {
  constructor() {
    this.clients = new Map();
    this.config = getDatabaseConfiguration();
    this.featureFlags = getFeatureFlagManager();
    this.monitoring = getMonitoringService();
    this.defaultClient = null;
  }

  /**
   * Get or create a client for the given context
   */
  async getClient(context = null) {
    const contextKey = context?.userId || context?.sessionId || 'default';

    if (!this.clients.has(contextKey)) {
      const client = new EnterpriseDatabaseClient({ context });
      await client.initialize();
      this.clients.set(contextKey, client);
    }

    return this.clients.get(contextKey);
  }

  /**
   * Get the default client
   */
  async getDefaultClient() {
    if (!this.defaultClient) {
      this.defaultClient = new EnterpriseDatabaseClient();
      await this.defaultClient.initialize();
    }

    return this.defaultClient;
  }

  /**
   * Close all clients
   */
  async closeAll() {
    const closePromises = [];

    for (const client of this.clients.values()) {
      closePromises.push(client.close());
    }

    if (this.defaultClient) {
      closePromises.push(this.defaultClient.close());
    }

    await Promise.allSettled(closePromises);

    this.clients.clear();
    this.defaultClient = null;
  }

  /**
   * Get service health status
   */
  async getServiceHealth() {
    const clientHealths = [];

    for (const [contextKey, client] of this.clients.entries()) {
      try {
        const health = await client.getHealthStatus();
        clientHealths.push({ contextKey, health });
      } catch (error) {
        clientHealths.push({
          contextKey,
          health: { error: error.message, healthy: false }
        });
      }
    }

    return {
      activeClients: this.clients.size,
      clientHealths,
      features: this._getEnabledFeatures(),
      timestamp: Date.now()
    };
  }

  _getEnabledFeatures() {
    const defaultContext = createContext();
    return {
      connectionPool: isFeatureEnabled('ENABLE_CONNECTION_POOL', defaultContext),
      stateMachine: isFeatureEnabled('ENABLE_STATE_MACHINE', defaultContext),
      circuitBreaker: isFeatureEnabled('ENABLE_CIRCUIT_BREAKER', defaultContext),
      monitoring: isFeatureEnabled('ENABLE_ENTERPRISE_MONITORING', defaultContext),
      performance: isFeatureEnabled('ENABLE_PERFORMANCE_OPTIMIZATION', defaultContext)
    };
  }
}

/**
 * Singleton instance
 */
let enterpriseServiceInstance = null;

/**
 * Get the enterprise database service
 */
export function getEnterpriseDatabaseService() {
  if (!enterpriseServiceInstance) {
    enterpriseServiceInstance = new EnterpriseDatabaseService();
  }
  return enterpriseServiceInstance;
}

/**
 * Reset service instance (for testing)
 */
export async function resetEnterpriseDatabaseService() {
  if (enterpriseServiceInstance) {
    await enterpriseServiceInstance.closeAll();
    enterpriseServiceInstance = null;
  }
}

export { EnterpriseDatabaseService };