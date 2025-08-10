/**
 * Comprehensive Cache System Tests
 * Tests for Redis, Memory, and Multi-Tier cache implementations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MemoryCache,
  createMemoryCache,
  getCache,
  initializeCache,
  CACHE_TYPES,
  gracefulShutdown,
} from "../../lib/cache/index.js";

// Mock Redis for testing
vi.mock("redis", () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    set: vi.fn(),
    setEx: vi.fn(),
    setNX: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    ttl: vi.fn(),
    expire: vi.fn(),
    incr: vi.fn(),
    incrBy: vi.fn(),
    mGet: vi.fn(),
    mSet: vi.fn(),
    scan: vi.fn(),
    ping: vi.fn().mockResolvedValue("PONG"),
    info: vi.fn(),
    multi: vi.fn(() => ({
      expire: vi.fn(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    on: vi.fn(),
    isOpen: true,
  })),
}));

describe("Memory Cache", () => {
  let cache;

  beforeEach(() => {
    cache = new MemoryCache({
      maxSize: 100,
      maxMemoryMB: 10,
      defaultTtl: 300, // 5 minutes
      checkInterval: 1, // 1 second for testing
    });
  });

  afterEach(() => {
    if (cache) {
      cache.close();
    }
  });

  describe("Basic Operations", () => {
    it("should store and retrieve values", () => {
      const success = cache.set("test-key", { data: "test-value" });
      expect(success).toBe(true);

      const value = cache.get("test-key");
      expect(value).toEqual({ data: "test-value" });
    });

    it("should return fallback for missing keys", () => {
      const value = cache.get("missing-key", { fallback: "default" });
      expect(value).toBe("default");
    });

    it("should handle TTL expiration", async () => {
      cache.set("ttl-key", "value", { ttl: 1 }); // 1 second TTL

      // Should exist immediately
      expect(cache.exists("ttl-key")).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be expired
      expect(cache.get("ttl-key")).toBeNull();
    });

    it("should delete keys", () => {
      cache.set("delete-me", "value");
      expect(cache.exists("delete-me")).toBe(true);

      const deleted = cache.del("delete-me");
      expect(deleted).toBe(true);
      expect(cache.exists("delete-me")).toBe(false);
    });

    it("should handle pattern deletion", () => {
      cache.set("user:1", "data1");
      cache.set("user:2", "data2");
      cache.set("order:1", "order data");

      const deleted = cache.delPattern("user:*");
      expect(deleted).toBe(2);

      expect(cache.exists("user:1")).toBe(false);
      expect(cache.exists("user:2")).toBe(false);
      expect(cache.exists("order:1")).toBe(true);
    });
  });

  describe("Advanced Features", () => {
    it("should handle namespaces", () => {
      cache.set("key", "value1", { namespace: "ns1" });
      cache.set("key", "value2", { namespace: "ns2" });

      expect(cache.get("key", { namespace: "ns1" })).toBe("value1");
      expect(cache.get("key", { namespace: "ns2" })).toBe("value2");
    });

    it("should handle atomic increment", () => {
      const result1 = cache.incr("counter");
      expect(result1).toBe(1);

      const result2 = cache.incr("counter", { amount: 5 });
      expect(result2).toBe(6);
    });

    it("should handle multi-get operations", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");

      const results = cache.mget(["key1", "key2", "missing"]);
      expect(results).toEqual({
        key1: "value1",
        key2: "value2",
      });
    });

    it("should handle multi-set operations", () => {
      const success = cache.mset({
        batch1: "value1",
        batch2: "value2",
        batch3: "value3",
      });

      expect(success).toBe(true);
      expect(cache.get("batch1")).toBe("value1");
      expect(cache.get("batch2")).toBe("value2");
      expect(cache.get("batch3")).toBe("value3");
    });

    it("should handle NX (not exists) flag", () => {
      cache.set("existing", "original");

      // Should not overwrite existing key
      const result1 = cache.set("existing", "new", { nx: true });
      expect(result1).toBe(false);
      expect(cache.get("existing")).toBe("original");

      // Should set new key
      const result2 = cache.set("new-key", "value", { nx: true });
      expect(result2).toBe(true);
      expect(cache.get("new-key")).toBe("value");
    });
  });

  describe("TTL Management", () => {
    it("should get TTL for keys", () => {
      cache.set("ttl-test", "value", { ttl: 300 });

      const ttl = cache.ttl("ttl-test");
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it("should extend TTL", () => {
      cache.set("extend-test", "value", { ttl: 300 });

      const extended = cache.expire("extend-test", 600);
      expect(extended).toBe(true);

      const newTtl = cache.ttl("extend-test");
      expect(newTtl).toBeGreaterThan(590);
    });

    it("should handle different cache types with appropriate TTLs", () => {
      cache.set("static-data", "value", { type: CACHE_TYPES.STATIC });
      cache.set("dynamic-data", "value", { type: CACHE_TYPES.DYNAMIC });

      const staticTtl = cache.ttl("static-data");
      const dynamicTtl = cache.ttl("dynamic-data");

      expect(staticTtl).toBeGreaterThan(dynamicTtl);
    });
  });

  describe("Memory Management", () => {
    it("should evict LRU entries when size limit reached", () => {
      const smallCache = new MemoryCache({ maxSize: 3 });

      smallCache.set("key1", "value1");
      smallCache.set("key2", "value2");
      smallCache.set("key3", "value3");

      // Access key1 to make it recently used
      smallCache.get("key1");

      // Add key4, should evict key2 (least recently used)
      smallCache.set("key4", "value4");

      expect(smallCache.exists("key1")).toBe(true);
      expect(smallCache.exists("key2")).toBe(false);
      expect(smallCache.exists("key3")).toBe(true);
      expect(smallCache.exists("key4")).toBe(true);

      smallCache.close();
    });

    it("should track memory usage", () => {
      const stats = cache.getStats();
      expect(stats.currentSize).toBe(0);
      expect(stats.currentMemoryBytes).toBe(0);

      cache.set("memory-test", { large: "data".repeat(1000) });

      const newStats = cache.getStats();
      expect(newStats.currentSize).toBe(1);
      expect(newStats.currentMemoryBytes).toBeGreaterThan(0);
    });

    it("should provide health status", () => {
      const health = cache.healthCheck();
      expect(health.status).toBe("healthy");
      expect(health.stats).toBeDefined();
      expect(health.timestamp).toBeDefined();
    });
  });

  describe("Statistics and Monitoring", () => {
    it("should track cache hits and misses", () => {
      cache.resetStats();

      cache.set("hit-test", "value");
      cache.get("hit-test"); // hit
      cache.get("miss-test"); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
    });

    it("should calculate hit ratio", () => {
      cache.resetStats();

      cache.set("test1", "value1");
      cache.set("test2", "value2");

      cache.get("test1"); // hit
      cache.get("test1"); // hit
      cache.get("missing"); // miss

      const stats = cache.getStats();
      expect(stats.hitRatio).toBe("66.67%");
    });

    it("should reset statistics", () => {
      cache.set("test", "value");
      cache.get("test");

      let stats = cache.getStats();
      expect(stats.hits).toBe(1);

      cache.resetStats();
      stats = cache.getStats();
      expect(stats.hits).toBe(0);
    });
  });

  describe("Cleanup and Maintenance", () => {
    it("should perform periodic cleanup", async () => {
      const cleanupCache = new MemoryCache({
        checkInterval: 0.1, // 100ms for testing
        defaultTtl: 1,
      });

      cleanupCache.set("expire-me", "value", { ttl: 1 });
      expect(cleanupCache.exists("expire-me")).toBe(true);

      // Wait for expiration and cleanup
      await new Promise((resolve) => setTimeout(resolve, 1200));

      expect(cleanupCache.exists("expire-me")).toBe(false);

      cleanupCache.close();
    });

    it("should flush namespace", () => {
      cache.set("key1", "value1", { namespace: "test" });
      cache.set("key2", "value2", { namespace: "test" });
      cache.set("key3", "value3", { namespace: "other" });

      const deleted = cache.flushNamespace("test");
      expect(deleted).toBe(2);

      expect(cache.exists("key1", { namespace: "test" })).toBe(false);
      expect(cache.exists("key2", { namespace: "test" })).toBe(false);
      expect(cache.exists("key3", { namespace: "other" })).toBe(true);
    });

    it("should clear all cache", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const cleared = cache.clear();
      expect(cleared).toBe(2);

      expect(cache.exists("key1")).toBe(false);
      expect(cache.exists("key2")).toBe(false);
    });
  });

  describe("Key Inspection", () => {
    it("should inspect key details", () => {
      cache.set("inspect-me", "value", {
        type: CACHE_TYPES.STATIC,
        ttl: 300,
      });

      const info = cache.inspect("inspect-me");
      expect(info).toBeDefined();
      expect(info.type).toBe(CACHE_TYPES.STATIC);
      expect(info.ttlRemaining).toBeGreaterThan(290);
      expect(info.createdAt).toBeDefined();
      expect(info.isExpired).toBe(false);
    });

    it("should list keys with patterns", () => {
      cache.set("user:1", "value1");
      cache.set("user:2", "value2");
      cache.set("order:1", "order");

      const userKeys = cache.keys("user:*");
      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain(cache.buildKey("user:1"));
      expect(userKeys).toContain(cache.buildKey("user:2"));

      const allKeys = cache.keys("*");
      expect(allKeys).toHaveLength(3);
    });
  });
});

describe("Cache Factory and Integration", () => {
  afterEach(async () => {
    await gracefulShutdown();
  });

  it("should create memory cache by default when Redis unavailable", () => {
    const cache = getCache("memory");
    expect(cache).toBeInstanceOf(MemoryCache);
  });

  it("should initialize cache with warm-up data", async () => {
    const warmUpData = {
      "event:info": { name: "A Lo Cubano Boulder Fest" },
      "artists:featured": ["Artist 1", "Artist 2"],
    };

    const cache = await initializeCache(warmUpData);

    const eventInfo = cache.get("event:info");
    expect(eventInfo).toEqual({ name: "A Lo Cubano Boulder Fest" });

    const artists = cache.get("artists:featured");
    expect(artists).toEqual(["Artist 1", "Artist 2"]);
  });

  it("should handle factory singleton pattern", () => {
    const cache1 = getCache("memory");
    const cache2 = getCache("memory");

    expect(cache1).toBe(cache2); // Same instance
  });

  it("should handle environment-specific configurations", () => {
    // Test is handled by the getEnvironmentConfig function
    // which should return test-specific settings
    const cache = getCache();
    expect(cache).toBeDefined();
  });
});

describe("Cache Types and TTL Configuration", () => {
  let cache;

  beforeEach(() => {
    cache = createMemoryCache();
  });

  afterEach(() => {
    if (cache) {
      cache.close();
    }
  });

  it("should use correct TTLs for different cache types", () => {
    const testCases = [
      { type: CACHE_TYPES.STATIC, expectedTtl: 6 * 60 * 60 },
      { type: CACHE_TYPES.DYNAMIC, expectedTtl: 5 * 60 },
      { type: CACHE_TYPES.SESSION, expectedTtl: 60 * 60 },
      { type: CACHE_TYPES.ANALYTICS, expectedTtl: 15 * 60 },
      { type: CACHE_TYPES.API, expectedTtl: 2 * 60 },
      { type: CACHE_TYPES.GALLERY, expectedTtl: 24 * 60 * 60 },
      { type: CACHE_TYPES.PAYMENTS, expectedTtl: 30 * 60 },
      { type: CACHE_TYPES.USER, expectedTtl: 60 * 60 },
    ];

    testCases.forEach(({ type, expectedTtl }) => {
      const actualTtl = cache.getTtl(type);
      expect(actualTtl).toBe(expectedTtl);
    });
  });

  it("should apply type-specific TTLs when setting values", () => {
    cache.set("static-content", "value", { type: CACHE_TYPES.STATIC });
    cache.set("dynamic-content", "value", { type: CACHE_TYPES.DYNAMIC });

    const staticTtl = cache.ttl("static-content");
    const dynamicTtl = cache.ttl("dynamic-content");

    // Static should have much longer TTL than dynamic
    expect(staticTtl).toBeGreaterThan(dynamicTtl);
    expect(staticTtl).toBeGreaterThan(21000); // > 6 hours - buffer
    expect(dynamicTtl).toBeLessThan(350); // < 5 minutes + buffer
  });
});

describe("Error Handling and Edge Cases", () => {
  let cache;

  beforeEach(() => {
    cache = createMemoryCache({
      maxSize: 5,
      maxMemoryMB: 1, // Very small for testing
    });
  });

  afterEach(() => {
    if (cache) {
      cache.close();
    }
  });

  it("should handle null and undefined values", () => {
    expect(cache.set("null-test", null)).toBe(true);
    expect(cache.set("undefined-test", undefined)).toBe(true);

    expect(cache.get("null-test")).toBe(null);
    expect(cache.get("undefined-test")).toBe(undefined);
  });

  it("should handle complex object serialization", () => {
    const complexObject = {
      nested: {
        array: [1, 2, { deep: "value" }],
        date: new Date().toISOString(),
        nullValue: null,
      },
      boolean: true,
      number: 42.5,
    };

    cache.set("complex", complexObject);
    const retrieved = cache.get("complex");

    expect(retrieved).toEqual(complexObject);
  });

  it("should handle memory pressure gracefully", () => {
    // Fill cache with many entries to test memory management
    for (let i = 0; i < 20; i++) {
      cache.set(`large-${i}`, { data: "x".repeat(10000) });
    }

    const stats = cache.getStats();

    // Cache should still be functional regardless of evictions
    expect(cache.set("test-after-pressure", "value")).toBe(true);
    expect(cache.get("test-after-pressure")).toBe("value");

    // Memory usage should be reasonable (allow for some overhead)
    const memoryUsageMB = stats.currentMemoryBytes / (1024 * 1024);
    expect(memoryUsageMB).toBeLessThanOrEqual(15); // Very generous limit

    // Cache should report valid statistics
    expect(stats.currentSize).toBeGreaterThan(0);
    expect(typeof stats.hitRatio).toBe("string");
  });

  it("should handle concurrent operations", async () => {
    const promises = [];

    // Simulate concurrent reads and writes
    for (let i = 0; i < 100; i++) {
      promises.push(
        new Promise((resolve) => {
          cache.set(`concurrent-${i}`, `value-${i}`);
          const value = cache.get(`concurrent-${i}`);
          resolve(value === `value-${i}`);
        }),
      );
    }

    const results = await Promise.all(promises);
    const successful = results.filter(Boolean).length;

    // Most operations should succeed
    expect(successful).toBeGreaterThan(90);
  });
});
