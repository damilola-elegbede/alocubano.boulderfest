/**
 * Rate Limiter Domain Service
 * Handles rate limiting algorithms and window calculations
 */

export class RateLimiter {
  /**
   * Create a new rate limiter instance
   * @param {Map} storage - Storage map for rate limit data
   */
  constructor(storage = new Map()) {
    this.storage = storage;
  }

  /**
   * Check if request should be rate limited
   * @param {string} identifier - Unique identifier (IP, user ID, etc.)
   * @param {Object} options - Rate limit options
   * @returns {Object} Rate limit result
   */
  checkRateLimit(identifier, options = {}) {
    const {
      windowMs = 15 * 60 * 1000,    // 15 minutes
      maxRequests = 20,              // Max requests per window
      keyPrefix = 'ratelimit'        // Key prefix for storage
    } = options;

    if (!identifier || typeof identifier !== 'string') {
      throw new Error('Identifier is required and must be a string');
    }

    const key = `${keyPrefix}_${identifier}`;
    const now = Date.now();

    // Get or create rate limit data
    let rateLimitData = this.storage.get(key);
    
    if (!rateLimitData) {
      rateLimitData = {
        count: 0,
        windowStart: now,
        resetTime: now + windowMs
      };
      this.storage.set(key, rateLimitData);
    }

    // Check if window has expired
    if (now >= rateLimitData.resetTime) {
      rateLimitData = {
        count: 0,
        windowStart: now,
        resetTime: now + windowMs
      };
      this.storage.set(key, rateLimitData);
    }

    // Check if limit exceeded
    const isLimited = rateLimitData.count >= maxRequests;
    const remainingRequests = Math.max(0, maxRequests - rateLimitData.count);
    const retryAfter = isLimited ? Math.ceil((rateLimitData.resetTime - now) / 1000) : 0;

    return {
      allowed: !isLimited,
      limit: maxRequests,
      remaining: remainingRequests,
      resetTime: rateLimitData.resetTime,
      retryAfter: retryAfter,
      windowMs: windowMs,
      identifier: identifier,
      key: key
    };
  }

  /**
   * Increment rate limit counter
   * @param {string} identifier - Unique identifier
   * @param {Object} options - Rate limit options
   * @returns {Object} Updated rate limit result
   */
  incrementCounter(identifier, options = {}) {
    const result = this.checkRateLimit(identifier, options);
    
    if (result.allowed) {
      const rateLimitData = this.storage.get(result.key);
      if (rateLimitData) {
        rateLimitData.count++;
        this.storage.set(result.key, rateLimitData);
        
        // Update remaining count
        result.remaining = Math.max(0, result.limit - rateLimitData.count);
      }
    }

    return result;
  }

  /**
   * Reset rate limit for identifier
   * @param {string} identifier - Unique identifier
   * @param {string} keyPrefix - Key prefix for storage
   */
  resetRateLimit(identifier, keyPrefix = 'ratelimit') {
    const key = `${keyPrefix}_${identifier}`;
    this.storage.delete(key);
  }

  /**
   * Get current rate limit status without incrementing
   * @param {string} identifier - Unique identifier
   * @param {Object} options - Rate limit options
   * @returns {Object} Current rate limit status
   */
  getRateLimitStatus(identifier, options = {}) {
    return this.checkRateLimit(identifier, options);
  }

  /**
   * Clean expired rate limit entries
   * @param {string} keyPrefix - Key prefix to clean
   */
  cleanExpiredEntries(keyPrefix = 'ratelimit') {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, data] of this.storage.entries()) {
      if (key.startsWith(`${keyPrefix}_`) && now >= data.resetTime) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.storage.delete(key));
    
    return keysToDelete.length;
  }

  /**
   * Get all active rate limits for debugging
   * @param {string} keyPrefix - Key prefix to filter
   * @returns {Array} Active rate limits
   */
  getActiveRateLimits(keyPrefix = 'ratelimit') {
    const now = Date.now();
    const activeRateLimits = [];

    for (const [key, data] of this.storage.entries()) {
      if (key.startsWith(`${keyPrefix}_`) && now < data.resetTime) {
        activeRateLimits.push({
          key: key,
          identifier: key.replace(`${keyPrefix}_`, ''),
          count: data.count,
          windowStart: data.windowStart,
          resetTime: data.resetTime,
          timeRemaining: Math.max(0, data.resetTime - now)
        });
      }
    }

    return activeRateLimits;
  }

  /**
   * Configure sliding window rate limiter
   * @param {string} identifier - Unique identifier
   * @param {Object} options - Sliding window options
   * @returns {Object} Rate limit result
   */
  checkSlidingWindowRateLimit(identifier, options = {}) {
    const {
      windowMs = 15 * 60 * 1000,
      maxRequests = 20,
      keyPrefix = 'sliding'
    } = options;

    const key = `${keyPrefix}_${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get existing timestamps
    let timestamps = this.storage.get(key) || [];
    
    // Filter out expired timestamps
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);

    // Check if limit would be exceeded
    const isLimited = timestamps.length >= maxRequests;
    const remainingRequests = Math.max(0, maxRequests - timestamps.length);

    // Calculate when the oldest request will expire
    const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : now;
    const retryAfter = isLimited ? Math.ceil((oldestTimestamp + windowMs - now) / 1000) : 0;

    return {
      allowed: !isLimited,
      limit: maxRequests,
      remaining: remainingRequests,
      retryAfter: retryAfter,
      windowMs: windowMs,
      identifier: identifier,
      key: key,
      timestamps: timestamps.length
    };
  }

  /**
   * Increment sliding window rate limit
   * @param {string} identifier - Unique identifier
   * @param {Object} options - Sliding window options
   * @returns {Object} Updated rate limit result
   */
  incrementSlidingWindow(identifier, options = {}) {
    const result = this.checkSlidingWindowRateLimit(identifier, options);
    
    if (result.allowed) {
      const key = result.key;
      let timestamps = this.storage.get(key) || [];
      
      // Add current timestamp
      timestamps.push(Date.now());
      
      // Store updated timestamps
      this.storage.set(key, timestamps);
      
      // Update remaining count
      result.remaining = Math.max(0, result.limit - timestamps.length);
    }

    return result;
  }

  /**
   * Token bucket rate limiter
   * @param {string} identifier - Unique identifier
   * @param {Object} options - Token bucket options
   * @returns {Object} Rate limit result
   */
  checkTokenBucket(identifier, options = {}) {
    const {
      capacity = 20,                 // Bucket capacity
      refillRate = 1,               // Tokens per second
      tokensRequested = 1,          // Tokens needed for this request
      keyPrefix = 'bucket'
    } = options;

    const key = `${keyPrefix}_${identifier}`;
    const now = Date.now();

    // Get or create bucket
    let bucket = this.storage.get(key);
    
    if (!bucket) {
      bucket = {
        tokens: capacity,
        lastRefill: now
      };
      this.storage.set(key, bucket);
    }

    // Calculate tokens to add based on time elapsed
    const timeDelta = (now - bucket.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = Math.floor(timeDelta * refillRate);
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
      this.storage.set(key, bucket);
    }

    // Check if enough tokens available
    const allowed = bucket.tokens >= tokensRequested;
    
    if (allowed) {
      bucket.tokens -= tokensRequested;
      this.storage.set(key, bucket);
    }

    // Calculate retry after time
    const tokensNeeded = allowed ? 0 : tokensRequested - bucket.tokens;
    const retryAfter = allowed ? 0 : Math.ceil(tokensNeeded / refillRate);

    return {
      allowed: allowed,
      tokens: bucket.tokens,
      capacity: capacity,
      tokensRequested: tokensRequested,
      retryAfter: retryAfter,
      identifier: identifier,
      key: key
    };
  }

  /**
   * Extract identifier from request
   * @param {Object} req - Request object
   * @param {Object} options - Extraction options
   * @returns {string} Extracted identifier
   */
  static extractIdentifier(req, options = {}) {
    const {
      useUserAgent = false,
      useForwardedFor = true,
      fallbackIp = '127.0.0.1'
    } = options;

    let identifier = '';

    // Handle null or undefined request object
    if (!req) {
      return fallbackIp;
    }

    // Primary: X-Forwarded-For header
    if (useForwardedFor && req.headers && req.headers['x-forwarded-for']) {
      const forwarded = req.headers['x-forwarded-for'].split(',')[0].trim();
      identifier = forwarded;
    }
    
    // Fallback: Connection remote address
    if (!identifier && req.connection && req.connection.remoteAddress) {
      identifier = req.connection.remoteAddress;
    }
    
    // Fallback: Socket remote address
    if (!identifier && req.socket && req.socket.remoteAddress) {
      identifier = req.socket.remoteAddress;
    }
    
    // Ultimate fallback
    if (!identifier) {
      identifier = fallbackIp;
    }

    // Optionally include user agent for more specific limiting
    if (useUserAgent && req.headers && req.headers['user-agent']) {
      const userAgent = req.headers['user-agent'].slice(0, 100);
      identifier = `${identifier}_${Buffer.from(userAgent).toString('base64').slice(0, 20)}`;
    }

    return identifier;
  }

  /**
   * Create rate limit middleware
   * @param {Object} options - Middleware options
   * @returns {Function} Middleware function
   */
  static createMiddleware(options = {}) {
    const {
      windowMs = 15 * 60 * 1000,
      maxRequests = 20,
      keyPrefix = 'api',
      algorithm = 'fixed_window', // 'fixed_window', 'sliding_window', 'token_bucket'
      onLimitReached = null,
      skipSuccessfulRequests = false,
      skipFailedRequests = false
    } = options;

    const rateLimiter = new RateLimiter();

    return async (req, res, next) => {
      try {
        const identifier = RateLimiter.extractIdentifier(req, options);
        let result;

        switch (algorithm) {
          case 'sliding_window':
            result = rateLimiter.checkSlidingWindowRateLimit(identifier, {
              windowMs,
              maxRequests,
              keyPrefix
            });
            break;
          case 'token_bucket':
            result = rateLimiter.checkTokenBucket(identifier, {
              capacity: maxRequests,
              refillRate: maxRequests / (windowMs / 1000),
              keyPrefix
            });
            break;
          default: // fixed_window
            result = rateLimiter.checkRateLimit(identifier, {
              windowMs,
              maxRequests,
              keyPrefix
            });
        }

        // Set rate limit headers
        if (res && res.setHeader) {
          res.setHeader('X-RateLimit-Limit', result.limit || result.capacity || maxRequests);
          res.setHeader('X-RateLimit-Remaining', result.remaining || result.tokens || 0);
          
          if (result.resetTime) {
            res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
          }
        }

        if (!result.allowed) {
          // Rate limit exceeded
          if (onLimitReached && typeof onLimitReached === 'function') {
            return onLimitReached(req, res, next, result);
          }

          if (res && res.status && res.json) {
            res.setHeader('Retry-After', result.retryAfter);
            return res.status(429).json({
              error: 'Too many requests. Please try again later.',
              retryAfter: result.retryAfter
            });
          }
          
          return false; // For non-Express usage
        }

        // Increment counter for successful check
        if (algorithm === 'sliding_window') {
          rateLimiter.incrementSlidingWindow(identifier, { windowMs, maxRequests, keyPrefix });
        } else if (algorithm === 'fixed_window') {
          rateLimiter.incrementCounter(identifier, { windowMs, maxRequests, keyPrefix });
        }
        // Token bucket already decremented tokens during check

        // Continue to next middleware
        if (next && typeof next === 'function') {
          next();
        }
        
        return true;
      } catch (error) {
        console.error('Rate limiter error:', error);
        
        // Fail open - allow request if rate limiter fails
        if (next && typeof next === 'function') {
          next();
        }
        
        return true;
      }
    };
  }

  /**
   * Get memory usage statistics
   * @returns {Object} Memory usage stats
   */
  getMemoryStats() {
    return {
      totalEntries: this.storage.size,
      memoryUsage: JSON.stringify([...this.storage.entries()]).length
    };
  }
}