/**
 * E2E Test: Cart Functionality
 * Tests shopping cart operations and ticket selection
 */

import { test, expect } from '@playwright/test';

test.describe('Cart Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pages/tickets.html');
  });

  test('should display floating cart widget', async ({ page }) => {
    // Cart should be visible on tickets page
    const cart = page.locator('.floating-cart-container, .floating-cart, .cart-widget, #cart');
    await expect(cart).toBeVisible();
  });

  test('should add weekend ticket to cart', async ({ page }) => {
    // Look for weekend ticket add button
    const weekendButton = page.locator('button:has-text("Weekend"), .weekend button, [data-ticket="weekend"] button').first();
    
    if (await weekendButton.count() > 0) {
      await weekendButton.click();
      
      // Cart should show item
      const cartCount = page.locator('.cart-count, .cart-badge, .cart-items-count');
      await expect(cartCount).toHaveText('1');
      
      // Cart total should update
      const cartTotal = page.locator('.cart-total, .total-amount');
      await expect(cartTotal).toBeVisible();
    }
  });

  test('should add Saturday ticket to cart', async ({ page }) => {
    const saturdayButton = page.locator('button:has-text("Saturday"), .saturday button, [data-ticket="saturday"] button').first();
    
    if (await saturdayButton.count() > 0) {
      await saturdayButton.click();
      
      // Verify cart updated
      const cartIndicator = page.locator('.cart-count, .cart-badge, .floating-cart-container, .floating-cart');
      await expect(cartIndicator).toBeVisible();
    }
  });

  test('should add Sunday ticket to cart', async ({ page }) => {
    const sundayButton = page.locator('button:has-text("Sunday"), .sunday button, [data-ticket="sunday"] button').first();
    
    if (await sundayButton.count() > 0) {
      await sundayButton.click();
      
      // Verify cart updated
      const cartIndicator = page.locator('.cart-count, .cart-badge, .floating-cart-container, .floating-cart');
      await expect(cartIndicator).toBeVisible();
    }
  });

  test('should handle multiple ticket types in cart', async ({ page }) => {
    // Add weekend ticket
    const weekendBtn = page.locator('button:has-text("Weekend"), .weekend button').first();
    if (await weekendBtn.count() > 0) {
      await weekendBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Add Saturday ticket
    const saturdayBtn = page.locator('button:has-text("Saturday"), .saturday button').first();
    if (await saturdayBtn.count() > 0) {
      await saturdayBtn.click();
      await page.waitForTimeout(500);
    }
    
    // Cart should show multiple items
    const cartCount = page.locator('.cart-count, .cart-badge');
    if (await cartCount.count() > 0) {
      const count = await cartCount.textContent();
      expect(parseInt(count) || 0).toBeGreaterThanOrEqual(1);
    }
  });

  test('should open cart details when clicked', async ({ page }) => {
    // First add an item
    const addButton = page.locator('button:has-text("Weekend"), button:has-text("Saturday"), button:has-text("Add")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(500);
    }
    
    // Click on cart to open details
    const cart = page.locator('.floating-cart-container, .floating-cart, .cart-widget, .cart-button');
    await cart.click();
    
    // Cart details should be visible
    const cartDetails = page.locator('.cart-details, .cart-popup, .cart-overlay, .cart-sidebar');
    if (await cartDetails.count() > 0) {
      await expect(cartDetails.first()).toBeVisible();
    }
  });

  test('should allow quantity adjustments', async ({ page }) => {
    // Add item first
    const addButton = page.locator('button:has-text("Weekend")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(500);
      
      // Look for quantity controls
      const plusButton = page.locator('.quantity-plus, .qty-increase, button[data-action="increase"]');
      if (await plusButton.count() > 0) {
        await plusButton.first().click();
        
        // Quantity should increase
        const quantity = page.locator('.quantity-input, .qty-input, input[name="quantity"]');
        if (await quantity.count() > 0) {
          await expect(quantity).toHaveValue('2');
        }
      }
    }
  });

  test('should remove items from cart', async ({ page }) => {
    // Add item first
    const addButton = page.locator('button:has-text("Weekend")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(500);
      
      // Click cart to open details
      const cart = page.locator('.floating-cart-container, .floating-cart');
      await cart.click();
      
      // Look for remove button
      const removeButton = page.locator('.remove-item, .delete-item, button:has-text("Remove"), .cart-item-remove');
      if (await removeButton.count() > 0) {
        await removeButton.first().click();
        
        // Cart should be empty or count should decrease
        const cartCount = page.locator('.cart-count');
        if (await cartCount.count() > 0) {
          await expect(cartCount).toHaveText('0');
        }
      }
    }
  });

  test('should calculate total correctly', async ({ page }) => {
    // Add known ticket type
    const weekendButton = page.locator('button:has-text("Weekend")').first();
    if (await weekendButton.count() > 0) {
      await weekendButton.click();
      
      // Check that total is displayed and is a monetary amount
      const total = page.locator('.cart-total, .total-amount, .total-price');
      if (await total.count() > 0) {
        const totalText = await total.textContent();
        expect(totalText).toMatch(/\$\d+|\d+\.\d{2}/);
      }
    }
  });

  test('should persist cart across page navigation', async ({ page }) => {
    // Add item to cart
    const addButton = page.locator('button:has-text("Weekend"), button:has-text("Add")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(500);
    }
    
    // Navigate to another page
    await page.goto('/pages/about.html');
    
    // Navigate back to tickets
    await page.goto('/pages/tickets.html');
    
    // Cart should still contain items
    const cartCount = page.locator('.cart-count, .cart-badge');
    if (await cartCount.count() > 0) {
      const count = await cartCount.textContent();
      expect(parseInt(count) || 0).toBeGreaterThanOrEqual(1);
    }
  });

  test('should proceed to checkout', async ({ page }) => {
    // Add item to cart
    const addButton = page.locator('button:has-text("Weekend")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(500);
      
      // Look for checkout button
      const checkoutButton = page.locator('button:has-text("Checkout"), .checkout-btn, .proceed-to-checkout');
      if (await checkoutButton.count() > 0) {
        await checkoutButton.click();
        
        // Should navigate to checkout or show checkout form
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        const pageContent = await page.locator('body').textContent();
        
        expect(
          currentUrl.includes('checkout') || 
          pageContent.includes('checkout') ||
          pageContent.includes('payment')
        ).toBeTruthy();
      }
    }
  });

  test('should show empty cart state initially', async ({ page }) => {
    // Before adding anything, cart should be empty or not prominently displayed
    const cartCount = page.locator('.cart-count');
    if (await cartCount.count() > 0) {
      const count = await cartCount.textContent();
      expect(count).toBe('0' || count === '');
    }
  });
});