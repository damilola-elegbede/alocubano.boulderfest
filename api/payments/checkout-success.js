import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { warmDatabaseInBackground } from '../../lib/database-warmer.js';
import timeUtils from '../../lib/time-utils.js';
import { processDatabaseResult } from '../../lib/bigint-serializer.js';

/**
 * Checkout Success API Endpoint
 * Handles successful Stripe Checkout returns with inline registration flow
 *
 * NOTE: With inline registration, tickets are created BEFORE payment with attendee info.
 * This endpoint now just updates status and sends confirmation emails.
 */

import Stripe from 'stripe';
import { getDatabaseClient } from '../../lib/database.js';
import { generateOrderId } from '../../lib/order-id-generator.js';
import transactionService from '../../lib/transaction-service.js';
import { getTicketEmailService } from '../../lib/ticket-email-service-brevo.js';

// Initialize Stripe with strict error handling
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('❌ FATAL: STRIPE_SECRET_KEY secret not configured');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    // Retrieve and validate Checkout Session from Stripe
    const fullSession = await stripe.checkout.sessions.retrieve(session_id);

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
        amount: fullSession.amount_total / 100
      });
    }

    console.log(`Processing checkout success for session ${session_id}`);

    // Find existing transaction by Stripe session ID
    const db = await getDatabaseClient();
    const txResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE stripe_session_id = ? LIMIT 1',
      args: [session_id]
    });

    if (!txResult.rows || txResult.rows.length === 0) {
      console.error('Transaction not found for session:', session_id);
      return res.status(404).json({
        error: 'Order not found',
        message: 'Transaction not found. Please contact support.',
        sessionId: session_id
      });
    }

    const transaction = processDatabaseResult(txResult.rows[0]);

    // Update transaction status to completed
    await db.execute({
      sql: `UPDATE transactions
            SET payment_status = ?, status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: ['completed', 'completed', transaction.id]
    });

    // Update all tickets for this transaction to completed status
    await db.execute({
      sql: `UPDATE tickets
            SET registration_status = ?, registered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE transaction_id = ? AND registration_status = ?`,
      args: ['completed', transaction.id, 'pending_payment']
    });

    console.log(`Updated transaction ${transaction.uuid} to completed status`);

    // Get updated ticket count
    const ticketResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE transaction_id = ?',
      args: [transaction.id]
    });
    const hasTickets = Number(ticketResult.rows[0].count) > 0;

    // Check if transaction has donations
    const donationResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM transaction_items WHERE transaction_id = ? AND item_type = ?',
      args: [transaction.id, 'donation']
    });
    const hasDonations = Number(donationResult.rows[0].count) > 0;

    // Send attendee confirmation emails for completed tickets
    if (hasTickets) {
      try {
        const emailService = getTicketEmailService();
        const updatedTransaction = await transactionService.getByUUID(transaction.uuid);
        await emailService.sendTicketConfirmation(updatedTransaction);
        console.log(`Sent confirmation emails for transaction ${transaction.uuid}`);
      } catch (emailError) {
        // Log but don't fail - emails can be resent
        console.error('Failed to send confirmation emails:', emailError);
      }
    }

    // Return success response with order details
    const response = {
      success: true,
      orderNumber: transaction.order_number,
      session: {
        id: fullSession.id,
        amount: fullSession.amount_total / 100,
        currency: fullSession.currency,
        customer_email: fullSession.customer_email || fullSession.customer_details?.email,
        customer_details: fullSession.customer_details,
        metadata: fullSession.metadata
      },
      hasTickets,
      hasDonations,
      transaction: timeUtils.enhanceApiResponse(processDatabaseResult({
        orderNumber: transaction.order_number,
        status: 'completed',
        paymentStatus: 'completed',
        totalAmount: transaction.total_amount,
        customerEmail: transaction.customer_email,
        customerName: transaction.customer_name,
        created_at: transaction.created_at,
        updated_at: new Date().toISOString()
      }), ['created_at', 'updated_at']),
      timezone: 'America/Denver',
      currentTime: timeUtils.getCurrentTime()
    };

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
