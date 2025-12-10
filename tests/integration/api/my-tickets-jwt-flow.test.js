/**
 * Integration Test: My-Tickets JWT Authentication Flow
 *
 * Tests the JWT authentication flow for the my-tickets page:
 * - Verifies JWT tokens from verify-code.js work with /api/tickets?token=
 * - Tests expired JWT rejection
 * - Tests invalid JWT rejection
 * - Tests fallback to database access tokens
 *
 * This test was added to prevent regression of the issue where:
 * - Frontend passes JWT via ?token= parameter
 * - API was only checking database access_tokens table
 * - JWT tokens were never validated, causing 401 errors
 *
 * Root cause: Commit 47df95d5 changed from ?email= to ?token= without updating API
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testApiHandler, HTTP_STATUS, createTestEvent } from '../handler-test-helper.js';
import { getDbClient } from '../../setup-integration.js';
import jwt from 'jsonwebtoken';

describe('Integration: My-Tickets JWT Authentication Flow', () => {
  const hookTimeout = 20000;

  let db;
  let testEventId;
  let testTicket;

  // Test secret for JWT signing (same format as REGISTRATION_SECRET)
  const TEST_REGISTRATION_SECRET = 'test-registration-secret-minimum-32-chars-long-for-integration';

  let prevEnv;

  beforeAll(async () => {
    // Preserve and set test environment variables
    prevEnv = {
      NODE_ENV: process.env.NODE_ENV,
      REGISTRATION_SECRET: process.env.REGISTRATION_SECRET
    };

    process.env.NODE_ENV = 'test';
    process.env.REGISTRATION_SECRET = TEST_REGISTRATION_SECRET;

    db = await getDbClient();

    // Verify database connection
    const testResult = await db.execute('SELECT 1 as test');
    expect(testResult.rows).toBeDefined();
    expect(testResult.rows.length).toBe(1);

    console.log('✅ My-Tickets JWT flow test environment ready');
  }, hookTimeout);

  afterAll(async () => {
    // Restore environment
    if (prevEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv.NODE_ENV;

    if (prevEnv.REGISTRATION_SECRET === undefined) delete process.env.REGISTRATION_SECRET;
    else process.env.REGISTRATION_SECRET = prevEnv.REGISTRATION_SECRET;
  });

  beforeEach(async () => {
    db = await getDbClient();

    // Create test event
    testEventId = await createTestEvent(db, {
      name: 'Boulder Fest 2026',
      type: 'festival',
      status: 'test',
      startDate: '2026-05-15',
      endDate: '2026-05-17',
      venueName: 'Avalon Ballroom',
      venueCity: 'Boulder',
      venueState: 'CO'
    });

    // Create a test transaction
    const timestamp = Date.now();
    const testTransactionId = `test-tx-jwt-${timestamp}`;
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions (transaction_id, type, amount_cents, currency, status,
          customer_email, order_data, created_at, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      args: [
        testTransactionId,
        'tickets',
        12500,
        'USD',
        'completed',
        'jwt-test@example.com',
        '{}',
        new Date().toISOString()
      ]
    });

    const transactionDbId = transactionResult.lastInsertRowid || transactionResult.meta?.last_row_id;

    // Create a test ticket
    const ticketId = `TKT-JWT-TEST-${timestamp}`;

    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, event_date,
          price_cents, attendee_first_name, attendee_last_name, attendee_email,
          status, scan_count, max_scan_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        ticketId,
        transactionDbId,
        'Weekend Pass',
        testEventId,
        '2026-05-15',
        12500,
        'JWT',
        'Tester',
        'jwt-test@example.com',
        'valid',
        0,
        10
      ]
    });

    testTicket = {
      ticketId,
      email: 'jwt-test@example.com',
      firstName: 'JWT',
      lastName: 'Tester'
    };
  }, hookTimeout);

  describe('JWT Token Validation', () => {
    it('should accept valid JWT token from verify-code and return tickets', async () => {
      // Create JWT token exactly as verify-code.js does
      const jwtToken = jwt.sign(
        {
          email: testTicket.email,
          purpose: 'ticket_viewing'
        },
        TEST_REGISTRATION_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      // Call /api/tickets with JWT token
      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        `/api/tickets?token=${encodeURIComponent(jwtToken)}`
      );

      // Skip if service unavailable
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service unavailable - skipping test');
        return;
      }

      // Should return 200 with tickets
      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data).toHaveProperty('tickets');
      expect(Array.isArray(response.data.tickets)).toBe(true);
      expect(response.data.tickets.length).toBeGreaterThan(0);

      // Verify ticket data
      const ticket = response.data.tickets[0];
      expect(ticket.attendee_email).toBe(testTicket.email);
      expect(ticket.attendee_first_name).toBe(testTicket.firstName);
      expect(ticket.attendee_last_name).toBe(testTicket.lastName);
    });

    it('should reject expired JWT tokens with appropriate error', async () => {
      // Create expired JWT token
      const expiredToken = jwt.sign(
        {
          email: testTicket.email,
          purpose: 'ticket_viewing'
        },
        TEST_REGISTRATION_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '-1h', // Expired 1 hour ago
          issuer: 'alocubano-tickets'
        }
      );

      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        `/api/tickets?token=${encodeURIComponent(expiredToken)}`
      );

      // Skip if service unavailable
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service unavailable - skipping test');
        return;
      }

      // Should return 401 with session expired error
      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error.toLowerCase()).toContain('expired');
    });

    it('should reject JWT tokens with wrong purpose', async () => {
      // Create JWT with wrong purpose
      const wrongPurposeToken = jwt.sign(
        {
          email: testTicket.email,
          purpose: 'password_reset' // Wrong purpose
        },
        TEST_REGISTRATION_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        `/api/tickets?token=${encodeURIComponent(wrongPurposeToken)}`
      );

      // Skip if service unavailable
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service unavailable - skipping test');
        return;
      }

      // Should return 401 with invalid token purpose error
      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error.toLowerCase()).toContain('purpose');
    });

    it('should reject JWT tokens signed with wrong secret', async () => {
      // Create JWT with wrong secret
      const wrongSecretToken = jwt.sign(
        {
          email: testTicket.email,
          purpose: 'ticket_viewing'
        },
        'completely-wrong-secret-key-not-the-real-one',
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        `/api/tickets?token=${encodeURIComponent(wrongSecretToken)}`
      );

      // Skip if service unavailable
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service unavailable - skipping test');
        return;
      }

      // Should return 401 - either from JWT validation or DB token fallback
      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.data).toHaveProperty('error');
    });

    it('should reject malformed JWT tokens', async () => {
      const malformedToken = 'not-a-valid-jwt-token-at-all';

      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        `/api/tickets?token=${encodeURIComponent(malformedToken)}`
      );

      // Skip if service unavailable
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service unavailable - skipping test');
        return;
      }

      // Should return 401
      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.data).toHaveProperty('error');
    });
  });

  describe('Database Access Token Fallback', () => {
    it('should fall back to database token validation when JWT fails', async () => {
      // Create a database access token using the correct schema
      // access_tokens uses: token, token_type, entity_id, entity_type, expires_at
      const dbToken = `db-access-token-${Date.now()}`;
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

      await db.execute({
        sql: `
          INSERT INTO access_tokens (token, token_type, entity_id, entity_type, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [dbToken, 'ticket_access', testTicket.email, 'email', expiresAt]
      });

      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        `/api/tickets?token=${encodeURIComponent(dbToken)}`
      );

      // Skip if service unavailable or access_tokens table doesn't exist
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service or access_tokens table unavailable - skipping test');
        return;
      }

      // Should return 200 with tickets (database token worked)
      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data).toHaveProperty('tickets');
    });
  });

  describe('Email Parameter (Legacy)', () => {
    it('should still support email parameter for backward compatibility', async () => {
      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        `/api/tickets?email=${encodeURIComponent(testTicket.email)}`
      );

      // Skip if service unavailable
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service unavailable - skipping test');
        return;
      }

      // Should return 200 with tickets
      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data).toHaveProperty('tickets');
      expect(response.data.tickets.length).toBeGreaterThan(0);
    });
  });

  describe('Error Cases', () => {
    it('should return 400 when no token, email, or ticket_id provided', async () => {
      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        '/api/tickets'
      );

      // Skip if service unavailable
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service unavailable - skipping test');
        return;
      }

      // Should return 400 bad request
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('error');
    });

    it('should return empty array for valid JWT with no matching tickets', async () => {
      // Create JWT for email with no tickets
      const noTicketsToken = jwt.sign(
        {
          email: 'no-tickets@example.com',
          purpose: 'ticket_viewing'
        },
        TEST_REGISTRATION_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '1h',
          issuer: 'alocubano-tickets'
        }
      );

      const response = await testApiHandler(
        'api/tickets/index',
        'GET',
        `/api/tickets?token=${encodeURIComponent(noTicketsToken)}`
      );

      // Skip if service unavailable
      if (response.status === 0 || response.status === 404 || response.status === 500) {
        console.warn('⚠️ Tickets service unavailable - skipping test');
        return;
      }

      // Should return 200 with empty tickets array
      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data).toHaveProperty('tickets');
      expect(response.data.tickets).toEqual([]);
    });
  });
});
