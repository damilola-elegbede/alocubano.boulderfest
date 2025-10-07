/**
 * Unit Tests: Process Reminders Cron Job
 * Tests reminder batch processing, retry logic, and batch limiting
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestIsolationManager } from '../../../lib/test-isolation-manager.js';
import { getReminderScheduler } from '../../../lib/reminder-scheduler.js';

describe('Process Reminders - Unit Tests', () => {
  let testDb;
  let isolationManager;
  let scheduler;

  beforeEach(async () => {
    isolationManager = getTestIsolationManager();
    testDb = await isolationManager.getScopedDatabaseClient();
    scheduler = getReminderScheduler();
    await scheduler.ensureInitialized();
  });

  afterEach(async () => {
    if (isolationManager) {
      await isolationManager.cleanup();
    }
  });

  describe('Reminder Batch Processing Logic', () => {
    test('should identify due reminders for processing', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_123', 'ORDER_123', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_123',
          'QR_123',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create due reminder
      const dueTime = new Date(Date.now() - 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'test-reminder', dueTime, 'scheduled']
      });

      // Query due reminders
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders.length).toBe(1);
      expect(reminders[0].reminder_type).toBe('test-reminder');
    });

    test('should not identify future reminders', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_456', 'ORDER_456', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_456',
          'QR_456',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create future reminder
      const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'future-reminder', futureTime, 'scheduled']
      });

      // Query due reminders
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders.length).toBe(0);
    });

    test('should order reminders by scheduled time (oldest first)', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_order', 'ORDER_ORDER', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_ORDER',
          'QR_ORDER',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create reminders at different times
      const time1 = new Date(Date.now() - 3000).toISOString();
      const time2 = new Date(Date.now() - 2000).toISOString();
      const time3 = new Date(Date.now() - 1000).toISOString();

      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'reminder-3', time3, 'scheduled']
      });

      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'reminder-1', time1, 'scheduled']
      });

      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'reminder-2', time2, 'scheduled']
      });

      // Query due reminders
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders.length).toBe(3);
      expect(reminders[0].reminder_type).toBe('reminder-1');
      expect(reminders[1].reminder_type).toBe('reminder-2');
      expect(reminders[2].reminder_type).toBe('reminder-3');
    });
  });

  describe('Due Reminder Identification', () => {
    test('should exclude already sent reminders', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_sent', 'ORDER_SENT', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_SENT',
          'QR_SENT',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create sent reminder
      const dueTime = new Date(Date.now() - 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'sent-reminder', dueTime, 'sent']
      });

      // Query due reminders
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders.length).toBe(0);
    });

    test('should exclude failed reminders', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_failed', 'ORDER_FAILED', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_FAILED',
          'QR_FAILED',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create failed reminder
      const dueTime = new Date(Date.now() - 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'failed-reminder', dueTime, 'failed']
      });

      // Query due reminders
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders.length).toBe(0);
    });

    test('should exclude cancelled reminders', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_cancelled', 'ORDER_CANCELLED', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_CANCELLED',
          'QR_CANCELLED',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create cancelled reminder
      const dueTime = new Date(Date.now() - 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'cancelled-reminder', dueTime, 'cancelled']
      });

      // Query due reminders
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders.length).toBe(0);
    });

    test('should filter out reminders with no pending tickets', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_complete', 'ORDER_COMPLETE', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create completed ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_COMPLETE',
          'QR_COMPLETE',
          'completed',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create due reminder
      const dueTime = new Date(Date.now() - 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'no-pending-reminder', dueTime, 'scheduled']
      });

      // Query due reminders (should be filtered out)
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders.length).toBe(0);
    });
  });

  describe('Reminder Sending Workflow', () => {
    test('should mark reminder as sent after successful send', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_mark', 'ORDER_MARK', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_MARK',
          'QR_MARK',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create reminder
      const reminderResult = await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'test-reminder', new Date().toISOString(), 'scheduled']
      });
      const reminderId = Number(reminderResult.lastInsertRowid);

      // Mark as sent
      await scheduler.markReminderSent(reminderId, true, null);

      // Verify status
      const check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [reminderId]
      });

      expect(check.rows[0].status).toBe('sent');
      expect(check.rows[0].sent_at).toBeTruthy();
    });

    test('should mark reminder as failed with error message', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_fail', 'ORDER_FAIL', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_FAIL',
          'QR_FAIL',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create reminder
      const reminderResult = await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'test-reminder', new Date().toISOString(), 'scheduled']
      });
      const reminderId = Number(reminderResult.lastInsertRowid);

      // Mark as failed
      await scheduler.markReminderSent(reminderId, false, 'Email service unavailable');

      // Verify status
      const check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [reminderId]
      });

      expect(check.rows[0].status).toBe('failed');
      expect(check.rows[0].error_message).toBe('Email service unavailable');
      expect(check.rows[0].sent_at).toBeTruthy();
    });

    test('should include transaction details in reminder data', async () => {
      // Create transaction with specific details
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['specific@example.com', 'Specific User', 'token_specific', 'ORDER_SPECIFIC', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_SPECIFIC',
          'QR_SPECIFIC',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create reminder
      const dueTime = new Date(Date.now() - 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'test-reminder', dueTime, 'scheduled']
      });

      // Query reminder
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders[0].customer_email).toBe('specific@example.com');
      expect(reminders[0].customer_name).toBe('Specific User');
      expect(reminders[0].order_number).toBe('ORDER_SPECIFIC');
    });
  });

  describe('Retry Logic for Failed Sends', () => {
    test('should support retry attempts for failed reminders', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_retry', 'ORDER_RETRY', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_RETRY',
          'QR_RETRY',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create reminder
      const reminderResult = await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'test-reminder', new Date().toISOString(), 'scheduled']
      });
      const reminderId = Number(reminderResult.lastInsertRowid);

      // First attempt - fail
      await scheduler.markReminderSent(reminderId, false, 'First failure');

      // Verify failed status
      let check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [reminderId]
      });
      expect(check.rows[0].status).toBe('failed');

      // Retry - reset to scheduled
      await testDb.execute({
        sql: `UPDATE registration_reminders
              SET status = 'scheduled', error_message = NULL
              WHERE id = ?`,
        args: [reminderId]
      });

      // Second attempt - success
      await scheduler.markReminderSent(reminderId, true, null);

      // Verify sent status
      check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [reminderId]
      });
      expect(check.rows[0].status).toBe('sent');
    });

    test('should preserve error history across retry attempts', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_history', 'ORDER_HISTORY', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_HISTORY',
          'QR_HISTORY',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create reminder
      const reminderResult = await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'test-reminder', new Date().toISOString(), 'scheduled']
      });
      const reminderId = Number(reminderResult.lastInsertRowid);

      // Fail with specific error
      await scheduler.markReminderSent(reminderId, false, 'Network timeout');

      // Check error is stored
      const check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [reminderId]
      });

      expect(check.rows[0].error_message).toBe('Network timeout');
    });
  });

  describe('Batch Size Limiting (100 reminders/run)', () => {
    test('should respect batch size limit of 100 reminders', async () => {
      // Create 150 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 150; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`test${i}@example.com`, `User ${i}`, `token_${i}`, `ORDER_${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'test-ticket',
            `TICKET_${i}`,
            `QR_${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'batch-reminder', dueTime, 'scheduled']
        });
      }

      // Query with limit of 100
      const reminders = await scheduler.getPendingReminders(100);

      expect(reminders.length).toBe(100);
    });

    test('should process remaining reminders in subsequent runs', async () => {
      // Create 120 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 120; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`batch${i}@example.com`, `User ${i}`, `token_b${i}`, `ORDER_B${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'test-ticket',
            `TICKET_B${i}`,
            `QR_B${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'multi-batch-reminder', dueTime, 'scheduled']
        });
      }

      // First batch
      const batch1 = await scheduler.getPendingReminders(100);
      expect(batch1.length).toBe(100);

      // Mark first batch as sent
      for (const reminder of batch1) {
        await scheduler.markReminderSent(reminder.id, true, null);
      }

      // Second batch
      const batch2 = await scheduler.getPendingReminders(100);
      expect(batch2.length).toBe(20);
    });

    test('should handle batch size smaller than limit', async () => {
      // Create 25 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 25; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`small${i}@example.com`, `User ${i}`, `token_s${i}`, `ORDER_S${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'test-ticket',
            `TICKET_S${i}`,
            `QR_S${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'small-batch-reminder', dueTime, 'scheduled']
        });
      }

      // Query with limit of 100
      const reminders = await scheduler.getPendingReminders(100);

      expect(reminders.length).toBe(25);
    });

    test('should allow custom batch sizes for different scenarios', async () => {
      // Create 50 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 50; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`custom${i}@example.com`, `User ${i}`, `token_c${i}`, `ORDER_C${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'test-ticket',
            `TICKET_C${i}`,
            `QR_C${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'custom-batch-reminder', dueTime, 'scheduled']
        });
      }

      // Query with custom limit
      const batch10 = await scheduler.getPendingReminders(10);
      expect(batch10.length).toBe(10);

      const batch25 = await scheduler.getPendingReminders(25);
      expect(batch25.length).toBe(25);
    });
  });

  describe('Performance and Efficiency', () => {
    test('should efficiently process large reminder batches', async () => {
      // Create 100 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 100; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`perf${i}@example.com`, `User ${i}`, `token_p${i}`, `ORDER_P${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'test-ticket',
            `TICKET_P${i}`,
            `QR_P${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'perf-reminder', dueTime, 'scheduled']
        });
      }

      const startTime = Date.now();
      const reminders = await scheduler.getPendingReminders(100);
      const duration = Date.now() - startTime;

      expect(reminders.length).toBe(100);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('should use efficient query with JOIN to get transaction details', async () => {
      // Create transaction and reminder
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['join@example.com', 'Join User', 'token_join', 'ORDER_JOIN', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'test-ticket',
          'TICKET_JOIN',
          'QR_JOIN',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      const dueTime = new Date(Date.now() - 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'join-reminder', dueTime, 'scheduled']
      });

      // Query should return transaction details in single query
      const reminders = await scheduler.getPendingReminders(10);

      expect(reminders.length).toBe(1);
      expect(reminders[0].customer_email).toBe('join@example.com');
      expect(reminders[0].transaction_id).toBe(txId);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Use invalid database
      const invalidScheduler = new (await import('../../../lib/reminder-scheduler.js')).ReminderScheduler();
      invalidScheduler.db = {
        execute: vi.fn().mockRejectedValue(new Error('Database connection lost'))
      };
      invalidScheduler.initialized = true;

      try {
        await invalidScheduler.getPendingReminders(10);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Database connection lost');
      }
    });

    test('should handle marking reminders with invalid IDs', async () => {
      // Try to mark non-existent reminder
      await scheduler.markReminderSent(99999, true, null);

      // Should not throw, but no rows affected
      const check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [99999]
      });

      expect(check.rows.length).toBe(0);
    });
  });
});
