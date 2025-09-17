import { test, expect } from '@playwright/test';

test.describe('Performance Under Load', () => {
  test('should load homepage within performance budget', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000); // 3 second budget
    
    // Verify critical content is visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.hero-section')).toBeVisible();
  });

  test('should load tickets page quickly during peak sales', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/tickets');
    await page.waitForSelector('.ticket-option', { timeout: 5000 });
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(4000); // 4 second budget for dynamic content
    
    // Verify all ticket options are rendered
    const ticketOptions = await page.locator('.ticket-option').count();
    expect(ticketOptions).toBeGreaterThan(0);
  });

  test('should handle gallery with many images efficiently', async ({ page }) => {
    await page.goto('/gallery');
    
    // Start performance measurement
    const startTime = Date.now();
    
    // Wait for initial images to load
    await page.waitForSelector('.gallery-grid img', { timeout: 8000 });
    
    // Scroll to trigger lazy loading
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(500);
    }
    
    const totalTime = Date.now() - startTime;
    expect(totalTime).toBeLessThan(10000); // 10 second budget for scrolling
    
    // Verify images are loading progressively
    const loadedImages = await page.locator('.gallery-grid img').count();
    expect(loadedImages).toBeGreaterThan(5);
  });

  test('should respond to API calls within acceptable time', async ({ page }) => {
    await page.goto('/gallery');
    
    // Intercept and measure API response time
    const apiPromise = page.waitForResponse(response => 
      response.url().includes('/api/gallery') && response.status() === 200
    );
    
    const startTime = Date.now();
    const response = await apiPromise;
    const responseTime = Date.now() - startTime;
    
    expect(responseTime).toBeLessThan(2000); // 2 second API response budget
    expect(response.status()).toBe(200);
  });

  test('should handle concurrent users on registration', async ({ browser }) => {
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext()
    ]);
    
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    
    // Simulate concurrent registration attempts
    const startTime = Date.now();
    
    const registrationPromises = pages.map(async (page, index) => {
      await page.goto('/registration');
      await page.waitForSelector('form', { timeout: 5000 });
      
      // Fill form with unique data
      await page.fill('[name="firstName"]', `TestUser${index}`);
      await page.fill('[name="lastName"]', `LastName${index}`);
      await page.fill('[name="email"]', `test${index}@example.com`);
      
      return page;
    });
    
    await Promise.all(registrationPromises);
    const totalTime = Date.now() - startTime;
    
    expect(totalTime).toBeLessThan(8000); // 8 second budget for concurrent loading
    
    // Cleanup
    await Promise.all(contexts.map(context => context.close()));
  });

  test('should maintain performance during long gallery session', async ({ page }) => {
    await page.goto('/gallery');
    await page.waitForSelector('.gallery-grid', { timeout: 5000 });
    
    // Simulate extended browsing session
    for (let i = 0; i < 5; i++) {
      // Scroll and interact with gallery
      await page.evaluate(() => {
        window.scrollTo(0, Math.random() * document.body.scrollHeight);
      });
      await page.waitForTimeout(1000);
      
      // Click on random image if available
      const images = await page.locator('.gallery-grid img').count();
      if (images > 0) {
        const randomIndex = Math.floor(Math.random() * Math.min(images, 5));
        await page.locator('.gallery-grid img').nth(randomIndex).click({ timeout: 2000 });
        await page.waitForTimeout(500);
        
        // Close modal if opened
        const modal = page.locator('.modal, .lightbox');
        if (await modal.isVisible()) {
          await page.keyboard.press('Escape');
        }
      }
    }
    
    // Verify page is still responsive
    await expect(page.locator('.gallery-grid')).toBeVisible();
    
    // Check for memory leaks by ensuring page can still navigate
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should load critical resources efficiently', async ({ page }) => {
    const resourceLoadTimes = [];
    
    // Monitor resource loading
    page.on('response', response => {
      const url = response.url();
      if (url.includes('.css') || url.includes('.js') || url.includes('/api/')) {
        resourceLoadTimes.push({
          url,
          status: response.status(),
          timing: response.timing()
        });
      }
    });
    
    await page.goto('/tickets');
    await page.waitForLoadState('domcontentloaded');
    
    // Verify critical resources loaded successfully
    const failedResources = resourceLoadTimes.filter(r => r.status >= 400);
    expect(failedResources).toHaveLength(0);
    
    // Verify reasonable number of requests
    expect(resourceLoadTimes.length).toBeLessThan(50); // Reasonable request count
  });

  test('should handle cart operations under load', async ({ page }) => {
    await page.goto('/tickets');
    await page.waitForSelector('.ticket-option', { timeout: 5000 });
    
    const startTime = Date.now();
    
    // Rapid cart operations
    for (let i = 0; i < 3; i++) {
      // Add items to cart quickly
      const addButton = page.locator('.add-to-cart').first();
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(200); // Brief pause between operations
      }
    }
    
    // Verify header cart updates
    const headerCartButton = page.locator('.nav-cart-button');
    await expect(headerCartButton).toBeVisible({ timeout: 3000 });
    
    const totalTime = Date.now() - startTime;
    expect(totalTime).toBeLessThan(5000); // 5 second budget for cart operations
  });
});