/**
 * Centralized Ticket Creation Service
 * Handles ticket creation with idempotency for both webhook and checkout-success
 */

import { getDatabaseClient } from "./database.js";
import { generateTicketId } from "./ticket-id-generator.js";
import { generateOrderId } from "./order-id-generator.js";
import transactionService from "./transaction-service.js";
import { RegistrationTokenService } from "./registration-token-service.js";
import { scheduleRegistrationReminders } from "./reminder-scheduler.js";
import { getTicketEmailService } from "./ticket-email-service-brevo.js";

/**
 * Parse Stripe's single name field into first and last name
 */
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

/**
 * Create or retrieve transaction and tickets for a Stripe session
 * This is idempotent - can be called multiple times safely
 */
export async function createOrRetrieveTickets(fullSession) {
  const db = await getDatabaseClient();

  try {
    // Check if transaction already exists
    let existingTransaction = await transactionService.getByStripeSessionId(fullSession.id);

    if (existingTransaction) {
      console.log(`Transaction already exists for session ${fullSession.id}`);

      // Check if tickets exist for this transaction (single query for both check and data)
      const ticketsResult = await db.execute({
        sql: `SELECT ticket_id, ticket_type FROM tickets WHERE transaction_id = ?`,
        args: [existingTransaction.id]
      });

      const ticketCount = ticketsResult.rows ? ticketsResult.rows.length : 0;

      if (ticketCount > 0) {
        console.log(`${ticketCount} tickets already exist for transaction ${existingTransaction.uuid}`);

        return {
          transaction: existingTransaction,
          ticketCount: ticketCount,
          created: false
        };
      }

      // Transaction exists but no tickets - create tickets
      console.log(`Transaction exists but no tickets found - creating tickets...`);
      const ticketResult = await createTicketsForTransaction(fullSession, existingTransaction);
      return {
        transaction: existingTransaction,
        ticketCount: ticketResult.ticketCount,
        created: true
      };
    }

    // No transaction exists - create both transaction and tickets
    console.log(`Creating new transaction and tickets for session ${fullSession.id}`);

    // Create transaction
    const transaction = await transactionService.createFromStripeSession(fullSession);
    console.log(`Created transaction: ${transaction.uuid}`);

    // Create tickets
    const ticketResult = await createTicketsForTransaction(fullSession, transaction);

    return {
      transaction,
      ticketCount: ticketResult.ticketCount,
      created: true
    };

  } catch (error) {
    console.error('Failed to create or retrieve tickets:', error);
    throw error;
  }
}

/**
 * Create tickets for an existing transaction
 * Internal function - checks for existing tickets first
 */
async function createTicketsForTransaction(fullSession, transaction) {
  const db = await getDatabaseClient();

  // Double-check tickets don't already exist (race condition protection)
  const existingTickets = await db.execute({
    sql: `SELECT ticket_id, ticket_type FROM tickets WHERE transaction_id = ?`,
    args: [transaction.id]
  });

  if (existingTickets.rows && existingTickets.rows.length > 0) {
    console.log(`Tickets already exist for transaction ${transaction.uuid} (race condition avoided)`);
    return {
      ticketCount: existingTickets.rows.length,
      created: false
    };
  }

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

  // Prepare batch operations for atomic ticket creation
  const batchOperations = [];
  const tickets = [];
  const lineItems = fullSession.line_items?.data || [];
  const ticketsToSchedule = [];

  for (const item of lineItems) {
    const quantity = item.quantity || 1;

    // Extract ticket type from Stripe metadata - NO SILENT DEFAULTS
    const product = item.price?.product;
    const meta = product?.metadata || {};

    // Try multiple sources for ticket type, but FAIL if none found
    const ticketType =
      meta.ticket_type ||                    // Primary source: product metadata
      item.price?.lookup_key ||              // Fallback: configured price lookup key
      item.price?.nickname;                  // Legacy: price nickname

    if (!ticketType) {
      console.error('CRITICAL: No ticket type found for line item:', {
        item_id: item.id,
        price_id: item.price?.id,
        product_id: product?.id,
        metadata: meta,
        description: item.description
      });
      throw new Error(`Ticket type missing from Stripe data for item: ${item.description || 'Unknown'}`);
    }

    const priceInCents = item.amount_total || 0;

    // No defaults - require explicit values
    const eventId = meta.event_id || process.env.DEFAULT_EVENT_ID;
    if (!eventId) {
      console.error('CRITICAL: No event ID found for line item:', {
        item_id: item.id,
        product_id: product?.id,
        metadata: meta,
        description: item.description
      });
      throw new Error(`Event ID missing from Stripe data for item: ${item.description || 'Unknown'}`);
    }

    const eventDate = meta.event_date || process.env.DEFAULT_EVENT_DATE;
    if (!eventDate) {
      console.error('CRITICAL: No event date found for line item:', {
        item_id: item.id,
        product_id: product?.id,
        metadata: meta,
        description: item.description
      });
      throw new Error(`Event date missing from Stripe data for item: ${item.description || 'Unknown'}`);
    }

    // Calculate cent-accurate price distribution
    const perTicketBase = Math.floor(priceInCents / quantity);
    const remainder = priceInCents % quantity;

    for (let i = 0; i < quantity; i++) {
      // Distribute remainder cents across first tickets
      const priceForThisTicket = perTicketBase + (i < remainder ? 1 : 0);
      const ticketId = await generateTicketId();

      // Add ticket creation operation to batch
      batchOperations.push({
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
          ticketType,  // No TEST- prefix - already handled by admin dashboard
          eventId,
          eventDate,
          priceForThisTicket,
          isTestTransaction ? `TEST-${firstName}` : firstName,
          isTestTransaction ? `TEST-${lastName}` : lastName,
          'pending', // All tickets start pending
          registrationDeadline.toISOString(),
          'valid',
          now.toISOString(),
          isTestTransaction ? 1 : 0
        ]
      });

      ticketsToSchedule.push({ ticketId, registrationDeadline });

      tickets.push({
        id: ticketId,
        type: ticketType,
        ticket_id: ticketId
      });
    }
  }

  // Execute all ticket creation operations atomically
  console.log(`Executing ${batchOperations.length} atomic ticket creation operations...`);
  await db.batch(batchOperations);
  console.log(`Batch operations completed successfully for transaction ${transaction.uuid}`);

  // Post-creation side effects (best-effort, non-blocking)
  try {
    // Generate registration token if missing
    if (!transaction.registration_token) {
      const tokenService = new RegistrationTokenService();
      await tokenService.ensureInitialized();
      const token = await tokenService.createToken(transaction.id);
      transaction.registration_token = token;
      console.log(`Generated registration token for transaction ${transaction.uuid}`);
    }

    // Send ticket confirmation email
    const ticketEmailService = getTicketEmailService();
    await ticketEmailService.sendTicketConfirmation(transaction);
    console.log(`Sent ticket confirmation email for transaction ${transaction.uuid}`);

    // Schedule reminders for each ticket
    for (const { ticketId, registrationDeadline } of ticketsToSchedule) {
      await scheduleRegistrationReminders(ticketId, registrationDeadline);
    }

  } catch (sideEffectError) {
    console.error('Non-critical side effect failed:', sideEffectError);
    // Continue - tickets are created successfully
  }

  console.log(`${isTestTransaction ? 'TEST ' : ''}${tickets.length} tickets created for transaction ${transaction.uuid}`);

  return {
    transaction,
    ticketCount: tickets.length,
    registrationDeadline,
    isTestTransaction,
    created: true
  };
}

export default {
  createOrRetrieveTickets
};