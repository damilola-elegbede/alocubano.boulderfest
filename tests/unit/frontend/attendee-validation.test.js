/**
 * Tests for attendee-validation.js utility
 *
 * Tests validation logic for inline checkout registration.
 */

import { describe, it, expect } from 'vitest';
import {
  validateAttendee,
  validateAllAttendees,
  cartHasTickets,
  getTotalTicketCount,
  generateTicketKey,
} from '../../../src/utils/attendee-validation.js';

describe('attendee-validation', () => {
  describe('validateAttendee', () => {
    it('should validate a complete attendee with all fields', () => {
      const attendee = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };
      const result = validateAttendee(attendee);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('should fail validation when firstName is missing', () => {
      const attendee = {
        firstName: '',
        lastName: 'Doe',
        email: 'john@example.com',
      };
      const result = validateAttendee(attendee);
      expect(result.valid).toBe(false);
      expect(result.errors.firstName).toBeDefined();
    });

    it('should fail validation when lastName is missing', () => {
      const attendee = {
        firstName: 'John',
        lastName: '',
        email: 'john@example.com',
      };
      const result = validateAttendee(attendee);
      expect(result.valid).toBe(false);
      expect(result.errors.lastName).toBeDefined();
    });

    it('should fail validation when email is missing', () => {
      const attendee = {
        firstName: 'John',
        lastName: 'Doe',
        email: '',
      };
      const result = validateAttendee(attendee);
      expect(result.valid).toBe(false);
      expect(result.errors.email).toBeDefined();
    });

    it('should fail validation when email format is invalid', () => {
      const attendee = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'not-an-email',
      };
      const result = validateAttendee(attendee);
      expect(result.valid).toBe(false);
      expect(result.errors.email).toContain('valid email');
    });

    it('should allow names with hyphens and apostrophes', () => {
      const attendee = {
        firstName: "Mary-Jane",
        lastName: "O'Connor",
        email: 'mary@example.com',
      };
      const result = validateAttendee(attendee);
      expect(result.valid).toBe(true);
    });

    it('should fail validation when name is too short', () => {
      const attendee = {
        firstName: 'J',
        lastName: 'Doe',
        email: 'j@example.com',
      };
      const result = validateAttendee(attendee);
      expect(result.valid).toBe(false);
      expect(result.errors.firstName).toBeDefined();
    });

    it('should handle null/undefined attendee', () => {
      expect(validateAttendee(null).valid).toBe(false);
      expect(validateAttendee(undefined).valid).toBe(false);
    });

    it('should handle empty attendee object', () => {
      const result = validateAttendee({});
      expect(result.valid).toBe(false);
      expect(result.errors.firstName).toBeDefined();
      expect(result.errors.lastName).toBeDefined();
      expect(result.errors.email).toBeDefined();
    });
  });

  describe('validateAllAttendees', () => {
    // The validateAllAttendees function uses generateTicketKey for key generation
    // Key format: ticketType-eventId-index (e.g., 'general-1-0')
    const mockTickets = [
      { type: 'ticket', ticketType: 'general', eventId: 1, quantity: 2 },
      { type: 'ticket', ticketType: 'vip', eventId: 1, quantity: 1 },
    ];

    it('should validate all attendees successfully when all data is complete', () => {
      // Keys are generated as: ticketType-eventId-index
      const attendeeData = {
        'general-1-0': { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        'general-1-1': { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
        'vip-1-0': { firstName: 'Bob', lastName: 'Smith', email: 'bob@example.com' },
      };

      const result = validateAllAttendees(mockTickets, attendeeData);
      expect(result.valid).toBe(true);
      expect(result.missingCount).toBe(0);
      expect(Object.keys(result.allErrors)).toHaveLength(0);
    });

    it('should fail when some attendees are missing', () => {
      const attendeeData = {
        'general-1-0': { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        // Missing general-1-1 and vip-1-0
      };

      const result = validateAllAttendees(mockTickets, attendeeData);
      expect(result.valid).toBe(false);
      expect(result.missingCount).toBe(2);
    });

    it('should fail when some attendee data is incomplete', () => {
      const attendeeData = {
        'general-1-0': { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        'general-1-1': { firstName: '', lastName: 'Doe', email: 'jane@example.com' },
        'vip-1-0': { firstName: 'Bob', lastName: 'Smith', email: 'bob@example.com' },
      };

      const result = validateAllAttendees(mockTickets, attendeeData);
      expect(result.valid).toBe(false);
      expect(result.allErrors['general-1-1']).toBeDefined();
    });

    it('should return valid for empty cart items', () => {
      const result = validateAllAttendees([], {});
      expect(result.valid).toBe(true);
    });

    it('should skip non-ticket items', () => {
      const mixedItems = [
        { type: 'ticket', ticketType: 'general', eventId: 1, quantity: 1 },
        { type: 'donation', amount: 50 },
      ];
      const attendeeData = {
        'general-1-0': { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      };

      const result = validateAllAttendees(mixedItems, attendeeData);
      expect(result.valid).toBe(true);
    });
  });

  describe('cartHasTickets', () => {
    it('should return true when cart contains tickets', () => {
      const items = [
        { type: 'ticket', name: 'General Admission' },
        { type: 'donation', amount: 25 },
      ];
      expect(cartHasTickets(items)).toBe(true);
    });

    it('should return false when cart has no tickets', () => {
      const items = [
        { type: 'donation', amount: 25 },
        { type: 'donation', amount: 50 },
      ];
      expect(cartHasTickets(items)).toBe(false);
    });

    it('should return false for empty cart', () => {
      expect(cartHasTickets([])).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(cartHasTickets(null)).toBe(false);
      expect(cartHasTickets(undefined)).toBe(false);
    });
  });

  describe('getTotalTicketCount', () => {
    it('should count total tickets including quantities', () => {
      const items = [
        { type: 'ticket', quantity: 2 },
        { type: 'ticket', quantity: 3 },
        { type: 'donation', amount: 25 },
      ];
      expect(getTotalTicketCount(items)).toBe(5);
    });

    it('should default quantity to 1 if not specified', () => {
      const items = [
        { type: 'ticket' },
        { type: 'ticket', quantity: 2 },
      ];
      expect(getTotalTicketCount(items)).toBe(3);
    });

    it('should return 0 for empty cart', () => {
      expect(getTotalTicketCount([])).toBe(0);
    });

    it('should return 0 for donations only', () => {
      const items = [{ type: 'donation', amount: 50 }];
      expect(getTotalTicketCount(items)).toBe(0);
    });
  });

  describe('generateTicketKey', () => {
    it('should generate key in correct format', () => {
      const item = { ticketType: 'general', eventId: 1 };
      const key = generateTicketKey(item, 0);
      expect(key).toBe('general-1-0');
    });

    it('should handle different indices', () => {
      const item = { ticketType: 'vip', eventId: 2 };
      expect(generateTicketKey(item, 0)).toBe('vip-2-0');
      expect(generateTicketKey(item, 1)).toBe('vip-2-1');
      expect(generateTicketKey(item, 5)).toBe('vip-2-5');
    });

    it('should use default for missing eventId', () => {
      const item = { ticketType: 'general' };
      const key = generateTicketKey(item, 0);
      expect(key).toBe('general-default-0');
    });

    it('should handle eventId of 0', () => {
      const item = { ticketType: 'general', eventId: 0 };
      const key = generateTicketKey(item, 0);
      expect(key).toBe('general-0-0');
    });
  });
});
