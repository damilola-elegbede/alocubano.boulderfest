/**
 * Security Integration Tests
 * Tests security headers, attack prevention, and environment-specific behavior
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enforceHTTPS,
  sanitizeRequest,
  securityLogger,
  createAPISecurityMiddleware,
  createAdminSecurityMiddleware
} from '../../../middleware/security.js';

// Mock dependencies
vi.mock('../../../lib/security-headers.js', () => ({
  withSecurityHeaders: (handler) => async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    return handler(req, res);
  },
  addAPISecurityHeaders: (req, res, options) => {
    res.setHeader('Access-Control-Allow-Origin', options?.corsOrigins?.[0] || '*');
    res.setHeader('X-API-Security', 'enabled');
  },
  addCSRFHeaders: (res, token) => {
    res.setHeader('X-CSRF-Token', token);
  }
}));

vi.mock('../../../middleware/error-handler.js', () => ({
  withErrorHandling: (handler) => handler
}));

vi.mock('../../../middleware/rate-limit.js', () => ({
  createRateLimitMiddleware: () => async (req, res, next) => next()
}));

describe('Security Integration', () => {
  let req, res, next;
  let consoleWarnSpy;

  beforeEach(() => {
    req = {
      method: 'GET',
      url: '/api/test',
      path: '/api/test',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
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

    next = vi.fn();

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy.mockRestore();
  });

  describe('Security Headers in Responses', () => {
    test('should include basic security headers', async () => {
      const middleware = createAPISecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff'
      );
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-XSS-Protection',
        '1; mode=block'
      );
    });

    test('should include API-specific headers', async () => {
      const middleware = createAPISecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-API-Security', 'enabled');
    });

    test('should include CORS headers for API', async () => {
      const middleware = createAPISecurityMiddleware({
        corsOrigins: ['https://trusted-origin.com']
      });
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'https://trusted-origin.com'
      );
    });

    test('should include admin-specific headers', async () => {
      const middleware = createAdminSecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Admin-Endpoint', 'true');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate'
      );
    });

    test('should not cache admin responses', async () => {
      const middleware = createAdminSecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      const cacheControlCall = res.setHeader.mock.calls.find(
        call => call[0] === 'Cache-Control'
      );

      expect(cacheControlCall[1]).toContain('no-store');
      expect(cacheControlCall[1]).toContain('no-cache');
    });
  });

  describe('XSS Attack Prevention', () => {
    test('should detect XSS in URL parameters', async () => {
      req.url = '/api/test?search=<script>alert(1)</script>';

      await securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Security events detected:',
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({
              type: 'suspicious_pattern'
            })
          ])
        })
      );
    });

    test('should detect XSS in user agent', async () => {
      req.headers['user-agent'] = '<script>alert(1)</script>';

      await securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should detect JavaScript protocol', async () => {
      req.url = '/api/test?redirect=javascript:alert(1)';

      await securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should detect data URI XSS', async () => {
      req.url = '/api/test?image=data:text/html,<script>alert(1)</script>';

      await securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should continue processing after XSS detection', async () => {
      req.url = '/api/test?param=<script>alert(1)</script>';

      await securityLogger(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('SQL Injection Prevention', () => {
    test('should detect SQL injection in URL', async () => {
      req.url = "/api/test?id=1' UNION SELECT * FROM users--";

      await securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Security events detected:',
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({
              type: 'suspicious_pattern'
            })
          ])
        })
      );
    });

    test('should detect SQL keywords', async () => {
      const sqlPatterns = [
        '/api/test?query=SELECT * FROM users',
        '/api/test?query=DROP TABLE users',
        '/api/test?id=1; DELETE FROM users'
      ];

      for (const url of sqlPatterns) {
        req.url = url;
        await securityLogger(req, res, next);

        expect(consoleWarnSpy).toHaveBeenCalled();
        vi.clearAllMocks();
      }
    });

    test('should allow legitimate SQL-like content', async () => {
      req.url = '/api/test?description=How to use SELECT in SQL';

      await securityLogger(req, res, next);

      // Might still trigger, but should continue processing
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should detect directory traversal attempts', async () => {
      const traversalPatterns = [
        '/api/test/../../etc/passwd',
        '/api/test/..\\..\\windows\\system32',
        '/api/test/%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const url of traversalPatterns) {
        req.url = url;
        await securityLogger(req, res, next);

        expect(consoleWarnSpy).toHaveBeenCalled();
        vi.clearAllMocks();
      }
    });

    test('should continue processing after detection', async () => {
      req.url = '/api/test/../../etc/passwd';

      await securityLogger(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('CSRF Token Validation', () => {
    test('should require CSRF token for POST requests to admin', async () => {
      const middleware = createAdminSecurityMiddleware({ requireCSRF: true });
      const handler = vi.fn();

      req.method = 'POST';
      delete req.headers['x-csrf-token'];

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            type: 'CSRFError',
            message: 'CSRF token required'
          })
        })
      );
    });

    test('should accept valid CSRF token in header', async () => {
      const middleware = createAdminSecurityMiddleware({ requireCSRF: true });
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      req.method = 'POST';
      req.headers['x-csrf-token'] = 'valid-token-123';

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('X-CSRF-Token', 'valid-token-123');
    });

    test('should accept CSRF token in request body', async () => {
      const middleware = createAdminSecurityMiddleware({ requireCSRF: true });
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      req.method = 'POST';
      req.body = { _token: 'valid-token-456' };

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
    });

    test('should not require CSRF for GET requests', async () => {
      const middleware = createAdminSecurityMiddleware({ requireCSRF: true });
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      req.method = 'GET';
      delete req.headers['x-csrf-token'];

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Request Size Validation', () => {
    test('should reject oversized requests', async () => {
      req.headers['content-length'] = String(15 * 1024 * 1024); // 15MB

      await sanitizeRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            type: 'PayloadTooLarge'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('should accept requests within size limit', async () => {
      req.headers['content-length'] = String(5 * 1024 * 1024); // 5MB

      await sanitizeRequest(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should handle missing content-length header', async () => {
      delete req.headers['content-length'];

      await sanitizeRequest(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Content-Type Validation', () => {
    test('should reject invalid Content-Type for POST', async () => {
      req.method = 'POST';
      req.headers['content-type'] = 'text/plain';

      await sanitizeRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid Content-Type'
          })
        })
      );
    });

    test('should accept valid Content-Type for POST', async () => {
      req.method = 'POST';
      req.headers['content-type'] = 'application/json';

      await sanitizeRequest(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should accept form data Content-Type', async () => {
      req.method = 'POST';
      req.headers['content-type'] = 'application/x-www-form-urlencoded';

      await sanitizeRequest(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should accept multipart form data', async () => {
      req.method = 'POST';
      req.headers['content-type'] = 'multipart/form-data; boundary=----WebKitFormBoundary';

      await sanitizeRequest(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Dangerous Header Removal', () => {
    test('should remove x-cluster-client-ip header', async () => {
      req.headers['x-cluster-client-ip'] = '10.0.0.1';

      await sanitizeRequest(req, res, next);

      expect(req.headers['x-cluster-client-ip']).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    test('should remove x-real-ip header', async () => {
      req.headers['x-real-ip'] = '192.168.1.1';

      await sanitizeRequest(req, res, next);

      expect(req.headers['x-real-ip']).toBeUndefined();
    });

    test('should remove x-forwarded-host header', async () => {
      req.headers['x-forwarded-host'] = 'malicious.com';

      await sanitizeRequest(req, res, next);

      expect(req.headers['x-forwarded-host']).toBeUndefined();
    });

    test('should preserve safe headers', async () => {
      req.headers['x-forwarded-for'] = '192.168.1.100';
      req.headers['user-agent'] = 'Mozilla/5.0';

      await sanitizeRequest(req, res, next);

      expect(req.headers['x-forwarded-for']).toBe('192.168.1.100');
      expect(req.headers['user-agent']).toBe('Mozilla/5.0');
    });
  });

  describe('Environment-Specific Behavior', () => {
    test('should enforce HTTPS in production', async () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      req.headers['x-forwarded-proto'] = 'http';

      await enforceHTTPS(req, res, next);

      expect(res.writeHead).toHaveBeenCalledWith(
        301,
        expect.objectContaining({
          Location: expect.stringContaining('https://')
        })
      );

      process.env.VERCEL_ENV = originalEnv;
    });

    test('should skip HTTPS enforcement in development', async () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'development';

      req.headers['x-forwarded-proto'] = 'http';

      await enforceHTTPS(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.writeHead).not.toHaveBeenCalled();

      process.env.VERCEL_ENV = originalEnv;
    });
  });

  describe('Complete Security Flow', () => {
    test('should apply all security measures for API request', async () => {
      const middleware = createAPISecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff'
      );
      expect(res.setHeader).toHaveBeenCalledWith('X-API-Security', 'enabled');
      expect(handler).toHaveBeenCalled();
    });

    test('should apply all security measures for admin request', async () => {
      const middleware = createAdminSecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Admin-Endpoint', 'true');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        expect.stringContaining('no-store')
      );
      expect(handler).toHaveBeenCalled();
    });

    test('should handle OPTIONS preflight correctly', async () => {
      const middleware = createAPISecurityMiddleware();
      const handler = vi.fn();

      req.method = 'OPTIONS';

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Security Event Logging', () => {
    test('should log multiple security events', async () => {
      req.url = '/api/test/../../etc/passwd?param=<script>alert(1)</script>';

      await securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls[0][1];
      expect(logCall.events.length).toBeGreaterThan(1);
    });

    test('should include IP address in logs', async () => {
      req.url = '/api/test/../../etc/passwd';

      await securityLogger(req, res, next);

      const logCall = consoleWarnSpy.mock.calls[0][1];
      expect(logCall.events[0].ip).toBe('192.168.1.100');
    });

    test('should include timestamp in logs', async () => {
      req.url = '/api/test?param=<script>alert(1)</script>';

      await securityLogger(req, res, next);

      const logCall = consoleWarnSpy.mock.calls[0][1];
      expect(logCall.events[0].timestamp).toBeDefined();
    });
  });
});
