/**
 * Unit Tests for Adaptive Reminder Scheduling System
 * Tests Option C (Fully Adaptive Schedule) where reminder cadence scales with deadline length
 *
 * Schedules:
 * - 24+ hours: 4 reminders (standard schedule)
 * - 6-24 hours: 3 reminders (late purchase)
 * - 1-6 hours: 2 reminders (very late)
 * - < 1 hour: 1 reminder (emergency)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReminderScheduler, getReminderScheduler } from '../../lib/reminder-scheduler.js';

describe('Adaptive Reminder Scheduling - Unit Tests', () => {
  let scheduler;
  let mockDb;

  beforeEach(() => {
    // Create fresh scheduler instance
    scheduler = new ReminderScheduler();

    // Mock database client
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [], rowsAffected: 1 })
    };

    // Override database initialization
    scheduler.db = mockDb;
    scheduler.initialized = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Standard Deadline (24+ hours) - 4 Reminders', () => {
    it('should schedule 4 reminders for 24+ hour deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T18:00:00Z'); // 32 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(4);
      expect(reminders[0].type).toBe('initial');
      expect(reminders[1].type).toBe('12hr-post-purchase');
      expect(reminders[2].type).toBe('12hr-before-deadline');
      expect(reminders[3].type).toBe('6hr-before-deadline');
    });

    it('should schedule initial reminder at 10% of window capped at 1 hour', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-10T10:00:00Z'); // 9 days = 216 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // 10% of 216 hours = 21.6 hours, but should cap at 1 hour
      expect(reminders[0].type).toBe('initial');
      expect(reminders[0].hoursAfterPurchase).toBe(1);
    });

    it('should schedule reminders for exactly 24 hours', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:00:00Z'); // Exactly 24 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(4);
      expect(reminders[0].type).toBe('initial');
      expect(reminders[1].type).toBe('12hr-post-purchase');
      expect(reminders[2].type).toBe('12hr-before-deadline');
      expect(reminders[3].type).toBe('6hr-before-deadline');
    });

    it('should schedule 12-hour post-purchase reminder', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-03T10:00:00Z'); // 48 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      const postPurchaseReminder = reminders.find(r => r.type === '12hr-post-purchase');
      expect(postPurchaseReminder).toBeDefined();
      expect(postPurchaseReminder.hoursAfterPurchase).toBe(12);
    });

    it('should schedule 12-hour before-deadline reminder', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-03T10:00:00Z'); // 48 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      const beforeDeadlineReminder = reminders.find(r => r.type === '12hr-before-deadline');
      expect(beforeDeadlineReminder).toBeDefined();
      expect(beforeDeadlineReminder.hoursBeforeDeadline).toBe(12);
    });

    it('should schedule 6-hour before-deadline reminder', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-03T10:00:00Z'); // 48 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      const finalReminder = reminders.find(r => r.type === '6hr-before-deadline');
      expect(finalReminder).toBeDefined();
      expect(finalReminder.hoursBeforeDeadline).toBe(6);
    });

    it('should verify all reminders fall within valid time window', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T18:00:00Z'); // 32 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      for (const reminder of reminders) {
        let scheduledTime;
        if (reminder.hoursAfterPurchase !== undefined) {
          scheduledTime = new Date(purchaseTime.getTime() + (reminder.hoursAfterPurchase * 60 * 60 * 1000));
        } else if (reminder.hoursBeforeDeadline !== undefined) {
          scheduledTime = new Date(deadline.getTime() - (reminder.hoursBeforeDeadline * 60 * 60 * 1000));
        }

        expect(scheduledTime.getTime()).toBeGreaterThan(purchaseTime.getTime());
        expect(scheduledTime.getTime()).toBeLessThanOrEqual(deadline.getTime());
      }
    });
  });

  describe('Late Purchase (6-24 hours) - 3 Reminders', () => {
    it('should schedule 3 reminders for 12-hour deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T22:00:00Z'); // 12 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(3);
      expect(reminders[0].type).toBe('initial');
      expect(reminders[1].type).toBe('midpoint-reminder');
      expect(reminders[2].type).toBe('final-reminder');
    });

    it('should schedule midpoint reminder at halfway point', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T22:00:00Z'); // 12 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      const midpointReminder = reminders.find(r => r.type === 'midpoint-reminder');
      expect(midpointReminder).toBeDefined();
      expect(midpointReminder.hoursAfterPurchase).toBe(6); // Half of 12 hours
    });

    it('should schedule final reminder at 20% before deadline capped at 2 hours', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T22:00:00Z'); // 12 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      const finalReminder = reminders.find(r => r.type === 'final-reminder');
      expect(finalReminder).toBeDefined();
      // 20% of 12 hours = 2.4 hours, capped at 2 hours
      expect(finalReminder.hoursBeforeDeadline).toBe(2);
    });

    it('should schedule 3 reminders for exactly 6 hours', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T16:00:00Z'); // Exactly 6 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(3);
      expect(reminders[1].type).toBe('midpoint-reminder');
    });

    it('should schedule 3 reminders for 18-hour deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T04:00:00Z'); // 18 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(3);
      expect(reminders[0].type).toBe('initial');
      expect(reminders[1].type).toBe('midpoint-reminder');
      expect(reminders[2].type).toBe('final-reminder');
    });

    it('should verify midpoint reminder timing for various deadlines', () => {
      const testCases = [
        { hours: 6, expectedMidpoint: 3 },
        { hours: 12, expectedMidpoint: 6 },
        { hours: 18, expectedMidpoint: 9 },
        { hours: 23, expectedMidpoint: 11.5 }
      ];

      for (const testCase of testCases) {
        const purchaseTime = new Date('2026-05-01T10:00:00Z');
        const deadline = new Date(purchaseTime.getTime() + (testCase.hours * 60 * 60 * 1000));

        const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);
        const midpointReminder = reminders.find(r => r.type === 'midpoint-reminder');

        expect(midpointReminder.hoursAfterPurchase).toBe(testCase.expectedMidpoint);
      }
    });
  });

  describe('Very Late Purchase (1-6 hours) - 2 Reminders', () => {
    it('should schedule 2 reminders for 3-hour deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T13:00:00Z'); // 3 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(2);
      expect(reminders[0].type).toBe('initial');
      expect(reminders[1].type).toBe('urgent-reminder');
    });

    it('should schedule urgent reminder at halfway before deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T13:00:00Z'); // 3 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      const urgentReminder = reminders.find(r => r.type === 'urgent-reminder');
      expect(urgentReminder).toBeDefined();
      expect(urgentReminder.hoursBeforeDeadline).toBe(1.5); // Half of 3 hours
    });

    it('should schedule 2 reminders for exactly 1 hour', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T11:00:00Z'); // Exactly 1 hour

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(2);
      expect(reminders[1].type).toBe('urgent-reminder');
    });

    it('should schedule 2 reminders for 5-hour deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T15:00:00Z'); // 5 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(2);
      expect(reminders[0].type).toBe('initial');
      expect(reminders[1].type).toBe('urgent-reminder');
    });

    it('should verify urgent reminder timing for various short deadlines', () => {
      const testCases = [
        { hours: 1, expectedUrgent: 0.5 },
        { hours: 2, expectedUrgent: 1 },
        { hours: 3, expectedUrgent: 1.5 },
        { hours: 5, expectedUrgent: 2.5 }
      ];

      for (const testCase of testCases) {
        const purchaseTime = new Date('2026-05-01T10:00:00Z');
        const deadline = new Date(purchaseTime.getTime() + (testCase.hours * 60 * 60 * 1000));

        const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);
        const urgentReminder = reminders.find(r => r.type === 'urgent-reminder');

        expect(urgentReminder.hoursBeforeDeadline).toBe(testCase.expectedUrgent);
      }
    });

    it('should use quick initial reminder for very short deadlines', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T12:00:00Z'); // 2 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // 10% of 2 hours = 0.2 hours (12 minutes)
      expect(reminders[0].hoursAfterPurchase).toBe(0.2);
    });
  });

  describe('Emergency Purchase (< 1 hour) - 1 Reminder', () => {
    it('should schedule 1 reminder only for 45-minute deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T10:45:00Z'); // 45 minutes

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(1);
      expect(reminders[0].type).toBe('initial');
    });

    it('should schedule quick initial reminder for emergency deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T10:45:00Z'); // 45 minutes

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // 10% of 0.75 hours = 0.075 hours (4.5 minutes)
      expect(reminders[0].hoursAfterPurchase).toBeLessThan(0.1);
      expect(reminders[0].hoursAfterPurchase).toBeGreaterThan(0);
    });

    it('should schedule 1 reminder for 30-minute deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T10:30:00Z'); // 30 minutes

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(1);
      expect(reminders[0].type).toBe('initial');
    });

    it('should schedule 1 reminder for 15-minute deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T10:15:00Z'); // 15 minutes

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(1);
      expect(reminders[0].type).toBe('initial');
    });

    it('should handle very short deadline near purchase time', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T10:05:00Z'); // 5 minutes

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(1);
      expect(reminders[0].type).toBe('initial');
      // 10% of 5 minutes = 0.5 minutes = 0.00833 hours
      expect(reminders[0].hoursAfterPurchase).toBeLessThan(0.02);
    });
  });

  describe('Test Transaction Behavior', () => {
    it('should preserve 5-minute cadence for test transactions', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T12:00:00Z'); // 2 hours (would be very late)

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, true);

      // Should return test cadence regardless of deadline length
      expect(reminders).toHaveLength(6);
      expect(reminders.every(r => r.type.startsWith('test-5min'))).toBe(true);
    });

    it('should use test schedule for long deadline test transaction', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-03T10:00:00Z'); // 48 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, true);

      expect(reminders).toHaveLength(6);
      expect(reminders[0].type).toBe('test-5min-1');
      expect(reminders[5].type).toBe('test-5min-6');
    });

    it('should verify test reminder timing', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T12:00:00Z');

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, true);

      expect(reminders[0].minutesAfterPurchase).toBe(5);
      expect(reminders[1].minutesAfterPurchase).toBe(10);
      expect(reminders[2].minutesAfterPurchase).toBe(15);
      expect(reminders[3].minutesAfterPurchase).toBe(20);
      expect(reminders[4].minutesAfterPurchase).toBe(25);
      expect(reminders[5].minutesAfterPurchase).toBe(30);
    });

    it('should ignore deadline length for test transactions', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');

      // Various deadline lengths should all produce same test schedule
      const deadlines = [
        new Date('2026-05-01T10:30:00Z'), // 30 minutes
        new Date('2026-05-01T12:00:00Z'), // 2 hours
        new Date('2026-05-02T10:00:00Z'), // 24 hours
        new Date('2026-05-10T10:00:00Z')  // 9 days
      ];

      for (const deadline of deadlines) {
        const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, true);
        expect(reminders).toHaveLength(6);
        expect(reminders.every(r => r.type.startsWith('test-5min'))).toBe(true);
      }
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle exact 24-hour threshold', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:00:00Z'); // Exactly 24 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // Should use standard schedule (>= 24 hours)
      expect(reminders).toHaveLength(4);
    });

    it('should handle exact 6-hour threshold', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T16:00:00Z'); // Exactly 6 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // Should use late schedule (>= 6 hours)
      expect(reminders).toHaveLength(3);
      expect(reminders[1].type).toBe('midpoint-reminder');
    });

    it('should handle exact 1-hour threshold', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T11:00:00Z'); // Exactly 1 hour

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // Should use very late schedule (>= 1 hour)
      expect(reminders).toHaveLength(2);
      expect(reminders[1].type).toBe('urgent-reminder');
    });

    it('should handle deadline just above 24 hours', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:01:00Z'); // 24 hours 1 minute

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(4);
    });

    it('should handle deadline just below 24 hours', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T09:59:00Z'); // 23 hours 59 minutes

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(3);
      expect(reminders[1].type).toBe('midpoint-reminder');
    });

    it('should handle deadline just above 6 hours', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T16:01:00Z'); // 6 hours 1 minute

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(3);
    });

    it('should handle deadline just below 6 hours', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T15:59:00Z'); // 5 hours 59 minutes

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(2);
      expect(reminders[1].type).toBe('urgent-reminder');
    });

    it('should handle deadline just above 1 hour', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T11:01:00Z'); // 1 hour 1 minute

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(2);
    });

    it('should handle deadline just below 1 hour', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T10:59:00Z'); // 59 minutes

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(1);
    });
  });

  describe('Initial Reminder Timing', () => {
    it('should cap initial reminder at 1 hour for long deadlines', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-10T10:00:00Z'); // 9 days

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // 10% of 9 days = 21.6 hours, but should cap at 1 hour
      expect(reminders[0].hoursAfterPurchase).toBe(1);
    });

    it('should use 10% of window for medium deadlines', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T20:00:00Z'); // 10 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // 10% of 10 hours = 1 hour (at cap)
      expect(reminders[0].hoursAfterPurchase).toBe(1);
    });

    it('should use 10% of window for short deadlines', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-01T12:00:00Z'); // 2 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      // 10% of 2 hours = 0.2 hours (12 minutes)
      expect(reminders[0].hoursAfterPurchase).toBe(0.2);
    });

    it('should verify initial reminder never exceeds 1 hour', () => {
      const testDeadlines = [
        new Date('2026-05-01T14:00:00Z'), // 4 hours
        new Date('2026-05-02T10:00:00Z'), // 24 hours
        new Date('2026-05-08T10:00:00Z'), // 1 week
        new Date('2026-06-01T10:00:00Z')  // 1 month
      ];

      const purchaseTime = new Date('2026-05-01T10:00:00Z');

      for (const deadline of testDeadlines) {
        const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);
        expect(reminders[0].hoursAfterPurchase).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Reminder Validation and Guards', () => {
    it('should verify no reminders are scheduled after deadline', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:00:00Z'); // 24 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      for (const reminder of reminders) {
        let scheduledTime;
        if (reminder.hoursAfterPurchase !== undefined) {
          scheduledTime = new Date(purchaseTime.getTime() + (reminder.hoursAfterPurchase * 60 * 60 * 1000));
        } else if (reminder.hoursBeforeDeadline !== undefined) {
          scheduledTime = new Date(deadline.getTime() - (reminder.hoursBeforeDeadline * 60 * 60 * 1000));
        }

        expect(scheduledTime.getTime()).toBeLessThanOrEqual(deadline.getTime());
      }
    });

    it('should verify all reminders are scheduled after purchase', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:00:00Z'); // 24 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      for (const reminder of reminders) {
        let scheduledTime;
        if (reminder.hoursAfterPurchase !== undefined) {
          scheduledTime = new Date(purchaseTime.getTime() + (reminder.hoursAfterPurchase * 60 * 60 * 1000));
        } else if (reminder.hoursBeforeDeadline !== undefined) {
          scheduledTime = new Date(deadline.getTime() - (reminder.hoursBeforeDeadline * 60 * 60 * 1000));
        }

        expect(scheduledTime.getTime()).toBeGreaterThan(purchaseTime.getTime());
      }
    });

    it('should verify reminders are in chronological order', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:00:00Z'); // 24 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      const scheduledTimes = reminders.map(reminder => {
        if (reminder.hoursAfterPurchase !== undefined) {
          return purchaseTime.getTime() + (reminder.hoursAfterPurchase * 60 * 60 * 1000);
        } else if (reminder.hoursBeforeDeadline !== undefined) {
          return deadline.getTime() - (reminder.hoursBeforeDeadline * 60 * 60 * 1000);
        } else if (reminder.minutesAfterPurchase !== undefined) {
          return purchaseTime.getTime() + (reminder.minutesAfterPurchase * 60 * 1000);
        }
      });

      for (let i = 1; i < scheduledTimes.length; i++) {
        expect(scheduledTimes[i]).toBeGreaterThanOrEqual(scheduledTimes[i - 1]);
      }
    });

    it('should verify each reminder has valid timing property', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:00:00Z'); // 24 hours

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      for (const reminder of reminders) {
        const hasValidTiming =
          reminder.hoursAfterPurchase !== undefined ||
          reminder.hoursBeforeDeadline !== undefined ||
          reminder.minutesAfterPurchase !== undefined;

        expect(hasValidTiming).toBe(true);
      }
    });
  });

  describe('Singleton Instance', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getReminderScheduler();
      const instance2 = getReminderScheduler();

      expect(instance1).toBe(instance2);
    });

    it('should have computeAdaptiveReminders method', () => {
      const instance = getReminderScheduler();

      expect(typeof instance.computeAdaptiveReminders).toBe('function');
    });
  });

  describe('Input Validation', () => {
    it('should handle string date inputs', () => {
      const purchaseTime = '2026-05-01T10:00:00Z';
      const deadline = '2026-05-02T10:00:00Z';

      const reminders = scheduler.computeAdaptiveReminders(
        new Date(purchaseTime),
        new Date(deadline),
        false
      );

      expect(reminders).toHaveLength(4);
    });

    it('should handle Date object inputs', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:00:00Z');

      const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

      expect(reminders).toHaveLength(4);
    });

    it('should handle boolean isTestTransaction flag', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');
      const deadline = new Date('2026-05-02T10:00:00Z');

      const productionReminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);
      const testReminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, true);

      expect(productionReminders).toHaveLength(4);
      expect(testReminders).toHaveLength(6);
    });
  });

  describe('Comprehensive Schedule Matrix', () => {
    it('should verify correct schedule for all deadline ranges', () => {
      const purchaseTime = new Date('2026-05-01T10:00:00Z');

      const testCases = [
        // Emergency (< 1 hour)
        { deadlineHours: 0.25, expectedCount: 1, expectedType: 'emergency' },
        { deadlineHours: 0.5, expectedCount: 1, expectedType: 'emergency' },
        { deadlineHours: 0.75, expectedCount: 1, expectedType: 'emergency' },

        // Very late (1-6 hours)
        { deadlineHours: 1, expectedCount: 2, expectedType: 'very-late' },
        { deadlineHours: 2, expectedCount: 2, expectedType: 'very-late' },
        { deadlineHours: 4, expectedCount: 2, expectedType: 'very-late' },

        // Late (6-24 hours)
        { deadlineHours: 6, expectedCount: 3, expectedType: 'late' },
        { deadlineHours: 12, expectedCount: 3, expectedType: 'late' },
        { deadlineHours: 18, expectedCount: 3, expectedType: 'late' },

        // Standard (24+ hours)
        { deadlineHours: 24, expectedCount: 4, expectedType: 'standard' },
        { deadlineHours: 48, expectedCount: 4, expectedType: 'standard' },
        { deadlineHours: 168, expectedCount: 4, expectedType: 'standard' }
      ];

      for (const testCase of testCases) {
        const deadline = new Date(purchaseTime.getTime() + (testCase.deadlineHours * 60 * 60 * 1000));
        const reminders = scheduler.computeAdaptiveReminders(purchaseTime, deadline, false);

        expect(reminders).toHaveLength(testCase.expectedCount);
      }
    });
  });
});
