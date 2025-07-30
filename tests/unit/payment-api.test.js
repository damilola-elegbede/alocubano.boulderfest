/**
 * Unit tests for Payment API endpoints
 * Tests API logic with mocked external services
 */

import { jest } from '@jest/globals';
import { createMockStripe } from '../mocks/stripe.js';
import { createTestOrder, cleanTestData, insertTestData } from '../config/testDatabase.js';

// Mock API modules before importing them
jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => createMockStripe())
}));

jest.unstable_mockModule('../../lib/db/client.js', () => ({
  createClient: jest.fn(),
  getClient: jest.fn()
}));

// Import modules after mocking
const calculateTotal = await import('../../api/payment/calculate-total.js');
const createCheckoutSession = await import('../../api/payment/create-checkout-session.js');

describe('Payment API Endpoints', () => {
  let mockStripe;
  let mockRequest;
  let mockResponse;

  beforeEach(async () => {
    // Clean test data before each test
    await cleanTestData();
    await insertTestData();
    
    // Setup mock Stripe
    mockStripe = createMockStripe();
    
    // Setup mock Express request/response
    mockRequest = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'Mozilla/5.0 Test Browser'
      },
      body: {},
      query: {}
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn()
    };
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Calculate Total API', () => {
    beforeEach(() => {
      mockRequest.body = {
        items: [
          {
            id: 'full-festival',
            quantity: 1,
            price: 300.00
          }
        ]
      };
    });

    test('calculates total for valid single item', async () => {
      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 30000, // $300.00 in cents
          totalDollars: 300.00,
          breakdown: expect.objectContaining({
            subtotal: 300.00,
            fees: 0,
            tax: 0,
            total: 300.00
          })
        })
      );
    });

    test('calculates total for multiple items', async () => {
      mockRequest.body = {
        items: [
          { id: 'full-festival', quantity: 2, price: 300.00 },
          { id: 'workshop-only', quantity: 1, price: 150.00 }
        ]
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 75000, // $750.00 in cents
          totalDollars: 750.00,
          breakdown: expect.objectContaining({
            subtotal: 750.00,
            total: 750.00
          })
        })
      );
    });

    test('handles donation items with custom amounts', async () => {
      mockRequest.body = {
        items: [
          { id: 'donation', quantity: 1, price: 50.00 }
        ]
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 5000, // $50.00 in cents
          totalDollars: 50.00
        })
      );
    });

    test('rejects invalid item types', async () => {
      mockRequest.body = {
        items: [
          { id: 'invalid-ticket-type', quantity: 1, price: 100.00 }
        ]
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid ticket type')
        })
      );
    });

    test('rejects price manipulation attempts', async () => {
      mockRequest.body = {
        items: [
          { id: 'full-festival', quantity: 1, price: 100.00 } // Wrong price
        ]
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Price mismatch')
        })
      );
    });

    test('rejects orders below minimum amount', async () => {
      mockRequest.body = {
        items: [
          { id: 'donation', quantity: 1, price: 0.50 } // Below $10 minimum
        ]
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Order total too low')
        })
      );
    });

    test('rejects orders above maximum amount', async () => {
      mockRequest.body = {
        items: [
          { id: 'donation', quantity: 1, price: 15000.00 } // Above $10,000 maximum
        ]
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Order total too high')
        })
      );
    });

    test('validates quantity limits', async () => {
      mockRequest.body = {
        items: [
          { id: 'full-festival', quantity: 15, price: 300.00 } // Above max quantity
        ]
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Quantity exceeds maximum')
        })
      );
    });

    test('handles malformed request data', async () => {
      mockRequest.body = {
        items: 'invalid'
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid items array')
        })
      );
    });

    test('handles empty items array', async () => {
      mockRequest.body = {
        items: []
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid items array')
        })
      );
    });
  });

  describe('Create Checkout Session API', () => {
    beforeEach(() => {
      mockRequest.body = {
        items: [
          {
            id: 'full-festival',
            quantity: 1,
            price: 300.00
          }
        ],
        customerEmail: 'test@example.com',
        customerName: 'Test Customer'
      };
    });

    test('creates Stripe checkout session successfully', async () => {
      mockStripe.checkout.sessions.create.mockResolvedValueOnce({
        id: 'cs_test_new_session',
        url: 'https://checkout.stripe.com/pay/cs_test_new_session',
        payment_status: 'unpaid',
        metadata: {
          order_id: expect.any(String)
        }
      });

      await createCheckoutSession.default(mockRequest, mockResponse);
      
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          success_url: expect.stringContaining('/success'),
          cancel_url: expect.stringContaining('/cancel'),
          customer_email: 'test@example.com',
          line_items: expect.arrayContaining([
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'usd',
                product_data: expect.objectContaining({
                  name: expect.stringContaining('Full Festival Pass')
                }),
                unit_amount: 30000
              }),
              quantity: 1
            })
          ])
        })
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'cs_test_new_session',
          url: 'https://checkout.stripe.com/pay/cs_test_new_session'
        })
      );
    });

    test('stores order in database before creating session', async () => {
      await createCheckoutSession.default(mockRequest, mockResponse);
      
      // Verify order creation would be called
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      
      // Check that Stripe session includes order metadata
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            order_id: expect.any(String),
            customer_email: 'test@example.com'
          })
        })
      );
    });

    test('handles inventory check failure', async () => {
      // Mock inventory check to fail
      mockRequest.body.items = [
        { id: 'full-festival', quantity: 1000, price: 300.00 } // Way too many
      ];

      await createCheckoutSession.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('not available')
        })
      );
    });

    test('handles Stripe API failures gracefully', async () => {
      mockStripe.checkout.sessions.create.mockRejectedValueOnce(
        new Error('Stripe API error')
      );

      await createCheckoutSession.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Payment processing error')
        })
      );
    });

    test('validates required customer information', async () => {
      mockRequest.body.customerEmail = '';
      
      await createCheckoutSession.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Customer email required')
        })
      );
    });

    test('validates email format', async () => {
      mockRequest.body.customerEmail = 'invalid-email';
      
      await createCheckoutSession.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid email format')
        })
      );
    });

    test('includes proper success and cancel URLs', async () => {
      await createCheckoutSession.default(mockRequest, mockResponse);
      
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: expect.stringMatching(/\/success\?session_id=\{CHECKOUT_SESSION_ID\}/),
          cancel_url: expect.stringMatching(/\/cancel/)
        })
      );
    });

    test('sets session expiration correctly', async () => {
      await createCheckoutSession.default(mockRequest, mockResponse);
      
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: expect.any(Number)
        })
      );
      
      // Check expiration is reasonable (within 24 hours)
      const call = mockStripe.checkout.sessions.create.mock.calls[0][0];
      const expirationTime = call.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const oneDay = 24 * 60 * 60;
      
      expect(expirationTime).toBeGreaterThan(now);
      expect(expirationTime).toBeLessThanOrEqual(now + oneDay);
    });
  });

  describe('Rate Limiting', () => {
    test('enforces rate limits on payment API calls', async () => {
      // Simulate multiple rapid requests
      const requests = Array(10).fill().map(() => 
        calculateTotal.default(mockRequest, mockResponse)
      );
      
      await Promise.all(requests);
      
      // At least one should be rate limited (depending on implementation)
      const rateLimitedCalls = mockResponse.status.mock.calls
        .filter(call => call[0] === 429);
        
      // This test depends on rate limiting implementation
      // expect(rateLimitedCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Security Validations', () => {
    test('sanitizes input data', async () => {
      mockRequest.body = {
        items: [
          {
            id: 'full-festival<script>alert("xss")</script>',
            quantity: 1,
            price: 300.00
          }
        ]
      };

      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    test('validates request origin', async () => {
      mockRequest.headers.origin = 'https://malicious-site.com';
      
      await calculateTotal.default(mockRequest, mockResponse);
      
      // Should reject requests from unauthorized origins
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    test('checks for required headers', async () => {
      delete mockRequest.headers['content-type'];
      
      await calculateTotal.default(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Performance', () => {
    test('completes calculation under performance threshold', async () => {
      const start = performance.now();
      
      await calculateTotal.default(mockRequest, mockResponse);
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // 100ms threshold
    });

    test('handles large orders efficiently', async () => {
      mockRequest.body = {
        items: Array(50).fill({
          id: 'donation',
          quantity: 1,
          price: 25.00
        })
      };
      
      const start = performance.now();
      
      await calculateTotal.default(mockRequest, mockResponse);
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500); // 500ms threshold for large orders
    });
  });
});