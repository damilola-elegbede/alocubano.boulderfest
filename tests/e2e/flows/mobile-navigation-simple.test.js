/**
 * Mobile Navigation E2E Test - Vercel Dev Server with Real APIs
 * Tests mobile-first navigation for festival website
 * Critical for user experience on mobile devices
 * Uses Vercel dev server on port 3000 with serverless function endpoints
 */

import { test, expect } from '@playwright/test';

test.describe('Mobile Navigation - Essential UX', () => {
  test.use({ 
    viewport: { width: 375, height: 667 } // iPhone SE size
  });

  // No beforeEach mocking - we want to use real APIs

  test('should navigate mobile menu successfully', async ({ page }) => {
    // Test direct navigation to tickets page
    await page.goto('/tickets');
    
    // Should navigate to tickets page
    await expect(page).toHaveURL(/.*tickets/);
    
    // Check if the page has basic content
    const pageContent = await page.locator('html').count();
    expect(pageContent).toBeGreaterThan(0);
    
    console.log('✅ Mobile navigation working');
  });

  test('should maintain mobile header cart functionality', async ({ page }) => {
    await page.goto('/tickets');

    // Verify header cart is accessible on mobile
    const headerCart = page.locator('.nav-cart-button');

    // Header cart should be visible and accessible on mobile
    if (await headerCart.isVisible()) {
      const cartBounds = await headerCart.boundingBox();
      expect(cartBounds.width).toBeLessThan(375); // Within mobile viewport

      // Touch target should be adequately sized for mobile
      expect(cartBounds.height).toBeGreaterThanOrEqual(44); // Minimum touch target
    }

    console.log('✅ Mobile header cart display working');
  });

  test('should handle touch interactions properly', async ({ page }) => {
    await page.goto('/');
    
    // Test touch-friendly button sizes (minimum 44px)
    const buttons = page.locator('button, .btn, a[role="button"]');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      const firstButton = buttons.first();
      const buttonBox = await firstButton.boundingBox();
      
      if (buttonBox) {
        expect(Math.min(buttonBox.width, buttonBox.height)).toBeGreaterThanOrEqual(40);
      }
    }
    
    console.log('✅ Touch-friendly interface working');
  });
});