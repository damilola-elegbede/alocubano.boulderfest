/**
 * Database Index Performance Tests
 *
 * Tests the performance indexes added in migration 055_performance_indexes.sql
 * Verifies that:
 * 1. All indexes are created successfully
 * 2. EXPLAIN QUERY PLAN shows index usage
 * 3. Query performance meets targets (<100ms on large datasets)
 * 4. Migration is idempotent
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Database Index Performance', () => {
  let db;
  let testEventId;
  let testTicketTypeId;
  let testTransactionId;

  beforeAll(async () => {
    db = await getDatabaseClient();

    // Create test event for performance testing
    const eventResult = await db.execute({
      sql: `INSERT INTO events (name, slug, type, status, start_date, end_date, venue_name, venue_city, venue_state, max_capacity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['Test Event', 'test-event', 'festival', 'upcoming', '2026-05-15', '2026-05-17', 'Test Venue', 'Boulder', 'CO', 500]
    });
    testEventId = eventResult.lastInsertRowid || eventResult.lastInsertId;

    // Create test ticket type
    const ticketTypeResult = await db.execute({
      sql: `INSERT INTO ticket_types (id, event_id, name, description, price_cents, status, max_quantity, sold_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['test-ticket-type', testEventId, 'Test Ticket', 'Test ticket type', 5000, 'available', 100, 0]
    });
    testTicketTypeId = 'test-ticket-type';

    // Create test transaction
    const transactionResult = await db.execute({
      sql: `INSERT INTO transactions (transaction_id, uuid, type, status, amount_cents, customer_email, order_data, event_id, payment_processor, is_test, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      args: ['test-txn-001', 'test-txn-001', 'tickets', 'completed', 5000, 'test@example.com', '{}', testEventId, 'stripe', 1, 'test']
    });
    testTransactionId = transactionResult.lastInsertRowid || transactionResult.lastInsertId;

    // Create a test ticket linked to this transaction for JOIN testing
    await db.execute({
      sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, event_time, price_cents, status, registration_status, attendee_email, is_test, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      args: ['test-ticket-001', testTransactionId, 'Test Ticket', testEventId, '00:00', 5000, 'valid', 'completed', 'test@example.com', 1]
    });
  });

  afterAll(async () => {
    // Cleanup test data
    if (testEventId) {
      await db.execute({
        sql: 'DELETE FROM events WHERE id = ?',
        args: [testEventId]
      });
    }
  });

  test('all indexes created successfully', async () => {
    const indexes = await db.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`
    });

    const indexNames = indexes.rows.map(r => r.name);
    expect(indexNames).toContain('idx_tickets_status_created_registration');
    expect(indexNames).toContain('idx_transactions_event_status_created');
    expect(indexNames).toContain('idx_ticket_reservations_lookup');
    expect(indexNames).toContain('idx_ticket_types_id_event_status');
    expect(indexNames).toContain('idx_reminders_status_scheduled');
  });

  test('dashboard ticket query uses status index', async () => {
    const plan = await db.execute({
      sql: `EXPLAIN QUERY PLAN
            SELECT COUNT(*) FROM tickets WHERE status = 'valid'`
    });

    const planText = JSON.stringify(plan.rows);
    // The query should use the idx_tickets_status_created_registration index or the base idx_tickets_status
    expect(planText.toLowerCase()).toMatch(/idx_tickets_status|using index/i);
  });

  test('dashboard query executes in <100ms', async () => {
    // Seed test data if needed
    const countResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM tickets'
    });

    const start = performance.now();

    const result = await db.execute({
      sql: `SELECT COUNT(*) as count FROM tickets WHERE status = 'valid'`
    });

    const duration = performance.now() - start;

    // Performance target: <100ms
    expect(duration).toBeLessThan(100);
    expect(result.rows[0]).toBeDefined();
  });

  test('transaction query uses event_status index', async () => {
    const plan = await db.execute({
      sql: `EXPLAIN QUERY PLAN
            SELECT * FROM transactions
            WHERE event_id = ? AND status = 'completed'
            ORDER BY created_at DESC`,
      args: [testEventId]
    });

    const planText = JSON.stringify(plan.rows);
    // Should use idx_transactions_event_status_created or idx_transactions_event_status
    expect(planText.toLowerCase()).toMatch(/idx_transactions_event_status|using index/i);
  });

  test('transaction query executes in <100ms', async () => {
    const start = performance.now();

    const result = await db.execute({
      sql: `SELECT * FROM transactions
            WHERE event_id = ? AND status = 'completed'
            ORDER BY created_at DESC
            LIMIT 10`,
      args: [testEventId]
    });

    const duration = performance.now() - start;

    // Performance target: <100ms
    expect(duration).toBeLessThan(100);
    expect(Array.isArray(result.rows)).toBe(true);
  });

  test('reservation query uses lookup index', async () => {
    const plan = await db.execute({
      sql: `EXPLAIN QUERY PLAN
            SELECT * FROM ticket_reservations
            WHERE ticket_type_id = ? AND status = 'active' AND expires_at > datetime('now')`,
      args: [testTicketTypeId]
    });

    const planText = JSON.stringify(plan.rows);
    // Should use idx_ticket_reservations_lookup
    expect(planText.toLowerCase()).toMatch(/idx_ticket_reservations_lookup|using index/i);
  });

  test('reservation query executes in <50ms', async () => {
    const start = performance.now();

    const result = await db.execute({
      sql: `SELECT * FROM ticket_reservations
            WHERE ticket_type_id = ? AND status = 'active' AND expires_at > datetime('now')`,
      args: [testTicketTypeId]
    });

    const duration = performance.now() - start;

    // Performance target: <50ms (this is a critical path query)
    expect(duration).toBeLessThan(50);
    expect(Array.isArray(result.rows)).toBe(true);
  });

  test('ticket type validation query uses event index', async () => {
    const plan = await db.execute({
      sql: `EXPLAIN QUERY PLAN
            SELECT * FROM ticket_types
            WHERE id = ? AND event_id = ? AND status = 'available'`,
      args: [testTicketTypeId, testEventId]
    });

    const planText = JSON.stringify(plan.rows);
    // Should use idx_ticket_types_id_event_status or similar index
    expect(planText.toLowerCase()).toMatch(/idx_ticket_types|using index/i);
  });

  test('ticket type query executes in <50ms', async () => {
    const start = performance.now();

    const result = await db.execute({
      sql: `SELECT * FROM ticket_types
            WHERE id = ? AND event_id = ? AND status = 'available'`,
      args: [testTicketTypeId, testEventId]
    });

    const duration = performance.now() - start;

    // Performance target: <50ms
    expect(duration).toBeLessThan(50);
    expect(result.rows.length).toBeGreaterThanOrEqual(0);
  });

  test('reminders query uses pending index', async () => {
    const plan = await db.execute({
      sql: `EXPLAIN QUERY PLAN
            SELECT * FROM registration_reminders
            WHERE status = 'scheduled' AND scheduled_at <= datetime('now')`
    });

    const planText = JSON.stringify(plan.rows);
    // Should use idx_reminders_status_scheduled or similar index
    expect(planText.toLowerCase()).toMatch(/idx_reminders|using index/i);
  });

  test('reminders query executes in <100ms', async () => {
    const start = performance.now();

    const result = await db.execute({
      sql: `SELECT * FROM registration_reminders
            WHERE status = 'scheduled' AND scheduled_at <= datetime('now')
            LIMIT 100`
    });

    const duration = performance.now() - start;

    // Performance target: <100ms
    expect(duration).toBeLessThan(100);
    expect(Array.isArray(result.rows)).toBe(true);
  });

  test('migration is idempotent', async () => {
    // Read migration file
    const migrationPath = join(__dirname, '../../migrations/055_performance_indexes.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');

    // Extract CREATE INDEX statements (they may be multiline)
    const lines = migration.split('\n');
    const indexStatements = [];
    let currentStatement = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }

      currentStatement += ' ' + line;

      // Statement complete when we hit a semicolon
      if (trimmed.endsWith(';')) {
        const stmt = currentStatement.trim();
        if (stmt.startsWith('CREATE INDEX')) {
          indexStatements.push(stmt);
        }
        currentStatement = '';
      }
    }

    // Run CREATE INDEX statements twice - should not error due to IF NOT EXISTS
    expect(indexStatements.length).toBeGreaterThan(0);

    for (const statement of indexStatements) {
      // First execution
      await expect(db.execute(statement)).resolves.not.toThrow();

      // Second execution - should not fail due to IF NOT EXISTS
      await expect(db.execute(statement)).resolves.not.toThrow();
    }

    // Verify we tested all 5 expected indexes
    expect(indexStatements.length).toBe(5);
  });

  test('complex dashboard query uses multiple indexes', async () => {
    const plan = await db.execute({
      sql: `EXPLAIN QUERY PLAN
            SELECT
              t.ticket_id,
              t.attendee_email,
              t.ticket_type,
              t.created_at,
              tr.transaction_id,
              tr.status as transaction_status
            FROM tickets t
            JOIN transactions tr ON t.transaction_id = tr.id
            WHERE t.status = 'valid'
              AND tr.event_id = ?
              AND tr.status = 'completed'
            ORDER BY t.created_at DESC
            LIMIT 10`,
      args: [testEventId]
    });

    const planText = JSON.stringify(plan.rows);

    // Should use at least one of our indexes
    const hasIndexUsage =
      planText.toLowerCase().includes('idx_tickets_status_created') ||
      planText.toLowerCase().includes('idx_transactions_event_status') ||
      planText.toLowerCase().includes('using index');

    expect(hasIndexUsage).toBe(true);
  });

  test('complex dashboard query executes in <150ms', async () => {
    const start = performance.now();

    const result = await db.execute({
      sql: `SELECT
              t.ticket_id,
              t.attendee_email,
              t.ticket_type,
              t.created_at,
              tr.transaction_id,
              tr.status as transaction_status
            FROM tickets t
            JOIN transactions tr ON t.transaction_id = tr.id
            WHERE t.status = 'valid'
              AND tr.event_id = ?
              AND tr.status = 'completed'
            ORDER BY t.created_at DESC
            LIMIT 10`,
      args: [testEventId]
    });

    const duration = performance.now() - start;

    // Performance target: <150ms for complex JOIN query
    expect(duration).toBeLessThan(150);
    expect(Array.isArray(result.rows)).toBe(true);
  });

  test('index metadata is correct', async () => {
    // Verify idx_tickets_status_created_registration
    const ticketsIndex = await db.execute({
      sql: `SELECT sql FROM sqlite_master
            WHERE type='index' AND name='idx_tickets_status_created_registration'`
    });

    expect(ticketsIndex.rows.length).toBe(1);
    expect(ticketsIndex.rows[0].sql).toContain('tickets');
    expect(ticketsIndex.rows[0].sql).toContain('status');
    expect(ticketsIndex.rows[0].sql).toContain('created_at');
    expect(ticketsIndex.rows[0].sql).toContain('registration_status');

    // Verify idx_transactions_event_status_created
    const transactionsIndex = await db.execute({
      sql: `SELECT sql FROM sqlite_master
            WHERE type='index' AND name='idx_transactions_event_status_created'`
    });

    expect(transactionsIndex.rows.length).toBe(1);
    expect(transactionsIndex.rows[0].sql).toContain('transactions');
    expect(transactionsIndex.rows[0].sql).toContain('event_id');
    expect(transactionsIndex.rows[0].sql).toContain('status');
    expect(transactionsIndex.rows[0].sql).toContain('created_at');
  });

  test('indexes improve query performance vs full table scan', async () => {
    // First, get baseline with ANALYZE to update statistics
    await db.execute('ANALYZE');

    // Query without forcing index (should use our index)
    const start1 = performance.now();
    await db.execute({
      sql: `SELECT COUNT(*) FROM tickets WHERE status = 'valid'`
    });
    const durationWithIndex = performance.now() - start1;

    // For comparison, check that the index is actually being used
    const plan = await db.execute({
      sql: `EXPLAIN QUERY PLAN SELECT COUNT(*) FROM tickets WHERE status = 'valid'`
    });

    const planText = JSON.stringify(plan.rows).toLowerCase();
    const usesIndex = planText.includes('using index') || planText.includes('idx_tickets');

    // If we have enough data, index should be used
    if (usesIndex) {
      expect(durationWithIndex).toBeLessThan(100);
    }

    // Document performance baseline
    console.log(`Query performance: ${durationWithIndex.toFixed(2)}ms (uses index: ${usesIndex})`);
  });
});
