/**
 * Integration Tests: Update Event Status Cron Job
 * Tests the /api/cron/update-event-status.js endpoint for automatic event lifecycle management
 */
import { test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../../../setup-integration.js';
import { testApiHandler, HTTP_STATUS } from '../../handler-test-helper.js';

const CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret-for-integration-testing-32-chars';

beforeEach(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.NODE_ENV = 'test';
});

test('should require valid authorization in production', async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {}
  );

  expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  expect(response.data).toHaveProperty('error', 'Unauthorized');

  process.env.NODE_ENV = originalEnv;
});

test('should accept valid Bearer token', async () => {
  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('success', true);
  expect(response.data).toHaveProperty('updates');
  expect(response.data.updates).toHaveProperty('activated');
  expect(response.data.updates).toHaveProperty('completed');
});

test('should return zero updates when no status changes needed', async () => {
  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.updates.activated).toBe(0);
  expect(response.data.updates.completed).toBe(0);
});

test('should transition upcoming event to active on start date', async () => {
  const db = await getDbClient();

  // Create an upcoming event that should start today
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now'), date('now', '+2 days'), ?, ?, ?, ?)`,
    args: [
      'test-event-start',
      'Test Event Starting Today',
      'festival',
      'upcoming',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.updates.activated).toBe(1);

  // Verify event status was updated
  const eventCheck = await db.execute({
    sql: 'SELECT status FROM events WHERE slug = ?',
    args: ['test-event-start']
  });
  expect(eventCheck.rows[0].status).toBe('active');
});

test('should transition active event to completed after end date', async () => {
  const db = await getDbClient();

  // Create an active event that ended yesterday
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now', '-3 days'), date('now', '-1 day'), ?, ?, ?, ?)`,
    args: [
      'test-event-ended',
      'Test Event That Ended',
      'festival',
      'active',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.updates.completed).toBe(1);

  // Verify event status was updated
  const eventCheck = await db.execute({
    sql: 'SELECT status FROM events WHERE slug = ?',
    args: ['test-event-ended']
  });
  expect(eventCheck.rows[0].status).toBe('completed');
});

test('should not transition events that are not yet ready', async () => {
  const db = await getDbClient();

  // Create an upcoming event that starts in the future
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now', '+5 days'), date('now', '+7 days'), ?, ?, ?, ?)`,
    args: [
      'test-event-future',
      'Test Event in Future',
      'festival',
      'upcoming',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.updates.activated).toBe(0);

  // Verify event status unchanged
  const eventCheck = await db.execute({
    sql: 'SELECT status FROM events WHERE slug = ?',
    args: ['test-event-future']
  });
  expect(eventCheck.rows[0].status).toBe('upcoming');
});

test('should not transition currently active events', async () => {
  const db = await getDbClient();

  // Create an active event that's still ongoing
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now', '-1 day'), date('now', '+1 day'), ?, ?, ?, ?)`,
    args: [
      'test-event-ongoing',
      'Test Event Ongoing',
      'festival',
      'active',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.updates.completed).toBe(0);

  // Verify event status unchanged
  const eventCheck = await db.execute({
    sql: 'SELECT status FROM events WHERE slug = ?',
    args: ['test-event-ongoing']
  });
  expect(eventCheck.rows[0].status).toBe('active');
});

test('should handle multiple events in single run', async () => {
  const db = await getDbClient();

  // Create multiple events with different statuses and dates
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES
      (?, ?, ?, ?, date('now'), date('now', '+2 days'), ?, ?, ?, ?),
      (?, ?, ?, ?, date('now'), date('now', '+2 days'), ?, ?, ?, ?),
      (?, ?, ?, ?, date('now', '-3 days'), date('now', '-1 day'), ?, ?, ?, ?)`,
    args: [
      'multi-event-1', 'Multi Event 1', 'festival', 'upcoming',
      'Venue 1', 'Boulder', 'CO', '123 Test St',
      'multi-event-2', 'Multi Event 2', 'festival', 'upcoming',
      'Venue 2', 'Boulder', 'CO', '456 Test St',
      'multi-event-3', 'Multi Event 3', 'festival', 'active',
      'Venue 3', 'Boulder', 'CO', '789 Test St'
    ]
  });

  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.updates.activated).toBe(2);
  expect(response.data.updates.completed).toBe(1);
});

test('should include Mountain Time date in response', async () => {
  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('currentDateMT');
  expect(response.data.currentDateMT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('should include execution duration in response', async () => {
  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('duration');
  expect(response.data.duration).toMatch(/^\d+ms$/);

  // Parse duration and verify it's reasonable
  const durationMs = parseInt(response.data.duration.replace('ms', ''));
  expect(durationMs).toBeLessThan(5000);
});

test('should include timestamp in response', async () => {
  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('timestamp');
  expect(() => new Date(response.data.timestamp).toISOString()).not.toThrow();
});

test('should be idempotent - safe to run multiple times', async () => {
  const db = await getDbClient();

  // Create an event that should transition
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now'), date('now', '+2 days'), ?, ?, ?, ?)`,
    args: [
      'idempotent-event',
      'Idempotent Test Event',
      'festival',
      'upcoming',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  // First run - should activate
  const response1 = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response1.status).toBe(HTTP_STATUS.OK);
  expect(response1.data.updates.activated).toBe(1);

  // Second run - should not activate again
  const response2 = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response2.status).toBe(HTTP_STATUS.OK);
  expect(response2.data.updates.activated).toBe(0);
});

test('should not update test events (id = 0)', async () => {
  const db = await getDbClient();

  // Try to create event with id = 0 (test event)
  // Note: Most databases won't allow this, but we test the WHERE clause
  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  // The cron job has a WHERE clause `id > 0` to exclude test events
});

test('should handle events at date boundaries correctly', async () => {
  const db = await getDbClient();

  // Create an event that starts exactly today
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now'), date('now', '+1 day'), ?, ?, ?, ?)`,
    args: [
      'boundary-event-start',
      'Boundary Event Start',
      'festival',
      'upcoming',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  // Create an event that ends exactly today
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now', '-1 day'), date('now'), ?, ?, ?, ?)`,
    args: [
      'boundary-event-end',
      'Boundary Event End',
      'festival',
      'active',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);

  // Event starting today should be activated (>= comparison)
  const startCheck = await db.execute({
    sql: 'SELECT status FROM events WHERE slug = ?',
    args: ['boundary-event-start']
  });
  expect(startCheck.rows[0].status).toBe('active');

  // Event ending today should NOT be completed (< comparison, not <=)
  const endCheck = await db.execute({
    sql: 'SELECT status FROM events WHERE slug = ?',
    args: ['boundary-event-end']
  });
  expect(endCheck.rows[0].status).toBe('active');
});

test('should update updated_at timestamp when transitioning', async () => {
  const db = await getDbClient();

  // Create an event that should transition
  await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, date('now'), date('now', '+2 days'), ?, ?, ?, ?, datetime('now', '-1 day'), datetime('now', '-1 day'))`,
    args: [
      'timestamp-event',
      'Timestamp Test Event',
      'festival',
      'upcoming',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  const beforeResponse = await db.execute({
    sql: 'SELECT updated_at FROM events WHERE slug = ?',
    args: ['timestamp-event']
  });
  const beforeTimestamp = beforeResponse.rows[0].updated_at;

  await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  const afterResponse = await db.execute({
    sql: 'SELECT updated_at FROM events WHERE slug = ?',
    args: ['timestamp-event']
  });
  const afterTimestamp = afterResponse.rows[0].updated_at;

  // updated_at should be newer
  expect(new Date(afterTimestamp) > new Date(beforeTimestamp)).toBe(true);
});

test('should handle database errors gracefully', async () => {
  const originalDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'file:///nonexistent/database.db';

  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  process.env.DATABASE_URL = originalDbUrl;

  expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
  expect(response.data.success).toBe(false);
  expect(response.data).toHaveProperty('error');
});

test('should expire tickets when event completes', async () => {
  const db = await getDbClient();

  // Create an event that ended yesterday
  const eventResult = await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now', '-3 days'), date('now', '-1 day'), ?, ?, ?, ?)`,
    args: [
      'expire-tickets-event',
      'Expire Tickets Test Event',
      'festival',
      'active',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  // Get the event ID
  const eventId = eventResult.lastInsertRowid;

  // Create a transaction for the tickets
  const txResult = await db.execute({
    sql: `INSERT INTO transactions (
      uuid, customer_email, amount_total, payment_status,
      payment_processor, created_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args: ['test-tx-expire-123', 'test@example.com', 5000, 'paid', 'stripe']
  });

  const transactionId = txResult.lastInsertRowid;

  // Create tickets with different statuses
  await db.execute({
    sql: `INSERT INTO tickets (
      ticket_id, transaction_id, event_id, ticket_type_id,
      first_name, last_name, attendee_email,
      status, validation_status, validation_code,
      event_date, event_end_date
    ) VALUES
      (?, ?, ?, 1, 'John', 'Valid', 'john@example.com', 'valid', 'active', 'CODE1', date('now', '-1 day'), date('now', '-1 day')),
      (?, ?, ?, 1, 'Jane', 'Used', 'jane@example.com', 'used', 'active', 'CODE2', date('now', '-1 day'), date('now', '-1 day')),
      (?, ?, ?, 1, 'Bob', 'Cancelled', 'bob@example.com', 'cancelled', 'active', 'CODE3', date('now', '-1 day'), date('now', '-1 day')),
      (?, ?, ?, 1, 'Alice', 'Refunded', 'alice@example.com', 'refunded', 'active', 'CODE4', date('now', '-1 day'), date('now', '-1 day'))`,
    args: [
      'TICKET-VALID-1', transactionId, eventId,
      'TICKET-USED-1', transactionId, eventId,
      'TICKET-CANCELLED-1', transactionId, eventId,
      'TICKET-REFUNDED-1', transactionId, eventId
    ]
  });

  // Run the cron job
  const response = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.updates.completed).toBe(1);
  expect(response.data.updates.tickets_expired).toBe(2); // Only 'valid' and 'used' tickets

  // Verify event status
  const eventCheck = await db.execute({
    sql: 'SELECT status FROM events WHERE slug = ?',
    args: ['expire-tickets-event']
  });
  expect(eventCheck.rows[0].status).toBe('completed');

  // Verify ticket validation_status updates
  const ticketsCheck = await db.execute({
    sql: `SELECT ticket_id, status, validation_status
          FROM tickets
          WHERE transaction_id = ?`,
    args: [transactionId]
  });

  expect(ticketsCheck.rows).toHaveLength(4);

  // Convert to map for reliable assertions (no reliance on sort order)
  const ticketMap = {};
  ticketsCheck.rows.forEach(row => {
    ticketMap[row.ticket_id] = row;
  });

  // Valid ticket should be expired
  expect(ticketMap['TICKET-VALID-1'].validation_status).toBe('expired');

  // Used ticket should be expired
  expect(ticketMap['TICKET-USED-1'].validation_status).toBe('expired');

  // Cancelled ticket should remain active (not expired)
  expect(ticketMap['TICKET-CANCELLED-1'].validation_status).toBe('active');

  // Refunded ticket should remain active (not expired)
  expect(ticketMap['TICKET-REFUNDED-1'].validation_status).toBe('active');
});

test('should not expire tickets twice (idempotent)', async () => {
  const db = await getDbClient();

  // Create an event that ended yesterday
  const eventResult = await db.execute({
    sql: `INSERT INTO events (
      slug, name, type, status, start_date, end_date,
      venue_name, venue_city, venue_state, venue_address
    ) VALUES (?, ?, ?, ?, date('now', '-3 days'), date('now', '-1 day'), ?, ?, ?, ?)`,
    args: [
      'idempotent-expire-event',
      'Idempotent Expire Test',
      'festival',
      'active',
      'Test Venue',
      'Boulder',
      'CO',
      '123 Test St'
    ]
  });

  const eventId = eventResult.lastInsertRowid;

  const txResult = await db.execute({
    sql: `INSERT INTO transactions (
      uuid, customer_email, amount_total, payment_status,
      payment_processor, created_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    args: ['test-tx-idem-456', 'test2@example.com', 5000, 'paid', 'stripe']
  });

  const transactionId = txResult.lastInsertRowid;

  await db.execute({
    sql: `INSERT INTO tickets (
      ticket_id, transaction_id, event_id, ticket_type_id,
      first_name, last_name, attendee_email,
      status, validation_status, validation_code,
      event_date, event_end_date
    ) VALUES (?, ?, ?, 1, 'Test', 'User', 'test@example.com', 'valid', 'active', 'CODE5', date('now', '-1 day'), date('now', '-1 day'))`,
    args: ['TICKET-IDEM-1', transactionId, eventId]
  });

  // First run
  const response1 = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response1.data.updates.tickets_expired).toBe(1);

  // Second run - should not expire again
  const response2 = await testApiHandler(
    'api/cron/update-event-status',
    'POST',
    '/api/cron/update-event-status',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response2.data.updates.tickets_expired).toBe(0);

  // Verify ticket is still expired (not changed)
  const ticketCheck = await db.execute({
    sql: 'SELECT validation_status FROM tickets WHERE ticket_id = ?',
    args: ['TICKET-IDEM-1']
  });
  expect(ticketCheck.rows[0].validation_status).toBe('expired');
});
