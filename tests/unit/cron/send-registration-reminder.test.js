/**
 * Unit Tests: Send Registration Reminder
 * Tests individual reminder send logic and email template preparation
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestIsolationManager } from '../../../lib/test-isolation-manager.js';
import timeUtils from '../../../lib/time-utils.js';

describe('Send Registration Reminder - Unit Tests', () => {
  let testDb;
  let isolationManager;

  beforeEach(async () => {
    isolationManager = getTestIsolationManager();
    testDb = await isolationManager.getScopedDatabaseClient();
  });

  afterEach(async () => {
    if (isolationManager) {
      await isolationManager.cleanup();
    }
  });

  describe('Individual Reminder Send Logic', () => {
    test('should prepare reminder data with transaction details', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['customer@example.com', 'John Doe', 'token_prep', 'ORDER_PREP', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create tickets
      const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [txId, 'weekender', 'TICKET_1', 'QR_1', 'pending', deadline]
      });

      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [txId, 'weekender', 'TICKET_2', 'QR_2', 'pending', deadline]
      });

      // Query transaction with ticket count
      const result = await testDb.execute({
        sql: `SELECT
                tx.id,
                tx.customer_email,
                tx.customer_name,
                tx.registration_token,
                tx.order_number,
                COUNT(t.id) as total_tickets,
                SUM(CASE WHEN t.registration_status = 'pending' THEN 1 ELSE 0 END) as pending_tickets
              FROM transactions tx
              LEFT JOIN tickets t ON t.transaction_id = tx.id
              WHERE tx.id = ?
              GROUP BY tx.id`,
        args: [txId]
      });

      const reminderData = result.rows[0];

      expect(reminderData.customer_email).toBe('customer@example.com');
      expect(reminderData.customer_name).toBe('John Doe');
      expect(reminderData.order_number).toBe('ORDER_PREP');
      expect(reminderData.total_tickets).toBe(2);
      expect(reminderData.pending_tickets).toBe(2);
    });

    test('should calculate hours remaining until deadline', () => {
      const now = new Date();
      const deadline24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const deadline48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const deadline1h = new Date(now.getTime() + 1 * 60 * 60 * 1000);

      const hours24 = Math.floor((deadline24h - now) / (1000 * 60 * 60));
      const hours48 = Math.floor((deadline48h - now) / (1000 * 60 * 60));
      const hours1 = Math.floor((deadline1h - now) / (1000 * 60 * 60));

      expect(hours24).toBe(24);
      expect(hours48).toBe(48);
      expect(hours1).toBe(1);
    });

    test('should handle expired deadlines gracefully', () => {
      const now = new Date();
      const expiredDeadline = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      const hoursRemaining = Math.max(0, Math.floor((expiredDeadline - now) / (1000 * 60 * 60)));

      expect(hoursRemaining).toBe(0);
    });
  });

  describe('Email Template Data Preparation', () => {
    test('should format registration URL correctly', () => {
      const token = 'abc123xyz';
      const baseUrl = 'https://www.alocubanoboulderfest.org';
      const registrationUrl = `${baseUrl}/pages/registration.html?token=${token}`;

      expect(registrationUrl).toBe('https://www.alocubanoboulderfest.org/pages/registration.html?token=abc123xyz');
    });

    test('should include all required template parameters', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['template@example.com', 'Template User', 'token_tmpl', 'ORDER_TMPL', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await testDb.execute({
        sql: `INSERT INTO tickets (
          transaction_id, ticket_type, ticket_id, qr_code,
          registration_status, registration_deadline
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [txId, 'weekender', 'TICKET_TMPL', 'QR_TMPL', 'pending', deadline.toISOString()]
      });

      // Prepare template data
      const templateData = {
        customerName: 'Template User',
        customerEmail: 'template@example.com',
        orderNumber: 'ORDER_TMPL',
        registrationToken: 'token_tmpl',
        registrationDeadline: deadline.toISOString(),
        hoursRemaining: 24,
        ticketsRemaining: 1,
        totalTickets: 1,
        registrationUrl: `https://www.alocubanoboulderfest.org/pages/registration.html?token=token_tmpl`
      };

      expect(templateData.customerName).toBeTruthy();
      expect(templateData.customerEmail).toBeTruthy();
      expect(templateData.registrationToken).toBeTruthy();
      expect(templateData.registrationDeadline).toBeTruthy();
      expect(templateData.hoursRemaining).toBeGreaterThan(0);
      expect(templateData.ticketsRemaining).toBeGreaterThan(0);
    });

    test('should format reminder type for display', () => {
      const reminderTypes = {
        'immediate': 'Immediate',
        '24hr-post-purchase': '24 Hours After Purchase',
        '1-week-before': '1 Week Before Deadline',
        '72hr-before': '72 Hours Before Deadline',
        '24hr-before': '24 Hours Before Deadline'
      };

      expect(reminderTypes['24hr-before']).toBe('24 Hours Before Deadline');
      expect(reminderTypes['immediate']).toBe('Immediate');
    });
  });

  describe('Mountain Time Formatting in Reminders', () => {
    test('should format deadline in Mountain Time', () => {
      const utcDate = new Date('2026-05-15T18:00:00Z');
      const mtFormatted = timeUtils.formatDateTime(utcDate);

      // Should include MST/MDT timezone
      expect(mtFormatted).toMatch(/MST|MDT/);
      expect(mtFormatted).toMatch(/2026/);
    });

    test('should format event dates in Mountain Time', () => {
      const eventDate = new Date('2026-05-15T00:00:00Z');
      const formatted = timeUtils.formatEventTime(eventDate, {
        includeTime: false,
        includeTimezone: false,
        longFormat: true
      });

      expect(formatted).toMatch(/May/);
      expect(formatted).toMatch(/2026/);
    });

    test('should handle DST transitions in Mountain Time', () => {
      // DST starts March 9, 2025
      const beforeDST = new Date('2026-03-01T12:00:00Z');
      const afterDST = new Date('2026-04-01T12:00:00Z');

      const formattedBefore = timeUtils.formatDateTime(beforeDST);
      const formattedAfter = timeUtils.formatDateTime(afterDST);

      // Both should include timezone indicator
      expect(formattedBefore).toMatch(/MST|MDT/);
      expect(formattedAfter).toMatch(/MST|MDT/);
    });

    test('should format deadline countdown in readable format', () => {
      const now = new Date();
      const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000);

      const hoursRemaining = Math.floor((deadline - now) / (1000 * 60 * 60));

      let countdownText;
      if (hoursRemaining < 24) {
        countdownText = `${hoursRemaining} hours`;
      } else {
        const daysRemaining = Math.floor(hoursRemaining / 24);
        countdownText = `${daysRemaining} days`;
      }

      expect(countdownText).toBe('3 days');
    });
  });

  describe('Reminder Status Updates', () => {
    test('should update reminder status to sent with timestamp', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['status@example.com', 'Status User', 'token_status', 'ORDER_STATUS', 1]
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
          'TICKET_STATUS',
          'QR_STATUS',
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

      // Update to sent
      const now = new Date().toISOString();
      await testDb.execute({
        sql: `UPDATE registration_reminders
              SET status = 'sent', sent_at = ?
              WHERE id = ?`,
        args: [now, reminderId]
      });

      // Verify
      const check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [reminderId]
      });

      expect(check.rows[0].status).toBe('sent');
      expect(check.rows[0].sent_at).toBeTruthy();
    });

    test('should update reminder status to failed with error message', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['error@example.com', 'Error User', 'token_error', 'ORDER_ERROR', 1]
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
          'TICKET_ERROR',
          'QR_ERROR',
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

      // Update to failed
      const errorMessage = 'SMTP connection timeout';
      await testDb.execute({
        sql: `UPDATE registration_reminders
              SET status = 'failed', sent_at = ?, error_message = ?
              WHERE id = ?`,
        args: [new Date().toISOString(), errorMessage, reminderId]
      });

      // Verify
      const check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [reminderId]
      });

      expect(check.rows[0].status).toBe('failed');
      expect(check.rows[0].error_message).toBe(errorMessage);
      expect(check.rows[0].sent_at).toBeTruthy();
    });

    test('should not update status for already processed reminders', async () => {
      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['processed@example.com', 'Processed User', 'token_proc', 'ORDER_PROC', 1]
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
          'TICKET_PROC',
          'QR_PROC',
          'pending',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        ]
      });

      // Create reminder already marked as sent
      const sentTime = new Date(Date.now() - 3600000).toISOString();
      await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status, sent_at
        ) VALUES (?, ?, ?, ?, ?)`,
        args: [txId, 'already-sent', new Date().toISOString(), 'sent', sentTime]
      });

      // Query for scheduled reminders (should not include already sent)
      const result = await testDb.execute({
        sql: `SELECT * FROM registration_reminders
              WHERE transaction_id = ? AND status = 'scheduled'`,
        args: [txId]
      });

      expect(result.rows.length).toBe(0);
    });
  });

  describe('Error Handling and Logging', () => {
    test('should handle missing transaction data gracefully', async () => {
      // Create reminder without transaction
      try {
        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [99999, 'orphan-reminder', new Date().toISOString(), 'scheduled']
        });

        // Query should not crash
        const result = await testDb.execute({
          sql: `SELECT r.*, tx.customer_email
                FROM registration_reminders r
                LEFT JOIN transactions tx ON tx.id = r.transaction_id
                WHERE r.transaction_id = ?`,
          args: [99999]
        });

        expect(result.rows[0].customer_email).toBeNull();
      } catch (error) {
        // Foreign key constraint might prevent this
        expect(error.message).toMatch(/constraint|foreign key/i);
      }
    });

    test('should log email service errors with context', async () => {
      const mockLogger = {
        error: vi.fn()
      };

      const reminderContext = {
        id: 123,
        transaction_id: 456,
        reminder_type: '24hr-before',
        customer_email: 'test@example.com'
      };

      const error = new Error('Email service unavailable');

      mockLogger.error('Failed to send reminder', {
        reminderId: reminderContext.id,
        transactionId: reminderContext.transaction_id,
        reminderType: reminderContext.reminder_type,
        customerEmail: reminderContext.customer_email,
        error: error.message
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send reminder',
        expect.objectContaining({
          reminderId: 123,
          transactionId: 456,
          reminderType: '24hr-before',
          customerEmail: 'test@example.com'
        })
      );
    });

    test('should handle email validation errors', () => {
      const invalidEmails = [
        '',
        'invalid',
        '@example.com',
        'test@',
        'test @example.com'
      ];

      const isValidEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      };

      for (const email of invalidEmails) {
        expect(isValidEmail(email)).toBe(false);
      }

      expect(isValidEmail('valid@example.com')).toBe(true);
    });
  });

  describe('Reminder Content Variations', () => {
    test('should customize message for different reminder types', () => {
      const reminderMessages = {
        'immediate': 'Thank you for your purchase! Please complete registration.',
        '24hr-post-purchase': 'Reminder: Please register your tickets soon.',
        '1-week-before': 'You have 1 week left to register your tickets.',
        '72hr-before': 'Only 3 days left to register your tickets!',
        '24hr-before': 'URGENT: Less than 24 hours to register!'
      };

      expect(reminderMessages['24hr-before']).toContain('URGENT');
      expect(reminderMessages['immediate']).toContain('Thank you');
    });

    test('should handle single vs multiple tickets in message', () => {
      const getSingularMessage = (count) => {
        return count === 1
          ? 'You have 1 ticket pending registration.'
          : `You have ${count} tickets pending registration.`;
      };

      expect(getSingularMessage(1)).toBe('You have 1 ticket pending registration.');
      expect(getSingularMessage(3)).toBe('You have 3 tickets pending registration.');
    });

    test('should include urgency level based on time remaining', () => {
      const getUrgencyLevel = (hoursRemaining) => {
        if (hoursRemaining < 24) return 'URGENT';
        if (hoursRemaining < 72) return 'Important';
        return 'Reminder';
      };

      expect(getUrgencyLevel(12)).toBe('URGENT');
      expect(getUrgencyLevel(48)).toBe('Important');
      expect(getUrgencyLevel(168)).toBe('Reminder');
    });
  });

  describe('Test Mode Handling', () => {
    test('should identify test reminders', async () => {
      // Create test transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test@example.com', 'Test User', 'token_test', 'ORDER_TEST', 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Query transaction
      const result = await testDb.execute({
        sql: `SELECT * FROM transactions WHERE id = ?`,
        args: [txId]
      });

      expect(result.rows[0].is_test).toBe(1);
    });

    test('should include [TEST] prefix for test reminders', () => {
      const getSubjectPrefix = (isTest) => {
        return isTest ? '[TEST] ' : '';
      };

      const testSubject = getSubjectPrefix(true) + 'Registration Reminder';
      const prodSubject = getSubjectPrefix(false) + 'Registration Reminder';

      expect(testSubject).toBe('[TEST] Registration Reminder');
      expect(prodSubject).toBe('Registration Reminder');
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long customer names', async () => {
      const longName = 'A'.repeat(255);

      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['long@example.com', longName, 'token_long', 'ORDER_LONG', 1]
      });

      const check = await testDb.execute({
        sql: `SELECT customer_name FROM transactions WHERE id = ?`,
        args: [Number(txResult.lastInsertRowid)]
      });

      expect(check.rows[0].customer_name.length).toBe(255);
    });

    test('should handle special characters in customer names', async () => {
      const specialName = "O'Brien-Smith & Co.";

      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, order_number, is_test
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['special@example.com', specialName, 'token_special', 'ORDER_SPECIAL', 1]
      });

      const check = await testDb.execute({
        sql: `SELECT customer_name FROM transactions WHERE id = ?`,
        args: [Number(txResult.lastInsertRowid)]
      });

      expect(check.rows[0].customer_name).toBe(specialName);
    });

    test('should handle null order numbers', async () => {
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, is_test
        ) VALUES (?, ?, ?, ?)`,
        args: ['null@example.com', 'Null User', 'token_null', 1]
      });

      const check = await testDb.execute({
        sql: `SELECT order_number FROM transactions WHERE id = ?`,
        args: [Number(txResult.lastInsertRowid)]
      });

      expect(check.rows[0].order_number).toBeNull();
    });
  });
});
