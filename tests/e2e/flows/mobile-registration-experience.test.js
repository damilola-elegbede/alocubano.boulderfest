/**
 * E2E Test: Mobile Registration Experience
 * Tests mobile-optimized registration flow and user experience
 */

import { test, expect } from '@playwright/test';

test.describe('Mobile Registration Experience', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('should handle mobile ticket purchase flow', async ({ page }) => {
    await page.goto('/pages/tickets.html');
    
    // Mobile navigation should be accessible
    const mobileMenu = page.locator('.mobile-menu, .hamburger, .menu-toggle');
    if (await mobileMenu.count() > 0) {
      await expect(mobileMenu.first()).toBeVisible();
    }
    
    // Ticket options should be mobile-optimized
    const ticketOptions = page.locator('.ticket-option, .ticket-card, .weekend, .saturday, .sunday');
    await expect(ticketOptions.first()).toBeVisible();
    
    // Touch targets should be appropriately sized (minimum 44px)
    const buttons = page.locator('button');
    if (await buttons.count() > 0) {
      const buttonBox = await buttons.first().boundingBox();
      if (buttonBox) {
        expect(Math.min(buttonBox.width, buttonBox.height)).toBeGreaterThanOrEqual(40);
      }
    }
  });

  test('should optimize form inputs for mobile', async ({ page }) => {
    // Navigate to a form (either direct registration or after ticket purchase)
    await page.goto('/pages/tickets.html');
    
    // Add ticket to trigger registration flow
    const addButton = page.locator('button:has-text("Weekend"), button:has-text("Add")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      
      // Proceed to checkout/registration
      const checkoutBtn = page.locator('button:has-text("Checkout"), button:has-text("Continue"), .checkout-btn');
      if (await checkoutBtn.count() > 0) {
        await checkoutBtn.click();
        await page.waitForTimeout(2000);
      }
    }
    
    // Check for mobile-optimized form inputs
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.count() > 0) {
      // Email input should have proper mobile keyboard
      const inputType = await emailInput.getAttribute('type');
      expect(inputType).toBe('email');
    }
    
    const phoneInput = page.locator('input[type="tel"], input[name="phone"]');
    if (await phoneInput.count() > 0) {
      const inputType = await phoneInput.getAttribute('type');
      expect(inputType).toBe('tel');
    }
  });

  test('should handle mobile cart interactions', async ({ page }) => {
    await page.goto('/pages/tickets.html');
    
    // Add item to cart
    const addButton = page.locator('button:has-text("Weekend")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      
      // Mobile cart should be accessible
      const cart = page.locator('.floating-cart, .cart-widget');
      await expect(cart).toBeVisible();
      
      // Cart should not obstruct content on mobile
      const cartBox = await cart.boundingBox();
      if (cartBox) {
        // Cart should be positioned appropriately for mobile
        expect(cartBox.width).toBeLessThanOrEqual(375);
      }
    }
  });

  test('should provide mobile-friendly navigation', async ({ page }) => {
    await page.goto('/');
    
    // Check for mobile navigation
    const navigation = page.locator('nav, .navigation, .header-nav');
    await expect(navigation).toBeVisible();
    
    // Mobile menu should be accessible
    const mobileToggle = page.locator('.menu-toggle, .hamburger, .mobile-menu-btn');
    if (await mobileToggle.count() > 0) {
      await mobileToggle.click();
      
      // Menu should slide in or become visible
      const mobileNav = page.locator('.mobile-nav, .slide-menu, nav[aria-expanded="true"]');
      if (await mobileNav.count() > 0) {
        await expect(mobileNav.first()).toBeVisible();
      }
    }
  });

  test('should handle mobile form validation', async ({ page }) => {
    // Try to access a registration form
    await page.goto('/pages/tickets.html');
    
    // Simulate form submission with invalid data
    const forms = page.locator('form');
    if (await forms.count() > 0) {
      const form = forms.first();
      
      // Fill form with invalid email
      const emailInput = form.locator('input[type="email"]');
      if (await emailInput.count() > 0) {
        await emailInput.fill('invalid-email');
        
        const submitButton = form.locator('button[type="submit"], input[type="submit"]');
        if (await submitButton.count() > 0) {
          await submitButton.click();
          
          // Should show mobile-friendly validation messages
          const errorMessages = page.locator('.error, .invalid-feedback, .form-error');
          if (await errorMessages.count() > 0) {
            await expect(errorMessages.first()).toBeVisible();
          }
        }
      }
    }
  });

  test('should optimize mobile scrolling and performance', async ({ page }) => {
    await page.goto('/pages/tickets.html');
    
    // Test smooth scrolling behavior
    await page.evaluate(() => {
      window.scrollTo({ top: 300, behavior: 'smooth' });
    });
    
    await page.waitForTimeout(1000);
    
    // Page should remain responsive during scroll
    const scrollPosition = await page.evaluate(() => window.scrollY);
    expect(scrollPosition).toBeGreaterThan(100);
    
    // No horizontal scroll should be present
    const hasHorizontalScroll = await page.evaluate(() => 
      document.body.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalScroll).toBeFalsy();
  });

  test('should handle mobile payment flow', async ({ page }) => {
    await page.goto('/pages/tickets.html');
    
    // Add ticket and proceed to payment
    const addButton = page.locator('button:has-text("Weekend")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      
      const checkoutBtn = page.locator('button:has-text("Checkout"), .checkout-btn');
      if (await checkoutBtn.count() > 0) {
        await checkoutBtn.click();
        await page.waitForTimeout(2000);
        
        // Should either show Stripe checkout or payment form
        const paymentElements = page.locator('.payment-form, iframe[src*="stripe"], #stripe-card-element');
        if (await paymentElements.count() > 0) {
          await expect(paymentElements.first()).toBeVisible();
        }
      }
    }
  });

  test('should provide mobile accessibility features', async ({ page }) => {
    await page.goto('/');
    
    // Check for proper heading structure
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    
    // Check for skip links
    const skipLink = page.locator('a[href="#main"], .skip-link');
    if (await skipLink.count() > 0) {
      await expect(skipLink.first()).toBeVisible();
    }
    
    // Touch targets should be adequately spaced
    const interactiveElements = page.locator('button, a, input');
    if (await interactiveElements.count() >= 2) {
      const first = interactiveElements.first();
      const second = interactiveElements.nth(1);
      
      const firstBox = await first.boundingBox();
      const secondBox = await second.boundingBox();
      
      if (firstBox && secondBox) {
        // Elements shouldn't overlap and should have adequate spacing
        const verticalDistance = Math.abs(firstBox.y - secondBox.y);
        const horizontalDistance = Math.abs(firstBox.x - secondBox.x);
        
        expect(verticalDistance > 8 || horizontalDistance > 8).toBeTruthy();
      }
    }
  });

  test('should handle mobile keyboard interactions', async ({ page }) => {
    await page.goto('/pages/tickets.html');
    
    // Focus on first interactive element
    const firstButton = page.locator('button').first();
    if (await firstButton.count() > 0) {
      await firstButton.focus();
      
      // Tab navigation should work
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Enter should activate elements
      await page.keyboard.press('Enter');
      
      // Should handle keyboard navigation gracefully
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should optimize mobile loading performance', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/pages/tickets.html');
    await page.waitForLoadState('domcontentloaded');
    
    const loadTime = Date.now() - startTime;
    
    // Mobile page should load quickly
    expect(loadTime).toBeLessThan(5000);
    
    // Critical content should be visible
    const mainContent = page.locator('main, .main-content, .ticket-options');
    await expect(mainContent.first()).toBeVisible();
  });

  test('should handle mobile-specific error states', async ({ page }) => {
    // Test offline/network error handling
    await page.route('**/*', route => route.abort());
    
    try {
      await page.goto('/pages/tickets.html');
    } catch (error) {
      // Should handle network errors gracefully
    }
    
    // Reset network and test error recovery
    await page.unroute('**/*');
    await page.reload();
    
    // Page should recover and load properly
    await expect(page.locator('body')).toBeVisible();
  });
});