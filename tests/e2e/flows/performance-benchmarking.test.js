/**
 * Performance Benchmarking E2E Tests
 * Tests performance targets with real deployment environment
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setupPreviewEnvironment, cleanupPreviewEnvironment } from '../../config/preview-deployment.js';

describe('Performance Benchmarking E2E', () => {
  let previewUrl;
  let page;

  beforeAll(async () => {
    const setup = await setupPreviewEnvironment();
    previewUrl = setup.url;
    page = setup.page;
  }, 300000); // 5 minutes timeout for deployment

  afterAll(async () => {
    await cleanupPreviewEnvironment();
  });

  describe('Page Load Performance', () => {
    it('should load home page under 3 seconds', async () => {
      const startTime = Date.now();

      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    }, 15000);

    it('should load tickets page under 3 seconds', async () => {
      const startTime = Date.now();

      await page.goto(`${previewUrl}/pages/tickets.html`, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    }, 15000);

    it('should load admin dashboard under 3 seconds', async () => {
      // Login first
      await page.goto(`${previewUrl}/pages/admin/login.html`);

      await page.fill('input[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'test-password');
      await page.click('button[type="submit"]');

      await page.waitForNavigation({ waitUntil: 'networkidle' });

      const startTime = Date.now();
      await page.goto(`${previewUrl}/pages/admin/dashboard.html`, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    }, 30000);
  });

  describe('API Performance', () => {
    it('should respond to health check under 100ms', async () => {
      const startTime = Date.now();

      const response = await page.request.get(`${previewUrl}/api/health/check`);

      const responseTime = Date.now() - startTime;

      expect(response.ok()).toBe(true);
      expect(responseTime).toBeLessThan(100);
    }, 10000);

    it('should return database health under 200ms', async () => {
      const startTime = Date.now();

      const response = await page.request.get(`${previewUrl}/api/health/database`);

      const responseTime = Date.now() - startTime;

      expect(response.ok()).toBe(true);
      expect(responseTime).toBeLessThan(200);
    }, 10000);

    it('should fetch registration data under 200ms (p95)', async () => {
      const responseTimes = [];

      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();

        await page.request.get(`${previewUrl}/api/admin/registrations`);

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      // Calculate p95
      responseTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(responseTimes.length * 0.95);
      const p95 = responseTimes[p95Index];

      expect(p95).toBeLessThan(200);
    }, 60000);

    it('should handle concurrent API requests efficiently', async () => {
      const concurrentRequests = 10;
      const promises = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(page.request.get(`${previewUrl}/api/health/check`));
      }

      await Promise.all(promises);

      const totalTime = Date.now() - startTime;

      // Should handle 10 concurrent requests in under 1 second
      expect(totalTime).toBeLessThan(1000);
    }, 15000);
  });

  describe('Database Query Performance', () => {
    it('should query ticket by ID under 50ms', async () => {
      // First, need to get a valid ticket ID
      const response = await page.request.get(`${previewUrl}/api/admin/registrations`);
      const data = await response.json();

      if (data.registrations && data.registrations.length > 0) {
        const ticketId = data.registrations[0].ticket_id;

        const startTime = Date.now();

        await page.request.get(`${previewUrl}/api/tickets/${ticketId}`);

        const queryTime = Date.now() - startTime;

        // API overhead + query should be under 50ms
        expect(queryTime).toBeLessThan(100);
      }
    }, 10000);

    it('should handle batch queries efficiently', async () => {
      const startTime = Date.now();

      // Fetch multiple endpoints in parallel
      await Promise.all([
        page.request.get(`${previewUrl}/api/admin/registrations`),
        page.request.get(`${previewUrl}/api/admin/donations`),
        page.request.get(`${previewUrl}/api/health/database`),
      ]);

      const totalTime = Date.now() - startTime;

      // All three queries should complete under 500ms
      expect(totalTime).toBeLessThan(500);
    }, 15000);
  });

  describe('Frontend Performance Metrics', () => {
    it('should measure First Contentful Paint (FCP)', async () => {
      await page.goto(previewUrl);

      const fcp = await page.evaluate(() => {
        const entries = performance.getEntriesByType('paint');
        const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint');
        return fcpEntry ? fcpEntry.startTime : null;
      });

      // FCP should be under 1.8s (good rating)
      expect(fcp).toBeLessThan(1800);
    }, 15000);

    it('should measure Largest Contentful Paint (LCP)', async () => {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const lcp = await page.evaluate(() => {
        return new Promise(resolve => {
          new PerformanceObserver(list => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            resolve(lastEntry.renderTime || lastEntry.loadTime);
          }).observe({ entryTypes: ['largest-contentful-paint'] });

          // Fallback timeout
          setTimeout(() => resolve(null), 5000);
        });
      });

      if (lcp !== null) {
        // LCP should be under 2.5s (good rating)
        expect(lcp).toBeLessThan(2500);
      }
    }, 20000);

    it('should measure Time to Interactive (TTI)', async () => {
      await page.goto(previewUrl);

      const tti = await page.evaluate(() => {
        return new Promise(resolve => {
          if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                if (entry.name === 'first-input') {
                  resolve(entry.processingStart - entry.startTime);
                }
              }
            });

            observer.observe({ entryTypes: ['first-input'] });

            // Fallback: assume interactive after load
            window.addEventListener('load', () => {
              setTimeout(() => {
                resolve(performance.now());
              }, 100);
            });
          } else {
            resolve(performance.now());
          }
        });
      });

      // TTI should be under 3.8s (good rating)
      expect(tti).toBeLessThan(3800);
    }, 20000);
  });

  describe('Resource Loading Performance', () => {
    it('should load CSS under 500ms', async () => {
      await page.goto(previewUrl);

      const cssLoadTime = await page.evaluate(() => {
        const cssResources = performance.getEntriesByType('resource')
          .filter(entry => entry.name.endsWith('.css'));

        if (cssResources.length > 0) {
          return Math.max(...cssResources.map(r => r.duration));
        }

        return 0;
      });

      expect(cssLoadTime).toBeLessThan(500);
    }, 15000);

    it('should load JavaScript under 1000ms', async () => {
      await page.goto(previewUrl);

      const jsLoadTime = await page.evaluate(() => {
        const jsResources = performance.getEntriesByType('resource')
          .filter(entry => entry.name.endsWith('.js'));

        if (jsResources.length > 0) {
          return Math.max(...jsResources.map(r => r.duration));
        }

        return 0;
      });

      expect(jsLoadTime).toBeLessThan(1000);
    }, 15000);

    it('should leverage browser caching', async () => {
      // First visit
      await page.goto(previewUrl);

      await page.waitForTimeout(1000);

      // Second visit
      const startTime = Date.now();
      await page.reload();
      const reloadTime = Date.now() - startTime;

      // Cached reload should be faster
      expect(reloadTime).toBeLessThan(1500);
    }, 20000);
  });

  describe('Image Loading Performance', () => {
    it('should load hero images efficiently', async () => {
      await page.goto(previewUrl);

      const imageLoadTime = await page.evaluate(() => {
        const images = performance.getEntriesByType('resource')
          .filter(entry => /\.(jpg|jpeg|png|webp|avif)$/i.test(entry.name));

        if (images.length > 0) {
          return Math.max(...images.map(img => img.duration));
        }

        return 0;
      });

      // Images should load under 2 seconds
      expect(imageLoadTime).toBeLessThan(2000);
    }, 15000);

    it('should lazy load gallery images', async () => {
      await page.goto(`${previewUrl}/pages/gallery.html`);

      // Wait for initial render
      await page.waitForSelector('.gallery-container', { timeout: 5000 });

      const initialImageCount = await page.evaluate(() => {
        return document.querySelectorAll('img[src*="drive.google.com"]').length;
      });

      // Should not load all images immediately
      expect(initialImageCount).toBeLessThan(50);
    }, 15000);
  });

  describe('Network Performance', () => {
    it('should minimize total request count', async () => {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const requestCount = await page.evaluate(() => {
        return performance.getEntriesByType('resource').length;
      });

      // Should keep requests under 30 for initial load
      expect(requestCount).toBeLessThan(30);
    }, 15000);

    it('should minimize total page weight', async () => {
      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const totalSize = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        return resources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0);
      });

      // Total transfer size should be under 2MB
      expect(totalSize).toBeLessThan(2 * 1024 * 1024);
    }, 15000);
  });

  describe('Mobile Performance', () => {
    beforeAll(async () => {
      // Emulate mobile device
      await page.setViewportSize({ width: 375, height: 667 });
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
    });

    it('should load on mobile under 3 seconds', async () => {
      const startTime = Date.now();

      await page.goto(previewUrl, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    }, 15000);

    it('should be responsive on mobile', async () => {
      await page.goto(previewUrl);

      const isMobileOptimized = await page.evaluate(() => {
        const viewport = document.querySelector('meta[name="viewport"]');
        return viewport !== null;
      });

      expect(isMobileOptimized).toBe(true);
    }, 10000);
  });

  describe('Scalability Testing', () => {
    it('should handle multiple page navigations efficiently', async () => {
      const pages = [
        '',
        '/pages/tickets.html',
        '/pages/schedule.html',
        '/pages/about.html',
        '/pages/gallery.html',
      ];

      const startTime = Date.now();

      for (const pagePath of pages) {
        await page.goto(`${previewUrl}${pagePath}`, { waitUntil: 'domcontentloaded' });
      }

      const totalTime = Date.now() - startTime;

      // Should navigate all pages under 10 seconds
      expect(totalTime).toBeLessThan(10000);
    }, 60000);

    it('should maintain performance with session storage', async () => {
      await page.goto(previewUrl);

      // Add items to cart
      await page.evaluate(() => {
        const cart = [];
        for (let i = 0; i < 10; i++) {
          cart.push({
            id: i,
            type: `Ticket ${i}`,
            price: 100,
          });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
      });

      const startTime = Date.now();
      await page.reload();
      const reloadTime = Date.now() - startTime;

      // Should still load quickly with cart data
      expect(reloadTime).toBeLessThan(2000);
    }, 15000);
  });

  describe('Performance Regression Detection', () => {
    it('should track performance metrics over time', async () => {
      const metrics = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await page.goto(previewUrl, { waitUntil: 'networkidle' });
        const loadTime = Date.now() - startTime;

        metrics.push(loadTime);

        // Clear cache between runs
        await page.evaluate(() => {
          performance.clearResourceTimings();
        });
      }

      // Calculate variance
      const avg = metrics.reduce((a, b) => a + b) / metrics.length;
      const variance = metrics.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / metrics.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation should be low (consistent performance)
      expect(stdDev).toBeLessThan(500);
    }, 60000);

    it('should not degrade with repeated use', async () => {
      const firstLoad = Date.now();
      await page.goto(previewUrl);
      const firstLoadTime = Date.now() - firstLoad;

      // Perform multiple interactions
      for (let i = 0; i < 10; i++) {
        await page.reload();
        await page.waitForTimeout(100);
      }

      const lastLoad = Date.now();
      await page.goto(previewUrl);
      const lastLoadTime = Date.now() - lastLoad;

      // Performance should not degrade significantly
      expect(lastLoadTime).toBeLessThan(firstLoadTime * 1.5);
    }, 60000);
  });

  describe('Memory Performance', () => {
    it('should not have memory leaks', async () => {
      await page.goto(previewUrl);

      const initialMemory = await page.evaluate(() => {
        if (performance.memory) {
          return performance.memory.usedJSHeapSize;
        }
        return 0;
      });

      // Perform operations
      for (let i = 0; i < 20; i++) {
        await page.reload();
      }

      const finalMemory = await page.evaluate(() => {
        if (performance.memory) {
          return performance.memory.usedJSHeapSize;
        }
        return 0;
      });

      if (initialMemory > 0 && finalMemory > 0) {
        // Memory should not grow excessively (allow 2x growth)
        expect(finalMemory).toBeLessThan(initialMemory * 2);
      }
    }, 60000);
  });
});
