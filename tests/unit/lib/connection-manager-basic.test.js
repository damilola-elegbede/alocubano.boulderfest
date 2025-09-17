/**
 * Basic Connection Manager Tests
 *
 * Simplified test suite focusing on core functionality without complex timing issues
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DatabaseConnectionManager,
  getConnectionManager,
  resetConnectionManager,
  ConnectionState
} from '../../../lib/connection-manager.js';

// Mock the database client
vi.mock('../../../lib/database.js', () => ({
  getDatabaseClient: vi.fn()
}));

// Mock the logger
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

import { getDatabaseClient } from '../../../lib/database.js';

describe('DatabaseConnectionManager - Basic Tests', () => {
  let connectionManager;
  let mockConnection;

  beforeEach(async () => {
    // Create mock connection
    mockConnection = {
      execute: vi.fn().mockResolvedValue({ rows: [{ test: 1 }] }),
      transaction: vi.fn().mockResolvedValue({
        execute: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn()
      }),
      batch: vi.fn().mockResolvedValue([]),
      close: vi.fn().mockResolvedValue()
    };

    // Mock getDatabaseClient
    getDatabaseClient.mockResolvedValue(mockConnection);

    // Clear any existing singleton instance
    await resetConnectionManager();

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up connection manager
    if (connectionManager) {
      try {
        await connectionManager.gracefulShutdown(100); // Short timeout for tests
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
    await resetConnectionManager();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      connectionManager = new DatabaseConnectionManager();

      expect(connectionManager.config.maxConnections).toBeGreaterThan(0);
      expect(connectionManager.config.minConnections).toBe(1);
      expect(connectionManager.state).toBe(ConnectionState.IDLE);
      expect(connectionManager.connections.size).toBe(0);
      expect(connectionManager.leases.size).toBe(0);
    });

    it('should apply custom configuration', () => {
      const customConfig = { maxConnections: 10, leaseTimeout: 60000 };
      connectionManager = new DatabaseConnectionManager(customConfig);

      expect(connectionManager.config.maxConnections).toBe(10);
      expect(connectionManager.config.leaseTimeout).toBe(60000);
    });
  });

  describe('Basic Lease Operations', () => {
    beforeEach(() => {
      connectionManager = new DatabaseConnectionManager({
        maxConnections: 2,
        acquireTimeout: 1000
      });
    });

    it('should acquire a connection lease', async () => {
      const lease = await connectionManager.acquireLease('test-operation');

      expect(lease).toBeDefined();
      expect(lease.id).toBeDefined();
      expect(lease.operationId).toBe('test-operation');
      expect(lease.isReleased).toBe(false);
      expect(connectionManager.metrics.totalLeasesGranted).toBe(1);
    });

    it('should execute queries through lease', async () => {
      const lease = await connectionManager.acquireLease('query-test');
      const result = await lease.execute('SELECT 1', []);

      expect(mockConnection.execute).toHaveBeenCalledWith('SELECT 1', []);
      expect(result).toEqual({ rows: [{ test: 1 }] });
    });

    it('should release lease successfully', async () => {
      const lease = await connectionManager.acquireLease('release-test');
      const leaseId = lease.id;

      lease.release();

      expect(lease.isReleased).toBe(true);
      expect(connectionManager.leases.has(leaseId)).toBe(false);
      expect(connectionManager.metrics.currentActiveLeases).toBe(0);
    });

    it('should prevent operations on released lease', async () => {
      const lease = await connectionManager.acquireLease('prevent-test');
      lease.release();

      await expect(lease.execute('SELECT 1')).rejects.toThrow('Cannot execute query on released lease');
    });
  });

  describe('Pool Management', () => {
    beforeEach(() => {
      connectionManager = new DatabaseConnectionManager({
        maxConnections: 2,
        acquireTimeout: 500
      });
    });

    it('should track pool statistics', async () => {
      const lease = await connectionManager.acquireLease('stats-test');
      const stats = connectionManager.getPoolStatistics();

      expect(stats.pool.totalConnections).toBe(1);
      expect(stats.pool.activeLeases).toBe(1);
      expect(stats.metrics.totalLeasesGranted).toBe(1);
      expect(stats.state).toBe(ConnectionState.IDLE);
    });

    it('should handle connection creation errors', async () => {
      getDatabaseClient.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(
        connectionManager.acquireLease('error-test')
      ).rejects.toThrow('Connection failed');

      expect(connectionManager.metrics.connectionCreationErrors).toBe(1);
    });
  });

  describe('Health and Status', () => {
    beforeEach(() => {
      connectionManager = new DatabaseConnectionManager();
    });

    it('should report health status', async () => {
      const health = await connectionManager.getHealthStatus();

      expect(health.status).toMatch(/healthy|unhealthy/);
      expect(health.state).toBeDefined();
      expect(health.timestamp).toBeDefined();
    });

    it('should detect unhealthy state with errors', async () => {
      // Simulate multiple connection errors
      connectionManager.metrics.connectionCreationErrors = 15;

      const health = await connectionManager.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.issues).toContain('Multiple connection creation errors');
    });
  });

  describe('Shutdown', () => {
    beforeEach(() => {
      connectionManager = new DatabaseConnectionManager({
        shutdownTimeout: 200
      });
    });

    it('should perform basic shutdown', async () => {
      const success = await connectionManager.gracefulShutdown();

      expect(success).toBe(true);
      expect(connectionManager.state).toBe(ConnectionState.SHUTDOWN);
    });

    it('should prevent new operations during shutdown', async () => {
      connectionManager.isShuttingDown = true;

      await expect(
        connectionManager.acquireLease('blocked-test')
      ).rejects.toThrow('Connection manager is shutting down');
    });
  });

  describe('Singleton Functions', () => {
    it('should return same instance from getConnectionManager', () => {
      const manager1 = getConnectionManager();
      const manager2 = getConnectionManager();

      expect(manager1).toBe(manager2);
      expect(manager1).toBeInstanceOf(DatabaseConnectionManager);
    });

    it('should reset singleton instance', async () => {
      const manager1 = getConnectionManager();
      await resetConnectionManager();
      const manager2 = getConnectionManager();

      expect(manager1).not.toBe(manager2);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      connectionManager = new DatabaseConnectionManager();
    });

    it('should handle query execution errors', async () => {
      mockConnection.execute.mockRejectedValueOnce(new Error('Query failed'));

      const lease = await connectionManager.acquireLease('error-query-test');

      await expect(lease.execute('BAD SQL')).rejects.toThrow('Query failed');
    });

    it('should track error metrics', async () => {
      getDatabaseClient.mockRejectedValueOnce(new Error('Connection failed'));

      try {
        await connectionManager.acquireLease('metric-error-test');
      } catch (error) {
        // Expected
      }

      expect(connectionManager.metrics.connectionCreationErrors).toBe(1);
      expect(connectionManager.metrics.totalLeasesGranted).toBe(0);
    });
  });

  describe('Connection Reuse', () => {
    beforeEach(() => {
      connectionManager = new DatabaseConnectionManager({ maxConnections: 2 });
    });

    it('should reuse released connections', async () => {
      // Acquire and release a lease
      const lease1 = await connectionManager.acquireLease('reuse-1');
      await connectionManager.releaseLease(lease1.id);

      // Clear mock to track new calls
      getDatabaseClient.mockClear();

      // Acquire another lease
      const lease2 = await connectionManager.acquireLease('reuse-2');

      expect(lease2).toBeDefined();
      expect(getDatabaseClient).not.toHaveBeenCalled(); // Should reuse existing connection
    });

    it('should create new connection when needed', async () => {
      const mockConnection2 = { ...mockConnection };
      getDatabaseClient
        .mockResolvedValueOnce(mockConnection)
        .mockResolvedValueOnce(mockConnection2);

      const lease1 = await connectionManager.acquireLease('new-1');
      const lease2 = await connectionManager.acquireLease('new-2');

      expect(lease1.connection).toBe(mockConnection);
      expect(lease2.connection).toBe(mockConnection2);
      expect(connectionManager.metrics.totalConnectionsCreated).toBe(2);
    });
  });
});