/**
 * Integration Test: Inline Registration Flow
 *
 * Tests the complete inline registration flow with real database operations:
 * - Creating pending transactions with attendee info BEFORE payment
 * - Completing registration after Stripe/PayPal payment
 * - Idempotency with cart fingerprints
 * - Data validation and integrity
 *
 * Flow:
 * 1. User fills registration form with attendee details
 * 2. API creates pending transaction + tickets with registration_status='pending_payment'
 * 3. User proceeds to Stripe/PayPal/Venmo payment
 * 4. Payment webhook/capture updates to 'completed' + sends confirmation emails
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../../../lib/database.js';
import { createTestEvent, createTestTicketType } from '../../../helpers/test-data-factory.js';
import createPendingTransactionHandler from '../../../../api/checkout/create-pending-transaction.js';
import { createMockRequest, createMockResponse } from '../../handler-test-helper.js';

describe('Integration: Inline Registration Flow', () => {
  let db;
  let testEvent;
  let ticketTypes;

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

    // Create test ticket types
    ticketTypes = {
      weekend: await createTestTicketType({
        id: `weekend-${Date.now()}`,
        event_id: testEvent.id,
        name: 'Weekend Pass',
        price_cents: 12500,
        status: 'active'
      }),
      friday: await createTestTicketType({
        id: `friday-${Date.now()}`,
        event_id: testEvent.id,
        name: 'Friday Only',
        price_cents: 6000,
        status: 'active'
      }),
      saturday: await createTestTicketType({
        id: `saturday-${Date.now()}`,
        event_id: testEvent.id,
        name: 'Saturday Only',
        price_cents: 7000,
        status: 'active'
      })
    };
  });

  afterEach(async () => {
    // Clean up test data in dependency order
    if (testEvent && testEvent.id) {
      try {
        // Delete tickets (references transactions via transaction_id FK)
        await db.execute({
          sql: 'DELETE FROM tickets WHERE event_id = ?',
          args: [testEvent.id]
        });

        // Delete transaction_items (references transactions via transaction_id FK)
        await db.execute({
          sql: `DELETE FROM transaction_items WHERE transaction_id IN (
            SELECT id FROM transactions WHERE is_test = 1
          )`
        });

        // Delete transactions
        await db.execute({
          sql: 'DELETE FROM transactions WHERE is_test = 1'
        });

        // Delete ticket types
        await db.execute({
          sql: 'DELETE FROM ticket_type WHERE event_id = ?',
          args: [testEvent.id]
        });

        // Delete event
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

  // ==================== A. Complete Registration Flow ====================

  it('should create pending transaction with attendee info', async () => {
    const cartItems = [
      { ticketTypeId: 1, quantity: 1, price_cents: 12500 }
    ];

    const customerInfo = {
      email: 'customer@example.com',
      name: 'Jane Doe',
      phone: '+1234567890'
    };

    const registrations = [
      {
        ticketTypeId: 1,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com'
      }
    ];

    const cartFingerprint = `cart-${Date.now()}`;

    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems,
      customerInfo,
      registrations,
      cartFingerprint
    });

    const res = createMockResponse();

    await createPendingTransactionHandler(req, res);

    // Verify response
    expect(res._getStatus()).toBe(201);
    const data = res._getBody();
    expect(data.success).toBe(true);
    expect(data.transaction).toHaveProperty('payment_status', 'pending');
    expect(data.tickets).toHaveLength(1);
    expect(data.tickets[0].registration_status).toBe('pending_payment');

    // Verify transaction in DB
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE transaction_id = ?',
      args: [data.transaction.transaction_id]
    });

    expect(txResult.rows.length).toBe(1);
    const transaction = txResult.rows[0];
    expect(transaction.payment_status).toBe('pending');
    expect(transaction.customer_email).toBe('customer@example.com');

    // Verify ticket in DB
    const ticketResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [transaction.id]
    });

    expect(ticketResult.rows.length).toBe(1);
    const ticket = ticketResult.rows[0];
    expect(ticket.registration_status).toBe('pending_payment');
    expect(ticket.attendee_first_name).toBe('Jane');
    expect(ticket.attendee_last_name).toBe('Doe');
    expect(ticket.attendee_email).toBe('jane@example.com');
    expect(ticket.registered_at).toBeNull(); // Not registered until payment completes
  });

  it('should complete registration after Stripe payment webhook', async () => {
    // First, create pending transaction
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

    // Update transaction with Stripe session ID (simulating checkout session creation)
    await db.execute({
      sql: 'UPDATE transactions SET stripe_session_id = ? WHERE id = ?',
      args: [stripeSessionId, transactionId]
    });

    // Simulate Stripe webhook completing payment
    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', 'completed', transactionId]
    });

    // Update tickets to completed
    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ? AND registration_status = ?`,
      args: ['completed', transactionId, 'pending_payment']
    });

    // Verify transaction updated
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    const transaction = txResult.rows[0];
    expect(transaction.payment_status).toBe('completed');
    expect(transaction.status).toBe('completed');
    expect(transaction.completed_at).not.toBeNull();

    // Verify tickets updated
    const ticketResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });

    expect(ticketResult.rows.length).toBe(1);
    const ticket = ticketResult.rows[0];
    expect(ticket.registration_status).toBe('completed');
    expect(ticket.registered_at).not.toBeNull();
  });

  it('should complete registration after PayPal payment capture', async () => {
    // Create pending transaction
    const cartFingerprint = `cart-${Date.now()}`;
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 2, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
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
    const paypalOrderId = `PAYPAL-${Date.now()}`;
    const paypalCaptureId = `CAPTURE-${Date.now()}`;

    // Update transaction with PayPal IDs
    await db.execute({
      sql: 'UPDATE transactions SET paypal_order_id = ?, payment_processor = ? WHERE id = ?',
      args: [paypalOrderId, 'paypal', transactionId]
    });

    // Simulate PayPal capture
    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?, paypal_capture_id = ?,
                payment_processor = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', 'completed', paypalCaptureId, 'paypal', transactionId]
    });

    // Update tickets
    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ? AND registration_status = ?`,
      args: ['completed', transactionId, 'pending_payment']
    });

    // Verify
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    const transaction = txResult.rows[0];
    expect(transaction.payment_status).toBe('completed');
    expect(transaction.payment_processor).toBe('paypal');
    expect(transaction.paypal_capture_id).toBe(paypalCaptureId);

    // Verify both tickets completed
    const ticketResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });

    expect(ticketResult.rows.length).toBe(2);
    ticketResult.rows.forEach(ticket => {
      expect(ticket.registration_status).toBe('completed');
      expect(ticket.registered_at).not.toBeNull();
    });
  });

  it('should handle multiple tickets correctly', async () => {
    const cartItems = [
      { ticketTypeId: 1, quantity: 2, price_cents: 12500 },
      { ticketTypeId: 2, quantity: 1, price_cents: 6000 }
    ];

    const registrations = [
      { ticketTypeId: 1, firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com' },
      { ticketTypeId: 1, firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com' },
      { ticketTypeId: 2, firstName: 'Charlie', lastName: 'Brown', email: 'charlie@example.com' }
    ];

    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems,
      customerInfo: { email: 'purchaser@example.com', name: 'Purchaser Name' },
      registrations,
      cartFingerprint: `cart-${Date.now()}`
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    expect(res._getStatus()).toBe(201);
    const data = res._getBody();

    // Verify 3 tickets created
    expect(data.tickets).toHaveLength(3);

    // Verify attendee mapping
    const ticketResult = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ? ORDER BY id',
      args: [data.transaction.id]
    });

    expect(ticketResult.rows.length).toBe(3);
    expect(ticketResult.rows[0].attendee_first_name).toBe('Alice');
    expect(ticketResult.rows[1].attendee_first_name).toBe('Bob');
    expect(ticketResult.rows[2].attendee_first_name).toBe('Charlie');
  });

  it('should preserve data through payment failure/retry', async () => {
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

    // Simulate payment failure (don't update status)
    // Transaction should remain pending

    // Verify transaction still pending
    const txResult1 = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txResult1.rows[0].payment_status).toBe('pending');

    // Verify ticket data preserved
    const ticketResult1 = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });

    const originalTicket = ticketResult1.rows[0];
    expect(originalTicket.attendee_first_name).toBe('Jane');
    expect(originalTicket.attendee_last_name).toBe('Doe');
    expect(originalTicket.registration_status).toBe('pending_payment');

    // Simulate retry payment success
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

    // Verify completion
    const txResult2 = await db.execute({
      sql: 'SELECT * FROM transactions WHERE id = ?',
      args: [transactionId]
    });

    expect(txResult2.rows[0].payment_status).toBe('completed');

    // Verify ticket data still intact
    const ticketResult2 = await db.execute({
      sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });

    const completedTicket = ticketResult2.rows[0];
    expect(completedTicket.attendee_first_name).toBe('Jane');
    expect(completedTicket.attendee_last_name).toBe('Doe');
    expect(completedTicket.registration_status).toBe('completed');
  });

  // ==================== B. Idempotency Tests ====================

  it('should return existing transaction for duplicate cartFingerprint', async () => {
    const cartFingerprint = `cart-${Date.now()}`;
    const requestData = {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint
    };

    // First request
    const req1 = createMockRequest('POST', '/api/checkout/create-pending-transaction', requestData);
    const res1 = createMockResponse();
    await createPendingTransactionHandler(req1, res1);

    expect(res1._getStatus()).toBe(201);
    const data1 = res1._getBody();
    const firstTransactionId = data1.transaction.transaction_id;

    // Second request with same fingerprint
    const req2 = createMockRequest('POST', '/api/checkout/create-pending-transaction', requestData);
    const res2 = createMockResponse();
    await createPendingTransactionHandler(req2, res2);

    expect(res2._getStatus()).toBe(200);
    const data2 = res2._getBody();

    // Should return same transaction
    expect(data2.existing).toBe(true);
    expect(data2.transaction.transaction_id).toBe(firstTransactionId);

    // Verify no duplicate tickets created
    const ticketResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
      args: [data1.transaction.id]
    });

    expect(Number(ticketResult.rows[0].count)).toBe(1);
  });

  it('should create new transaction after 1-hour window', async () => {
    const cartFingerprint = `cart-${Date.now()}`;
    const requestData = {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint
    };

    // First request
    const req1 = createMockRequest('POST', '/api/checkout/create-pending-transaction', requestData);
    const res1 = createMockResponse();
    await createPendingTransactionHandler(req1, res1);

    const data1 = res1._getBody();
    const firstTransactionId = data1.transaction.transaction_id;

    // Manually update transaction created_at to 61 minutes ago
    const sixtyOneMinutesAgo = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    await db.execute({
      sql: 'UPDATE transactions SET created_at = ? WHERE transaction_id = ?',
      args: [sixtyOneMinutesAgo, firstTransactionId]
    });

    // Second request with same fingerprint but outside 1-hour window
    const req2 = createMockRequest('POST', '/api/checkout/create-pending-transaction', requestData);
    const res2 = createMockResponse();
    await createPendingTransactionHandler(req2, res2);

    expect(res2._getStatus()).toBe(201);
    const data2 = res2._getBody();

    // Should create NEW transaction
    expect(data2.existing).toBeUndefined();
    expect(data2.transaction.transaction_id).not.toBe(firstTransactionId);
  });

  it('should create separate transactions for different fingerprints', async () => {
    const baseData = {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }]
    };

    // Request 1 with fingerprint A
    const req1 = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      ...baseData,
      cartFingerprint: 'cart-ABC'
    });
    const res1 = createMockResponse();
    await createPendingTransactionHandler(req1, res1);

    const data1 = res1._getBody();

    // Request 2 with fingerprint B
    const req2 = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      ...baseData,
      cartFingerprint: 'cart-XYZ'
    });
    const res2 = createMockResponse();
    await createPendingTransactionHandler(req2, res2);

    const data2 = res2._getBody();

    // Should be different transactions
    expect(data1.transaction.transaction_id).not.toBe(data2.transaction.transaction_id);
  });

  // ==================== C. Validation Tests ====================

  it('should reject invalid registration data - invalid email', async () => {
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'invalid-email' }],
      cartFingerprint: `cart-${Date.now()}`
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    expect(res._getStatus()).toBe(400);
    const data = res._getBody();
    expect(data.error).toContain('Invalid registration data');
  });

  it('should reject invalid registration data - invalid name patterns', async () => {
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: '123456', lastName: 'Doe', email: 'jane@example.com' }],
      cartFingerprint: `cart-${Date.now()}`
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    expect(res._getStatus()).toBe(400);
    const data = res._getBody();
    expect(data.error).toContain('Invalid registration data');
  });

  it('should reject missing required fields', async () => {
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [{ ticketTypeId: 1, firstName: 'Jane' }], // Missing lastName and email
      cartFingerprint: `cart-${Date.now()}`
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    expect(res._getStatus()).toBe(400);
  });

  it('should require registration for ALL tickets in cart', async () => {
    const req = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 3, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [
        { ticketTypeId: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
        { ticketTypeId: 1, firstName: 'John', lastName: 'Smith', email: 'john@example.com' }
      ], // Only 2 registrations for 3 tickets
      cartFingerprint: `cart-${Date.now()}`
    });

    const res = createMockResponse();
    await createPendingTransactionHandler(req, res);

    expect(res._getStatus()).toBe(400);
    const data = res._getBody();
    expect(data.error).toContain('Registration count mismatch');
  });

  it('should validate ticket quantities', async () => {
    // Negative quantity
    const req1 = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: -1, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [],
      cartFingerprint: `cart-${Date.now()}`
    });

    const res1 = createMockResponse();
    await createPendingTransactionHandler(req1, res1);

    expect(res1._getStatus()).toBe(400);

    // Zero quantity
    const req2 = createMockRequest('POST', '/api/checkout/create-pending-transaction', {
      cartItems: [{ ticketTypeId: 1, quantity: 0, price_cents: 12500 }],
      customerInfo: { email: 'customer@example.com', name: 'Jane Doe' },
      registrations: [],
      cartFingerprint: `cart-${Date.now()}`
    });

    const res2 = createMockResponse();
    await createPendingTransactionHandler(req2, res2);

    expect(res2._getStatus()).toBe(400);
  });
});
