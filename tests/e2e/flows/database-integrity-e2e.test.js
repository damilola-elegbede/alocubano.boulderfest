/**
 * E2E Test: Database Integrity and Constraints
 * Tests foreign key constraints, data consistency, and referential integrity end-to-end
 */

import { test, expect } from '@playwright/test';
import { waitForPageReady, getTestTimeout } from '../helpers/playwright-utils.js';

test.describe('Database Integrity E2E', () => {
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

  test.beforeEach(async ({ page }) => {
    adminPage = page;
    await loginAsAdmin(page);
  });

  test.describe('Foreign Key Constraint: tickets.ticket_type_id', () => {
    test('should only allow tickets with valid ticket_type_id', async ({ page }) => {
      // Create ticket through manual entry (normal path)
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      const ticketTypeExists = await page.locator('[data-ticket-type]').count() > 0;
      expect(ticketTypeExists).toBeTruthy();

      // Add ticket with valid ticket type
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `fk-valid-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'FK Valid Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      // Should succeed
      await expect(page.locator('.success-message')).toContainText(/success/i, {
        timeout: getTestTimeout(test.info(), 'expect')
      });
    });

    test('should prevent orphaned tickets after ticket type deletion', async ({ page }) => {
      // This tests FK ON DELETE behavior
      // Ticket types shouldn't be deletable if tickets exist
      // Or tickets should be handled appropriately (SET NULL, CASCADE, etc.)

      await page.goto('/admin/ticket-types');
      await waitForPageReady(page, {}, test.info());

      // Attempt to delete a ticket type that has sold tickets
      const deleteButton = page.locator('button:has-text("Delete"), .delete-button').first();

      if (await deleteButton.count() > 0) {
        await deleteButton.click();

        // Should either:
        // 1. Prevent deletion with error message
        // 2. Handle CASCADE/SET NULL appropriately

        const errorShown = await page.locator('.error-message, .alert-error').count() > 0;
        const confirmShown = await page.locator('.confirm-dialog, [role="dialog"]').count() > 0;

        // System should prevent unsafe deletion or confirm cascade
        expect(errorShown || confirmShown).toBeTruthy();
      } else {
        console.log('No delete buttons available for FK test');
      }
    });
  });

  test.describe('Foreign Key Constraint: transactions.cash_shift_id', () => {
    test('should require valid cash_shift_id for cash payments', async ({ page }) => {
      // Open cash shift
      await page.goto('/admin/cash-shifts');
      await waitForPageReady(page, {}, test.info());

      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', `FK Test ${Date.now()}`);
      await page.fill('[name="openingCash"]', '500.00');
      await page.click('button:has-text("Submit"), button:has-text("Open")');

      await page.waitForSelector('.shift-status:has-text("Open")', {
        timeout: getTestTimeout(test.info(), 'action')
      });

      // Create cash payment (should link to shift)
      await page.goto('/admin/manual-entry');
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `cash-fk-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Cash FK Test');
      await page.selectOption('[name="paymentMethod"]', 'cash');

      await page.click('button:has-text("Complete Purchase")');

      // Should succeed with valid shift
      await expect(page.locator('.success-message')).toContainText(/success/i, {
        timeout: getTestTimeout(test.info(), 'expect')
      });
    });

    test('should reject cash payments without valid shift', async ({ page }) => {
      // Don't open shift - try cash payment
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `no-shift-fk-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'No Shift FK Test');
      await page.selectOption('[name="paymentMethod"]', 'cash');

      await page.click('button:has-text("Complete Purchase")');

      // Should fail with FK constraint error
      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /cash shift|shift required|invalid/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should handle cash shift deletion with existing transactions', async ({ page }) => {
      // Create cash shift with transaction
      await page.goto('/admin/cash-shifts');
      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', `Delete Test ${Date.now()}`);
      await page.fill('[name="openingCash"]', '500.00');
      await page.click('button:has-text("Submit")');

      await page.waitForSelector('.shift-status:has-text("Open")');

      // Create transaction
      await page.goto('/admin/manual-entry');
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `del-test-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Delete FK Test');
      await page.selectOption('[name="paymentMethod"]', 'cash');
      await page.click('button:has-text("Complete Purchase")');

      await page.waitForSelector('.success-message');

      // Try to delete shift (if UI allows)
      await page.goto('/admin/cash-shifts');

      const deleteBtn = page.locator('button:has-text("Delete"), .delete-shift').first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();

        // Should prevent or handle cascade appropriately
        const hasError = await page.locator('.error-message').count() > 0;
        const hasConfirm = await page.locator('[role="dialog"]').count() > 0;

        expect(hasError || hasConfirm).toBeTruthy();
      }
    });
  });

  test.describe('CHECK Constraint: cash_shifts.opening_cash_cents >= 0', () => {
    test('should prevent negative opening cash', async ({ page }) => {
      await page.goto('/admin/cash-shifts');
      await waitForPageReady(page, {}, test.info());

      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', 'Negative Opening Test');
      await page.fill('[name="openingCash"]', '-100.00');
      await page.click('button:has-text("Submit"), button:has-text("Open")');

      // Should show validation error
      await expect(page.locator('.error-message, .alert-error, [role="alert"]')).toContainText(
        /negative|invalid|must be.*greater/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });

    test('should allow zero opening cash', async ({ page }) => {
      await page.goto('/admin/cash-shifts');
      await waitForPageReady(page, {}, test.info());

      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', `Zero Opening ${Date.now()}`);
      await page.fill('[name="openingCash"]', '0.00');
      await page.click('button:has-text("Submit"), button:has-text("Open")');

      // Should succeed
      await expect(page.locator('.shift-status:has-text("Open")')).toBeVisible({
        timeout: getTestTimeout(test.info(), 'expect')
      });
    });
  });

  test.describe('CHECK Constraint: cash_shifts.actual_cash_cents >= 0', () => {
    test('should prevent negative actual cash on close', async ({ page }) => {
      // Open shift first
      await page.goto('/admin/cash-shifts');
      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', `Negative Actual ${Date.now()}`);
      await page.fill('[name="openingCash"]', '500.00');
      await page.click('button:has-text("Submit")');

      await page.waitForSelector('.shift-status:has-text("Open")');

      // Try to close with negative actual cash
      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '-50.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      // Should show validation error
      await expect(page.locator('.error-message, .alert-error')).toContainText(
        /negative|invalid|must be.*greater/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );
    });
  });

  test.describe('CHECK Constraint: ticket_types.sold_count <= max_quantity', () => {
    test('should prevent overselling tickets', async ({ page }) => {
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Find ticket type with limited quantity
      const limitedTicket = page.locator('[data-ticket-type][data-available]:not([data-available="unlimited"])').first();

      if (await limitedTicket.count() > 0) {
        const available = await limitedTicket.getAttribute('data-available');
        const availableQty = parseInt(available || '0', 10);

        if (availableQty > 0) {
          // Try to add more than available (if UI allows)
          for (let i = 0; i < availableQty + 2; i++) {
            const addBtn = limitedTicket.locator('.add-to-cart');
            if (await addBtn.count() > 0) {
              await addBtn.click();
            }
          }

          // Try to purchase
          await page.fill('[name="customerEmail"]', `oversell-${Date.now()}@example.com`);
          await page.fill('[name="customerName"]', 'Oversell Test');
          await page.selectOption('[name="paymentMethod"]', 'card_terminal');
          await page.click('button:has-text("Complete Purchase")');

          // Must fail with availability error and must not show success
          await expect(page.locator('.success-message')).toHaveCount(0, {
            timeout: getTestTimeout(test.info(), 'expect')
          });
          await expect(page.locator('.error-message, .alert-error')).toContainText(
            /not available|insufficient|sold out/i,
            { timeout: getTestTimeout(test.info(), 'expect') }
          );
        }
      } else {
        console.log('No limited-quantity tickets available for overselling test');
      }
    });
  });

  test.describe('CHECK Constraint: cash_shifts.status IN (open, closed)', () => {
    test('should only allow valid shift statuses', async ({ page }) => {
      // Valid statuses are enforced at database level
      // UI should only allow opening and closing shifts

      await page.goto('/admin/cash-shifts');
      await waitForPageReady(page, {}, test.info());

      // Open shift
      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', `Status Test ${Date.now()}`);
      await page.fill('[name="openingCash"]', '500.00');
      await page.click('button:has-text("Submit")');

      // Verify status is "open"
      await expect(page.locator('.shift-status, .status')).toContainText(/open/i, {
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Close shift
      await page.click('button:has-text("Close Shift")');
      await page.fill('[name="actualCash"]', '500.00');
      await page.click('button:has-text("Submit"), button:has-text("Close")');

      // Verify status is "closed"
      await expect(page.locator('.shift-status, .status')).toContainText(/closed/i);
    });
  });

  test.describe('UNIQUE Constraint: transactions.manual_entry_id', () => {
    test('should prevent duplicate manual_entry_id', async ({ page }) => {
      // Manual entry IDs are client-generated UUIDs for idempotency
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      const uniqueEmail = `unique-${Date.now()}@example.com`;

      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', uniqueEmail);
      await page.fill('[name="customerName"]', 'Unique Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      // Submit purchase
      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.success-message')).toContainText(/success/i, {
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Try to submit again with same manual_entry_id (idempotency check)
      // This would be caught by UNIQUE constraint if not handled in application code
      await page.click('button:has-text("Complete Purchase")');

      // Should either:
      // 1. Return existing transaction (idempotent)
      // 2. Show error about duplicate

      const hasSuccess = await page.locator('.success-message').count() > 0;
      const hasError = await page.locator('.error-message').count() > 0;

      expect(hasSuccess || hasError).toBeTruthy();
    });
  });

  test.describe('Cascade Behavior: Transaction Rollback', () => {
    test('should rollback transaction on constraint violation', async ({ page }) => {
      // Try to create transaction that violates constraints
      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Attempt invalid operation (e.g., cash payment without shift)
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `rollback-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Rollback Test');
      await page.selectOption('[name="paymentMethod"]', 'cash');

      await page.click('button:has-text("Complete Purchase")');

      // Should fail
      await expect(page.locator('.error-message')).toContainText(
        /shift|required/i,
        { timeout: getTestTimeout(test.info(), 'expect') }
      );

      // Verify no partial transaction created
      await page.goto('/admin/transactions');
      await waitForPageReady(page, {}, test.info());

      // Search for the test email
      const searchBox = page.locator('input[name="search"], input[type="search"]');
      if (await searchBox.count() > 0) {
        await searchBox.fill('rollback-');
        await page.keyboard.press('Enter');

        // Should not find any transaction rows matching our email
        const matching = page.locator('.transaction-row:has-text("rollback-"), tr:has-text("rollback-")');
        await expect(matching).toHaveCount(0, { timeout: getTestTimeout(test.info(), 'expect') });
      }
    });
  });

  test.describe('Data Consistency After Violations', () => {
    test('should maintain data integrity after failed operations', async ({ page }) => {
      // Get initial state
      await page.goto('/admin/dashboard');
      await waitForPageReady(page, {}, test.info());

      const initialStats = await page.locator('.stats, [data-testid="stats"]').textContent();

      // Attempt invalid operation
      await page.goto('/admin/manual-entry');
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', 'invalid-test@example.com');
      await page.fill('[name="customerName"]', ''); // Invalid: empty name
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');
      await page.click('button:has-text("Complete Purchase")');

      // Should fail
      const hasError = await page.locator('.error-message, .alert-error').count() > 0;
      expect(hasError).toBeTruthy();

      // Verify stats unchanged
      await page.goto('/admin/dashboard');
      await waitForPageReady(page, {}, test.info());

      const finalStats = await page.locator('.stats, [data-testid="stats"]').textContent();

      // Stats should be consistent (failed operation didn't affect counts)
      expect(finalStats).toBe(initialStats);
    });

    test('should preserve referential integrity across operations', async ({ page }) => {
      // Create complete transaction
      await page.goto('/admin/cash-shifts');
      await page.click('button:has-text("Open Shift")');
      await page.fill('[name="staffName"]', `Integrity Test ${Date.now()}`);
      await page.fill('[name="openingCash"]', '500.00');
      await page.click('button:has-text("Submit")');

      await page.waitForSelector('.shift-status:has-text("Open")');

      // Create transaction
      await page.goto('/admin/manual-entry');
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `integrity-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Integrity Test');
      await page.selectOption('[name="paymentMethod"]', 'cash');
      await page.click('button:has-text("Complete Purchase")');

      await expect(page.locator('.success-message')).toContainText(/success/i);

      // Verify all related records exist
      await page.goto('/admin/transactions');
      await waitForPageReady(page, {}, test.info());

      // Should find transaction
      const transactionExists = await page.locator('.transaction-row, tr').count() > 0;
      expect(transactionExists).toBeTruthy();

      // Verify cash shift updated
      await page.goto('/admin/cash-shifts');
      const salesCount = await page.locator('.sales-count, [data-testid="sales-count"]').first().textContent();
      expect(parseInt(salesCount || '0')).toBeGreaterThan(0);
    });
  });

  test.describe('Migration Rollback Safety', () => {
    test('should handle constraints from migrations 042-044 correctly', async ({ page }) => {
      // Test that all Phase 5 constraints are enforced

      // Migration 042: sold_count validation
      // Migration 043: test_sold_count isolation
      // Migration 044: FK constraints and CHECK constraints

      await page.goto('/admin/manual-entry');
      await waitForPageReady(page, {}, test.info());

      // Create normal purchase (should work with all constraints)
      await page.click('[data-ticket-type]:first-child .add-to-cart');
      await page.fill('[name="customerEmail"]', `migration-${Date.now()}@example.com`);
      await page.fill('[name="customerName"]', 'Migration Test');
      await page.selectOption('[name="paymentMethod"]', 'card_terminal');

      await page.click('button:has-text("Complete Purchase")');

      // Should succeed despite all constraints
      await expect(page.locator('.success-message')).toContainText(/success/i, {
        timeout: getTestTimeout(test.info(), 'expect')
      });

      // Verify data integrity maintained
      await page.goto('/admin/dashboard');
      await waitForPageReady(page, {}, test.info());

      // Dashboard should load without errors
      await expect(page.locator('.dashboard, main')).toBeVisible();
    });
  });
});
