import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { warmDatabaseInBackground } from '../../lib/database-warmer.js';
import timeUtils from '../../lib/time-utils.js';
import { processDatabaseResult } from '../../lib/bigint-serializer.js';

/**
 * Checkout Success API Endpoint
 * Handles successful Stripe Checkout returns and creates tickets immediately
 * Option 2 Implementation: Move ticket creation from webhook to checkout success
 */

import Stripe from 'stripe';
import { getDatabaseClient } from '../../lib/database.js';
import { RegistrationTokenService } from '../../lib/registration-token-service.js';
import { generateOrderId } from '../../lib/order-id-generator.js';
import transactionService from '../../lib/transaction-service.js';
import { createOrRetrieveTickets } from '../../lib/ticket-creation-service.js';

// Initialize Stripe with strict error handling
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('❌ FATAL: STRIPE_SECRET_KEY secret not configured');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Note: Ticket creation has been moved to webhook handler only
// This prevents duplicate tickets and ensures single source of truth

export default async function handler(req, res) {
  // Warm database connection in background to reduce latency
  warmDatabaseInBackground();

  // Set CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id } = req.query;

    // Validate session_id parameter
    if (!session_id || !session_id.startsWith('cs_')) {
      return res.status(400).json({
        error: 'Invalid session ID',
        message: 'Valid Stripe session ID required'
      });
    }

    // Retrieve and validate Checkout Session from Stripe (with expanded line items)
    const fullSession = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items', 'line_items.data.price.product']
    });

    // Verify the session is in a successful state
    if (fullSession.payment_status !== 'paid') {
      return res.status(400).json({
        error: 'Payment not completed',
        status: fullSession.payment_status
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      const email = fullSession.customer_email || fullSession.customer_details?.email;
      console.log('Checkout session verified as successful:', {
        sessionId: fullSession.id,
        customerEmail: email ? email.replace(/(.).+(@.*)/, '$1***$2') : undefined,
        amount: fullSession.amount_total / 100,
        orderId: fullSession.metadata?.orderId
      });
    }

    // Use the centralized ticket creation service for idempotent operations
    console.log(`Processing checkout success for session ${session_id}`);

    let result;
    let registrationToken = null;
    let transaction = null;
    let hasTickets = false;

    try {
      // This will create or retrieve transaction and tickets atomically
      result = await createOrRetrieveTickets(fullSession);

      transaction = result.transaction;
      hasTickets = result.ticketCount > 0;

      console.log(`Transaction ${result.created ? 'created' : 'retrieved'}: ${transaction.uuid}`);
      console.log(`${result.ticketCount} tickets ${result.created ? 'created' : 'found'}`);

      // Ensure order number exists
      if (!transaction.order_number) {
        const isTestTransaction = fullSession.mode === 'test' || fullSession.livemode === false;
        transaction.order_number = await generateOrderId(isTestTransaction);
        console.log(`Generated order number: ${transaction.order_number}`);

        const db = await getDatabaseClient();
        const updateResult = await db.execute({
          sql: 'UPDATE transactions SET order_number = ? WHERE id = ?',
          args: [transaction.order_number, transaction.id]
        });
        // Process update result for consistency
        processDatabaseResult(updateResult);
      }

      // Get or generate registration token
      if (transaction.registration_token) {
        registrationToken = transaction.registration_token;
        console.log(`Using existing registration token`);
      } else {
        try {
          const tokenService = new RegistrationTokenService();
          await tokenService.ensureInitialized();
          registrationToken = await tokenService.createToken(transaction.id);
          console.log(`Generated registration token for transaction ${transaction.uuid}`);

          // Update transaction with token
          const db = await getDatabaseClient();
          const tokenUpdateResult = await db.execute({
            sql: 'UPDATE transactions SET registration_token = ? WHERE id = ?',
            args: [registrationToken, transaction.id]
          });
          // Process update result for consistency
          processDatabaseResult(tokenUpdateResult);
        } catch (tokenError) {
          console.error('Failed to generate registration token:', tokenError.message);
          // Continue without token - not critical for success response
        }
      }

    } catch (error) {
      console.error('Failed to create or retrieve tickets:', error);

      // For critical errors, return error response
      return res.status(500).json({
        error: 'Failed to process order',
        message: 'Please contact support with your session ID',
        sessionId: session_id
      });
    }

    // Return success response with registration information and order details
    const response = {
      success: true,
      orderNumber: transaction ? transaction.order_number : null,  // Add order number for user reference
      session: {
        id: fullSession.id,
        amount: fullSession.amount_total / 100,
        currency: fullSession.currency,
        customer_email: fullSession.customer_email || fullSession.customer_details?.email,
        customer_details: fullSession.customer_details, // Include full customer details for form
        metadata: fullSession.metadata
      },
      hasTickets,
      // Include transaction details for better frontend integration (without exposing internal IDs)
      transaction: transaction ? timeUtils.enhanceApiResponse(processDatabaseResult({
        orderNumber: transaction.order_number,
        status: transaction.status,
        totalAmount: transaction.total_amount || transaction.amount_cents, // Will be processed by BigInt serializer
        customerEmail: transaction.customer_email,
        customerName: transaction.customer_name,
        created_at: transaction.created_at,
        updated_at: transaction.updated_at
      }), ['created_at', 'updated_at'], { includeDeadline: true, deadlineHours: 24 }) : null,
      // Add Mountain Time information
      timezone: 'America/Denver',
      currentTime: timeUtils.getCurrentTime()
    };

    // Add registration information if token exists
    if (registrationToken) {
      response.registrationToken = registrationToken;
      response.registrationUrl = `/pages/core/register-tickets.html?token=${registrationToken}`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error handling checkout success:', error);

    // Handle specific Stripe errors
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.message
      });
    }

    // Generic error response
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process checkout success'
    });
  }
}
