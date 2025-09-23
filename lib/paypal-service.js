/**
 * PayPal Service Integration
 * Unified interface for PayPal operations with test mode support
 *
 * This service provides a clean abstraction over PayPal SDK operations
 * and automatically switches to mock service in test environments.
 */

import { Client } from '@paypal/paypal-server-sdk';
import { createMockPayPalClient, shouldUseMockPayPal } from './mock-paypal.js';
import { isTestMode, logTestModeOperation, createTestModeMetadata } from './test-mode-utils.js';

/**
 * PayPal Service class with environment detection
 */
class PayPalService {
  constructor() {
    this.client = null;
    this.environment = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Initialize PayPal client with environment detection
   * Uses Promise-based singleton pattern to prevent race conditions
   *
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} PayPal client instance
   */
  async ensureInitialized(req = null) {
    if (this.initialized && this.client) {
      return this.client;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization(req);

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null; // Enable retry
      throw error;
    }
  }

  /**
   * Perform actual initialization
   *
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} PayPal client instance
   */
  async _performInitialization(req = null) {
    // Check if we should use mock PayPal
    if (shouldUseMockPayPal(req)) {
      console.log('🔧 PayPal Service: Using Mock PayPal for testing');
      this.client = createMockPayPalClient();
      this.environment = 'mock';
      this.initialized = true;
      return this.client;
    }

    // Validate PayPal credentials
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      throw new Error('PayPal credentials not configured');
    }

    try {
      // Determine environment
      const paypalEnv = process.env.PAYPAL_MODE || 'sandbox';
      this.environment = paypalEnv;

      // Initialize PayPal client with new SDK
      this.client = new Client({
        clientCredentialsAuthCredentials: {
          oAuthClientId: process.env.PAYPAL_CLIENT_ID,
          oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET
        },
        environment: paypalEnv === 'production' ? 'production' : 'sandbox',
        logging: {
          logLevel: process.env.NODE_ENV === 'development' ? 'info' : 'error',
          logRequestsAndResponses: process.env.NODE_ENV === 'development'
        }
      });

      console.log(`💳 PayPal Service: Initialized in ${paypalEnv} environment`);
      this.initialized = true;
      return this.client;

    } catch (error) {
      console.error('PayPal Service initialization failed:', error);
      throw new Error(`PayPal service initialization failed: ${error.message}`);
    }
  }

  /**
   * Create PayPal order
   *
   * @param {Object} orderData - Order creation data
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} PayPal order response
   */
  async createOrder(orderData, req = null) {
    const client = await this.ensureInitialized(req);

    logTestModeOperation('PayPal: Creating order', {
      environment: this.environment,
      orderData: orderData
    }, req);

    try {
      // Handle mock client
      if (this.environment === 'mock') {
        return await client.orders.create(orderData, req);
      }

      // Use real PayPal SDK
      const ordersController = client.ordersController;

      const createOrderRequest = {
        body: {
          intent: orderData.intent || 'CAPTURE',
          purchaseUnits: orderData.purchase_units || [],
          applicationContext: orderData.application_context || {}
        }
      };

      const response = await ordersController.ordersCreate(createOrderRequest);

      console.log('PayPal order created:', {
        orderId: response.result.id,
        status: response.result.status,
        environment: this.environment
      });

      return response.result;

    } catch (error) {
      console.error('PayPal order creation failed:', error);
      throw new Error(`PayPal order creation failed: ${error.message}`);
    }
  }

  /**
   * Capture PayPal order
   *
   * @param {string} orderId - PayPal order ID
   * @param {Object} captureData - Capture request data (optional)
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} PayPal capture response
   */
  async captureOrder(orderId, captureData = {}, req = null) {
    const client = await this.ensureInitialized(req);

    logTestModeOperation('PayPal: Capturing order', {
      orderId,
      environment: this.environment
    }, req);

    try {
      // Handle mock client
      if (this.environment === 'mock') {
        return await client.orders.capture(orderId, captureData, req);
      }

      // Use real PayPal SDK
      const ordersController = client.ordersController;

      const captureOrderRequest = {
        id: orderId,
        body: captureData
      };

      const response = await ordersController.ordersCaptureOrder(captureOrderRequest);

      console.log('PayPal order captured:', {
        orderId: response.result.id,
        status: response.result.status,
        environment: this.environment
      });

      return response.result;

    } catch (error) {
      console.error('PayPal order capture failed:', error);
      throw new Error(`PayPal order capture failed: ${error.message}`);
    }
  }

  /**
   * Get PayPal order details
   *
   * @param {string} orderId - PayPal order ID
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} PayPal order details
   */
  async getOrder(orderId, req = null) {
    const client = await this.ensureInitialized(req);

    logTestModeOperation('PayPal: Getting order details', {
      orderId,
      environment: this.environment
    }, req);

    try {
      // Handle mock client
      if (this.environment === 'mock') {
        return await client.orders.get(orderId, req);
      }

      // Use real PayPal SDK
      const ordersController = client.ordersController;

      const getOrderRequest = {
        id: orderId
      };

      const response = await ordersController.ordersGet(getOrderRequest);

      return response.result;

    } catch (error) {
      console.error('PayPal get order failed:', error);
      throw new Error(`PayPal get order failed: ${error.message}`);
    }
  }

  /**
   * Get service health status
   *
   * @param {Object} req - Express request object (optional)
   * @returns {Promise<Object>} Service health information
   */
  async getHealth(req = null) {
    try {
      await this.ensureInitialized(req);

      return {
        status: 'healthy',
        environment: this.environment,
        initialized: this.initialized,
        test_mode: isTestMode(req),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        test_mode: isTestMode(req),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reset service (useful for testing)
   */
  reset() {
    this.client = null;
    this.environment = null;
    this.initialized = false;
    this.initializationPromise = null;
    console.log('PayPal Service: Reset completed');
  }
}

// Create singleton instance
const paypalService = new PayPalService();

/**
 * Get PayPal service instance
 *
 * @returns {PayPalService} PayPal service singleton
 */
export function getPayPalService() {
  return paypalService;
}

/**
 * Create PayPal order (convenience function)
 *
 * @param {Object} orderData - Order creation data
 * @param {Object} req - Express request object (optional)
 * @returns {Promise<Object>} PayPal order response
 */
export async function createPayPalOrder(orderData, req = null) {
  const service = getPayPalService();
  return await service.createOrder(orderData, req);
}

/**
 * Capture PayPal order (convenience function)
 *
 * @param {string} orderId - PayPal order ID
 * @param {Object} captureData - Capture request data (optional)
 * @param {Object} req - Express request object (optional)
 * @returns {Promise<Object>} PayPal capture response
 */
export async function capturePayPalOrder(orderId, captureData = {}, req = null) {
  const service = getPayPalService();
  return await service.captureOrder(orderId, captureData, req);
}

/**
 * Get PayPal order details (convenience function)
 *
 * @param {string} orderId - PayPal order ID
 * @param {Object} req - Express request object (optional)
 * @returns {Promise<Object>} PayPal order details
 */
export async function getPayPalOrderDetails(orderId, req = null) {
  const service = getPayPalService();
  return await service.getOrder(orderId, req);
}

export default {
  getPayPalService,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderDetails,
  PayPalService
};