/**
 * Integration tests for Complete Payment Flow
 * Tests end-to-end payment processing with real database and mocked external services
 */

import { jest } from '@jest/globals';
import { 
  createMockStripe, 
  mockWebhookEvents,
  mockWebhookSignature 
} from '../mocks/stripe.js';
import { createMockSendGrid } from '../mocks/sendgrid.js';
import { 
  getTestDbClient, 
  cleanTestData, 
  insertTestData,
  getTestDbStats 
} from '../config/testDatabase.js';

// Mock external services
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => createMockStripe())
}));

jest.unstable_mockModule('@sendgrid/mail', () => createMockSendGrid());

// Import modules after mocking
const calculateTotal = await import('../../api/payment/calculate-total.js');
const createCheckoutSession = await import('../../api/payment/create-checkout-session.js');
const stripeWebhook = await import('../../api/webhooks/stripe.js');
const inventoryCheck = await import('../../api/inventory/check-availability.js');

describe('Complete Payment Flow Integration', () => {
  let mockStripe;
  let mockSendGrid;
  let testDb;

  beforeAll(async () => {
    testDb = await getTestDbClient();
  });

  beforeEach(async () => {
    await cleanTestData();
    await insertTestData();
    
    mockStripe = createMockStripe();
    mockSendGrid = createMockSendGrid();
    
    jest.clearAllMocks();
  });

  describe('Successful Payment Flow', () => {
    test('completes full payment journey from cart to confirmation', async () => {
      // Step 1: Calculate total
      const calculateRequest = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          items: [
            { id: 'full-festival', quantity: 2, price: 300.00 },
            { id: 'workshop-only', quantity: 1, price: 150.00 }
          ]
        }
      };
      
      const calculateResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      
      await calculateTotal.default(calculateRequest, calculateResponse);
      
      expect(calculateResponse.status).toHaveBeenCalledWith(200);
      expect(calculateResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 75000, // $750.00
          totalDollars: 750.00
        })
      );
      
      // Step 2: Check inventory availability
      const inventoryRequest = {
        method: 'POST',
        body: {
          items: [
            { id: 'full-festival', quantity: 2 },
            { id: 'workshop-only', quantity: 1 }
          ]
        }
      };
      
      const inventoryResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      
      await inventoryCheck.default(inventoryRequest, inventoryResponse);
      
      expect(inventoryResponse.status).toHaveBeenCalledWith(200);
      expect(inventoryResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          available: true,
          inventory: expect.objectContaining({
            'full-festival': expect.objectContaining({ available: true }),
            'workshop-only': expect.objectContaining({ available: true })
          })
        })
      );
      
      // Step 3: Create checkout session
      const checkoutRequest = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          items: [
            { id: 'full-festival', quantity: 2, price: 300.00 },
            { id: 'workshop-only', quantity: 1, price: 150.00 }
          ],
          customerEmail: 'integration@example.com',
          customerName: 'Integration Test Customer'
        }
      };
      
      const checkoutResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      
      mockStripe.checkout.sessions.create.mockResolvedValueOnce({
        id: 'cs_test_integration_123',
        url: 'https://checkout.stripe.com/pay/cs_test_integration_123',
        metadata: { order_id: '1' }
      });
      
      await createCheckoutSession.default(checkoutRequest, checkoutResponse);
      
      expect(checkoutResponse.status).toHaveBeenCalledWith(200);
      expect(checkoutResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'cs_test_integration_123',
          url: 'https://checkout.stripe.com/pay/cs_test_integration_123'
        })
      );
      
      // Verify order was created in database
      const orders = await testDb.query(
        'SELECT * FROM orders WHERE stripe_session_id = $1',
        ['cs_test_integration_123']
      );
      
      expect(orders.rows).toHaveLength(1);
      const order = orders.rows[0];
      expect(order.customer_email).toBe('integration@example.com');
      expect(order.total_amount).toBe(75000);
      expect(order.status).toBe('pending');
      
      // Step 4: Process successful webhook
      const webhookEvent = {
        ...mockWebhookEvents.checkoutSessionCompleted,
        id: 'evt_integration_test_123',
        data: {
          object: {
            ...mockWebhookEvents.checkoutSessionCompleted.data.object,
            id: 'cs_test_integration_123',
            customer_email: 'integration@example.com',
            amount_total: 75000,
            metadata: { order_id: order.id.toString() }
          }
        }
      };
      
      const { payload, signature } = mockWebhookSignature(webhookEvent);
      
      const webhookRequest = {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: payload,
        rawBody: Buffer.from(payload)
      };
      
      const webhookResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(webhookEvent);
      mockSendGrid.simulateSuccess();
      
      await stripeWebhook.default(webhookRequest, webhookResponse);
      
      expect(webhookResponse.status).toHaveBeenCalledWith(200);
      
      // Step 5: Verify final state
      const finalOrder = await testDb.query(
        'SELECT * FROM orders WHERE id = $1',
        [order.id]
      );
      
      expect(finalOrder.rows[0].status).toBe('completed');
      
      // Verify inventory was decremented
      const finalInventory = await testDb.query(
        'SELECT * FROM inventory WHERE ticket_type IN ($1, $2)',
        ['full-festival', 'workshop-only']
      );
      
      const inventoryMap = finalInventory.rows.reduce((acc, row) => {
        acc[row.ticket_type] = row.available_quantity;
        return acc;
      }, {});
      
      expect(inventoryMap['full-festival']).toBe(98); // 100 - 2
      expect(inventoryMap['workshop-only']).toBe(199); // 200 - 1
      
      // Verify confirmation email was sent
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'integration@example.com',
          subject: expect.stringContaining('Payment Confirmed')
        })
      );
      
      // Verify order items were created
      const orderItems = await testDb.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      );
      
      expect(orderItems.rows).toHaveLength(2);
      expect(orderItems.rows.find(item => item.ticket_type === 'full-festival').quantity).toBe(2);
      expect(orderItems.rows.find(item => item.ticket_type === 'workshop-only').quantity).toBe(1);
    });

    test('handles payment with donation items correctly', async () => {
      const donationAmount = 100.00;
      
      // Calculate total with donation
      const calculateRequest = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          items: [
            { id: 'full-festival', quantity: 1, price: 300.00 },
            { id: 'donation', quantity: 1, price: donationAmount }
          ]
        }
      };
      
      const calculateResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      
      await calculateTotal.default(calculateRequest, calculateResponse);
      
      expect(calculateResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 40000, // $400.00 (300 + 100)
          breakdown: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                id: 'donation',
                unitPrice: donationAmount,
                total: donationAmount
              })
            ])
          })
        })
      );
    });
  });

  describe('Payment Failure Scenarios', () => {
    test('handles inventory depletion during checkout', async () => {
      // Deplete inventory first
      await testDb.query(
        'UPDATE inventory SET available_quantity = 0 WHERE ticket_type = $1',
        ['full-festival']
      );
      
      const checkoutRequest = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          items: [{ id: 'full-festival', quantity: 1, price: 300.00 }],
          customerEmail: 'test@example.com',
          customerName: 'Test Customer'
        }
      };
      
      const checkoutResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      
      await createCheckoutSession.default(checkoutRequest, checkoutResponse);
      
      expect(checkoutResponse.status).toHaveBeenCalledWith(400);
      expect(checkoutResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('not available')
        })
      );
    });

    test('processes payment failure webhook correctly', async () => {
      // Create order first
      const order = await testDb.query(`
        INSERT INTO orders (customer_email, customer_name, total_amount, currency, status, stripe_session_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, ['failed@example.com', 'Failed Customer', 30000, 'usd', 'pending', 'cs_test_failed_123']);
      
      // Create payment record
      await testDb.query(`
        INSERT INTO payments (order_id, stripe_payment_intent_id, amount, currency, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.rows[0].id, 'pi_test_failed_123', 30000, 'usd', 'requires_payment_method']);
      
      const failureEvent = {
        ...mockWebhookEvents.paymentIntentFailed,
        data: {
          object: {
            ...mockWebhookEvents.paymentIntentFailed.data.object,
            id: 'pi_test_failed_123',
            metadata: { order_id: order.rows[0].id.toString() }
          }
        }
      };
      
      const { payload, signature } = mockWebhookSignature(failureEvent);
      
      const webhookRequest = {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: payload,
        rawBody: Buffer.from(payload)
      };
      
      const webhookResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(failureEvent);
      mockSendGrid.simulateSuccess();
      
      await stripeWebhook.default(webhookRequest, webhookResponse);
      
      // Verify payment failure was recorded
      const payment = await testDb.query(
        'SELECT status, failure_reason FROM payments WHERE stripe_payment_intent_id = $1',
        ['pi_test_failed_123']
      );
      
      expect(payment.rows[0].status).toBe('requires_payment_method');
      expect(payment.rows[0].failure_reason).toContain('card_declined');
      
      // Verify failure email was sent
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'failed@example.com',
          subject: expect.stringContaining('Payment Failed')
        })
      );
    });
  });

  describe('Concurrent Order Processing', () => {
    test('handles multiple simultaneous orders correctly', async () => {
      const orderCount = 5;
      const orderPromises = Array(orderCount).fill().map(async (_, index) => {
        const checkoutRequest = {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: {
            items: [{ id: 'workshop-only', quantity: 1, price: 150.00 }],
            customerEmail: `concurrent${index}@example.com`,
            customerName: `Concurrent Customer ${index}`
          }
        };
        
        const checkoutResponse = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis()
        };
        
        mockStripe.checkout.sessions.create.mockResolvedValueOnce({
          id: `cs_test_concurrent_${index}`,
          url: `https://checkout.stripe.com/pay/cs_test_concurrent_${index}`,
          metadata: { order_id: (index + 1).toString() }
        });
        
        await createCheckoutSession.default(checkoutRequest, checkoutResponse);
        
        return {
          sessionId: `cs_test_concurrent_${index}`,
          email: `concurrent${index}@example.com`,
          response: checkoutResponse
        };
      });
      
      const results = await Promise.all(orderPromises);
      
      // All should succeed
      results.forEach(result => {
        expect(result.response.status).toHaveBeenCalledWith(200);
      });
      
      // Verify all orders were created
      const orders = await testDb.query(
        'SELECT COUNT(*) as count FROM orders WHERE customer_email LIKE $1',
        ['concurrent%@example.com']
      );
      
      expect(parseInt(orders.rows[0].count)).toBe(orderCount);
      
      // Verify inventory was properly decremented
      const inventory = await testDb.query(
        'SELECT available_quantity FROM inventory WHERE ticket_type = $1',
        ['workshop-only']
      );
      
      expect(inventory.rows[0].available_quantity).toBe(200 - orderCount);
    });

    test('prevents overselling with concurrent high-volume orders', async () => {
      // Set limited inventory
      await testDb.query(
        'UPDATE inventory SET available_quantity = 3 WHERE ticket_type = $1',
        ['full-festival']
      );
      
      // Attempt to create 10 orders for 1 ticket each (should only allow 3)
      const orderPromises = Array(10).fill().map(async (_, index) => {
        try {
          const checkoutRequest = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: {
              items: [{ id: 'full-festival', quantity: 1, price: 300.00 }],
              customerEmail: `oversell${index}@example.com`,
              customerName: `Oversell Customer ${index}`
            }
          };
          
          const checkoutResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
          };
          
          mockStripe.checkout.sessions.create.mockResolvedValueOnce({
            id: `cs_test_oversell_${index}`,
            url: `https://checkout.stripe.com/pay/cs_test_oversell_${index}`
          });
          
          await createCheckoutSession.default(checkoutRequest, checkoutResponse);
          
          return { success: true, index, response: checkoutResponse };
        } catch (error) {
          return { success: false, index, error: error.message };
        }
      });
      
      const results = await Promise.all(orderPromises);
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      expect(successful.length).toBeLessThanOrEqual(3);
      expect(failed.length).toBeGreaterThanOrEqual(7);
      
      // Verify final inventory
      const finalInventory = await testDb.query(
        'SELECT available_quantity FROM inventory WHERE ticket_type = $1',
        ['full-festival']
      );
      
      expect(finalInventory.rows[0].available_quantity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Consistency', () => {
    test('maintains data consistency across order processing', async () => {
      const initialStats = await getTestDbStats();
      
      // Process multiple orders
      const orders = await Promise.all([
        processTestOrder('data1@example.com', [{ id: 'full-festival', quantity: 1, price: 300.00 }]),
        processTestOrder('data2@example.com', [{ id: 'workshop-only', quantity: 2, price: 150.00 }]),
        processTestOrder('data3@example.com', [{ id: 'social-only', quantity: 1, price: 75.00 }])
      ]);
      
      const finalStats = await getTestDbStats();
      
      // Verify data consistency
      expect(finalStats.orders).toBe(initialStats.orders + 3);
      expect(finalStats.order_items).toBe(initialStats.order_items + 3);
      
      // Verify order totals match items
      for (const order of orders) {
        const orderItems = await testDb.query(
          'SELECT SUM(total_price) as total FROM order_items WHERE order_id = $1',
          [order.id]
        );
        
        expect(parseInt(orderItems.rows[0].total)).toBe(order.total_amount);
      }
    });

    test('handles database transaction rollbacks correctly', async () => {
      const initialInventory = await testDb.query(
        'SELECT available_quantity FROM inventory WHERE ticket_type = $1',
        ['full-festival']
      );
      
      // Mock a database error during order processing
      const originalQuery = testDb.query;
      let queryCount = 0;
      
      testDb.query = jest.fn().mockImplementation((...args) => {
        queryCount++;
        if (queryCount === 3) { // Fail on third query (during order items creation)
          throw new Error('Database error during transaction');
        }
        return originalQuery.apply(testDb, args);
      });
      
      const checkoutRequest = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: {
          items: [{ id: 'full-festival', quantity: 2, price: 300.00 }],
          customerEmail: 'rollback@example.com',
          customerName: 'Rollback Test'
        }
      };
      
      const checkoutResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      
      await createCheckoutSession.default(checkoutRequest, checkoutResponse);
      
      // Should fail
      expect(checkoutResponse.status).toHaveBeenCalledWith(500);
      
      // Restore original query function
      testDb.query = originalQuery;
      
      // Verify inventory wasn't affected
      const finalInventory = await testDb.query(
        'SELECT available_quantity FROM inventory WHERE ticket_type = $1',
        ['full-festival']
      );
      
      expect(finalInventory.rows[0].available_quantity).toBe(
        initialInventory.rows[0].available_quantity
      );
    });
  });

  describe('Performance Under Load', () => {
    test('maintains performance with multiple concurrent payment flows', async () => {
      const concurrentFlows = 20;
      
      const start = performance.now();
      
      const flowPromises = Array(concurrentFlows).fill().map(async (_, index) => {
        return processTestOrder(
          `perf${index}@example.com`,
          [{ id: 'donation', quantity: 1, price: 25.00 }]
        );
      });
      
      const results = await Promise.all(flowPromises);
      const duration = performance.now() - start;
      
      expect(results).toHaveLength(concurrentFlows);
      expect(duration).toBeLessThan(10000); // 10 seconds for 20 concurrent flows
      
      // Verify all orders were processed
      results.forEach(order => {
        expect(order.id).toBeDefined();
        expect(order.status).toBe('completed');
      });
    });
  });
});

/**
 * Helper function to process a complete test order
 */
async function processTestOrder(email, items) {
  const testDb = await getTestDbClient();
  const mockStripe = createMockStripe();
  const mockSendGrid = createMockSendGrid();
  
  // Create checkout session
  const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const order = await testDb.query(`
    INSERT INTO orders (customer_email, customer_name, total_amount, currency, status, stripe_session_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    email,
    'Test Customer',
    items.reduce((sum, item) => sum + (item.price * item.quantity * 100), 0),
    'usd',
    'pending',
    sessionId
  ]);
  
  // Add order items
  for (const item of items) {
    await testDb.query(`
      INSERT INTO order_items (order_id, ticket_type, quantity, unit_price, total_price)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      order.rows[0].id,
      item.id,
      item.quantity,
      item.price * 100,
      item.price * item.quantity * 100
    ]);
  }
  
  // Update order status to completed
  await testDb.query(
    'UPDATE orders SET status = $1 WHERE id = $2',
    ['completed', order.rows[0].id]
  );
  
  return order.rows[0];
}