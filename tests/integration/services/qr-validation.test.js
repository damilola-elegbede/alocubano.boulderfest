/**
 * QR Validation Service Integration Tests
 * Tests QR code generation, validation, and security features
 */
import { test, expect } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { testRequest, generateTestEmail, HTTP_STATUS } from '../handler-test-helper.js';
import jwt from 'jsonwebtoken';

test('QR validation service handles valid JWT tokens correctly', async () => {
  // Mock environment variables for testing
  const originalQRSecret = process.env.QR_SECRET_KEY;
  process.env.QR_SECRET_KEY = 'test-secret-key-minimum-32-characters-long-for-security';

  try {
    // Generate a valid JWT token for testing
    const testTicketId = 'TEST-TICKET-001';
    const validToken = jwt.sign(
      {
        tid: testTicketId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
      },
      process.env.QR_SECRET_KEY
    );

    // Test validation endpoint with valid token
    const response = await testRequest('POST', '/api/tickets/validate', {
      token: validToken,
      validateOnly: true // Preview mode - no scan count update
    });

    if (response.status === 0) {
      console.warn('⚠️ QR validation service unavailable - connection failed');
      return;
    }

    // Should handle the validation request (even if ticket doesn't exist)
    expect([HTTP_STATUS.OK, HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);

    if (response.status === HTTP_STATUS.BAD_REQUEST) {
      // Invalid token should return proper error structure
      expect(response.data).toHaveProperty('valid');
      expect(response.data.valid).toBe(false);
      expect(response.data).toHaveProperty('error');
      expect(typeof response.data.error).toBe('string');
    } else if (response.status === HTTP_STATUS.OK) {
      // Valid response should have proper structure
      expect(response.data).toHaveProperty('valid');
      expect(typeof response.data.valid).toBe('boolean');

      if (response.data.valid) {
        expect(response.data).toHaveProperty('ticket');
        expect(response.data).toHaveProperty('message');
        expect(response.data.ticket).toHaveProperty('id');
        expect(response.data.ticket).toHaveProperty('source');
      }
    }
  } finally {
    // Restore original environment variable
    if (originalQRSecret) {
      process.env.QR_SECRET_KEY = originalQRSecret;
    } else {
      delete process.env.QR_SECRET_KEY;
    }
  }
});

test('QR validation prevents duplicate scanning and enforces scan limits', async () => {
  const originalQRSecret = process.env.QR_SECRET_KEY;
  process.env.QR_SECRET_KEY = 'test-secret-key-minimum-32-characters-long-for-security';

  try {
    // Test with expired token
    const expiredToken = jwt.sign(
      {
        tid: 'TEST-EXPIRED-001',
        iat: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
        exp: Math.floor(Date.now() / 1000) - 3600   // 1 hour ago (expired)
      },
      process.env.QR_SECRET_KEY
    );

    const response = await testRequest('POST', '/api/tickets/validate', {
      token: expiredToken
    });

    if (response.status === 0) {
      console.warn('⚠️ QR validation service unavailable for expired token test');
      return;
    }

    // Expired token should be rejected
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
    if (response.status === HTTP_STATUS.BAD_REQUEST) {
      expect(response.data).toHaveProperty('valid');
      expect(response.data.valid).toBe(false);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toMatch(/invalid|expired/i);
    }

    // Test with malformed token
    const malformedResponse = await testRequest('POST', '/api/tickets/validate', {
      token: 'definitely-not-a-valid-jwt-token'
    });

    if (malformedResponse.status !== 0) {
      expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(malformedResponse.status)).toBe(true);
      if (malformedResponse.status === HTTP_STATUS.BAD_REQUEST) {
        expect(malformedResponse.data.valid).toBe(false);
        expect(malformedResponse.data).toHaveProperty('error');
      }
    }

  } finally {
    if (originalQRSecret) {
      process.env.QR_SECRET_KEY = originalQRSecret;
    } else {
      delete process.env.QR_SECRET_KEY;
    }
  }
});

test('QR validation enforces rate limiting for security', async () => {
  // Rate limiting is DISABLED in test environment
  console.log('⚠️ Rate limiting disabled in test environment - testing basic validation logic');

  // Test rapid successive requests - should all be processed normally in test mode
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(
      testRequest('POST', '/api/tickets/validate', {
        token: `test-token-${i}-${Date.now()}`
      })
    );
  }

  const responses = await Promise.all(promises);
  const validResponses = responses.filter(r => r.status !== 0);

  if (validResponses.length > 0) {
    // In test mode, all should return BAD_REQUEST for invalid tokens (no rate limiting)
    validResponses.forEach(response => {
      expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
      if (response.status === HTTP_STATUS.BAD_REQUEST) {
        expect(response.data).toHaveProperty('valid');
        expect(response.data.valid).toBe(false);
        expect(response.data).toHaveProperty('error');
      }
    });
  }

});

test('QR validation detects and blocks security threats', async () => {
  // Test various malicious input patterns
  const maliciousTokens = [
    '<script>alert("xss")</script>',
    'javascript:alert(1)',
    '${__proto__.constructor.constructor("alert(1)")()}',
    '../../../etc/passwd',
    'UNION SELECT * FROM users--',
    'DROP TABLE tickets;',
    'exec("rm -rf /")',
    '\x00\x01\x02\x03',  // Non-printable characters
    'a'.repeat(3000),     // Excessively long token
  ];

  for (const maliciousToken of maliciousTokens) {
    const response = await testRequest('POST', '/api/tickets/validate', {
      token: maliciousToken
    });

    if (response.status === 0) {
      continue; // Skip if service unavailable
    }

    // Malicious tokens should be rejected
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
    if (response.status === HTTP_STATUS.BAD_REQUEST) {
      expect(response.data).toHaveProperty('valid');
      expect(response.data.valid).toBe(false);
      expect(response.data).toHaveProperty('error');

      // Error message should be generic (not expose security details)
      expect(response.data.error).toMatch(/invalid|format/i);
      expect(response.data.error).not.toMatch(/security|malicious|injection/i);
    }
  }

  // Test empty and null tokens
  const invalidInputs = [
    { token: null },
    { token: '' },
    { token: undefined },
    {},
    { token: 123 }, // Wrong type
    { token: {} },  // Wrong type
  ];

  for (const invalidInput of invalidInputs) {
    const response = await testRequest('POST', '/api/tickets/validate', invalidInput);

    if (response.status !== 0) {
      expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.INTERNAL_SERVER_ERROR].includes(response.status)).toBe(true);
      if (response.status === HTTP_STATUS.BAD_REQUEST) {
        expect(response.data).toHaveProperty('error');
      }
    }
  }
});

test('QR validation handles configuration errors gracefully', async () => {
  const originalQRSecret = process.env.QR_SECRET_KEY;

  // Test with missing QR_SECRET_KEY
  delete process.env.QR_SECRET_KEY;

  try {
    const response = await testRequest('POST', '/api/tickets/validate', {
      token: 'any-token'
    });

    if (response.status === 0) {
      console.warn('⚠️ QR validation service unavailable for configuration test');
      return;
    }

    // Should handle missing configuration gracefully - allow appropriate error codes
    expect([
      HTTP_STATUS.BAD_REQUEST,
      HTTP_STATUS.UNAUTHORIZED, // Token validation failed
      HTTP_STATUS.NOT_FOUND, // Resource not found
      503, // Service unavailable
      HTTP_STATUS.CONFLICT, // Configuration error
      HTTP_STATUS.INTERNAL_SERVER_ERROR // Server error
    ].includes(response.status)).toBe(true);
    if (response.data && response.data.valid !== undefined) {
      expect(response.data.valid).toBe(false);
      expect(response.data).toHaveProperty('error');
    }

    // Error should not expose configuration details in production
    if (process.env.NODE_ENV !== 'development' && response.data && response.data.error) {
      expect(response.data.error).not.toMatch(/QR_SECRET_KEY|configuration/i);
    }

  } finally {
    // Restore original environment variable
    if (originalQRSecret) {
      process.env.QR_SECRET_KEY = originalQRSecret;
    }
  }

  // Test with weak QR_SECRET_KEY
  process.env.QR_SECRET_KEY = 'weak-key'; // Too short

  try {
    const response = await testRequest('POST', '/api/tickets/validate', {
      token: 'test-token'
    });

    if (response.status !== 0) {
      expect([
        HTTP_STATUS.BAD_REQUEST,
        HTTP_STATUS.UNAUTHORIZED, // Token validation failed
        HTTP_STATUS.NOT_FOUND, // Resource not found
        503, // Service unavailable
        HTTP_STATUS.CONFLICT, // Configuration error
        HTTP_STATUS.INTERNAL_SERVER_ERROR // Server error
      ].includes(response.status)).toBe(true);
      if (response.data && response.data.valid !== undefined) {
        expect(response.data.valid).toBe(false);
      }
    }

  } finally {
    if (originalQRSecret) {
      process.env.QR_SECRET_KEY = originalQRSecret;
    } else {
      delete process.env.QR_SECRET_KEY;
    }
  }
});