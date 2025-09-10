/**
 * Reminder Scheduling Service
 * Manages scheduled reminders for ticket registration deadlines
 * Schedules 4 reminders per ticket: 72hr, 48hr, 24hr, and 2hr before deadline
 * 
 * Requirements: REQ-FUNC-003, REQ-DB-002
 */

import { getDatabaseClient } from './database.js';

export class ReminderScheduler {
  constructor() {
    this.reminderTypes = [
      { type: '72hr', hoursBeforeDeadline: 72 },
      { type: '48hr', hoursBeforeDeadline: 48 },
      { type: '24hr', hoursBeforeDeadline: 24 },
      { type: 'final', hoursBeforeDeadline: 2 }
    ];
  }
  
  /**
   * Schedule reminders for a ticket based on registration deadline
   * @param {string} ticketId - Ticket ID to schedule reminders for
   * @param {Date|string} registrationDeadline - Registration deadline
   * @returns {Promise<number>} Number of reminders scheduled
   */
  async scheduleRemindersForTicket(ticketId, registrationDeadline) {
    const db = await getDatabaseClient();
    const reminders = [];
    
    // Convert string to Date if needed
    const deadline = typeof registrationDeadline === 'string' 
      ? new Date(registrationDeadline) 
      : registrationDeadline;
    
    const now = new Date();
    
    for (const reminder of this.reminderTypes) {
      const scheduledAt = new Date(deadline);
      scheduledAt.setHours(
        scheduledAt.getHours() - reminder.hoursBeforeDeadline
      );
      
      // Only schedule if time hasn't passed
      if (scheduledAt > now) {
        reminders.push({
          ticketId,
          type: reminder.type,
          scheduledAt: scheduledAt.toISOString()
        });
      } else {
        console.log(
          `Skipping ${reminder.type} reminder for ticket ${ticketId} - already past scheduled time`
        );
      }
    }
    
    // Insert reminders (ignore duplicates)
    let scheduledCount = 0;
    for (const reminder of reminders) {
      try {
        await db.execute({
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
      `Scheduled ${scheduledCount} reminders for ticket ${ticketId}`
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
    const db = await getDatabaseClient();
    
    const result = await db.execute({
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
    const db = await getDatabaseClient();
    const now = new Date().toISOString();
    
    const result = await db.execute({
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
    const db = await getDatabaseClient();
    const now = new Date().toISOString();
    
    await db.execute({
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
    const db = await getDatabaseClient();
    
    const result = await db.execute({
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
    const db = await getDatabaseClient();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db.execute({
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
 * @returns {Promise<number>} Number of reminders scheduled
 */
export async function scheduleRegistrationReminders(ticketId, deadline) {
  const scheduler = getReminderScheduler();
  return await scheduler.scheduleRemindersForTicket(ticketId, deadline);
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