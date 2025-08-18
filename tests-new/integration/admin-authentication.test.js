/**
 * Admin Authentication Integration Tests
 * Tests admin login, JWT tokens, and protected routes
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { authHelper } from '../core/auth.js';
import { httpClient } from '../core/http.js';
import { databaseHelper } from '../core/database.js';
import { isMockMode } from '../helpers/test-mode.js';

describe.skipIf(isMockMode())('Admin Authentication Integration', () => {
  beforeEach(async () => {
    await databaseHelper.initialize();
    authHelper.clearAuth();
  });

  afterEach(() => {
    authHelper.clearAuth();
  });

  describe('Authentication Configuration', () => {
    it('should validate admin configuration', () => {
      const validation = authHelper.validateAdminConfig();
      
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should have required environment variables', () => {
      expect(process.env.ADMIN_SECRET).toBeDefined();
      expect(process.env.ADMIN_PASSWORD).toBeDefined();
      expect(process.env.ADMIN_SECRET.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('Admin Login', () => {
    it('should login with correct credentials', async () => {
      const token = await authHelper.setupTestAuth();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    it('should generate valid test admin token', () => {
      const token = authHelper.generateTestAdminToken();
      
      expect(token).toBeDefined();
      expect(authHelper.getAdminToken()).toBe(token);
      
      const verification = authHelper.verifyToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.decoded).toMatchObject({
        admin: true,
        type: 'admin',
        test: true
      });
    });

    it('should reject login with incorrect credentials', async () => {
      await expect(
        authHelper.loginAdmin('wrong-password')
      ).rejects.toThrow(/login failed/i);
    });
  });

  describe('Token Management', () => {
    it('should verify valid tokens', async () => {
      const token = authHelper.generateTestAdminToken();
      const verification = await authHelper.verifyToken(token);
      
      expect(verification.valid).toBe(true);
      expect(verification.decoded).toMatchObject({
        admin: true,
        test: true
      });
    });

    it('should reject invalid tokens', async () => {
      const invalidToken = 'invalid.jwt.token';
      const verification = await authHelper.verifyToken(invalidToken);
      
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeDefined();
    });

    it('should clear authentication state', () => {
      authHelper.generateTestAdminToken();
      expect(authHelper.getAdminToken()).toBeDefined();
      
      authHelper.clearAuth();
      
      expect(() => authHelper.getAdminToken()).toThrow();
    });
  });

  describe('Protected Route Access', () => {
    it('should access admin dashboard with valid token', async () => {
      await authHelper.setupTestAuth();
      
      const response = await authHelper.authenticatedRequest('GET', '/api/admin/dashboard');
      
      expect(response.ok).toBe(true);
      expect(response.data).toMatchObject({
        totalTickets: expect.any(Number),
        totalRevenue: expect.any(Number),
        recentTransactions: expect.any(Array)
      });
    });

    it('should reject access without token', async () => {
      const response = await httpClient.get('/api/admin/dashboard');
      
      expect(response.status).toBe(401);
      expect(response.data).toMatchObject({
        error: expect.stringContaining('authorization')
      });
    });

    it('should reject access with invalid token', async () => {
      const response = await httpClient.get('/api/admin/dashboard', {
        headers: {
          'Authorization': 'Bearer invalid.jwt.token'
        }
      });
      
      expect(response.status).toBe(401);
      expect(response.data).toMatchObject({
        error: expect.stringContaining('token')
      });
    });

    it('should access registrations endpoint with authentication', async () => {
      await authHelper.setupTestAuth();
      
      const response = await authHelper.authenticatedRequest('GET', '/api/admin/registrations');
      
      expect(response.ok).toBe(true);
      expect(response.data).toMatchObject({
        registrations: expect.any(Array),
        total: expect.any(Number),
        pagination: expect.any(Object)
      });
    });
  });

  describe('Authentication Headers', () => {
    it('should provide correct authentication headers', async () => {
      await authHelper.setupTestAuth();
      
      const headers = authHelper.getAuthHeaders();
      
      expect(headers).toMatchObject({
        'Authorization': expect.stringMatching(/^Bearer /),
        'Content-Type': 'application/json'
      });
    });

    it('should fail to get headers without authentication', () => {
      expect(() => authHelper.getAuthHeaders()).toThrow();
    });
  });

  describe('QR Token Generation', () => {
    it('should generate valid QR tokens for tickets', () => {
      const ticketId = 123;
      const qrToken = authHelper.generateTestQrToken(ticketId);
      
      expect(qrToken).toBeDefined();
      expect(typeof qrToken).toBe('string');
      expect(qrToken.split('.')).toHaveLength(3); // JWT format
    });

    it('should include ticket ID in QR token', () => {
      const ticketId = 456;
      const qrToken = authHelper.generateTestQrToken(ticketId);
      
      // Decode token without verification (for testing)
      const payload = JSON.parse(atob(qrToken.split('.')[1]));
      
      expect(payload).toMatchObject({
        ticketId,
        test: true,
        maxScans: 5
      });
    });
  });

  describe('API Key Generation', () => {
    it('should generate test API keys', () => {
      const apiKey = authHelper.generateTestApiKey('test-service');
      
      expect(apiKey).toBeDefined();
      expect(typeof apiKey).toBe('string');
      
      // Verify the key
      const verification = authHelper.verifyToken(apiKey);
      expect(verification.valid).toBe(true);
      expect(verification.decoded).toMatchObject({
        service: 'test-service',
        test: true
      });
    });
  });

  describe('Session Management', () => {
    it('should handle expired tokens', async () => {
      // Generate token with short expiry
      const shortLivedToken = authHelper.generateTestAdminToken();
      
      // Manually create expired token payload (for testing)
      const expiredPayload = {
        admin: true,
        test: true,
        iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        exp: Math.floor(Date.now() / 1000) - 1800  // 30 minutes ago (expired)
      };
      
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.sign(expiredPayload, process.env.ADMIN_SECRET);
      
      const verification = await authHelper.verifyToken(expiredToken);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('expired');
    });

    it('should create credentials for testing', () => {
      const credentials = authHelper.createTestCredentials();
      
      expect(credentials).toMatchObject({
        password: 'test-admin-password',
        hashedPassword: expect.any(String)
      });
      
      // Verify hash
      const bcrypt = require('bcryptjs');
      expect(bcrypt.compareSync(credentials.password, credentials.hashedPassword)).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing admin secret gracefully', () => {
      const originalSecret = process.env.ADMIN_SECRET;
      delete process.env.ADMIN_SECRET;
      
      expect(() => authHelper.generateTestAdminToken()).toThrow(/ADMIN_SECRET/);
      
      // Restore
      process.env.ADMIN_SECRET = originalSecret;
    });

    it('should handle malformed authorization headers', async () => {
      const response = await httpClient.get('/api/admin/dashboard', {
        headers: {
          'Authorization': 'Malformed header'
        }
      });
      
      expect(response.status).toBe(401);
    });

    it('should handle missing Bearer prefix', async () => {
      const token = authHelper.generateTestAdminToken();
      
      const response = await httpClient.get('/api/admin/dashboard', {
        headers: {
          'Authorization': token // Missing "Bearer " prefix
        }
      });
      
      expect(response.status).toBe(401);
    });
  });
});