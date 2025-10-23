import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';

describe('Dashboard Performance', () => {
  let db;
  let testEventId;
  let adminToken;

  beforeAll(async () => {
    db = await getDatabaseClient();

    // Create large test dataset
    testEventId = 9100;
    await seedLargeDataset(1000);

    // Get admin token for API tests (if needed)
    // adminToken = await getAdminToken();
  });

  afterAll(async () => {
    // Cleanup large dataset
    await cleanupLargeDataset();
  });

  async function seedLargeDataset(ticketCount) {
    console.log(`Seeding ${ticketCount} tickets for performance testing...`);

    // Create test event
    await db.execute({
      sql: `INSERT OR IGNORE INTO events (id, name, slug, type, status, start_date, end_date, venue_name, venue_city, venue_state, max_capacity)
            VALUES (?, 'Large Performance Test Event', 'large-perf-test', 'festival', 'active', '2026-05-15', '2026-05-17', 'Test Venue', 'Boulder', 'CO', 5000)`,
      args: [testEventId]
    });

    // Create transactions and tickets in batches
    const batchSize = 100;
    const batches = Math.ceil(ticketCount / batchSize);

    for (let batch = 0; batch < batches; batch++) {
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, ticketCount);

      for (let i = batchStart; i < batchEnd; i++) {
        const transactionId = `test_perf_trans_${i}`;
        const isTest = i % 10 === 0 ? 1 : 0;
        const source = i % 5 === 0 ? 'manual_entry' : 'online';
        const paymentProcessor = source === 'manual_entry'
          ? (i % 2 === 0 ? 'cash' : 'card_terminal')
          : 'stripe';

        // Create transaction
        await db.execute({
          sql: `INSERT OR IGNORE INTO transactions (id, email, status, source, payment_processor, is_test, event_id, created_at)
                VALUES (?, ?, 'completed', ?, ?, ?, ?, datetime('now', '-' || ? || ' hours'))`,
          args: [transactionId, `perf${i}@example.com`, source, paymentProcessor, isTest, testEventId, i % 24]
        });

        // Determine ticket type
        let ticketType = 'General Admission';
        if (i % 20 === 0) ticketType = 'Workshop Pass';
        else if (i % 15 === 0) ticketType = 'VIP Pass';

        // Determine access method
        let accessMethod = 'web';
        if (i % 3 === 0) accessMethod = 'apple_wallet';
        else if (i % 4 === 0) accessMethod = 'google_wallet';

        // Some tickets are checked in
        const isCheckedIn = i % 7 === 0;
        const checkedInAt = isCheckedIn ? `datetime('now', '-' || ${i % 12} || ' hours')` : 'NULL';
        const lastScannedAt = isCheckedIn ? `datetime('now', '-' || ${i % 12} || ' hours')` : 'NULL';

        // Create ticket
        await db.execute({
          sql: `INSERT OR IGNORE INTO tickets (
            ticket_id, transaction_id, ticket_type, event_id, price_cents, status,
            qr_token, qr_access_method, is_test, created_at,
            last_scanned_at, checked_in_at,
            attendee_first_name, attendee_last_name, attendee_email
          ) VALUES (?, ?, ?, ?, ?, 'valid', ?, ?, ?, datetime('now', '-' || ? || ' hours'), ${lastScannedAt}, ${checkedInAt}, 'Perf', 'User', ?)`,
          args: [
            `test_perf_ticket_${i}`,
            transactionId,
            ticketType,
            testEventId,
            ticketType === 'VIP Pass' ? 12000 : (ticketType === 'Workshop Pass' ? 7500 : 5000),
            `qr_perf_${i}`,
            accessMethod,
            isTest,
            i % 24,
            `perf${i}@example.com`
          ]
        });
      }

      if (batch % 10 === 0) {
        console.log(`  Progress: ${batchEnd}/${ticketCount} tickets seeded`);
      }
    }

    console.log(`✓ Seeded ${ticketCount} tickets successfully`);
  }

  async function cleanupLargeDataset() {
    console.log('Cleaning up performance test dataset...');
    await db.execute('DELETE FROM tickets WHERE ticket_id LIKE "test_perf_%"');
    await db.execute('DELETE FROM transactions WHERE id LIKE "test_perf_%"');
    await db.execute('DELETE FROM events WHERE id = ?', [testEventId]);
    console.log('✓ Cleanup complete');
  }

  async function measureQueryTime(queryFn) {
    const start = performance.now();
    await queryFn();
    const duration = performance.now() - start;
    return duration;
  }

  async function getConsolidatedDashboardStats(eventId = null) {
    const ticketWhereClause = eventId ? 'AND event_id = ?' : '';
    const ticketWhereClauseWithAlias = eventId ? 'AND t.event_id = ?' : '';
    const mtOffset = `'-7 hours'`;

    const statsParams = [];
    if (eventId) {
      statsParams.push(eventId, eventId, eventId);
    }

    const statsQuery = `
      WITH ticket_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'valid') as total_tickets,
          COUNT(*) FILTER (WHERE last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL) as checked_in,
          COUNT(DISTINCT transaction_id) as total_orders,
          COUNT(*) FILTER (WHERE ticket_type LIKE '%workshop%') as workshop_tickets,
          COUNT(*) FILTER (WHERE ticket_type LIKE '%vip%') as vip_tickets,
          COUNT(*) FILTER (WHERE date(created_at, ${mtOffset}) = date('now', ${mtOffset})) as today_sales,
          COUNT(*) FILTER (WHERE qr_token IS NOT NULL) as qr_generated,
          COUNT(*) FILTER (WHERE qr_access_method = 'apple_wallet') as apple_wallet_users,
          COUNT(*) FILTER (WHERE qr_access_method = 'google_wallet') as google_wallet_users,
          COUNT(*) FILTER (WHERE qr_access_method = 'web') as web_only_users,
          COUNT(*) FILTER (WHERE is_test = 1) as test_tickets,
          COUNT(*) FILTER (WHERE (last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL)
                           AND date(COALESCE(last_scanned_at, checked_in_at), ${mtOffset}) = date('now', ${mtOffset})) as today_checkins,
          COUNT(*) FILTER (WHERE (last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL)
                           AND qr_access_method IN ('apple_wallet', 'google_wallet', 'samsung_wallet')) as wallet_checkins
        FROM tickets
        WHERE 1=1 ${ticketWhereClause}
      ),
      transaction_stats AS (
        SELECT
          COUNT(DISTINCT id) FILTER (WHERE source = 'manual_entry' AND status = 'completed') as manual_transactions,
          COUNT(DISTINCT id) FILTER (WHERE is_test = 1) as test_transactions
        FROM transactions
        WHERE id IN (SELECT DISTINCT transaction_id FROM tickets WHERE 1=1 ${ticketWhereClause})
      ),
      revenue_stats AS (
        SELECT
          COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'valid'
            AND COALESCE(tr.payment_processor, '') <> 'comp'
            AND tr.status = 'completed'), 0) / 100.0 as total_revenue,
          COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'valid'
            AND tr.is_test = 1
            AND COALESCE(tr.payment_processor, '') <> 'comp'
            AND tr.status = 'completed'), 0) / 100.0 as test_revenue,
          COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'valid'
            AND tr.source = 'manual_entry'
            AND COALESCE(tr.payment_processor, '') <> 'comp'
            AND tr.status = 'completed'), 0) / 100.0 as manual_revenue,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND t.status = 'valid') as manual_tickets,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'cash' AND t.status = 'valid') as manual_cash_tickets,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'card_terminal' AND t.status = 'valid') as manual_card_tickets,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'venmo' AND t.status = 'valid') as manual_venmo_tickets,
          COUNT(*) FILTER (WHERE tr.source = 'manual_entry' AND tr.payment_processor = 'comp' AND t.status = 'valid') as manual_comp_tickets
        FROM tickets t
        JOIN transactions tr ON t.transaction_id = tr.id
        WHERE 1=1 ${ticketWhereClauseWithAlias}
      )
      SELECT
        ts.*,
        tr_stats.*,
        rev.*
      FROM ticket_stats ts, transaction_stats tr_stats, revenue_stats rev
    `;

    const result = await db.execute(statsQuery, statsParams);
    return result.rows[0];
  }

  test('consolidated query completes in <100ms with 1000 tickets', async () => {
    const duration = await measureQueryTime(() => getConsolidatedDashboardStats(testEventId));

    console.log(`Query execution time: ${duration.toFixed(2)}ms`);

    // CI-friendly threshold - use 200ms for CI environments, 100ms for local
    const threshold = process.env.CI ? 200 : 100;

    if (duration > threshold) {
      console.warn(`⚠️ Query took ${duration.toFixed(2)}ms (target: <${threshold}ms). May be acceptable in CI.`);
    }

    expect(duration).toBeLessThan(threshold);
  }, 30000); // 30s timeout for seeding

  test('consolidated query returns accurate counts with 1000 tickets', async () => {
    const stats = await getConsolidatedDashboardStats(testEventId);

    // Verify stats are reasonable
    expect(stats.total_tickets).toBe(1000);
    expect(stats.total_orders).toBe(1000);
    expect(stats.qr_generated).toBe(1000);

    // Workshop tickets (every 20th ticket)
    expect(stats.workshop_tickets).toBeGreaterThan(40);
    expect(stats.workshop_tickets).toBeLessThan(60);

    // VIP tickets (every 15th ticket, excluding workshop overlap)
    expect(stats.vip_tickets).toBeGreaterThan(50);
    expect(stats.vip_tickets).toBeLessThan(80);

    // Test tickets (every 10th ticket)
    expect(stats.test_tickets).toBe(100);
    expect(stats.test_transactions).toBe(100);

    // Checked in (every 7th ticket)
    expect(stats.checked_in).toBeGreaterThan(130);
    expect(stats.checked_in).toBeLessThan(150);

    // Manual tickets (every 5th ticket)
    expect(stats.manual_tickets).toBe(200);
    expect(stats.manual_transactions).toBe(200);

    console.log('Stats validation:', {
      total_tickets: stats.total_tickets,
      workshop_tickets: stats.workshop_tickets,
      vip_tickets: stats.vip_tickets,
      test_tickets: stats.test_tickets,
      checked_in: stats.checked_in,
      manual_tickets: stats.manual_tickets
    });
  }, 30000);

  test('query uses database indexes effectively', async () => {
    // Get EXPLAIN QUERY PLAN
    const ticketWhereClause = `AND event_id = ${testEventId}`;
    const ticketWhereClauseWithAlias = `AND t.event_id = ${testEventId}`;
    const mtOffset = `'-7 hours'`;

    const explainQuery = `
      EXPLAIN QUERY PLAN
      WITH ticket_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'valid') as total_tickets,
          COUNT(*) FILTER (WHERE last_scanned_at IS NOT NULL OR checked_in_at IS NOT NULL) as checked_in,
          COUNT(DISTINCT transaction_id) as total_orders
        FROM tickets
        WHERE 1=1 ${ticketWhereClause}
      )
      SELECT * FROM ticket_stats
    `;

    const result = await db.execute(explainQuery);
    const plan = result.rows.map(row => row.detail || '').join('\n');

    console.log('Query execution plan:', plan);

    // Verify indexes are being used
    // Should use idx_tickets_status_created_registration or similar
    expect(plan).toMatch(/USING INDEX|SEARCH/i);
  }, 30000);

  test('multiple concurrent queries complete successfully', async () => {
    const concurrentRequests = 10;

    const promises = Array.from({ length: concurrentRequests }, async (_, i) => {
      const start = performance.now();
      const stats = await getConsolidatedDashboardStats(testEventId);
      const duration = performance.now() - start;

      return { stats, duration, index: i };
    });

    const results = await Promise.all(promises);

    // All queries should complete
    expect(results).toHaveLength(concurrentRequests);

    // All should return same counts
    const firstStats = results[0].stats;
    results.forEach(({ stats, duration, index }) => {
      expect(stats.total_tickets).toBe(firstStats.total_tickets);
      console.log(`  Request ${index + 1}: ${duration.toFixed(2)}ms`);
    });

    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / concurrentRequests;
    console.log(`Average query time: ${avgDuration.toFixed(2)}ms`);

    // Average should still be fast
    expect(avgDuration).toBeLessThan(150);
  }, 60000);

  test('query performance scales with event filtering', async () => {
    // Query with event filter
    const filteredStart = performance.now();
    const filteredStats = await getConsolidatedDashboardStats(testEventId);
    const filteredDuration = performance.now() - filteredStart;

    // Query without event filter (all events)
    const unfilteredStart = performance.now();
    const unfilteredStats = await getConsolidatedDashboardStats(null);
    const unfilteredDuration = performance.now() - unfilteredStart;

    console.log('Performance comparison:');
    console.log(`  With event filter: ${filteredDuration.toFixed(2)}ms (${filteredStats.total_tickets} tickets)`);
    console.log(`  Without filter: ${unfilteredDuration.toFixed(2)}ms (${unfilteredStats.total_tickets} tickets)`);

    // Filtered query should be faster or similar
    expect(filteredDuration).toBeLessThan(200);
    expect(unfilteredDuration).toBeLessThan(300);
  }, 30000);

  test('query handles complex filter combinations efficiently', async () => {
    const start = performance.now();

    // Get stats
    const stats = await getConsolidatedDashboardStats(testEventId);

    const duration = performance.now() - start;

    console.log('Complex filter performance:', {
      duration: `${duration.toFixed(2)}ms`,
      metrics_computed: 23,
      tickets_processed: stats.total_tickets
    });

    // Should complete quickly even with all filters
    expect(duration).toBeLessThan(100);

    // Verify all 23 metrics are computed
    expect(Object.keys(stats)).toHaveLength(23);
  }, 30000);
});
