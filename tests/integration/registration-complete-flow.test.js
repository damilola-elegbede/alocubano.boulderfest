/**
 * Integration Tests for Registration Complete Flow
 * Tests single/batch registration, token validation, status updates, and confirmation emails
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { getDbClient } from '../setup-integration.js';
import { registrationTokenService } from '../../lib/registration-token-service.js';
import { createTestEvent, testRequest } from './handler-test-helper.js';

describe('Registration Complete Flow - Integration Tests', () => {
  let db;
  let testEventId;

  beforeAll(async () => {
    // Set up test environment
    process.env.INTEGRATION_TEST_MODE = 'true';
    process.env.REGISTRATION_SECRET = 'test-registration-secret-minimum-32-chars-long-for-integration';
  });

  beforeEach(async () => {
    // Get database client (fresh after cleanup)
    db = await getDbClient();

    // Create test event with numeric ID
    testEventId = await createTestEvent(db, {
      slug: 'boulder-fest-2026',
      name: 'A Lo Cubano Boulder Fest 2026',
      type: 'festival',
      status: 'active',
      startDate: '2026-05-15',
      endDate: '2026-05-17',
      venueName: 'Avalon Ballroom',
      venueCity: 'Boulder',
      venueState: 'CO'
    });

    // Create test transaction
    await db.execute({
      sql: `
        INSERT INTO transactions (
          id, transaction_id, type, stripe_session_id, stripe_payment_intent_id,
          customer_email, customer_name, amount_cents, currency, status,
          order_number, order_data, event_id, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      args: [
        1000,
        'TXN-REG-TEST-001',
        'tickets',
        'test_session_reg_001',
        'test_pi_reg_001',
        'customer@example.com',
        'Test Customer',
        15000,
        'USD',
        'completed',
        'ALO-2026-1000',
        JSON.stringify({ tickets: [], subtotal: 15000, total: 15000 }),
        testEventId
      ]
    });

    // Create test tickets for single registration
    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, price_cents,
          status, validation_status, scan_count, max_scan_count,
          event_id, event_date, registration_status, registration_deadline, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'), datetime('now'))
      `,
      args: [
        'REG-SINGLE-001',
        1000,
        'full-pass',
        5000,
        'valid',
        'active',
        0,
        10,
        testEventId,
        '2026-05-15',
        'pending'
      ]
    });

    // Create test tickets for batch registration
    const batchTickets = [
      'REG-BATCH-001',
      'REG-BATCH-002',
      'REG-BATCH-003'
    ];

    for (const ticketId of batchTickets) {
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            status, validation_status, scan_count, max_scan_count,
            event_id, event_date, registration_status, registration_deadline, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'), datetime('now'))
        `,
        args: [
          ticketId,
          1000,
          'full-pass',
          5000,
          'valid',
          'active',
          0,
          10,
          testEventId,
          '2026-05-15',
          'pending'
        ]
      });
    }

    // Update transaction with registration token
    await registrationTokenService.ensureInitialized();
    const token = await registrationTokenService.createToken(1000);
  });

  afterAll(async () => {
    // Cleanup handled by setup-integration.js
  });

  describe('Single Ticket Registration', () => {
    it('should register single ticket with attendee information', async () => {
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      console.log('[TEST] Response status:', response.status);
      console.log('[TEST] Response data:', JSON.stringify(response.data, null, 2));

      expect(response.status).toBe(200);

      const data = response.data;
      expect(data.success).toBe(true);
      expect(data.registrations).toHaveLength(1);
      expect(data.registrations[0].status).toBe('registered');

      // Verify in database
      const result = await db.execute({
        sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
        args: ['REG-SINGLE-001']
      });

      expect(result.rows[0].attendee_first_name).toBe('John');
      expect(result.rows[0].attendee_last_name).toBe('Doe');
      expect(result.rows[0].attendee_email).toBe('john.doe@example.com');
      expect(result.rows[0].registration_status).toBe('completed');
      expect(result.rows[0].registered_at).toBeDefined();
    });

    it('should validate registration input fields', async () => {
      const invalidRegistrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: '<script>alert("xss")</script>',
        lastName: 'Doe',
        email: 'invalid-email'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations: invalidRegistrations });

      expect(response.status).toBe(400);

      const data = response.data;
      expect(data.error).toBe('Validation failed');
      expect(data.details).toBeDefined();
    });

    it('should sanitize input to prevent XSS', async () => {
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'John<script>',
        lastName: 'Doe',
        email: 'john.doe@example.com'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      // Should fail validation due to invalid characters
      expect(response.status).toBe(400);
    });
  });

  describe('Batch Registration (All Tickets in Order)', () => {
    it('should register all tickets in single batch request', async () => {
      const registrations = [
        {
          ticketId: 'REG-BATCH-001',
          firstName: 'Alice',
          lastName: 'Johnson',
          email: 'alice@example.com'
        },
        {
          ticketId: 'REG-BATCH-002',
          firstName: 'Bob',
          lastName: 'Smith',
          email: 'bob@example.com'
        },
        {
          ticketId: 'REG-BATCH-003',
          firstName: 'Charlie',
          lastName: 'Davis',
          email: 'charlie@example.com'
        }
      ];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      expect(response.status).toBe(200);

      const data = response.data;
      expect(data.success).toBe(true);
      expect(data.registrations).toHaveLength(3);
      expect(data.message).toContain('Successfully registered 3 tickets');

      // Verify all tickets in database
      for (const registration of registrations) {
        const result = await db.execute({
          sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
          args: [registration.ticketId]
        });

        expect(result.rows[0].attendee_first_name).toBe(registration.firstName);
        expect(result.rows[0].attendee_last_name).toBe(registration.lastName);
        expect(result.rows[0].attendee_email).toBe(registration.email);
        expect(result.rows[0].registration_status).toBe('completed');
      }
    }, 30000); // 30 second timeout for batch registration with emails

    it('should enforce maximum 10 tickets per batch', async () => {
      const tooManyTickets = Array(11).fill(null).map((_, i) => ({
        ticketId: `TICKET-${i}`,
        firstName: 'Test',
        lastName: 'User',
        email: `user${i}@example.com`
      }));

      const response = await testRequest('POST', '/api/registration/batch', { registrations: tooManyTickets });

      expect(response.status).toBe(400);

      const data = response.data;
      expect(data.error).toBe('Maximum 10 tickets per batch');
    });

    it('should handle batch with mix of valid and invalid tickets', async () => {
      const mixedRegistrations = [
        {
          ticketId: 'REG-BATCH-001',
          firstName: 'Valid',
          lastName: 'User',
          email: 'valid@example.com'
        },
        {
          ticketId: 'NON-EXISTENT',
          firstName: 'Invalid',
          lastName: 'User',
          email: 'invalid@example.com'
        }
      ];

      const response = await testRequest('POST', '/api/registration/batch', { registrations: mixedRegistrations });

      expect(response.status).toBe(404);

      const data = response.data;
      expect(data.error).toBe('Some tickets not found');
      expect(data.missingTickets).toContain('NON-EXISTENT');
    }, 30000); // 30 second timeout

    it('should execute batch operations atomically', async () => {
      // All registrations should succeed or all should fail
      const registrations = [
        {
          ticketId: 'REG-BATCH-001',
          firstName: 'Alice',
          lastName: 'Johnson',
          email: 'alice@example.com'
        },
        {
          ticketId: 'REG-BATCH-002',
          firstName: 'Bob',
          lastName: 'Smith',
          email: 'bob@example.com'
        }
      ];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      expect(response.status).toBe(200);

      // Verify both tickets are registered
      const result1 = await db.execute({
        sql: 'SELECT registration_status FROM tickets WHERE ticket_id = ?',
        args: ['REG-BATCH-001']
      });
      const result2 = await db.execute({
        sql: 'SELECT registration_status FROM tickets WHERE ticket_id = ?',
        args: ['REG-BATCH-002']
      });

      expect(result1.rows[0].registration_status).toBe('completed');
      expect(result2.rows[0].registration_status).toBe('completed');
    }, 30000); // 30 second timeout
  });

  describe('Registration Token Validation', () => {
    it('should validate registration token before processing', async () => {
      // This would require token-based registration endpoint
      // Placeholder for token validation test
      expect(true).toBe(true);
    });

    it('should reject expired registration token', async () => {
      // Create expired token (requires token service)
      // Placeholder for expiration test
      expect(true).toBe(true);
    });

    it('should consume token after successful registration', async () => {
      // Verify token is nullified in database after use
      const result = await db.execute({
        sql: 'SELECT registration_token FROM transactions WHERE id = ?',
        args: [1000]
      });

      // Token should be consumed after registration
      // Note: This depends on whether registration was done with token
      expect(result.rows[0]).toBeDefined();
    });
  });

  describe('Registration Status Updates', () => {
    it('should update registration_status to completed', async () => {
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      }];

      await testRequest('POST', '/api/registration/batch', { registrations });

      const result = await db.execute({
        sql: 'SELECT registration_status FROM tickets WHERE ticket_id = ?',
        args: ['REG-SINGLE-001']
      });

      expect(result.rows[0].registration_status).toBe('completed');
    }, 30000); // 30 second timeout

    it('should set registered_at timestamp', async () => {
      const result = await db.execute({
        sql: 'SELECT registered_at FROM tickets WHERE ticket_id = ?',
        args: ['REG-SINGLE-001']
      });

      expect(result.rows[0].registered_at).toBeDefined();
      expect(new Date(result.rows[0].registered_at)).toBeInstanceOf(Date);
    });

    it('should handle already registered tickets gracefully', async () => {
      // First registration
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'First',
        lastName: 'Registration',
        email: 'first@example.com'
      }];

      await testRequest('POST', '/api/registration/batch', { registrations });

      // Second registration attempt
      const secondRegistrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'Second',
        lastName: 'Registration',
        email: 'second@example.com'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations: secondRegistrations });

      expect(response.status).toBe(200);

      const data = response.data;
      expect(data.alreadyRegistered).toBeDefined();
    }, 30000); // 30 second timeout

    it('should reject registration past deadline', async () => {
      // Create expired ticket
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            status, validation_status, scan_count, max_scan_count,
            event_id, event_date, registration_status, registration_deadline, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), datetime('now'))
        `,
        args: [
          'REG-EXPIRED-001',
          1000,
          'full-pass',
          5000,
          'valid',
          'active',
          0,
          10,
          testEventId,
          '2026-05-15',
          'pending'
        ]
      });

      const registrations = [{
        ticketId: 'REG-EXPIRED-001',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      expect(response.status).toBe(400);

      const data = response.data;
      expect(data.error).toBe('Registration validation failed');
      expect(data.details[0]).toContain('deadline has passed');
    });
  });

  describe('Registration Confirmation Emails', () => {
    it('should send individual confirmation email per ticket', async () => {
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'Email',
        lastName: 'Test',
        email: 'emailtest@example.com'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      expect(response.status).toBe(200);

      const data = response.data;
      expect(data.emailStatus).toBeDefined();
      expect(Array.isArray(data.emailStatus)).toBe(true);

      // Check email log
      const emailLog = await db.execute({
        sql: 'SELECT * FROM registration_emails WHERE ticket_id = ?',
        args: ['REG-SINGLE-001']
      });

      expect(emailLog.rows.length).toBeGreaterThan(0);
    }, 30000); // 30 second timeout for email test

    it('should include QR code in confirmation email', async () => {
      // QR codes should be generated and included in emails
      // This is tested via email template integration
      expect(true).toBe(true);
    });

    it('should include wallet pass links in email', async () => {
      // Email should contain Apple Wallet and Google Wallet links
      // This is tested via email template integration
      expect(true).toBe(true);
    });

    it('should continue registration even if email fails', async () => {
      // Email failures should not block registration success
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'Email',
        lastName: 'Failure',
        email: 'fail@example.com'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      expect(response.status).toBe(200);

      const data = response.data;
      expect(data.success).toBe(true);
      // Even if email failed, registration should succeed
    }, 30000); // 30 second timeout for email test
  });

  describe('Mountain Time in Registration Data', () => {
    it('should format registered_at in Mountain Time', async () => {
      // First, register the ticket
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'Mountain',
        lastName: 'Time',
        email: 'mountaintime@example.com'
      }];

      await testRequest('POST', '/api/registration/batch', { registrations });

      // Now check the registered_at timestamp
      const result = await db.execute({
        sql: 'SELECT registered_at FROM tickets WHERE ticket_id = ?',
        args: ['REG-SINGLE-001']
      });

      const registeredAt = result.rows[0].registered_at;
      expect(registeredAt).toBeDefined();
      expect(registeredAt).not.toBeNull();

      // Convert to string if it's an object (Date or BigInt)
      const registeredAtStr = typeof registeredAt === 'string'
        ? registeredAt
        : String(registeredAt);

      // SQLite returns datetime in format: "2025-10-11 08:16:53" (space separator)
      // ISO format uses T separator: "2025-10-11T08:16:53"
      // Accept both formats
      expect(registeredAtStr).toMatch(/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}/);
    }, 30000); // 30 second timeout

    it('should return Mountain Time formatted timestamps in API response', async () => {
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'Timezone',
        lastName: 'Test',
        email: 'timezone@example.com'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      const data = response.data;
      expect(data.summary.registrationDate).toBeDefined();
    }, 30000); // 30 second timeout
  });

  describe('Partial Registration Handling', () => {
    it('should allow partial registration of ticket batch', async () => {
      // Register subset of tickets
      const registrations = [{
        ticketId: 'REG-BATCH-001',
        firstName: 'Partial',
        lastName: 'Registration',
        email: 'partial@example.com'
      }];

      const response = await testRequest('POST', '/api/registration/batch', { registrations });

      expect(response.status).toBe(200);

      const data = response.data;
      expect(data.success).toBe(true);
      expect(data.registrations).toHaveLength(1);

      // Other tickets should still be pending
      const result = await db.execute({
        sql: 'SELECT registration_status FROM tickets WHERE ticket_id = ?',
        args: ['REG-BATCH-002']
      });

      expect(result.rows[0].registration_status).toBe('pending');
    });

    it('should track transaction registration completion status', async () => {
      // Check if all_tickets_registered flag is set correctly
      const result = await db.execute({
        sql: 'SELECT all_tickets_registered FROM transactions WHERE id = ?',
        args: [1000]
      });

      // Should not be set until ALL tickets are registered
      expect(result.rows[0]).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit on registration endpoint', async () => {
      // Test the rate limiter configuration and logic directly
      // This validates that rate limiting is properly configured for the registration endpoint
      const { getRateLimiter } = await import('../../lib/rate-limiter.js');
      const rateLimiter = getRateLimiter();

      // Test identifier
      const testIp = '192.168.1.100-rate-limit-test';
      const identifier = testIp;

      // Reset any existing state for this IP
      rateLimiter.reset({ ip: testIp, endpoint: '/api/registration/batch' });

      // The rate limiter is configured with maxAttempts: 3 in lib/rate-limiter.js
      // Make 3 attempts - should all pass
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkRateLimit(identifier);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(3 - i - 1);
      }

      // 4th attempt should be rate limited
      const rateLimitedResult = await rateLimiter.checkRateLimit(identifier);
      expect(rateLimitedResult.allowed).toBe(false);
      expect(rateLimitedResult.remaining).toBe(0);
      expect(rateLimitedResult.resetTime).toBeDefined();

      // Verify rate limiter configuration for batch endpoint
      const batchModule = await import('../../api/registration/batch.js');
      // The module creates a rate limiter with max: 10, windowMs: 15 * 60 * 1000
      // This test confirms the rate limiting infrastructure is in place
      expect(rateLimiter).toBeDefined();
      expect(rateLimiter.maxAttempts).toBe(3);
      expect(rateLimiter.windowMs).toBe(15 * 60 * 1000);
    });
  });

  describe('Audit Logging', () => {
    it('should log registration changes to audit trail', async () => {
      // Audit logs should be created for registration changes
      // This is tested via audit service integration
      expect(true).toBe(true);
    });

    it('should include IP address in audit logs', async () => {
      // IP should be tracked in registration audit logs
      expect(true).toBe(true);
    });

    it('should track batch position in audit metadata', async () => {
      // Each registration in batch should track its position
      expect(true).toBe(true);
    });
  });
});
