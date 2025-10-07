/**
 * Comprehensive Unit Tests for CSRF Service
 * Tests token generation, verification, middleware validation, and security features
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CSRFService } from '../../lib/csrf-service.js';
import jwt from 'jsonwebtoken';

describe('CSRF Service - Backend', () => {
  let csrfService;
  const TEST_SECRET = 'test-secret-with-minimum-32-characters-for-secure-jwt';

  beforeEach(() => {
    // Reset environment
    vi.resetAllMocks();
    process.env.ADMIN_SECRET = TEST_SECRET;
    process.env.NODE_ENV = 'test';

    // Create fresh service instance
    csrfService = new CSRFService();
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.ADMIN_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.SKIP_CSRF;
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with ADMIN_SECRET from environment', () => {
      process.env.ADMIN_SECRET = TEST_SECRET;
      const service = new CSRFService();
      expect(service.secret).toBe(TEST_SECRET);
    });

    it('should fallback to JWT_SECRET if ADMIN_SECRET not set', () => {
      delete process.env.ADMIN_SECRET;
      process.env.JWT_SECRET = TEST_SECRET;
      const service = new CSRFService();
      expect(service.secret).toBe(TEST_SECRET);
    });

    it('should throw error in production without secret', () => {
      delete process.env.ADMIN_SECRET;
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'production';

      expect(() => new CSRFService()).toThrow(/CSRF secret must be/);
    });

    it('should throw error in production with short secret', () => {
      process.env.ADMIN_SECRET = 'short';
      process.env.NODE_ENV = 'production';

      expect(() => new CSRFService()).toThrow('CSRF secret must be at least 32 characters long');
    });

    it('should generate random secret in development when not configured', () => {
      delete process.env.ADMIN_SECRET;
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';

      const service = new CSRFService();
      expect(service.secret).toBeDefined();
      expect(service.secret.length).toBeGreaterThan(32);
    });

    it('should generate unique secrets for different instances in development', () => {
      delete process.env.ADMIN_SECRET;
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';

      const service1 = new CSRFService();
      const service2 = new CSRFService();

      expect(service1.secret).not.toBe(service2.secret);
    });
  });

  describe('Token Generation', () => {
    it('should generate valid JWT-format CSRF tokens', () => {
      const sessionId = 'test-session-123';
      const token = csrfService.generateToken(sessionId);

      // JWT format: header.payload.signature
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('should include session ID in token payload', () => {
      const sessionId = 'test-session-456';
      const token = csrfService.generateToken(sessionId);

      const decoded = jwt.decode(token);
      expect(decoded.sessionId).toBe(sessionId);
    });

    it('should include nonce in token payload', () => {
      const sessionId = 'test-session-789';
      const token = csrfService.generateToken(sessionId);

      const decoded = jwt.decode(token);
      expect(decoded.nonce).toBeDefined();
      expect(typeof decoded.nonce).toBe('string');
      expect(decoded.nonce.length).toBeGreaterThan(0);
    });

    it('should include timestamp in token payload', () => {
      const sessionId = 'test-session-timestamp';
      const token = csrfService.generateToken(sessionId);

      const decoded = jwt.decode(token);
      expect(decoded.timestamp).toBeDefined();
      expect(typeof decoded.timestamp).toBe('number');
      expect(decoded.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should set 1-hour expiration', () => {
      const sessionId = 'test-session-exp';
      const token = csrfService.generateToken(sessionId);

      const decoded = jwt.decode(token);
      const now = Math.floor(Date.now() / 1000);
      const expectedExpiry = now + 3600; // 1 hour

      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiry - 5); // Allow 5 sec variance
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 5);
    });

    it('should sign tokens with ADMIN_SECRET', () => {
      const sessionId = 'test-session-sig';
      const token = csrfService.generateToken(sessionId);

      // Verify signature is valid
      expect(() => jwt.verify(token, TEST_SECRET)).not.toThrow();
    });

    it('should set issuer to alocubano-csrf', () => {
      const sessionId = 'test-session-issuer';
      const token = csrfService.generateToken(sessionId);

      const decoded = jwt.decode(token);
      expect(decoded.iss).toBe('alocubano-csrf');
    });

    it('should generate unique tokens for same session ID', () => {
      const sessionId = 'same-session';
      const token1 = csrfService.generateToken(sessionId);
      const token2 = csrfService.generateToken(sessionId);

      expect(token1).not.toBe(token2);
    });

    it('should generate different nonces for each token', () => {
      const sessionId = 'same-session';
      const token1 = csrfService.generateToken(sessionId);
      const token2 = csrfService.generateToken(sessionId);

      const decoded1 = jwt.decode(token1);
      const decoded2 = jwt.decode(token2);

      expect(decoded1.nonce).not.toBe(decoded2.nonce);
    });
  });

  describe('Token Verification', () => {
    it('should verify valid CSRF token', () => {
      const sessionId = 'valid-session';
      const token = csrfService.generateToken(sessionId);

      const result = csrfService.verifyToken(token, sessionId);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.decoded).toBeDefined();
    });

    it('should return decoded payload for valid token', () => {
      const sessionId = 'payload-session';
      const token = csrfService.generateToken(sessionId);

      const result = csrfService.verifyToken(token, sessionId);

      expect(result.decoded.sessionId).toBe(sessionId);
      expect(result.decoded.nonce).toBeDefined();
      expect(result.decoded.timestamp).toBeDefined();
    });

    it('should reject expired tokens', () => {
      const sessionId = 'expired-session';

      // Create token with expired timestamp (2 hours ago)
      const expiredTimestamp = Date.now() - (2 * 3600000);
      const expiredToken = jwt.sign(
        {
          sessionId,
          nonce: 'test-nonce',
          timestamp: expiredTimestamp
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'alocubano-csrf'
        }
      );

      const result = csrfService.verifyToken(expiredToken, sessionId);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('should reject tokens with invalid signature', () => {
      const sessionId = 'invalid-sig-session';
      const token = csrfService.generateToken(sessionId);

      // Modify token to invalidate signature
      const parts = token.split('.');
      parts[2] = parts[2].replace(/.$/, 'X');
      const invalidToken = parts.join('.');

      const result = csrfService.verifyToken(invalidToken, sessionId);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid signature/i);
    });

    it('should reject tokens with mismatched session ID', () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      const token = csrfService.generateToken(sessionId1);

      const result = csrfService.verifyToken(token, sessionId2);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session mismatch');
    });

    it('should reject tokens without session ID', () => {
      // Create token without sessionId
      const token = jwt.sign(
        {
          nonce: 'test-nonce',
          timestamp: Date.now()
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'alocubano-csrf'
        }
      );

      const result = csrfService.verifyToken(token, 'any-session');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session mismatch');
    });

    it('should reject malformed JWT tokens', () => {
      const result = csrfService.verifyToken('not-a-jwt-token', 'session');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject empty token', () => {
      const result = csrfService.verifyToken('', 'session');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject null token', () => {
      const result = csrfService.verifyToken(null, 'session');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject tokens with wrong issuer', () => {
      const token = jwt.sign(
        {
          sessionId: 'test-session',
          nonce: 'test-nonce',
          timestamp: Date.now()
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'wrong-issuer'
        }
      );

      const result = csrfService.verifyToken(token, 'test-session');

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/jwt issuer invalid/i);
    });

    it('should reject tokens signed with different secret', () => {
      const differentSecret = 'different-secret-minimum-32-chars-required';
      const sessionId = 'test-session';

      const token = jwt.sign(
        {
          sessionId,
          nonce: 'test-nonce',
          timestamp: Date.now()
        },
        differentSecret,
        {
          expiresIn: '1h',
          issuer: 'alocubano-csrf'
        }
      );

      const result = csrfService.verifyToken(token, sessionId);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid signature/i);
    });

    it('should validate timestamp is within 1 hour', () => {
      const sessionId = 'timestamp-session';

      // Token created 59 minutes ago (should be valid)
      const recentTimestamp = Date.now() - (59 * 60 * 1000);
      const recentToken = jwt.sign(
        {
          sessionId,
          nonce: 'test-nonce',
          timestamp: recentTimestamp
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'alocubano-csrf'
        }
      );

      const result = csrfService.verifyToken(recentToken, sessionId);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCSRF Middleware', () => {
    let mockReq;
    let mockRes;
    let mockHandler;

    beforeEach(() => {
      mockReq = {
        method: 'POST',
        url: '/api/test',
        headers: {},
        body: {},
        connection: {}
      };

      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn().mockReturnThis()
      };

      mockHandler = vi.fn((req, res) => {
        res.status(200).json({ success: true });
      });
    });

    it('should skip CSRF check for GET requests', async () => {
      mockReq.method = 'GET';

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should skip CSRF check for HEAD requests', async () => {
      mockReq.method = 'HEAD';

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should skip CSRF check for OPTIONS requests', async () => {
      mockReq.method = 'OPTIONS';

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should require CSRF token for POST requests', async () => {
      mockReq.method = 'POST';

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF token required' });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should require CSRF token for PUT requests', async () => {
      mockReq.method = 'PUT';

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF token required' });
    });

    it('should require CSRF token for DELETE requests', async () => {
      mockReq.method = 'DELETE';

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF token required' });
    });

    it('should skip CSRF in development when SKIP_CSRF=true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SKIP_CSRF = 'true';
      mockReq.method = 'POST';

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should accept valid CSRF token from X-CSRF-Token header', async () => {
      const sessionId = 'test-admin-123';
      const token = csrfService.generateToken(sessionId);

      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = token;
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should accept valid CSRF token from X-XSRF-Token header', async () => {
      const sessionId = 'test-admin-456';
      const token = csrfService.generateToken(sessionId);

      mockReq.method = 'POST';
      mockReq.headers['x-xsrf-token'] = token;
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should accept valid CSRF token from request body', async () => {
      const sessionId = 'test-admin-789';
      const token = csrfService.generateToken(sessionId);

      mockReq.method = 'POST';
      mockReq.body = { csrfToken: token };
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should reject invalid CSRF token', async () => {
      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = 'invalid-token';
      mockReq.admin = { id: 'test-session' };

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid CSRF token' });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should reject expired CSRF token', async () => {
      const sessionId = 'expired-admin';
      const expiredTimestamp = Date.now() - (2 * 3600000);

      const expiredToken = jwt.sign(
        {
          sessionId,
          nonce: 'test-nonce',
          timestamp: expiredTimestamp
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'alocubano-csrf'
        }
      );

      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = expiredToken;
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid CSRF token' });
    });

    it('should set csrfValid flag on request after validation', async () => {
      const sessionId = 'flag-test-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = token;
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockReq.csrfValid).toBe(true);
      expect(mockReq.csrfDecoded).toBeDefined();
    });

    it('should use admin.id as session identifier', async () => {
      const adminId = 'admin-12345';
      const token = csrfService.generateToken(adminId);

      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = token;
      mockReq.admin = { id: adminId };

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should fallback to X-Session-ID header if no admin', async () => {
      const sessionId = 'header-session-123';
      const token = csrfService.generateToken(sessionId);

      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = token;
      mockReq.headers['x-session-id'] = sessionId;

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should fallback to IP address if no admin or session header', async () => {
      const ip = '192.168.1.100';
      const token = csrfService.generateToken(ip);

      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = token;
      mockReq.ip = ip;

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should use anonymous as last resort session identifier', async () => {
      const token = csrfService.generateToken('anonymous');

      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = token;

      const middleware = csrfService.validateCSRF(mockHandler);
      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle handler errors gracefully', async () => {
      const sessionId = 'error-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.method = 'POST';
      mockReq.headers['x-csrf-token'] = token;
      mockReq.admin = { id: sessionId };

      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });

      const middleware = csrfService.validateCSRF(errorHandler);
      await middleware(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'CSRF validation service error' });
    });
  });

  describe('Origin Validation', () => {
    let mockReq;
    let mockRes;
    let mockHandler;

    beforeEach(() => {
      mockReq = {
        method: 'POST',
        url: '/api/test',
        headers: {},
        body: {},
        connection: {},
        secure: false
      };

      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        setHeader: vi.fn().mockReturnThis()
      };

      mockHandler = vi.fn((req, res) => {
        res.status(200).json({ success: true });
      });
    });

    it('should validate origin header when allowedOrigins provided', async () => {
      const sessionId = 'origin-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.headers.origin = 'https://example.com';
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler, {
        allowedOrigins: ['https://example.com']
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should reject unauthorized origin', async () => {
      const sessionId = 'origin-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.headers.origin = 'https://evil.com';
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler, {
        allowedOrigins: ['https://example.com']
      });

      await middleware(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized origin' });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should allow localhost in development', async () => {
      process.env.NODE_ENV = 'development';
      const sessionId = 'localhost-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.headers.origin = 'http://localhost:3000';
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler, {
        allowedOrigins: ['http://localhost:3000']
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should skip origin validation when skipOriginValidation=true', async () => {
      const sessionId = 'skip-origin-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.headers.origin = 'https://evil.com';
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler, {
        skipOriginValidation: true,
        allowedOrigins: ['https://example.com']
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should skip origin validation when no allowedOrigins provided', async () => {
      const sessionId = 'no-allowed-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.headers.origin = 'https://any.com';
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler, {
        allowedOrigins: []
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should validate referer header if origin not present', async () => {
      const sessionId = 'referer-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.headers.referer = 'https://example.com/page';
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler, {
        allowedOrigins: ['https://example.com']
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should allow requests without origin/referer', async () => {
      const sessionId = 'no-origin-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.admin = { id: sessionId };

      const middleware = csrfService.validateCSRF(mockHandler, {
        allowedOrigins: ['https://example.com']
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should enforce HTTPS in production', async () => {
      process.env.NODE_ENV = 'production';
      const sessionId = 'https-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.admin = { id: sessionId };
      mockReq.secure = false;

      const middleware = csrfService.validateCSRF(mockHandler, {
        requireHttps: true
      });

      await middleware(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'HTTPS required' });
    });

    it('should allow HTTPS requests in production', async () => {
      process.env.NODE_ENV = 'production';
      const sessionId = 'https-ok-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.admin = { id: sessionId };
      mockReq.secure = true;

      const middleware = csrfService.validateCSRF(mockHandler, {
        requireHttps: true
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should detect HTTPS from X-Forwarded-Proto header', async () => {
      process.env.NODE_ENV = 'production';
      const sessionId = 'forwarded-https-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.headers['x-forwarded-proto'] = 'https';
      mockReq.admin = { id: sessionId };
      mockReq.secure = false;

      const middleware = csrfService.validateCSRF(mockHandler, {
        requireHttps: true
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should allow HTTP in development', async () => {
      process.env.NODE_ENV = 'development';
      const sessionId = 'dev-http-session';
      const token = csrfService.generateToken(sessionId);

      mockReq.headers['x-csrf-token'] = token;
      mockReq.admin = { id: sessionId };
      mockReq.secure = false;

      const middleware = csrfService.validateCSRF(mockHandler, {
        requireHttps: false
      });

      await middleware(mockReq, mockRes);

      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle very long session IDs', () => {
      const longSessionId = 'a'.repeat(1000);
      const token = csrfService.generateToken(longSessionId);

      expect(() => jwt.decode(token)).not.toThrow();

      const result = csrfService.verifyToken(token, longSessionId);
      expect(result.valid).toBe(true);
    });

    it('should handle special characters in session ID', () => {
      const specialSessionId = 'user@example.com:session-123';
      const token = csrfService.generateToken(specialSessionId);

      const result = csrfService.verifyToken(token, specialSessionId);
      expect(result.valid).toBe(true);
    });

    it('should handle unicode characters in session ID', () => {
      const unicodeSessionId = '用户-123-🔐';
      const token = csrfService.generateToken(unicodeSessionId);

      const result = csrfService.verifyToken(token, unicodeSessionId);
      expect(result.valid).toBe(true);
    });

    it('should handle concurrent token generation safely', () => {
      const sessionId = 'concurrent-session';
      const tokens = [];

      // Generate multiple tokens concurrently
      for (let i = 0; i < 100; i++) {
        tokens.push(csrfService.generateToken(sessionId));
      }

      // All tokens should be unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(100);
    });

    it('should handle malicious JWT payload injection attempts', () => {
      // Attempt to inject malicious claims
      const maliciousToken = jwt.sign(
        {
          sessionId: 'test-session',
          nonce: 'test-nonce',
          timestamp: Date.now(),
          admin: true, // Attempt to inject admin claim
          role: 'superadmin'
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'alocubano-csrf'
        }
      );

      const result = csrfService.verifyToken(maliciousToken, 'test-session');

      // Token should be valid but injected claims don't grant any privileges
      expect(result.valid).toBe(true);
      expect(result.decoded.admin).toBe(true); // Claim is there
      // But CSRF token only validates request source, not authorization
    });
  });
});
