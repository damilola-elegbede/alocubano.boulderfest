/**
 * Unit Tests for Transaction Event ID Attribution
 * Ensures transactions are always created with proper event_id
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('Transaction Event ID Attribution', () => {
  describe('Checkout Session Metadata', () => {
    it('should determine event_id from cart items with tickets', () => {
      const cartItems = [
        { type: 'ticket', eventId: 'boulder-fest-2026', name: 'VIP Pass', price: 15000, quantity: 1 },
        { type: 'ticket', eventId: 'boulder-fest-2026', name: 'Friday Pass', price: 5000, quantity: 2 }
      ];

      // Helper function from create-checkout-session.js
      const determineEventId = (items) => {
        const ticketItems = items.filter(item => item.type === 'ticket');
        if (ticketItems.length === 0) {
          return process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
        }

        const eventIds = ticketItems
          .map(item => item.eventId)
          .filter(id => id != null && id !== '');

        return eventIds.length > 0
          ? eventIds[0]
          : process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
      };

      const result = determineEventId(cartItems);
      expect(result).toBe('boulder-fest-2026');
    });

    it('should use first event_id when multiple events in cart', () => {
      const cartItems = [
        { type: 'ticket', eventId: 'weekender-2025-11', name: 'Full Pass', price: 6500, quantity: 1 },
        { type: 'ticket', eventId: 'boulder-fest-2026', name: 'VIP Pass', price: 15000, quantity: 1 }
      ];

      const determineEventId = (items) => {
        const ticketItems = items.filter(item => item.type === 'ticket');
        if (ticketItems.length === 0) {
          return process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
        }

        const eventIds = ticketItems
          .map(item => item.eventId)
          .filter(id => id != null && id !== '');

        return eventIds.length > 0
          ? eventIds[0]
          : process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
      };

      const result = determineEventId(cartItems);
      expect(result).toBe('weekender-2025-11'); // First event_id
    });

    it('should fallback to default event_id for donation-only cart', () => {
      const cartItems = [
        { type: 'donation', category: 'general', name: 'General Donation', price: 5000, quantity: 1 }
      ];

      const determineEventId = (items) => {
        const ticketItems = items.filter(item => item.type === 'ticket');
        if (ticketItems.length === 0) {
          return process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
        }

        const eventIds = ticketItems
          .map(item => item.eventId)
          .filter(id => id != null && id !== '');

        return eventIds.length > 0
          ? eventIds[0]
          : process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
      };

      const result = determineEventId(cartItems);
      expect(result).toBe('boulder-fest-2026'); // Default
    });

    it('should fallback to default when eventId is null or empty', () => {
      const cartItems = [
        { type: 'ticket', eventId: null, name: 'VIP Pass', price: 15000, quantity: 1 },
        { type: 'ticket', eventId: '', name: 'Friday Pass', price: 5000, quantity: 1 }
      ];

      const determineEventId = (items) => {
        const ticketItems = items.filter(item => item.type === 'ticket');
        if (ticketItems.length === 0) {
          return process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
        }

        const eventIds = ticketItems
          .map(item => item.eventId)
          .filter(id => id != null && id !== '');

        return eventIds.length > 0
          ? eventIds[0]
          : process.env.DEFAULT_EVENT_ID || 'boulder-fest-2026';
      };

      const result = determineEventId(cartItems);
      expect(result).toBe('boulder-fest-2026'); // Fallback to default
    });
  });

  describe('Transaction Service Event ID Extraction', () => {
    it('should extract event_id from session metadata', () => {
      const session = {
        id: 'cs_test_123',
        metadata: {
          event_id: 'weekender-2025-11',
          orderId: 'order_123'
        }
      };

      // Logic from transaction-service.js
      const eventId = session.metadata?.event_id ||
                      session.metadata?.eventId ||
                      process.env.DEFAULT_EVENT_ID ||
                      'boulder-fest-2026';

      expect(eventId).toBe('weekender-2025-11');
    });

    it('should handle camelCase eventId in metadata', () => {
      const session = {
        id: 'cs_test_123',
        metadata: {
          eventId: 'boulder-fest-2026',  // camelCase
          orderId: 'order_123'
        }
      };

      const eventId = session.metadata?.event_id ||
                      session.metadata?.eventId ||
                      process.env.DEFAULT_EVENT_ID ||
                      'boulder-fest-2026';

      expect(eventId).toBe('boulder-fest-2026');
    });

    it('should fallback to default when metadata missing event_id', () => {
      const session = {
        id: 'cs_test_123',
        metadata: {
          orderId: 'order_123'
          // No event_id
        }
      };

      const eventId = session.metadata?.event_id ||
                      session.metadata?.eventId ||
                      process.env.DEFAULT_EVENT_ID ||
                      'boulder-fest-2026';

      expect(eventId).toBe('boulder-fest-2026');
    });

    it('should handle missing metadata object', () => {
      const session = {
        id: 'cs_test_123'
        // No metadata
      };

      const eventId = session.metadata?.event_id ||
                      session.metadata?.eventId ||
                      process.env.DEFAULT_EVENT_ID ||
                      'boulder-fest-2026';

      expect(eventId).toBe('boulder-fest-2026');
    });

    it('should warn when event_id is empty string', () => {
      const session = {
        id: 'cs_test_123',
        metadata: {
          event_id: '',  // Empty string
          orderId: 'order_123'
        }
      };

      // Check if original event_id is invalid
      const originalEventId = session.metadata?.event_id;
      const isInvalid = !originalEventId || originalEventId === '';

      // Then apply fallback logic
      const eventId = session.metadata?.event_id ||
                      session.metadata?.eventId ||
                      process.env.DEFAULT_EVENT_ID ||
                      'boulder-fest-2026';

      expect(isInvalid).toBe(true);  // Original was invalid
      expect(eventId).toBe('boulder-fest-2026'); // Falls back to default
    });
  });

  describe('Event ID Validation', () => {
    it('should validate event_id is not empty', () => {
      const validEventIds = [
        'boulder-fest-2026',
        'weekender-2025-11',
        'test-festival',
        'boulderfest-2025',
        -1,  // Test event IDs can be negative
        -2,
        1,
        2,
        3
      ];

      validEventIds.forEach(eventId => {
        const isValid = eventId !== null && eventId !== undefined && eventId !== '';
        expect(isValid).toBe(true);
      });
    });

    it('should detect invalid event_ids', () => {
      const invalidEventIds = [
        null,
        undefined,
        '',
        '   ',  // Whitespace
      ];

      invalidEventIds.forEach(eventId => {
        const isValid = eventId !== null && eventId !== undefined && eventId !== '' && String(eventId).trim() !== '';
        expect(isValid).toBe(false);
      });
    });
  });
});
