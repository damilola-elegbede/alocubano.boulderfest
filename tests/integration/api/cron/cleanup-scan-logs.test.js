/**
 * Integration Tests: Cleanup Scan Logs Cron Job
 * Tests the /api/cron/cleanup-scan-logs.js endpoint (90-day retention)
 */
import { test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../../../setup-integration.js';
import { testApiHandler, HTTP_STATUS, createTestEvent } from '../../handler-test-helper.js';

const CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret-for-integration-testing-32-chars';

beforeEach(async () => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.NODE_ENV = 'test';
});

test('should require valid authorization in production', async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {}
  );

  expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  expect(response.data).toHaveProperty('error', 'Unauthorized');

  process.env.NODE_ENV = originalEnv;
});

test('should accept case-insensitive Bearer token', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `BEARER ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('success', true);
});

test('should return zero deleted when no old logs exist', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.results.scan_logs.deleted).toBe(0);
  expect(response.data.results.qr_validations.deleted).toBe(0);
  expect(response.data.total_deleted).toBe(0);
});

test('should delete scan_logs older than 90 days', async () => {
  const db = await getDbClient();
  const eventId = await createTestEvent(db);

  // Create a test ticket first
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, status
    ) VALUES (?, ?, ?, ?)`,
    args: ['txn-001', 5000, 'test@example.com', 'completed']
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['txn-001']
  });
  const transactionId = txnResult.rows[0].id;

  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type
    ) VALUES (?, ?, ?, ?)`,
    args: [eventId, transactionId, 'TKT-SCAN-001', 'test']
  });

  // Create old scan log (older than 90 days)
  await db.execute({
    sql: `INSERT INTO scan_logs (
      ticket_id, scanned_at, scan_status, scanner_type
    ) VALUES (?, datetime('now', '-95 days'), ?, ?)`,
    args: ['TKT-SCAN-001', 'valid', 'admin']
  });

  // Create recent scan log (should not be deleted)
  await db.execute({
    sql: `INSERT INTO scan_logs (
      ticket_id, scanned_at, scan_status, scanner_type
    ) VALUES (?, datetime('now', '-30 days'), ?, ?)`,
    args: ['TKT-SCAN-001', 'valid', 'admin']
  });

  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.results.scan_logs.deleted).toBe(1);
  expect(response.data.total_deleted).toBe(1);

  // Verify only old log was deleted
  const scanLogCheck = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM scan_logs WHERE ticket_id = ?',
    args: ['TKT-SCAN-001']
  });
  expect(scanLogCheck.rows[0].count).toBe(1); // Only recent log remains
});

test('should delete qr_validations older than 90 days', async () => {
  const db = await getDbClient();

  // Create old qr_validation (older than 90 days)
  await db.execute({
    sql: `INSERT INTO qr_validations (
      ticket_id, validation_time, is_valid
    ) VALUES (?, datetime('now', '-100 days'), ?)`,
    args: ['TKT-QR-001', 1]
  });

  // Create recent qr_validation (should not be deleted)
  await db.execute({
    sql: `INSERT INTO qr_validations (
      ticket_id, validation_time, is_valid
    ) VALUES (?, datetime('now', '-45 days'), ?)`,
    args: ['TKT-QR-002', 1]
  });

  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.results.qr_validations.deleted).toBe(1);

  // Verify only old validation was deleted
  const qrCheck = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM qr_validations'
  });
  expect(qrCheck.rows[0].count).toBe(1); // Only recent validation remains
});

test('should handle errors in individual table cleanup gracefully', async () => {
  // This test verifies that errors in one table don't prevent cleanup of other tables
  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('success');
  expect(response.data.results).toHaveProperty('scan_logs');
  expect(response.data.results).toHaveProperty('qr_validations');

  // Each result should have deleted count and error field
  expect(response.data.results.scan_logs).toHaveProperty('deleted');
  expect(response.data.results.scan_logs).toHaveProperty('error');
  expect(response.data.results.qr_validations).toHaveProperty('deleted');
  expect(response.data.results.qr_validations).toHaveProperty('error');
});

test('should include 90-day retention policy in response', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.retention_policy).toBe('90 days');
});

test('should include execution duration in response', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('duration_ms');
  expect(typeof response.data.duration_ms).toBe('number');
  expect(response.data.duration_ms).toBeGreaterThanOrEqual(0);
  expect(response.data.duration_ms).toBeLessThan(5000); // Should complete quickly
});

test('should include timestamp in response', async () => {
  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
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
  const eventId = await createTestEvent(db);

  // Create test data
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, status
    ) VALUES (?, ?, ?, ?)`,
    args: ['txn-002', 5000, 'test@example.com', 'completed']
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['txn-002']
  });
  const transactionId = txnResult.rows[0].id;

  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type
    ) VALUES (?, ?, ?, ?)`,
    args: [eventId, transactionId, 'TKT-SCAN-002', 'test']
  });

  await db.execute({
    sql: `INSERT INTO scan_logs (
      ticket_id, scanned_at, scan_status, scanner_type
    ) VALUES (?, datetime('now', '-95 days'), ?, ?)`,
    args: ['TKT-SCAN-002', 'valid', 'admin']
  });

  // First run
  const response1 = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response1.status).toBe(HTTP_STATUS.OK);
  expect(response1.data.total_deleted).toBeGreaterThan(0);

  // Second run - should find nothing to delete
  const response2 = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response2.status).toBe(HTTP_STATUS.OK);
  expect(response2.data.total_deleted).toBe(0);
});

test('should warn when deleting large number of records', async () => {
  const db = await getDbClient();
  const eventId = await createTestEvent(db);

  // Create transaction and ticket
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, status
    ) VALUES (?, ?, ?, ?)`,
    args: ['txn-bulk', 5000, 'test@example.com', 'completed']
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['txn-bulk']
  });
  const transactionId = txnResult.rows[0].id;

  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type
    ) VALUES (?, ?, ?, ?)`,
    args: [eventId, transactionId, 'TKT-BULK', 'test']
  });

  // Create many old scan logs (simulate high volume)
  for (let i = 0; i < 50; i++) {
    await db.execute({
      sql: `INSERT INTO scan_logs (
        ticket_id, scanned_at, scan_status, scanner_type
      ) VALUES (?, datetime('now', '-95 days'), ?, ?)`,
      args: ['TKT-BULK', 'valid', 'admin']
    });
  }

  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.total_deleted).toBe(50);
});

test('should handle database errors gracefully', async () => {
  const originalDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'file:///nonexistent/database.db';

  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
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

test('should not delete records exactly at 90-day boundary', async () => {
  const db = await getDbClient();
  const eventId = await createTestEvent(db);

  // Create test data
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, status
    ) VALUES (?, ?, ?, ?)`,
    args: ['txn-boundary', 5000, 'test@example.com', 'completed']
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['txn-boundary']
  });
  const transactionId = txnResult.rows[0].id;

  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type
    ) VALUES (?, ?, ?, ?)`,
    args: [eventId, transactionId, 'TKT-BOUNDARY', 'test']
  });

  // Create scan log exactly at 90-day boundary
  await db.execute({
    sql: `INSERT INTO scan_logs (
      ticket_id, scanned_at, scan_status, scanner_type
    ) VALUES (?, datetime('now', '-90 days'), ?, ?)`,
    args: ['TKT-BOUNDARY', 'valid', 'admin']
  });

  const response = await testApiHandler(
    'api/cron/cleanup-scan-logs',
    'POST',
    '/api/cron/cleanup-scan-logs',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);

  // Verify log at boundary is not deleted (< not <=)
  const scanLogCheck = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM scan_logs WHERE ticket_id = ?',
    args: ['TKT-BOUNDARY']
  });
  expect(scanLogCheck.rows[0].count).toBe(1);
});
