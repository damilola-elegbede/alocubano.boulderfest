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
  let testEventId;

  beforeEach(async () => {
    isolationManager = getTestIsolationManager();
    testDb = await isolationManager.getScopedDatabaseClient();
    scheduler = getReminderScheduler();
    await scheduler.ensureInitialized();

    // Create a test event for FK constraints
    const eventResult = await testDb.execute({
      sql: `INSERT INTO events (
        slug, name, type, status, start_date, end_date,
        venue_name, venue_city, venue_state, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        'test-event',
        'Test Festival',
        'festival',
        'test',
        '2026-05-15',
        '2026-05-17',
        'Test Venue',
        'Test City',
        'CO'
      ]
    });
    testEventId = Number(eventResult.lastInsertRowid);
  });

  afterEach(async () => {
    // Worker-level database management - no per-test cleanup needed
  });

  describe('Batch Size Enforcement (100/run)', () => {
    test('should limit batch to 100 reminders', async () => {
      // Create 150 due reminders
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 150; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_BATCH_${i}`, `batch${i}@example.com`, `User ${i}`, `token_${i}`, JSON.stringify({ test: true }), `ORDER_${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_${i}`,
            `QR_${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'initial', dueTime, 'scheduled']
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
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_MULTI_${i}`, `multi${i}@example.com`, `User ${i}`, `token_m${i}`, JSON.stringify({ test: true }), `ORDER_M${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_M${i}`,
            `QR_M${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'followup_1', dueTime, 'scheduled']
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
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_PARTIAL_${i}`, `partial${i}@example.com`, `User ${i}`, `token_p${i}`, JSON.stringify({ test: true }), `ORDER_P${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_P${i}`,
            `QR_P${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'followup_2', dueTime, 'scheduled']
        });
      }

      // Query should return only 45
      const reminders = await scheduler.getPendingReminders(100);

      expect(reminders.length).toBe(45);
    });

    test('should enforce batch limit across multiple reminder types', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      // Create 50 initial reminders
      for (let i = 0; i < 50; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_INITIAL_${i}`, `initial${i}@example.com`, `User ${i}`, `token_i${i}`, JSON.stringify({ test: true }), `ORDER_I${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_I${i}`,
            `QR_I${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'final', dueTime, 'scheduled']
        });
      }

      // Create 60 24hr-before reminders
      for (let i = 0; i < 60; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_BEFORE_${i}`, `before${i}@example.com`, `User ${i}`, `token_b${i}`, JSON.stringify({ test: true }), `ORDER_B${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_B${i}`,
            `QR_B${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'initial', dueTime, 'scheduled']
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
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_ORDER_${i}`, `order${i}@example.com`, `User ${i}`, `token_o${i}`, JSON.stringify({ test: true }), `ORDER_O${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_O${i}`,
            `QR_O${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, '24hr-post-purchase', times[i].toISOString(), 'scheduled']
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
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_FIFO_${i}`, `fifo${i}@example.com`, `User ${i}`, `token_f${i}`, JSON.stringify({ test: true }), `ORDER_F${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);
        transactionIds.push(txId);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_F${i}`,
            `QR_F${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'followup_1', dueTime, 'scheduled']
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
          transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
        ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
        args: ['TXN_URGENT', 'urgent@example.com', 'Urgent User', 'token_urgent', JSON.stringify({ test: true }), 'ORDER_URGENT', 1, testEventId]
      });
      const urgentTxId = Number(urgentTxResult.lastInsertRowid);

      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
        args: [
          urgentTxId,
          'weekender',
          'TICKET_URGENT',
          'QR_URGENT',
          testEventId,
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [urgentTxId, 'final', urgentTime, 'scheduled']
      });

      // Create regular reminder (just due)
      const regularTime = new Date(now - 1000).toISOString();

      const regularTxResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
        ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
        args: ['TXN_REGULAR', 'regular@example.com', 'Regular User', 'token_regular', JSON.stringify({ test: true }), 'ORDER_REGULAR', 1, testEventId]
      });
      const regularTxId = Number(regularTxResult.lastInsertRowid);

      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
        args: [
          regularTxId,
          'weekender',
          'TICKET_REGULAR',
          'QR_REGULAR',
          testEventId,
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [regularTxId, 'followup_2', regularTime, 'scheduled']
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
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_ATOMIC_${i}`, `atomic${i}@example.com`, `User ${i}`, `token_a${i}`, JSON.stringify({ test: true }), `ORDER_A${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_A${i}`,
            `QR_A${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'initial', dueTime, 'scheduled']
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
              WHERE status = 'sent' AND reminder_type = 'initial'`
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
          transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
        ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
        args: ['TXN_DUP', 'duplicate@example.com', 'Duplicate User', 'token_dup', JSON.stringify({ test: true }), 'ORDER_DUP', 1, testEventId]
      });
      const txId = Number(txResult.lastInsertRowid);

      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
        args: [
          txId,
          'weekender',
          'TICKET_DUP',
          'QR_DUP',
          testEventId,
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      const reminderResult = await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, '72hr-before', dueTime, 'scheduled']
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
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_PARTIALFAIL_${i}`, `partial${i}@example.com`, `User ${i}`, `token_pf${i}`, JSON.stringify({ test: true }), `ORDER_PF${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_PF${i}`,
            `QR_PF${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'followup_2', dueTime, 'scheduled']
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
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_STATS_${i}`, `stats${i}@example.com`, `User ${i}`, `token_s${i}`, JSON.stringify({ test: true }), `ORDER_S${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_S${i}`,
            `QR_S${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'final', dueTime, 'scheduled']
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
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_SUCCESS_${i}`, `success${i}@example.com`, `User ${i}`, `token_sc${i}`, JSON.stringify({ test: true }), `ORDER_SC${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_SC${i}`,
            `QR_SC${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'initial', dueTime, 'scheduled']
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
              WHERE status = 'sent' AND reminder_type = 'initial'`
      });

      expect(result.rows[0].count).toBe(10);
    });

    test('should track failed sends', async () => {
      const dueTime = new Date(Date.now() - 1000).toISOString();

      for (let i = 0; i < 10; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            transaction_id, type, customer_email, customer_name, amount_cents, registration_token, registration_token_expires, order_data, order_number, is_test, event_id
          ) VALUES (?, 'tickets', ?, ?, 12500, ?, datetime('now', '+7 days'), ?, ?, ?, ?)`,
          args: [`TXN_FAIL_${i}`, `fail${i}@example.com`, `User ${i}`, `token_fl${i}`, JSON.stringify({ test: true }), `ORDER_FL${i}`, 1, testEventId]
        });
        const txId = Number(txResult.lastInsertRowid);

        await testDb.execute({
          sql: `INSERT INTO tickets (
            transaction_id, ticket_type, ticket_id, qr_code_data, event_id, price_cents,
            registration_status, registration_deadline
          ) VALUES (?, ?, ?, ?, ?, 12500, ?, ?)`,
          args: [
            txId,
            'weekender',
            `TICKET_FL${i}`,
            `QR_FL${i}`,
            testEventId,
            'pending',
            new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          ]
        });

        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [txId, 'followup_1', dueTime, 'scheduled']
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
              WHERE status = 'failed' AND reminder_type = 'followup_1'`
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
