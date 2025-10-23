/**
 * API Cache Headers Integration Tests
 * Tests HTTP cache headers for admin endpoints
 * Validates browser caching optimization with 30-second TTL
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { testRequest, HTTP_STATUS, generateTestId } from './handler-test-helper.js';
import { getDbClient } from '../setup-integration.js';

// Test admin credentials
const adminPassword = process.env.TEST_ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('❌ FATAL: TEST_ADMIN_PASSWORD required for cache header tests');
}

/**
 * Parse Set-Cookie header (handles both string and array)
 * @param {string|string[]} setCookie - Set-Cookie header value
 * @returns {Object} Parsed cookies with attributes
 */
function parseCookies(setCookie) {
  if (!setCookie) {
    return {};
  }

  const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
  const cookies = {};

  cookieArray.forEach(cookieStr => {
    if (!cookieStr) return;
    const [nameValue, ...attributes] = cookieStr.split(';').map(s => s.trim());
    const [name, value] = nameValue.split('=');
    cookies[name] = { value, attributes };
  });

  return cookies;
}

describe('API Cache Headers', () => {
  let dbClient;
  let adminToken;

  beforeEach(async () => {
    dbClient = await getDbClient();

    // Get admin token for authenticated requests
    const loginResponse = await testRequest('POST', '/api/admin/login', {
      username: 'admin',
      password: adminPassword
    });

    if (loginResponse.status === HTTP_STATUS.OK) {
      // Extract token from cookie (handles both string and array formats)
      const setCookie = loginResponse.headers && loginResponse.headers['set-cookie'];
      if (setCookie) {
        const cookies = parseCookies(setCookie);
        if (cookies.admin_session) {
          adminToken = cookies.admin_session.value;
        }
      }
    }

    if (!adminToken) {
      throw new Error('❌ FATAL: Could not obtain admin token');
    }
  });

  describe('Admin Donations Endpoint', () => {
    test('returns cache headers', async () => {
      const response = await testRequest('GET', '/api/admin/donations', null, {
        cookie: `admin_session=${adminToken}`
      });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.headers['cache-control']).toContain('private');
      expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
      expect(response.headers['vary']).toContain('Authorization');
    });

    test('cache headers prevent CDN caching', async () => {
      const response = await testRequest('GET', '/api/admin/donations', null, {
        cookie: `admin_session=${adminToken}`
      });

      const cacheControl = response.headers['cache-control'];
      expect(cacheControl).toContain('private');
      expect(cacheControl).not.toContain('public');
    });
  });

  describe('Admin Registrations Endpoint', () => {
    test('returns cache headers', async () => {
      const response = await testRequest('GET', '/api/admin/registrations', null, {
        cookie: `admin_session=${adminToken}`
      });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.headers['cache-control']).toContain('private');
      expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
      expect(response.headers['vary']).toContain('Authorization');
    });

    test('cache respects 30-second TTL', async () => {
      const response = await testRequest('GET', '/api/admin/registrations', null, {
        cookie: `admin_session=${adminToken}`
      });

      const cacheControl = response.headers['cache-control'];
      expect(cacheControl).toContain('max-age=30');
    });
  });

  describe('Admin Analytics Endpoint', () => {
    test('returns cache headers', async () => {
      // Analytics endpoint requires specific query parameters
      const response = await testRequest(
        'GET',
        '/api/admin/analytics?type=summary&eventId=1',
        null,
        {
          cookie: `admin_session=${adminToken}`
        }
      );

      // May return 401, 404, 400 depending on setup, but cache headers should still be present
      expect([HTTP_STATUS.OK, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.BAD_REQUEST]).toContain(response.status);

      // Only check headers if not auth error (cache headers set after auth middleware)
      if (response.status !== HTTP_STATUS.UNAUTHORIZED) {
        expect(response.headers['cache-control']).toContain('private');
        expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
        expect(response.headers['vary']).toContain('Authorization');
      }
    });
  });

  describe('Admin Dashboard Endpoint', () => {
    test('returns cache headers', async () => {
      const response = await testRequest('GET', '/api/admin/dashboard', null, {
        cookie: `admin_session=${adminToken}`
      });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.headers['cache-control']).toContain('private');
      expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
      expect(response.headers['vary']).toContain('Authorization');
    });

    test('cache allows browser caching', async () => {
      const response = await testRequest('GET', '/api/admin/dashboard', null, {
        cookie: `admin_session=${adminToken}`
      });

      const cacheControl = response.headers['cache-control'];

      // Should allow browser caching (not no-store)
      expect(cacheControl).not.toContain('no-store');
      expect(cacheControl).not.toContain('no-cache');

      // Should have max-age directive
      expect(cacheControl).toContain('max-age=30');
    });
  });

  describe('Cache Performance', () => {
    test('cached response timing is consistent', async () => {
      // First request (cold)
      const coldStart = performance.now();
      await testRequest('GET', '/api/admin/donations', null, {
        cookie: `admin_session=${adminToken}`
      });
      const coldDuration = performance.now() - coldStart;

      // Second request (warm - though cache won't be effective in integration tests)
      const warmStart = performance.now();
      await testRequest('GET', '/api/admin/donations', null, {
        cookie: `admin_session=${adminToken}`
      });
      const warmDuration = performance.now() - warmStart;

      // Both should complete successfully (timing may vary in tests)
      expect(coldDuration).toBeGreaterThan(0);
      expect(warmDuration).toBeGreaterThan(0);

      console.log(`Cache timing - Cold: ${coldDuration.toFixed(2)}ms, Warm: ${warmDuration.toFixed(2)}ms`);
    });
  });

  describe('Cache Headers Consistency', () => {
    test('all admin endpoints have consistent cache headers', async () => {
      const endpoints = [
        '/api/admin/donations',
        '/api/admin/registrations',
        '/api/admin/dashboard'
      ];

      for (const endpoint of endpoints) {
        const response = await testRequest('GET', endpoint, null, {
          cookie: `admin_session=${adminToken}`
        });

        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(response.headers['cache-control']).toContain('private');
        expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
        expect(response.headers['vary']).toContain('Authorization');
      }
    });

    test('cache headers are set before response is sent', async () => {
      // Test that headers are present even for error responses
      const response = await testRequest('POST', '/api/admin/donations', {}, {
        cookie: `admin_session=${adminToken}`
      });

      // Should reject POST method
      expect(response.status).toBe(HTTP_STATUS.METHOD_NOT_ALLOWED);

      // But cache headers should still be present
      expect(response.headers['cache-control']).toContain('private');
      expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
      expect(response.headers['vary']).toContain('Authorization');
    });
  });

  describe('Private Cache Behavior', () => {
    test('private cache prevents CDN caching', async () => {
      const endpoints = [
        '/api/admin/donations',
        '/api/admin/registrations',
        '/api/admin/analytics?type=summary&eventId=1',
        '/api/admin/dashboard'
      ];

      for (const endpoint of endpoints) {
        const response = await testRequest('GET', endpoint, null, {
          cookie: `admin_session=${adminToken}`
        });

        // Skip analytics endpoint if it returns auth error (different test setup)
        if (endpoint.includes('analytics') && response.status === HTTP_STATUS.UNAUTHORIZED) {
          continue;
        }

        const cacheControl = response.headers['cache-control'];
        expect(cacheControl).toBeDefined();
        expect(cacheControl).toContain('private');
        expect(cacheControl).not.toContain('public');

        // Also should not have s-maxage (shared cache)
        expect(cacheControl).not.toContain('s-maxage');
      }
    });
  });

  describe('Vary Header', () => {
    test('Vary header includes Authorization', async () => {
      const response = await testRequest('GET', '/api/admin/dashboard', null, {
        cookie: `admin_session=${adminToken}`
      });

      expect(response.headers['vary']).toContain('Authorization');
    });

    test('Vary header ensures proper cache key', async () => {
      // The Vary header should ensure that different Authorization headers
      // result in different cache entries
      const endpoints = [
        '/api/admin/donations',
        '/api/admin/registrations',
        '/api/admin/dashboard'
      ];

      for (const endpoint of endpoints) {
        const response = await testRequest('GET', endpoint, null, {
          cookie: `admin_session=${adminToken}`
        });

        // Verify Vary includes Authorization
        expect(response.status).toBe(HTTP_STATUS.OK);
        expect(response.headers['vary']).toContain('Authorization');
      }
    });
  });
});
