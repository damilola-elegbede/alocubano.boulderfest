import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';

describe('Dashboard Query Consolidation', () => {
  let db;
  let testEventId;
  let testStatusEventId;
  let testTransactionId;

  beforeEach(async () => {
    db = await getDatabaseClient();

    // Clean up test data (drops tables if they exist)
    await cleanupTestData();

    // Create tables for in-memory database
    await createTables();

    // Seed test data
    await seedDashboardData();
  });

  afterEach(async () => {
    // Clean up after tests
    await cleanupTestData();
  });

  async function createTables() {
    // Create TEMP tables with unique test prefix for complete isolation
    // TEMP tables are automatically session-scoped and won't affect other tests
    // They are dropped automatically when the database connection closes
    await db.execute(`
      CREATE TEMP TABLE IF NOT EXISTS temp_events (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        start_date DATE,
        end_date DATE,
        venue_name TEXT,
        venue_city TEXT,
        venue_state TEXT,
        max_capacity INTEGER
      )
    `);

    await db.execute(`
      CREATE TEMP TABLE IF NOT EXISTS temp_transactions (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT,
        payment_processor TEXT,
        is_test INTEGER DEFAULT 0,
        event_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TEMP TABLE IF NOT EXISTS temp_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT UNIQUE NOT NULL,
        transaction_id TEXT REFERENCES temp_transactions(id),
        ticket_type TEXT NOT NULL,
        event_id INTEGER REFERENCES temp_events(id),
        price_cents INTEGER NOT NULL,
        status TEXT DEFAULT 'valid',
        qr_token TEXT,
        qr_access_method TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_scanned_at TIMESTAMP,
        checked_in_at TIMESTAMP,
        attendee_first_name TEXT,
        attendee_last_name TEXT,
        attendee_email TEXT
      )
    `);
  }

  async function cleanupTestData() {
    try {
      // TEMP tables automatically drop at connection close
      // Explicit cleanup between tests ensures complete isolation
      // Order matters: drop child tables (with foreign keys) first
      await db.execute('DROP TABLE IF EXISTS temp_tickets');
      await db.execute('DROP TABLE IF EXISTS temp_transactions');
      await db.execute('DROP TABLE IF EXISTS temp_events');
    } catch (error) {
      // Ignore cleanup errors - tables may not exist yet on first run
      console.warn('Cleanup warning (safe to ignore):', error.message);
    }
  }

  async function seedDashboardData() {
    // Create test event (active status - real tickets)
    testEventId = 9001;
    await db.execute({
      sql: `INSERT INTO temp_events (id, name, slug, type, status, start_date, end_date, venue_name, venue_city, venue_state, max_capacity)
            VALUES (?, 'Test Event Dashboard', 'test-event-dashboard', 'festival', 'active', '2026-05-15', '2026-05-17', 'Test Venue', 'Boulder', 'CO', 500)`,
      args: [testEventId]
    });

    // Create event with test status for test tickets
    testStatusEventId = 9003;
    await db.execute({
      sql: `INSERT INTO temp_events (id, name, slug, type, status, start_date, end_date, venue_name, venue_city, venue_state, max_capacity)
            VALUES (?, 'Test Status Event', 'test-status-event', 'festival', 'test', '2026-05-15', '2026-05-17', 'Test Venue', 'Boulder', 'CO', 500)`,
      args: [testStatusEventId]
    });

    // Verify event was inserted
    const eventCheck = await db.execute('SELECT COUNT(*) as count FROM temp_events WHERE id = ?', [testEventId]);
    if (eventCheck.rows[0].count === 0) {
      throw new Error('Failed to insert test event');
    }

    // Create test transaction
    testTransactionId = 'test_consolidation_trans_1';
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, source, payment_processor, is_test, event_id, created_at)
            VALUES (?, 'consolidation@example.com', 'completed', 'online', 'stripe', 0, ?, datetime('now'))`,
      args: [testTransactionId, testEventId]
    });

    // Create 10 valid general tickets
    for (let i = 1; i <= 10; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
          qr_token, qr_access_method, created_at,
          attendee_first_name, attendee_last_name, attendee_email
        ) VALUES (?, ?, 'General Admission', ?, 5000, 'valid', ?, 'web', datetime('now'), 'Test', 'User', 'test@example.com')`,
        args: [`test_consolidation_ticket_${i}`, testTransactionId, testEventId, `qr_${i}`]
      });
    }

    // Create 3 workshop tickets
    for (let i = 11; i <= 13; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
          qr_token, qr_access_method, created_at,
          attendee_first_name, attendee_last_name, attendee_email
        ) VALUES (?, ?, 'Workshop Pass', ?, 7500, 'valid', ?, 'web', datetime('now'), 'Workshop', 'User', 'workshop@example.com')`,
        args: [`test_consolidation_ticket_${i}`, testTransactionId, testEventId, `qr_${i}`]
      });
    }

    // Create 2 VIP tickets
    for (let i = 14; i <= 15; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
          qr_token, qr_access_method, created_at,
          attendee_first_name, attendee_last_name, attendee_email
        ) VALUES (?, ?, 'VIP Pass', ?, 12000, 'valid', ?, 'apple_wallet', datetime('now'), 'VIP', 'User', 'vip@example.com')`,
        args: [`test_consolidation_ticket_${i}`, testTransactionId, testEventId, `qr_${i}`]
      });
    }

    // Create 2 checked-in tickets
    for (let i = 16; i <= 17; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
          qr_token, qr_access_method, created_at,
          last_scanned_at, checked_in_at,
          attendee_first_name, attendee_last_name, attendee_email
        ) VALUES (?, ?, 'General Admission', ?, 5000, 'valid', ?, 'google_wallet', datetime('now'), datetime('now'), datetime('now'), 'CheckedIn', 'User', 'checkedin@example.com')`,
        args: [`test_consolidation_ticket_${i}`, testTransactionId, testEventId, `qr_${i}`]
      });
    }

    // Create 2 test tickets (using test status event created above)
    const testTransactionId2 = 'test_consolidation_trans_2';
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, source, payment_processor, is_test, event_id, created_at)
            VALUES (?, 'test@example.com', 'completed', 'online', 'stripe', 1, ?, datetime('now'))`,
      args: [testTransactionId2, testStatusEventId]
    });

    for (let i = 18; i <= 19; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
          qr_token, qr_access_method, created_at,
          attendee_first_name, attendee_last_name, attendee_email
        ) VALUES (?, ?, 'General Admission', ?, 5000, 'valid', ?, 'web', datetime('now'), 'Test', 'Mode', 'testmode@example.com')`,
        args: [`test_consolidation_ticket_${i}`, testTransactionId2, testStatusEventId, `qr_${i}`]
      });
    }

    // Create manual entry transaction and tickets
    const manualTransactionId = 'test_consolidation_manual_1';
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, source, payment_processor, is_test, event_id, created_at)
            VALUES (?, 'manual@example.com', 'completed', 'manual_entry', 'cash', 0, ?, datetime('now'))`,
      args: [manualTransactionId, testEventId]
    });

    for (let i = 20; i <= 21; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
          qr_token, qr_access_method, created_at,
          attendee_first_name, attendee_last_name, attendee_email
        ) VALUES (?, ?, 'General Admission', ?, 3000, 'valid', ?, 'web', datetime('now'), 'Manual', 'Entry', 'manual@example.com')`,
        args: [`test_consolidation_ticket_${i}`, manualTransactionId, testEventId, `qr_${i}`]
      });
    }

    // Verify data was seeded correctly
    const ticketCount = await db.execute('SELECT COUNT(*) as count FROM temp_tickets WHERE event_id = ?', [testEventId]);
    const testStatusTicketCount = await db.execute('SELECT COUNT(*) as count FROM temp_tickets WHERE event_id = ?', [testStatusEventId]);
    const transCount = await db.execute('SELECT COUNT(*) as count FROM temp_transactions WHERE event_id = ?', [testEventId]);
    const testStatusTransCount = await db.execute('SELECT COUNT(*) as count FROM temp_transactions WHERE event_id = ?', [testStatusEventId]);

    // testEventId should have 19 tickets (10 general + 3 workshop + 2 VIP + 2 checked-in + 2 manual)
    if (ticketCount.rows[0].count !== 19) {
      console.error('Expected 19 tickets for active event, got:', ticketCount.rows[0].count);
      throw new Error(`Expected 19 tickets for active event, got ${ticketCount.rows[0].count}`);
    }
    // testStatusEventId should have 2 test tickets
    if (testStatusTicketCount.rows[0].count !== 2) {
      console.error('Expected 2 tickets for test event, got:', testStatusTicketCount.rows[0].count);
      throw new Error(`Expected 2 tickets for test event, got ${testStatusTicketCount.rows[0].count}`);
    }
    // testEventId should have 2 transactions (main + manual)
    if (transCount.rows[0].count !== 2) {
      console.error('Expected 2 transactions for active event, got:', transCount.rows[0].count);
      throw new Error(`Expected 2 transactions for active event, got ${transCount.rows[0].count}`);
    }
    // testStatusEventId should have 1 test transaction
    if (testStatusTransCount.rows[0].count !== 1) {
      console.error('Expected 1 transaction for test event, got:', testStatusTransCount.rows[0].count);
      throw new Error(`Expected 1 transaction for test event, got ${testStatusTransCount.rows[0].count}`);
    }
  }

  async function getConsolidatedDashboardStats(eventId = null) {
    const ticketWhereClause = eventId ? 'AND event_id = ?' : '';
    const ticketWhereClauseWithAlias = eventId ? 'AND t.event_id = ?' : '';
    const mtOffset = `'-7 hours'`; // Mountain Time offset

    const statsParams = [];
    if (eventId) {
      statsParams.push(eventId, eventId, eventId);
    }

    const statsQuery = `
      WITH ticket_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE t.status = 'valid') as total_tickets,
          COUNT(*) FILTER (WHERE t.last_scanned_at IS NOT NULL OR t.checked_in_at IS NOT NULL) as checked_in,
          COUNT(DISTINCT t.transaction_id) as total_orders,
          COUNT(*) FILTER (WHERE t.ticket_type LIKE '%workshop%') as workshop_tickets,
          COUNT(*) FILTER (WHERE t.ticket_type LIKE '%vip%') as vip_tickets,
          COUNT(*) FILTER (WHERE date(t.created_at, ${mtOffset}) = date('now', ${mtOffset})) as today_sales,
          COUNT(*) FILTER (WHERE t.qr_token IS NOT NULL) as qr_generated,
          COUNT(*) FILTER (WHERE t.qr_access_method = 'apple_wallet') as apple_wallet_users,
          COUNT(*) FILTER (WHERE t.qr_access_method = 'google_wallet') as google_wallet_users,
          COUNT(*) FILTER (WHERE t.qr_access_method = 'web') as web_only_users,
          COUNT(*) FILTER (WHERE e.status = 'test') as test_tickets,
          COUNT(*) FILTER (WHERE (t.last_scanned_at IS NOT NULL OR t.checked_in_at IS NOT NULL)
                           AND date(COALESCE(t.last_scanned_at, t.checked_in_at), ${mtOffset}) = date('now', ${mtOffset})) as today_checkins,
          COUNT(*) FILTER (WHERE (t.last_scanned_at IS NOT NULL OR t.checked_in_at IS NOT NULL)
                           AND t.qr_access_method IN ('apple_wallet', 'google_wallet', 'samsung_wallet')) as wallet_checkins
        FROM temp_tickets t
        JOIN temp_events e ON t.event_id = e.id
        WHERE 1=1 ${ticketWhereClauseWithAlias}
      ),
      transaction_stats AS (
        SELECT
          COUNT(DISTINCT tr.id) FILTER (WHERE tr.source = 'manual_entry' AND tr.status = 'completed') as manual_transactions,
          COUNT(DISTINCT tr.id) FILTER (WHERE tr.is_test = 1) as test_transactions
        FROM temp_transactions tr
        WHERE tr.id IN (SELECT DISTINCT t.transaction_id FROM temp_tickets t WHERE 1=1 ${ticketWhereClause})
      ),
      revenue_stats AS (
        SELECT
          -- Total revenue: ALL tickets (test + real) except comp
          COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'valid'
            AND COALESCE(tr.payment_processor, '') <> 'comp'
            AND tr.status = 'completed'), 0) / 100.0 as total_revenue,
          -- Test revenue breakdown (for reporting)
          COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'valid'
            AND (tr.is_test = 1 OR e.status = 'test')
            AND COALESCE(tr.payment_processor, '') <> 'comp'
            AND tr.status = 'completed'), 0) / 100.0 as test_revenue,
          -- Manual revenue: ALL manual tickets except comp
          COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'valid'
            AND tr.source = 'manual_entry'
            AND COALESCE(tr.payment_processor, '') <> 'comp'
            AND tr.status = 'completed'), 0) / 100.0 as manual_revenue,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND t.status = 'valid') as manual_tickets,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'cash' AND t.status = 'valid') as manual_cash_tickets,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'card_terminal' AND t.status = 'valid') as manual_card_tickets,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'venmo' AND t.status = 'valid') as manual_venmo_tickets,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'comp' AND t.status = 'valid') as manual_comp_tickets
        FROM temp_tickets t
        JOIN temp_transactions tr ON t.transaction_id = tr.id
        JOIN temp_events e ON t.event_id = e.id
        WHERE 1=1 ${ticketWhereClauseWithAlias}
      )
      SELECT
        ts.*,
        tr_stats.*,
        rev.*
      FROM ticket_stats ts, transaction_stats tr_stats, revenue_stats rev
    `;

    try {
      const result = await db.execute(statsQuery, statsParams);

      // Debug logging
      if (!result.rows || result.rows.length === 0) {
        console.error('Query returned no rows:', { result, statsParams, query: statsQuery });
        throw new Error('Query returned no rows');
      }

      return result.rows[0];
    } catch (error) {
      console.error('Query execution error:', {
        error: error.message,
        code: error.code,
        statsParams,
        query: statsQuery.substring(0, 200) + '...'
      });
      throw error;
    }
  }

  test('COUNT(*) FILTER syntax works correctly', async () => {
    const result = await db.execute({
      sql: `SELECT
              COUNT(*) FILTER (WHERE t.status = 'valid') as valid_count,
              COUNT(*) FILTER (WHERE e.status = 'test') as test_count
            FROM temp_tickets t
            JOIN temp_events e ON t.event_id = e.id
            WHERE t.transaction_id LIKE 'test_consolidation_%'`
    });

    expect(result.rows[0].valid_count).toBeGreaterThan(0);
    expect(result.rows[0].test_count).toBe(2); // We created 2 test tickets
  });

  test('simple CTE query works correctly', async () => {
    const simpleQuery = `
      WITH ticket_stats AS (
        SELECT COUNT(*) FILTER (WHERE status = 'valid') as total_tickets
        FROM temp_tickets
        WHERE event_id = ?
      )
      SELECT * FROM ticket_stats
    `;

    const result = await db.execute(simpleQuery, [testEventId]);
    console.log('Simple CTE result:', result);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].total_tickets).toBe(19); // Only active event tickets
  });

  test('consolidated query returns correct total_tickets count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // We created 19 valid tickets for active event (10 general + 3 workshop + 2 VIP + 2 checked-in + 2 manual)
    // Test tickets (2) are in a separate test event
    expect(stats.total_tickets).toBe(19);
  });

  test('consolidated query returns correct checked_in count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // We created 2 checked-in tickets
    expect(stats.checked_in).toBe(2);
  });

  test('consolidated query returns correct total_orders count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // We created 2 distinct transactions for active event (main + manual)
    expect(stats.total_orders).toBe(2);
  });

  test('consolidated query returns correct workshop_tickets count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // We created 3 workshop tickets
    expect(stats.workshop_tickets).toBe(3);
  });

  test('consolidated query returns correct vip_tickets count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // We created 2 VIP tickets
    expect(stats.vip_tickets).toBe(2);
  });

  test('consolidated query returns correct today_sales count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // All active event tickets were created today
    expect(stats.today_sales).toBe(19);
  });

  test('consolidated query returns correct qr_generated count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // All active event tickets have qr_token
    expect(stats.qr_generated).toBe(19);
  });

  test('consolidated query returns correct wallet user counts', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // 2 VIP tickets use apple_wallet
    expect(stats.apple_wallet_users).toBe(2);
    // 2 checked-in tickets use google_wallet
    expect(stats.google_wallet_users).toBe(2);
    // Remaining active event tickets use web (19 - 2 - 2 = 15)
    expect(stats.web_only_users).toBe(15);
  });

  test('consolidated query returns correct test_tickets count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // Test tickets (2) are in a separate test event, not in active event
    expect(stats.test_tickets).toBe(0);
  });

  test('consolidated query returns correct test_transactions count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // Test transaction is in a separate test event, not in active event
    expect(stats.test_transactions).toBe(0);
  });

  test('consolidated query returns correct today_checkins count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // 2 tickets were checked in today
    expect(stats.today_checkins).toBe(2);
  });

  test('consolidated query returns correct wallet_checkins count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // 2 checked-in tickets use google_wallet
    expect(stats.wallet_checkins).toBe(2);
  });

  test('consolidated query returns correct manual_transactions count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // We created 1 manual entry transaction
    expect(stats.manual_transactions).toBe(1);
  });

  test('consolidated query returns correct manual_tickets count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // We created 2 manual entry tickets
    expect(stats.manual_tickets).toBe(2);
  });

  test('consolidated query returns correct manual_cash_tickets count', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // All manual tickets use cash payment
    expect(stats.manual_cash_tickets).toBe(2);
  });

  test('consolidated query returns correct revenue calculations', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // Total revenue for active event (test tickets are in separate event)
    // Total revenue = (10 * 50) + (3 * 75) + (2 * 120) + (2 * 50) + (2 * 30)
    // = 500 + 225 + 240 + 100 + 60 = 1125
    expect(stats.total_revenue).toBeCloseTo(1125, 2);

    // Test revenue breakdown (test tickets are in separate event)
    expect(stats.test_revenue).toBeCloseTo(0, 2);

    // Manual revenue should include ALL manual tickets
    // Manual revenue = 2 * 30 = 60
    expect(stats.manual_revenue).toBeCloseTo(60, 2);
  });

  test('consolidated query uses only 1 database call', async () => {
    const executeSpy = vi.spyOn(db, 'execute');

    await getConsolidatedDashboardStats(testEventId);

    // Should execute only 1 query (not 23)
    expect(executeSpy).toHaveBeenCalledTimes(1);

    executeSpy.mockRestore();
  });

  test('event filtering works with consolidated query', async () => {
    // Create a second event with tickets
    const secondEventId = 9002;
    await db.execute({
      sql: `INSERT INTO temp_events (id, name, slug, type, status, start_date, end_date, venue_name, venue_city, venue_state, max_capacity)
            VALUES (?, 'Second Test Event', 'second-test-event', 'festival', 'active', '2026-06-15', '2026-06-17', 'Test Venue 2', 'Denver', 'CO', 300)`,
      args: [secondEventId]
    });

    const secondTransactionId = 'test_consolidation_second_trans';
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, source, payment_processor, is_test, event_id, created_at)
            VALUES (?, 'second@example.com', 'completed', 'online', 'stripe', 0, ?, datetime('now'))`,
      args: [secondTransactionId, secondEventId]
    });

    // Create 5 tickets for second event
    for (let i = 1; i <= 5; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
          qr_token, qr_access_method, created_at,
          attendee_first_name, attendee_last_name, attendee_email
        ) VALUES (?, ?, 'General Admission', ?, 5000, 'valid', ?, 'web', datetime('now'), 'Second', 'Event', 'second@example.com')`,
        args: [`test_consolidation_second_${i}`, secondTransactionId, secondEventId, `qr_second_${i}`]
      });
    }

    // Get stats for first event only
    const statsEvent1 = await getConsolidatedDashboardStats(testEventId);
    expect(statsEvent1.total_tickets).toBe(19); // Active event only (no test tickets)

    // Get stats for second event only
    const statsEvent2 = await getConsolidatedDashboardStats(secondEventId);
    expect(statsEvent2.total_tickets).toBe(5);

    // Get stats for all events (no filter)
    const statsAll = await getConsolidatedDashboardStats(null);
    expect(statsAll.total_tickets).toBeGreaterThanOrEqual(26); // 19 (event1) + 5 (event2) + 2 (test) = 26

    // Cleanup second event
    await db.execute('DELETE FROM temp_tickets WHERE event_id = ?', [secondEventId]);
    await db.execute('DELETE FROM temp_transactions WHERE event_id = ?', [secondEventId]);
    await db.execute('DELETE FROM temp_events WHERE id = ?', [secondEventId]);
  });

  test('consolidated query handles empty results gracefully', async () => {
    // Query for non-existent event
    const stats = await getConsolidatedDashboardStats(99999);

    // All metrics should be 0 or 0.0
    expect(stats.total_tickets).toBe(0);
    expect(stats.checked_in).toBe(0);
    expect(stats.total_orders).toBe(0);
    expect(stats.total_revenue).toBe(0);
    expect(stats.workshop_tickets).toBe(0);
    expect(stats.vip_tickets).toBe(0);
    expect(stats.test_tickets).toBe(0);
    expect(stats.manual_tickets).toBe(0);
  });

  test('consolidated query preserves all 23 metrics', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // Verify all 23 fields exist
    const expectedFields = [
      'total_tickets',
      'checked_in',
      'total_orders',
      'total_revenue',
      'workshop_tickets',
      'vip_tickets',
      'today_sales',
      'qr_generated',
      'apple_wallet_users',
      'google_wallet_users',
      'web_only_users',
      'test_tickets',
      'test_transactions',
      'test_revenue',
      'today_checkins',
      'wallet_checkins',
      'manual_transactions',
      'manual_tickets',
      'manual_cash_tickets',
      'manual_card_tickets',
      'manual_venmo_tickets',
      'manual_comp_tickets',
      'manual_revenue'
    ];

    expectedFields.forEach(field => {
      expect(stats).toHaveProperty(field);
      expect(stats[field]).toBeDefined();
    });
  });

  test('consolidated query handles comp tickets correctly', async () => {
    // Create comp transaction
    const compTransactionId = 'test_consolidation_comp_1';
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, source, payment_processor, is_test, event_id, created_at)
            VALUES (?, 'comp@example.com', 'completed', 'manual_entry', 'comp', 0, ?, datetime('now'))`,
      args: [compTransactionId, testEventId]
    });

    // Create comp tickets
    for (let i = 1; i <= 3; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
          qr_token, qr_access_method, created_at,
          attendee_first_name, attendee_last_name, attendee_email
        ) VALUES (?, ?, 'General Admission', ?, 0, 'valid', ?, 'web', datetime('now'), 'Comp', 'User', 'comp@example.com')`,
        args: [`test_consolidation_comp_${i}`, compTransactionId, testEventId, `qr_comp_${i}`]
      });
    }

    const stats = await getConsolidatedDashboardStats(testEventId);

    // Comp tickets should be counted
    expect(stats.total_tickets).toBe(22); // 19 active event + 3 comp

    // But revenue should exclude comp tickets
    // Revenue = original 1125 (active event only) + 0 comp = 1125
    expect(stats.total_revenue).toBeCloseTo(1125, 2);

    // Manual comp tickets should be counted
    expect(stats.manual_comp_tickets).toBe(3);

    // Cleanup comp tickets
    await db.execute('DELETE FROM temp_tickets WHERE transaction_id = ?', [compTransactionId]);
    await db.execute('DELETE FROM temp_transactions WHERE id = ?', [compTransactionId]);
  });

  test('revenue includes test tickets - all test ticket scenario', async () => {
    // Simulates real-world scenario like "November Salsa Weekender" with only test tickets
    const testOnlyEventId = 9999;

    // Create test-only event (with test status)
    await db.execute({
      sql: `INSERT INTO temp_events (id, name, slug, type, status, start_date, end_date, venue_name, venue_city, venue_state)
            VALUES (?, 'All Test Tickets Event', 'all-test-event', 'festival', 'test', '2025-11-15', '2025-11-17', 'Test Venue', 'Boulder', 'CO')`,
      args: [testOnlyEventId]
    });

    // Create test transaction
    const testOnlyTransactionId = 'test-only-trans-001';
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, is_test, payment_processor, event_id)
            VALUES (?, 'testuser@example.com', 'completed', 1, 'stripe', ?)`,
      args: [testOnlyTransactionId, testOnlyEventId]
    });

    // Create 5 test tickets at $65 each
    for (let i = 0; i < 5; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (ticket_id, transaction_id, event_id, ticket_type, price_cents, status)
              VALUES (?, ?, ?, 'weekend-pass', 6500, 'valid')`,
        args: [`TEST-TICKET-${i}`, testOnlyTransactionId, testOnlyEventId]
      });
    }

    const stats = await getConsolidatedDashboardStats(testOnlyEventId);

    // Revenue should include all test tickets: 5 × $65 = $325
    expect(stats.total_revenue).toBeCloseTo(325, 2);
    expect(stats.test_revenue).toBeCloseTo(325, 2);
    expect(stats.total_tickets).toBe(5);
    expect(stats.test_tickets).toBe(5);

    // Clean up
    await db.execute('DELETE FROM temp_tickets WHERE event_id = ?', [testOnlyEventId]);
    await db.execute('DELETE FROM temp_transactions WHERE id = ?', [testOnlyTransactionId]);
    await db.execute('DELETE FROM temp_events WHERE id = ?', [testOnlyEventId]);
  });

  test('revenue excludes only comp tickets, includes test tickets', async () => {
    // Test that comp tickets are excluded but test tickets are included
    const mixedEventId = 9998;
    const mixedTestEventId = 9997;

    // Create mixed event (active status for regular tickets)
    await db.execute({
      sql: `INSERT INTO temp_events (id, name, slug, type, status, start_date, end_date, venue_name, venue_city, venue_state)
            VALUES (?, 'Mixed Ticket Types Event', 'mixed-event', 'festival', 'active', '2025-12-01', '2025-12-03', 'Mixed Venue', 'Denver', 'CO')`,
      args: [mixedEventId]
    });

    // Create test event (test status for test tickets)
    await db.execute({
      sql: `INSERT INTO temp_events (id, name, slug, type, status, start_date, end_date, venue_name, venue_city, venue_state)
            VALUES (?, 'Mixed Test Event', 'mixed-test-event', 'festival', 'test', '2025-12-01', '2025-12-03', 'Mixed Venue', 'Denver', 'CO')`,
      args: [mixedTestEventId]
    });

    // Transaction 1: Regular (non-test) with stripe
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, is_test, payment_processor, event_id)
            VALUES ('regular-trans', 'regular@example.com', 'completed', 0, 'stripe', ?)`,
      args: [mixedEventId]
    });

    // Transaction 2: Test with paypal
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, is_test, payment_processor, event_id)
            VALUES ('test-trans', 'test@example.com', 'completed', 1, 'paypal', ?)`,
      args: [mixedTestEventId]
    });

    // Transaction 3: Comp (should be excluded)
    await db.execute({
      sql: `INSERT INTO temp_transactions (id, email, status, is_test, payment_processor, event_id)
            VALUES ('comp-trans', 'comp@example.com', 'completed', 0, 'comp', ?)`,
      args: [mixedEventId]
    });

    // Create tickets: 2 regular ($50 each), 2 test ($50 each), 2 comp ($50 each)
    for (let i = 0; i < 2; i++) {
      await db.execute({
        sql: `INSERT INTO temp_tickets (ticket_id, transaction_id, event_id, ticket_type, price_cents, status)
              VALUES (?, 'regular-trans', ?, 'general', 5000, 'valid')`,
        args: [`REGULAR-${i}`, mixedEventId]
      });

      await db.execute({
        sql: `INSERT INTO temp_tickets (ticket_id, transaction_id, event_id, ticket_type, price_cents, status)
              VALUES (?, 'test-trans', ?, 'general', 5000, 'valid')`,
        args: [`TEST-${i}`, mixedTestEventId]
      });

      await db.execute({
        sql: `INSERT INTO temp_tickets (ticket_id, transaction_id, event_id, ticket_type, price_cents, status)
              VALUES (?, 'comp-trans', ?, 'general', 5000, 'valid')`,
        args: [`COMP-${i}`, mixedEventId]
      });
    }

    // Query for mixedEventId only (regular + comp tickets)
    const statsMixedEvent = await getConsolidatedDashboardStats(mixedEventId);

    // Revenue should only include regular tickets (2 × $50), exclude comp
    expect(statsMixedEvent.total_revenue).toBeCloseTo(100, 2);
    expect(statsMixedEvent.test_revenue).toBeCloseTo(0, 2);
    expect(statsMixedEvent.total_tickets).toBe(4); // 2 regular + 2 comp
    expect(statsMixedEvent.test_tickets).toBe(0);

    // Query for test event
    const statsTestEvent = await getConsolidatedDashboardStats(mixedTestEventId);
    expect(statsTestEvent.total_revenue).toBeCloseTo(100, 2); // 2 test × $50
    expect(statsTestEvent.test_revenue).toBeCloseTo(100, 2);
    expect(statsTestEvent.total_tickets).toBe(2);
    expect(statsTestEvent.test_tickets).toBe(2);

    // Query all events to verify total
    const statsAll = await getConsolidatedDashboardStats(null);
    // Should include regular + test, exclude comp: (2 × $50) + (2 × $50) = $200
    expect(statsAll.total_revenue).toBeGreaterThanOrEqual(200);

    // Clean up
    await db.execute('DELETE FROM temp_tickets WHERE event_id IN (?, ?)', [mixedEventId, mixedTestEventId]);
    await db.execute('DELETE FROM temp_transactions WHERE event_id IN (?, ?)', [mixedEventId, mixedTestEventId]);
    await db.execute('DELETE FROM temp_events WHERE id IN (?, ?)', [mixedEventId, mixedTestEventId]);
  });
});
