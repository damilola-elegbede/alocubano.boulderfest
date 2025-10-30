/**
 * Rate Limit Middleware Unit Tests
 * Tests for rate limiting, client identification, penalty system, and performance
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRateLimitMiddleware,
  paymentRateLimit,
  qrValidationRateLimit,
  authRateLimit,
  emailRateLimit,
  generalApiRateLimit,
  withRateLimit,
  expressRateLimit,
  customRateLimit,
  bulkRateLimit,
  rateLimitStatus
} from '../../../middleware/rate-limit.js';
import { ApplicationError } from '../../../middleware/error-handler.js';

// Mock rate limiter
const mockRateLimiter = {
  checkRateLimit: vi.fn(),
  getAnalytics: vi.fn(() => ({
    blocked: 0,
    allowed: 100,
    penalties: 0
  })),
  getClientId: vi.fn(() => '192.168.1.100'),
  isWhitelisted: vi.fn(() => false),
  isBlacklisted: vi.fn(() => false),
  getEndpointConfigs: vi.fn(() => ({
    general: {
      ipLimit: { requests: 60, windowMs: 60000 }
    }
  })),
  constructor: {
    ENDPOINT_CONFIGS: {
      general: {},
      payment: {},
      auth: {}
    }
  }
};

vi.mock('../../../lib/security/rate-limiter.js', () => ({
  getRateLimiter: () => mockRateLimiter
}));

describe('Rate Limit Middleware', () => {
  let req, res, next;
  let consoleErrorSpy;

  beforeEach(() => {
    req = {
      method: 'GET',
      url: '/api/test',
      headers: {
        'x-forwarded-for': '192.168.1.100'
      },
      connection: { remoteAddress: '192.168.1.100' }
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      headersSent: false
    };

    next = vi.fn();

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Reset mock implementations
    mockRateLimiter.checkRateLimit.mockResolvedValue({
      allowed: true,
      clientId: '192.168.1.100',
      remaining: 59,
      limit: 60,
      windowMs: 60000,
      resetTime: Date.now() + 60000
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('createRateLimitMiddleware', () => {
    test('should allow requests under rate limit', async () => {
      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'general',
        expect.objectContaining({
          clientType: 'ip'
        })
      );
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should block requests over rate limit', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300
      });

      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Rate limit exceeded')
        })
      );
    });

    test('should set rate limit headers for allowed requests', async () => {
      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Endpoint', 'general');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Client', '192.168.1.100');
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 60);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 59);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    test('should set rate limit headers for blocked requests', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300
      });

      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Exceeded', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 300);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Retry-After', 300);
    });

    test('should include performance timing header', async () => {
      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Performance',
        expect.stringMatching(/\d+ms/)
      );
    });

    test('should handle penalty multiplier in error details', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300,
        penaltyMultiplier: 2
      });

      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            penaltyMultiplier: 2
          })
        })
      );
    });

    test('should handle blacklisted clients with 403 status', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'blacklisted'
      });

      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: 'Access denied due to suspicious activity.'
        })
      );
    });

    test('should skip rate limiting in development when configured', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const middleware = createRateLimitMiddleware('general', {
        skipInDevelopment: true
      });

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    test('should fail open when rate limiter errors', async () => {
      mockRateLimiter.checkRateLimit.mockRejectedValue(
        new Error('Rate limiter unavailable')
      );

      const middleware = createRateLimitMiddleware('general', {
        failOpen: true
      });

      await middleware(req, res, next);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(next).toHaveBeenCalled(); // Request allowed
    });

    test('should fail closed when configured', async () => {
      mockRateLimiter.checkRateLimit.mockRejectedValue(
        new Error('Rate limiter unavailable')
      );

      const middleware = createRateLimitMiddleware('general', {
        failOpen: false
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          message: expect.stringContaining('temporarily unavailable')
        })
      );
    });

    test('should work without next callback', async () => {
      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res);

      expect(res.setHeader).toHaveBeenCalled();
    });

    test('should handle blocked request without next callback', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300
      });

      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalled();
    });

    test('should use fallback config for headers when result missing', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: true,
        clientId: '192.168.1.100'
        // limit and windowMs missing
      });

      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 60);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Window', 60);
    });
  });

  describe('Endpoint-Specific Rate Limiters', () => {
    test('paymentRateLimit should create payment endpoint middleware', async () => {
      const middleware = paymentRateLimit();

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'payment',
        expect.objectContaining({
          clientType: 'ip'
        })
      );
    });

    test('qrValidationRateLimit should create QR validation middleware', async () => {
      const middleware = qrValidationRateLimit();

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'qrValidation',
        expect.objectContaining({
          clientType: 'device'
        })
      );
    });

    test('authRateLimit should create auth endpoint middleware', async () => {
      const middleware = authRateLimit();

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'auth',
        expect.objectContaining({
          clientType: 'ip'
        })
      );
    });

    test('emailRateLimit should create email endpoint middleware', async () => {
      const middleware = emailRateLimit();

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'email',
        expect.objectContaining({
          clientType: 'ip'
        })
      );
    });

    test('generalApiRateLimit should create general API middleware', async () => {
      const middleware = generalApiRateLimit();

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'general',
        expect.objectContaining({
          clientType: 'ip'
        })
      );
    });

    test('should accept custom options', async () => {
      const customOptions = { customKey: 'value' };
      const middleware = paymentRateLimit(customOptions);

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'payment',
        expect.objectContaining({
          clientType: 'ip',
          customKey: 'value'
        })
      );
    });
  });

  describe('withRateLimit Wrapper', () => {
    test('should wrap handler with rate limiting', async () => {
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withRateLimit(handler, 'general');

      await wrappedHandler(req, res);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });

    test('should block handler if rate limit exceeded', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300
      });

      const handler = vi.fn();
      const wrappedHandler = withRateLimit(handler, 'general');

      await wrappedHandler(req, res);

      expect(handler).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
    });

    test('should not call handler if response already sent', async () => {
      res.headersSent = true;

      const handler = vi.fn();
      const wrappedHandler = withRateLimit(handler, 'general');

      await wrappedHandler(req, res);

      expect(handler).not.toHaveBeenCalled();
    });

    test('should default to general endpoint type', async () => {
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withRateLimit(handler);

      await wrappedHandler(req, res);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'general',
        expect.any(Object)
      );
    });
  });

  describe('expressRateLimit', () => {
    test('should create Express-compatible middleware', async () => {
      const middleware = expressRateLimit('general');

      expect(typeof middleware).toBe('function');

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    test('should accept options', async () => {
      const middleware = expressRateLimit('payment', { customOption: 'value' });

      await middleware(req, res, next);

      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalledWith(
        req,
        'payment',
        expect.objectContaining({
          customOption: 'value'
        })
      );
    });
  });

  describe('customRateLimit', () => {
    test('should support custom pre-check logic', async () => {
      const customCheck = vi.fn(async () => true);

      const middleware = customRateLimit({
        endpointType: 'general',
        customCheck
      });

      await middleware(req, res, next);

      expect(customCheck).toHaveBeenCalledWith(req, res);
      expect(mockRateLimiter.checkRateLimit).toHaveBeenCalled();
    });

    test('should skip rate limiting if customCheck returns false', async () => {
      const customCheck = vi.fn(async () => false);

      const middleware = customRateLimit({
        endpointType: 'general',
        customCheck
      });

      await middleware(req, res, next);

      expect(customCheck).toHaveBeenCalled();
      expect(mockRateLimiter.checkRateLimit).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    test('should support custom onAllowed callback', async () => {
      const onAllowed = vi.fn();

      const middleware = customRateLimit({
        endpointType: 'general',
        onAllowed
      });

      await middleware(req, res, next);

      expect(onAllowed).toHaveBeenCalledWith(
        req,
        res,
        expect.objectContaining({
          allowed: true
        })
      );
    });

    test('should support custom onExceeded callback', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300
      });

      const onExceeded = vi.fn();

      const middleware = customRateLimit({
        endpointType: 'general',
        onExceeded
      });

      await middleware(req, res, next);

      expect(onExceeded).toHaveBeenCalledWith(
        req,
        res,
        expect.objectContaining({
          allowed: false
        })
      );
    });

    test('should use default behavior if onExceeded not provided', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300
      });

      const middleware = customRateLimit({
        endpointType: 'general'
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(ApplicationError)
      );
    });

    test('should handle errors gracefully', async () => {
      mockRateLimiter.checkRateLimit.mockRejectedValue(
        new Error('Rate limiter error')
      );

      const middleware = customRateLimit({
        endpointType: 'general'
      });

      await middleware(req, res, next);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('bulkRateLimit', () => {
    test('should create multiple middleware for different endpoints', () => {
      const endpoints = {
        '/api/payment': { type: 'payment' },
        '/api/auth': { type: 'auth' },
        '/api/general': { type: 'general' }
      };

      const middlewares = bulkRateLimit(endpoints);

      expect(Object.keys(middlewares)).toHaveLength(3);
      expect(typeof middlewares['/api/payment']).toBe('function');
      expect(typeof middlewares['/api/auth']).toBe('function');
      expect(typeof middlewares['/api/general']).toBe('function');
    });

    test('should default to general type if not specified', () => {
      const endpoints = {
        '/api/endpoint1': {},
        '/api/endpoint2': {}
      };

      const middlewares = bulkRateLimit(endpoints);

      expect(Object.keys(middlewares)).toHaveLength(2);
    });
  });

  describe('rateLimitStatus', () => {
    test('should return basic status in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const handler = rateLimitStatus();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
          client: expect.objectContaining({
            whitelisted: false,
            blacklisted: false
          }),
          endpoints: expect.any(Array)
        })
      );

      // Should not include sensitive data
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.client.id).toBeUndefined();
      expect(jsonCall.analytics).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    test('should return detailed status in non-production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const handler = rateLimitStatus();
      await handler(req, res);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.client.id).toBeDefined();
      expect(jsonCall.analytics).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    test('should include analytics data', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const handler = rateLimitStatus();
      await handler(req, res);

      expect(mockRateLimiter.getAnalytics).toHaveBeenCalled();

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.analytics).toEqual({
        blocked: 0,
        allowed: 100,
        penalties: 0
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Performance', () => {
    test('should complete rate limit check quickly', async () => {
      const middleware = createRateLimitMiddleware('general');

      const startTime = Date.now();
      await middleware(req, res, next);
      const duration = Date.now() - startTime;

      // Should complete in less than 100ms (typically <5ms)
      expect(duration).toBeLessThan(100);
    });

    test('should include performance header with actual timing', async () => {
      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      const perfCall = res.setHeader.mock.calls.find(
        call => call[0] === 'X-RateLimit-Performance'
      );

      expect(perfCall).toBeDefined();
      expect(perfCall[1]).toMatch(/^\d+ms$/);
    });
  });

  describe('Error Messages', () => {
    test('should provide user-friendly error messages', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 180
      });

      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('3 minute')
        })
      );
    });

    test('should handle singular minute in message', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 60
      });

      const middleware = createRateLimitMiddleware('general');

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('1 minute')
        })
      );
    });
  });
});
