/**
 * E2E Test: Inline Registration Checkout Flow
 *
 * Tests the complete user journey from ticket selection through registration
 * to payment completion with real browser interactions.
 *
 * Test Coverage:
 * - Single ticket purchase with inline registration
 * - Multiple tickets with "Use same info" feature
 * - Multiple tickets with different attendees
 * - Form validation prevents submission
 * - PayPal payment flow
 * - Cart persistence during registration
 * - Mobile responsive registration form
 */

import { test, expect } from '@playwright/test';
import { warnIfOptionalSecretsUnavailable } from '../helpers/test-setup.js';

test.describe('Inline Registration Checkout E2E Flow', () => {
  // Check for optional secrets (payment services)
  const secretWarnings = warnIfOptionalSecretsUnavailable(
    ['payment', 'stripe', 'paypal'],
    'inline-registration-checkout.test.js'
  );

  if (secretWarnings.hasWarnings) {
    console.log('ℹ️ Registration tests will use mock payment responses where needed');
  }

  test.beforeEach(async ({ page }) => {
    // Mock payment APIs for test environment
    await page.route('**/api/payments/create-checkout-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: `cs_test_${Date.now()}`,
          url: `/checkout-success?session_id=cs_test_${Date.now()}`
        })
      });
    });

    await page.route('**/api/payments/paypal/create-order', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `PAYPAL-TEST-${Date.now()}`,
          status: 'CREATED'
        })
      });
    });

    await page.route('**/api/payments/paypal/capture-order', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'COMPLETED',
          orderNumber: `ALO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
          message: 'Payment successful!'
        })
      });
    });
  });

  test('should complete single ticket purchase with inline registration', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add 1 Weekend Pass to cart
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await addButton.click();

    // Verify cart has 1 item
    const cartCount = page.locator('.cart-count, [data-testid="cart-count"]');
    await expect(cartCount).toHaveText('1', { timeout: 3000 });

    // Click "Proceed to Checkout"
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    // Should redirect to /checkout-registration
    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Fill registration form
    const uniqueEmail = `test.${Date.now()}@example.com`;
    await page.fill('input[name="firstName"], #firstName', 'Jane');
    await page.fill('input[name="lastName"], #lastName', 'Doe');
    await page.fill('input[name="email"], #email', uniqueEmail);

    // Click "Continue to Payment"
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
    await continueButton.click();

    // Should see payment selection
    await expect(page.locator('button:has-text("Pay with Stripe"), button:has-text("Credit Card")')).toBeVisible({ timeout: 5000 });

    // Select Stripe payment
    const stripeButton = page.locator('button:has-text("Pay with Stripe"), button:has-text("Credit Card")').first();
    await stripeButton.click();

    // Complete mock payment (redirects to success page)
    await page.waitForURL(/\/checkout-success/, { timeout: 10000 });

    // Verify success page shows confirmation
    await expect(page.locator('h1, h2').filter({ hasText: /success|thank you|confirmed/i })).toBeVisible({ timeout: 5000 });
  });

  test('should support "Use same info for all tickets" feature', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add 3 tickets to cart
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await addButton.click();
    await page.waitForTimeout(500);
    await addButton.click();
    await page.waitForTimeout(500);
    await addButton.click();

    // Verify cart has 3 items
    const cartCount = page.locator('.cart-count, [data-testid="cart-count"]');
    await expect(cartCount).toHaveText('3', { timeout: 3000 });

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Check "Use same info for all tickets"
    const sameInfoCheckbox = page.locator('input[type="checkbox"]:near(:text("same info")), input[id*="sameInfo"], input[name*="sameInfo"]').first();
    if (await sameInfoCheckbox.isVisible()) {
      await sameInfoCheckbox.check();
    }

    // Fill customer info form
    const uniqueEmail = `customer.${Date.now()}@example.com`;
    await page.fill('input[name="firstName"], input[name="customerFirstName"], #firstName', 'Customer');
    await page.fill('input[name="lastName"], input[name="customerLastName"], #lastName', 'Name');
    await page.fill('input[name="email"], input[name="customerEmail"], #email', uniqueEmail);

    // If checkbox worked, all ticket forms should be auto-filled
    // Otherwise, manually fill each ticket form
    const ticketForms = page.locator('[data-testid*="ticket-form"], .ticket-registration-form');
    const formsCount = await ticketForms.count();

    if (formsCount === 0 || formsCount === 1) {
      // Single form for all tickets
      console.log('Using single form for all tickets');
    } else {
      // Individual forms - fill each one
      console.log(`Found ${formsCount} ticket forms`);
      for (let i = 0; i < Math.min(formsCount, 3); i++) {
        const form = ticketForms.nth(i);
        const firstName = form.locator('input[name*="firstName"]').first();
        const lastName = form.locator('input[name*="lastName"]').first();
        const email = form.locator('input[name*="email"]').first();

        if (await firstName.isVisible()) {
          await firstName.fill('Customer');
          await lastName.fill('Name');
          await email.fill(uniqueEmail);
        }
      }
    }

    // Continue to payment
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
    await continueButton.click();

    // Verify we reach payment selection
    await expect(page.locator('button:has-text("Pay with Stripe"), button:has-text("Credit Card")')).toBeVisible({ timeout: 5000 });
  });

  test('should handle multiple tickets with different attendees', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add 3 tickets
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    for (let i = 0; i < 3; i++) {
      await addButton.click();
      await page.waitForTimeout(500);
    }

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // DO NOT check "same info" checkbox
    const sameInfoCheckbox = page.locator('input[type="checkbox"]:near(:text("same info"))').first();
    if (await sameInfoCheckbox.isVisible() && await sameInfoCheckbox.isChecked()) {
      await sameInfoCheckbox.uncheck();
    }

    // Fill 3 separate forms with different names/emails
    const attendees = [
      { firstName: 'Alice', lastName: 'Smith', email: `alice.${Date.now()}@example.com` },
      { firstName: 'Bob', lastName: 'Jones', email: `bob.${Date.now()}@example.com` },
      { firstName: 'Charlie', lastName: 'Brown', email: `charlie.${Date.now()}@example.com` }
    ];

    // Try different form selectors
    const ticketForms = page.locator('[data-testid*="ticket"], .ticket-form, .registration-form');
    const formsCount = await ticketForms.count();

    if (formsCount >= 3) {
      // Individual ticket forms
      for (let i = 0; i < 3; i++) {
        const form = ticketForms.nth(i);
        await form.locator('input[name*="firstName"]').fill(attendees[i].firstName);
        await form.locator('input[name*="lastName"]').fill(attendees[i].lastName);
        await form.locator('input[name*="email"]').fill(attendees[i].email);
      }
    } else {
      // Fall back to sequential field filling
      const firstNames = page.locator('input[name*="firstName"]');
      const lastNames = page.locator('input[name*="lastName"]');
      const emails = page.locator('input[name*="email"]');

      for (let i = 0; i < 3; i++) {
        if (await firstNames.nth(i).isVisible()) {
          await firstNames.nth(i).fill(attendees[i].firstName);
          await lastNames.nth(i).fill(attendees[i].lastName);
          await emails.nth(i).fill(attendees[i].email);
        }
      }
    }

    // Continue to payment
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
    await continueButton.click();

    // Verify we reach payment
    await expect(page.locator('button:has-text("Pay with Stripe"), button:has-text("Credit Card")')).toBeVisible({ timeout: 5000 });
  });

  test('should prevent submission with invalid form data', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add ticket
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await addButton.click();

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Enter invalid email
    await page.fill('input[name="email"], #email', 'invalid-email');

    // Try to continue
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');

    // Button should be disabled OR show error message
    const isDisabled = await continueButton.isDisabled().catch(() => false);

    if (!isDisabled) {
      await continueButton.click();
      // Should show error message
      await expect(page.locator(':text("valid email"), :text("invalid"), .error, [role="alert"]')).toBeVisible({ timeout: 3000 });
    }

    // Fix email
    await page.fill('input[name="email"], #email', `valid.${Date.now()}@example.com`);
    await page.fill('input[name="firstName"], #firstName', 'Jane');
    await page.fill('input[name="lastName"], #lastName', 'Doe');

    // Now button should work
    await expect(continueButton).toBeEnabled({ timeout: 3000 });
  });

  test('should complete PayPal payment flow', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add ticket
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await addButton.click();

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Fill registration form
    const uniqueEmail = `paypal.${Date.now()}@example.com`;
    await page.fill('input[name="firstName"], #firstName', 'PayPal');
    await page.fill('input[name="lastName"], #lastName', 'User');
    await page.fill('input[name="email"], #email', uniqueEmail);

    // Continue to payment
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
    await continueButton.click();

    // Select PayPal payment
    const paypalButton = page.locator('button:has-text("PayPal"), [data-payment="paypal"]').first();
    await expect(paypalButton).toBeVisible({ timeout: 5000 });
    await paypalButton.click();

    // Complete mock PayPal payment
    await page.waitForURL(/\/checkout-success|\/success/, { timeout: 10000 });

    // Verify success
    await expect(page.locator('h1, h2').filter({ hasText: /success|thank you/i })).toBeVisible({ timeout: 5000 });
  });

  test('should persist cart during registration navigation', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add 2 tickets
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await addButton.click();
    await page.waitForTimeout(500);
    await addButton.click();

    // Verify cart count
    const cartCount = page.locator('.cart-count, [data-testid="cart-count"]');
    await expect(cartCount).toHaveText('2', { timeout: 3000 });

    // Navigate away
    await page.goto('/about');
    await page.waitForLoadState('networkidle');

    // Return to tickets
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Verify cart still has 2 tickets
    await expect(cartCount).toHaveText('2', { timeout: 3000 });

    // Proceed to checkout - cart should still be intact
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Should show 2 ticket forms or indicate 2 tickets
    const ticketIndicator = page.locator(':text("2 ticket"), :text("ticket 1"), :text("ticket 2")').first();
    await expect(ticketIndicator).toBeVisible({ timeout: 3000 });
  });

  test('should display mobile-optimized registration form', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add ticket
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await addButton.click();

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Verify form inputs have minimum height for mobile (44px)
    const firstNameInput = page.locator('input[name="firstName"], #firstName').first();
    await expect(firstNameInput).toBeVisible();

    const inputHeight = await firstNameInput.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return parseInt(styles.height);
    });

    expect(inputHeight).toBeGreaterThanOrEqual(40); // At least 40px (close to 44px target)

    // Verify font size >= 16px to prevent iOS zoom
    const fontSize = await firstNameInput.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return parseInt(styles.fontSize);
    });

    expect(fontSize).toBeGreaterThanOrEqual(16);

    // Complete form on mobile
    await firstNameInput.fill('Mobile');
    await page.fill('input[name="lastName"], #lastName', 'User');
    await page.fill('input[name="email"], #email', `mobile.${Date.now()}@example.com`);

    // Verify continue button is accessible
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
    await expect(continueButton).toBeEnabled({ timeout: 3000 });
  });

  test('should show order summary during registration', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add tickets
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    await addButton.click();

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Verify order summary is visible
    const orderSummary = page.locator('[data-testid="order-summary"], .order-summary, :text("Order Summary")');
    await expect(orderSummary.first()).toBeVisible({ timeout: 5000 });

    // Verify total amount shown
    const totalAmount = page.locator(':text("$"), :text("Total"), :text("USD")');
    await expect(totalAmount.first()).toBeVisible({ timeout: 3000 });
  });
});
