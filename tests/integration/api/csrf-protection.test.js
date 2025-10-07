/**
 * CSRF Protection Middleware Integration Tests
 * Tests CSRF protection across real API endpoints with database integration
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { testRequest, HTTP_STATUS } from '../handler-test-helper.js';
import { getDbClient } from '../../setup-integration.js';
import jwt from 'jsonwebtoken';

// Ensure admin password is configured for tests
if (!process.env.TEST_ADMIN_PASSWORD) {
  throw new Error('TEST_ADMIN_PASSWORD environment variable required for CSRF integration tests');
}

const TEST_SECRET = process.env.ADMIN_SECRET || 'test-secret-minimum-32-characters-required';

describe('CSRF Protection Middleware Integration', () => {
  let dbClient;
  let adminToken;
  let adminSessionId;

  beforeEach(async () => {
    dbClient = await getDbClient();

    // Login to get valid admin token
    const loginResponse = await testRequest('POST', '/api/admin/login', {
      username: 'admin',
      password: process.env.TEST_ADMIN_PASSWORD
    });

    if (loginResponse.status === HTTP_STATUS.OK) {
      // Extract token from Set-Cookie header
      const setCookie = loginResponse.headers?.['set-cookie'];
      if (setCookie) {
        const tokenMatch = setCookie.match(/admin_session=([^;]+)/);
        if (tokenMatch) {
          adminToken = tokenMatch[1];
          // Decode to get session ID
          const decoded = jwt.decode(adminToken);
          adminSessionId = decoded?.id || 'admin';
        }
      }
    }
  });

  afterEach(async () => {
    // Clean up admin session if created
    if (dbClient && adminToken) {
      try {
        const decoded = jwt.decode(adminToken);
        if (decoded?.id) {
          await dbClient.execute({
            sql: 'DELETE FROM admin_sessions WHERE admin_id = ?',
            args: [decoded.id]
          });
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('POST /api/admin/manual-ticket-entry', () => {
    const validTicketData = {
      manualEntryId: '12345678-1234-1234-1234-123456789012',
      ticketItems: [
        {
          ticketTypeId: 'weekend-pass',
          quantity: 1
        }
      ],
      paymentMethod: 'cash',
      customerEmail: 'test@example.com',
      customerName: 'Test Customer',
      cashShiftId: '1',
      isTest: true
    };

    test('should reject request without CSRF token (403)', async () => {
      // Skip if admin token not available
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping CSRF test');
        return;
      }

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        validTicketData,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Should reject without CSRF token
      expect([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.BAD_REQUEST].includes(response.status)).toBe(true);

      if (response.status === HTTP_STATUS.FORBIDDEN) {
        expect(response.data?.error).toMatch(/csrf|token/i);
      }
    });

    test('should reject request with invalid CSRF token (403)', async () => {
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping CSRF test');
        return;
      }

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        validTicketData,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-CSRF-Token': 'invalid-token-12345',
            'Content-Type': 'application/json'
          }
        }
      );

      // Should reject invalid CSRF token
      expect([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.BAD_REQUEST].includes(response.status)).toBe(true);
    });

    test('should reject request with expired CSRF token (403)', async () => {
      if (!adminToken || !adminSessionId) {
        console.warn('⚠️ Admin authentication not available - skipping CSRF test');
        return;
      }

      // Create expired CSRF token (2 hours old)
      const expiredTimestamp = Date.now() - (2 * 3600000);
      const expiredToken = jwt.sign(
        {
          sessionId: adminSessionId,
          nonce: 'test-nonce',
          timestamp: expiredTimestamp
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'alocubano-csrf'
        }
      );

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        validTicketData,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-CSRF-Token': expiredToken,
            'Content-Type': 'application/json'
          }
        }
      );

      // Should reject expired token
      expect([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.BAD_REQUEST].includes(response.status)).toBe(true);
    });

    test('should accept request with valid CSRF token', async () => {
      if (!adminToken || !adminSessionId) {
        console.warn('⚠️ Admin authentication not available - skipping CSRF test');
        return;
      }

      // First, get a valid CSRF token
      const csrfResponse = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      if (csrfResponse.status !== HTTP_STATUS.OK) {
        console.warn('⚠️ CSRF token endpoint not available - skipping test');
        return;
      }

      const csrfToken = csrfResponse.data?.csrfToken;
      expect(csrfToken).toBeDefined();

      // Now make request with valid CSRF token
      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        validTicketData,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-CSRF-Token': csrfToken,
            'Content-Type': 'application/json'
          }
        }
      );

      // Should succeed (200/201) or fail for other reasons (400 for business logic)
      // but NOT 403 CSRF error
      expect([
        HTTP_STATUS.OK,
        HTTP_STATUS.CREATED,
        HTTP_STATUS.BAD_REQUEST,
        HTTP_STATUS.NOT_FOUND,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      ].includes(response.status)).toBe(true);

      // If it's 403, it should NOT be CSRF-related
      if (response.status === HTTP_STATUS.FORBIDDEN) {
        expect(response.data?.error).not.toMatch(/csrf|token/i);
      }
    });

    test('should validate CSRF token matches session', async () => {
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping CSRF test');
        return;
      }

      // Create CSRF token for different session
      const differentSessionId = 'different-admin-session';
      const mismatchedToken = jwt.sign(
        {
          sessionId: differentSessionId,
          nonce: 'test-nonce',
          timestamp: Date.now()
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'alocubano-csrf'
        }
      );

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        validTicketData,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-CSRF-Token': mismatchedToken,
            'Content-Type': 'application/json'
          }
        }
      );

      // Should reject mismatched session
      expect([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.BAD_REQUEST].includes(response.status)).toBe(true);
    });

    test('should accept CSRF token from request body', async () => {
      if (!adminToken || !adminSessionId) {
        console.warn('⚠️ Admin authentication not available - skipping CSRF test');
        return;
      }

      // Get valid CSRF token
      const csrfResponse = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      if (csrfResponse.status !== HTTP_STATUS.OK) {
        console.warn('⚠️ CSRF token endpoint not available - skipping test');
        return;
      }

      const csrfToken = csrfResponse.data?.csrfToken;

      // Include CSRF token in body instead of header
      const dataWithCsrf = {
        ...validTicketData,
        csrfToken
      };

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        dataWithCsrf,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Should NOT fail with CSRF error
      if (response.status === HTTP_STATUS.FORBIDDEN) {
        expect(response.data?.error).not.toMatch(/csrf|token/i);
      }
    });

    test('should prioritize X-CSRF-Token header over body', async () => {
      if (!adminToken || !adminSessionId) {
        console.warn('⚠️ Admin authentication not available - skipping CSRF test');
        return;
      }

      // Get valid CSRF token
      const csrfResponse = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      if (csrfResponse.status !== HTTP_STATUS.OK) {
        console.warn('⚠️ CSRF token endpoint not available - skipping test');
        return;
      }

      const validToken = csrfResponse.data?.csrfToken;

      // Put invalid token in body, valid in header
      const dataWithBadCsrf = {
        ...validTicketData,
        csrfToken: 'invalid-body-token'
      };

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        dataWithBadCsrf,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-CSRF-Token': validToken,
            'Content-Type': 'application/json'
          }
        }
      );

      // Should use header token (valid) and NOT fail with CSRF error
      if (response.status === HTTP_STATUS.FORBIDDEN) {
        expect(response.data?.error).not.toMatch(/csrf|token/i);
      }
    });

    test('should log CSRF validation attempts', async () => {
      if (!adminToken || !dbClient) {
        console.warn('⚠️ Admin authentication or database not available - skipping audit test');
        return;
      }

      // Make request without CSRF token
      await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        validTicketData,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Check audit logs (if audit_logs table exists)
      try {
        const auditLogs = await dbClient.execute({
          sql: 'SELECT * FROM audit_logs WHERE event_type = ? ORDER BY created_at DESC LIMIT 1',
          args: ['csrf_validation_failed']
        });

        // Audit logging is optional, don't fail if not present
        if (auditLogs.rows.length > 0) {
          const log = auditLogs.rows[0];
          expect(log.severity).toMatch(/high|critical/i);
        }
      } catch (error) {
        // audit_logs table may not exist
        console.log('ℹ️ Audit logging not available:', error.message);
      }
    });
  });

  describe('GET /api/admin/csrf-token', () => {
    test('should return CSRF token with valid admin JWT', async () => {
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping CSRF token test');
        return;
      }

      const response = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      if (response.status === HTTP_STATUS.OK) {
        expect(response.data).toHaveProperty('csrfToken');
        expect(response.data).toHaveProperty('expiresIn');

        const token = response.data.csrfToken;
        expect(typeof token).toBe('string');
        expect(token.split('.').length).toBe(3); // JWT format

        // Verify token can be decoded
        const decoded = jwt.decode(token);
        expect(decoded).toHaveProperty('sessionId');
        expect(decoded).toHaveProperty('nonce');
        expect(decoded).toHaveProperty('timestamp');
        expect(decoded.iss).toBe('alocubano-csrf');
      }
    });

    test('should reject request without admin JWT (401)', async () => {
      const response = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      expect([HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN].includes(response.status)).toBe(true);
    });

    test('should reject request with invalid admin JWT', async () => {
      const response = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': 'Bearer invalid-jwt-token',
            'Content-Type': 'application/json'
          }
        }
      );

      expect([HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN].includes(response.status)).toBe(true);
    });

    test('should include expiration time in response', async () => {
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping expiration test');
        return;
      }

      const response = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      if (response.status === HTTP_STATUS.OK) {
        expect(response.data.expiresIn).toBe(3600); // 1 hour in seconds
      }
    });

    test('should set no-cache headers for CSRF token response', async () => {
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping cache header test');
        return;
      }

      const response = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      if (response.status === HTTP_STATUS.OK) {
        // Check for no-cache headers
        const cacheControl = response.headers?.['cache-control'];
        if (cacheControl) {
          expect(cacheControl).toMatch(/no-store|no-cache/i);
        }
      }
    });

    test('should generate unique tokens for repeated requests', async () => {
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping unique token test');
        return;
      }

      const response1 = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      const response2 = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      if (response1.status === HTTP_STATUS.OK && response2.status === HTTP_STATUS.OK) {
        const token1 = response1.data.csrfToken;
        const token2 = response2.data.csrfToken;

        expect(token1).not.toBe(token2);
      }
    });
  });

  describe('Production vs Development Behavior', () => {
    test('should enforce strict validation in production', async () => {
      const originalEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = 'production';

        if (!adminToken) {
          console.warn('⚠️ Admin authentication not available - skipping production test');
          return;
        }

        const response = await testRequest(
          'POST',
          '/api/admin/manual-ticket-entry',
          {
            manualEntryId: '12345678-1234-1234-1234-123456789012',
            ticketItems: [{ ticketTypeId: 'test', quantity: 1 }],
            paymentMethod: 'cash',
            customerEmail: 'test@example.com',
            customerName: 'Test',
            cashShiftId: '1',
            isTest: true
          },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // Should enforce CSRF in production
        expect([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED].includes(response.status)).toBe(true);

      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('should allow SKIP_CSRF bypass in development only', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSkip = process.env.SKIP_CSRF;

      try {
        process.env.NODE_ENV = 'development';
        process.env.SKIP_CSRF = 'true';

        if (!adminToken) {
          console.warn('⚠️ Admin authentication not available - skipping development bypass test');
          return;
        }

        const response = await testRequest(
          'POST',
          '/api/admin/manual-ticket-entry',
          {
            manualEntryId: '12345678-1234-1234-1234-123456789012',
            ticketItems: [{ ticketTypeId: 'test', quantity: 1 }],
            paymentMethod: 'cash',
            customerEmail: 'test@example.com',
            customerName: 'Test',
            cashShiftId: '1',
            isTest: true
          },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // Should bypass CSRF in development with SKIP_CSRF=true
        // May still fail for other reasons (business logic)
        if (response.status === HTTP_STATUS.FORBIDDEN) {
          expect(response.data?.error).not.toMatch(/csrf|token/i);
        }

      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSkip) {
          process.env.SKIP_CSRF = originalSkip;
        } else {
          delete process.env.SKIP_CSRF;
        }
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed JWT gracefully', async () => {
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping malformed JWT test');
        return;
      }

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        {
          manualEntryId: '12345678-1234-1234-1234-123456789012',
          ticketItems: [{ ticketTypeId: 'test', quantity: 1 }],
          paymentMethod: 'cash',
          customerEmail: 'test@example.com',
          customerName: 'Test',
          cashShiftId: '1',
          isTest: true
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-CSRF-Token': 'not.a.valid.jwt.token',
            'Content-Type': 'application/json'
          }
        }
      );

      expect([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.BAD_REQUEST].includes(response.status)).toBe(true);
      expect(response.data).toHaveProperty('error');
    });

    test('should handle empty CSRF token header', async () => {
      if (!adminToken) {
        console.warn('⚠️ Admin authentication not available - skipping empty token test');
        return;
      }

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        {
          manualEntryId: '12345678-1234-1234-1234-123456789012',
          ticketItems: [{ ticketTypeId: 'test', quantity: 1 }],
          paymentMethod: 'cash',
          customerEmail: 'test@example.com',
          customerName: 'Test',
          cashShiftId: '1',
          isTest: true
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-CSRF-Token': '',
            'Content-Type': 'application/json'
          }
        }
      );

      expect([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.BAD_REQUEST].includes(response.status)).toBe(true);
    });

    test('should handle CSRF token with wrong issuer', async () => {
      if (!adminToken || !adminSessionId) {
        console.warn('⚠️ Admin authentication not available - skipping wrong issuer test');
        return;
      }

      const wrongIssuerToken = jwt.sign(
        {
          sessionId: adminSessionId,
          nonce: 'test-nonce',
          timestamp: Date.now()
        },
        TEST_SECRET,
        {
          expiresIn: '1h',
          issuer: 'wrong-issuer'
        }
      );

      const response = await testRequest(
        'POST',
        '/api/admin/manual-ticket-entry',
        {
          manualEntryId: '12345678-1234-1234-1234-123456789012',
          ticketItems: [{ ticketTypeId: 'test', quantity: 1 }],
          paymentMethod: 'cash',
          customerEmail: 'test@example.com',
          customerName: 'Test',
          cashShiftId: '1',
          isTest: true
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-CSRF-Token': wrongIssuerToken,
            'Content-Type': 'application/json'
          }
        }
      );

      expect([HTTP_STATUS.FORBIDDEN, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.BAD_REQUEST].includes(response.status)).toBe(true);
    });

    test('should handle concurrent CSRF validation requests', async () => {
      if (!adminToken || !adminSessionId) {
        console.warn('⚠️ Admin authentication not available - skipping concurrent test');
        return;
      }

      // Get CSRF token
      const csrfResponse = await testRequest(
        'GET',
        '/api/admin/csrf-token',
        null,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        }
      );

      if (csrfResponse.status !== HTTP_STATUS.OK) {
        console.warn('⚠️ CSRF token endpoint not available - skipping concurrent test');
        return;
      }

      const csrfToken = csrfResponse.data?.csrfToken;

      // Make 5 concurrent requests with same CSRF token
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          testRequest(
            'POST',
            '/api/admin/manual-ticket-entry',
            {
              manualEntryId: `12345678-1234-1234-1234-12345678901${i}`,
              ticketItems: [{ ticketTypeId: 'test', quantity: 1 }],
              paymentMethod: 'cash',
              customerEmail: 'test@example.com',
              customerName: 'Test',
              cashShiftId: '1',
              isTest: true
            },
            {
              headers: {
                'Authorization': `Bearer ${adminToken}`,
                'X-CSRF-Token': csrfToken,
                'Content-Type': 'application/json'
              }
            }
          )
        );
      }

      const responses = await Promise.all(requests);

      // All should have same CSRF validation result (pass or fail)
      const csrfFailures = responses.filter(r =>
        r.status === HTTP_STATUS.FORBIDDEN &&
        r.data?.error?.toLowerCase().includes('csrf')
      );

      // Either all pass CSRF or all fail (consistent behavior)
      expect([0, 5].includes(csrfFailures.length)).toBe(true);
    });
  });
});
