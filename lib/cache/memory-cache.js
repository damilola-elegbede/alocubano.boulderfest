import NodeCache from 'node-cache';

class MemoryCache {
  constructor(options = {}) {
    // Initialize node-cache with default options
    this.cache = new NodeCache({
      stdTTL: options.defaultTTL || 120,           // 2 minutes default TTL
      checkperiod: options.checkPeriod || 60,      // Check for expired keys every 60 seconds
      useClones: options.useClones !== false,      // Clone objects to prevent mutations
      deleteOnExpire: true,                        // Delete expired keys
      maxKeys: options.maxKeys || 10000,          // Maximum number of keys
    });

    // Configuration for different cache types
    this.ttlConfig = {
      computed: 30,        // 30 seconds for computed results
      apiResponse: 120,    // 2 minutes for API responses
      staticData: 600,     // 10 minutes for static data
      userSession: 300,    // 5 minutes for user sessions
      queryResult: 60,     // 1 minute for database queries
    };

    // Memory management
    this.maxMemoryMB = options.maxMemoryMB || 100;
    this.currentMemoryUsage = 0;

    // Metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      memoryPressureEvictions: 0,
      lastReset: Date.now(),
    };

    // Set up event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Track statistics
    this.cache.on('set', (key, value) => {
      this.metrics.sets++;
      this.checkMemoryPressure();
    });

    this.cache.on('del', (key, value) => {
      this.metrics.deletes++;
    });

    this.cache.on('expired', (key, value) => {
      this.metrics.evictions++;
    });

    this.cache.on('flush', () => {
      this.metrics.evictions += this.cache.getStats().keys;
    });
  }

  // Get value from cache
  get(key) {
    try {
      const value = this.cache.get(key);
      
      if (value !== undefined) {
        this.metrics.hits++;
        return value;
      }
      
      this.metrics.misses++;
      return null;
    } catch (error) {
      console.error('Memory cache get error:', error);
      return null;
    }
  }

  // Set value in cache with optional TTL
  set(key, value, ttl = null) {
    try {
      // Check memory before adding
      if (this.isMemoryPressure()) {
        this.evictLRU();
      }

      const success = ttl 
        ? this.cache.set(key, value, ttl)
        : this.cache.set(key, value);
      
      if (success) {
        this.updateMemoryUsage();
      }
      
      return success;
    } catch (error) {
      console.error('Memory cache set error:', error);
      return false;
    }
  }

  // Get or set with cache-aside pattern
  async getOrSet(key, fetchFunction, ttl = null) {
    // Try to get from cache first
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    try {
      const freshData = await fetchFunction();
      
      // Store in cache
      this.set(key, freshData, ttl);
      
      return freshData;
    } catch (error) {
      console.error('Error fetching data for cache:', error);
      throw error;
    }
  }

  // Delete specific key
  delete(key) {
    try {
      const count = this.cache.del(key);
      return count > 0;
    } catch (error) {
      console.error('Memory cache delete error:', error);
      return false;
    }
  }

  // Delete multiple keys
  deleteMany(keys) {
    try {
      const count = this.cache.del(keys);
      return count;
    } catch (error) {
      console.error('Memory cache delete many error:', error);
      return 0;
    }
  }

  // Clear all cache
  clear() {
    try {
      this.cache.flushAll();
      this.currentMemoryUsage = 0;
      return true;
    } catch (error) {
      console.error('Memory cache clear error:', error);
      return false;
    }
  }

  // Get all keys
  getKeys() {
    return this.cache.keys();
  }

  // Check if key exists
  has(key) {
    return this.cache.has(key);
  }

  // Get TTL for a key
  getTTL(key) {
    return this.cache.getTtl(key);
  }

  // Update TTL for a key
  setTTL(key, ttl) {
    return this.cache.ttl(key, ttl);
  }

  // Multi-get operation
  getMany(keys) {
    try {
      const result = this.cache.mget(keys);
      const found = Object.keys(result).length;
      
      this.metrics.hits += found;
      this.metrics.misses += keys.length - found;
      
      return result;
    } catch (error) {
      console.error('Memory cache multi-get error:', error);
      return {};
    }
  }

  // Multi-set operation
  setMany(items) {
    try {
      const results = [];
      
      for (const item of items) {
        const success = item.ttl 
          ? this.cache.set(item.key, item.value, item.ttl)
          : this.cache.set(item.key, item.value);
        results.push(success);
      }
      
      return results;
    } catch (error) {
      console.error('Memory cache multi-set error:', error);
      return [];
    }
  }

  // Check memory pressure
  isMemoryPressure() {
    const memoryUsageMB = this.estimateMemoryUsage();
    return memoryUsageMB > this.maxMemoryMB * 0.9; // 90% threshold
  }

  // Estimate memory usage (simplified)
  estimateMemoryUsage() {
    const stats = this.cache.getStats();
    const avgSizePerKey = 1024; // Assume 1KB average per key
    return (stats.keys * avgSizePerKey) / (1024 * 1024);
  }

  // Update memory usage tracking
  updateMemoryUsage() {
    this.currentMemoryUsage = this.estimateMemoryUsage();
  }

  // Evict least recently used items
  evictLRU(count = 10) {
    const keys = this.cache.keys();
    const toEvict = [];
    
    // Get access times for all keys
    const keyTimes = keys.map(key => {
      const ttl = this.cache.getTtl(key);
      return { key, lastAccess: ttl || 0 };
    });
    
    // Sort by last access time
    keyTimes.sort((a, b) => a.lastAccess - b.lastAccess);
    
    // Evict oldest items
    for (let i = 0; i < Math.min(count, keyTimes.length); i++) {
      toEvict.push(keyTimes[i].key);
    }
    
    const evicted = this.deleteMany(toEvict);
    this.metrics.memoryPressureEvictions += evicted;
    
    return evicted;
  }

  // Cache warming
  async warmCache(warmupData) {
    const results = {
      success: 0,
      failed: 0,
    };

    for (const item of warmupData) {
      const success = this.set(item.key, item.value, item.ttl);
      
      if (success) {
        results.success++;
      } else {
        results.failed++;
      }
    }

    return results;
  }

  // Get cache statistics
  getCacheStats() {
    const stats = this.cache.getStats();
    const totalRequests = this.metrics.hits + this.metrics.misses;
    
    return {
      keys: stats.keys,
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      sets: this.metrics.sets,
      deletes: this.metrics.deletes,
      evictions: this.metrics.evictions,
      memoryPressureEvictions: this.metrics.memoryPressureEvictions,
      hitRate: totalRequests > 0 ? this.metrics.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.metrics.misses / totalRequests : 0,
      memoryUsageMB: this.estimateMemoryUsage(),
      maxMemoryMB: this.maxMemoryMB,
      uptime: Date.now() - this.metrics.lastReset,
      totalRequests: totalRequests,
    };
  }

  // Reset metrics
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      memoryPressureEvictions: 0,
      lastReset: Date.now(),
    };
  }

  // Close cache (cleanup)
  close() {
    this.cache.close();
  }
}

// Factory function for creating typed caches
export function createTypedCache(type, options = {}) {
  const typeConfigs = {
    api: { defaultTTL: 120, maxKeys: 1000 },
    database: { defaultTTL: 60, maxKeys: 5000 },
    computed: { defaultTTL: 30, maxKeys: 500 },
    session: { defaultTTL: 300, maxKeys: 10000 },
    static: { defaultTTL: 600, maxKeys: 100 },
  };

  const config = typeConfigs[type] || {};
  return new MemoryCache({ ...config, ...options });
}

// Singleton instances for different cache types
const cacheInstances = {};

export function getMemoryCache(type = 'default') {
  if (!cacheInstances[type]) {
    cacheInstances[type] = createTypedCache(type);
  }
  return cacheInstances[type];
}

export default MemoryCache;