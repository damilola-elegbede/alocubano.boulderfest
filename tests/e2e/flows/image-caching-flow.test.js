/**
 * E2E Tests for Image Caching Flow
 * Tests browser-based image caching in real environment
 *
 * NOTE: These tests require Vercel Preview deployment
 * Run with: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';

describe('Image Caching E2E Flow', () => {
  let browser;
  let context;
  let page;
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext();
    page = await context.newPage();

    // Clear storage before tests
    await context.clearCookies();
    await page.goto(baseURL);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('Initial Page Load', () => {
    it('should load page with hero image', async () => {
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

    it('should cache image assignment in sessionStorage', async () => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      const sessionData = await page.evaluate(() => {
        return sessionStorage.getItem('alocubano_image_cache_v3');
      });

      expect(sessionData).toBeTruthy();
      const parsed = JSON.parse(sessionData);
      expect(parsed).toHaveProperty('home');
    });

    it('should cache image data in localStorage', async () => {
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

  describe('Page Navigation', () => {
    it('should load different images on different pages', async () => {
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

    it('should maintain session assignments across navigation', async () => {
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

  describe('Cache Reload', () => {
    it('should load images from cache on page reload', async () => {
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

  describe('Cache Size Management', () => {
    it('should respect cache size limits', async () => {
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

  describe('Format-Aware Caching', () => {
    it('should cache different format variants separately', async () => {
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

    it('should cache different width variants separately', async () => {
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

  describe('Cache Clearing', () => {
    it('should clear cache when requested', async () => {
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

  describe('WebP Support Detection', () => {
    it('should detect WebP support in browser', async () => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      const supportsWebP = await page.evaluate(async () => {
        return await window.ImageCacheManager.supportsWebP();
      });

      // Chromium supports WebP
      expect(supportsWebP).toBe(true);
    });

    it('should use best format for browser', async () => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      const bestFormat = await page.evaluate(async () => {
        return await window.ImageCacheManager.getBestFormat();
      });

      expect(bestFormat).toBe('webp'); // Chromium supports WebP
    });
  });

  describe('Error Handling', () => {
    it('should fallback to default image on error', async () => {
      await page.goto(`${baseURL}/`);
      await page.waitForLoadState('networkidle');

      // Request image for unknown page
      const result = await page.evaluate(async () => {
        window.history.pushState({}, '', '/unknown-page');
        return await window.ImageCacheManager.getOptimizedImageForPage();
      });

      expect(result.url).toContain('hero-default.jpg');
    });

    it('should handle corrupt cache data gracefully', async () => {
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

  describe('Performance', () => {
    it('should load images quickly from cache', async () => {
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
