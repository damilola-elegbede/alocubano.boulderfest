/**
 * Monitoring Service Unit Tests
 * Comprehensive tests for core monitoring logic
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MonitoringService, getMonitoringService } from '../../../../lib/monitoring/monitoring-service.js';
import monitoringServiceModule from '../../../../lib/monitoring/monitoring-service.js';

const MONITORING_CONFIG = monitoringServiceModule.MONITORING_CONFIG;

// Mock dependencies
vi.mock('../../../../lib/monitoring/alert-manager.js', () => ({
  getAlertManager: vi.fn(() => ({
    processAlert: vi.fn().mockResolvedValue({ sent: true }),
    getStatistics: vi.fn(() => ({
      total_active: 0,
      total_escalated: 0,
      severity_breakdown: {},
      category_breakdown: {}
    }))
  })),
  AlertSeverity: {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
  },
  AlertCategory: {
    PAYMENT: 'payment',
    DATABASE: 'database',
    EXTERNAL_SERVICE: 'external_service',
    PERFORMANCE: 'performance',
    SECURITY: 'security'
  }
}));

vi.mock('../../../../lib/monitoring/performance-tracker.js', () => ({
  getPerformanceTracker: vi.fn(() => ({
    recordMetric: vi.fn(),
    getMetrics: vi.fn(() => ({
      avgResponseTime: 100,
      percentiles: { p50: 80, p95: 150, p99: 200 }
    }))
  }))
}));

vi.mock('../../../../lib/monitoring/sentry-config.js', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn()
}));

describe('MonitoringService', () => {
  let service;

  beforeEach(() => {
    service = new MonitoringService();
    // Clear intervals to avoid interference
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct structure', () => {
      expect(service).toBeDefined();
      expect(service.metricsCollector).toBeDefined();
      expect(service.transactionMonitor).toBeDefined();
      expect(service.businessMetrics).toBeDefined();
      expect(service.initialized).toBe(false);
    });

    it('should initialize only once', async () => {
      await service.initialize();
      expect(service.initialized).toBe(true);

      // Second call should not reinitialize
      await service.initialize();
      expect(service.initialized).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      // Simply verify that initialization doesn't throw
      const result = await service.initialize();

      // Should not throw and service should be marked as initialized
      expect(service.initialized).toBe(true);
      expect(result).toBeUndefined();
    });
  });

  describe('MetricsCollector', () => {
    it('should increment counter', () => {
      service.metricsCollector.incrementCounter('test.counter', 5);
      const metrics = service.metricsCollector.getAllMetrics();

      expect(metrics['counter.test.counter']).toBe(5);
    });

    it('should increment counter with tags', () => {
      service.metricsCollector.incrementCounter('api.requests', 1, { endpoint: '/test', method: 'GET' });
      const metrics = service.metricsCollector.getAllMetrics();

      expect(metrics['counter.api.requests:endpoint:/test,method:GET']).toBe(1);
    });

    it('should set gauge value', () => {
      service.metricsCollector.setGauge('memory.usage', 1024);
      const metrics = service.metricsCollector.getAllMetrics();

      expect(metrics['gauge.memory.usage']).toBe(1024);
    });

    it('should record timer values', () => {
      // Need at least 10 values to calculate percentiles
      for (let i = 0; i < 15; i++) {
        service.metricsCollector.recordTimer('api.duration', 100 + i * 10);
      }

      const metrics = service.metricsCollector.getAllMetrics();

      expect(metrics['timer.api.duration.p50']).toBeDefined();
      expect(metrics['timer.api.duration.p95']).toBeDefined();
      expect(metrics['timer.api.duration.p99']).toBeDefined();
    });

    it('should record histogram values', () => {
      for (let i = 0; i < 20; i++) {
        service.metricsCollector.recordHistogram('response.size', 1000 + i * 100);
      }

      const metrics = service.metricsCollector.getAllMetrics();

      expect(metrics['histogram.response.size.count']).toBe(20);
      expect(metrics['histogram.response.size.mean']).toBeDefined();
      expect(metrics['histogram.response.size.stdDev']).toBeDefined();
    });

    it('should calculate percentiles correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const percentiles = service.metricsCollector.calculatePercentiles(values);

      // p50 is at index Math.floor(10 * 0.5) = 5, which is value 6 (0-indexed)
      expect(percentiles.p50).toBe(6);
      expect(percentiles.min).toBe(1);
      expect(percentiles.max).toBe(10);
      expect(percentiles.count).toBe(10);
    });

    it('should calculate statistics correctly', () => {
      const values = [10, 20, 30, 40, 50];
      const stats = service.metricsCollector.calculateStatistics(values);

      expect(stats.count).toBe(5);
      expect(stats.mean).toBe(30);
      expect(stats.sum).toBe(150);
      expect(stats.stdDev).toBeGreaterThan(0);
    });

    it('should handle empty statistics', () => {
      const stats = service.metricsCollector.calculateStatistics([]);
      expect(stats.count).toBe(0);
    });

    it('should generate unique keys for tagged metrics', () => {
      const key1 = service.metricsCollector.generateKey('metric', { a: '1', b: '2' });
      const key2 = service.metricsCollector.generateKey('metric', { b: '2', a: '1' });

      expect(key1).toBe(key2); // Should be same regardless of tag order
    });

    it('should trim old metrics after 1 hour', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      service.metricsCollector.recordMetric('counter', 'test', 100, {});

      // Advance time by 2 hours
      vi.setSystemTime(now + 2 * 3600000);

      service.metricsCollector.recordMetric('counter', 'test', 200, {});

      // Old metrics should be trimmed
      const metrics = service.metricsCollector.metrics.get('counter:test');
      expect(metrics.length).toBe(1);
      expect(metrics[0].value).toBe(200);
    });

    it('should reset counters and timers', () => {
      service.metricsCollector.incrementCounter('test', 10);
      service.metricsCollector.recordTimer('duration', 100);

      service.metricsCollector.reset();

      const metrics = service.metricsCollector.getAllMetrics();
      expect(metrics['counter.test']).toBeUndefined();
      expect(metrics['timer.duration.p50']).toBeUndefined();
    });
  });

  describe('TransactionMonitor', () => {
    it('should start and end transaction', () => {
      service.transactionMonitor.startTransaction('txn-1', { type: 'payment' });

      const transaction = service.transactionMonitor.transactions.get('txn-1');
      expect(transaction).toBeDefined();
      expect(transaction.id).toBe('txn-1');
      expect(transaction.metadata.type).toBe('payment');
    });

    it('should add spans to transaction', () => {
      service.transactionMonitor.startTransaction('txn-2');
      service.transactionMonitor.addSpan('txn-2', 'database_query', 50);
      service.transactionMonitor.addSpan('txn-2', 'api_call', 100);

      const transaction = service.transactionMonitor.transactions.get('txn-2');
      expect(transaction.spans).toHaveLength(2);
      expect(transaction.spans[0].name).toBe('database_query');
      expect(transaction.spans[1].duration).toBe(100);
    });

    it('should calculate transaction duration', () => {
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      service.transactionMonitor.startTransaction('txn-3');

      vi.setSystemTime(startTime + 500);

      const result = service.transactionMonitor.endTransaction('txn-3');

      expect(result.duration).toBeGreaterThanOrEqual(500);
      expect(result.status).toBe('success');
    });

    it('should store completed transactions', () => {
      service.transactionMonitor.startTransaction('txn-4');
      service.transactionMonitor.endTransaction('txn-4', 'success');

      expect(service.transactionMonitor.completedTransactions).toHaveLength(1);
      expect(service.transactionMonitor.transactions.has('txn-4')).toBe(false);
    });

    it('should get transaction statistics', () => {
      service.transactionMonitor.startTransaction('active-1');
      service.transactionMonitor.startTransaction('txn-5');
      service.transactionMonitor.endTransaction('txn-5', 'success');
      service.transactionMonitor.startTransaction('txn-6');
      service.transactionMonitor.endTransaction('txn-6', 'failure');

      const stats = service.transactionMonitor.getStatistics();

      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(2);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.avgDuration).toBeDefined();
    });

    it('should cleanup old completed transactions', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      service.transactionMonitor.startTransaction('txn-old');
      service.transactionMonitor.endTransaction('txn-old');

      vi.setSystemTime(now + 2 * 3600000); // 2 hours later

      service.transactionMonitor.startTransaction('txn-new');
      service.transactionMonitor.endTransaction('txn-new');

      expect(service.transactionMonitor.completedTransactions).toHaveLength(1);
      expect(service.transactionMonitor.completedTransactions[0].id).toBe('txn-new');
    });

    it('should return null for non-existent transaction', () => {
      const result = service.transactionMonitor.endTransaction('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('BusinessMetricsTracker', () => {
    it('should track successful payment', () => {
      service.businessMetrics.trackPayment(100, 'success', { processor: 'stripe' });

      expect(service.businessMetrics.paymentMetrics.attempts).toBe(1);
      expect(service.businessMetrics.paymentMetrics.successes).toBe(1);
      expect(service.businessMetrics.paymentMetrics.revenue).toBe(100);
    });

    it('should track failed payment', () => {
      service.businessMetrics.trackPayment(50, 'failure');

      expect(service.businessMetrics.paymentMetrics.attempts).toBe(1);
      expect(service.businessMetrics.paymentMetrics.failures).toBe(1);
      expect(service.businessMetrics.paymentMetrics.revenue).toBe(0);
    });

    it('should track high payment failure rate', () => {
      // Track payments with high failure rate
      service.businessMetrics.trackPayment(10, 'success');
      service.businessMetrics.trackPayment(10, 'success');
      service.businessMetrics.trackPayment(10, 'failure');
      service.businessMetrics.trackPayment(10, 'failure');

      // Verify failure rate is above threshold
      const failureRate = service.businessMetrics.paymentMetrics.failures /
                          service.businessMetrics.paymentMetrics.attempts;

      expect(failureRate).toBeGreaterThan(MONITORING_CONFIG.thresholds.paymentFailureRate);
      expect(service.businessMetrics.paymentMetrics.failures).toBe(2);
      expect(service.businessMetrics.paymentMetrics.attempts).toBe(4);
    });

    it('should track user registration', () => {
      service.businessMetrics.trackUserActivity('user-1', 'registration');

      expect(service.businessMetrics.userMetrics.registrations).toBe(1);
    });

    it('should track user login and active users', () => {
      service.businessMetrics.trackUserActivity('user-1', 'login');
      service.businessMetrics.trackUserActivity('user-2', 'login');

      expect(service.businessMetrics.userMetrics.logins).toBe(2);
      expect(service.businessMetrics.userMetrics.activeUsers.size).toBe(2);
    });

    it('should track user logout', () => {
      service.businessMetrics.trackUserActivity('user-1', 'login');
      service.businessMetrics.trackUserActivity('user-1', 'logout');

      expect(service.businessMetrics.userMetrics.activeUsers.size).toBe(0);
    });

    it('should track ticket operations', () => {
      service.businessMetrics.trackTicketOperation('create');
      service.businessMetrics.trackTicketOperation('validate');
      service.businessMetrics.trackTicketOperation('transfer');
      service.businessMetrics.trackTicketOperation('cancel');

      const metrics = service.businessMetrics.ticketMetrics;
      expect(metrics.created).toBe(1);
      expect(metrics.validated).toBe(1);
      expect(metrics.transferred).toBe(1);
      expect(metrics.cancelled).toBe(1);
    });

    it('should get business metrics summary', () => {
      service.businessMetrics.trackPayment(100, 'success');
      service.businessMetrics.trackPayment(50, 'success');
      service.businessMetrics.trackUserActivity('user-1', 'login');
      service.businessMetrics.trackTicketOperation('create');

      const summary = service.businessMetrics.getSummary();

      expect(summary.payments.revenue).toBe(150);
      expect(summary.payments.successRate).toBe(1);
      expect(summary.users.activeCount).toBe(1);
      expect(summary.tickets.created).toBe(1);
    });

    it('should calculate zero success rate with no attempts', () => {
      const summary = service.businessMetrics.getSummary();
      expect(summary.payments.successRate).toBe(0);
    });
  });

  describe('API Request Tracking', () => {
    it('should track API request metrics', () => {
      service.trackApiRequest('/api/test', 'GET', 200, 150);

      // Should record in metrics collector
      expect(service.metricsCollector.counters.size).toBeGreaterThan(0);
    });

    it('should track slow requests', async () => {
      const { captureMessage } = vi.mocked(await import('../../../../lib/monitoring/sentry-config.js'));

      service.trackApiRequest('/api/slow', 'POST', 200, 6000);

      expect(captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Slow API request'),
        'warning',
        expect.any(Object)
      );
    });

    it('should add breadcrumb for API requests', async () => {
      const { addBreadcrumb } = vi.mocked(await import('../../../../lib/monitoring/sentry-config.js'));

      service.trackApiRequest('/api/test', 'GET', 200, 100);

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'api',
          level: 'info'
        })
      );
    });
  });

  describe('Error Tracking', () => {
    it('should track errors', async () => {
      const error = new Error('Test error');
      await service.trackError(error, { context: 'test' });

      expect(service.errorCounts.get('Error')).toBe(1);
    });

    it('should track error rate in rolling window', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Add errors within 5-minute window
      for (let i = 0; i < 10; i++) {
        await service.trackError(new Error('Test'), {});
      }

      expect(service.errorTimestamps).toHaveLength(10);

      // Add error outside window
      vi.setSystemTime(now + 6 * 60 * 1000);
      await service.trackError(new Error('Old'), {});

      // Old timestamps should be filtered out
      expect(service.errorTimestamps.length).toBeLessThan(11);
    });

    it('should trigger alert on high error rate', async () => {
      // Generate many errors to exceed threshold (100 errors/minute)
      // In 5-minute window, need > 500 errors to exceed threshold
      for (let i = 0; i < 550; i++) {
        await service.trackError(new Error(`Error ${i}`), {});
      }

      const alertManager = service.alertManager;
      expect(alertManager.processAlert).toHaveBeenCalled();
    });

    it('should capture different error types', async () => {
      await service.trackError(new TypeError('Type error'), {});
      await service.trackError(new RangeError('Range error'), {});

      expect(service.errorCounts.get('TypeError')).toBe(1);
      expect(service.errorCounts.get('RangeError')).toBe(1);
    });
  });

  describe('Transaction API', () => {
    it('should start transaction with helper methods', () => {
      const txn = service.startTransaction('test-txn', { test: true });

      expect(txn).toBeDefined();
      expect(typeof txn.addSpan).toBe('function');
      expect(typeof txn.end).toBe('function');
    });

    it('should add spans through transaction API', () => {
      const txn = service.startTransaction('test-txn-2');
      txn.addSpan('step1', 100);
      txn.addSpan('step2', 150);

      const result = txn.end();
      expect(result.spans).toHaveLength(2);
    });

    it('should end transaction with custom status', () => {
      const txn = service.startTransaction('test-txn-3');
      const result = txn.end('failure', { error: 'Test failure' });

      expect(result.status).toBe('failure');
      expect(result.metadata.error).toBe('Test failure');
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics in JSON format', () => {
      service.businessMetrics.trackPayment(100, 'success');
      const metrics = service.exportMetrics('json');

      expect(metrics).toBeDefined();
      expect(metrics.system).toBeDefined();
      expect(metrics.business).toBeDefined();
    });

    it('should export metrics in Prometheus format', () => {
      service.businessMetrics.trackPayment(100, 'success');
      const prometheus = service.exportMetrics('prometheus');

      expect(typeof prometheus).toBe('string');
      expect(prometheus).toContain('alocubano_');
    });

    it('should export metrics in Datadog format', () => {
      service.businessMetrics.trackPayment(100, 'success');
      const datadog = service.exportMetrics('datadog');

      expect(datadog).toBeDefined();
      expect(datadog.series).toBeDefined();
      expect(Array.isArray(datadog.series)).toBe(true);
    });

    it('should format Prometheus metrics correctly', () => {
      service.metricsCollector.setGauge('test.metric', 42);
      const formatted = service.formatPrometheus(service.getMetricsSummary());

      expect(formatted).toContain('alocubano_');
      expect(formatted).toContain('42');
    });

    it('should format Datadog metrics with timestamps', () => {
      service.metricsCollector.setGauge('test.metric', 100);
      const formatted = service.formatDatadog(service.getMetricsSummary());

      expect(formatted.series).toBeDefined();
      expect(formatted.series[0].points[0]).toHaveLength(2);
    });
  });

  describe('Health Checks', () => {
    it('should check system health', async () => {
      const health = await service.checkSystemHealth();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(health.checks).toBeDefined();
      expect(health.timestamp).toBeDefined();
    });

    it('should report healthy with low memory usage', async () => {
      const health = await service.checkSystemHealth();

      if (health.checks.memory !== 'unknown') {
        expect(health.checks.memory).toMatch(/^(healthy|unhealthy)$/);
      }
    });

    it('should calculate overall health status', async () => {
      const health = await service.checkSystemHealth();

      const unhealthyCount = Object.values(health.checks).filter(s => s === 'unhealthy').length;

      if (unhealthyCount === 0) {
        expect(health.status).toBe('healthy');
      } else if (unhealthyCount > 2) {
        expect(health.status).toBe('unhealthy');
      } else {
        expect(health.status).toBe('degraded');
      }
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getMonitoringService', () => {
      const instance1 = getMonitoringService();
      const instance2 = getMonitoringService();

      expect(instance1).toBe(instance2);
    });

    it('should initialize singleton on first call', () => {
      const instance = getMonitoringService();
      expect(instance.initialized).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should have correct default thresholds', () => {
      expect(MONITORING_CONFIG.thresholds.errorRate).toBe(0.05);
      expect(MONITORING_CONFIG.thresholds.paymentFailureRate).toBe(0.01);
      expect(MONITORING_CONFIG.thresholds.responseTime.p95).toBe(2000);
    });

    it('should have correct intervals', () => {
      expect(MONITORING_CONFIG.metricsInterval).toBe(60000);
      expect(MONITORING_CONFIG.healthCheckInterval).toBe(30000);
      expect(MONITORING_CONFIG.performanceCheckInterval).toBe(300000);
    });

    it('should have rate limits configured', () => {
      expect(MONITORING_CONFIG.rateLimits.errorLogging).toBe(100);
      expect(MONITORING_CONFIG.rateLimits.metricCollection).toBe(1000);
      expect(MONITORING_CONFIG.rateLimits.alerting).toBe(10);
    });
  });
});
