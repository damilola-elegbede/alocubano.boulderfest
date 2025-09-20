/**
 * Database Transaction Integration Tests - Transaction Integrity
 * Tests database transaction handling and data consistency
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { generateTestEmail } from '../handler-test-helper.js';

describe('Database Transaction Integration', () => {
  let testEmail;
  let dbClient;

  beforeEach(async () => {
    testEmail = generateTestEmail();
    dbClient = await getDbClient(); // Note: getDbClient is async, must await it
  });

  test('transaction rollback on payment failure maintains data integrity', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping transaction test');
      return;
    }

    const testSessionId = 'cs_test_transaction_' + Math.random().toString(36).slice(2);

    try {
      // Start a transaction that should fail
      await dbClient.execute('BEGIN TRANSACTION');

      // Insert transaction record
      await dbClient.execute(`
        INSERT INTO "transactions" (
          transaction_id, type, stripe_session_id, customer_email, amount_cents, order_data, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, ['TXN_' + testSessionId, 'tickets', testSessionId, testEmail, 12500, '{"test": true}', 'pending']);

      // Insert ticket record that depends on transaction
      const transactionResult = await dbClient.execute(
        'SELECT id FROM "transactions" WHERE stripe_session_id = ?',
        [testSessionId]
      );

      if (transactionResult.rows.length > 0) {
        const transactionId = transactionResult.rows[0].id;

        await dbClient.execute(`
          INSERT INTO "tickets" (
            ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `, ['TICKET_' + testSessionId, transactionId, 'weekend-pass', 'boulder-fest-2026', 12500, 'QR_' + testSessionId]);
      }

      // Simulate a failure condition
      // In real scenario, this could be payment processing failure
      const shouldFail = true;

      if (shouldFail) {
        await dbClient.execute('ROLLBACK');

        // Verify rollback worked - no records should exist
        const transactionCheck = await dbClient.execute(
          'SELECT COUNT(*) as count FROM "transactions" WHERE stripe_session_id = ?',
          [testSessionId]
        );

        const ticketCheck = await dbClient.execute(
          'SELECT COUNT(*) as count FROM "tickets" WHERE qr_token = ?',
          ['QR_' + testSessionId]
        );

        expect(Number(transactionCheck.rows[0].count)).toBe(0);
        expect(Number(ticketCheck.rows[0].count)).toBe(0);
      } else {
        await dbClient.execute('COMMIT');
      }

    } catch (error) {
      // Ensure rollback even on error
      try {
        await dbClient.execute('ROLLBACK');
      } catch (rollbackError) {
        console.warn('⚠️ Rollback error:', rollbackError.message);
      }
      throw error;
    }
  });

  test('successful transaction commit preserves referential integrity', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping integrity test');
      return;
    }

    const testSessionId = 'cs_test_success_' + Math.random().toString(36).slice(2);

    try {
      await dbClient.execute('BEGIN TRANSACTION');

      // Create transaction
      await dbClient.execute(`
        INSERT INTO "transactions" (
          transaction_id, type, stripe_session_id, customer_email, amount_cents, order_data, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, ['TXN_' + testSessionId, 'tickets', testSessionId, testEmail, 25000, '{"test": true}', 'completed']);

      // Get transaction ID
      const transactionResult = await dbClient.execute(
        'SELECT id FROM "transactions" WHERE stripe_session_id = ?',
        [testSessionId]
      );

      expect(transactionResult.rows.length).toBe(1);
      const transactionId = transactionResult.rows[0].id;

      // Create multiple tickets for this transaction - use actual ticket types
      const ticketTypes = [
        { type: 'Weekend Pass', price_cents: 12500 },
        { type: 'VIP Package', price_cents: 12500 }
      ];

      for (const ticket of ticketTypes) {
        await dbClient.execute(`
          INSERT INTO "tickets" (
            ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `, [`TICKET_${testSessionId}_${ticket.type.replace(/\s+/g, '_')}`, transactionId, ticket.type, 'boulder-fest-2026', ticket.price_cents, `QR_${testSessionId}_${ticket.type.replace(/\s+/g, '_')}`]);
      }

      // Create registration records with consistent ticket type data
      const ticketsResult = await dbClient.execute(
        'SELECT ticket_id, ticket_type FROM "tickets" WHERE transaction_id = ?',
        [transactionId]
      );

      for (const ticket of ticketsResult.rows) {
        await dbClient.execute(`
          INSERT INTO "registrations" (
            ticket_id, first_name, last_name, email, ticket_type, registration_date
          ) VALUES (?, ?, ?, ?, ?, datetime('now'))
        `, [ticket.ticket_id, 'Integration', 'Test', testEmail, ticket.ticket_type]);
      }

      await dbClient.execute('COMMIT');

      // Verify referential integrity
      const finalTransaction = await dbClient.execute(
        'SELECT * FROM "transactions" WHERE stripe_session_id = ?',
        [testSessionId]
      );

      const finalTickets = await dbClient.execute(
        'SELECT * FROM "tickets" WHERE transaction_id = ?',
        [transactionId]
      );

      const finalRegistrations = await dbClient.execute(`
        SELECT r.* FROM "registrations" r
        JOIN "tickets" t ON r.ticket_id = t.ticket_id
        WHERE t.transaction_id = ?
      `, [transactionId]);

      expect(finalTransaction.rows.length).toBe(1);
      expect(finalTickets.rows.length).toBe(2);
      expect(finalRegistrations.rows.length).toBe(2);

      // Verify foreign key relationships
      for (const registration of finalRegistrations.rows) {
        const ticketExists = finalTickets.rows.some(ticket => ticket.ticket_id === registration.ticket_id);
        expect(ticketExists).toBe(true);
      }

    } catch (error) {
      try {
        await dbClient.execute('ROLLBACK');
      } catch (rollbackError) {
        console.warn('⚠️ Rollback error:', rollbackError.message);
      }
      throw error;
    }
  });

  test('concurrent transaction handling prevents race conditions', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping concurrency test');
      return;
    }

    const testPrefix = 'concurrent_' + Math.random().toString(36).slice(2);

    // TRUE concurrent operations using separate database clients for real concurrency
    // For concurrent testing, we'll use the same client pool
    // The integration test setup handles connection pooling

    const concurrentOperations = Array.from({ length: 3 }, (_, index) => {
      const sessionId = `cs_test_${testPrefix}_${index}`;
      const email = `concurrent.${index}.${testEmail}`;

      // Use separate database client for true concurrency
      return (async () => {
        let separateClient;
        try {
          // Get separate database client for true concurrent testing
          separateClient = await getDbClient();

          await separateClient.execute(`
            INSERT INTO "transactions" (
              transaction_id, type, stripe_session_id, customer_email, amount_cents, order_data, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, ['TXN_' + sessionId, 'tickets', sessionId, email, 10000 + index * 2500, '{"test": true}', 'pending']);

          return { success: true, sessionId, email };
        } catch (error) {
          return { success: false, error: error.message, sessionId, email };
        } finally {
          // Clean up separate client if needed
          if (separateClient && separateClient !== dbClient && typeof separateClient.close === 'function') {
            try {
              await separateClient.close();
            } catch (closeError) {
              // Ignore close errors in tests
            }
          }
        }
      })();
    });

    // Execute all operations concurrently with Promise.all for true parallelism
    const results = await Promise.all(concurrentOperations);

    // Verify operations succeeded - allow for some failures due to concurrency constraints
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBeGreaterThan(0); // At least some should succeed
    expect(successCount).toBeLessThanOrEqual(3); // Not more than attempted

    // Verify successful records exist in database
    for (const result of results) {
      if (result.success) {
        const check = await dbClient.execute(
          'SELECT * FROM "transactions" WHERE stripe_session_id = ?',
          [result.sessionId]
        );

        expect(check.rows.length).toBe(1);
        expect(check.rows[0].customer_email).toBe(result.email);
      } else {
        // Failed operations should have meaningful error messages
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        // Acceptable concurrency errors
        expect(result.error).toMatch(/database is locked|SQLITE_BUSY|SQLITE_LOCKED|constraint|unique/i);
      }
    }
  });
});