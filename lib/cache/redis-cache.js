import { createClient } from 'redis';

class RedisCache {
  constructor(redisUrl = process.env.REDIS_URL) {
    this.redisUrl = redisUrl;
    this.client = null;
    this.connected = false;
    this.defaultTTL = 300; // 5 minutes default
    
    // Metrics tracking
    this.metrics = {
      hits: 0,
      misses: 0,
      writes: 0,
      errors: 0,
      evictions: 0,
      lastReset: Date.now(),
    };
    
    // TTL configuration by data type
    this.ttlConfig = {
      static: 21600,      // 6 hours for static data
      dynamic: 300,       // 5 minutes for dynamic data
      session: 3600,      // 1 hour for sessions
      analytics: 900,     // 15 minutes for analytics
      api: 120,          // 2 minutes for API responses
      tickets: 60,       // 1 minute for ticket availability
    };
  }

  async connect() {
    if (!this.redisUrl) {
      console.log('Redis URL not configured, caching disabled');
      return false;
    }

    try {
      this.client = createClient({
        url: this.redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('Redis reconnection limit reached');
              return new Error('Redis reconnection failed');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      // Set up event handlers
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.metrics.errors++;
      });

      this.client.on('connect', () => {
        console.log('Redis connected successfully');
        this.connected = true;
      });

      this.client.on('disconnect', () => {
        console.log('Redis disconnected');
        this.connected = false;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.metrics.errors++;
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }

  // Generate cache key with namespace
  generateKey(namespace, key) {
    return `alocubano:${namespace}:${key}`;
  }

  // Get value from cache
  async get(key, namespace = 'default') {
    if (!this.connected) return null;

    try {
      const fullKey = this.generateKey(namespace, key);
      const value = await this.client.get(fullKey);
      
      if (value) {
        this.metrics.hits++;
        return JSON.parse(value);
      }
      
      this.metrics.misses++;
      return null;
    } catch (error) {
      console.error('Redis get error:', error);
      this.metrics.errors++;
      return null;
    }
  }

  // Set value in cache with TTL
  async set(key, value, ttl = null, namespace = 'default') {
    if (!this.connected) return false;

    try {
      const fullKey = this.generateKey(namespace, key);
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.ttlConfig[namespace] || this.defaultTTL;
      
      await this.client.setEx(fullKey, expiry, serialized);
      this.metrics.writes++;
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      this.metrics.errors++;
      return false;
    }
  }

  // Delete specific key
  async delete(key, namespace = 'default') {
    if (!this.connected) return false;

    try {
      const fullKey = this.generateKey(namespace, key);
      const result = await this.client.del(fullKey);
      this.metrics.evictions++;
      return result > 0;
    } catch (error) {
      console.error('Redis delete error:', error);
      this.metrics.errors++;
      return false;
    }
  }

  // Invalidate keys matching pattern
  async invalidatePattern(pattern, namespace = 'default') {
    if (!this.connected) return 0;

    try {
      const searchPattern = this.generateKey(namespace, pattern);
      const keys = await this.client.keys(searchPattern);
      
      if (keys.length === 0) return 0;
      
      const pipeline = this.client.multi();
      for (const key of keys) {
        pipeline.del(key);
      }
      
      await pipeline.exec();
      this.metrics.evictions += keys.length;
      return keys.length;
    } catch (error) {
      console.error('Redis pattern invalidation error:', error);
      this.metrics.errors++;
      return 0;
    }
  }

  // Clear entire namespace
  async clearNamespace(namespace) {
    return await this.invalidatePattern('*', namespace);
  }

  // Get or set with cache-aside pattern
  async getOrSet(key, fetchFunction, ttl = null, namespace = 'default') {
    // Try to get from cache first
    const cached = await this.get(key, namespace);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    try {
      const freshData = await fetchFunction();
      
      // Store in cache
      await this.set(key, freshData, ttl, namespace);
      
      return freshData;
    } catch (error) {
      console.error('Error fetching data for cache:', error);
      throw error;
    }
  }

  // Implement cache warming
  async warmCache(warmupData) {
    const results = {
      success: 0,
      failed: 0,
    };

    for (const item of warmupData) {
      const { key, value, ttl, namespace } = item;
      const success = await this.set(key, value, ttl, namespace);
      
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
    const uptime = Date.now() - this.metrics.lastReset;
    const totalRequests = this.metrics.hits + this.metrics.misses;
    
    return {
      connected: this.connected,
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      writes: this.metrics.writes,
      errors: this.metrics.errors,
      evictions: this.metrics.evictions,
      hitRate: totalRequests > 0 ? this.metrics.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.metrics.misses / totalRequests : 0,
      errorRate: totalRequests > 0 ? this.metrics.errors / totalRequests : 0,
      uptime: uptime,
      totalRequests: totalRequests,
    };
  }

  // Reset metrics
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      writes: 0,
      errors: 0,
      evictions: 0,
      lastReset: Date.now(),
    };
  }

  // Health check
  async healthCheck() {
    if (!this.connected) {
      return {
        healthy: false,
        message: 'Redis not connected',
      };
    }

    try {
      await this.client.ping();
      return {
        healthy: true,
        message: 'Redis is healthy',
        stats: this.getCacheStats(),
      };
    } catch (error) {
      return {
        healthy: false,
        message: 'Redis health check failed',
        error: error.message,
      };
    }
  }
}

// Singleton instance
let redisCache = null;

export function getRedisCache() {
  if (!redisCache) {
    redisCache = new RedisCache();
  }
  return redisCache;
}

export default RedisCache;