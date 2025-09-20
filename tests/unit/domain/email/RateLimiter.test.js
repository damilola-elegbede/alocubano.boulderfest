import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../../../lib/domain/email/RateLimiter.js';

describe('RateLimiter Domain Service', () => {
  let rateLimiter;
  let mockStorage;

  beforeEach(() => {
    mockStorage = new Map();
    rateLimiter = new RateLimiter(mockStorage);
  });

  describe('constructor', () => {
    it('creates instance with provided storage', () => {
      const customStorage = new Map();
      const limiter = new RateLimiter(customStorage);
      expect(limiter.storage).toBe(customStorage);
    });

    it('creates instance with default storage', () => {
      const limiter = new RateLimiter();
      expect(limiter.storage).toBeInstanceOf(Map);
    });
  });

  describe('checkRateLimit()', () => {
    it('allows first request within limit', () => {
      const result = rateLimiter.checkRateLimit('user1');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(20);
      expect(result.resetTime).toBeGreaterThan(Date.now());
      expect(result.retryAfter).toBe(0);
      expect(result.windowMs).toBe(15 * 60 * 1000);
      expect(result.identifier).toBe('user1');
      expect(result.key).toBe('ratelimit_user1');
    });

    it('tracks multiple requests within window', () => {
      // Make multiple requests
      rateLimiter.incrementCounter('user1');
      rateLimiter.incrementCounter('user1');
      const result = rateLimiter.checkRateLimit('user1');

      expect(result.remaining).toBe(18); // 20 - 2
    });

    it('blocks requests when limit exceeded', () => {
      const options = { maxRequests: 2 };

      // Consume all requests
      rateLimiter.incrementCounter('user1', options);
      rateLimiter.incrementCounter('user1', options);

      const result = rateLimiter.checkRateLimit('user1', options);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('resets window when expired', () => {
      const options = { windowMs: 100, maxRequests: 2 };

      // Consume requests
      rateLimiter.incrementCounter('user1', options);
      rateLimiter.incrementCounter('user1', options);

      expect(rateLimiter.checkRateLimit('user1', options).allowed).toBe(false);

      // Wait for window to expire
      return new Promise(resolve => {
        setTimeout(() => {
          const result = rateLimiter.checkRateLimit('user1', options);
          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(2);
          resolve();
        }, 150);
      });
    });

    it('uses custom options', () => {
      const options = {
        windowMs: 60000,
        maxRequests: 10,
        keyPrefix: 'custom'
      };

      const result = rateLimiter.checkRateLimit('user1', options);

      expect(result.limit).toBe(10);
      expect(result.windowMs).toBe(60000);
      expect(result.key).toBe('custom_user1');
    });

    it('throws error for invalid identifier', () => {
      expect(() => {
        rateLimiter.checkRateLimit(null);
      }).toThrow('Identifier is required and must be a string');

      expect(() => {
        rateLimiter.checkRateLimit(123);
      }).toThrow('Identifier is required and must be a string');

      expect(() => {
        rateLimiter.checkRateLimit('');
      }).toThrow('Identifier is required and must be a string');
    });

    it('handles concurrent requests for different identifiers', () => {
      const result1 = rateLimiter.checkRateLimit('user1');
      const result2 = rateLimiter.checkRateLimit('user2');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.key).not.toBe(result2.key);
    });
  });

  describe('incrementCounter()', () => {
    it('increments counter and updates remaining', () => {
      const result1 = rateLimiter.incrementCounter('user1');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(19);

      const result2 = rateLimiter.incrementCounter('user1');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(18);
    });

    it('does not increment when limit exceeded', () => {
      const options = { maxRequests: 1 };

      const result1 = rateLimiter.incrementCounter('user1', options);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(0);

      const result2 = rateLimiter.incrementCounter('user1', options);
      expect(result2.allowed).toBe(false);
      expect(result2.remaining).toBe(0);
    });

    it('updates storage correctly', () => {
      rateLimiter.incrementCounter('user1');

      const storedData = mockStorage.get('ratelimit_user1');
      expect(storedData.count).toBe(1);
      expect(storedData.windowStart).toBeDefined();
      expect(storedData.resetTime).toBeDefined();
    });
  });

  describe('resetRateLimit()', () => {
    it('removes rate limit data for identifier', () => {
      rateLimiter.incrementCounter('user1');
      expect(mockStorage.has('ratelimit_user1')).toBe(true);

      rateLimiter.resetRateLimit('user1');
      expect(mockStorage.has('ratelimit_user1')).toBe(false);
    });

    it('uses custom key prefix', () => {
      rateLimiter.incrementCounter('user1', { keyPrefix: 'custom' });
      expect(mockStorage.has('custom_user1')).toBe(true);

      rateLimiter.resetRateLimit('user1', 'custom');
      expect(mockStorage.has('custom_user1')).toBe(false);
    });
  });

  describe('getRateLimitStatus()', () => {
    it('returns current status without modifying counter', () => {
      rateLimiter.incrementCounter('user1');

      const status1 = rateLimiter.getRateLimitStatus('user1');
      const status2 = rateLimiter.getRateLimitStatus('user1');

      expect(status1.remaining).toBe(status2.remaining);
      expect(status1.remaining).toBe(19);
    });
  });

  describe('cleanExpiredEntries()', () => {
    it('removes expired entries', () => {
      const options = { windowMs: 100 };

      // Create entries that will expire
      rateLimiter.incrementCounter('user1', options);
      rateLimiter.incrementCounter('user2', options);

      expect(mockStorage.size).toBe(2);

      return new Promise(resolve => {
        setTimeout(() => {
          const cleanedCount = rateLimiter.cleanExpiredEntries('ratelimit');
          expect(cleanedCount).toBe(2);
          expect(mockStorage.size).toBe(0);
          resolve();
        }, 150);
      });
    });

    it('keeps non-expired entries', () => {
      rateLimiter.incrementCounter('user1');
      rateLimiter.incrementCounter('user2');

      const cleanedCount = rateLimiter.cleanExpiredEntries('ratelimit');
      expect(cleanedCount).toBe(0);
      expect(mockStorage.size).toBe(2);
    });

    it('filters by key prefix', () => {
      rateLimiter.incrementCounter('user1', { keyPrefix: 'api' });
      rateLimiter.incrementCounter('user2', { keyPrefix: 'email' });

      const cleanedCount = rateLimiter.cleanExpiredEntries('api');
      expect(cleanedCount).toBe(0);
      expect(mockStorage.size).toBe(2);
    });
  });

  describe('getActiveRateLimits()', () => {
    it('returns active rate limits', () => {
      rateLimiter.incrementCounter('user1');
      rateLimiter.incrementCounter('user2');

      const active = rateLimiter.getActiveRateLimits('ratelimit');

      expect(active).toHaveLength(2);
      expect(active[0].identifier).toBe('user1');
      expect(active[1].identifier).toBe('user2');
      expect(active[0].count).toBe(1);
      expect(active[0].timeRemaining).toBeGreaterThan(0);
    });

    it('excludes expired entries', () => {
      const options = { windowMs: 100 };

      rateLimiter.incrementCounter('user1', options);

      return new Promise(resolve => {
        setTimeout(() => {
          const active = rateLimiter.getActiveRateLimits('ratelimit');
          expect(active).toHaveLength(0);
          resolve();
        }, 150);
      });
    });

    it('filters by key prefix', () => {
      rateLimiter.incrementCounter('user1', { keyPrefix: 'api' });
      rateLimiter.incrementCounter('user2', { keyPrefix: 'email' });

      const apiActive = rateLimiter.getActiveRateLimits('api');
      const emailActive = rateLimiter.getActiveRateLimits('email');

      expect(apiActive).toHaveLength(1);
      expect(emailActive).toHaveLength(1);
      expect(apiActive[0].identifier).toBe('user1');
      expect(emailActive[0].identifier).toBe('user2');
    });
  });

  describe('checkSlidingWindowRateLimit()', () => {
    it('allows requests within sliding window', () => {
      const options = { maxRequests: 3, windowMs: 1000 };

      const result = rateLimiter.checkSlidingWindowRateLimit('user1', options);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
      expect(result.timestamps).toBe(0);
    });

    it('blocks when sliding window limit exceeded', () => {
      const options = { maxRequests: 2, windowMs: 10000 };

      rateLimiter.incrementSlidingWindow('user1', options);
      rateLimiter.incrementSlidingWindow('user1', options);

      const result = rateLimiter.checkSlidingWindowRateLimit('user1', options);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('allows requests after oldest timestamp expires', () => {
      const options = { maxRequests: 1, windowMs: 100 };

      rateLimiter.incrementSlidingWindow('user1', options);
      expect(rateLimiter.checkSlidingWindowRateLimit('user1', options).allowed).toBe(false);

      return new Promise(resolve => {
        setTimeout(() => {
          const result = rateLimiter.checkSlidingWindowRateLimit('user1', options);
          expect(result.allowed).toBe(true);
          resolve();
        }, 150);
      });
    });

    it('calculates retry after correctly', () => {
      const options = { maxRequests: 1, windowMs: 1000 };

      rateLimiter.incrementSlidingWindow('user1', options);
      const result = rateLimiter.checkSlidingWindowRateLimit('user1', options);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(1);
    });
  });

  describe('incrementSlidingWindow()', () => {
    it('adds timestamp when allowed', () => {
      const options = { maxRequests: 2, windowMs: 1000 };

      const result1 = rateLimiter.incrementSlidingWindow('user1', options);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(1);

      const result2 = rateLimiter.incrementSlidingWindow('user1', options);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(0);
    });

    it('does not add timestamp when blocked', () => {
      const options = { maxRequests: 1, windowMs: 1000 };

      rateLimiter.incrementSlidingWindow('user1', options);
      const result = rateLimiter.incrementSlidingWindow('user1', options);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('checkTokenBucket()', () => {
    it('allows requests when tokens available', () => {
      const options = { capacity: 5, refillRate: 1 };

      const result = rateLimiter.checkTokenBucket('user1', options);

      expect(result.allowed).toBe(true);
      expect(result.tokens).toBe(4); // 5 - 1 (default tokensRequested)
      expect(result.capacity).toBe(5);
      expect(result.retryAfter).toBe(0);
    });

    it('blocks requests when insufficient tokens', () => {
      const options = { capacity: 1, refillRate: 1, tokensRequested: 2 };

      const result = rateLimiter.checkTokenBucket('user1', options);

      expect(result.allowed).toBe(false);
      expect(result.tokens).toBe(1);
      expect(result.tokensRequested).toBe(2);
      expect(result.retryAfter).toBe(1); // 1 token needed / 1 token per second
    });

    it('refills tokens over time', () => {
      const options = { capacity: 5, refillRate: 10 }; // 10 tokens per second

      // Consume all tokens
      rateLimiter.checkTokenBucket('user1', { ...options, tokensRequested: 5 });
      expect(rateLimiter.checkTokenBucket('user1', options).tokens).toBe(0);

      return new Promise(resolve => {
        setTimeout(() => {
          const result = rateLimiter.checkTokenBucket('user1', options);
          expect(result.tokens).toBeGreaterThan(0);
          expect(result.tokens).toBeLessThanOrEqual(5);
          resolve();
        }, 200);
      });
    });

    it('does not exceed bucket capacity', () => {
      const options = { capacity: 3, refillRate: 10 };

      return new Promise(resolve => {
        setTimeout(() => {
          const result = rateLimiter.checkTokenBucket('user1', options);
          expect(result.tokens).toBeLessThanOrEqual(3);
          resolve();
        }, 100);
      });
    });

    it('deducts tokens when request allowed', () => {
      const options = { capacity: 5, refillRate: 1, tokensRequested: 2 };

      const result = rateLimiter.checkTokenBucket('user1', options);

      expect(result.allowed).toBe(true);
      expect(result.tokens).toBe(3); // 5 - 2
    });
  });

  describe('static extractIdentifier()', () => {
    it('extracts IP from x-forwarded-for header', () => {
      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1'
        }
      };

      const identifier = RateLimiter.extractIdentifier(req);
      expect(identifier).toBe('192.168.1.1');
    });

    it('extracts IP from connection.remoteAddress', () => {
      const req = {
        connection: {
          remoteAddress: '192.168.1.2'
        }
      };

      const identifier = RateLimiter.extractIdentifier(req);
      expect(identifier).toBe('192.168.1.2');
    });

    it('extracts IP from socket.remoteAddress', () => {
      const req = {
        socket: {
          remoteAddress: '192.168.1.3'
        }
      };

      const identifier = RateLimiter.extractIdentifier(req);
      expect(identifier).toBe('192.168.1.3');
    });

    it('uses fallback IP when no IP found', () => {
      const req = {};
      const identifier = RateLimiter.extractIdentifier(req, { fallbackIp: '127.0.0.1' });
      expect(identifier).toBe('127.0.0.1');
    });

    it('includes user agent when option enabled', () => {
      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0'
        }
      };

      const identifier = RateLimiter.extractIdentifier(req, { useUserAgent: true });
      expect(identifier).toMatch(/^192\.168\.1\.1_[A-Za-z0-9+/]+=*$/);
    });

    it('prioritizes x-forwarded-for over connection', () => {
      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1'
        },
        connection: {
          remoteAddress: '10.0.0.1'
        }
      };

      const identifier = RateLimiter.extractIdentifier(req);
      expect(identifier).toBe('192.168.1.1');
    });

    it('handles x-forwarded-for disabled', () => {
      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.1'
        },
        connection: {
          remoteAddress: '10.0.0.1'
        }
      };

      const identifier = RateLimiter.extractIdentifier(req, { useForwardedFor: false });
      expect(identifier).toBe('10.0.0.1');
    });
  });

  describe('static createMiddleware()', () => {
    it('creates middleware function', () => {
      const middleware = RateLimiter.createMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('allows request within limits', async () => {
      const middleware = RateLimiter.createMiddleware({ maxRequests: 5 });
      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res = { setHeader: vi.fn() };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(next).toHaveBeenCalled();
    });

    it('blocks request when limit exceeded', async () => {
      const middleware = RateLimiter.createMiddleware({
        maxRequests: 1,
        windowMs: 60000
      });
      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      // First request should pass
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();

      // Reset mocks
      res.status.mockClear();
      res.json.mockClear();
      next.mockClear();

      // Second request should be blocked
      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests. Please try again later.'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('calls custom onLimitReached handler', async () => {
      const onLimitReached = vi.fn();
      const middleware = RateLimiter.createMiddleware({
        maxRequests: 0, // Immediately hit limit
        onLimitReached
      });
      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res = { setHeader: vi.fn() };
      const next = vi.fn();

      await middleware(req, res, next);

      expect(onLimitReached).toHaveBeenCalledWith(req, res, next, expect.any(Object));
    });

    it('handles errors gracefully', async () => {
      // Create middleware with invalid options to force an error
      const middleware = RateLimiter.createMiddleware();
      const req = null; // This will cause an error
      const res = { setHeader: vi.fn() };
      const next = vi.fn();

      const result = await middleware(req, res, next);

      // Should fail open (allow request) when rate limiter fails
      expect(result).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('supports different algorithms', async () => {
      const middleware = RateLimiter.createMiddleware({
        algorithm: 'sliding_window',
        maxRequests: 5,
        windowMs: 1000
      });

      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res = { setHeader: vi.fn() };
      const next = vi.fn();

      const result = await middleware(req, res, next);
      expect(result).toBe(true);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('getMemoryStats()', () => {
    it('returns memory usage statistics', () => {
      rateLimiter.incrementCounter('user1');
      rateLimiter.incrementCounter('user2');

      const stats = rateLimiter.getMemoryStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(typeof stats.memoryUsage).toBe('number');
    });

    it('returns zero stats for empty storage', () => {
      const stats = rateLimiter.getMemoryStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.memoryUsage).toBeGreaterThanOrEqual(0);
    });
  });
});