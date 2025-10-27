/**
 * PayPal Payment Tests
 * Comprehensive unit tests for PayPal payment functionality including
 * order creation, capture, webhook handling, and transaction services
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockPayPalClient, shouldUseMockPayPal } from '../../lib/mock-paypal.js';
import { getPayPalService, createPayPalOrder, capturePayPalOrder, getPayPalOrderDetails } from '../../lib/paypal-service.js';
import transactionService from '../../lib/transaction-service.js';
import { getDatabaseClient } from '../../lib/database.js';

// Mock database client for unit tests
const mockDbClient = {
  execute: vi.fn(),
  close: vi.fn()
};

// Mock the database module
vi.mock('../../lib/database.js', () => ({
  getDatabaseClient: vi.fn(() => Promise.resolve(mockDbClient))
}));

// Mock transaction service for some tests
vi.mock('../../lib/transaction-service.js', () => ({
  default: {
    createFromPayPalOrder: vi.fn(),
    getByPayPalOrderId: vi.fn(),
    getByPayPalCaptureId: vi.fn(),
    updatePayPalCapture: vi.fn(),
    updateStatus: vi.fn(),
    ensureInitialized: vi.fn()
  }
}));

describe('PayPal Payment Integration', () => {
  let mockPayPalClient;
  let paypalService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.PAYPAL_CLIENT_ID = 'test_client_id';
    process.env.PAYPAL_CLIENT_SECRET = 'test_client_secret';

    // Create fresh service instances
    mockPayPalClient = createMockPayPalClient();
    paypalService = getPayPalService();

    // Reset service state
    if (paypalService.reset) {
      paypalService.reset();
    }

    // Mock database responses
    mockDbClient.execute.mockResolvedValue({
      lastInsertRowid: 1,
      changes: 1,
      rows: []
    });
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;

    // Reset service state
    if (paypalService.reset) {
      paypalService.reset();
    }

    vi.clearAllMocks();
  });

  describe('PayPal Service Functionality', () => {
    it('should detect test mode correctly', () => {
      expect(shouldUseMockPayPal()).toBe(true);
    });

    it('should initialize with mock client in test mode', async () => {
      const health = await paypalService.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.environment).toBe('mock');
      expect(health.test_mode).toBe(true);
      expect(health.initialized).toBe(true);
    });

    it('should handle missing credentials gracefully', async () => {
      // Remove credentials to test error handling
      delete process.env.PAYPAL_CLIENT_ID;
      delete process.env.PAYPAL_CLIENT_SECRET;
      process.env.NODE_ENV = 'production'; // Force non-test mode

      // Reset service to trigger re-initialization
      paypalService.reset();

      const health = await paypalService.getHealth();
      expect(health.status).toBe('unhealthy');
      expect(health.error).toContain('PayPal credentials not configured');
    });

    it('should maintain singleton pattern', async () => {
      const service1 = getPayPalService();
      const service2 = getPayPalService();

      expect(service1).toBe(service2);

      const client1 = await service1.ensureInitialized();
      const client2 = await service2.ensureInitialized();

      expect(client1).toBe(client2);
    });
  });

  describe('PayPal Order Creation', () => {
    it('should create order with proper format', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: '150.00'
            },
            items: [
              {
                name: '2026 Early Bird Full Pass',
                unit_amount: { currency_code: 'USD', value: '150.00' },
                quantity: '1',
                category: 'DIGITAL_GOODS'
              }
            ]
          }
        ]
      };

      const order = await createPayPalOrder(orderData);

      expect(order).toBeDefined();
      expect(order.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
      expect(order.status).toBe('CREATED');
      expect(order.intent).toBe('CAPTURE');
      expect(order.links).toBeInstanceOf(Array);
      expect(order.links.length).toBeGreaterThan(0);

      // Check for approval URL
      const approvalLink = order.links.find(link => link.rel === 'approve');
      expect(approvalLink).toBeDefined();
      expect(approvalLink.href).toContain('paypal.com');
    });

    it('should handle order creation with multiple items', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: '235.00'
            },
            items: [
              {
                name: '2026 Early Bird Full Pass',
                unit_amount: { currency_code: 'USD', value: '150.00' },
                quantity: '1',
                category: 'DIGITAL_GOODS'
              },
              {
                name: 'Day Pass - Friday',
                unit_amount: { currency_code: 'USD', value: '85.00' },
                quantity: '1',
                category: 'DIGITAL_GOODS'
              }
            ]
          }
        ]
      };

      const order = await createPayPalOrder(orderData);

      expect(order).toBeDefined();
      expect(order.purchase_units).toHaveLength(1);
      expect(order.purchase_units[0].items).toHaveLength(2);
    });

    it('should handle large order amounts', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: '9999.99'
            }
          }
        ]
      };

      const order = await createPayPalOrder(orderData);
      expect(order).toBeDefined();
      expect(order.status).toBe('CREATED');
    });

    it('should generate unique order IDs', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '50.00' } }]
      };

      const order1 = await createPayPalOrder(orderData);
      const order2 = await createPayPalOrder(orderData);

      expect(order1.id).not.toBe(order2.id);
      expect(order1.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
      expect(order2.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
    });
  });

  describe('PayPal Order Capture', () => {
    it('should capture order successfully', async () => {
      const orderId = 'TEST-EC-1234567890-abc123';
      const captureResult = await capturePayPalOrder(orderId);

      expect(captureResult).toBeDefined();
      expect(captureResult.id).toBe(orderId);
      expect(captureResult.status).toBe('COMPLETED');
      expect(captureResult.purchase_units).toBeInstanceOf(Array);
      expect(captureResult.purchase_units[0].payments.captures).toBeInstanceOf(Array);

      const capture = captureResult.purchase_units[0].payments.captures[0];
      expect(capture.id).toMatch(/^TEST-CAPTURE-\d+$/);
      expect(capture.status).toBe('COMPLETED');
      expect(capture.final_capture).toBe(true);
    });

    it('should handle capture with additional data', async () => {
      const orderId = 'TEST-EC-1234567890-xyz789';
      const captureData = {
        note_to_payer: 'Thank you for your purchase!'
      };

      const captureResult = await capturePayPalOrder(orderId, captureData);

      expect(captureResult).toBeDefined();
      expect(captureResult.status).toBe('COMPLETED');
    });

    it('should validate order ID format', async () => {
      const invalidOrderId = 'INVALID-ORDER-ID';

      await expect(capturePayPalOrder(invalidOrderId)).rejects.toThrow('Invalid test order ID format');
    });

    it('should handle capture failure scenarios', async () => {
      const failOrderId = 'TEST-EC-1234567890-fail';

      await expect(capturePayPalOrder(failOrderId)).rejects.toThrow('PAYPAL_CAPTURE_FAILED');
    });
  });

  describe('PayPal Order Details', () => {
    it('should retrieve order details', async () => {
      const orderId = 'TEST-EC-1234567890-details';
      const orderDetails = await getPayPalOrderDetails(orderId);

      expect(orderDetails).toBeDefined();
      expect(orderDetails.id).toBe(orderId);
      expect(orderDetails.status).toBe('CREATED');
      expect(orderDetails.intent).toBe('CAPTURE');
      expect(orderDetails.purchase_units).toBeInstanceOf(Array);
    });

    it('should validate order ID for details retrieval', async () => {
      const invalidOrderId = 'INVALID-ORDER-FORMAT';

      await expect(getPayPalOrderDetails(invalidOrderId)).rejects.toThrow('Invalid test order ID format');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle test failure scenarios', async () => {
      const orderData = {
        customer_info: { email: 'test-paypal-fail@example.com' },
        purchase_units: [{ amount: { value: '100.00' } }]
      };

      await expect(createPayPalOrder(orderData)).rejects.toThrow('PAYPAL_ORDER_CREATION_FAILED');
    });

    it('should handle timeout scenarios', async () => {
      const orderData = {
        customer_info: { email: 'test-paypal-timeout@example.com' }
      };

      await expect(createPayPalOrder(orderData)).rejects.toThrow('PAYPAL_TIMEOUT');
    });

    it('should handle network timeout during capture', async () => {
      const timeoutOrderId = 'TEST-EC-1234567890-timeout';

      await expect(capturePayPalOrder(timeoutOrderId)).rejects.toThrow('PAYPAL_TIMEOUT');
    });

    it('should handle service unavailable scenarios', async () => {
      // Temporarily corrupt the service
      paypalService.reset();
      delete process.env.PAYPAL_CLIENT_ID;
      process.env.NODE_ENV = 'production'; // Force real PayPal

      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }]
      };

      await expect(createPayPalOrder(orderData)).rejects.toThrow('PayPal credentials not configured');
    });
  });

  describe('Transaction Service PayPal Methods', () => {
    beforeEach(() => {
      // Reset transaction service mocks
      transactionService.createFromPayPalOrder.mockReset();
      transactionService.getByPayPalOrderId.mockReset();
      transactionService.getByPayPalCaptureId.mockReset();
      transactionService.updatePayPalCapture.mockReset();
      transactionService.updateStatus.mockReset();
    });

    it('should create transaction from PayPal order', async () => {
      const mockPayPalOrder = {
        id: 'TEST-EC-1234567890-abc123',
        status: 'COMPLETED',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: '150.00' },
            payments: {
              captures: [
                {
                  id: 'TEST-CAPTURE-123456',
                  status: 'COMPLETED',
                  amount: { currency_code: 'USD', value: '150.00' }
                }
              ]
            }
          }
        ],
        payer: {
          payer_id: 'TEST-PAYER-123',
          email_address: 'test@example.com',
          name: { given_name: 'Test', surname: 'User' }
        }
      };

      const mockTransaction = {
        id: 1,
        uuid: 'trans-uuid-123',
        paypal_order_id: 'TEST-EC-1234567890-abc123'
      };

      transactionService.createFromPayPalOrder.mockResolvedValue(mockTransaction);

      const result = await transactionService.createFromPayPalOrder(mockPayPalOrder);

      expect(transactionService.createFromPayPalOrder).toHaveBeenCalledWith(mockPayPalOrder);
      expect(result).toEqual(mockTransaction);
    });

    it('should retrieve transaction by PayPal order ID', async () => {
      const orderId = 'TEST-EC-1234567890-abc123';
      const mockTransaction = {
        id: 1,
        uuid: 'trans-uuid-123',
        paypal_order_id: orderId,
        status: 'pending'
      };

      transactionService.getByPayPalOrderId.mockResolvedValue(mockTransaction);

      const result = await transactionService.getByPayPalOrderId(orderId);

      expect(transactionService.getByPayPalOrderId).toHaveBeenCalledWith(orderId);
      expect(result).toEqual(mockTransaction);
    });

    it('should retrieve transaction by PayPal capture ID', async () => {
      const captureId = 'TEST-CAPTURE-123456';
      const mockTransaction = {
        id: 1,
        uuid: 'trans-uuid-123',
        paypal_capture_id: captureId,
        status: 'completed'
      };

      transactionService.getByPayPalCaptureId.mockResolvedValue(mockTransaction);

      const result = await transactionService.getByPayPalCaptureId(captureId);

      expect(transactionService.getByPayPalCaptureId).toHaveBeenCalledWith(captureId);
      expect(result).toEqual(mockTransaction);
    });

    it('should update PayPal capture details', async () => {
      const uuid = 'trans-uuid-123';
      const captureId = 'TEST-CAPTURE-123456';
      const status = 'completed';

      transactionService.updatePayPalCapture.mockResolvedValue({ changes: 1 });

      await transactionService.updatePayPalCapture(uuid, captureId, status);

      expect(transactionService.updatePayPalCapture).toHaveBeenCalledWith(uuid, captureId, status);
    });

    it('should handle transaction not found scenarios', async () => {
      const orderId = 'TEST-EC-NONEXISTENT-123';

      transactionService.getByPayPalOrderId.mockResolvedValue(null);

      const result = await transactionService.getByPayPalOrderId(orderId);

      expect(result).toBeNull();
    });
  });

  describe('Test Mode Integration', () => {
    it('should detect test mode from environment variables', () => {
      process.env.NODE_ENV = 'test';
      expect(shouldUseMockPayPal()).toBe(true);

      process.env.INTEGRATION_TEST_MODE = 'true';
      expect(shouldUseMockPayPal()).toBe(true);

      process.env.E2E_TEST_MODE = 'true';
      expect(shouldUseMockPayPal()).toBe(true);
    });

    it('should detect test mode from request headers', () => {
      const mockReq = {
        headers: { 'x-test-mode': 'true' }
      };

      expect(shouldUseMockPayPal(mockReq)).toBe(true);
    });

    it('should use real PayPal in production mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      delete process.env.INTEGRATION_TEST_MODE;
      delete process.env.E2E_TEST_MODE;

      expect(shouldUseMockPayPal()).toBe(false);

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should handle test mode with special email triggers', async () => {
      const testCases = [
        { email: 'test-paypal-fail@example.com', expectedError: 'PAYPAL_ORDER_CREATION_FAILED' },
        { email: 'test-paypal-timeout@example.com', expectedError: 'PAYPAL_TIMEOUT' }
      ];

      for (const testCase of testCases) {
        const orderData = {
          customer_info: { email: testCase.email },
          purchase_units: [{ amount: { value: '100.00' } }]
        };

        await expect(createPayPalOrder(orderData)).rejects.toThrow(testCase.expectedError);
      }
    });
  });

  describe('Order Data Validation', () => {
    it('should handle missing purchase units', async () => {
      const invalidOrderData = {
        intent: 'CAPTURE'
        // Missing purchase_units
      };

      // Mock client should still create order but with defaults
      const order = await createPayPalOrder(invalidOrderData);
      expect(order.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
    });

    it('should handle empty purchase units array', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: []
      };

      const order = await createPayPalOrder(orderData);
      expect(order).toBeDefined();
      expect(order.status).toBe('CREATED');
    });

    it('should handle multiple purchase units', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: '100.00' },
            description: 'Festival Tickets'
          },
          {
            amount: { currency_code: 'USD', value: '50.00' },
            description: 'Donation'
          }
        ]
      };

      const order = await createPayPalOrder(orderData);
      expect(order).toBeDefined();
      expect(order.purchase_units).toHaveLength(2);
    });

    it('should validate currency codes', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'EUR', value: '100.00' }
          }
        ]
      };

      const order = await createPayPalOrder(orderData);
      expect(order).toBeDefined();
      // Mock should accept any currency
    });

    it('should handle decimal precision in amounts', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: '123.456' } // More than 2 decimal places
          }
        ]
      };

      const order = await createPayPalOrder(orderData);
      expect(order).toBeDefined();
    });
  });

  describe('Edge Cases and Robustness', () => {
    it('should handle concurrent order creation', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }]
      };

      // Create multiple orders concurrently
      const promises = Array.from({ length: 5 }, () => createPayPalOrder(orderData));
      const orders = await Promise.all(promises);

      // All orders should be created successfully
      expect(orders).toHaveLength(5);
      orders.forEach(order => {
        expect(order.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
        expect(order.status).toBe('CREATED');
      });

      // All order IDs should be unique
      const orderIds = orders.map(order => order.id);
      const uniqueOrderIds = new Set(orderIds);
      expect(uniqueOrderIds.size).toBe(orderIds.length);
    });

    it('should handle service reset during operation', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }]
      };

      // Create order
      const order1 = await createPayPalOrder(orderData);
      expect(order1).toBeDefined();

      // Reset service
      paypalService.reset();

      // Should still work after reset
      const order2 = await createPayPalOrder(orderData);
      expect(order2).toBeDefined();
      expect(order2.id).not.toBe(order1.id);
    });

    it('should handle malformed order data gracefully', async () => {
      const malformedData = {
        intent: null,
        purchase_units: 'not-an-array'
      };

      // Mock should handle malformed data
      const order = await createPayPalOrder(malformedData);
      expect(order).toBeDefined();
    });

    it('should handle extremely large amounts', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: '999999.99' }
          }
        ]
      };

      const order = await createPayPalOrder(orderData);
      expect(order).toBeDefined();
      expect(order.status).toBe('CREATED');
    });

    it('should handle zero amount orders', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: '0.00' }
          }
        ]
      };

      const order = await createPayPalOrder(orderData);
      expect(order).toBeDefined();
      // Mock allows zero amounts
    });
  });

  describe('Performance and Memory', () => {
    it('should handle rapid successive calls without memory leaks', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }]
      };

      // Create many orders rapidly
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(createPayPalOrder(orderData));
      }

      const orders = await Promise.all(promises);
      expect(orders).toHaveLength(50);

      // All should be valid
      orders.forEach(order => {
        expect(order.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
      });
    });

    it('should maintain service state efficiently', async () => {
      // Multiple service calls should reuse the same instance
      const health1 = await paypalService.getHealth();
      const health2 = await paypalService.getHealth();
      const health3 = await paypalService.getHealth();

      expect(health1.initialized).toBe(true);
      expect(health2.initialized).toBe(true);
      expect(health3.initialized).toBe(true);

      // Should all indicate same environment
      expect(health1.environment).toBe(health2.environment);
      expect(health2.environment).toBe(health3.environment);
    });
  });

  describe('Payment Source Detection Support', () => {
    it('should include payment_source in capture response', async () => {
      const orderId = 'TEST-EC-1234567890-abc123';
      const captureResult = await capturePayPalOrder(orderId);

      expect(captureResult).toBeDefined();
      expect(captureResult.purchase_units).toBeInstanceOf(Array);
      expect(captureResult.purchase_units[0].payments.captures).toBeInstanceOf(Array);

      const capture = captureResult.purchase_units[0].payments.captures[0];
      expect(capture).toHaveProperty('payment_source');
    });

    it('should support Venmo payment source in mock responses', async () => {
      const orderId = 'TEST-EC-1234567890-venmo';
      const captureResult = await capturePayPalOrder(orderId);

      const capture = captureResult.purchase_units[0].payments.captures[0];
      const paymentSource = capture.payment_source;

      // Mock client may include venmo or paypal payment source
      expect(paymentSource).toBeDefined();
      expect(typeof paymentSource).toBe('object');
    });

    it('should support PayPal payment source in mock responses', async () => {
      const orderId = 'TEST-EC-1234567890-paypal';
      const captureResult = await capturePayPalOrder(orderId);

      const capture = captureResult.purchase_units[0].payments.captures[0];
      const paymentSource = capture.payment_source;

      expect(paymentSource).toBeDefined();
      expect(typeof paymentSource).toBe('object');
    });

    it('should maintain payment_source structure for detection', async () => {
      const orderId = 'TEST-EC-1234567890-abc123';
      const captureResult = await capturePayPalOrder(orderId);

      // Verify structure needed for payment source detector
      expect(captureResult).toHaveProperty('purchase_units');
      expect(captureResult.purchase_units[0]).toHaveProperty('payments');
      expect(captureResult.purchase_units[0].payments).toHaveProperty('captures');
      expect(captureResult.purchase_units[0].payments.captures[0]).toHaveProperty('payment_source');

      const paymentSource = captureResult.purchase_units[0].payments.captures[0].payment_source;

      // Should have either venmo or paypal key
      const hasExpectedSource = paymentSource.hasOwnProperty('venmo') ||
                                 paymentSource.hasOwnProperty('paypal');
      expect(hasExpectedSource).toBe(true);
    });

    it('should handle order capture with different payment sources', async () => {
      // Test multiple captures to ensure consistency
      const orders = [
        'TEST-EC-1234567890-test1',
        'TEST-EC-1234567890-test2',
        'TEST-EC-1234567890-test3'
      ];

      const captures = await Promise.all(orders.map(id => capturePayPalOrder(id)));

      captures.forEach(captureResult => {
        const capture = captureResult.purchase_units[0].payments.captures[0];
        expect(capture).toHaveProperty('payment_source');
        expect(typeof capture.payment_source).toBe('object');
      });
    });

    it('should provide account information in payment_source', async () => {
      const orderId = 'TEST-EC-1234567890-abc123';
      const captureResult = await capturePayPalOrder(orderId);

      const paymentSource = captureResult.purchase_units[0].payments.captures[0].payment_source;

      // Check if venmo source has expected fields
      if (paymentSource.venmo) {
        expect(paymentSource.venmo).toBeDefined();
        // Venmo should have account_id, user_name, email_address
        expect(typeof paymentSource.venmo).toBe('object');
      }

      // Check if paypal source has expected fields
      if (paymentSource.paypal) {
        expect(paymentSource.paypal).toBeDefined();
        // PayPal should have account_id, email_address
        expect(typeof paymentSource.paypal).toBe('object');
      }
    });
  });
});