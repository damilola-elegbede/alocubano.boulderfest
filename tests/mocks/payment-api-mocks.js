/**
 * Payment API Mocks
 *
 * Provides mock implementations for payment APIs (Stripe, PayPal)
 * used in React checkout component and hook testing.
 *
 * @module tests/mocks/payment-api-mocks
 */

import { vi } from 'vitest';

// =============================================================================
// Mock Cart Data
// =============================================================================

/**
 * Generate mock cart items for testing
 * @param {Object} options - Configuration options
 * @returns {Array} Mock cart items
 */
export function createMockCartItems(options = {}) {
  const {
    hasTickets = true,
    hasDonations = false,
    ticketCount = 2,
    donationAmount = 50,
  } = options;

  const items = [];

  if (hasTickets) {
    items.push({
      type: 'ticket',
      ticketType: 'weekend-pass',
      name: 'A Lo Cubano Boulder Fest 2026 - Weekend Pass',
      description: 'Full weekend access to all events',
      price: 15000, // cents
      quantity: ticketCount,
      eventDate: '2026-05-15',
      eventId: 1,
    });
  }

  if (hasDonations) {
    items.push({
      type: 'donation',
      name: 'General Donation',
      description: 'Support A Lo Cubano Boulder Fest',
      price: donationAmount * 100, // cents
      quantity: 1,
    });
  }

  return items;
}

/**
 * Generate mock cart state for useCart hook
 * @param {Object} options - Configuration options
 * @returns {Object} Mock cart state
 */
export function createMockCartState(options = {}) {
  const items = createMockCartItems(options);
  const tickets = items.filter(item => item.type === 'ticket');
  const donations = items.filter(item => item.type === 'donation');

  const ticketTotal = tickets.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const donationTotal = donations.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    tickets: tickets.reduce((acc, ticket) => {
      acc[ticket.ticketType] = ticket;
      return acc;
    }, {}),
    donations: donations.map(d => ({ amount: d.price / 100 })),
    totals: {
      tickets: ticketTotal,
      donations: donationTotal,
      total: ticketTotal + donationTotal,
      itemCount,
    },
    isEmpty: itemCount === 0,
  };
}

/**
 * Generate mock customer info
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock customer info
 */
export function createMockCustomerInfo(overrides = {}) {
  return {
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    phone: '555-123-4567',
    ...overrides,
  };
}

// =============================================================================
// Stripe API Mocks
// =============================================================================

/**
 * Mock Stripe checkout session response
 * @param {Object} options - Response options
 * @returns {Object} Mock response
 */
export function createMockStripeSessionResponse(options = {}) {
  const {
    success = true,
    sessionId = `cs_test_${Date.now()}`,
    orderId = `order_${Date.now()}`,
    totalAmount = 30000,
    error = null,
  } = options;

  if (!success) {
    return {
      ok: false,
      status: 400,
      json: async () => ({
        error: error || 'Failed to create checkout session',
        message: error || 'An error occurred',
      }),
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({
      checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
      sessionId,
      orderId,
      totalAmount,
    }),
  };
}

/**
 * Create mock fetch for Stripe checkout API
 * @param {Object} options - Mock options
 * @returns {Function} Mock fetch function
 */
export function createMockStripeFetch(options = {}) {
  return vi.fn().mockImplementation((url) => {
    if (url.includes('/api/payments/create-checkout-session')) {
      return Promise.resolve(createMockStripeSessionResponse(options));
    }
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

// =============================================================================
// PayPal API Mocks
// =============================================================================

/**
 * Mock PayPal order creation response
 * @param {Object} options - Response options
 * @returns {Object} Mock response
 */
export function createMockPayPalOrderResponse(options = {}) {
  const {
    success = true,
    orderId = `PAYPAL_ORDER_${Date.now()}`,
    transactionId = `paypal_${Date.now()}_abc123`,
    orderNumber = `ALO-2026-${Math.floor(Math.random() * 10000)}`,
    totalAmount = 300.00,
    totalAmountCents = 30000,
    testMode = false,
    error = null,
  } = options;

  if (!success) {
    return {
      ok: false,
      status: 400,
      json: async () => ({
        error: error || 'Failed to create PayPal order',
        message: error || 'An error occurred',
        code: 'PAYPAL_ORDER_CREATION_FAILED',
      }),
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({
      orderId,
      approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
      transactionId,
      orderNumber,
      totalAmount,
      totalAmountCents,
      testMode,
    }),
  };
}

/**
 * Mock PayPal order capture response
 * @param {Object} options - Response options
 * @returns {Object} Mock response
 */
export function createMockPayPalCaptureResponse(options = {}) {
  const {
    success = true,
    orderId = `PAYPAL_ORDER_${Date.now()}`,
    captureId = `CAPTURE_${Date.now()}`,
    orderNumber = `ALO-2026-${Math.floor(Math.random() * 10000)}`,
    amount = 300.00,
    hasTickets = true,
    registrationToken = `token_${Date.now()}`,
    error = null,
    errorCode = 'CAPTURE_FAILED',
  } = options;

  if (!success) {
    return {
      ok: false,
      status: 400,
      json: async () => ({
        error: error || 'Failed to capture PayPal order',
        message: error || 'An error occurred',
        code: errorCode,
      }),
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      paymentMethod: 'paypal',
      orderNumber,
      orderId,
      captureId,
      status: 'COMPLETED',
      amount,
      currency: 'USD',
      hasTickets,
      hasDonations: false,
      registrationToken: hasTickets ? registrationToken : null,
      registrationUrl: hasTickets ? `/pages/core/register-tickets.html?token=${registrationToken}` : null,
      transaction: {
        orderNumber,
        status: 'completed',
        totalAmount: amount * 100,
        customerEmail: 'test@example.com',
        customerName: 'Test User',
      },
      payer: {
        payerId: 'PAYER123',
        email: 'test@example.com',
        name: {
          given_name: 'Test',
          surname: 'User',
        },
      },
      instructions: {
        clearCart: true,
        nextSteps: [
          'Check your email for order confirmation',
          'Complete your festival registration',
        ],
      },
      message: 'Payment successful!',
    }),
  };
}

/**
 * Create mock fetch for PayPal APIs
 * @param {Object} options - Mock options
 * @returns {Function} Mock fetch function
 */
export function createMockPayPalFetch(options = {}) {
  const { createOrderOptions = {}, captureOrderOptions = {} } = options;

  return vi.fn().mockImplementation((url) => {
    if (url.includes('/api/payments/paypal/create-order')) {
      return Promise.resolve(createMockPayPalOrderResponse(createOrderOptions));
    }
    if (url.includes('/api/payments/paypal/capture-order')) {
      return Promise.resolve(createMockPayPalCaptureResponse(captureOrderOptions));
    }
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

// =============================================================================
// Combined Payment Mocks
// =============================================================================

/**
 * Create mock fetch for all payment APIs
 * @param {Object} options - Mock options
 * @returns {Function} Mock fetch function
 */
export function createMockPaymentFetch(options = {}) {
  const {
    stripe = {},
    paypal = {},
    defaultResponse = null,
  } = options;

  return vi.fn().mockImplementation((url, fetchOptions) => {
    // Stripe endpoints
    if (url.includes('/api/payments/create-checkout-session')) {
      return Promise.resolve(createMockStripeSessionResponse(stripe));
    }

    // PayPal endpoints
    if (url.includes('/api/payments/paypal/create-order')) {
      return Promise.resolve(createMockPayPalOrderResponse(paypal.createOrder || paypal));
    }
    if (url.includes('/api/payments/paypal/capture-order')) {
      return Promise.resolve(createMockPayPalCaptureResponse(paypal.captureOrder || paypal));
    }

    // Default response or error
    if (defaultResponse) {
      return Promise.resolve(defaultResponse);
    }

    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

// =============================================================================
// Error Scenarios
// =============================================================================

/**
 * Common payment error scenarios for testing
 */
export const PaymentErrorScenarios = {
  // Stripe errors
  stripeInvalidRequest: {
    success: false,
    error: 'Invalid request parameters',
  },
  stripeRateLimit: {
    success: false,
    error: 'Rate limit exceeded. Please try again.',
  },
  stripeServiceUnavailable: {
    success: false,
    error: 'Payment service temporarily unavailable',
  },

  // PayPal errors
  paypalOrderCreationFailed: {
    success: false,
    error: 'PayPal order creation failed',
    errorCode: 'PAYPAL_ORDER_CREATION_FAILED',
  },
  paypalUnavailable: {
    success: false,
    error: 'PayPal service is temporarily unavailable',
    errorCode: 'PAYPAL_UNAVAILABLE',
  },
  paypalOrderNotApproved: {
    success: false,
    error: 'Order cannot be captured',
    errorCode: 'ORDER_NOT_APPROVED',
  },
  paypalCaptureFailed: {
    success: false,
    error: 'Failed to capture PayPal order',
    errorCode: 'CAPTURE_FAILED',
  },

  // Network errors
  networkError: () => Promise.reject(new Error('Network error')),
  timeout: () => new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), 100)
  ),
};

// =============================================================================
// React Testing Utilities
// =============================================================================

/**
 * Create mock payment context value for testing
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock context value
 */
export function createMockPaymentContextValue(overrides = {}) {
  return {
    paymentMethod: null,
    setPaymentMethod: vi.fn(),
    status: 'idle',
    error: null,
    isProcessing: false,
    isReady: true,
    redirectUrl: null,
    clearError: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

/**
 * Create mock usePayment hook return value
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock hook return value
 */
export function createMockUsePaymentValue(overrides = {}) {
  return {
    paymentMethod: null,
    setPaymentMethod: vi.fn(),
    isProcessing: false,
    error: null,
    isReady: true,
    processCheckout: vi.fn().mockResolvedValue({ success: true }),
    clearError: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

/**
 * Create mock useCart hook return value
 * @param {Object} options - Configuration options
 * @returns {Object} Mock hook return value
 */
export function createMockUseCartValue(options = {}) {
  const cartState = createMockCartState(options);

  return {
    cart: cartState,
    isLoading: false,
    isInitialized: true,
    addTicket: vi.fn(),
    removeTicket: vi.fn(),
    addDonation: vi.fn(),
    removeDonation: vi.fn(),
    clearCart: vi.fn(),
    ...options.overrides,
  };
}

// =============================================================================
// Window Location Mock
// =============================================================================

/**
 * Create mock window.location for redirect testing
 * @returns {Object} Mock location object and restore function
 */
export function createMockLocation() {
  const originalLocation = window.location;
  const mockLocation = { href: '' };

  // Delete and replace location
  delete window.location;
  window.location = mockLocation;

  return {
    location: mockLocation,
    restore: () => {
      window.location = originalLocation;
    },
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  createMockCartItems,
  createMockCartState,
  createMockCustomerInfo,
  createMockStripeSessionResponse,
  createMockStripeFetch,
  createMockPayPalOrderResponse,
  createMockPayPalCaptureResponse,
  createMockPayPalFetch,
  createMockPaymentFetch,
  PaymentErrorScenarios,
  createMockPaymentContextValue,
  createMockUsePaymentValue,
  createMockUseCartValue,
  createMockLocation,
};
