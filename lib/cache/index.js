/**
 * Cache System Index
 * Centralized cache management with automatic configuration and environment detection
 */

import { createRedisCache, RedisCache } from "./redis-cache.js";
import { createMemoryCache, MemoryCache } from "./memory-cache.js";
import { createMultiTierCache, MultiTierCache } from "./multi-tier-cache.js";

/**
 * Cache type constants
 */
export const CACHE_TYPES = {
  STATIC: "static", // Event info, artists (6 hours)
  DYNAMIC: "dynamic", // Ticket availability (5 minutes)
  SESSION: "session", // User sessions (1 hour)
  ANALYTICS: "analytics", // Analytics data (15 minutes)
  API: "api", // API responses (2 minutes)
  GALLERY: "gallery", // Gallery data (24 hours)
  PAYMENTS: "payments", // Payment data (30 minutes)
  USER: "user", // User data (1 hour)
};

/**
 * Pre-configured cache instances for common use cases
 */
export const CACHE_CONFIGS = {
  // High-performance memory cache for hot data
  memory: {
    maxSize: 1000,
    maxMemoryMB: 100,
    defaultTtl: 1800, // 30 minutes
    checkInterval: 60,
  },

  // Redis cache for distributed caching
  redis: {
    keyPrefix: "alocubano:",
    defaultTtl: 3600, // 1 hour
    database: 0,
  },

  // Multi-tier cache with intelligent promotion
  multiTier: {
    memoryCache: {
      maxSize: 500,
      maxMemoryMB: 50,
      defaultTtl: 1800,
    },
    redisCache: {
      keyPrefix: "alocubano:multi:",
      defaultTtl: 3600,
    },
    promoteToMemoryThreshold: 2,
    writeThrough: true,
    fallbackToMemoryOnly: true,
  },

  // Production optimized for A Lo Cubano
  production: {
    memoryCache: {
      maxSize: 2000,
      maxMemoryMB: 200,
      defaultTtl: 3600,
      checkInterval: 120,
      ttlConfig: {
        [CACHE_TYPES.STATIC]: 6 * 60 * 60, // Static data: 6 hours
        [CACHE_TYPES.DYNAMIC]: 5 * 60, // Dynamic data: 5 minutes
        [CACHE_TYPES.SESSION]: 60 * 60, // Sessions: 1 hour
        [CACHE_TYPES.ANALYTICS]: 15 * 60, // Analytics: 15 minutes
        [CACHE_TYPES.API]: 2 * 60, // API: 2 minutes
        [CACHE_TYPES.GALLERY]: 24 * 60 * 60, // Gallery: 24 hours
        [CACHE_TYPES.PAYMENTS]: 30 * 60, // Payments: 30 minutes
        [CACHE_TYPES.USER]: 60 * 60, // User data: 1 hour
      },
    },
    redisCache: {
      keyPrefix: "alocubano:prod:",
      defaultTtl: 3600,
      ttlConfig: {
        [CACHE_TYPES.STATIC]: 6 * 60 * 60,
        [CACHE_TYPES.DYNAMIC]: 5 * 60,
        [CACHE_TYPES.SESSION]: 60 * 60,
        [CACHE_TYPES.ANALYTICS]: 15 * 60,
        [CACHE_TYPES.API]: 2 * 60,
        [CACHE_TYPES.GALLERY]: 24 * 60 * 60,
        [CACHE_TYPES.PAYMENTS]: 30 * 60,
        [CACHE_TYPES.USER]: 60 * 60,
      },
    },
    promoteToMemoryThreshold: 3,
    writeThrough: true,
    fallbackToMemoryOnly: true,
  },

  // Development configuration
  development: {
    memoryCache: {
      maxSize: 100,
      maxMemoryMB: 25,
      defaultTtl: 300, // 5 minutes for faster testing
      checkInterval: 30,
    },
    redisCache: {
      keyPrefix: "alocubano:dev:",
      defaultTtl: 600, // 10 minutes
    },
    promoteToMemoryThreshold: 1, // Promote immediately for testing
    writeThrough: true,
    fallbackToMemoryOnly: true,
  },
};

/**
 * Detect environment and return appropriate configuration
 */
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || "development";

  switch (env) {
    case "production":
      return CACHE_CONFIGS.production;
    case "test":
      return {
        ...CACHE_CONFIGS.development,
        memoryCache: {
          ...CACHE_CONFIGS.development.memoryCache,
          maxSize: 50,
          maxMemoryMB: 10,
          defaultTtl: 60, // 1 minute for tests
        },
      };
    case "development":
    default:
      return CACHE_CONFIGS.development;
  }
}

/**
 * Cache factory with automatic environment detection
 */
class CacheFactory {
  constructor() {
    this.instances = new Map();
  }

  /**
   * Create or get cache instance
   */
  getInstance(type = "auto", config = null) {
    const key = `${type}_${config ? JSON.stringify(config) : "default"}`;

    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    let instance;
    const environmentConfig = getEnvironmentConfig();

    switch (type) {
      case "memory":
        instance = createMemoryCache(config || CACHE_CONFIGS.memory);
        break;

      case "redis":
        instance = createRedisCache(config || CACHE_CONFIGS.redis);
        break;

      case "multi-tier":
      case "multi":
        instance = createMultiTierCache(config || environmentConfig);
        break;

      case "auto":
      default:
        // Auto-detect best cache based on environment
        if (process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING) {
          console.log("Redis detected, using multi-tier cache");
          instance = createMultiTierCache(config || environmentConfig);
        } else {
          console.log("Redis not detected, using memory cache only");
          instance = createMemoryCache(config || environmentConfig.memoryCache);
        }
        break;
    }

    this.instances.set(key, instance);
    return instance;
  }

  /**
   * Close all cache instances
   */
  async closeAll() {
    const promises = [];
    for (const instance of this.instances.values()) {
      if (typeof instance.close === "function") {
        promises.push(instance.close());
      }
    }

    await Promise.allSettled(promises);
    this.instances.clear();
    console.log("All cache instances closed");
  }

  /**
   * Get health status of all instances
   */
  async getHealthStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      instances: {},
    };

    for (const [key, instance] of this.instances.entries()) {
      try {
        if (typeof instance.healthCheck === "function") {
          status.instances[key] = await instance.healthCheck();
        } else {
          status.instances[key] = {
            status: "unknown",
            message: "Health check not supported",
          };
        }
      } catch (error) {
        status.instances[key] = {
          status: "error",
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    }

    return status;
  }
}

// Global factory instance
const cacheFactory = new CacheFactory();

/**
 * Get default cache instance (auto-configured)
 */
export function getCache(type = "auto", config = null) {
  return cacheFactory.getInstance(type, config);
}

/**
 * Initialize cache with warm-up data
 */
export async function initializeCache(warmUpData = {}) {
  const cache = getCache();

  // Initialize if needed
  if (typeof cache.init === "function") {
    await cache.init();
  }

  // Warm up cache if data provided
  if (Object.keys(warmUpData).length > 0) {
    console.log("Warming up cache with initial data...");

    if (typeof cache.warmCache === "function") {
      await cache.warmCache(warmUpData, { type: CACHE_TYPES.STATIC });
    } else {
      // Fallback for single-layer caches
      const promises = Object.entries(warmUpData).map(([key, value]) =>
        cache.set(key, value, { type: CACHE_TYPES.STATIC }),
      );
      await Promise.allSettled(promises);
    }

    console.log(`Cache warmed with ${Object.keys(warmUpData).length} items`);
  }

  return cache;
}

/**
 * Cache middleware for API responses
 */
export function createCacheMiddleware(options = {}) {
  const {
    type = CACHE_TYPES.API,
    namespace = "middleware",
    ttl = null,
    keyGenerator = (req) => `${req.method}:${req.url}`,
    skipCache = () => false,
  } = options;

  const cache = getCache();

  return async (req, res, next) => {
    // Skip caching for non-GET requests by default
    if (req.method !== "GET" || skipCache(req)) {
      return next();
    }

    const cacheKey = keyGenerator(req);

    try {
      // Try to get from cache
      const cached = await (typeof cache.get === "function"
        ? cache.get(cacheKey, { namespace })
        : cache.get(cacheKey, { namespace }));

      if (cached) {
        res.setHeader("X-Cache", "HIT");
        return res.json(cached);
      }

      // Cache miss - intercept response
      const originalJson = res.json;
      res.json = function (data) {
        // Cache the response
        if (res.statusCode === 200 && data) {
          const cachePromise =
            typeof cache.set === "function"
              ? cache.set(cacheKey, data, { namespace, ttl, type })
              : cache.set(cacheKey, data, { namespace, ttl, type });

          // Don't wait for cache operation
          cachePromise.catch((error) =>
            console.warn("Cache middleware error:", error.message),
          );
        }

        res.setHeader("X-Cache", "MISS");
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.warn("Cache middleware error:", error.message);
      next();
    }
  };
}

/**
 * Graceful shutdown handler
 */
export async function gracefulShutdown() {
  console.log("Shutting down cache system...");
  await cacheFactory.closeAll();
}

// Export classes and factory
export {
  RedisCache,
  MemoryCache,
  MultiTierCache,
  cacheFactory,
  createRedisCache,
  createMemoryCache,
  createMultiTierCache,
};

// Handle process shutdown
if (typeof process !== "undefined") {
  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}
