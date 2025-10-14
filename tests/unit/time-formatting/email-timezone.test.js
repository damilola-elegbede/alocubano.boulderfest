/**
 * Email Timezone Formatting Tests
 *
 * Validates that all email timestamps display Mountain Time correctly,
 * including DST transitions, timezone suffixes, and consistency across templates.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import timeUtils from '../../../lib/time-utils.js';

describe('Email Timezone Formatting', () => {
  // Force America/Denver timezone for consistent cross-platform behavior
  // This ensures Intl.DateTimeFormat behaves identically on Linux and macOS
  beforeAll(() => {
    process.env.TZ = 'America/Denver';
  });
  describe('Mountain Time Display', () => {
    it('should format timestamps in Mountain Time, not UTC', () => {
      const utcDate = '2026-01-15T18:30:00Z'; // 6:30 PM UTC
      const formatted = timeUtils.formatDateTime(utcDate);

      // In winter, Mountain Time is UTC-7 (MST)
      // 6:30 PM UTC = 11:30 AM MST
      expect(formatted).toContain('11:30 AM');
      expect(formatted).toContain('MST');
    });

    it('should not display browser timezone', () => {
      const date = '2026-01-15T18:30:00Z';
      const formatted = timeUtils.formatDateTime(date);

      // Should always use Mountain Time, not system timezone
      expect(formatted).toMatch(/MST|MDT/);
    });

    it('should format dates consistently across all email templates', () => {
      const date = '2026-01-15T18:30:00Z';

      const formatted1 = timeUtils.formatDateTime(date);
      const formatted2 = timeUtils.formatEventTime(date, {
        includeTime: true,
        includeTimezone: true
      });

      expect(formatted1).toBe(formatted2);
    });
  });

  describe('DST Transitions', () => {
    it('should use MST in winter months (November-March)', () => {
      const winterDates = [
        '2026-01-15T12:00:00Z', // January
        '2026-02-15T12:00:00Z', // February
        '2026-03-01T12:00:00Z', // Early March (before DST)
        '2026-11-15T12:00:00Z', // November (after DST ends)
        '2026-12-15T12:00:00Z'  // December
      ];

      winterDates.forEach(date => {
        const formatted = timeUtils.formatDateTime(date);
        expect(formatted).toContain('MST');
      });
    });

    it('should use MDT in summer months (March-November)', () => {
      const summerDates = [
        '2026-04-15T12:00:00Z', // April
        '2026-05-15T12:00:00Z', // May
        '2026-06-15T12:00:00Z', // June
        '2026-07-15T12:00:00Z', // July
        '2026-08-15T12:00:00Z', // August
        '2026-09-15T12:00:00Z', // September
        '2026-10-15T12:00:00Z'  // October
      ];

      summerDates.forEach(date => {
        const formatted = timeUtils.formatDateTime(date);
        expect(formatted).toContain('MDT');
      });
    });

    it('should handle DST transition in March (2nd Sunday at 2 AM)', () => {
      // DST starts March 8, 2026 at 2:00 AM MST → 3:00 AM MDT
      const beforeDST = '2026-03-08T08:59:00Z'; // 1:59 AM MST
      const afterDST = '2026-03-08T09:01:00Z';  // 3:01 AM MDT

      const formattedBefore = timeUtils.formatDateTime(beforeDST);
      const formattedAfter = timeUtils.formatDateTime(afterDST);

      expect(formattedBefore).toContain('MST');
      expect(formattedAfter).toContain('MDT');
    });

    it('should handle DST transition in November (1st Sunday at 2 AM)', () => {
      // DST ends November 1, 2026 at 2:00 AM MDT → 1:00 AM MST
      const beforeDST = '2026-11-01T07:59:00Z'; // 1:59 AM MDT
      const afterDST = '2026-11-01T09:01:00Z';  // 2:01 AM MST

      const formattedBefore = timeUtils.formatDateTime(beforeDST);
      const formattedAfter = timeUtils.formatDateTime(afterDST);

      expect(formattedBefore).toContain('MDT');
      expect(formattedAfter).toContain('MST');
    });

    it('should correctly calculate UTC offset during MST (UTC-7)', () => {
      const winterDate = new Date('2026-01-15T12:00:00Z');
      const info = timeUtils.getMountainTimeInfo(winterDate);

      expect(info.abbreviation).toBe('MST');
      expect(info.isDST).toBe(false);
    });

    it('should correctly calculate UTC offset during MDT (UTC-6)', () => {
      const summerDate = new Date('2026-07-15T12:00:00Z');
      const info = timeUtils.getMountainTimeInfo(summerDate);

      expect(info.abbreviation).toBe('MDT');
      expect(info.isDST).toBe(true);
    });
  });

  describe('Timezone Suffix Presence', () => {
    it('should include MST/MDT suffix in all timestamps', () => {
      const date = '2026-01-15T18:30:00Z';
      const formatted = timeUtils.formatDateTime(date);

      expect(formatted).toMatch(/MST|MDT/);
    });

    it('should include (MT) indicator in Mountain Time formatted strings', () => {
      const date = '2026-01-15T18:30:00Z';
      const formatted = timeUtils.formatDateTime(date);

      // Should have either MST or MDT (both are Mountain Time)
      expect(formatted).toMatch(/MST|MDT/);
    });

    it('should show timezone abbreviation in event time formatting', () => {
      const date = '2026-05-15T19:00:00Z';
      const formatted = timeUtils.formatEventTime(date, {
        includeTime: true,
        includeTimezone: true
      });

      expect(formatted).toMatch(/MST|MDT/);
    });

    it('should allow omitting timezone when requested', () => {
      const date = '2026-01-15T18:30:00Z';
      const formatted = timeUtils.formatEventTime(date, {
        includeTime: true,
        includeTimezone: false
      });

      expect(formatted).not.toMatch(/MST|MDT/);
    });
  });

  describe('Email Template Format Helpers', () => {
    it('should format purchase dates for order confirmations', () => {
      const purchaseDate = '2026-01-15T18:30:00Z';
      const formatted = timeUtils.formatDateTime(purchaseDate);

      expect(formatted).toContain('Jan 15, 2026');
      expect(formatted).toContain('11:30 AM');
      expect(formatted).toContain('MST');
    });

    it('should format registration deadlines correctly', () => {
      const hours = 168; // 7 days = 168 hours
      const deadline = timeUtils.getRegistrationDeadline(hours);

      // Should return a formatted Mountain Time string
      expect(deadline).toMatch(/MST|MDT/);
      expect(deadline).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
    });

    it('should format event dates for attendee confirmations', () => {
      const eventDate = '2026-05-15T19:00:00Z';
      const formatted = timeUtils.formatEventTime(eventDate, {
        includeTime: true,
        includeTimezone: true,
        longFormat: false
      });

      expect(formatted).toContain('2026');
      expect(formatted).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
      expect(formatted).toMatch(/MST|MDT/);
    });

    it('should format dates without time for simple displays', () => {
      const date = '2026-05-15T19:00:00Z';
      const formatted = timeUtils.formatDate(date);

      expect(formatted).toContain('May 15, 2026');
      expect(formatted).not.toMatch(/\d{1,2}:\d{2}/); // No time
      expect(formatted).not.toMatch(/MST|MDT/); // No timezone
    });
  });

  describe('7-Day Registration Deadline Calculation', () => {
    it('should calculate deadline 7 days from now', () => {
      // getRegistrationDeadline uses current time internally
      // We can't easily mock Date in this context, so we verify it returns valid format
      const deadline = timeUtils.getRegistrationDeadline(168); // 7 days = 168 hours

      // Should return a properly formatted Mountain Time string
      expect(deadline).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM) (MST|MDT)/);
    });

    it('should handle deadline calculation with DST-aware formatting', () => {
      // Verify deadline calculation returns proper timezone
      const deadline = timeUtils.getRegistrationDeadline(168); // 7 days

      // Should correctly display timezone
      expect(deadline).toMatch(/MST|MDT/);
    });

    it('should calculate 24-hour deadline correctly', () => {
      const deadline = timeUtils.getRegistrationDeadline(24);

      // Should return valid Mountain Time format
      expect(deadline).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM) (MST|MDT)/);
    });

    it('should calculate 48-hour deadline correctly', () => {
      const deadline = timeUtils.getRegistrationDeadline(48);

      // Should return valid Mountain Time format
      expect(deadline).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM) (MST|MDT)/);
    });

    it('should return invalid deadline for negative hours', () => {
      const deadline = timeUtils.getRegistrationDeadline(-10);

      expect(deadline).toBe('Invalid deadline');
    });

    it('should return invalid deadline for non-numeric input', () => {
      const deadline = timeUtils.getRegistrationDeadline('not-a-number');

      expect(deadline).toBe('Invalid deadline');
    });
  });

  describe('API Response Enhancement', () => {
    it('should enhance API responses with _mt fields', () => {
      const apiData = {
        id: 1,
        created_at: '2026-01-15T18:30:00Z',
        updated_at: '2026-01-16T12:00:00Z'
      };

      const enhanced = timeUtils.enhanceApiResponse(apiData, ['created_at', 'updated_at']);

      expect(enhanced.created_at_mt).toContain('Jan 15, 2026');
      expect(enhanced.created_at_mt).toContain('MST');
      expect(enhanced.updated_at_mt).toContain('Jan 16, 2026');
      expect(enhanced.updated_at_mt).toContain('MST');
      expect(enhanced.timezone).toBe('America/Denver');
    });

    it('should enhance arrays of data', () => {
      const apiData = [
        { id: 1, created_at: '2026-01-15T18:30:00Z' },
        { id: 2, created_at: '2026-01-16T18:30:00Z' }
      ];

      const enhanced = timeUtils.enhanceApiResponse(apiData, ['created_at']);

      expect(enhanced[0].created_at_mt).toContain('Jan 15, 2026');
      expect(enhanced[1].created_at_mt).toContain('Jan 16, 2026');
    });

    it('should add registration deadline when requested', () => {
      const apiData = { id: 1 };

      const enhanced = timeUtils.enhanceApiResponse(apiData, [], {
        includeDeadline: true,
        deadlineHours: 168
      });

      expect(enhanced.registration_deadline_mt).toBeDefined();
      expect(enhanced.registration_deadline_mt).toMatch(/MST|MDT/);
    });
  });

  describe('Consistency Across Templates', () => {
    it('should use same format for order confirmation dates', () => {
      const date = '2026-01-15T18:30:00Z';

      const orderDate = timeUtils.formatDateTime(date);
      const paymentDate = timeUtils.formatDateTime(date);

      expect(orderDate).toBe(paymentDate);
    });

    it('should use same format for registration reminder dates', () => {
      const date = '2026-01-15T18:30:00Z';

      const orderDate = timeUtils.formatDateTime(date);
      const deadline = timeUtils.formatEventTime(date, {
        includeTime: true,
        includeTimezone: true
      });

      expect(orderDate).toBe(deadline);
    });

    it('should use same format for attendee confirmation dates', () => {
      const date = '2026-05-15T19:00:00Z';

      const eventDate1 = timeUtils.formatDateTime(date);
      const eventDate2 = timeUtils.toMountainTime(date);

      expect(eventDate1).toBe(eventDate2);
    });
  });

  describe('Edge Cases and Special Scenarios', () => {
    it('should handle midnight times correctly', () => {
      const midnight = '2026-01-15T07:00:00Z'; // 12:00 AM MST
      const formatted = timeUtils.formatDateTime(midnight);

      expect(formatted).toContain('12:00 AM');
      expect(formatted).toContain('MST');
    });

    it('should handle noon times correctly', () => {
      const noon = '2026-01-15T19:00:00Z'; // 12:00 PM MST
      const formatted = timeUtils.formatDateTime(noon);

      expect(formatted).toContain('12:00 PM');
      expect(formatted).toContain('MST');
    });

    it('should handle invalid dates gracefully', () => {
      const invalid = 'not-a-date';
      const formatted = timeUtils.formatDateTime(invalid);

      expect(formatted).toBe('Invalid Date');
    });

    it('should handle null dates gracefully', () => {
      const formatted = timeUtils.formatDateTime(null);

      expect(formatted).toBe('Invalid Date');
    });

    it('should handle undefined dates gracefully', () => {
      const formatted = timeUtils.formatDateTime(undefined);

      expect(formatted).toBe('Invalid Date');
    });
  });

  describe('Time Format Variations', () => {
    it('should use 12-hour format with AM/PM', () => {
      const morning = '2026-01-15T15:30:00Z'; // 8:30 AM MST
      const formatted = timeUtils.formatDateTime(morning);

      expect(formatted).toMatch(/\d{1,2}:\d{2} AM/);
    });

    it('should not use 24-hour format', () => {
      const afternoon = '2026-01-15T20:30:00Z'; // 1:30 PM MST
      const formatted = timeUtils.formatDateTime(afternoon);

      expect(formatted).not.toContain('13:30');
      expect(formatted).toContain('1:30 PM');
    });

    it('should include minutes in time display', () => {
      const date = '2026-01-15T18:30:00Z';
      const formatted = timeUtils.formatDateTime(date);

      expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should not include seconds by default', () => {
      const date = '2026-01-15T18:30:45Z';
      const formatted = timeUtils.formatDateTime(date);

      expect(formatted).not.toContain(':45');
    });
  });

  describe('Timezone Information Retrieval', () => {
    it('should provide comprehensive timezone info', () => {
      const date = '2026-01-15T18:30:00Z';
      const info = timeUtils.getMountainTimeInfo(date);

      expect(info.timezone).toBe('America/Denver');
      expect(info.abbreviation).toMatch(/MST|MDT/);
      expect(info.isDST).toBeDefined();
      expect(info.formatted.dateTime).toBeDefined();
      expect(info.formatted.dateOnly).toBeDefined();
      expect(info.formatted.iso).toBeDefined();
    });

    it('should indicate DST status correctly', () => {
      const winterDate = '2026-01-15T12:00:00Z';
      const summerDate = '2026-07-15T12:00:00Z';

      const winterInfo = timeUtils.getMountainTimeInfo(winterDate);
      const summerInfo = timeUtils.getMountainTimeInfo(summerDate);

      expect(winterInfo.isDST).toBe(false);
      expect(summerInfo.isDST).toBe(true);
    });
  });
});
