/**
 * Unit Tests for Mobile Authentication Service
 * Tests mobile check-in authentication, JWT tokens, session management, and security
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MobileAuthService } from '../../../lib/mobile-auth-service.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Mobile Auth Service - Unit Tests', () => {
  let service;
  const testSecret = 'test-admin-secret-minimum-32-chars-long-for-testing';
  const testPassword = 'test-password-123';

  beforeEach(() => {
    // Set up environment
    process.env.ADMIN_SECRET = testSecret;
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'preview';
    process.env.TEST_ADMIN_PASSWORD = testPassword;

    service = new MobileAuthService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_SECRET;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.TEST_ADMIN_PASSWORD;
    delete process.env.CHECKIN_STAFF_PASSWORD;
    delete process.env.MOBILE_CHECKIN_SESSION_DURATION;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
  });

  describe('Initialization', () => {
    it('should initialize with ADMIN_SECRET', () => {
      expect(service.sessionSecret).toBe(testSecret);
    });

    it('should throw error when ADMIN_SECRET is missing', () => {
      delete process.env.ADMIN_SECRET;
      expect(() => new MobileAuthService()).toThrow('ADMIN_SECRET secret not configured');
    });

    it('should throw error when ADMIN_SECRET is too short', () => {
      process.env.ADMIN_SECRET = 'short-secret';
      expect(() => new MobileAuthService()).toThrow('at least 32 characters');
    });

    it('should use default session duration (72 hours)', () => {
      expect(service.sessionDuration).toBe(259200000); // 72 hours in ms
    });

    it('should allow custom session duration via environment', () => {
      process.env.MOBILE_CHECKIN_SESSION_DURATION = '3600000'; // 1 hour
      const customService = new MobileAuthService();
      expect(customService.sessionDuration).toBe(3600000);
    });

    it('should define role-based session durations', () => {
      expect(service.roleDurations.checkin_staff).toBe(259200000); // 72 hours
      expect(service.roleDurations.admin).toBe(3600000); // 1 hour
      expect(service.roleDurations.volunteer).toBe(43200000); // 12 hours
    });
  });

  describe('Staff Password Verification - Non-Production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      process.env.VERCEL_ENV = 'preview';
      process.env.TEST_ADMIN_PASSWORD = testPassword;
    });

    it('should verify correct password in non-production', async () => {
      const result = await service.verifyStaffPassword(testPassword);
      expect(result).toBe(true);
    });

    it('should reject incorrect password in non-production', async () => {
      const result = await service.verifyStaffPassword('wrong-password');
      expect(result).toBe(false);
    });

    it('should trim whitespace from password', async () => {
      process.env.TEST_ADMIN_PASSWORD = '  ' + testPassword + '  ';
      const result = await service.verifyStaffPassword('  ' + testPassword + '  ');
      expect(result).toBe(true);
    });

    it('should return false when TEST_ADMIN_PASSWORD not configured', async () => {
      delete process.env.TEST_ADMIN_PASSWORD;
      const result = await service.verifyStaffPassword('any-password');
      expect(result).toBe(false);
    });

    it('should handle empty password', async () => {
      const result = await service.verifyStaffPassword('');
      expect(result).toBe(false);
    });

    it('should handle null password', async () => {
      const result = await service.verifyStaffPassword(null);
      expect(result).toBe(false);
    });

    it('should handle undefined password', async () => {
      const result = await service.verifyStaffPassword(undefined);
      expect(result).toBe(false);
    });
  });

  describe('Staff Password Verification - Production', () => {
    let hashedPassword;

    beforeEach(async () => {
      process.env.NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'production';
      hashedPassword = await bcrypt.hash(testPassword, 10);
      process.env.ADMIN_PASSWORD = hashedPassword;
    });

    it('should verify correct password with bcrypt in production', async () => {
      const result = await service.verifyStaffPassword(testPassword);
      expect(result).toBe(true);
    });

    it('should reject incorrect password in production', async () => {
      const result = await service.verifyStaffPassword('wrong-password');
      expect(result).toBe(false);
    });

    it('should use CHECKIN_STAFF_PASSWORD if configured', async () => {
      const staffPassword = 'staff-password-123';
      const staffHash = await bcrypt.hash(staffPassword, 10);
      process.env.CHECKIN_STAFF_PASSWORD = staffHash;

      const result = await service.verifyStaffPassword(staffPassword);
      expect(result).toBe(true);
    });

    it('should fall back to ADMIN_PASSWORD if CHECKIN_STAFF_PASSWORD not set', async () => {
      delete process.env.CHECKIN_STAFF_PASSWORD;
      const result = await service.verifyStaffPassword(testPassword);
      expect(result).toBe(true);
    });

    it('should throw error when ADMIN_PASSWORD not configured in production', async () => {
      delete process.env.ADMIN_PASSWORD;
      await expect(service.verifyStaffPassword('any-password')).rejects.toThrow(
        'ADMIN_PASSWORD secret not configured'
      );
    });

    it('should handle bcrypt comparison errors gracefully', async () => {
      process.env.ADMIN_PASSWORD = 'invalid-hash';
      const result = await service.verifyStaffPassword(testPassword);
      expect(result).toBe(false);
    });
  });

  describe('Mobile Session Token Creation', () => {
    it('should create JWT token with correct payload', () => {
      const token = service.createMobileSessionToken('staff-001', 'checkin_staff');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    it('should include staff ID in token', () => {
      const token = service.createMobileSessionToken('staff-123', 'checkin_staff');
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.id).toBe('staff-123');
    });

    it('should include role in token', () => {
      const token = service.createMobileSessionToken('staff-001', 'volunteer');
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.role).toBe('volunteer');
    });

    it('should include isMobileCheckIn flag', () => {
      const token = service.createMobileSessionToken('staff-001', 'checkin_staff');
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.isMobileCheckIn).toBe(true);
    });

    it('should include login time', () => {
      const beforeTime = Date.now();
      const token = service.createMobileSessionToken('staff-001', 'checkin_staff');
      const afterTime = Date.now();
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.loginTime).toBeGreaterThanOrEqual(beforeTime);
      expect(decoded.loginTime).toBeLessThanOrEqual(afterTime);
    });

    it('should include expiration time', () => {
      const token = service.createMobileSessionToken('staff-001', 'checkin_staff');
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.expiresAt).toBeDefined();
      expect(decoded.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should use role-specific duration for checkin_staff', () => {
      const token = service.createMobileSessionToken('staff-001', 'checkin_staff');
      const decoded = jwt.verify(token, testSecret);

      const expectedExpiry = decoded.loginTime + 259200000; // 72 hours
      expect(decoded.expiresAt).toBeCloseTo(expectedExpiry, -3); // Within 1 second
    });

    it('should use role-specific duration for admin', () => {
      const token = service.createMobileSessionToken('admin-001', 'admin');
      const decoded = jwt.verify(token, testSecret);

      const expectedExpiry = decoded.loginTime + 3600000; // 1 hour
      expect(decoded.expiresAt).toBeCloseTo(expectedExpiry, -3);
    });

    it('should use role-specific duration for volunteer', () => {
      const token = service.createMobileSessionToken('volunteer-001', 'volunteer');
      const decoded = jwt.verify(token, testSecret);

      const expectedExpiry = decoded.loginTime + 43200000; // 12 hours
      expect(decoded.expiresAt).toBeCloseTo(expectedExpiry, -3);
    });

    it('should fall back to default duration for unknown role', () => {
      const token = service.createMobileSessionToken('staff-001', 'unknown_role');
      const decoded = jwt.verify(token, testSecret);

      const expectedExpiry = decoded.loginTime + 259200000; // Default 72 hours
      expect(decoded.expiresAt).toBeCloseTo(expectedExpiry, -3);
    });

    it('should include correct issuer', () => {
      const token = service.createMobileSessionToken('staff-001', 'checkin_staff');
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.iss).toBe('alocubano-mobile-checkin');
    });

    it('should default to checkin_staff role', () => {
      const token = service.createMobileSessionToken();
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.role).toBe('checkin_staff');
    });

    it('should default to checkin_staff ID', () => {
      const token = service.createMobileSessionToken();
      const decoded = jwt.verify(token, testSecret);

      expect(decoded.id).toBe('checkin_staff');
    });
  });

  describe('Mobile Session Token Verification', () => {
    it('should verify valid token', () => {
      const token = service.createMobileSessionToken('staff-001', 'checkin_staff');
      const result = service.verifyMobileSessionToken(token);

      expect(result.valid).toBe(true);
      expect(result.staff).toBeDefined();
      expect(result.staff.id).toBe('staff-001');
    });

    it('should reject expired token', () => {
      const expiredToken = jwt.sign(
        {
          id: 'staff-001',
          role: 'checkin_staff',
          loginTime: Date.now() - 300000000, // 300000 seconds ago
          isMobileCheckIn: true,
          expiresAt: Date.now() - 1000 // Expired 1 second ago
        },
        testSecret,
        {
          expiresIn: '1s', // Already expired
          issuer: 'alocubano-mobile-checkin'
        }
      );

      // Wait for token to expire
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);

      const result = service.verifyMobileSessionToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');

      vi.useRealTimers();
    });

    it('should reject token with invalid signature', () => {
      const token = service.createMobileSessionToken('staff-001', 'checkin_staff');
      const tamperedToken = token.slice(0, -10) + '0123456789';

      const result = service.verifyMobileSessionToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject token with wrong issuer', () => {
      const wrongIssuerToken = jwt.sign(
        {
          id: 'staff-001',
          role: 'checkin_staff',
          loginTime: Date.now(),
          isMobileCheckIn: true,
          expiresAt: Date.now() + 3600000
        },
        testSecret,
        {
          expiresIn: '1h',
          issuer: 'wrong-issuer'
        }
      );

      const result = service.verifyMobileSessionToken(wrongIssuerToken);

      expect(result.valid).toBe(false);
    });

    it('should reject malformed token', () => {
      const result = service.verifyMobileSessionToken('not-a-valid-jwt');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject empty token', () => {
      const result = service.verifyMobileSessionToken('');

      expect(result.valid).toBe(false);
    });

    it('should reject null token', () => {
      const result = service.verifyMobileSessionToken(null);

      expect(result.valid).toBe(false);
    });

    it('should return staff data for valid token', () => {
      const token = service.createMobileSessionToken('staff-456', 'volunteer');
      const result = service.verifyMobileSessionToken(token);

      expect(result.valid).toBe(true);
      expect(result.staff.id).toBe('staff-456');
      expect(result.staff.role).toBe('volunteer');
      expect(result.staff.isMobileCheckIn).toBe(true);
    });
  });

  describe('Session Cookie Creation', () => {
    it('should create cookie with correct name', () => {
      const token = 'test-token-123';
      const cookie = service.createMobileSessionCookie(token, 'checkin_staff');

      expect(cookie).toContain('mobile_checkin_session=');
      expect(cookie).toContain(token);
    });

    it('should set httpOnly flag', () => {
      const token = 'test-token-123';
      const cookie = service.createMobileSessionCookie(token);

      expect(cookie).toContain('HttpOnly');
    });

    it('should set sameSite to strict', () => {
      const token = 'test-token-123';
      const cookie = service.createMobileSessionCookie(token);

      expect(cookie).toContain('SameSite=Strict');
    });

    it('should set secure flag in production', () => {
      process.env.NODE_ENV = 'production';
      const newService = new MobileAuthService();
      const token = 'test-token-123';
      const cookie = newService.createMobileSessionCookie(token);

      expect(cookie).toContain('Secure');
    });

    it('should not set secure flag in development', () => {
      process.env.NODE_ENV = 'development';
      const newService = new MobileAuthService();
      const token = 'test-token-123';
      const cookie = newService.createMobileSessionCookie(token);

      expect(cookie).not.toContain('Secure');
    });

    it('should set correct max age for checkin_staff', () => {
      const token = 'test-token-123';
      const cookie = service.createMobileSessionCookie(token, 'checkin_staff');

      const maxAgeSeconds = 259200; // 72 hours in seconds
      expect(cookie).toContain(`Max-Age=${maxAgeSeconds}`);
    });

    it('should set correct max age for admin', () => {
      const token = 'test-token-123';
      const cookie = service.createMobileSessionCookie(token, 'admin');

      const maxAgeSeconds = 3600; // 1 hour in seconds
      expect(cookie).toContain(`Max-Age=${maxAgeSeconds}`);
    });

    it('should set correct max age for volunteer', () => {
      const token = 'test-token-123';
      const cookie = service.createMobileSessionCookie(token, 'volunteer');

      const maxAgeSeconds = 43200; // 12 hours in seconds
      expect(cookie).toContain(`Max-Age=${maxAgeSeconds}`);
    });

    it('should set path to root', () => {
      const token = 'test-token-123';
      const cookie = service.createMobileSessionCookie(token);

      expect(cookie).toContain('Path=/');
    });
  });

  describe('Session Extraction from Request', () => {
    it('should extract mobile session cookie', () => {
      const mockReq = {
        headers: {
          cookie: 'mobile_checkin_session=test-token-123; other=value'
        }
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBe('test-token-123');
    });

    it('should fall back to admin session cookie', () => {
      const mockReq = {
        headers: {
          cookie: 'admin_session=admin-token-456; other=value'
        }
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBe('admin-token-456');
    });

    it('should prioritize mobile session over admin session', () => {
      const mockReq = {
        headers: {
          cookie: 'mobile_checkin_session=mobile-token; admin_session=admin-token'
        }
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBe('mobile-token');
    });

    it('should extract Bearer token from Authorization header', () => {
      const mockReq = {
        headers: {
          authorization: 'Bearer bearer-token-789'
        }
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBe('bearer-token-789');
    });

    it('should prioritize cookie over Bearer token', () => {
      const mockReq = {
        headers: {
          cookie: 'mobile_checkin_session=cookie-token',
          authorization: 'Bearer bearer-token'
        }
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBe('cookie-token');
    });

    it('should return null when no session found', () => {
      const mockReq = {
        headers: {}
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBeNull();
    });

    it('should handle missing cookie header', () => {
      const mockReq = {
        headers: {
          authorization: 'Basic not-bearer'
        }
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBeNull();
    });

    it('should handle malformed Authorization header', () => {
      const mockReq = {
        headers: {
          authorization: 'NotBearer token-123'
        }
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBeNull();
    });

    it('should handle empty cookie string', () => {
      const mockReq = {
        headers: {
          cookie: ''
        }
      };

      const session = service.getSessionFromRequest(mockReq);
      expect(session).toBeNull();
    });
  });

  describe('Check-in Permission Validation', () => {
    it('should allow admin to check in tickets', () => {
      const decodedToken = { role: 'admin' };
      const canCheckIn = service.canCheckInTickets(decodedToken);
      expect(canCheckIn).toBe(true);
    });

    it('should allow checkin_staff to check in tickets', () => {
      const decodedToken = { role: 'checkin_staff' };
      const canCheckIn = service.canCheckInTickets(decodedToken);
      expect(canCheckIn).toBe(true);
    });

    it('should allow volunteer to check in tickets', () => {
      const decodedToken = { role: 'volunteer' };
      const canCheckIn = service.canCheckInTickets(decodedToken);
      expect(canCheckIn).toBe(true);
    });

    it('should deny unknown role', () => {
      const decodedToken = { role: 'unknown_role' };
      const canCheckIn = service.canCheckInTickets(decodedToken);
      expect(canCheckIn).toBe(false);
    });

    it('should deny guest role', () => {
      const decodedToken = { role: 'guest' };
      const canCheckIn = service.canCheckInTickets(decodedToken);
      expect(canCheckIn).toBe(false);
    });

    it('should deny user role', () => {
      const decodedToken = { role: 'user' };
      const canCheckIn = service.canCheckInTickets(decodedToken);
      expect(canCheckIn).toBe(false);
    });

    it('should deny token without role', () => {
      const decodedToken = {};
      const canCheckIn = service.canCheckInTickets(decodedToken);
      expect(canCheckIn).toBe(false);
    });

    it('should handle null role', () => {
      const decodedToken = { role: null };
      const canCheckIn = service.canCheckInTickets(decodedToken);
      expect(canCheckIn).toBe(false);
    });
  });

  describe('Token Refresh Logic', () => {
    it('should recommend refresh when less than 24 hours left', () => {
      const oneDayMs = 86400000;
      const decodedToken = {
        loginTime: Date.now() - 48 * 3600000, // 48 hours ago
        expiresAt: Date.now() + (oneDayMs - 1000) // 23h 59m 59s left
      };

      const shouldRefresh = service.shouldRefreshToken(decodedToken);
      expect(shouldRefresh).toBe(true);
    });

    it('should not recommend refresh when more than 24 hours left', () => {
      const oneDayMs = 86400000;
      const decodedToken = {
        loginTime: Date.now(),
        expiresAt: Date.now() + (oneDayMs + 1000) // 24h 0m 1s left
      };

      const shouldRefresh = service.shouldRefreshToken(decodedToken);
      expect(shouldRefresh).toBe(false);
    });

    it('should recommend refresh when exactly 24 hours left', () => {
      const oneDayMs = 86400000;
      const mockNow = 1699999999000; // Fixed timestamp

      // Mock Date.now() to prevent timing drift in Node 22.x
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const decodedToken = {
        loginTime: mockNow,
        expiresAt: mockNow + oneDayMs // Exactly 24 hours
      };

      const shouldRefresh = service.shouldRefreshToken(decodedToken);
      expect(shouldRefresh).toBe(false); // >= 24 hours, no refresh needed

      // Restore Date.now()
      vi.restoreAllMocks();
    });

    it('should recommend refresh when expired', () => {
      const decodedToken = {
        loginTime: Date.now() - 100000,
        expiresAt: Date.now() - 1000 // Already expired
      };

      const shouldRefresh = service.shouldRefreshToken(decodedToken);
      expect(shouldRefresh).toBe(true);
    });

    it('should recommend refresh when 1 hour left', () => {
      const decodedToken = {
        loginTime: Date.now(),
        expiresAt: Date.now() + 3600000 // 1 hour left
      };

      const shouldRefresh = service.shouldRefreshToken(decodedToken);
      expect(shouldRefresh).toBe(true);
    });
  });
});
