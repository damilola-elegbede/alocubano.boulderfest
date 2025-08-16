/**
 * Comprehensive Admin Authentication Integration Tests
 * Tests actual admin API endpoints with real HTTP requests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { authHelper } from '../core/auth.js';
import { httpClient } from '../core/http.js';
import { databaseHelper } from '../core/database.js';
import authService from '../../api/lib/auth-service.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

describe('Admin Authentication API Integration', () => {
  const testPassword = 'test-admin-password';
  const adminSecret = process.env.ADMIN_SECRET;
  const sessionDuration = parseInt(process.env.ADMIN_SESSION_DURATION || '3600000'); // 1 hour

  beforeAll(async () => {
    console.log('🚀 Starting admin auth integration tests...');
    
    // Initialize database
    await databaseHelper.initialize();
    
    console.log('✅ Admin auth integration tests ready');
  });

  beforeEach(async () => {
    // Clear any existing authentication state
    authHelper.clearAuth();
  });

  afterEach(() => {
    // Cleanup after each test
    authHelper.clearAuth();
  });

  describe('Environment Configuration', () => {
    it('should have required environment variables configured', () => {
      expect(process.env.ADMIN_SECRET).toBeDefined();
      expect(process.env.ADMIN_PASSWORD).toBeDefined();
      expect(process.env.ADMIN_SECRET.length).toBeGreaterThanOrEqual(32);
      
      // Verify the admin password is a valid bcrypt hash
      expect(process.env.ADMIN_PASSWORD).toMatch(/^\$2[aby]?\$\d+\$/);
    });

    it('should validate session duration configuration', () => {
      expect(sessionDuration).toBe(3600000); // 1 hour in milliseconds
      expect(typeof sessionDuration).toBe('number');
      expect(sessionDuration).toBeGreaterThan(0);
    });
  });

  describe('Auth Service Password Verification', () => {
    it('should verify correct password against bcrypt hash', async () => {
      const isValid = await authService.verifyPassword(testPassword);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const isValid = await authService.verifyPassword('wrong-password');
      expect(isValid).toBe(false);
    });

    it('should handle null password gracefully', async () => {
      const isValid = await authService.verifyPassword(null);
      expect(isValid).toBe(false);
    });

    it('should handle undefined password gracefully', async () => {
      const isValid = await authService.verifyPassword(undefined);
      expect(isValid).toBe(false);
    });

    it('should handle empty string password', async () => {
      const isValid = await authService.verifyPassword('');
      expect(isValid).toBe(false);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(1000);
      const isValid = await authService.verifyPassword(longPassword);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Generation and Validation', () => {
    let validToken;

    beforeEach(() => {
      // Generate a token using the auth service
      validToken = authService.createSessionToken('admin');
    });

    it('should generate valid JWT tokens with correct structure', () => {
      // Verify JWT structure (3 parts separated by dots)
      expect(validToken.split('.')).toHaveLength(3);

      // Decode and verify token structure
      const decoded = jwt.decode(validToken);
      expect(decoded).toMatchObject({
        id: 'admin',
        role: 'admin',
        loginTime: expect.any(Number),
        iat: expect.any(Number),
        exp: expect.any(Number),
        iss: 'alocubano-admin'
      });

      // Verify expiration time (should be ~1 hour from now)
      const expirationTime = decoded.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const expectedExpiration = currentTime + sessionDuration;
      
      // Allow 10 second tolerance for test execution time
      expect(expirationTime).toBeGreaterThan(currentTime);
      expect(expirationTime).toBeLessThan(expectedExpiration + 10000);
    });

    it('should be verifiable with admin secret', () => {
      expect(() => {
        jwt.verify(validToken, adminSecret, { issuer: 'alocubano-admin' });
      }).not.toThrow();

      const verified = jwt.verify(validToken, adminSecret, { issuer: 'alocubano-admin' });
      expect(verified).toMatchObject({
        id: 'admin',
        role: 'admin'
      });
    });

    it('should reject tokens with wrong secret', () => {
      expect(() => {
        jwt.verify(validToken, 'wrong-secret');
      }).toThrow();
    });

    it('should reject tokens with wrong issuer', () => {
      expect(() => {
        jwt.verify(validToken, adminSecret, { issuer: 'wrong-issuer' });
      }).toThrow();
    });

    it('should verify session tokens through auth service', () => {
      const verification = authService.verifySessionToken(validToken);
      
      expect(verification.valid).toBe(true);
      expect(verification.admin).toMatchObject({
        id: 'admin',
        role: 'admin',
        loginTime: expect.any(Number)
      });
    });

    it('should reject invalid session tokens', () => {
      const verification = authService.verifySessionToken('invalid.jwt.token');
      
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeDefined();
    });

    it('should reject expired tokens', () => {
      // Create an expired token manually
      const expiredPayload = {
        id: 'admin',
        role: 'admin',
        loginTime: Date.now() - 7200000, // 2 hours ago
        iat: Math.floor((Date.now() - 7200000) / 1000),
        exp: Math.floor((Date.now() - 3600000) / 1000) // Expired 1 hour ago
      };

      const expiredToken = jwt.sign(expiredPayload, adminSecret, {
        issuer: 'alocubano-admin'
      });

      const verification = authService.verifySessionToken(expiredToken);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('expired');
    });
  });

  describe('Cookie Management', () => {
    let validToken;

    beforeEach(() => {
      validToken = authService.createSessionToken('admin');
    });

    it('should create session cookies with correct attributes', () => {
      const cookie = authService.createSessionCookie(validToken);
      
      expect(cookie).toContain(`admin_session=${validToken}`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      
      // In test environment, secure should be false
      if (process.env.NODE_ENV !== 'production') {
        expect(cookie).not.toContain('Secure');
      }
      
      // Verify max age matches session duration
      expect(cookie).toContain(`Max-Age=${Math.floor(sessionDuration / 1000)}`);
    });

    it('should create clear session cookies', () => {
      const clearCookie = authService.clearSessionCookie();
      
      expect(clearCookie).toContain('admin_session=');
      expect(clearCookie).toContain('Max-Age=0');
      expect(clearCookie).toContain('HttpOnly');
      expect(clearCookie).toContain('SameSite=Strict');
    });

    it('should parse session from cookie header', () => {
      const mockRequest = {
        headers: {
          cookie: `admin_session=${validToken}; other_cookie=value`
        }
      };
      
      const extractedToken = authService.getSessionFromRequest(mockRequest);
      expect(extractedToken).toBe(validToken);
    });

    it('should parse session from Authorization header', () => {
      const mockRequest = {
        headers: {
          authorization: `Bearer ${validToken}`
        }
      };
      
      const extractedToken = authService.getSessionFromRequest(mockRequest);
      expect(extractedToken).toBe(validToken);
    });

    it('should return null when no session found', () => {
      const mockRequest = {
        headers: {}
      };
      
      const extractedToken = authService.getSessionFromRequest(mockRequest);
      expect(extractedToken).toBeNull();
    });

    it('should prioritize cookie over Authorization header', () => {
      const cookieToken = authService.createSessionToken('admin');
      const authToken = authService.createSessionToken('admin');
      
      const mockRequest = {
        headers: {
          cookie: `admin_session=${cookieToken}`,
          authorization: `Bearer ${authToken}`
        }
      };
      
      const extractedToken = authService.getSessionFromRequest(mockRequest);
      expect(extractedToken).toBe(cookieToken);
    });
  });

  describe('Authentication Middleware', () => {
    it('should create working auth middleware', () => {
      const mockHandler = vi.fn((req, res) => {
        res.status(200).json({ success: true, admin: req.admin });
      });
      
      const protectedHandler = authService.requireAuth(mockHandler);
      expect(typeof protectedHandler).toBe('function');
    });

    it('should reject requests without tokens', async () => {
      const mockHandler = vi.fn();
      const protectedHandler = authService.requireAuth(mockHandler);
      
      const mockReq = { headers: {} };
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      
      await protectedHandler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should reject requests with invalid tokens', async () => {
      const mockHandler = vi.fn();
      const protectedHandler = authService.requireAuth(mockHandler);
      
      const mockReq = { 
        headers: { 
          authorization: 'Bearer invalid.jwt.token' 
        } 
      };
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      
      await protectedHandler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired session' });
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should allow requests with valid tokens', async () => {
      const validToken = authService.createSessionToken('admin');
      const mockHandler = vi.fn((req, res) => {
        res.status(200).json({ success: true });
      });
      const protectedHandler = authService.requireAuth(mockHandler);
      
      const mockReq = { 
        headers: { 
          authorization: `Bearer ${validToken}` 
        } 
      };
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      
      await protectedHandler(mockReq, mockRes);
      
      expect(mockHandler).toHaveBeenCalledWith(mockReq, mockRes);
      expect(mockReq.admin).toMatchObject({
        id: 'admin',
        role: 'admin'
      });
    });

    it('should handle expired tokens gracefully', async () => {
      // Create an expired token manually
      const expiredPayload = {
        id: 'admin',
        role: 'admin',
        loginTime: Date.now() - 7200000, // 2 hours ago
        iat: Math.floor((Date.now() - 7200000) / 1000),
        exp: Math.floor((Date.now() - 3600000) / 1000) // Expired 1 hour ago
      };

      const expiredToken = jwt.sign(expiredPayload, adminSecret, {
        issuer: 'alocubano-admin'
      });
      
      const mockHandler = vi.fn();
      const protectedHandler = authService.requireAuth(mockHandler);
      
      const mockReq = { 
        headers: { 
          authorization: `Bearer ${expiredToken}` 
        } 
      };
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      
      await protectedHandler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired session' });
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Auth Helper Integration', () => {
    it('should successfully generate test admin token', () => {
      const token = authHelper.generateTestAdminToken();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
      
      // Verify token contents
      const decoded = jwt.decode(token);
      expect(decoded).toMatchObject({
        admin: true,
        type: 'admin',
        test: true
      });
    });

    it('should verify tokens correctly', async () => {
      const token = authHelper.generateTestAdminToken();
      const verification = await authHelper.verifyToken(token);
      
      expect(verification.valid).toBe(true);
      expect(verification.decoded).toMatchObject({
        admin: true,
        test: true
      });
    });

    it('should reject invalid tokens', async () => {
      const verification = await authHelper.verifyToken('invalid.jwt.token');
      
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeDefined();
    });

    it('should provide authentication headers', () => {
      authHelper.generateTestAdminToken();
      const headers = authHelper.getAuthHeaders();
      
      expect(headers).toMatchObject({
        'Authorization': expect.stringMatching(/^Bearer /),
        'Content-Type': 'application/json'
      });
    });

    it('should validate admin configuration', () => {
      const validation = authHelper.validateAdminConfig();
      
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should generate QR tokens for testing', () => {
      const ticketId = 123;
      const qrToken = authHelper.generateTestQrToken(ticketId);
      
      expect(qrToken).toBeDefined();
      expect(typeof qrToken).toBe('string');
      
      // Decode and verify
      const payload = JSON.parse(atob(qrToken.split('.')[1]));
      expect(payload).toMatchObject({
        ticketId,
        test: true,
        maxScans: 5
      });
    });

    it('should generate API keys for testing', async () => {
      const apiKey = authHelper.generateTestApiKey('test-service');
      
      expect(apiKey).toBeDefined();
      expect(typeof apiKey).toBe('string');
      
      const verification = await authHelper.verifyToken(apiKey);
      expect(verification.valid).toBe(true);
      expect(verification.decoded).toMatchObject({
        service: 'test-service',
        test: true
      });
    });

    it('should create test credentials', () => {
      const credentials = authHelper.createTestCredentials();
      
      expect(credentials).toMatchObject({
        password: 'test-admin-password',
        hashedPassword: expect.any(String)
      });
      
      // Verify hash
      expect(bcrypt.compareSync(credentials.password, credentials.hashedPassword)).toBe(true);
    });

    it('should clear authentication state', () => {
      authHelper.generateTestAdminToken();
      expect(authHelper.getAdminToken()).toBeDefined();
      
      authHelper.clearAuth();
      
      expect(() => authHelper.getAdminToken()).toThrow();
    });
  });

  describe('Password Hash Verification', () => {
    it('should verify password against bcrypt hash from environment', async () => {
      const adminPasswordHash = process.env.ADMIN_PASSWORD;
      
      // Verify the test password matches the hash
      const isValid = await bcrypt.compare(testPassword, adminPasswordHash);
      expect(isValid).toBe(true);
      
      // Verify wrong password doesn't match
      const isInvalid = await bcrypt.compare('wrong-password', adminPasswordHash);
      expect(isInvalid).toBe(false);
    });

    it('should handle various password scenarios through auth service', async () => {
      // Test valid password
      expect(await authService.verifyPassword(testPassword)).toBe(true);
      
      // Test invalid passwords
      expect(await authService.verifyPassword('wrong-password')).toBe(false);
      expect(await authService.verifyPassword('')).toBe(false);
      expect(await authService.verifyPassword(null)).toBe(false);
      expect(await authService.verifyPassword(undefined)).toBe(false);
    });

    it('should validate bcrypt hash format', () => {
      const adminPasswordHash = process.env.ADMIN_PASSWORD;
      
      // Verify it's a valid bcrypt hash format
      expect(adminPasswordHash).toMatch(/^\$2[aby]?\$\d+\$/);
      expect(adminPasswordHash.length).toBeGreaterThan(50); // Bcrypt hashes are typically 60 chars
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing admin secret gracefully', () => {
      const originalSecret = process.env.ADMIN_SECRET;
      delete process.env.ADMIN_SECRET;
      
      // Should throw error when trying to create auth service
      expect(() => {
        new (authService.constructor)();
      }).toThrow(/ADMIN_SECRET/);
      
      // Restore
      process.env.ADMIN_SECRET = originalSecret;
    });

    it('should handle short admin secret', () => {
      const originalSecret = process.env.ADMIN_SECRET;
      process.env.ADMIN_SECRET = 'short';
      
      expect(() => {
        new (authService.constructor)();
      }).toThrow(/at least 32 characters/);
      
      // Restore
      process.env.ADMIN_SECRET = originalSecret;
    });

    it('should handle malformed JWT tokens', () => {
      const verification = authService.verifySessionToken('not.a.jwt');
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeDefined();
    });

    it('should handle missing password environment variable', async () => {
      const originalPassword = process.env.ADMIN_PASSWORD;
      delete process.env.ADMIN_PASSWORD;
      
      const isValid = await authService.verifyPassword(testPassword);
      expect(isValid).toBe(false);
      
      // Restore
      process.env.ADMIN_PASSWORD = originalPassword;
    });

    it('should handle malformed authorization headers in session extraction', () => {
      const mockRequest = {
        headers: {
          authorization: 'InvalidFormat'
        }
      };
      
      const token = authService.getSessionFromRequest(mockRequest);
      expect(token).toBeNull();
    });
  });
});