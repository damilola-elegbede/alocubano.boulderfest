/**
 * Test Data Factory
 *
 * Centralized test data creation that automatically handles:
 * - is_test flag (always set to 1)
 * - Default values for required fields
 * - Consistent data structure across tests
 *
 * Benefits:
 * - Prevents schema mismatch errors (missing is_test column)
 * - Single source of truth for test data
 * - Easy to update when schema changes
 * - Type-safe test data creation
 */

import { getDatabaseClient } from '../../lib/database.js';

/**
 * Create a test transaction with automatic is_test flag
 *
 * @param {Object} data - Transaction data
 * @param {string} data.transaction_id - Unique transaction ID
 * @param {string} [data.type='tickets'] - Transaction type
 * @param {string} [data.status='completed'] - Transaction status
 * @param {number} [data.amount_cents=0] - Amount in cents
 * @param {string} [data.currency='USD'] - Currency code
 * @param {string} [data.customer_email='test@example.com'] - Customer email
 * @param {string} [data.customer_name='Test Customer'] - Customer name
 * @param {string} [data.order_data='{}'] - Order data JSON
 * @param {number} [data.event_id] - Event ID (optional)
 * @param {string} [data.stripe_session_id] - Stripe session ID (optional)
 * @param {string} [data.uuid] - Transaction UUID (optional, defaults to transaction_id)
 * @param {string} [data.payment_processor='stripe'] - Payment processor
 * @param {string} [data.created_at] - Created timestamp (optional)
 * @param {number} [data.is_test=1] - Test mode flag (defaults to 1, can override for specific test scenarios)
 * @returns {Promise<{id: number, transaction_id: string}>} Created transaction with database ID
 */
export async function createTestTransaction(data) {
  const db = await getDatabaseClient();

  const defaults = {
    type: 'tickets',
    status: 'completed',
    amount_cents: 0,
    currency: 'USD',
    customer_email: 'test@example.com',
    customer_name: 'Test Customer',
    order_data: '{}',
    payment_processor: 'stripe',
    uuid: data.transaction_id, // Default UUID to transaction_id
    is_test: 1, // Default to test mode, but allow override
  };

  const txData = { ...defaults, ...data };

  // Build dynamic SQL based on provided fields
  const fields = ['transaction_id', 'uuid', 'type', 'status', 'amount_cents', 'currency',
                  'customer_email', 'customer_name', 'order_data', 'payment_processor', 'is_test'];
  const values = [txData.transaction_id, txData.uuid, txData.type, txData.status,
                  txData.amount_cents, txData.currency, txData.customer_email,
                  txData.customer_name, txData.order_data, txData.payment_processor, txData.is_test];

  // Add optional fields if provided
  if (txData.event_id !== undefined) {
    fields.push('event_id');
    values.push(Number(txData.event_id));  // Wrap with Number() to handle BigInt
  }
  if (txData.stripe_session_id) {
    fields.push('stripe_session_id');
    values.push(txData.stripe_session_id);
  }
  if (txData.created_at) {
    fields.push('created_at');
    values.push(txData.created_at);
  }

  const placeholders = fields.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `INSERT INTO transactions (${fields.join(', ')}) VALUES (${placeholders})`,
    args: values
  });

  return {
    id: Number(result.lastInsertRowid),
    transaction_id: txData.transaction_id
  };
}

/**
 * Create a test ticket with automatic is_test flag
 *
 * @param {Object} data - Ticket data
 * @param {string} data.ticket_id - Unique ticket ID
 * @param {number} data.transaction_id - Transaction database ID (INTEGER)
 * @param {number} data.event_id - Event ID
 * @param {string} [data.ticket_type='Test Ticket'] - Ticket type name
 * @param {string} [data.ticket_type_id] - Ticket type ID (must exist in ticket_types table)
 * @param {number} [data.price_cents=0] - Price in cents
 * @param {string} [data.status='valid'] - Ticket status
 * @param {string} [data.validation_status='active'] - Validation status
 * @param {string} [data.attendee_email] - Attendee email (optional)
 * @param {string} [data.attendee_first_name] - Attendee first name (optional)
 * @param {string} [data.attendee_last_name] - Attendee last name (optional)
 * @returns {Promise<{id: number, ticket_id: string}>} Created ticket with database ID
 */
export async function createTestTicket(data) {
  const db = await getDatabaseClient();

  const defaults = {
    ticket_type: 'Test Ticket',
    price_cents: 0,
    status: 'valid',
    validation_status: 'active'
  };

  const ticketData = { ...defaults, ...data };

  // Build dynamic SQL based on provided fields
  const fields = ['ticket_id', 'transaction_id', 'event_id', 'ticket_type',
                  'price_cents', 'status', 'validation_status', 'is_test'];
  const values = [ticketData.ticket_id, ticketData.transaction_id, ticketData.event_id,
                  ticketData.ticket_type, ticketData.price_cents, ticketData.status,
                  ticketData.validation_status, 1];

  // Add ticket_type_id if provided (must reference existing ticket_types.id due to FK constraint)
  if (ticketData.ticket_type_id) {
    fields.push('ticket_type_id');
    values.push(ticketData.ticket_type_id);
  }

  // Add optional fields if provided
  if (ticketData.attendee_email) {
    fields.push('attendee_email');
    values.push(ticketData.attendee_email);
  }
  if (ticketData.attendee_first_name) {
    fields.push('attendee_first_name');
    values.push(ticketData.attendee_first_name);
  }
  if (ticketData.attendee_last_name) {
    fields.push('attendee_last_name');
    values.push(ticketData.attendee_last_name);
  }

  const placeholders = fields.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `INSERT INTO tickets (${fields.join(', ')}) VALUES (${placeholders})`,
    args: values
  });

  return {
    id: Number(result.lastInsertRowid),
    ticket_id: ticketData.ticket_id
  };
}

/**
 * Create a test transaction item with automatic is_test flag
 *
 * @param {Object} data - Transaction item data
 * @param {number} data.transaction_id - Transaction database ID (INTEGER)
 * @param {string} [data.item_type='donation'] - Item type
 * @param {string} [data.item_name='Test Item'] - Item name
 * @param {number} [data.quantity=1] - Quantity
 * @param {number} [data.unit_price_cents=0] - Unit price in cents
 * @param {number} [data.total_price_cents] - Total price (defaults to unit_price_cents * quantity)
 * @param {string} [data.created_at] - Created timestamp (optional)
 * @param {number} [data.is_test=1] - Test mode flag (defaults to 1, can override for specific test scenarios)
 * @returns {Promise<{id: number}>} Created transaction item with database ID
 */
export async function createTestTransactionItem(data) {
  const db = await getDatabaseClient();

  const defaults = {
    item_type: 'donation',
    item_name: 'Test Item',
    quantity: 1,
    unit_price_cents: 0,
    is_test: 1, // Default to test mode, but allow override
  };

  const itemData = { ...defaults, ...data };

  // Calculate total price if not provided
  if (itemData.total_price_cents === undefined) {
    itemData.total_price_cents = itemData.unit_price_cents * itemData.quantity;
  }

  // Build dynamic SQL based on provided fields
  const fields = ['transaction_id', 'item_type', 'item_name', 'quantity',
                  'unit_price_cents', 'total_price_cents', 'is_test'];
  const values = [itemData.transaction_id, itemData.item_type, itemData.item_name,
                  itemData.quantity, itemData.unit_price_cents, itemData.total_price_cents, itemData.is_test];

  // Add optional fields if provided
  if (itemData.created_at) {
    fields.push('created_at');
    values.push(itemData.created_at);
  }

  const placeholders = fields.map(() => '?').join(', ');
  const result = await db.execute({
    sql: `INSERT INTO transaction_items (${fields.join(', ')}) VALUES (${placeholders})`,
    args: values
  });

  return {
    id: Number(result.lastInsertRowid)
  };
}

/**
 * Create a complete test purchase (transaction + items)
 * Convenience method that combines transaction and item creation
 *
 * @param {Object} data - Purchase data
 * @param {string} data.transaction_id - Unique transaction ID
 * @param {Array<Object>} [data.items=[]] - Array of item data objects
 * @param {Object} [data.transaction] - Additional transaction fields
 * @returns {Promise<{transaction: Object, items: Array<Object>}>} Created transaction and items
 */
export async function createTestPurchase(data) {
  const { transaction_id, items = [], transaction: txData = {} } = data;

  // Create transaction
  const transaction = await createTestTransaction({
    transaction_id,
    ...txData
  });

  // Create items
  const createdItems = [];
  for (const itemData of items) {
    const item = await createTestTransactionItem({
      transaction_id: transaction.id, // Use database ID
      ...itemData
    });
    createdItems.push(item);
  }

  return {
    transaction,
    items: createdItems
  };
}

/**
 * Create test event
 *
 * @param {Object} data - Event data
 * @param {string} data.slug - Event slug
 * @param {string} [data.name='Test Event'] - Event name
 * @param {string} [data.type='festival'] - Event type
 * @param {string} [data.status='active'] - Event status
 * @param {string} [data.start_date='2026-05-15'] - Start date
 * @param {string} [data.end_date='2026-05-17'] - End date
 * @returns {Promise<{id: number, slug: string}>} Created event with database ID
 */
export async function createTestEvent(data) {
  const db = await getDatabaseClient();

  const defaults = {
    name: 'Test Event',
    type: 'festival',
    status: 'active',
    start_date: '2026-05-15',
    end_date: '2026-05-17'
  };

  const eventData = { ...defaults, ...data };

  const result = await db.execute({
    sql: `INSERT INTO events (slug, name, type, status, start_date, end_date)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [eventData.slug, eventData.name, eventData.type, eventData.status,
           eventData.start_date, eventData.end_date]
  });

  return {
    id: Number(result.lastInsertRowid),
    slug: eventData.slug
  };
}

/**
 * Create test ticket type
 *
 * @param {Object} data - Ticket type data
 * @param {string} data.id - Ticket type ID
 * @param {number} data.event_id - Event database ID
 * @param {string} [data.name='Test Ticket Type'] - Ticket type name
 * @param {number} [data.price_cents=5000] - Price in cents
 * @param {number} [data.max_quantity=100] - Max quantity
 * @param {number} [data.sold_count=0] - Sold count
 * @param {string} [data.status='available'] - Status
 * @returns {Promise<{id: string}>} Created ticket type
 */
export async function createTestTicketType(data) {
  const db = await getDatabaseClient();

  const defaults = {
    name: 'Test Ticket Type',
    price_cents: 5000,
    max_quantity: 100,
    sold_count: 0,
    status: 'available'
  };

  const typeData = { ...defaults, ...data };

  await db.execute({
    sql: `INSERT INTO ticket_types (id, name, price_cents, max_quantity, sold_count, status, event_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [typeData.id, typeData.name, typeData.price_cents, typeData.max_quantity,
           typeData.sold_count, typeData.status, typeData.event_id]
  });

  return {
    id: typeData.id
  };
}

export default {
  createTestTransaction,
  createTestTicket,
  createTestTransactionItem,
  createTestPurchase,
  createTestEvent,
  createTestTicketType
};
