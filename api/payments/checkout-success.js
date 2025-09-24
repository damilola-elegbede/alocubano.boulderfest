import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { warmDatabaseInBackground } from '../../lib/database-warmer.js';

/**
 * Checkout Success API Endpoint
 * Handles successful Stripe Checkout returns and creates tickets immediately
 * Option 2 Implementation: Move ticket creation from webhook to checkout success
 */

import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { getDatabaseClient } from '../../lib/database.js';
import { RegistrationTokenService } from '../../lib/registration-token-service.js';
import { getTicketEmailService } from '../../lib/ticket-email-service-brevo.js';
import { generateTicketId } from '../../lib/ticket-id-generator.js';
import transactionService from '../../lib/transaction-service.js';

// Initialize Stripe with strict error handling
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('❌ FATAL: STRIPE_SECRET_KEY secret not configured');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Helper to parse Stripe's single name field into first and last name
function parseCustomerName(stripeCustomerName) {
  if (!stripeCustomerName) {
    return { firstName: 'Guest', lastName: 'Attendee' };
  }

  const parts = stripeCustomerName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  } else if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  } else {
    // Multiple parts - everything except last is first name
    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(' ');
    return { firstName, lastName };
  }
}

// Helper to create tickets for a transaction (copied from stripe-webhook.js)
async function createTicketsForTransaction(fullSession, transaction) {
  const db = await getDatabaseClient();

  // Check if this is a test transaction
  const isTestTransaction = fullSession.metadata?.testMode === 'true' ||
                           fullSession.metadata?.testTransaction === 'true' ||
                           fullSession.id?.includes('test');

  // Parse customer name for default values
  const { firstName, lastName } = parseCustomerName(
    fullSession.customer_details?.name || 'Guest'
  );

  // Calculate registration deadline (72 hours from now)
  const now = new Date();
  const registrationDeadline = new Date(now.getTime() + (72 * 60 * 60 * 1000));

  // Create tickets with pending registration status
  const tickets = [];
  const lineItems = fullSession.line_items?.data || [];

  for (const item of lineItems) {
    const quantity = item.quantity || 1;
    const ticketType = item.price?.lookup_key || item.price?.nickname || 'general';
    const priceInCents = item.amount_total || 0;

    // Extract event metadata from product or use defaults
    const product = item.price?.product;
    const meta = product?.metadata || {};
    const eventId = meta.event_id || process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
    const eventDate = meta.event_date || process.env.DEFAULT_EVENT_DATE || '2026-05-15';

    // Calculate cent-accurate price distribution
    const perTicketBase = Math.floor(priceInCents / quantity);
    const remainder = priceInCents % quantity;

    for (let i = 0; i < quantity; i++) {
      // Distribute remainder cents across first tickets
      const priceForThisTicket = perTicketBase + (i < remainder ? 1 : 0);
      const ticketId = await generateTicketId();

      // Create ticket with pending registration
      await db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id,
          event_date, price_cents,
          attendee_first_name, attendee_last_name,
          registration_status, registration_deadline,
          status, created_at, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ticketId,
          transaction.id,
          isTestTransaction ? `TEST-${ticketType}` : ticketType,
          eventId,
          eventDate,
          priceForThisTicket, // Preserves total cents across all tickets
          isTestTransaction ? `TEST-${firstName}` : firstName, // Mark test first name
          isTestTransaction ? `TEST-${lastName}` : lastName,  // Mark test last name
          'pending', // All tickets start pending
          registrationDeadline.toISOString(),
          'valid',
          now.toISOString(),
          isTestTransaction ? 1 : 0 // Mark as test ticket
        ]
      });

      tickets.push({
        id: ticketId,
        type: ticketType,
        ticket_id: ticketId
      });
    }
  }

  return { tickets, registrationDeadline, isTestTransaction };
}

// Helper to send registration email asynchronously (non-blocking)
async function sendRegistrationEmailAsync(fullSession, transaction, tickets, registrationToken, registrationDeadline) {
  try {
    const ticketEmailService = getTicketEmailService();

    // Ensure transaction has customer email for the email service
    if (!transaction.customer_email) {
      transaction.customer_email = fullSession.customer_details?.email || fullSession.customer_email;
    }

    console.log('Attempting to send ticket confirmation email:', {
      transactionId: transaction.uuid,
      transactionDbId: transaction.id,
      email: transaction.customer_email,
      ticketCount: tickets.length,
      hasEmail: !!transaction.customer_email,
      templateId: 10
    });

    // Send ticket confirmation email instead of registration invitation
    // Using the existing template that works (ID: 10)
    await ticketEmailService.sendTicketConfirmation(transaction, tickets);

    console.log(`✅ Ticket confirmation email sent successfully to ${transaction.customer_email}`);
  } catch (error) {
    console.error('Failed to send ticket confirmation email:', {
      error: error.message,
      stack: error.stack,
      transactionId: transaction.uuid,
      email: transaction.customer_email
    });
    // Don't throw - this is async and shouldn't block the response
  }
}

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

    if (existingTransaction) {
      console.log(`Transaction already exists for session ${session_id}`);
      hasTickets = true;

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
      // Create new transaction and tickets
      const db = await getDatabaseClient();
      let transactionStarted = false;
      let committed = false;
      let transaction = null;
      let tickets = [];
      let registrationDeadline = null;
      let isTestTransaction = false;

      try {
        console.log('Starting database transaction for new purchase...');

        // Start transaction with proper error handling
        try {
          await db.execute('BEGIN IMMEDIATE');
          transactionStarted = true;
          console.log('Database transaction started successfully');
        } catch (beginError) {
          console.error('Failed to start database transaction:', beginError);
          throw new Error(`Transaction start failed: ${beginError.message}`);
        }

        // Create transaction record with detailed logging
        console.log('Creating transaction record from Stripe session...');
        try {
          // Pass inTransaction=true since we're already in a database transaction
          transaction = await transactionService.createFromStripeSession(fullSession, null, true);
          console.log(`Transaction record created: ${transaction.uuid}`);
        } catch (transError) {
          console.error('Failed to create transaction record:', transError);
          throw new Error(`Transaction creation failed: ${transError.message}`);
        }

        // Create tickets with detailed logging
        console.log(`Creating tickets for transaction ${transaction.uuid}...`);
        try {
          const ticketResult = await createTicketsForTransaction(fullSession, transaction);
          tickets = ticketResult.tickets;
          registrationDeadline = ticketResult.registrationDeadline;
          isTestTransaction = ticketResult.isTestTransaction;
          console.log(`Created ${tickets.length} tickets successfully`);
        } catch (ticketError) {
          console.error('Failed to create tickets:', ticketError);
          throw new Error(`Ticket creation failed: ${ticketError.message}`);
        }

        // Commit the database transaction with proper state checking
        if (transactionStarted && !committed) {
          console.log('Committing database transaction...');
          try {
            await db.execute('COMMIT');
            committed = true;
            console.log('Database transaction committed successfully');
          } catch (commitError) {
            console.error('Failed to commit transaction:', commitError);
            throw new Error(`Transaction commit failed: ${commitError.message}`);
          }
        }

        console.log(`${isTestTransaction ? 'TEST ' : ''}Transaction complete: ${tickets.length} tickets created with pending status`);
        console.log(`Registration deadline: ${registrationDeadline.toISOString()}`);

        hasTickets = true;

        // Generate registration token (post-commit) with detailed logging
        console.log('Generating registration token...');
        try {
          const tokenService = new RegistrationTokenService();
          await tokenService.ensureInitialized();
          registrationToken = await tokenService.createToken(transaction.id);
          console.log(`Registration token generated: ${registrationToken}`);
        } catch (tokenError) {
          console.error('Failed to generate registration token:', {
            error: tokenError.message,
            stack: tokenError.stack,
            transactionId: transaction.id
          });
          // Continue without token - user can still access tickets via other means
        }

        // Send registration email asynchronously with detailed logging
        console.log('Initiating async email send...');
        sendRegistrationEmailAsync(fullSession, transaction, tickets, registrationToken, registrationDeadline)
          .then(() => {
            console.log('Async email send initiated successfully');
          })
          .catch(emailError => {
            console.error('Async email send failed:', {
              error: emailError.message,
              stack: emailError.stack
            });
          });

        existingTransaction = transaction;
      } catch (error) {
        console.error('Transaction failed, attempting rollback...', {
          error: error.message,
          transactionStarted,
          committed
        });

        // Only attempt rollback if transaction was started and not committed
        if (transactionStarted && !committed) {
          try {
            await db.execute('ROLLBACK');
            console.log('Database transaction rolled back successfully');
          } catch (rollbackError) {
            console.error('Rollback failed (transaction may have auto-rolled back):', rollbackError.message);
            // Don't throw here - the original error is more important
          }
        }

        // Log the complete error context
        console.error('Complete transaction failure:', {
          originalError: error.message,
          stack: error.stack,
          sessionId: session_id,
          transactionStarted,
          committed,
          transactionCreated: !!transaction,
          ticketsCreated: tickets.length
        });

        // Re-throw with context
        throw error;
      }
    }

    // Return success response with registration information
    const response = {
      success: true,
      session: {
        id: fullSession.id,
        amount: fullSession.amount_total / 100,
        currency: fullSession.currency,
        customer_email: fullSession.customer_email || fullSession.customer_details?.email,
        customer_details: fullSession.customer_details, // Include full customer details for form
        metadata: fullSession.metadata
      },
      hasTickets
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
