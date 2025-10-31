/**
 * Unit Tests for Connection Health Monitor
 * Tests comprehensive health monitoring for database connections
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('../../../lib/connection-manager.js', () => ({
  getConnectionManager: vi.fn(),
  getPoolStatistics: vi.fn(),
  getPoolHealthStatus: vi.fn()
}));

vi.mock('../../../lib/circuit-breaker.js', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      execute: vi.fn(async (fn) => await fn()),
      reset: vi.fn()
    }))
  };
});

describe('Connection Health Monitor - Unit Tests', () => {
  let ConnectionHealthMonitor;
  let getHealthMonitor;
  let resetHealthMonitor;
  let performSystemHealthCheck;
  let HealthStatus;
  let AlertSeverity;
  let MetricTypes;
  let logger;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllTimers();

    // Import mocked modules
    const loggerModule = await import('../../../lib/logger.js');
    logger = loggerModule.logger;

    const connectionManager = await import('../../../lib/connection-manager.js');
    connectionManager.getPoolStatistics.mockResolvedValue({
      pool: {
        activeLeases: 2,
        maxConnections: 10,
        totalConnections: 5,
        availableConnections: 3
      },
      metrics: {
        totalConnectionsCreated: 10,
        connectionCreationErrors: 0,
        totalLeasesGranted: 100,
        totalLeasesReleased: 98
      }
    });

    connectionManager.getPoolHealthStatus.mockResolvedValue({
      status: 'healthy',
      activeConnections: 2,
      idleConnections: 3
    });

    // Import health monitor
    const module = await import('../../../lib/connection-health-monitor.js');
    ConnectionHealthMonitor = module.ConnectionHealthMonitor;
    getHealthMonitor = module.getHealthMonitor;
    resetHealthMonitor = module.resetHealthMonitor;
    performSystemHealthCheck = module.performSystemHealthCheck;
    HealthStatus = module.HealthStatus;
    AlertSeverity = module.AlertSeverity;
    MetricTypes = module.MetricTypes;

    // Reset singleton for clean tests
    await resetHealthMonitor();

    // Clear all mocks
    logger.log.mockClear();
    logger.warn.mockClear();
    logger.debug.mockClear();
    logger.error.mockClear();
  });

  afterEach(async () => {
    await resetHealthMonitor();
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('Constants', () => {
    it('should export HealthStatus levels', () => {
      expect(HealthStatus).toBeDefined();
      expect(HealthStatus.HEALTHY).toBe('healthy');
      expect(HealthStatus.WARNING).toBe('warning');
      expect(HealthStatus.CRITICAL).toBe('critical');
      expect(HealthStatus.UNAVAILABLE).toBe('unavailable');
    });

    it('should export AlertSeverity levels', () => {
      expect(AlertSeverity).toBeDefined();
      expect(AlertSeverity.INFO).toBe('info');
      expect(AlertSeverity.WARNING).toBe('warning');
      expect(AlertSeverity.CRITICAL).toBe('critical');
      expect(AlertSeverity.EMERGENCY).toBe('emergency');
    });

    it('should export MetricTypes', () => {
      expect(MetricTypes).toBeDefined();
      expect(MetricTypes.CONNECTION_ACQUISITION).toBe('connection_acquisition');
      expect(MetricTypes.QUERY_EXECUTION).toBe('query_execution');
      expect(MetricTypes.POOL_UTILIZATION).toBe('pool_utilization');
      expect(MetricTypes.CIRCUIT_BREAKER).toBe('circuit_breaker');
      expect(MetricTypes.STATE_MACHINE).toBe('state_machine');
      expect(MetricTypes.RESOURCE_USAGE).toBe('resource_usage');
    });

    it('should freeze HealthStatus to prevent modification', () => {
      expect(Object.isFrozen(HealthStatus)).toBe(true);
    });

    it('should freeze AlertSeverity to prevent modification', () => {
      expect(Object.isFrozen(AlertSeverity)).toBe(true);
    });

    it('should freeze MetricTypes to prevent modification', () => {
      expect(Object.isFrozen(MetricTypes)).toBe(true);
    });
  });

  describe('ConnectionHealthMonitor Constructor', () => {
    it('should create instance with default config', () => {
      const monitor = new ConnectionHealthMonitor();

      expect(monitor).toBeDefined();
      expect(monitor.config).toBeDefined();
    });

    it('should initialize with default thresholds', () => {
      const monitor = new ConnectionHealthMonitor();

      expect(monitor.config.poolUtilizationWarning).toBe(85);
      expect(monitor.config.poolUtilizationCritical).toBe(95);
      expect(monitor.config.connectionAcquisitionWarning).toBe(1000);
      expect(monitor.config.connectionAcquisitionCritical).toBe(5000);
      expect(monitor.config.errorRateWarning).toBe(5);
      expect(monitor.config.errorRateCritical).toBe(10);
    });

    it('should accept custom configuration', () => {
      const monitor = new ConnectionHealthMonitor({
        poolUtilizationWarning: 70,
        errorRateWarning: 3
      });

      expect(monitor.config.poolUtilizationWarning).toBe(70);
      expect(monitor.config.errorRateWarning).toBe(3);
    });

    it('should initialize metrics storage', () => {
      const monitor = new ConnectionHealthMonitor();

      expect(monitor.metricsHistory).toBeDefined();
      expect(Array.isArray(monitor.metricsHistory)).toBe(true);
      expect(monitor.metricsHistory.length).toBe(0);
    });

    it('should initialize alert tracking', () => {
      const monitor = new ConnectionHealthMonitor();

      expect(monitor.currentAlerts).toBeDefined();
      expect(monitor.currentAlerts instanceof Map).toBe(true);
      expect(monitor.currentAlerts.size).toBe(0);
    });

    it('should initialize monitoring stats', () => {
      const monitor = new ConnectionHealthMonitor();

      expect(monitor.monitoringStats).toBeDefined();
      expect(monitor.monitoringStats.totalHealthChecks).toBe(0);
      expect(monitor.monitoringStats.healthCheckFailures).toBe(0);
      expect(monitor.monitoringStats.alertsGenerated).toBe(0);
    });
  });

  describe('performHealthCheck', () => {
    it('should execute comprehensive health check', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('timestamp');
    });

    it('should check connection pool health', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.components).toHaveProperty('connectionPool');
      expect(result.components.connectionPool).toHaveProperty('status');
      expect(result.components.connectionPool).toHaveProperty('metrics');
    });

    it('should check circuit breaker health', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.components).toHaveProperty('circuitBreaker');
      expect(result.components.circuitBreaker).toHaveProperty('status');
    });

    it('should check state machine health', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.components).toHaveProperty('stateMachine');
      expect(result.components.stateMachine).toHaveProperty('status');
    });

    it('should increment health check counter', async () => {
      const monitor = new ConnectionHealthMonitor();
      const beforeCount = monitor.monitoringStats.totalHealthChecks;

      await monitor.performHealthCheck();

      expect(monitor.monitoringStats.totalHealthChecks).toBe(beforeCount + 1);
    });

    it('should calculate check duration', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include timestamp in ISO format', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return healthy status when all components healthy', async () => {
      const monitor = new ConnectionHealthMonitor();

      // Mock the internal health check methods to return healthy status
      vi.spyOn(monitor, '_checkCircuitBreakerHealth').mockResolvedValue({
        status: HealthStatus.HEALTHY,
        alerts: [],
        metrics: {}
      });
      vi.spyOn(monitor, '_checkStateMachineHealth').mockResolvedValue({
        status: HealthStatus.HEALTHY,
        alerts: [],
        metrics: {}
      });

      const result = await monitor.performHealthCheck();

      expect(result.status).toBe(HealthStatus.HEALTHY);
    });
  });

  describe('Alert Generation', () => {
    it('should generate alerts for high pool utilization', async () => {
      const { getPoolStatistics } = await import('../../../lib/connection-manager.js');
      getPoolStatistics.mockResolvedValueOnce({
        pool: {
          activeLeases: 96,
          maxConnections: 100,
          totalConnections: 100,
          availableConnections: 4
        },
        metrics: {
          totalConnectionsCreated: 100,
          connectionCreationErrors: 0,
          totalLeasesGranted: 1000,
          totalLeasesReleased: 900
        }
      });

      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.status).toBe(HealthStatus.CRITICAL);
    });

    it('should generate warnings for elevated error rates', async () => {
      const { getPoolStatistics } = await import('../../../lib/connection-manager.js');
      getPoolStatistics.mockResolvedValueOnce({
        pool: {
          activeLeases: 2,
          maxConnections: 10,
          totalConnections: 5,
          availableConnections: 3
        },
        metrics: {
          totalConnectionsCreated: 100,
          connectionCreationErrors: 8, // 8% error rate
          totalLeasesGranted: 100,
          totalLeasesReleased: 98
        }
      });

      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.alerts.length).toBeGreaterThan(0);
    });

    it('should track alert history', async () => {
      const monitor = new ConnectionHealthMonitor();
      await monitor.performHealthCheck();

      expect(monitor.alertHistory).toBeDefined();
      expect(Array.isArray(monitor.alertHistory)).toBe(true);
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate performance metrics', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result).toHaveProperty('performanceMetrics');
      expect(result.performanceMetrics).toHaveProperty('connectionAcquisition');
      expect(result.performanceMetrics).toHaveProperty('queryExecution');
      expect(result.performanceMetrics).toHaveProperty('resourceUtilization');
    });

    it('should track connection acquisition times', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.performanceMetrics.connectionAcquisition).toHaveProperty('average');
      expect(result.performanceMetrics.connectionAcquisition).toHaveProperty('p50');
      expect(result.performanceMetrics.connectionAcquisition).toHaveProperty('p95');
      expect(result.performanceMetrics.connectionAcquisition).toHaveProperty('p99');
    });

    it('should track resource utilization', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.performanceMetrics.resourceUtilization).toHaveProperty('connectionPool');
      expect(typeof result.performanceMetrics.resourceUtilization.connectionPool).toBe('number');
    });
  });

  describe('Metrics Storage', () => {
    it('should store metrics when enabled', async () => {
      const monitor = new ConnectionHealthMonitor({
        enableDetailedMetrics: true
      });

      await monitor.performHealthCheck();

      expect(monitor.metricsHistory.length).toBeGreaterThan(0);
    });

    it('should limit metrics history size', async () => {
      const monitor = new ConnectionHealthMonitor({
        enableDetailedMetrics: true,
        maxHistoricalEntries: 5
      });

      for (let i = 0; i < 10; i++) {
        await monitor.performHealthCheck();
      }

      expect(monitor.metricsHistory.length).toBeLessThanOrEqual(5);
    });

    it('should clean up old metrics', async () => {
      const monitor = new ConnectionHealthMonitor({
        enableDetailedMetrics: true,
        metricsRetentionPeriod: 100 // 100ms
      });

      await monitor.performHealthCheck();
      await new Promise(resolve => setTimeout(resolve, 150));
      await monitor.performHealthCheck();

      // Old metrics should be cleaned up
      expect(monitor.metricsHistory.length).toBe(1);
    });
  });

  describe('getMonitoringStats', () => {
    it('should return monitoring statistics', async () => {
      const monitor = new ConnectionHealthMonitor();
      const stats = monitor.getMonitoringStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalHealthChecks');
      expect(stats).toHaveProperty('healthCheckFailures');
      expect(stats).toHaveProperty('alertsGenerated');
      expect(stats).toHaveProperty('currentTime');
      expect(stats).toHaveProperty('uptimeSeconds');
    });

    it('should track uptime', async () => {
      const monitor = new ConnectionHealthMonitor();
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = monitor.getMonitoringStats();

      expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should track current alert count', async () => {
      const monitor = new ConnectionHealthMonitor();
      const stats = monitor.getMonitoringStats();

      expect(stats).toHaveProperty('currentAlertCount');
      expect(typeof stats.currentAlertCount).toBe('number');
    });
  });

  describe('getHistoricalMetrics', () => {
    it('should return all metrics by default', async () => {
      const monitor = new ConnectionHealthMonitor({
        enableDetailedMetrics: true
      });

      await monitor.performHealthCheck();
      await monitor.performHealthCheck();

      const metrics = monitor.getHistoricalMetrics();

      expect(metrics.length).toBe(2);
    });

    it('should filter by start time', async () => {
      const monitor = new ConnectionHealthMonitor({
        enableDetailedMetrics: true
      });

      const startTime = Date.now();
      await monitor.performHealthCheck();
      await new Promise(resolve => setTimeout(resolve, 50));
      await monitor.performHealthCheck();

      const metrics = monitor.getHistoricalMetrics(startTime + 25);

      expect(metrics.length).toBe(1);
    });

    it('should filter by end time', async () => {
      const monitor = new ConnectionHealthMonitor({
        enableDetailedMetrics: true
      });

      await monitor.performHealthCheck();
      const endTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50));
      await monitor.performHealthCheck();

      const metrics = monitor.getHistoricalMetrics(null, endTime);

      expect(metrics.length).toBe(1);
    });
  });

  describe('getCurrentAlerts', () => {
    it('should return array of current alerts', () => {
      const monitor = new ConnectionHealthMonitor();
      const alerts = monitor.getCurrentAlerts();

      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should return empty array when no alerts', () => {
      const monitor = new ConnectionHealthMonitor();
      const alerts = monitor.getCurrentAlerts();

      expect(alerts.length).toBe(0);
    });
  });

  describe('getAlertHistory', () => {
    it('should return alert history', () => {
      const monitor = new ConnectionHealthMonitor();
      const history = monitor.getAlertHistory();

      expect(Array.isArray(history)).toBe(true);
    });

    it('should limit history size', () => {
      const monitor = new ConnectionHealthMonitor();
      monitor.alertHistory = Array.from({ length: 200 }, (_, i) => ({
        id: i,
        timestamp: Date.now()
      }));

      const history = monitor.getAlertHistory(50);

      expect(history.length).toBeLessThanOrEqual(50);
    });

    it('should sort by timestamp descending', () => {
      const monitor = new ConnectionHealthMonitor();
      monitor.alertHistory = [
        { timestamp: 1000 },
        { timestamp: 3000 },
        { timestamp: 2000 }
      ];

      const history = monitor.getAlertHistory();

      expect(history[0].timestamp).toBe(3000);
      expect(history[1].timestamp).toBe(2000);
      expect(history[2].timestamp).toBe(1000);
    });
  });

  describe('Periodic Monitoring', () => {
    it('should start periodic monitoring on construction', () => {
      const monitor = new ConnectionHealthMonitor();

      expect(monitor.monitoringInterval).toBeDefined();
    });

    it('should stop periodic monitoring', () => {
      const monitor = new ConnectionHealthMonitor();

      monitor.stopPeriodicMonitoring();

      expect(monitor.monitoringInterval).toBeNull();
    });

    it('should not start duplicate monitoring', () => {
      const monitor = new ConnectionHealthMonitor();
      const firstInterval = monitor.monitoringInterval;

      monitor.startPeriodicMonitoring();

      expect(monitor.monitoringInterval).toBe(firstInterval);
    });
  });

  describe('shutdown', () => {
    it('should stop monitoring on shutdown', async () => {
      const monitor = new ConnectionHealthMonitor();
      await monitor.shutdown();

      expect(monitor.monitoringInterval).toBeNull();
    });

    it('should reset circuit breaker on shutdown', async () => {
      const monitor = new ConnectionHealthMonitor();
      const resetSpy = vi.spyOn(monitor.monitoringCircuitBreaker, 'reset');

      await monitor.shutdown();

      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe('getHealthMonitor Singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getHealthMonitor();
      const instance2 = getHealthMonitor();

      expect(instance1).toBe(instance2);
    });

    it('should create instance on first call', () => {
      const instance = getHealthMonitor();

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(ConnectionHealthMonitor);
    });

    it('should accept options on first call', () => {
      const instance = getHealthMonitor({
        poolUtilizationWarning: 75
      });

      expect(instance.config.poolUtilizationWarning).toBe(75);
    });
  });

  describe('resetHealthMonitor', () => {
    it('should reset singleton instance', async () => {
      const instance1 = getHealthMonitor();
      await resetHealthMonitor();
      const instance2 = getHealthMonitor();

      expect(instance2).not.toBe(instance1);
    });

    it('should shutdown existing instance', async () => {
      const instance = getHealthMonitor();
      const shutdownSpy = vi.spyOn(instance, 'shutdown');

      await resetHealthMonitor();

      expect(shutdownSpy).toHaveBeenCalled();
    });
  });

  describe('performSystemHealthCheck', () => {
    it('should perform health check on singleton', async () => {
      const result = await performSystemHealthCheck();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('components');
    });

    it('should use existing monitor instance', async () => {
      const monitor = getHealthMonitor();
      const checkSpy = vi.spyOn(monitor, 'performHealthCheck');

      await performSystemHealthCheck();

      expect(checkSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle circuit breaker failures', async () => {
      const monitor = new ConnectionHealthMonitor();
      monitor.monitoringCircuitBreaker.execute = vi.fn().mockRejectedValue(
        new Error('Circuit breaker error')
      );

      const result = await monitor.performHealthCheck();

      expect(result.status).toBe(HealthStatus.UNAVAILABLE);
      expect(monitor.monitoringStats.healthCheckFailures).toBeGreaterThan(0);
    });

    it('should log errors on health check failure', async () => {
      const monitor = new ConnectionHealthMonitor();
      monitor.monitoringCircuitBreaker.execute = vi.fn().mockRejectedValue(
        new Error('Check failed')
      );

      await monitor.performHealthCheck();

      expect(logger.error).toHaveBeenCalledWith(
        'Health check failed:',
        'Check failed'
      );
    });
  });

  describe('Recommendations', () => {
    it('should generate recommendations based on alerts', async () => {
      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.summary).toHaveProperty('recommendations');
      expect(Array.isArray(result.summary.recommendations)).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should detect pool exhaustion', async () => {
      const { getPoolStatistics } = await import('../../../lib/connection-manager.js');
      getPoolStatistics.mockResolvedValueOnce({
        pool: {
          activeLeases: 10,
          maxConnections: 10,
          totalConnections: 10,
          availableConnections: 0
        },
        metrics: {
          totalConnectionsCreated: 10,
          connectionCreationErrors: 0,
          totalLeasesGranted: 1000,
          totalLeasesReleased: 990
        }
      });

      const monitor = new ConnectionHealthMonitor();
      const result = await monitor.performHealthCheck();

      expect(result.status).toBe(HealthStatus.CRITICAL);
      expect(result.alerts.some(a => a.metric === 'poolUtilization')).toBe(true);
    });

    it('should monitor healthy system', async () => {
      const monitor = new ConnectionHealthMonitor();

      // Mock the internal health check methods to return healthy status
      vi.spyOn(monitor, '_checkCircuitBreakerHealth').mockResolvedValue({
        status: HealthStatus.HEALTHY,
        alerts: [],
        metrics: {}
      });
      vi.spyOn(monitor, '_checkStateMachineHealth').mockResolvedValue({
        status: HealthStatus.HEALTHY,
        alerts: [],
        metrics: {}
      });

      for (let i = 0; i < 5; i++) {
        const result = await monitor.performHealthCheck();
        expect(result.status).toBe(HealthStatus.HEALTHY);
      }
    });
  });
});
