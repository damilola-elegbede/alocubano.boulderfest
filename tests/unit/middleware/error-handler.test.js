/**
 * Error Handler Middleware Unit Tests
 * Comprehensive test coverage for error handling, transformation, logging, and response formatting
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApplicationError,
  createErrorHandler,
  withErrorHandling,
  errorMiddleware
} from '../../../middleware/error-handler.js';

// Mock Sentry
vi.mock('../../../lib/monitoring/sentry-config.js', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn()
}));

describe('Error Handler Middleware', () => {
  let req, res, next;
  let consoleErrorSpy, consoleWarnSpy;

  beforeEach(() => {
    req = {
      method: 'GET',
      url: '/api/test',
      path: '/api/test',
      query: {},
      headers: {
        'user-agent': 'test-agent',
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.1.100'
      },
      ip: '192.168.1.100',
      connection: { remoteAddress: '192.168.1.100' }
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      headersSent: false
    };

    next = vi.fn();

    // Spy on console methods
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('ApplicationError Class', () => {
    test('should create error with default InternalServerError type', () => {
      const error = new ApplicationError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('InternalServerError');
      expect(error.type).toBe('InternalServerError');
      expect(error.statusCode).toBe(500);
      expect(error.timestamp).toBeDefined();
      expect(error.stack).toBeDefined();
    });

    test('should create error with custom type', () => {
      const error = new ApplicationError('Validation failed', 'ValidationError');

      expect(error.type).toBe('ValidationError');
      expect(error.statusCode).toBe(400);
    });

    test('should create error with custom status code', () => {
      const error = new ApplicationError('Custom error', 'CustomError', 418);

      expect(error.statusCode).toBe(418);
    });

    test('should include details object', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = new ApplicationError('Error', 'ValidationError', null, details);

      expect(error.details).toEqual(details);
    });

    test('should capture stack trace', () => {
      const error = new ApplicationError('Test error');

      // Stack trace contains error.name which is set to the type (default: InternalServerError)
      expect(error.stack).toContain('InternalServerError');
      expect(error.stack).toContain('Test error');
    });

    test('should use mapped status code for known error types', () => {
      const errorTypes = [
        ['ValidationError', 400],
        ['AuthenticationError', 401],
        ['AuthorizationError', 403],
        ['NotFoundError', 404],
        ['RateLimitError', 429],
        ['PaymentError', 402],
        ['DatabaseError', 503],
        ['ExternalServiceError', 502],
        ['InternalServerError', 500]
      ];

      errorTypes.forEach(([type, expectedStatus]) => {
        const error = new ApplicationError('Test', type);
        expect(error.statusCode).toBe(expectedStatus);
      });
    });
  });

  describe('Error Classification', () => {
    test('should classify ApplicationError by type', async () => {
      const errorHandler = createErrorHandler();
      const error = new ApplicationError('Test', 'ValidationError');

      await errorHandler(error, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should classify errors by message patterns', async () => {
      const testCases = [
        ['Invalid email format', 400, 'ValidationError'],
        ['Unauthorized access', 401, 'AuthenticationError'],
        ['Permission denied', 403, 'AuthorizationError'],
        ['Resource not found', 404, 'NotFoundError'],
        ['Rate limit exceeded', 429, 'RateLimitError'],
        ['Payment failed', 402, 'PaymentError'],
        ['Database connection error', 503, 'DatabaseError'],
        ['External API timeout', 502, 'ExternalServiceError']
      ];

      const errorHandler = createErrorHandler();

      for (const [message, expectedStatus, expectedType] of testCases) {
        const error = new Error(message);
        await errorHandler(error, req, res);

        expect(res.status).toHaveBeenCalledWith(expectedStatus);
        const jsonCall = res.json.mock.calls[res.json.mock.calls.length - 1][0];
        expect(jsonCall.error.type).toBe(expectedType);

        vi.clearAllMocks();
      }
    });

    test('should default to InternalServerError for unknown errors', async () => {
      const errorHandler = createErrorHandler();
      const error = new Error('Unknown error');

      await errorHandler(error, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.type).toBe('InternalServerError');
    });

    test('should handle errors without messages', async () => {
      const errorHandler = createErrorHandler();
      const error = new Error();

      await errorHandler(error, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.message).toBe('An unexpected error occurred');
    });
  });

  describe('Request Context Extraction', () => {
    test('should extract full request context', async () => {
      const errorHandler = createErrorHandler({ logErrors: true });
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logCall = consoleErrorSpy.mock.calls[0][1];
      expect(logCall.context).toMatchObject({
        method: 'GET',
        url: '/api/test',
        path: '/api/test',
        ip: '192.168.1.100'
      });
    });

    test('should handle missing headers gracefully', async () => {
      req.headers = {};
      const errorHandler = createErrorHandler();
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(res.status).toHaveBeenCalled();
    });

    test('should extract query parameters', async () => {
      req.query = { filter: 'active', page: '2' };
      const errorHandler = createErrorHandler({ logErrors: true });
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      const logCall = consoleErrorSpy.mock.calls[0][1];
      expect(logCall.context.query).toEqual({ filter: 'active', page: '2' });
    });

    test('should generate request ID if not provided', async () => {
      const errorHandler = createErrorHandler();
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.stringMatching(/^req_/));
    });

    test('should use existing x-request-id header', async () => {
      req.headers['x-request-id'] = 'custom-request-id';
      const errorHandler = createErrorHandler();
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'custom-request-id');
    });

    test('should use x-vercel-id if available', async () => {
      req.headers['x-vercel-id'] = 'vercel-trace-id';
      const errorHandler = createErrorHandler();
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'vercel-trace-id');
    });
  });

  describe('Error Response Formatting', () => {
    test('should format error response with type and message', async () => {
      const errorHandler = createErrorHandler();
      const error = new ApplicationError('Validation failed', 'ValidationError');

      await errorHandler(error, req, res);

      expect(res.json).toHaveBeenCalledWith({
        error: {
          type: 'ValidationError',
          message: 'Validation failed',
          timestamp: expect.any(String),
          requestId: expect.any(String),
          details: {}
        }
      });
    });

    test('should include request ID in response', async () => {
      req.headers['x-request-id'] = 'test-request-123';
      const errorHandler = createErrorHandler();
      const error = new ApplicationError('Test error');

      await errorHandler(error, req, res);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.requestId).toBe('test-request-123');
    });

    test('should include details for client errors', async () => {
      const errorHandler = createErrorHandler();
      const error = new ApplicationError(
        'Validation failed',
        'ValidationError',
        null,
        { field: 'email', reason: 'invalid' }
      );

      await errorHandler(error, req, res);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.details).toEqual({ field: 'email', reason: 'invalid' });
    });

    test('should include validation errors if present', async () => {
      const errorHandler = createErrorHandler();
      const error = new ApplicationError('Validation failed', 'ValidationError');
      error.validationErrors = [
        { field: 'email', message: 'Invalid format' },
        { field: 'password', message: 'Too short' }
      ];

      await errorHandler(error, req, res);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.validationErrors).toEqual(error.validationErrors);
    });

    test('should exclude details for server errors in production', async () => {
      const originalEnv = process.env.VERCEL_ENV;
      process.env.VERCEL_ENV = 'production';

      const errorHandler = createErrorHandler();
      const error = new ApplicationError(
        'Database error',
        'DatabaseError',
        null,
        { query: 'SELECT * FROM sensitive' }
      );

      await errorHandler(error, req, res);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.details).toBeUndefined();

      process.env.VERCEL_ENV = originalEnv;
    });

    test('should include stack trace in development', async () => {
      const errorHandler = createErrorHandler({ isDevelopment: true });
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.stack).toBeDefined();
      expect(Array.isArray(jsonCall.error.stack)).toBe(true);
    });

    test('should exclude stack trace in production', async () => {
      const errorHandler = createErrorHandler({ isDevelopment: false });
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.stack).toBeUndefined();
    });

    test('should set Content-Type header', async () => {
      const errorHandler = createErrorHandler();
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });
  });

  describe('Error Logging', () => {
    test('should log errors when enabled', async () => {
      const errorHandler = createErrorHandler({ logErrors: true });
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(consoleErrorSpy).toHaveBeenCalled();
      // Generic errors are logged as FATAL severity
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[FATAL]');
    });

    test('should not log errors when disabled', async () => {
      const errorHandler = createErrorHandler({ logErrors: false });
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('should log with appropriate severity levels', async () => {
      const errorTypes = [
        ['ValidationError', 'WARNING'],
        ['DatabaseError', 'FATAL'],
        ['PaymentError', 'ERROR']
      ];

      for (const [type, expectedLevel] of errorTypes) {
        const errorHandler = createErrorHandler({ logErrors: true });
        const error = new ApplicationError('Test', type);

        await errorHandler(error, req, res);

        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(consoleErrorSpy.mock.calls[0][0]).toContain(`[${expectedLevel}]`);

        vi.clearAllMocks();
      }
    });

    test('should include stack trace in logs', async () => {
      const errorHandler = createErrorHandler({ logErrors: true });
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      const logCall = consoleErrorSpy.mock.calls[0][1];
      expect(logCall.stack).toBeDefined();
    });
  });

  describe('Sentry Integration', () => {
    test('should capture server errors to Sentry', async () => {
      const { captureException } = await import('../../../lib/monitoring/sentry-config.js');
      const errorHandler = createErrorHandler({ captureErrors: true });
      const error = new ApplicationError('Server error', 'InternalServerError');

      await errorHandler(error, req, res);

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          errorType: 'InternalServerError',
          severity: 'fatal'
        })
      );
    });

    test('should not capture client errors to Sentry', async () => {
      const { captureException } = await import('../../../lib/monitoring/sentry-config.js');
      const errorHandler = createErrorHandler({ captureErrors: true });
      const error = new ApplicationError('Validation error', 'ValidationError');

      await errorHandler(error, req, res);

      expect(captureException).not.toHaveBeenCalled();
    });

    test('should add breadcrumbs for all errors', async () => {
      const { addBreadcrumb } = await import('../../../lib/monitoring/sentry-config.js');
      const errorHandler = createErrorHandler({ captureErrors: true });
      const error = new Error('Test error');

      await errorHandler(error, req, res);

      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'error',
          message: expect.stringContaining('Test error')
        })
      );
    });

    test('should respect captureErrors option', async () => {
      const { captureException } = await import('../../../lib/monitoring/sentry-config.js');
      const errorHandler = createErrorHandler({ captureErrors: false });
      const error = new ApplicationError('Server error', 'InternalServerError');

      await errorHandler(error, req, res);

      expect(captureException).not.toHaveBeenCalled();
    });
  });

  describe('withErrorHandling Wrapper', () => {
    test('should execute handler successfully', async () => {
      const handler = vi.fn(async (req, res) => {
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withErrorHandling(handler);
      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalledWith(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should catch and handle errors from handler', async () => {
      const handler = vi.fn(async () => {
        throw new Error('Handler error');
      });

      const wrappedHandler = withErrorHandling(handler);
      await wrappedHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            type: 'InternalServerError'
          })
        })
      );
    });

    test('should track request timing', async () => {
      const handler = vi.fn(async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withErrorHandling(handler);
      await wrappedHandler(req, res);

      expect(req.startTime).toBeDefined();
    });

    test('should warn on slow requests', async () => {
      const handler = vi.fn(async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 1100));
        res.status(200).json({ success: true });
      });

      const wrappedHandler = withErrorHandling(handler);
      await wrappedHandler(req, res);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Slow request')
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle errors without stack traces', async () => {
      const errorHandler = createErrorHandler();
      const error = { message: 'Error without stack' };

      await errorHandler(error, req, res);

      expect(res.status).toHaveBeenCalled();
    });

    test('should handle circular reference errors', async () => {
      const errorHandler = createErrorHandler({ isDevelopment: true });
      const error = new Error('Circular error');
      error.circular = error; // Create circular reference

      await errorHandler(error, req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('should handle very large error objects', async () => {
      const errorHandler = createErrorHandler();
      const error = new ApplicationError(
        'Large error',
        'ValidationError',
        null,
        { data: 'x'.repeat(10000) }
      );

      await errorHandler(error, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should handle errors during error handling', async () => {
      const errorHandler = createErrorHandler();
      const error = new Error('Original error');

      // Simulate error in setHeader (which happens before res.status)
      res.setHeader = vi.fn(() => {
        throw new Error('Header error');
      });

      // The error handler should catch and try to send fallback response
      try {
        await errorHandler(error, req, res);
      } catch (e) {
        // The fallback also tries to call res.status which should work
      }

      // Should log fallback error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error handler failed:',
        expect.any(Error)
      );
    });

    test('should handle missing request properties', async () => {
      const minimalReq = { method: 'GET' };
      const errorHandler = createErrorHandler();
      const error = new Error('Test error');

      await errorHandler(error, minimalReq, res);

      expect(res.status).toHaveBeenCalled();
    });

    test('should handle null error message', async () => {
      const errorHandler = createErrorHandler();
      const error = new Error();
      error.message = null;

      await errorHandler(error, req, res);

      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.error.message).toBe('An unexpected error occurred');
    });
  });

  // Note: ERROR_SEVERITY and ERROR_STATUS_CODES are internal constants
  // and not exported, so they cannot be tested directly.
  // Their behavior is tested indirectly through ApplicationError status codes
  // and error logging severity levels in other tests.

  describe('errorMiddleware Export', () => {
    test('should be equivalent to withErrorHandling', () => {
      expect(typeof errorMiddleware).toBe('function');

      const handler = vi.fn();
      const wrapped = errorMiddleware(handler);

      expect(typeof wrapped).toBe('function');
    });
  });
});
