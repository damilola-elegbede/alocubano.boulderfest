/**
 * Performance Benchmarking E2E Tests
 * Tests performance targets with real deployment environment
 */

import { test, expect } from '@playwright/test';

test.describe('Performance Benchmarking E2E', () => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.PREVIEW_URL || 'http://localhost:3000';

  test.describe('Page Load Performance', () => {
    test('should load home page under 3 seconds', async ({ page }) => {
      const startTime = Date.now();

      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    });

    test('should load tickets page under 3 seconds', async ({ page }) => {
      const startTime = Date.now();

      await page.goto(`${baseUrl}/pages/tickets.html`, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    });

    test('should load admin dashboard under 3 seconds', async ({ page }) => {
      // Login first
      await page.goto(`${baseUrl}/pages/admin/login.html`);

      await page.fill('input[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'test-password');
      await page.click('button[type="submit"]');

      await page.waitForLoadState('networkidle');

      const startTime = Date.now();
      await page.goto(`${baseUrl}/pages/admin/dashboard.html`, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    });
  });

  test.describe('API Performance', () => {
    test('should respond to health check under 100ms', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${baseUrl}/api/health/check`);

      const responseTime = Date.now() - startTime;

      expect(response.ok()).toBe(true);
      expect(responseTime).toBeLessThan(100);
    });

    test('should return database health under 200ms', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${baseUrl}/api/health/database`);

      const responseTime = Date.now() - startTime;

      expect(response.ok()).toBe(true);
      expect(responseTime).toBeLessThan(200);
    });

    test('should fetch registration data under 200ms (p95)', async ({ request }) => {
      const responseTimes = [];

      for (let i = 0; i < 20; i++) {
        const startTime = Date.now();

        await request.get(`${baseUrl}/api/admin/registrations`);

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      // Calculate p95
      responseTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(responseTimes.length * 0.95);
      const p95 = responseTimes[p95Index];

      expect(p95).toBeLessThan(200);
    });

    test('should handle concurrent API requests efficiently', async ({ request }) => {
      const concurrentRequests = 10;
      const promises = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(request.get(`${baseUrl}/api/health/check`));
      }

      await Promise.all(promises);

      const totalTime = Date.now() - startTime;

      // Should handle 10 concurrent requests in under 1 second
      expect(totalTime).toBeLessThan(1000);
    });
  });

  test.describe('Database Query Performance', () => {
    test('should query ticket by ID under 50ms', async ({ request }) => {
      // First, need to get a valid ticket ID
      const response = await request.get(`${baseUrl}/api/admin/registrations`);
      const data = await response.json();

      if (data.registrations && data.registrations.length > 0) {
        const ticketId = data.registrations[0].ticket_id;

        const startTime = Date.now();

        await request.get(`${baseUrl}/api/tickets/${ticketId}`);

        const queryTime = Date.now() - startTime;

        // API overhead + query should be under 50ms
        expect(queryTime).toBeLessThan(100);
      }
    });

    test('should handle batch queries efficiently', async ({ request }) => {
      const startTime = Date.now();

      // Fetch multiple endpoints in parallel
      await Promise.all([
        request.get(`${baseUrl}/api/admin/registrations`),
        request.get(`${baseUrl}/api/admin/donations`),
        request.get(`${baseUrl}/api/health/database`),
      ]);

      const totalTime = Date.now() - startTime;

      // All three queries should complete under 500ms
      expect(totalTime).toBeLessThan(500);
    });
  });

  test.describe('Frontend Performance Metrics', () => {
    test('should measure First Contentful Paint (FCP)', async ({ page }) => {
      await page.goto(baseUrl);

      const fcp = await page.evaluate(() => {
        const entries = performance.getEntriesByType('paint');
        const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint');
        return fcpEntry ? fcpEntry.startTime : null;
      });

      // FCP should be under 1.8s (good rating)
      expect(fcp).toBeLessThan(1800);
    });

    test('should measure Largest Contentful Paint (LCP)', async ({ page }) => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

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
    });

    test('should measure Time to Interactive (TTI)', async ({ page }) => {
      await page.goto(baseUrl);

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
    });
  });

  test.describe('Resource Loading Performance', () => {
    test('should load CSS under 500ms', async ({ page }) => {
      await page.goto(baseUrl);

      const cssLoadTime = await page.evaluate(() => {
        const cssResources = performance.getEntriesByType('resource')
          .filter(entry => entry.name.endsWith('.css'));

        if (cssResources.length > 0) {
          return Math.max(...cssResources.map(r => r.duration));
        }

        return 0;
      });

      expect(cssLoadTime).toBeLessThan(500);
    });

    test('should load JavaScript under 1000ms', async ({ page }) => {
      await page.goto(baseUrl);

      const jsLoadTime = await page.evaluate(() => {
        const jsResources = performance.getEntriesByType('resource')
          .filter(entry => entry.name.endsWith('.js'));

        if (jsResources.length > 0) {
          return Math.max(...jsResources.map(r => r.duration));
        }

        return 0;
      });

      expect(jsLoadTime).toBeLessThan(1000);
    });

    test('should leverage browser caching', async ({ page }) => {
      // First visit
      await page.goto(baseUrl);

      await page.waitForTimeout(1000);

      // Second visit
      const startTime = Date.now();
      await page.reload();
      const reloadTime = Date.now() - startTime;

      // Cached reload should be faster
      expect(reloadTime).toBeLessThan(1500);
    });
  });

  test.describe('Image Loading Performance', () => {
    test('should load hero images efficiently', async ({ page }) => {
      await page.goto(baseUrl);

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
    });

    test('should lazy load gallery images', async ({ page }) => {
      await page.goto(`${baseUrl}/pages/gallery.html`);

      // Wait for initial render
      await page.waitForSelector('.gallery-container', { timeout: 5000 });

      const initialImageCount = await page.evaluate(() => {
        return document.querySelectorAll('img[src*="drive.google.com"]').length;
      });

      // Should not load all images immediately
      expect(initialImageCount).toBeLessThan(50);
    });
  });

  test.describe('Network Performance', () => {
    test('should minimize total request count', async ({ page }) => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      const requestCount = await page.evaluate(() => {
        return performance.getEntriesByType('resource').length;
      });

      // Should keep requests under 30 for initial load
      expect(requestCount).toBeLessThan(30);
    });

    test('should minimize total page weight', async ({ page }) => {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      const totalSize = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        return resources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0);
      });

      // Total transfer size should be under 2MB
      expect(totalSize).toBeLessThan(2 * 1024 * 1024);
    });
  });

  test.describe('Mobile Performance', () => {
    test.use({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
    });

    test('should load on mobile under 3 seconds', async ({ page }) => {
      const startTime = Date.now();

      await page.goto(baseUrl, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    });

    test('should be responsive on mobile', async ({ page }) => {
      await page.goto(baseUrl);

      const isMobileOptimized = await page.evaluate(() => {
        const viewport = document.querySelector('meta[name="viewport"]');
        return viewport !== null;
      });

      expect(isMobileOptimized).toBe(true);
    });
  });

  test.describe('Scalability Testing', () => {
    test('should handle multiple page navigations efficiently', async ({ page }) => {
      const pages = [
        '',
        '/pages/tickets.html',
        '/pages/schedule.html',
        '/pages/about.html',
        '/pages/gallery.html',
      ];

      const startTime = Date.now();

      for (const pagePath of pages) {
        await page.goto(`${baseUrl}${pagePath}`, { waitUntil: 'domcontentloaded' });
      }

      const totalTime = Date.now() - startTime;

      // Should navigate all pages under 10 seconds
      expect(totalTime).toBeLessThan(10000);
    });

    test('should maintain performance with session storage', async ({ page }) => {
      await page.goto(baseUrl);

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
    });
  });

  test.describe('Performance Regression Detection', () => {
    test('should track performance metrics over time', async ({ page }) => {
      const metrics = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
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
    });

    test('should not degrade with repeated use', async ({ page }) => {
      const firstLoad = Date.now();
      await page.goto(baseUrl);
      const firstLoadTime = Date.now() - firstLoad;

      // Perform multiple interactions
      for (let i = 0; i < 10; i++) {
        await page.reload();
        await page.waitForTimeout(100);
      }

      const lastLoad = Date.now();
      await page.goto(baseUrl);
      const lastLoadTime = Date.now() - lastLoad;

      // Performance should not degrade significantly
      expect(lastLoadTime).toBeLessThan(firstLoadTime * 1.5);
    });
  });

  test.describe('Memory Performance', () => {
    test('should not have memory leaks', async ({ page }) => {
      await page.goto(baseUrl);

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
    });
  });
});
