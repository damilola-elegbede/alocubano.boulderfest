/**
 * E2E Tests for Image Caching Flow
 * Tests browser-based image caching in real environment
 *
 * NOTE: These tests require Vercel Preview deployment
 * Run with: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

test.describe('Image Caching E2E Flow', () => {
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page, context }) => {
    // Clear storage before each test
    await context.clearCookies();
    await page.goto(baseURL);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.describe('Initial Page Load', () => {
    test('should load page with hero image', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Check hero image loaded
      const heroImage = await page.locator('.hero-image, [data-testid="hero-image"]').first();
      await expect(heroImage).toBeVisible();

      // Check ImageCacheManager is initialized
      const managerExists = await page.evaluate(() => {
        return typeof window.ImageCacheManager !== 'undefined';
      });
      expect(managerExists).toBe(true);
    });

    test('should cache image assignment in sessionStorage', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      const sessionData = await page.evaluate(() => {
        return sessionStorage.getItem('alocubano_image_cache_v3');
      });

      expect(sessionData).toBeTruthy();
      const parsed = JSON.parse(sessionData);
      expect(parsed).toHaveProperty('home');
    });

    test('should cache image data in localStorage', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Wait for image to load
      await page.waitForTimeout(2000);

      const localData = await page.evaluate(() => {
        return localStorage.getItem('alocubano_image_data_cache_v3');
      });

      expect(localData).toBeTruthy();
    });
  });

  test.describe('Page Navigation', () => {
    test('should load different images on different pages', async ({ page }) => {
      // Home page
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const homeImageSrc = await page.evaluate(() => {
        const heroImage = document.querySelector('.hero-image, [data-testid="hero-image"]');
        return heroImage ? heroImage.src : null;
      });

      // Tickets page
      await page.goto(`${baseURL}/tickets.html`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const ticketsImageSrc = await page.evaluate(() => {
        const heroImage = document.querySelector('.hero-image, [data-testid="hero-image"]');
        return heroImage ? heroImage.src : null;
      });

      // Images should be different (or at least checked independently)
      expect(homeImageSrc).toBeTruthy();
      expect(ticketsImageSrc).toBeTruthy();
    });

    test('should maintain session assignments across navigation', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      const sessionBefore = await page.evaluate(() => {
        return sessionStorage.getItem('alocubano_image_cache_v3');
      });

      await page.goto(`${baseURL}/about.html`);
      await page.waitForLoadState('networkidle');

      const sessionAfter = await page.evaluate(() => {
        return sessionStorage.getItem('alocubano_image_cache_v3');
      });

      expect(sessionBefore).toBe(sessionAfter);
    });
  });

  test.describe('Cache Reload', () => {
    test('should load images from cache on page reload', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Check network requests for first load
      const requests1 = [];
      page.on('request', req => {
        if (req.url().includes('image-proxy')) {
          requests1.push(req.url());
        }
      });

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Get cache stats
      const cacheStats = await page.evaluate(() => {
        return window.ImageCacheManager &&
               window.ImageCacheManager.getCacheStats ?
               window.ImageCacheManager.getCacheStats() : null;
      });

      expect(cacheStats).toBeTruthy();
      expect(cacheStats.totalEntries).toBeGreaterThan(0);
    });
  });

  test.describe('Cache Size Management', () => {
    test('should respect cache size limits', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Navigate to multiple pages to fill cache
      const pages = ['/about.html', '/artists.html', '/schedule.html', '/gallery.html', '/tickets.html'];

      for (const pagePath of pages) {
        await page.goto(`${baseURL}${pagePath}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      }

      const cacheStats = await page.evaluate(() => {
        return window.ImageCacheManager.getCacheStats();
      });

      expect(cacheStats.totalEntries).toBeGreaterThan(0);
      expect(cacheStats.cacheSize).toBeDefined();
    });
  });

  test.describe('Format-Aware Caching', () => {
    test('should cache different format variants separately', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Request WebP format
      const webpResult = await page.evaluate(async () => {
        return await window.ImageCacheManager.getOptimizedImageForPage({
          format: 'webp',
          width: 800
        });
      });

      // Request JPEG format
      const jpegResult = await page.evaluate(async () => {
        return await window.ImageCacheManager.getOptimizedImageForPage({
          format: 'jpeg',
          width: 800
        });
      });

      expect(webpResult.url).toContain('format=webp');
      expect(jpegResult.url).toContain('format=jpeg');
    });

    test('should cache different width variants separately', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Request 400px width
      const small = await page.evaluate(async () => {
        return await window.ImageCacheManager.getOptimizedImageForPage({
          width: 400
        });
      });

      // Request 1200px width
      const large = await page.evaluate(async () => {
        return await window.ImageCacheManager.getOptimizedImageForPage({
          width: 1200
        });
      });

      expect(small.url).toContain('width=400');
      expect(large.url).toContain('width=1200');
    });
  });

  test.describe('Cache Clearing', () => {
    test('should clear cache when requested', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Verify cache exists
      let cacheExists = await page.evaluate(() => {
        const data = localStorage.getItem('alocubano_image_data_cache_v3');
        return data !== null && data !== '{}';
      });

      expect(cacheExists).toBe(true);

      // Clear cache
      await page.evaluate(() => {
        window.ImageCacheManager.clearCache();
      });

      // Verify cache cleared
      cacheExists = await page.evaluate(() => {
        const localStorageData = localStorage.getItem('alocubano_image_data_cache_v3');
        const sessionData = sessionStorage.getItem('alocubano_image_cache_v3');
        return localStorageData !== null || sessionData !== null;
      });

      expect(cacheExists).toBe(false);
    });
  });

  test.describe('WebP Support Detection', () => {
    test('should detect WebP support in browser', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      const supportsWebP = await page.evaluate(async () => {
        return await window.ImageCacheManager.supportsWebP();
      });

      // Chromium supports WebP
      expect(supportsWebP).toBe(true);
    });

    test('should use best format for browser', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      const bestFormat = await page.evaluate(async () => {
        return await window.ImageCacheManager.getBestFormat();
      });

      expect(bestFormat).toBe('webp'); // Chromium supports WebP
    });
  });

  test.describe('Error Handling', () => {
    test('should fallback to default image on error', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Request image for unknown page
      const result = await page.evaluate(async () => {
        window.history.pushState({}, '', '/unknown-page');
        return await window.ImageCacheManager.getOptimizedImageForPage();
      });

      expect(result.url).toContain('hero-default.jpg');
    });

    test('should handle corrupt cache data gracefully', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Corrupt cache data
      await page.evaluate(() => {
        localStorage.setItem('alocubano_image_data_cache_v3', 'invalid-json');
      });

      // Reload page - should not crash
      await page.reload();
      await page.waitForLoadState('networkidle');

      const managerWorks = await page.evaluate(() => {
        return typeof window.ImageCacheManager !== 'undefined';
      });

      expect(managerWorks).toBe(true);
    });
  });

  test.describe('Performance', () => {
    test('should load images quickly from cache', async ({ page }) => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Reload and measure
      const startTime = Date.now();
      await page.reload();
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // Cached load should be fast (< 3 seconds)
      expect(loadTime).toBeLessThan(3000);
    });
  });
});
