/**
 * PayPal Capture Order API Endpoint
 * Handles PayPal order capture after user approval with inline registration flow
 *
 * NOTE: With inline registration, tickets are created BEFORE payment with attendee info.
 * This endpoint now just captures payment, updates status, and sends confirmation emails.
 */

import { setCorsHeaders } from '../../utils/cors.js';
import { withRateLimit } from '../../utils/rate-limiter.js';
import { getDatabaseClient } from '../../../lib/database.js';
import { generateOrderNumber } from '../../../lib/order-number-generator.js';
import { processDatabaseResult } from '../../../lib/bigint-serializer.js';
import timeUtils from '../../../lib/time-utils.js';
import { getTicketEmailService } from '../../../lib/ticket-email-service-brevo.js';
import transactionService from '../../../lib/transaction-service.js';
import { detectPaymentProcessor, extractPaymentSourceDetails } from '../../../lib/paypal-payment-source-detector.js';
import { diagnoseAuthError, getPayPalEnvironmentInfo } from '../../../lib/paypal-config-validator.js';

// PayPal API base URL configuration
const PAYPAL_API_URL =
  process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com';

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60000, // 1 minute
  max: 20, // 20 capture attempts per minute per IP
  message: 'Too many capture attempts. Please wait before trying again.'
};

/**
 * Handles a PayPal order capture request, finalizes payment processing, creates or updates the corresponding transaction and tickets, generates a registration token if applicable, sends confirmation email(s), and responds with a detailed success or error payload.
 *
 * Processes a POST request containing a PayPal order ID: authenticates with PayPal, verifies the order is APPROVED, captures the order, records or updates the transaction in the database (setting payment_processor to "paypal"), creates tickets when cart data includes ticket items (calculating registration deadlines), issues a registration token if tickets exist, sends ticket confirmation emails when tickets were created, and returns a JSON response describing the result. On error, responds with appropriate HTTP status codes and machine-readable error codes (e.g., INVALID_ORDER_ID, PAYPAL_UNAVAILABLE, ORDER_NOT_APPROVED, CAPTURE_FAILED).
 *
 * @param {import('http').IncomingMessage & { method?: string, body?: any }} req - HTTP request object (POST expected with `{ orderId: string }` in body).
 * @param {import('http').ServerResponse & { status: function(number): any, json: function(any): any, end: function(): any }} res - HTTP response object used to send JSON responses and status codes.
 */
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
      const env = getPayPalEnvironmentInfo();
      console.error('PayPal credentials not configured:', {
        mode: env.mode,
        apiUrl: env.apiUrl,
        hasCredentials: env.hasCredentials
      });
      return res.status(503).json({
        error: 'PayPal payment processing unavailable',
        message: 'PayPal service is temporarily unavailable. Please contact support.',
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
      // Use diagnostic utility to provide helpful error message
      const diagnosis = await diagnoseAuthError(tokenResponse);
      console.error('PayPal authentication failed:', diagnosis);
      throw new Error(`Failed to authenticate with PayPal\n${diagnosis}`);
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

    // Detect payment processor from funding source (Venmo vs PayPal)
    const paymentProcessor = detectPaymentProcessor(captureResult);
    const sourceDetails = extractPaymentSourceDetails(captureResult);

    // Mask sensitive account identifier for security
    const maskedAccountId = sourceDetails.accountId
      ? `${String(sourceDetails.accountId).slice(0, 3)}***${String(sourceDetails.accountId).slice(-2)}`
      : undefined;

    console.log('Payment source detected:', {
      processor: paymentProcessor,
      sourceType: sourceDetails.type,
      accountId: maskedAccountId
    });

    // Extract capture details
    const capture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];

    if (!capture) {
      throw new Error('No capture details found in response');
    }

    // Get database connection
    const db = await getDatabaseClient();
    const paypalOrderId = captureResult.id;
    const amountCents = Math.round(parseFloat(capture.amount.value) * 100);
    const customerEmail = captureResult.payer?.email_address;
    const customerName = captureResult.payer?.name
      ? `${captureResult.payer.name.given_name || ''} ${captureResult.payer.name.surname || ''}`.trim()
      : null;

    // Find existing transaction by PayPal order ID
    const existingTransaction = await db.execute({
      sql: 'SELECT * FROM transactions WHERE paypal_order_id = ? LIMIT 1',
      args: [paypalOrderId]
    });

    if (!existingTransaction.rows || existingTransaction.rows.length === 0) {
      console.error('Transaction not found for PayPal order:', paypalOrderId);
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Order not found. Please contact support.',
        code: 'TRANSACTION_NOT_FOUND',
        timestamp: new Date().toISOString()
      });
    }

    const transaction = existingTransaction.rows[0];
    const transactionId = transaction.id;
    const orderNumber = transaction.order_number;

    console.log('Found existing transaction:', transactionId);

    // Extract PayPal capture details
    const captureId = capture.id;
    const payerId = captureResult.payer?.payer_id || null;

    // Update transaction with capture details and status
    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?,
                payment_processor = ?, paypal_capture_id = ?, paypal_payer_id = ?,
                completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [
        'completed',
        'completed',
        paymentProcessor, // Use detected processor (venmo or paypal)
        captureId,
        payerId,
        transactionId
      ]
    });

    // Update all tickets for this transaction to completed status
    const ticketUpdateResult = await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ? AND registration_status = ?`,
      args: ['completed', transactionId, 'pending_payment']
    });

    console.log(`Updated transaction ${transaction.uuid} and ${ticketUpdateResult.rowsAffected || 0} tickets to completed status`);

    // Get ticket and donation counts
    const ticketResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
      args: [transactionId]
    });
    const hasTickets = Number(ticketResult.rows[0].count) > 0;

    const donationResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM transaction_items WHERE transaction_id = ? AND item_type = ?',
      args: [transactionId, 'donation']
    });
    const hasDonations = Number(donationResult.rows[0].count) > 0;

    // Send attendee confirmation emails
    if (hasTickets) {
      try {
        const emailService = getTicketEmailService();
        const updatedTransaction = await transactionService.getByUUID(transaction.uuid);
        await emailService.sendTicketConfirmation(updatedTransaction);
        console.log(`Sent confirmation emails for PayPal order ${paypalOrderId}`);
      } catch (emailError) {
        // Don't fail the capture if email fails - log and continue
        console.error('Failed to send confirmation emails:', emailError);
      }
    }

    // Prepare success response with transaction details
    const response = {
      success: true,
      paymentMethod: paymentProcessor, // 'paypal' or 'venmo'
      orderNumber: orderNumber,
      orderId: captureResult.id,
      captureId: capture.id,
      status: 'COMPLETED',
      amount: parseFloat(capture.amount.value),
      currency: capture.amount.currency_code,
      hasTickets,
      hasDonations,
      transaction: timeUtils.enhanceApiResponse(processDatabaseResult({
        orderNumber: orderNumber,
        status: 'completed',
        paymentStatus: 'completed',
        totalAmount: amountCents,
        customerEmail: customerEmail,
        customerName: customerName,
        created_at: transaction.created_at,
        updated_at: new Date().toISOString()
      }), ['created_at', 'updated_at']),
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
      message: 'Payment successful! Thank you for your purchase.',
      timestamp: new Date().toISOString(),
      timezone: 'America/Denver',
      currentTime: timeUtils.getCurrentTime()
    };

    // Log successful capture for monitoring
    console.log('PayPal order captured successfully:', {
      orderId: captureResult.id,
      orderNumber: orderNumber,
      captureId: capture.id,
      amount: capture.amount.value,
      currency: capture.amount.currency_code,
      paymentProcessor,
      hasTickets,
      hasDonations
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