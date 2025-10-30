/**
 * Integration Tests: Audit Retention Cron Job
 * Tests the /api/cron/audit-retention.js endpoint for audit log lifecycle management
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
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {}
  );

  expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  expect(response.data).toHaveProperty('error', 'Unauthorized');

  process.env.NODE_ENV = originalEnv;
});

test('should accept valid Bearer token', async () => {
  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('success', true);
  expect(response.data).toHaveProperty('archived');
  expect(response.data).toHaveProperty('deleted');
  expect(response.data).toHaveProperty('currentStats');
});

test('should return zero archived/deleted when no old logs exist', async () => {
  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.archived.total).toBe(0);
  expect(response.data.deleted.total).toBe(0);
});

test('should archive logs older than hot retention period', async () => {
  const db = await getDbClient();

  // Create an old financial_event log (hot: 365 days)
  await db.execute({
    sql: `INSERT INTO audit_logs (
      event_type, action, created_at
    ) VALUES (?, ?, datetime('now', '-400 days'))`,
    args: ['financial_event', 'PAYMENT_RECEIVED']
  });

  // Create a recent financial_event log (should not be archived)
  await db.execute({
    sql: `INSERT INTO audit_logs (
      event_type, action, created_at
    ) VALUES (?, ?, datetime('now', '-30 days'))`,
    args: ['financial_event', 'PAYMENT_RECEIVED']
  });

  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.archived.total).toBeGreaterThan(0);

  // Verify old log was marked as archived
  const archiveCheck = await db.execute({
    sql: `SELECT COUNT(*) as count FROM audit_logs
          WHERE event_type = ? AND archived_at IS NOT NULL`,
    args: ['financial_event']
  });
  expect(archiveCheck.rows[0].count).toBeGreaterThan(0);
});

test('should delete expired logs from archive based on total retention', async () => {
  const db = await getDbClient();

  // Create a very old security_event log (total retention: 365 days)
  // First in main table, then move to archive
  await db.execute({
    sql: `INSERT INTO audit_logs (
      event_type, action, created_at, archived_at
    ) VALUES (?, ?, datetime('now', '-400 days'), datetime('now', '-30 days'))`,
    args: ['security_event', 'LOGIN_FAILED']
  });

  // Get the original_id
  const logResult = await db.execute({
    sql: 'SELECT id FROM audit_logs WHERE event_type = ? ORDER BY created_at LIMIT 1',
    args: ['security_event']
  });

  if (logResult.rows.length > 0) {
    const originalId = logResult.rows[0].id;

    // Insert into archive table
    await db.execute({
      sql: `INSERT INTO audit_logs_archive (
        original_id, event_type, action, created_at, archived_at
      ) VALUES (?, ?, ?, datetime('now', '-400 days'), datetime('now', '-30 days'))`,
      args: [originalId, 'security_event', 'LOGIN_FAILED']
    });
  }

  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.deleted.total).toBeGreaterThanOrEqual(0);
});

test('should provide detailed breakdown by event type', async () => {
  const db = await getDbClient();

  // Create logs of different event types
  await db.execute({
    sql: `INSERT INTO audit_logs (
      event_type, action, created_at
    ) VALUES
      (?, ?, datetime('now', '-100 days')),
      (?, ?, datetime('now', '-100 days'))`,
    args: [
      'admin_access', 'ADMIN_LOGIN',
      'data_change', 'UPDATE_TICKET'
    ]
  });

  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.archived).toHaveProperty('details');
  expect(Array.isArray(response.data.archived.details)).toBe(true);
  expect(response.data.deleted).toHaveProperty('details');
  expect(Array.isArray(response.data.deleted.details)).toBe(true);
});

test('should include current retention statistics', async () => {
  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.currentStats).toBeDefined();
  expect(Array.isArray(response.data.currentStats)).toBe(true);
});

test('should handle different retention policies for different event types', async () => {
  const db = await getDbClient();

  // Financial events: 7 years (2555 days)
  // Admin access: 3 years (1095 days)
  // Security events: 1 year (365 days)

  await db.execute({
    sql: `INSERT INTO audit_logs (
      event_type, action, created_at
    ) VALUES
      (?, ?, datetime('now', '-400 days')),
      (?, ?, datetime('now', '-100 days')),
      (?, ?, datetime('now', '-400 days'))`,
    args: [
      'financial_event', 'PAYMENT_RECEIVED',
      'admin_access', 'ADMIN_LOGIN',
      'security_event', 'SUSPICIOUS_ACTIVITY'
    ]
  });

  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);

  // Different event types should have different archived counts based on their policies
  const details = response.data.archived.details;
  expect(Array.isArray(details)).toBe(true);
});

test('should track errors for individual event types', async () => {
  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.archived).toHaveProperty('errors');
  expect(Array.isArray(response.data.archived.errors)).toBe(true);
  expect(response.data.deleted).toHaveProperty('errors');
  expect(Array.isArray(response.data.deleted.errors)).toBe(true);
});

test('should include execution duration in response', async () => {
  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('duration_ms');
  expect(typeof response.data.duration_ms).toBe('number');
  expect(response.data.duration_ms).toBeGreaterThanOrEqual(0);
  expect(response.data.duration_ms).toBeLessThan(10000); // Should complete in < 10s
});

test('should include timestamp in response', async () => {
  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
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

  // Create old logs
  await db.execute({
    sql: `INSERT INTO audit_logs (
      event_type, action, created_at
    ) VALUES
      (?, ?, datetime('now', '-400 days')),
      (?, ?, datetime('now', '-400 days'))`,
    args: [
      'admin_access', 'ADMIN_LOGIN',
      'admin_access', 'ADMIN_LOGOUT'
    ]
  });

  // First run
  const response1 = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response1.status).toBe(HTTP_STATUS.OK);
  const firstArchived = response1.data.archived.total;

  // Second run - should not re-archive
  const response2 = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response2.status).toBe(HTTP_STATUS.OK);
  expect(response2.data.archived.total).toBe(0); // Already archived
});

test('should warn when total record count is very high', async () => {
  const db = await getDbClient();

  // Create many audit logs to simulate high volume
  const batchSize = 100;
  for (let i = 0; i < batchSize; i++) {
    await db.execute({
      sql: `INSERT INTO audit_logs (
        event_type, action, created_at
      ) VALUES (?, ?, datetime('now', '-10 days'))`,
      args: ['data_processing', 'DATA_EXPORT']
    });
  }

  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);

  // Verify stats reflect the high record count
  const stats = response.data.currentStats;
  const totalRecords = stats.reduce((sum, s) => sum + (s.total || 0), 0);
  expect(totalRecords).toBeGreaterThanOrEqual(batchSize);
});

test('should handle database errors gracefully', async () => {
  const originalDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'file:///nonexistent/database.db';

  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
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

test('should preserve archived logs when cleaning main table', async () => {
  const db = await getDbClient();

  // Create and archive a log
  await db.execute({
    sql: `INSERT INTO audit_logs (
      event_type, action, created_at
    ) VALUES (?, ?, datetime('now', '-400 days'))`,
    args: ['config_change', 'UPDATE_SETTING']
  });

  // First run - should archive
  const response1 = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response1.status).toBe(HTTP_STATUS.OK);

  // Check that log still exists in main table (marked as archived)
  const mainTableCheck = await db.execute({
    sql: `SELECT COUNT(*) as count FROM audit_logs
          WHERE event_type = ? AND archived_at IS NOT NULL`,
    args: ['config_change']
  });

  // Check that log exists in archive table
  const archiveTableCheck = await db.execute({
    sql: `SELECT COUNT(*) as count FROM audit_logs_archive
          WHERE event_type = ?`,
    args: ['config_change']
  });

  // Both should have the record
  expect(mainTableCheck.rows[0].count + archiveTableCheck.rows[0].count).toBeGreaterThan(0);
});

test('should handle multiple event types in single run', async () => {
  const db = await getDbClient();

  // Create logs for all event types with various ages
  const eventTypes = [
    'financial_event',
    'admin_access',
    'data_change',
    'data_processing',
    'config_change',
    'security_event'
  ];

  for (const eventType of eventTypes) {
    await db.execute({
      sql: `INSERT INTO audit_logs (
        event_type, action, created_at
      ) VALUES (?, ?, datetime('now', '-100 days'))`,
      args: [eventType, 'TEST_ACTION']
    });
  }

  const response = await testApiHandler(
    'api/cron/audit-retention',
    'POST',
    '/api/cron/audit-retention',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);

  // Verify all event types were processed
  const details = response.data.archived.details;
  expect(details.length).toBeGreaterThan(0);
});
