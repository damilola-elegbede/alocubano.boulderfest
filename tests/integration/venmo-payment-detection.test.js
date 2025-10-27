/**
 * Venmo Payment Detection Integration Tests
 * Tests complete flow from payment capture to database storage with correct payment_processor
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { detectPaymentProcessor, extractPaymentSourceDetails } from '../../lib/paypal-payment-source-detector.js';
import transactionService from '../../lib/transaction-service.js';

describe('Venmo Payment Detection Integration', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabaseClient();
  });

  afterAll(async () => {
    if (db && db.close) {
      await db.close();
    }
  });

  beforeEach(async () => {
    // Clean up test data
    await db.execute({
      sql: 'DELETE FROM payment_events WHERE transaction_id IN (SELECT id FROM transactions WHERE uuid LIKE ?)',
      args: ['test-venmo-%']
    });
    await db.execute({
      sql: 'DELETE FROM tickets WHERE transaction_id IN (SELECT id FROM transactions WHERE uuid LIKE ?)',
      args: ['test-venmo-%']
    });
    await db.execute({
      sql: 'DELETE FROM transaction_items WHERE transaction_id IN (SELECT id FROM transactions WHERE uuid LIKE ?)',
      args: ['test-venmo-%']
    });
    await db.execute({
      sql: 'DELETE FROM transactions WHERE uuid LIKE ?',
      args: ['test-venmo-%']
    });
  });

  describe('Venmo Payment Capture and Storage', () => {
    it('should detect Venmo from capture response and store correctly', async () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE-VENMO-123',
              status: 'COMPLETED',
              payment_source: {
                venmo: {
                  account_id: 'VENMO-ACCT-123',
                  user_name: '@testuser',
                  email_address: 'test@venmo.com'
                }
              }
            }]
          }
        }]
      };

      const paymentProcessor = detectPaymentProcessor(captureResponse);
      expect(paymentProcessor).toBe('venmo');

      // Create transaction with detected processor
      const transactionUuid = 'test-venmo-001';
      await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, amount_cents, currency, payment_processor, status, order_number, order_data, cart_data, paypal_order_id, customer_email)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [transactionUuid, transactionUuid, 'tickets', 2500, 'USD', paymentProcessor, 'completed', 'ORD-TEST-001', '{}', '[]', 'ORDER-VENMO-001', 'test@example.com']
      });

      // Verify storage
      const result = await db.execute({
        sql: 'SELECT payment_processor FROM transactions WHERE uuid = ?',
        args: [transactionUuid]
      });

      expect(result.rows[0].payment_processor).toBe('venmo');
    });

    it('should detect PayPal from capture response and store correctly', async () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE-PAYPAL-123',
              status: 'COMPLETED',
              payment_source: {
                paypal: {
                  account_id: 'PAYPAL-ACCT-123',
                  email_address: 'test@paypal.com',
                  account_status: 'VERIFIED'
                }
              }
            }]
          }
        }]
      };

      const paymentProcessor = detectPaymentProcessor(captureResponse);
      expect(paymentProcessor).toBe('paypal');

      // Create transaction with detected processor
      const transactionUuid = 'test-venmo-002';
      await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, amount_cents, currency, payment_processor, status, order_number, order_data, cart_data, paypal_order_id, customer_email)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [transactionUuid, transactionUuid, 'tickets', 2500, 'USD', paymentProcessor, 'completed', 'ORD-TEST-002', '{}', '[]', 'ORDER-PAYPAL-002', 'test@example.com']
      });

      // Verify storage
      const result = await db.execute({
        sql: 'SELECT payment_processor FROM transactions WHERE uuid = ?',
        args: [transactionUuid]
      });

      expect(result.rows[0].payment_processor).toBe('paypal');
    });

    it('should default to paypal when payment_source is missing', async () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE-LEGACY-123',
              status: 'COMPLETED'
            }]
          }
        }]
      };

      const paymentProcessor = detectPaymentProcessor(captureResponse);
      expect(paymentProcessor).toBe('paypal');

      // Create transaction with default processor
      const transactionUuid = 'test-venmo-003';
      await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, amount_cents, currency, payment_processor, status, order_number, order_data, cart_data, paypal_order_id, customer_email)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [transactionUuid, transactionUuid, 'tickets', 2500, 'USD', paymentProcessor, 'completed', 'ORD-TEST-003', '{}', '[]', 'ORDER-PAYPAL-003', 'test@example.com']
      });

      // Verify storage
      const result = await db.execute({
        sql: 'SELECT payment_processor FROM transactions WHERE uuid = ?',
        args: [transactionUuid]
      });

      expect(result.rows[0].payment_processor).toBe('paypal');
    });
  });

  describe('Transaction Service Integration', () => {
    it('should update payment_processor via updatePayPalCapture', async () => {
      // Create initial transaction
      const transactionUuid = 'test-venmo-004';
      await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, amount_cents, currency, payment_processor, status, order_number, order_data, cart_data, paypal_order_id, customer_email)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [transactionUuid, transactionUuid, 'tickets', 2500, 'USD', 'paypal', 'pending', 'ORD-TEST-004', '{}', '[]', 'ORDER-TEST-004', 'test@example.com']
      });

      // Update with Venmo payment processor
      await transactionService.updatePayPalCapture(
        transactionUuid,
        'CAPTURE-VENMO-456',
        'completed',
        'venmo'
      );

      // Verify update
      const result = await db.execute({
        sql: 'SELECT payment_processor, status, paypal_capture_id FROM transactions WHERE uuid = ?',
        args: [transactionUuid]
      });

      expect(result.rows[0].payment_processor).toBe('venmo');
      expect(result.rows[0].status).toBe('completed');
      expect(result.rows[0].paypal_capture_id).toBe('CAPTURE-VENMO-456');
    });

    it('should preserve existing payment_processor when not provided', async () => {
      // Create transaction with Venmo
      const transactionUuid = 'test-venmo-005';
      await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, amount_cents, currency, payment_processor, status, order_number, order_data, cart_data, paypal_order_id, customer_email)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [transactionUuid, transactionUuid, 'tickets', 2500, 'USD', 'venmo', 'pending', 'ORD-TEST-005', '{}', '[]', 'ORDER-TEST-005', 'test@example.com']
      });

      // Update without payment_processor parameter
      await transactionService.updatePayPalCapture(
        transactionUuid,
        'CAPTURE-789',
        'completed'
      );

      // Verify venmo is preserved
      const result = await db.execute({
        sql: 'SELECT payment_processor FROM transactions WHERE uuid = ?',
        args: [transactionUuid]
      });

      expect(result.rows[0].payment_processor).toBe('venmo');
    });
  });

  describe('Payment Source Details Extraction', () => {
    it('should extract Venmo account details', async () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                venmo: {
                  account_id: 'VENMO-ACCT-789',
                  user_name: '@user789',
                  email_address: 'user@venmo.com',
                  name: {
                    given_name: 'Test',
                    surname: 'User'
                  }
                }
              }
            }]
          }
        }]
      };

      const details = extractPaymentSourceDetails(captureResponse);

      expect(details.type).toBe('venmo');
      expect(details.accountId).toBe('VENMO-ACCT-789');
      expect(details.userName).toBe('@user789');
      expect(details.email).toBe('user@venmo.com');
      expect(details.name.givenName).toBe('Test');
      expect(details.name.surname).toBe('User');
    });

    it('should extract PayPal account details', async () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                paypal: {
                  account_id: 'PAYPAL-ACCT-789',
                  email_address: 'user@paypal.com',
                  account_status: 'VERIFIED',
                  name: {
                    given_name: 'Jane',
                    surname: 'Smith'
                  }
                }
              }
            }]
          }
        }]
      };

      const details = extractPaymentSourceDetails(captureResponse);

      expect(details.type).toBe('paypal');
      expect(details.accountId).toBe('PAYPAL-ACCT-789');
      expect(details.email).toBe('user@paypal.com');
      expect(details.accountStatus).toBe('VERIFIED');
      expect(details.name.givenName).toBe('Jane');
      expect(details.name.surname).toBe('Smith');
    });
  });

  describe('Database Query Filtering', () => {
    beforeEach(async () => {
      // Create test transactions with different processors
      await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, amount_cents, currency, payment_processor, status, order_number, order_data, cart_data, paypal_order_id, customer_email)
              VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'test-venmo-006', 'test-venmo-006', 'tickets', 2500, 'USD', 'venmo', 'completed', 'ORD-TEST-006', '{}', '[]', 'ORDER-TEST-006', 'test@example.com',
          'test-venmo-007', 'test-venmo-007', 'tickets', 2500, 'USD', 'paypal', 'completed', 'ORD-TEST-007', '{}', '[]', 'ORDER-TEST-007', 'test@example.com',
          'test-venmo-008', 'test-venmo-008', 'tickets', 2500, 'USD', 'stripe', 'completed', 'ORD-TEST-008', '{}', '[]', null, 'test@example.com'
        ]
      });
    });

    it('should filter transactions by venmo payment_processor', async () => {
      const result = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM transactions WHERE payment_processor = ? AND uuid LIKE ?',
        args: ['venmo', 'test-venmo-%']
      });

      expect(result.rows[0].count).toBe(1);
    });

    it('should filter transactions by paypal payment_processor', async () => {
      const result = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM transactions WHERE payment_processor = ? AND uuid LIKE ?',
        args: ['paypal', 'test-venmo-%']
      });

      expect(result.rows[0].count).toBe(1);
    });

    it('should distinguish between venmo and paypal transactions', async () => {
      const venmoResult = await db.execute({
        sql: 'SELECT uuid FROM transactions WHERE payment_processor = ? AND uuid LIKE ? ORDER BY uuid',
        args: ['venmo', 'test-venmo-%']
      });

      const paypalResult = await db.execute({
        sql: 'SELECT uuid FROM transactions WHERE payment_processor = ? AND uuid LIKE ? ORDER BY uuid',
        args: ['paypal', 'test-venmo-%']
      });

      expect(venmoResult.rows[0].uuid).toBe('test-venmo-006');
      expect(paypalResult.rows[0].uuid).toBe('test-venmo-007');
    });

    it('should support payment_processor IN clause for filtering', async () => {
      const result = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM transactions WHERE payment_processor IN (?, ?) AND uuid LIKE ?',
        args: ['venmo', 'paypal', 'test-venmo-%']
      });

      expect(result.rows[0].count).toBe(2);
    });
  });

  describe('Complete Payment Flow Integration', () => {
    it('should handle complete Venmo payment flow from detection to storage', async () => {
      // 1. Simulate PayPal capture response with Venmo
      const captureResponse = {
        id: 'ORDER-VENMO-FLOW-001',
        status: 'COMPLETED',
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE-VENMO-FLOW-001',
              status: 'COMPLETED',
              amount: {
                currency_code: 'USD',
                value: '50.00'
              },
              payment_source: {
                venmo: {
                  account_id: 'VENMO-ACCT-FLOW-001',
                  user_name: '@flowuser',
                  email_address: 'flow@venmo.com'
                }
              }
            }]
          }
        }]
      };

      // 2. Detect payment processor
      const paymentProcessor = detectPaymentProcessor(captureResponse);
      expect(paymentProcessor).toBe('venmo');

      // 3. Extract details
      const sourceDetails = extractPaymentSourceDetails(captureResponse);
      expect(sourceDetails.type).toBe('venmo');
      expect(sourceDetails.userName).toBe('@flowuser');

      // 4. Create transaction in database
      const transactionUuid = 'test-venmo-flow-001';
      const insertResult = await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, amount_cents, currency, payment_processor,
               paypal_order_id, paypal_capture_id, customer_email, status, order_number, order_data, cart_data)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transactionUuid, transactionUuid, 'tickets', 5000, 'USD', paymentProcessor,
          captureResponse.id, captureResponse.purchase_units[0].payments.captures[0].id,
          sourceDetails.email, 'completed', 'ORD-FLOW-001', '{}', '[]'
        ]
      });

      expect(insertResult.lastInsertRowid).toBeDefined();

      // 5. Verify complete storage
      const verifyResult = await db.execute({
        sql: `SELECT payment_processor, paypal_order_id, paypal_capture_id,
                     customer_email, status, amount_cents
              FROM transactions WHERE uuid = ?`,
        args: [transactionUuid]
      });

      const transaction = verifyResult.rows[0];
      expect(transaction.payment_processor).toBe('venmo');
      expect(transaction.paypal_order_id).toBe('ORDER-VENMO-FLOW-001');
      expect(transaction.paypal_capture_id).toBe('CAPTURE-VENMO-FLOW-001');
      expect(transaction.customer_email).toBe('flow@venmo.com');
      expect(transaction.status).toBe('completed');
      expect(transaction.amount_cents).toBe(5000);
    });

    it('should handle complete PayPal payment flow from detection to storage', async () => {
      // Complete flow for PayPal (not Venmo)
      const captureResponse = {
        id: 'ORDER-PAYPAL-FLOW-001',
        status: 'COMPLETED',
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE-PAYPAL-FLOW-001',
              status: 'COMPLETED',
              amount: {
                currency_code: 'USD',
                value: '75.00'
              },
              payment_source: {
                paypal: {
                  account_id: 'PAYPAL-ACCT-FLOW-001',
                  email_address: 'flow@paypal.com',
                  account_status: 'VERIFIED'
                }
              }
            }]
          }
        }]
      };

      const paymentProcessor = detectPaymentProcessor(captureResponse);
      expect(paymentProcessor).toBe('paypal');

      const sourceDetails = extractPaymentSourceDetails(captureResponse);
      expect(sourceDetails.type).toBe('paypal');

      const transactionUuid = 'test-venmo-flow-002';
      await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, amount_cents, currency, payment_processor,
               paypal_order_id, paypal_capture_id, customer_email, status, order_number, order_data, cart_data)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transactionUuid, transactionUuid, 'tickets', 7500, 'USD', paymentProcessor,
          captureResponse.id, captureResponse.purchase_units[0].payments.captures[0].id,
          sourceDetails.email, 'completed', 'ORD-FLOW-002', '{}', '[]'
        ]
      });

      const verifyResult = await db.execute({
        sql: 'SELECT payment_processor, customer_email FROM transactions WHERE uuid = ?',
        args: [transactionUuid]
      });

      expect(verifyResult.rows[0].payment_processor).toBe('paypal');
      expect(verifyResult.rows[0].customer_email).toBe('flow@paypal.com');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed capture response gracefully', async () => {
      const malformedResponse = {
        id: 'MALFORMED',
        // Missing purchase_units
      };

      const paymentProcessor = detectPaymentProcessor(malformedResponse);
      expect(paymentProcessor).toBe('paypal'); // Safe default
    });

    it('should handle null capture response', async () => {
      const paymentProcessor = detectPaymentProcessor(null);
      expect(paymentProcessor).toBe('paypal');
    });

    it('should handle empty payment_source object', async () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE-EMPTY',
              payment_source: {}
            }]
          }
        }]
      };

      const paymentProcessor = detectPaymentProcessor(captureResponse);
      expect(paymentProcessor).toBe('paypal');
    });

    it('should handle transaction update with invalid UUID', async () => {
      await expect(
        transactionService.updatePayPalCapture(
          'non-existent-uuid',
          'CAPTURE-123',
          'completed',
          'venmo'
        )
      ).rejects.toThrow();
    });
  });
});
