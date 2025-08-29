/**
 * Simple Ticket Purchase E2E Test
 * Direct Playwright APIs only - no helpers needed
 */

import { test, expect } from '@playwright/test';

test.describe('Ticket Purchase', () => {
  test('can view ticket options', async ({ page }) => {
    await page.goto('/tickets');
    
    // Check page loaded
    await expect(page.locator('h1')).toContainText(/ticket/i);
    
    // Check ticket options are visible
    const ticketCards = page.locator('.ticket-card, .ticket-option, [data-ticket-type]');
    await expect(ticketCards.first()).toBeVisible();
    
    // Check prices are shown
    const prices = page.locator('.ticket-price, .price');
    await expect(prices.first()).toBeVisible();
    
    console.log('✅ Ticket options displayed');
  });

  test('can add ticket to cart', async ({ page }) => {
    await page.goto('/tickets');
    
    // Find and click first add to cart button
    const addButton = page.locator('button:has-text("Add"), .add-to-cart').first();
    await expect(addButton).toBeVisible();
    await addButton.click();
    
    // Check cart appears or updates
    const cart = page.locator('.floating-cart, .cart, [data-testid="cart"]').first();
    await expect(cart).toBeVisible();
    
    console.log('✅ Ticket added to cart');
  });

  test('can proceed to checkout with mocked payment', async ({ page }) => {
    // Mock the Stripe API to avoid external dependency
    await page.route('**/api/payments/create-checkout-session', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: 'test_session_123',
          url: '/checkout-success?session=test_session_123'
        })
      });
    });

    await page.goto('/tickets');
    
    // Add ticket to cart
    const addButton = page.locator('button:has-text("Add"), .add-to-cart').first();
    await addButton.click();
    
    // Find and click checkout button
    const checkoutButton = page.locator('button:has-text("Checkout"), .checkout-button').first();
    await expect(checkoutButton).toBeVisible();
    await checkoutButton.click();
    
    // Should navigate to checkout or show checkout form
    await page.waitForURL(/checkout|payment/, { timeout: 5000 }).catch(() => {
      // If no navigation, check for checkout form on same page
      return expect(page.locator('form, .checkout-form')).toBeVisible();
    });
    
    console.log('✅ Checkout process initiated');
  });

  test('shows success message after purchase', async ({ page }) => {
    // Mock successful payment webhook
    await page.route('**/api/payments/stripe-webhook', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ received: true })
      });
    });

    // Navigate to success page directly (simulating redirect from Stripe)
    await page.goto('/checkout-success?session_id=test_123');
    
    // Check for success indicators
    const successIndicators = [
      page.locator('text=/success|confirmed|thank you/i'),
      page.locator('.success-message'),
      page.locator('[data-testid="success"]')
    ];
    
    // At least one success indicator should be visible
    let foundSuccess = false;
    for (const indicator of successIndicators) {
      if (await indicator.isVisible().catch(() => false)) {
        foundSuccess = true;
        break;
      }
    }
    
    expect(foundSuccess).toBe(true);
    console.log('✅ Purchase success page shown');
  });
});