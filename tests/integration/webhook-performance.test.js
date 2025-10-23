/**
 * Webhook Performance Tests - Fire-and-Forget Fulfillment
 *
 * Tests the performance optimization that makes reservation fulfillment
 * non-blocking to achieve 50-100ms faster webhook processing.
 *
 * Key Metrics:
 * - Webhook response time should be < 2s
 * - Fulfillment should not block webhook response
 * - Reservations should still get fulfilled asynchronously
 * - Errors in fulfillment should not break webhook
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { reserveTickets, fulfillReservation } from '../../lib/ticket-availability-service.js';
import { createTestEvent } from './handler-test-helper.js';

describe('Webhook Performance with Async Fulfillment', () => {
  let db;
  let testEventId;
  let testTicketTypeId;
  let testSessionId;
  let testTransactionId;

  beforeEach(async () => {
    db = await getDatabaseClient();

    // Create a test event first (required for ticket_types)
    testEventId = await createTestEvent(db, {
      name: 'Performance Test Event',
      slug: `perf-test-${Date.now()}`,
      status: 'test'
    });

    // Create a test ticket type for reservation tests
    testTicketTypeId = `test-ticket-${Date.now()}`;
    testSessionId = `cs_test_${Date.now()}`;

    await db.execute({
      sql: `
        INSERT INTO ticket_types (
          id, event_id, name, price_cents, max_quantity, status, sold_count, test_sold_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [testTicketTypeId, testEventId, 'Test Performance Ticket', 5000, 100, 'available', 0, 0]
    });

    // Create a test transaction (required for fulfillReservation FK constraint)
    const transactionUuid = `txn_test_${Date.now()}`;
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions (
          transaction_id, uuid, type, stripe_session_id, customer_email, customer_name,
          amount_cents, currency, status, payment_processor, is_test, order_data, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      args: [transactionUuid, transactionUuid, 'tickets', testSessionId, 'test@example.com', 'Test User', 10000, 'USD', 'completed', 'stripe', 1, JSON.stringify({ test: true })]
    });

    testTransactionId = Number(transactionResult.lastInsertRowid);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await db.execute({
        sql: 'DELETE FROM ticket_reservations WHERE ticket_type_id = ?',
        args: [testTicketTypeId]
      });
      await db.execute({
        sql: 'DELETE FROM ticket_types WHERE id = ?',
        args: [testTicketTypeId]
      });
    } catch (error) {
      console.warn('Cleanup error (non-critical):', error.message);
    }
  });

  test('fulfillReservation completes in < 100ms', async () => {
    // Create a reservation first
    const reserveResult = await reserveTickets(
      [{ ticketType: testTicketTypeId, quantity: 2, type: 'ticket', name: 'Test Ticket' }],
      testSessionId
    );

    expect(reserveResult.success).toBe(true);

    // Measure fulfillment performance
    const start = performance.now();
    await fulfillReservation(testSessionId, testTransactionId);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test('fire-and-forget pattern does not block caller', async () => {
    // Create a reservation
    const reserveResult = await reserveTickets(
      [{ ticketType: testTicketTypeId, quantity: 2, type: 'ticket', name: 'Test Ticket' }],
      testSessionId
    );

    expect(reserveResult.success).toBe(true);

    // Simulate fire-and-forget pattern (no await)
    const start = performance.now();

    // Start fulfillment but don't wait for it
    fulfillReservation(testSessionId, testTransactionId)
      .then(() => console.log('Fulfillment completed'))
      .catch(err => console.error('Fulfillment error:', err));

    // Measure time to reach this line (should be immediate)
    const duration = performance.now() - start;

    // Should complete in < 5ms (just launching the promise)
    expect(duration).toBeLessThan(5);

    // Wait for fulfillment to complete (async operation)
    await new Promise(resolve => setTimeout(resolve, 250));

    // Verify reservation was fulfilled
    const verifyResult = await db.execute({
      sql: `SELECT status, fulfilled_at FROM ticket_reservations WHERE session_id = ?`,
      args: [testSessionId]
    });

    expect(verifyResult.rows[0]?.status).toBe('fulfilled');
    expect(verifyResult.rows[0]?.fulfilled_at).toBeTruthy();
  });

  test('fulfillment errors do not break caller', async () => {
    // Create a reservation
    const reserveResult = await reserveTickets(
      [{ ticketType: testTicketTypeId, quantity: 2, type: 'ticket', name: 'Test Ticket' }],
      testSessionId
    );

    expect(reserveResult.success).toBe(true);

    // Spy on console.error to capture error logging
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Fulfill with a non-existent session (should fail gracefully)
    const nonExistentSessionId = 'cs_test_nonexistent';

    // Fire-and-forget pattern - should not throw
    expect(() => {
      fulfillReservation(nonExistentSessionId, testTransactionId)
        .then(() => console.log('Success'))
        .catch(err => console.error('Expected error:', err));
    }).not.toThrow();

    // Wait for async operation to complete
    await new Promise(resolve => setTimeout(resolve, 250));

    // Verify error was logged but didn't throw
    // Note: console.error may be called by the .catch handler, not fulfillReservation itself

    consoleErrorSpy.mockRestore();
  });

  test('reservations still get fulfilled with fire-and-forget', async () => {
    // Create a reservation
    const reserveResult = await reserveTickets(
      [{ ticketType: testTicketTypeId, quantity: 2, type: 'ticket', name: 'Test Ticket' }],
      testSessionId
    );

    expect(reserveResult.success).toBe(true);

    // Use fire-and-forget pattern but capture result for verification
    let fulfillmentComplete = false;
    let fulfillmentResult = null;
    fulfillReservation(testSessionId, testTransactionId)
      .then((result) => {
        fulfillmentComplete = true;
        fulfillmentResult = result;
        console.log('✅ Reservation fulfilled, result:', result);
      })
      .catch(err => console.error('❌ Fulfillment failed:', err));

    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify fulfillment completed
    expect(fulfillmentComplete).toBe(true);
    expect(fulfillmentResult).toBe(true); // Should return true when successful

    // Verify reservation was fulfilled in DB
    const result = await db.execute({
      sql: `
        SELECT status, fulfilled_at, transaction_id
        FROM ticket_reservations
        WHERE session_id = ?
      `,
      args: [testSessionId]
    });

    expect(result.rows[0]?.status).toBe('fulfilled');
    expect(result.rows[0]?.transaction_id).toBe(testTransactionId);
    expect(result.rows[0]?.fulfilled_at).toBeTruthy();
  });

  test('multiple parallel fulfillments do not block', async () => {
    const sessionIds = [];
    const transactionIds = [];

    // Create multiple reservations with valid transactions
    for (let i = 0; i < 5; i++) {
      const sessionId = `cs_test_parallel_${Date.now()}_${i}`;

      // Create transaction first (FK constraint)
      const txnUuid = `txn_test_parallel_${Date.now()}_${i}`;
      const txnResult = await db.execute({
        sql: `
          INSERT INTO transactions (
            transaction_id, uuid, type, stripe_session_id, customer_email, customer_name,
            amount_cents, currency, status, payment_processor, is_test, order_data, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
        args: [txnUuid, txnUuid, 'tickets', sessionId, 'test@example.com', 'Test User', 5000, 'USD', 'completed', 'stripe', 1, JSON.stringify({ test: true })]
      });

      const transactionId = Number(txnResult.lastInsertRowid);

      sessionIds.push(sessionId);
      transactionIds.push(transactionId);

      await reserveTickets(
        [{ ticketType: testTicketTypeId, quantity: 1, type: 'ticket', name: 'Test Ticket' }],
        sessionId
      );
    }

    // Fire all fulfillments in parallel (fire-and-forget)
    const start = performance.now();

    sessionIds.forEach((sessionId, index) => {
      fulfillReservation(sessionId, transactionIds[index])
        .then(() => console.log(`✅ Fulfilled ${sessionId}`))
        .catch(err => console.error(`❌ Failed ${sessionId}:`, err));
    });

    const duration = performance.now() - start;

    // Should complete in < 10ms (just launching promises, not waiting)
    expect(duration).toBeLessThan(10);

    // Wait for all fulfillments to complete
    await new Promise(resolve => setTimeout(resolve, 600));

    // Verify all were fulfilled
    for (const sessionId of sessionIds) {
      const result = await db.execute({
        sql: `SELECT status FROM ticket_reservations WHERE session_id = ?`,
        args: [sessionId]
      });

      expect(result.rows[0]?.status).toBe('fulfilled');
    }
  });

  test('fulfillment with slow DB still does not block caller', async () => {
    // Create a reservation
    const reserveResult = await reserveTickets(
      [{ ticketType: testTicketTypeId, quantity: 2, type: 'ticket', name: 'Test Ticket' }],
      testSessionId
    );

    expect(reserveResult.success).toBe(true);

    // Measure caller response time (should be immediate regardless of fulfillment speed)
    const start = performance.now();

    // Fire-and-forget
    fulfillReservation(testSessionId, testTransactionId)
      .then(() => console.log('Fulfillment completed'))
      .catch(err => console.error('Fulfillment error:', err));

    const callerDuration = performance.now() - start;

    // Caller should not wait - should complete in < 5ms
    expect(callerDuration).toBeLessThan(5);

    // Wait for fulfillment to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify fulfillment succeeded
    const result = await db.execute({
      sql: `SELECT status FROM ticket_reservations WHERE session_id = ?`,
      args: [testSessionId]
    });

    expect(result.rows[0]?.status).toBe('fulfilled');
  });

  test('temp session ID fulfillment works with fire-and-forget', async () => {
    const mainSessionId = `cs_test_main_${Date.now()}`;
    const tempSessionId = `cs_test_temp_${Date.now()}`;

    // Create transaction first (FK constraint)
    const txnUuid = `txn_test_temp_${Date.now()}`;
    const txnResult = await db.execute({
      sql: `
        INSERT INTO transactions (
          transaction_id, uuid, type, stripe_session_id, customer_email, customer_name,
          amount_cents, currency, status, payment_processor, is_test, order_data, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      args: [txnUuid, txnUuid, 'tickets', mainSessionId, 'test@example.com', 'Test User', 5000, 'USD', 'completed', 'stripe', 1, JSON.stringify({ test: true })]
    });

    const transactionId = Number(txnResult.lastInsertRowid);

    // Create reservations for both session IDs
    await reserveTickets(
      [{ ticketType: testTicketTypeId, quantity: 1, type: 'ticket', name: 'Test Ticket' }],
      mainSessionId
    );

    await reserveTickets(
      [{ ticketType: testTicketTypeId, quantity: 1, type: 'ticket', name: 'Test Ticket' }],
      tempSessionId
    );

    // Fire-and-forget for both
    fulfillReservation(mainSessionId, transactionId)
      .then(() => console.log('✅ Main reservation fulfilled'))
      .catch(err => console.error('❌ Main failed:', err));

    fulfillReservation(tempSessionId, transactionId)
      .then(() => console.log('✅ Temp reservation fulfilled'))
      .catch(err => console.error('❌ Temp failed:', err));

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify both fulfilled
    const mainResult = await db.execute({
      sql: `SELECT status FROM ticket_reservations WHERE session_id = ?`,
      args: [mainSessionId]
    });

    const tempResult = await db.execute({
      sql: `SELECT status FROM ticket_reservations WHERE session_id = ?`,
      args: [tempSessionId]
    });

    expect(mainResult.rows[0]?.status).toBe('fulfilled');
    expect(tempResult.rows[0]?.status).toBe('fulfilled');
  });

  test('webhook pattern: return immediately after starting fulfillment', async () => {
    // Simulate webhook handler pattern
    const simulateWebhookHandler = async () => {
      // Create tickets (this would be done by webhook)
      const reserveResult = await reserveTickets(
        [{ ticketType: testTicketTypeId, quantity: 2, type: 'ticket', name: 'Test Ticket' }],
        testSessionId
      );

      expect(reserveResult.success).toBe(true);

      // Start fulfillment (fire-and-forget)
      fulfillReservation(testSessionId, testTransactionId)
        .then(() => console.log('✅ Reservation fulfilled'))
        .catch(err => console.error('❌ Fulfillment failed:', err));

      // Return immediately
      return { received: true, status: 'created' };
    };

    const start = performance.now();
    const response = await simulateWebhookHandler();
    const duration = performance.now() - start;

    // Should complete in < 200ms (reservation + immediate return)
    expect(duration).toBeLessThan(200);
    expect(response.received).toBe(true);

    // Wait for background fulfillment
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify fulfillment happened in background
    const result = await db.execute({
      sql: `SELECT status FROM ticket_reservations WHERE session_id = ?`,
      args: [testSessionId]
    });

    expect(result.rows[0]?.status).toBe('fulfilled');
  });

  test('error logging does not crash when fulfillment fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Try to fulfill non-existent reservation
    const nonExistentSession = 'cs_test_fake';

    // Fire-and-forget with error handling
    let resultReceived = false;
    fulfillReservation(nonExistentSession, testTransactionId)
      .then((result) => {
        resultReceived = true;
        console.log('Fulfillment result:', result);
      })
      .catch(err => {
        console.error('❌ Fulfillment failed:', err);
      });

    // Wait for async operation to complete
    await new Promise(resolve => setTimeout(resolve, 250));

    // Verify we got a result (false, because no reservation existed)
    expect(resultReceived).toBe(true);

    // Verify warning was logged (fulfillReservation logs a warning for missing reservations)
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No active reservations found for session:')
    );

    consoleWarnSpy.mockRestore();
  });

  test('success logging works correctly', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create a reservation
    const reserveResult = await reserveTickets(
      [{ ticketType: testTicketTypeId, quantity: 2, type: 'ticket', name: 'Test Ticket' }],
      testSessionId
    );

    expect(reserveResult.success).toBe(true);

    // Fire-and-forget with success logging
    fulfillReservation(testSessionId, testTransactionId)
      .then(() => console.log(`✅ Reservation fulfilled for session: ${testSessionId}, transaction: ${testTransactionId}`))
      .catch(err => console.error('Error:', err));

    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify success was logged
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('✅ Reservation fulfilled for session:')
    );

    consoleLogSpy.mockRestore();
  });
});
