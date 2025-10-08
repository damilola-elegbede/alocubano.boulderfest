/**
 * Integration Tests for Admin Ticket Transfer
 * Tests the complete transfer flow including API, database, and email notifications
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase } from '../config/test-database.js';
import handler from '../../api/admin/transfer-ticket.js';
import { getDatabaseClient } from '../../lib/database.js';
import authService from '../../lib/auth-service.js';

describe('Admin Ticket Transfer - Integration Tests', () => {
  let testDb;
  let adminToken;
  let csrfToken = 'test-csrf-token';

  beforeAll(async () => {
    // Generate admin token for testing
    if (process.env.ADMIN_SECRET) {
      adminToken = authService.generateToken({ email: 'admin@test.com', role: 'admin' });
    }
  });

  beforeEach(async () => {
    testDb = await setupTestDatabase();
  });

  afterEach(async () => {
    await teardownTestDatabase(testDb);
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Complete Transfer Flow', () => {
    it('should successfully transfer a valid ticket', async () => {
      // Create test event
      await testDb.execute({
        sql: `INSERT INTO events (id, name, start_date, end_date, status, is_test)
              VALUES (1, 'Test Event', '2026-05-15', '2026-05-17', 'active', 1)`
      });

      // Create test transaction
      await testDb.execute({
        sql: `INSERT INTO transactions (
                id, transaction_id, order_number, customer_email, customer_name,
                amount_cents, status, payment_processor, is_test
              ) VALUES (1, 'test-txn-001', 'ORD-001', 'old@example.com', 'Old Owner', 5000, 'succeeded', 'stripe', 1)`
      });

      // Create test ticket
      const ticketId = 'TEST-TRANSFER-001';
      await testDb.execute({
        sql: `INSERT INTO tickets (
                ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
                price_cents, attendee_first_name, attendee_last_name,
                attendee_email, status, is_test
              ) VALUES (?, 1, 'weekend-pass', 'wp-1', 1, 5000, 'Old', 'Owner', 'old@example.com', 'valid', 1)`,
        args: [ticketId]
      });

      // Mock request and response
      const req = {
        method: 'POST',
        body: {
          ticketId: ticketId,
          newEmail: 'new@example.com',
          newFirstName: 'New',
          newLastName: 'Owner',
          newPhone: '+1-555-0123',
          transferReason: 'User requested transfer'
        },
        user: { email: 'admin@test.com' },
        headers: {
          'authorization': `Bearer ${adminToken}`,
          'x-csrf-token': csrfToken
        }
      };

      const res = {
        statusCode: null,
        headers: {},
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        setHeader(key, value) {
          this.headers[key] = value;
          return this;
        },
        json(data) {
          this.body = data;
          return this;
        }
      };

      // Execute transfer
      await handler(req, res);

      // Verify response
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('transferred successfully');

      // Verify ticket was updated
      const ticketResult = await testDb.execute({
        sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(ticketResult.rows[0].attendee_first_name).toBe('New');
      expect(ticketResult.rows[0].attendee_last_name).toBe('Owner');
      expect(ticketResult.rows[0].attendee_email).toBe('new@example.com');
      expect(ticketResult.rows[0].attendee_phone).toBe('+1-555-0123');

      // Verify transfer history was recorded
      const historyResult = await testDb.execute({
        sql: 'SELECT * FROM ticket_transfers WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(historyResult.rows).toHaveLength(1);
      expect(historyResult.rows[0].from_email).toBe('old@example.com');
      expect(historyResult.rows[0].to_email).toBe('new@example.com');
      expect(historyResult.rows[0].transferred_by).toBe('admin@test.com');
      expect(historyResult.rows[0].transfer_reason).toBe('User requested transfer');
    });

    it('should reject transfer of cancelled ticket', async () => {
      // Create test event
      await testDb.execute({
        sql: `INSERT INTO events (id, name, start_date, end_date, status, is_test)
              VALUES (1, 'Test Event', '2026-05-15', '2026-05-17', 'active', 1)`
      });

      // Create test transaction
      await testDb.execute({
        sql: `INSERT INTO transactions (
                id, transaction_id, order_number, customer_email, customer_name,
                amount_cents, status, payment_processor, is_test
              ) VALUES (1, 'test-txn-002', 'ORD-002', 'old@example.com', 'Old Owner', 5000, 'succeeded', 'stripe', 1)`
      });

      // Create cancelled ticket
      const ticketId = 'TEST-CANCELLED-001';
      await testDb.execute({
        sql: `INSERT INTO tickets (
                ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
                price_cents, attendee_first_name, attendee_last_name,
                attendee_email, status, is_test
              ) VALUES (?, 1, 'weekend-pass', 'wp-1', 1, 5000, 'Old', 'Owner', 'old@example.com', 'cancelled', 1)`,
        args: [ticketId]
      });

      // Mock request
      const req = {
        method: 'POST',
        body: {
          ticketId: ticketId,
          newEmail: 'new@example.com',
          newFirstName: 'New',
          newLastName: 'Owner'
        },
        user: { email: 'admin@test.com' },
        headers: {
          'authorization': `Bearer ${adminToken}`,
          'x-csrf-token': csrfToken
        }
      };

      const res = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        setHeader() { return this; },
        json(data) {
          this.body = data;
          return this;
        }
      };

      // Execute transfer
      await handler(req, res);

      // Should return 400 error
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Cannot transfer cancelled ticket');
    });

    it('should reject transfer to same email', async () => {
      // Create test event
      await testDb.execute({
        sql: `INSERT INTO events (id, name, start_date, end_date, status, is_test)
              VALUES (1, 'Test Event', '2026-05-15', '2026-05-17', 'active', 1)`
      });

      // Create test transaction
      await testDb.execute({
        sql: `INSERT INTO transactions (
                id, transaction_id, order_number, customer_email, customer_name,
                amount_cents, status, payment_processor, is_test
              ) VALUES (1, 'test-txn-003', 'ORD-003', 'same@example.com', 'Same Owner', 5000, 'succeeded', 'stripe', 1)`
      });

      // Create ticket
      const ticketId = 'TEST-SAME-EMAIL-001';
      await testDb.execute({
        sql: `INSERT INTO tickets (
                ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
                price_cents, attendee_first_name, attendee_last_name,
                attendee_email, status, is_test
              ) VALUES (?, 1, 'weekend-pass', 'wp-1', 1, 5000, 'Same', 'Owner', 'same@example.com', 'valid', 1)`,
        args: [ticketId]
      });

      // Mock request - try to transfer to same email
      const req = {
        method: 'POST',
        body: {
          ticketId: ticketId,
          newEmail: 'same@example.com', // Same email
          newFirstName: 'Same',
          newLastName: 'Owner'
        },
        user: { email: 'admin@test.com' },
        headers: {
          'authorization': `Bearer ${adminToken}`,
          'x-csrf-token': csrfToken
        }
      };

      const res = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        setHeader() { return this; },
        json(data) {
          this.body = data;
          return this;
        }
      };

      // Execute transfer
      await handler(req, res);

      // Should return 400 error
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('already belongs to this email');
    });

    it('should validate required fields', async () => {
      const testCases = [
        {
          description: 'missing ticketId',
          body: { newEmail: 'new@example.com', newFirstName: 'New' },
          expectedError: 'ticketId is required'
        },
        {
          description: 'missing newEmail',
          body: { ticketId: 'TEST-001', newFirstName: 'New' },
          expectedError: 'newEmail is required'
        },
        {
          description: 'missing newFirstName',
          body: { ticketId: 'TEST-001', newEmail: 'new@example.com' },
          expectedError: 'newFirstName is required'
        },
        {
          description: 'invalid email format',
          body: { ticketId: 'TEST-001', newEmail: 'not-an-email', newFirstName: 'New' },
          expectedError: 'newEmail must be a valid email'
        }
      ];

      for (const testCase of testCases) {
        const req = {
          method: 'POST',
          body: testCase.body,
          user: { email: 'admin@test.com' },
          headers: {
            'authorization': `Bearer ${adminToken}`,
            'x-csrf-token': csrfToken
          }
        };

        const res = {
          statusCode: null,
          body: null,
          status(code) {
            this.statusCode = code;
            return this;
          },
          setHeader() { return this; },
          json(data) {
            this.body = data;
            return this;
          }
        };

        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBeDefined();
      }
    });

    it('should handle non-existent ticket', async () => {
      const req = {
        method: 'POST',
        body: {
          ticketId: 'NON-EXISTENT-TICKET',
          newEmail: 'new@example.com',
          newFirstName: 'New',
          newLastName: 'Owner'
        },
        user: { email: 'admin@test.com' },
        headers: {
          'authorization': `Bearer ${adminToken}`,
          'x-csrf-token': csrfToken
        }
      };

      const res = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        setHeader() { return this; },
        json(data) {
          this.body = data;
          return this;
        }
      };

      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('Ticket not found');
    });

    it('should only accept POST method', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const req = {
          method: method,
          body: {},
          user: { email: 'admin@test.com' },
          headers: {
            'authorization': `Bearer ${adminToken}`,
            'x-csrf-token': csrfToken
          }
        };

        const res = {
          statusCode: null,
          body: null,
          status(code) {
            this.statusCode = code;
            return this;
          },
          setHeader(key, value) {
            if (key === 'Allow') {
              expect(value).toContain('POST');
            }
            return this;
          },
          json(data) {
            this.body = data;
            return this;
          },
          end() {
            return this;
          }
        };

        await handler(req, res);

        expect(res.statusCode).toBe(405);
      }
    });
  });

  describe('Transfer History Tracking', () => {
    it('should track multiple transfers for same ticket', async () => {
      // Create test event
      await testDb.execute({
        sql: `INSERT INTO events (id, name, start_date, end_date, status, is_test)
              VALUES (1, 'Test Event', '2026-05-15', '2026-05-17', 'active', 1)`
      });

      // Create test transaction
      await testDb.execute({
        sql: `INSERT INTO transactions (
                id, transaction_id, order_number, customer_email, customer_name,
                amount_cents, status, payment_processor, is_test
              ) VALUES (1, 'test-txn-multi', 'ORD-MULTI', 'first@example.com', 'First Owner', 5000, 'succeeded', 'stripe', 1)`
      });

      const ticketId = 'TEST-MULTI-TRANSFER-001';

      // Create initial ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
                ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
                price_cents, attendee_first_name, attendee_last_name,
                attendee_email, status, is_test
              ) VALUES (?, 1, 'weekend-pass', 'wp-1', 1, 5000, 'First', 'Owner', 'first@example.com', 'valid', 1)`,
        args: [ticketId]
      });

      // Perform 3 consecutive transfers
      const transfers = [
        { email: 'second@example.com', firstName: 'Second', lastName: 'Owner' },
        { email: 'third@example.com', firstName: 'Third', lastName: 'Owner' },
        { email: 'fourth@example.com', firstName: 'Fourth', lastName: 'Owner' }
      ];

      for (const transfer of transfers) {
        const req = {
          method: 'POST',
          body: {
            ticketId: ticketId,
            newEmail: transfer.email,
            newFirstName: transfer.firstName,
            newLastName: transfer.lastName
          },
          user: { email: 'admin@test.com' },
          headers: {
            'authorization': `Bearer ${adminToken}`,
            'x-csrf-token': csrfToken
          }
        };

        const res = {
          statusCode: null,
          body: null,
          status(code) {
            this.statusCode = code;
            return this;
          },
          setHeader() { return this; },
          json(data) {
            this.body = data;
            return this;
          }
        };

        await handler(req, res);
        expect(res.statusCode).toBe(200);

        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Verify all 3 transfers were recorded
      const historyResult = await testDb.execute({
        sql: 'SELECT * FROM ticket_transfers WHERE ticket_id = ? ORDER BY transferred_at DESC, id DESC',
        args: [ticketId]
      });

      expect(historyResult.rows).toHaveLength(3);
      expect(historyResult.rows[0].to_email).toBe('fourth@example.com');
      expect(historyResult.rows[1].to_email).toBe('third@example.com');
      expect(historyResult.rows[2].to_email).toBe('second@example.com');

      // Verify final ticket state
      const ticketResult = await testDb.execute({
        sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(ticketResult.rows[0].attendee_email).toBe('fourth@example.com');
      expect(ticketResult.rows[0].attendee_first_name).toBe('Fourth');
    });
  });
});
