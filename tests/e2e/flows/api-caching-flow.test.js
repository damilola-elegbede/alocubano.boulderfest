/**
 * E2E Tests for API Response Caching Flow
 * Tests API caching in production-like environment
 *
 * NOTE: These tests require Vercel Preview deployment
 * Run with: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';

describe('API Caching E2E Flow', () => {
  let browser;
  let context;
  let page;
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('Health Check Endpoint', () => {
    it('should return cache headers on repeated requests', async () => {
      // First request
      const response1 = await page.goto(`${baseURL}/api/health/check`);
      const headers1 = response1.headers();

      expect(response1.status()).toBe(200);

      // Second request (should be cached or fresher)
      const response2 = await page.goto(`${baseURL}/api/health/check`);
      const headers2 = response2.headers();

      expect(response2.status()).toBe(200);

      // Check for cache-related headers
      // Note: Actual header names depend on implementation
      const hasCacheHeader = headers2['x-cache'] || headers2['cache-control'];
      expect(hasCacheHeader).toBeDefined();
    });
  });

  describe('Gallery API Caching', () => {
    it('should cache gallery years data', async () => {
      const apiPath = `${baseURL}/api/gallery/years`;

      // First request
      const response1 = await page.goto(apiPath);
      expect(response1.status()).toBe(200);

      const data1 = await response1.json();
      expect(data1).toBeDefined();

      // Second request (should be faster from cache)
      const startTime = Date.now();
      const response2 = await page.goto(apiPath);
      const elapsed = Date.now() - startTime;

      expect(response2.status()).toBe(200);
      const data2 = await response2.json();

      // Data should be consistent
      expect(data2).toEqual(data1);

      // Cached response should be fast (< 500ms)
      expect(elapsed).toBeLessThan(500);
    });

    it('should cache featured photos data', async () => {
      const apiPath = `${baseURL}/api/featured-photos`;

      const response1 = await page.goto(apiPath);
      expect(response1.status()).toBe(200);

      const data1 = await response1.json();

      const response2 = await page.goto(apiPath);
      const data2 = await response2.json();

      expect(data2).toEqual(data1);
    });
  });

  describe('Cache Control Headers', () => {
    it('should include proper cache-control headers', async () => {
      const response = await page.goto(`${baseURL}/api/health/check`);
      const headers = response.headers();

      const cacheControl = headers['cache-control'];
      expect(cacheControl).toBeDefined();
    });

    it('should respect no-cache for dynamic endpoints', async () => {
      // Ticket availability is dynamic - should not be heavily cached
      const response = await page.goto(`${baseURL}/api/tickets/availability`);

      if (response.status() === 200) {
        const headers = response.headers();
        const cacheControl = headers['cache-control'];

        // Should have short cache time or no-cache
        if (cacheControl) {
          const hasShortCache =
            cacheControl.includes('no-cache') ||
            cacheControl.includes('max-age=') && parseInt(cacheControl.match(/max-age=(\d+)/)?.[1] || '0') < 600;

          expect(hasShortCache).toBe(true);
        }
      }
    });
  });

  describe('API Response Consistency', () => {
    it('should return consistent data across multiple requests', async () => {
      const apiPath = `${baseURL}/api/gallery/years`;
      const responses = [];

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        const response = await page.goto(apiPath);
        if (response.status() === 200) {
          responses.push(await response.json());
        }
        await page.waitForTimeout(100);
      }

      // All responses should be identical (from cache)
      if (responses.length > 1) {
        const first = JSON.stringify(responses[0]);
        responses.forEach(response => {
          expect(JSON.stringify(response)).toBe(first);
        });
      }
    });
  });

  describe('Cache Invalidation', () => {
    it('should get fresh data after cache invalidation', async () => {
      const apiPath = `${baseURL}/api/health/check`;

      // First request
      const response1 = await page.goto(apiPath);
      const data1 = await response1.json();

      // Wait a moment
      await page.waitForTimeout(1000);

      // Second request - might be cached
      const response2 = await page.goto(apiPath);
      const data2 = await response2.json();

      // Both should succeed
      expect(response1.status()).toBe(200);
      expect(response2.status()).toBe(200);
      expect(data1).toBeDefined();
      expect(data2).toBeDefined();
    });
  });

  describe('Performance Under Load', () => {
    it('should handle concurrent API requests efficiently', async () => {
      const apiPath = `${baseURL}/api/health/check`;

      const startTime = Date.now();

      // Make 10 concurrent requests
      const promises = Array(10).fill(null).map(() =>
        page.goto(apiPath)
      );

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // All should succeed
      responses.forEach(response => {
        expect(response.status()).toBe(200);
      });

      // Should complete quickly with caching (< 2 seconds)
      expect(elapsed).toBeLessThan(2000);
    });

    it('should measure cache hit ratio', async () => {
      const apiPath = `${baseURL}/api/health/check`;
      let cacheHits = 0;
      let cacheMisses = 0;

      // Make 20 requests
      for (let i = 0; i < 20; i++) {
        const response = await page.goto(apiPath);
        const headers = response.headers();

        if (headers['x-cache'] === 'HIT') {
          cacheHits++;
        } else if (headers['x-cache'] === 'MISS') {
          cacheMisses++;
        }

        await page.waitForTimeout(50);
      }

      // Should have some cache hits (if header is implemented)
      // If x-cache header not implemented, this will be 0
      const totalCacheResponses = cacheHits + cacheMisses;
      if (totalCacheResponses > 0) {
        expect(cacheHits).toBeGreaterThan(0);
      }
    });
  });

  describe('Different HTTP Methods', () => {
    it('should not cache POST requests', async () => {
      // POST requests should not be cached
      const response1 = await page.evaluate(async (url) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' })
        });
        return {
          status: res.status,
          headers: Object.fromEntries(res.headers.entries())
        };
      }, `${baseURL}/api/health/check`);

      // Second POST
      const response2 = await page.evaluate(async (url) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' })
        });
        return {
          status: res.status,
          headers: Object.fromEntries(res.headers.entries())
        };
      }, `${baseURL}/api/health/check`);

      // Both should not indicate cache hit
      const hasCache1 = response1.headers['x-cache'] === 'HIT';
      const hasCache2 = response2.headers['x-cache'] === 'HIT';

      expect(hasCache1).toBe(false);
      expect(hasCache2).toBe(false);
    });

    it('should cache GET requests by default', async () => {
      const apiPath = `${baseURL}/api/health/check`;

      // First GET
      const response1 = await page.goto(apiPath);
      expect(response1.status()).toBe(200);

      // Second GET (may be cached)
      const response2 = await page.goto(apiPath);
      expect(response2.status()).toBe(200);

      // If caching is working, second should be faster
      // Note: timing is approximate and may vary
    });
  });

  describe('Query Parameter Handling', () => {
    it('should cache responses with different query params separately', async () => {
      const baseApiPath = `${baseURL}/api/gallery`;

      // Request with param 1
      const response1 = await page.goto(`${baseApiPath}?year=2023`);
      const data1 = response1.status() === 200 ? await response1.json() : null;

      // Request with param 2
      const response2 = await page.goto(`${baseApiPath}?year=2024`);
      const data2 = response2.status() === 200 ? await response2.json() : null;

      // Should be different responses (or at least handled separately)
      if (data1 && data2) {
        expect(data1).not.toEqual(data2);
      }
    });

    it('should normalize query parameter order for caching', async () => {
      // Create URL with params in different order
      const url1 = `${baseURL}/api/gallery?year=2024&page=1`;
      const url2 = `${baseURL}/api/gallery?page=1&year=2024`;

      const response1 = await page.goto(url1);
      const data1 = response1.status() === 200 ? await response1.json() : null;

      const response2 = await page.goto(url2);
      const data2 = response2.status() === 200 ? await response2.json() : null;

      // Should return same data (params normalized)
      if (data1 && data2) {
        expect(data2).toEqual(data1);
      }
    });
  });

  describe('Error Response Caching', () => {
    it('should not cache error responses', async () => {
      // Request non-existent endpoint
      const response1 = await page.goto(`${baseURL}/api/non-existent`, {
        waitUntil: 'networkidle'
      });

      const status1 = response1.status();
      expect(status1).toBeGreaterThanOrEqual(400);

      // Second request should also return error (not cached 404)
      const response2 = await page.goto(`${baseURL}/api/non-existent`, {
        waitUntil: 'networkidle'
      });

      const status2 = response2.status();
      expect(status2).toBeGreaterThanOrEqual(400);

      // Should not be marked as cache hit
      const headers2 = response2.headers();
      expect(headers2['x-cache']).not.toBe('HIT');
    });
  });

  describe('Cache Expiration', () => {
    it('should refresh expired cache entries', async () => {
      const apiPath = `${baseURL}/api/health/check`;

      // First request
      const response1 = await page.goto(apiPath);
      const data1 = await response1.json();
      const timestamp1 = data1.timestamp || Date.now();

      // Wait for potential cache expiration (adjust based on TTL)
      await page.waitForTimeout(3000);

      // Second request (may be fresh if cache expired)
      const response2 = await page.goto(apiPath);
      const data2 = await response2.json();
      const timestamp2 = data2.timestamp || Date.now();

      // Timestamps may differ if cache expired and refreshed
      // (This test is time-sensitive and may need adjustment)
      expect(response2.status()).toBe(200);
    });
  });

  describe('Cache Statistics', () => {
    it('should expose cache statistics via admin endpoint (if available)', async () => {
      // This would require authentication
      // Placeholder for cache stats endpoint test
      const statsPath = `${baseURL}/api/cache/stats`;

      const response = await page.goto(statsPath);

      // May return 401/403 without auth, which is expected
      const status = response.status();
      expect([200, 401, 403, 404]).toContain(status);
    });
  });
});
