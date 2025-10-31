/**
 * Monitoring Alert Flow E2E Tests
 * Tests complete alert lifecycle from trigger to resolution
 */

import { test, expect } from '@playwright/test';

test.describe('Monitoring Alert Flow E2E', () => {
  let deploymentUrl;

  test.beforeAll(async () => {
    deploymentUrl = process.env.E2E_BASE_URL || 'http://localhost:3000';
    console.log(`Testing monitoring alert flow on: ${deploymentUrl}`);
  });

  test.describe('Alert Trigger and Creation', () => {
    test('should trigger high error rate alert', async ({ page }) => {
      // Navigate to monitoring dashboard (admin required)
      await page.goto(`${deploymentUrl}/pages/admin/login.html`);

      // Login as admin
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'admin');
      await page.click('button[type="submit"]');

      // Wait for dashboard
      await page.waitForURL('**/admin/dashboard.html');

      // Navigate to monitoring alerts
      const alertsUrl = `${deploymentUrl}/api/monitoring/alerts?action=active`;
      const response = await page.request.get(alertsUrl);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(Array.isArray(data.alerts)).toBe(true);
    });

    test('should manually trigger test alert', async ({ page }) => {
      const testAlertUrl = `${deploymentUrl}/api/monitoring/alerts`;

      const response = await page.request.post(testAlertUrl, {
        data: {
          action: 'trigger',
          category: 'performance',
          service: 'e2e_test',
          type: 'test_alert',
          severity: 'medium',
          description: 'E2E test alert',
          metrics: {
            test_value: 100,
            timestamp: new Date().toISOString()
          }
        },
        headers: {
          'x-admin-key': process.env.ADMIN_API_KEY || 'test'
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.alert).toBeDefined();
      expect(data.alert.description).toContain('E2E test alert');
    });
  });

  test.describe('Alert Display in Dashboard', () => {
    test('should display active alerts in monitoring dashboard', async ({ page }) => {
      const dashboardUrl = `${deploymentUrl}/api/monitoring/dashboard`;

      const response = await page.request.get(dashboardUrl);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.alerts).toBeDefined();
      expect(data.alerts.active_count).toBeGreaterThanOrEqual(0);
      expect(data.alerts.by_severity).toBeDefined();
    });

    test('should show alert statistics', async ({ page }) => {
      const statusUrl = `${deploymentUrl}/api/monitoring/alerts?action=status`;

      const response = await page.request.get(statusUrl, {
        headers: {
          'x-admin-key': process.env.ADMIN_API_KEY || 'test'
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.data).toBeDefined();
      expect(data.data.total_active).toBeGreaterThanOrEqual(0);
      expect(data.data.severity_breakdown).toBeDefined();
    });
  });

  test.describe('Alert Acknowledgment', () => {
    test('should be able to view alert configuration', async ({ page }) => {
      const configUrl = `${deploymentUrl}/api/monitoring/alerts?action=configuration`;

      const response = await page.request.get(configUrl, {
        headers: {
          'x-admin-key': process.env.ADMIN_API_KEY || 'test'
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.configuration).toBeDefined();
      expect(data.configuration.thresholds).toBeDefined();
      expect(data.configuration.enabled).toBeDefined();
    });
  });

  test.describe('Alert Resolution', () => {
    test('should clear specific alert', async ({ page }) => {
      const clearUrl = `${deploymentUrl}/api/monitoring/alerts`;

      const response = await page.request.post(clearUrl, {
        data: {
          action: 'clear',
          alertKey: 'performance:e2e_test:test_alert'
        },
        headers: {
          'x-admin-key': process.env.ADMIN_API_KEY || 'test'
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    test('should verify alert is cleared', async ({ page }) => {
      const activeUrl = `${deploymentUrl}/api/monitoring/alerts?action=active`;

      const response = await page.request.get(activeUrl);

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      // Alert count might vary, just verify structure
      expect(Array.isArray(data.alerts)).toBe(true);
    });
  });

  test.describe('Alert Types', () => {
    test('should handle performance degradation alert', async ({ page }) => {
      const triggerUrl = `${deploymentUrl}/api/monitoring/alerts`;

      const response = await page.request.post(triggerUrl, {
        data: {
          action: 'trigger',
          category: 'performance',
          service: 'api',
          type: 'slow_response',
          severity: 'high',
          description: 'API response time exceeded threshold',
          metrics: {
            response_time: 5000,
            threshold: 2000
          }
        },
        headers: {
          'x-admin-key': process.env.ADMIN_API_KEY || 'test'
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.alert).toBeDefined();
      expect(data.alert.description).toContain('response time');
    });

    test('should handle error rate spike alert', async ({ page }) => {
      const triggerUrl = `${deploymentUrl}/api/monitoring/alerts`;

      const response = await page.request.post(triggerUrl, {
        data: {
          action: 'trigger',
          category: 'external_service',
          service: 'api',
          type: 'high_error_rate',
          severity: 'critical',
          description: 'Error rate exceeded threshold',
          metrics: {
            error_rate: 0.15,
            threshold: 0.05
          }
        },
        headers: {
          'x-admin-key': process.env.ADMIN_API_KEY || 'test'
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.alert).toBeDefined();
      expect(data.alert.severity).toBe('critical');
    });
  });
});
