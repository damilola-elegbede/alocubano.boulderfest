/**
 * Stripe API Mock for Testing
 * Provides comprehensive mocking of Stripe operations
 */

// Mock Stripe session data
export const mockStripeSession = {
  id: 'cs_test_1234567890',
  object: 'checkout.session',
  amount_total: 30000,
  currency: 'usd',
  customer_email: 'test@example.com',
  mode: 'payment',
  payment_status: 'paid',
  status: 'complete',
  url: 'https://checkout.stripe.com/pay/cs_test_1234567890',
  payment_intent: 'pi_test_1234567890',
  metadata: {
    order_id: '123',
    event_id: 'boulder-fest-2026'
  },
  line_items: {
    data: [
      {
        id: 'li_test_1234567890',
        amount_total: 30000,
        currency: 'usd',
        description: 'Full Festival Pass - A Lo Cubano Boulder Fest 2026',
        quantity: 1,
        price: {
          id: 'price_test_1234567890',
          unit_amount: 30000
        }
      }
    ]
  }
};

// Mock Stripe payment intent
export const mockPaymentIntent = {
  id: 'pi_test_1234567890',
  object: 'payment_intent',
  amount: 30000,
  currency: 'usd',
  status: 'succeeded',
  metadata: {
    order_id: '123',
    customer_email: 'test@example.com'
  },
  charges: {
    data: [
      {
        id: 'ch_test_1234567890',
        amount: 30000,
        currency: 'usd',
        status: 'succeeded',
        receipt_url: 'https://pay.stripe.com/receipts/test_receipt'
      }
    ]
  }
};

// Mock webhook events
export const mockWebhookEvents = {
  checkoutSessionCompleted: {
    id: 'evt_test_1234567890',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: mockStripeSession
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_test_1234567890',
      idempotency_key: 'idem_test_1234567890'
    }
  },
  
  paymentIntentSucceeded: {
    id: 'evt_test_0987654321',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: mockPaymentIntent
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_test_0987654321',
      idempotency_key: 'idem_test_0987654321'
    }
  },
  
  paymentIntentFailed: {
    id: 'evt_test_fail_1234',
    object: 'event',
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        ...mockPaymentIntent,
        status: 'requires_payment_method',
        last_payment_error: {
          type: 'card_error',
          code: 'card_declined',
          message: 'Your card was declined.'
        }
      }
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1
  }
};

/**
 * Create mock Stripe client
 */
export function createMockStripe() {
  return {
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue(mockStripeSession),
        retrieve: jest.fn().mockResolvedValue(mockStripeSession),
        listLineItems: jest.fn().mockResolvedValue({
          data: mockStripeSession.line_items.data
        })
      }
    },
    
    paymentIntents: {
      retrieve: jest.fn().mockResolvedValue(mockPaymentIntent),
      update: jest.fn().mockResolvedValue(mockPaymentIntent),
      cancel: jest.fn().mockResolvedValue({
        ...mockPaymentIntent,
        status: 'canceled'
      })
    },
    
    webhooks: {
      constructEvent: jest.fn().mockImplementation((payload, signature, secret) => {
        // Default to successful checkout session event
        return mockWebhookEvents.checkoutSessionCompleted;
      })
    },
    
    refunds: {
      create: jest.fn().mockResolvedValue({
        id: 're_test_1234567890',
        amount: 30000,
        charge: 'ch_test_1234567890',
        currency: 'usd',
        status: 'succeeded'
      })
    },
    
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_test_1234567890',
        email: 'test@example.com',
        name: 'Test Customer'
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'cus_test_1234567890',
        email: 'test@example.com',
        name: 'Test Customer'
      })
    }
  };
}

/**
 * Mock Stripe webhook signature verification
 */
export function mockWebhookSignature(event = mockWebhookEvents.checkoutSessionCompleted) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(event);
  const signature = `t=${timestamp},v1=mock_signature_hash`;
  
  return {
    payload,
    signature,
    headers: {
      'stripe-signature': signature
    }
  };
}

/**
 * Create error scenarios for testing
 */
export const mockStripeErrors = {
  cardDeclined: {
    type: 'StripeCardError',
    code: 'card_declined',
    message: 'Your card was declined.',
    payment_intent: {
      id: 'pi_test_declined_1234',
      status: 'requires_payment_method'
    }
  },
  
  insufficientFunds: {
    type: 'StripeCardError',
    code: 'insufficient_funds',
    message: 'Your card has insufficient funds.',
    payment_intent: {
      id: 'pi_test_insufficient_1234',
      status: 'requires_payment_method'
    }
  },
  
  expiredCard: {
    type: 'StripeCardError',
    code: 'expired_card',
    message: 'Your card has expired.',
    payment_intent: {
      id: 'pi_test_expired_1234',
      status: 'requires_payment_method'
    }
  },
  
  processingError: {
    type: 'StripeAPIError',
    message: 'An error occurred while processing your payment.',
    statusCode: 500
  }
};

/**
 * Mock rate limiting responses
 */
export const mockRateLimitError = {
  type: 'StripeRateLimitError',
  message: 'Too many requests created too quickly.',
  statusCode: 429,
  headers: {
    'retry-after': '1'
  }
};

/**
 * Helper to create custom mock sessions
 */
export function createMockSession(overrides = {}) {
  return {
    ...mockStripeSession,
    ...overrides,
    id: overrides.id || `cs_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };
}

/**
 * Helper to create custom mock payment intents
 */
export function createMockPaymentIntent(overrides = {}) {
  return {
    ...mockPaymentIntent,
    ...overrides,
    id: overrides.id || `pi_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };
}

export default createMockStripe;