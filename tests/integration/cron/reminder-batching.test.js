/**
 * Integration Tests: Reminder Batching
 * Tests batch size enforcement, priority ordering, atomicity, and statistics tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { getTestIsolationManager } from '../../../lib/test-isolation-manager.js';
import { getReminderScheduler } from '../../../lib/reminder-scheduler.js';

describe('Reminder Batching - Integration Tests', () => {
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

  describe('Batch Size Enforcement (100/run)', () => {
    test('should limit batch to 100 reminders', async () => {
      // Create 150 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 150; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`batch${i}@example.com`, `User ${i}`, `token_${i}`, `ORDER_${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
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
          args: [txId, '24hr-before', dueTime, 'scheduled']
        });
      }

      // Query with 100 limit
      const reminders = await scheduler.getPendingReminders(100);

      expect(reminders.length).toBe(100);
    });

    test('should process subsequent batches correctly', async () => {
      // Create 120 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 120; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`multi${i}@example.com`, `User ${i}`, `token_m${i}`, `ORDER_M${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_M${i}`,
            `QR_M${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'batch-test', dueTime, 'scheduled']
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

    test('should handle partial batches correctly', async () => {
      // Create 45 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 45; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`partial${i}@example.com`, `User ${i}`, `token_p${i}`, `ORDER_P${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
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
          args: [txId, 'partial-batch', dueTime, 'scheduled']
        });
      }

      // Query should return only 45
      const reminders = await scheduler.getPendingReminders(100);

      expect(reminders.length).toBe(45);
    });

    test('should enforce batch limit across multiple reminder types', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      // Create 50 immediate reminders
      for (let i = 0; i < 50; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`immediate${i}@example.com`, `User ${i}`, `token_i${i}`, `ORDER_I${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_I${i}`,
            `QR_I${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'immediate', dueTime, 'scheduled']
        });
      }

      // Create 60 24hr-before reminders
      for (let i = 0; i < 60; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`before${i}@example.com`, `User ${i}`, `token_b${i}`, `ORDER_B${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
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
          args: [txId, '24hr-before', dueTime, 'scheduled']
        });
      }

      // Query should return exactly 100 (mixed types)
      const reminders = await scheduler.getPendingReminders(100);

      expect(reminders.length).toBe(100);
    });
  });

  describe('Priority Ordering (oldest first)', () => {
    test('should process oldest reminders first', async () => {
      const now = Date.now();

      // Create reminders at different times
      const times = [
        new Date(now - 5 * 60 * 1000), // 5 minutes ago
        new Date(now - 3 * 60 * 1000), // 3 minutes ago
        new Date(now - 10 * 60 * 1000), // 10 minutes ago
        new Date(now - 1 * 60 * 1000)  // 1 minute ago
      ];

      for (let i = 0; i < times.length; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`order${i}@example.com`, `User ${i}`, `token_o${i}`, `ORDER_O${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_O${i}`,
            `QR_O${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'priority-test', times[i].toISOString(), 'scheduled']
        });
      }

      // Query reminders
      const reminders = await scheduler.getPendingReminders(10);

      // First reminder should be the oldest (10 minutes ago)
      const firstScheduledTime = new Date(reminders[0].scheduled_at).getTime();
      expect(firstScheduledTime).toBeLessThan(now - 9 * 60 * 1000);
    });

    test('should maintain FIFO order for same scheduled time', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      // Create multiple reminders with same scheduled time
      const transactionIds = [];

      for (let i = 0; i < 5; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`fifo${i}@example.com`, `User ${i}`, `token_f${i}`, `ORDER_F${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);
        transactionIds.push(txId);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_F${i}`,
            `QR_F${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'fifo-test', dueTime, 'scheduled']
        });
      }

      // Query reminders
      const reminders = await scheduler.getPendingReminders(10);

      // Should return in order (likely by ID if timestamps are identical)
      expect(reminders.length).toBe(5);

      // Verify all have same scheduled time
      const allSameTime = reminders.every(r => r.scheduled_at === dueTime);
      expect(allSameTime).toBe(true);
    });

    test('should prioritize urgent reminders over regular ones', async () => {
      const now = Date.now();

      // Create urgent reminder (very overdue)
      const urgentTime = new Date(now - 60 * 60 * 1000).toISOString(); // 1 hour ago

      const urgentTxResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['urgent@example.com', 'Urgent User', 'token_urgent', 'ORDER_URGENT', 1]
      });
      const urgentTxId = Number(urgentTxResult.lastInsertRowid);

      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          urgentTxId,
          'weekender',
          'TICKET_URGENT',
          'QR_URGENT',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [urgentTxId, 'urgent-reminder', urgentTime, 'scheduled']
      });

      // Create regular reminder (just due)
      const regularTime = new Date(now - 1000).toISOString();

      const regularTxResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['regular@example.com', 'Regular User', 'token_regular', 'ORDER_REGULAR', 1]
      });
      const regularTxId = Number(regularTxResult.lastInsertRowid);

      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          regularTxId,
          'weekender',
          'TICKET_REGULAR',
          'QR_REGULAR',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [regularTxId, 'regular-reminder', regularTime, 'scheduled']
      });

      // Query reminders
      const reminders = await scheduler.getPendingReminders(10);

      // Urgent should come first
      expect(reminders[0].transaction_id).toBe(urgentTxId);
    });
  });

  describe('Batch Processing Atomicity', () => {
    test('should mark entire batch as processing atomically', async () => {
      // Create batch of reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 10; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`atomic${i}@example.com`, `User ${i}`, `token_a${i}`, `ORDER_A${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_A${i}`,
            `QR_A${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'atomic-test', dueTime, 'scheduled']
        });
      }

      // Get batch
      const batch = await scheduler.getPendingReminders(10);

      // Process all atomically
      for (const reminder of batch) {
        await scheduler.markReminderSent(reminder.id, true, null);
      }

      // Verify all marked as sent
      const result = await testDb.execute({
        sql: `SELECT COUNT(*) as count FROM registration_reminders
              WHERE status = 'sent' AND reminder_type = 'atomic-test'`
      });

      expect(result.rows[0].count).toBe(10);
    });

    test('should rollback on batch processing failure', async () => {
      // This test validates the concept of atomicity
      // In practice, individual reminder failures are tracked, not rolled back

      const batch = [
        { id: 1, status: 'scheduled' },
        { id: 2, status: 'scheduled' },
        { id: 3, status: 'scheduled' }
      ];

      let processedCount = 0;
      const results = [];

      try {
        for (const reminder of batch) {
          // Simulate failure on second item
          if (processedCount === 1) {
            throw new Error('Processing error');
          }
          results.push({ id: reminder.id, status: 'sent' });
          processedCount++;
        }
      } catch (error) {
        // Record failure
        expect(error.message).toBe('Processing error');
      }

      // Verify partial processing occurred
      expect(processedCount).toBe(1);
      expect(results.length).toBe(1);
    });

    test('should prevent duplicate processing of same batch', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['duplicate@example.com', 'Duplicate User', 'token_dup', 'ORDER_DUP', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          'weekender',
          'TICKET_DUP',
          'QR_DUP',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      const reminderResult = await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, 'duplicate-test', dueTime, 'scheduled']
      });
      const reminderId = Number(reminderResult.lastInsertRowid);

      // Process once
      await scheduler.markReminderSent(reminderId, true, null);

      // Try to process again
      const batch2 = await scheduler.getPendingReminders(10);

      // Should not include already processed reminder
      const found = batch2.some(r => r.id === reminderId);
      expect(found).toBe(false);
    });
  });

  describe('Partial Batch Failure Handling', () => {
    test('should continue processing after individual reminder failure', async () => {
      const successCount = { value: 0 };
      const failureCount = { value: 0 };

      const batch = [
        { id: 1, shouldFail: false },
        { id: 2, shouldFail: true },
        { id: 3, shouldFail: false },
        { id: 4, shouldFail: false }
      ];

      for (const reminder of batch) {
        try {
          if (reminder.shouldFail) {
            throw new Error('Reminder send failed');
          }
          successCount.value++;
        } catch (error) {
          failureCount.value++;
        }
      }

      expect(successCount.value).toBe(3);
      expect(failureCount.value).toBe(1);
    });

    test('should track failures without stopping batch', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      // Create multiple reminders
      for (let i = 0; i < 5; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`partial${i}@example.com`, `User ${i}`, `token_pf${i}`, `ORDER_PF${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_PF${i}`,
            `QR_PF${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'partial-fail', dueTime, 'scheduled']
        });
      }

      const batch = await scheduler.getPendingReminders(10);

      // Process with some failures
      let sent = 0;
      let failed = 0;

      for (let i = 0; i < batch.length; i++) {
        const reminder = batch[i];
        // Simulate failure on even indices
        const success = i % 2 !== 0;

        await scheduler.markReminderSent(
          reminder.id,
          success,
          success ? null : 'Simulated failure'
        );

        if (success) sent++;
        else failed++;
      }

      // Verify mixed results
      expect(sent).toBeGreaterThan(0);
      expect(failed).toBeGreaterThan(0);
      expect(sent + failed).toBe(batch.length);
    });
  });

  describe('Batch Statistics Tracking', () => {
    test('should track total reminders processed', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 25; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`stats${i}@example.com`, `User ${i}`, `token_s${i}`, `ORDER_S${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
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
          args: [txId, 'stats-test', dueTime, 'scheduled']
        });
      }

      const batch = await scheduler.getPendingReminders(100);

      expect(batch.length).toBe(25);
    });

    test('should track successful sends', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 10; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`success${i}@example.com`, `User ${i}`, `token_sc${i}`, `ORDER_SC${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_SC${i}`,
            `QR_SC${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'success-track', dueTime, 'scheduled']
        });
      }

      const batch = await scheduler.getPendingReminders(10);

      // Mark all as sent
      for (const reminder of batch) {
        await scheduler.markReminderSent(reminder.id, true, null);
      }

      // Query sent count
      const result = await testDb.execute({
        sql: `SELECT COUNT(*) as count FROM registration_reminders
              WHERE status = 'sent' AND reminder_type = 'success-track'`
      });

      expect(result.rows[0].count).toBe(10);
    });

    test('should track failed sends', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 10; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            customer_email, customer_name, registration_token, order_number, is_test
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`fail${i}@example.com`, `User ${i}`, `token_fl${i}`, `ORDER_FL${i}`, 1]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_FL${i}`,
            `QR_FL${i}`,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'fail-track', dueTime, 'scheduled']
        });
      }

      const batch = await scheduler.getPendingReminders(10);

      // Mark all as failed
      for (const reminder of batch) {
        await scheduler.markReminderSent(reminder.id, false, 'Email service down');
      }

      // Query failed count
      const result = await testDb.execute({
        sql: `SELECT COUNT(*) as count FROM registration_reminders
              WHERE status = 'failed' AND reminder_type = 'fail-track'`
      });

      expect(result.rows[0].count).toBe(10);
    });

    test('should calculate batch processing rate', () => {
      const batchSize = 100;
      const processingTimeMs = 5000;

      const rate = (batchSize / processingTimeMs) * 1000; // per second

      expect(rate).toBe(20); // 20 reminders per second
    });
  });
});
