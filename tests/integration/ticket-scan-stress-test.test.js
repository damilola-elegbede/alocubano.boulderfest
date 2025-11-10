/**
 * Ticket Scan Stress Test
 * Tests high-volume scanning with no time-based rate limiting
 * Validates that 1000 tickets can be scanned in under 60 seconds
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { testRequest, generateTestEmail, HTTP_STATUS } from './handler-test-helper.js';
import { getDbClient } from '../setup-integration.js';

describe('Ticket Scan Stress Test', () => {
  let dbClient;

  beforeAll(async () => {
    dbClient = await getDbClient();
  });

  test('should scan 1000 different tickets in under 60 seconds', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping stress test');
      return;
    }

    const TICKET_COUNT = 1000;
    const MAX_TIME_MS = 60000; // 60 seconds
    const startTime = Date.now();

    console.log(`\n🚀 Starting stress test: ${TICKET_COUNT} tickets`);
    console.log(`⏱️  Target: < ${MAX_TIME_MS}ms (${MAX_TIME_MS / 1000}s)`);

    try {
      // Create test transaction
      const testSessionId = 'stress_test_' + Date.now();
      const testEmail = generateTestEmail();

      await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, stripe_session_id, customer_email,
          amount_cents, order_data, status, created_at, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
        args: ['TXN_' + testSessionId, 'tickets', testSessionId, testEmail, 0, '{"test": true}', 'completed', 1]
      });

      const transactionResult = await dbClient.execute({
        sql: 'SELECT id FROM transactions WHERE stripe_session_id = ?',
        args: [testSessionId]
      });
      const transactionId = transactionResult.rows[0].id;

      // Create 1000 tickets
      const tickets = [];
      console.log('📝 Creating tickets...');

      for (let i = 0; i < TICKET_COUNT; i++) {
        const ticketId = `STRESS-${testSessionId}-${i.toString().padStart(4, '0')}`;
        await dbClient.execute({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, ticket_type_id, event_id, event_date,
            price_cents, attendee_first_name, attendee_last_name,
            registration_status, status, created_at, is_test, max_scan_count, scan_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
          args: [
            ticketId,
            transactionId,
            'Stress Test Pass',
            'stress-test',
            'stress-test-2026',
            '2026-05-15',
            0,
            `Test${i}`,
            'User',
            'pending',
            'valid',
            1,
            3, // max_scan_count
            0  // scan_count
          ]
        });
        tickets.push(ticketId);
      }

      console.log(`✅ Created ${TICKET_COUNT} tickets`);
      console.log('🔍 Starting scans...');

      // Scan all tickets
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      for (let i = 0; i < tickets.length; i++) {
        try {
          // Get ticket to create JWT
          const ticketResult = await dbClient.execute({
            sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
            args: [tickets[i]]
          });

          if (ticketResult.rows.length === 0) {
            errorCount++;
            continue;
          }

          // Create a simple validation request (direct ticket_id)
          const validationData = {
            token: tickets[i], // Using ticket_id directly for stress test
            validateOnly: false
          };

          const response = await testRequest('POST', '/api/tickets/validate', validationData);

          if (response.status === HTTP_STATUS.OK || response.status === 200) {
            successCount++;
          } else {
            errorCount++;
            if (errorCount <= 5) { // Only log first 5 errors
              errors.push({
                ticket: tickets[i],
                status: response.status,
                error: response.data?.error || 'Unknown error'
              });
            }
          }

          // Log progress every 100 tickets
          if ((i + 1) % 100 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const rate = ((i + 1) / (Date.now() - startTime) * 1000).toFixed(1);
            console.log(`   Progress: ${i + 1}/${TICKET_COUNT} (${elapsed}s, ${rate} scans/sec)`);
          }
        } catch (err) {
          errorCount++;
          if (errorCount <= 5) {
            errors.push({
              ticket: tickets[i],
              error: err.message
            });
          }
        }
      }

      const totalTime = Date.now() - startTime;
      const scansPerSecond = (successCount / (totalTime / 1000)).toFixed(2);

      console.log('\n📊 Stress Test Results:');
      console.log(`   Total time: ${(totalTime / 1000).toFixed(2)}s`);
      console.log(`   Successful scans: ${successCount}/${TICKET_COUNT}`);
      console.log(`   Failed scans: ${errorCount}`);
      console.log(`   Throughput: ${scansPerSecond} scans/second`);

      if (errors.length > 0) {
        console.log('\n⚠️  Sample errors:');
        errors.forEach((err, idx) => {
          console.log(`   ${idx + 1}. ${err.ticket}: ${err.error || `Status ${err.status}`}`);
        });
      }

      // Assertions
      expect(totalTime).toBeLessThan(MAX_TIME_MS);
      expect(successCount).toBeGreaterThan(TICKET_COUNT * 0.95); // At least 95% success rate

    } catch (error) {
      console.error('❌ Stress test error:', error);
      throw error;
    }
  }, 120000); // 2 minute timeout for test

  test('should enforce 3-scan limit per ticket under stress', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping scan limit test');
      return;
    }

    console.log('\n🔒 Testing 3-scan limit enforcement...');

    try {
      // Create single test ticket
      const testSessionId = 'limit_test_' + Date.now();
      const testEmail = generateTestEmail();

      await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, stripe_session_id, customer_email,
          amount_cents, order_data, status, created_at, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
        args: ['TXN_' + testSessionId, 'tickets', testSessionId, testEmail, 0, '{"test": true}', 'completed', 1]
      });

      const transactionResult = await dbClient.execute({
        sql: 'SELECT id FROM transactions WHERE stripe_session_id = ?',
        args: [testSessionId]
      });
      const transactionId = transactionResult.rows[0].id;

      const ticketId = `LIMIT-${testSessionId}`;
      await dbClient.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, ticket_type_id, event_id, event_date,
          price_cents, attendee_first_name, attendee_last_name,
          registration_status, status, created_at, is_test, max_scan_count, scan_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
        args: [
          ticketId, transactionId, 'Limit Test', 'limit-test', 'test-2026',
          '2026-05-15', 0, 'Limit', 'Test', 'pending', 'valid', 1, 3, 0
        ]
      });

      // Attempt to scan 10 times
      const results = [];
      for (let i = 0; i < 10; i++) {
        const response = await testRequest('POST', '/api/tickets/validate', {
          token: ticketId,
          validateOnly: false
        });
        results.push({
          scanNumber: i + 1,
          status: response.status,
          valid: response.data?.valid,
          error: response.data?.error
        });
      }

      // Check scan results
      const successfulScans = results.filter(r => r.valid === true).length;
      const blockedScans = results.filter(r => r.valid === false).length;

      console.log(`   Successful scans: ${successfulScans}/10`);
      console.log(`   Blocked scans: ${blockedScans}/10`);

      // Verify 3-scan limit
      expect(successfulScans).toBeLessThanOrEqual(3);
      expect(blockedScans).toBeGreaterThanOrEqual(7);

      // Verify blocked scans have correct error message
      const blockedResults = results.filter(r => r.valid === false);
      blockedResults.forEach(result => {
        expect(result.error).toMatch(/scan limit|maximum/i);
      });

    } catch (error) {
      console.error('❌ Scan limit test error:', error);
      throw error;
    }
  }, 30000); // 30 second timeout

  test('should handle 100 tickets with 3 scans each (300 total scans)', async () => {
    if (!dbClient) {
      console.warn('⚠️ Database client unavailable - skipping concurrent scan test');
      return;
    }

    const TICKET_COUNT = 100;
    const SCANS_PER_TICKET = 3;
    const TOTAL_SCANS = TICKET_COUNT * SCANS_PER_TICKET;

    console.log(`\n🔄 Testing ${TICKET_COUNT} tickets × ${SCANS_PER_TICKET} scans = ${TOTAL_SCANS} total scans`);

    const startTime = Date.now();

    try {
      // Create test transaction
      const testSessionId = 'concurrent_' + Date.now();
      const testEmail = generateTestEmail();

      await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, stripe_session_id, customer_email,
          amount_cents, order_data, status, created_at, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
        args: ['TXN_' + testSessionId, 'tickets', testSessionId, testEmail, 0, '{"test": true}', 'completed', 1]
      });

      const transactionResult = await dbClient.execute({
        sql: 'SELECT id FROM transactions WHERE stripe_session_id = ?',
        args: [testSessionId]
      });
      const transactionId = transactionResult.rows[0].id;

      // Create tickets
      const tickets = [];
      for (let i = 0; i < TICKET_COUNT; i++) {
        const ticketId = `CONC-${testSessionId}-${i}`;
        await dbClient.execute({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, ticket_type_id, event_id, event_date,
            price_cents, attendee_first_name, attendee_last_name,
            registration_status, status, created_at, is_test, max_scan_count, scan_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
          args: [
            ticketId, transactionId, 'Concurrent Test', 'concurrent', 'test-2026',
            '2026-05-15', 0, `User${i}`, 'Test', 'pending', 'valid', 1, 3, 0
          ]
        });
        tickets.push(ticketId);
      }

      // Scan each ticket 3 times
      let successCount = 0;
      for (const ticket of tickets) {
        for (let scan = 0; scan < SCANS_PER_TICKET; scan++) {
          const response = await testRequest('POST', '/api/tickets/validate', {
            token: ticket,
            validateOnly: false
          });

          if (response.data?.valid === true) {
            successCount++;
          }
        }
      }

      const totalTime = Date.now() - startTime;
      const scansPerSecond = (successCount / (totalTime / 1000)).toFixed(2);

      console.log(`   Time: ${(totalTime / 1000).toFixed(2)}s`);
      console.log(`   Successful: ${successCount}/${TOTAL_SCANS}`);
      console.log(`   Throughput: ${scansPerSecond} scans/second`);

      // Verify all valid scans succeeded
      expect(successCount).toBe(TOTAL_SCANS);

      // Verify scan counts in database
      for (const ticket of tickets) {
        const result = await dbClient.execute({
          sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
          args: [ticket]
        });
        expect(result.rows[0].scan_count).toBe(SCANS_PER_TICKET);
      }

    } catch (error) {
      console.error('❌ Concurrent scan test error:', error);
      throw error;
    }
  }, 60000); // 60 second timeout
});
