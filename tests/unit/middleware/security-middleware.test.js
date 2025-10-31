/**
 * Security Middleware Unit Tests
 * Tests for security headers, request validation, HTTPS enforcement, and CORS handling
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enforceHTTPS,
  sanitizeRequest,
  securityLogger,
  createAPISecurityMiddleware,
  createAdminSecurityMiddleware,
  createAuthSecurityMiddleware,
  createSecurityMiddleware,
  securityUtils
} from '../../../middleware/security.js';

// Mock dependencies
vi.mock('../../../lib/security-headers.js', () => ({
  withSecurityHeaders: (handler) => handler,
  addAPISecurityHeaders: vi.fn(),
  addCSRFHeaders: vi.fn()
}));

vi.mock('../../../middleware/error-handler.js', () => ({
  withErrorHandling: (handler) => handler,
  ApplicationError: class ApplicationError extends Error {
    constructor(message, type, statusCode) {
      super(message);
      this.type = type;
      this.statusCode = statusCode;
    }
  }
}));

vi.mock('../../../middleware/rate-limit.js', () => ({
  createRateLimitMiddleware: () => async (req, res, next) => next()
}));

describe('Security Middleware', () => {
  let req, res, next;
  let consoleWarnSpy;

  beforeEach(() => {
    req = {
      method: 'GET',
      url: '/api/test',
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

    next = vi.fn();

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy.mockRestore();
  });

  describe('HTTPS Enforcement', () => {
    test('should allow HTTPS requests in production', () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      req.headers['x-forwarded-proto'] = 'https';

      enforceHTTPS(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.writeHead).not.toHaveBeenCalled();

      process.env.VERCEL_ENV = originalEnv;
    });

    test('should redirect HTTP to HTTPS in production', async () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      // Reload the module with the new environment variable
      vi.resetModules();
      const { enforceHTTPS: enforceHTTPSProd } = await import('../../../middleware/security.js');

      req.headers['x-forwarded-proto'] = 'http';
      req.url = '/api/test?param=value';

      enforceHTTPSProd(req, res, next);

      expect(res.writeHead).toHaveBeenCalledWith(
        301,
        expect.objectContaining({
          Location: 'https://example.com/api/test?param=value'
        })
      );
      expect(res.end).toHaveBeenCalled();

      process.env.VERCEL_ENV = originalEnv;
      vi.resetModules();
    });

    test('should skip enforcement in development', () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'development';

      req.headers['x-forwarded-proto'] = 'http';

      enforceHTTPS(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.writeHead).not.toHaveBeenCalled();

      process.env.VERCEL_ENV = originalEnv;
    });

    test('should handle multi-valued x-forwarded-proto header', () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      req.headers['x-forwarded-proto'] = 'https, http';

      enforceHTTPS(req, res, next);

      expect(next).toHaveBeenCalled();

      process.env.VERCEL_ENV = originalEnv;
    });

    test('should detect HTTPS from req.secure', () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      req.secure = true;
      delete req.headers['x-forwarded-proto'];

      enforceHTTPS(req, res, next);

      expect(next).toHaveBeenCalled();

      process.env.VERCEL_ENV = originalEnv;
    });

    test('should detect HTTPS from encrypted connection', () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      req.connection.encrypted = true;
      delete req.headers['x-forwarded-proto'];

      enforceHTTPS(req, res, next);

      expect(next).toHaveBeenCalled();

      process.env.VERCEL_ENV = originalEnv;
    });

    test('should reject request with missing Host header', async () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      vi.resetModules();
      const { enforceHTTPS: enforceHTTPSProd } = await import('../../../middleware/security.js');

      delete req.headers.host;
      req.headers['x-forwarded-proto'] = 'http';

      enforceHTTPSProd(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Missing Host header'
          })
        })
      );

      process.env.VERCEL_ENV = originalEnv;
      vi.resetModules();
    });

    test('should sanitize Host header to prevent CRLF injection', async () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      vi.resetModules();
      const { enforceHTTPS: enforceHTTPSProd } = await import('../../../middleware/security.js');

      // Host with CRLF - after sanitization it becomes invalid and is rejected
      req.headers.host = 'example.com\r\nX-Injected: malicious';
      req.headers['x-forwarded-proto'] = 'http';

      enforceHTTPSProd(req, res, next);

      // The sanitized host 'example.comX-Injected: malicious' fails validation
      // so it returns 400 instead of redirecting
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid Host header'
          })
        })
      );

      process.env.VERCEL_ENV = originalEnv;
      vi.resetModules();
    });

    test('should reject invalid hostname format', async () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      vi.resetModules();
      const { enforceHTTPS: enforceHTTPSProd } = await import('../../../middleware/security.js');

      req.headers.host = 'invalid<script>hostname';
      req.headers['x-forwarded-proto'] = 'http';

      enforceHTTPSProd(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid Host header'
          })
        })
      );

      process.env.VERCEL_ENV = originalEnv;
      vi.resetModules();
    });

    test('should include HSTS header in redirect', async () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      vi.resetModules();
      const { enforceHTTPS: enforceHTTPSProd } = await import('../../../middleware/security.js');

      req.headers['x-forwarded-proto'] = 'http';

      enforceHTTPSProd(req, res, next);

      expect(res.writeHead).toHaveBeenCalledWith(
        301,
        expect.objectContaining({
          'Strict-Transport-Security': expect.stringContaining('max-age=')
        })
      );

      process.env.VERCEL_ENV = originalEnv;
      vi.resetModules();
    });
  });

  describe('Request Sanitization', () => {
    test('should remove dangerous headers', () => {
      req.headers['x-cluster-client-ip'] = '10.0.0.1';
      req.headers['x-real-ip'] = '192.168.1.1';
      req.headers['x-forwarded-host'] = 'malicious.com';

      sanitizeRequest(req, res, next);

      expect(req.headers['x-cluster-client-ip']).toBeUndefined();
      expect(req.headers['x-real-ip']).toBeUndefined();
      expect(req.headers['x-forwarded-host']).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    test('should reject requests exceeding size limit', () => {
      req.headers['content-length'] = String(11 * 1024 * 1024); // 11MB

      sanitizeRequest(req, res, next);

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

    test('should allow requests within size limit', () => {
      req.headers['content-length'] = String(5 * 1024 * 1024); // 5MB

      sanitizeRequest(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should validate Content-Type for POST requests', () => {
      req.method = 'POST';
      req.headers['content-type'] = 'text/plain';

      sanitizeRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid Content-Type'
          })
        })
      );
    });

    test('should allow valid Content-Type for POST requests', () => {
      const validTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data'
      ];

      validTypes.forEach(contentType => {
        req.method = 'POST';
        req.headers['content-type'] = contentType;

        sanitizeRequest(req, res, next);

        expect(next).toHaveBeenCalled();

        vi.clearAllMocks();
      });
    });

    test('should validate Content-Type for PUT requests', () => {
      req.method = 'PUT';
      req.headers['content-type'] = 'application/octet-stream';

      sanitizeRequest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should skip Content-Type validation for GET requests', () => {
      req.method = 'GET';
      delete req.headers['content-type'];

      sanitizeRequest(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Security Logging', () => {
    test('should detect directory traversal attempts', () => {
      req.url = '/api/test/../../etc/passwd';

      securityLogger(req, res, next);

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
      expect(next).toHaveBeenCalled();
    });

    test('should detect XSS attempts in URL', () => {
      req.url = '/api/test?param=<script>alert(1)</script>';

      securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should detect SQL injection attempts', () => {
      req.url = "/api/test?id=1' UNION SELECT * FROM users--";

      securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should detect JavaScript protocol in URL', () => {
      req.url = '/api/test?redirect=javascript:alert(1)';

      securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should detect data URI XSS attempts', () => {
      req.url = '/api/test?content=data:text/html,<script>alert(1)</script>';

      securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should detect suspicious patterns in user agent', () => {
      req.headers['user-agent'] = '<script>alert(1)</script>';

      securityLogger(req, res, next);

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should not log for clean requests', () => {
      req.url = '/api/test?page=1&filter=active';
      req.headers['user-agent'] = 'Mozilla/5.0';

      securityLogger(req, res, next);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    test('should include IP address in security events', () => {
      req.url = '/api/../../../etc/passwd';

      securityLogger(req, res, next);

      const logCall = consoleWarnSpy.mock.calls[0][1];
      expect(logCall.events[0].ip).toBe('192.168.1.100');
    });
  });

  describe('API Security Middleware', () => {
    test('should create API security middleware', async () => {
      const middleware = createAPISecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
    });

    test('should handle OPTIONS preflight requests', async () => {
      const middleware = createAPISecurityMiddleware();
      const handler = vi.fn();

      req.method = 'OPTIONS';

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    test('should apply rate limiting', async () => {
      // The rate limiter is mocked globally to always call next()
      // This test verifies that the middleware applies rate limiting (mocked to pass)
      const middleware = createAPISecurityMiddleware();
      const handler = vi.fn();

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      // With the mocked rate limiter that always passes, handler should be called
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Admin Security Middleware', () => {
    test('should create admin security middleware with stricter limits', async () => {
      const middleware = createAdminSecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
    });

    test('should require CSRF token for POST requests', async () => {
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
            type: 'CSRFError'
          })
        })
      );
    });

    test('should accept CSRF token in header', async () => {
      const middleware = createAdminSecurityMiddleware({ requireCSRF: true });
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      req.method = 'POST';
      req.headers['x-csrf-token'] = 'valid-token';

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
    });

    test('should accept CSRF token in request body', async () => {
      const middleware = createAdminSecurityMiddleware({ requireCSRF: true });
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      req.method = 'POST';
      req.body = { _token: 'valid-token' };

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
    });

    test('should set admin-specific headers', async () => {
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

    test('should require CSRF for PUT and DELETE methods', async () => {
      const methods = ['PUT', 'DELETE'];

      for (const method of methods) {
        const middleware = createAdminSecurityMiddleware({ requireCSRF: true });
        const handler = vi.fn();

        req.method = method;
        delete req.headers['x-csrf-token'];

        const wrappedHandler = middleware(handler);
        await wrappedHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(403);

        vi.clearAllMocks();
      }
    });
  });

  describe('Auth Security Middleware', () => {
    test('should create auth security middleware with strictest limits', async () => {
      const middleware = createAuthSecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
    });

    test('should set auth-specific headers', async () => {
      const middleware = createAuthSecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Auth-Endpoint', 'true');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        expect.stringContaining('no-store')
      );
      expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
    });

    test('should set Clear-Site-Data header', async () => {
      const middleware = createAuthSecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Clear-Site-Data',
        '"cookies", "storage"'
      );
    });
  });

  describe('Security Middleware Factory', () => {
    test('should create API middleware by default', async () => {
      const middleware = createSecurityMiddleware();
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalled();
    });

    test('should create admin middleware when type is admin', async () => {
      const middleware = createSecurityMiddleware('admin');
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Admin-Endpoint', 'true');
    });

    test('should create auth middleware when type is auth', async () => {
      const middleware = createSecurityMiddleware('auth');
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = middleware(handler);
      await wrappedHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Auth-Endpoint', 'true');
    });
  });

  describe('Security Utils', () => {
    test('should export SECURITY_CONFIG', () => {
      expect(securityUtils.SECURITY_CONFIG).toBeDefined();
      expect(securityUtils.SECURITY_CONFIG.rateLimit).toBeDefined();
      expect(securityUtils.SECURITY_CONFIG.httpsEnforcement).toBeDefined();
      expect(securityUtils.SECURITY_CONFIG.csrf).toBeDefined();
    });

    test('should export security functions', () => {
      expect(typeof securityUtils.enforceHTTPS).toBe('function');
      expect(typeof securityUtils.sanitizeRequest).toBe('function');
      expect(typeof securityUtils.securityLogger).toBe('function');
    });
  });
});
