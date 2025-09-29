/**
 * Reminder Scheduling Service
 * Manages scheduled reminders for ticket registration deadlines
 *
 * Production tickets: Single reminder 24 hours after purchase
 * Test tickets: Reminders every 5 minutes for testing
 *
 * Requirements: REQ-FUNC-003, REQ-DB-002
 */

import { getDatabaseClient } from './database.js';

export class ReminderScheduler {
  constructor() {
    // Production reminder schedule (single 24-hour reminder after purchase)
    this.productionReminderTypes = [
      { type: '24hr-post-purchase', hoursAfterPurchase: 24 }
    ];

    // Test reminder schedule (every 5 minutes for rapid testing)
    this.testReminderTypes = [
      { type: 'test-5min-1', minutesAfterPurchase: 5 },
      { type: 'test-5min-2', minutesAfterPurchase: 10 },
      { type: 'test-5min-3', minutesAfterPurchase: 15 },
      { type: 'test-5min-4', minutesAfterPurchase: 20 },
      { type: 'test-5min-5', minutesAfterPurchase: 25 },
      { type: 'test-5min-6', minutesAfterPurchase: 30 }
    ];

    this.initialized = false;
    this.initializationPromise = null;
    this.db = null;
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   */
  async ensureInitialized() {
    if (this.initialized && this.db) {
      return this;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      this.initializationPromise = null;
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    try {
      // In integration test mode, use the test isolation manager's database
      if (process.env.INTEGRATION_TEST_MODE === 'true') {
        try {
          const { getTestIsolationManager } = await import('./test-isolation-manager.js');
          const isolationManager = getTestIsolationManager();
          this.db = await isolationManager.getScopedDatabaseClient();
        } catch (error) {
          console.warn('[ReminderScheduler] Failed to get test database, falling back to standard database:', error.message);
          this.db = await getDatabaseClient();
        }
      } else {
        this.db = await getDatabaseClient();
      }

      if (!this.db) {
        throw new Error('Failed to get database client - db is null');
      }

      this.initialized = true;
      return this;
    } catch (error) {
      this.initialized = false;
      this.db = null;
      throw error;
    }
  }

  /**
   * Schedule reminders for a ticket based on registration deadline
   * @param {string} ticketId - Ticket ID to schedule reminders for
   * @param {Date|string} registrationDeadline - Registration deadline
   * @param {boolean} isTestTicket - Whether this is a test ticket
   * @returns {Promise<number>} Number of reminders scheduled
   */
  async scheduleRemindersForTicket(ticketId, registrationDeadline, isTestTicket = false) {
    await this.ensureInitialized();
    const reminders = [];

    // Convert string to Date if needed
    const deadline = typeof registrationDeadline === 'string'
      ? new Date(registrationDeadline)
      : registrationDeadline;

    const now = new Date();

    // Select reminder schedule based on ticket type
    const reminderSchedule = isTestTicket
      ? this.testReminderTypes
      : this.productionReminderTypes;

    console.log(
      `Scheduling ${reminderSchedule.length} ${isTestTicket ? 'test' : 'production'} reminders for ticket ${ticketId}`
    );

    for (const reminder of reminderSchedule) {
      let scheduledAt;

      if (isTestTicket) {
        // Test tickets: Schedule X minutes AFTER purchase
        scheduledAt = new Date(now.getTime() + (reminder.minutesAfterPurchase * 60 * 1000));
      } else {
        // Production tickets: Schedule X hours AFTER purchase
        scheduledAt = new Date(now.getTime() + (reminder.hoursAfterPurchase * 60 * 60 * 1000));
      }

      // Only schedule if before the registration deadline
      if (scheduledAt < deadline) {
        reminders.push({
          ticketId,
          type: reminder.type,
          scheduledAt: scheduledAt.toISOString()
        });
      } else {
        console.log(
          `Skipping ${reminder.type} reminder for ticket ${ticketId} - would be scheduled after deadline (${scheduledAt.toISOString()} >= ${deadline.toISOString()})`
        );
      }
    }

    // Insert reminders (ignore duplicates)
    let scheduledCount = 0;
    for (const reminder of reminders) {
      try {
        await this.db.execute({
          sql: `INSERT INTO registration_reminders (
            ticket_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, 'scheduled')`,
          args: [reminder.ticketId, reminder.type, reminder.scheduledAt]
        });
        scheduledCount++;
      } catch (error) {
        // Ignore unique constraint violations (duplicates)
        if (!error.message.includes('UNIQUE')) {
          console.error(
            `Failed to schedule ${reminder.type} reminder for ticket ${reminder.ticketId}:`,
            error.message
          );
          throw error;
        } else {
          console.log(
            `${reminder.type} reminder already exists for ticket ${reminder.ticketId}`
          );
        }
      }
    }

    console.log(
      `Scheduled ${scheduledCount} ${isTestTicket ? 'test' : 'production'} reminders for ticket ${ticketId}`
    );

    return scheduledCount;
  }

  /**
   * Schedule reminders for multiple tickets in batch
   * @param {Array<{ticketId: string, deadline: Date|string}>} tickets - Tickets to schedule
   * @returns {Promise<number>} Total number of reminders scheduled
   */
  async scheduleRemindersForBatch(tickets) {
    let totalScheduled = 0;

    for (const ticket of tickets) {
      const count = await this.scheduleRemindersForTicket(
        ticket.ticketId,
        ticket.deadline
      );
      totalScheduled += count;
    }

    return totalScheduled;
  }

  /**
   * Cancel all pending reminders for a ticket
   * @param {string} ticketId - Ticket ID to cancel reminders for
   * @returns {Promise<number>} Number of reminders cancelled
   */
  async cancelRemindersForTicket(ticketId) {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: `UPDATE registration_reminders
            SET status = 'cancelled'
            WHERE ticket_id = ?
            AND status = 'scheduled'`,
      args: [ticketId]
    });

    console.log(
      `Cancelled ${result.rowsAffected || 0} reminders for ticket ${ticketId}`
    );

    return result.rowsAffected || 0;
  }

  /**
   * Get pending reminders that need to be sent
   * @param {number} limit - Maximum number of reminders to retrieve
   * @returns {Promise<Array>} Array of pending reminders with ticket and transaction details
   */
  async getPendingReminders(limit = 100) {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    const result = await this.db.execute({
      sql: `SELECT
              r.id,
              r.ticket_id,
              r.reminder_type,
              r.scheduled_at,
              t.transaction_id,
              t.attendee_email,
              t.attendee_first_name,
              t.attendee_last_name,
              t.registration_deadline,
              tx.customer_email,
              tx.customer_name,
              tx.registration_token
            FROM registration_reminders r
            JOIN tickets t ON r.ticket_id = t.ticket_id
            JOIN transactions tx ON t.transaction_id = tx.id
            WHERE r.status = 'scheduled'
            AND r.scheduled_at <= ?
            AND t.registration_status = 'pending'
            ORDER BY r.scheduled_at ASC
            LIMIT ?`,
      args: [now, limit]
    });

    return result.rows;
  }

  /**
   * Mark a reminder as sent or failed
   * @param {number} reminderId - Reminder ID to update
   * @param {boolean} success - Whether the reminder was sent successfully
   * @param {string} errorMessage - Error message if failed
   * @returns {Promise<void>}
   */
  async markReminderSent(reminderId, success = true, errorMessage = null) {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    await this.db.execute({
      sql: `UPDATE registration_reminders
            SET status = ?, sent_at = ?, error_message = ?
            WHERE id = ?`,
      args: [
        success ? 'sent' : 'failed',
        now,
        errorMessage,
        reminderId
      ]
    });

    console.log(
      `Marked reminder ${reminderId} as ${success ? 'sent' : 'failed'}`
    );
  }

  /**
   * Get reminder statistics for a ticket
   * @param {string} ticketId - Ticket ID to get statistics for
   * @returns {Promise<Object>} Reminder statistics
   */
  async getReminderStats(ticketId) {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: `SELECT
              status,
              COUNT(*) as count,
              MIN(scheduled_at) as earliest,
              MAX(scheduled_at) as latest
            FROM registration_reminders
            WHERE ticket_id = ?
            GROUP BY status`,
      args: [ticketId]
    });

    const stats = {
      ticketId,
      scheduled: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      total: 0
    };

    for (const row of result.rows) {
      stats[row.status] = row.count;
      stats.total += row.count;
    }

    return stats;
  }

  /**
   * Clean up old reminders (maintenance task)
   * @param {number} daysOld - Remove reminders older than this many days
   * @returns {Promise<number>} Number of reminders deleted
   */
  async cleanupOldReminders(daysOld = 30) {
    await this.ensureInitialized();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.db.execute({
      sql: `DELETE FROM registration_reminders
            WHERE (status IN ('sent', 'failed', 'cancelled'))
            AND scheduled_at < ?`,
      args: [cutoffDate.toISOString()]
    });

    console.log(
      `Cleaned up ${result.rowsAffected || 0} old reminders`
    );

    return result.rowsAffected || 0;
  }
}

// Export singleton instance
let schedulerInstance;

/**
 * Get singleton instance of ReminderScheduler
 * @returns {ReminderScheduler} Reminder scheduler instance
 */
export function getReminderScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new ReminderScheduler();
  }
  return schedulerInstance;
}

/**
 * Helper function for webhook to schedule reminders for a ticket
 * @param {string} ticketId - Ticket ID
 * @param {Date|string} deadline - Registration deadline
 * @param {boolean} isTestTicket - Whether this is a test ticket
 * @returns {Promise<number>} Number of reminders scheduled
 */
export async function scheduleRegistrationReminders(ticketId, deadline, isTestTicket = false) {
  const scheduler = getReminderScheduler();
  return await scheduler.scheduleRemindersForTicket(ticketId, deadline, isTestTicket);
}

/**
 * Helper function to cancel reminders for a ticket
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<number>} Number of reminders cancelled
 */
export async function cancelRegistrationReminders(ticketId) {
  const scheduler = getReminderScheduler();
  return await scheduler.cancelRemindersForTicket(ticketId);
}