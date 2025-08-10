/**
 * Redis Cache Layer
 * Production-ready Redis caching with automatic retry, connection pooling, and comprehensive monitoring
 */

import { createClient } from "redis";
import { promisify } from "util";

class RedisCache {
  constructor(options = {}) {
    this.options = {
      url:
        process.env.REDIS_URL ||
        process.env.REDIS_CONNECTION_STRING ||
        "redis://localhost:6379",
      socket: {
        connectTimeout: 5000,
        commandTimeout: 2000,
        reconnectDelay: 1000,
        maxRetryDelay: 30000,
        retryDelayOnClusterDown: 300,
        retryDelayOnFailover: 100,
        maxRetryCount: 3,
        keepAlive: true,
        noDelay: true,
      },
      database: options.database || 0,
      keyPrefix: options.keyPrefix || "alocubano:",
      defaultTtl: options.defaultTtl || 3600, // 1 hour default
      maxMemoryPolicy: "allkeys-lru",
      ...options,
    };

    // Cache configuration by data type
    this.ttlConfig = {
      static: 6 * 60 * 60, // Static data (event info, artists): 6 hours
      dynamic: 5 * 60, // Dynamic data (ticket availability): 5 minutes
      session: 60 * 60, // User sessions: 1 hour
      analytics: 15 * 60, // Analytics: 15 minutes
      api: 2 * 60, // API responses: 2 minutes
      gallery: 24 * 60 * 60, // Gallery data: 24 hours
      payments: 30 * 60, // Payment data: 30 minutes
      user: 60 * 60, // User data: 1 hour
      ...options.ttlConfig,
    };

    this.client = null;
    this.isConnected = false;
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      sets: 0,
      deletes: 0,
      connects: 0,
      disconnects: 0,
      lastError: null,
      uptime: Date.now(),
    };

    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 10;
    this.initialized = false;
  }

  /**
   * Initialize Redis connection with automatic retry
   */
  async init() {
    if (this.initialized) return true;

    try {
      this.client = createClient({
        url: this.options.url,
        socket: this.options.socket,
        database: this.options.database,
        name: "alocubano-cache",
      });

      // Error handling
      this.client.on("error", (err) => {
        console.error("Redis Cache Error:", err);
        this.metrics.errors++;
        this.metrics.lastError = {
          message: err.message,
          timestamp: Date.now(),
        };
        this.isConnected = false;
      });

      this.client.on("connect", () => {
        console.log("Redis Cache Connected");
        this.isConnected = true;
        this.metrics.connects++;
        this.connectionAttempts = 0;
      });

      this.client.on("disconnect", () => {
        console.log("Redis Cache Disconnected");
        this.isConnected = false;
        this.metrics.disconnects++;
      });

      this.client.on("reconnecting", () => {
        console.log("Redis Cache Reconnecting...");
        this.connectionAttempts++;
      });

      this.client.on("ready", () => {
        console.log("Redis Cache Ready");
        this.isConnected = true;
      });

      // Connect with timeout
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Redis connection timeout")),
            10000,
          ),
        ),
      ]);

      this.initialized = true;
      console.log("Redis Cache initialized successfully");
      return true;
    } catch (error) {
      console.warn("Redis Cache initialization failed:", error.message);
      this.initialized = false;
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Check if Redis is available and connected
   */
  isAvailable() {
    return this.initialized && this.isConnected && this.client?.isOpen;
  }

  /**
   * Get TTL for data type
   */
  getTtl(type = "default") {
    return this.ttlConfig[type] || this.options.defaultTtl;
  }

  /**
   * Build cache key with prefix
   */
  buildKey(key, namespace = "") {
    const parts = [this.options.keyPrefix];
    if (namespace) parts.push(namespace);
    parts.push(key);
    return parts.join(":");
  }

  /**
   * Get value from cache
   */
  async get(key, options = {}) {
    const { namespace = "", fallback = null } = options;

    if (!this.isAvailable()) {
      console.warn("Redis not available for GET operation");
      return fallback;
    }

    try {
      const cacheKey = this.buildKey(key, namespace);
      const value = await this.client.get(cacheKey);

      if (value === null) {
        this.metrics.misses++;
        return fallback;
      }

      this.metrics.hits++;
      return JSON.parse(value);
    } catch (error) {
      console.error("Redis GET error:", error);
      this.metrics.errors++;
      return fallback;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key, value, options = {}) {
    const {
      namespace = "",
      ttl = null,
      type = "default",
      nx = false, // Only set if not exists
    } = options;

    if (!this.isAvailable()) {
      console.warn("Redis not available for SET operation");
      return false;
    }

    try {
      const cacheKey = this.buildKey(key, namespace);
      const serialized = JSON.stringify(value);
      const ttlSeconds = ttl || this.getTtl(type);

      let result;
      if (nx) {
        result = await this.client.setNX(cacheKey, serialized);
        if (result) {
          await this.client.expire(cacheKey, ttlSeconds);
        }
      } else {
        result = await this.client.setEx(cacheKey, ttlSeconds, serialized);
      }

      if (result) {
        this.metrics.sets++;
        return true;
      }
      return false;
    } catch (error) {
      console.error("Redis SET error:", error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Delete single key
   */
  async del(key, options = {}) {
    const { namespace = "" } = options;

    if (!this.isAvailable()) {
      console.warn("Redis not available for DEL operation");
      return false;
    }

    try {
      const cacheKey = this.buildKey(key, namespace);
      const result = await this.client.del(cacheKey);

      if (result > 0) {
        this.metrics.deletes++;
        return true;
      }
      return false;
    } catch (error) {
      console.error("Redis DEL error:", error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async delPattern(pattern, options = {}) {
    const { namespace = "", batchSize = 100 } = options;

    if (!this.isAvailable()) {
      console.warn("Redis not available for pattern deletion");
      return 0;
    }

    try {
      const searchPattern = this.buildKey(pattern, namespace);
      const keys = [];
      let cursor = 0;
      let deletedCount = 0;

      // Scan for matching keys
      do {
        const result = await this.client.scan(cursor, {
          MATCH: searchPattern,
          COUNT: batchSize,
        });

        cursor = result.cursor;
        if (result.keys && result.keys.length > 0) {
          keys.push(...result.keys);
        }

        // Delete in batches to avoid blocking
        if (keys.length >= batchSize || cursor === 0) {
          if (keys.length > 0) {
            const deleted = await this.client.del(keys);
            deletedCount += deleted;
            this.metrics.deletes += deleted;
            keys.length = 0; // Clear array
          }
        }
      } while (cursor !== 0);

      console.log(
        `Deleted ${deletedCount} keys matching pattern: ${searchPattern}`,
      );
      return deletedCount;
    } catch (error) {
      console.error("Redis pattern deletion error:", error);
      this.metrics.errors++;
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key, options = {}) {
    const { namespace = "" } = options;

    if (!this.isAvailable()) {
      return false;
    }

    try {
      const cacheKey = this.buildKey(key, namespace);
      const result = await this.client.exists(cacheKey);
      return result === 1;
    } catch (error) {
      console.error("Redis EXISTS error:", error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key, options = {}) {
    const { namespace = "" } = options;

    if (!this.isAvailable()) {
      return -1;
    }

    try {
      const cacheKey = this.buildKey(key, namespace);
      return await this.client.ttl(cacheKey);
    } catch (error) {
      console.error("Redis TTL error:", error);
      this.metrics.errors++;
      return -1;
    }
  }

  /**
   * Extend TTL for key
   */
  async expire(key, seconds, options = {}) {
    const { namespace = "" } = options;

    if (!this.isAvailable()) {
      return false;
    }

    try {
      const cacheKey = this.buildKey(key, namespace);
      const result = await this.client.expire(cacheKey, seconds);
      return result === 1;
    } catch (error) {
      console.error("Redis EXPIRE error:", error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Atomic increment
   */
  async incr(key, options = {}) {
    const {
      namespace = "",
      amount = 1,
      ttl = null,
      type = "default",
    } = options;

    if (!this.isAvailable()) {
      return null;
    }

    try {
      const cacheKey = this.buildKey(key, namespace);
      let result;

      if (amount === 1) {
        result = await this.client.incr(cacheKey);
      } else {
        result = await this.client.incrBy(cacheKey, amount);
      }

      // Set TTL if this is a new key
      if (result === amount) {
        const ttlSeconds = ttl || this.getTtl(type);
        await this.client.expire(cacheKey, ttlSeconds);
      }

      return result;
    } catch (error) {
      console.error("Redis INCR error:", error);
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Multi-get operation
   */
  async mget(keys, options = {}) {
    const { namespace = "", fallback = {} } = options;

    if (!this.isAvailable()) {
      return fallback;
    }

    try {
      const cacheKeys = keys.map((key) => this.buildKey(key, namespace));
      const values = await this.client.mGet(cacheKeys);

      const result = {};
      keys.forEach((key, index) => {
        if (values[index] !== null) {
          try {
            result[key] = JSON.parse(values[index]);
            this.metrics.hits++;
          } catch (parseError) {
            console.warn("JSON parse error for key:", key);
            this.metrics.misses++;
          }
        } else {
          this.metrics.misses++;
        }
      });

      return result;
    } catch (error) {
      console.error("Redis MGET error:", error);
      this.metrics.errors++;
      return fallback;
    }
  }

  /**
   * Multi-set operation
   */
  async mset(keyValuePairs, options = {}) {
    const { namespace = "", ttl = null, type = "default" } = options;

    if (!this.isAvailable()) {
      return false;
    }

    try {
      const pairsObject = {};
      const keysToExpire = [];

      Object.entries(keyValuePairs).forEach(([key, value]) => {
        const cacheKey = this.buildKey(key, namespace);
        pairsObject[cacheKey] = JSON.stringify(value);
        keysToExpire.push(cacheKey);
      });

      await this.client.mSet(pairsObject);

      // Set TTL for all keys
      if (ttl || this.ttlConfig[type]) {
        const ttlSeconds = ttl || this.getTtl(type);
        const pipeline = this.client.multi();
        keysToExpire.forEach((key) => {
          pipeline.expire(key, ttlSeconds);
        });
        await pipeline.exec();
      }

      this.metrics.sets += Object.keys(keyValuePairs).length;
      return true;
    } catch (error) {
      console.error("Redis MSET error:", error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRatio =
      this.metrics.hits + this.metrics.misses > 0
        ? (
            (this.metrics.hits / (this.metrics.hits + this.metrics.misses)) *
            100
          ).toFixed(2)
        : 0;

    return {
      ...this.metrics,
      hitRatio: `${hitRatio}%`,
      isConnected: this.isConnected,
      isAvailable: this.isAvailable(),
      connectionAttempts: this.connectionAttempts,
      uptime: Date.now() - this.metrics.uptime,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    Object.keys(this.metrics).forEach((key) => {
      if (typeof this.metrics[key] === "number") {
        this.metrics[key] = 0;
      }
    });
    this.metrics.uptime = Date.now();
    this.metrics.lastError = null;
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.isAvailable()) {
      return {
        status: "unhealthy",
        error: "Redis not connected",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;

      return {
        status: "healthy",
        latency: `${latency}ms`,
        stats: this.getStats(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Flush specific namespace
   */
  async flushNamespace(namespace) {
    if (!namespace) {
      throw new Error("Namespace is required for flush operation");
    }

    // Use * pattern directly since delPattern will call buildKey internally
    return await this.delPattern("*", { namespace });
  }

  /**
   * Get memory usage information
   */
  async getMemoryInfo() {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const info = await this.client.info("memory");
      const lines = info.split("\r\n");
      const memoryInfo = {};

      lines.forEach((line) => {
        if (line.includes(":")) {
          const [key, value] = line.split(":");
          if (key.startsWith("used_memory")) {
            memoryInfo[key] = parseInt(value) || value;
          }
        }
      });

      return memoryInfo;
    } catch (error) {
      console.error("Redis memory info error:", error);
      return null;
    }
  }

  /**
   * Close connection gracefully
   */
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        console.log("Redis Cache connection closed gracefully");
      } catch (error) {
        console.error("Error closing Redis connection:", error);
        // Force close if graceful close fails
        await this.client.disconnect();
      }

      this.isConnected = false;
      this.initialized = false;
    }
  }
}

// Create singleton instance
let redisInstance = null;

export function createRedisCache(options = {}) {
  if (!redisInstance) {
    redisInstance = new RedisCache(options);
  }
  return redisInstance;
}

export { RedisCache };
