/**
 * Metrics API Integration Tests
 * Tests metrics collection, query, and export functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testApiHandler } from '../../handler-test-helper.js';

describe('Metrics API Integration', () => {
  const METRICS_API_KEY = 'test_metrics_key';

  beforeEach(() => {
    process.env.METRICS_API_KEY = METRICS_API_KEY;
  });

  afterEach(() => {
    delete process.env.METRICS_API_KEY;
  });

  describe('Authentication', () => {
    it('should require API key for metrics access', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        '/api/monitoring/metrics'
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toBe('Unauthorized');
    });

    it('should allow access with valid API key', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
    });

    it('should allow access with header authentication', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        '/api/monitoring/metrics',
        null,
        { 'x-api-key': METRICS_API_KEY }
      );

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/monitoring/metrics - All Metrics', () => {
    it('should return all metrics by default', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.system).toBeDefined();
      expect(response.data.business).toBeDefined();
      expect(response.data.performance).toBeDefined();
    });

    it('should include system metrics', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.system).toBeDefined();
      expect(typeof response.data.system).toBe('object');
    });

    it('should include business metrics', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.business).toBeDefined();
      expect(response.data.business.payments).toBeDefined();
      expect(response.data.business.users).toBeDefined();
      expect(response.data.business.tickets).toBeDefined();
    });

    it('should include performance metrics', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.performance).toBeDefined();
    });
  });

  describe('Category-Specific Metrics', () => {
    it('should return system metrics only', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?category=system&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.memory).toBeDefined();
      expect(response.data.cpu).toBeDefined();
      expect(response.data.process).toBeDefined();
    });

    it('should return business metrics only', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?category=business&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.payments).toBeDefined();
      expect(response.data.users).toBeDefined();
      expect(response.data.tickets).toBeDefined();
      expect(response.data.revenue).toBeDefined();
    });

    it('should return performance metrics only', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?category=performance&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.api).toBeDefined();
      expect(response.data.response_times).toBeDefined();
    });

    it('should return error metrics only', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?category=errors&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.total).toBeDefined();
      expect(response.data.by_type).toBeDefined();
    });

    it('should return alert metrics only', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?category=alerts&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(typeof response.data).toBe('object');
    });
  });

  describe('Format Options', () => {
    it('should return JSON format by default', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return Prometheus format', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=prometheus&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(typeof response.data).toBe('string');
      expect(response.data).toContain('alocubano_');
    });

    it('should return Datadog format', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=datadog&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.series).toBeDefined();
      expect(Array.isArray(response.data.series)).toBe(true);
    });

    it('should return New Relic format', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=newrelic&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.metrics).toBeDefined();
      expect(Array.isArray(response.data.metrics)).toBe(true);
      expect(response.data.agent).toBeDefined();
    });

    it('should return CloudWatch format', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=cloudwatch&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data.MetricData).toBeDefined();
      expect(Array.isArray(response.data.MetricData)).toBe(true);
      expect(response.data.Namespace).toBeDefined();
    });

    it('should support pretty print', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?pretty=true&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(typeof response.data).toBe('string');
      expect(response.data).toContain('\n');
    });
  });

  describe('Response Headers', () => {
    it('should include metrics headers', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.headers['x-metrics-format']).toBe('json');
      expect(response.headers['x-metrics-category']).toBe('all');
    });

    it('should set correct content type for Prometheus', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=prometheus&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('Method Validation', () => {
    it('should only allow GET requests', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'POST',
        '/api/monitoring/metrics',
        {},
        { 'x-api-key': METRICS_API_KEY }
      );

      expect(response.status).toBe(405);
      expect(response.data.error).toContain('Method not allowed');
    });
  });

  describe('Prometheus Format Validation', () => {
    it('should include metric type comments', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=prometheus&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('# TYPE');
    });

    it('should format metric names correctly', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=prometheus&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      // Metric names should use underscores, not dots or dashes
      expect(response.data).toMatch(/alocubano_[a-z_]+/);
    });
  });

  describe('Datadog Format Validation', () => {
    it('should include timestamps in points', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=datadog&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      if (response.data.series.length > 0) {
        expect(response.data.series[0].points).toBeDefined();
        expect(Array.isArray(response.data.series[0].points)).toBe(true);
        expect(response.data.series[0].points[0]).toHaveLength(2);
      }
    });

    it('should include metric type', async () => {
      const response = await testApiHandler(
        'api/monitoring/metrics',
        'GET',
        `/api/monitoring/metrics?format=datadog&api_key=${METRICS_API_KEY}`
      );

      expect(response.status).toBe(200);
      if (response.data.series.length > 0) {
        expect(response.data.series[0].type).toMatch(/gauge|count/);
      }
    });
  });
});
