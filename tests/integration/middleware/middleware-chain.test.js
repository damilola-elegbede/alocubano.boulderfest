/**
 * Middleware Chain Integration Tests
 * Tests middleware execution order, error propagation, and request flow
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createErrorHandler } from '../../../middleware/error-handler.js';
import { sanitizeRequest, securityLogger } from '../../../middleware/security.js';
import { createRateLimitMiddleware } from '../../../middleware/rate-limit.js';

// Mock rate limiter
const mockRateLimiter = {
  checkRateLimit: vi.fn(),
  getEndpointConfigs: vi.fn(() => ({
    general: {
      ipLimit: { requests: 60, windowMs: 60000 }
    }
  }))
};

vi.mock('../../../lib/security/rate-limiter.js', () => ({
  getRateLimiter: () => mockRateLimiter
}));

describe('Middleware Chain Integration', () => {
  let req, res;
  let consoleWarnSpy, consoleErrorSpy;

  beforeEach(() => {
    req = {
      method: 'GET',
      url: '/api/test',
      path: '/api/test',
      headers: {
        'user-agent': 'Mozilla/5.0',
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.1.100',
        host: 'example.com'
      },
      connection: { remoteAddress: '192.168.1.100' }
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false
    };

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Middleware Execution Order', () => {
    test('should execute middleware in correct order', async () => {
      const executionOrder = [];

      const middleware1 = vi.fn(async (req, res, next) => {
        executionOrder.push('middleware1');
        next();
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        executionOrder.push('middleware2');
        next();
      });

      const middleware3 = vi.fn(async (req, res, next) => {
        executionOrder.push('middleware3');
        next();
      });

      await middleware1(req, res, () =>
        middleware2(req, res, () =>
          middleware3(req, res, () => {
            executionOrder.push('handler');
          })
        )
      );

      expect(executionOrder).toEqual([
        'middleware1',
        'middleware2',
        'middleware3',
        'handler'
      ]);
    });

    test('should execute security → rate limit → error handler chain', async () => {
      const executionOrder = [];

      const rateLimitMiddleware = createRateLimitMiddleware('general');

      await sanitizeRequest(req, res, () => {
        executionOrder.push('sanitize');

        securityLogger(req, res, async () => {
          executionOrder.push('security-logger');

          await rateLimitMiddleware(req, res, () => {
            executionOrder.push('rate-limit');
            executionOrder.push('handler');
          });
        });
      });

      expect(executionOrder).toEqual([
        'sanitize',
        'security-logger',
        'rate-limit',
        'handler'
      ]);
    });

    test('should stop chain on early termination', async () => {
      const middleware1 = vi.fn(async (req, res, next) => {
        res.status(401).json({ error: 'Unauthorized' });
        // Don't call next
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        next();
      });

      const handler = vi.fn();

      await middleware1(req, res, () =>
        middleware2(req, res, () => handler())
      );

      expect(middleware1).toHaveBeenCalled();
      expect(middleware2).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Pass-Through Behavior', () => {
    test('should pass request object through middleware chain', async () => {
      const middleware1 = vi.fn(async (req, res, next) => {
        req.custom1 = 'value1';
        next();
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        req.custom2 = 'value2';
        next();
      });

      const handler = vi.fn((req) => {
        expect(req.custom1).toBe('value1');
        expect(req.custom2).toBe('value2');
      });

      await middleware1(req, res, () =>
        middleware2(req, res, () => handler(req))
      );

      expect(handler).toHaveBeenCalled();
    });

    test('should pass response object through middleware chain', async () => {
      const middleware1 = vi.fn(async (req, res, next) => {
        res.setHeader('X-Custom-1', 'value1');
        next();
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        res.setHeader('X-Custom-2', 'value2');
        next();
      });

      await middleware1(req, res, () => middleware2(req, res, () => {}));

      expect(res.setHeader).toHaveBeenCalledWith('X-Custom-1', 'value1');
      expect(res.setHeader).toHaveBeenCalledWith('X-Custom-2', 'value2');
    });

    test('should preserve request modifications across async middleware', async () => {
      const middleware1 = vi.fn(async (req, res, next) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        req.asyncData = 'loaded';
        next();
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        expect(req.asyncData).toBe('loaded');
        next();
      });

      await middleware1(req, res, () => middleware2(req, res, () => {}));

      expect(middleware2).toHaveBeenCalled();
    });
  });

  describe('Error Propagation', () => {
    test('should propagate errors to error handler', async () => {
      const middleware = vi.fn(async (req, res, next) => {
        next(new Error('Middleware error'));
      });

      const errorHandler = createErrorHandler();

      await middleware(req, res, (error) => {
        if (error) {
          return errorHandler(error, req, res);
        }
      });

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Middleware error'
          })
        })
      );
    });

    test('should handle errors from async middleware', async () => {
      const middleware = vi.fn(async (req, res, next) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        next(new Error('Async error'));
      });

      const errorHandler = createErrorHandler();

      await middleware(req, res, (error) => {
        if (error) {
          return errorHandler(error, req, res);
        }
      });

      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('should stop chain when error occurs', async () => {
      const middleware1 = vi.fn(async (req, res, next) => {
        next(new Error('Error in middleware1'));
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        next();
      });

      const handler = vi.fn();

      await middleware1(req, res, (error) => {
        if (error) {
          return; // Stop chain
        }
        middleware2(req, res, () => handler());
      });

      expect(middleware1).toHaveBeenCalled();
      expect(middleware2).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    test('should handle errors thrown in middleware', async () => {
      const middleware = vi.fn(async () => {
        throw new Error('Thrown error');
      });

      const errorHandler = createErrorHandler();

      try {
        await middleware(req, res, () => {});
      } catch (error) {
        await errorHandler(error, req, res);
      }

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Request Flow', () => {
    test('should sanitize request before rate limiting', async () => {
      req.headers['x-cluster-client-ip'] = '10.0.0.1';
      req.headers['content-length'] = '1000';

      const rateLimitMiddleware = createRateLimitMiddleware('general');

      await sanitizeRequest(req, res, async () => {
        expect(req.headers['x-cluster-client-ip']).toBeUndefined();

        await rateLimitMiddleware(req, res, () => {
          expect(mockRateLimiter.checkRateLimit).toHaveBeenCalled();
        });
      });
    });

    test('should log security events before rate limiting', async () => {
      req.url = '/api/test/../../etc/passwd';

      const rateLimitMiddleware = createRateLimitMiddleware('general');

      await securityLogger(req, res, async () => {
        expect(consoleWarnSpy).toHaveBeenCalled();

        await rateLimitMiddleware(req, res, () => {
          expect(mockRateLimiter.checkRateLimit).toHaveBeenCalled();
        });
      });
    });

    test('should block request at rate limit before reaching handler', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300
      });

      const rateLimitMiddleware = createRateLimitMiddleware('general');
      const handler = vi.fn();

      await rateLimitMiddleware(req, res, (error) => {
        if (!error) {
          handler();
        }
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Response Modification', () => {
    test('should allow middleware to modify response headers', async () => {
      const middleware1 = vi.fn(async (req, res, next) => {
        res.setHeader('X-Middleware-1', 'true');
        next();
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        res.setHeader('X-Middleware-2', 'true');
        next();
      });

      await middleware1(req, res, () => middleware2(req, res, () => {}));

      expect(res.setHeader).toHaveBeenCalledWith('X-Middleware-1', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('X-Middleware-2', 'true');
    });

    test('should prevent header modification after response sent', async () => {
      const middleware1 = vi.fn(async (req, res, next) => {
        res.headersSent = true;
        next();
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        if (!res.headersSent) {
          res.setHeader('X-Should-Not-Set', 'true');
        }
        next();
      });

      await middleware1(req, res, () => middleware2(req, res, () => {}));

      expect(res.setHeader).not.toHaveBeenCalledWith(
        'X-Should-Not-Set',
        'true'
      );
    });
  });

  describe('Context Passing', () => {
    test('should pass security context to next middleware', async () => {
      req.url = '/api/test';

      await securityLogger(req, res, async () => {
        // Security logger doesn't add context in this implementation
        // but other middleware might
        expect(req.url).toBe('/api/test');

        const rateLimitMiddleware = createRateLimitMiddleware('general');
        await rateLimitMiddleware(req, res, () => {
          expect(mockRateLimiter.checkRateLimit).toHaveBeenCalled();
        });
      });
    });

    test('should preserve custom request properties', async () => {
      req.customProperty = 'test-value';

      const middleware1 = vi.fn(async (req, res, next) => {
        expect(req.customProperty).toBe('test-value');
        req.customProperty = 'modified';
        next();
      });

      const middleware2 = vi.fn(async (req, res, next) => {
        expect(req.customProperty).toBe('modified');
        next();
      });

      await middleware1(req, res, () => middleware2(req, res, () => {}));

      expect(middleware2).toHaveBeenCalled();
    });
  });

  describe('Complete Middleware Stack', () => {
    test('should execute full security stack successfully', async () => {
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const rateLimitMiddleware = createRateLimitMiddleware('general');

      await sanitizeRequest(req, res, () =>
        securityLogger(req, res, async () =>
          rateLimitMiddleware(req, res, async () => {
            await handler(req, res);
          })
        )
      );

      expect(handler).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should handle payload too large in sanitize step', async () => {
      req.headers['content-length'] = String(11 * 1024 * 1024);

      const handler = vi.fn();
      const rateLimitMiddleware = createRateLimitMiddleware('general');

      await sanitizeRequest(req, res, () =>
        rateLimitMiddleware(req, res, () => handler())
      );

      expect(res.status).toHaveBeenCalledWith(413);
      expect(handler).not.toHaveBeenCalled();
    });

    test('should handle rate limit exceeded in rate limit step', async () => {
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        clientId: '192.168.1.100',
        reason: 'rate_limit_exceeded',
        retryAfter: 300
      });

      const handler = vi.fn();
      const rateLimitMiddleware = createRateLimitMiddleware('general');

      await sanitizeRequest(req, res, () =>
        securityLogger(req, res, async () =>
          rateLimitMiddleware(req, res, () => handler())
        )
      );

      expect(handler).not.toHaveBeenCalled();
    });

    test('should log security events but continue processing', async () => {
      req.url = '/api/test/../../etc/passwd';

      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const rateLimitMiddleware = createRateLimitMiddleware('general');

      await sanitizeRequest(req, res, () =>
        securityLogger(req, res, async () =>
          rateLimitMiddleware(req, res, async () => {
            await handler(req, res);
          })
        )
      );

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Error Handling in Chain', () => {
    test('should handle error from sanitize middleware', async () => {
      req.headers['content-length'] = String(15 * 1024 * 1024);

      const rateLimitMiddleware = createRateLimitMiddleware('general');
      const handler = vi.fn();
      const errorHandler = createErrorHandler();

      await sanitizeRequest(req, res, () =>
        rateLimitMiddleware(req, res, () => handler())
      );

      expect(res.status).toHaveBeenCalledWith(413);
      expect(handler).not.toHaveBeenCalled();
    });

    test('should handle error from handler in error middleware', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Handler error');
      });

      const errorHandler = createErrorHandler();

      try {
        await handler(req, res);
      } catch (error) {
        await errorHandler(error, req, res);
      }

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
