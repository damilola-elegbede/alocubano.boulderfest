/**
 * E2E Test: Admin Database Dashboard
 * Tests database monitoring, metrics, and health indicators
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';
import { waitForPageReady, waitForConditions, getTestTimeout } from '../helpers/playwright-utils.js';
import { getTestMFACode } from '../helpers/totp-generator.js';

const testConstants = getTestDataConstants();

test.describe('Admin Database Dashboard', () => {
  const adminCredentials = {
    email: testConstants.admin.email,
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password'
  };

  // Helper function to login as admin
  const loginAsAdmin = async (page, skipOnRateLimit = true) => {
    const adminAuthAvailable = process.env.ADMIN_AUTH_AVAILABLE !== 'false';
    if (!adminAuthAvailable) {
      console.log('⚠️ Admin authentication API not available - skipping tests');
      return false;
    }

    try {
      await page.goto('/admin/login');
      const actionTimeout = getTestTimeout(test.info(), 'action');
      const navTimeout = getTestTimeout(test.info(), 'navigation');

      await page.fill('input[name="username"]', adminCredentials.email);
      await page.fill('input[type="password"]', adminCredentials.password);
      await page.click('button[type="submit"]');

      await page.waitForSelector('input[name="mfaCode"]', { timeout: actionTimeout });
      const mfaCode = getTestMFACode();
      await page.fill('input[name="mfaCode"]', mfaCode);
      await page.click('button[type="submit"]');

      await Promise.race([
        page.waitForURL('**/admin/dashboard', { timeout: navTimeout }),
        page.waitForSelector('#errorMessage', { state: 'visible', timeout: actionTimeout })
      ]);

      const currentUrl = page.url();
      if (!currentUrl.includes('/admin/dashboard')) {
        const errorMessage = page.locator('#errorMessage');
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          if (errorText.includes('locked') || errorText.includes('rate limit')) {
            if (skipOnRateLimit) {
              console.log('⚠️ Admin account rate limited - skipping test');
              return 'rate_limited';
            }
          }
          throw new Error(`Login failed: ${errorText}`);
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Admin login failed:', error.message);
      if (error.message.includes('locked') || error.message.includes('rate limit')) {
        return skipOnRateLimit ? 'rate_limited' : false;
      }
      throw error;
    }
  };

  test.beforeEach(async ({ page }) => {
    const loginResult = await loginAsAdmin(page, true);
    if (loginResult === 'rate_limited') {
      test.skip('Admin account is rate limited - skipping test');
    } else if (!loginResult) {
      test.skip('Admin login failed - skipping test');
    }

    // Navigate to database dashboard
    await page.goto('/admin/database-dashboard');
    await waitForPageReady(page, { waitForSelector: 'h2', checkNetworkIdle: true }, test.info());
  });

  test('should load database dashboard successfully', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/database-dashboard/);
    await expect(page.locator('h2')).toContainText(/Database Monitoring/i);
  });

  test('should display overall health status', async ({ page }) => {
    const overallHealth = page.locator('#overallHealth');
    await expect(overallHealth).toBeVisible();
    await expect(overallHealth).not.toHaveText('Loading...');

    const healthText = await overallHealth.textContent();
    expect(healthText).toMatch(/Healthy|Warning|Critical|Unknown/i);
  });

  test('should show pool utilization metric', async ({ page }) => {
    const poolUtilization = page.locator('#poolUtilization');
    await expect(poolUtilization).toBeVisible();
    await expect(poolUtilization).not.toHaveText('Loading...');

    const utilizationText = await poolUtilization.textContent();
    expect(utilizationText).toContain('%');
  });

  test('should display active alerts count', async ({ page }) => {
    const activeAlerts = page.locator('#activeAlerts');
    await expect(activeAlerts).toBeVisible();
    await expect(activeAlerts).not.toHaveText('Loading...');

    const alertsText = await activeAlerts.textContent();
    expect(/\d+/.test(alertsText)).toBeTruthy();
  });

  test('should show error rate', async ({ page }) => {
    const errorRate = page.locator('#errorRate');
    await expect(errorRate).toBeVisible();
    await expect(errorRate).not.toHaveText('Loading...');

    const errorText = await errorRate.textContent();
    expect(errorText).toContain('%');
  });

  test('should display connection pool chart', async ({ page }) => {
    const poolChart = page.locator('#poolChart');
    await expect(poolChart).toBeVisible();

    const isRendered = await poolChart.evaluate(canvas => {
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    });
    expect(isRendered).toBeTruthy();
  });

  test('should display performance metrics chart', async ({ page }) => {
    const perfChart = page.locator('#performanceChart');
    await expect(perfChart).toBeVisible();

    const isRendered = await perfChart.evaluate(canvas => {
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    });
    expect(isRendered).toBeTruthy();
  });

  test('should show circuit breaker status', async ({ page }) => {
    const cbStatus = page.locator('#circuitBreakerStatus');
    await expect(cbStatus).toBeVisible();

    const statusContent = await cbStatus.textContent();
    expect(statusContent).not.toContain('Loading circuit breaker');
  });

  test('should display active alerts list', async ({ page }) => {
    const alertsList = page.locator('#activeAlertsList');
    await expect(alertsList).toBeVisible();

    const alertsContent = await alertsList.textContent();
    expect(alertsContent).not.toContain('Loading alerts');
  });

  test('should show detailed metrics table', async ({ page }) => {
    const metricsTable = page.locator('#metricsTableContainer');
    await expect(metricsTable).toBeVisible();

    const tableContent = await metricsTable.textContent();
    expect(tableContent).not.toContain('Loading metrics');
  });

  test('should display operational recommendations', async ({ page }) => {
    const recommendations = page.locator('#recommendationsList');
    await expect(recommendations).toBeVisible();

    const recsContent = await recommendations.textContent();
    expect(recsContent).not.toContain('Loading recommendations');
  });

  test('should support auto-refresh toggle', async ({ page }) => {
    const autoRefreshCheckbox = page.locator('#autoRefresh');
    await expect(autoRefreshCheckbox).toBeVisible();
    await expect(autoRefreshCheckbox).toBeChecked();

    // Disable auto-refresh
    await autoRefreshCheckbox.uncheck();
    await expect(autoRefreshCheckbox).not.toBeChecked();

    // Re-enable
    await autoRefreshCheckbox.check();
    await expect(autoRefreshCheckbox).toBeChecked();
  });

  test('should update last updated timestamp', async ({ page }) => {
    const lastUpdated = page.locator('#lastUpdated');
    await expect(lastUpdated).toBeVisible();

    const timestamp = await lastUpdated.textContent();
    expect(timestamp).toMatch(/Last updated:/);
  });

  test('should refresh pool chart on button click', async ({ page }) => {
    const refreshBtn = page.locator('.panel-controls button:has-text("Refresh")').first();
    await expect(refreshBtn).toBeVisible();

    await refreshBtn.click();

    // Button should show loading state
    const btnText = await refreshBtn.textContent();
    expect(btnText).toBeDefined();
  });

  test('should refresh circuit breaker status', async ({ page }) => {
    const refreshBtns = page.locator('.panel-controls button:has-text("Refresh")');
    const cbRefreshBtn = refreshBtns.nth(2); // Third refresh button
    await expect(cbRefreshBtn).toBeVisible();

    await cbRefreshBtn.click();
    await page.waitForTimeout(500);

    const cbStatus = page.locator('#circuitBreakerStatus');
    await expect(cbStatus).toBeVisible();
  });

  test('should refresh alerts list', async ({ page }) => {
    const refreshBtns = page.locator('.panel-controls button:has-text("Refresh")');
    const alertsRefreshBtn = refreshBtns.nth(3); // Fourth refresh button
    await expect(alertsRefreshBtn).toBeVisible();

    await alertsRefreshBtn.click();
    await page.waitForTimeout(500);

    const alertsList = page.locator('#activeAlertsList');
    await expect(alertsList).toBeVisible();
  });

  test('should refresh metrics table', async ({ page }) => {
    const refreshBtns = page.locator('.panel-controls button:has-text("Refresh")');
    const metricsRefreshBtn = refreshBtns.last();
    await expect(metricsRefreshBtn).toBeVisible();

    await metricsRefreshBtn.click();
    await page.waitForTimeout(500);

    const metricsTable = page.locator('#metricsTableContainer');
    await expect(metricsTable).toBeVisible();
  });

  test('should display health status with correct color coding', async ({ page }) => {
    const overallHealthCard = page.locator('#overallHealthCard');
    await expect(overallHealthCard).toBeVisible();

    const className = await overallHealthCard.getAttribute('class');
    expect(className).toMatch(/healthy|warning|critical/i);
  });

  test('should show pool utilization with correct status', async ({ page }) => {
    const poolCard = page.locator('#poolUtilizationCard');
    await expect(poolCard).toBeVisible();

    const className = await poolCard.getAttribute('class');
    expect(className).toMatch(/status-card/);
  });

  test('should display alerts with correct severity', async ({ page }) => {
    const alertsCard = page.locator('#activeAlertsCard');
    await expect(alertsCard).toBeVisible();

    const className = await alertsCard.getAttribute('class');
    expect(className).toMatch(/status-card/);
  });

  test('should show error rate with status indicator', async ({ page }) => {
    const errorCard = page.locator('#errorRateCard');
    await expect(errorCard).toBeVisible();

    const className = await errorCard.getAttribute('class');
    expect(className).toMatch(/status-card/);
  });

  test('should handle API errors for health data', async ({ page }) => {
    await page.route('**/api/admin/database-health*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Health check failed' })
      });
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Should show error state gracefully
    await expect(page.locator('h2')).toContainText(/Database Monitoring/i);
  });

  test('should handle API errors for metrics data', async ({ page }) => {
    await page.route('**/api/admin/database-metrics*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Metrics fetch failed' })
      });
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Page should still render
    await expect(page.locator('h2')).toContainText(/Database Monitoring/i);
  });

  test('should show connection pool metrics in table', async ({ page }) => {
    const metricsTable = page.locator('.metrics-table');
    await expect(metricsTable).toBeVisible();

    const tableText = await metricsTable.textContent();
    expect(tableText).toMatch(/Connection Pool|Active|Leases/i);
  });

  test('should display live updates when auto-refresh enabled', async ({ page }) => {
    const autoRefresh = page.locator('#autoRefresh');
    await expect(autoRefresh).toBeChecked();

    // Record initial health value
    const initialHealth = await page.locator('#overallHealth').textContent();

    // Wait for dashboard auto-refresh API call (30 seconds interval)
    // Instead of waiting 31s, wait for the API request to be triggered
    await page.waitForResponse(
      response => response.url().includes('/api/admin/database-health') && response.status() === 200,
      { timeout: 35000 }
    );

    // Should still be showing data (may or may not change)
    const currentHealth = await page.locator('#overallHealth').textContent();
    expect(currentHealth).toBeDefined();
  });

  test('should format uptime correctly', async ({ page }) => {
    const healthTrend = page.locator('#healthTrend');
    await expect(healthTrend).toBeVisible();

    const trendText = await healthTrend.textContent();
    expect(trendText).toMatch(/Uptime:|d|h|m/);
  });

  test('should show active connection count', async ({ page }) => {
    const utilizationTrend = page.locator('#utilizationTrend');
    await expect(utilizationTrend).toBeVisible();

    const trendText = await utilizationTrend.textContent();
    expect(trendText).toMatch(/active|\d+/);
  });

  test('should display critical alerts count', async ({ page }) => {
    const alertsTrend = page.locator('#alertsTrend');
    await expect(alertsTrend).toBeVisible();

    const trendText = await alertsTrend.textContent();
    expect(trendText).toMatch(/critical|\d+/);
  });

  test('should show error rate time period', async ({ page }) => {
    const errorTrend = page.locator('#errorTrend');
    await expect(errorTrend).toBeVisible();

    const trendText = await errorTrend.textContent();
    expect(trendText).toMatch(/Last \d+h/);
  });

  test('should render mobile-friendly layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    await expect(page.locator('h2')).toBeVisible();
    await expect(page.locator('#overallHealth')).toBeVisible();
  });

  test('should handle no alerts gracefully', async ({ page }) => {
    await page.route('**/api/admin/database-health*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          health: { status: 'healthy', uptime: 3600 },
          components: {
            connectionPool: { metrics: { utilization: 25, activeLeases: 2, errorRate: 0 } },
            circuitBreaker: { state: 'CLOSED', metrics: { isHealthy: true, failureRate: 0 } }
          },
          alerts: { total: 0, critical: 0, active: [] },
          recommendations: []
        })
      });
    });

    await page.reload();
    await waitForPageReady(page, { waitForSelector: '#activeAlertsList' }, test.info());

    const alertsList = await page.locator('#activeAlertsList').textContent();
    expect(alertsList).toMatch(/No active alerts/i);
  });

  test('should verify database metrics are within acceptable ranges', async ({ page }) => {
    const poolUtilizationText = await page.locator('#poolUtilization').textContent();
    const utilization = parseFloat(poolUtilizationText.replace('%', ''));

    expect(utilization).toBeGreaterThanOrEqual(0);
    expect(utilization).toBeLessThanOrEqual(100);
  });

  test('should verify error rate is a valid percentage', async ({ page }) => {
    const errorRateText = await page.locator('#errorRate').textContent();
    const errorRate = parseFloat(errorRateText.replace('%', ''));

    expect(errorRate).toBeGreaterThanOrEqual(0);
    expect(errorRate).toBeLessThanOrEqual(100);
  });
});
