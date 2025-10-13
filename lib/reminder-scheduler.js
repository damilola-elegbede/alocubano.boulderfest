/**
 * Reminder Scheduling Service
 * Manages scheduled reminders for ticket registration deadlines
 *
 * Production tickets:
 *   - 24 hours after purchase
 *   - 1 week before deadline
 *   - 72 hours before deadline
 *   - 24 hours before deadline
 *
 * Test tickets: Reminders every 5 minutes for testing (6 total over 30 minutes)
 *
 * Requirements: REQ-FUNC-003, REQ-DB-002
 */

import { getDatabaseClient } from './database.js';

export class ReminderScheduler {
  constructor() {
    // Production reminder schedule
    // - 1 hour after purchase (initial confirmation)
    // - 24 hours after purchase
    // - 1 week, 72 hours, and 24 hours before deadline
    this.productionReminderTypes = [
      { type: 'initial', hoursAfterPurchase: 1 },
      { type: '24hr-post-purchase', hoursAfterPurchase: 24 },
      { type: '1-week-before', hoursBeforeDeadline: 168 }, // 7 days
      { type: '72hr-before', hoursBeforeDeadline: 72 },
      { type: '24hr-before', hoursBeforeDeadline: 24 }
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
   * Schedule reminders for a transaction based on registration deadline
   * Sends ONE email to the purchaser about all tickets in the order
   * @param {number} transactionId - Transaction ID to schedule reminders for
   * @param {Date|string} registrationDeadline - Registration deadline
   * @param {boolean} isTestTransaction - Whether this is a test transaction
   * @returns {Promise<number>} Number of reminders scheduled
   */
  async scheduleRemindersForTransaction(transactionId, registrationDeadline, isTestTransaction = false) {
    await this.ensureInitialized();
    const reminders = [];

    // Convert string to Date if needed
    const deadline = typeof registrationDeadline === 'string'
      ? new Date(registrationDeadline)
      : registrationDeadline;

    const now = new Date();

    // Select reminder schedule based on transaction type
    const reminderSchedule = isTestTransaction
      ? this.testReminderTypes
      : this.productionReminderTypes;

    console.log(
      `Scheduling ${reminderSchedule.length} ${isTestTransaction ? 'test' : 'production'} reminders for transaction ${transactionId}`
    );

    for (const reminder of reminderSchedule) {
      let scheduledAt;

      if (isTestTransaction) {
        // Test transactions: Schedule X minutes AFTER purchase
        scheduledAt = new Date(now.getTime() + (reminder.minutesAfterPurchase * 60 * 1000));
      } else if (reminder.hoursAfterPurchase) {
        // Production transactions: Schedule X hours AFTER purchase
        scheduledAt = new Date(now.getTime() + (reminder.hoursAfterPurchase * 60 * 60 * 1000));
      } else if (reminder.hoursBeforeDeadline) {
        // Production transactions: Schedule X hours BEFORE deadline
        scheduledAt = new Date(deadline.getTime() - (reminder.hoursBeforeDeadline * 60 * 60 * 1000));
      } else {
        console.error(`Invalid reminder configuration for ${reminder.type}:`, reminder);
        continue;
      }

      // Only schedule if:
      // 1. Scheduled time is in the future (after now)
      // 2. Scheduled time is before or at the registration deadline
      if (scheduledAt > now && scheduledAt <= deadline) {
        reminders.push({
          transactionId,
          type: reminder.type,
          scheduledAt: scheduledAt.toISOString()
        });
      } else if (scheduledAt <= now) {
        console.log(
          `Skipping ${reminder.type} reminder for transaction ${transactionId} - scheduled time is in the past (${scheduledAt.toISOString()} <= ${now.toISOString()})`
        );
      } else {
        console.log(
          `Skipping ${reminder.type} reminder for transaction ${transactionId} - would be scheduled after deadline (${scheduledAt.toISOString()} >= ${deadline.toISOString()})`
        );
      }
    }

    // Insert reminders (ignore duplicates)
    let scheduledCount = 0;
    for (const reminder of reminders) {
      try {
        await this.db.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, 'scheduled')`,
          args: [reminder.transactionId, reminder.type, reminder.scheduledAt]
        });
        scheduledCount++;
      } catch (error) {
        // Ignore unique constraint violations (duplicates)
        if (!error.message.includes('UNIQUE')) {
          console.error(
            `Failed to schedule ${reminder.type} reminder for transaction ${reminder.transactionId}:`,
            error.message
          );
          throw error;
        } else {
          console.log(
            `${reminder.type} reminder already exists for transaction ${reminder.transactionId}`
          );
        }
      }
    }

    // Detect and warn if zero reminders were scheduled
    if (scheduledCount === 0) {
      console.warn(
        `⚠️ WARNING: ZERO reminders scheduled for transaction ${transactionId}`,
        {
          transactionId,
          deadline: registrationDeadline.toISOString(),
          purchaseTime: now.toISOString(),
          isTestTransaction,
          totalRemindersAttempted: reminderSchedule.length,
          reason: 'All reminders fell outside valid time window (past or after deadline)'
        }
      );

      // Log to audit trail for monitoring
      try {
        const { default: auditService } = await import('./audit-service.js');
        await auditService.logDataChange({
          action: 'ZERO_REMINDERS_SCHEDULED',
          targetType: 'transaction_reminders',
          targetId: String(transactionId),
          metadata: {
            deadline: registrationDeadline.toISOString(),
            purchaseTime: now.toISOString(),
            isTestTransaction,
            reminderSchedule: reminderSchedule.map(r => r.type)
          },
          severity: 'warning'
        });
      } catch (auditError) {
        console.error('Failed to log zero reminders to audit trail:', auditError.message);
      }
    }

    console.log(
      `Scheduled ${scheduledCount} ${isTestTransaction ? 'test' : 'production'} reminders for transaction ${transactionId}`
    );

    return scheduledCount;
  }

  /**
   * Cancel all pending reminders for a transaction
   * @param {number} transactionId - Transaction ID to cancel reminders for
   * @returns {Promise<number>} Number of reminders cancelled
   */
  async cancelRemindersForTransaction(transactionId) {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: `UPDATE registration_reminders
            SET status = 'cancelled'
            WHERE transaction_id = ?
            AND status = 'scheduled'`,
      args: [transactionId]
    });

    console.log(
      `Cancelled ${result.rowsAffected || 0} reminders for transaction ${transactionId}`
    );

    return result.rowsAffected || 0;
  }

  /**
   * Get pending reminders that need to be sent
   * @param {number} limit - Maximum number of reminders to retrieve
   * @returns {Promise<Array>} Array of pending reminders with transaction details and ticket counts
   */
  async getPendingReminders(limit = 100) {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    console.log(`[ReminderScheduler] Querying pending reminders with now=${now}, limit=${limit}`);

    const result = await this.db.execute({
      sql: `SELECT
              r.id,
              r.transaction_id,
              r.reminder_type,
              r.scheduled_at,
              tx.customer_email,
              tx.customer_name,
              tx.registration_token,
              tx.order_number,
              (SELECT COUNT(*) FROM tickets WHERE transaction_id = r.transaction_id) as total_tickets,
              (SELECT COUNT(*) FROM tickets WHERE transaction_id = r.transaction_id AND registration_status = 'pending') as pending_tickets,
              (SELECT registration_deadline FROM tickets WHERE transaction_id = r.transaction_id LIMIT 1) as registration_deadline
            FROM registration_reminders r
            JOIN transactions tx ON r.transaction_id = tx.id
            WHERE r.status = 'scheduled'
            AND r.scheduled_at <= ?
            ORDER BY r.scheduled_at ASC
            LIMIT ?`,
      args: [now, limit]
    });

    console.log(`[ReminderScheduler] Query returned ${result.rows.length} total reminders`);

    // Only return reminders where there are still pending tickets
    const filtered = result.rows.filter(row => row.pending_tickets > 0);

    console.log(`[ReminderScheduler] After filtering: ${filtered.length} reminders with pending tickets`);

    if (result.rows.length > filtered.length) {
      const skipped = result.rows.filter(row => row.pending_tickets === 0);
      console.log(`[ReminderScheduler] Skipped ${skipped.length} reminders (no pending tickets):`,
        skipped.map(r => ({ id: r.id, transaction_id: r.transaction_id, reminder_type: r.reminder_type }))
      );
    }

    return filtered;
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

    const newStatus = success ? 'sent' : 'failed';

    console.log(`[ReminderScheduler] Marking reminder ${reminderId} as ${newStatus}`, {
      reminderId,
      newStatus,
      sent_at: now,
      errorMessage: errorMessage || null
    });

    const result = await this.db.execute({
      sql: `UPDATE registration_reminders
            SET status = ?, sent_at = ?, error_message = ?
            WHERE id = ?`,
      args: [
        newStatus,
        now,
        errorMessage,
        reminderId
      ]
    });

    console.log(`[ReminderScheduler] Update result: ${result.rowsAffected || 0} rows affected`);
  }

  /**
   * Get reminder statistics for a transaction
   * @param {number} transactionId - Transaction ID to get statistics for
   * @returns {Promise<Object>} Reminder statistics
   */
  async getReminderStats(transactionId) {
    await this.ensureInitialized();

    const result = await this.db.execute({
      sql: `SELECT
              status,
              COUNT(*) as count,
              MIN(scheduled_at) as earliest,
              MAX(scheduled_at) as latest
            FROM registration_reminders
            WHERE transaction_id = ?
            GROUP BY status`,
      args: [transactionId]
    });

    const stats = {
      transactionId,
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
 * Helper function to schedule reminders for a transaction
 * @param {number} transactionId - Transaction ID
 * @param {Date|string} deadline - Registration deadline
 * @param {boolean} isTestTransaction - Whether this is a test transaction
 * @returns {Promise<number>} Number of reminders scheduled
 */
export async function scheduleRegistrationReminders(transactionId, deadline, isTestTransaction = false) {
  const scheduler = getReminderScheduler();
  return await scheduler.scheduleRemindersForTransaction(transactionId, deadline, isTestTransaction);
}

/**
 * Helper function to cancel reminders for a transaction
 * @param {number} transactionId - Transaction ID
 * @returns {Promise<number>} Number of reminders cancelled
 */
export async function cancelRegistrationReminders(transactionId) {
  const scheduler = getReminderScheduler();
  return await scheduler.cancelRemindersForTransaction(transactionId);
}