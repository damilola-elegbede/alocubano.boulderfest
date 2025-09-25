import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { warmDatabaseInBackground } from '../../lib/database-warmer.js';

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
      console.log('Checkout session verified as successful:', {
        sessionId: fullSession.id,
        customerEmail: fullSession.customer_email || fullSession.customer_details?.email,
        amount: fullSession.amount_total / 100,
        orderId: fullSession.metadata?.orderId
      });
    }

    // Check if tickets already exist for this session (idempotency check)
    let existingTransaction = await transactionService.getByStripeSessionId(session_id);
    let registrationToken = null;
    let hasTickets = false;
    let transaction = null;  // Declare transaction at outer scope

    if (existingTransaction) {
      console.log(`Transaction already exists for session ${session_id}`);
      hasTickets = true;
      transaction = existingTransaction;  // Use existing transaction

      // Generate order number if missing (for transactions created before order_number was added)
      if (!transaction.order_number) {
        const isTestTransaction = fullSession.mode === 'test' || fullSession.livemode === false;
        transaction.order_number = await generateOrderId(isTestTransaction);
        console.log(`Generated order number for existing transaction: ${transaction.order_number}`);

        // Update the database with the new order number
        const db = await getDatabaseClient();
        await db.execute({
          sql: 'UPDATE transactions SET order_number = ? WHERE id = ?',
          args: [transaction.order_number, transaction.id]
        });
      }

      // Check if we already have a registration token
      if (existingTransaction.registration_token) {
        registrationToken = existingTransaction.registration_token;
        console.log(`Using existing registration token for transaction ${existingTransaction.uuid}`);
      } else {
        // Generate registration token if missing
        try {
          console.log(`Generating registration token for transaction ${existingTransaction.uuid}, ID: ${existingTransaction.id}`);
          const tokenService = new RegistrationTokenService();
          await tokenService.ensureInitialized();
          registrationToken = await tokenService.createToken(existingTransaction.id);
          console.log(`Successfully generated registration token for existing transaction ${existingTransaction.uuid}`);
        } catch (tokenError) {
          console.error('Failed to generate registration token for existing transaction:', {
            error: tokenError.message,
            stack: tokenError.stack,
            transactionId: existingTransaction.id,
            transactionUuid: existingTransaction.uuid
          });
          // Continue without token - user can still access tickets via other means
        }
      }
    } else {
      // Transaction doesn't exist yet - webhook hasn't processed it
      // Wait for webhook to create transaction (with retry logic)
      console.log(`Transaction not found for session ${session_id}, waiting for webhook...`);

      // Retry up to 10 times with exponential backoff
      let retryCount = 0;
      const maxRetries = 10;
      const initialDelay = 1000; // Start with 1 second

      while (retryCount < maxRetries && !existingTransaction) {
        // Exponential backoff: 1s, 2s, 4s, 8s, etc. (max 30s)
        const delay = Math.min(initialDelay * Math.pow(2, retryCount), 30000);
        console.log(`Retry ${retryCount + 1}/${maxRetries}: Waiting ${delay}ms for webhook to process...`);

        await new Promise(resolve => setTimeout(resolve, delay));

        // Check again for transaction
        existingTransaction = await transactionService.getByStripeSessionId(session_id);

        if (existingTransaction) {
          console.log(`Transaction found after ${retryCount + 1} retries`);
          hasTickets = true;
          transaction = existingTransaction;

          // Generate order number if missing
          if (!transaction.order_number) {
            const isTestTransaction = fullSession.mode === 'test' || fullSession.livemode === false;
            transaction.order_number = await generateOrderId(isTestTransaction);

            const db = await getDatabaseClient();
            await db.execute({
              sql: 'UPDATE transactions SET order_number = ? WHERE id = ?',
              args: [transaction.order_number, transaction.id]
            });
          }

          // Get or generate registration token
          if (existingTransaction.registration_token) {
            registrationToken = existingTransaction.registration_token;
          } else {
            try {
              const tokenService = new RegistrationTokenService();
              await tokenService.ensureInitialized();
              registrationToken = await tokenService.createToken(existingTransaction.id);
              console.log(`Generated registration token for transaction ${existingTransaction.uuid}`);
            } catch (tokenError) {
              console.error('Failed to generate registration token:', tokenError.message);
            }
          }

          break; // Exit retry loop
        }

        retryCount++;
      }

      // If still no transaction after retries, return pending status
      if (!existingTransaction) {
        console.warn(`Transaction still not found after ${maxRetries} retries for session ${session_id}`);

        // Return a pending response - webhook may still be processing
        return res.status(202).json({
          success: false,
          pending: true,
          message: 'Payment confirmed but order processing in progress. Please refresh in a few moments.',
          session: {
            id: fullSession.id,
            amount: fullSession.amount_total / 100,
            currency: fullSession.currency,
            customer_email: fullSession.customer_email || fullSession.customer_details?.email
          },
          retryAfter: 5 // Suggest client retry after 5 seconds
        });
      }
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
      transaction: transaction ? {
        orderNumber: transaction.order_number,
        status: transaction.status,
        totalAmount: Number(transaction.total_amount || transaction.amount_cents), // Convert BigInt to Number
        customerEmail: transaction.customer_email,
        customerName: transaction.customer_name
      } : null
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
