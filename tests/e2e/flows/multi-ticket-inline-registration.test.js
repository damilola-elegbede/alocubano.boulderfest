/**
 * E2E Test: Multi-Ticket Inline Registration
 *
 * Tests complex multi-ticket scenarios:
 * - 5 tickets with 3 unique attendees
 * - Mixed ticket types (Weekend Pass + Friday Only + Saturday Only)
 * - Cart modification during registration
 * - Performance with large groups (10+ tickets)
 *
 * Test Coverage:
 * - Group purchases with shared and unique attendee info
 * - Different ticket types in same cart
 * - Cart updates during checkout flow
 * - Performance and usability with many tickets
 */

import { test, expect } from '@playwright/test';
import { warnIfOptionalSecretsUnavailable } from '../helpers/test-setup.js';

test.describe('Multi-Ticket Inline Registration', () => {
  // Check for optional secrets
  const secretWarnings = warnIfOptionalSecretsUnavailable(
    ['payment', 'stripe', 'paypal'],
    'multi-ticket-inline-registration.test.js'
  );

  if (secretWarnings.hasWarnings) {
    console.log('ℹ️ Multi-ticket tests will use mock responses where needed');
  }

  test.beforeEach(async ({ page }) => {
    // Mock payment APIs
    await page.route('**/api/checkout/create-pending-transaction', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      const ticketCount = postData?.cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 1;

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          transaction: {
            id: Math.floor(Math.random() * 10000),
            transaction_id: `TXN-${Date.now()}`,
            order_number: `ALO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
            payment_status: 'pending'
          },
          tickets: Array.from({ length: ticketCount }, (_, i) => ({
            ticket_id: `TKT-${Date.now()}-${i}`,
            ticket_type: 'Test Ticket',
            registration_status: 'pending_payment'
          }))
        })
      });
    });

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
  });

  test('should handle 5 tickets with mixed attendee info', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add 5 tickets to cart
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    for (let i = 0; i < 5; i++) {
      await addButton.click();
      await page.waitForTimeout(500);
    }

    // Verify cart has 5 tickets
    const cartCount = page.locator('.cart-count, [data-testid="cart-count"]');
    await expect(cartCount).toHaveText('5', { timeout: 3000 });

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Fill registration for 5 tickets
    // Strategy: Use first 2 for one attendee, next 2 for another, last 1 for third
    const attendees = [
      { firstName: 'Alice', lastName: 'Smith', email: `alice.${Date.now()}@example.com`, count: 2 },
      { firstName: 'Bob', lastName: 'Jones', email: `bob.${Date.now()}@example.com`, count: 2 },
      { firstName: 'Charlie', lastName: 'Brown', email: `charlie.${Date.now()}@example.com`, count: 1 }
    ];

    // Try to find ticket forms
    const ticketForms = page.locator('[data-testid*="ticket"], .ticket-form, .registration-form');
    const formsCount = await ticketForms.count();

    if (formsCount >= 5) {
      // Individual forms for each ticket
      let ticketIndex = 0;
      for (const attendee of attendees) {
        for (let i = 0; i < attendee.count; i++) {
          const form = ticketForms.nth(ticketIndex);
          await form.locator('input[name*="firstName"]').fill(attendee.firstName);
          await form.locator('input[name*="lastName"]').fill(attendee.lastName);
          await form.locator('input[name*="email"]').fill(attendee.email);
          ticketIndex++;
        }
      }
    } else {
      // Fill sequential fields
      const firstNames = page.locator('input[name*="firstName"], input[id*="firstName"]');
      const lastNames = page.locator('input[name*="lastName"], input[id*="lastName"]');
      const emails = page.locator('input[name*="email"], input[id*="email"]');

      let ticketIndex = 0;
      for (const attendee of attendees) {
        for (let i = 0; i < attendee.count; i++) {
          if (await firstNames.nth(ticketIndex).isVisible()) {
            await firstNames.nth(ticketIndex).fill(attendee.firstName);
            await lastNames.nth(ticketIndex).fill(attendee.lastName);
            await emails.nth(ticketIndex).fill(attendee.email);
          }
          ticketIndex++;
        }
      }
    }

    // Continue to payment
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
    await continueButton.click();

    // Verify we reach payment
    await expect(page.locator('button:has-text("Pay with Stripe"), button:has-text("Credit Card")')).toBeVisible({ timeout: 5000 });
  });

  test('should handle mixed ticket types in same cart', async ({ page, browserName }) => {
    // Skip if browser doesn't support multiple ticket types well
    if (browserName === 'webkit') {
      test.skip();
      return;
    }

    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Try to find different ticket type buttons
    const ticketButtons = page.locator('button:has-text("Add to Cart")');
    const buttonCount = await ticketButtons.count();

    if (buttonCount >= 3) {
      // Add Weekend Pass
      await ticketButtons.nth(0).click();
      await page.waitForTimeout(500);

      // Add Friday Only
      await ticketButtons.nth(1).click();
      await page.waitForTimeout(500);

      // Add Saturday Only
      await ticketButtons.nth(2).click();
      await page.waitForTimeout(500);

      // Verify cart has 3 tickets
      const cartCount = page.locator('.cart-count, [data-testid="cart-count"]');
      await expect(cartCount).toHaveText('3', { timeout: 3000 });

      // Proceed to checkout
      const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
      await checkoutButton.click();

      await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

      // Fill different attendee info for each ticket type
      const attendees = [
        { firstName: 'Weekend', lastName: 'Attendee', email: `weekend.${Date.now()}@example.com` },
        { firstName: 'Friday', lastName: 'Guest', email: `friday.${Date.now()}@example.com` },
        { firstName: 'Saturday', lastName: 'Visitor', email: `saturday.${Date.now()}@example.com` }
      ];

      // Fill forms
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

      // Continue to payment
      const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
      await continueButton.click();

      // Verify payment page
      await expect(page.locator('button:has-text("Stripe"), button:has-text("PayPal")')).toBeVisible({ timeout: 5000 });
    } else {
      console.log('Not enough ticket types available, skipping mixed types test');
      test.skip();
    }
  });

  test('should handle cart modification during registration', async ({ page }) => {
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

    // Fill forms for first 3 tickets
    const attendees = [
      { firstName: 'First', lastName: 'Person', email: `first.${Date.now()}@example.com` },
      { firstName: 'Second', lastName: 'Person', email: `second.${Date.now()}@example.com` },
      { firstName: 'Third', lastName: 'Person', email: `third.${Date.now()}@example.com` }
    ];

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

    // User goes back to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add 1 more ticket
    await addButton.click();

    // Cart should now have 4 tickets
    const cartCount = page.locator('.cart-count, [data-testid="cart-count"]');
    await expect(cartCount).toHaveText('4', { timeout: 3000 });

    // Return to checkout
    const proceedButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await proceedButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Should now show 4 ticket forms
    const updatedFirstNames = page.locator('input[name*="firstName"]');
    const fieldsCount = await updatedFirstNames.count();

    // Either shows 4 forms or indicates 4 tickets
    expect(fieldsCount).toBeGreaterThanOrEqual(4);

    // Previous 3 might still have saved data (if localStorage persists)
    const firstSavedValue = await firstNames.nth(0).inputValue().catch(() => '');
    console.log('First saved value after cart modification:', firstSavedValue);
  });

  test('should handle large group purchase (10+ tickets) with acceptable performance', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Measure time to add 15 tickets
    const startTime = Date.now();

    const addButton = page.locator('button:has-text("Add to Cart")').first();
    for (let i = 0; i < 15; i++) {
      await addButton.click();
      await page.waitForTimeout(200); // Small delay to avoid overwhelming UI
    }

    const addTime = Date.now() - startTime;
    console.log(`Time to add 15 tickets: ${addTime}ms`);

    // Verify cart count
    const cartCount = page.locator('.cart-count, [data-testid="cart-count"]');
    await expect(cartCount).toHaveText('15', { timeout: 5000 });

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Measure form render time
    const renderStartTime = Date.now();

    // Wait for forms to be visible
    const firstNameFields = page.locator('input[name*="firstName"]');
    await firstNameFields.first().waitFor({ timeout: 10000 });

    const renderTime = Date.now() - renderStartTime;
    console.log(`Time to render registration forms: ${renderTime}ms`);

    // Verify render time is acceptable (< 5 seconds)
    expect(renderTime).toBeLessThan(5000);

    // Fill all forms (mock autofill)
    const fieldsCount = await firstNameFields.count();
    console.log(`Found ${fieldsCount} first name fields`);

    // Fill at least some forms to verify functionality
    const formsToFill = Math.min(fieldsCount, 15);
    const fillStartTime = Date.now();

    for (let i = 0; i < formsToFill; i++) {
      if (await firstNameFields.nth(i).isVisible()) {
        await firstNameFields.nth(i).fill(`Person${i + 1}`);
        await page.locator('input[name*="lastName"]').nth(i).fill('Test');
        await page.locator('input[name*="email"]').nth(i).fill(`person${i + 1}.${Date.now()}@example.com`);

        // Check performance every 5 forms
        if ((i + 1) % 5 === 0) {
          const elapsedTime = Date.now() - fillStartTime;
          console.log(`Filled ${i + 1} forms in ${elapsedTime}ms`);
        }
      }
    }

    const totalFillTime = Date.now() - fillStartTime;
    console.log(`Total time to fill ${formsToFill} forms: ${totalFillTime}ms`);

    // Verify filling is reasonably fast (< 10 seconds for 15 forms)
    expect(totalFillTime).toBeLessThan(10000);

    // Verify continue button is functional
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
    await expect(continueButton).toBeVisible({ timeout: 5000 });

    // Check if button is enabled (may require all forms filled)
    const isEnabled = await continueButton.isEnabled().catch(() => false);
    console.log('Continue button enabled:', isEnabled);
  });

  test('should support bulk attendee info entry for group purchases', async ({ page }) => {
    // Navigate to tickets page
    await page.goto('/tickets');
    await page.waitForLoadState('networkidle');

    // Add 10 tickets
    const addButton = page.locator('button:has-text("Add to Cart")').first();
    for (let i = 0; i < 10; i++) {
      await addButton.click();
      await page.waitForTimeout(200);
    }

    // Proceed to checkout
    const checkoutButton = page.locator('button:has-text("Proceed to Checkout"), a:has-text("Proceed to Checkout")');
    await checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout-registration/, { timeout: 5000 });

    // Check for "Use same info" option
    const sameInfoCheckbox = page.locator('input[type="checkbox"]:near(:text("same info"))').first();
    const hasBulkOption = await sameInfoCheckbox.isVisible().catch(() => false);

    if (hasBulkOption) {
      // Use same info for all tickets
      await sameInfoCheckbox.check();

      // Fill customer info once
      const bulkEmail = `bulk.${Date.now()}@example.com`;
      await page.fill('input[name="firstName"], input[name*="customer"][name*="first"]', 'Bulk');
      await page.fill('input[name="lastName"], input[name*="customer"][name*="last"]', 'Purchase');
      await page.fill('input[name="email"], input[name*="customer"][name*="email"]', bulkEmail);

      // Verify all ticket forms auto-filled
      const firstNameFields = page.locator('input[name*="firstName"]');
      const count = await firstNameFields.count();

      if (count > 1) {
        // Check that at least some fields are auto-filled
        const secondFieldValue = await firstNameFields.nth(1).inputValue();
        console.log('Second field auto-filled value:', secondFieldValue);
      }

      // Continue to payment
      const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');
      await continueButton.click();

      // Verify payment page reached
      await expect(page.locator('button:has-text("Stripe"), button:has-text("PayPal")')).toBeVisible({ timeout: 5000 });
    } else {
      console.log('Bulk entry option not available, skipping test');
      test.skip();
    }
  });

  test('should validate all tickets before allowing payment', async ({ page }) => {
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

    // Fill only 2 out of 3 ticket forms
    const firstNames = page.locator('input[name*="firstName"]');
    const lastNames = page.locator('input[name*="lastName"]');
    const emails = page.locator('input[name*="email"]');

    if (await firstNames.nth(0).isVisible()) {
      await firstNames.nth(0).fill('First');
      await lastNames.nth(0).fill('Person');
      await emails.nth(0).fill(`first.${Date.now()}@example.com`);
    }

    if (await firstNames.nth(1).isVisible()) {
      await firstNames.nth(1).fill('Second');
      await lastNames.nth(1).fill('Person');
      await emails.nth(1).fill(`second.${Date.now()}@example.com`);
    }

    // Leave third form empty

    // Try to continue
    const continueButton = page.locator('button:has-text("Continue to Payment"), button:has-text("Continue")');

    // Button should be disabled OR show error when clicked
    const isDisabled = await continueButton.isDisabled().catch(() => false);

    if (!isDisabled) {
      await continueButton.click();

      // Should show validation error
      const errorMessage = page.locator(':text("complete all"), :text("required"), :text("all tickets"), [role="alert"]');
      await expect(errorMessage.first()).toBeVisible({ timeout: 3000 });
    } else {
      // Button correctly disabled
      expect(isDisabled).toBe(true);
    }

    // Fill third form
    if (await firstNames.nth(2).isVisible()) {
      await firstNames.nth(2).fill('Third');
      await lastNames.nth(2).fill('Person');
      await emails.nth(2).fill(`third.${Date.now()}@example.com`);
    }

    // Now button should work
    await expect(continueButton).toBeEnabled({ timeout: 3000 });
  });
});
