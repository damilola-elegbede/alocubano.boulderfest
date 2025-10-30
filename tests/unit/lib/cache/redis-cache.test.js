/**
 * Unit Tests for Redis Cache Layer
 * Tests Redis caching with mocked Redis client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisCache, createRedisCache } from '../../../../lib/cache/redis-cache.js';

describe('RedisCache', () => {
  let cache;
  let mockRedisClient;

  beforeEach(() => {
    // Create mock Redis client
    mockRedisClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      set: vi.fn(),
      setEx: vi.fn(),
      setNX: vi.fn(),
      del: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
      exists: vi.fn(),
      incr: vi.fn(),
      incrBy: vi.fn(),
      mGet: vi.fn(),
      mSet: vi.fn(),
      scan: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      info: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      isOpen: true
    };

    // Mock createClient from redis module
    vi.mock('redis', () => ({
      createClient: vi.fn(() => mockRedisClient)
    }));

    cache = new RedisCache({
      keyPrefix: 'test:',
      defaultTtl: 3600
    });

    cache.client = mockRedisClient;
    cache.isConnected = true;
    cache.initialized = true;
  });

  afterEach(async () => {
    if (cache) {
      await cache.close();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize Redis connection', async () => {
      const newCache = new RedisCache();
      newCache.client = mockRedisClient;

      const result = await newCache.init();

      expect(result).toBe(true);
      expect(mockRedisClient.connect).toHaveBeenCalled();

      await newCache.close();
    });

    it('should handle connection timeout', async () => {
      const slowClient = {
        ...mockRedisClient,
        connect: vi.fn(() => new Promise(() => {})), // Never resolves
        on: vi.fn()
      };

      const newCache = new RedisCache();
      newCache.client = slowClient;

      const result = await newCache.init();

      expect(result).toBe(false);

      await newCache.close();
    });

    it('should handle connection errors gracefully', async () => {
      const failingClient = {
        ...mockRedisClient,
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        on: vi.fn()
      };

      const newCache = new RedisCache();
      newCache.client = failingClient;

      const result = await newCache.init();

      expect(result).toBe(false);
      expect(newCache.isConnected).toBe(false);

      await newCache.close();
    });

    it('should not reinitialize if already initialized', async () => {
      cache.initialized = true;

      const result = await cache.init();

      expect(result).toBe(true);
      expect(mockRedisClient.connect).not.toHaveBeenCalled();
    });
  });

  describe('Connection State', () => {
    it('should check if Redis is available', () => {
      expect(cache.isAvailable()).toBe(true);
    });

    it('should return false if not initialized', () => {
      cache.initialized = false;

      expect(cache.isAvailable()).toBe(false);
    });

    it('should return false if not connected', () => {
      cache.isConnected = false;

      expect(cache.isAvailable()).toBe(false);
    });

    it('should return false if client not open', () => {
      mockRedisClient.isOpen = false;

      expect(cache.isAvailable()).toBe(false);
    });
  });

  describe('Basic Operations', () => {
    it('should get value from Redis', async () => {
      const testValue = { data: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testValue));

      const result = await cache.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test:test-key');
      expect(result).toEqual(testValue);
      expect(cache.metrics.hits).toBe(1);
    });

    it('should return fallback for non-existent key', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cache.get('non-existent', { fallback: 'default' });

      expect(result).toBe('default');
      expect(cache.metrics.misses).toBe(1);
    });

    it('should set value in Redis with TTL', async () => {
      const testValue = { data: 'test' };
      mockRedisClient.setEx.mockResolvedValue('OK');

      const result = await cache.set('test-key', testValue, { ttl: 600 });

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test:test-key',
        600,
        JSON.stringify(testValue)
      );
      expect(result).toBe(true);
      expect(cache.metrics.sets).toBe(1);
    });

    it('should set value with default TTL if not specified', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');

      await cache.set('test-key', { data: 'test' });

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test:test-key',
        3600,
        expect.any(String)
      );
    });

    it('should delete single key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await cache.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test:test-key');
      expect(result).toBe(true);
      expect(cache.metrics.deletes).toBe(1);
    });

    it('should return false when deleting non-existent key', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await cache.del('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('NX (Not Exists) Flag', () => {
    it('should set only if key does not exist', async () => {
      mockRedisClient.setNX.mockResolvedValue(true);
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await cache.set('test-key', { data: 'test' }, {
        nx: true,
        ttl: 600
      });

      expect(mockRedisClient.setNX).toHaveBeenCalledWith(
        'test:test-key',
        JSON.stringify({ data: 'test' })
      );
      expect(mockRedisClient.expire).toHaveBeenCalledWith('test:test-key', 600);
      expect(result).toBe(true);
    });

    it('should not set if key exists with nx flag', async () => {
      mockRedisClient.setNX.mockResolvedValue(false);

      const result = await cache.set('test-key', { data: 'test' }, {
        nx: true
      });

      expect(result).toBe(false);
    });
  });

  describe('TTL Operations', () => {
    it('should get TTL for key', async () => {
      mockRedisClient.ttl.mockResolvedValue(3600);

      const result = await cache.ttl('test-key');

      expect(mockRedisClient.ttl).toHaveBeenCalledWith('test:test-key');
      expect(result).toBe(3600);
    });

    it('should extend TTL with expire', async () => {
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await cache.expire('test-key', 7200);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('test:test-key', 7200);
      expect(result).toBe(true);
    });

    it('should return false if expire fails', async () => {
      mockRedisClient.expire.mockResolvedValue(0);

      const result = await cache.expire('non-existent', 7200);

      expect(result).toBe(false);
    });

    it('should use type-specific TTL', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');

      await cache.set('static:data', { data: 'test' }, { type: 'static' });

      const staticTtl = cache.getTtl('static');
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test:static:data',
        staticTtl,
        expect.any(String)
      );
    });
  });

  describe('Exists Operation', () => {
    it('should check if key exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await cache.exists('test-key');

      expect(mockRedisClient.exists).toHaveBeenCalledWith('test:test-key');
      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await cache.exists('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('Pattern-Based Deletion', () => {
    it('should delete keys matching pattern', async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce({
          cursor: 1,
          keys: ['test:user:1', 'test:user:2']
        })
        .mockResolvedValueOnce({
          cursor: 0,
          keys: ['test:user:3']
        });

      mockRedisClient.del.mockResolvedValue(3);

      const deleted = await cache.delPattern('user:*');

      expect(deleted).toBe(3);
      expect(mockRedisClient.scan).toHaveBeenCalled();
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should handle empty scan results', async () => {
      mockRedisClient.scan.mockResolvedValue({ cursor: 0, keys: [] });

      const deleted = await cache.delPattern('non-existent:*');

      expect(deleted).toBe(0);
    });

    it('should batch delete keys', async () => {
      const manyKeys = Array(150).fill(null).map((_, i) => `test:key:${i}`);
      mockRedisClient.scan.mockResolvedValue({
        cursor: 0,
        keys: manyKeys
      });
      mockRedisClient.del.mockResolvedValue(150);

      const deleted = await cache.delPattern('key:*', { batchSize: 100 });

      expect(deleted).toBe(150);
      expect(mockRedisClient.del).toHaveBeenCalled();
    });
  });

  describe('Atomic Operations', () => {
    it('should increment counter', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await cache.incr('counter');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('test:counter');
      expect(result).toBe(1);
    });

    it('should increment by custom amount', async () => {
      mockRedisClient.incrBy.mockResolvedValue(5);
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await cache.incr('counter', { amount: 5 });

      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('test:counter', 5);
      expect(result).toBe(5);
    });

    it('should set TTL on new counter', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await cache.incr('counter', { ttl: 600 });

      expect(mockRedisClient.expire).toHaveBeenCalledWith('test:counter', 600);
    });
  });

  describe('Multi-Get Operations', () => {
    it('should get multiple keys at once', async () => {
      mockRedisClient.mGet.mockResolvedValue([
        JSON.stringify({ data: '1' }),
        JSON.stringify({ data: '2' }),
        null
      ]);

      const result = await cache.mget(['key1', 'key2', 'key3']);

      expect(mockRedisClient.mGet).toHaveBeenCalledWith([
        'test:key1',
        'test:key2',
        'test:key3'
      ]);

      expect(result).toEqual({
        key1: { data: '1' },
        key2: { data: '2' }
      });
      expect(result.key3).toBeUndefined();
      expect(cache.metrics.hits).toBe(2);
      expect(cache.metrics.misses).toBe(1);
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockRedisClient.mGet.mockResolvedValue([
        'invalid-json',
        JSON.stringify({ data: 'valid' })
      ]);

      const result = await cache.mget(['key1', 'key2']);

      expect(result).toEqual({
        key2: { data: 'valid' }
      });
      expect(cache.metrics.misses).toBe(1);
    });
  });

  describe('Multi-Set Operations', () => {
    it('should set multiple keys at once', async () => {
      mockRedisClient.mSet.mockResolvedValue('OK');

      const pairs = {
        key1: { data: '1' },
        key2: { data: '2' }
      };

      const result = await cache.mset(pairs, { ttl: 600 });

      expect(mockRedisClient.mSet).toHaveBeenCalled();
      expect(result).toBe(true);
      expect(cache.metrics.sets).toBe(2);
    });

    it('should set TTL for all keys in mset', async () => {
      mockRedisClient.mSet.mockResolvedValue('OK');

      const mockPipeline = {
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([])
      };
      mockRedisClient.multi = vi.fn(() => mockPipeline);

      await cache.mset({ key1: { data: '1' } }, { ttl: 600 });

      expect(mockPipeline.expire).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('Namespace Support', () => {
    it('should build keys with namespace', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ data: 'test' }));

      await cache.get('key1', { namespace: 'users' });

      expect(mockRedisClient.get).toHaveBeenCalledWith('test:users:key1');
    });

    it('should flush specific namespace', async () => {
      mockRedisClient.scan.mockResolvedValue({
        cursor: 0,
        keys: ['test:users:1', 'test:users:2']
      });
      mockRedisClient.del.mockResolvedValue(2);

      const deleted = await cache.flushNamespace('users');

      expect(deleted).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should return fallback on get error', async () => {
      cache.isConnected = false;

      const result = await cache.get('test-key', { fallback: 'default' });

      expect(result).toBe('default');
    });

    it('should return false on set error', async () => {
      cache.isConnected = false;

      const result = await cache.set('test-key', { data: 'test' });

      expect(result).toBe(false);
    });

    it('should handle Redis command errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await cache.get('test-key', { fallback: 'default' });

      expect(result).toBe('default');
      expect(cache.metrics.errors).toBe(1);
    });

    it('should track errors in metrics', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Set failed'));

      await cache.set('test-key', { data: 'test' });

      expect(cache.metrics.errors).toBeGreaterThan(0);
      expect(cache.metrics.lastError).toBeDefined();
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize objects', async () => {
      const testObj = {
        string: 'test',
        number: 123,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { key: 'value' }
      };

      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testObj));

      await cache.set('test-key', testObj);
      const result = await cache.get('test-key');

      expect(result).toEqual(testObj);
    });

    it('should handle Date objects', async () => {
      const date = new Date('2024-01-01');
      const testObj = { timestamp: date };

      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testObj));

      await cache.set('test-key', testObj);
      const result = await cache.get('test-key');

      expect(result.timestamp).toBe(date.toISOString());
    });
  });

  describe('Statistics', () => {
    it('should track hit and miss counts', async () => {
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify({ data: '1' }))
        .mockResolvedValueOnce(null);

      await cache.get('key1');
      await cache.get('key2');

      expect(cache.metrics.hits).toBe(1);
      expect(cache.metrics.misses).toBe(1);
    });

    it('should calculate hit ratio', async () => {
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify({ data: '1' }))
        .mockResolvedValueOnce(JSON.stringify({ data: '2' }))
        .mockResolvedValueOnce(null);

      await cache.get('key1');
      await cache.get('key2');
      await cache.get('key3');

      const stats = cache.getStats();

      expect(stats.hitRatio).toBe('66.67%');
    });

    it('should reset statistics', () => {
      cache.metrics.hits = 10;
      cache.metrics.misses = 5;
      cache.metrics.errors = 2;

      cache.resetStats();

      expect(cache.metrics.hits).toBe(0);
      expect(cache.metrics.misses).toBe(0);
      expect(cache.metrics.errors).toBe(0);
      expect(cache.metrics.lastError).toBeNull();
    });

    it('should track connection attempts', async () => {
      cache.connectionAttempts = 3;

      const stats = cache.getStats();

      expect(stats.connectionAttempts).toBe(3);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when connected', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const health = await cache.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.latency).toBeDefined();
    });

    it('should return unhealthy when not available', async () => {
      cache.isConnected = false;

      const health = await cache.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBeDefined();
    });

    it('should measure ping latency', async () => {
      mockRedisClient.ping.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'PONG';
      });

      const health = await cache.healthCheck();

      expect(health.latency).toMatch(/\d+ms/);
    });
  });

  describe('Memory Information', () => {
    it('should get memory usage from Redis', async () => {
      mockRedisClient.info.mockResolvedValue(
        'used_memory:1024\r\nused_memory_human:1K\r\nused_memory_peak:2048\r\n'
      );

      const memInfo = await cache.getMemoryInfo();

      expect(memInfo).toBeDefined();
      expect(memInfo.used_memory).toBe(1024);
    });

    it('should return null if not available', async () => {
      cache.isConnected = false;

      const memInfo = await cache.getMemoryInfo();

      expect(memInfo).toBeNull();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close connection gracefully', async () => {
      await cache.close();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(cache.isConnected).toBe(false);
      expect(cache.initialized).toBe(false);
    });

    it('should force disconnect on quit failure', async () => {
      mockRedisClient.quit.mockRejectedValue(new Error('Quit failed'));

      await cache.close();

      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('Connection Events', () => {
    it('should set up event handlers', () => {
      const newCache = new RedisCache();
      newCache.client = mockRedisClient;

      expect(mockRedisClient.on).toHaveBeenCalled();
    });
  });
});
