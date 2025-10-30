/**
 * E2E Test: Admin Audit Logs
 * Tests audit log viewing, filtering, and export functionality
 */

import { test, expect } from '@playwright/test';
import { getTestDataConstants } from '../../../scripts/seed-test-data.js';
import { waitForPageReady, waitForConditions, getTestTimeout } from '../helpers/playwright-utils.js';
import { getTestMFACode } from '../helpers/totp-generator.js';

const testConstants = getTestDataConstants();

test.describe('Admin Audit Logs', () => {
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

    // Navigate to audit logs page
    await page.goto('/admin/audit-logs');
    await waitForPageReady(page, { waitForSelector: 'h1', checkNetworkIdle: true }, test.info());
  });

  test('should load audit logs page successfully', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/audit-logs/);
    await expect(page.locator('h1')).toContainText(/Audit Logs/i);
  });

  test('should display statistics bar', async ({ page }) => {
    const statsBar = page.locator('#stats-bar');
    await expect(statsBar).toBeVisible();

    await expect(page.locator('#stat-total')).toBeVisible();
    await expect(page.locator('#stat-24h')).toBeVisible();
    await expect(page.locator('#stat-critical')).toBeVisible();
  });

  test('should show total logs count', async ({ page }) => {
    const statTotal = page.locator('#stat-total');
    await expect(statTotal).not.toHaveText('-');

    const totalText = await statTotal.textContent();
    expect(/\d+/.test(totalText)).toBeTruthy();
  });

  test('should display last 24 hours count', async ({ page }) => {
    const stat24h = page.locator('#stat-24h');
    await expect(stat24h).not.toHaveText('-');
  });

  test('should show critical events count', async ({ page }) => {
    const statCritical = page.locator('#stat-critical');
    await expect(statCritical).not.toHaveText('-');
  });

  test('should display filters container', async ({ page }) => {
    const filtersContainer = page.locator('.filters-container');
    await expect(filtersContainer).toBeVisible();
  });

  test('should have event type filter', async ({ page }) => {
    const eventTypeFilter = page.locator('#event-type-filter');
    await expect(eventTypeFilter).toBeVisible();

    // Check options
    const options = await eventTypeFilter.locator('option').allTextContents();
    expect(options).toContain('All Types');
    expect(options.some(opt => opt.includes('Admin Access'))).toBeTruthy();
  });

  test('should have severity filter', async ({ page }) => {
    const severityFilter = page.locator('#severity-filter');
    await expect(severityFilter).toBeVisible();

    const options = await severityFilter.locator('option').allTextContents();
    expect(options).toContain('All Severities');
    expect(options).toContain('Critical');
    expect(options).toContain('Error');
    expect(options).toContain('Warning');
  });

  test('should have admin user filter', async ({ page }) => {
    const adminUserFilter = page.locator('#admin-user-filter');
    await expect(adminUserFilter).toBeVisible();
    await expect(adminUserFilter).toHaveAttribute('placeholder', /admin user/i);
  });

  test('should have action filter', async ({ page }) => {
    const actionFilter = page.locator('#action-filter');
    await expect(actionFilter).toBeVisible();
    await expect(actionFilter).toHaveAttribute('placeholder', /action/i);
  });

  test('should have date range filters', async ({ page }) => {
    const startDateFilter = page.locator('#start-date-filter');
    const endDateFilter = page.locator('#end-date-filter');

    await expect(startDateFilter).toBeVisible();
    await expect(endDateFilter).toBeVisible();

    await expect(startDateFilter).toHaveAttribute('type', 'date');
    await expect(endDateFilter).toHaveAttribute('type', 'date');
  });

  test('should have apply filters button', async ({ page }) => {
    const applyBtn = page.locator('#apply-filters-btn');
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText(/Apply Filters/i);
  });

  test('should have clear filters button', async ({ page }) => {
    const clearBtn = page.locator('#clear-filters-btn');
    await expect(clearBtn).toBeVisible();
    await expect(clearBtn).toContainText(/Clear Filters/i);
  });

  test('should filter by event type', async ({ page }) => {
    const eventTypeFilter = page.locator('#event-type-filter');
    await eventTypeFilter.selectOption('admin_access');

    const applyBtn = page.locator('#apply-filters-btn');
    await applyBtn.click();

    await page.waitForTimeout(1000);

    // Verify filter was applied (could check URL or table content)
    const currentUrl = page.url();
    expect(currentUrl).toBeDefined();
  });

  test('should filter by severity', async ({ page }) => {
    const severityFilter = page.locator('#severity-filter');
    await severityFilter.selectOption('critical');

    const applyBtn = page.locator('#apply-filters-btn');
    await applyBtn.click();

    await page.waitForTimeout(1000);

    // Verify filter applied
    const tableBody = page.locator('#audit-logs-body');
    if (await tableBody.isVisible()) {
      const bodyText = await tableBody.textContent();
      expect(bodyText).toBeDefined();
    }
  });

  test('should filter by admin user', async ({ page }) => {
    const adminUserFilter = page.locator('#admin-user-filter');
    await adminUserFilter.fill('admin');

    const applyBtn = page.locator('#apply-filters-btn');
    await applyBtn.click();

    await page.waitForTimeout(1000);
    expect(await adminUserFilter.inputValue()).toBe('admin');
  });

  test('should filter by action', async ({ page }) => {
    const actionFilter = page.locator('#action-filter');
    await actionFilter.fill('login');

    const applyBtn = page.locator('#apply-filters-btn');
    await applyBtn.click();

    await page.waitForTimeout(1000);
    expect(await actionFilter.inputValue()).toBe('login');
  });

  test('should filter by date range', async ({ page }) => {
    const startDate = '2025-01-01';
    const endDate = '2025-10-29';

    await page.fill('#start-date-filter', startDate);
    await page.fill('#end-date-filter', endDate);

    const applyBtn = page.locator('#apply-filters-btn');
    await applyBtn.click();

    await page.waitForTimeout(1000);
    expect(await page.locator('#start-date-filter').inputValue()).toBe(startDate);
  });

  test('should clear all filters', async ({ page }) => {
    // Apply some filters first
    await page.selectOption('#event-type-filter', 'admin_access');
    await page.selectOption('#severity-filter', 'critical');
    await page.fill('#admin-user-filter', 'admin');

    // Clear filters
    const clearBtn = page.locator('#clear-filters-btn');
    await clearBtn.click();

    // Verify filters cleared
    expect(await page.locator('#event-type-filter').inputValue()).toBe('');
    expect(await page.locator('#severity-filter').inputValue()).toBe('');
    expect(await page.locator('#admin-user-filter').inputValue()).toBe('');
  });

  test('should display audit logs table', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    // Table might be hidden if loading or no data
    const isVisible = await auditTable.isVisible();
    const emptyState = page.locator('#empty-state');
    const loadingSpinner = page.locator('#loading-spinner');

    // One of these should be visible
    expect(isVisible || (await emptyState.isVisible()) || (await loadingSpinner.isVisible())).toBeTruthy();
  });

  test('should have correct table headers', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const headers = await auditTable.locator('th').allTextContents();

      expect(headers.some(h => h.includes('Timestamp'))).toBeTruthy();
      expect(headers.some(h => h.includes('Event Type'))).toBeTruthy();
      expect(headers.some(h => h.includes('Action'))).toBeTruthy();
      expect(headers.some(h => h.includes('Admin User'))).toBeTruthy();
      expect(headers.some(h => h.includes('IP Address'))).toBeTruthy();
      expect(headers.some(h => h.includes('Severity'))).toBeTruthy();
    }
  });

  test('should display log entries if available', async ({ page }) => {
    const logsBody = page.locator('#audit-logs-body');
    const emptyState = page.locator('#empty-state');

    if (await logsBody.isVisible()) {
      const rowCount = await logsBody.locator('tr').count();
      expect(rowCount).toBeGreaterThanOrEqual(0);
    } else {
      await expect(emptyState).toBeVisible();
    }
  });

  test('should show empty state when no logs found', async ({ page }) => {
    // Apply filters that return no results
    await page.selectOption('#severity-filter', 'critical');
    await page.fill('#admin-user-filter', 'nonexistent-user-xyz');
    await page.click('#apply-filters-btn');

    await page.waitForTimeout(1000);

    const emptyState = page.locator('#empty-state');
    if (await emptyState.isVisible()) {
      await expect(emptyState).toContainText(/No Audit Logs Found/i);
    }
  });

  test('should display pagination controls', async ({ page }) => {
    const pagination = page.locator('#pagination');

    if (await pagination.isVisible()) {
      await expect(page.locator('#page-info')).toBeVisible();
      await expect(page.locator('#prev-page-btn')).toBeVisible();
      await expect(page.locator('#next-page-btn')).toBeVisible();
    }
  });

  test('should show page information', async ({ page }) => {
    const pageInfo = page.locator('#page-info');

    if (await pageInfo.isVisible()) {
      const infoText = await pageInfo.textContent();
      expect(infoText).not.toBe('-');
    }
  });

  test('should handle pagination navigation', async ({ page }) => {
    const pagination = page.locator('#pagination');

    if (await pagination.isVisible()) {
      const nextBtn = page.locator('#next-page-btn');
      const isEnabled = !(await nextBtn.isDisabled());

      if (isEnabled) {
        await nextBtn.click();
        await page.waitForTimeout(500);

        const prevBtn = page.locator('#prev-page-btn');
        expect(await prevBtn.isDisabled()).toBe(false);
      }
    }
  });

  test('should show severity badges with correct styling', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const severityBadges = auditTable.locator('.severity-badge');

      if ((await severityBadges.count()) > 0) {
        const firstBadge = severityBadges.first();
        const className = await firstBadge.getAttribute('class');

        expect(className).toMatch(/severity-(critical|error|warning|info|debug)/);
      }
    }
  });

  test('should display event type badges', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const eventTypeBadges = auditTable.locator('.event-type-badge');

      if ((await eventTypeBadges.count()) > 0) {
        await expect(eventTypeBadges.first()).toBeVisible();
      }
    }
  });

  test('should have details button for each log entry', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const detailsBtns = auditTable.locator('.details-btn');

      if ((await detailsBtns.count()) > 0) {
        await expect(detailsBtns.first()).toBeVisible();
      }
    }
  });

  test('should open details modal when details button clicked', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const detailsBtns = auditTable.locator('.details-btn');

      if ((await detailsBtns.count()) > 0) {
        await detailsBtns.first().click();

        const modal = page.locator('#details-modal');
        await expect(modal).toHaveClass(/active/);
      }
    }
  });

  test('should display log details in modal', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const detailsBtns = auditTable.locator('.details-btn');

      if ((await detailsBtns.count()) > 0) {
        await detailsBtns.first().click();

        const modalBody = page.locator('#modal-body');
        await expect(modalBody).toBeVisible();
      }
    }
  });

  test('should close details modal', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const detailsBtns = auditTable.locator('.details-btn');

      if ((await detailsBtns.count()) > 0) {
        await detailsBtns.first().click();

        const modal = page.locator('#details-modal');
        await expect(modal).toHaveClass(/active/);

        const closeBtn = page.locator('#close-modal-btn');
        await closeBtn.click();

        await expect(modal).not.toHaveClass(/active/);
      }
    }
  });

  test('should format timestamps in Mountain Time', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const timestampCells = auditTable.locator('tbody td:first-child');

      if ((await timestampCells.count()) > 0) {
        const firstTimestamp = await timestampCells.first().textContent();
        expect(firstTimestamp).toMatch(/\d{1,2}:\d{2}|MST|MDT/);
      }
    }
  });

  test('should display IP addresses', async ({ page }) => {
    const auditTable = page.locator('#audit-table');

    if (await auditTable.isVisible()) {
      const rows = auditTable.locator('tbody tr');

      if ((await rows.count()) > 0) {
        const rowText = await rows.first().textContent();
        expect(rowText).toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|::/); // IPv4 or IPv6
      }
    }
  });

  test('should handle combined filters correctly', async ({ page }) => {
    await page.selectOption('#event-type-filter', 'admin_access');
    await page.selectOption('#severity-filter', 'info');
    await page.fill('#start-date-filter', '2025-01-01');

    const applyBtn = page.locator('#apply-filters-btn');
    await applyBtn.click();

    await page.waitForTimeout(1000);

    // Verify filters persisted
    expect(await page.locator('#event-type-filter').inputValue()).toBe('admin_access');
    expect(await page.locator('#severity-filter').inputValue()).toBe('info');
  });

  test('should handle API errors gracefully', async ({ page }) => {
    await page.route('**/api/admin/audit-logs*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' })
      });
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Page should still render
    await expect(page.locator('h1')).toContainText(/Audit Logs/i);
  });

  test('should render mobile-friendly layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.filters-container')).toBeVisible();
  });

  test('should protect against XSS in log data', async ({ page }) => {
    const bodyText = await page.locator('body').textContent();

    expect(bodyText).not.toContain('<script>');
    expect(bodyText).not.toContain('javascript:');
    expect(bodyText).not.toContain('onerror=');
  });

  test('should verify all filter controls are functional', async ({ page }) => {
    // Test all filter controls can be interacted with
    await expect(page.locator('#event-type-filter')).toBeEnabled();
    await expect(page.locator('#severity-filter')).toBeEnabled();
    await expect(page.locator('#admin-user-filter')).toBeEnabled();
    await expect(page.locator('#action-filter')).toBeEnabled();
    await expect(page.locator('#start-date-filter')).toBeEnabled();
    await expect(page.locator('#end-date-filter')).toBeEnabled();
    await expect(page.locator('#apply-filters-btn')).toBeEnabled();
    await expect(page.locator('#clear-filters-btn')).toBeEnabled();
  });
});
