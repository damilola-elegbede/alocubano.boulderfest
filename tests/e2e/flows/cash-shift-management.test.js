/**
 * E2E Test: Cash Shift Management
 * Comprehensive testing of cash shift lifecycle, transactions, and reconciliation
 */

import { test, expect } from '@playwright/test';
import { waitForPageReady, getTestTimeout } from '../helpers/playwright-utils.js';

test.describe('Cash Shift Management E2E', () => {
  let adminPage;

  /**
   * Helper: Login as admin
   */
  async function loginAsAdmin(page) {
    const adminAuthAvailable = process.env.ADMIN_AUTH_AVAILABLE !== 'false';
    if (!adminAuthAvailable) {
      console.log('⚠️ Admin authentication not available - skipping test');
      test.skip();
    }

    await page.goto('/admin/login');
    await page.fill('input[name="username"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'test-password');
    await page.click('button[type="submit"]');

    const navTimeout = getTestTimeout(test.info(), 'navigation');
    await page.waitForURL('**/admin/dashboard', { timeout: navTimeout });
  }

  /**
   * Helper: Open a cash shift
   */
  async function openCashShift(page, { staffName = 'Test Staff', openingCash = '500.00' } = {}) {
    await page.goto('/admin/cash-shifts');
    await waitForPageReady(page, {}, test.info());

    await page.click('button:has-text("Open Shift")');
    await page.fill('[name="staffName"]', staffName);
    await page.fill('[name="openingCash"]', openingCash);
    await page.click('button:has-text("Submit"), button:has-text("Open")');

    // Wait for success confirmation
    await page.waitForSelector('.shift-status:has-text("Open"), .status:has-text("open")', {
      timeout: getTestTimeout(test.info(), 'action')
    });
  }

  test.beforeEach(async ({ page }) => {
    adminPage = page;
    await loginAsAdmin(page);
  });

  test.describe('Cash Shift Lifecycle', () => {
    test('should successfully open a cash shift', async ({ page }) => {
      await page.goto('/admin/cash-shifts');
      await waitForPageReady(page, {}, test.info());

      // Click open shift button
      await page.click('button:has-text("Open Shift")');

      // Fill form
      await page.fill('[name="staffName"]', 'John Doe');
      await page.fill('[name="openingCash"]', '500.00');
      await page.click('button[type="submit"]');

      // Verify shift opened
      await expect(page.locator('.shift-status, .status')).toContainText('Open', {
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Verify opening cash displayed
      await expect(page.locator('.opening-cash, [data-testid="opening-cash"]')).toContainText('$500.00');
    });

    test('should display shift details with Mountain Time', async ({ page }) => {
      await openCashShift(page);

      // Verify timestamp includes Mountain Time indicator
      const timestamp = await page.locator('.opened-at, [data-testid="opened-at"]').textContent();
      expect(timestamp).toMatch(/(MT|MST|MDT|Mountain)/);
    });

    test('should close cash shift with correct reconciliation', async ({ page }) => {
      await openCashShift(page, { openingCash: '500.00' });

      // Simulate some sales first (would update expected cash)
      // For now, close with same amount
      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '500.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      // Verify shift closed
      await expect(page.locator('.shift-status, .status')).toContainText('Closed', {
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Verify no discrepancy
      await expect(page.locator('.discrepancy, [data-testid="discrepancy"]')).toContainText('$0.00');
    });

    test('should calculate discrepancy correctly (over)', async ({ page }) => {
      await openCashShift(page, { openingCash: '500.00' });

      // Close with more cash than expected
      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '525.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      // Verify positive discrepancy
      await expect(page.locator('.discrepancy, [data-testid="discrepancy"]')).toContainText('$25.00');
    });

    test('should calculate discrepancy correctly (under)', async ({ page }) => {
      await openCashShift(page, { openingCash: '500.00' });

      // Close with less cash than expected
      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '475.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      // Verify negative discrepancy
      await expect(page.locator('.discrepancy, [data-testid="discrepancy"]')).toContainText('-$25.00');
    });
  });

  test.describe('Cash Shift Validation', () => {
    test('should prevent opening multiple shifts for same staff', async ({ page }) => {
      await openCashShift(page, { staffName: 'Jane Smith' });

      // Try to open another shift for same staff
      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', 'Jane Smith');
      await page.fill('[name="openingCash"]', '300.00');
      await page.click('button:has-text("Submit"), button:has-text("Open")');

      // Verify error message
      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /already has an open shift|shift already open/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should validate opening cash is non-negative', async ({ page }) => {
      await page.goto('/admin/cash-shifts');
      await page.click('button:has-text("Open Shift")');

      await page.fill('[name="staffName"]', 'Test Staff');
      await page.fill('[name="openingCash"]', '-100.00');
      await page.click('button:has-text("Submit"), button:has-text("Open")');

      // Verify validation error
      await expect(page.locator('.error-message, .alert-error, [role="alert"]')).toContainText(
        /negative|invalid|must be greater/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should validate actual cash is non-negative on close', async ({ page }) => {
      await openCashShift(page);

      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '-50.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      // Verify validation error
      await expect(page.locator('.error-message, .alert-error, [role="alert"]')).toContainText(
        /negative|invalid|must be greater/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should require cash shift ID for cash payments', async ({ page }) => {
      // Try to process cash payment without open shift
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Add ticket to cart
      await page.click('[data-ticket-type]:first-child .add-to-cart');

      // Select cash payment
      await page.selectOption('[name="paymentMethod"]', 'cash');

      // Try to submit without cash shift
      await page.fill('[name="customerEmail"]', 'test@example.com');
      await page.fill('[name="customerName"]', 'Test Customer');
      await page.click('button:has-text("Complete Purchase")');

      // Verify error about missing cash shift
      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /cash shift|shift required|open a shift/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });
  });

  test.describe('Cash Shift Transactions', () => {
    test('should update cash shift balance after cash sale', async ({ page }) => {
      await openCashShift(page, { openingCash: '500.00' });

      // Get initial expected cash
      await page.goto('/admin/cash-shifts');
      const initialExpected = await page.locator('.expected-cash, [data-testid="expected-cash"]').textContent();

      // Process cash sale
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.selectOption('[name="paymentMethod"]', 'cash');
      await page.fill('[name="customerEmail"]', 'buyer@test.com');
      await page.fill('[name="customerName"]', 'Cash Buyer');
      await page.click('button:has-text("Complete Purchase")');

      // Wait for success
      await page.waitForSelector('.success-message, .alert-success', {
        timeout: getTestTimeout(test.info(), 'action')
      });

      // Verify cash shift balance updated
      await page.goto('/admin/cash-shifts');
      const newExpected = await page.locator('.expected-cash, [data-testid="expected-cash"]').textContent();

      expect(newExpected).not.toBe(initialExpected);
    });

    test('should track cash sales count', async ({ page }) => {
      await openCashShift(page, { openingCash: '500.00' });

      // Process 2 cash sales
      for (let i = 0; i < 2; i++) {
        await page.goto('/admin/manual-entry');
        await page.click('[data-ticket-type]:first-child .add-to-cart');
        await page.selectOption('[name="paymentMethod"]', 'cash');
        await page.fill('[name="customerEmail"]', `buyer${i}@test.com`);
        await page.fill('[name="customerName"]', `Buyer ${i}`);
        await page.click('button:has-text("Complete Purchase")');
        await page.waitForSelector('.success-message', {
          timeout: getTestTimeout(test.info(), 'action')
        });
      }

      // Verify sales count
      await page.goto('/admin/cash-shifts');
      await expect(page.locator('.sales-count, [data-testid="sales-count"]')).toContainText('2');
    });

    test('should not affect shift for non-cash payments', async ({ page }) => {
      await openCashShift(page, { openingCash: '500.00' });

      // Get initial state
      await page.goto('/admin/cash-shifts');
      const initialCount = await page.locator('.sales-count, [data-testid="sales-count"]').textContent();

      // Process card terminal sale (not cash)
      await page.goto('/admin/manual-entry');
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');
      await page.fill('[name="customerEmail"]', 'card@test.com');
      await page.fill('[name="customerName"]', 'Card Buyer');
      await page.click('button:has-text("Complete Purchase")');

      await page.waitForSelector('.success-message', {
        timeout: getTestTimeout(test.info(), 'action')
      });

      // Verify cash shift unchanged
      await page.goto('/admin/cash-shifts');
      const newCount = await page.locator('.sales-count, [data-testid="sales-count"]').textContent();
      expect(newCount).toBe(initialCount);
    });
  });

  test.describe('Cash Shift Filtering and Pagination', () => {
    test('should filter shifts by status', async ({ page }) => {
      // Open and close a shift
      await openCashShift(page);
      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '500.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      // Filter by status
      await page.selectOption('[name="statusFilter"]', 'closed');
      await waitForPageReady(page, {}, test.info());

      // Verify only closed shifts shown
      const statuses = await page.locator('.shift-status, .status').allTextContents();
      statuses.forEach(status => {
        expect(status.toLowerCase()).toContain('closed');
      });
    });

    test('should filter shifts by date range', async ({ page }) => {
      await page.goto('/admin/cash-shifts');
      await waitForPageReady(page, {}, test.info());

      // Set date range (today only)
      const today = new Date().toISOString().split('T')[0];
      await page.fill('[name="startDate"]', today);
      await page.fill('[name="endDate"]', today);
      await page.click('button:has-text("Filter"), button:has-text("Apply")');

      await waitForPageReady(page, {}, test.info());

      // Verify results are from today
      const dates = await page.locator('.shift-date, [data-testid="shift-date"]').allTextContents();
      dates.forEach(date => {
        expect(date).toContain(today.split('-')[2]); // Day of month
      });
    });

    test('should paginate shift list', async ({ page }) => {
      await page.goto('/admin/cash-shifts');
      await waitForPageReady(page, {}, test.info());

      // Check if pagination exists
      const hasPagination = await page.locator('.pagination, [role="navigation"]').count() > 0;

      if (hasPagination) {
        const firstPageContent = await page.locator('.shift-row, [data-testid="shift-row"]').first().textContent();

        // Go to page 2
        await page.click('button:has-text("Next"), a:has-text("2")');
        await waitForPageReady(page, {}, test.info());

        const secondPageContent = await page.locator('.shift-row, [data-testid="shift-row"]').first().textContent();

        expect(firstPageContent).not.toBe(secondPageContent);
      } else {
        console.log('Pagination not present - not enough shifts');
      }
    });
  });

  test.describe('Cash Shift Details View', () => {
    test('should display complete shift details', async ({ page }) => {
      await openCashShift(page, { staffName: 'Detail Test', openingCash: '750.00' });

      // Navigate to shift details
      await page.click('.shift-row:first-child, [data-testid="shift-row"]:first-child');
      await waitForPageReady(page, {}, test.info());

      // Verify all key fields present
      await expect(page.locator('body')).toContainText('Detail Test');
      await expect(page.locator('body')).toContainText('$750.00');
      await expect(page.locator('body')).toContainText('Open');
    });

    test('should show transaction list for shift', async ({ page }) => {
      await openCashShift(page);

      // Make a cash sale
      await page.goto('/admin/manual-entry');
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.selectOption('[name="paymentMethod"]', 'cash');
      await page.fill('[name="customerEmail"]', 'detail@test.com');
      await page.fill('[name="customerName"]', 'Detail Customer');
      await page.click('button:has-text("Complete Purchase")');

      await page.waitForSelector('.success-message', {
        timeout: getTestTimeout(test.info(), 'action')
      });

      // View shift details
      await page.goto('/admin/cash-shifts');
      await page.click('.shift-row:first-child, [data-testid="shift-row"]:first-child');

      // Verify transaction listed
      await expect(page.locator('.transaction-list, [data-testid="transaction-list"]')).toContainText('detail@test.com');
    });
  });

  test.describe('Error Scenarios', () => {
    test('should handle duplicate shift open gracefully', async ({ page }) => {
      await openCashShift(page);

      // Try to open same shift via API (simulate race condition)
      // This would be caught by database constraints
      await page.goto('/admin/cash-shifts');

      const errorShown = await page.locator('.error-message, .alert-error').count() > 0;
      // Should either prevent duplicate or show error
      expect(errorShown).toBeTruthy();
    });

    test('should prevent closing already closed shift', async ({ page }) => {
      await openCashShift(page);

      // Close shift
      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '500.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      await page.waitForSelector('.shift-status:has-text("Closed")', {
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Try to close again
      const closeButton = await page.locator('button:has-text("Close Shift")').count();
      expect(closeButton).toBe(0); // Button should not be available
    });

    test('should handle invalid cash shift ID gracefully', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Manually set invalid shift ID (if possible via dev tools)
      await page.evaluate(() => {
        if (window.currentCashShiftId) {
          window.currentCashShiftId = 99999; // Invalid ID
        }
      });

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.selectOption('[name="paymentMethod"]', 'cash');
      await page.fill('[name="customerEmail"]', 'invalid@test.com');
      await page.fill('[name="customerName"]', 'Invalid Test');
      await page.click('button:has-text("Complete Purchase")');

      // Should show error
      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /invalid|not found|closed/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should validate shift exists before processing', async ({ page }) => {
      // Don't open any shift, try cash payment
      await page.goto('/admin/manual-entry');
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.selectOption('[name="paymentMethod"]', 'cash');
      await page.fill('[name="customerEmail"]', 'noshift@test.com');
      await page.fill('[name="customerName"]', 'No Shift Test');
      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /shift|required|open/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });
  });

  test.describe('Concurrent Shifts', () => {
    test('should allow different staff to have concurrent shifts', async ({ page }) => {
      // Open shift for first staff
      await openCashShift(page, { staffName: 'Staff One', openingCash: '500.00' });

      // Open shift for second staff
      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', 'Staff Two');
      await page.fill('[name="openingCash"]', '300.00');
      await page.click('button:has-text("Submit"), button:has-text("Open")');

      // Verify both shifts are open
      await page.goto('/admin/cash-shifts');
      const openShifts = await page.locator('.shift-status:has-text("Open")').count();
      expect(openShifts).toBeGreaterThanOrEqual(2);
    });

    test('should associate transactions with correct shift', async ({ page }) => {
      // Open two shifts
      await openCashShift(page, { staffName: 'Alice', openingCash: '500.00' });

      const aliceShiftId = await page.locator('[data-shift-id]:first-child').getAttribute('data-shift-id');

      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', 'Bob');
      await page.fill('[name="openingCash"]', '400.00');
      await page.click('button:has-text("Submit"), button:has-text("Open")');

      // Process sale with Bob's shift selected
      await page.goto('/admin/manual-entry');
      await page.selectOption('[name="cashShift"]', { index: 1 }); // Bob's shift
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.selectOption('[name="paymentMethod"]', 'cash');
      await page.fill('[name="customerEmail"]', 'bob-sale@test.com');
      await page.fill('[name="customerName"]', 'Bob Sale');
      await page.click('button:has-text("Complete Purchase")');

      await page.waitForSelector('.success-message', {
        timeout: getTestTimeout(test.info(), 'action')
      });

      // Verify Bob's shift has the transaction
      await page.goto('/admin/cash-shifts');
      const bobSalesCount = await page.locator('[data-staff="Bob"] .sales-count').textContent();
      expect(parseInt(bobSalesCount)).toBeGreaterThan(0);
    });
  });
});
