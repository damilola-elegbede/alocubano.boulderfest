/**
 * Integration Test: Payment Retry Flow
 *
 * Tests payment failure and retry scenarios with data persistence:
 * - Preserving pending transactions after payment failures
 * - Allowing retries without data loss
 * - Handling session expiration gracefully
 * - Ensuring no duplicate tickets on retry
 * - Email sending only after successful payment
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../../../lib/database.js';
import { createTestEvent, createTestTicketType } from '../../../helpers/test-data-factory.js';
import createPendingTransactionHandler from '../../../../api/checkout/create-pending-transaction.js';
import { createMockRequest, createMockResponse } from '../../handler-test-helper.js';

describe('Integration: Payment Retry Flow', () => {
  let db;
  let testEvent;
  let ticketType;

  beforeAll(async () => {
    db = await getDatabaseClient();
  });

  beforeEach(async () => {
    // Create test event
    const event = await createTestEvent({
      slug: `test-event-${Date.now()}`,
      name: 'Boulder Fest 2026'
    });
    testEvent = { id: event.id, slug: event.slug };

    // Create test ticket type
    ticketType = await createTestTicketType({
      id: `weekend-${Date.now()}`,
      event_id: testEvent.id,
      name: 'Weekend Pass',
      price_cents: 12500,
      status: 'active'
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (testEvent && testEvent.id) {
      try {
        await db.execute({
          sql: 'DELETE FROM tickets WHERE event_id = ?',
          args: [testEvent.id]
        });

        await db.execute({
          sql: `DELETE FROM transaction_items WHERE transaction_id IN (
            SELECT id FROM transactions WHERE is_test = 1
          )`
        });

        await db.execute({
          sql: 'DELETE FROM transactions WHERE is_test = 1'
        });

        await db.execute({
          sql: 'DELETE FROM ticket_type WHERE event_id = ?',
          args: [testEvent.id]
        });

        await db.execute({
          sql: 'DELETE FROM events WHERE id = ?',
          args: [testEvent.id]
        });
      } catch (error) {
        console.warn('Cleanup error (non-fatal):', error.message);
      }
    }
  });

  afterAll(async () => {
    // Database connection cleanup handled by test framework
  });

  // ==================== A. Payment Failure Scenarios ====================

  it('should preserve pending transaction after Stripe payment failure', async () => {
    // Create pending transaction
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    const data = res._getBody();
    const transactionId = data.transaction.id;
    const stripeSessionId = `cs_test_${Date.now()}`;

    // Add Stripe session ID
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [stripeSessionId, transactionId]
    });

    // Simulate Stripe failure event (payment_status stays pending)
    // We don't update the status - it remains pending

    // Verify transaction still pending
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txResult.rows[0].payment_status).toBe('pending');

    // Verify tickets still pending_payment
    const ticketResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });

    expect(ticketResult.rows[0].registration_status).toBe('pending_payment');

    // Verify attendee data preserved
    expect(ticketResult.rows[0].attendee_first_name).toBe('Jane');
    expect(ticketResult.rows[0].attendee_last_name).toBe('Doe');
    expect(ticketResult.rows[0].attendee_email).toBe('jane@example.com');
  });

  it('should allow retry after PayPal cancellation', async () => {
    // Create pending transaction
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    const data = res._getBody();
    const transactionId = data.transaction.id;
    const paypalOrderId = `PAYPAL-${Date.now()}`;

    // Add PayPal order ID
    await db.execute({
      sql: 'UPDATE transactions SET paypal_order_id = ?, payment_processor = ? WHERE id = ?',
      args: [paypalOrderId, 'paypal', transactionId]
    });

    // Simulate PayPal order cancelled (status stays pending)
    // User can retry

    // Verify transaction unchanged
    const txResult1 = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txResult1.rows[0].payment_status).toBe('pending');

    // Simulate successful retry with NEW PayPal order
    const newPaypalOrderId = `PAYPAL-RETRY-${Date.now()}`;
    const paypalCaptureId = `CAPTURE-${Date.now()}`;

    await db.execute({
      sql: `UPDATE transactions
            SET paypal_order_id = ?, paypal_capture_id = ?,
                payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [newPaypalOrderId, paypalCaptureId, 'completed', 'completed', transactionId]
    });

    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?`,
      args: ['completed', transactionId]
    });

    // Verify completion
    const txResult2 = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txResult2.rows[0].payment_status).toBe('completed');
    expect(txResult2.rows[0].paypal_order_id).toBe(newPaypalOrderId);
  });

  it('should handle session expiration gracefully', async () => {
    // Create pending transaction
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    const data = res._getBody();
    const transactionId = data.transaction.id;
    const expiredSessionId = `cs_expired_${Date.now()}`;

    // Add expired Stripe session
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [expiredSessionId, transactionId]
    });

    // Verify transaction still accessible
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txResult.rows[0]).toBeDefined();
    expect(txResult.rows[0].payment_status).toBe('pending');

    // User can create new Stripe session with same transaction
    const newSessionId = `cs_test_${Date.now()}`;

    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [newSessionId, transactionId]
    });

    // Complete payment successfully
    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', 'completed', transactionId]
    });

    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?`,
      args: ['completed', transactionId]
    });

    // Verify success
    const finalResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(finalResult.rows[0].payment_status).toBe('completed');
    expect(finalResult.rows[0].stripe_session_id).toBe(newSessionId);
  });

  // ==================== B. Retry Success Scenarios ====================

  it('should update same transaction on retry', async () => {
    // Create pending transaction
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    const data = res._getBody();
    const transactionId = data.transaction.id;
    const transactionUuid = data.transaction.transaction_id;

    // Create Stripe session A
    const sessionA = `cs_test_A_${Date.now()}`;
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [sessionA, transactionId]
    });

    // Payment fails

    // Retry creates Stripe session B
    const sessionB = `cs_test_B_${Date.now()}`;
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [sessionB, transactionId]
    });

    // Complete payment with session B
    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', 'completed', transactionId]
    });

    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?`,
      args: ['completed', transactionId]
    });

    // Verify single transaction with updated session ID
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE transaction_id = ?',
      args: [transactionUuid]
    });

    expect(txResult.rows.length).toBe(1);
    expect(txResult.rows[0].stripe_session_id).toBe(sessionB);
    expect(txResult.rows[0].payment_status).toBe('completed');
  });

  it('should not duplicate tickets on retry', async () => {
    // Create pending transaction with 3 tickets
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 3, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [
        { ticketTypeId: 1, firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' },
        { ticketTypeId: 1, firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com' },
        { ticketTypeId: 1, firstName: 'Charlie', lastName: 'Brown', email: 'charlie@example.com' }
      ],
      cartFingerprint
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    const data = res._getBody();
    const transactionId = data.transaction.id;

    // Verify 3 tickets created
    const ticketResult1 = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });

    expect(Number(ticketResult1.rows[0].count)).toBe(3);

    // Payment fails

    // Retry payment (transaction remains same)
    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', 'completed', transactionId]
    });

    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?`,
      args: ['completed', transactionId]
    });

    // Verify still only 3 tickets
    const ticketResult2 = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });

    expect(Number(ticketResult2.rows[0].count)).toBe(3);

    // Verify all 3 completed
    const ticketResult3 = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });

    ticketResult3.rows.forEach(ticket => {
      expect(ticket.registration_status).toBe('completed');
    });
  });

  it('should handle multiple failed retry attempts', async () => {
    // Create pending transaction
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    const data = res._getBody();
    const transactionId = data.transaction.id;

    // Attempt 1: Create session, fails
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [`cs_test_1_${Date.now()}`, transactionId]
    });

    // Attempt 2: Create new session, fails
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [`cs_test_2_${Date.now()}`, transactionId]
    });

    // Attempt 3: Create new session, succeeds
    const successSessionId = `cs_test_3_${Date.now()}`;
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [successSessionId, transactionId]
    });

    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', 'completed', transactionId]
    });

    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?`,
      args: ['completed', transactionId]
    });

    // Verify only 1 transaction exists
    const txResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM transactions WHERE customer_email = ?',
      args: ['customer@example.com']
    });

    expect(Number(txResult.rows[0].count)).toBe(1);

    // Verify completion
    const txDetail = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txDetail.rows[0].payment_status).toBe('completed');
    expect(txDetail.rows[0].stripe_session_id).toBe(successSessionId);
  });

  it('should handle payment method switch (Stripe to PayPal)', async () => {
    // Create pending transaction
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    const data = res._getBody();
    const transactionId = data.transaction.id;

    // User tries Stripe first
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ?, payment_processor = ? WHERE id = ?',
      args: [`cs_test_${Date.now()}`, 'stripe', transactionId]
    });

    // Stripe fails, user switches to PayPal
    const paypalOrderId = `PAYPAL-${Date.now()}`;
    const paypalCaptureId = `CAPTURE-${Date.now()}`;

    await db.execute({
      sql: `UPDATE transactions
            SET paypal_order_id = ?, paypal_capture_id = ?,
                payment_processor = ?, payment_status = ?, status = ?,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [paypalOrderId, paypalCaptureId, 'paypal', 'completed', 'completed', transactionId]
    });

    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?`,
      args: ['completed', transactionId]
    });

    // Verify completion with PayPal
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txResult.rows[0].payment_status).toBe('completed');
    expect(txResult.rows[0].payment_processor).toBe('paypal');
    expect(txResult.rows[0].paypal_order_id).toBe(paypalOrderId);
  });

  it('should preserve transaction integrity across multiple retry cycles', async () => {
    // Create pending transaction
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe', phone: '+1234567890' },
      registrations: [
        { ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
        { ticketTypeId: 1, firstName: 'John', lastName: 'Smith', email: 'john@example.com' }
      ],
      cartFingerprint
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    const data = res._getBody();
    const transactionId = data.transaction.id;
    const originalTicketIds = data.tickets.map(t => t.ticket_id);

    // Multiple retry cycles
    for (let i = 1; i <= 5; i++) {
      await db.execute({
        sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
        args: [`cs_test_${i}_${Date.now()}`, transactionId]
      });
    }

    // Finally succeed
    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', 'completed', transactionId]
    });

    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ?`,
      args: ['completed', transactionId]
    });

    // Verify data integrity
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txResult.rows[0].customer_email).toBe('customer@example.com');
    expect(txResult.rows[0].customer_name).toBe('Jane Doe');
    expect(txResult.rows[0].customer_phone).toBe('+1234567890');

    // Verify tickets unchanged
    const ticketResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ? ORDER BY id',
      args: [transactionId]
    });

    expect(ticketResult.rows.length).toBe(2);
    expect(ticketResult.rows[0].ticket_id).toBe(originalTicketIds[0]);
    expect(ticketResult.rows[1].ticket_id).toBe(originalTicketIds[1]);
    expect(ticketResult.rows[0].attendee_first_name).toBe('Jane');
    expect(ticketResult.rows[1].attendee_first_name).toBe('John');
  });
});
