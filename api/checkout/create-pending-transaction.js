/**
 * Create Pending Transaction API
 *
 * Creates a transaction and tickets with attendee information BEFORE payment.
 * This enables inline registration during checkout flow.
 *
 * Flow:
 * 1. User fills registration form with attendee details
 * 2. Frontend calls this API to create pending transaction/tickets
 * 3. User proceeds to payment (Stripe/PayPal/Venmo)
 * 4. Payment webhook upgrades transaction to 'completed'
 *
 * Endpoint: POST /api/checkout/create-pending-transaction
 *
 * Request Body:
 * {
 *   cartItems: [
 *     { ticketTypeId: 1, quantity: 2, price_cents: 5000 }
 *   ],
 *   customerInfo: {
 *     email: "customer@example.com",
 *     name: "Jane Doe",
 *     phone: "+1234567890"
 *   },
 *   registrations: [
 *     { ticketTypeId: 1, firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
 *     { ticketTypeId: 1, firstName: "John", lastName: "Smith", email: "john@example.com" }
 *   ],
 *   cartFingerprint: "hash-of-cart-contents"  // For idempotency
 * }
 *
 * Response:
 * {
 *   success: true,
 *   transaction: {
 *     id: 123,
 *     transaction_id: "uuid",
 *     order_number: "ALO-2026-0123"
 *   },
 *   tickets: [
 *     { ticket_id: "TKT-uuid", ticket_type: "Festival Pass", attendee_name: "Jane Doe" }
 *   ]
 * }
 */

import { getDatabaseClient } from '../../lib/database.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Validate registration data
 */
function validateRegistrationData(registrations) {
  const errors = [];

  if (!Array.isArray(registrations) || registrations.length === 0) {
    errors.push('At least one registration is required');
    return errors;
  }

  const nameRegex = /^[a-zA-Z\s'-]{1,50}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  registrations.forEach((reg, index) => {
    if (!reg.firstName || !nameRegex.test(reg.firstName)) {
      errors.push(`Registration ${index + 1}: Invalid first name`);
    }

    if (!reg.lastName || !nameRegex.test(reg.lastName)) {
      errors.push(`Registration ${index + 1}: Invalid last name`);
    }

    if (!reg.email || !emailRegex.test(reg.email)) {
      errors.push(`Registration ${index + 1}: Invalid email`);
    }

    if (!reg.ticketTypeId || typeof reg.ticketTypeId !== 'number') {
      errors.push(`Registration ${index + 1}: Invalid ticket type ID`);
    }
  });

  return errors;
}

/**
 * Validate cart items
 */
function validateCartItems(cartItems) {
  const errors = [];

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    errors.push('Cart is empty');
    return errors;
  }

  cartItems.forEach((item, index) => {
    if (!item.ticketTypeId || typeof item.ticketTypeId !== 'number') {
      errors.push(`Cart item ${index + 1}: Invalid ticket type ID`);
    }

    if (!item.quantity || item.quantity < 1) {
      errors.push(`Cart item ${index + 1}: Invalid quantity`);
    }

    if (!item.price_cents || item.price_cents < 0) {
      errors.push(`Cart item ${index + 1}: Invalid price`);
    }
  });

  return errors;
}

/**
 * Calculate total ticket count from cart
 */
function getTotalTicketCount(cartItems) {
  return cartItems.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Generate unique order number
 */
async function generateOrderNumber(client) {
  const year = new Date().getFullYear();
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate a random 4-digit number
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ALO-${year}-${randomNum}`;

    // Check if it exists
    const result = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM transactions WHERE order_number = ?',
      args: [orderNumber]
    });

    if (result.rows[0].count === 0) {
      return orderNumber;
    }
  }

  // Fallback: use timestamp
  const timestamp = Date.now().toString().slice(-4);
  return `ALO-${year}-${timestamp}`;
}

/**
 * Check if transaction already exists for this cart (idempotency)
 */
async function findExistingTransaction(client, cartFingerprint) {
  if (!cartFingerprint) {
    return null;
  }

  const result = await client.execute({
    sql: `
      SELECT
        t.*,
        json_group_array(
          json_object(
            'ticket_id', tk.ticket_id,
            'ticket_type', tk.ticket_type,
            'attendee_first_name', tk.attendee_first_name,
            'attendee_last_name', tk.attendee_last_name,
            'attendee_email', tk.attendee_email,
            'registration_status', tk.registration_status
          )
        ) as tickets_json
      FROM transactions t
      LEFT JOIN tickets tk ON tk.transaction_id = t.id
      WHERE t.metadata LIKE ?
        AND t.payment_status = 'pending'
        AND t.created_at > datetime('now', '-1 hour')
      GROUP BY t.id
      LIMIT 1
    `,
    args: [`%"cartFingerprint":"${cartFingerprint}"%`]
  });

  if (result.rows.length === 0) {
    return null;
  }

  const transaction = result.rows[0];
  const tickets = JSON.parse(transaction.tickets_json || '[]')
    .filter(t => t.ticket_id !== null);

  return {
    transaction,
    tickets
  };
}

/**
 * Create transaction and tickets with registration data
 */
async function createPendingTransaction(client, { cartItems, customerInfo, registrations, cartFingerprint, ipAddress, userAgent }) {
  const transactionId = uuidv4();
  const orderNumber = await generateOrderNumber(client);

  // Calculate total
  const totalAmountCents = cartItems.reduce(
    (sum, item) => sum + (item.price_cents * item.quantity),
    0
  );

  // Metadata
  const metadata = JSON.stringify({
    cartFingerprint,
    source: 'inline_registration',
    createdAt: new Date().toISOString()
  });

  // Insert transaction
  const transactionResult = await client.execute({
    sql: `
      INSERT INTO transactions (
        transaction_id,
        customer_email,
        customer_name,
        customer_phone,
        order_number,
        total_amount_cents,
        currency,
        payment_status,
        metadata,
        is_test,
        ip_address,
        user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      transactionId,
      customerInfo.email,
      customerInfo.name || null,
      customerInfo.phone || null,
      orderNumber,
      totalAmountCents,
      'USD',
      'pending',
      metadata,
      totalAmountCents < 100 ? 1 : 0, // Mark as test if < $1.00
      ipAddress || null,
      userAgent || null
    ]
  });

  const transactionDbId = Number(transactionResult.lastInsertRowid);

  // Fetch ticket type details
  const ticketTypeIds = [...new Set(cartItems.map(item => item.ticketTypeId))];
  const ticketTypesResult = await client.execute({
    sql: `
      SELECT
        tt.id,
        tt.ticket_type_name,
        tt.price_cents,
        tt.status,
        e.id as event_id,
        e.event_name,
        e.event_date,
        e.event_time
      FROM ticket_type tt
      INNER JOIN events e ON e.id = tt.event_id
      WHERE tt.id IN (${ticketTypeIds.map(() => '?').join(',')})
        AND tt.status = 'active'
    `,
    args: ticketTypeIds
  });

  const ticketTypesMap = new Map(
    ticketTypesResult.rows.map(row => [row.id, row])
  );

  // Validate all ticket types exist and are active
  for (const item of cartItems) {
    if (!ticketTypesMap.has(item.ticketTypeId)) {
      throw new Error(`Ticket type ${item.ticketTypeId} not found or inactive`);
    }
  }

  // Create tickets with registration data
  const tickets = [];
  let regIndex = 0;

  for (const item of cartItems) {
    const ticketType = ticketTypesMap.get(item.ticketTypeId);

    for (let i = 0; i < item.quantity; i++) {
      if (regIndex >= registrations.length) {
        throw new Error(`Missing registration data for ticket ${regIndex + 1}`);
      }

      const registration = registrations[regIndex];
      const ticketId = `TKT-${uuidv4()}`;

      await client.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id,
            transaction_id,
            ticket_type,
            event_id,
            price_cents,
            status,
            attendee_first_name,
            attendee_last_name,
            attendee_email,
            registration_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          ticketId,
          transactionDbId,
          ticketType.ticket_type_name,
          ticketType.event_id,
          item.price_cents,
          'valid',
          registration.firstName,
          registration.lastName,
          registration.email,
          'pending_payment' // Key: Registration info filled, payment pending
        ]
      });

      tickets.push({
        ticket_id: ticketId,
        ticket_type: ticketType.ticket_type_name,
        event_name: ticketType.event_name,
        attendee_name: `${registration.firstName} ${registration.lastName}`,
        attendee_email: registration.email,
        registration_status: 'pending_payment'
      });

      regIndex++;
    }
  }

  return {
    transaction: {
      id: transactionDbId,
      transaction_id: transactionId,
      order_number: orderNumber,
      total_amount_cents: totalAmountCents,
      customer_email: customerInfo.email,
      payment_status: 'pending'
    },
    tickets
  };
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cartItems, customerInfo, registrations, cartFingerprint } = req.body;

    // Validate required fields
    if (!customerInfo || !customerInfo.email) {
      return res.status(400).json({ error: 'Customer email is required' });
    }

    // Validate cart
    const cartErrors = validateCartItems(cartItems);
    if (cartErrors.length > 0) {
      return res.status(400).json({ error: 'Invalid cart data', details: cartErrors });
    }

    // Validate registrations
    const regErrors = validateRegistrationData(registrations);
    if (regErrors.length > 0) {
      return res.status(400).json({ error: 'Invalid registration data', details: regErrors });
    }

    // Validate counts match
    const totalTickets = getTotalTicketCount(cartItems);
    if (registrations.length !== totalTickets) {
      return res.status(400).json({
        error: 'Registration count mismatch',
        expected: totalTickets,
        received: registrations.length
      });
    }

    // Get client IP and user agent
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const client = await getDatabaseClient();

    // Check for existing transaction (idempotency)
    const existing = await findExistingTransaction(client, cartFingerprint);
    if (existing) {
      console.log(`Returning existing transaction: ${existing.transaction.order_number}`);
      return res.status(200).json({
        success: true,
        transaction: {
          id: existing.transaction.id,
          transaction_id: existing.transaction.transaction_id,
          order_number: existing.transaction.order_number,
          total_amount_cents: existing.transaction.total_amount_cents,
          customer_email: existing.transaction.customer_email,
          payment_status: existing.transaction.payment_status
        },
        tickets: existing.tickets,
        existing: true
      });
    }

    // Create new transaction
    const result = await createPendingTransaction(client, {
      cartItems,
      customerInfo,
      registrations,
      cartFingerprint,
      ipAddress,
      userAgent
    });

    console.log(`Created pending transaction: ${result.transaction.order_number} with ${result.tickets.length} tickets`);

    return res.status(201).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error creating pending transaction:', error);
    return res.status(500).json({
      error: 'Failed to create transaction',
      message: error.message
    });
  }
}
