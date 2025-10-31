/**
 * Integration Tests: Cleanup Expired Reservations Cron Job
 * Tests the /api/cron/cleanup-expired-reservations.js endpoint
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
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {}
  );

  expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  expect(response.data).toHaveProperty('error', 'Unauthorized');

  process.env.NODE_ENV = originalEnv;
});

test('should accept valid Bearer token', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('success', true);
  expect(response.data).toHaveProperty('cleanedCount');
  expect(response.data).toHaveProperty('duration');
  expect(response.data).toHaveProperty('timestamp');
});

test('should return zero cleaned when no expired reservations exist', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.cleanedCount).toBe(0);
});

test('should cleanup expired active reservations', async () => {
  const db = await getDbClient();

  // Create a ticket type
  await db.execute({
    sql: `INSERT INTO ticket_types (id, name, price_cents, status, sold_count)
          VALUES (?, ?, ?, ?, ?)`,
    args: ['test-ticket-type', 'Test Ticket', 5000, 'available', 0]
  });

  // Create an expired reservation
  await db.execute({
    sql: `INSERT INTO ticket_reservations (
      ticket_type_id, quantity, session_id, expires_at, status
    ) VALUES (?, ?, ?, datetime('now', '-1 hour'), ?)`,
    args: ['test-ticket-type', 2, 'cs_test_expired', 'active']
  });

  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.cleanedCount).toBe(1);

  // Verify reservation was marked as expired
  const reservationCheck = await db.execute({
    sql: 'SELECT status FROM ticket_reservations WHERE session_id = ?',
    args: ['cs_test_expired']
  });
  expect(reservationCheck.rows[0].status).toBe('expired');
});

test('should not cleanup active reservations that are not expired', async () => {
  const db = await getDbClient();

  // Create a ticket type
  await db.execute({
    sql: `INSERT INTO ticket_types (id, name, price_cents, status, sold_count)
          VALUES (?, ?, ?, ?, ?)`,
    args: ['test-ticket-type-2', 'Test Ticket 2', 5000, 'available', 0]
  });

  // Create an active reservation that hasn't expired yet
  await db.execute({
    sql: `INSERT INTO ticket_reservations (
      ticket_type_id, quantity, session_id, expires_at, status
    ) VALUES (?, ?, ?, datetime('now', '+10 minutes'), ?)`,
    args: ['test-ticket-type-2', 1, 'cs_test_active', 'active']
  });

  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.cleanedCount).toBe(0);

  // Verify reservation is still active
  const reservationCheck = await db.execute({
    sql: 'SELECT status FROM ticket_reservations WHERE session_id = ?',
    args: ['cs_test_active']
  });
  expect(reservationCheck.rows[0].status).toBe('active');
});

test('should not modify fulfilled or released reservations', async () => {
  const db = await getDbClient();

  // Create a ticket type
  await db.execute({
    sql: `INSERT INTO ticket_types (id, name, price_cents, status, sold_count)
          VALUES (?, ?, ?, ?, ?)`,
    args: ['test-ticket-type-3', 'Test Ticket 3', 5000, 'available', 0]
  });

  // Create fulfilled and released reservations (should not be touched)
  await db.execute({
    sql: `INSERT INTO ticket_reservations (
      ticket_type_id, quantity, session_id, expires_at, status
    ) VALUES
      (?, ?, ?, datetime('now', '-1 hour'), ?),
      (?, ?, ?, datetime('now', '-1 hour'), ?)`,
    args: [
      'test-ticket-type-3', 1, 'cs_test_fulfilled', 'fulfilled',
      'test-ticket-type-3', 1, 'cs_test_released', 'released'
    ]
  });

  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.cleanedCount).toBe(0);

  // Verify statuses unchanged
  const reservationCheck = await db.execute({
    sql: `SELECT session_id, status FROM ticket_reservations
          WHERE session_id IN (?, ?) ORDER BY session_id`,
    args: ['cs_test_fulfilled', 'cs_test_released']
  });
  expect(reservationCheck.rows[0].status).toBe('fulfilled');
  expect(reservationCheck.rows[1].status).toBe('released');
});

test('should be idempotent - safe to run multiple times', async () => {
  const db = await getDbClient();

  // Create a ticket type
  await db.execute({
    sql: `INSERT INTO ticket_types (id, name, price_cents, status, sold_count)
          VALUES (?, ?, ?, ?, ?)`,
    args: ['test-ticket-type-4', 'Test Ticket 4', 5000, 'available', 0]
  });

  // Create multiple expired reservations
  await db.execute({
    sql: `INSERT INTO ticket_reservations (
      ticket_type_id, quantity, session_id, expires_at, status
    ) VALUES
      (?, ?, ?, datetime('now', '-2 hours'), ?),
      (?, ?, ?, datetime('now', '-1 hour'), ?)`,
    args: [
      'test-ticket-type-4', 2, 'cs_test_exp1', 'active',
      'test-ticket-type-4', 1, 'cs_test_exp2', 'active'
    ]
  });

  // First run
  const response1 = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response1.status).toBe(HTTP_STATUS.OK);
  expect(response1.data.cleanedCount).toBe(2);

  // Second run - should find nothing to clean
  const response2 = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response2.status).toBe(HTTP_STATUS.OK);
  expect(response2.data.cleanedCount).toBe(0);
});

test('should include execution duration in response', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.duration).toMatch(/^\d+ms$/);

  // Parse duration and verify it's reasonable (< 5 seconds)
  const durationMs = parseInt(response.data.duration.replace('ms', ''));
  expect(durationMs).toBeLessThan(5000);
});

test('should include timestamp in response', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('timestamp');
  expect(() => new Date(response.data.timestamp).toISOString()).not.toThrow();

  // Timestamp should be recent
  const timestamp = new Date(response.data.timestamp);
  const now = new Date();
  const diffMs = Math.abs(now - timestamp);
  expect(diffMs).toBeLessThan(60000);
});

test('should handle database errors gracefully', async () => {
  const originalDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'file:///nonexistent/database.db';

  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
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

test('should cleanup multiple expired reservations efficiently', async () => {
  const db = await getDbClient();

  // Create ticket types
  const ticketTypes = ['type-a', 'type-b', 'type-c'];
  for (const typeId of ticketTypes) {
    await db.execute({
      sql: `INSERT INTO ticket_types (id, name, price_cents, status, sold_count)
            VALUES (?, ?, ?, ?, ?)`,
      args: [typeId, `Ticket ${typeId}`, 5000, 'available', 0]
    });
  }

  // Create multiple expired reservations across different ticket types
  for (let i = 0; i < 10; i++) {
    const typeId = ticketTypes[i % ticketTypes.length];
    await db.execute({
      sql: `INSERT INTO ticket_reservations (
        ticket_type_id, quantity, session_id, expires_at, status
      ) VALUES (?, ?, ?, datetime('now', '-1 hour'), ?)`,
      args: [typeId, 1, `cs_test_bulk_${i}`, 'active']
    });
  }

  const startTime = Date.now();
  const response = await testApiHandler(
    'api/cron/cleanup-expired-reservations',
    'POST',
    '/api/cron/cleanup-expired-reservations',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );
  const endTime = Date.now();

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.cleanedCount).toBe(10);

  // Should complete quickly even with multiple reservations
  const executionTime = endTime - startTime;
  expect(executionTime).toBeLessThan(2000); // Less than 2 seconds
});
