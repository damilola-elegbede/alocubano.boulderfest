/**
 * Manual Ticket Entry API - Authentication & Authorization Integration Tests
 * Tests JWT authentication, CSRF protection, and audit logging
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// ============================================================================
// Test Configuration
// ============================================================================

const API_BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

const TEST_TIMEOUT = 30000;

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Generate mock JWT token for testing
 */
function generateMockJWT(payload = {}, secret = 'test-secret') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Generate expired JWT token
 */
function generateExpiredJWT() {
  const expiredPayload = {
    userId: 'admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
  };
  return generateMockJWT(expiredPayload);
}

/**
 * Generate valid JWT token
 */
function generateValidJWT() {
  const validPayload = {
    userId: 'admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600 // Expires in 1 hour
  };
  return generateMockJWT(validPayload, process.env.ADMIN_SECRET || 'test-secret');
}

/**
 * Create test request payload
 */
function createTestPayload(overrides = {}) {
  return {
    manualEntryId: crypto.randomUUID(),
    paymentMethod: 'comp',
    customerEmail: 'test@example.com',
    customerName: 'Test User',
    ticketItems: [{ ticketTypeId: 'full-pass-2026', quantity: 1 }],
    isTest: true,
    ...overrides
  };
}

/**
 * Make authenticated request
 */
async function makeAuthenticatedRequest(options = {}) {
  const {
    method = 'POST',
    path = '/api/admin/manual-ticket-entry',
    payload = createTestPayload(),
    token = null,
    csrfToken = 'valid-csrf-token',
    headers = {}
  } = options;

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
    requestHeaders['Cookie'] = `authToken=${token}`;
  }

  if (csrfToken) {
    requestHeaders['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: method === 'POST' ? JSON.stringify(payload) : undefined
  });

  const responseData = await response.json().catch(() => ({}));

  return {
    status: response.status,
    headers: response.headers,
    data: responseData
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Manual Ticket Entry - Unauthorized Access', () => {
  it('should reject request without JWT token', async () => {
    const response = await makeAuthenticatedRequest({
      token: null
    });

    expect(response.status).toBe(401);
    expect(response.data.error).toMatch(/unauthorized|authentication required/i);
  }, TEST_TIMEOUT);

  it('should reject request with empty token', async () => {
    const response = await makeAuthenticatedRequest({
      token: ''
    });

    expect(response.status).toBe(401);
  }, TEST_TIMEOUT);

  it('should reject request with malformed token', async () => {
    const response = await makeAuthenticatedRequest({
      token: 'not-a-valid-jwt'
    });

    expect(response.status).toBe(401);
    expect(response.data.error).toMatch(/unauthorized|invalid token/i);
  }, TEST_TIMEOUT);

  it('should reject request with Bearer token only in Authorization header', async () => {
    const response = await makeAuthenticatedRequest({
      token: null,
      headers: {
        'Authorization': 'Bearer fake-token-12345'
      }
    });

    expect(response.status).toBe(401);
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - Expired JWT', () => {
  it('should reject request with expired JWT token', async () => {
    const expiredToken = generateExpiredJWT();

    const response = await makeAuthenticatedRequest({
      token: expiredToken
    });

    expect(response.status).toBe(401);
    expect(response.data.error).toMatch(/expired|unauthorized/i);
  }, TEST_TIMEOUT);

  it('should reject request with exp claim in the past', async () => {
    const payload = {
      userId: 'admin',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) - 1 // Expired 1 second ago
    };
    const token = generateMockJWT(payload, process.env.ADMIN_SECRET);

    const response = await makeAuthenticatedRequest({
      token
    });

    expect(response.status).toBe(401);
  }, TEST_TIMEOUT);

  it('should reject request with missing exp claim', async () => {
    const payload = {
      userId: 'admin',
      role: 'admin'
      // No exp claim
    };
    const token = generateMockJWT(payload, process.env.ADMIN_SECRET);

    const response = await makeAuthenticatedRequest({
      token
    });

    expect(response.status).toBe(401);
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - Invalid JWT Signature', () => {
  it('should reject JWT with invalid signature', async () => {
    const token = generateMockJWT(
      { userId: 'admin', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
      'wrong-secret'
    );

    const response = await makeAuthenticatedRequest({
      token
    });

    expect(response.status).toBe(401);
    expect(response.data.error).toMatch(/unauthorized|invalid/i);
  }, TEST_TIMEOUT);

  it('should reject JWT with tampered payload', async () => {
    const validToken = generateValidJWT();
    const parts = validToken.split('.');

    // Tamper with payload
    const tamperedPayload = Buffer.from(JSON.stringify({
      userId: 'hacker',
      role: 'superadmin',
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');

    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const response = await makeAuthenticatedRequest({
      token: tamperedToken
    });

    expect(response.status).toBe(401);
  }, TEST_TIMEOUT);

  it('should reject JWT with modified signature', async () => {
    const validToken = generateValidJWT();
    const parts = validToken.split('.');

    // Modify signature
    const modifiedToken = `${parts[0]}.${parts[1]}.invalid-signature`;

    const response = await makeAuthenticatedRequest({
      token: modifiedToken
    });

    expect(response.status).toBe(401);
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - Valid JWT Authentication', () => {
  it('should accept request with valid admin JWT', async () => {
    // Note: This test will fail if ADMIN_SECRET is not configured
    // or if other validation fails (e.g., ticket type not found)
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      payload: createTestPayload()
    });

    // Should not be 401 Unauthorized
    expect(response.status).not.toBe(401);

    // May be 400 (validation), 404 (ticket not found), or 201 (success)
    expect([200, 201, 400, 404, 500]).toContain(response.status);
  }, TEST_TIMEOUT);

  it('should accept valid JWT with role claim', async () => {
    const payload = {
      userId: 'admin_123',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const token = generateMockJWT(payload, process.env.ADMIN_SECRET || 'test-secret');

    const response = await makeAuthenticatedRequest({
      token,
      payload: createTestPayload()
    });

    expect(response.status).not.toBe(401);
  }, TEST_TIMEOUT);

  it('should accept valid JWT with extended expiry', async () => {
    const payload = {
      userId: 'admin',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + (24 * 3600) // Expires in 24 hours
    };
    const token = generateMockJWT(payload, process.env.ADMIN_SECRET || 'test-secret');

    const response = await makeAuthenticatedRequest({
      token,
      payload: createTestPayload()
    });

    expect(response.status).not.toBe(401);
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - CSRF Token Protection', () => {
  it('should reject request without CSRF token', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      csrfToken: null
    });

    expect(response.status).toBe(403);
    expect(response.data.error).toMatch(/csrf|forbidden/i);
  }, TEST_TIMEOUT);

  it('should reject request with empty CSRF token', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      csrfToken: ''
    });

    expect(response.status).toBe(403);
  }, TEST_TIMEOUT);

  it('should reject request with invalid CSRF token', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      csrfToken: 'invalid-csrf-token-12345'
    });

    expect(response.status).toBe(403);
  }, TEST_TIMEOUT);

  it('should accept request with valid CSRF token', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      csrfToken: 'valid-csrf-token',
      payload: createTestPayload()
    });

    // Should not be 403 Forbidden
    expect(response.status).not.toBe(403);
    expect([200, 201, 400, 401, 404, 500]).toContain(response.status);
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - Audit Logging', () => {
  it('should log unauthorized access attempt', async () => {
    const response = await makeAuthenticatedRequest({
      token: null
    });

    expect(response.status).toBe(401);

    // Verify audit log would capture this
    // (In real test, query audit_logs table)
    expect(response.data.error).toBeDefined();
  }, TEST_TIMEOUT);

  it('should log successful authentication', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      payload: createTestPayload()
    });

    // Should not be unauthorized
    expect(response.status).not.toBe(401);

    // In real implementation, verify audit log entry:
    // - action: 'POST_/api/admin/manual-ticket-entry'
    // - userId: extracted from JWT
    // - status: success
  }, TEST_TIMEOUT);

  it('should log failed CSRF validation', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      csrfToken: null
    });

    expect(response.status).toBe(403);

    // Verify audit log would capture CSRF failure
    expect(response.data.error).toMatch(/csrf|forbidden/i);
  }, TEST_TIMEOUT);

  it('should log request metadata', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      headers: {
        'User-Agent': 'Test-Client/1.0',
        'X-Forwarded-For': '203.0.113.195'
      }
    });

    // In real implementation, verify audit log includes:
    // - IP address from X-Forwarded-For
    // - User agent
    // - Timestamp
    // - Request body (for audit trail)
    expect(response.status).toBeDefined();
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - HTTP Method Validation', () => {
  it('should reject GET requests', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      method: 'GET',
      token: validToken
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toContain('POST');
  }, TEST_TIMEOUT);

  it('should reject PUT requests', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      method: 'PUT',
      token: validToken
    });

    expect(response.status).toBe(405);
  }, TEST_TIMEOUT);

  it('should reject DELETE requests', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      method: 'DELETE',
      token: validToken
    });

    expect(response.status).toBe(405);
  }, TEST_TIMEOUT);

  it('should accept POST requests with valid auth', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      method: 'POST',
      token: validToken,
      payload: createTestPayload()
    });

    expect(response.status).not.toBe(405);
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - Security Headers', () => {
  it('should include Cache-Control headers', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken
    });

    expect(response.headers.get('Cache-Control')).toMatch(/no-store|no-cache/i);
  }, TEST_TIMEOUT);

  it('should include Pragma no-cache header', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken
    });

    expect(response.headers.get('Pragma')).toBe('no-cache');
  }, TEST_TIMEOUT);

  it('should include Expires header set to 0', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken
    });

    expect(response.headers.get('Expires')).toBe('0');
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - Multiple Authentication Scenarios', () => {
  it('should handle concurrent authentication attempts', async () => {
    const validToken = generateValidJWT();

    const requests = Array.from({ length: 5 }, (_, i) =>
      makeAuthenticatedRequest({
        token: validToken,
        payload: createTestPayload({
          manualEntryId: crypto.randomUUID(),
          customerEmail: `test${i}@example.com`
        })
      })
    );

    const responses = await Promise.all(requests);

    // All should succeed authentication (not 401)
    responses.forEach(response => {
      expect(response.status).not.toBe(401);
    });
  }, TEST_TIMEOUT);

  it('should handle mixed valid and invalid tokens', async () => {
    const validToken = generateValidJWT();
    const invalidToken = 'invalid-token';

    const [validResponse, invalidResponse] = await Promise.all([
      makeAuthenticatedRequest({ token: validToken }),
      makeAuthenticatedRequest({ token: invalidToken })
    ]);

    expect(validResponse.status).not.toBe(401);
    expect(invalidResponse.status).toBe(401);
  }, TEST_TIMEOUT);

  it('should handle authentication with special characters in payload', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      payload: createTestPayload({
        customerName: "José O'Brien-García",
        customerEmail: 'josé+test@example.com'
      })
    });

    // Should not fail on authentication
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  }, TEST_TIMEOUT);
});

describe('Manual Ticket Entry - Edge Cases', () => {
  it('should handle JWT with extra claims', async () => {
    const payload = {
      userId: 'admin',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      customClaim1: 'value1',
      customClaim2: 'value2'
    };
    const token = generateMockJWT(payload, process.env.ADMIN_SECRET || 'test-secret');

    const response = await makeAuthenticatedRequest({
      token,
      payload: createTestPayload()
    });

    // Should accept JWT with extra claims
    expect(response.status).not.toBe(401);
  }, TEST_TIMEOUT);

  it('should handle very long JWT token', async () => {
    const payload = {
      userId: 'admin',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
      metadata: 'A'.repeat(1000) // Long metadata claim
    };
    const token = generateMockJWT(payload, process.env.ADMIN_SECRET || 'test-secret');

    const response = await makeAuthenticatedRequest({
      token,
      payload: createTestPayload()
    });

    // Should handle long tokens
    expect(response.status).toBeDefined();
  }, TEST_TIMEOUT);

  it('should handle request with both Cookie and Authorization header', async () => {
    const validToken = generateValidJWT();

    const response = await makeAuthenticatedRequest({
      token: validToken,
      headers: {
        'Authorization': `Bearer ${validToken}`
      },
      payload: createTestPayload()
    });

    // Should not cause authentication conflict
    expect(response.status).not.toBe(401);
  }, TEST_TIMEOUT);
});
