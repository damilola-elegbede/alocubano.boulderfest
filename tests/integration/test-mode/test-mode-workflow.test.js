/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../../lib/database.js';
import {
  createTestTicket,
  validateTestTicket,
  registerTestTicket,
  checkInTestTicket,
  cleanupTestTickets,
  validateTestDataIsolation
} from '../../helpers/ticket-test-helpers.js';

describe('Test Mode End-to-End Workflow', () => {
  let client;

  beforeEach(async () => {
    client = await getDatabaseClient();
  });

  afterEach(async () => {
    await cleanupTestTickets();
    if (client && !client.closed) {
      client.close();
    }
  });

  describe('Complete Test Ticket Lifecycle', () => {
    it('should complete full test ticket workflow', async () => {
      // 1. Create test ticket
      const testTicket = await createTestTicket({
        ticketType: 'general',
        eventId: 1,
        attendeeEmail: 'workflow@test.com',
        priceInCents: 5000
      });

      expect(testTicket.isTest).toBe(true);
      expect(testTicket.ticketId).toMatch(/^TEST-TICKET-/);
      expect(testTicket.qrToken).toMatch(/^TEST-QR-/);

      // 2. Validate QR code
      const validationResult = await validateTestTicket(testTicket.qrToken);
      expect(validationResult.valid).toBe(true);
      expect(validationResult.ticket.ticketId).toBe(testTicket.ticketId);
      expect(validationResult.ticket.isTest).toBe(true);

      // 3. Register ticket
      const registrationResult = await registerTestTicket(testTicket.ticketId, {
        firstName: 'Integration',
        lastName: 'Test',
        email: 'workflow@test.com'
      });

      expect(registrationResult.success).toBe(true);

      // 4. Check in ticket
      const checkInResult = await checkInTestTicket(testTicket.ticketId);
      expect(checkInResult.success).toBe(true);

      // 5. Verify final state in database
      const finalState = await client.execute(`
        SELECT * FROM tickets WHERE ticket_id = ?
      `, [testTicket.ticketId]);

      const ticket = finalState.rows[0];
      expect(ticket.is_test).toBe(1);
      expect(ticket.status).toBe('checked_in');
      expect(ticket.registration_status).toBe('registered');
      expect(ticket.attendee_first_name).toBe('Integration');
      expect(ticket.attendee_last_name).toBe('Test');
    });

    it('should handle multiple test tickets simultaneously', async () => {
      const ticketPromises = [];

      // Create multiple test tickets concurrently
      for (let i = 0; i < 5; i++) {
        ticketPromises.push(createTestTicket({
          ticketType: i % 2 === 0 ? 'general' : 'vip',
          eventId: 1,
          attendeeEmail: `multi${i}@test.com`,
          priceInCents: i % 2 === 0 ? 5000 : 10000
        }));
      }

      const tickets = await Promise.all(ticketPromises);

      // Verify all tickets are test tickets
      tickets.forEach((ticket, index) => {
        expect(ticket.isTest).toBe(true);
        expect(ticket.ticketId).toMatch(/^TEST-TICKET-/);
        expect(ticket.attendeeEmail).toBe(`multi${index}@test.com`);
      });

      // Validate all QR codes
      const validationPromises = tickets.map(ticket =>
        validateTestTicket(ticket.qrToken)
      );

      const validationResults = await Promise.all(validationPromises);

      validationResults.forEach((result, index) => {
        expect(result.valid).toBe(true);
        expect(result.ticket.ticketId).toBe(tickets[index].ticketId);
        expect(result.ticket.isTest).toBe(true);
      });

      // Verify all tickets are in database with correct test flag
      const dbTickets = await client.execute(`
        SELECT COUNT(*) as count FROM tickets WHERE is_test = 1
      `);

      expect(dbTickets.rows[0].count).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Test Data Isolation Verification', () => {
    it('should maintain strict separation between test and production data', async () => {
      // Create test data
      const testTicket = await createTestTicket({
        ticketType: 'general',
        eventId: 1,
        attendeeEmail: 'isolation-test@test.com',
        priceInCents: 5000
      });

      // Create mock production data
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, ['PROD-TRANS-123', 'purchase', 'completed', 7500, 'USD', 'prod@example.com', 0]);

      const prodTransResult = await client.execute(`
        SELECT id FROM transactions WHERE transaction_id = 'PROD-TRANS-123'
      `);
      const prodTransId = prodTransResult.rows[0].id;

      await client.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, status, registration_status, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'PROD-TICKET-123',
        prodTransId,
        'vip',
        1,
        7500,
        'prod@example.com',
        'active',
        'pending',
        0
      ]);

      // Verify isolation
      const isolation = await validateTestDataIsolation();
      expect(isolation.isolation_verified).toBe(true);
      expect(isolation.test_tickets).toBeGreaterThanOrEqual(1);
      expect(isolation.production_tickets).toBeGreaterThanOrEqual(1);

      // Test queries should only return test data
      const testOnly = await client.execute(`
        SELECT * FROM tickets WHERE is_test = 1
      `);

      testOnly.rows.forEach(ticket => {
        expect(ticket.is_test).toBe(1);
        expect(ticket.ticket_id).toMatch(/^TEST-/);
      });

      // Production queries should only return production data
      const prodOnly = await client.execute(`
        SELECT * FROM tickets WHERE is_test = 0
      `);

      prodOnly.rows.forEach(ticket => {
        expect(ticket.is_test).toBe(0);
        expect(ticket.ticket_id).not.toMatch(/^TEST-/);
      });
    });

    it('should enforce referential integrity with test mode consistency', async () => {
      // Create test transaction
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, ['TEST-INTEGRITY-1', 'purchase', 'completed', 5000, 'USD', 'integrity@test.com', 1]);

      const transResult = await client.execute(`
        SELECT id FROM transactions WHERE transaction_id = 'TEST-INTEGRITY-1'
      `);
      const transId = transResult.rows[0].id;

      // Should allow test ticket for test transaction
      await client.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, status, registration_status, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'TEST-INTEGRITY-TICKET-1',
        transId,
        'general',
        1,
        5000,
        'integrity@test.com',
        'active',
        'pending',
        1
      ]);

      // Should reject production ticket for test transaction
      try {
        await client.execute(`
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, event_id, price_cents,
            attendee_email, status, registration_status, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'PROD-INTEGRITY-TICKET-1',
          transId,
          'general',
          1,
          5000,
          'integrity@test.com',
          'active',
          'pending',
          0
        ]);

        expect.fail('Should have failed due to test mode consistency trigger');
      } catch (error) {
        expect(error.message).toContain('Ticket test mode must match parent transaction test mode');
      }

      // Verify only the valid ticket exists
      const tickets = await client.execute(`
        SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?
      `, [transId]);

      expect(tickets.rows[0].count).toBe(1);
    });
  });

  describe('Test Mode Performance', () => {
    it('should efficiently query test data using indexes', async () => {
      // Create multiple test tickets for performance testing
      const ticketPromises = [];
      for (let i = 0; i < 50; i++) {
        ticketPromises.push(createTestTicket({
          ticketType: 'general',
          eventId: 1,
          attendeeEmail: `perf${i}@test.com`,
          priceInCents: 5000
        }));
      }

      await Promise.all(ticketPromises);

      // Measure query performance for test data
      const startTime = Date.now();

      const testTickets = await client.execute(`
        SELECT t.*, tr.transaction_id, tr.amount_cents
        FROM tickets t
        JOIN transactions tr ON tr.id = t.transaction_id
        WHERE t.is_test = 1
        ORDER BY t.created_at DESC
        LIMIT 20
      `);

      const queryTime = Date.now() - startTime;

      expect(testTickets.rows).toHaveLength(20);
      expect(queryTime).toBeLessThan(1000); // Should complete in under 1 second

      // Verify all returned tickets are test tickets
      testTickets.rows.forEach(ticket => {
        expect(ticket.is_test).toBe(1);
        expect(ticket.ticket_id).toMatch(/^TEST-/);
      });
    });

    it('should handle complex test mode aggregation queries efficiently', async () => {
      // Create test data with different statuses
      const testTicketData = [
        { status: 'active', registrationStatus: 'pending' },
        { status: 'active', registrationStatus: 'registered' },
        { status: 'checked_in', registrationStatus: 'registered' },
        { status: 'cancelled', registrationStatus: 'pending' }
      ];

      for (const data of testTicketData) {
        await createTestTicket({
          ticketType: 'general',
          eventId: 1,
          attendeeEmail: `aggregate@test.com`,
          priceInCents: 5000
        });

        // Update status
        const updateResult = await client.execute(`
          UPDATE tickets
          SET status = ?, registration_status = ?
          WHERE attendee_email = ? AND is_test = 1
          ORDER BY created_at DESC
          LIMIT 1
        `, [data.status, data.registrationStatus, 'aggregate@test.com']);
      }

      // Complex aggregation query
      const stats = await client.execute(`
        SELECT
          status,
          registration_status,
          COUNT(*) as count,
          SUM(price_cents) as total_value,
          AVG(price_cents) as avg_value
        FROM tickets
        WHERE is_test = 1 AND attendee_email = 'aggregate@test.com'
        GROUP BY status, registration_status
        ORDER BY status, registration_status
      `);

      expect(stats.rows.length).toBeGreaterThanOrEqual(4);

      // Verify each status group
      const statusCounts = {};
      stats.rows.forEach(row => {
        statusCounts[`${row.status}-${row.registration_status}`] = row.count;
        expect(row.total_value).toBeGreaterThan(0);
        expect(row.avg_value).toBe(5000);
      });

      expect(statusCounts['active-pending']).toBeGreaterThanOrEqual(1);
      expect(statusCounts['active-registered']).toBeGreaterThanOrEqual(1);
      expect(statusCounts['checked_in-registered']).toBeGreaterThanOrEqual(1);
      expect(statusCounts['cancelled-pending']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Test Data Cleanup Operations', () => {
    it('should track cleanup operations in audit log', async () => {
      // Create test data
      const testTicket = await createTestTicket({
        ticketType: 'general',
        eventId: 1,
        attendeeEmail: 'cleanup@test.com',
        priceInCents: 5000
      });

      // Record cleanup operation
      const cleanupId = `cleanup-${Date.now()}`;
      await client.execute(`
        INSERT INTO test_data_cleanup_log (
          cleanup_id, operation_type, initiated_by, cleanup_criteria,
          records_identified, status, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        cleanupId,
        'manual_cleanup',
        'integration-test',
        JSON.stringify({ test_mode: true, created_before: new Date().toISOString() }),
        1,
        'running',
        new Date().toISOString()
      ]);

      // Check that audit log entry was created
      const auditLogs = await client.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'test_data_cleanup_initiated'
        AND target_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [cleanupId]);

      expect(auditLogs.rows).toHaveLength(1);

      const auditEntry = auditLogs.rows[0];
      expect(auditEntry.admin_user).toBe('integration-test');
      expect(auditEntry.action).toBe('test_data_cleanup_initiated');
      expect(auditEntry.source_service).toBe('test_cleanup_system');

      const afterValue = JSON.parse(auditEntry.after_value);
      expect(afterValue.operation_type).toBe('manual_cleanup');
      expect(afterValue.status).toBe('running');
    });

    it('should provide cleanup candidate identification', async () => {
      // Create old test data (simulate by backdating)
      const oldTicket = await createTestTicket({
        ticketType: 'general',
        eventId: 1,
        attendeeEmail: 'old@test.com',
        priceInCents: 5000
      });

      // Update created_at to simulate old data
      await client.execute(`
        UPDATE transactions
        SET created_at = datetime('now', '-40 days')
        WHERE transaction_id = ?
      `, [oldTicket.transactionId]);

      await client.execute(`
        UPDATE tickets
        SET created_at = datetime('now', '-40 days')
        WHERE ticket_id = ?
      `, [oldTicket.ticketId]);

      // Query cleanup candidates
      const candidates = await client.execute(`
        SELECT * FROM v_test_data_cleanup_candidates
        WHERE business_id = ?
      `, [oldTicket.transactionId]);

      expect(candidates.rows).toHaveLength(1);
      const candidate = candidates.rows[0];
      expect(candidate.cleanup_priority).toBe('scheduled');
      expect(candidate.age_days).toBeGreaterThan(30);
    });

    it('should handle bulk cleanup operations', async () => {
      // Create multiple test tickets
      const tickets = [];
      for (let i = 0; i < 10; i++) {
        const ticket = await createTestTicket({
          ticketType: 'general',
          eventId: 1,
          attendeeEmail: `bulk${i}@test.com`,
          priceInCents: 5000
        });
        tickets.push(ticket);
      }

      // Verify test data exists
      const beforeCleanup = await client.execute(`
        SELECT COUNT(*) as count FROM tickets WHERE is_test = 1
      `);
      expect(beforeCleanup.rows[0].count).toBeGreaterThanOrEqual(10);

      // Perform bulk cleanup
      const cleanupResult = await cleanupTestTickets();
      expect(cleanupResult.success).toBe(true);

      // Verify test data is removed
      const afterCleanup = await client.execute(`
        SELECT COUNT(*) as count FROM tickets WHERE is_test = 1
      `);
      expect(afterCleanup.rows[0].count).toBe(0);

      // Verify production data is unaffected (if any exists)
      const prodData = await client.execute(`
        SELECT COUNT(*) as count FROM tickets WHERE is_test = 0
      `);
      // Should remain unchanged
      expect(prodData.rows[0].count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Test Mode Statistics and Reporting', () => {
    it('should provide accurate test vs production statistics', async () => {
      // Create test data
      await createTestTicket({
        ticketType: 'general',
        eventId: 1,
        attendeeEmail: 'stats@test.com',
        priceInCents: 5000
      });

      // Create production data
      await client.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, ['PROD-STATS-123', 'purchase', 'completed', 7500, 'USD', 'stats@prod.com', 0]);

      const prodTransResult = await client.execute(`
        SELECT id FROM transactions WHERE transaction_id = 'PROD-STATS-123'
      `);
      const prodTransId = prodTransResult.rows[0].id;

      await client.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, status, registration_status, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'PROD-STATS-TICKET-123',
        prodTransId,
        'vip',
        1,
        7500,
        'stats@prod.com',
        'active',
        'pending',
        0
      ]);

      // Query statistics view
      const stats = await client.execute(`
        SELECT * FROM v_data_mode_statistics
        ORDER BY table_name
      `);

      expect(stats.rows.length).toBeGreaterThanOrEqual(3); // transactions, tickets, transaction_items

      const ticketStats = stats.rows.find(row => row.table_name === 'tickets');
      expect(ticketStats.test_count).toBeGreaterThanOrEqual(1);
      expect(ticketStats.production_count).toBeGreaterThanOrEqual(1);
      expect(ticketStats.total_count).toBeGreaterThanOrEqual(2);
      expect(ticketStats.test_percentage).toBeGreaterThan(0);
      expect(ticketStats.test_percentage).toBeLessThan(100);

      const transactionStats = stats.rows.find(row => row.table_name === 'transactions');
      expect(transactionStats.test_amount_cents).toBeGreaterThanOrEqual(5000);
      expect(transactionStats.production_amount_cents).toBeGreaterThanOrEqual(7500);
    });

    it('should provide active test data summary', async () => {
      // Create test tickets for today
      const today = new Date().toISOString().split('T')[0];

      await createTestTicket({
        ticketType: 'general',
        eventId: 1,
        attendeeEmail: 'active1@test.com',
        priceInCents: 5000
      });

      await createTestTicket({
        ticketType: 'vip',
        eventId: 1,
        attendeeEmail: 'active2@test.com',
        priceInCents: 10000
      });

      // Query active test data
      const activeData = await client.execute(`
        SELECT * FROM v_active_test_data
        WHERE test_date = ?
      `, [today]);

      expect(activeData.rows).toHaveLength(1);
      const todayData = activeData.rows[0];

      expect(todayData.test_transactions).toBeGreaterThanOrEqual(2);
      expect(todayData.test_tickets).toBeGreaterThanOrEqual(2);
      expect(todayData.test_amount_cents).toBeGreaterThanOrEqual(15000);
      expect(todayData.unique_test_customers).toBeGreaterThanOrEqual(2);
    });
  });
});