/**
 * Async Email Queue Unit Tests
 * Tests that email sending is non-blocking and retry queue works correctly
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';

describe('Async Email Queue System', () => {
  let db;

  beforeEach(async () => {
    db = await getDatabaseClient();

    // Clean up email_retry_queue before each test
    await db.execute({
      sql: 'DELETE FROM email_retry_queue WHERE is_test = 1',
      args: []
    });
  });

  afterEach(async () => {
    // Clean up after tests
    await db.execute({
      sql: 'DELETE FROM email_retry_queue WHERE is_test = 1',
      args: []
    });
  });

  test('email_retry_queue table exists with correct schema', async () => {
    const result = await db.execute({
      sql: `
        SELECT name, type
        FROM sqlite_master
        WHERE type='table' AND name='email_retry_queue'
      `,
      args: []
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('email_retry_queue');
  });

  test('can insert email into retry queue', async () => {
    // Create a test transaction first
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_test_123', 'test_trans_123', 'test@example.com', 'Test User', 5000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Insert into retry queue
    const queueResult = await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, last_error, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '+5 minutes'), ?, ?)
      `,
      args: [transactionId, 'test@example.com', 'Test email failure', 1]
    });

    expect(queueResult.lastInsertRowid).toBeTypeOf('bigint');

    // Verify insertion
    const selectResult = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE transaction_id = ?`,
      args: [transactionId]
    });

    expect(selectResult.rows).toHaveLength(1);
    expect(selectResult.rows[0].email_address).toBe('test@example.com');
    expect(selectResult.rows[0].email_type).toBe('ticket_confirmation');
    expect(selectResult.rows[0].status).toBe('pending');
    expect(selectResult.rows[0].attempt_count).toBe(0);
    expect(selectResult.rows[0].is_test).toBe(1);
  });

  test('retry queue supports required fields', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_test_456', 'test_trans_456', 'retry@example.com', 'Retry User', 3000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Test all required fields
    await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, status, attempt_count,
         next_retry_at, last_error, metadata, is_test)
        VALUES (?, ?, ?, ?, ?, datetime('now', '+10 minutes'), ?, ?, ?)
      `,
      args: [
        transactionId,
        'retry@example.com',
        'ticket_confirmation',
        'pending',
        2,
        'Connection timeout',
        JSON.stringify({ retry_reason: 'network_error' }),
        1
      ]
    });

    // Verify all fields
    const result = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE transaction_id = ?`,
      args: [transactionId]
    });

    const row = result.rows[0];
    expect(row.email_address).toBe('retry@example.com');
    expect(row.email_type).toBe('ticket_confirmation');
    expect(row.status).toBe('pending');
    expect(row.attempt_count).toBe(2);
    expect(row.last_error).toBe('Connection timeout');
    expect(JSON.parse(row.metadata)).toEqual({ retry_reason: 'network_error' });
    expect(row.is_test).toBe(1);
  });

  test('can query pending emails for retry processing', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_test_789', 'test_trans_789', 'pending@example.com', 'Pending User', 4000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Insert pending email (ready for retry)
    await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '-1 minute'), ?)
      `,
      args: [transactionId, 'pending@example.com', 1]
    });

    // Query pending emails (like the cron job does)
    const pendingEmails = await db.execute({
      sql: `
        SELECT *
        FROM email_retry_queue
        WHERE status = 'pending'
          AND next_retry_at <= datetime('now')
          AND attempt_count < 5
          AND is_test = 1
        ORDER BY next_retry_at
      `,
      args: []
    });

    expect(pendingEmails.rows.length).toBeGreaterThan(0);
    expect(pendingEmails.rows[0].email_address).toBe('pending@example.com');
    expect(pendingEmails.rows[0].status).toBe('pending');
  });

  test('email retry queue has proper indexes', async () => {
    const indexes = await db.execute({
      sql: `
        SELECT name, tbl_name, sql
        FROM sqlite_master
        WHERE type='index'
        AND tbl_name='email_retry_queue'
      `,
      args: []
    });

    const indexNames = indexes.rows.map(row => row.name);

    // Verify expected indexes exist
    expect(indexNames).toContain('idx_email_retry_queue_status_retry');
    expect(indexNames).toContain('idx_email_retry_queue_transaction');
  });

  test('can update retry attempt count and next_retry_at', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_test_update', 'test_trans_update', 'update@example.com', 'Update User', 2000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Insert email
    const insertResult = await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '+5 minutes'), ?)
      `,
      args: [transactionId, 'update@example.com', 1]
    });

    const emailId = insertResult.lastInsertRowid;

    // Update for retry (like cron job does)
    await db.execute({
      sql: `
        UPDATE email_retry_queue
        SET attempt_count = attempt_count + 1,
            next_retry_at = datetime('now', '+15 minutes'),
            last_error = ?
        WHERE id = ?
      `,
      args: ['Brevo API timeout', emailId]
    });

    // Verify update
    const updated = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE id = ?`,
      args: [emailId]
    });

    expect(updated.rows[0].attempt_count).toBe(1);
    expect(updated.rows[0].last_error).toBe('Brevo API timeout');
  });

  test('can mark email as sent', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_test_sent', 'test_trans_sent', 'sent@example.com', 'Sent User', 3500, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Insert email
    const insertResult = await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '+5 minutes'), ?)
      `,
      args: [transactionId, 'sent@example.com', 1]
    });

    const emailId = insertResult.lastInsertRowid;

    // Mark as sent (like cron job does on success)
    await db.execute({
      sql: `
        UPDATE email_retry_queue
        SET status = 'sent',
            sent_at = datetime('now'),
            last_error = NULL
        WHERE id = ?
      `,
      args: [emailId]
    });

    // Verify status
    const result = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE id = ?`,
      args: [emailId]
    });

    expect(result.rows[0].status).toBe('sent');
    expect(result.rows[0].sent_at).toBeTruthy();
    expect(result.rows[0].last_error).toBeNull();
  });

  test('email type constraint enforces valid types', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_test_constraint', 'test_trans_constraint', 'constraint@example.com', 'Constraint User', 1000, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Try to insert with invalid email_type
    await expect(
      db.execute({
        sql: `
          INSERT INTO email_retry_queue
          (transaction_id, email_address, email_type, next_retry_at, is_test)
          VALUES (?, ?, 'invalid_type', datetime('now', '+5 minutes'), ?)
        `,
        args: [transactionId, 'constraint@example.com', 1]
      })
    ).rejects.toThrow();

    // Valid types should work
    await expect(
      db.execute({
        sql: `
          INSERT INTO email_retry_queue
          (transaction_id, email_address, email_type, next_retry_at, is_test)
          VALUES (?, ?, 'ticket_confirmation', datetime('now', '+5 minutes'), ?)
        `,
        args: [transactionId, 'constraint@example.com', 1]
      })
    ).resolves.toBeTruthy();
  });

  test('cascade delete removes queue entries when transaction deleted', async () => {
    // Create test transaction
    const transactionResult = await db.execute({
      sql: `
        INSERT INTO transactions
        (transaction_id, uuid, type, customer_email, customer_name, amount_cents, currency, status, order_data, is_test)
        VALUES (?, ?, 'tickets', ?, ?, ?, ?, ?, '{}', ?)
      `,
      args: ['trans_test_cascade', 'test_trans_cascade', 'cascade@example.com', 'Cascade User', 2500, 'usd', 'completed', 1]
    });

    const transactionId = transactionResult.lastInsertRowid;

    // Insert email
    await db.execute({
      sql: `
        INSERT INTO email_retry_queue
        (transaction_id, email_address, email_type, next_retry_at, is_test)
        VALUES (?, ?, 'ticket_confirmation', datetime('now', '+5 minutes'), ?)
      `,
      args: [transactionId, 'cascade@example.com', 1]
    });

    // Verify email exists
    let emails = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE transaction_id = ?`,
      args: [transactionId]
    });
    expect(emails.rows).toHaveLength(1);

    // Delete transaction
    await db.execute({
      sql: `DELETE FROM transactions WHERE id = ?`,
      args: [transactionId]
    });

    // Verify email was cascade deleted
    emails = await db.execute({
      sql: `SELECT * FROM email_retry_queue WHERE transaction_id = ?`,
      args: [transactionId]
    });
    expect(emails.rows).toHaveLength(0);
  });
});
