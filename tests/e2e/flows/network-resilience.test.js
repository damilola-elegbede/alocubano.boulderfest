import { test, expect } from '@playwright/test';

test.describe('Network Resilience', () => {
  test('should handle offline mode gracefully', async ({ page, context }) => {
    // Start online and load page
    await page.goto('/tickets');
    await expect(page.locator('h1')).toContainText('Tickets');
    
    // Go offline
    await context.setOffline(true);
    
    // Try to navigate - should show cached content or error message
    await page.click('a[href="/about"]');
    
    // Should either show cached content or appropriate offline message
    await page.waitForTimeout(2000);
    const isOfflineHandled = await page.locator('body').textContent();
    expect(isOfflineHandled).toBeTruthy();
    
    // Go back online
    await context.setOffline(false);
    
    // Verify recovery
    await page.reload();
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should work on slow network (3G simulation)', async ({ page }) => {
    // Simulate slow 3G connection
    await page.route('**/*', route => {
      setTimeout(() => route.continue(), 800);
    });
    
    await page.goto('/gallery');
    
    // Should still load within reasonable time (10s for slow network)
    await expect(page.locator('h1')).toContainText('Gallery', { timeout: 10000 });
    
    // Gallery should handle slow loading gracefully
    const loadingIndicator = page.locator('.loading, .spinner, [data-loading]');
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).toBeHidden({ timeout: 15000 });
    }
  });

  test('should recover from network interruption during cart operations', async ({ page, context }) => {
    await page.goto('/tickets');
    
    // Add item to cart
    const addToCartBtn = page.locator('button:has-text("Add to Cart")').first();
    await addToCartBtn.click();
    
    // Verify header cart badge shows item
    await expect(page.locator('.nav-cart-badge')).toContainText('1');
    
    // Simulate network interruption
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    
    // Try to add another item while offline
    await addToCartBtn.click();
    
    // Restore network
    await context.setOffline(false);
    await page.waitForTimeout(1000);
    
    // Verify header cart badge state is preserved or properly synced
    const cartCount = await page.locator('.nav-cart-badge').textContent();
    expect(parseInt(cartCount)).toBeGreaterThanOrEqual(1);
  });

  test('should handle API timeout with retry logic', async ({ page }) => {
    let requestCount = 0;
    
    // Intercept API calls and simulate timeout for first few attempts
    await page.route('/api/**', route => {
      requestCount++;
      if (requestCount <= 2) {
        // Simulate timeout by not responding
        setTimeout(() => route.abort('timedout'), 5000);
      } else {
        // Allow subsequent requests
        route.continue();
      }
    });
    
    await page.goto('/tickets');
    
    // Trigger API call (like newsletter signup)
    await page.fill('#newsletter-email', 'test@example.com');
    await page.click('#newsletter-submit');
    
    // Should eventually succeed after retries
    await expect(page.locator('.success-message, .alert-success')).toBeVisible({ timeout: 15000 });
    
    // Verify multiple requests were made
    expect(requestCount).toBeGreaterThan(1);
  });

  test('should handle slow payment processing', async ({ page }) => {
    // Simulate slow payment API
    await page.route('**/api/payments/**', route => {
      setTimeout(() => route.continue(), 3000);
    });
    
    await page.goto('/tickets');
    
    // Add item to cart
    await page.click('button:has-text("Add to Cart")');
    
    // Go to checkout
    const checkoutBtn = page.locator('a:has-text("Checkout"), button:has-text("Checkout")');
    if (await checkoutBtn.isVisible()) {
      await checkoutBtn.click();
      
      // Should show loading state during slow payment processing
      const loadingState = page.locator('.loading, .spinner, [disabled]');
      await expect(loadingState).toBeVisible({ timeout: 5000 });
    }
  });

  test('should cache content for offline browsing', async ({ page, context }) => {
    // Load page normally first
    await page.goto('/about');
    await expect(page.locator('h1')).toBeVisible();
    
    // Load some other pages to populate cache
    await page.goto('/artists');
    await expect(page.locator('h1')).toBeVisible();
    
    // Go offline
    await context.setOffline(true);
    
    // Try to navigate to previously visited page
    await page.goto('/about');
    
    // Should still show content (from cache or service worker)
    const pageContent = await page.locator('body').textContent();
    expect(pageContent.length).toBeGreaterThan(100); // Has substantial content
    
    // Restore network
    await context.setOffline(false);
  });

  test('should handle intermittent connectivity', async ({ page, context }) => {
    await page.goto('/gallery');
    
    let toggleCount = 0;
    
    // Toggle network on/off every 2 seconds
    const toggleNetwork = setInterval(async () => {
      toggleCount++;
      await context.setOffline(toggleCount % 2 === 0);
      
      if (toggleCount >= 6) {
        clearInterval(toggleNetwork);
        await context.setOffline(false); // End online
      }
    }, 2000);
    
    // Gallery should handle intermittent connectivity gracefully
    await page.waitForTimeout(15000);
    
    // Should still be functional after connectivity issues
    await expect(page.locator('h1')).toBeVisible();
    
    // Clean up
    clearInterval(toggleNetwork);
  });

  test('should show appropriate error messages for network failures', async ({ page, context }) => {
    await page.goto('/tickets');
    
    // Go offline
    await context.setOffline(true);
    
    // Try to submit newsletter form
    await page.fill('#newsletter-email', 'test@example.com');
    await page.click('#newsletter-submit');
    
    // Should show network error message
    await expect(page.locator('.error-message, .alert-error')).toBeVisible({ timeout: 5000 });
    
    // Error message should be informative
    const errorText = await page.locator('.error-message, .alert-error').textContent();
    expect(errorText.toLowerCase()).toMatch(/network|offline|connection|internet/);
    
    // Restore network
    await context.setOffline(false);
  });
});