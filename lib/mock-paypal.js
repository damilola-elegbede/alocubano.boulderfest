/**
 * Mock PayPal Service for Test Mode
 * Simulates PayPal API behavior for testing environments
 *
 * This service mirrors the structure of PayPal's actual API responses
 * and provides consistent test scenarios for order creation and capture.
 */

import { generateTestAwareTransactionId, createTestModeMetadata, logTestModeOperation } from './test-mode-utils.js';

/**
 * Generate test PayPal order ID with timestamp and random component
 * Format: TEST-EC-{timestamp}-{random}
 *
 * @returns {string} Test order ID
 */
function generateTestOrderId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `TEST-EC-${timestamp}-${random}`;
}

/**
 * Generate test PayPal payment ID
 *
 * @returns {string} Test payment ID
 */
function generateTestPaymentId() {
  const timestamp = Date.now();
  return `TEST-PAY-${timestamp}${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Mock PayPal Orders API
 */
class MockPayPalOrders {
  /**
   * Create a mock PayPal order
   *
   * @param {Object} orderData - Order creation request data
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} Mock order response
   */
  async create(orderData, req = null) {
    logTestModeOperation('MockPayPal: Creating order', { orderData }, req);

    // Simulate test scenarios based on order data
    const customerEmail = orderData.customer_info?.email ||
                         orderData.purchase_units?.[0]?.custom_id;

    // Test failure scenarios
    if (customerEmail === 'test-paypal-fail@example.com') {
      throw new Error('PAYPAL_ORDER_CREATION_FAILED');
    }

    if (customerEmail === 'test-paypal-timeout@example.com') {
      // Simulate timeout (shorter for tests)
      await new Promise(resolve => setTimeout(resolve, 100));
      throw new Error('PAYPAL_TIMEOUT');
    }

    const orderId = generateTestOrderId();
    const totalAmount = orderData.purchase_units?.[0]?.amount?.value || '0.00';

    // Create mock order response following PayPal API structure
    const mockOrder = {
      id: orderId,
      status: 'CREATED',
      intent: orderData.intent || 'CAPTURE',
      purchase_units: orderData.purchase_units || [],
      create_time: new Date().toISOString(),
      links: [
        {
          href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`,
          rel: 'self',
          method: 'GET'
        },
        {
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
          rel: 'approve',
          method: 'GET'
        },
        {
          href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`,
          rel: 'update',
          method: 'PATCH'
        },
        {
          href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`,
          rel: 'capture',
          method: 'POST'
        }
      ]
    };

    // Add test metadata
    const metadata = createTestModeMetadata(req, {
      mock_service: 'paypal',
      operation: 'create_order',
      order_id: orderId,
      total_amount: totalAmount
    });

    console.log('🔄 Mock PayPal: Order created', {
      orderId,
      status: mockOrder.status,
      totalAmount,
      metadata: metadata.test_context
    });

    return mockOrder;
  }

  /**
   * Capture a mock PayPal order
   *
   * @param {string} orderId - PayPal order ID
   * @param {Object} captureData - Capture request data (optional)
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} Mock capture response
   */
  async capture(orderId, captureData = {}, req = null) {
    logTestModeOperation('MockPayPal: Capturing order', { orderId, captureData }, req);

    // Validate test order ID format
    if (!orderId.startsWith('TEST-EC-') || !orderId.match(/^TEST-EC-\d+(-[a-z0-9]+)?$/)) {
      throw new Error('Invalid test order ID format');
    }

    // Test failure scenarios
    if (orderId.includes('fail')) {
      throw new Error('PAYPAL_CAPTURE_FAILED');
    }

    if (orderId.includes('timeout')) {
      await new Promise(resolve => setTimeout(resolve, 100));
      throw new Error('PAYPAL_TIMEOUT');
    }

    const paymentId = generateTestPaymentId();
    const captureId = `TEST-CAPTURE-${Date.now()}`;

    // Create mock capture response following PayPal API structure
    const mockCaptureResponse = {
      id: orderId,
      status: 'COMPLETED',
      payment_source: {
        paypal: {
          email_address: 'test-buyer@example.com',
          account_id: 'TEST123456789',
          name: {
            given_name: 'Test',
            surname: 'Buyer'
          }
        }
      },
      purchase_units: [
        {
          reference_id: 'default',
          payments: {
            captures: [
              {
                id: captureId,
                status: 'COMPLETED',
                amount: {
                  currency_code: 'USD',
                  value: '100.00' // Default test amount
                },
                final_capture: true,
                create_time: new Date().toISOString(),
                update_time: new Date().toISOString()
              }
            ]
          }
        }
      ],
      links: [
        {
          href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`,
          rel: 'self',
          method: 'GET'
        }
      ]
    };

    // Add test metadata
    const metadata = createTestModeMetadata(req, {
      mock_service: 'paypal',
      operation: 'capture_order',
      order_id: orderId,
      capture_id: captureId,
      payment_id: paymentId
    });

    console.log('💰 Mock PayPal: Order captured', {
      orderId,
      captureId,
      status: mockCaptureResponse.status,
      metadata: metadata.test_context
    });

    return mockCaptureResponse;
  }

  /**
   * Get mock PayPal order details
   *
   * @param {string} orderId - PayPal order ID
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} Mock order details
   */
  async get(orderId, req = null) {
    logTestModeOperation('MockPayPal: Getting order details', { orderId }, req);

    if (!orderId.startsWith('TEST-EC-') || !orderId.match(/^TEST-EC-\d+(-[a-z0-9]+)?$/)) {
      throw new Error('Invalid test order ID format');
    }

    const mockOrderDetails = {
      id: orderId,
      status: 'CREATED',
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: 'default',
          amount: {
            currency_code: 'USD',
            value: '100.00'
          },
          payee: {
            email_address: 'alocubanoboulderfest@gmail.com'
          }
        }
      ],
      create_time: new Date().toISOString(),
      links: [
        {
          href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`,
          rel: 'self',
          method: 'GET'
        }
      ]
    };

    console.log('📋 Mock PayPal: Order details retrieved', { orderId, status: mockOrderDetails.status });

    return mockOrderDetails;
  }
}

/**
 * Mock PayPal Client class that mimics the structure of the real PayPal SDK
 */
class MockPayPalClient {
  constructor() {
    this.orders = new MockPayPalOrders();
    console.log('🔧 Mock PayPal Client initialized for testing');
  }

  /**
   * Execute API request (mock implementation)
   *
   * @param {Object} request - API request object
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} Mock response
   */
  async execute(request, req = null) {
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock different request types based on the request object
    if (request.path && request.path.includes('/orders') && request.verb === 'POST') {
      return {
        result: await this.orders.create(request.body, req),
        statusCode: 201
      };
    }

    if (request.path && request.path.includes('/capture') && request.verb === 'POST') {
      const orderId = request.path.split('/')[3]; // Extract order ID from path
      return {
        result: await this.orders.capture(orderId, request.body, req),
        statusCode: 200
      };
    }

    if (request.path && request.path.includes('/orders') && request.verb === 'GET') {
      const orderId = request.path.split('/')[3]; // Extract order ID from path
      return {
        result: await this.orders.get(orderId, req),
        statusCode: 200
      };
    }

    // Default mock response
    return {
      result: { message: 'Mock PayPal response' },
      statusCode: 200
    };
  }
}

/**
 * Create mock PayPal client instance
 *
 * @returns {MockPayPalClient} Mock PayPal client
 */
export function createMockPayPalClient() {
  return new MockPayPalClient();
}

/**
 * Mock PayPal environment configuration
 */
export const MockPayPalEnvironment = {
  Sandbox: function() {
    return {
      baseUrl: 'https://api-m.sandbox.paypal.com',
      webUrl: 'https://www.sandbox.paypal.com'
    };
  },
  Live: function() {
    return {
      baseUrl: 'https://api-m.paypal.com',
      webUrl: 'https://www.paypal.com'
    };
  }
};

/**
 * Check if we're in test mode and should use mock PayPal
 *
 * @param {Object} req - Express request object (optional)
 * @returns {boolean} True if should use mock PayPal
 */
export function shouldUseMockPayPal(req = null) {
  return process.env.NODE_ENV === 'test' ||
         process.env.INTEGRATION_TEST_MODE === 'true' ||
         process.env.E2E_TEST_MODE === 'true' ||
         req?.headers?.['x-test-mode'] === 'true';
}

export default {
  createMockPayPalClient,
  MockPayPalEnvironment,
  shouldUseMockPayPal,
  MockPayPalOrders
};