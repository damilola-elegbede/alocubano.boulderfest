/**
 * Performance Tracker Unit Tests
 * Comprehensive tests for performance metrics tracking and regression detection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PerformanceTracker,
  getPerformanceTracker
} from '../../../../lib/monitoring/performance-tracker.js';
import { AlertSeverity, AlertCategory } from '../../../../lib/monitoring/alert-manager.js';

// Mock dependencies
vi.mock('../../../../lib/monitoring/alert-manager.js', () => ({
  getAlertManager: vi.fn(() => ({
    processAlert: vi.fn().mockResolvedValue({ sent: true })
  })),
  AlertSeverity: {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
  },
  AlertCategory: {
    PERFORMANCE: 'performance',
    EXTERNAL_SERVICE: 'external_service'
  }
}));

vi.mock('../../../../lib/monitoring/sentry-config.js', () => ({
  captureMessage: vi.fn()
}));

describe('PerformanceTracker', () => {
  let performanceTracker;

  beforeEach(() => {
    performanceTracker = new PerformanceTracker({
      maxSamples: 100,
      checkInterval: 60000,
      baselineUpdateInterval: 3600000
    });
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct structure', () => {
      expect(performanceTracker).toBeDefined();
      expect(performanceTracker.metricsStore).toBeDefined();
      expect(performanceTracker.baselineTracker).toBeDefined();
      expect(performanceTracker.alertManager).toBeDefined();
    });

    it('should use default values if options not provided', () => {
      const tracker = new PerformanceTracker();
      expect(tracker.checkInterval).toBe(60000);
      expect(tracker.baselineUpdateInterval).toBe(3600000);
    });

    it('should initialize business metrics map', () => {
      expect(performanceTracker.businessMetrics).toBeInstanceOf(Map);
    });
  });

  describe('Endpoint Performance Tracking', () => {
    it('should track endpoint performance successfully', async () => {
      const result = await performanceTracker.trackEndpointPerformance(
        '/api/test',
        150,
        200
      );

      expect(result).toBeDefined();
      expect(result.endpoint).toBe('/api/test');
      expect(result.sample_count).toBe(1);
    });

    it('should track successful responses', async () => {
      await performanceTracker.trackEndpointPerformance('/api/success', 100, 200);

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/success');

      expect(stats.errors).toBe(0);
      expect(stats.sample_count).toBe(1);
    });

    it('should track error responses', async () => {
      await performanceTracker.trackEndpointPerformance('/api/error', 100, 500);

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/error');

      expect(stats.errors).toBe(1);
      expect(stats.error_rate).toBeGreaterThan(0);
    });

    it('should track client errors (4xx)', async () => {
      await performanceTracker.trackEndpointPerformance('/api/notfound', 50, 404);

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/notfound');

      expect(stats.errors).toBe(1);
    });

    it('should handle metadata in tracking', async () => {
      await performanceTracker.trackEndpointPerformance(
        '/api/meta',
        120,
        200,
        { method: 'GET', user_id: 'test' }
      );

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/meta');
      expect(stats).toBeDefined();
    });

    it('should create alert for very slow response', async () => {
      await performanceTracker.trackEndpointPerformance('/api/slow', 6000, 200);

      expect(performanceTracker.alertManager.processAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          category: AlertCategory.PERFORMANCE,
          type: 'slow_response'
        })
      );
    });

    it('should not alert for normal response times', async () => {
      const alertManager = performanceTracker.alertManager;
      alertManager.processAlert.mockClear();

      await performanceTracker.trackEndpointPerformance('/api/fast', 100, 200);

      expect(alertManager.processAlert).not.toHaveBeenCalled();
    });
  });

  describe('recordMetric (compatibility method)', () => {
    it('should record metric with default status code', () => {
      const result = performanceTracker.recordMetric('/api/compat', 150);

      expect(result).toBeDefined();
    });

    it('should accept metadata with statusCode', () => {
      performanceTracker.recordMetric('/api/status', 100, { statusCode: 201 });

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/status');
      expect(stats.errors).toBe(0);
    });
  });

  describe('MetricsStore - Sample Management', () => {
    it('should add samples to store', () => {
      performanceTracker.metricsStore.addSample('/api/test', 100, 200);

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/test');

      expect(stats.sample_count).toBe(1);
      expect(stats.avg_duration).toBe(100);
    });

    it('should track total requests across samples', () => {
      for (let i = 0; i < 10; i++) {
        performanceTracker.metricsStore.addSample('/api/multiple', 100, 200);
      }

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/multiple');

      expect(stats.total).toBe(10);
    });

    it('should limit samples to maxSamples', () => {
      const tracker = new PerformanceTracker({ maxSamples: 10 });

      for (let i = 0; i < 20; i++) {
        tracker.metricsStore.addSample('/api/limited', 100, 200);
      }

      const metric = tracker.metricsStore.metrics.get('/api/limited');
      expect(metric.samples.length).toBe(10);
    });

    it('should calculate percentiles correctly', () => {
      const samples = Array.from({ length: 100 }, (_, i) => ({
        duration: i + 1,
        statusCode: 200,
        timestamp: Date.now()
      }));

      const percentiles = performanceTracker.metricsStore.calculatePercentiles(samples);

      // Percentiles use floor calculation, so p50 at index 50 is value 51
      expect(percentiles.p50).toBe(51);
      expect(percentiles.p95).toBe(96);
      expect(percentiles.p99).toBe(100);
    });

    it('should handle empty samples for percentiles', () => {
      const percentiles = performanceTracker.metricsStore.calculatePercentiles([]);

      expect(percentiles.p50).toBe(0);
      expect(percentiles.p95).toBe(0);
      expect(percentiles.p99).toBe(0);
    });
  });

  describe('Endpoint Statistics', () => {
    it('should calculate statistics correctly', () => {
      for (let i = 0; i < 10; i++) {
        performanceTracker.metricsStore.addSample('/api/stats', 100 + i * 10, 200);
      }

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/stats');

      expect(stats.sample_count).toBe(10);
      expect(stats.avg_duration).toBeGreaterThan(0);
      expect(stats.min_duration).toBe(100);
      expect(stats.max_duration).toBe(190);
    });

    it('should calculate error rate', () => {
      performanceTracker.metricsStore.addSample('/api/errors', 100, 200);
      performanceTracker.metricsStore.addSample('/api/errors', 100, 500);
      performanceTracker.metricsStore.addSample('/api/errors', 100, 200);

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/errors');

      expect(stats.error_rate).toBeCloseTo(33.33, 1);
      expect(stats.errors).toBe(1);
    });

    it('should filter by time window', () => {
      const now = Date.now();

      // Add old sample
      performanceTracker.metricsStore.metrics.set('/api/window', {
        samples: [
          { duration: 100, statusCode: 200, timestamp: now - 3600000 }
        ],
        errors: 0,
        total: 1
      });

      // Add recent sample
      performanceTracker.metricsStore.addSample('/api/window', 150, 200);

      const stats = performanceTracker.metricsStore.getEndpointStats(
        '/api/window',
        60000 // Last minute
      );

      expect(stats.sample_count).toBe(1);
      expect(stats.avg_duration).toBe(150);
    });

    it('should return null for non-existent endpoint', () => {
      const stats = performanceTracker.metricsStore.getEndpointStats('/nonexistent');

      expect(stats).toBeNull();
    });

    it('should handle zero samples', () => {
      performanceTracker.metricsStore.metrics.set('/api/empty', {
        samples: [],
        errors: 0,
        total: 5
      });

      const stats = performanceTracker.metricsStore.getEndpointStats('/api/empty');

      expect(stats.sample_count).toBe(0);
      expect(stats.avg_duration).toBe(0);
    });

    it('should get all endpoint statistics', () => {
      performanceTracker.metricsStore.addSample('/api/one', 100, 200);
      performanceTracker.metricsStore.addSample('/api/two', 150, 200);

      const allStats = performanceTracker.metricsStore.getAllStats();

      expect(allStats['/api/one']).toBeDefined();
      expect(allStats['/api/two']).toBeDefined();
    });
  });

  describe('Baseline Management', () => {
    it('should establish baseline with sufficient samples', async () => {
      // Add 100 samples
      for (let i = 0; i < 100; i++) {
        performanceTracker.metricsStore.addSample('/api/baseline', 100, 200);
      }

      const result = await performanceTracker.establishBaseline('/api/baseline');

      expect(result.success).toBe(true);
      expect(result.baseline).toBeDefined();
      expect(result.baseline.p50).toBeDefined();
    });

    it('should fail to establish baseline with insufficient samples', async () => {
      performanceTracker.metricsStore.addSample('/api/insufficient', 100, 200);

      const result = await performanceTracker.establishBaseline('/api/insufficient');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient samples');
    });

    it('should update baseline with exponential moving average', () => {
      const stats1 = {
        percentiles: { p50: 100, p95: 200, p99: 300 },
        avg_duration: 150,
        error_rate: 1.0,
        sample_count: 50
      };

      performanceTracker.baselineTracker.updateBaseline('/api/ema', stats1);

      const baseline = performanceTracker.baselineTracker.baselines.get('/api/ema');

      expect(baseline.p50).toBe(100);
      expect(baseline.avg_duration).toBe(150);
      expect(baseline.last_updated).toBeDefined();
    });

    it('should smooth baseline updates', () => {
      const stats1 = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 50 };
      const stats2 = { percentiles: { p50: 200, p95: 300, p99: 400 }, avg_duration: 200, error_rate: 2.0, sample_count: 50 };

      performanceTracker.baselineTracker.updateBaseline('/api/smooth', stats1);
      performanceTracker.baselineTracker.updateBaseline('/api/smooth', stats2);

      const baseline = performanceTracker.baselineTracker.baselines.get('/api/smooth');

      // Should be between 100 and 200 due to smoothing
      expect(baseline.p50).toBeGreaterThan(100);
      expect(baseline.p50).toBeLessThan(200);
    });

    it('should track sample count across updates', () => {
      const stats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 50 };

      performanceTracker.baselineTracker.updateBaseline('/api/count', stats);
      performanceTracker.baselineTracker.updateBaseline('/api/count', stats);

      const baseline = performanceTracker.baselineTracker.baselines.get('/api/count');

      expect(baseline.sample_count).toBe(100);
    });

    it('should get all baselines', () => {
      const stats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 50 };

      performanceTracker.baselineTracker.updateBaseline('/api/one', stats);
      performanceTracker.baselineTracker.updateBaseline('/api/two', stats);

      const baselines = performanceTracker.baselineTracker.getBaselines();

      expect(baselines['/api/one']).toBeDefined();
      expect(baselines['/api/two']).toBeDefined();
    });
  });

  describe('Regression Detection', () => {
    it('should detect P95 regression', () => {
      const baselineStats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 100 };
      performanceTracker.baselineTracker.updateBaseline('/api/regress', baselineStats);

      const currentStats = { percentiles: { p50: 100, p95: 350, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 50 };

      const regressions = performanceTracker.baselineTracker.checkRegression('/api/regress', currentStats);

      expect(regressions).not.toBeNull();
      expect(regressions.some(r => r.metric === 'p95')).toBe(true);
    });

    it('should detect average duration regression', () => {
      const baselineStats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 100 };
      performanceTracker.baselineTracker.updateBaseline('/api/avg', baselineStats);

      const currentStats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 180, error_rate: 1.0, sample_count: 50 };

      const regressions = performanceTracker.baselineTracker.checkRegression('/api/avg', currentStats);

      expect(regressions).not.toBeNull();
      expect(regressions.some(r => r.metric === 'avg_duration')).toBe(true);
    });

    it('should detect error rate increase', () => {
      const baselineStats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 2.0, sample_count: 100 };
      performanceTracker.baselineTracker.updateBaseline('/api/errors', baselineStats);

      const currentStats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 10.0, sample_count: 50 };

      const regressions = performanceTracker.baselineTracker.checkRegression('/api/errors', currentStats);

      expect(regressions).not.toBeNull();
      expect(regressions.some(r => r.metric === 'error_rate')).toBe(true);
    });

    it('should not detect regression within threshold', () => {
      const baselineStats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 100 };
      performanceTracker.baselineTracker.updateBaseline('/api/stable', baselineStats);

      const currentStats = { percentiles: { p50: 100, p95: 210, p99: 300 }, avg_duration: 105, error_rate: 1.5, sample_count: 50 };

      const regressions = performanceTracker.baselineTracker.checkRegression('/api/stable', currentStats);

      expect(regressions).toBeNull();
    });

    it('should return null with insufficient baseline data', () => {
      const baselineStats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 50 };
      performanceTracker.baselineTracker.updateBaseline('/api/small', baselineStats);

      const currentStats = { percentiles: { p50: 100, p95: 400, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 50 };

      const regressions = performanceTracker.baselineTracker.checkRegression('/api/small', currentStats);

      expect(regressions).toBeNull();
    });

    it('should calculate deviation percentage', () => {
      const baselineStats = { percentiles: { p50: 100, p95: 200, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 100 };
      performanceTracker.baselineTracker.updateBaseline('/api/deviation', baselineStats);

      const currentStats = { percentiles: { p50: 100, p95: 400, p99: 300 }, avg_duration: 100, error_rate: 1.0, sample_count: 50 };

      const regressions = performanceTracker.baselineTracker.checkRegression('/api/deviation', currentStats);

      expect(regressions[0].deviation).toBeGreaterThan(0);
    });

    it('should trigger alert on regression', async () => {
      // Establish baseline
      for (let i = 0; i < 100; i++) {
        performanceTracker.metricsStore.addSample('/api/alert', 100, 200);
      }
      await performanceTracker.establishBaseline('/api/alert');

      // Add regressing samples
      for (let i = 0; i < 50; i++) {
        performanceTracker.metricsStore.addSample('/api/alert', 350, 200);
      }

      const currentStats = performanceTracker.metricsStore.getEndpointStats('/api/alert');
      const alertManager = performanceTracker.alertManager;
      alertManager.processAlert.mockClear();

      await performanceTracker.trackEndpointPerformance('/api/alert', 350, 200);

      // Should have triggered regression alert
      expect(alertManager.processAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'regression_detected'
        })
      );
    });
  });

  describe('Business Metrics Tracking', () => {
    it('should track business metric', () => {
      performanceTracker.trackBusinessMetric('conversions', 1, { source: 'web' });

      const metrics = performanceTracker.getBusinessMetrics();

      expect(metrics.conversions).toBeDefined();
      expect(metrics.conversions.count).toBe(1);
    });

    it('should calculate average for business metrics', () => {
      performanceTracker.trackBusinessMetric('revenue', 100);
      performanceTracker.trackBusinessMetric('revenue', 200);
      performanceTracker.trackBusinessMetric('revenue', 300);

      const metrics = performanceTracker.getBusinessMetrics();

      expect(metrics.revenue.average).toBe(200);
      expect(metrics.revenue.total).toBe(600);
    });

    it('should limit business metric values to 1000', () => {
      for (let i = 0; i < 1100; i++) {
        performanceTracker.trackBusinessMetric('limited', i);
      }

      const data = performanceTracker.businessMetrics.get('limited');
      expect(data.values.length).toBe(1000);
    });

    it('should filter business metrics by time window', () => {
      const now = Date.now();

      // Add old value
      const metric = performanceTracker.businessMetrics;
      metric.set('windowed', {
        values: [{ value: 100, timestamp: now - 3600000 }],
        total: 1,
        sum: 100
      });

      // Add recent value
      performanceTracker.trackBusinessMetric('windowed', 200);

      const metrics = performanceTracker.getBusinessMetrics(60000);

      expect(metrics.windowed.count).toBe(1);
      expect(metrics.windowed.average).toBe(200);
    });

    it('should handle empty business metrics', () => {
      const metrics = performanceTracker.getBusinessMetrics();

      expect(metrics).toEqual({});
    });
  });

  describe('Performance Report Generation', () => {
    it('should generate comprehensive performance report', async () => {
      performanceTracker.metricsStore.addSample('/api/report', 100, 200);
      performanceTracker.trackBusinessMetric('revenue', 100);

      const report = await performanceTracker.generatePerformanceReport();

      expect(report.timestamp).toBeDefined();
      expect(report.overall_metrics).toBeDefined();
      expect(report.endpoint_statistics).toBeDefined();
      expect(report.business_metrics).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should identify slowest endpoints', async () => {
      performanceTracker.metricsStore.addSample('/api/fast', 50, 200);
      performanceTracker.metricsStore.addSample('/api/slow', 500, 200);

      const report = await performanceTracker.generatePerformanceReport();

      expect(report.slowest_endpoints).toBeDefined();
      expect(report.slowest_endpoints.length).toBeGreaterThan(0);
    });

    it('should identify error-prone endpoints', async () => {
      performanceTracker.metricsStore.addSample('/api/errors', 100, 500);

      const report = await performanceTracker.generatePerformanceReport();

      expect(report.error_prone_endpoints).toBeDefined();
    });

    it('should include time window in report', async () => {
      const report = await performanceTracker.generatePerformanceReport(3600000);

      expect(report.time_window_ms).toBe(3600000);
    });
  });

  describe('Performance Recommendations', () => {
    it('should recommend optimization for slow endpoints', () => {
      performanceTracker.metricsStore.addSample('/api/optimize', 3000, 200);

      const stats = performanceTracker.metricsStore.getAllStats();
      const recommendations = performanceTracker.generateRecommendations(stats, {}, {});

      expect(recommendations.some(r => r.type === 'performance')).toBe(true);
    });

    it('should recommend reliability improvements for high error rates', () => {
      performanceTracker.metricsStore.addSample('/api/unreliable', 100, 500);
      performanceTracker.metricsStore.addSample('/api/unreliable', 100, 500);

      const stats = performanceTracker.metricsStore.getAllStats();
      const recommendations = performanceTracker.generateRecommendations(stats, {}, {});

      expect(recommendations.some(r => r.type === 'reliability')).toBe(true);
    });
  });

  describe('Metrics Export', () => {
    it('should export all metrics', () => {
      performanceTracker.metricsStore.addSample('/api/export', 100, 200);
      performanceTracker.trackBusinessMetric('revenue', 100);

      const exported = performanceTracker.exportMetrics();

      expect(exported.endpoints).toBeDefined();
      expect(exported.baselines).toBeDefined();
      expect(exported.business).toBeDefined();
    });
  });

  describe('Sample Cleanup', () => {
    it('should cleanup old samples', () => {
      const now = Date.now();

      // Add old sample
      performanceTracker.metricsStore.metrics.set('/api/old', {
        samples: [{ duration: 100, statusCode: 200, timestamp: now - 2 * 24 * 60 * 60 * 1000 }],
        errors: 0,
        total: 1
      });

      performanceTracker.metricsStore.cleanupOldSamples(24 * 60 * 60 * 1000);

      expect(performanceTracker.metricsStore.metrics.has('/api/old')).toBe(false);
    });

    it('should keep recent samples', () => {
      performanceTracker.metricsStore.addSample('/api/recent', 100, 200);

      performanceTracker.metricsStore.cleanupOldSamples(24 * 60 * 60 * 1000);

      expect(performanceTracker.metricsStore.metrics.has('/api/recent')).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getPerformanceTracker', () => {
      const instance1 = getPerformanceTracker();
      const instance2 = getPerformanceTracker();

      expect(instance1).toBe(instance2);
    });

    it('should initialize singleton on first call', () => {
      const instance = getPerformanceTracker();
      expect(instance).toBeInstanceOf(PerformanceTracker);
    });
  });
});
