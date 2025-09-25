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
import { generateOrderId } from '../../lib/order-id-generator.js';
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
      transactionDbId: Number(transaction.id), // Convert BigInt to number for logging
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
      // Create new transaction and tickets using Turso batch operations
      const db = await getDatabaseClient();
      // Don't redeclare transaction - use the outer scope variable
      let tickets = [];
      let registrationDeadline = null;
      let isTestTransaction = false;

      try {
        console.log('Preparing atomic database operations for new purchase...');

        // First, prepare all transaction creation operations
        console.log('Preparing transaction record from Stripe session...');

        // Generate transaction data
        const baseUuid = transactionService.generateTransactionUUID();
        const uuid = baseUuid; // Use base UUID directly

        // Determine transaction type from session data
        const transactionType = transactionService.determineTransactionType(fullSession);

        // Check if this is a test transaction
        isTestTransaction = fullSession.metadata?.testMode === 'true' ||
                           fullSession.metadata?.testTransaction === 'true' ||
                           fullSession.id?.includes('test');

        // Safely prepare order data
        let orderData;
        try {
          const baseOrderData = {
            line_items: fullSession.line_items?.data || [],
            metadata: fullSession.metadata || {},
            mode: fullSession.mode,
            payment_status: fullSession.payment_status,
          };
          orderData = JSON.stringify(baseOrderData);
        } catch (e) {
          console.warn("Failed to stringify order data, using minimal data");
          orderData = JSON.stringify({
            error: "Could not serialize order data",
            test_mode: isTestTransaction
          });
        }

        // Safely prepare billing address
        let billingAddress;
        try {
          billingAddress = JSON.stringify(
            fullSession.customer_details?.address || {},
          );
        } catch (e) {
          billingAddress = "{}";
        }

        // Null-safe amount access (Stripe amounts are in cents)
        const amountCents = fullSession.amount_total ?? 0;
        const currency = (fullSession.currency || "usd").toUpperCase();

        // Parse customer name for ticket defaults
        const { firstName, lastName } = parseCustomerName(
          fullSession.customer_details?.name || 'Guest'
        );

        // Calculate registration deadline (72 hours from now)
        const now = new Date();
        registrationDeadline = new Date(now.getTime() + (72 * 60 * 60 * 1000));

        // Generate order number (ALCBF-YYYY-XXXXX or TEST-YYYY-XXXXX)
        const orderNumber = await generateOrderId(isTestTransaction);
        console.log(`Generated order number: ${orderNumber} for transaction ${uuid}`);

        // Prepare batch operations array
        const batchOperations = [];

        // 1. Insert transaction record with order number
        batchOperations.push({
          sql: `INSERT INTO transactions (
            transaction_id, uuid, type, order_data, amount_cents, currency,
            stripe_session_id, stripe_payment_intent_id, payment_method_type,
            customer_email, customer_name, billing_address,
            status, completed_at, is_test, order_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            uuid, // Use UUID as transaction_id for backward compatibility
            uuid,
            transactionType,
            orderData,
            amountCents, // Keep in cents as stored in DB
            currency,
            fullSession.id,
            fullSession.payment_intent || null,
            fullSession.payment_method_types?.[0] || "card",
            fullSession.customer_details?.email || fullSession.customer_email || null,
            fullSession.customer_details?.name || null,
            billingAddress,
            "completed",
            now.toISOString(),
            isTestTransaction ? 1 : 0, // Add test mode flag
            orderNumber, // Add order number
          ]
        });

        // 2. Prepare ticket creation operations
        const lineItems = fullSession.line_items?.data || [];
        const ticketOperations = [];
        const ticketMetadata = [];

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

            // Add ticket creation operation
            ticketOperations.push({
              sql: `INSERT INTO tickets (
                ticket_id, transaction_id, ticket_type, event_id,
                event_date, price_cents,
                attendee_first_name, attendee_last_name,
                registration_status, registration_deadline,
                status, created_at, is_test
              ) VALUES (?, (SELECT id FROM transactions WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                ticketId,
                uuid, // Reference the transaction UUID
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

            ticketMetadata.push({
              id: ticketId,
              type: ticketType,
              ticket_id: ticketId
            });
          }
        }

        // 3. Add transaction items operations
        for (const item of lineItems) {
          const itemType = transactionService.determineItemType(item);
          const quantity = item.quantity || 1;

          // Stripe amounts are in cents - keep them as cents in DB
          const unitPriceCents = item.price?.unit_amount || item.amount_total || 0;
          const totalPriceCents = item.amount_total || 0;

          // Safely stringify metadata
          let metadata;
          try {
            const baseMetadata = item.price?.product?.metadata || {};
            metadata = JSON.stringify(baseMetadata);
          } catch (e) {
            metadata = JSON.stringify({ test_mode: isTestTransaction });
          }

          batchOperations.push({
            sql: `INSERT INTO transaction_items (
              transaction_id, item_type, item_name, item_description,
              quantity, unit_price_cents, total_price_cents,
              ticket_type, event_id, product_metadata, is_test
            ) VALUES ((SELECT id FROM transactions WHERE uuid = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              uuid, // Reference the transaction UUID
              itemType,
              item.description || "Unknown Item",
              item.price?.product?.description || null,
              quantity,
              unitPriceCents, // Keep in cents
              totalPriceCents, // Keep in cents
              transactionService.extractTicketType(item), // ticket_type
              fullSession.metadata?.event_id || "boulder-fest-2026", // event_id
              metadata, // product_metadata
              isTestTransaction ? 1 : 0, // Add test mode flag
            ]
          });
        }

        // Add ticket operations to batch
        batchOperations.push(...ticketOperations);

        console.log(`Executing ${batchOperations.length} atomic database operations...`);

        // Execute all operations atomically using Turso batch
        const results = await db.batch(batchOperations);

        console.log(`Batch operations completed successfully. Transaction UUID: ${uuid}`);

        // Retrieve the created transaction with proper field mapping
        const transactionResult = await db.execute({
          sql: `SELECT
            id, transaction_id, uuid, type, order_data, amount_cents,
            currency, stripe_session_id, stripe_payment_intent_id,
            paypal_order_id, paypal_capture_id, payment_method_type,
            customer_email, customer_name, billing_address,
            status, completed_at, created_at, updated_at,
            registration_token, is_test, order_number
            FROM transactions WHERE uuid = ?`,
          args: [uuid]
        });

        if (!transactionResult.rows[0]) {
          throw new Error(`Failed to retrieve created transaction with UUID: ${uuid}`);
        }

        const row = transactionResult.rows[0];
        // Map array to object with named properties
        transaction = {
          id: row[0],
          transaction_id: row[1],
          uuid: row[2],
          type: row[3],
          order_data: row[4],
          amount_cents: row[5],
          total_amount: row[5],  // Add alias for email service compatibility
          currency: row[6],
          stripe_session_id: row[7],
          stripe_payment_intent_id: row[8],
          paypal_order_id: row[9],
          paypal_capture_id: row[10],
          payment_method_type: row[11],
          customer_email: row[12],
          customer_name: row[13],
          billing_address: row[14],
          status: row[15],
          completed_at: row[16],
          created_at: row[17],
          updated_at: row[18],
          registration_token: row[19],
          is_test: row[20],
          order_number: row[21]
        };

        // Set tickets metadata for response
        tickets = ticketMetadata;

        console.log(`${isTestTransaction ? 'TEST ' : ''}Transaction complete: ${tickets.length} tickets created with pending status`);
        console.log(`Registration deadline: ${registrationDeadline.toISOString()}`);

        hasTickets = true;

        // Generate registration token (post-batch) with detailed logging
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
        console.error('Batch operation failed:', {
          error: error.message,
          stack: error.stack
        });

        // Log the complete error context
        console.error('Complete batch operation failure:', {
          originalError: error.message,
          stack: error.stack,
          sessionId: session_id,
          transactionCreated: !!transaction,
          ticketsCreated: tickets.length
        });

        // Re-throw with context
        throw error;
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
