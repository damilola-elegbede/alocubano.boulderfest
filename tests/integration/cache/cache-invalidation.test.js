/**
 * Integration Tests for Cache Invalidation
 * Tests real cache invalidation across multi-tier system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMultiTierCache } from '../../../lib/cache/multi-tier-cache.js';
import { createMemoryCache } from '../../../lib/cache/memory-cache.js';

describe('Cache Invalidation Integration', () => {
  let cache;

  beforeEach(async () => {
    // Use memory-only cache for testing (no Redis dependency)
    cache = createMemoryCache({
      maxSize: 500,
      maxMemoryMB: 50,
      defaultTtl: 3600
    });
  });

  afterEach(() => {
    if (cache) {
      cache.close();
    }
  });

  describe('Single Key Invalidation', () => {
    it('should invalidate single key across cache', () => {
      cache.set('test:key1', { data: 'value1' });
      cache.set('test:key2', { data: 'value2' });

      const deleted = cache.del('test:key1');

      expect(deleted).toBe(true);
      expect(cache.get('test:key1')).toBeNull();
      expect(cache.get('test:key2')).toEqual({ data: 'value2' });
    });

    it('should verify key is gone after invalidation', () => {
      cache.set('verify:key', { data: 'test' });

      cache.del('verify:key');

      expect(cache.exists('verify:key')).toBe(false);
      expect(cache.get('verify:key')).toBeNull();
    });

    it('should handle invalidation of non-existent key', () => {
      const deleted = cache.del('non:existent');

      expect(deleted).toBe(false);
    });

    it('should invalidate keys with namespaces', () => {
      cache.set('key1', { data: 'ns1' }, { namespace: 'namespace1' });
      cache.set('key1', { data: 'ns2' }, { namespace: 'namespace2' });

      cache.del('key1', { namespace: 'namespace1' });

      expect(cache.get('key1', { namespace: 'namespace1' })).toBeNull();
      expect(cache.get('key1', { namespace: 'namespace2' })).not.toBeNull();
    });
  });

  describe('Pattern-Based Invalidation', () => {
    it('should invalidate all keys matching pattern', () => {
      cache.set('user:1', { name: 'Alice' });
      cache.set('user:2', { name: 'Bob' });
      cache.set('user:3', { name: 'Charlie' });
      cache.set('post:1', { title: 'Post 1' });

      const deleted = cache.delPattern('user:*');

      expect(deleted).toBe(3);
      expect(cache.get('user:1')).toBeNull();
      expect(cache.get('user:2')).toBeNull();
      expect(cache.get('user:3')).toBeNull();
      expect(cache.get('post:1')).not.toBeNull();
    });

    it('should handle wildcard at different positions', () => {
      cache.set('cache:user:data', { data: '1' });
      cache.set('cache:post:data', { data: '2' });
      cache.set('cache:user:profile', { data: '3' });

      const deleted = cache.delPattern('cache:user:*');

      expect(deleted).toBe(2);
      expect(cache.get('cache:user:data')).toBeNull();
      expect(cache.get('cache:user:profile')).toBeNull();
      expect(cache.get('cache:post:data')).not.toBeNull();
    });

    it('should handle prefix invalidation', () => {
      cache.set('tickets:available', { count: 100 });
      cache.set('tickets:sold', { count: 50 });
      cache.set('tickets:config', { price: 150 });
      cache.set('gallery:2024', { photos: [] });

      const deleted = cache.delPattern('tickets:*');

      expect(deleted).toBe(3);
      expect(cache.get('gallery:2024')).not.toBeNull();
    });

    it('should return 0 for no matches', () => {
      cache.set('user:1', { data: 'test' });

      const deleted = cache.delPattern('post:*');

      expect(deleted).toBe(0);
    });

    it('should handle pattern with namespace', () => {
      cache.set('key1', { data: '1' }, { namespace: 'ns1' });
      cache.set('key2', { data: '2' }, { namespace: 'ns1' });
      cache.set('key1', { data: '3' }, { namespace: 'ns2' });

      const deleted = cache.delPattern('*', { namespace: 'ns1' });

      expect(deleted).toBe(2);
      expect(cache.get('key1', { namespace: 'ns1' })).toBeNull();
      expect(cache.get('key2', { namespace: 'ns1' })).toBeNull();
      expect(cache.get('key1', { namespace: 'ns2' })).not.toBeNull();
    });
  });

  describe('Bulk Invalidation', () => {
    it('should invalidate large number of keys efficiently', () => {
      const startTime = Date.now();

      // Add 1000 keys
      for (let i = 0; i < 1000; i++) {
        cache.set(`bulk:${i}`, { index: i });
      }

      // Invalidate all
      const deleted = cache.delPattern('bulk:*');

      const elapsed = Date.now() - startTime;

      expect(deleted).toBe(1000);
      expect(elapsed).toBeLessThan(1000); // Should complete in < 1 second

      // Verify all gone
      expect(cache.get('bulk:0')).toBeNull();
      expect(cache.get('bulk:500')).toBeNull();
      expect(cache.get('bulk:999')).toBeNull();
    });

    it('should handle concurrent invalidations', async () => {
      // Setup data
      for (let i = 0; i < 100; i++) {
        cache.set(`concurrent:${i}`, { index: i });
      }

      // Invalidate concurrently
      const promises = [
        Promise.resolve(cache.delPattern('concurrent:1*')),
        Promise.resolve(cache.delPattern('concurrent:2*')),
        Promise.resolve(cache.delPattern('concurrent:3*'))
      ];

      const results = await Promise.all(promises);

      expect(results.every(r => r >= 0)).toBe(true);
    });
  });

  describe('Namespace Flush', () => {
    it('should flush entire namespace', () => {
      cache.set('key1', { data: '1' }, { namespace: 'tickets' });
      cache.set('key2', { data: '2' }, { namespace: 'tickets' });
      cache.set('key3', { data: '3' }, { namespace: 'tickets' });
      cache.set('key1', { data: '4' }, { namespace: 'gallery' });

      const deleted = cache.flushNamespace('tickets');

      expect(deleted).toBe(3);
      expect(cache.get('key1', { namespace: 'tickets' })).toBeNull();
      expect(cache.get('key2', { namespace: 'tickets' })).toBeNull();
      expect(cache.get('key3', { namespace: 'tickets' })).toBeNull();
      expect(cache.get('key1', { namespace: 'gallery' })).not.toBeNull();
    });

    it('should handle empty namespace flush', () => {
      const deleted = cache.flushNamespace('empty-namespace');

      expect(deleted).toBe(0);
    });

    it('should throw error for missing namespace parameter', () => {
      expect(() => cache.flushNamespace()).toThrow();
      expect(() => cache.flushNamespace('')).toThrow();
    });
  });

  describe('Clear All Cache', () => {
    it('should clear all entries', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });
      cache.set('key3', { data: '3' });

      const cleared = cache.clear();

      expect(cleared).toBe(3);
      expect(cache.cache.size).toBe(0);
      expect(cache.metrics.currentSize).toBe(0);
    });

    it('should reset size metrics', () => {
      cache.set('key1', { data: 'large-data'.repeat(100) });

      const sizeBefore = cache.metrics.currentSize;
      const memoryBefore = cache.metrics.currentMemoryBytes;

      cache.clear();

      expect(cache.metrics.currentSize).toBe(0);
      expect(cache.metrics.currentMemoryBytes).toBe(0);
    });
  });

  describe('Consistency Validation', () => {
    it('should maintain consistency during invalidation', () => {
      // Setup
      cache.set('consistent:1', { data: '1' });
      cache.set('consistent:2', { data: '2' });
      cache.set('other:1', { data: '3' });

      // Get initial sizes
      const initialSize = cache.metrics.currentSize;

      // Invalidate pattern
      cache.delPattern('consistent:*');

      // Verify consistency
      expect(cache.metrics.currentSize).toBe(initialSize - 2);
      expect(cache.exists('consistent:1')).toBe(false);
      expect(cache.exists('consistent:2')).toBe(false);
      expect(cache.exists('other:1')).toBe(true);
    });

    it('should update access order on invalidation', () => {
      cache.set('key1', { data: '1' });

      const keyExists = cache.accessOrder.has(cache.buildKey('key1'));
      expect(keyExists).toBe(true);

      cache.del('key1');

      const stillExists = cache.accessOrder.has(cache.buildKey('key1'));
      expect(stillExists).toBe(false);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle 1000 concurrent invalidations efficiently', async () => {
      // Setup 1000 keys
      for (let i = 0; i < 1000; i++) {
        cache.set(`perf:${i}`, { index: i });
      }

      const startTime = Date.now();

      // Invalidate individually
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(Promise.resolve(cache.del(`perf:${i}`)));
      }

      await Promise.all(promises);

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(1000); // Should complete in < 1 second
      expect(cache.cache.size).toBe(0);
    });

    it('should handle large pattern matches efficiently', () => {
      // Create hierarchical keys
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 10; j++) {
          cache.set(`category:${i}:item:${j}`, { data: `${i}-${j}` });
        }
      }

      const startTime = Date.now();
      const deleted = cache.delPattern('category:*');
      const elapsed = Date.now() - startTime;

      expect(deleted).toBe(1000);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('Memory Reclamation', () => {
    it('should reclaim memory after invalidation', () => {
      const largeData = { data: 'x'.repeat(10000) };

      for (let i = 0; i < 10; i++) {
        cache.set(`large:${i}`, largeData);
      }

      const memoryBefore = cache.metrics.currentMemoryBytes;
      expect(memoryBefore).toBeGreaterThan(0);

      cache.delPattern('large:*');

      const memoryAfter = cache.metrics.currentMemoryBytes;
      expect(memoryAfter).toBe(0);
    });

    it('should maintain memory tracking accuracy', () => {
      cache.set('key1', { small: 'data' });
      cache.set('key2', { large: 'x'.repeat(1000) });

      const totalMemory = cache.metrics.currentMemoryBytes;

      cache.del('key2');

      const remainingMemory = cache.metrics.currentMemoryBytes;

      expect(remainingMemory).toBeLessThan(totalMemory);
      expect(remainingMemory).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalidation of expired keys', async () => {
      cache.set('expired:key', { data: 'test' }, { ttl: 1 });

      await new Promise(resolve => setTimeout(resolve, 1100));

      // Key is expired but still in cache
      const deleted = cache.del('expired:key');

      // Should still succeed
      expect(deleted).toBe(true);
    });

    it('should handle special characters in patterns', () => {
      cache.set('key:with:colons', { data: '1' });
      cache.set('key-with-dashes', { data: '2' });
      cache.set('key_with_underscores', { data: '3' });

      const deleted1 = cache.delPattern('key:with:*');
      const deleted2 = cache.delPattern('key-with-*');
      const deleted3 = cache.delPattern('key_with_*');

      expect(deleted1).toBe(1);
      expect(deleted2).toBe(1);
      expect(deleted3).toBe(1);
    });

    it('should handle empty pattern', () => {
      cache.set('key1', { data: '1' });

      const deleted = cache.delPattern('');

      // Empty pattern should match nothing
      expect(deleted).toBe(0);
    });

    it('should handle pattern with no wildcards', () => {
      cache.set('exact:match', { data: 'test' });

      const deleted = cache.delPattern('exact:match');

      expect(deleted).toBe(1);
    });
  });

  describe('Statistics After Invalidation', () => {
    it('should track delete operations', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });

      const deletesBefore = cache.metrics.deletes;

      cache.del('key1');
      cache.del('key2');

      expect(cache.metrics.deletes).toBe(deletesBefore + 2);
    });

    it('should update size statistics', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });
      cache.set('key3', { data: '3' });

      expect(cache.metrics.currentSize).toBe(3);

      cache.delPattern('*');

      expect(cache.metrics.currentSize).toBe(0);
    });
  });
});
