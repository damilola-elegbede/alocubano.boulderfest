/**
 * PayPal Integration Tests
 * Tests for PayPal SDK integration and mock service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockPayPalClient, shouldUseMockPayPal } from '../../lib/mock-paypal.js';
import { getPayPalService, createPayPalOrder } from '../../lib/paypal-service.js';

describe('PayPal Integration', () => {
  let mockPayPalClient;
  let paypalService;

  beforeEach(() => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    mockPayPalClient = createMockPayPalClient();
    paypalService = getPayPalService();
  });

  afterEach(() => {
    // Reset service state
    paypalService.reset();
    vi.clearAllMocks();
  });

  describe('Mock PayPal Service', () => {
    it('should detect test mode correctly', () => {
      expect(shouldUseMockPayPal()).toBe(true);
    });

    it('should create mock PayPal client', () => {
      expect(mockPayPalClient).toBeDefined();
      expect(mockPayPalClient.orders).toBeDefined();
      expect(typeof mockPayPalClient.orders.create).toBe('function');
    });

    it('should create test order with proper format', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: '100.00'
            }
          }
        ]
      };

      const order = await mockPayPalClient.orders.create(orderData);

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

    it('should capture test order successfully', async () => {
      const orderId = 'TEST-EC-1234567890-abc123';
      const captureResult = await mockPayPalClient.orders.capture(orderId);

      expect(captureResult).toBeDefined();
      expect(captureResult.id).toBe(orderId);
      expect(captureResult.status).toBe('COMPLETED');
      expect(captureResult.purchase_units).toBeInstanceOf(Array);
      expect(captureResult.purchase_units[0].payments.captures).toBeInstanceOf(Array);
    });

    it('should handle test failure scenarios', async () => {
      const orderData = {
        customer_info: { email: 'test-paypal-fail@example.com' },
        purchase_units: [{ amount: { value: '100.00' } }]
      };

      await expect(mockPayPalClient.orders.create(orderData)).rejects.toThrow('PAYPAL_ORDER_CREATION_FAILED');
    });

    it('should generate unique test order IDs', async () => {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '50.00' } }]
      };

      const order1 = await mockPayPalClient.orders.create(orderData);
      const order2 = await mockPayPalClient.orders.create(orderData);

      expect(order1.id).not.toBe(order2.id);
      expect(order1.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
      expect(order2.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
    });
  });

  describe('PayPal Service Integration', () => {
    it('should initialize with mock client in test mode', async () => {
      const health = await paypalService.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.environment).toBe('mock');
      expect(health.test_mode).toBe(true);
    });

    it('should create order using service wrapper', async () => {
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
                name: 'Test Ticket',
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
    });

    it('should handle service initialization errors gracefully', async () => {
      // Temporarily remove credentials to test error handling
      const originalClientId = process.env.PAYPAL_CLIENT_ID;
      const originalClientSecret = process.env.PAYPAL_CLIENT_SECRET;
      const originalNodeEnv = process.env.NODE_ENV;

      delete process.env.PAYPAL_CLIENT_ID;
      delete process.env.PAYPAL_CLIENT_SECRET;
      process.env.NODE_ENV = 'production'; // Force non-test mode

      // Reset service to trigger re-initialization
      paypalService.reset();

      const health = await paypalService.getHealth();
      expect(health.status).toBe('unhealthy');
      expect(health.error).toContain('PayPal credentials not configured');

      // Restore environment
      process.env.PAYPAL_CLIENT_ID = originalClientId;
      process.env.PAYPAL_CLIENT_SECRET = originalClientSecret;
      process.env.NODE_ENV = originalNodeEnv;
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
  });

  describe('Order Data Validation', () => {
    it('should validate required order fields', async () => {
      const invalidOrderData = {
        // Missing intent and purchase_units
      };

      // Mock client should still create order but with defaults
      const order = await mockPayPalClient.orders.create(invalidOrderData);
      expect(order.id).toMatch(/^TEST-EC-\d+-[a-z0-9]+$/);
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

      const order = await mockPayPalClient.orders.create(orderData);
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

      const order = await mockPayPalClient.orders.create(orderData);
      expect(order).toBeDefined();
      expect(order.purchase_units).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout scenarios', async () => {
      const orderData = {
        customer_info: { email: 'test-paypal-timeout@example.com' }
      };

      await expect(mockPayPalClient.orders.create(orderData)).rejects.toThrow('PAYPAL_TIMEOUT');
    });

    it('should handle invalid order ID formats', async () => {
      const invalidOrderId = 'INVALID-ORDER-ID';

      await expect(mockPayPalClient.orders.capture(invalidOrderId)).rejects.toThrow('Invalid test order ID format');
    });

    it('should handle capture failures', async () => {
      const failOrderId = 'TEST-EC-1234567890-fail';

      await expect(mockPayPalClient.orders.capture(failOrderId)).rejects.toThrow('PAYPAL_CAPTURE_FAILED');
    });
  });
});