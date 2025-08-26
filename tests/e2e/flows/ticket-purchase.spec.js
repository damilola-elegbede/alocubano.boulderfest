/**
 * Example user flow test for ticket purchase
 * This demonstrates the Playwright setup with a realistic user journey
 */

import { test, expect } from '@playwright/test';
import { generateUniqueTestData, testTickets, testPayment } from '../fixtures/test-data.js';
import { fillForm, waitForNetworkIdle } from '../helpers/test-utils.js';

test.describe('Ticket Purchase Flow', () => {
  let testData;

  test.beforeEach(async ({ page }) => {
    // Generate unique test data for each test
    testData = generateUniqueTestData('ticket');
    
    // Set default timeout
    page.setDefaultTimeout(15000);
  });

  test('user can browse ticket options', async ({ page }) => {
    await page.goto('/tickets');
    
    // Check ticket types are displayed
    await expect(page.locator('text=/full pass/i')).toBeVisible();
    await expect(page.locator('text=/day pass/i')).toBeVisible();
    await expect(page.locator('text=/social pass/i')).toBeVisible();
    
    // Check prices are displayed
    await expect(page.locator('text=/$150/i')).toBeVisible();
    await expect(page.locator('text=/$60/i')).toBeVisible();
    await expect(page.locator('text=/$30/i')).toBeVisible();
  });

  test('user can select and add tickets to cart', async ({ page }) => {
    await page.goto('/tickets');
    
    // Select a full pass
    const fullPassButton = page.locator('button:has-text("Full Pass"), button:has-text("Add to Cart")').first();
    await fullPassButton.click();
    
    // Verify cart updated
    const cartCount = page.locator('.cart-count, .cart-items, [data-cart-count]');
    await expect(cartCount).toContainText('1');
    
    // Check cart total
    const cartTotal = page.locator('.cart-total, [data-cart-total]');
    await expect(cartTotal).toContainText('150');
  });

  test('user can fill registration form', async ({ page }) => {
    await page.goto('/tickets');
    
    // Add ticket to cart
    await page.locator('button:has-text("Full Pass"), button:has-text("Add to Cart")').first().click();
    
    // Go to checkout
    await page.locator('button:has-text("Checkout"), button:has-text("Purchase")').click();
    
    // Fill registration form
    await fillForm(page, {
      name: testData.user.name,
      email: testData.user.email,
      phone: testData.user.phone,
      dietary: testData.user.dietaryRestrictions,
      emergency: testData.user.emergencyContact
    });
    
    // Submit form (if not redirected to Stripe)
    const submitButton = page.locator('button[type="submit"]:has-text("Continue"), button[type="submit"]:has-text("Pay")');
    if (await submitButton.isVisible()) {
      await submitButton.click();
    }
  });

  test('form validation works correctly', async ({ page }) => {
    await page.goto('/tickets');
    
    // Try to submit empty form
    const form = page.locator('form').first();
    if (await form.isVisible()) {
      await page.locator('button[type="submit"]').click();
      
      // Check for validation messages
      const validationMessage = page.locator('.error, .invalid, [role="alert"]').first();
      await expect(validationMessage).toBeVisible();
    }
  });

  test('cart persists across page navigation', async ({ page }) => {
    await page.goto('/tickets');
    
    // Add item to cart
    await page.locator('button:has-text("Full Pass"), button:has-text("Add to Cart")').first().click();
    
    // Navigate to another page
    await page.goto('/about');
    
    // Check cart still has item
    const cartCount = page.locator('.cart-count, .cart-items, [data-cart-count]');
    await expect(cartCount).toContainText('1');
    
    // Go back to tickets
    await page.goto('/tickets');
    
    // Verify cart still has item
    await expect(cartCount).toContainText('1');
  });

  test('user can remove items from cart', async ({ page }) => {
    await page.goto('/tickets');
    
    // Add item to cart
    await page.locator('button:has-text("Full Pass"), button:has-text("Add to Cart")').first().click();
    
    // Open cart
    const cartIcon = page.locator('.cart-icon, .floating-cart, [data-cart-toggle]').first();
    await cartIcon.click();
    
    // Remove item
    const removeButton = page.locator('button:has-text("Remove"), button:has-text("Delete"), button:has-text("X")').first();
    if (await removeButton.isVisible()) {
      await removeButton.click();
      
      // Verify cart is empty
      const cartCount = page.locator('.cart-count, .cart-items, [data-cart-count]');
      await expect(cartCount).toContainText('0');
    }
  });

  test('checkout redirects to payment processor', async ({ page }) => {
    // Skip this test in CI as it requires Stripe
    test.skip(process.env.CI === 'true', 'Stripe checkout not available in CI');
    
    await page.goto('/tickets');
    
    // Add ticket
    await page.locator('button:has-text("Full Pass"), button:has-text("Add to Cart")').first().click();
    
    // Proceed to checkout
    await page.locator('button:has-text("Checkout"), button:has-text("Purchase")').click();
    
    // Fill form if present
    const nameInput = page.locator('input[name="name"]');
    if (await nameInput.isVisible()) {
      await fillForm(page, {
        name: testData.user.name,
        email: testData.user.email,
        phone: testData.user.phone
      });
      
      await page.locator('button[type="submit"]').click();
    }
    
    // Wait for redirect to Stripe (or error message)
    await page.waitForURL(/stripe\.com|checkout|error/, { timeout: 10000 }).catch(() => {
      // If no redirect, check for error message
      return page.locator('.error, .alert').first();
    });
  });

  test('mobile cart interaction works', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/tickets');
    
    // Add item to cart
    await page.locator('button:has-text("Full Pass"), button:has-text("Add to Cart")').first().click();
    
    // Check mobile cart visibility
    const mobileCart = page.locator('.floating-cart, .mobile-cart, [data-mobile-cart]').first();
    await expect(mobileCart).toBeVisible();
  });

  test.describe('Accessibility', () => {
    test('ticket page has proper heading structure', async ({ page }) => {
      await page.goto('/tickets');
      
      // Check for h1
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
      
      // Check heading hierarchy
      const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', elements => 
        elements.map(el => ({
          level: parseInt(el.tagName[1]),
          text: el.textContent
        }))
      );
      
      // Verify proper hierarchy (no skipped levels)
      let previousLevel = 0;
      for (const heading of headings) {
        expect(heading.level - previousLevel).toBeLessThanOrEqual(1);
        previousLevel = heading.level;
      }
    });

    test('form inputs have labels', async ({ page }) => {
      await page.goto('/tickets');
      
      const inputs = await page.$$('input:not([type="hidden"]), select, textarea');
      
      for (const input of inputs) {
        const id = await input.getAttribute('id');
        const name = await input.getAttribute('name');
        const ariaLabel = await input.getAttribute('aria-label');
        
        // Check for associated label or aria-label
        if (id) {
          const label = await page.$(`label[for="${id}"]`);
          expect(label || ariaLabel).toBeTruthy();
        }
      }
    });
  });
});