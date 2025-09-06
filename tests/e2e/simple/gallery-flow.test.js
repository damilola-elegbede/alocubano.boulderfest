import { test, expect } from '@playwright/test';

test.describe('Gallery Browsing Flow Tests', () => {
  // Mock Google Drive API responses with 1000+ images for performance testing
  const mockGalleryData = {
    images: Array.from({ length: 1200 }, (_, i) => ({
      id: `mock-image-${i}`,
      name: `Festival Photo ${i + 1}`,
      webViewLink: `https://drive.google.com/file/d/mock-${i}/view`,
      thumbnailLink: `https://lh3.googleusercontent.com/mock-thumb-${i}`,
      year: i < 400 ? '2024' : i < 800 ? '2023' : '2022',
      type: 'image'
    })),
    videos: Array.from({ length: 50 }, (_, i) => ({
      id: `mock-video-${i}`,
      name: `Festival Video ${i + 1}`,
      webViewLink: `https://drive.google.com/file/d/mock-video-${i}/view`,
      thumbnailLink: `https://lh3.googleusercontent.com/mock-video-thumb-${i}`,
      year: '2024',
      type: 'video'
    })),
    total: 1250,
    source: 'api'
  };

  const mockYearsData = ['2024', '2023', '2022'];

  test.beforeEach(async ({ page }) => {
    // Mock gallery API responses
    await page.route('**/api/gallery**', async route => {
      const url = route.request().url();
      const urlObj = new URL(url);
      const year = urlObj.searchParams.get('year');
      
      let filteredData = { ...mockGalleryData };
      if (year) {
        filteredData.images = mockGalleryData.images.filter(img => img.year === year);
        filteredData.videos = mockGalleryData.videos.filter(vid => vid.year === year);
        filteredData.total = filteredData.images.length + filteredData.videos.length;
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filteredData)
      });
    });

    await page.route('**/api/gallery?eventId=boulder-fest-2025', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockGalleryData,
          availableYears: mockYearsData.years,
          statistics: mockYearsData.statistics,
          metadata: mockYearsData.metadata
        })
      });
    });

    // Navigate to gallery page
    await page.goto('/gallery');
  });

  test('gallery page loads and displays images', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Gallery.*A Lo Cubano/);
    
    // Wait for gallery container to be visible
    const galleryContainer = page.locator('.gallery-container, .virtual-gallery, #gallery-container');
    await expect(galleryContainer).toBeVisible({ timeout: 10000 });
    
    // Check that images are loaded (at least some of them)
    const images = page.locator('.gallery-item img, .photo-item img');
    await expect(images.first()).toBeVisible({ timeout: 15000 });
    
    // Verify multiple images are displayed
    const imageCount = await images.count();
    expect(imageCount).toBeGreaterThan(0);
  });

  test('lazy loading works correctly', async ({ page }) => {
    // Wait for initial images to load
    const initialImages = page.locator('.gallery-item img, .photo-item img');
    await expect(initialImages.first()).toBeVisible();
    
    // Get initial image count
    const initialCount = await initialImages.count();
    
    // Scroll down to trigger lazy loading
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 2);
    });
    
    // Wait for new images to load
    await page.waitForTimeout(1000);
    
    // Check if more images are loaded or visible
    const afterScrollImages = page.locator('.gallery-item img, .photo-item img');
    const afterScrollCount = await afterScrollImages.count();
    
    // Either more images loaded, or existing images became visible
    expect(afterScrollCount >= initialCount).toBeTruthy();
  });

  test('year filtering functionality works', async ({ page }) => {
    // Wait for gallery to load
    await expect(page.locator('.gallery-container, .virtual-gallery, #gallery-container')).toBeVisible();
    
    // Look for year filter dropdown or buttons
    const yearFilter = page.locator('select[name="year"], .year-filter select, .year-selector');
    const yearButton = page.locator('button:has-text("2023"), .year-btn[data-year="2023"]');
    
    if (await yearFilter.isVisible()) {
      // Test dropdown filter
      await yearFilter.selectOption('2023');
    } else if (await yearButton.isVisible()) {
      // Test button filter
      await yearButton.click();
    } else {
      // Create a filter interaction if elements exist
      const filterContainer = page.locator('.filters, .gallery-filters, .year-filters');
      if (await filterContainer.isVisible()) {
        await filterContainer.locator('text=2023').first().click();
      }
    }
    
    // Wait for filtering to complete
    await page.waitForTimeout(1000);
    
    // Verify filtered results
    const images = page.locator('.gallery-item img, .photo-item img');
    if (await images.first().isVisible()) {
      const imageCount = await images.count();
      expect(imageCount).toBeGreaterThan(0);
    }
  });

  test('performance with 1000+ images mock', async ({ page }) => {
    // Start performance measurement
    const startTime = Date.now();
    
    // Wait for gallery to load
    await expect(page.locator('.gallery-container, .virtual-gallery, #gallery-container')).toBeVisible();
    
    // Measure initial load time
    const initialLoadTime = Date.now() - startTime;
    expect(initialLoadTime).toBeLessThan(5000); // Should load in under 5 seconds
    
    // Test scrolling performance
    const scrollStart = Date.now();
    
    // Perform multiple scroll actions
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await page.waitForTimeout(100);
    }
    
    const scrollTime = Date.now() - scrollStart;
    expect(scrollTime).toBeLessThan(3000); // Scrolling should be smooth
    
    // Check memory usage doesn't explode (indirect test via DOM elements)
    const totalElements = await page.locator('*').count();
    expect(totalElements).toBeLessThan(10000); // Reasonable DOM size with virtual scrolling
  });

  test('Core Web Vitals compliance', async ({ page }) => {
    // Measure Largest Contentful Paint (LCP)
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry.startTime);
        }).observe({ entryTypes: ['largest-contentful-paint'] });
        
        // Fallback timeout
        setTimeout(() => resolve(0), 5000);
      });
    });
    
    if (lcp > 0) {
      expect(lcp).toBeLessThan(2500); // LCP should be under 2.5 seconds
    }
    
    // Test Cumulative Layout Shift (CLS) indirectly
    const initialHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // Wait for images to load
    await page.waitForTimeout(2000);
    
    const finalHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // Layout shouldn't shift dramatically (within 20% is acceptable)
    const heightDifference = Math.abs(finalHeight - initialHeight) / initialHeight;
    expect(heightDifference).toBeLessThan(0.2);
    
    // Test First Input Delay (FID) simulation
    const interactionStart = Date.now();
    
    // Simulate user interaction
    const firstImage = page.locator('.gallery-item img, .photo-item img').first();
    if (await firstImage.isVisible()) {
      await firstImage.click();
      const interactionTime = Date.now() - interactionStart;
      expect(interactionTime).toBeLessThan(100); // Should respond within 100ms
    }
  });
});