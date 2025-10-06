/**
 * Manual Ticket Creation Service
 * Handles creation of tickets for at-door purchases (cash, card terminal, venmo, etc.)
 * Similar to ticket-creation-service.js but doesn't require Stripe session
 */

import { getDatabaseClient } from "./database.js";
import { generateTicketId } from "./ticket-id-generator.js";
import { generateOrderNumber } from "./order-number-generator.js";
import { RegistrationTokenService } from "./registration-token-service.js";
import { scheduleRegistrationReminders } from "./reminder-scheduler.js";
import { getTicketEmailService } from "./ticket-email-service-brevo.js";

/**
 * Parse customer name into first and last name
 * @param {string} fullName - Full name like "John Doe"
 * @returns {{firstName: string, lastName: string}}
 */
function parseCustomerName(fullName) {
  if (!fullName || !fullName.trim()) {
    return { firstName: 'Guest', lastName: 'Attendee' };
  }

  const parts = fullName.trim().split(/\s+/);

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
 * Create tickets manually for at-door purchases
 *
 * @param {Object} params - Manual ticket creation parameters
 * @param {string} params.manualEntryId - Client-generated UUID for idempotency
 * @param {Array} params.ticketItems - Array of {ticketTypeId, quantity}
 * @param {string} params.paymentMethod - 'cash', 'card_terminal', 'venmo', 'comp'
 * @param {string} params.customerEmail - Customer email (required)
 * @param {string} params.customerName - Customer full name (required)
 * @param {string} params.customerPhone - Customer phone (optional)
 * @param {number} params.cashShiftId - Active cash shift ID (if payment is cash)
 * @param {boolean} params.isTest - Test mode flag
 * @returns {Promise<{transaction: Object, tickets: Array, ticketCount: number}>}
 */
export async function createManualTickets(params) {
  const {
    manualEntryId,
    ticketItems,
    paymentMethod,
    customerEmail,
    customerName,
    customerPhone = null,
    cashShiftId = null,
    isTest = false
  } = params;

  const db = await getDatabaseClient();

  try {
    // ========================================================================
    // STEP 1: Idempotency Check
    // ========================================================================
    const existingTransaction = await db.execute({
      sql: `SELECT * FROM transactions WHERE manual_entry_id = ?`,
      args: [manualEntryId]
    });

    if (existingTransaction.rows && existingTransaction.rows.length > 0) {
      console.log(`Manual entry already exists: ${manualEntryId}`);

      // Get existing tickets
      const existingTickets = await db.execute({
        sql: `SELECT * FROM tickets WHERE transaction_id = ?`,
        args: [existingTransaction.rows[0].id]
      });

      return {
        transaction: existingTransaction.rows[0],
        tickets: existingTickets.rows || [],
        ticketCount: existingTickets.rows ? existingTickets.rows.length : 0,
        created: false
      };
    }

    // ========================================================================
    // STEP 2: Validate Ticket Types & Calculate Total
    // ========================================================================
    let totalPriceCents = 0;
    const validatedItems = [];

    for (const item of ticketItems) {
      const { ticketTypeId, quantity } = item;

      if (!ticketTypeId || quantity < 1) {
        throw new Error(`Invalid ticket item: ${JSON.stringify(item)}`);
      }

      // Get ticket type from database
      const ticketTypeResult = await db.execute({
        sql: `SELECT tt.*, e.status as event_status, e.name as event_name, e.id as event_id
              FROM ticket_types tt
              LEFT JOIN events e ON tt.event_id = e.id
              WHERE tt.id = ?`,
        args: [ticketTypeId]
      });

      if (!ticketTypeResult.rows || ticketTypeResult.rows.length === 0) {
        throw new Error(`Ticket type not found: ${ticketTypeId}`);
      }

      const ticketType = ticketTypeResult.rows[0];

      // Validate ticket type status
      if (ticketType.status !== 'available' && ticketType.status !== 'test') {
        throw new Error(`Ticket type '${ticketType.name}' is not available (status: ${ticketType.status})`);
      }

      // Validate event status
      if (!['active', 'test'].includes(ticketType.event_status)) {
        throw new Error(`Event '${ticketType.event_name}' is not active (status: ${ticketType.event_status})`);
      }

      // Check availability
      if (ticketType.max_quantity && ticketType.max_quantity > 0) {
        const availableQuantity = ticketType.max_quantity - (ticketType.sold_count || 0);
        if (quantity > availableQuantity) {
          throw new Error(`Insufficient tickets: requested ${quantity}, only ${availableQuantity} available for ${ticketType.name}`);
        }
      }

      // Calculate price
      const itemPrice = ticketType.price_cents * quantity;
      totalPriceCents += itemPrice;

      validatedItems.push({
        ticketType: ticketType,
        ticketTypeId: ticketTypeId,
        quantity: quantity,
        unitPriceCents: ticketType.price_cents,
        totalPriceCents: itemPrice
      });
    }

    // Comp tickets can have 0 price
    if (paymentMethod !== 'comp' && totalPriceCents === 0) {
      throw new Error('Transaction total cannot be $0 unless payment method is "comp"');
    }

    // ========================================================================
    // STEP 3: Generate IDs
    // ========================================================================
    const transactionUuid = generateTransactionUUID();
    const orderNumber = await generateOrderNumber();
    const now = new Date();

    console.log(`Creating manual transaction: ${transactionUuid}, Order: ${orderNumber}`);

    // ========================================================================
    // STEP 4: Parse Customer Name
    // ========================================================================
    const { firstName, lastName } = parseCustomerName(customerName);

    // ========================================================================
    // STEP 5: Prepare Order Data
    // ========================================================================
    const orderData = {
      manualEntry: true,
      paymentMethod: paymentMethod,
      items: validatedItems.map(item => ({
        ticketType: item.ticketTypeId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalPriceCents: item.totalPriceCents
      })),
      totalPriceCents: totalPriceCents,
      isTest: isTest
    };

    // ========================================================================
    // STEP 6: Create Transaction + Tickets in Batch
    // ========================================================================
    const batchOperations = [];

    // Insert transaction
    batchOperations.push({
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, order_data, amount_cents, total_amount, currency,
        customer_email, customer_name,
        payment_processor, payment_method_type,
        source, status, completed_at, is_test,
        order_number, manual_entry_id, cash_shift_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      args: [
        transactionUuid,
        transactionUuid,
        'tickets',
        JSON.stringify(orderData),
        totalPriceCents,
        totalPriceCents,
        'USD',
        customerEmail,
        customerName,
        paymentMethod, // payment_processor
        paymentMethod, // payment_method_type (same for manual)
        'manual_entry',
        'completed',
        now.toISOString(),
        isTest ? 1 : 0,
        orderNumber,
        manualEntryId,
        cashShiftId
      ]
    });

    // ========================================================================
    // STEP 7: Create Tickets
    // ========================================================================
    const tickets = [];

    for (const item of validatedItems) {
      const { ticketType, quantity, unitPriceCents, totalPriceCents } = item;

      // Calculate registration deadline: 7 days after purchase
      const registrationDeadline = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

      // Calculate per-ticket price (distribute cents evenly)
      const perTicketBase = Math.floor(totalPriceCents / quantity);
      const remainder = totalPriceCents % quantity;

      for (let i = 0; i < quantity; i++) {
        const ticketId = await generateTicketId();
        const priceForThisTicket = perTicketBase + (i < remainder ? 1 : 0);

        // Create ticket
        batchOperations.push({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
            event_date, event_time, price_cents,
            attendee_first_name, attendee_last_name, attendee_phone,
            registration_status, registration_deadline,
            status, created_at, is_test
          ) VALUES (
            ?, (SELECT id FROM transactions WHERE uuid = ?), ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, CURRENT_TIMESTAMP, ?
          )`,
          args: [
            ticketId,
            transactionUuid,
            ticketType.id,
            ticketType.id,
            ticketType.event_id,
            ticketType.event_date,
            ticketType.event_time || '00:00',
            priceForThisTicket,
            isTest ? `TEST-${firstName}` : firstName,
            isTest ? `TEST-${lastName}` : lastName,
            customerPhone,
            'pending', // Registration status
            registrationDeadline.toISOString(),
            'valid', // Ticket status
            isTest ? 1 : 0
          ]
        });

        tickets.push({
          id: ticketId,
          type: ticketType.id,
          ticket_id: ticketId
        });
      }
    }

    // ========================================================================
    // STEP 8: Execute Batch Operations
    // ========================================================================
    console.log(`Executing ${batchOperations.length} batch operations...`);
    await db.batch(batchOperations);
    console.log(`Batch operations completed for transaction ${transactionUuid}`);

    // ========================================================================
    // STEP 9: Get Created Transaction
    // ========================================================================
    const transactionResult = await db.execute({
      sql: `SELECT * FROM transactions WHERE uuid = ?`,
      args: [transactionUuid]
    });

    if (!transactionResult.rows || transactionResult.rows.length === 0) {
      throw new Error('Failed to retrieve created transaction');
    }

    const transaction = transactionResult.rows[0];

    // ========================================================================
    // STEP 10: Post-Creation Side Effects (Non-Blocking)
    // ========================================================================
    try {
      // Generate registration token
      const tokenService = new RegistrationTokenService();
      await tokenService.ensureInitialized();
      const registrationToken = await tokenService.createToken(transaction.id);
      console.log(`Generated registration token for transaction ${transactionUuid}`);

      // Send ticket confirmation email
      const ticketEmailService = getTicketEmailService();
      await ticketEmailService.sendTicketConfirmation(transaction);
      console.log(`Sent ticket confirmation email for transaction ${transactionUuid}`);

      // Schedule registration reminders
      const registrationDeadline = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
      const reminderCount = await scheduleRegistrationReminders(
        transaction.id,
        registrationDeadline,
        isTest
      );
      console.log(`Scheduled ${reminderCount} reminders for transaction ${transaction.id}`);

    } catch (sideEffectError) {
      console.error('Non-critical side effect failed:', sideEffectError);
      // Continue - tickets are created successfully
    }

    // ========================================================================
    // STEP 11: Update Cash Shift (if applicable)
    // ========================================================================
    if (cashShiftId && paymentMethod === 'cash') {
      try {
        await db.execute({
          sql: `UPDATE cash_shifts
                SET cash_sales_count = cash_sales_count + ?,
                    cash_sales_total_cents = cash_sales_total_cents + ?,
                    expected_cash_cents = opening_cash_cents + cash_sales_total_cents + ?
                WHERE id = ? AND status = 'open'`,
          args: [tickets.length, totalPriceCents, totalPriceCents, cashShiftId]
        });
        console.log(`Updated cash shift ${cashShiftId} with ${tickets.length} tickets, $${(totalPriceCents / 100).toFixed(2)}`);
      } catch (shiftError) {
        console.error('Failed to update cash shift (non-critical):', shiftError);
      }
    }

    console.log(`${isTest ? 'TEST ' : ''}${tickets.length} manual tickets created for transaction ${transactionUuid}`);

    return {
      transaction,
      tickets,
      ticketCount: tickets.length,
      created: true
    };

  } catch (error) {
    console.error('Failed to create manual tickets:', error);
    throw error;
  }
}

/**
 * Generate a unique transaction UUID
 * @returns {string} Transaction UUID
 */
function generateTransactionUUID() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `MANUAL-TXN-${timestamp}-${random}`;
}

export default {
  createManualTickets
};
