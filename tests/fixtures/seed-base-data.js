/**
 * Minimal Base Test Data for Unit Tests
 *
 * Purpose:
 * - Seeded once per test worker in beforeAll (setup-unit.js)
 * - Provides essential records to prevent "not found" errors
 * - Minimal overhead (~50ms) amortized across all tests
 *
 * Design:
 * - 1 event: Covers event lookup scenarios
 * - 2 tickets: Covers ticket validation and QR generation
 * - 1 transaction: Links tickets to payment flow
 *
 * Usage:
 * - Base data available to ALL unit tests
 * - Tests create additional specific data using helpers
 * - Tests should NOT modify base data (read-only)
 */

export const BASE_EVENT = {
  id: 1,
  slug: 'alocubano-2026',
  name: 'A Lo Cubano Boulder Fest 2026',
  type: 'festival',
  status: 'active',
  description: 'Cuban Salsa Festival in Boulder, CO',
  venue_name: 'Avalon Ballroom',
  venue_address: '6185 Arapahoe Ave',
  venue_city: 'Boulder',
  venue_state: 'CO',
  venue_zip: '80303',
  start_date: '2026-05-15',
  end_date: '2026-05-17',
  max_capacity: 500,
  early_bird_end_date: '2026-04-01',
  regular_price_start_date: '2026-04-02',
  display_order: 1,
  is_featured: true,
  is_visible: true,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z'
};

export const BASE_TRANSACTION = {
  id: 1,
  transaction_id: 'TXN_BASE_001',
  stripe_session_id: 'cs_test_base_session_001',
  stripe_payment_intent: 'pi_test_base_001',
  email: 'test@example.com',
  status: 'completed',
  amount: 12000, // $120.00
  currency: 'usd',
  ticket_count: 1,
  event_id: 1,
  metadata: JSON.stringify({
    test_data: true,
    source: 'unit_test_base_seed'
  }),
  created_at: '2025-01-15T12:00:00.000Z',
  updated_at: '2025-01-15T12:00:00.000Z'
};

export const BASE_TICKETS = [
  {
    ticket_id: 'TEST_TICKET_001',
    event_id: 1,
    transaction_id: 'TXN_BASE_001',
    status: 'active',
    ticket_type: 'Full Festival Pass',
    price: 12000,
    attendee_first_name: 'Test',
    attendee_last_name: 'User',
    attendee_email: 'test@example.com',
    qr_token: null, // Generated on demand by tests
    registration_token: null, // Generated on demand by tests
    registered_at: null,
    registration_deadline: '2026-05-14T23:59:59.000Z',
    created_at: '2025-01-15T12:00:00.000Z',
    updated_at: '2025-01-15T12:00:00.000Z'
  },
  {
    ticket_id: 'TEST_TICKET_002',
    event_id: 1,
    transaction_id: 'TXN_BASE_001',
    status: 'active',
    ticket_type: 'Single Day Pass',
    price: 5000,
    attendee_first_name: 'Test',
    attendee_last_name: 'Attendee',
    attendee_email: 'test2@example.com',
    qr_token: null,
    registration_token: null,
    registered_at: null,
    registration_deadline: '2026-05-14T23:59:59.000Z',
    created_at: '2025-01-15T12:00:00.000Z',
    updated_at: '2025-01-15T12:00:00.000Z'
  }
];

/**
 * Seed base test data into database
 * Called once per test worker in beforeAll (setup-unit.js)
 *
 * @param {Object} db - Database client (@libsql/client)
 * @returns {Promise<void>}
 */
export async function seedBaseTestData(db) {
  try {
    // Insert base event (ignore if already exists - idempotent)
    await db.execute({
      sql: `INSERT OR IGNORE INTO events
            (id, slug, name, type, status, description, venue_name, venue_address, venue_city, venue_state, venue_zip,
             start_date, end_date, max_capacity, early_bird_end_date, regular_price_start_date,
             display_order, is_featured, is_visible, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        BASE_EVENT.id,
        BASE_EVENT.slug,
        BASE_EVENT.name,
        BASE_EVENT.type,
        BASE_EVENT.status,
        BASE_EVENT.description,
        BASE_EVENT.venue_name,
        BASE_EVENT.venue_address,
        BASE_EVENT.venue_city,
        BASE_EVENT.venue_state,
        BASE_EVENT.venue_zip,
        BASE_EVENT.start_date,
        BASE_EVENT.end_date,
        BASE_EVENT.max_capacity,
        BASE_EVENT.early_bird_end_date,
        BASE_EVENT.regular_price_start_date,
        BASE_EVENT.display_order,
        BASE_EVENT.is_featured ? 1 : 0,
        BASE_EVENT.is_visible ? 1 : 0,
        BASE_EVENT.created_at,
        BASE_EVENT.updated_at
      ]
    });

    // Insert base transaction (ignore if already exists)
    await db.execute({
      sql: `INSERT OR IGNORE INTO transactions
            (id, transaction_id, stripe_session_id, stripe_payment_intent, email, status,
             amount, currency, ticket_count, event_id, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        BASE_TRANSACTION.id,
        BASE_TRANSACTION.transaction_id,
        BASE_TRANSACTION.stripe_session_id,
        BASE_TRANSACTION.stripe_payment_intent,
        BASE_TRANSACTION.email,
        BASE_TRANSACTION.status,
        BASE_TRANSACTION.amount,
        BASE_TRANSACTION.currency,
        BASE_TRANSACTION.ticket_count,
        BASE_TRANSACTION.event_id,
        BASE_TRANSACTION.metadata,
        BASE_TRANSACTION.created_at,
        BASE_TRANSACTION.updated_at
      ]
    });

    // Insert base tickets (ignore if already exist)
    for (const ticket of BASE_TICKETS) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO tickets
              (ticket_id, event_id, transaction_id, status, ticket_type, price,
               attendee_first_name, attendee_last_name, attendee_email,
               qr_token, registration_token, registered_at, registration_deadline,
               created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ticket.ticket_id,
          ticket.event_id,
          ticket.transaction_id,
          ticket.status,
          ticket.ticket_type,
          ticket.price,
          ticket.attendee_first_name,
          ticket.attendee_last_name,
          ticket.attendee_email,
          ticket.qr_token,
          ticket.registration_token,
          ticket.registered_at,
          ticket.registration_deadline,
          ticket.created_at,
          ticket.updated_at
        ]
      });
    }

    console.log('✅ Base test data seeded successfully');
    console.log(`   - 1 event: ${BASE_EVENT.slug}`);
    console.log(`   - 1 transaction: ${BASE_TRANSACTION.transaction_id}`);
    console.log(`   - ${BASE_TICKETS.length} tickets: ${BASE_TICKETS.map(t => t.ticket_id).join(', ')}`);
  } catch (error) {
    console.error('❌ Failed to seed base test data:', error.message);
    console.error('   Stack:', error.stack);
    // Don't throw - allow tests to run even if seeding fails
    // Tests that need data will fail with clear error messages
  }
}

/**
 * Check if base data exists in database
 * Useful for debugging seed issues
 *
 * @param {Object} db - Database client
 * @returns {Promise<Object>} Status of base data
 */
export async function verifyBaseTestData(db) {
  try {
    const event = await db.execute({
      sql: 'SELECT id FROM events WHERE id = ?',
      args: [BASE_EVENT.id]
    });

    const transaction = await db.execute({
      sql: 'SELECT id FROM transactions WHERE id = ?',
      args: [BASE_TRANSACTION.id]
    });

    const tickets = await db.execute({
      sql: 'SELECT ticket_id FROM tickets WHERE event_id = ?',
      args: [BASE_EVENT.id]
    });

    return {
      event: event.rows.length > 0,
      transaction: transaction.rows.length > 0,
      tickets: tickets.rows.length,
      expectedTickets: BASE_TICKETS.length,
      complete: event.rows.length > 0 && transaction.rows.length > 0 && tickets.rows.length === BASE_TICKETS.length
    };
  } catch (error) {
    return {
      error: error.message,
      complete: false
    };
  }
}
