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
 * @param {string} params.customerName - Customer full name (optional, for backward compatibility)
 * @param {string} params.customerFirstName - Customer first name (preferred)
 * @param {string} params.customerLastName - Customer last name (preferred)
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
    customerName = null,
    customerFirstName = null,
    customerLastName = null,
    customerPhone = null,
    cashShiftId = null,
    isTest = false
  } = params;

  // Validate required parameters
  const allowedMethods = new Set(['cash', 'card_terminal', 'paypal', 'venmo', 'comp']);

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

  // Validate that either customerFirstName/customerLastName OR customerName is provided
  if ((!customerFirstName || !customerLastName) && (!customerName || !customerName.trim())) {
    throw new Error('Either customerFirstName and customerLastName, or customerName is required');
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
      // Convert BigInt to Number to avoid "Cannot mix BigInt and other types" error
      const unitPrice = Number(ticketType.price_cents);
      const itemPrice = unitPrice * quantity;
      totalPriceCents += itemPrice;

      const validatedItem = {
        ticketType: ticketType,
        ticketTypeId: ticketTypeId,
        quantity: quantity,
        unitPriceCents: unitPrice,
        totalPriceCents: itemPrice,
        attendee: item.attendee // CRITICAL: Pass through attendee details for email sending
      };
      console.log(`[DEBUG] Adding validatedItem with attendee:`, !!validatedItem.attendee, validatedItem.attendee);
      validatedItems.push(validatedItem);
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
    // STEP 4: Determine Customer Name
    // ========================================================================
    // Prefer separate first/last names if provided, otherwise parse customerName
    let firstName, lastName, fullCustomerName;

    if (customerFirstName && customerLastName) {
      firstName = customerFirstName.trim();
      lastName = customerLastName.trim();
      fullCustomerName = `${firstName} ${lastName}`;
    } else {
      // Backward compatibility: parse customerName if provided
      const parsed = parseCustomerName(customerName);
      firstName = parsed.firstName;
      lastName = parsed.lastName;
      fullCustomerName = customerName.trim();
    }

    // ========================================================================
    // STEP 5: Calculate Max Scan Count (same pattern as ticket-creation-service.js)
    // ========================================================================
    const parsedMaxScanEnv = Number.parseInt(process.env.QR_CODE_MAX_SCANS ?? "", 10);
    const maxScanCount = Number.isFinite(parsedMaxScanEnv) && parsedMaxScanEnv >= 0
      ? parsedMaxScanEnv
      : 3;  // Default fallback if not set or invalid

    // ========================================================================
    // STEP 6: Prepare Order Data
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
    // STEP 7: Update sold_count Atomically (Prevents Race Conditions)
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
    // STEP 8: Create Transaction + Tickets in Batch
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
        fullCustomerName,
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
    // STEP 9: Create Tickets
    // ========================================================================
    const tickets = [];
    const deadlineTracker = new Map(); // Track unique deadlines for reminder scheduling

    for (const item of validatedItems) {
      const { ticketType, quantity, unitPriceCents, totalPriceCents } = item;

      // Calculate registration deadline: 24 hours before event (using database event_date)
      const eventTime = ticketType.event_time || '00:00';
      const [eh, em] = eventTime.split(':').map(Number);
      const hours = Number.isFinite(eh) ? eh : 0;
      const minutes = Number.isFinite(em) ? em : 0;
      const isoString = `${ticketType.event_date}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
      const eventDateObj = new Date(isoString);
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

        // Use attendee details if provided, otherwise fall back to customer details
        const attendeeFirstName = item.attendee?.firstName || firstName;
        const attendeeLastName = item.attendee?.lastName || lastName;
        const attendeeEmail = item.attendee?.email || null;
        const attendeePhone = item.attendee?.phone || customerPhone;

        // Determine registration status - if attendee details provided, mark as completed
        const registrationStatus = item.attendee ? 'completed' : 'pending';
        const registeredAt = item.attendee ? new Date().toISOString() : null;

        // Create ticket
        batchOperations.push({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
            event_date, event_time, price_cents,
            attendee_first_name, attendee_last_name, attendee_email, attendee_phone,
            registration_status, registered_at, registration_deadline,
            max_scan_count, status, created_at, is_test
          ) VALUES (
            ?, (SELECT id FROM transactions WHERE uuid = ?), ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, CURRENT_TIMESTAMP, ?
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
            isTest ? `TEST-${attendeeFirstName}` : attendeeFirstName,
            isTest ? `TEST-${attendeeLastName}` : attendeeLastName,
            attendeeEmail,
            attendeePhone,
            registrationStatus,
            registeredAt,
            registrationDeadline.toISOString(),
            maxScanCount, // Explicitly pass max_scan_count
            'valid', // Ticket status
            isTest ? 1 : 0
          ]
        });

        const ticketObj = {
          id: ticketId,
          type: ticketType.id,
          ticket_id: ticketId,
          price_cents: priceForThisTicket,
          attendee: item.attendee // Store attendee details for later email sending
        };
        console.log(`[DEBUG] Creating ticket ${ticketId} with attendee:`, !!ticketObj.attendee, ticketObj.attendee);
        tickets.push(ticketObj);
      }
    }

    // ========================================================================
    // STEP 10: Execute Batch Operations (Transaction + Tickets)
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
    // STEP 11: Get Created Transaction
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
    // STEP 11.4: Generate and Store Registration Token for Transaction
    // ========================================================================
    // Generate a JWT token for the transaction to allow viewing all tickets
    // This token will be used in the order confirmation email
    console.log(`Generating registration token for transaction ${transaction.id}...`);
    let registrationToken = null;
    try {
      const { RegistrationTokenService } = await import('./registration-token-service.js');
      const tokenService = new RegistrationTokenService();
      await tokenService.ensureInitialized();
      registrationToken = await tokenService.createToken(transaction.id);
      console.log(`✅ Generated registration token for transaction ${transaction.uuid}`);
    } catch (tokenError) {
      console.error(`Failed to generate registration token for transaction ${transaction.id}:`, tokenError);
      // Continue without registration token - order confirmation email will use fallback
    }

    // ========================================================================
    // STEP 11.5: Generate and Store QR Tokens for All Tickets
    // ========================================================================
    // CRITICAL FIX: Generate QR tokens BEFORE sending emails to prevent 404 errors
    // QR tokens must exist in the database before attendee emails are sent
    console.log(`Generating QR tokens for ${tickets.length} ticket(s)...`);
    const { getQRTokenService } = await import('./qr-token-service.js');
    const qrService = getQRTokenService();

    for (const ticket of tickets) {
      try {
        const qrToken = await qrService.getOrCreateToken(ticket.ticket_id);
        console.log(`✅ Generated QR token for ticket ${ticket.ticket_id}`);
      } catch (tokenError) {
        console.error(`Failed to generate QR token for ticket ${ticket.ticket_id}:`, tokenError);
        // Continue generating tokens for other tickets even if one fails
      }
    }
    console.log(`QR token generation completed`);

    // ========================================================================
    // STEP 12: Post-Creation Side Effects (Email Sending)
    // ========================================================================
    try {
      // STEP 12.1: Send Order Confirmation Email to Customer
      // This email serves as a receipt and provides a link to view all tickets in the order
      console.log(`Sending order confirmation email to customer ${transaction.customer_email}...`);
      await sendOrderConfirmationEmail(
        transaction,
        tickets,
        validatedItems.map(vi => vi.ticketType),
        registrationToken,
        isTest
      );
      console.log(`✅ Order confirmation email sent to ${transaction.customer_email}`);

      // STEP 12.2: Send Attendee Confirmation Emails
      // Each ticket holder gets their individual ticket with QR code and wallet passes
      console.log(`Sending ${tickets.length} attendee confirmation email(s)...`);
      console.log(`[DEBUG] tickets array:`, JSON.stringify(tickets, null, 2));
      let attendeeEmailsSent = 0;
      for (const ticket of tickets) {
        console.log(`[DEBUG] Processing ticket ${ticket.ticket_id}, has attendee:`, !!ticket.attendee);
        console.log(`[DEBUG] Ticket object:`, JSON.stringify(ticket, null, 2));
        if (ticket.attendee) {
          await sendAttendeeConfirmationEmail(
            ticket,
            transaction,
            validatedItems.find(vi => vi.ticketType.id === ticket.type)?.ticketType,
            isTest
          );
          attendeeEmailsSent++;
          console.log(`✅ Attendee confirmation ${attendeeEmailsSent}/${tickets.length} sent to ${ticket.attendee.email}`);
        } else {
          console.log(`⚠️ Skipping attendee email for ticket ${ticket.ticket_id} - no attendee data`);
        }
      }
      console.log(`✅ All ${attendeeEmailsSent} attendee confirmation emails sent successfully`);

    } catch (sideEffectError) {
      console.error('Non-critical side effect failed:', sideEffectError);
      // Continue - tickets are created successfully
    }

    // ========================================================================
    // STEP 13: Update Cash Shift (if applicable)
    // ========================================================================
    if (cashShiftId && paymentMethod === 'cash') {
      try {
        // Note: In SQLite, all RHS expressions in SET are evaluated using pre-update values.
        // So expected_cash_cents = opening_cash_cents + (old_cash_sales_total_cents) + totalPriceCents.
        // No double-counting occurs because totalPriceCents represents the new sale increment.
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

/**
 * Send attendee confirmation email with QR code and wallet passes
 * @param {Object} ticket - Ticket object with attendee details
 * @param {Object} transaction - Transaction object
 * @param {Object} ticketType - Ticket type object
 * @param {boolean} isTest - Whether this is a test ticket
 */
async function sendAttendeeConfirmationEmail(ticket, transaction, ticketType, isTest) {
  try {
    // Import required services
    const { getQRTokenService } = await import('./qr-token-service.js');
    const { getBrevoService } = await import('./brevo-service.js');
    const { generateAttendeeConfirmationEmail } = await import('./email-templates/attendee-confirmation.js');

    // Determine base URL
    let baseUrl;
    if (process.env.VERCEL_ENV === 'production') {
      baseUrl = "https://www.alocubanoboulderfest.org";
    } else if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://alocubanoboulderfest.org";
    }

    // Generate QR token for the ticket
    const qrService = getQRTokenService();
    const qrToken = await qrService.getOrCreateToken(ticket.ticket_id);

    // Format event date
    const eventDate = ticketType.event_date
      ? `${new Date(ticketType.event_date + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'America/Denver'
        })}`
      : 'May 15-17, 2026';

    // Generate HTML email using template
    const htmlContent = generateAttendeeConfirmationEmail({
      firstName: ticket.attendee.firstName,
      lastName: ticket.attendee.lastName,
      ticketId: ticket.ticket_id,
      ticketType: ticketType.name,
      orderNumber: transaction.order_number || transaction.id,
      eventName: ticketType.event_name || 'A Lo Cubano Boulder Fest 2026',
      eventLocation: `${ticketType.venue_name || 'Avalon Ballroom'}, ${ticketType.venue_city || 'Boulder'}, ${ticketType.venue_state || 'CO'}`,
      eventDate: eventDate,
      qrCodeUrl: `${baseUrl}/api/qr/generate?token=${qrToken}`,
      walletPassUrl: `${baseUrl}/api/tickets/apple-wallet/${ticket.ticket_id}`,
      googleWalletUrl: `${baseUrl}/api/tickets/google-wallet/${ticket.ticket_id}`,
      appleWalletButtonUrl: `${baseUrl}/images/add-to-wallet-apple.png`,
      googleWalletButtonUrl: `${baseUrl}/images/add-to-wallet-google.png`,
      viewTicketUrl: `${baseUrl}/api/tickets/by-qr?token=${qrToken}`
    });

    // Send email using Brevo API
    const brevo = getBrevoService();
    await brevo.makeRequest('/smtp/email', {
      method: 'POST',
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || 'noreply@alocubano.com',
          name: 'A Lo Cubano Boulder Fest'
        },
        replyTo: {
          email: process.env.BREVO_REPLY_TO || 'alocubanoboulderfest@gmail.com',
          name: 'A Lo Cubano Boulder Fest'
        },
        to: [{
          email: ticket.attendee.email,
          name: `${ticket.attendee.firstName} ${ticket.attendee.lastName}`
        }],
        subject: isTest ? `[TEST] Your Ticket is Ready - ${ticketType.event_name || 'A Lo Cubano Boulder Fest'}` : `Your Ticket is Ready - ${ticketType.event_name || 'A Lo Cubano Boulder Fest'}`,
        htmlContent: htmlContent,
        headers: {
          'X-Mailin-Tag': isTest ? 'attendee-confirmation-test' : 'attendee-confirmation',
          'X-Ticket-ID': ticket.ticket_id,
          'X-Transaction-ID': transaction.uuid || transaction.id,
          'X-Test-Mode': isTest ? 'true' : 'false'
        }
      })
    });

    console.log(`✅ Sent attendee confirmation email for ticket ${ticket.ticket_id}`);

  } catch (error) {
    console.error(`Failed to send attendee confirmation email for ticket ${ticket.ticket_id}:`, error);
    throw error;
  }
}

/**
 * Send order confirmation email to customer with receipt and link to view all tickets
 * @param {Object} transaction - Transaction object
 * @param {Array} tickets - Array of ticket objects with full details
 * @param {Array} ticketTypes - Array of ticket type objects
 * @param {string} registrationToken - JWT token for viewing all tickets in transaction
 * @param {boolean} isTest - Whether this is a test transaction
 */
async function sendOrderConfirmationEmail(transaction, tickets, ticketTypes, registrationToken, isTest) {
  try {
    // Import required services and templates
    const { getBrevoService } = await import('./brevo-service.js');
    const { generateOrderConfirmationEmail } = await import('./email-templates/order-confirmation.js');
    const timeUtils = await import('./time-utils.js').then(m => m.default);

    // Determine base URL
    let baseUrl;
    if (process.env.VERCEL_ENV === 'production') {
      baseUrl = "https://www.alocubanoboulderfest.org";
    } else if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://alocubanoboulderfest.org";
    }

    // Determine payment method display
    const paymentMethod = transaction.payment_processor || 'manual';
    let paymentMethodDisplay = 'Manual Entry';
    if (paymentMethod === 'cash') {
      paymentMethodDisplay = 'Cash';
    } else if (paymentMethod === 'card_terminal') {
      paymentMethodDisplay = 'Card Terminal';
    } else if (paymentMethod === 'paypal') {
      paymentMethodDisplay = 'PayPal';
    } else if (paymentMethod === 'venmo') {
      paymentMethodDisplay = 'Venmo';
    } else if (paymentMethod === 'comp') {
      paymentMethodDisplay = 'Complimentary';
    }

    // Check if this is a comp ticket (free)
    const isCompTicket = paymentMethod === 'comp' || transaction.amount_cents === 0;

    // Build tickets list HTML
    const ticketsListHTML = tickets.map(ticket => {
      const ticketType = ticketTypes.find(tt => tt.id === ticket.type);
      const ticketName = ticketType ? ticketType.name : 'Unknown Ticket';
      const price = isCompTicket ? 'FREE' : `$${(ticket.price_cents || 0) / 100}`;

      return `
        <div style="border-left: 3px solid #5b6bb5; padding: 10px; margin: 10px 0; background: #f9f9f9;">
          <p style="margin: 5px 0;"><strong>${ticketName}</strong> - ${price}</p>
          <p style="margin: 5px 0; font-size: 14px; color: #666;">
            Attendee: ${ticket.attendee?.firstName || ''} ${ticket.attendee?.lastName || ''}
            ${ticket.attendee?.email ? `(${ticket.attendee.email})` : ''}
          </p>
        </div>
      `;
    }).join('');

    // Determine view tickets URL - use correct path to view-tickets page
    const viewTicketsUrl = registrationToken
      ? `${baseUrl}/pages/core/view-tickets.html?token=${registrationToken}`
      : `${baseUrl}/pages/core/view-tickets.html?token=MISSING_TOKEN`;

    // Format dates using Mountain Time
    const orderDate = timeUtils.formatDateTime(transaction.created_at || transaction.completed_at);
    const paymentDate = timeUtils.formatDateTime(transaction.completed_at || transaction.created_at);

    // Manual entry notice (for admin-created orders)
    const manualEntryNotice = `
      <div style="background: rgba(91, 107, 181, 0.1); border-left: 4px solid #5b6bb5; padding: 12px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #5b6bb5; font-size: 14px;">
          ℹ️ <strong>Manual Entry</strong> - This order was created by event staff.
        </p>
      </div>
    `;

    // Comp ticket notice (for free tickets)
    const compTicketNotice = isCompTicket ? `
      <div style="background: rgba(76, 175, 80, 0.1); border-left: 4px solid #4caf50; padding: 12px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #2e7d32; font-size: 14px;">
          🎉 <strong>Complimentary Ticket</strong> - No payment required.
        </p>
      </div>
    ` : '';

    // Generate HTML email using template
    const htmlContent = generateOrderConfirmationEmail({
      customerName: transaction.customer_name || "Valued Customer",
      orderNumber: transaction.order_number || `ALO-${new Date().getFullYear()}-${String(transaction.id).padStart(4, '0')}`,
      orderDate: orderDate,
      totalTickets: tickets.length,
      totalDonations: 0, // Manual entries don't support donations yet
      totalItems: tickets.length,
      ticketsList: ticketsListHTML,
      registrationUrl: viewTicketsUrl,
      registrationDeadline: 'Before Event',
      totalAmount: isCompTicket ? '0.00' : ((transaction.amount_cents || 0) / 100).toFixed(2),
      paymentMethod: paymentMethodDisplay,
      transactionId: transaction.uuid || transaction.id,
      paymentDate: paymentDate,
      billingEmail: transaction.customer_email,
      manualEntryNotice: manualEntryNotice,
      compTicketNotice: compTicketNotice
    });

    // Send email using Brevo API
    const brevo = getBrevoService();
    await brevo.makeRequest('/smtp/email', {
      method: 'POST',
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || 'noreply@alocubano.com',
          name: 'A Lo Cubano Boulder Fest'
        },
        replyTo: {
          email: process.env.BREVO_REPLY_TO || 'alocubanoboulderfest@gmail.com',
          name: 'A Lo Cubano Boulder Fest'
        },
        to: [{
          email: transaction.customer_email,
          name: transaction.customer_name || 'Valued Customer'
        }],
        subject: isTest
          ? `[TEST] Your Order Confirmation - ${transaction.order_number || 'A Lo Cubano Boulder Fest'}`
          : `Your Order Confirmation - ${transaction.order_number || 'A Lo Cubano Boulder Fest'}`,
        htmlContent: htmlContent,
        headers: {
          'X-Mailin-Tag': isTest ? 'order-confirmation-test' : 'order-confirmation',
          'X-Transaction-ID': transaction.uuid || transaction.id,
          'X-Payment-Processor': paymentMethod,
          'X-Test-Mode': isTest ? 'true' : 'false'
        }
      })
    });

    console.log(`✅ Sent order confirmation email to ${transaction.customer_email}`);

  } catch (error) {
    console.error(`Failed to send order confirmation email for transaction ${transaction.id}:`, error);
    throw error;
  }
}

export default {
  createManualTickets
};
