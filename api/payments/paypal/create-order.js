/**
 * PayPal Create Order API Endpoint
 * Creates a PayPal order with database storage and test mode support
 */

import { withRateLimit } from '../../utils/rate-limiter.js';
import { setSecureCorsHeaders } from '../../../lib/cors-config.js';
import { getDatabaseClient } from '../../../lib/database.js';
import { createPayPalOrder } from '../../../lib/paypal-service.js';
import {
  isTestMode,
  getTestModeFlag,
  generateTestAwareTransactionId,
  createTestModeMetadata,
  logTestModeOperation
} from '../../../lib/test-mode-utils.js';
import { v4 as uuidv4 } from 'uuid';

// Maximum request body size (100KB)
const MAX_BODY_SIZE = 100 * 1024;

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: 'Too many payment attempts. Please wait a moment before trying again.'
};

async function createOrderHandler(req, res) {
  console.log('=== PayPal Create Order Handler Started ===');
  console.log('Request method:', req.method);
  console.log('Test mode:', isTestMode(req));

  // Set secure CORS headers
  setSecureCorsHeaders(req, res, {
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Test-Mode']
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check request body size
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return res.status(413).json({ error: 'Request body too large' });
  }

  let dbClient;
  let transactionId;

  try {
    const { cartItems, customerInfo, testMode = false } = req.body;

    // Detect test mode from various sources
    const isRequestTestMode = testMode ||
      isTestMode(req) ||
      req.headers['x-test-mode'] === 'true' ||
      cartItems?.some(item => item.isTestItem || item.name?.startsWith('TEST'));

    logTestModeOperation('PayPal: Order creation started', {
      cartItems: cartItems?.length,
      isRequestTestMode
    }, req);

    // Validate required fields
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart items required' });
    }

    // Validate cart items limit (prevent abuse)
    if (cartItems.length > 50) {
      return res.status(400).json({
        error: 'Too many items in cart (maximum 50)'
      });
    }

    // Calculate total and validate items
    let totalAmount = 0;
    const orderItems = [];
    let orderType = 'tickets'; // Default to tickets

    // Track what types of items we have
    const hasTickets = cartItems.some((item) => item.type === 'ticket');
    const hasDonations = cartItems.some((item) => item.type === 'donation');

    // Set order type based on cart contents
    if (hasDonations && !hasTickets) {
      orderType = 'donation';
    } else if (hasTickets) {
      orderType = 'tickets';
    }

    for (const item of cartItems) {
      // Comprehensive validation
      if (!item.name || typeof item.name !== 'string' || item.name.length > 200) {
        return res.status(400).json({
          error: `Invalid item name: ${item.name || 'Unknown'}`
        });
      }

      if (typeof item.price !== 'number' || item.price < 0) {
        return res.status(400).json({
          error: `Invalid price for item: ${item.name}`
        });
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100) {
        return res.status(400).json({
          error: `Invalid quantity for item: ${item.name}`
        });
      }

      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      // Prepare sanitized item for PayPal (use camelCase for SDK)
      orderItems.push({
        name: item.name.substring(0, 127), // PayPal name limit
        unitAmount: {
          currencyCode: 'USD',
          value: item.price.toFixed(2)
        },
        quantity: item.quantity.toString(),
        description: item.description,
        category: item.type === 'ticket' ? 'DIGITAL_GOODS' : 'DONATION'
      });
    }

    // Validate total amount
    if (totalAmount <= 0 || totalAmount > 10000) {
      return res.status(400).json({
        error: 'Invalid order total. Amount must be between $0.01 and $10,000'
      });
    }

    // Validate and determine return URLs
    const origin = req.headers.origin;
    let baseUrl = 'https://alocubano.boulderfest.com';

    if (origin && (origin.includes('localhost') || origin.includes('vercel.app') || origin.includes('alocubano.boulderfest.com'))) {
      baseUrl = origin;
    }

    // Generate transaction ID and reference ID
    const transactionUuid = uuidv4();
    transactionId = generateTestAwareTransactionId(`paypal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, req);
    const referenceId = `ALCBF-${Date.now()}`;

    // Initialize database connection
    dbClient = await getDatabaseClient();

    // Prepare customer info with validation
    const customerEmail = customerInfo?.email || 'pending@paypal.user';
    const customerName = customerInfo?.firstName && customerInfo?.lastName
      ? `${customerInfo.firstName} ${customerInfo.lastName}`
      : 'Pending PayPal User';

    // Create PayPal order data (use camelCase for SDK)
    const paypalOrderData = {
      intent: 'CAPTURE',
      purchaseUnits: [
        {
          referenceId: referenceId,
          amount: {
            currencyCode: 'USD',
            value: totalAmount.toFixed(2),
            breakdown: {
              itemTotal: {
                currencyCode: 'USD',
                value: totalAmount.toFixed(2)
              }
            }
          },
          items: orderItems,
          description: 'A Lo Cubano Boulder Fest Purchase',
          customId: customerEmail,
          invoiceId: referenceId
        }
      ],
      applicationContext: {
        brandName: 'A Lo Cubano Boulder Fest',
        landingPage: 'BILLING',
        userAction: 'PAY_NOW',
        returnUrl: `${baseUrl}/success?reference_id=${referenceId}&paypal=true${isRequestTestMode ? '&test_mode=true' : ''}`,
        cancelUrl: `${baseUrl}/failure?reference_id=${referenceId}&paypal=true${isRequestTestMode ? '&test_mode=true' : ''}`,
        shippingPreference: 'NO_SHIPPING'
      }
    };

    // Create PayPal order using service
    const paypalOrder = await createPayPalOrder(paypalOrderData, req);

    // Store transaction in database BEFORE redirect
    const insertResult = await dbClient.execute({
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, status, amount_cents, total_amount, currency,
        paypal_order_id, payment_processor, reference_id, cart_data,
        customer_email, customer_name, order_data, metadata,
        event_id, source, is_test, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      args: [
        transactionId,
        transactionUuid,
        orderType,
        'pending',
        Math.round(totalAmount * 100), // Convert to cents
        Math.round(totalAmount * 100),
        'USD',
        paypalOrder.id,
        'paypal',
        referenceId,
        JSON.stringify(cartItems),
        customerEmail,
        customerName,
        JSON.stringify(paypalOrderData),
        JSON.stringify(createTestModeMetadata(req, {
          paypal_order_id: paypalOrder.id,
          reference_id: referenceId,
          total_amount: totalAmount,
          item_count: cartItems.length
        })),
        'boulderfest_2026',
        'website',
        getTestModeFlag(req)
      ]
    });

    console.log(`${isRequestTestMode ? 'TEST ' : ''}PayPal order created and stored:`, {
      transactionId,
      paypalOrderId: paypalOrder.id,
      referenceId,
      totalAmount,
      testMode: isRequestTestMode
    });

    // Extract approval URL
    const approvalUrl = paypalOrder.links?.find(link => link.rel === 'approve')?.href;

    if (!approvalUrl) {
      throw new Error('PayPal approval URL not found in order response');
    }

    // Return order details
    res.status(200).json({
      orderId: paypalOrder.id,
      approvalUrl: approvalUrl,
      transactionId: transactionId,
      referenceId: referenceId,
      totalAmount: totalAmount,
      testMode: isRequestTestMode
    });

  } catch (error) {
    console.error('PayPal order creation error:', error);

    // Log error with transaction context
    if (transactionId) {
      logTestModeOperation('PayPal: Order creation failed', {
        transactionId,
        error: error.message
      }, req);
    }

    // Handle specific error types
    if (error.message?.includes('PAYPAL_ORDER_CREATION_FAILED')) {
      return res.status(400).json({
        error: 'PayPal order creation failed',
        message: 'Invalid order data. Please check your cart and try again.',
        fallbackUrl: '/api/payments/create-checkout-session'
      });
    }

    if (error.message?.includes('PayPal credentials not configured')) {
      return res.status(503).json({
        error: 'PayPal payment processing is temporarily unavailable',
        message: 'Please try using a credit card instead, or contact support.',
        fallbackUrl: '/api/payments/create-checkout-session'
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'PayPal payment initialization failed',
      message: 'Please try using a credit card instead, or try again later.',
      fallbackUrl: '/api/payments/create-checkout-session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Export handler with rate limiting
export default withRateLimit(createOrderHandler, RATE_LIMIT_CONFIG);
