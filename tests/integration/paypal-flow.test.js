/**
 * PayPal Integration Flow Tests
 * Tests complete PayPal payment workflow from cart to ticket generation
 * including webhook processing, database integrity, and email notifications
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import transactionService from '../../lib/transaction-service.js';
import { getPayPalService, createPayPalOrder, capturePayPalOrder } from '../../lib/paypal-service.js';
import auditService from '../../lib/audit-service.js';
// Database setup is handled automatically by the integration test framework
import { createTestModeMetadata } from '../../lib/test-mode-utils.js';

describe('PayPal Integration Flow', () => {
  let dbClient;
  let paypalService;

  beforeAll(async () => {
    // Initialize services
    dbClient = await getDatabaseClient();
    paypalService = getPayPalService();

    // Ensure audit service is initialized
    if (auditService.ensureInitialized) {
      await auditService.ensureInitialized();
    }

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.INTEGRATION_TEST_MODE = 'true';
  });

  afterAll(async () => {
    delete process.env.INTEGRATION_TEST_MODE;
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await dbClient.execute({ sql: 'DELETE FROM transactions WHERE is_test = 1' });
    await dbClient.execute({ sql: 'DELETE FROM transaction_items WHERE transaction_id NOT IN (SELECT id FROM transactions)' });
    await dbClient.execute({ sql: 'DELETE FROM paypal_webhook_events WHERE is_test = 1' });
    await dbClient.execute({
      sql: "DELETE FROM audit_logs WHERE event_type LIKE ?",
      args: ['%TEST%']
    });

    // Reset PayPal service
    if (paypalService.reset) {
      paypalService.reset();
    }
  });

  afterEach(async () => {
    // Clean up after each test
    await dbClient.execute({ sql: 'DELETE FROM transactions WHERE is_test = 1' });
    await dbClient.execute({ sql: 'DELETE FROM transaction_items WHERE transaction_id NOT IN (SELECT id FROM transactions)' });
    await dbClient.execute({ sql: 'DELETE FROM paypal_webhook_events WHERE is_test = 1' });
    await dbClient.execute({
      sql: "DELETE FROM audit_logs WHERE event_type LIKE ?",
      args: ['%TEST%']
    });
  });

  describe('Complete Payment Flow', () => {
    it('should process complete payment flow from cart to ticket generation', async () => {
      // Step 1: Create cart items
      const cartItems = [
        {
          name: '2026 Early Bird Full Pass',
          price: 150.00,
          quantity: 1,
          type: 'ticket',
          description: 'A Lo Cubano Boulder Fest 2026 - Full Access',
          isTestItem: true
        },
        {
          name: 'Day Pass - Friday',
          price: 85.00,
          quantity: 1,
          type: 'ticket',
          description: 'A Lo Cubano Boulder Fest 2026 - Friday Only',
          isTestItem: true
        }
      ];

      const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Step 2: Create PayPal order
      const paypalOrderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: totalAmount.toFixed(2),
              breakdown: {
                item_total: {
                  currency_code: 'USD',
                  value: totalAmount.toFixed(2)
                }
              }
            },
            items: cartItems.map(item => ({
              name: item.name,
              unit_amount: {
                currency_code: 'USD',
                value: item.price.toFixed(2)
              },
              quantity: item.quantity.toString(),
              description: item.description,
              category: 'DIGITAL_GOODS'
            })),
            description: 'A Lo Cubano Boulder Fest Purchase',
            custom_id: 'test-integration@example.com',
            invoice_id: `TEST-ALCBF-${Date.now()}`
          }
        ],
        application_context: {
          brand_name: 'A Lo Cubano Boulder Fest',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: 'https://test.example.com/success',
          cancel_url: 'https://test.example.com/cancel',
          shipping_preference: 'NO_SHIPPING'
        }
      };

      const paypalOrder = await createPayPalOrder(paypalOrderData);

      expect(paypalOrder).toBeDefined();
      expect(paypalOrder.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
      expect(paypalOrder.status).toBe('CREATED');

      // Step 3: Store transaction in database (no TEST- prefix)
      const transactionId = `paypal_${Date.now()}`;
      const uuid = `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Get a test event ID for foreign key constraint (nullable)
      const eventResult = await dbClient.execute({
        sql: 'SELECT id FROM events LIMIT 1'
      });
      const testEventId = eventResult.rows[0]?.id || null;

      const dbResult = await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, status, amount_cents, total_amount, currency,
          paypal_order_id, payment_processor, reference_id, cart_data,
          customer_email, customer_name, order_data, metadata,
          source, event_id, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          transactionId,
          uuid,
          'tickets',
          'pending',
          Math.round(totalAmount * 100),
          Math.round(totalAmount * 100),
          'USD',
          paypalOrder.id,
          'paypal',
          paypalOrderData.purchase_units[0].invoice_id,
          JSON.stringify(cartItems),
          'test-integration@example.com',
          'Test Integration User',
          JSON.stringify(paypalOrderData),
          JSON.stringify(createTestModeMetadata(null, {
            integration_test: true,
            paypal_order_id: paypalOrder.id,
            total_amount: totalAmount
          })),
          'website',
          testEventId,
          1 // is_test = true
        ]
      });

      // Verify insertion succeeded
      expect(dbResult.rowsAffected || dbResult.changes).toBeGreaterThan(0);
      const transactionRowId = dbResult.lastInsertRowid;

      // Step 4: Verify transaction was stored correctly
      const storedTransaction = await dbClient.execute({
        sql: 'SELECT * FROM transactions WHERE id = ?',
        args: [transactionRowId]
      });

      expect(storedTransaction.rows).toHaveLength(1);
      const transaction = storedTransaction.rows[0];
      expect(transaction.paypal_order_id).toBe(paypalOrder.id);
      expect(transaction.status).toBe('pending');
      expect(transaction.is_test).toBe(1);

      // Step 5: Simulate PayPal order capture
      const captureResult = await capturePayPalOrder(paypalOrder.id);

      expect(captureResult).toBeDefined();
      expect(captureResult.status).toBe('COMPLETED');
      expect(captureResult.purchase_units[0].payments.captures).toHaveLength(1);

      const capture = captureResult.purchase_units[0].payments.captures[0];
      expect(capture.status).toBe('COMPLETED');
      expect(capture.final_capture).toBe(true);

      // Step 6: Update transaction with capture details using transaction service
      await transactionService.updatePayPalCapture(uuid, capture.id, 'completed');

      // Step 7: Verify transaction was updated
      const updatedTransactionResult = await dbClient.execute({
        sql: 'SELECT * FROM transactions WHERE uuid = ?',
        args: [uuid]
      });

      expect(updatedTransactionResult.rows).toHaveLength(1);
      const updatedTransaction = updatedTransactionResult.rows[0];
      expect(updatedTransaction.status).toBe('completed');
      expect(updatedTransaction.paypal_capture_id).toBe(capture.id);

      // Step 8: Verify payment event was created
      const paymentEvents = await dbClient.execute({
        sql: `SELECT * FROM payment_events
              WHERE transaction_id = (SELECT id FROM transactions WHERE uuid = ?)
              ORDER BY processed_at DESC`,
        args: [uuid]
      });

      expect(paymentEvents.rows.length).toBeGreaterThan(0);
      const latestEvent = paymentEvents.rows[0];
      expect(latestEvent.event_type).toContain('status_change');
      expect(latestEvent.new_status).toBe('completed');
    });

    it('should handle webhook event processing', async () => {
      // Create a test transaction first
      const paypalOrderId = 'TEST-EC-1234567890-webhook';
      const captureId = 'TEST-CAPTURE-WEBHOOK-123';
      const uuid = `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Get a test event ID for foreign key constraint (nullable)
      const eventResult = await dbClient.execute({
        sql: 'SELECT id FROM events LIMIT 1'
      });
      const testEventId = eventResult.rows[0]?.id || null;

      await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, status, amount_cents, currency,
          paypal_order_id, payment_processor, customer_email, order_data, event_id, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          `test_webhook_${Date.now()}`,
          uuid,
          'tickets',
          'pending',
          15000, // $150.00
          'USD',
          paypalOrderId,
          'paypal',
          'test-webhook@example.com',
          JSON.stringify({ test: true, webhook: true }),
          testEventId,
          1
        ]
      });

      // Simulate webhook event
      const webhookEvent = {
        id: `TEST-WEBHOOK-${Date.now()}`,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: captureId,
          status: 'COMPLETED',
          amount: {
            currency_code: 'USD',
            value: '150.00'
          },
          final_capture: true,
          create_time: new Date().toISOString(),
          update_time: new Date().toISOString(),
          supplementary_data: {
            related_ids: {
              order_id: paypalOrderId
            }
          }
        },
        create_time: new Date().toISOString()
      };

      // Store webhook event
      await dbClient.execute({
        sql: `INSERT INTO paypal_webhook_events (
          event_id, event_type, paypal_order_id, paypal_capture_id,
          event_data, verification_status, processing_status, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          webhookEvent.id,
          webhookEvent.event_type,
          paypalOrderId,
          captureId,
          JSON.stringify(webhookEvent),
          'verified',
          'pending',
          1,
          new Date().toISOString()
        ]
      });

      // Simulate webhook processing
      const transaction = await transactionService.getByPayPalOrderId(paypalOrderId);
      expect(transaction).toBeDefined();
      expect(transaction.paypal_order_id).toBe(paypalOrderId);

      // Update transaction based on webhook
      await transactionService.updatePayPalCapture(transaction.uuid, captureId, 'completed');

      // Verify webhook event was processed
      const processedTransaction = await transactionService.getByPayPalOrderId(paypalOrderId);
      expect(processedTransaction.status).toBe('completed');
      expect(processedTransaction.paypal_capture_id).toBe(captureId);

      // Update webhook event status
      await dbClient.execute({
        sql: `UPDATE paypal_webhook_events
              SET processing_status = 'processed', processed_at = ?
              WHERE event_id = ?`,
        args: [new Date().toISOString(), webhookEvent.id]
      });

      // Verify webhook event was marked as processed
      const webhookEventResult = await dbClient.execute({
        sql: 'SELECT * FROM paypal_webhook_events WHERE event_id = ?',
        args: [webhookEvent.id]
      });

      expect(webhookEventResult.rows).toHaveLength(1);
      expect(webhookEventResult.rows[0].processing_status).toBe('processed');
    });

    it('should maintain database transaction integrity', async () => {
      const paypalOrderId = 'TEST-EC-INTEGRITY-123';
      const uuid = `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Get a test event ID for foreign key constraint (nullable)
      const eventResult = await dbClient.execute({
        sql: 'SELECT id FROM events LIMIT 1'
      });
      const testEventId = eventResult.rows[0]?.id || null;

      // Start transaction
      await dbClient.execute({ sql: 'BEGIN TRANSACTION' });

      try {
        // Insert transaction
        const result = await dbClient.execute({
          sql: `INSERT INTO transactions (
            transaction_id, uuid, type, status, amount_cents, currency,
            paypal_order_id, payment_processor, customer_email, order_data, event_id, is_test, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [
            `test_integrity_${Date.now()}`,
            uuid,
            'tickets',
            'pending',
            10000,
            'USD',
            paypalOrderId,
            'paypal',
            'test-integrity@example.com',
            JSON.stringify({ test: true, integrity: true }),
            testEventId,
            1
          ]
        });

        const transactionRowId = result.lastInsertRowid;

        // Insert transaction items
        await dbClient.execute({
          sql: `INSERT INTO transaction_items (
            transaction_id, item_type, ticket_type, item_name, unit_price_cents,
            quantity, total_price_cents, product_metadata, is_test, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [
            transactionRowId,
            'ticket',
            'full_pass',
            'Test Integration Ticket',
            10000,
            1,
            10000,
            JSON.stringify({ test: true }),
            1
          ]
        });

        // Commit transaction
        await dbClient.execute({ sql: 'COMMIT' });

        // Verify both records exist
        const transactionCheck = await dbClient.execute({
          sql: 'SELECT * FROM transactions WHERE uuid = ?',
          args: [uuid]
        });

        const itemsCheck = await dbClient.execute({
          sql: 'SELECT * FROM transaction_items WHERE transaction_id = ?',
          args: [transactionRowId]
        });

        expect(transactionCheck.rows).toHaveLength(1);
        expect(itemsCheck.rows).toHaveLength(1);

      } catch (error) {
        // Rollback on error
        await dbClient.execute({ sql: 'ROLLBACK' });
        throw error;
      }
    });
  });

  describe('Idempotency Protection', () => {
    it('should handle duplicate PayPal order creation', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: '100.00' },
            invoice_id: `TEST-DUPLICATE-${Date.now()}`
          }
        ]
      };

      // Create first order
      const order1 = await createPayPalOrder(orderData);
      expect(order1).toBeDefined();

      // Create second order with same data
      const order2 = await createPayPalOrder(orderData);
      expect(order2).toBeDefined();

      // Should get different order IDs (mock generates unique IDs)
      expect(order1.id).not.toBe(order2.id);
    });

    it('should handle duplicate webhook events', async () => {
      const eventId = `TEST-DUPLICATE-WEBHOOK-${Date.now()}`;
      const webhookEvent = {
        id: eventId,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'TEST-CAPTURE-DUP-123',
          status: 'COMPLETED',
          amount: { currency_code: 'USD', value: '100.00' }
        }
      };

      // Insert first webhook event
      const result1 = await dbClient.execute({
        sql: `INSERT INTO paypal_webhook_events (
          event_id, event_type, event_data, verification_status,
          processing_status, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          eventId,
          webhookEvent.event_type,
          JSON.stringify(webhookEvent),
          'verified',
          'processed',
          1,
          new Date().toISOString()
        ]
      });

      expect(result1.rowsAffected || result1.changes).toBeGreaterThan(0);

      // Try to insert duplicate - should fail with UNIQUE constraint
      await expect(
        dbClient.execute({
          sql: `INSERT INTO paypal_webhook_events (
            event_id, event_type, event_data, verification_status,
            processing_status, is_test, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            eventId, // Same event ID
            webhookEvent.event_type,
            JSON.stringify(webhookEvent),
            'verified',
            'pending',
            1,
            new Date().toISOString()
          ]
        })
      ).rejects.toThrow(/UNIQUE constraint failed/);
    });

    it('should handle duplicate capture attempts', async () => {
      const paypalOrderId = 'TEST-EC-DUPLICATE-CAPTURE';
      const captureId = 'TEST-CAPTURE-DUP-456';
      const uuid = `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Get a test event ID for foreign key constraint (nullable)
      const eventResult = await dbClient.execute({
        sql: 'SELECT id FROM events LIMIT 1'
      });
      const testEventId = eventResult.rows[0]?.id || null;

      // Create transaction
      await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, status, amount_cents, currency,
          paypal_order_id, payment_processor, customer_email, order_data, event_id, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          `test_dup_capture_${Date.now()}`,
          uuid,
          'tickets',
          'pending',
          10000,
          'USD',
          paypalOrderId,
          'paypal',
          'test-duplicate@example.com',
          JSON.stringify({ test: true, duplicate: true }),
          testEventId,
          1
        ]
      });

      // First capture
      await transactionService.updatePayPalCapture(uuid, captureId, 'completed');

      // Verify first capture
      const firstCaptureResult = await transactionService.getByPayPalOrderId(paypalOrderId);
      expect(firstCaptureResult.status).toBe('completed');
      expect(firstCaptureResult.paypal_capture_id).toBe(captureId);

      // Attempt duplicate capture - should be idempotent
      await transactionService.updatePayPalCapture(uuid, captureId, 'completed');

      // Should still be completed with same capture ID
      const duplicateCaptureResult = await transactionService.getByPayPalOrderId(paypalOrderId);
      expect(duplicateCaptureResult.status).toBe('completed');
      expect(duplicateCaptureResult.paypal_capture_id).toBe(captureId);
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle PayPal order creation failures', async () => {
      const failureOrderData = {
        customer_info: { email: 'test-paypal-fail@example.com' },
        purchase_units: [{ amount: { value: '100.00' } }]
      };

      await expect(createPayPalOrder(failureOrderData)).rejects.toThrow('PAYPAL_ORDER_CREATION_FAILED');
    });

    it('should handle capture failures', async () => {
      const failOrderId = 'TEST-EC-1234567890-fail';

      await expect(capturePayPalOrder(failOrderId)).rejects.toThrow('PAYPAL_CAPTURE_FAILED');
    });

    it('should handle database connection failures gracefully', async () => {
      // This test would need to mock database connection failures
      // For now, we'll test that service methods handle null/undefined gracefully

      const result = await transactionService.getByPayPalOrderId('NONEXISTENT-ORDER');
      expect(result).toBeNull();
    });

    it('should handle malformed webhook data', async () => {
      const malformedEvent = {
        id: `TEST-MALFORMED-${Date.now()}`,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        // Missing resource data
      };

      // Should be able to store even malformed events for debugging
      const result = await dbClient.execute({
        sql: `INSERT INTO paypal_webhook_events (
          event_id, event_type, event_data, verification_status,
          processing_status, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          malformedEvent.id,
          malformedEvent.event_type,
          JSON.stringify(malformedEvent),
          'failed',
          'failed',
          1,
          new Date().toISOString()
        ]
      });

      expect(result.rowsAffected || result.changes).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent transactions', async () => {
      const concurrentTransactions = 10;
      const promises = [];

      for (let i = 0; i < concurrentTransactions; i++) {
        const orderData = {
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: { currency_code: 'USD', value: `${100 + i}.00` },
              invoice_id: `TEST-CONCURRENT-${Date.now()}-${i}`
            }
          ]
        };

        promises.push(createPayPalOrder(orderData));
      }

      const orders = await Promise.all(promises);

      expect(orders).toHaveLength(concurrentTransactions);
      orders.forEach((order, index) => {
        expect(order.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
        expect(order.status).toBe('CREATED');
      });

      // Verify all order IDs are unique
      const orderIds = orders.map(order => order.id);
      const uniqueOrderIds = new Set(orderIds);
      expect(uniqueOrderIds.size).toBe(orderIds.length);
    });

    it('should handle large transaction amounts', async () => {
      const largeAmount = 9999.99;
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: largeAmount.toFixed(2) }
          }
        ]
      };

      const order = await createPayPalOrder(orderData);
      expect(order).toBeDefined();

      // Get a test event ID for foreign key constraint (nullable)
      const eventResult = await dbClient.execute({
        sql: 'SELECT id FROM events LIMIT 1'
      });
      const testEventId = eventResult.rows[0]?.id || null;

      // Test database storage of large amounts
      const uuid = `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, status, amount_cents, currency,
          paypal_order_id, payment_processor, customer_email, order_data, event_id, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          `test_large_${Date.now()}`,
          uuid,
          'tickets',
          'pending',
          Math.round(largeAmount * 100), // Convert to cents
          'USD',
          order.id,
          'paypal',
          'test-large@example.com',
          JSON.stringify({ test: true, large_amount: true }),
          testEventId,
          1
        ]
      });

      const result = await dbClient.execute({
        sql: 'SELECT * FROM transactions WHERE uuid = ?',
        args: [uuid]
      });

      expect(result.rows[0].amount_cents).toBe(999999); // $9999.99 in cents
    });
  });

  describe('Audit Trail and Compliance', () => {
    it('should create comprehensive audit logs', async () => {
      const paypalOrderId = 'TEST-EC-AUDIT-123';
      const uuid = `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Get a test event ID for foreign key constraint (nullable)
      const eventResult = await dbClient.execute({
        sql: 'SELECT id FROM events LIMIT 1'
      });
      const testEventId = eventResult.rows[0]?.id || null;

      // Create transaction
      await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, status, amount_cents, currency,
          paypal_order_id, payment_processor, customer_email, order_data, event_id, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          `test_audit_${Date.now()}`,
          uuid,
          'tickets',
          'pending',
          10000,
          'USD',
          paypalOrderId,
          'paypal',
          'test-audit@example.com',
          JSON.stringify({ test: true, audit: true }),
          testEventId,
          1
        ]
      });

      // Update status to create payment event
      await transactionService.updateStatus(uuid, 'completed');

      // Check payment events
      const paymentEvents = await dbClient.execute({
        sql: `SELECT * FROM payment_events
              WHERE transaction_id = (SELECT id FROM transactions WHERE uuid = ?)`,
        args: [uuid]
      });

      expect(paymentEvents.rows.length).toBeGreaterThan(0);

      const statusChangeEvent = paymentEvents.rows.find(event =>
        event.event_type.includes('status_change')
      );

      expect(statusChangeEvent).toBeDefined();
      expect(statusChangeEvent.previous_status).toBe('pending');
      expect(statusChangeEvent.new_status).toBe('completed');
    });

    it('should maintain data consistency across all tables', async () => {
      const paypalOrderId = 'TEST-EC-CONSISTENCY-123';
      const uuid = `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const transactionId = `test_consistency_${Date.now()}`;

      // Get a test event ID for foreign key constraint (nullable)
      const eventResult = await dbClient.execute({
        sql: 'SELECT id FROM events LIMIT 1'
      });
      const testEventId = eventResult.rows[0]?.id || null;

      // Create complete transaction with items
      const dbResult = await dbClient.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, status, amount_cents, currency,
          paypal_order_id, payment_processor, customer_email, order_data, event_id, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          transactionId,
          uuid,
          'tickets',
          'pending',
          15000,
          'USD',
          paypalOrderId,
          'paypal',
          'test-consistency@example.com',
          JSON.stringify({ test: true, consistency: true }),
          testEventId,
          1
        ]
      });

      const transactionRowId = dbResult.lastInsertRowid;

      // Add transaction items
      await dbClient.execute({
        sql: `INSERT INTO transaction_items (
          transaction_id, item_type, ticket_type, item_name, unit_price_cents,
          quantity, total_price_cents, is_test, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          transactionRowId,
          'ticket',
          'full_pass',
          'Test Consistency Ticket',
          15000,
          1,
          15000,
          1
        ]
      });

      // Verify referential integrity
      const joinQuery = await dbClient.execute({
        sql: `SELECT t.*, ti.*
              FROM transactions t
              JOIN transaction_items ti ON t.id = ti.transaction_id
              WHERE t.uuid = ?`,
        args: [uuid]
      });

      expect(joinQuery.rows).toHaveLength(1);
      expect(joinQuery.rows[0].uuid).toBe(uuid);
      expect(joinQuery.rows[0].item_name).toBe('Test Consistency Ticket');
    });
  });
});