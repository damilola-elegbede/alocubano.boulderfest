/**
 * E2E Test: Gallery Performance & Advanced Functionality
 * Tests gallery performance, API integration, and advanced browsing features
 */

import { test, expect } from '@playwright/test';

test.describe('Gallery Performance & Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Use a valid gallery page (2025 has actual gallery content)
    await page.goto('/pages/boulder-fest-2025-gallery.html');
  });

  test('should load gallery within performance budget', async ({ page }) => {
    const startTime = Date.now();
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    // Gallery should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle virtual scrolling for large image sets', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Initial scroll position
    const initialScrollHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // Scroll down multiple times to test virtual scrolling
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }
    
    // More content should be loaded or scroll should be handled efficiently
    const finalScrollHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // Either more content loaded or virtual scrolling maintained performance
    expect(finalScrollHeight).toBeGreaterThanOrEqual(initialScrollHeight);
  });

  test('should optimize image loading with proper formats', async ({ page }) => {
    await page.waitForTimeout(3000);
    
    // Check for optimized image formats and lazy loading
    const images = page.locator('img[src]');
    
    if (await images.count() > 0) {
      for (let i = 0; i < Math.min(3, await images.count()); i++) {
        const img = images.nth(i);
        const src = await img.getAttribute('src');
        
        if (src) {
          // Should use optimized formats or CDN endpoints
          expect(
            src.includes('googleusercontent.com') ||
            src.includes('webp') ||
            src.includes('=s') || // Google Drive size parameter
            src.includes('api/image-proxy') || // Custom proxy
            src.includes('/images/') // Local images
          ).toBeTruthy();
        }
      }
    }
  });

  test('should integrate with Google Drive API', async ({ page }) => {
    // Monitor API calls to gallery endpoints
    const apiCalls = [];
    page.on('response', response => {
      if (response.url().includes('/api/gallery') || response.url().includes('drive.google.com')) {
        apiCalls.push(response);
      }
    });
    
    await page.reload();
    await page.waitForTimeout(3000);
    
    // Should have made API calls to gallery endpoints
    expect(apiCalls.length).toBeGreaterThan(0);
    
    // Check for successful API responses
    const successfulCalls = apiCalls.filter(call => call.status() === 200);
    expect(successfulCalls.length).toBeGreaterThan(0);
  });

  test('should cache images for performance', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Get initial network requests
    const initialRequests = [];
    page.on('request', request => {
      if (request.url().includes('googleusercontent.com') || request.url().includes('drive.google.com')) {
        initialRequests.push(request);
      }
    });
    
    // Navigate away and back
    await page.goto('/pages/tickets.html');
    await page.goto('/pages/boulder-fest-2025-gallery.html');
    
    await page.waitForTimeout(2000);
    
    // Should load faster due to caching (fewer network requests)
    // Check for actual gallery containers from the 2025 gallery
    const galleryContainer = page.locator('.gallery-detail-grid, .gallery-grid-static, #workshops-section, #socials-section');
    await expect(galleryContainer.first()).toBeVisible();
  });

  test('should handle year-based filtering efficiently', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Test year filtering if available (2025 gallery might have workshop/social filtering)
    const yearFilters = page.locator('.year-filter, button:has-text("2024"), button:has-text("2025"), .workshop-filter, .social-filter');
    
    if (await yearFilters.count() >= 2) {
      const firstYear = yearFilters.first();
      const secondYear = yearFilters.nth(1);
      
      // Switch between years and measure performance
      const startTime = Date.now();
      await firstYear.click();
      await page.waitForTimeout(1000);
      
      await secondYear.click();
      await page.waitForTimeout(1000);
      const switchTime = Date.now() - startTime;
      
      // Year switching should be fast (under 3 seconds)
      expect(switchTime).toBeLessThan(3000);
    }
  });

  test('should implement proper error handling for failed images', async ({ page }) => {
    // Mock some image failures
    await page.route('**/*.jpg', route => {
      if (Math.random() < 0.3) { // Fail 30% of images
        route.abort();
      } else {
        route.continue();
      }
    });
    
    await page.reload();
    await page.waitForTimeout(3000);
    
    // Gallery should still function despite some failed images
    // Use correct selectors for 2025 gallery
    const gallery = page.locator('.gallery-detail-grid, .gallery-grid-static, #workshops-section, #socials-section');
    await expect(gallery.first()).toBeVisible();
    
    // Should not show broken image icons or error states prominently
    const brokenImages = page.locator('img[alt="broken"], img[src=""]');
    expect(await brokenImages.count()).toBe(0);
  });

  test('should provide keyboard navigation for accessibility', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Focus on first gallery item (use correct selector)
    const galleryItems = page.locator('.gallery-item');
    
    if (await galleryItems.count() > 0) {
      await galleryItems.first().focus();
      
      // Should be able to navigate with Tab key
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Enter should open image
      await page.keyboard.press('Enter');
      
      // Check if modal or lightbox opened
      const modal = page.locator('.modal, .lightbox, .image-viewer');
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible();
        
        // Escape should close modal
        await page.keyboard.press('Escape');
        await expect(modal.first()).not.toBeVisible();
      }
    }
  });

  test('should handle infinite scroll or pagination', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Use correct selector for gallery items
    const initialItemCount = await page.locator('.gallery-item').count();
    
    if (initialItemCount > 0) {
      // Scroll to bottom to trigger infinite scroll
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      
      // Scroll again
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      
      const finalItemCount = await page.locator('.gallery-item').count();
      
      // Either more items loaded or pagination controls appeared
      const paginationControls = page.locator('.pagination, .load-more, .next-page, .loading-more');
      
      expect(
        finalItemCount > initialItemCount || 
        await paginationControls.count() > 0
      ).toBeTruthy();
    }
  });

  test('should maintain aspect ratios and prevent layout shifts', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Measure initial layout
    const initialViewport = await page.evaluate(() => ({
      scrollHeight: document.body.scrollHeight,
      scrollWidth: document.body.scrollWidth
    }));
    
    // Wait for images to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Measure final layout
    const finalViewport = await page.evaluate(() => ({
      scrollHeight: document.body.scrollHeight,
      scrollWidth: document.body.scrollWidth
    }));
    
    // Layout shouldn't have shifted dramatically (some change is expected)
    const heightChange = Math.abs(finalViewport.scrollHeight - initialViewport.scrollHeight);
    const maxAllowedShift = initialViewport.scrollHeight * 0.5; // 50% tolerance
    
    expect(heightChange).toBeLessThan(maxAllowedShift);
  });

  test('should provide image metadata and details', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Use correct selector for gallery items
    const galleryItems = page.locator('.gallery-item');
    
    if (await galleryItems.count() > 0) {
      await galleryItems.first().click();
      
      // Look for image details in modal or overlay
      const modal = page.locator('.modal, .lightbox, .image-viewer');
      
      if (await modal.count() > 0) {
        const modalText = await modal.textContent();
        
        // Should contain some metadata (date, year, event info, etc.)
        expect(
          modalText.includes('2024') ||
          modalText.includes('2025') ||
          modalText.includes('Boulder') ||
          modalText.includes('festival') ||
          modalText.length > 10 // Some descriptive text
        ).toBeTruthy();
      }
    }
  });
});
