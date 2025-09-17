/**
 * Connection Manager Integration Examples
 *
 * Demonstrates how to integrate the DatabaseConnectionManager with existing
 * database operations for enterprise-grade connection pooling
 */

import { getConnectionManager, acquireDbLease } from '../lib/connection-manager.js';
import { logger } from '../lib/logger.js';

/**
 * Example 1: Basic Database Operation with Connection Leasing
 */
export async function basicDatabaseOperation() {
  const lease = await acquireDbLease('user-registration');

  try {
    // Execute queries using the leased connection
    const result = await lease.execute(
      'SELECT * FROM registrations WHERE email = ?',
      ['user@example.com']
    );

    return result.rows;
  } finally {
    // Always release the lease when done
    lease.release();
  }
}

/**
 * Example 2: Transaction with Connection Leasing
 */
export async function transactionWithLease(ticketData) {
  const lease = await acquireDbLease('ticket-purchase');

  try {
    const transaction = await lease.transaction();

    try {
      // Create ticket
      await transaction.execute(
        'INSERT INTO tickets (id, type, price, user_id) VALUES (?, ?, ?, ?)',
        [ticketData.id, ticketData.type, ticketData.price, ticketData.userId]
      );

      // Update inventory
      await transaction.execute(
        'UPDATE ticket_inventory SET available = available - 1 WHERE type = ?',
        [ticketData.type]
      );

      // Commit transaction
      await transaction.commit();

      return { success: true, ticketId: ticketData.id };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } finally {
    lease.release();
  }
}

/**
 * Example 3: Batch Operations with Connection Leasing
 */
export async function batchEmailUpdates(emailUpdates) {
  const lease = await acquireDbLease('batch-email-updates');

  try {
    const statements = emailUpdates.map(update => ({
      sql: 'UPDATE subscribers SET status = ? WHERE email = ?',
      args: [update.status, update.email]
    }));

    const results = await lease.batch(statements);

    return {
      processed: results.length,
      updates: emailUpdates.length
    };
  } finally {
    lease.release();
  }
}

/**
 * Example 4: Service Class Integration
 */
export class RegistrationService {
  constructor() {
    this.connectionManager = getConnectionManager();
  }

  async createRegistration(registrationData) {
    const operationId = `registration-${Date.now()}`;
    const lease = await this.connectionManager.acquireLease(operationId);

    try {
      // Check for existing registration
      const existing = await lease.execute(
        'SELECT id FROM registrations WHERE email = ?',
        [registrationData.email]
      );

      if (existing.rows.length > 0) {
        throw new Error('Email already registered');
      }

      // Create new registration
      const result = await lease.execute(
        `INSERT INTO registrations (
          id, email, name, ticket_id, phone, dietary_restrictions,
          emergency_contact, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          registrationData.id,
          registrationData.email,
          registrationData.name,
          registrationData.ticketId,
          registrationData.phone,
          registrationData.dietaryRestrictions,
          registrationData.emergencyContact
        ]
      );

      return {
        id: registrationData.id,
        success: true
      };
    } finally {
      lease.release();
    }
  }

  async getRegistrationStats() {
    const lease = await this.connectionManager.acquireLease('registration-stats');

    try {
      const [totalResult, todayResult] = await Promise.all([
        lease.execute('SELECT COUNT(*) as total FROM registrations'),
        lease.execute(
          `SELECT COUNT(*) as today FROM registrations
           WHERE date(created_at) = date('now')`
        )
      ]);

      return {
        total: totalResult.rows[0].total,
        today: todayResult.rows[0].today,
        connectionPoolStats: this.connectionManager.getPoolStatistics()
      };
    } finally {
      lease.release();
    }
  }
}

/**
 * Example 5: API Handler Integration
 */
export async function apiHandlerWithConnectionPool(req, res) {
  const operationId = `api-${req.url}-${Date.now()}`;
  const lease = await acquireDbLease(operationId);

  try {
    // Simulate API operation
    const result = await lease.execute(
      'SELECT * FROM featured_photos ORDER BY created_at DESC LIMIT 10'
    );

    res.json({
      success: true,
      data: result.rows,
      metadata: {
        operationId,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`API operation ${operationId} failed:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      operationId
    });
  } finally {
    lease.release();
  }
}

/**
 * Example 6: Health Check Integration
 */
export async function healthCheckWithConnectionPool() {
  const manager = getConnectionManager();

  try {
    // Get pool health
    const poolHealth = await manager.getHealthStatus();

    // Test database connectivity through pool
    const lease = await manager.acquireLease('health-check', 2000);

    try {
      const dbTest = await lease.execute('SELECT 1 as test');

      return {
        status: poolHealth.status === 'healthy' && dbTest.rows[0].test === 1 ? 'healthy' : 'unhealthy',
        pool: poolHealth,
        database: {
          connected: true,
          testQuery: dbTest.rows[0].test === 1
        },
        timestamp: new Date().toISOString()
      };
    } finally {
      lease.release();
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Example 7: Graceful Application Shutdown
 */
export async function gracefulAppShutdown() {
  const manager = getConnectionManager();

  logger.log('Starting graceful application shutdown...');

  try {
    // Wait for active operations to complete
    const success = await manager.gracefulShutdown(10000);

    if (success) {
      logger.log('✅ Connection pool shutdown completed successfully');
    } else {
      logger.warn('⚠️ Connection pool shutdown completed with warnings');
    }

    return success;
  } catch (error) {
    logger.error('❌ Connection pool shutdown failed:', error.message);
    return false;
  }
}

/**
 * Example 8: Monitoring and Metrics
 */
export function getConnectionPoolMetrics() {
  const manager = getConnectionManager();
  const stats = manager.getPoolStatistics();

  return {
    pool: {
      utilization: (stats.pool.activeLeases / stats.pool.maxConnections) * 100,
      availableConnections: stats.pool.availableConnections,
      totalConnections: stats.pool.totalConnections
    },
    metrics: {
      totalLeasesGranted: stats.metrics.totalLeasesGranted,
      totalLeasesReleased: stats.metrics.totalLeasesReleased,
      currentActiveLeases: stats.metrics.currentActiveLeases,
      errorRate: stats.metrics.connectionCreationErrors / Math.max(stats.metrics.totalConnectionsCreated, 1)
    },
    health: {
      state: stats.state,
      issues: stats.poolStatistics?.issues || []
    },
    timestamp: stats.timestamp
  };
}

/**
 * Example 9: Load Testing Simulation
 */
export async function simulateLoad(concurrentOperations = 10, operationsPerConnection = 5) {
  const startTime = Date.now();
  const operations = [];

  for (let i = 0; i < concurrentOperations; i++) {
    operations.push(
      (async () => {
        const results = [];

        for (let j = 0; j < operationsPerConnection; j++) {
          const lease = await acquireDbLease(`load-test-${i}-${j}`);

          try {
            const result = await lease.execute('SELECT ?', [`Operation ${i}-${j}`]);
            results.push(result.rows[0]);
          } finally {
            lease.release();
          }
        }

        return results;
      })()
    );
  }

  const allResults = await Promise.all(operations);
  const totalTime = Date.now() - startTime;

  return {
    totalOperations: concurrentOperations * operationsPerConnection,
    totalTime,
    averageTimePerOperation: totalTime / (concurrentOperations * operationsPerConnection),
    results: allResults.flat().length,
    poolMetrics: getConnectionPoolMetrics()
  };
}

// Export examples for documentation
export const examples = {
  basicDatabaseOperation,
  transactionWithLease,
  batchEmailUpdates,
  RegistrationService,
  apiHandlerWithConnectionPool,
  healthCheckWithConnectionPool,
  gracefulAppShutdown,
  getConnectionPoolMetrics,
  simulateLoad
};