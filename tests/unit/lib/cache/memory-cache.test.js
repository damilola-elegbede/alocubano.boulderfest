/**
 * Unit Tests for Memory Cache Layer
 * Tests in-memory cache with LRU eviction, TTL support, and memory monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCache, createMemoryCache } from '../../../../lib/cache/memory-cache.js';

describe('MemoryCache', () => {
  let cache;

  beforeEach(() => {
    cache = new MemoryCache({
      maxSize: 100,
      maxMemoryMB: 10,
      defaultTtl: 3600,
      checkInterval: 60
    });
  });

  afterEach(() => {
    cache.close();
    vi.clearAllMocks();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('test-key', { data: 'test' });
      const result = cache.get('test-key');

      expect(result).toEqual({ data: 'test' });
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('non-existent');

      expect(result).toBeNull();
    });

    it('should delete keys', () => {
      cache.set('test-key', { data: 'test' });
      const deleted = cache.del('test-key');
      const result = cache.get('test-key');

      expect(deleted).toBe(true);
      expect(result).toBeNull();
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.del('non-existent');

      expect(deleted).toBe(false);
    });

    it('should check if key exists', () => {
      cache.set('test-key', { data: 'test' });

      expect(cache.exists('test-key')).toBe(true);
      expect(cache.exists('non-existent')).toBe(false);
    });

    it('should handle null values', () => {
      cache.set('null-key', null);
      const result = cache.get('null-key');

      expect(result).toBeNull();
    });

    it('should handle undefined values', () => {
      cache.set('undefined-key', undefined);
      const result = cache.get('undefined-key');

      // undefined is stored but returned as-is
      expect(result).toBeUndefined();
    });
  });

  describe('TTL Handling', () => {
    it('should expire values after TTL', async () => {
      cache.set('test-key', { data: 'test' }, { ttl: 1 }); // 1 second

      const immediate = cache.get('test-key');
      expect(immediate).toEqual({ data: 'test' });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const expired = cache.get('test-key');
      expect(expired).toBeNull();
    });

    it('should not expire values with no TTL', async () => {
      cache.set('test-key', { data: 'test' }, { ttl: 0 });

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = cache.get('test-key');
      expect(result).toEqual({ data: 'test' });
    });

    it('should return TTL for key', () => {
      cache.set('test-key', { data: 'test' }, { ttl: 3600 });

      const ttl = cache.ttl('test-key');

      expect(ttl).toBeGreaterThan(3500);
      expect(ttl).toBeLessThanOrEqual(3600);
    });

    it('should return -2 for non-existent key', () => {
      const ttl = cache.ttl('non-existent');

      expect(ttl).toBe(-2);
    });

    it('should return -1 for key with no expiration', () => {
      // Create a cache with no default TTL
      const noTtlCache = new MemoryCache({
        maxSize: 100,
        maxMemoryMB: 10,
        defaultTtl: 0,
        checkInterval: 60
      });
      noTtlCache.set('test-key', { data: 'test' }, { ttl: 0 });

      const ttl = noTtlCache.ttl('test-key');

      expect(ttl).toBe(-1);
      noTtlCache.close();
    });

    it('should extend TTL with expire', () => {
      cache.set('test-key', { data: 'test' }, { ttl: 10 });

      const extended = cache.expire('test-key', 3600);
      const ttl = cache.ttl('test-key');

      expect(extended).toBe(true);
      expect(ttl).toBeGreaterThan(3500);
    });

    it('should remove TTL when extending with 0', () => {
      cache.set('test-key', { data: 'test' }, { ttl: 10 });

      cache.expire('test-key', 0);
      const ttl = cache.ttl('test-key');

      expect(ttl).toBe(-1);
    });

    it('should use type-specific TTL', () => {
      cache.set('static:data', { data: 'test' }, { type: 'static' });

      const entry = cache.cache.get(cache.buildKey('static:data'));
      const staticTtl = cache.getTtl('static');

      expect(entry.expiresAt).toBeDefined();
      // TTL should be approximately the static TTL
      const actualTtl = Math.floor((entry.expiresAt - Date.now()) / 1000);
      expect(actualTtl).toBeCloseTo(staticTtl, -1);
    });
  });

  describe('Memory Management', () => {
    it('should track current size', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });

      expect(cache.metrics.currentSize).toBe(2);
    });

    it('should update size on delete', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });

      cache.del('key1');

      expect(cache.metrics.currentSize).toBe(1);
    });

    it('should track memory usage', () => {
      cache.set('key1', { data: 'test-data' });

      expect(cache.metrics.currentMemoryBytes).toBeGreaterThan(0);
    });

    it('should evict LRU entries when max size reached', () => {
      const smallCache = new MemoryCache({ maxSize: 3, maxMemoryMB: 10 });

      smallCache.set('key1', { data: '1' });
      smallCache.set('key2', { data: '2' });
      smallCache.set('key3', { data: '3' });
      smallCache.set('key4', { data: '4' }); // Should evict key1

      expect(smallCache.get('key1')).toBeNull();
      expect(smallCache.get('key2')).not.toBeNull();
      expect(smallCache.get('key3')).not.toBeNull();
      expect(smallCache.get('key4')).not.toBeNull();
      expect(smallCache.metrics.sizeEvictions).toBeGreaterThan(0);

      smallCache.close();
    });

    it('should evict entries when memory limit reached', () => {
      const smallCache = new MemoryCache({
        maxSize: 1000,
        maxMemoryMB: 0.001 // Very small memory limit
      });

      // Fill with large objects
      const largeObject = { data: 'x'.repeat(1000) };
      smallCache.set('key1', largeObject);
      smallCache.set('key2', largeObject);

      expect(smallCache.metrics.memoryEvictions).toBeGreaterThan(0);

      smallCache.close();
    });

    it('should calculate memory usage accurately', () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      cache.set(key, value);

      const entry = cache.cache.get(cache.buildKey(key));
      expect(entry.memorySize).toBeGreaterThan(0);
    });

    it('should resize cache dynamically', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });
      cache.set('key3', { data: '3' });

      cache.resize(2); // Shrink to 2

      expect(cache.cache.size).toBeLessThanOrEqual(2);
      expect(cache.options.maxSize).toBe(2);
    });
  });

  describe('LRU Eviction Policy', () => {
    it('should evict least recently used entries', () => {
      const smallCache = new MemoryCache({ maxSize: 3, maxMemoryMB: 10 });

      smallCache.set('key1', { data: '1' });
      smallCache.set('key2', { data: '2' });
      smallCache.set('key3', { data: '3' });

      // Access key1 to make it recently used
      smallCache.get('key1');

      // Add key4 - should evict key2 (least recently used)
      smallCache.set('key4', { data: '4' });

      expect(smallCache.get('key1')).not.toBeNull();
      expect(smallCache.get('key2')).toBeNull();
      expect(smallCache.get('key3')).not.toBeNull();
      expect(smallCache.get('key4')).not.toBeNull();

      smallCache.close();
    });

    it('should update access order on get', async () => {
      cache.set('key1', { data: '1' });

      const firstAccess = cache.accessOrder.get(cache.buildKey('key1'));

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      cache.get('key1');
      const secondAccess = cache.accessOrder.get(cache.buildKey('key1'));

      expect(secondAccess).toBeGreaterThan(firstAccess);
    });
  });

  describe('Pattern-Based Operations', () => {
    it('should delete keys matching pattern', () => {
      cache.set('user:1', { name: 'Alice' });
      cache.set('user:2', { name: 'Bob' });
      cache.set('post:1', { title: 'Post 1' });

      const deleted = cache.delPattern('user:*');

      expect(deleted).toBe(2);
      expect(cache.get('user:1')).toBeNull();
      expect(cache.get('user:2')).toBeNull();
      expect(cache.get('post:1')).not.toBeNull();
    });

    it('should handle wildcard in middle of pattern', () => {
      cache.set('cache:user:1', { data: '1' });
      cache.set('cache:user:2', { data: '2' });
      cache.set('cache:post:1', { data: '3' });

      const deleted = cache.delPattern('cache:user:*');

      expect(deleted).toBe(2);
    });

    it('should get keys matching pattern', () => {
      cache.set('user:1', { name: 'Alice' });
      cache.set('user:2', { name: 'Bob' });
      cache.set('post:1', { title: 'Post 1' });

      const keys = cache.keys('user:*');

      expect(keys).toHaveLength(2);
      expect(keys).toContain(cache.buildKey('user:1'));
      expect(keys).toContain(cache.buildKey('user:2'));
    });

    it('should return all keys with wildcard', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });
      cache.set('key3', { data: '3' });

      const keys = cache.keys('*');

      expect(keys.length).toBe(3);
    });
  });

  describe('Namespace Support', () => {
    it('should isolate keys by namespace', () => {
      cache.set('key1', { data: 'global' });
      cache.set('key1', { data: 'namespaced' }, { namespace: 'test' });

      const global = cache.get('key1');
      const namespaced = cache.get('key1', { namespace: 'test' });

      expect(global).toEqual({ data: 'global' });
      expect(namespaced).toEqual({ data: 'namespaced' });
    });

    it('should flush namespace without affecting other namespaces', () => {
      cache.set('key1', { data: '1' }, { namespace: 'ns1' });
      cache.set('key2', { data: '2' }, { namespace: 'ns1' });
      cache.set('key3', { data: '3' }, { namespace: 'ns2' });

      const deleted = cache.flushNamespace('ns1');

      expect(deleted).toBe(2);
      expect(cache.get('key1', { namespace: 'ns1' })).toBeNull();
      expect(cache.get('key2', { namespace: 'ns1' })).toBeNull();
      expect(cache.get('key3', { namespace: 'ns2' })).not.toBeNull();
    });
  });

  describe('Atomic Operations', () => {
    it('should increment counter from zero', () => {
      const value = cache.incr('counter');

      expect(value).toBe(1);
    });

    it('should increment counter multiple times', () => {
      cache.incr('counter');
      cache.incr('counter');
      const value = cache.incr('counter');

      expect(value).toBe(3);
    });

    it('should increment by custom amount', () => {
      const value = cache.incr('counter', { amount: 5 });

      expect(value).toBe(5);
    });

    it('should handle decrement with negative amount', () => {
      cache.incr('counter', { amount: 10 });
      const value = cache.incr('counter', { amount: -3 });

      expect(value).toBe(7);
    });

    it('should handle non-numeric values in increment', () => {
      cache.set('counter', 'not-a-number');
      const value = cache.incr('counter');

      expect(value).toBe(1); // Resets to 1
    });
  });

  describe('Multi-Get Operations', () => {
    it('should get multiple keys at once', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });
      cache.set('key3', { data: '3' });

      const result = cache.mget(['key1', 'key2', 'key3']);

      expect(result).toEqual({
        key1: { data: '1' },
        key2: { data: '2' },
        key3: { data: '3' }
      });
    });

    it('should skip non-existent keys in mget', () => {
      cache.set('key1', { data: '1' });

      const result = cache.mget(['key1', 'key2']);

      expect(result).toEqual({
        key1: { data: '1' }
      });
      expect(result.key2).toBeUndefined();
    });
  });

  describe('Multi-Set Operations', () => {
    it('should set multiple keys at once', () => {
      const pairs = {
        key1: { data: '1' },
        key2: { data: '2' },
        key3: { data: '3' }
      };

      const success = cache.mset(pairs);

      expect(success).toBe(true);
      expect(cache.get('key1')).toEqual({ data: '1' });
      expect(cache.get('key2')).toEqual({ data: '2' });
      expect(cache.get('key3')).toEqual({ data: '3' });
    });
  });

  describe('NX (Not Exists) Flag', () => {
    it('should set only if key does not exist', () => {
      cache.set('key1', { data: 'original' });

      const result = cache.set('key1', { data: 'updated' }, { nx: true });

      expect(result).toBe(false);
      expect(cache.get('key1')).toEqual({ data: 'original' });
    });

    it('should set if key does not exist with nx flag', () => {
      const result = cache.set('key1', { data: 'new' }, { nx: true });

      expect(result).toBe(true);
      expect(cache.get('key1')).toEqual({ data: 'new' });
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large number of entries efficiently', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        cache.set(`key-${i}`, { index: i });
      }

      const setTime = Date.now() - startTime;

      // Should complete in reasonable time (< 100ms)
      expect(setTime).toBeLessThan(100);
    });

    it('should handle very large values', () => {
      const largeValue = {
        data: 'x'.repeat(10000),
        nested: { array: Array(100).fill('large') }
      };

      cache.set('large-key', largeValue);
      const result = cache.get('large-key');

      expect(result).toEqual(largeValue);
    });

    it('should handle very small values', () => {
      cache.set('tiny', 1);
      const result = cache.get('tiny');

      expect(result).toBe(1);
    });

    it('should handle empty objects and arrays', () => {
      cache.set('empty-obj', {});
      cache.set('empty-arr', []);

      expect(cache.get('empty-obj')).toEqual({});
      expect(cache.get('empty-arr')).toEqual([]);
    });

    it('should handle special characters in keys', () => {
      const specialKeys = [
        'key:with:colons',
        'key-with-dashes',
        'key_with_underscores',
        'key.with.dots',
        'key/with/slashes'
      ];

      specialKeys.forEach(key => {
        cache.set(key, { data: key });
        expect(cache.get(key)).toEqual({ data: key });
      });
    });
  });

  describe('Statistics and Metrics', () => {
    it('should track hit and miss counts', () => {
      cache.set('key1', { data: '1' });

      cache.get('key1'); // hit
      cache.get('key2'); // miss

      expect(cache.metrics.hits).toBe(1);
      expect(cache.metrics.misses).toBe(1);
    });

    it('should track set operations', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });

      expect(cache.metrics.sets).toBe(2);
    });

    it('should track delete operations', () => {
      cache.set('key1', { data: '1' });
      cache.del('key1');

      expect(cache.metrics.deletes).toBe(1);
    });

    it('should track evictions', () => {
      const smallCache = new MemoryCache({ maxSize: 2, maxMemoryMB: 10 });

      smallCache.set('key1', { data: '1' });
      smallCache.set('key2', { data: '2' });
      smallCache.set('key3', { data: '3' });

      expect(smallCache.metrics.evictions).toBeGreaterThan(0);

      smallCache.close();
    });

    it('should calculate hit ratio', () => {
      cache.set('key1', { data: '1' });

      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key1'); // hit

      const stats = cache.getStats();

      expect(stats.hitRatio).toBe('66.67%');
    });

    it('should reset statistics', () => {
      cache.get('key1');
      cache.set('key1', { data: '1' });

      cache.resetStats();

      expect(cache.metrics.hits).toBe(0);
      expect(cache.metrics.misses).toBe(0);
      expect(cache.metrics.sets).toBe(0);
    });
  });

  describe('Health Checks', () => {
    it('should return healthy status when under capacity', () => {
      cache.set('key1', { data: '1' });

      const health = cache.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.warnings).toHaveLength(0);
    });

    it('should return warning when memory usage high', () => {
      const smallCache = new MemoryCache({
        maxSize: 1000,
        maxMemoryMB: 0.001
      });

      const largeData = { data: 'x'.repeat(1000) };
      smallCache.set('key1', largeData);

      const health = smallCache.healthCheck();

      expect(health.status).toBe('warning');
      expect(health.warnings.length).toBeGreaterThan(0);

      smallCache.close();
    });

    it('should detect high eviction rate', () => {
      const smallCache = new MemoryCache({ maxSize: 2, maxMemoryMB: 10 });

      for (let i = 0; i < 150; i++) {
        smallCache.set(`key-${i}`, { data: i });
      }

      const health = smallCache.healthCheck();

      expect(health.warnings).toContain('High eviction rate detected');

      smallCache.close();
    });
  });

  describe('Cleanup Operations', () => {
    it('should periodically clean up expired entries', async () => {
      const quickCache = new MemoryCache({
        maxSize: 100,
        maxMemoryMB: 10,
        checkInterval: 0.1 // 100ms
      });

      quickCache.set('key1', { data: '1' }, { ttl: 1 });

      await new Promise(resolve => setTimeout(resolve, 1200));

      // Cleanup should have removed expired entry
      expect(quickCache.metrics.ttlExpired).toBeGreaterThan(0);

      quickCache.close();
    });

    it('should clear all cache', () => {
      cache.set('key1', { data: '1' });
      cache.set('key2', { data: '2' });

      const cleared = cache.clear();

      expect(cleared).toBe(2);
      expect(cache.cache.size).toBe(0);
      expect(cache.metrics.currentSize).toBe(0);
    });
  });

  describe('Inspection', () => {
    it('should inspect cache entry details', () => {
      cache.set('test-key', { data: 'test' }, { ttl: 3600, type: 'static' });

      const info = cache.inspect('test-key');

      expect(info).toBeDefined();
      expect(info.type).toBe('static');
      expect(info.memorySize).toBeGreaterThan(0);
      expect(info.createdAt).toBeDefined();
      expect(info.expiresAt).toBeDefined();
      expect(info.ttlRemaining).toBeGreaterThan(0);
      expect(info.isExpired).toBe(false);
    });

    it('should return null for non-existent key inspection', () => {
      const info = cache.inspect('non-existent');

      expect(info).toBeNull();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from createMemoryCache', () => {
      const instance1 = createMemoryCache();
      const instance2 = createMemoryCache();

      expect(instance1).toBe(instance2);

      instance1.close();
    });
  });
});
