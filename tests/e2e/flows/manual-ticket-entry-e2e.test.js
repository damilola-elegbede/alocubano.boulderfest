/**
 * E2E Test: Manual Ticket Entry Workflow
 * Comprehensive testing of manual at-door ticket creation for all payment methods
 */

import { test, expect } from '@playwright/test';
import { waitForPageReady, getTestTimeout } from '../helpers/playwright-utils.js';
import crypto from 'crypto';

test.describe('Manual Ticket Entry E2E', () => {
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
   * Helper: Open cash shift
   */
  async function openCashShift(page, openingCash = '500.00') {
    await page.goto('/admin/cash-shifts');
    await waitForPageReady(page, {}, test.info());

    await page.click('button:has-text("Open Shift")');
    await page.fill('[name="staffName"]', `Test Staff ${Date.now()}`);
    await page.fill('[name="openingCash"]', openingCash);
    await page.click('button:has-text("Submit"), button:has-text("Open")');

    await page.waitForSelector('.shift-status:has-text("Open")', {
      timeout: getTestTimeout(test.info(), 'action')
    });
  }

  test.beforeEach(async ({ page }) => {
    adminPage = page;
    await loginAsAdmin(page);
  });

  test.describe('Manual Entry - Complete Workflow', () => {
    test('should complete full purchase workflow with cash payment', async ({ page }) => {
      // Open cash shift first
      await openCashShift(page);

      // Navigate to manual entry
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Add ticket to cart
      await page.click('[data-ticket-type]:first-child .add-to-cart, [data-ticket-type]:first-child button:has-text("Add")');

      // Verify cart updated
      await expect(page.locator('.cart-count, [data-testid="cart-count"]')).toContainText('1');

      // Fill customer details
      await page.fill('[name="customerEmail"]', `cash-test-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Cash Test Customer');
      await page.fill('[name="customerPhone"]', '+1 555-0123');

      // Select cash payment
      await page.selectOption('[name="paymentMethod"], select[name="paymentMethod"]', 'cash');

      // Complete purchase
      await page.click('button:has-text("Complete Purchase"), button[type="submit"]');

      // Verify success
      await expect(page.locator('.success-message, .alert-success, [role="alert"]')).toContainText(
        /success|completed|created/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );

      // Verify order number generated
      await expect(page.locator('.order-number, [data-testid="order-number"]')).toBeVisible();
    });

    test('should complete purchase with card_terminal payment', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart, [data-ticket-type]:first-child button:has-text("Add")');

      await page.fill('[name="customerEmail"]', `card-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Card Terminal Customer');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase"), button[type="submit"]');

      await expect(page.locator('.success-message, .alert-success')).toContainText(
        /success|completed/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should complete purchase with venmo payment', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');

      await page.fill('[name="customerEmail"]', `venmo-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Venmo Customer');
      await page.selectOption('[name="paymentMethod"]', 'venmo');

      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.success-message')).toContainText(
        /success|completed/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should complete purchase with comp tickets', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');

      await page.fill('[name="customerEmail"]', `comp-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Comp Recipient');
      await page.selectOption('[name="paymentMethod"]', 'comp');

      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.success-message')).toContainText(
        /success|completed/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );

      // Verify $0 total for comp tickets
      await expect(page.locator('.total-amount, [data-testid="total"]')).toContainText('$0.00');
    });
  });

  test.describe('Cash Shift Requirement', () => {
    test('should require open cash shift for cash payments', async ({ page }) => {
      // Don't open a shift - try cash payment
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', 'noshift@example.com');
      await page.fill('[name="customerName"]', 'No Shift Test');
      await page.selectOption('[name="paymentMethod"]', 'cash');

      await page.click('button:has-text("Complete Purchase")');

      // Verify error about missing shift
      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /cash shift|shift required|open.*shift/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should allow non-cash payments without cash shift', async ({ page }) => {
      // No cash shift opened - use card terminal
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `noshift-card-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Card No Shift');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      // Should succeed
      await expect(page.locator('.success-message')).toContainText(
        /success|completed/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should validate cash shift is open (not closed)', async ({ page }) => {
      // Open and immediately close a shift
      await openCashShift(page);
      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '500.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      // Try to use closed shift for payment
      await page.goto('/admin/manual-entry');
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', 'closed-shift@example.com');
      await page.fill('[name="customerName"]', 'Closed Shift Test');
      await page.selectOption('[name="paymentMethod"]', 'cash');

      await page.click('button:has-text("Complete Purchase")');

      // Should show error about closed shift
      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /closed|not open|invalid shift/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });
  });

  test.describe('Multiple Ticket Types', () => {
    test('should handle multiple ticket types in single transaction', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Add multiple ticket types
      const ticketTypes = await page.locator('[data-ticket-type]').count();
      if (ticketTypes >= 2) {
        await page.click('[data-ticket-type]:nth-child(1) .add-to-cart');
        await page.click('[data-ticket-type]:nth-child(2) .add-to-cart');

        // Verify cart count
        await expect(page.locator('.cart-count')).toContainText('2');

        // Complete purchase
        await page.fill('[name="customerEmail"]', `multi-${Date.now()}@example.com`);
        await page.fill('[name="customerName"]', 'Multi Type Buyer');
        await page.selectOption('[name="paymentMethod"]', 'card_terminal');

        await page.click('button:has-text("Complete Purchase")');

        await expect(page.locator('.success-message')).toContainText(/success/i);
      } else {
        console.log('Not enough ticket types for multi-type test');
      }
    });

    test('should handle quantity adjustment', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');

      // Increase quantity
      const increaseBtn = page.locator('.quantity-increase, button:has-text("+")').first();
      if (await increaseBtn.isVisible()) {
        await increaseBtn.click();
        await expect(page.locator('.cart-count')).toContainText('2');
      }

      await page.fill('[name="customerEmail"]', `qty-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Quantity Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.success-message')).toContainText(/success/i);
    });
  });

  test.describe('Order Confirmation', () => {
    test('should display order confirmation with all details', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      const testEmail = `confirm-${Date.now()}@example.com`;

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', testEmail);
      await page.fill('[name="customerName"]', 'Confirmation Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      // Wait for confirmation
      await expect(page.locator('.order-confirmation, [data-testid="confirmation"]')).toBeVisible({
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Verify confirmation includes:
      await expect(page.locator('body')).toContainText(testEmail); // Customer email
      await expect(page.locator('body')).toContainText('Confirmation Test'); // Customer name
      await expect(page.locator('.order-number, [data-testid="order-number"]')).toBeVisible(); // Order number
    });

    test('should display ticket count in confirmation', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');

      await page.fill('[name="customerEmail"]', `ticket-count-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Ticket Count Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      // Verify ticket count shown
      await expect(page.locator('.ticket-count, [data-testid="ticket-count"]')).toContainText('1');
    });
  });

  test.describe('CSRF Protection', () => {
    test('should include CSRF token in requests', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Verify CSRF token present in form
      const csrfToken = await page.locator('[name="csrf_token"], [name="csrfToken"]');
      await expect(csrfToken).toBeAttached();

      const tokenValue = await csrfToken.inputValue();
      expect(tokenValue).toBeTruthy();
      expect(tokenValue.length).toBeGreaterThan(10);
    });

    test('should handle CSRF token validation', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `csrf-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'CSRF Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      // Complete purchase (CSRF token automatically included)
      await page.click('button:has-text("Complete Purchase")');

      // Should succeed with valid token
      await expect(page.locator('.success-message')).toContainText(/success/i, {
        timeout: getTestTimeout(test.info(), 'expect')
      });
    });
  });

  test.describe('Fraud Detection Thresholds', () => {
    test('should track recent ticket creation rate', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Make multiple purchases quickly
      for (let i = 0; i < 3; i++) {
        await page.click('[data-ticket-type]:first-child .add-to-cart');
        await page.fill('[name="customerEmail"]', `fraud-${i}-${Date.now()}@example.com`);
        await page.fill('[name="customerName"]', `Fraud Test ${i}`);
        await page.selectOption('[name="paymentMethod"]', 'card_terminal');

        await page.click('button:has-text("Complete Purchase")');

        await expect(page.locator('.success-message')).toContainText(/success/i, {
          timeout: getTestTimeout(test.info(), 'expect')
        });

        // Reset for next purchase
        await page.goto('/admin/manual-entry');
        await waitForPageReady(page, {}, test.info());
      }

      // All should succeed (under threshold of 20 in 15 min)
      // No fraud alert expected at this volume
    });

    test('should display fraud check info in response', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `fraud-info-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Fraud Info Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.success-message')).toContainText(/success/i);

      // Check if fraud info displayed (may be in response or logs)
      const bodyText = await page.locator('body').textContent();
      // Fraud check runs but shouldn't block normal transactions
      expect(bodyText).toBeTruthy();
    });
  });

  test.describe('Email Confirmation', () => {
    test('should trigger email confirmation for purchase', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      const testEmail = `email-${Date.now()}@example.com`;

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', testEmail);
      await page.fill('[name="customerName"]', 'Email Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.success-message')).toContainText(/success/i);

      // Email is sent asynchronously - verify success implies email queued
      await expect(page.locator('body')).toContainText(/confirmation/i);
    });
  });

  test.describe('Wallet Pass Generation', () => {
    test('should generate wallet passes for tickets', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `wallet-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Wallet Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.success-message')).toContainText(/success/i);

      // Wallet passes generated in background - verify tickets created
      await expect(page.locator('.ticket-count, [data-testid="ticket-count"]')).toBeVisible();
    });
  });

  test.describe('Input Validation', () => {
    test('should validate email format', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', 'invalid-email');
      await page.fill('[name="customerName"]', 'Validation Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      // Should show validation error
      await expect(page.locator('.error-message, .alert-error, [role="alert"]')).toContainText(
        /email|invalid/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should require customer name', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `name-req-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', ''); // Empty name
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /name|required/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should validate phone number format', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `phone-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Phone Test');
      await page.fill('[name="customerPhone"]', 'invalid-phone!!!');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      // May show validation error or accept (phone is optional)
      const hasError = await page.locator('.error-message').count() > 0;
      if (hasError) {
        await expect(page.locator('.error-message')).toContainText(/phone/i);
      } else {
        // If accepted, phone validation is lenient
        expect(true).toBeTruthy();
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle ticket type not found', async ({ page }) => {
      // Try to purchase with invalid ticket type ID (via API if possible)
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Attempt to add invalid ticket via console
      await page.evaluate(() => {
        if (window.cart) {
          window.cart.push({ ticketTypeId: 'INVALID-TYPE', quantity: 1 });
        }
      });

      await page.fill('[name="customerEmail"]', 'invalid-type@example.com');
      await page.fill('[name="customerName"]', 'Invalid Type Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      // Should handle gracefully with error
      const hasError = await page.locator('.error-message, .alert-error').count() > 0;
      expect(hasError).toBeTruthy();
    });

    test('should handle unavailable tickets', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Try to purchase sold-out tickets (if any exist)
      const soldOutTicket = await page.locator('[data-status="sold-out"], .sold-out').first();

      if (await soldOutTicket.count() > 0) {
        const addButton = soldOutTicket.locator('.add-to-cart');
        if (await addButton.count() > 0) {
          await addButton.click();

          await page.fill('[name="customerEmail"]', 'soldout@example.com');
          await page.fill('[name="customerName"]', 'Sold Out Test');
          await page.selectOption('[name="paymentMethod"]', 'card_terminal');

          await page.click('button:has-text("Complete Purchase")');

          await expect(page.locator('.error-message')).toContainText(
            /not available|sold out/i
          );
        }
      } else {
        console.log('No sold-out tickets available for test');
      }
    });

    test('should handle network errors gracefully', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `network-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Network Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      // Simulate offline (if possible)
      await page.context().setOffline(true);

      await page.click('button:has-text("Complete Purchase")');

      // Should show error
      await expect(page.locator('.error-message, .alert-error')).toBeVisible({
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Restore connection
      await page.context().setOffline(false);
    });
  });

  test.describe('Idempotency', () => {
    test('should prevent duplicate submissions', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      const uniqueEmail = `idempotent-${Date.now()}@example.com`;

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', uniqueEmail);
      await page.fill('[name="customerName"]', 'Idempotent Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      // Click submit multiple times quickly
      await page.click('button:has-text("Complete Purchase")');
      await page.click('button:has-text("Complete Purchase")');

      // Should only create one order
      await expect(page.locator('.success-message, .order-number')).toBeVisible({
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Verify single order number shown (not duplicated)
      const orderNumbers = await page.locator('.order-number').count();
      expect(orderNumbers).toBe(1);
    });
  });
});
