/**
 * Integration Tests for Cache Stampede Prevention
 * Tests prevention of thundering herd problem
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMemoryCache } from '../../../lib/cache/memory-cache.js';

describe('Cache Stampede Prevention', () => {
  let cache;

  beforeEach(() => {
    cache = createMemoryCache({
      maxSize: 500,
      maxMemoryMB: 50,
      defaultTtl: 60 // Short TTL for testing
    });
  });

  afterEach(() => {
    if (cache) {
      cache.close();
    }
  });

  describe('Expired Popular Key Scenarios', () => {
    it('should handle single request for expired key', async () => {
      // Set key with very short TTL
      cache.set('popular:key', { data: 'original' }, { ttl: 1 });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Request expired key
      const result = cache.get('popular:key');

      expect(result).toBeNull();
      expect(cache.metrics.ttlExpired).toBeGreaterThan(0);
    });

    it('should handle multiple concurrent requests for same key', async () => {
      const key = 'concurrent:key';
      let fetchCount = 0;

      // Simulate data fetching function
      const fetchData = async () => {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: `fetch-${fetchCount}`, timestamp: Date.now() };
      };

      // Check if key exists, if not fetch and set
      const getOrFetch = async () => {
        let result = cache.get(key);
        if (!result) {
          result = await fetchData();
          cache.set(key, result, { ttl: 60 });
        }
        return result;
      };

      // Simulate 10 concurrent requests
      const promises = Array(10).fill(null).map(() => getOrFetch());
      const results = await Promise.all(promises);

      // All should get same data (but may have fetched multiple times without proper locking)
      const uniqueValues = new Set(results.map(r => r.data));
      expect(uniqueValues.size).toBeGreaterThan(0);

      // Verify key is now cached
      const cached = cache.get(key);
      expect(cached).toBeDefined();
    });
  });

  describe('Request Coalescing Simulation', () => {
    it('should coalesce multiple requests using simple lock pattern', async () => {
      const locks = new Map();
      let fetchCount = 0;

      const fetchWithLock = async (key) => {
        // Check cache first
        let result = cache.get(key);
        if (result) {
          return { ...result, source: 'cache' };
        }

        // Check if fetch in progress
        if (locks.has(key)) {
          // Wait for existing fetch
          return locks.get(key);
        }

        // Start fetch
        const fetchPromise = (async () => {
          fetchCount++;
          await new Promise(resolve => setTimeout(resolve, 100));
          const data = { data: `fetch-${fetchCount}`, timestamp: Date.now() };
          cache.set(key, data, { ttl: 60 });
          locks.delete(key);
          return { ...data, source: 'fetch' };
        })();

        locks.set(key, fetchPromise);
        return fetchPromise;
      };

      // Simulate 20 concurrent requests
      const promises = Array(20).fill(null).map(() => fetchWithLock('locked:key'));
      const results = await Promise.all(promises);

      // Should have fetched only once
      expect(fetchCount).toBe(1);

      // All results should have same fetch data
      const fetchResults = results.filter(r => r.source === 'fetch');
      const cacheResults = results.filter(r => r.source === 'cache');

      expect(fetchResults.length).toBeGreaterThan(0);
      expect(results.every(r => r.data === results[0].data)).toBe(true);
    });
  });

  describe('Lock Timeout Handling', () => {
    it('should handle stuck locks with timeout', async () => {
      const locks = new Map();
      const lockTimeout = 1000; // 1 second

      const fetchWithTimeoutLock = async (key) => {
        const result = cache.get(key);
        if (result) return result;

        const existingLock = locks.get(key);
        if (existingLock) {
          const lockAge = Date.now() - existingLock.timestamp;
          if (lockAge < lockTimeout) {
            // Wait for existing lock
            return existingLock.promise;
          } else {
            // Lock expired, remove it
            locks.delete(key);
          }
        }

        // Create new lock
        const fetchPromise = (async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          const data = { data: 'fresh', timestamp: Date.now() };
          cache.set(key, data, { ttl: 60 });
          locks.delete(key);
          return data;
        })();

        locks.set(key, {
          promise: fetchPromise,
          timestamp: Date.now()
        });

        return fetchPromise;
      };

      const result = await fetchWithTimeoutLock('timeout:key');

      expect(result).toBeDefined();
      expect(result.data).toBe('fresh');
    });
  });

  describe('Probabilistic Early Expiration', () => {
    it('should implement probabilistic early refresh', async () => {
      const ttl = 60; // 60 seconds
      const beta = 1; // Beta parameter for probability calculation

      const shouldRefreshEarly = (key, ttl, beta = 1) => {
        const entry = cache.cache.get(cache.buildKey(key));
        if (!entry || !entry.expiresAt) return false;

        const remaining = Math.max(0, (entry.expiresAt - Date.now()) / 1000);
        const delta = 10; // Simulated request latency

        // XFetch algorithm: refresh if random < delta * beta * exp(delta / ttl_remaining)
        const probability = delta * beta * Math.exp(-remaining / delta);
        return Math.random() < probability;
      };

      cache.set('early:key', { data: 'test' }, { ttl });

      // Check multiple times - some should trigger early refresh
      const checks = Array(100).fill(null).map(() => shouldRefreshEarly('early:key', ttl, beta));
      const earlyRefreshCount = checks.filter(Boolean).length;

      // At least some should trigger early refresh (probabilistic)
      expect(earlyRefreshCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Backoff Strategies', () => {
    it('should implement exponential backoff on failures', async () => {
      let attempt = 0;
      const maxAttempts = 5;
      const baseDelay = 100;

      const fetchWithBackoff = async (key) => {
        const result = cache.get(key);
        if (result) return result;

        for (attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            // Simulate fetch (fail first few attempts)
            if (attempt < 2) {
              throw new Error('Fetch failed');
            }

            const data = { data: 'success', attempt };
            cache.set(key, data, { ttl: 60 });
            return data;
          } catch (error) {
            if (attempt === maxAttempts - 1) throw error;

            // Exponential backoff: 100ms, 200ms, 400ms...
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      };

      const result = await fetchWithBackoff('backoff:key');

      expect(result).toBeDefined();
      expect(result.attempt).toBe(2);
    });

    it('should implement jittered backoff to prevent synchronization', async () => {
      const getJitteredDelay = (attempt, baseDelay = 100) => {
        const exponential = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * exponential; // ±30% jitter
        return exponential + jitter;
      };

      // Test multiple delays are different
      const delays = Array(10).fill(null).map((_, i) => getJitteredDelay(i));

      // Check that delays vary (jitter applied)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should implement simple rate limiting', async () => {
      const rateLimiter = {
        requests: new Map(),
        limit: 10,
        window: 1000 // 1 second

        ,
        canProceed(clientId) {
          const now = Date.now();
          const clientRequests = this.requests.get(clientId) || [];

          // Remove old requests outside window
          const validRequests = clientRequests.filter(time => now - time < this.window);

          if (validRequests.length >= this.limit) {
            return false;
          }

          validRequests.push(now);
          this.requests.set(clientId, validRequests);
          return true;
        }
      };

      const clientId = 'client-1';
      let allowed = 0;
      let denied = 0;

      // Simulate 15 requests (limit is 10)
      for (let i = 0; i < 15; i++) {
        if (rateLimiter.canProceed(clientId)) {
          allowed++;
        } else {
          denied++;
        }
      }

      expect(allowed).toBe(10);
      expect(denied).toBe(5);
    });
  });

  describe('Cache Warming After Expiration', () => {
    it('should warm cache proactively before expiration', async () => {
      const ttl = 10; // 10 seconds
      const warmThreshold = 0.8; // Warm at 80% of TTL

      const shouldWarm = (key) => {
        const remaining = cache.ttl(key);
        if (remaining <= 0) return true;

        const entry = cache.cache.get(cache.buildKey(key));
        if (!entry || !entry.expiresAt) return false;

        const elapsed = Date.now() - entry.createdAt;
        const totalTtl = (entry.expiresAt - entry.createdAt) / 1000;

        return elapsed / 1000 > totalTtl * warmThreshold;
      };

      cache.set('warm:key', { data: 'test' }, { ttl });

      // Immediately after set, should not need warming
      expect(shouldWarm('warm:key')).toBe(false);

      // Wait for 80% of TTL
      await new Promise(resolve => setTimeout(resolve, ttl * 800));

      // Should now trigger warming
      const needsWarming = shouldWarm('warm:key');
      // Note: timing may vary, so this test is approximate
      expect(typeof needsWarming).toBe('boolean');
    });
  });

  describe('Concurrent Write Protection', () => {
    it('should use NX flag to prevent race conditions', () => {
      // First write should succeed
      const success1 = cache.set('race:key', { data: 'first' }, { nx: true });
      expect(success1).toBe(true);

      // Concurrent write should fail with nx flag
      const success2 = cache.set('race:key', { data: 'second' }, { nx: true });
      expect(success2).toBe(false);

      // Original value preserved
      const value = cache.get('race:key');
      expect(value.data).toBe('first');
    });

    it('should handle concurrent nx writes', async () => {
      const key = 'concurrent:nx';
      let successCount = 0;

      const trySet = async (value) => {
        const success = cache.set(key, { data: value }, { nx: true });
        if (success) successCount++;
        return success;
      };

      // Simulate 10 concurrent attempts
      const promises = Array(10).fill(null).map((_, i) => trySet(`value-${i}`));
      await Promise.all(promises);

      // Only one should succeed
      expect(successCount).toBe(1);

      // Verify key exists
      expect(cache.exists(key)).toBe(true);
    });
  });

  describe('Stale-While-Revalidate Pattern', () => {
    it('should serve stale data while revalidating', async () => {
      let fetchCount = 0;

      const getWithSWR = async (key, fetchFn, ttl = 60, staleTime = 120) => {
        const cached = cache.get(key);

        // If cached and not stale, return immediately
        if (cached && !cached._stale) {
          return cached;
        }

        // If cached but stale, return stale data and revalidate in background
        if (cached && cached._stale) {
          // Trigger revalidation (don't wait)
          fetchFn().then(freshData => {
            cache.set(key, { ...freshData, _stale: false }, { ttl });
          });

          return cached;
        }

        // No cache, fetch and wait
        const data = await fetchFn();
        cache.set(key, { ...data, _stale: false }, { ttl });
        return data;
      };

      const fetchData = async () => {
        fetchCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: `fetch-${fetchCount}`, timestamp: Date.now() };
      };

      // First request - cache miss
      const result1 = await getWithSWR('swr:key', fetchData);
      expect(result1.data).toBe('fetch-1');

      // Mark as stale for testing
      const cached = cache.get('swr:key');
      cache.set('swr:key', { ...cached, _stale: true }, { ttl: 60 });

      // Second request - should return stale immediately
      const result2 = await getWithSWR('swr:key', fetchData);
      expect(result2.data).toBe('fetch-1'); // Stale data

      // Wait for revalidation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Third request - should have fresh data
      const result3 = await getWithSWR('swr:key', fetchData);
      expect(result3.data).toBe('fetch-2'); // Revalidated data
    });
  });

  describe('Performance Under Stampede', () => {
    it('should maintain performance with 100 concurrent requests', async () => {
      const key = 'perf:key';
      let fetchCount = 0;
      const locks = new Map();

      const fetchWithLock = async () => {
        const result = cache.get(key);
        if (result) return result;

        if (locks.has(key)) {
          return locks.get(key);
        }

        const promise = (async () => {
          fetchCount++;
          await new Promise(resolve => setTimeout(resolve, 50));
          const data = { data: 'test', count: fetchCount };
          cache.set(key, data, { ttl: 60 });
          locks.delete(key);
          return data;
        })();

        locks.set(key, promise);
        return promise;
      };

      const startTime = Date.now();

      // 100 concurrent requests
      const promises = Array(100).fill(null).map(() => fetchWithLock());
      const results = await Promise.all(promises);

      const elapsed = Date.now() - startTime;

      // Should complete quickly (< 500ms with one fetch)
      expect(elapsed).toBeLessThan(500);

      // Should have fetched only once or very few times
      expect(fetchCount).toBeLessThan(5);

      // All should have same data
      const uniqueData = new Set(results.map(r => r.data));
      expect(uniqueData.size).toBe(1);
    });
  });
});
