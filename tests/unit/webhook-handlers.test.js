/**
 * Unit tests for Webhook Handlers
 * Tests Stripe webhook processing with mock events
 */

import { jest } from '@jest/globals';
import { 
  createMockStripe, 
  mockWebhookEvents, 
  mockWebhookSignature,
  mockStripeErrors 
} from '../mocks/stripe.js';
import { createMockSendGrid } from '../mocks/sendgrid.js';
import { 
  getTestDbClient, 
  cleanTestData, 
  insertTestData,
  createTestOrder 
} from '../config/testDatabase.js';

// Mock external services
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => createMockStripe())
}));

jest.unstable_mockModule('@sendgrid/mail', () => createMockSendGrid());

// Import webhook handler after mocking
const stripeWebhook = await import('../../api/webhooks/stripe.js');

describe('Webhook Handlers', () => {
  let mockStripe;
  let mockSendGrid;
  let mockRequest;
  let mockResponse;
  let testDb;

  beforeAll(async () => {
    testDb = await getTestDbClient();
  });

  beforeEach(async () => {
    await cleanTestData();
    await insertTestData();
    
    mockStripe = createMockStripe();
    mockSendGrid = createMockSendGrid();
    
    mockRequest = {
      method: 'POST',
      headers: {
        'stripe-signature': 'test_signature',
        'content-type': 'application/json'
      },
      body: '',
      rawBody: Buffer.from(''),
      query: {}
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn()
    };
    
    jest.clearAllMocks();
  });

  describe('Webhook Signature Verification', () => {
    test('verifies valid webhook signature', async () => {
      const { payload, signature } = mockWebhookSignature();
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        mockRequest.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    test('rejects invalid webhook signature', async () => {
      mockRequest.headers['stripe-signature'] = 'invalid_signature';
      mockRequest.rawBody = Buffer.from('invalid payload');
      
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        const error = new Error('Invalid signature');
        error.type = 'StripeSignatureVerificationError';
        throw error;
      });
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid signature')
        })
      );
    });

    test('rejects missing webhook signature', async () => {
      delete mockRequest.headers['stripe-signature'];
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Missing signature')
        })
      );
    });

    test('handles webhook signature verification timeout', async () => {
      const { payload, signature } = mockWebhookSignature();
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        return new Promise((resolve) => {
          // Simulate timeout
          setTimeout(() => resolve(mockWebhookEvents.checkoutSessionCompleted), 6000);
        });
      });
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Should timeout and return error
      expect(mockResponse.status).toHaveBeenCalledWith(408);
    }, 10000);
  });

  describe('Checkout Session Completed Events', () => {
    test('processes successful checkout session completion', async () => {
      // Create order that matches the webhook
      const order = await createTestOrder({
        stripe_session_id: mockWebhookEvents.checkoutSessionCompleted.data.object.id,
        status: 'pending'
      });
      
      const { payload, signature } = mockWebhookSignature(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Check order was updated
      const updatedOrder = await testDb.query(
        'SELECT status FROM orders WHERE id = $1',
        [order.id]
      );
      
      expect(updatedOrder.rows[0].status).toBe('completed');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      
      // Check confirmation email was sent
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockWebhookEvents.checkoutSessionCompleted.data.object.customer_email,
          subject: expect.stringContaining('Payment Confirmed')
        })
      );
    });

    test('handles checkout session for non-existent order', async () => {
      const { payload, signature } = mockWebhookSignature(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Should handle gracefully but log warning
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    test('updates inventory after successful checkout', async () => {
      const order = await createTestOrder({
        stripe_session_id: mockWebhookEvents.checkoutSessionCompleted.data.object.id,
        status: 'pending'
      });
      
      // Add order items
      await testDb.query(`
        INSERT INTO order_items (order_id, ticket_type, quantity, unit_price, total_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [order.id, 'full-festival', 2, 30000, 60000]);
      
      const { payload, signature } = mockWebhookSignature(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Check inventory was decremented
      const inventory = await testDb.query(
        'SELECT available_quantity FROM inventory WHERE ticket_type = $1',
        ['full-festival']
      );
      
      expect(inventory.rows[0].available_quantity).toBe(98); // 100 - 2
    });

    test('prevents duplicate processing with idempotency', async () => {
      const order = await createTestOrder({
        stripe_session_id: mockWebhookEvents.checkoutSessionCompleted.data.object.id,
        status: 'pending'
      });
      
      const { payload, signature } = mockWebhookSignature(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValue(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      // Process webhook twice
      await stripeWebhook.default(mockRequest, mockResponse);
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Should only process once
      expect(mockSendGrid.send).toHaveBeenCalledTimes(1);
      
      const orderStatus = await testDb.query(
        'SELECT status FROM orders WHERE id = $1',
        [order.id]
      );
      
      expect(orderStatus.rows[0].status).toBe('completed');
    });
  });

  describe('Payment Intent Events', () => {
    test('processes payment intent succeeded event', async () => {
      const order = await createTestOrder();
      
      // Create payment record
      await testDb.query(`
        INSERT INTO payments (order_id, stripe_payment_intent_id, amount, currency, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        order.id,
        mockWebhookEvents.paymentIntentSucceeded.data.object.id,
        30000,
        'usd',
        'requires_payment_method'
      ]);
      
      const { payload, signature } = mockWebhookSignature(
        mockWebhookEvents.paymentIntentSucceeded
      );
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.paymentIntentSucceeded
      );
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Check payment status was updated
      const payment = await testDb.query(
        'SELECT status FROM payments WHERE stripe_payment_intent_id = $1',
        [mockWebhookEvents.paymentIntentSucceeded.data.object.id]
      );
      
      expect(payment.rows[0].status).toBe('succeeded');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    test('processes payment intent failed event', async () => {
      const order = await createTestOrder();
      
      await testDb.query(`
        INSERT INTO payments (order_id, stripe_payment_intent_id, amount, currency, status)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        order.id,
        mockWebhookEvents.paymentIntentFailed.data.object.id,
        30000,
        'usd',
        'requires_payment_method'
      ]);
      
      const { payload, signature } = mockWebhookSignature(
        mockWebhookEvents.paymentIntentFailed
      );
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.paymentIntentFailed
      );
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Check payment failure was recorded
      const payment = await testDb.query(`
        SELECT status, failure_reason FROM payments 
        WHERE stripe_payment_intent_id = $1
      `, [mockWebhookEvents.paymentIntentFailed.data.object.id]);
      
      expect(payment.rows[0].status).toBe('requires_payment_method');
      expect(payment.rows[0].failure_reason).toContain('card_declined');
      
      // Check failure email was sent
      expect(mockSendGrid.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Payment Failed')
        })
      );
    });
  });

  describe('Webhook Event Logging', () => {
    test('logs all webhook events for audit trail', async () => {
      const { payload, signature } = mockWebhookSignature();
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Check event was logged
      const loggedEvents = await testDb.query(`
        SELECT * FROM webhook_events 
        WHERE stripe_event_id = $1
      `, [mockWebhookEvents.checkoutSessionCompleted.id]);
      
      expect(loggedEvents.rows).toHaveLength(1);
      expect(loggedEvents.rows[0]).toMatchObject({
        stripe_event_id: mockWebhookEvents.checkoutSessionCompleted.id,
        event_type: 'checkout.session.completed',
        processed: true
      });
    });

    test('tracks webhook processing time', async () => {
      const { payload, signature } = mockWebhookSignature();
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      const start = performance.now();
      await stripeWebhook.default(mockRequest, mockResponse);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should process under 1 second
    });
  });

  describe('Error Handling', () => {
    test('handles database connection errors during webhook processing', async () => {
      const { payload, signature } = mockWebhookSignature();
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      // Mock database error
      const originalQuery = testDb.query;
      testDb.query = jest.fn().mockRejectedValue(new Error('Database connection failed'));
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Database error')
        })
      );
      
      // Restore original method
      testDb.query = originalQuery;
    });

    test('handles email sending failures gracefully', async () => {
      const order = await createTestOrder({
        stripe_session_id: mockWebhookEvents.checkoutSessionCompleted.data.object.id,
        status: 'pending'
      });
      
      const { payload, signature } = mockWebhookSignature();
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      // Mock email failure
      mockSendGrid.simulateServerError();
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Webhook should still succeed even if email fails
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      
      // Order should still be updated
      const updatedOrder = await testDb.query(
        'SELECT status FROM orders WHERE id = $1',
        [order.id]
      );
      
      expect(updatedOrder.rows[0].status).toBe('completed');
    });

    test('handles unknown webhook event types', async () => {
      const unknownEvent = {
        ...mockWebhookEvents.checkoutSessionCompleted,
        type: 'unknown.event.type'
      };
      
      const { payload, signature } = mockWebhookSignature(unknownEvent);
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(unknownEvent);
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      // Should acknowledge unknown events without processing
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Event type not handled')
        })
      );
    });

    test('handles malformed webhook payloads', async () => {
      mockRequest.body = 'invalid json payload';
      mockRequest.headers['stripe-signature'] = 'test_signature';
      mockRequest.rawBody = Buffer.from('invalid json payload');
      
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid JSON');
      });
      
      await stripeWebhook.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid payload')
        })
      );
    });
  });

  describe('Webhook Performance', () => {
    test('processes webhooks under performance threshold', async () => {
      const order = await createTestOrder({
        stripe_session_id: mockWebhookEvents.checkoutSessionCompleted.data.object.id,
        status: 'pending'
      });
      
      const { payload, signature } = mockWebhookSignature();
      
      mockRequest.body = payload;
      mockRequest.headers['stripe-signature'] = signature;
      mockRequest.rawBody = Buffer.from(payload);
      
      mockStripe.webhooks.constructEvent.mockReturnValueOnce(
        mockWebhookEvents.checkoutSessionCompleted
      );
      
      const start = performance.now();
      await stripeWebhook.default(mockRequest, mockResponse);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(2000); // 2 second threshold
    });

    test('handles concurrent webhook processing', async () => {
      const webhookPromises = Array(5).fill().map(async (_, index) => {
        const order = await createTestOrder({
          stripe_session_id: `cs_test_concurrent_${index}`,
          customer_email: `concurrent${index}@example.com`,
          status: 'pending'
        });
        
        const event = {
          ...mockWebhookEvents.checkoutSessionCompleted,
          id: `evt_test_concurrent_${index}`,
          data: {
            object: {
              ...mockWebhookEvents.checkoutSessionCompleted.data.object,
              id: `cs_test_concurrent_${index}`,
              customer_email: `concurrent${index}@example.com`
            }
          }
        };
        
        const { payload, signature } = mockWebhookSignature(event);
        
        const request = {
          ...mockRequest,
          body: payload,
          headers: { ...mockRequest.headers, 'stripe-signature': signature },
          rawBody: Buffer.from(payload)
        };
        
        const response = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis(),
          send: jest.fn().mockReturnThis(),
          end: jest.fn()
        };
        
        mockStripe.webhooks.constructEvent.mockReturnValueOnce(event);
        
        return stripeWebhook.default(request, response);
      });
      
      const start = performance.now();
      await Promise.all(webhookPromises);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(5000); // 5 seconds for 5 concurrent webhooks
    });
  });
});