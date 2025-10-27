/**
 * PayPal Capture Order API Endpoint
 * Handles PayPal order capture after user approval
 * Creates tickets and registration tokens like Stripe flow
 */

import { setCorsHeaders } from '../../utils/cors.js';
import { withRateLimit } from '../../utils/rate-limiter.js';
import { getDatabaseClient } from '../../../lib/database.js';
import { RegistrationTokenService } from '../../../lib/registration-token-service.js';
import { generateOrderNumber } from '../../../lib/order-number-generator.js';
import { generateTicketId } from '../../../lib/ticket-id-generator.js';
import { processDatabaseResult } from '../../../lib/bigint-serializer.js';
import timeUtils from '../../../lib/time-utils.js';
import { getTicketEmailService } from '../../../lib/ticket-email-service-brevo.js';
import { detectPaymentProcessor, extractPaymentSourceDetails } from '../../../lib/paypal-payment-source-detector.js';

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

    // Detect payment processor from funding source (Venmo vs PayPal)
    const paymentProcessor = detectPaymentProcessor(captureResult);
    const sourceDetails = extractPaymentSourceDetails(captureResult);

    console.log('Payment source detected:', {
      processor: paymentProcessor,
      sourceType: sourceDetails.type,
      accountId: sourceDetails.accountId
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

    let transactionId;
    let orderNumber;
    let cartData = [];
    let hasTickets = false;
    let hasDonations = false;

    if (existingTransaction.rows && existingTransaction.rows.length > 0) {
      // Update existing transaction
      const transaction = existingTransaction.rows[0];
      transactionId = transaction.id;
      orderNumber = transaction.order_number;

      // Generate order_number if it doesn't exist
      if (!orderNumber) {
        console.warn('⚠️ FALLBACK ORDER NUMBER GENERATION TRIGGERED (PayPal)', {
          reason: 'PayPal transaction created without order_number',
          orderId: orderId,
          transactionId: transaction.id,
          transactionUuid: transaction.uuid,
          paypalApiUrl: PAYPAL_API_URL,
          recommendation: 'This should not happen after fix. Investigate if seen.',
          timestamp: new Date().toISOString()
        });

        orderNumber = await generateOrderNumber();
        console.log(`Generated fallback order number for PayPal transaction: ${orderNumber}`);
      }

      // Parse cart data from transaction
      if (transaction.cart_data) {
        try {
          cartData = JSON.parse(transaction.cart_data);
          hasTickets = cartData.some(item => item.type === 'ticket');
          hasDonations = cartData.some(item => item.type === 'donation');
          console.log('Parsed cart data:', {
            itemCount: cartData.length,
            hasTickets,
            hasDonations,
            items: cartData.map(item => ({ type: item.type, name: item.name }))
          });
        } catch (e) {
          console.error('Failed to parse cart data from transaction:', e);
        }
      } else {
        console.warn('No cart_data found in transaction:', transactionId);
      }

      // Extract PayPal capture details
      const captureId = capture.id;
      const payerId = captureResult.payer?.payer_id || null;

      // Update transaction with capture details, status, and customer info
      await db.execute({
        sql: `UPDATE transactions
              SET status = ?, order_number = ?, customer_email = ?, customer_name = ?,
                  payment_processor = ?, paypal_capture_id = ?, paypal_payer_id = ?,
                  completed_at = ?, updated_at = ?
              WHERE id = ?`,
        args: [
          'completed',
          orderNumber,
          customerEmail,
          customerName,
          paymentProcessor, // Use detected processor (venmo or paypal)
          captureId,
          payerId,
          new Date().toISOString(), // completed_at
          new Date().toISOString(), // updated_at
          transactionId
        ]
      });

      console.log('Updated existing transaction:', transactionId);
    } else {
      // Create new transaction (fallback if not found)
      console.warn('⚠️ FALLBACK ORDER NUMBER GENERATION TRIGGERED (PayPal - New Transaction)', {
        reason: 'PayPal transaction not found in database, creating new transaction',
        orderId: orderId,
        paypalApiUrl: PAYPAL_API_URL,
        recommendation: 'Investigate why PayPal transaction was not created during order creation. This should be rare.',
        timestamp: new Date().toISOString()
      });

      orderNumber = await generateOrderNumber();

      // Extract additional PayPal details
      const captureId = capture.id;
      const payerId = captureResult.payer?.payer_id || null;
      const billingAddress = captureResult.payer?.address ? JSON.stringify(captureResult.payer.address) : null;

      // Determine transaction type
      const transactionType = hasTickets ? 'tickets' : 'donation';

      // Build order data
      const orderData = JSON.stringify({
        paypal_order_id: paypalOrderId,
        capture_id: captureId,
        payer: captureResult.payer,
        purchase_units: captureResult.purchase_units
      });

      const transactionUuid = crypto.randomUUID();

      const transactionResult = await db.execute({
        sql: `INSERT INTO transactions
              (transaction_id, uuid, type, order_data, cart_data, amount_cents, total_amount, currency,
               paypal_order_id, paypal_capture_id, paypal_payer_id, payment_processor,
               reference_id, payment_method_type,
               customer_email, customer_name, billing_address,
               status, completed_at, is_test, order_number)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transactionUuid, // transaction_id
          transactionUuid, // uuid
          transactionType, // type
          orderData, // order_data
          JSON.stringify(cartData), // cart_data
          amountCents, // amount_cents
          amountCents, // total_amount
          'USD', // currency
          paypalOrderId, // paypal_order_id
          captureId, // paypal_capture_id
          payerId, // paypal_payer_id
          paymentProcessor, // payment_processor (venmo or paypal)
          orderNumber, // reference_id
          'paypal', // payment_method_type
          customerEmail, // customer_email
          customerName, // customer_name
          billingAddress, // billing_address
          'completed', // status
          new Date().toISOString(), // completed_at
          0, // is_test (should be detected from cart data, defaulting to 0 for now)
          orderNumber // order_number
        ]
      });

      transactionId = transactionResult.lastInsertRowid;
    }

    // Create tickets if this is a ticket purchase and they don't exist yet
    let ticketCount = 0;
    console.log('Ticket creation check:', { hasTickets, cartDataLength: cartData.length });

    if (hasTickets) {
      // Check if tickets already exist
      const existingTickets = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
        args: [transactionId]
      });

      const existingCount = Number(existingTickets.rows[0].count);
      console.log('Existing ticket count:', existingCount);

      if (existingCount === 0) {
        // Create tickets
        const ticketItems = cartData.filter(item => item.type === 'ticket');
        console.log('Creating tickets for items:', ticketItems);

        for (const ticket of ticketItems) {
          const quantity = ticket.quantity || 1;
          console.log('Creating ticket:', {
            name: ticket.name,
            quantity,
            price: ticket.price,
            price_cents: ticket.price_cents
          });

          // Validate required fields - NO SILENT DEFAULTS
          if (!ticket.ticketType) {
            console.error('CRITICAL: No ticket type found in cart data:', {
              ticket: ticket,
              paypalOrderId: paypalOrderId,
              transactionId: transactionId
            });
            throw new Error(`Ticket type missing from cart data for item: ${ticket.name || 'Unknown'}`);
          }

          if (!ticket.eventId) {
            console.error('CRITICAL: No event ID found in cart data:', {
              ticket: ticket,
              paypalOrderId: paypalOrderId,
              transactionId: transactionId
            });
            throw new Error(`Event ID missing from cart data for item: ${ticket.name || 'Unknown'}`);
          }

          if (!ticket.eventDate) {
            console.error('CRITICAL: No event date found in cart data:', {
              ticket: ticket,
              paypalOrderId: paypalOrderId,
              transactionId: transactionId
            });
            throw new Error(`Event date missing from cart data for item: ${ticket.name || 'Unknown'}`);
          }

          for (let i = 0; i < quantity; i++) {
            const ticketId = await generateTicketId();
            const eventId = ticket.eventId;
            const priceCents = ticket.price_cents || ticket.price || 0;
            const eventDate = ticket.eventDate;
            const ticketType = ticket.ticketType;

            // Calculate registration deadline: 7 days before event date, or 24 hours from now
            let registrationDeadline;
            const now = new Date();

            if (eventDate) {
              const eventDateObj = new Date(eventDate);
              registrationDeadline = new Date(eventDateObj.getTime() - (7 * 24 * 60 * 60 * 1000));

              // If deadline is in the past, use 24 hours from now
              if (registrationDeadline <= now) {
                registrationDeadline = new Date(now.getTime() + (24 * 60 * 60 * 1000));
              }
            } else {
              // No event date, use 24 hours from now
              registrationDeadline = new Date(now.getTime() + (24 * 60 * 60 * 1000));
            }

            // Detect test mode from cart item
            const isTestTicket = ticket.isTestItem || ticket.name?.includes('TEST') || false;

            // Parse customer name for default attendee info
            const firstName = customerName ? customerName.split(' ')[0] : 'Guest';
            const lastName = customerName ? customerName.split(' ').slice(1).join(' ') || '' : 'Attendee';

            // Build ticket metadata
            const ticketMetadata = JSON.stringify({
              validation: {
                passed: true,
                errors: [],
                timestamp: now.toISOString(),
                paypal_order_id: paypalOrderId
              },
              source: 'paypal'
            });

            await db.execute({
              sql: `INSERT INTO tickets
                    (ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
                     event_date, price_cents,
                     attendee_first_name, attendee_last_name,
                     registration_status, registration_deadline,
                     status, created_at, is_test, ticket_metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                ticketId,
                transactionId,
                ticketType,
                ticketType, // ticket_type_id uses same value (ticket_types.id is TEXT)
                eventId,
                eventDate,
                priceCents,
                isTestTicket ? `TEST-${firstName}` : firstName, // attendee_first_name
                isTestTicket ? `TEST-${lastName}` : lastName, // attendee_last_name
                'pending', // registration_status
                registrationDeadline.toISOString(),
                'valid', // status
                now.toISOString(),
                isTestTicket ? 1 : 0, // is_test
                ticketMetadata
              ]
            });
            ticketCount++;
          }
        }
        console.log(`Created ${ticketCount} tickets for PayPal order ${paypalOrderId}`);
      } else {
        ticketCount = existingCount;
        console.log(`Found existing ${ticketCount} tickets for PayPal order ${paypalOrderId}`);
      }
    } else {
      console.log('No tickets to create - hasTickets is false');
    }

    // Generate registration token
    let registrationToken = null;
    let registrationUrl = null;

    if (hasTickets) {
      try {
        const tokenService = new RegistrationTokenService();
        await tokenService.ensureInitialized();
        registrationToken = await tokenService.createToken(transactionId);

        // Update transaction with token
        await db.execute({
          sql: 'UPDATE transactions SET registration_token = ? WHERE id = ?',
          args: [registrationToken, transactionId]
        });

        registrationUrl = `/pages/core/register-tickets.html?token=${registrationToken}`;
        console.log(`Generated registration token for PayPal order ${paypalOrderId}`);
      } catch (tokenError) {
        console.error('Failed to generate registration token:', tokenError);
      }
    }

    // Send ticket confirmation email (same as Stripe flow)
    if (hasTickets && ticketCount > 0) {
      try {
        // Fetch complete transaction with tickets for email
        const transactionForEmail = await db.execute({
          sql: `SELECT t.*,
                COUNT(tk.id) as ticket_count
                FROM transactions t
                LEFT JOIN tickets tk ON tk.transaction_id = t.id
                WHERE t.id = ?
                GROUP BY t.id`,
          args: [transactionId]
        });

        if (transactionForEmail.rows && transactionForEmail.rows.length > 0) {
          const ticketEmailService = getTicketEmailService();
          await ticketEmailService.sendTicketConfirmation(transactionForEmail.rows[0]);
          console.log(`Sent ticket confirmation email for PayPal order ${paypalOrderId}`);
        }
      } catch (emailError) {
        // Don't fail the capture if email fails - log and continue
        console.error('Failed to send confirmation email:', emailError);
      }
    }

    // Prepare success response with transaction details
    const response = {
      success: true,
      paymentMethod: 'paypal',
      orderNumber: orderNumber,
      orderId: captureResult.id,
      captureId: capture.id,
      status: 'COMPLETED',
      amount: parseFloat(capture.amount.value),
      currency: capture.amount.currency_code,
      hasTickets,
      hasDonations,
      registrationToken,
      registrationUrl,
      transaction: timeUtils.enhanceApiResponse(processDatabaseResult({
        orderNumber: orderNumber,
        status: 'completed',
        totalAmount: amountCents,
        customerEmail: customerEmail,
        customerName: customerName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }), ['created_at', 'updated_at'], { includeDeadline: true, deadlineHours: 24 }),
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
      ticketCount,
      hasRegistration: !!registrationToken
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