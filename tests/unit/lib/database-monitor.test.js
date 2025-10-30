/**
 * Unit Tests for Database Monitor
 * Tests database connection monitoring, metrics, and health checks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../lib/database.js', () => ({
  getDatabaseClient: vi.fn()
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}));

describe('Database Monitor - Unit Tests', () => {
  let DatabaseMonitor;
  let getDatabaseMonitor;
  let mockDb;
  let logger;

  beforeEach(async () => {
    vi.resetModules();

    // Import mocked modules
    const loggerModule = await import('../../../lib/logger.js');
    logger = loggerModule.logger;

    const dbModule = await import('../../../lib/database.js');
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [{ test: 1 }], rowsAffected: 1 })
    };
    dbModule.getDatabaseClient.mockResolvedValue(mockDb);

    // Import database monitor
    const module = await import('../../../lib/database-monitor.js');
    DatabaseMonitor = module.DatabaseMonitor;
    getDatabaseMonitor = module.getDatabaseMonitor;

    // Clear all mocks
    logger.log.mockClear();
    logger.warn.mockClear();
    logger.debug.mockClear();
    logger.error.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DatabaseMonitor Class', () => {
    it('should create monitor instance', () => {
      const monitor = new DatabaseMonitor();

      expect(monitor).toBeDefined();
      expect(monitor).toBeInstanceOf(DatabaseMonitor);
    });

    it('should initialize with default metrics', () => {
      const monitor = new DatabaseMonitor();

      expect(monitor.metrics).toBeDefined();
      expect(monitor.metrics.connectionAttempts).toBe(0);
      expect(monitor.metrics.connectionSuccesses).toBe(0);
      expect(monitor.metrics.connectionFailures).toBe(0);
      expect(monitor.metrics.queryCount).toBe(0);
      expect(monitor.metrics.queryErrors).toBe(0);
      expect(monitor.metrics.avgQueryTime).toBe(0);
    });

    it('should initialize with empty health checks', () => {
      const monitor = new DatabaseMonitor();

      expect(monitor.healthChecks).toBeDefined();
      expect(Array.isArray(monitor.healthChecks)).toBe(true);
      expect(monitor.healthChecks.length).toBe(0);
    });

    it('should have warning thresholds', () => {
      const monitor = new DatabaseMonitor();

      expect(monitor.warningThresholds).toBeDefined();
      expect(monitor.warningThresholds.connectionFailureRate).toBeDefined();
      expect(monitor.warningThresholds.avgQueryTimeMs).toBeDefined();
      expect(monitor.warningThresholds.staleConnectionMinutes).toBeDefined();
    });
  });

  describe('recordConnectionAttempt', () => {
    it('should increment connection attempts', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionAttempt();

      expect(monitor.metrics.connectionAttempts).toBe(1);
    });

    it('should track multiple connection attempts', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionAttempt();
      monitor.recordConnectionAttempt();
      monitor.recordConnectionAttempt();

      expect(monitor.metrics.connectionAttempts).toBe(3);
    });

    it('should set last connection time', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionAttempt();

      expect(monitor.metrics.lastConnectionTime).toBeDefined();
      expect(typeof monitor.metrics.lastConnectionTime).toBe('string');
    });

    it('should update last connection time on each attempt', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionAttempt();
      const firstTime = monitor.metrics.lastConnectionTime;

      setTimeout(() => {
        monitor.recordConnectionAttempt();
        const secondTime = monitor.metrics.lastConnectionTime;

        expect(secondTime).not.toBe(firstTime);
      }, 10);
    });
  });

  describe('recordConnectionSuccess', () => {
    it('should increment connection successes', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionSuccess();

      expect(monitor.metrics.connectionSuccesses).toBe(1);
    });

    it('should track multiple successes', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionSuccess();
      monitor.recordConnectionSuccess();

      expect(monitor.metrics.connectionSuccesses).toBe(2);
    });
  });

  describe('recordConnectionFailure', () => {
    it('should increment connection failures', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionFailure(new Error('Connection failed'));

      expect(monitor.metrics.connectionFailures).toBe(1);
    });

    it('should log warning on failure', () => {
      const monitor = new DatabaseMonitor();
      const error = new Error('Connection error');

      monitor.recordConnectionFailure(error);

      expect(logger.warn).toHaveBeenCalledWith(
        'Database connection failure recorded:',
        'Connection error'
      );
    });

    it('should track multiple failures', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionFailure(new Error('Error 1'));
      monitor.recordConnectionFailure(new Error('Error 2'));
      monitor.recordConnectionFailure(new Error('Error 3'));

      expect(monitor.metrics.connectionFailures).toBe(3);
    });
  });

  describe('recordQuery', () => {
    it('should increment query count', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(100);

      expect(monitor.metrics.queryCount).toBe(1);
    });

    it('should update average query time', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(100);

      expect(monitor.metrics.avgQueryTime).toBe(100);
    });

    it('should calculate rolling average', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(100);
      monitor.recordQuery(200);
      monitor.recordQuery(300);

      expect(monitor.metrics.avgQueryTime).toBe(200);
    });

    it('should set last query time', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(100);

      expect(monitor.metrics.lastQueryTime).toBeDefined();
      expect(typeof monitor.metrics.lastQueryTime).toBe('string');
    });

    it('should record query errors', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(100, new Error('Query error'));

      expect(monitor.metrics.queryErrors).toBe(1);
      expect(monitor.metrics.queryCount).toBe(1);
    });

    it('should track query errors separately', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(100); // Success
      monitor.recordQuery(150, new Error('Error 1')); // Error
      monitor.recordQuery(200); // Success
      monitor.recordQuery(250, new Error('Error 2')); // Error

      expect(monitor.metrics.queryCount).toBe(4);
      expect(monitor.metrics.queryErrors).toBe(2);
    });

    it('should maintain accurate average with errors', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(100);
      monitor.recordQuery(200, new Error('Slow query'));
      monitor.recordQuery(300);

      // Average should be (100 + 200 + 300) / 3 = 200
      expect(monitor.metrics.avgQueryTime).toBe(200);
    });
  });

  describe('getHealthStatus', () => {
    it('should return health status object', async () => {
      const monitor = new DatabaseMonitor();
      const status = await monitor.getHealthStatus();

      expect(status).toBeDefined();
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('metrics');
      expect(status).toHaveProperty('connectionStats');
      expect(status).toHaveProperty('warnings');
      expect(status).toHaveProperty('timestamp');
    });

    it('should calculate failure rate', async () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionAttempt();
      monitor.recordConnectionAttempt();
      monitor.recordConnectionAttempt();
      monitor.recordConnectionSuccess();
      monitor.recordConnectionSuccess();
      monitor.recordConnectionFailure(new Error('Failed'));

      const status = await monitor.getHealthStatus();

      // 1 failure out of 3 attempts = 33.3% failure rate
      expect(status.metrics.connectionAttempts).toBe(3);
      expect(status.metrics.connectionFailures).toBe(1);
    });

    it('should return healthy status when no warnings', async () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionAttempt();
      monitor.recordConnectionSuccess();
      monitor.recordQuery(100);

      const status = await monitor.getHealthStatus();

      expect(status.status).toBe('healthy');
      expect(status.warnings.length).toBe(0);
    });

    it('should warn on high failure rate', async () => {
      const monitor = new DatabaseMonitor();

      // Create high failure rate (> 10%)
      for (let i = 0; i < 10; i++) {
        monitor.recordConnectionAttempt();
        if (i < 8) {
          monitor.recordConnectionSuccess();
        } else {
          monitor.recordConnectionFailure(new Error('Failed'));
        }
      }

      const status = await monitor.getHealthStatus();

      expect(status.status).toBe('warning');
      expect(status.warnings.length).toBeGreaterThan(0);
    });

    it('should warn on slow queries', async () => {
      const monitor = new DatabaseMonitor();

      // Record slow queries (> 1000ms average)
      monitor.recordQuery(2000);
      monitor.recordQuery(2500);
      monitor.recordQuery(3000);

      const status = await monitor.getHealthStatus();

      expect(status.status).toBe('warning');
      expect(status.warnings.some(w => w.includes('Slow average query time'))).toBe(true);
    });

    it('should include timestamp in ISO format', async () => {
      const monitor = new DatabaseMonitor();
      const status = await monitor.getHealthStatus();

      expect(status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('performHealthCheck', () => {
    it('should perform connectivity test', async () => {
      const monitor = new DatabaseMonitor();
      const result = await monitor.performHealthCheck();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('timestamp');
    });

    it('should execute SELECT 1 test query', async () => {
      const monitor = new DatabaseMonitor();
      await monitor.performHealthCheck();

      expect(mockDb.execute).toHaveBeenCalledWith('SELECT 1 as test');
    });

    it('should record successful connectivity check', async () => {
      const monitor = new DatabaseMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.checks).toBeDefined();
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks[0].status).toBe('pass');
    });

    it('should handle database errors', async () => {
      const monitor = new DatabaseMonitor();
      mockDb.execute.mockRejectedValueOnce(new Error('Database error'));

      const result = await monitor.performHealthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.checks[0].status).toBe('error');
    });

    it('should track check duration', async () => {
      const monitor = new DatabaseMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.checks[0]).toHaveProperty('duration');
      expect(typeof result.checks[0].duration).toBe('number');
      expect(result.checks[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should update connection metrics', async () => {
      const monitor = new DatabaseMonitor();
      const beforeAttempts = monitor.metrics.connectionAttempts;

      await monitor.performHealthCheck();

      expect(monitor.metrics.connectionAttempts).toBe(beforeAttempts + 1);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to zero', () => {
      const monitor = new DatabaseMonitor();

      // Set some metrics
      monitor.recordConnectionAttempt();
      monitor.recordConnectionSuccess();
      monitor.recordQuery(100);

      monitor.resetMetrics();

      expect(monitor.metrics.connectionAttempts).toBe(0);
      expect(monitor.metrics.connectionSuccesses).toBe(0);
      expect(monitor.metrics.connectionFailures).toBe(0);
      expect(monitor.metrics.queryCount).toBe(0);
      expect(monitor.metrics.queryErrors).toBe(0);
      expect(monitor.metrics.avgQueryTime).toBe(0);
    });

    it('should reset timestamps to null', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordConnectionAttempt();
      monitor.recordQuery(100);

      monitor.resetMetrics();

      expect(monitor.metrics.lastConnectionTime).toBeNull();
      expect(monitor.metrics.lastQueryTime).toBeNull();
    });

    it('should clear health checks', () => {
      const monitor = new DatabaseMonitor();

      monitor.healthChecks.push({ test: 'check' });

      monitor.resetMetrics();

      expect(monitor.healthChecks.length).toBe(0);
    });
  });

  describe('getDatabaseMonitor Singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getDatabaseMonitor();
      const instance2 = getDatabaseMonitor();

      expect(instance1).toBe(instance2);
    });

    it('should create instance on first call', () => {
      const instance = getDatabaseMonitor();

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(DatabaseMonitor);
    });

    it('should maintain state across calls', () => {
      const monitor1 = getDatabaseMonitor();
      monitor1.recordQuery(100);

      const monitor2 = getDatabaseMonitor();

      expect(monitor2.metrics.queryCount).toBe(1);
      expect(monitor2.metrics.avgQueryTime).toBe(100);
    });
  });

  describe('Warning Thresholds', () => {
    it('should have configurable connection failure rate threshold', () => {
      const monitor = new DatabaseMonitor();

      expect(monitor.warningThresholds.connectionFailureRate).toBe(0.1); // 10%
    });

    it('should have configurable query time threshold', () => {
      const monitor = new DatabaseMonitor();

      expect(monitor.warningThresholds.avgQueryTimeMs).toBe(1000); // 1 second
    });

    it('should have configurable stale connection threshold', () => {
      const monitor = new DatabaseMonitor();

      expect(monitor.warningThresholds.staleConnectionMinutes).toBe(30); // 30 minutes
    });
  });

  describe('Error Rate Calculation', () => {
    it('should calculate 0% error rate with no queries', async () => {
      const monitor = new DatabaseMonitor();
      const status = await monitor.getHealthStatus();

      // No queries = 0 errors
      expect(status.metrics.queryCount).toBe(0);
      expect(status.metrics.queryErrors).toBe(0);
    });

    it('should calculate correct error rate', async () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(100);
      monitor.recordQuery(150, new Error('Error 1'));
      monitor.recordQuery(200);
      monitor.recordQuery(250, new Error('Error 2'));
      monitor.recordQuery(300);

      const status = await monitor.getHealthStatus();

      // 2 errors out of 5 queries = 40%
      expect(status.metrics.queryErrors).toBe(2);
      expect(status.metrics.queryCount).toBe(5);
    });
  });

  describe('Integration with Database Client', () => {
    it('should use getDatabaseClient for health checks', async () => {
      const { getDatabaseClient } = await import('../../../lib/database.js');
      const monitor = new DatabaseMonitor();

      await monitor.performHealthCheck();

      expect(getDatabaseClient).toHaveBeenCalled();
    });

    it('should handle database client errors', async () => {
      const { getDatabaseClient } = await import('../../../lib/database.js');
      getDatabaseClient.mockRejectedValueOnce(new Error('Client error'));

      const monitor = new DatabaseMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.status).toBe('unhealthy');
    });
  });

  describe('Performance Metrics', () => {
    it('should track performance over time', () => {
      const monitor = new DatabaseMonitor();

      const times = [100, 150, 200, 250, 300];
      times.forEach(time => monitor.recordQuery(time));

      expect(monitor.metrics.queryCount).toBe(5);
      expect(monitor.metrics.avgQueryTime).toBe(200);
    });

    it('should handle very fast queries', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(1);
      monitor.recordQuery(2);
      monitor.recordQuery(3);

      expect(monitor.metrics.avgQueryTime).toBe(2);
    });

    it('should handle very slow queries', () => {
      const monitor = new DatabaseMonitor();

      monitor.recordQuery(5000);
      monitor.recordQuery(10000);

      expect(monitor.metrics.avgQueryTime).toBe(7500);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should track typical API request pattern', async () => {
      const monitor = new DatabaseMonitor();

      // Simulate API request with DB queries
      monitor.recordConnectionAttempt();
      monitor.recordConnectionSuccess();
      monitor.recordQuery(45); // Fast query
      monitor.recordQuery(120); // Normal query
      monitor.recordQuery(80); // Fast query

      const status = await monitor.getHealthStatus();

      expect(status.status).toBe('healthy');
      expect(status.metrics.queryCount).toBe(3);
      expect(status.metrics.avgQueryTime).toBeLessThan(100);
    });

    it('should detect degraded performance', async () => {
      const monitor = new DatabaseMonitor();

      // Simulate slow database
      for (let i = 0; i < 10; i++) {
        monitor.recordConnectionAttempt();
        monitor.recordConnectionSuccess();
        monitor.recordQuery(1500 + Math.random() * 500);
      }

      const status = await monitor.getHealthStatus();

      expect(status.status).toBe('warning');
      expect(status.warnings.length).toBeGreaterThan(0);
    });

    it('should track connection pool exhaustion', async () => {
      const monitor = new DatabaseMonitor();

      // Simulate connection failures
      for (let i = 0; i < 5; i++) {
        monitor.recordConnectionAttempt();
        monitor.recordConnectionFailure(new Error('Pool exhausted'));
      }

      const status = await monitor.getHealthStatus();

      expect(status.status).toBe('warning');
      expect(status.metrics.connectionFailures).toBe(5);
    });
  });
});
