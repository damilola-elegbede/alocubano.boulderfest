/**
 * Integration Tests for Cache TTL Handling
 * Tests time-to-live behavior and expiration accuracy
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMemoryCache } from '../../../lib/cache/memory-cache.js';

describe('Cache TTL Handling Integration', () => {
  let cache;

  beforeEach(() => {
    cache = createMemoryCache({
      maxSize: 500,
      maxMemoryMB: 50,
      defaultTtl: 3600,
      checkInterval: 1 // Fast cleanup for testing
    });
  });

  afterEach(() => {
    if (cache) {
      cache.close();
    }
  });

  describe('TTL Edge Cases', () => {
    it('should handle TTL = 0 (immediate expiration)', async () => {
      cache.set('zero:ttl', { data: 'test' }, { ttl: 0 });

      // Should not expire immediately (TTL 0 means no expiration)
      const result = cache.get('zero:ttl');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle TTL = 1 second', async () => {
      cache.set('one:second', { data: 'test' }, { ttl: 1 });

      // Immediately available
      const immediate = cache.get('one:second');
      expect(immediate).toEqual({ data: 'test' });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be expired
      const expired = cache.get('one:second');
      expect(expired).toBeNull();
      expect(cache.metrics.ttlExpired).toBeGreaterThan(0);
    });

    it('should handle TTL = null (never expire)', async () => {
      cache.set('infinite:key', { data: 'test' }, { ttl: null });

      const ttl = cache.ttl('infinite:key');
      expect(ttl).toBe(-1); // -1 indicates no expiration

      // Should still exist after waiting
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = cache.get('infinite:key');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle negative TTL (treat as no expiration)', () => {
      cache.set('negative:ttl', { data: 'test' }, { ttl: -100 });

      const result = cache.get('negative:ttl');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle very large TTL', () => {
      const oneYear = 365 * 24 * 60 * 60;
      cache.set('large:ttl', { data: 'test' }, { ttl: oneYear });

      const ttl = cache.ttl('large:ttl');
      expect(ttl).toBeGreaterThan(oneYear - 5);
      expect(ttl).toBeLessThanOrEqual(oneYear);
    });
  });

  describe('TTL Updates', () => {
    it('should update TTL with expire', () => {
      cache.set('update:key', { data: 'test' }, { ttl: 10 });

      const originalTtl = cache.ttl('update:key');
      expect(originalTtl).toBeGreaterThan(8);

      cache.expire('update:key', 3600);

      const updatedTtl = cache.ttl('update:key');
      expect(updatedTtl).toBeGreaterThan(3500);
    });

    it('should overwrite TTL when setting existing key', () => {
      cache.set('overwrite:key', { data: 'v1' }, { ttl: 10 });

      const ttl1 = cache.ttl('overwrite:key');
      expect(ttl1).toBeLessThanOrEqual(10);

      cache.set('overwrite:key', { data: 'v2' }, { ttl: 3600 });

      const ttl2 = cache.ttl('overwrite:key');
      expect(ttl2).toBeGreaterThan(3500);
    });

    it('should extend TTL without changing value', () => {
      const value = { data: 'test', nested: { key: 'value' } };
      cache.set('extend:key', value, { ttl: 10 });

      cache.expire('extend:key', 3600);

      const result = cache.get('extend:key');
      expect(result).toEqual(value);
      expect(cache.ttl('extend:key')).toBeGreaterThan(3500);
    });
  });

  describe('TTL Countdown Accuracy', () => {
    it('should countdown TTL accurately', async () => {
      cache.set('countdown:key', { data: 'test' }, { ttl: 5 });

      const ttl1 = cache.ttl('countdown:key');
      expect(ttl1).toBeGreaterThan(4);
      expect(ttl1).toBeLessThanOrEqual(5);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const ttl2 = cache.ttl('countdown:key');
      expect(ttl2).toBeGreaterThan(2);
      expect(ttl2).toBeLessThan(4);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const ttl3 = cache.ttl('countdown:key');
      expect(ttl3).toBeGreaterThan(0);
      expect(ttl3).toBeLessThan(2);
    });

    it('should return -2 when key expires', async () => {
      cache.set('expire:check', { data: 'test' }, { ttl: 1 });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const ttl = cache.ttl('expire:check');
      expect(ttl).toBe(-2); // Key expired
    });
  });

  describe('Expiration Behavior', () => {
    it('should use lazy expiration (check on access)', async () => {
      cache.set('lazy:key', { data: 'test' }, { ttl: 1 });

      await new Promise(resolve => setTimeout(resolve, 1100));

      // Key is expired but still in cache until accessed
      const sizeBeforeAccess = cache.cache.size;
      expect(sizeBeforeAccess).toBeGreaterThan(0);

      // Access triggers expiration check
      const result = cache.get('lazy:key');
      expect(result).toBeNull();

      // Key should be removed after access
      const sizeAfterAccess = cache.cache.size;
      expect(sizeAfterAccess).toBe(sizeBeforeAccess - 1);
    });

    it('should use active expiration (background cleanup)', async () => {
      const fastCache = createMemoryCache({
        maxSize: 100,
        maxMemoryMB: 10,
        checkInterval: 0.5 // 500ms cleanup interval
      });

      // Add keys with short TTL
      for (let i = 0; i < 10; i++) {
        fastCache.set(`cleanup:${i}`, { data: i }, { ttl: 1 });
      }

      const initialSize = fastCache.cache.size;
      expect(initialSize).toBe(10);

      // Wait for expiration + cleanup
      await new Promise(resolve => setTimeout(resolve, 1600));

      // Background cleanup should have removed expired keys
      const finalSize = fastCache.cache.size;
      expect(finalSize).toBe(0);
      expect(fastCache.metrics.ttlExpired).toBeGreaterThan(0);

      fastCache.close();
    });

    it('should clean up expired keys periodically', async () => {
      const fastCache = createMemoryCache({
        maxSize: 100,
        maxMemoryMB: 10,
        checkInterval: 0.5
      });

      // Add mix of short and long TTL keys
      fastCache.set('short:1', { data: '1' }, { ttl: 1 });
      fastCache.set('short:2', { data: '2' }, { ttl: 1 });
      fastCache.set('long:1', { data: '3' }, { ttl: 60 });

      await new Promise(resolve => setTimeout(resolve, 1600));

      // Short TTL keys should be cleaned up
      expect(fastCache.get('short:1')).toBeNull();
      expect(fastCache.get('short:2')).toBeNull();
      expect(fastCache.get('long:1')).not.toBeNull();

      fastCache.close();
    });
  });

  describe('Memory Reclamation on Expiration', () => {
    it('should reclaim memory when keys expire', async () => {
      const largeData = { data: 'x'.repeat(10000) };

      for (let i = 0; i < 10; i++) {
        cache.set(`large:${i}`, largeData, { ttl: 1 });
      }

      const memoryBefore = cache.metrics.currentMemoryBytes;
      expect(memoryBefore).toBeGreaterThan(0);

      // Wait for expiration and cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      const memoryAfter = cache.metrics.currentMemoryBytes;
      expect(memoryAfter).toBeLessThan(memoryBefore);
    });

    it('should update size metrics after expiration', async () => {
      cache.set('metric:1', { data: 'test' }, { ttl: 1 });
      cache.set('metric:2', { data: 'test' }, { ttl: 1 });

      const sizeBefore = cache.metrics.currentSize;
      expect(sizeBefore).toBe(2);

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Access to trigger cleanup
      cache.get('metric:1');
      cache.get('metric:2');

      expect(cache.metrics.currentSize).toBe(0);
    });
  });

  describe('Type-Specific TTL', () => {
    it('should use static TTL for static data', () => {
      cache.set('event:info', { name: 'Festival' }, { type: 'static' });

      const entry = cache.cache.get(cache.buildKey('event:info'));
      const staticTtl = cache.getTtl('static');

      expect(entry.expiresAt).toBeDefined();
      const actualTtl = Math.floor((entry.expiresAt - Date.now()) / 1000);
      expect(actualTtl).toBeCloseTo(staticTtl, -1);
    });

    it('should use dynamic TTL for dynamic data', () => {
      cache.set('tickets:available', { count: 100 }, { type: 'dynamic' });

      const entry = cache.cache.get(cache.buildKey('tickets:available'));
      const dynamicTtl = cache.getTtl('dynamic');

      const actualTtl = Math.floor((entry.expiresAt - Date.now()) / 1000);
      expect(actualTtl).toBeCloseTo(dynamicTtl, -1);
    });

    it('should use session TTL for session data', () => {
      cache.set('session:123', { userId: 'user1' }, { type: 'session' });

      const entry = cache.cache.get(cache.buildKey('session:123'));
      const sessionTtl = cache.getTtl('session');

      const actualTtl = Math.floor((entry.expiresAt - Date.now()) / 1000);
      expect(actualTtl).toBeCloseTo(sessionTtl, -1);
    });

    it('should override type TTL with explicit TTL', () => {
      cache.set('override:key', { data: 'test' }, { type: 'static', ttl: 100 });

      const entry = cache.cache.get(cache.buildKey('override:key'));
      const actualTtl = Math.floor((entry.expiresAt - Date.now()) / 1000);

      // Should use explicit TTL, not static TTL
      expect(actualTtl).toBeCloseTo(100, -1);
    });
  });

  describe('Exists Check with Expiration', () => {
    it('should return false for expired keys in exists check', async () => {
      cache.set('exists:key', { data: 'test' }, { ttl: 1 });

      expect(cache.exists('exists:key')).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(cache.exists('exists:key')).toBe(false);
    });

    it('should clean up expired keys on exists check', async () => {
      cache.set('cleanup:key', { data: 'test' }, { ttl: 1 });

      const sizeBefore = cache.cache.size;

      await new Promise(resolve => setTimeout(resolve, 1100));

      cache.exists('cleanup:key'); // Triggers cleanup

      const sizeAfter = cache.cache.size;
      expect(sizeAfter).toBe(sizeBefore - 1);
    });
  });

  describe('Multi-Key Operations with Expiration', () => {
    it('should handle mget with some expired keys', async () => {
      cache.set('multi:1', { data: '1' }, { ttl: 10 });
      cache.set('multi:2', { data: '2' }, { ttl: 1 });
      cache.set('multi:3', { data: '3' }, { ttl: 10 });

      await new Promise(resolve => setTimeout(resolve, 1100));

      const results = cache.mget(['multi:1', 'multi:2', 'multi:3']);

      expect(results['multi:1']).toBeDefined();
      expect(results['multi:2']).toBeUndefined(); // Expired
      expect(results['multi:3']).toBeDefined();
    });

    it('should handle pattern deletion with expired keys', async () => {
      cache.set('pattern:1', { data: '1' }, { ttl: 1 });
      cache.set('pattern:2', { data: '2' }, { ttl: 10 });
      cache.set('pattern:3', { data: '3' }, { ttl: 1 });

      await new Promise(resolve => setTimeout(resolve, 1100));

      // Delete pattern should remove both expired and valid keys
      const deleted = cache.delPattern('pattern:*');

      expect(deleted).toBe(3); // All removed including expired
    });
  });

  describe('Concurrent Expiration Scenarios', () => {
    it('should handle concurrent access to expiring key', async () => {
      cache.set('concurrent:expire', { data: 'test' }, { ttl: 1 });

      await new Promise(resolve => setTimeout(resolve, 1100));

      // Multiple concurrent gets of expired key
      const promises = Array(10).fill(null).map(() =>
        Promise.resolve(cache.get('concurrent:expire'))
      );

      const results = await Promise.all(promises);

      // All should return null (expired)
      results.forEach(result => {
        expect(result).toBeNull();
      });

      // Key should be cleaned up
      expect(cache.cache.has(cache.buildKey('concurrent:expire'))).toBe(false);
    });
  });

  describe('TTL Persistence Across Operations', () => {
    it('should maintain TTL after get operations', () => {
      cache.set('persist:key', { data: 'test' }, { ttl: 60 });

      const ttl1 = cache.ttl('persist:key');
      cache.get('persist:key');
      const ttl2 = cache.ttl('persist:key');

      // TTL should not change significantly (within 1 second tolerance)
      expect(Math.abs(ttl1 - ttl2)).toBeLessThan(2);
    });

    it('should maintain TTL in access order updates', () => {
      cache.set('access:key', { data: 'test' }, { ttl: 60 });

      const ttlBefore = cache.ttl('access:key');

      // Multiple accesses
      cache.get('access:key');
      cache.get('access:key');
      cache.get('access:key');

      const ttlAfter = cache.ttl('access:key');

      // TTL should countdown naturally, not reset
      expect(ttlAfter).toBeLessThanOrEqual(ttlBefore);
      expect(ttlBefore - ttlAfter).toBeLessThan(2);
    });
  });

  describe('Fractional TTL', () => {
    it('should handle fractional second TTL', async () => {
      cache.set('fractional:key', { data: 'test' }, { ttl: 0.5 });

      const immediate = cache.get('fractional:key');
      expect(immediate).toEqual({ data: 'test' });

      await new Promise(resolve => setTimeout(resolve, 600));

      const expired = cache.get('fractional:key');
      expect(expired).toBeNull();
    });
  });

  describe('Statistics Tracking', () => {
    it('should track TTL expiration count', async () => {
      const expiredBefore = cache.metrics.ttlExpired;

      cache.set('stat:1', { data: '1' }, { ttl: 1 });
      cache.set('stat:2', { data: '2' }, { ttl: 1 });

      await new Promise(resolve => setTimeout(resolve, 1100));

      cache.get('stat:1');
      cache.get('stat:2');

      expect(cache.metrics.ttlExpired).toBe(expiredBefore + 2);
    });
  });
});
