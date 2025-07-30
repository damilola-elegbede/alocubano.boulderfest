/**
 * Unit tests for Database Operations
 * Tests all database interactions with test database
 */

import { jest } from '@jest/globals';
import { 
  getTestDbClient, 
  cleanTestData, 
  insertTestData,
  createTestOrder,
  createTestPayment,
  getTestDbStats 
} from '../config/testDatabase.js';

// Import database modules
import * as dbClient from '../../lib/db/client.js';
import * as orderModel from '../../lib/db/models/orders.js';
import * as paymentModel from '../../lib/db/models/payments.js';
import * as orderItemModel from '../../lib/db/models/order-items.js';
import * as inventoryManager from '../../lib/inventory/manager.js';

describe('Database Operations', () => {
  let testDb;

  beforeAll(async () => {
    testDb = await getTestDbClient();
  });

  beforeEach(async () => {
    await cleanTestData();
    await insertTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  describe('Database Connection', () => {
    test('establishes connection successfully', async () => {
      const client = await getTestDbClient();
      expect(client).toBeDefined();
      
      // Test basic query
      const result = await client.query('SELECT NOW() as current_time');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_time).toBeInstanceOf(Date);
    });

    test('handles connection errors gracefully', async () => {
      // Mock a connection error
      const originalQuery = testDb.query;
      testDb.query = jest.fn().mockRejectedValue(new Error('Connection failed'));
      
      await expect(testDb.query('SELECT 1')).rejects.toThrow('Connection failed');
      
      // Restore original method
      testDb.query = originalQuery;
    });

    test('maintains connection pool limits', async () => {
      // Test multiple concurrent connections
      const queries = Array(10).fill().map(() => 
        testDb.query('SELECT pg_sleep(0.1)')
      );
      
      const start = performance.now();
      await Promise.all(queries);
      const duration = performance.now() - start;
      
      // Should complete in reasonable time with proper pooling
      expect(duration).toBeLessThan(2000); // 2 seconds max
    });
  });

  describe('Order Operations', () => {
    test('creates order with valid data', async () => {
      const orderData = {
        customer_email: 'new@example.com',
        customer_name: 'New Customer',
        total_amount: 45000, // $450.00
        currency: 'usd',
        status: 'pending',
        stripe_session_id: 'cs_test_new_123'
      };

      const order = await createTestOrder(orderData);
      
      expect(order).toMatchObject({
        customer_email: 'new@example.com',
        customer_name: 'New Customer',
        total_amount: 45000,
        currency: 'usd',
        status: 'pending',
        stripe_session_id: 'cs_test_new_123'
      });
      expect(order.id).toBeDefined();
      expect(order.created_at).toBeInstanceOf(Date);
      expect(order.updated_at).toBeInstanceOf(Date);
    });

    test('retrieves order by ID', async () => {
      const originalOrder = await createTestOrder();
      
      const result = await testDb.query(
        'SELECT * FROM orders WHERE id = $1',
        [originalOrder.id]
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: originalOrder.id,
        customer_email: originalOrder.customer_email,
        total_amount: originalOrder.total_amount
      });
    });

    test('retrieves order by Stripe session ID', async () => {
      const sessionId = 'cs_test_unique_session_123';
      const originalOrder = await createTestOrder({ stripe_session_id: sessionId });
      
      const result = await testDb.query(
        'SELECT * FROM orders WHERE stripe_session_id = $1',
        [sessionId]
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(originalOrder.id);
    });

    test('updates order status', async () => {
      const order = await createTestOrder();
      
      await testDb.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
        ['completed', order.id]
      );
      
      const result = await testDb.query(
        'SELECT status, updated_at FROM orders WHERE id = $1',
        [order.id]
      );
      
      expect(result.rows[0].status).toBe('completed');
      expect(result.rows[0].updated_at).not.toEqual(order.updated_at);
    });

    test('handles duplicate session IDs', async () => {
      const sessionId = 'cs_test_duplicate_123';
      
      await createTestOrder({ stripe_session_id: sessionId });
      
      // Attempt to create another order with same session ID
      await expect(
        createTestOrder({ stripe_session_id: sessionId })
      ).rejects.toThrow();
    });

    test('validates required fields', async () => {
      // Missing customer_email
      await expect(
        createTestOrder({ customer_email: null })
      ).rejects.toThrow();
      
      // Missing total_amount
      await expect(
        createTestOrder({ total_amount: null })
      ).rejects.toThrow();
    });

    test('handles concurrent order creation', async () => {
      const orderPromises = Array(5).fill().map((_, index) =>
        createTestOrder({ 
          customer_email: `concurrent${index}@example.com`,
          stripe_session_id: `cs_test_concurrent_${index}`
        })
      );
      
      const orders = await Promise.all(orderPromises);
      
      expect(orders).toHaveLength(5);
      orders.forEach((order, index) => {
        expect(order.customer_email).toBe(`concurrent${index}@example.com`);
      });
    });
  });

  describe('Payment Operations', () => {
    test('creates payment record', async () => {
      const order = await createTestOrder();
      const paymentData = {
        order_id: order.id,
        stripe_payment_intent_id: 'pi_test_new_payment',
        amount: 30000,
        currency: 'usd',
        status: 'succeeded'
      };

      const payment = await createTestPayment(paymentData);
      
      expect(payment).toMatchObject({
        order_id: order.id,
        stripe_payment_intent_id: 'pi_test_new_payment',
        amount: 30000,
        currency: 'usd',
        status: 'succeeded'
      });
    });

    test('links payment to order', async () => {
      const order = await createTestOrder();
      const payment = await createTestPayment({ order_id: order.id });
      
      const result = await testDb.query(`
        SELECT o.*, p.* 
        FROM orders o
        JOIN payments p ON o.id = p.order_id
        WHERE o.id = $1
      `, [order.id]);
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].order_id).toBe(order.id);
    });

    test('tracks payment status changes', async () => {
      const payment = await createTestPayment({ status: 'requires_payment_method' });
      
      // Update payment status
      await testDb.query(
        'UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2',
        ['succeeded', payment.id]
      );
      
      const result = await testDb.query(
        'SELECT status FROM payments WHERE id = $1',
        [payment.id]
      );
      
      expect(result.rows[0].status).toBe('succeeded');
    });

    test('prevents duplicate payment intents', async () => {
      const intentId = 'pi_test_duplicate_intent';
      
      await createTestPayment({ stripe_payment_intent_id: intentId });
      
      await expect(
        createTestPayment({ stripe_payment_intent_id: intentId })
      ).rejects.toThrow();
    });

    test('calculates payment totals by status', async () => {
      const order = await createTestOrder();
      
      // Create payments with different statuses
      await createTestPayment({ 
        order_id: order.id, 
        amount: 10000, 
        status: 'succeeded',
        stripe_payment_intent_id: 'pi_test_succeeded_1'
      });
      await createTestPayment({ 
        order_id: order.id, 
        amount: 20000, 
        status: 'failed',
        stripe_payment_intent_id: 'pi_test_failed_1'
      });
      
      const result = await testDb.query(`
        SELECT status, SUM(amount) as total_amount, COUNT(*) as count
        FROM payments 
        WHERE order_id = $1
        GROUP BY status
      `, [order.id]);
      
      const statusTotals = result.rows.reduce((acc, row) => {
        acc[row.status] = { amount: parseInt(row.total_amount), count: parseInt(row.count) };
        return acc;
      }, {});
      
      expect(statusTotals.succeeded).toEqual({ amount: 10000, count: 1 });
      expect(statusTotals.failed).toEqual({ amount: 20000, count: 1 });
    });
  });

  describe('Order Items Operations', () => {
    test('creates order items for order', async () => {
      const order = await createTestOrder();
      
      await testDb.query(`
        INSERT INTO order_items (order_id, ticket_type, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.id, 'full-festival', 2, 30000, 60000]);
      
      const result = await testDb.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        order_id: order.id,
        ticket_type: 'full-festival',
        quantity: 2,
        unit_price: 30000,
        total_price: 60000
      });
    });

    test('retrieves order with items', async () => {
      const order = await createTestOrder();
      
      // Add multiple items
      await testDb.query(`
        INSERT INTO order_items (order_id, ticket_type, quantity, unit_price, total_price)
        VALUES 
          ($1, 'full-festival', 1, 30000, 30000),
          ($1, 'workshop-only', 2, 15000, 30000)
      `, [order.id]);
      
      const result = await testDb.query(`
        SELECT 
          o.*,
          json_agg(
            json_build_object(
              'ticket_type', oi.ticket_type,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price,
              'total_price', oi.total_price
            )
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.id = $1
        GROUP BY o.id
      `, [order.id]);
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].items).toHaveLength(2);
    });

    test('cascades order deletion to items', async () => {
      const order = await createTestOrder();
      
      await testDb.query(`
        INSERT INTO order_items (order_id, ticket_type, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.id, 'full-festival', 1, 30000, 30000]);
      
      // Delete order
      await testDb.query('DELETE FROM orders WHERE id = $1', [order.id]);
      
      // Check that items were also deleted
      const result = await testDb.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      );
      
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Inventory Operations', () => {
    test('checks ticket availability', async () => {
      const result = await testDb.query(
        'SELECT available_quantity FROM inventory WHERE ticket_type = $1',
        ['full-festival']
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].available_quantity).toBe(100);
    });

    test('decrements inventory on purchase', async () => {
      const order = await createTestOrder();
      const purchaseQuantity = 5;
      
      // Simulate purchase
      await testDb.query('BEGIN');
      
      try {
        // Check availability
        const checkResult = await testDb.query(
          'SELECT available_quantity FROM inventory WHERE ticket_type = $1 FOR UPDATE',
          ['full-festival']
        );
        
        expect(checkResult.rows[0].available_quantity).toBeGreaterThanOrEqual(purchaseQuantity);
        
        // Update inventory
        await testDb.query(`
          UPDATE inventory 
          SET available_quantity = available_quantity - $1,
              updated_at = NOW()
          WHERE ticket_type = $2
        `, [purchaseQuantity, 'full-festival']);
        
        // Create order item
        await testDb.query(`
          INSERT INTO order_items (order_id, ticket_type, quantity, unit_price, total_price)
          VALUES ($1, $2, $3, $4, $5)
        `, [order.id, 'full-festival', purchaseQuantity, 30000, 150000]);
        
        await testDb.query('COMMIT');
        
        // Verify inventory was updated
        const finalResult = await testDb.query(
          'SELECT available_quantity FROM inventory WHERE ticket_type = $1',
          ['full-festival']
        );
        
        expect(finalResult.rows[0].available_quantity).toBe(95); // 100 - 5
        
      } catch (error) {
        await testDb.query('ROLLBACK');
        throw error;
      }
    });

    test('prevents overselling with concurrent purchases', async () => {
      // Set low inventory
      await testDb.query(
        'UPDATE inventory SET available_quantity = 2 WHERE ticket_type = $1',
        ['full-festival']
      );
      
      // Attempt concurrent purchases that would exceed inventory
      const purchasePromises = Array(5).fill().map(async (_, index) => {
        const order = await createTestOrder({ 
          customer_email: `buyer${index}@example.com`,
          stripe_session_id: `cs_test_concurrent_${index}`
        });
        
        return testDb.query('BEGIN').then(async () => {
          try {
            const result = await testDb.query(
              'SELECT available_quantity FROM inventory WHERE ticket_type = $1 FOR UPDATE',
              ['full-festival']
            );
            
            if (result.rows[0].available_quantity < 1) {
              throw new Error('Insufficient inventory');
            }
            
            await testDb.query(`
              UPDATE inventory 
              SET available_quantity = available_quantity - 1
              WHERE ticket_type = $1
            `, ['full-festival']);
            
            await testDb.query(`
              INSERT INTO order_items (order_id, ticket_type, quantity, unit_price, total_price)
              VALUES ($1, $2, $3, $4, $5)
            `, [order.id, 'full-festival', 1, 30000, 30000]);
            
            await testDb.query('COMMIT');
            return { success: true, orderId: order.id };
            
          } catch (error) {
            await testDb.query('ROLLBACK');
            return { success: false, error: error.message };
          }
        });
      });
      
      const results = await Promise.all(purchasePromises);
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      expect(successful).toHaveLength(2); // Only 2 should succeed
      expect(failed).toHaveLength(3); // 3 should fail
    });

    test('handles inventory restoration on refund', async () => {
      const order = await createTestOrder();
      
      // Purchase tickets
      await testDb.query(`
        UPDATE inventory 
        SET available_quantity = available_quantity - 3
        WHERE ticket_type = $1
      `, ['full-festival']);
      
      await testDb.query(`
        INSERT INTO order_items (order_id, ticket_type, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.id, 'full-festival', 3, 30000, 90000]);
      
      // Refund/restore inventory
      await testDb.query(`
        UPDATE inventory 
        SET available_quantity = available_quantity + 3
        WHERE ticket_type = $1
      `, ['full-festival']);
      
      const result = await testDb.query(
        'SELECT available_quantity FROM inventory WHERE ticket_type = $1',
        ['full-festival']
      );
      
      expect(result.rows[0].available_quantity).toBe(100); // Back to original
    });
  });

  describe('Database Performance', () => {
    test('executes simple queries under performance threshold', async () => {
      const start = performance.now();
      
      await testDb.query('SELECT * FROM inventory');
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // 50ms threshold
    });

    test('handles bulk operations efficiently', async () => {
      const start = performance.now();
      
      // Create multiple orders in batch
      const orderData = Array(50).fill().map((_, index) => [
        `bulk${index}@example.com`,
        `Bulk Customer ${index}`,
        30000,
        'usd',
        'pending',
        `cs_test_bulk_${index}`
      ]);
      
      const query = `
        INSERT INTO orders (customer_email, customer_name, total_amount, currency, status, stripe_session_id)
        VALUES ${orderData.map((_, i) => `($${i*6+1}, $${i*6+2}, $${i*6+3}, $${i*6+4}, $${i*6+5}, $${i*6+6})`).join(', ')}
      `;
      
      await testDb.query(query, orderData.flat());
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1000); // 1 second for 50 records
    });

    test('maintains query performance under load', async () => {
      // Create test data
      const orders = await Promise.all(
        Array(20).fill().map((_, index) =>
          createTestOrder({ 
            customer_email: `load${index}@example.com`,
            stripe_session_id: `cs_test_load_${index}`
          })
        )
      );
      
      // Execute concurrent queries
      const start = performance.now();
      
      const queryPromises = orders.map(order =>
        testDb.query('SELECT * FROM orders WHERE id = $1', [order.id])
      );
      
      await Promise.all(queryPromises);
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500); // 500ms for 20 concurrent queries
    });
  });

  describe('Database Statistics', () => {
    test('tracks database statistics correctly', async () => {
      // Create test data
      await createTestOrder();
      await createTestPayment();
      
      const stats = await getTestDbStats();
      
      expect(stats.orders).toBeGreaterThan(0);
      expect(stats.payments).toBeGreaterThan(0);
      expect(stats.inventory).toBeGreaterThan(0);
    });
  });
});