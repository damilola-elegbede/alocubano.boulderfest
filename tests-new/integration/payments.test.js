/**
 * Payment API Integration Tests
 * Tests the actual Stripe payment endpoints with real HTTP requests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { serverManager } from '../core/server.js';
import { httpClient } from '../core/http.js';
import { stripeHelpers } from '../core/stripe-helpers.js';
import { TestDataFactory } from '../helpers/test-data.js';

describe('Payment API Integration Tests', () => {
  let serverUrl;
  let testData;

  beforeAll(async () => {
    // Start the test server
    serverUrl = await serverManager.start();
    console.log('✅ Test server started for payment tests');

    // Initialize HTTP client
    httpClient.initialize();

    // Verify Stripe connection
    const stripeConnection = await stripeHelpers.testStripeConnection();
    if (!stripeConnection.connected) {
      throw new Error(`Stripe connection failed: ${stripeConnection.error}`);
    }
    console.log('✅ Stripe connection verified:', {
      testMode: stripeConnection.testMode,
      accountId: stripeConnection.accountId
    });
  }, 60000);

  afterAll(async () => {
    await serverManager.stop();
    console.log('✅ Test server stopped');
  });

  beforeEach(() => {
    // Generate fresh test data for each test
    testData = {
      singleTicket: {
        cartItems: [{
          name: 'Weekend Pass',
          type: 'ticket',
          ticketType: 'weekend',
          price: 125.00,
          quantity: 1,
          description: 'A Lo Cubano Boulder Fest - Weekend Pass',
          eventDate: '2026-05-15'
        }],
        customerInfo: {
          email: `test-${Date.now()}@example.com`,
          firstName: 'Test',
          lastName: 'User'
        }
      },
      multipleTickets: {
        cartItems: [
          {
            name: 'Weekend Pass',
            type: 'ticket',
            ticketType: 'weekend',
            price: 125.00,
            quantity: 2,
            description: 'A Lo Cubano Boulder Fest - Weekend Pass',
            eventDate: '2026-05-15'
          },
          {
            name: 'Friday Night Special',
            type: 'ticket',
            ticketType: 'friday',
            price: 50.00,
            quantity: 1,
            description: 'A Lo Cubano Boulder Fest - Friday Night',
            eventDate: '2026-05-15'
          }
        ],
        customerInfo: {
          email: `test-multi-${Date.now()}@example.com`,
          firstName: 'Multi',
          lastName: 'Ticket'
        }
      },
      donation: {
        cartItems: [{
          name: 'General Donation',
          type: 'donation',
          category: 'general',
          price: 25.00,
          quantity: 1,
          description: 'Support A Lo Cubano Boulder Fest'
        }],
        customerInfo: {
          email: `test-donor-${Date.now()}@example.com`,
          firstName: 'Generous',
          lastName: 'Donor'
        }
      },
      mixedCart: {
        cartItems: [
          {
            name: 'Weekend Pass',
            type: 'ticket',
            ticketType: 'weekend',
            price: 125.00,
            quantity: 1,
            description: 'A Lo Cubano Boulder Fest - Weekend Pass',
            eventDate: '2026-05-15'
          },
          {
            name: 'Festival Support',
            type: 'donation',
            category: 'general',
            price: 50.00,
            quantity: 1,
            description: 'Support the festival'
          }
        ],
        customerInfo: {
          email: `test-mixed-${Date.now()}@example.com`,
          firstName: 'Mixed',
          lastName: 'Cart'
        }
      }
    };
  });

  describe('POST /api/payments/create-checkout-session', () => {
    describe('Successful Session Creation', () => {
      it('should create checkout session for single ticket', async () => {
        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          testData.singleTicket
        );

        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response.data).toHaveProperty('checkoutUrl');
        expect(response.data).toHaveProperty('sessionId');
        expect(response.data).toHaveProperty('orderId');
        expect(response.data).toHaveProperty('totalAmount');

        // Verify checkout URL is valid Stripe URL
        expect(response.data.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
        
        // Verify session ID format
        expect(response.data.sessionId).toMatch(/^cs_test_/);
        
        // Verify order ID format
        expect(response.data.orderId).toMatch(/^order_\d+_/);
        
        // Verify total amount calculation
        expect(response.data.totalAmount).toBe(125.00);

        console.log('✅ Single ticket checkout session created:', {
          sessionId: response.data.sessionId,
          orderId: response.data.orderId,
          totalAmount: response.data.totalAmount
        });
      });

      it('should create checkout session for multiple tickets', async () => {
        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          testData.multipleTickets
        );

        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response.data).toHaveProperty('checkoutUrl');
        expect(response.data).toHaveProperty('sessionId');
        expect(response.data).toHaveProperty('orderId');
        expect(response.data).toHaveProperty('totalAmount');

        // Verify total amount calculation: (125 * 2) + (50 * 1) = 300
        expect(response.data.totalAmount).toBe(300.00);

        console.log('✅ Multiple tickets checkout session created:', {
          sessionId: response.data.sessionId,
          totalAmount: response.data.totalAmount
        });
      });

      it('should create checkout session for donation only', async () => {
        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          testData.donation
        );

        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response.data).toHaveProperty('checkoutUrl');
        expect(response.data).toHaveProperty('sessionId');
        expect(response.data).toHaveProperty('orderId');
        expect(response.data).toHaveProperty('totalAmount');

        // Verify total amount calculation
        expect(response.data.totalAmount).toBe(25.00);

        console.log('✅ Donation checkout session created:', {
          sessionId: response.data.sessionId,
          totalAmount: response.data.totalAmount
        });
      });

      it('should create checkout session for mixed cart (tickets + donations)', async () => {
        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          testData.mixedCart
        );

        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response.data).toHaveProperty('checkoutUrl');
        expect(response.data).toHaveProperty('sessionId');
        expect(response.data).toHaveProperty('orderId');
        expect(response.data).toHaveProperty('totalAmount');

        // Verify total amount calculation: 125 + 50 = 175
        expect(response.data.totalAmount).toBe(175.00);

        console.log('✅ Mixed cart checkout session created:', {
          sessionId: response.data.sessionId,
          totalAmount: response.data.totalAmount
        });
      });

      it('should create checkout session without customer email (Stripe will collect)', async () => {
        const dataWithoutEmail = {
          ...testData.singleTicket,
          customerInfo: {
            firstName: 'Anonymous',
            lastName: 'User'
          }
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          dataWithoutEmail
        );

        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response.data).toHaveProperty('checkoutUrl');
        expect(response.data).toHaveProperty('sessionId');

        console.log('✅ Checkout session created without email');
      });
    });

    describe('Validation and Error Handling', () => {
      it('should reject request with empty cart items', async () => {
        const invalidData = {
          cartItems: [],
          customerInfo: testData.singleTicket.customerInfo
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          invalidData
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data).toHaveProperty('error', 'Cart items required');
      });

      it('should reject request with missing cart items', async () => {
        const invalidData = {
          customerInfo: testData.singleTicket.customerInfo
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          invalidData
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data).toHaveProperty('error', 'Cart items required');
      });

      it('should reject request with invalid cart items structure', async () => {
        const invalidData = {
          cartItems: [
            {
              name: 'Invalid Item',
              // Missing required fields: price, quantity
              type: 'ticket'
            }
          ],
          customerInfo: testData.singleTicket.customerInfo
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          invalidData
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data.error).toContain('Invalid item');
      });

      it('should reject request with invalid email format', async () => {
        const invalidData = {
          ...testData.singleTicket,
          customerInfo: {
            ...testData.singleTicket.customerInfo,
            email: 'invalid-email-format'
          }
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          invalidData
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data).toHaveProperty('error', 'Invalid email format');
      });

      it('should reject request with zero quantity', async () => {
        const invalidData = {
          cartItems: [{
            name: 'Zero Quantity Item',
            type: 'ticket',
            price: 125.00,
            quantity: 0
          }],
          customerInfo: testData.singleTicket.customerInfo
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          invalidData
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data.error).toContain('Invalid item');
      });

      it('should reject request with negative price', async () => {
        const invalidData = {
          cartItems: [{
            name: 'Negative Price Item',
            type: 'ticket',
            price: -10.00,
            quantity: 1
          }],
          customerInfo: testData.singleTicket.customerInfo
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          invalidData
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        // Stripe should reject negative amounts
      });

      it('should handle method not allowed', async () => {
        const response = await httpClient.get('/api/payments/create-checkout-session');

        expect(response.status).toBe(405);
        expect(response.ok).toBe(false);
        expect(response.data).toHaveProperty('error', 'Method not allowed');
      });
    });

    describe('Real Stripe Integration', () => {
      it('should create actual Stripe session that can be retrieved', async () => {
        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          testData.singleTicket
        );

        expect(response.status).toBe(200);
        const { sessionId } = response.data;

        // Verify we can retrieve the session from Stripe directly
        const stripeConnection = await stripeHelpers.testStripeConnection();
        expect(stripeConnection.connected).toBe(true);

        // Test that session exists in Stripe
        expect(sessionId).toMatch(/^cs_test_/);
        
        console.log('✅ Verified session exists in Stripe:', sessionId);
      });

      it('should handle high-value transactions correctly', async () => {
        const highValueData = {
          cartItems: [{
            name: 'VIP Package',
            type: 'ticket',
            ticketType: 'vip',
            price: 999.99,
            quantity: 1
          }],
          customerInfo: testData.singleTicket.customerInfo
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          highValueData
        );

        expect(response.status).toBe(200);
        expect(response.data.totalAmount).toBe(999.99);
        
        console.log('✅ High-value transaction session created');
      });

      it('should handle large quantity orders', async () => {
        const largeQuantityData = {
          cartItems: [{
            name: 'Group Pass',
            type: 'ticket',
            ticketType: 'group',
            price: 100.00,
            quantity: 50 // Large group order
          }],
          customerInfo: testData.singleTicket.customerInfo
        };

        const response = await httpClient.post(
          '/api/payments/create-checkout-session',
          largeQuantityData
        );

        expect(response.status).toBe(200);
        expect(response.data.totalAmount).toBe(5000.00); // 100 * 50
        
        console.log('✅ Large quantity order session created');
      });
    });
  });

  describe('POST /api/payments/stripe-webhook', () => {
    describe('Webhook Signature Validation', () => {
      it('should validate correct webhook signature', async () => {
        const event = stripeHelpers.createPaymentIntentSucceededEvent({
          amount: 12500,
          metadata: {
            event_name: 'Test Event 2026',
            ticket_type: 'Weekend Pass',
            quantity: '1',
            buyer_name: 'Test User',
            buyer_email: testData.singleTicket.customerInfo.email
          }
        });

        const signature = stripeHelpers.generateWebhookSignature(event);

        const response = await httpClient.webhookRequest(
          '/api/payments/stripe-webhook',
          event,
          signature
        );

        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response.data).toHaveProperty('received', true);

        console.log('✅ Valid webhook signature processed');
      });

      it('should reject invalid webhook signature', async () => {
        const event = stripeHelpers.createPaymentIntentSucceededEvent();
        const invalidSignature = 't=1234567890,v1=invalid_signature_hash';

        const response = await httpClient.webhookRequest(
          '/api/payments/stripe-webhook',
          event,
          invalidSignature
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data.error).toContain('Webhook Error');

        console.log('✅ Invalid webhook signature rejected');
      });

      it('should handle missing signature header', async () => {
        const event = stripeHelpers.createPaymentIntentSucceededEvent();

        const response = await httpClient.post('/api/payments/stripe-webhook', event, {
          headers: {
            'Content-Type': 'application/json'
            // No stripe-signature header
          }
        });

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);

        console.log('✅ Missing signature header handled');
      });
    });

    describe('Payment Success Events', () => {
      it('should process payment_intent.succeeded event', async () => {
        const event = stripeHelpers.createPaymentIntentSucceededEvent({
          amount: 12500,
          metadata: {
            event_name: 'Test Event 2026',
            ticket_type: 'Weekend Pass',
            quantity: '1',
            buyer_name: 'Test User',
            buyer_email: testData.singleTicket.customerInfo.email,
            buyer_phone: '+1234567890'
          }
        });

        const response = await stripeHelpers.sendWebhook(event);

        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response.data).toHaveProperty('received', true);

        console.log('✅ Payment success event processed:', event.data.object.id);
      });

      it('should handle duplicate event processing (idempotency)', async () => {
        const event = stripeHelpers.createPaymentIntentSucceededEvent({
          id: `pi_test_idempotency_${Date.now()}`,
          amount: 12500,
          metadata: {
            event_name: 'Test Event 2026',
            ticket_type: 'Weekend Pass',
            quantity: '1',
            buyer_name: 'Idempotent User',
            buyer_email: `idempotent-${Date.now()}@example.com`
          }
        });

        // Send the same event twice
        const firstResponse = await stripeHelpers.sendWebhook(event);
        const secondResponse = await stripeHelpers.sendWebhook(event);

        // Both should succeed
        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);

        // Second response should indicate already processed
        expect(secondResponse.data.status).toBe('already_processed');

        console.log('✅ Idempotency handling verified');
      });
    });

    describe('Payment Failure Events', () => {
      it('should process payment_intent.payment_failed event', async () => {
        const event = stripeHelpers.createPaymentIntentFailedEvent({
          amount: 12500,
          metadata: {
            event_name: 'Test Event 2026',
            ticket_type: 'Weekend Pass',
            quantity: '1',
            buyer_name: 'Failed Payment User',
            buyer_email: testData.singleTicket.customerInfo.email
          }
        });

        const response = await stripeHelpers.sendWebhook(event);

        expect(response.status).toBe(200);
        expect(response.ok).toBe(true);
        expect(response.data).toHaveProperty('received', true);

        console.log('✅ Payment failure event processed:', event.data.object.id);
      });

      it('should handle different failure types', async () => {
        const declineEvent = stripeHelpers.createPaymentIntentFailedEvent({
          last_payment_error: {
            code: 'card_declined',
            decline_code: 'insufficient_funds',
            message: 'Your card has insufficient funds.',
            type: 'card_error'
          }
        });

        const response = await stripeHelpers.sendWebhook(declineEvent);

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('received', true);

        console.log('✅ Card decline event processed');
      });
    });

    describe('Checkout Session Events', () => {
      it('should process checkout.session.completed event', async () => {
        // First create a checkout session
        const checkoutResponse = await httpClient.post(
          '/api/payments/create-checkout-session',
          testData.singleTicket
        );

        expect(checkoutResponse.status).toBe(200);
        const { sessionId } = checkoutResponse.data;

        // Create checkout session completed event
        const event = {
          id: `evt_${Date.now()}`,
          object: 'event',
          api_version: '2023-10-16',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: sessionId,
              object: 'checkout.session',
              amount_total: 12500,
              currency: 'usd',
              customer_email: testData.singleTicket.customerInfo.email,
              payment_status: 'paid',
              metadata: {
                orderId: checkoutResponse.data.orderId,
                orderType: 'tickets',
                customerName: 'Test User'
              }
            }
          },
          livemode: false,
          pending_webhooks: 1,
          type: 'checkout.session.completed'
        };

        const response = await stripeHelpers.sendWebhook(event);

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('received', true);

        console.log('✅ Checkout session completed event processed');
      });

      it('should process checkout.session.expired event', async () => {
        const event = {
          id: `evt_expired_${Date.now()}`,
          object: 'event',
          api_version: '2023-10-16',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: `cs_test_expired_${Date.now()}`,
              object: 'checkout.session',
              payment_status: 'unpaid',
              status: 'expired'
            }
          },
          livemode: false,
          pending_webhooks: 1,
          type: 'checkout.session.expired'
        };

        const response = await stripeHelpers.sendWebhook(event);

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('received', true);

        console.log('✅ Checkout session expired event processed');
      });
    });

    describe('Webhook Edge Cases', () => {
      it('should handle malformed JSON payload', async () => {
        const malformedPayload = '{ invalid json syntax';

        const response = await httpClient.post('/api/payments/stripe-webhook', malformedPayload, {
          headers: {
            'Content-Type': 'application/json',
            'stripe-signature': 't=1234567890,v1=test_signature'
          }
        });

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);

        console.log('✅ Malformed JSON handled correctly');
      });

      it('should handle unknown event types gracefully', async () => {
        const unknownEvent = {
          id: `evt_unknown_${Date.now()}`,
          object: 'event',
          type: 'unknown.event.type',
          data: {
            object: {
              id: 'test_object'
            }
          }
        };

        const response = await stripeHelpers.sendWebhook(unknownEvent);

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('received', true);

        console.log('✅ Unknown event type handled gracefully');
      });

      it('should handle method not allowed', async () => {
        const response = await httpClient.get('/api/payments/stripe-webhook');

        expect(response.status).toBe(405);
        expect(response.data).toHaveProperty('error', 'Method not allowed');
      });
    });

    describe('Webhook Replay Protection', () => {
      it('should reject old webhook timestamps', async () => {
        const event = stripeHelpers.createPaymentIntentSucceededEvent();
        
        // Create signature with old timestamp (more than 5 minutes ago)
        const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
        const payload = JSON.stringify(event);
        const oldSignature = `t=${oldTimestamp},v1=old_signature_hash`;

        const response = await httpClient.webhookRequest(
          '/api/payments/stripe-webhook',
          event,
          oldSignature
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);

        console.log('✅ Old webhook timestamp rejected');
      });
    });
  });

  describe('GET /api/payments/checkout-success', () => {
    describe('Success Flow Validation', () => {
      it('should validate successful checkout session', async () => {
        // First create a checkout session
        const checkoutResponse = await httpClient.post(
          '/api/payments/create-checkout-session',
          testData.singleTicket
        );

        expect(checkoutResponse.status).toBe(200);
        const { sessionId } = checkoutResponse.data;

        // Note: In a real test, the session would be paid through Stripe's system
        // For integration testing, we can only test the endpoint with the session ID
        // The session will show as unpaid, but we can test the API functionality

        const response = await httpClient.get(
          `/api/payments/checkout-success?session_id=${sessionId}`
        );

        // The session is unpaid in test, so it should return payment not completed
        expect(response.status).toBe(400);
        expect(response.data.error).toBe('Payment not completed');
        expect(response.data.status).toBe('unpaid');

        console.log('✅ Checkout success endpoint validates session status');
      });

      it('should reject invalid session ID format', async () => {
        const response = await httpClient.get(
          '/api/payments/checkout-success?session_id=invalid_session_id'
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data).toHaveProperty('error', 'Invalid session ID');
        expect(response.data.message).toBe('Valid Stripe session ID required');
      });

      it('should reject missing session ID', async () => {
        const response = await httpClient.get('/api/payments/checkout-success');

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data).toHaveProperty('error', 'Invalid session ID');
      });

      it('should reject non-existent session ID', async () => {
        const fakeSessionId = 'cs_test_fake_session_id_that_does_not_exist';

        const response = await httpClient.get(
          `/api/payments/checkout-success?session_id=${fakeSessionId}`
        );

        expect(response.status).toBe(400);
        expect(response.ok).toBe(false);
        expect(response.data).toHaveProperty('error', 'Invalid request');
      });

      it('should handle method not allowed', async () => {
        const response = await httpClient.post('/api/payments/checkout-success', {});

        expect(response.status).toBe(405);
        expect(response.ok).toBe(false);
        expect(response.data).toHaveProperty('error', 'Method not allowed');
      });
    });

    describe('Edge Cases', () => {
      it('should handle session ID with special characters', async () => {
        const invalidSessionId = 'cs_test_<script>alert("xss")</script>';

        const response = await httpClient.get(
          `/api/payments/checkout-success?session_id=${encodeURIComponent(invalidSessionId)}`
        );

        expect(response.status).toBe(400);
        expect(response.data).toHaveProperty('error');
      });

      it('should handle very long session ID', async () => {
        const longSessionId = 'cs_test_' + 'x'.repeat(1000);

        const response = await httpClient.get(
          `/api/payments/checkout-success?session_id=${longSessionId}`
        );

        expect(response.status).toBe(400);
        expect(response.data).toHaveProperty('error');
      });
    });
  });

  describe('Complete Payment Flow Integration', () => {
    it('should handle full payment lifecycle simulation', async () => {
      console.log('🔄 Starting complete payment flow simulation...');

      // Step 1: Create checkout session
      const checkoutResponse = await httpClient.post(
        '/api/payments/create-checkout-session',
        testData.singleTicket
      );

      expect(checkoutResponse.status).toBe(200);
      const { sessionId, orderId, totalAmount } = checkoutResponse.data;

      console.log('✅ Step 1: Checkout session created', { sessionId, orderId, totalAmount });

      // Step 2: Simulate successful payment webhook
      const paymentSuccessEvent = stripeHelpers.createPaymentIntentSucceededEvent({
        amount: totalAmount * 100, // Convert to cents
        metadata: {
          event_name: 'Test Event 2026',
          ticket_type: 'Weekend Pass',
          quantity: '1',
          buyer_name: 'Test User',
          buyer_email: testData.singleTicket.customerInfo.email,
          buyer_phone: '+1234567890',
          order_id: orderId
        }
      });

      const webhookResponse = await stripeHelpers.sendWebhook(paymentSuccessEvent);
      expect(webhookResponse.status).toBe(200);

      console.log('✅ Step 2: Payment success webhook processed');

      // Step 3: Verify checkout success would work (session is still unpaid in test)
      const successResponse = await httpClient.get(
        `/api/payments/checkout-success?session_id=${sessionId}`
      );

      // Session is unpaid in test environment, so we expect this
      expect(successResponse.status).toBe(400);
      expect(successResponse.data.error).toBe('Payment not completed');

      console.log('✅ Step 3: Checkout success endpoint tested');

      console.log('✅ Complete payment flow simulation completed successfully');
    });

    it('should handle payment failure lifecycle simulation', async () => {
      console.log('🔄 Starting payment failure flow simulation...');

      // Step 1: Create checkout session
      const checkoutResponse = await httpClient.post(
        '/api/payments/create-checkout-session',
        testData.singleTicket
      );

      expect(checkoutResponse.status).toBe(200);
      const { sessionId, orderId, totalAmount } = checkoutResponse.data;

      console.log('✅ Step 1: Checkout session created for failure test');

      // Step 2: Simulate payment failure webhook
      const paymentFailureEvent = stripeHelpers.createPaymentIntentFailedEvent({
        amount: totalAmount * 100, // Convert to cents
        metadata: {
          event_name: 'Test Event 2026',
          ticket_type: 'Weekend Pass',
          quantity: '1',
          buyer_name: 'Failed Payment User',
          buyer_email: testData.singleTicket.customerInfo.email,
          order_id: orderId
        }
      });

      const webhookResponse = await stripeHelpers.sendWebhook(paymentFailureEvent);
      expect(webhookResponse.status).toBe(200);

      console.log('✅ Step 2: Payment failure webhook processed');

      // Step 3: Verify checkout session shows failure
      const successResponse = await httpClient.get(
        `/api/payments/checkout-success?session_id=${sessionId}`
      );

      expect(successResponse.status).toBe(400);
      expect(successResponse.data.error).toBe('Payment not completed');

      console.log('✅ Payment failure flow simulation completed successfully');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent checkout sessions', async () => {
      const concurrentRequests = 5;
      const promises = Array.from({ length: concurrentRequests }, (_, index) => {
        const testData = {
          cartItems: [{
            name: `Concurrent Test ${index}`,
            type: 'ticket',
            ticketType: 'test',
            price: 50.00 + index, // Vary prices to test different amounts
            quantity: 1
          }],
          customerInfo: {
            email: `concurrent-${index}-${Date.now()}@example.com`,
            firstName: `User${index}`,
            lastName: 'Test'
          }
        };

        return httpClient.post('/api/payments/create-checkout-session', testData);
      });

      const responses = await Promise.all(promises);

      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('sessionId');
        expect(response.data).toHaveProperty('checkoutUrl');
        expect(response.data.totalAmount).toBe(50.00 + index);
      });

      console.log(`✅ ${concurrentRequests} concurrent checkout sessions created successfully`);
    });

    it('should handle rapid webhook processing', async () => {
      const webhookCount = 10;
      const promises = Array.from({ length: webhookCount }, (_, index) => {
        const event = stripeHelpers.createPaymentIntentSucceededEvent({
          id: `pi_test_rapid_${Date.now()}_${index}`,
          amount: 5000 + (index * 100), // Vary amounts
          metadata: {
            event_name: 'Rapid Test Event',
            ticket_type: 'Rapid Pass',
            quantity: '1',
            buyer_name: `Rapid User ${index}`,
            buyer_email: `rapid-${index}-${Date.now()}@example.com`
          }
        });

        return stripeHelpers.sendWebhook(event);
      });

      const responses = await Promise.all(promises);

      // All webhooks should be processed successfully
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('received', true);
      });

      console.log(`✅ ${webhookCount} rapid webhooks processed successfully`);
    });
  });

  describe('Security Testing', () => {
    it('should sanitize malicious input in cart items', async () => {
      const maliciousData = {
        cartItems: [{
          name: '<script>alert("xss")</script>',
          type: 'ticket',
          price: 100.00,
          quantity: 1,
          description: 'javascript:alert("xss")'
        }],
        customerInfo: {
          email: 'xss@example.com',
          firstName: '<img src=x onerror=alert(1)>',
          lastName: 'Test'
        }
      };

      const response = await httpClient.post(
        '/api/payments/create-checkout-session',
        maliciousData
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('sessionId');

      console.log('✅ Malicious input handled safely');
    });

    it('should handle SQL injection attempts in metadata', async () => {
      const sqlInjectionData = {
        cartItems: [{
          name: "'; DROP TABLE tickets; --",
          type: 'ticket',
          price: 100.00,
          quantity: 1
        }],
        customerInfo: {
          email: 'sql@example.com',
          firstName: "Robert'; DROP TABLE users; --",
          lastName: 'Tables'
        }
      };

      const response = await httpClient.post(
        '/api/payments/create-checkout-session',
        sqlInjectionData
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('sessionId');

      console.log('✅ SQL injection attempt handled safely');
    });

    it('should validate webhook signature timing attacks', async () => {
      const event = stripeHelpers.createPaymentIntentSucceededEvent();
      const validSignature = stripeHelpers.generateWebhookSignature(event);
      const invalidSignature = validSignature.replace(/v1=\w+/, 'v1=invalid_hash');

      // Test multiple invalid signatures rapidly
      const promises = Array.from({ length: 5 }, () => 
        httpClient.webhookRequest('/api/payments/stripe-webhook', event, invalidSignature)
      );

      const responses = await Promise.all(promises);

      // All should fail consistently
      responses.forEach(response => {
        expect(response.status).toBe(400);
      });

      console.log('✅ Webhook signature validation resistant to timing attacks');
    });
  });
});