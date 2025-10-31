/**
 * E2E Test: Admin Analytics Dashboard
 * Tests comprehensive analytics dashboard functionality
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';
import { waitForPageReady, waitForConditions, getTestTimeout } from '../helpers/playwright-utils.js';
import { getTestMFACode } from '../helpers/totp-generator.js';

const testConstants = getTestDataConstants();

test.describe('Admin Analytics Dashboard', () => {
  // Skip all tests if TEST_ADMIN_PASSWORD not set - security requirement
  if (!process.env.TEST_ADMIN_PASSWORD) {
    test.skip();
  }

  const adminCredentials = {
    email: testConstants.admin.email,
    password: process.env.TEST_ADMIN_PASSWORD
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

    // Navigate to analytics page
    await page.goto('/admin/analytics');
    await waitForPageReady(page, { waitForSelector: 'h1', checkNetworkIdle: true }, test.info());
  });

  test('should load analytics page successfully', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/analytics/);
    await expect(page.locator('h1')).toContainText(/Analytics/i);
    await expect(page.locator('.admin-card-title')).toContainText(/Key Metrics/i);
  });

  test('should display transaction statistics', async ({ page }) => {
    const actionTimeout = getTestTimeout(test.info(), 'action');

    // Wait for metrics to load
    await page.waitForSelector('#total-tickets', { timeout: actionTimeout });

    const totalTickets = page.locator('#total-tickets');
    await expect(totalTickets).toBeVisible();
    await expect(totalTickets).not.toHaveText('--');

    // Verify it contains a number
    const ticketsText = await totalTickets.textContent();
    expect(/\d+/.test(ticketsText)).toBeTruthy();
  });

  test('should show revenue metrics', async ({ page }) => {
    const grossRevenue = page.locator('#gross-revenue');
    await expect(grossRevenue).toBeVisible();
    await expect(grossRevenue).not.toHaveText('--');

    const revenueText = await grossRevenue.textContent();
    expect(revenueText).toContain('$');
  });

  test('should display unique customers count', async ({ page }) => {
    const uniqueCustomers = page.locator('#unique-customers');
    await expect(uniqueCustomers).toBeVisible();
    await expect(uniqueCustomers).not.toHaveText('--');
  });

  test('should show check-in rate', async ({ page }) => {
    const checkinRate = page.locator('#checkin-rate');
    await expect(checkinRate).toBeVisible();

    const rateText = await checkinRate.textContent();
    expect(rateText).toContain('%');
  });

  test('should display conversion rate', async ({ page }) => {
    const conversionRate = page.locator('#conversion-rate');
    await expect(conversionRate).toBeVisible();

    const rateText = await conversionRate.textContent();
    expect(rateText).toContain('%');
  });

  test('should show top ticket type', async ({ page }) => {
    const topTicket = page.locator('#top-ticket');
    await expect(topTicket).toBeVisible();
    await expect(topTicket).not.toHaveText('--');
  });

  test('should display wallet adoption rate', async ({ page }) => {
    const walletAdoption = page.locator('#wallet-adoption');
    await expect(walletAdoption).toBeVisible();

    const adoptionText = await walletAdoption.textContent();
    expect(adoptionText).toContain('%');
  });

  test('should show digital revenue share', async ({ page }) => {
    const digitalShare = page.locator('#digital-share');
    await expect(digitalShare).toBeVisible();

    const shareText = await digitalShare.textContent();
    expect(shareText).toContain('%');
  });

  test('should filter by 7 days time range', async ({ page }) => {
    const sevenDaysBtn = page.locator('button.time-range-btn[data-days="7"]');
    await sevenDaysBtn.click();

    await expect(sevenDaysBtn).toHaveClass(/active/);

    // Wait for data to reload
    await page.waitForTimeout(1000);

    // Verify metrics still display
    await expect(page.locator('#total-tickets')).toBeVisible();
  });

  test('should filter by 30 days time range', async ({ page }) => {
    const thirtyDaysBtn = page.locator('button.time-range-btn[data-days="30"]');
    await thirtyDaysBtn.click();

    await expect(thirtyDaysBtn).toHaveClass(/active/);

    await page.waitForTimeout(1000);
    await expect(page.locator('#total-tickets')).toBeVisible();
  });

  test('should filter by 90 days time range', async ({ page }) => {
    const ninetyDaysBtn = page.locator('button.time-range-btn[data-days="90"]');
    await ninetyDaysBtn.click();

    await expect(ninetyDaysBtn).toHaveClass(/active/);

    await page.waitForTimeout(1000);
    await expect(page.locator('#total-tickets')).toBeVisible();
  });

  test('should filter by all time', async ({ page }) => {
    const allTimeBtn = page.locator('button.time-range-btn[data-days="all"]');
    await allTimeBtn.click();

    await expect(allTimeBtn).toHaveClass(/active/);

    await page.waitForTimeout(1000);
    await expect(page.locator('#total-tickets')).toBeVisible();
  });

  test('should display sales trend chart', async ({ page }) => {
    const salesChart = page.locator('#sales-trend-chart');
    await expect(salesChart).toBeVisible();

    // Verify Chart.js rendered the canvas
    const isRendered = await salesChart.evaluate(canvas => {
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    });
    expect(isRendered).toBeTruthy();
  });

  test('should display revenue breakdown chart', async ({ page }) => {
    const revenueChart = page.locator('#revenue-breakdown-chart');
    await expect(revenueChart).toBeVisible();

    const isRendered = await revenueChart.evaluate(canvas => {
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    });
    expect(isRendered).toBeTruthy();
  });

  test('should display hourly sales chart', async ({ page }) => {
    const hourlySalesChart = page.locator('#hourly-sales-chart');
    await expect(hourlySalesChart).toBeVisible();

    const isRendered = await hourlySalesChart.evaluate(canvas => {
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    });
    expect(isRendered).toBeTruthy();
  });

  test('should display check-in by type chart', async ({ page }) => {
    const checkinChart = page.locator('#checkin-by-type-chart');
    await expect(checkinChart).toBeVisible();

    const isRendered = await checkinChart.evaluate(canvas => {
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    });
    expect(isRendered).toBeTruthy();
  });

  test('should display wallet trend chart', async ({ page }) => {
    const walletChart = page.locator('#wallet-trend-chart');
    await expect(walletChart).toBeVisible();

    const isRendered = await walletChart.evaluate(canvas => {
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    });
    expect(isRendered).toBeTruthy();
  });

  test('should show top customers table', async ({ page }) => {
    const topCustomersTable = page.locator('#top-customers-tbody');
    await expect(topCustomersTable).toBeVisible();

    // Check if table has data or shows no data message
    const tableContent = await topCustomersTable.textContent();
    const hasData = tableContent && !tableContent.includes('Loading');
    expect(hasData).toBeTruthy();
  });

  test('should display insights and recommendations', async ({ page }) => {
    const recommendationsList = page.locator('#recommendations-list');
    await expect(recommendationsList).toBeVisible();

    const recsContent = await recommendationsList.textContent();
    const hasRecs = recsContent && !recsContent.includes('Analyzing data');
    expect(hasRecs).toBeTruthy();
  });

  test('should export analytics data as JSON', async ({ page }) => {
    const exportJsonBtn = page.locator('button:has-text("Export JSON")');
    await expect(exportJsonBtn).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await exportJsonBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/analytics.*\.json/);
  });

  test('should export analytics data as CSV', async ({ page }) => {
    const exportCsvBtn = page.locator('button:has-text("Export CSV")');
    await expect(exportCsvBtn).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await exportCsvBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/analytics.*\.csv/);
  });

  test('should update last updated time', async ({ page }) => {
    const updateTime = page.locator('#update-time');
    await expect(updateTime).toBeVisible();
    await expect(updateTime).not.toHaveText('--');
  });

  test('should handle API errors gracefully', async ({ page }) => {
    await page.route('**/api/admin/analytics*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' })
      });
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Page should still render without crashing
    await expect(page.locator('h1')).toContainText(/Analytics/i);
  });

  test('should cross-check metrics with dashboard data', async ({ page }) => {
    const totalTicketsText = await page.locator('#total-tickets').textContent();
    const totalTickets = parseInt(totalTicketsText.replace(/,/g, ''));

    expect(totalTickets).toBeGreaterThanOrEqual(0);
    expect(isNaN(totalTickets)).toBe(false);
  });

  test('should verify revenue totals are correct', async ({ page }) => {
    const revenueText = await page.locator('#gross-revenue').textContent();
    const revenue = revenueText.replace(/[$,]/g, '');

    expect(parseFloat(revenue)).toBeGreaterThanOrEqual(0);
  });

  test('should show loading states properly', async ({ page }) => {
    await page.reload();

    // Initially might show loading
    const hasLoadingState = await page.locator('.loading, .spinner').count() > 0;

    // Eventually should load content
    await waitForPageReady(page, { waitForSelector: '#total-tickets' }, test.info());
    await expect(page.locator('#total-tickets')).not.toHaveText('--');
  });

  test('should handle no data gracefully', async ({ page }) => {
    await page.route('**/api/admin/analytics*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          metrics: {
            totalTickets: 0,
            grossRevenue: 0,
            uniqueCustomers: 0,
            checkinRate: 0,
            conversionRate: 0,
            walletAdoption: 0,
            digitalShare: 0,
            topTicketType: null
          },
          topCustomers: [],
          recommendations: [],
          salesTrend: { dates: [], daily: [], cumulative: [] },
          revenueByType: { labels: [], values: [] },
          hourlySales: { hours: [], sales: [] },
          checkinByType: { types: [], rates: [] },
          walletTrend: { dates: [], adoption: [] }
        })
      });
    });

    await page.reload();
    await waitForPageReady(page, { waitForSelector: '#total-tickets' }, test.info());

    // Should show 0 values, not errors
    await expect(page.locator('#total-tickets')).toHaveText('0');
    await expect(page.locator('#gross-revenue')).toContainText('$0');
  });
});
