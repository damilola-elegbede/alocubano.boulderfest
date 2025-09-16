/**
 * Redis-based Rate Limiter Service
 *
 * Provides persistent rate limiting across application restarts using Redis.
 * Falls back to in-memory storage if Redis is unavailable.
 *
 * Features:
 * - Sliding window algorithm for accurate rate limiting
 * - Progressive penalties with exponential backoff
 * - Automatic failover to in-memory storage
 * - Comprehensive logging and monitoring
 * - Environment-based configuration
 */

import { performance } from 'perf_hooks';

// Conditional Redis import with graceful fallback
let Redis = null;
let redisLoadAttempted = false;

async function loadRedis() {
  if (redisLoadAttempted) {
    return Redis;
  }

  redisLoadAttempted = true;

  try {
    const redisModule = await import('ioredis');
    Redis = redisModule.default;
    console.log('[RedisRateLimiter] Redis module loaded successfully');
    return Redis;
  } catch (error) {
    console.warn('[RedisRateLimiter] Redis not available, using in-memory fallback:', error.message);
    Redis = false;
    return false;
  }
}

// Default configurations for different endpoint types
const DEFAULT_CONFIGS = {
  admin_login: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 5,
    lockoutDuration: 60 * 60 * 1000, // 1 hour
    enablePenalties: true,
    maxPenaltyMultiplier: 8
  },
  qr_validation: {
    windowMs: 60 * 1000, // 1 minute
    maxAttempts: 100,
    lockoutDuration: 5 * 60 * 1000, // 5 minutes
    enablePenalties: false
  },
  email_subscription: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxAttempts: 10,
    lockoutDuration: 24 * 60 * 60 * 1000, // 24 hours
    enablePenalties: true,
    maxPenaltyMultiplier: 4
  },
  payment: {
    windowMs: 60 * 1000, // 1 minute
    maxAttempts: 5,
    lockoutDuration: 30 * 60 * 1000, // 30 minutes
    enablePenalties: true,
    maxPenaltyMultiplier: 16
  },
  general: {
    windowMs: 60 * 1000, // 1 minute
    maxAttempts: 60,
    lockoutDuration: 5 * 60 * 1000, // 5 minutes
    enablePenalties: true,
    maxPenaltyMultiplier: 4
  },
  registration: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxAttempts: 20,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
    enablePenalties: true,
    maxPenaltyMultiplier: 8
  }
};

export class RedisRateLimiter {
  constructor(options = {}) {
    this.redis = null;
    this.fallbackStore = new Map();
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;

    // Configuration
    this.keyPrefix = options.keyPrefix || process.env.REDIS_RATE_LIMIT_PREFIX || 'rate_limit:';
    this.enableRedis = options.enableRedis !== false && process.env.DISABLE_REDIS !== 'true';
    this.redisConfig = this.buildRedisConfig(options.redis);

    // Cleanup intervals
    this._cleanupTimer = null;
    this._reconnectTimer = null;

    // Performance metrics
    this.metrics = {
      redisOps: 0,
      fallbackOps: 0,
      errors: 0,
      avgResponseTime: 0
    };

    // Initialize Redis connection
    if (this.enableRedis) {
      this.initRedis().catch(error => {
        console.warn('[RedisRateLimiter] Initial Redis connection failed:', error.message);
      });
    } else {
      console.log('[RedisRateLimiter] Redis disabled, using in-memory fallback only');
    }

    // Start cleanup for fallback store
    this.startCleanupInterval();
  }

  buildRedisConfig(customConfig = {}) {
    if (customConfig && typeof customConfig === 'string') {
      // Redis URL provided
      return customConfig;
    }

    // Check for environment variables
    if (process.env.REDIS_URL) {
      return process.env.REDIS_URL;
    }

    if (process.env.RATE_LIMIT_REDIS_URL) {
      return process.env.RATE_LIMIT_REDIS_URL;
    }

    // Build config from individual environment variables
    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 1000,
      maxTimeUntilClose: 3000,
      ...customConfig
    };

    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    return config;
  }

  async initRedis() {
    if (!this.enableRedis || this.connectionAttempts >= this.maxConnectionAttempts) {
      return false;
    }

    try {
      this.connectionAttempts++;
      const RedisClass = await loadRedis();

      if (!RedisClass || RedisClass === false) {
        console.log('[RedisRateLimiter] Redis module not available');
        return false;
      }

      this.redis = new RedisClass(this.redisConfig);

      // Set up event handlers
      this.redis.on('connect', () => {
        console.log('[RedisRateLimiter] Redis connected successfully');
        this.isConnected = true;
        this.connectionAttempts = 0; // Reset on successful connection
      });

      this.redis.on('ready', () => {
        console.log('[RedisRateLimiter] Redis ready for operations');
      });

      this.redis.on('error', (error) => {
        console.warn('[RedisRateLimiter] Redis error:', error.message);
        this.isConnected = false;
        this.metrics.errors++;
      });

      this.redis.on('close', () => {
        console.log('[RedisRateLimiter] Redis connection closed');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.redis.on('reconnecting', () => {
        console.log('[RedisRateLimiter] Redis reconnecting...');
      });

      // Test connection
      await this.redis.ping();
      return true;

    } catch (error) {
      console.warn(`[RedisRateLimiter] Redis connection attempt ${this.connectionAttempts} failed:`, error.message);
      this.redis = null;
      this.isConnected = false;

      if (this.connectionAttempts < this.maxConnectionAttempts) {
        this.scheduleReconnect();
      }

      return false;
    }
  }

  scheduleReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
    }

    // Only schedule reconnect if we haven't exceeded max attempts
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      console.log('[RedisRateLimiter] Max reconnection attempts reached, giving up');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000); // Max 30 seconds
    console.log(`[RedisRateLimiter] Scheduling reconnect in ${delay}ms`);

    this._reconnectTimer = setTimeout(() => {
      this.initRedis().catch(error => {
        console.warn('[RedisRateLimiter] Reconnection attempt failed:', error.message);
      });
    }, delay);
  }

  startCleanupInterval() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
    }

    this._cleanupTimer = setInterval(() => {
      this.cleanupFallbackStore();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Get client identifier from request
   */
  getClientId(req, options = {}) {
    const { type = 'ip', userIdField = 'id' } = options;

    if (type === 'user' && req.user?.[userIdField]) {
      return `user:${req.user[userIdField]}`;
    }

    if (type === 'device' && req.headers?.['x-device-id']) {
      return `device:${req.headers['x-device-id']}`;
    }

    // Default to IP-based identification
    const headers = req.headers || req;
    const forwardedFor = headers['x-forwarded-for'] || headers['X-Forwarded-For'];

    const ip = forwardedFor?.split(',')[0]?.trim() ||
               headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               'unknown';

    return `ip:${ip}`;
  }

  /**
   * Generate cache key for rate limiting
   */
  generateKey(endpoint, clientId, window = null) {
    const timestamp = window ? Math.floor(Date.now() / window) : '';
    return `${this.keyPrefix}${endpoint}:${clientId}${timestamp ? ':' + timestamp : ''}`;
  }

  /**
   * Check rate limit using sliding window algorithm
   */
  async checkRateLimit(req, endpoint, options = {}) {
    const startTime = performance.now();

    try {
      const config = { ...DEFAULT_CONFIGS[endpoint] || DEFAULT_CONFIGS.general, ...options };
      const clientId = this.getClientId(req, options);
      const key = this.generateKey(endpoint, clientId);

      console.log(`[RedisRateLimiter] Checking rate limit for ${endpoint}:${clientId}`);

      // Check if using Redis or fallback
      if (this.redis && this.isConnected) {
        const result = await this.checkSlidingWindowRedis(key, config);
        this.metrics.redisOps++;
        this.updateResponseTime(startTime);
        return this.formatResponse(result, clientId, endpoint, 'redis');
      } else {
        const result = await this.checkSlidingWindowFallback(key, config);
        this.metrics.fallbackOps++;
        this.updateResponseTime(startTime);
        return this.formatResponse(result, clientId, endpoint, 'memory');
      }

    } catch (error) {
      console.error('[RedisRateLimiter] Rate limit check failed:', error);
      this.metrics.errors++;

      // Fail open - allow request but log error
      return {
        allowed: true,
        remaining: 999,
        resetTime: Date.now() + 60000,
        clientId: this.getClientId(req, options),
        endpoint,
        backend: 'error_fallback',
        error: error.message
      };
    }
  }

  /**
   * Redis-based sliding window implementation
   */
  async checkSlidingWindowRedis(key, config) {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const penaltyKey = `${key}:penalty`;

    try {
      // Get penalty multiplier
      const penaltyMultiplier = config.enablePenalties
        ? await this.getPenaltyMultiplier(penaltyKey, config)
        : 1;

      const effectiveLimit = Math.floor(config.maxAttempts / penaltyMultiplier);
      const effectiveWindow = config.windowMs * penaltyMultiplier;
      const effectiveWindowStart = now - effectiveWindow;

      const pipeline = this.redis.pipeline();

      // Remove old entries
      pipeline.zremrangebyscore(key, 0, effectiveWindowStart);

      // Count current entries
      pipeline.zcard(key);

      // Add current request
      const requestId = `${now}-${Math.random().toString(36).substring(2, 11)}`;
      pipeline.zadd(key, now, requestId);

      // Set expiration
      pipeline.expire(key, Math.ceil(effectiveWindow / 1000));

      const results = await pipeline.exec();

      // Check for pipeline errors
      for (let i = 0; i < results.length; i++) {
        if (results[i][0]) {
          throw new Error(`Redis pipeline operation ${i} failed: ${results[i][0]}`);
        }
      }

      const count = results[1][1]; // Count before adding current request
      const totalCount = count + 1;

      const isAllowed = totalCount <= effectiveLimit;

      if (!isAllowed && config.enablePenalties) {
        await this.applyPenalty(penaltyKey, config, penaltyMultiplier);
      }

      return {
        allowed: isAllowed,
        remaining: Math.max(0, effectiveLimit - totalCount),
        resetTime: now + effectiveWindow,
        count: totalCount,
        penaltyMultiplier
      };

    } catch (error) {
      console.warn('[RedisRateLimiter] Redis sliding window failed:', error.message);
      throw error;
    }
  }

  /**
   * Fallback sliding window implementation using in-memory storage
   */
  async checkSlidingWindowFallback(key, config) {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let record = this.fallbackStore.get(key) || {
      requests: [],
      penalties: 0,
      lastPenalty: 0
    };

    // Clean old requests
    record.requests = record.requests.filter(time => time > windowStart);

    // Apply penalty logic
    const penaltyMultiplier = config.enablePenalties
      ? Math.max(1, Math.min(record.penalties || 1, config.maxPenaltyMultiplier || 4))
      : 1;

    const effectiveLimit = Math.floor(config.maxAttempts / penaltyMultiplier);

    // Add current request
    record.requests.push(now);

    const isAllowed = record.requests.length <= effectiveLimit;

    if (!isAllowed && config.enablePenalties) {
      record.penalties = Math.min((record.penalties || 1) * 2, config.maxPenaltyMultiplier || 4);
      record.lastPenalty = now;
    }

    // Store updated record
    this.fallbackStore.set(key, record);

    return {
      allowed: isAllowed,
      remaining: Math.max(0, effectiveLimit - record.requests.length),
      resetTime: now + config.windowMs,
      count: record.requests.length,
      penaltyMultiplier
    };
  }

  /**
   * Get penalty multiplier from Redis
   */
  async getPenaltyMultiplier(penaltyKey, config) {
    try {
      const penalty = await this.redis.get(penaltyKey);
      return Math.min(parseInt(penalty) || 1, config.maxPenaltyMultiplier || 4);
    } catch (error) {
      return 1;
    }
  }

  /**
   * Apply penalty for rate limit violation
   */
  async applyPenalty(penaltyKey, config, currentMultiplier) {
    try {
      const newMultiplier = Math.min(
        currentMultiplier * 2,
        config.maxPenaltyMultiplier || 4
      );

      const duration = Math.ceil((config.lockoutDuration || 300000) * newMultiplier / 1000);

      await this.redis.setex(penaltyKey, duration, newMultiplier);
      console.log(`[RedisRateLimiter] Applied penalty multiplier ${newMultiplier} for ${duration}s`);
    } catch (error) {
      console.warn('[RedisRateLimiter] Failed to apply penalty:', error.message);
    }
  }

  /**
   * Format response object
   */
  formatResponse(result, clientId, endpoint, backend) {
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetTime: result.resetTime,
      retryAfter: result.allowed ? null : Math.ceil((result.resetTime - Date.now()) / 1000),
      clientId,
      endpoint,
      backend,
      penaltyMultiplier: result.penaltyMultiplier || 1,
      count: result.count || 0
    };
  }

  /**
   * Record failed attempt (for backward compatibility)
   */
  async recordFailedAttempt(clientId, endpoint = 'general') {
    // This is handled automatically in checkRateLimit
    const mockReq = { headers: { 'x-forwarded-for': clientId } };
    const result = await this.checkRateLimit(mockReq, endpoint);

    return {
      attemptsRemaining: result.remaining,
      isLocked: !result.allowed,
      remainingTime: result.retryAfter ? Math.ceil(result.retryAfter / 60) : 0
    };
  }

  /**
   * Clear attempts for a client
   */
  async clearAttempts(clientId, endpoint = 'general') {
    const key = this.generateKey(endpoint, `ip:${clientId}`);
    const penaltyKey = `${key}:penalty`;

    if (this.redis && this.isConnected) {
      try {
        const pipeline = this.redis.pipeline();
        pipeline.del(key);
        pipeline.del(penaltyKey);
        await pipeline.exec();
        console.log(`[RedisRateLimiter] Cleared attempts for ${clientId}:${endpoint}`);
      } catch (error) {
        console.warn('[RedisRateLimiter] Failed to clear Redis attempts:', error.message);
      }
    }

    // Also clear from fallback store
    this.fallbackStore.delete(key);
  }

  /**
   * Check if client is locked out
   */
  async isLockedOut(clientId, endpoint = 'general') {
    const mockReq = { headers: { 'x-forwarded-for': clientId } };
    const result = await this.checkRateLimit(mockReq, endpoint, { dryRun: true });
    return !result.allowed;
  }

  /**
   * Get remaining lockout time in seconds
   */
  async getRemainingLockoutTime(clientId, endpoint = 'general') {
    const mockReq = { headers: { 'x-forwarded-for': clientId } };
    const result = await this.checkRateLimit(mockReq, endpoint, { dryRun: true });
    return result.retryAfter || 0;
  }

  /**
   * Update response time metrics
   */
  updateResponseTime(startTime) {
    const duration = performance.now() - startTime;
    this.metrics.avgResponseTime = (this.metrics.avgResponseTime + duration) / 2;
  }

  /**
   * Clean up old entries from fallback store
   */
  cleanupFallbackStore() {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    let cleaned = 0;

    for (const [key, record] of this.fallbackStore.entries()) {
      if (record.requests) {
        // Clean old requests
        const oldLength = record.requests.length;
        record.requests = record.requests.filter(time => (now - time) < maxAge);

        if (record.requests.length === 0) {
          this.fallbackStore.delete(key);
          cleaned++;
        } else if (record.requests.length !== oldLength) {
          this.fallbackStore.set(key, record);
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[RedisRateLimiter] Cleaned up ${cleaned} expired fallback records`);
    }
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      redisConnected: this.isConnected,
      fallbackStoreSize: this.fallbackStore.size,
      connectionAttempts: this.connectionAttempts,
      enableRedis: this.enableRedis,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const metrics = this.getMetrics();

    if (this.enableRedis && this.redis && this.isConnected) {
      try {
        const start = performance.now();
        await this.redis.ping();
        const latency = performance.now() - start;

        return {
          healthy: true,
          backend: 'redis',
          latency: `${latency.toFixed(2)}ms`,
          ...metrics
        };
      } catch (error) {
        return {
          healthy: false,
          backend: 'redis',
          error: error.message,
          ...metrics
        };
      }
    }

    return {
      healthy: true,
      backend: 'memory',
      ...metrics
    };
  }

  /**
   * Close connections and cleanup
   */
  async close() {
    console.log('[RedisRateLimiter] Shutting down...');

    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this.redis) {
      try {
        await this.redis.quit();
      } catch (error) {
        console.warn('[RedisRateLimiter] Error closing Redis connection:', error.message);
      }
      this.redis = null;
    }

    this.fallbackStore.clear();
    this.isConnected = false;
  }
}

// Singleton instance
let rateLimiterInstance = null;

export function getRedisRateLimiter(options = {}) {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RedisRateLimiter(options);
  }
  return rateLimiterInstance;
}

// Export default instance
export default getRedisRateLimiter();