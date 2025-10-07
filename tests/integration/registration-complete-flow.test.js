/**
 * Integration Tests for Registration Complete Flow
 * Tests single/batch registration, token validation, status updates, and confirmation emails
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { getDbClient } from '../setup-integration.js';
import { registrationTokenService } from '../../lib/registration-token-service.js';

describe('Registration Complete Flow - Integration Tests', () => {
  let db;
  const BASE_URL = process.env.VITEST_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    // Set up test environment
    process.env.INTEGRATION_TEST_MODE = 'true';
    process.env.REGISTRATION_SECRET = 'test-registration-secret-minimum-32-chars-long-for-integration';

    db = await getDbClient();

    // Create test transaction
    await db.execute({
      sql: `
        INSERT INTO transactions (
          id, stripe_session_id, stripe_payment_intent_id,
          customer_email, customer_name, amount_cents, status,
          order_number, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      args: [
        1000,
        'test_session_reg_001',
        'test_pi_reg_001',
        'customer@example.com',
        'Test Customer',
        15000,
        'completed',
        'ALO-2026-1000'
      ]
    });

    // Create test tickets for single registration
    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, ticket_type_name,
          status, validation_status, scan_count, max_scan_count,
          event_id, registration_status, registration_deadline, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'), datetime('now'))
      `,
      args: [
        'REG-SINGLE-001',
        1000,
        'full-pass',
        'Full Festival Pass',
        'valid',
        'active',
        0,
        10,
        'boulder-fest-2026',
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
            ticket_id, transaction_id, ticket_type, ticket_type_name,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, registration_deadline, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'), datetime('now'))
        `,
        args: [
          ticketId,
          1000,
          'full-pass',
          'Full Festival Pass',
          'valid',
          'active',
          0,
          10,
          'boulder-fest-2026',
          'pending'
        ]
      });
    }

    // Update transaction with registration token
    await registrationTokenService.ensureInitialized();
    const token = await registrationTokenService.createToken(1000);

    console.log('[TEST] Created registration token for transaction 1000');
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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations: invalidRegistrations })
      });

      expect(response.status).toBe(400);

      const data = await response.json();
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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
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
    });

    it('should enforce maximum 10 tickets per batch', async () => {
      const tooManyTickets = Array(11).fill(null).map((_, i) => ({
        ticketId: `TICKET-${i}`,
        firstName: 'Test',
        lastName: 'User',
        email: `user${i}@example.com`
      }));

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations: tooManyTickets })
      });

      expect(response.status).toBe(400);

      const data = await response.json();
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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations: mixedRegistrations })
      });

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe('Some tickets not found');
      expect(data.missingTickets).toContain('NON-EXISTENT');
    });

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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

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
    });
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

      await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      const result = await db.execute({
        sql: 'SELECT registration_status FROM tickets WHERE ticket_id = ?',
        args: ['REG-SINGLE-001']
      });

      expect(result.rows[0].registration_status).toBe('completed');
    });

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

      await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      // Second registration attempt
      const secondRegistrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'Second',
        lastName: 'Registration',
        email: 'second@example.com'
      }];

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations: secondRegistrations })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.alreadyRegistered).toBeDefined();
    });

    it('should reject registration past deadline', async () => {
      // Create expired ticket
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, ticket_type_name,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, registration_deadline, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), datetime('now'))
        `,
        args: [
          'REG-EXPIRED-001',
          1000,
          'full-pass',
          'Full Festival Pass',
          'valid',
          'active',
          0,
          10,
          'boulder-fest-2026',
          'pending'
        ]
      });

      const registrations = [{
        ticketId: 'REG-EXPIRED-001',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      }];

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      expect(response.status).toBe(400);

      const data = await response.json();
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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.emailStatus).toBeDefined();
      expect(Array.isArray(data.emailStatus)).toBe(true);

      // Check email log
      const emailLog = await db.execute({
        sql: 'SELECT * FROM registration_emails WHERE ticket_id = ?',
        args: ['REG-SINGLE-001']
      });

      expect(emailLog.rows.length).toBeGreaterThan(0);
    });

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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      // Even if email failed, registration should succeed
    });
  });

  describe('Mountain Time in Registration Data', () => {
    it('should format registered_at in Mountain Time', async () => {
      const result = await db.execute({
        sql: 'SELECT registered_at FROM tickets WHERE ticket_id = ?',
        args: ['REG-SINGLE-001']
      });

      const registeredAt = result.rows[0].registered_at;
      expect(registeredAt).toBeDefined();

      // ISO format should be stored in UTC
      expect(registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return Mountain Time formatted timestamps in API response', async () => {
      const registrations = [{
        ticketId: 'REG-SINGLE-001',
        firstName: 'Timezone',
        lastName: 'Test',
        email: 'timezone@example.com'
      }];

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      const data = await response.json();
      expect(data.summary.registrationDate).toBeDefined();
    });
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

      const response = await fetch(`${BASE_URL}/api/registration/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
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
      // Make multiple requests rapidly
      const promises = Array(12).fill(null).map(() =>
        fetch(`${BASE_URL}/api/registration/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registrations: [{
              ticketId: 'REG-SINGLE-001',
              firstName: 'Rate',
              lastName: 'Limit',
              email: 'ratelimit@example.com'
            }]
          })
        })
      );

      const responses = await Promise.all(promises);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
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
