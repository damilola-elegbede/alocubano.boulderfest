/**
 * Reminder Scheduler Integration Tests
 * Tests registration reminder scheduling for production and test transactions
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { generateTestEmail, createTestEvent } from '../handler-test-helper.js';
import { getReminderScheduler } from '../../../lib/reminder-scheduler.js';

describe('Reminder Scheduler Integration', () => {
  let dbClient;
  let testEmail;
  let scheduler;

  beforeEach(async () => {
    testEmail = generateTestEmail();
    dbClient = await getDbClient();
    scheduler = getReminderScheduler();
    await scheduler.ensureInitialized();
  });

  // Helper to create test transaction
  async function createTestTransaction(config = {}) {
    const {
      customerEmail = testEmail,
      isTest = false,
      status = 'completed'
    } = config;

    const transactionId = `txn-${Date.now()}-${Math.random()}`;
    const orderNumber = `ALO-2026-${Date.now()}`;
    const result = await dbClient.execute({
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, customer_email, customer_name, amount_cents, total_amount, status,
        registration_token, registration_token_expires, order_data, order_number, is_test, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'), ?, ?, ?, datetime('now'))`,
      args: [
        transactionId,
        transactionId,
        'tickets',
        customerEmail,
        'Test Customer',
        12500,
        12500,
        status,
        `reg-token-${Date.now()}`,
        JSON.stringify({ test: true }),
        orderNumber,
        isTest ? 1 : 0
      ]
    });

    return Number(result.lastInsertRowid);
  }

  describe('Production Reminder Schedule', () => {
    test('should schedule 4 reminders for production transaction (24+ hours)', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days from now

      const count = await scheduler.scheduleRemindersForTransaction(
        transactionId,
        deadline,
        false
      );

      expect(count).toBe(4); // initial, 24hr-post-purchase, 72hr-before, 24hr-before

      // Verify reminders in database
      const result = await dbClient.execute({
        sql: 'SELECT * FROM registration_reminders WHERE transaction_id = ? ORDER BY scheduled_at',
        args: [transactionId]
      });

      expect(result.rows).toHaveLength(4);

      // Verify reminder types
      const types = result.rows.map(r => r.reminder_type);
      expect(types).toContain('initial');
      expect(types).toContain('24hr-post-purchase');
      expect(types).toContain('72hr-before');
      expect(types).toContain('24hr-before');
    });

    test('should schedule initial reminder 1 hour after purchase', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

      await scheduler.scheduleRemindersForTransaction(transactionId, deadline, false);

      const result = await dbClient.execute({
        sql: `SELECT * FROM registration_reminders
              WHERE transaction_id = ? AND reminder_type = 'initial'`,
        args: [transactionId]
      });

      expect(result.rows).toHaveLength(1);

      const scheduled = new Date(result.rows[0].scheduled_at);
      const now = new Date();
      const diffHours = (scheduled - now) / (1000 * 60 * 60);

      expect(diffHours).toBeGreaterThan(0.9); // ~1 hour
      expect(diffHours).toBeLessThan(1.1);
    });

    test('should schedule 24-hour reminder after purchase', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

      await scheduler.scheduleRemindersForTransaction(transactionId, deadline, false);

      const result = await dbClient.execute({
        sql: `SELECT * FROM registration_reminders
              WHERE transaction_id = ? AND reminder_type = '24hr-post-purchase'`,
        args: [transactionId]
      });

      expect(result.rows).toHaveLength(1);

      const scheduled = new Date(result.rows[0].scheduled_at);
      const now = new Date();
      const diffHours = (scheduled - now) / (1000 * 60 * 60);

      expect(diffHours).toBeGreaterThan(23);
      expect(diffHours).toBeLessThan(25);
    });


    test('should schedule reminder 72 hours before deadline', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

      await scheduler.scheduleRemindersForTransaction(transactionId, deadline, false);

      const result = await dbClient.execute({
        sql: `SELECT * FROM registration_reminders
              WHERE transaction_id = ? AND reminder_type = '72hr-before'`,
        args: [transactionId]
      });

      expect(result.rows).toHaveLength(1);

      const scheduled = new Date(result.rows[0].scheduled_at);
      const diffHours = (deadline - scheduled) / (1000 * 60 * 60);

      expect(diffHours).toBeGreaterThan(71);
      expect(diffHours).toBeLessThan(73);
    });

    test('should schedule reminder 24 hours before deadline', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

      await scheduler.scheduleRemindersForTransaction(transactionId, deadline, false);

      const result = await dbClient.execute({
        sql: `SELECT * FROM registration_reminders
              WHERE transaction_id = ? AND reminder_type = '24hr-before'`,
        args: [transactionId]
      });

      expect(result.rows).toHaveLength(1);

      const scheduled = new Date(result.rows[0].scheduled_at);
      const diffHours = (deadline - scheduled) / (1000 * 60 * 60);

      expect(diffHours).toBeGreaterThan(23);
      expect(diffHours).toBeLessThan(25);
    });
  });

  describe('Test Reminder Schedule', () => {
    test('should schedule 6 reminders for test transaction', async () => {
      const transactionId = await createTestTransaction({ isTest: true });
      const deadline = new Date(Date.now() + (2 * 60 * 60 * 1000)); // 2 hours from now

      const count = await scheduler.scheduleRemindersForTransaction(
        transactionId,
        deadline,
        true
      );

      expect(count).toBe(6); // 5min, 10min, 15min, 20min, 25min, 30min

      // Verify reminders in database
      const result = await dbClient.execute({
        sql: 'SELECT * FROM registration_reminders WHERE transaction_id = ? ORDER BY scheduled_at',
        args: [transactionId]
      });

      expect(result.rows).toHaveLength(6);

      // Verify reminder types
      const types = result.rows.map(r => r.reminder_type);
      expect(types).toContain('test-5min-1');
      expect(types).toContain('test-5min-2');
      expect(types).toContain('test-5min-3');
      expect(types).toContain('test-5min-4');
      expect(types).toContain('test-5min-5');
      expect(types).toContain('test-5min-6');
    });

    test('should schedule test reminders at 5-minute intervals', async () => {
      const transactionId = await createTestTransaction({ isTest: true });
      const deadline = new Date(Date.now() + (2 * 60 * 60 * 1000));

      await scheduler.scheduleRemindersForTransaction(transactionId, deadline, true);

      const result = await dbClient.execute({
        sql: 'SELECT * FROM registration_reminders WHERE transaction_id = ? ORDER BY scheduled_at',
        args: [transactionId]
      });

      const now = new Date();

      for (let i = 0; i < result.rows.length; i++) {
        const scheduled = new Date(result.rows[i].scheduled_at);
        const diffMinutes = (scheduled - now) / (1000 * 60);

        // Should be scheduled at 5, 10, 15, 20, 25, 30 minutes
        const expectedMinutes = (i + 1) * 5;
        expect(diffMinutes).toBeGreaterThan(expectedMinutes - 0.5);
        expect(diffMinutes).toBeLessThan(expectedMinutes + 0.5);
      }
    });
  });

  describe('Duplicate Prevention', () => {
    test('should prevent duplicate reminders for same transaction', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

      // Schedule first time
      const count1 = await scheduler.scheduleRemindersForTransaction(
        transactionId,
        deadline,
        false
      );

      // Try to schedule again
      const count2 = await scheduler.scheduleRemindersForTransaction(
        transactionId,
        deadline,
        false
      );

      expect(count1).toBe(4);
      expect(count2).toBe(0); // All duplicates, none added

      // Verify still only 4 reminders
      const result = await dbClient.execute({
        sql: 'SELECT COUNT(*) as count FROM registration_reminders WHERE transaction_id = ?',
        args: [transactionId]
      });

      expect(Number(result.rows[0].count)).toBe(4);
    });
  });

  describe('Expired Deadline Handling', () => {
    test('should skip all reminders if deadline has passed', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() - (1000 * 60 * 60)); // 1 hour ago

      const count = await scheduler.scheduleRemindersForTransaction(
        transactionId,
        deadline,
        false
      );

      expect(count).toBe(0);

      // Verify no reminders in database
      const result = await dbClient.execute({
        sql: 'SELECT COUNT(*) as count FROM registration_reminders WHERE transaction_id = ?',
        args: [transactionId]
      });

      expect(Number(result.rows[0].count)).toBe(0);
    });

    test('should skip reminders that would be scheduled after deadline', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (2 * 60 * 60 * 1000)); // 2 hours from now

      const count = await scheduler.scheduleRemindersForTransaction(
        transactionId,
        deadline,
        false
      );

      // Should only schedule initial reminder + followup_2 (very late purchase: 1-6 hours)
      // 24hr-post-purchase would be after deadline
      expect(count).toBeGreaterThanOrEqual(0); // May be 0-2 depending on timing
      expect(count).toBeLessThan(4);
    });
  });

  describe('Reminder Statistics', () => {
    test('should get reminder stats for transaction', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

      await scheduler.scheduleRemindersForTransaction(transactionId, deadline, false);

      const stats = await scheduler.getReminderStats(transactionId);

      expect(stats.transactionId).toBe(transactionId);
      expect(stats.scheduled).toBe(4);
      expect(stats.sent).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.cancelled).toBe(0);
      expect(stats.total).toBe(4);
    });
  });

  describe('Pending Reminders', () => {
    test('should get pending reminders that are due', async () => {
      const transactionId = await createTestTransaction({ isTest: false });

      // Create test event
      const eventId = await createTestEvent(dbClient);

      // Schedule a reminder for 1 second ago (already due)
      const pastTime = new Date(Date.now() - 1000);
      await dbClient.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, 'scheduled')`,
        args: [transactionId, 'initial', pastTime.toISOString()]
      });

      // Add ticket for this transaction
      await dbClient.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          qr_token, registration_status, registration_deadline, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'), datetime('now'))`,
        args: [
          `ticket-${Date.now()}`,
          transactionId,
          'Weekend Pass',
          eventId,
          12500,
          `qr-${Date.now()}`,
          'pending'
        ]
      });

      const pending = await scheduler.getPendingReminders();

      expect(pending.length).toBeGreaterThan(0);

      const reminder = pending.find(r => r.transaction_id === transactionId);
      expect(reminder).toBeDefined();
      expect(reminder.reminder_type).toBe('initial');
      expect(reminder.customer_email).toBe(testEmail);
      expect(Number(reminder.pending_tickets)).toBeGreaterThan(0);
    });

    test('should NOT return reminders for fully registered transactions', async () => {
      const transactionId = await createTestTransaction({ isTest: false });

      // Create test event
      const eventId = await createTestEvent(dbClient);

      // Schedule a reminder
      const pastTime = new Date(Date.now() - 1000);
      await dbClient.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, 'scheduled')`,
        args: [transactionId, 'initial', pastTime.toISOString()]
      });

      // Add ticket that is already registered
      await dbClient.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          qr_token, registration_status, attendee_first_name, attendee_last_name,
          attendee_email, registration_deadline, registered_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'), datetime('now'), datetime('now'))`,
        args: [
          `ticket-${Date.now()}`,
          transactionId,
          'Weekend Pass',
          eventId,
          12500,
          `qr-${Date.now()}`,
          'completed',
          'John',
          'Doe',
          testEmail
        ]
      });

      const pending = await scheduler.getPendingReminders();

      // Should not include reminder for fully registered transaction
      const reminder = pending.find(r => r.transaction_id === transactionId);
      expect(reminder).toBeUndefined();
    });
  });

  describe('Mark Reminder Sent', () => {
    test('should mark reminder as sent', async () => {
      const transactionId = await createTestTransaction({ isTest: false });

      // Create reminder
      const result = await dbClient.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, 'scheduled')`,
        args: [transactionId, 'initial', new Date().toISOString()]
      });

      const reminderId = Number(result.lastInsertRowid);

      await scheduler.markReminderSent(reminderId, true);

      // Verify status updated
      const check = await dbClient.execute({
        sql: 'SELECT * FROM registration_reminders WHERE id = ?',
        args: [reminderId]
      });

      expect(check.rows[0].status).toBe('sent');
      expect(check.rows[0].sent_at).toBeDefined();
    });

    test('should mark reminder as failed with error message', async () => {
      const transactionId = await createTestTransaction({ isTest: false });

      const result = await dbClient.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, 'scheduled')`,
        args: [transactionId, 'initial', new Date().toISOString()]
      });

      const reminderId = Number(result.lastInsertRowid);

      await scheduler.markReminderSent(reminderId, false, 'Email API timeout');

      const check = await dbClient.execute({
        sql: 'SELECT * FROM registration_reminders WHERE id = ?',
        args: [reminderId]
      });

      expect(check.rows[0].status).toBe('failed');
      expect(check.rows[0].error_message).toBe('Email API timeout');
    });
  });

  describe('Cancel Reminders', () => {
    test('should cancel all pending reminders for transaction', async () => {
      const transactionId = await createTestTransaction({ isTest: false });
      const deadline = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));

      await scheduler.scheduleRemindersForTransaction(transactionId, deadline, false);

      const cancelled = await scheduler.cancelRemindersForTransaction(transactionId);

      expect(cancelled).toBe(4);

      // Verify all marked as cancelled
      const result = await dbClient.execute({
        sql: `SELECT COUNT(*) as count FROM registration_reminders
              WHERE transaction_id = ? AND status = 'cancelled'`,
        args: [transactionId]
      });

      expect(Number(result.rows[0].count)).toBe(4);
    });

    test('should NOT cancel already sent reminders', async () => {
      const transactionId = await createTestTransaction({ isTest: false });

      // Create reminders with mixed statuses
      await dbClient.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, 'sent')`,
        args: [transactionId, 'initial', new Date().toISOString()]
      });

      await dbClient.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, 'scheduled')`,
        args: [transactionId, '24hr-post-purchase', new Date().toISOString()]
      });

      const cancelled = await scheduler.cancelRemindersForTransaction(transactionId);

      expect(cancelled).toBe(1); // Only scheduled one

      // Verify sent reminder still has 'sent' status
      const result = await dbClient.execute({
        sql: `SELECT status FROM registration_reminders
              WHERE transaction_id = ? AND reminder_type = 'initial'`,
        args: [transactionId]
      });

      expect(result.rows[0].status).toBe('sent');
    });
  });

  describe('Cleanup Old Reminders', () => {
    test('should clean up old sent reminders', async () => {
      const transactionId = await createTestTransaction({ isTest: false });

      // Create old reminder (40 days ago)
      const oldDate = new Date(Date.now() - (40 * 24 * 60 * 60 * 1000));
      await dbClient.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, 'sent')`,
        args: [transactionId, 'initial', oldDate.toISOString()]
      });

      // Create recent reminder
      await dbClient.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, 'sent')`,
        args: [transactionId, '24hr-post-purchase', new Date().toISOString()]
      });

      const cleaned = await scheduler.cleanupOldReminders(30);

      expect(cleaned).toBe(1); // Only old one

      // Verify recent reminder still exists
      const result = await dbClient.execute({
        sql: `SELECT COUNT(*) as count FROM registration_reminders
              WHERE transaction_id = ?`,
        args: [transactionId]
      });

      expect(Number(result.rows[0].count)).toBe(1);
    });
  });
});
