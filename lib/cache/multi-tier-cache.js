/**
 * Multi-Tier Cache System
 * Orchestrates Redis (L2) and Memory (L1) caches for optimal performance
 * Implements cache-aside pattern with automatic failover and intelligent promotion
 */

import { createRedisCache } from "./redis-cache.js";
import { createMemoryCache } from "./memory-cache.js";

class MultiTierCache {
  constructor(options = {}) {
    this.options = {
      // Memory cache settings (L1)
      memoryCache: {
        maxSize: 500, // Smaller for hot data
        maxMemoryMB: 50,
        defaultTtl: 1800, // 30 minutes
        ...options.memoryCache,
      },

      // Redis cache settings (L2)
      redisCache: {
        defaultTtl: 3600, // 1 hour
        keyPrefix: "alocubano:multi:",
        ...options.redisCache,
      },

      // Multi-tier behavior
      promoteToMemoryThreshold: options.promoteToMemoryThreshold || 2, // Promote after N hits
      writeThrough: options.writeThrough !== false, // Write to both layers by default
      fallbackToMemoryOnly: options.fallbackToMemoryOnly !== false,
      ...options,
    };

    // Initialize cache layers
    this.memoryCache = createMemoryCache(this.options.memoryCache);
    this.redisCache = createRedisCache(this.options.redisCache);

    // Promotion tracking for intelligent L1 population
    this.promotionTracking = new Map();

    // Combined metrics
    this.metrics = {
      l1Hits: 0, // Memory cache hits
      l2Hits: 0, // Redis cache hits
      misses: 0, // Complete misses
      promotions: 0, // L2 -> L1 promotions
      writeThrough: 0, // Write-through operations
      fallbacks: 0, // Redis failure fallbacks
      uptime: Date.now(),
    };

    this.initialized = false;
  }

  /**
   * Initialize both cache layers
   */
  async init() {
    if (this.initialized) return true;

    try {
      // Initialize Redis (optional - can fail gracefully)
      const redisSuccess = await this.redisCache.init();
      if (!redisSuccess && !this.options.fallbackToMemoryOnly) {
        console.warn(
          "Redis initialization failed, continuing with memory-only cache",
        );
      }

      console.log("Multi-tier cache initialized successfully");
      this.initialized = true;
      return true;
    } catch (error) {
      console.error("Multi-tier cache initialization error:", error);
      if (this.options.fallbackToMemoryOnly) {
        console.log("Falling back to memory-only cache");
        this.initialized = true;
        return true;
      }
      return false;
    }
  }

  /**
   * Check if Redis layer is available
   */
  isRedisAvailable() {
    return this.redisCache.isAvailable();
  }

  /**
   * Track key access for promotion decisions
   */
  _trackKeyAccess(key) {
    const count = (this.promotionTracking.get(key) || 0) + 1;
    this.promotionTracking.set(key, count);

    // Cleanup tracking map if it gets too large
    if (this.promotionTracking.size > 10000) {
      const entries = Array.from(this.promotionTracking.entries());
      // Keep only the most accessed keys
      entries.sort((a, b) => b[1] - a[1]);
      this.promotionTracking.clear();
      entries.slice(0, 5000).forEach(([k, v]) => {
        this.promotionTracking.set(k, v);
      });
    }

    return count;
  }

  /**
   * Check if key should be promoted to L1
   */
  _shouldPromoteToMemory(key, accessCount) {
    return accessCount >= this.options.promoteToMemoryThreshold;
  }

  /**
   * Get value from multi-tier cache (L1 -> L2 -> miss)
   */
  async get(key, options = {}) {
    const { namespace = "", fallback = null, skipMemory = false } = options;

    // Try L1 (Memory) first unless skipped
    if (!skipMemory) {
      const memoryValue = this.memoryCache.get(key, {
        namespace,
        fallback: null,
      });
      if (memoryValue !== null) {
        this.metrics.l1Hits++;
        this._trackKeyAccess(key);
        return memoryValue;
      }
    }

    // Try L2 (Redis) if available
    if (this.isRedisAvailable()) {
      try {
        const redisValue = await this.redisCache.get(key, {
          namespace,
          fallback: null,
        });
        if (redisValue !== null) {
          this.metrics.l2Hits++;

          // Track access and potentially promote to L1
          const accessCount = this._trackKeyAccess(key);
          if (this._shouldPromoteToMemory(key, accessCount)) {
            // Promote to memory cache with shorter TTL
            const memoryTtl = Math.min(
              this.options.memoryCache.defaultTtl,
              (await this.redisCache.ttl(key, { namespace })) ||
                this.options.memoryCache.defaultTtl,
            );

            this.memoryCache.set(key, redisValue, {
              namespace,
              ttl: memoryTtl,
              type: options.type,
            });
            this.metrics.promotions++;
          }

          return redisValue;
        }
      } catch (error) {
        console.warn(
          "Redis GET error, continuing with fallback:",
          error.message,
        );
        this.metrics.fallbacks++;
      }
    }

    // Complete miss
    this.metrics.misses++;
    return fallback;
  }

  /**
   * Set value in multi-tier cache
   */
  async set(key, value, options = {}) {
    const {
      namespace = "",
      ttl = null,
      type = "default",
      memoryOnly = false,
      redisOnly = false,
      nx = false,
    } = options;

    let memorySuccess = false;
    let redisSuccess = false;

    // Set in memory cache unless redisOnly
    if (!redisOnly) {
      memorySuccess = this.memoryCache.set(key, value, {
        namespace,
        ttl,
        type,
        nx,
      });
    }

    // Set in Redis cache unless memoryOnly
    if (!memoryOnly && this.isRedisAvailable()) {
      try {
        redisSuccess = await this.redisCache.set(key, value, {
          namespace,
          ttl,
          type,
          nx,
        });

        if (redisSuccess && this.options.writeThrough) {
          this.metrics.writeThrough++;
        }
      } catch (error) {
        console.warn("Redis SET error:", error.message);
        this.metrics.fallbacks++;
      }
    }

    // Update access tracking on successful set
    if (memorySuccess || redisSuccess) {
      this._trackKeyAccess(key);
    }

    // Return success if at least one layer succeeded
    return memorySuccess || redisSuccess;
  }

  /**
   * Delete from both cache layers
   */
  async del(key, options = {}) {
    const { namespace = "" } = options;

    let memorySuccess = this.memoryCache.del(key, { namespace });
    let redisSuccess = false;

    if (this.isRedisAvailable()) {
      try {
        redisSuccess = await this.redisCache.del(key, { namespace });
      } catch (error) {
        console.warn("Redis DEL error:", error.message);
        this.metrics.fallbacks++;
      }
    }

    // Remove from promotion tracking
    const cacheKey = this.memoryCache.buildKey(key, namespace);
    this.promotionTracking.delete(cacheKey);

    return memorySuccess || redisSuccess;
  }

  /**
   * Delete pattern from both cache layers
   */
  async delPattern(pattern, options = {}) {
    const { namespace = "" } = options;

    const memoryDeleted = this.memoryCache.delPattern(pattern, { namespace });
    let redisDeleted = 0;

    if (this.isRedisAvailable()) {
      try {
        redisDeleted = await this.redisCache.delPattern(pattern, { namespace });
      } catch (error) {
        console.warn("Redis pattern deletion error:", error.message);
        this.metrics.fallbacks++;
      }
    }

    // Clean up promotion tracking for deleted keys
    const searchPattern = this.memoryCache.buildKey(pattern, namespace);
    const regexPattern = searchPattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\*/g, ".*");
    const regex = new RegExp(`^${regexPattern}$`);

    const keysToRemove = [];
    for (const key of this.promotionTracking.keys()) {
      if (regex.test(key)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => this.promotionTracking.delete(key));

    return Math.max(memoryDeleted, redisDeleted);
  }

  /**
   * Check if key exists in either cache layer
   */
  async exists(key, options = {}) {
    const { namespace = "" } = options;

    // Check memory first
    if (this.memoryCache.exists(key, { namespace })) {
      return true;
    }

    // Check Redis if available
    if (this.isRedisAvailable()) {
      try {
        return await this.redisCache.exists(key, { namespace });
      } catch (error) {
        console.warn("Redis EXISTS error:", error.message);
        this.metrics.fallbacks++;
        return false;
      }
    }

    return false;
  }

  /**
   * Get TTL from appropriate cache layer
   */
  async ttl(key, options = {}) {
    const { namespace = "" } = options;

    // Check memory first
    const memoryTtl = this.memoryCache.ttl(key, { namespace });
    if (memoryTtl > -2) {
      // Key exists in memory
      return memoryTtl;
    }

    // Check Redis if available
    if (this.isRedisAvailable()) {
      try {
        return await this.redisCache.ttl(key, { namespace });
      } catch (error) {
        console.warn("Redis TTL error:", error.message);
        this.metrics.fallbacks++;
        return -1;
      }
    }

    return -2; // Key not found
  }

  /**
   * Extend TTL in both cache layers
   */
  async expire(key, seconds, options = {}) {
    const { namespace = "" } = options;

    let memorySuccess = this.memoryCache.expire(key, seconds, { namespace });
    let redisSuccess = false;

    if (this.isRedisAvailable()) {
      try {
        redisSuccess = await this.redisCache.expire(key, seconds, {
          namespace,
        });
      } catch (error) {
        console.warn("Redis EXPIRE error:", error.message);
        this.metrics.fallbacks++;
      }
    }

    return memorySuccess || redisSuccess;
  }

  /**
   * Atomic increment across cache layers
   */
  async incr(key, options = {}) {
    const {
      namespace = "",
      amount = 1,
      ttl = null,
      type = "default",
    } = options;

    // Try Redis first for consistency
    if (this.isRedisAvailable()) {
      try {
        const result = await this.redisCache.incr(key, {
          namespace,
          amount,
          ttl,
          type,
        });
        if (result !== null) {
          // Update memory cache if the key exists there
          if (this.memoryCache.exists(key, { namespace })) {
            this.memoryCache.set(key, result, { namespace, ttl, type });
          }
          return result;
        }
      } catch (error) {
        console.warn("Redis INCR error:", error.message);
        this.metrics.fallbacks++;
      }
    }

    // Fallback to memory cache
    return this.memoryCache.incr(key, { namespace, amount, ttl, type });
  }

  /**
   * Multi-get from both cache layers
   */
  async mget(keys, options = {}) {
    const { namespace = "", fallback = {} } = options;

    // Get from memory first
    const memoryResults = this.memoryCache.mget(keys, { namespace });
    const missingKeys = keys.filter((key) => !(key in memoryResults));

    // Update metrics for memory hits
    const memoryHits = Object.keys(memoryResults).length;
    this.metrics.l1Hits += memoryHits;

    // If all keys found in memory, return early
    if (missingKeys.length === 0) {
      return memoryResults;
    }

    // Get missing keys from Redis
    let redisResults = {};
    if (this.isRedisAvailable() && missingKeys.length > 0) {
      try {
        redisResults = await this.redisCache.mget(missingKeys, { namespace });

        // Update metrics for Redis hits
        const redisHits = Object.keys(redisResults).length;
        this.metrics.l2Hits += redisHits;

        // Promote frequently accessed keys to memory
        Object.entries(redisResults).forEach(([key, value]) => {
          const accessCount = this._trackKeyAccess(key);
          if (this._shouldPromoteToMemory(key, accessCount)) {
            this.memoryCache.set(key, value, {
              namespace,
              ttl: this.options.memoryCache.defaultTtl,
              type: options.type,
            });
            this.metrics.promotions++;
          }
        });
      } catch (error) {
        console.warn("Redis MGET error:", error.message);
        this.metrics.fallbacks++;
      }
    }

    // Count complete misses
    const totalFound =
      Object.keys(memoryResults).length + Object.keys(redisResults).length;
    this.metrics.misses += keys.length - totalFound;

    // Combine results
    return { ...memoryResults, ...redisResults };
  }

  /**
   * Multi-set to both cache layers
   */
  async mset(keyValuePairs, options = {}) {
    const { namespace = "", ttl = null, type = "default" } = options;

    let memorySuccess = this.memoryCache.mset(keyValuePairs, {
      namespace,
      ttl,
      type,
    });
    let redisSuccess = false;

    if (this.isRedisAvailable()) {
      try {
        redisSuccess = await this.redisCache.mset(keyValuePairs, {
          namespace,
          ttl,
          type,
        });

        if (redisSuccess) {
          this.metrics.writeThrough++;
        }
      } catch (error) {
        console.warn("Redis MSET error:", error.message);
        this.metrics.fallbacks++;
      }
    }

    // Track access for all keys
    Object.keys(keyValuePairs).forEach((key) => {
      this._trackKeyAccess(key);
    });

    return memorySuccess || redisSuccess;
  }

  /**
   * Warm cache with data
   */
  async warmCache(keyValuePairs, options = {}) {
    const {
      namespace = "",
      ttl = null,
      type = "static",
      forceMemory = true, // Force promotion to memory for warm data
    } = options;

    console.log(
      `Warming cache with ${Object.keys(keyValuePairs).length} items`,
    );

    // Set in both layers
    const success = await this.mset(keyValuePairs, { namespace, ttl, type });

    // Force promotion to memory if requested
    if (forceMemory && success) {
      Object.keys(keyValuePairs).forEach((key) => {
        // Set high access count to ensure memory promotion
        this.promotionTracking.set(
          this.memoryCache.buildKey(key, namespace),
          this.options.promoteToMemoryThreshold,
        );
      });

      console.log(
        `Promoted ${Object.keys(keyValuePairs).length} items to memory cache`,
      );
    }

    return success;
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStats() {
    const memoryStats = this.memoryCache.getStats();
    const redisStats = this.isRedisAvailable()
      ? await this.redisCache.getStats()
      : null;

    const totalHits = this.metrics.l1Hits + this.metrics.l2Hits;
    const totalRequests = totalHits + this.metrics.misses;
    const overallHitRatio =
      totalRequests > 0 ? ((totalHits / totalRequests) * 100).toFixed(2) : "0";

    return {
      overall: {
        ...this.metrics,
        totalHits,
        totalRequests,
        overallHitRatio: `${overallHitRatio}%`,
        uptime: Date.now() - this.metrics.uptime,
        promotionTrackingSize: this.promotionTracking.size,
        redisAvailable: this.isRedisAvailable(),
      },
      memory: memoryStats,
      redis: redisStats,
    };
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    Object.keys(this.metrics).forEach((key) => {
      if (typeof this.metrics[key] === "number") {
        this.metrics[key] = 0;
      }
    });
    this.metrics.uptime = Date.now();

    this.memoryCache.resetStats();
    if (this.isRedisAvailable()) {
      this.redisCache.resetStats();
    }

    // Clear promotion tracking
    this.promotionTracking.clear();
  }

  /**
   * Health check for both cache layers
   */
  async healthCheck() {
    const memoryHealth = this.memoryCache.healthCheck();
    const redisHealth = this.isRedisAvailable()
      ? await this.redisCache.healthCheck()
      : { status: "unavailable", error: "Redis not connected" };

    const overallStatus =
      memoryHealth.status === "healthy" &&
      (redisHealth.status === "healthy" || redisHealth.status === "unavailable")
        ? "healthy"
        : "degraded";

    return {
      status: overallStatus,
      layers: {
        memory: memoryHealth,
        redis: redisHealth,
      },
      stats: await this.getStats(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Flush specific namespace from both layers
   */
  async flushNamespace(namespace) {
    if (!namespace) {
      throw new Error("Namespace is required for flush operation");
    }

    const memoryDeleted = this.memoryCache.flushNamespace(namespace);
    let redisDeleted = 0;

    if (this.isRedisAvailable()) {
      try {
        redisDeleted = await this.redisCache.flushNamespace(namespace);
      } catch (error) {
        console.warn("Redis namespace flush error:", error.message);
        this.metrics.fallbacks++;
      }
    }

    console.log(
      `Flushed namespace '${namespace}': ${memoryDeleted} from memory, ${redisDeleted} from Redis`,
    );
    return Math.max(memoryDeleted, redisDeleted);
  }

  /**
   * Close both cache layers gracefully
   */
  async close() {
    console.log("Closing multi-tier cache...");

    if (this.memoryCache) {
      this.memoryCache.close();
    }

    if (this.redisCache && this.isRedisAvailable()) {
      await this.redisCache.close();
    }

    // Clear promotion tracking
    this.promotionTracking.clear();
    this.initialized = false;

    console.log("Multi-tier cache closed successfully");
  }
}

// Create singleton instance
let multiTierInstance = null;

export function createMultiTierCache(options = {}) {
  if (!multiTierInstance) {
    multiTierInstance = new MultiTierCache(options);
  }
  return multiTierInstance;
}

export { MultiTierCache };
