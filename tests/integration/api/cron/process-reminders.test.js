/**
 * Integration Tests: Process Reminders Cron Job
 * Tests the /api/cron/process-reminders.js endpoint that sends registration reminders
 */
import { test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../../../setup-integration.js';
import { testApiHandler, HTTP_STATUS, createTestEvent } from '../../handler-test-helper.js';

// Mock environment for cron secret
const CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret-for-integration-testing-32-chars';

beforeEach(async () => {
  // Ensure CRON_SECRET is set
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.NODE_ENV = 'test'; // Non-production for testing without strict auth
});

test('should require valid authorization header in production', async () => {
  // Temporarily set production mode
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {}
  );

  expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  expect(response.data).toHaveProperty('error');

  // Restore environment
  process.env.NODE_ENV = originalEnv;
});

test('should accept valid Bearer token authorization', async () => {
  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('success', true);
  expect(response.data).toHaveProperty('processed');
  expect(response.data).toHaveProperty('sent');
  expect(response.data).toHaveProperty('failed');
});

test('should handle case-insensitive Bearer token parsing', async () => {
  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `bearer ${CRON_SECRET}` // lowercase
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('success', true);
});

test('should return zero processed when no pending reminders exist', async () => {
  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.processed).toBe(0);
  expect(response.data.sent).toBe(0);
  expect(response.data.failed).toBe(0);
});

test('should process pending reminders that are due', async () => {
  const db = await getDbClient();
  const eventId = await createTestEvent(db);

  // Create a test transaction
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, customer_name,
      payment_processor, registration_token, order_number, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'test-txn-001',
      5000,
      'test@example.com',
      'Test User',
      'stripe',
      'test-token-123',
      'ORD-001',
      'completed'
    ]
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['test-txn-001']
  });
  const transactionId = txnResult.rows[0].id;

  // Create a test ticket
  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type,
      registration_status, registration_deadline
    ) VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'))`,
    args: [eventId, transactionId, 'TKT-001', 'test', 'pending']
  });

  // Create a pending reminder that's due to be sent (scheduled_at in the past)
  await db.execute({
    sql: `INSERT INTO registration_reminders (
      transaction_id, reminder_type, scheduled_at, status
    ) VALUES (?, ?, datetime('now', '-1 minute'), ?)`,
    args: [transactionId, 'initial', 'scheduled']
  });

  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.processed).toBe(1);
  // Note: Email sending will fail in test mode, so we check for failed count
  expect(response.data.sent + response.data.failed).toBe(1);
});

test('should skip reminders for transactions with no pending tickets', async () => {
  const db = await getDbClient();
  const eventId = await createTestEvent(db);

  // Create a test transaction
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, customer_name,
      payment_processor, registration_token, order_number, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'test-txn-002',
      5000,
      'test@example.com',
      'Test User',
      'stripe',
      'test-token-456',
      'ORD-002',
      'completed'
    ]
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['test-txn-002']
  });
  const transactionId = txnResult.rows[0].id;

  // Create a ticket that's already registered
  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type,
      registration_status, registration_deadline
    ) VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'))`,
    args: [eventId, transactionId, 'TKT-002', 'test', 'completed']
  });

  // Create a pending reminder
  await db.execute({
    sql: `INSERT INTO registration_reminders (
      transaction_id, reminder_type, scheduled_at, status
    ) VALUES (?, ?, datetime('now', '-1 minute'), ?)`,
    args: [transactionId, 'initial', 'scheduled']
  });

  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  // Reminder should be filtered out because no pending tickets
  expect(response.data.processed).toBe(0);
});

test('should not process reminders scheduled in the future', async () => {
  const db = await getDbClient();
  const eventId = await createTestEvent(db);

  // Create a test transaction
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, customer_name,
      payment_processor, registration_token, order_number, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'test-txn-003',
      5000,
      'test@example.com',
      'Test User',
      'stripe',
      'test-token-789',
      'ORD-003',
      'completed'
    ]
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['test-txn-003']
  });
  const transactionId = txnResult.rows[0].id;

  // Create a test ticket
  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type,
      registration_status, registration_deadline
    ) VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'))`,
    args: [eventId, transactionId, 'TKT-003', 'test', 'pending']
  });

  // Create a reminder scheduled in the future
  await db.execute({
    sql: `INSERT INTO registration_reminders (
      transaction_id, reminder_type, scheduled_at, status
    ) VALUES (?, ?, datetime('now', '+1 hour'), ?)`,
    args: [transactionId, 'followup_1', 'scheduled']
  });

  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.processed).toBe(0);
});

test('should handle email sending failures gracefully', async () => {
  const db = await getDbClient();
  const eventId = await createTestEvent(db);

  // Create a test transaction with invalid email
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, customer_name,
      payment_processor, registration_token, order_number, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'test-txn-004',
      5000,
      'invalid-email', // Invalid email to trigger failure
      'Test User',
      'stripe',
      'test-token-abc',
      'ORD-004',
      'completed'
    ]
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['test-txn-004']
  });
  const transactionId = txnResult.rows[0].id;

  // Create a test ticket
  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type,
      registration_status, registration_deadline
    ) VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'))`,
    args: [eventId, transactionId, 'TKT-004', 'test', 'pending']
  });

  // Create a pending reminder
  await db.execute({
    sql: `INSERT INTO registration_reminders (
      transaction_id, reminder_type, scheduled_at, status
    ) VALUES (?, ?, datetime('now', '-1 minute'), ?)`,
    args: [transactionId, 'initial', 'scheduled']
  });

  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data.success).toBe(true);
  expect(response.data.processed).toBe(1);
  expect(response.data.failed).toBe(1);

  // Verify reminder was marked as failed
  const reminderCheck = await db.execute({
    sql: 'SELECT status, error_message FROM registration_reminders WHERE transaction_id = ?',
    args: [transactionId]
  });
  expect(reminderCheck.rows[0].status).toBe('failed');
  expect(reminderCheck.rows[0].error_message).toBeTruthy();
});

test('should be idempotent - safe to run multiple times', async () => {
  const db = await getDbClient();
  const eventId = await createTestEvent(db);

  // Create test data
  await db.execute({
    sql: `INSERT INTO transactions (
      transaction_id, amount, customer_email, customer_name,
      payment_processor, registration_token, order_number, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'test-txn-005',
      5000,
      'test@example.com',
      'Test User',
      'stripe',
      'test-token-xyz',
      'ORD-005',
      'completed'
    ]
  });

  const txnResult = await db.execute({
    sql: 'SELECT id FROM transactions WHERE transaction_id = ?',
    args: ['test-txn-005']
  });
  const transactionId = txnResult.rows[0].id;

  await db.execute({
    sql: `INSERT INTO tickets (
      event_id, transaction_id, ticket_id, ticket_type,
      registration_status, registration_deadline
    ) VALUES (?, ?, ?, ?, ?, datetime('now', '+1 hour'))`,
    args: [eventId, transactionId, 'TKT-005', 'test', 'pending']
  });

  await db.execute({
    sql: `INSERT INTO registration_reminders (
      transaction_id, reminder_type, scheduled_at, status
    ) VALUES (?, ?, datetime('now', '-1 minute'), ?)`,
    args: [transactionId, 'initial', 'scheduled']
  });

  // Run cron job first time
  const response1 = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response1.status).toBe(HTTP_STATUS.OK);
  expect(response1.data.processed).toBeGreaterThan(0);

  // Run cron job second time - should not reprocess
  const response2 = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response2.status).toBe(HTTP_STATUS.OK);
  expect(response2.data.processed).toBe(0); // Already processed
});

test('should return proper timestamp in response', async () => {
  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  expect(response.status).toBe(HTTP_STATUS.OK);
  expect(response.data).toHaveProperty('timestamp');
  expect(() => new Date(response.data.timestamp)).not.toThrow();

  // Timestamp should be recent (within last minute)
  const timestamp = new Date(response.data.timestamp);
  const now = new Date();
  const diffMs = Math.abs(now - timestamp);
  expect(diffMs).toBeLessThan(60000); // Within 60 seconds
});

test('should handle database errors gracefully', async () => {
  // Temporarily break database connection
  const originalDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'file:///nonexistent/database.db';

  const response = await testApiHandler(
    'api/cron/process-reminders',
    'POST',
    '/api/cron/process-reminders',
    null,
    {
      'Authorization': `Bearer ${CRON_SECRET}`
    }
  );

  // Restore database
  process.env.DATABASE_URL = originalDbUrl;

  expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
  expect(response.data).toHaveProperty('error');
  expect(response.data.error).toContain('Failed to process reminders');
});
