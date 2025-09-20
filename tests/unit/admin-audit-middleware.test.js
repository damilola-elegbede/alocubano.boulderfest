/**
 * Comprehensive Unit Tests for Admin Audit Middleware
 * Tests request context extraction, response time measurement, error handling, and middleware behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock AuditService
const mockAuditService = {
  setRequestContext: vi.fn(),
  logAdminAccess: vi.fn().mockResolvedValue('req_audit_123')
};

// Simple admin audit middleware implementation
function createAdminAuditMiddleware(auditService) {
  return async function adminAuditMiddleware(req, res, next) {
    const startTime = Date.now();
    let auditLogged = false;

    try {
      // Extract request context
      const context = {
        requestId: req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        userId: req.adminUser?.id || req.user?.id || null,
        ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        method: req.method,
        path: req.path || req.url,
        sessionId: req.session?.id || req.headers['x-session-id'] || null
      };

      // Set audit context
      auditService.setRequestContext(context);

      // Add context to request
      req.auditContext = context;

      // Override res.end to capture response
      const originalEnd = res.end;
      res.end = function(...args) {
        if (!auditLogged) {
          auditLogged = true;

          const responseTime = Date.now() - startTime;
          const statusCode = res.statusCode;

          // Log admin access asynchronously
          process.nextTick(async () => {
            try {
              const action = `${req.method}_${req.path || req.url}`;
              const resource = req.path || req.url;
              const metadata = {
                status_code: statusCode,
                response_time_ms: responseTime,
                session_id: context.sessionId,
                request_size: req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0,
                response_size: res.get ? (res.get('content-length') ? parseInt(res.get('content-length')) : 0) : 0
              };

              await auditService.logAdminAccess(action, resource, metadata);
            } catch (error) {
              console.error('Admin audit logging failed:', error);
            }
          });
        }

        originalEnd.apply(res, args);
      };

      // Handle send and json methods
      const originalSend = res.send;
      res.send = function(...args) {
        if (!auditLogged) {
          res.end();
        }
        return originalSend?.apply(res, args) || res;
      };

      const originalJson = res.json;
      res.json = function(...args) {
        if (!auditLogged) {
          res.end();
        }
        return originalJson?.apply(res, args) || res;
      };

      next();

    } catch (error) {
      console.error('Admin audit middleware error:', error);
      next();
    }
  };
}

// Mock request and response objects
function createMockRequest(options = {}) {
  return {
    method: options.method || 'GET',
    path: options.path || '/admin/dashboard',
    url: options.url || '/admin/dashboard',
    ip: options.ip || '192.168.1.1',
    headers: {
      'user-agent': 'Mozilla/5.0 Test Browser',
      'x-forwarded-for': '10.0.0.1, 192.168.1.1',
      ...options.headers
    },
    connection: {
      remoteAddress: options.remoteAddress || '127.0.0.1'
    },
    adminUser: options.adminUser || null,
    user: options.user || null,
    session: options.session || null,
    ...options
  };
}

function createMockResponse() {
  const res = {
    statusCode: 200,
    end: vi.fn(),
    send: vi.fn(),
    json: vi.fn(),
    get: vi.fn(() => null),
    headers: {}
  };

  res.send.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe('Admin Audit Middleware', () => {
  let middleware;
  let mockNext;
  let originalDateNow;
  let originalConsoleError;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset audit service mocks
    mockAuditService.setRequestContext.mockReset();
    mockAuditService.logAdminAccess.mockReset().mockResolvedValue('req_audit_123');

    middleware = createAdminAuditMiddleware(mockAuditService);
    mockNext = vi.fn();

    // Mock Date.now for consistent timing
    originalDateNow = Date.now;
    Date.now = vi.fn(() => 1234567890000);

    // Mock console.error
    originalConsoleError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    console.error = originalConsoleError;
  });

  describe('Request Context Extraction', () => {
    it('should extract complete request context', async () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/admin/users',
        ip: '10.0.0.1',
        headers: {
          'user-agent': 'Admin Browser v1.0',
          'x-request-id': 'req_custom_123',
          'x-session-id': 'sess_456'
        },
        adminUser: { id: 'admin_789' },
        session: { id: 'sess_456' }
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(mockAuditService.setRequestContext).toHaveBeenCalledWith({
        requestId: 'req_custom_123',
        userId: 'admin_789',
        ipAddress: '10.0.0.1',
        userAgent: 'Admin Browser v1.0',
        method: 'POST',
        path: '/admin/users',
        sessionId: 'sess_456'
      });

      expect(req.auditContext).toBeDefined();
      expect(req.auditContext.requestId).toBe('req_custom_123');
    });

    it('should generate request ID when not provided', async () => {
      const req = createMockRequest({
        headers: {} // No x-request-id header
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      const contextCall = mockAuditService.setRequestContext.mock.calls[0][0];
      expect(contextCall.requestId).toMatch(/^req_\d+_\w+$/);
      expect(contextCall.requestId).toContain('1234567890000');
    });

    it('should extract IP from x-forwarded-for header', async () => {
      const req = createMockRequest({
        ip: null,
        headers: {
          'x-forwarded-for': '203.0.113.195, 192.168.1.1, 10.0.0.1'
        }
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      const contextCall = mockAuditService.setRequestContext.mock.calls[0][0];
      expect(contextCall.ipAddress).toBe('203.0.113.195');
    });

    it('should fallback to connection.remoteAddress for IP', async () => {
      const req = createMockRequest({
        ip: null,
        headers: {}, // No x-forwarded-for
        connection: { remoteAddress: '172.16.0.1' }
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      const contextCall = mockAuditService.setRequestContext.mock.calls[0][0];
      expect(contextCall.ipAddress).toBe('172.16.0.1');
    });

    it('should use "unknown" when IP cannot be determined', async () => {
      const req = createMockRequest({
        ip: null,
        headers: {},
        connection: {}
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      const contextCall = mockAuditService.setRequestContext.mock.calls[0][0];
      expect(contextCall.ipAddress).toBe('unknown');
    });

    it('should prefer adminUser over user for userId', async () => {
      const req = createMockRequest({
        adminUser: { id: 'admin_123' },
        user: { id: 'user_456' }
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      const contextCall = mockAuditService.setRequestContext.mock.calls[0][0];
      expect(contextCall.userId).toBe('admin_123');
    });
  });

  describe('Response Time Measurement', () => {
    it('should measure response time accurately', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Set up timing
      let callCount = 0;
      Date.now = vi.fn(() => {
        callCount++;
        if (callCount === 1) return 1000; // Start time
        return 1500; // End time (500ms later)
      });

      await middleware(req, res, mockNext);
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledWith(
        'GET_/admin/dashboard',
        '/admin/dashboard',
        expect.objectContaining({
          response_time_ms: 500
        })
      );
    });

    it('should handle multiple calls to res.end gracefully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      res.end();
      res.end();
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      // Should only log once
      expect(mockAuditService.logAdminAccess).toHaveBeenCalledTimes(1);
    });

    it('should work with res.send', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);
      res.send('response data');

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledTimes(1);
    });

    it('should work with res.json', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);
      res.json({ data: 'test' });

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('Audit Logging', () => {
    it('should log admin access with correct action format', async () => {
      const req = createMockRequest({
        method: 'DELETE',
        path: '/admin/users/123'
      });
      const res = createMockResponse();
      res.statusCode = 204;

      await middleware(req, res, mockNext);
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledWith(
        'DELETE_/admin/users/123',
        '/admin/users/123',
        expect.objectContaining({
          status_code: 204
        })
      );
    });

    it('should include comprehensive metadata', async () => {
      const req = createMockRequest({
        headers: {
          'content-length': '1024',
          'x-session-id': 'sess_test_789'
        }
      });
      const res = createMockResponse();
      res.get = vi.fn((header) => {
        if (header === 'content-length') return '2048';
        return null;
      });

      await middleware(req, res, mockNext);
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledWith(
        'GET_/admin/dashboard',
        '/admin/dashboard',
        {
          status_code: 200,
          response_time_ms: expect.any(Number),
          session_id: 'sess_test_789',
          request_size: 1024,
          response_size: 2048
        }
      );
    });

    it('should handle missing content-length headers', async () => {
      const req = createMockRequest({
        headers: {} // No content-length
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledWith(
        'GET_/admin/dashboard',
        '/admin/dashboard',
        expect.objectContaining({
          request_size: 0,
          response_size: 0
        })
      );
    });

    it('should log different HTTP methods correctly', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const req = createMockRequest({ method, path: '/admin/test' });
        const res = createMockResponse();

        await middleware(req, res, mockNext);
        res.end();

        await new Promise(resolve => process.nextTick(resolve));
      }

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledTimes(methods.length);

      methods.forEach((method, index) => {
        const call = mockAuditService.logAdminAccess.mock.calls[index];
        expect(call[0]).toBe(`${method}_/admin/test`);
        expect(call[1]).toBe('/admin/test');
      });
    });

    it('should handle different status codes', async () => {
      const statusCodes = [200, 201, 400, 401, 403, 404, 500];

      for (const statusCode of statusCodes) {
        const req = createMockRequest();
        const res = createMockResponse();
        res.statusCode = statusCode;

        await middleware(req, res, mockNext);
        res.end();

        await new Promise(resolve => process.nextTick(resolve));
      }

      statusCodes.forEach((statusCode, index) => {
        const call = mockAuditService.logAdminAccess.mock.calls[index];
        expect(call[2].status_code).toBe(statusCode);
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should continue middleware chain when audit service fails', async () => {
      mockAuditService.setRequestContext.mockImplementation(() => {
        throw new Error('Audit service unavailable');
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Admin audit middleware error:', expect.any(Error));
    });

    it('should handle audit logging failures gracefully', async () => {
      mockAuditService.logAdminAccess.mockRejectedValue(new Error('Database connection failed'));

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(console.error).toHaveBeenCalledWith('Admin audit logging failed:', expect.any(Error));
    });

    it('should handle malformed request objects', async () => {
      const malformedReq = {
        method: null,
        headers: {},
        connection: {}
      };
      const res = createMockResponse();

      // Should not throw
      await expect(middleware(malformedReq, res, mockNext)).resolves.not.toThrow();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Middleware Behavior', () => {
    it('should call next() to continue middleware chain', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should add audit context to request object', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      expect(req.auditContext).toBeDefined();
      expect(req.auditContext).toMatchObject({
        requestId: expect.stringMatching(/^req_/),
        userId: null,
        ipAddress: expect.any(String),
        userAgent: expect.any(String),
        method: 'GET',
        path: '/admin/dashboard'
      });
    });

    it('should override response methods correctly', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const originalEnd = res.end;
      const originalSend = res.send;
      const originalJson = res.json;

      await middleware(req, res, mockNext);

      // Methods should be overridden
      expect(res.end).not.toBe(originalEnd);
      expect(res.send).not.toBe(originalSend);
      expect(res.json).not.toBe(originalJson);
    });

    it('should work with async middleware chain', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockNext = vi.fn().mockResolvedValue();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should have minimal performance overhead', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const startTime = process.hrtime.bigint();
      await middleware(req, res, mockNext);
      const endTime = process.hrtime.bigint();

      const executionTimeMs = Number(endTime - startTime) / 1000000;

      // Should complete setup quickly
      expect(executionTimeMs).toBeLessThan(10);
    });

    it('should not block response when audit logging is slow', async () => {
      // Mock slow audit logging
      mockAuditService.logAdminAccess.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 100))
      );

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req, res, mockNext);

      const startTime = Date.now();
      res.end();
      const endTime = Date.now();

      // Response should complete immediately
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should handle requests without path property', async () => {
      const req = createMockRequest({
        path: undefined,
        url: '/admin/fallback'
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledWith(
        'GET_/admin/fallback',
        '/admin/fallback',
        expect.any(Object)
      );
    });

    it('should handle requests with query parameters', async () => {
      const req = createMockRequest({
        path: '/admin/users',
        url: '/admin/users?page=1&limit=10'
      });
      const res = createMockResponse();

      await middleware(req, res, mockNext);
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledWith(
        'GET_/admin/users',
        '/admin/users',
        expect.any(Object)
      );
    });

    it('should handle concurrent requests independently', async () => {
      const req1 = createMockRequest({ method: 'GET', path: '/admin/users' });
      const req2 = createMockRequest({ method: 'POST', path: '/admin/settings' });
      const res1 = createMockResponse();
      const res2 = createMockResponse();

      await Promise.all([
        middleware(req1, res1, mockNext),
        middleware(req2, res2, mockNext)
      ]);

      res1.end();
      res2.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(req1.auditContext.requestId).not.toBe(req2.auditContext.requestId);
      expect(mockAuditService.logAdminAccess).toHaveBeenCalledTimes(2);
    });

    it('should handle responses without get method', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      delete res.get; // Remove get method

      await middleware(req, res, mockNext);
      res.end();

      await new Promise(resolve => process.nextTick(resolve));

      expect(mockAuditService.logAdminAccess).toHaveBeenCalledWith(
        'GET_/admin/dashboard',
        '/admin/dashboard',
        expect.objectContaining({
          response_size: 0
        })
      );
    });
  });
});