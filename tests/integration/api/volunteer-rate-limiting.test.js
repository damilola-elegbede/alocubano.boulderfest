/**
 * Integration Test: Volunteer Submit API - Rate Limiting Edge Cases
 *
 * Tests the rate limiting functionality in /api/volunteer/submit.js
 *
 * Rate Limiting Specifications:
 * - Limit: 20 requests per window
 * - Window: 15 minutes (900,000 ms)
 * - Storage: In-memory Map with key format `volunteer_${ip}`
 * - Response: 429 status with `retryAfter` in seconds
 * - Reset: Window resets when `now > rateData.resetTime`
 *
 * Test Coverage:
 * 1. Normal rate limiting (2 tests)
 * 2. Window reset logic (2 tests)
 * 3. Multiple IP addresses (2 tests)
 * 4. Retry-After header (2 tests)
 * 5. Rate limit map management (2 tests)
 *
 * Target: 10 comprehensive tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testRequest, HTTP_STATUS, createMockRequest, createMockResponse } from '../../integration/handler-test-helper.js';
import handler from '../../../api/volunteer/submit.js';

// Mock MX validation to avoid DNS issues with fake timers
vi.mock('../../../lib/validators/form-validators.js', async () => {
  const actual = await vi.importActual('../../../lib/validators/form-validators.js');
  return {
    ...actual,
    validateVolunteerSubmission: async (data, options) => {
      // Call actual validator but skip MX verification (bypass DNS with fake timers)
      return actual.validateVolunteerSubmission(data, { ...options, verifyMX: false });
    }
  };
});

// Helper to generate valid test emails for rate limit testing
function generateValidTestEmail() {
  return `test.ratelimit.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

// Helper to generate valid volunteer data
function generateValidVolunteerData() {
  return {
    firstName: 'John',
    lastName: 'Smith',
    email: generateValidTestEmail(),
    phone: '(303) 555-1234',
    areasOfInterest: ['setup'],
    availability: ['friday']
  };
}

describe('Integration: Volunteer Rate Limiting', () => {
  beforeEach(() => {
    // Use fake timers for time manipulation
    vi.useFakeTimers();
    // Set to a known time
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    // Mock Brevo to prevent actual email sending
    delete process.env.BREVO_API_KEY;
  });

  afterEach(() => {
    // Restore real timers
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ============================================================================
  // 1. Normal Rate Limiting (2 tests)
  // ============================================================================

  describe('Normal Rate Limiting', () => {
    it('should allow first 20 requests within window', async () => {
      const validData = generateValidVolunteerData();
      const ip = '192.168.100.1';

      // Send 20 requests with same IP
      for (let i = 0; i < 20; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip,
          'host': 'preview.vercel.app' // Preview mode to skip email
        });
        const res = createMockResponse();

        await handler(req, res);

        const status = res._getStatus();
        const body = res._getBody();

        // All 20 requests should succeed (201) or at least not be rate-limited (429)
        expect(status).not.toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
        if (status === HTTP_STATUS.CREATED) {
          expect(body).toHaveProperty('success', true);
        }
      }
    });

    it('should rate limit 21st request with 429 status', async () => {
      const validData = generateValidVolunteerData();
      const ip = '192.168.100.2';

      // Send 21 requests with same IP
      for (let i = 0; i < 21; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip,
          'host': 'preview.vercel.app'
        });
        const res = createMockResponse();

        await handler(req, res);

        const status = res._getStatus();
        const body = res._getBody();

        if (i < 20) {
          // First 20 should not be rate limited
          expect(status).not.toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
        } else {
          // 21st request should be rate limited
          expect(status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
          expect(body).toHaveProperty('error');
          expect(body.error).toMatch(/too many requests/i);
          expect(body).toHaveProperty('retryAfter');
        }
      }
    });
  });

  // ============================================================================
  // 2. Window Reset Logic (2 tests)
  // ============================================================================

  describe('Window Reset Logic', () => {
    it('should reset counter after window expires (15 minutes)', async () => {
      const validData = generateValidVolunteerData();
      const ip = '192.168.100.3';

      // Fill up the rate limit (20 requests)
      for (let i = 0; i < 20; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip,
          'host': 'preview.vercel.app'
        });
        const res = createMockResponse();
        await handler(req, res);
      }

      // 21st request should be rate limited
      let req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      let res = createMockResponse();
      await handler(req, res);

      expect(res._getStatus()).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);

      // Fast-forward time by 15 minutes + 1 second
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

      // Next request should succeed (counter reset)
      req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      res = createMockResponse();
      await handler(req, res);

      const status = res._getStatus();
      const body = res._getBody();

      expect(status).not.toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(status).toBe(HTTP_STATUS.CREATED);
      expect(body).toHaveProperty('success', true);
    });

    it('should maintain rate limit within window (before expiration)', async () => {
      const validData = generateValidVolunteerData();
      const ip = '192.168.100.4';

      // Fill up the rate limit (20 requests)
      for (let i = 0; i < 20; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip,
          'host': 'preview.vercel.app'
        });
        const res = createMockResponse();
        await handler(req, res);
      }

      // 21st request should be rate limited
      let req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      let res = createMockResponse();
      await handler(req, res);

      expect(res._getStatus()).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);

      // Fast-forward time by 10 minutes (still within 15 minute window)
      vi.advanceTimersByTime(10 * 60 * 1000);

      // Request should still be rate limited
      req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      res = createMockResponse();
      await handler(req, res);

      const status = res._getStatus();
      const body = res._getBody();

      expect(status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(body).toHaveProperty('error');
      expect(body.error).toMatch(/too many requests/i);
      expect(body).toHaveProperty('retryAfter');
      // Should have approximately 5 minutes (300 seconds) remaining
      expect(body.retryAfter).toBeGreaterThan(290);
      expect(body.retryAfter).toBeLessThanOrEqual(300);
    });
  });

  // ============================================================================
  // 3. Multiple IP Addresses (2 tests)
  // ============================================================================

  describe('Multiple IP Addresses', () => {
    it('should track rate limits independently per IP address', async () => {
      const validData = generateValidVolunteerData();
      const ip1 = '192.168.100.5';
      const ip2 = '192.168.100.6';

      // IP 1: Fill up rate limit (20 requests)
      for (let i = 0; i < 20; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip1,
          'host': 'preview.vercel.app'
        });
        const res = createMockResponse();
        await handler(req, res);
      }

      // IP 1: 21st request should be rate limited
      let req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip1,
        'host': 'preview.vercel.app'
      });
      let res = createMockResponse();
      await handler(req, res);

      expect(res._getStatus()).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(res._getBody()).toHaveProperty('error');
      expect(res._getBody().error).toMatch(/too many requests/i);

      // IP 2: First request should NOT be rate limited (independent counter)
      req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip2,
        'host': 'preview.vercel.app'
      });
      res = createMockResponse();
      await handler(req, res);

      const status = res._getStatus();
      const body = res._getBody();

      expect(status).not.toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(status).toBe(HTTP_STATUS.CREATED);
      expect(body).toHaveProperty('success', true);
    });

    it('should not interfere with concurrent requests from different IPs', async () => {
      const validData = generateValidVolunteerData();
      const ips = [
        '192.168.100.10',
        '192.168.100.11',
        '192.168.100.12',
        '192.168.100.13',
        '192.168.100.14'
      ];

      // Send 10 requests from each IP concurrently
      const results = [];
      for (const ip of ips) {
        for (let i = 0; i < 10; i++) {
          const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
            'x-forwarded-for': ip,
            'host': 'preview.vercel.app'
          });
          const res = createMockResponse();
          await handler(req, res);
          results.push({ ip, status: res._getStatus() });
        }
      }

      // All requests should succeed (none should be rate limited)
      const rateLimitedCount = results.filter(r => r.status === HTTP_STATUS.TOO_MANY_REQUESTS).length;
      expect(rateLimitedCount).toBe(0);

      // Each IP should have sent 10 requests successfully
      for (const ip of ips) {
        const ipResults = results.filter(r => r.ip === ip && r.status === HTTP_STATUS.CREATED);
        expect(ipResults.length).toBe(10);
      }
    });
  });

  // ============================================================================
  // 4. Retry-After Header (2 tests)
  // ============================================================================

  describe('Retry-After Header', () => {
    it('should include retryAfter field in 429 response', async () => {
      const validData = generateValidVolunteerData();
      const ip = '192.168.100.20';

      // Fill up rate limit (20 requests)
      for (let i = 0; i < 20; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip,
          'host': 'preview.vercel.app'
        });
        const res = createMockResponse();
        await handler(req, res);
      }

      // 21st request should be rate limited with retryAfter
      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      const res = createMockResponse();
      await handler(req, res);

      const status = res._getStatus();
      const body = res._getBody();

      expect(status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('retryAfter');
      expect(typeof body.retryAfter).toBe('number');
    });

    it('should have retryAfter value within valid range (0-900 seconds)', async () => {
      const validData = generateValidVolunteerData();
      const ip = '192.168.100.21';

      // Fill up rate limit (20 requests)
      for (let i = 0; i < 20; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip,
          'host': 'preview.vercel.app'
        });
        const res = createMockResponse();
        await handler(req, res);
      }

      // 21st request - check retryAfter is valid
      let req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      let res = createMockResponse();
      await handler(req, res);

      let body = res._getBody();
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThanOrEqual(900); // 15 minutes in seconds

      // Fast-forward 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Check retryAfter decreases appropriately
      req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      res = createMockResponse();
      await handler(req, res);

      body = res._getBody();
      expect(body.retryAfter).toBeGreaterThan(0);
      expect(body.retryAfter).toBeLessThanOrEqual(600); // Approximately 10 minutes remaining

      // Fast-forward another 10 minutes (total 15 minutes)
      vi.advanceTimersByTime(10 * 60 * 1000 + 1000);

      // Should be able to make request again (window expired)
      req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      res = createMockResponse();
      await handler(req, res);

      const status = res._getStatus();
      expect(status).toBe(HTTP_STATUS.CREATED);
    });
  });

  // ============================================================================
  // 5. Rate Limit Map Management (2 tests)
  // ============================================================================

  describe('Rate Limit Map Management', () => {
    it('should create rate limit data on first request from new IP', async () => {
      const validData = generateValidVolunteerData();
      const ip = '192.168.100.30';

      // First request from this IP
      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      const res = createMockResponse();
      await handler(req, res);

      const status = res._getStatus();
      const body = res._getBody();

      // Should succeed and create rate limit entry
      expect(status).toBe(HTTP_STATUS.CREATED);
      expect(body).toHaveProperty('success', true);

      // Second request should also succeed (counter = 2)
      const req2 = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      const res2 = createMockResponse();
      await handler(req2, res2);

      expect(res2._getStatus()).toBe(HTTP_STATUS.CREATED);
    });

    it('should increment counter correctly with each request', async () => {
      const validData = generateValidVolunteerData();
      const ip = '192.168.100.31';

      // Send 5 requests and verify none are rate-limited
      for (let i = 1; i <= 5; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip,
          'host': 'preview.vercel.app'
        });
        const res = createMockResponse();
        await handler(req, res);

        const status = res._getStatus();
        expect(status).toBe(HTTP_STATUS.CREATED);
      }

      // Send 15 more requests to reach limit (total 20)
      for (let i = 6; i <= 20; i++) {
        const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': ip,
          'host': 'preview.vercel.app'
        });
        const res = createMockResponse();
        await handler(req, res);

        const status = res._getStatus();
        expect(status).toBe(HTTP_STATUS.CREATED);
      }

      // 21st request should be rate limited (counter exceeded limit)
      const req21 = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': ip,
        'host': 'preview.vercel.app'
      });
      const res21 = createMockResponse();
      await handler(req21, res21);

      expect(res21._getStatus()).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
    });
  });

  // ============================================================================
  // Edge Case: IP Address Extraction
  // ============================================================================

  describe('IP Address Extraction', () => {
    it('should use x-forwarded-for header for rate limiting', async () => {
      const validData = generateValidVolunteerData();
      const forwardedIp = '192.168.100.40';

      // Use x-forwarded-for header
      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': forwardedIp,
        'host': 'preview.vercel.app'
      });
      const res = createMockResponse();
      await handler(req, res);

      expect(res._getStatus()).toBe(HTTP_STATUS.CREATED);

      // Fill up rate limit for this IP
      for (let i = 1; i < 20; i++) {
        const req2 = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
          'x-forwarded-for': forwardedIp,
          'host': 'preview.vercel.app'
        });
        const res2 = createMockResponse();
        await handler(req2, res2);
      }

      // 21st request should be rate limited
      const req21 = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'x-forwarded-for': forwardedIp,
        'host': 'preview.vercel.app'
      });
      const res21 = createMockResponse();
      await handler(req21, res21);

      expect(res21._getStatus()).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
    });

    it('should fallback to connection.remoteAddress if no forwarded header', async () => {
      const validData = generateValidVolunteerData();

      // Don't set x-forwarded-for, let it use connection.remoteAddress
      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        'host': 'preview.vercel.app'
      });
      // Remove x-forwarded-for to test fallback
      delete req.headers['x-forwarded-for'];

      const res = createMockResponse();
      await handler(req, res);

      // Should succeed even with fallback IP
      expect(res._getStatus()).toBe(HTTP_STATUS.CREATED);
      expect(res._getBody()).toHaveProperty('success', true);
    });
  });
});
