/**
 * PayPal Capture Order API Endpoint
 * Handles PayPal order capture after user approval
 */

import { setCorsHeaders } from '../../utils/cors.js';
import { withRateLimit } from '../../utils/rate-limiter.js';

// PayPal API base URL configuration
const PAYPAL_API_URL =
  process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com';

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60000, // 1 minute
  max: 20, // 20 capture attempts per minute per IP
  message: 'Too many capture attempts. Please wait before trying again.'
};

async function captureOrderHandler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res, {
    methods: 'POST, OPTIONS',
    headers: 'Content-Type, Authorization'
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      timestamp: new Date().toISOString()
    });
  }

  try {
    const { orderId } = req.body;

    // Validate required fields
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({
        error: 'Invalid order ID',
        message: 'PayPal order ID is required',
        code: 'INVALID_ORDER_ID',
        timestamp: new Date().toISOString()
      });
    }

    // Check if PayPal credentials are configured
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      console.error('PayPal credentials not configured');
      return res.status(503).json({
        error: 'PayPal payment processing unavailable',
        message: 'PayPal service is temporarily unavailable',
        code: 'PAYPAL_UNAVAILABLE',
        timestamp: new Date().toISOString()
      });
    }

    // Get PayPal access token
    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to authenticate with PayPal');
    }

    const { access_token } = await tokenResponse.json();

    // Get order details to verify it's approved
    const orderResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!orderResponse.ok) {
      throw new Error('Failed to retrieve PayPal order');
    }

    const order = await orderResponse.json();

    // Verify order status
    if (order.status !== 'APPROVED') {
      return res.status(422).json({
        error: 'Order cannot be captured',
        message: `Order status is ${order.status}, expected APPROVED`,
        code: 'ORDER_NOT_APPROVED',
        currentStatus: order.status,
        timestamp: new Date().toISOString()
      });
    }

    // Capture the PayPal order
    const captureResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture_${orderId}_${Date.now()}`
      },
      body: JSON.stringify({})
    });

    if (!captureResponse.ok) {
      const errorData = await captureResponse.json();
      console.error('PayPal capture failed:', errorData);
      throw new Error('Failed to capture PayPal order');
    }

    const captureResult = await captureResponse.json();

    // Verify capture success
    if (captureResult.status !== 'COMPLETED') {
      return res.status(422).json({
        error: 'Capture failed',
        message: `Capture status is ${captureResult.status}`,
        code: 'CAPTURE_FAILED',
        captureStatus: captureResult.status,
        timestamp: new Date().toISOString()
      });
    }

    // Extract capture details
    const capture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];

    if (!capture) {
      throw new Error('No capture details found in response');
    }

    // Prepare success response with transaction details
    const response = {
      success: true,
      paymentMethod: 'paypal',
      orderId: captureResult.id,
      captureId: capture.id,
      status: 'COMPLETED',
      amount: parseFloat(capture.amount.value),
      currency: capture.amount.currency_code,
      payer: {
        payerId: captureResult.payer?.payer_id,
        email: captureResult.payer?.email_address,
        name: captureResult.payer?.name ? {
          given_name: captureResult.payer.name.given_name,
          surname: captureResult.payer.name.surname
        } : null
      },
      purchaseUnits: captureResult.purchase_units?.map(unit => ({
        referenceId: unit.reference_id,
        amount: unit.payments?.captures?.[0]?.amount,
        description: unit.description
      })),
      instructions: {
        clearCart: true,
        nextSteps: [
          'Check your email for order confirmation',
          'Complete your festival registration (link in email)',
          'Save your confirmation number for check-in',
          'Join our WhatsApp group for updates'
        ]
      },
      message: 'Payment successful! Thank you for your purchase.',
      timestamp: new Date().toISOString()
    };

    // Log successful capture for monitoring
    console.log('PayPal order captured successfully:', {
      orderId: captureResult.id,
      captureId: capture.id,
      amount: capture.amount.value,
      currency: capture.amount.currency_code,
    });

    return res.status(200).json(response);

  } catch (error) {
    console.error('PayPal order capture error:', error);

    // Handle specific PayPal errors
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Order not found',
        message: 'PayPal order not found or expired',
        code: 'ORDER_NOT_FOUND',
        timestamp: new Date().toISOString()
      });
    }

    if (error.message?.includes('authentication')) {
      return res.status(503).json({
        error: 'PayPal service unavailable',
        message: 'PayPal authentication failed. Please try again later.',
        code: 'PAYPAL_AUTH_FAILED',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(500).json({
      error: 'Capture processing failed',
      message: 'An error occurred while processing the payment capture',
      code: 'CAPTURE_PROCESSING_ERROR',
      timestamp: new Date().toISOString()
    });
  }
}

// Export handler with rate limiting
export default withRateLimit(captureOrderHandler, RATE_LIMIT_CONFIG);