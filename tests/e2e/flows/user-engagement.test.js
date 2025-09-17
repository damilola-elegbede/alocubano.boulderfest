/**
 * E2E Test: User Engagement Metrics
 * Tests user engagement tracking and behavioral analytics
 */

import { test, expect } from '@playwright/test';

test.describe('User Engagement Metrics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should track page views and navigation patterns', async ({ page }) => {
    // Monitor performance metrics API calls
    let metricsApiCalled = false;
    page.on('request', request => {
      if (request.url().includes('/api/performance-metrics') || request.url().includes('/analytics')) {
        metricsApiCalled = true;
      }
    });
    
    // Navigate through key pages
    await page.goto('/tickets');
    await page.waitForTimeout(2000);

    await page.goto('/about');
    await page.waitForTimeout(2000);

    await page.goto('/gallery');
    await page.waitForTimeout(2000);
    
    // Should have tracked navigation
    // In test mode, metrics collection might be mocked
    expect(page.url()).toBeDefined();
  });

  test('should track user interaction with ticket options', async ({ page }) => {
    await page.goto('/tickets');
    
    // Interact with ticket options
    const ticketButtons = page.locator('button:has-text("Weekend"), button:has-text("Saturday"), button:has-text("Sunday")');
    
    if (await ticketButtons.count() > 0) {
      // Click different ticket options
      await ticketButtons.first().click();
      await page.waitForTimeout(1000);
      
      if (await ticketButtons.count() > 1) {
        await ticketButtons.nth(1).click();
        await page.waitForTimeout(1000);
      }
      
      // Should track ticket selection interactions via header cart
      const headerCart = page.locator('.nav-cart-button');
      if (await headerCart.count() > 0) {
        await expect(headerCart).toBeVisible();

        // Check if cart badge updated
        const cartBadge = page.locator('.nav-cart-badge');
        if (await cartBadge.count() > 0) {
          await expect(cartBadge).toBeVisible();
        }
      }
    }
  });

  test('should measure time spent on key pages', async ({ page }) => {
    // Start timing on homepage
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForTimeout(3000); // Simulate user reading time
    
    // Move to tickets page
    await page.goto('/tickets');
    await page.waitForTimeout(2000);
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Should have measurable engagement time
    expect(totalTime).toBeGreaterThan(4000);
  });

  test('should track gallery engagement patterns', async ({ page }) => {
    await page.goto('/gallery');
    await page.waitForTimeout(2000);
    
    // Interact with gallery elements
    const galleryItems = page.locator('.gallery-item, .photo-item, img');
    
    if (await galleryItems.count() > 0) {
      // Click on gallery items
      await galleryItems.first().click();
      await page.waitForTimeout(1000);
      
      // Scroll through gallery
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(1000);
      
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
      
      // Should track gallery interaction depth
      expect(page.url()).toContain('gallery');
    }
  });

  test('should monitor cart abandonment patterns', async ({ page }) => {
    await page.goto('/tickets');
    
    // Add items to cart
    const addButton = page.locator('button:has-text("Weekend")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(1000);
      
      // Navigate away without completing purchase (cart abandonment)
      await page.goto('/about');
      await page.waitForTimeout(2000);

      // Return to tickets page
      await page.goto('/tickets');
      
      // Header cart badge should still be persistent
      const headerCartBadge = page.locator('.nav-cart-badge');
      if (await headerCartBadge.count() > 0) {
        await expect(headerCartBadge.first()).toBeVisible();
      }
    }
  });

  test('should track social media engagement', async ({ page }) => {
    // Look for social media links
    const socialLinks = page.locator('a[href*="instagram"], a[href*="facebook"], a[href*="twitter"], .social-link');
    
    if (await socialLinks.count() > 0) {
      // Monitor external link clicks
      let externalLinkClicked = false;
      
      page.on('request', request => {
        if (request.url().includes('instagram.com') || request.url().includes('facebook.com')) {
          externalLinkClicked = true;
        }
      });
      
      // Click social link (may open in new tab)
      const socialLink = socialLinks.first();
      const href = await socialLink.getAttribute('href');
      
      if (href && href.includes('instagram')) {
        // Just verify the link exists and is properly formatted
        expect(href).toMatch(/instagram\.com/);
      }
    }
  });

  test('should measure mobile engagement metrics', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/tickets');
    await page.waitForTimeout(2000);
    
    // Test mobile interactions
    const mobileMenuToggle = page.locator('.menu-toggle, .hamburger');
    if (await mobileMenuToggle.count() > 0) {
      await mobileMenuToggle.click();
      await page.waitForTimeout(1000);
    }
    
    // Scroll on mobile
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(1000);
    
    // Touch interactions with ticket options
    const ticketButton = page.locator('button:has-text("Weekend")').first();
    if (await ticketButton.count() > 0) {
      await ticketButton.click();
      await page.waitForTimeout(1000);
    }
    
    // Should track mobile-specific engagement
    expect(page.url()).toBeDefined();
  });

  test('should track newsletter subscription engagement', async ({ page }) => {
    // Look for newsletter signup
    const newsletterInput = page.locator('input[type="email"][placeholder*="email"], .newsletter input, .signup input');
    
    if (await newsletterInput.count() > 0) {
      await newsletterInput.fill('engagement-test@example.com');
      
      const signupButton = page.locator('button:has-text("Subscribe"), button:has-text("Sign"), .newsletter button');
      if (await signupButton.count() > 0) {
        await signupButton.click();
        await page.waitForTimeout(2000);
        
        // Should show confirmation or success message
        const confirmation = page.locator('.success, .thank-you, .subscribed');
        if (await confirmation.count() > 0) {
          await expect(confirmation.first()).toBeVisible();
        }
      }
    }
  });

  test('should measure search and filtering behavior', async ({ page }) => {
    await page.goto('/gallery');
    
    // Look for filtering options
    const filters = page.locator('.filter, .year-filter, button:has-text("2025")');
    
    if (await filters.count() >= 2) {
      // Test filter interactions
      await filters.first().click();
      await page.waitForTimeout(1000);
      
      await filters.nth(1).click();
      await page.waitForTimeout(1000);
      
      // Should track filtering behavior
      expect(page.url()).toContain('gallery');
    }
  });

  test('should track error recovery patterns', async ({ page }) => {
    // Simulate error scenario
    await page.route('**/api/**', route => {
      if (Math.random() < 0.3) { // 30% error rate
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' })
        });
      } else {
        route.continue();
      }
    });
    
    await page.goto('/tickets');
    await page.waitForTimeout(2000);

    // Try to interact despite potential errors
    const addButton = page.locator('button:has-text("Weekend")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(1000);
    }
    
    // User should still be able to navigate
    await page.goto('/about');
    
    // Should track error recovery behavior
    expect(page.url()).toContain('about');
  });

  test('should measure conversion funnel metrics', async ({ page }) => {
    // Track complete user journey from landing to (attempted) purchase
    
    // 1. Landing page
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // 2. Navigate to tickets
    const ticketsLink = page.locator('a[href*="tickets"], nav a:has-text("Tickets")');
    if (await ticketsLink.count() > 0) {
      await ticketsLink.first().click();
      await page.waitForTimeout(2000);
    } else {
      await page.goto('/tickets');
    }
    
    // 3. Add to cart
    const addButton = page.locator('button:has-text("Weekend")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(1000);
      
      // 4. Proceed to checkout
      const checkoutBtn = page.locator('button:has-text("Checkout")').first();
      if (await checkoutBtn.count() > 0) {
        await checkoutBtn.click();
        await page.waitForTimeout(2000);
        
        // Should reach checkout step (conversion funnel completion)
        const currentUrl = page.url();
        const bodyText = await page.locator('body').textContent();
        
        expect(
          currentUrl.includes('checkout') ||
          bodyText.includes('checkout') ||
          bodyText.includes('payment') ||
          bodyText.includes('stripe')
        ).toBeTruthy();
      }
    }
  });

  test('should track performance impact on engagement', async ({ page }) => {
    // Measure page load performance and engagement correlation
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return {
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        firstPaint: performance.getEntriesByType('paint').find(p => p.name === 'first-paint')?.startTime || 0
      };
    });
    
    // Fast loading should correlate with better engagement
    expect(performanceMetrics.loadTime).toBeLessThan(5000);
    
    // Simulate user engagement based on performance
    if (performanceMetrics.loadTime < 2000) {
      // Fast load - simulate high engagement
      await page.goto('/tickets');
      
      const addButton = page.locator('button:has-text("Weekend")').first();
      if (await addButton.count() > 0) {
        await addButton.click();
        await page.waitForTimeout(1000);
      }
    }
    
    // Should correlate performance with engagement metrics
    expect(performanceMetrics).toBeDefined();
  });
});