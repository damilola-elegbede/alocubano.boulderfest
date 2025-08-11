/**
 * Advanced Distributed Rate Limiter with Redis Backend
 * 
 * Features:
 * - Redis-backed distributed tracking across serverless instances
 * - Sliding window algorithm for accurate rate limiting
 * - Endpoint-specific configurations
 * - Progressive penalties with exponential backoff
 * - Abuse pattern detection and alerting
 * - Whitelist/blacklist support
 * - Comprehensive analytics tracking
 * - <5ms performance impact per request
 */

// Conditional Redis import - gracefully handle missing Redis in tests
let Redis = null;

// Async function to load Redis when needed
async function loadRedis() {
  if (Redis === null) {
    try {
      const redisModule = await import('ioredis');
      Redis = redisModule.default;
    } catch (error) {
      console.warn('Redis not available, using memory fallback only');
      Redis = false; // Mark as unavailable
    }
  }
  return Redis;
}

// Endpoint-specific configurations
const ENDPOINT_CONFIGS = {
  payment: {
    ipLimit: { requests: 5, windowMs: 60000 }, // 5 req/min per IP
    userLimit: { requests: 10, windowMs: 3600000 }, // 10 req/hour per user
    slidingWindow: true,
    enablePenalties: true,
    alertThreshold: 50 // Alert after 50 blocks in hour
  },
  qrValidation: {
    deviceLimit: { requests: 100, windowMs: 60000 }, // 100 req/min per device
    slidingWindow: true,
    enablePenalties: false, // QR validation should not penalize
    alertThreshold: 1000
  },
  auth: {
    ipLimit: { requests: 5, windowMs: 60000 }, // 5 attempts/min
    lockoutAfter: 10, // Lockout after 10 failures
    lockoutDuration: 3600000, // 1 hour
    enablePenalties: true,
    maxPenaltyMultiplier: 32, // Max 32x penalty
    alertThreshold: 20
  },
  email: {
    ipLimit: { requests: 10, windowMs: 3600000 }, // 10 req/hour per IP
    slidingWindow: true,
    enablePenalties: true,
    alertThreshold: 100
  },
  general: {
    ipLimit: { requests: 60, windowMs: 60000 }, // 60 req/min per IP
    slidingWindow: true,
    enablePenalties: true,
    alertThreshold: 500
  }
};

// Whitelist patterns (can use wildcards)
const WHITELIST_IPS = [
  '127.0.0.1',
  '::1',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  // Vercel IP ranges would go here
];

// Blacklist for known bad actors
const BLACKLIST_IPS = new Set([
  // Known malicious IPs would go here
]);

export class AdvancedRateLimiter {
  constructor(options = {}) {
    this.redis = null;
    this.fallbackStore = new Map(); // In-memory fallback
    this.analytics = {
      blocked: 0,
      allowed: 0,
      penalties: 0,
      alerts: 0
    };
    
    // Configuration
    this.redisConfig = options.redis || {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true
    };
    
    this.enableRedis = options.enableRedis !== false;
    this.enableAnalytics = options.enableAnalytics !== false;
    this.alertCallback = options.alertCallback || this.defaultAlertHandler;
    
    // Initialize Redis connection
    this.initRedis();
    
    // Cleanup interval for fallback store
    setInterval(() => this.cleanupFallbackStore(), 300000); // 5 minutes
  }
  
  async initRedis() {
    if (!this.enableRedis) return;
    
    try {
      const RedisClass = await loadRedis();
      
      if (RedisClass && RedisClass !== false) {
        this.redis = new RedisClass(this.redisConfig);
        
        this.redis.on('error', (error) => {
          console.warn('Redis connection error, falling back to memory:', error);
          this.redis = null;
        });
        
        this.redis.on('connect', () => {
          console.log('Redis connected for rate limiting');
        });
      }
      
    } catch (error) {
      console.warn('Failed to initialize Redis, using memory fallback:', error);
      this.redis = null;
    }
  }
  
  /**
   * Get client identifier from request
   */
  getClientId(req, type = 'ip') {
    const headers = req.headers || req;
    
    if (type === 'user' && req.user?.id) {
      return `user:${req.user.id}`;
    }
    
    if (type === 'device' && headers['x-device-id']) {
      return `device:${headers['x-device-id']}`;
    }
    
    // IP-based identification
    const forwardedFor = headers['x-forwarded-for'] ||
                        headers['X-Forwarded-For'] ||
                        headers['X-FORWARDED-FOR'];
    
    const ip = forwardedFor?.split(',')[0]?.trim() ||
               headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               `unknown-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return `ip:${ip}`;
  }
  
  /**
   * Check if IP is whitelisted
   */
  isWhitelisted(clientId) {
    const ip = clientId.replace(/^ip:/, '');
    
    for (const pattern of WHITELIST_IPS) {
      if (pattern.includes('/')) {
        // CIDR notation check (simplified)
        const [network, mask] = pattern.split('/');
        if (ip.startsWith(network.split('.').slice(0, parseInt(mask) / 8).join('.'))) {
          return true;
        }
      } else if (ip === pattern) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if IP is blacklisted
   */
  isBlacklisted(clientId) {
    const ip = clientId.replace(/^ip:/, '');
    return BLACKLIST_IPS.has(ip);
  }
  
  /**
   * Sliding window implementation using Redis sorted sets
   */
  async checkSlidingWindow(key, limit, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (this.redis) {
      try {
        const pipeline = this.redis.pipeline();
        
        // Remove old entries
        pipeline.zremrangebyscore(key, 0, windowStart);
        
        // Count current entries
        pipeline.zcard(key);
        
        // Add current request
        pipeline.zadd(key, now, `${now}-${Math.random()}`);
        
        // Set expiration
        pipeline.expire(key, Math.ceil(windowMs / 1000));
        
        const results = await pipeline.exec();
        const count = results[1][1];
        
        return {
          allowed: count < limit,
          remaining: Math.max(0, limit - count - 1),
          resetTime: now + windowMs,
          count: count + 1
        };
        
      } catch (error) {
        console.warn('Redis sliding window failed, using fallback:', error);
        return this.checkFallbackWindow(key, limit, windowMs);
      }
    }
    
    return this.checkFallbackWindow(key, limit, windowMs);
  }
  
  /**
   * Fallback sliding window using in-memory store
   */
  checkFallbackWindow(key, limit, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    let record = this.fallbackStore.get(key) || { requests: [] };
    
    // Remove old requests
    record.requests = record.requests.filter(time => time > windowStart);
    
    // Add current request
    record.requests.push(now);
    
    this.fallbackStore.set(key, record);
    
    return {
      allowed: record.requests.length <= limit,
      remaining: Math.max(0, limit - record.requests.length),
      resetTime: now + windowMs,
      count: record.requests.length
    };
  }
  
  /**
   * Get penalty multiplier for repeat offenders
   */
  async getPenaltyMultiplier(clientId, endpoint) {
    const config = ENDPOINT_CONFIGS[endpoint];
    if (!config?.enablePenalties) return 1;
    
    const penaltyKey = `penalty:${endpoint}:${clientId}`;
    const maxMultiplier = config.maxPenaltyMultiplier || 32;
    
    try {
      if (this.redis) {
        const penalty = await this.redis.get(penaltyKey) || 1;
        return Math.min(parseInt(penalty), maxMultiplier);
      } else {
        const record = this.fallbackStore.get(penaltyKey) || { multiplier: 1 };
        return Math.min(record.multiplier, maxMultiplier);
      }
    } catch (error) {
      return 1;
    }
  }
  
  /**
   * Apply penalty for rate limit violation
   */
  async applyPenalty(clientId, endpoint) {
    const config = ENDPOINT_CONFIGS[endpoint];
    if (!config?.enablePenalties) return;
    
    const penaltyKey = `penalty:${endpoint}:${clientId}`;
    const currentMultiplier = await this.getPenaltyMultiplier(clientId, endpoint);
    const newMultiplier = Math.min(currentMultiplier * 2, config.maxPenaltyMultiplier || 32);
    const duration = (config.lockoutDuration || 3600000) * newMultiplier;
    
    try {
      if (this.redis) {
        await this.redis.setex(penaltyKey, Math.ceil(duration / 1000), newMultiplier);
      } else {
        this.fallbackStore.set(penaltyKey, {
          multiplier: newMultiplier,
          expiresAt: Date.now() + duration
        });
      }
      
      this.analytics.penalties++;
      
    } catch (error) {
      console.warn('Failed to apply penalty:', error);
    }
  }
  
  /**
   * Check for abuse patterns and trigger alerts
   */
  async checkAbusePattern(endpoint, clientId) {
    const config = ENDPOINT_CONFIGS[endpoint];
    if (!config?.alertThreshold) return;
    
    const alertKey = `abuse:${endpoint}:${clientId}:${Math.floor(Date.now() / 3600000)}`;
    
    try {
      let count;
      if (this.redis) {
        count = await this.redis.incr(alertKey);
        if (count === 1) {
          await this.redis.expire(alertKey, 3600); // 1 hour
        }
      } else {
        const record = this.fallbackStore.get(alertKey) || { count: 0, expiresAt: Date.now() + 3600000 };
        record.count++;
        count = record.count;
        this.fallbackStore.set(alertKey, record);
      }
      
      if (count >= config.alertThreshold) {
        await this.triggerAlert(endpoint, clientId, count);
      }
      
    } catch (error) {
      console.warn('Failed to check abuse pattern:', error);
    }
  }
  
  /**
   * Trigger abuse alert
   */
  async triggerAlert(endpoint, clientId, count) {
    const alertData = {
      endpoint,
      clientId,
      count,
      timestamp: new Date().toISOString(),
      severity: count > ENDPOINT_CONFIGS[endpoint].alertThreshold * 2 ? 'high' : 'medium'
    };
    
    this.analytics.alerts++;
    
    try {
      await this.alertCallback(alertData);
    } catch (error) {
      console.error('Alert callback failed:', error);
    }
  }
  
  /**
   * Default alert handler
   */
  async defaultAlertHandler(alertData) {
    console.warn(`[RATE LIMIT ALERT] ${alertData.severity.toUpperCase()}: ${alertData.clientId} exceeded limits on ${alertData.endpoint} (${alertData.count} violations)`);
    
    // In production, this would integrate with monitoring services
    // like Sentry, DataDog, or custom alerting systems
  }
  
  /**
   * Main rate limiting check
   */
  async checkRateLimit(req, endpoint, options = {}) {
    const startTime = Date.now();
    
    try {
      const config = ENDPOINT_CONFIGS[endpoint] || ENDPOINT_CONFIGS.general;
      const clientId = this.getClientId(req, options.clientType || 'ip');
      
      // Check blacklist first
      if (this.isBlacklisted(clientId)) {
        this.analytics.blocked++;
        return {
          allowed: false,
          reason: 'blacklisted',
          retryAfter: 86400, // 24 hours
          clientId,
          endpoint
        };
      }
      
      // Check whitelist
      if (this.isWhitelisted(clientId)) {
        this.analytics.allowed++;
        return {
          allowed: true,
          reason: 'whitelisted',
          clientId,
          endpoint
        };
      }
      
      // Apply penalty multiplier
      const penaltyMultiplier = await this.getPenaltyMultiplier(clientId, endpoint);
      
      // Check limits based on endpoint configuration
      let result = null;
      
      if (config.ipLimit && (options.clientType === 'ip' || !options.clientType)) {
        const limit = Math.floor(config.ipLimit.requests / penaltyMultiplier);
        const windowMs = config.ipLimit.windowMs * penaltyMultiplier;
        const key = `rate_limit:${endpoint}:ip:${clientId}`;
        
        if (config.slidingWindow) {
          result = await this.checkSlidingWindow(key, limit, windowMs);
        } else {
          result = await this.checkFixedWindow(key, limit, windowMs);
        }
      }
      
      if (config.userLimit && options.clientType === 'user') {
        const limit = Math.floor(config.userLimit.requests / penaltyMultiplier);
        const windowMs = config.userLimit.windowMs * penaltyMultiplier;
        const key = `rate_limit:${endpoint}:user:${clientId}`;
        
        result = config.slidingWindow 
          ? await this.checkSlidingWindow(key, limit, windowMs)
          : await this.checkFixedWindow(key, limit, windowMs);
      }
      
      if (config.deviceLimit && options.clientType === 'device') {
        const limit = config.deviceLimit.requests;
        const windowMs = config.deviceLimit.windowMs;
        const key = `rate_limit:${endpoint}:device:${clientId}`;
        
        result = config.slidingWindow 
          ? await this.checkSlidingWindow(key, limit, windowMs)
          : await this.checkFixedWindow(key, limit, windowMs);
      }
      
      if (!result) {
        // Default to IP-based limiting
        const limit = 60;
        const windowMs = 60000;
        const key = `rate_limit:${endpoint}:default:${clientId}`;
        
        result = await this.checkSlidingWindow(key, limit, windowMs);
      }
      
      const performanceMs = Date.now() - startTime;
      
      if (result.allowed) {
        this.analytics.allowed++;
        return {
          allowed: true,
          remaining: result.remaining,
          resetTime: result.resetTime,
          clientId,
          endpoint,
          performanceMs
        };
      } else {
        this.analytics.blocked++;
        
        // Apply penalty for violation
        await this.applyPenalty(clientId, endpoint);
        
        // Check for abuse patterns
        await this.checkAbusePattern(endpoint, clientId);
        
        return {
          allowed: false,
          reason: 'rate_limit_exceeded',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
          clientId,
          endpoint,
          penaltyMultiplier,
          performanceMs
        };
      }
      
    } catch (error) {
      console.error('Rate limit check failed:', error);
      
      // Fail open for availability
      this.analytics.allowed++;
      return {
        allowed: true,
        reason: 'error_fallback',
        error: error.message
      };
    }
  }
  
  /**
   * Fixed window implementation (fallback)
   */
  async checkFixedWindow(key, limit, windowMs) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowEnd = windowStart + windowMs;
    
    if (this.redis) {
      try {
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, Math.ceil(windowMs / 1000));
        }
        
        return {
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          resetTime: windowEnd,
          count
        };
        
      } catch (error) {
        return this.checkFallbackFixedWindow(key, limit, windowMs, windowStart, windowEnd);
      }
    }
    
    return this.checkFallbackFixedWindow(key, limit, windowMs, windowStart, windowEnd);
  }
  
  checkFallbackFixedWindow(key, limit, windowMs, windowStart, windowEnd) {
    const record = this.fallbackStore.get(key) || { count: 0, windowStart: 0 };
    
    if (record.windowStart !== windowStart) {
      record.count = 0;
      record.windowStart = windowStart;
    }
    
    record.count++;
    this.fallbackStore.set(key, record);
    
    return {
      allowed: record.count <= limit,
      remaining: Math.max(0, limit - record.count),
      resetTime: windowEnd,
      count: record.count
    };
  }
  
  /**
   * Add IP to whitelist
   */
  async addToWhitelist(ip, reason = 'manual') {
    WHITELIST_IPS.push(ip);
    console.log(`Added ${ip} to whitelist: ${reason}`);
  }
  
  /**
   * Add IP to blacklist
   */
  async addToBlacklist(ip, reason = 'abuse_detection') {
    BLACKLIST_IPS.add(ip);
    console.log(`Added ${ip} to blacklist: ${reason}`);
    
    // Also remove from whitelist if present
    const index = WHITELIST_IPS.indexOf(ip);
    if (index > -1) {
      WHITELIST_IPS.splice(index, 1);
    }
  }
  
  /**
   * Get comprehensive analytics
   */
  getAnalytics() {
    return {
      ...this.analytics,
      timestamp: new Date().toISOString(),
      redisConnected: !!this.redis,
      fallbackStoreSize: this.fallbackStore.size,
      endpointConfigs: Object.keys(ENDPOINT_CONFIGS),
      whitelistSize: WHITELIST_IPS.length,
      blacklistSize: BLACKLIST_IPS.size
    };
  }
  
  /**
   * Get endpoint configurations for rate limit headers
   */
  getEndpointConfigs() {
    return ENDPOINT_CONFIGS;
  }
  
  /**
   * Reset analytics
   */
  resetAnalytics() {
    this.analytics = {
      blocked: 0,
      allowed: 0,
      penalties: 0,
      alerts: 0
    };
  }
  
  /**
   * Clean up fallback store
   */
  cleanupFallbackStore() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, value] of this.fallbackStore.entries()) {
      if (value.expiresAt && value.expiresAt < now) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.fallbackStore.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired rate limit records`);
    }
  }
  
  /**
   * Close connections
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
    }
    this.fallbackStore.clear();
  }
}

// Singleton instance
let rateLimiterInstance = null;

export function getRateLimiter(options = {}) {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new AdvancedRateLimiter(options);
  }
  return rateLimiterInstance;
}

export default getRateLimiter();