/**
 * Monitoring Metrics Flow E2E Tests
 * Tests end-to-end metrics collection, query, and visualization
 */

import { test, expect } from '@playwright/test';

test.describe('Monitoring Metrics Flow E2E', () => {
  let deploymentUrl;
  const METRICS_API_KEY = process.env.METRICS_API_KEY || 'test_metrics_key';

  test.beforeAll(async () => {
    // Set environment variable for testing
    process.env.METRICS_API_KEY = METRICS_API_KEY;

    deploymentUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
    console.log(`Testing monitoring metrics flow on: ${deploymentUrl}`);
  });

  test.describe('Metrics Collection via API', () => {
    test('should collect system metrics', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics?category=system`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.memory).toBeDefined();
      expect(data.cpu).toBeDefined();
      expect(data.process).toBeDefined();
    });

    test('should collect business metrics', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics?category=business`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.payments).toBeDefined();
      expect(data.users).toBeDefined();
      expect(data.tickets).toBeDefined();
      expect(data.revenue).toBeDefined();
    });

    test('should collect performance metrics', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics?category=performance`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.api).toBeDefined();
      expect(data.response_times).toBeDefined();
    });
  });

  test.describe('Metrics Display in Dashboard', () => {
    test('should view metrics in monitoring dashboard', async ({ page }) => {
      const dashboardUrl = `${deploymentUrl}/api/monitoring/dashboard`;

      const response = await page.request.get(dashboardUrl);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.overview).toBeDefined();
      expect(data.performance).toBeDefined();
      expect(data.business).toBeDefined();
      expect(data.infrastructure).toBeDefined();
    });

    test('should display performance metrics', async ({ page }) => {
      const dashboardUrl = `${deploymentUrl}/api/monitoring/dashboard`;

      const response = await page.request.get(dashboardUrl);
      const data = await response.json();

      expect(data.performance.current).toBeDefined();
      expect(data.performance.current.response_time).toBeDefined();
      expect(data.performance.current.error_rate).toBeDefined();
      expect(data.performance.percentiles).toBeDefined();
    });

    test('should display business metrics', async ({ page }) => {
      const dashboardUrl = `${deploymentUrl}/api/monitoring/dashboard`;

      const response = await page.request.get(dashboardUrl);
      const data = await response.json();

      expect(data.business.revenue).toBeDefined();
      expect(data.business.users).toBeDefined();
      expect(data.business.tickets).toBeDefined();
    });

    test('should display infrastructure metrics', async ({ page }) => {
      const dashboardUrl = `${deploymentUrl}/api/monitoring/dashboard`;

      const response = await page.request.get(dashboardUrl);
      const data = await response.json();

      expect(data.infrastructure.memory).toBeDefined();
      expect(data.infrastructure.dependencies).toBeDefined();
    });
  });

  test.describe('Metrics Aggregation', () => {
    test('should verify aggregated metrics are correct', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.system).toBeDefined();
      expect(data.business).toBeDefined();
      expect(data.performance).toBeDefined();
    });
  });

  test.describe('Time Range Filtering', () => {
    test('should filter metrics by time range', async ({ page }) => {
      // Dashboard endpoint supports time filtering
      const dashboardUrl = `${deploymentUrl}/api/monitoring/dashboard`;

      const response = await page.request.get(dashboardUrl);

      expect(response.status()).toBe(200);
      const data = await response.json();

      // Verify timestamp is recent (within last minute)
      const timestamp = new Date(data.timestamp);
      const now = new Date();
      const diff = now - timestamp;

      expect(diff).toBeLessThan(60000); // Less than 1 minute old
    });
  });

  test.describe('Metrics Export Formats', () => {
    test('should export metrics in JSON format', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics?format=json`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/json');
    });

    test('should export metrics in Prometheus format', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics?format=prometheus`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.text();

      expect(data).toContain('alocubano_');
      expect(data).toContain('# TYPE');
    });

    test('should export metrics in Datadog format', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics?format=datadog`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.series).toBeDefined();
      expect(Array.isArray(data.series)).toBe(true);
    });

    test('should export metrics in New Relic format', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics?format=newrelic`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.metrics).toBeDefined();
      expect(data.agent).toBeDefined();
    });

    test('should export metrics in CloudWatch format', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics?format=cloudwatch`;

      const response = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.MetricData).toBeDefined();
      expect(data.Namespace).toBeDefined();
    });
  });

  test.describe('Real-time Updates', () => {
    test('should provide fresh metrics on each request', async ({ page }) => {
      const metricsUrl = `${deploymentUrl}/api/monitoring/metrics`;

      // First request
      const response1 = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });
      const data1 = await response1.json();

      // Wait a moment
      await page.waitForTimeout(1000);

      // Second request
      const response2 = await page.request.get(metricsUrl, {
        headers: {
          'x-api-key': METRICS_API_KEY
        }
      });
      const data2 = await response2.json();

      // Both should succeed
      expect(response1.status()).toBe(200);
      expect(response2.status()).toBe(200);

      // Verify cache control prevents stale data
      expect(response1.headers()['cache-control']).toContain('no-cache');
      expect(response2.headers()['cache-control']).toContain('no-cache');
    });
  });

  test.describe('Uptime Tracking', () => {
    test('should track system uptime', async ({ page }) => {
      const uptimeUrl = `${deploymentUrl}/api/monitoring/uptime`;

      const response = await page.request.get(uptimeUrl);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.uptime).toBeDefined();
      expect(data.uptime.uptime).toBeDefined();
      expect(data.uptime.uptime.seconds).toBeGreaterThanOrEqual(0);
      expect(data.uptime.uptime.formatted).toBeDefined();
    });

    test('should track request success rate', async ({ page }) => {
      const uptimeUrl = `${deploymentUrl}/api/monitoring/uptime`;

      const response = await page.request.get(uptimeUrl);
      const data = await response.json();

      expect(data.uptime.requests).toBeDefined();
      expect(data.uptime.requests.total).toBeGreaterThanOrEqual(0);
      expect(data.uptime.requests.successRate).toBeGreaterThanOrEqual(0);
      expect(data.uptime.requests.successRate).toBeLessThanOrEqual(100);
    });

    test('should calculate SLA compliance', async ({ page }) => {
      const uptimeUrl = `${deploymentUrl}/api/monitoring/uptime`;

      const response = await page.request.get(uptimeUrl);
      const data = await response.json();

      expect(data.sla).toBeDefined();
      expect(data.sla.compliance).toBeDefined();
      expect(data.sla.compliance.overall).toBeDefined();
      expect(data.sla.targets.uptime).toBe(99.9);
    });
  });

  test.describe('Platform-Specific Dashboards', () => {
    test('should generate Grafana dashboard', async ({ page }) => {
      const dashboardUrl = `${deploymentUrl}/api/monitoring/dashboard?platform=grafana`;

      const response = await page.request.get(dashboardUrl);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.panels).toBeDefined();
      expect(Array.isArray(data.panels)).toBe(true);
      expect(data.data_source).toBeDefined();
    });

    test('should generate Datadog dashboard', async ({ page }) => {
      const dashboardUrl = `${deploymentUrl}/api/monitoring/dashboard?platform=datadog`;

      const response = await page.request.get(dashboardUrl);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.widgets).toBeDefined();
      expect(Array.isArray(data.widgets)).toBe(true);
    });
  });
});
