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

  // Validate required parameters
  const allowedMethods = new Set(['cash', 'card_terminal', 'venmo', 'comp']);

  if (!manualEntryId || typeof manualEntryId !== 'string') {
    throw new Error('manualEntryId is required and must be a string');
  }

  if (!Array.isArray(ticketItems) || ticketItems.length === 0) {
    throw new Error('ticketItems must be a non-empty array');
  }

  if (!allowedMethods.has(paymentMethod)) {
    throw new Error(`Invalid paymentMethod: ${paymentMethod}. Allowed: ${Array.from(allowedMethods).join(', ')}`);
  }

  if (!customerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
    throw new Error('A valid customerEmail is required');
  }

  if (!customerName || !customerName.trim()) {
    throw new Error('customerName is required');
  }

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

      // Check availability with atomic read
      // NOTE: This initial check is optimistic - the actual availability will be
      // verified atomically during the transaction using UPDATE with WHERE clause
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
    // STEP 6: Update sold_count Atomically (Prevents Race Conditions)
    // ========================================================================
    // CRITICAL: Update sold_count BEFORE creating tickets to ensure atomicity
    // This prevents overselling when multiple concurrent requests occur
    // If the sold_count has changed since we read it, the UPDATE will affect 0 rows
    const soldCountUpdates = [];

    for (const item of validatedItems) {
      const { ticketType, quantity } = item;

      // Only update if there's a max_quantity limit (otherwise unlimited)
      if (ticketType.max_quantity && ticketType.max_quantity > 0) {
        // Migration 043: Update appropriate counter based on is_test flag
        const columnToUpdate = isTest ? 'test_sold_count' : 'sold_count';
        const expectedSoldCount = isTest
          ? (ticketType.test_sold_count || 0)
          : (ticketType.sold_count || 0);
        const newSoldCount = expectedSoldCount + quantity;

        // Atomic update with optimistic concurrency control
        // WHERE clause ensures sold_count hasn't changed since we read it
        const updateResult = await db.execute({
          sql: `UPDATE ticket_types
                SET ${columnToUpdate} = ?
                WHERE id = ?
                AND ${columnToUpdate} = ?
                AND (${columnToUpdate} + ? <= max_quantity)`,
          args: [newSoldCount, ticketType.id, expectedSoldCount, quantity]
        });

        // Verify the update succeeded (affected 1 row)
        if (!updateResult || updateResult.rowsAffected === 0) {
          // Race condition detected - another request updated sold_count
          // Rollback any previously updated sold_counts
          for (const rollback of soldCountUpdates) {
            await db.execute({
              sql: `UPDATE ticket_types SET ${rollback.columnToUpdate} = ? WHERE id = ?`,
              args: [rollback.originalCount, rollback.ticketTypeId]
            });
          }

          throw new Error(
            `Ticket availability changed during purchase. ` +
            `Please try again. (${ticketType.name})`
          );
        }

        // Track this update for potential rollback
        soldCountUpdates.push({
          ticketTypeId: ticketType.id,
          columnToUpdate: columnToUpdate,
          originalCount: expectedSoldCount,
          newCount: newSoldCount
        });

        console.log(
          `✅ Atomically updated ${columnToUpdate} for ${ticketType.name}: ` +
          `${expectedSoldCount} -> ${newSoldCount} (${isTest ? 'TEST' : 'PRODUCTION'})`
        );
      }
    }

    // ========================================================================
    // STEP 7: Create Transaction + Tickets in Batch
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
    // STEP 8: Create Tickets
    // ========================================================================
    const tickets = [];
    const deadlineTracker = new Map(); // Track unique deadlines for reminder scheduling

    for (const item of validatedItems) {
      const { ticketType, quantity, unitPriceCents, totalPriceCents } = item;

      // Calculate registration deadline: 24 hours before event (using database event_date)
      const eventTime = ticketType.event_time || '00:00';
      const [eh, em] = eventTime.split(':').map(Number);
      const eventDateObj = new Date(ticketType.event_date);
      eventDateObj.setHours(Number.isFinite(eh) ? eh : 0, Number.isFinite(em) ? em : 0, 0, 0);
      const standardDeadline = new Date(eventDateObj.getTime() - (24 * 60 * 60 * 1000));
      const hoursUntilEvent = (eventDateObj.getTime() - now.getTime()) / (1000 * 60 * 60);

      let registrationDeadline;
      if (standardDeadline > now) {
        // Standard case: 24 hours before event
        registrationDeadline = standardDeadline;
      } else if (hoursUntilEvent > 12) {
        // Late purchase: 1 hour before event
        registrationDeadline = new Date(eventDateObj.getTime() - (1 * 60 * 60 * 1000));
      } else if (hoursUntilEvent > 6) {
        // Very late: half remaining time (min 30 min before)
        const hoursUntilDeadline = Math.max(0.5, hoursUntilEvent / 2);
        registrationDeadline = new Date(now.getTime() + (hoursUntilDeadline * 60 * 60 * 1000));
      } else {
        // Emergency: 30 min from now OR 15 min before event (whichever is longer)
        const emergencyDeadline1 = new Date(now.getTime() + (30 * 60 * 1000));
        const emergencyDeadline2 = new Date(eventDateObj.getTime() - (15 * 60 * 1000));
        registrationDeadline = emergencyDeadline1 > emergencyDeadline2 ? emergencyDeadline1 : emergencyDeadline2;
      }

      // Track deadline for reminder scheduling
      const deadlineKey = registrationDeadline.toISOString();
      if (!deadlineTracker.has(deadlineKey)) {
        deadlineTracker.set(deadlineKey, {
          deadline: registrationDeadline,
          eventDate: ticketType.event_date,
          ticketCount: 0
        });
      }
      deadlineTracker.get(deadlineKey).ticketCount += quantity;

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
    // STEP 9: Execute Batch Operations (Transaction + Tickets)
    // ========================================================================
    try {
      console.log(`Executing ${batchOperations.length} batch operations...`);
      await db.batch(batchOperations);
      console.log(`Batch operations completed for transaction ${transactionUuid}`);
    } catch (batchError) {
      // Rollback sold_count updates if batch operation fails
      console.error('Batch operation failed, rolling back sold_count updates...');
      for (const rollback of soldCountUpdates) {
        try {
          // Migration 043: Use stored columnToUpdate for rollback
          await db.execute({
            sql: `UPDATE ticket_types SET ${rollback.columnToUpdate} = ? WHERE id = ?`,
            args: [rollback.originalCount, rollback.ticketTypeId]
          });
          console.log(
            `✅ Rolled back ${rollback.columnToUpdate} for ${rollback.ticketTypeId}: ` +
            `${rollback.newCount} -> ${rollback.originalCount}`
          );
        } catch (rollbackError) {
          console.error(
            `Failed to rollback ${rollback.columnToUpdate} for ${rollback.ticketTypeId}:`,
            rollbackError
          );
        }
      }
      throw batchError;
    }

    // ========================================================================
    // STEP 10: Get Created Transaction
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
    // STEP 11: Post-Creation Side Effects (Non-Blocking)
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

      // Schedule registration reminders for each unique deadline
      if (deadlineTracker.size > 0) {
        console.log(`Scheduling reminders for transaction ${transaction.id} with ${deadlineTracker.size} unique deadline(s)`);
        let totalRemindersScheduled = 0;

        for (const [deadlineKey, deadlineInfo] of deadlineTracker) {
          const reminderCount = await scheduleRegistrationReminders(
            transaction.id,
            deadlineInfo.deadline,
            isTest
          );
          totalRemindersScheduled += reminderCount;
          console.log(
            `Scheduled ${reminderCount} reminders for deadline ${deadlineInfo.deadline.toISOString()} ` +
            `(${deadlineInfo.ticketCount} tickets, event: ${deadlineInfo.eventDate})`
          );
        }

        console.log(`Total reminders scheduled for transaction ${transaction.id}: ${totalRemindersScheduled}`);
      } else {
        console.warn(`No registration deadlines tracked, skipping reminder scheduling`);
      }

    } catch (sideEffectError) {
      console.error('Non-critical side effect failed:', sideEffectError);
      // Continue - tickets are created successfully
    }

    // ========================================================================
    // STEP 12: Update Cash Shift (if applicable)
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
