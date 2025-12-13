/**
 * PayPal Create Order API Endpoint
 * Creates a PayPal order with database storage and test mode support
 */

import { withRateLimit } from '../../../middleware/rate-limit.js';
import { setSecureCorsHeaders } from '../../../lib/cors-config.js';
import { getDatabaseClient } from '../../../lib/database.js';
import { createPayPalOrder } from '../../../lib/paypal-service.js';
import {
  isTestMode,
  getTestModeFlag,
  createTestModeMetadata,
  logTestModeOperation
} from '../../../lib/test-mode-utils.js';
import { v4 as uuidv4 } from 'uuid';
import { generateOrderNumber } from '../../../lib/order-number-generator.js';
import { sanitizeProductName, sanitizeProductDescription } from '../../../lib/payment-sanitization.js';
import { PayPalOrderRequestSchema } from '../../../src/api/schemas/checkout.js';
import { validateRequestWithResponse } from '../../../src/api/helpers/validate.js';

// Maximum request body size (100KB)
const MAX_BODY_SIZE = 100 * 1024;

// Note: Rate limiting is now handled by the consolidated middleware/rate-limit.js

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
    // Validate request body with Zod schema
    const validation = validateRequestWithResponse(PayPalOrderRequestSchema, req.body, res);
    if (!validation.valid) {
      return; // Response already sent by validateRequestWithResponse
    }

    const { cartItems, customerInfo, deviceInfo } = validation.data;

    // Detect test mode from various sources
    const isRequestTestMode =
      isTestMode(req) ||
      req.headers['x-test-mode'] === 'true' ||
      cartItems?.some(item => item.isTestItem || item.name?.startsWith('TEST'));

    console.log('PayPal: Request payload:', {
      cartItems,
      customerInfo,
      deviceInfo,
      testMode: isRequestTestMode
    });

    logTestModeOperation('PayPal: Order creation started', {
      cartItems: cartItems?.length,
      isRequestTestMode
    }, req);

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

      // Validate required fields for tickets
      if (item.type === 'ticket') {
        if (!item.ticketType) {
          return res.status(400).json({
            error: `Invalid ticket data - missing ticket type for: ${item.name || 'Unknown'}`
          });
        }
        if (!item.eventDate) {
          return res.status(400).json({
            error: `Invalid ticket data - missing event date for: ${item.name || 'Unknown'}`
          });
        }
      }

      const itemTotal = item.price * item.quantity;
      totalAmount += itemTotal;

      // Convert cents to dollars for PayPal (prices stored in cents internally)
      const priceInDollars = (item.price / 100).toFixed(2);

      console.log('PayPal: Item processed:', {
        name: item.name,
        priceCents: item.price,
        priceDollars: priceInDollars,
        quantity: item.quantity,
        itemTotal,
        runningTotal: totalAmount
      });

      // Prepare sanitized item for PayPal (use camelCase for SDK)
      orderItems.push({
        name: sanitizeProductName(item.name).substring(0, 127), // Sanitized: "Event-Ticket" (PayPal limit: 127 chars)
        unitAmount: {
          currencyCode: 'USD',
          value: priceInDollars // PayPal expects dollars, not cents
        },
        quantity: item.quantity.toString(),
        description: sanitizeProductDescription(item.description || item.name, 'paypal'), // Sanitized with PayPal 127 char limit enforced
        category: hasTickets ? 'DIGITAL_GOODS' : 'DONATION'
      });
    }

    // Validate total amount (totalAmount is in cents, convert to dollars for validation)
    const totalInDollars = totalAmount / 100;

    console.log('PayPal: Final total validation:', {
      totalAmountCents: totalAmount,
      totalAmountDollars: totalInDollars,
      isValid: totalAmount > 0 && totalInDollars <= 10000,
      orderItemsCount: orderItems.length
    });

    if (totalAmount <= 0 || totalInDollars > 10000) {
      return res.status(400).json({
        error: 'Invalid order total. Amount must be between $0.01 and $10,000'
      });
    }

    // Validate and determine return URLs
    const origin = req.headers.origin;
    let baseUrl = 'https://alocubanoboulderfest.org';

    if (origin && (origin.includes('localhost') || origin.includes('vercel.app') || origin.includes('alocubanoboulderfest.org'))) {
      baseUrl = origin;
    }

    // Generate transaction ID (no TEST- prefix)
    const transactionUuid = uuidv4();
    transactionId = `paypal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Initialize database connection
    dbClient = await getDatabaseClient();

    // Prepare customer info with validation
    const customerEmail = customerInfo?.email || 'pending@paypal.user';
    const customerName = customerInfo?.firstName && customerInfo?.lastName
      ? `${customerInfo.firstName} ${customerInfo.lastName}`
      : 'Pending PayPal User';

    // Generate order number BEFORE PayPal order creation
    const orderNumber = await generateOrderNumber();
    console.log(`Generated order number for PayPal: ${orderNumber}`);

    // Create PayPal order data (use camelCase for SDK)
    // PayPal expects amounts in dollars, not cents
    const paypalOrderData = {
      intent: 'CAPTURE',
      purchaseUnits: [
        {
          referenceId: orderNumber,
          amount: {
            currencyCode: 'USD',
            value: totalInDollars.toFixed(2), // Convert cents to dollars
            breakdown: {
              itemTotal: {
                currencyCode: 'USD',
                value: totalInDollars.toFixed(2) // Convert cents to dollars
              }
            }
          },
          items: orderItems,
          description: 'A Lo Cubano Boulder Fest Purchase',
          customId: customerEmail,
          invoiceId: orderNumber
        }
      ],
      applicationContext: {
        brandName: 'A Lo Cubano Boulder Fest',
        landingPage: 'BILLING',
        userAction: 'PAY_NOW',
        returnUrl: `${baseUrl}/success?reference_id=${orderNumber}&paypal=true${isRequestTestMode ? '&test_mode=true' : ''}`,
        cancelUrl: `${baseUrl}/failure?reference_id=${orderNumber}&paypal=true${isRequestTestMode ? '&test_mode=true' : ''}`,
        shippingPreference: 'NO_SHIPPING'
      }
    };

    // Create PayPal order using service
    const paypalOrder = await createPayPalOrder(paypalOrderData, req);

    // Determine event_id from cart items (use first item's eventId, including test events with negative IDs)
    const firstEventId = cartItems[0]?.eventId;
    const eventId = firstEventId || null; // Use the numeric event ID directly (including -1, -2 for test events)

    // Store transaction in database BEFORE redirect
    await dbClient.execute({
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, status, amount_cents, total_amount, currency,
        paypal_order_id, payment_processor, reference_id, cart_data,
        customer_email, customer_name, order_data, metadata,
        event_id, source, is_test, order_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      args: [
        transactionId,
        transactionUuid,
        orderType,
        'pending',
        Math.round(totalAmount), // Already in cents, don't multiply
        Math.round(totalAmount),
        'USD',
        paypalOrder.id,
        'paypal',
        orderNumber,
        JSON.stringify(cartItems),
        customerEmail,
        customerName,
        JSON.stringify(paypalOrderData),
        JSON.stringify(createTestModeMetadata(req, {
          paypal_order_id: paypalOrder.id,
          reference_id: orderNumber,
          total_amount: totalAmount,
          item_count: cartItems.length,
          event_id: eventId
        })),
        eventId, // Use dynamic event_id or null for test tickets
        'website',
        isRequestTestMode ? 1 : 0,
        orderNumber  // User-friendly order number (ALO-YYYY-NNNN)
      ]
    });

    console.log(`${isRequestTestMode ? 'TEST ' : ''}PayPal order created and stored:`, {
      transactionId,
      paypalOrderId: paypalOrder.id,
      orderNumber,
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
      orderNumber: orderNumber,
      totalAmount: totalInDollars, // Return in dollars for consistency with PayPal
      totalAmountCents: totalAmount, // Also include cents for reference
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
export default withRateLimit(createOrderHandler, 'payment');
