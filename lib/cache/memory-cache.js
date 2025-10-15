/**
 * Memory Cache Layer
 * High-performance in-memory cache with LRU eviction, TTL support, and memory monitoring
 */

import { safeStringify } from '../bigint-serializer.js';

class MemoryCache {
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 1000, // Max number of entries
      maxMemoryMB: options.maxMemoryMB || 100, // Max memory usage in MB
      defaultTtl: options.defaultTtl || 3600, // Default TTL in seconds
      checkInterval: options.checkInterval || 60, // Cleanup interval in seconds
      keyPrefix: options.keyPrefix || "",
      ...options,
    };

    // TTL configuration by data type (matches Redis configuration)
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

    // Cache storage using Map for fast access
    this.cache = new Map();
    this.accessOrder = new Map(); // For LRU tracking

    // Metrics tracking
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      ttlExpired: 0,
      memoryEvictions: 0,
      sizeEvictions: 0,
      currentSize: 0,
      currentMemoryBytes: 0,
      maxSizeReached: 0,
      maxMemoryReached: 0,
      uptime: Date.now(),
    };

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this._performCleanup();
    }, this.options.checkInterval * 1000);

    this.initialized = true;
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
    const parts = [];
    if (this.options.keyPrefix) parts.push(this.options.keyPrefix);
    if (namespace) parts.push(namespace);
    parts.push(key);
    return parts.join(":");
  }

  /**
   * Calculate memory usage of an entry
   */
  _calculateMemoryUsage(key, value, metadata) {
    // Rough estimation of memory usage using Buffer.byteLength for Node.js
    const keySize = Buffer.byteLength(key, "utf8");
    const valueStr = safeStringify(value) || "";
    const valueSize = Buffer.byteLength(valueStr, "utf8");
    const metadataSize = Buffer.byteLength(safeStringify(metadata), "utf8");
    return keySize + valueSize + metadataSize + 64; // 64 bytes overhead
  }

  /**
   * Update access order for LRU
   */
  _updateAccessOrder(key) {
    // Remove and re-add to move to end (most recently used)
    this.accessOrder.delete(key);
    this.accessOrder.set(key, Date.now());
  }

  /**
   * Check if entry is expired
   */
  _isExpired(entry) {
    if (!entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
  }

  /**
   * Evict least recently used entries
   */
  _evictLRU(count = 1) {
    let evicted = 0;
    const entries = Array.from(this.accessOrder.keys());

    for (let i = 0; i < entries.length && evicted < count; i++) {
      const key = entries[i];
      if (this._removeEntry(key)) {
        evicted++;
        this.metrics.evictions++;
        this.metrics.sizeEvictions++;
      }
    }

    return evicted;
  }

  /**
   * Evict entries to free memory
   */
  _evictForMemory() {
    const maxMemoryBytes = this.options.maxMemoryMB * 1024 * 1024;
    let evicted = 0;

    while (
      this.metrics.currentMemoryBytes > maxMemoryBytes &&
      this.cache.size > 0
    ) {
      if (this._evictLRU(1) === 0) break; // Safety break
      evicted++;
      this.metrics.memoryEvictions++;
    }

    if (evicted > 0) {
      this.metrics.maxMemoryReached++;
    }

    return evicted;
  }

  /**
   * Remove entry from cache
   */
  _removeEntry(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.metrics.currentMemoryBytes -= entry.memorySize;
    this.metrics.currentSize--;

    this.cache.delete(key);
    this.accessOrder.delete(key);

    return true;
  }

  /**
   * Perform periodic cleanup
   */
  _performCleanup() {
    const now = Date.now();
    let expired = 0;

    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (this._isExpired(entry)) {
        this._removeEntry(key);
        expired++;
        this.metrics.ttlExpired++;
      }
    }

    // Check memory limits
    this._evictForMemory();

    // Log cleanup if significant
    if (expired > 0) {
      console.log(`Memory Cache cleanup: removed ${expired} expired entries`);
    }
  }

  /**
   * Get value from cache
   */
  get(key, options = {}) {
    const { namespace = "", fallback = null } = options;
    const cacheKey = this.buildKey(key, namespace);

    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.metrics.misses++;
      return fallback;
    }

    // Check expiration
    if (this._isExpired(entry)) {
      this._removeEntry(cacheKey);
      this.metrics.misses++;
      this.metrics.ttlExpired++;
      return fallback;
    }

    // Update access order
    this._updateAccessOrder(cacheKey);
    this.metrics.hits++;

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key, value, options = {}) {
    const {
      namespace = "",
      ttl = null,
      type = "default",
      nx = false, // Only set if not exists
    } = options;

    const cacheKey = this.buildKey(key, namespace);

    // Check if key exists and nx flag is set
    if (nx && this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey);
      if (entry && !this._isExpired(entry)) {
        return false; // Key exists and is not expired
      }
    }

    // Remove existing entry if present
    if (this.cache.has(cacheKey)) {
      this._removeEntry(cacheKey);
    }

    // Calculate TTL
    const ttlSeconds = ttl || this.getTtl(type);
    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;

    // Create entry
    const entry = {
      value,
      type,
      createdAt: Date.now(),
      expiresAt,
      accessCount: 0,
      memorySize: 0,
    };

    // Calculate memory usage
    entry.memorySize = this._calculateMemoryUsage(cacheKey, value, entry);

    // Check size limits before adding
    while (this.cache.size >= this.options.maxSize) {
      if (this._evictLRU(1) === 0) break; // Safety break if no evictions possible
      this.metrics.maxSizeReached++;
    }

    // Check memory limits before adding
    const maxMemoryBytes = this.options.maxMemoryMB * 1024 * 1024;
    if (this.metrics.currentMemoryBytes + entry.memorySize > maxMemoryBytes) {
      this._evictForMemory();
    }

    // Add entry
    this.cache.set(cacheKey, entry);
    this._updateAccessOrder(cacheKey);

    // Update metrics
    this.metrics.currentSize++;
    this.metrics.currentMemoryBytes += entry.memorySize;
    this.metrics.sets++;

    return true;
  }

  /**
   * Delete single key
   */
  del(key, options = {}) {
    const { namespace = "" } = options;
    const cacheKey = this.buildKey(key, namespace);

    if (this._removeEntry(cacheKey)) {
      this.metrics.deletes++;
      return true;
    }

    return false;
  }

  /**
   * Delete multiple keys by pattern
   */
  delPattern(pattern, options = {}) {
    const { namespace = "" } = options;
    const searchPattern = this.buildKey(pattern, namespace);

    // Convert wildcard pattern to regex
    const regexPattern = searchPattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape regex chars
      .replace(/\\\*/g, ".*"); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);
    let deleted = 0;

    // Find matching keys
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    // Delete matching keys
    keysToDelete.forEach((key) => {
      if (this._removeEntry(key)) {
        deleted++;
        this.metrics.deletes++;
      }
    });

    return deleted;
  }

  /**
   * Check if key exists
   */
  exists(key, options = {}) {
    const { namespace = "" } = options;
    const cacheKey = this.buildKey(key, namespace);

    const entry = this.cache.get(cacheKey);
    if (!entry) return false;

    if (this._isExpired(entry)) {
      this._removeEntry(cacheKey);
      this.metrics.ttlExpired++;
      return false;
    }

    return true;
  }

  /**
   * Get TTL for key
   */
  ttl(key, options = {}) {
    const { namespace = "" } = options;
    const cacheKey = this.buildKey(key, namespace);

    const entry = this.cache.get(cacheKey);
    if (!entry) return -2; // Key does not exist

    if (!entry.expiresAt) return -1; // Key exists but has no expiration

    const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2; // Expired
  }

  /**
   * Extend TTL for key
   */
  expire(key, seconds, options = {}) {
    const { namespace = "" } = options;
    const cacheKey = this.buildKey(key, namespace);

    const entry = this.cache.get(cacheKey);
    if (!entry) return false;

    if (this._isExpired(entry)) {
      this._removeEntry(cacheKey);
      return false;
    }

    entry.expiresAt = seconds > 0 ? Date.now() + seconds * 1000 : null;
    return true;
  }

  /**
   * Atomic increment
   */
  incr(key, options = {}) {
    const {
      namespace = "",
      amount = 1,
      ttl = null,
      type = "default",
    } = options;
    const cacheKey = this.buildKey(key, namespace);

    let currentValue = 0;
    const entry = this.cache.get(cacheKey);

    if (entry && !this._isExpired(entry)) {
      currentValue = typeof entry.value === "number" ? entry.value : 0;
    }

    const newValue = currentValue + amount;

    // Set the new value
    const setOptions = { namespace, type };
    if (ttl) setOptions.ttl = ttl;

    this.set(key, newValue, setOptions);

    return newValue;
  }

  /**
   * Multi-get operation
   */
  mget(keys, options = {}) {
    const { namespace = "", fallback = {} } = options;
    const result = {};

    keys.forEach((key) => {
      const value = this.get(key, { namespace });
      if (value !== null) {
        result[key] = value;
      }
    });

    return result;
  }

  /**
   * Multi-set operation
   */
  mset(keyValuePairs, options = {}) {
    const { namespace = "", ttl = null, type = "default" } = options;
    let success = true;

    Object.entries(keyValuePairs).forEach(([key, value]) => {
      const result = this.set(key, value, { namespace, ttl, type });
      if (!result) success = false;
    });

    return success;
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

    const memoryUsageMB = (
      this.metrics.currentMemoryBytes /
      (1024 * 1024)
    ).toFixed(2);
    const memoryUtilization = (
      (this.metrics.currentMemoryBytes /
        (this.options.maxMemoryMB * 1024 * 1024)) *
      100
    ).toFixed(2);
    const sizeUtilization = (
      (this.metrics.currentSize / this.options.maxSize) *
      100
    ).toFixed(2);

    return {
      ...this.metrics,
      hitRatio: `${hitRatio}%`,
      memoryUsageMB: `${memoryUsageMB} MB`,
      memoryUtilization: `${memoryUtilization}%`,
      sizeUtilization: `${sizeUtilization}%`,
      uptime: Date.now() - this.metrics.uptime,
      isHealthy: this.isHealthy(),
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
  }

  /**
   * Check if cache is healthy
   */
  isHealthy() {
    const memoryUsage =
      this.metrics.currentMemoryBytes /
      (this.options.maxMemoryMB * 1024 * 1024);
    const sizeUsage = this.metrics.currentSize / this.options.maxSize;

    return memoryUsage < 0.95 && sizeUsage < 0.95; // Healthy if under 95% capacity
  }

  /**
   * Health check
   */
  healthCheck() {
    const stats = this.getStats();

    return {
      status: this.isHealthy() ? "healthy" : "warning",
      stats,
      timestamp: new Date().toISOString(),
      warnings: this._getHealthWarnings(),
    };
  }

  /**
   * Get health warnings
   */
  _getHealthWarnings() {
    const warnings = [];
    const memoryUsage =
      this.metrics.currentMemoryBytes /
      (this.options.maxMemoryMB * 1024 * 1024);
    const sizeUsage = this.metrics.currentSize / this.options.maxSize;

    if (memoryUsage > 0.9) {
      warnings.push("Memory usage above 90%");
    }

    if (sizeUsage > 0.9) {
      warnings.push("Size usage above 90%");
    }

    if (this.metrics.evictions > 100) {
      warnings.push("High eviction rate detected");
    }

    return warnings;
  }

  /**
   * Flush specific namespace
   */
  flushNamespace(namespace) {
    if (!namespace) {
      throw new Error("Namespace is required for flush operation");
    }

    return this.delPattern("*", { namespace });
  }

  /**
   * Clear all cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.metrics.currentSize = 0;
    this.metrics.currentMemoryBytes = 0;
    return size;
  }

  /**
   * Get all keys
   */
  keys(pattern = "*") {
    if (pattern === "*") {
      return Array.from(this.cache.keys());
    }

    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape regex chars
      .replace(/\\\*/g, ".*"); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);

    return Array.from(this.cache.keys()).filter((key) => regex.test(key));
  }

  /**
   * Resize cache limits
   */
  resize(newMaxSize, newMaxMemoryMB) {
    if (newMaxSize) {
      this.options.maxSize = newMaxSize;

      // Evict if over new size limit
      if (this.cache.size > newMaxSize) {
        const toEvict = this.cache.size - newMaxSize;
        this._evictLRU(toEvict);
      }
    }

    if (newMaxMemoryMB) {
      this.options.maxMemoryMB = newMaxMemoryMB;
      this._evictForMemory();
    }
  }

  /**
   * Get detailed entry information
   */
  inspect(key, options = {}) {
    const { namespace = "" } = options;
    const cacheKey = this.buildKey(key, namespace);

    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    const accessTime = this.accessOrder.get(cacheKey);
    const ttlRemaining = entry.expiresAt
      ? Math.floor((entry.expiresAt - Date.now()) / 1000)
      : null;

    return {
      key: cacheKey,
      type: entry.type,
      memorySize: entry.memorySize,
      createdAt: new Date(entry.createdAt).toISOString(),
      expiresAt: entry.expiresAt
        ? new Date(entry.expiresAt).toISOString()
        : null,
      ttlRemaining,
      lastAccessed: accessTime ? new Date(accessTime).toISOString() : null,
      isExpired: this._isExpired(entry),
    };
  }

  /**
   * Close and cleanup
   */
  close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.clear();
    this.initialized = false;
    console.log("Memory Cache closed and cleaned up");
  }
}

// Create singleton instance
let memoryInstance = null;

export function createMemoryCache(options = {}) {
  if (!memoryInstance) {
    memoryInstance = new MemoryCache(options);
  }
  return memoryInstance;
}

export { MemoryCache };
