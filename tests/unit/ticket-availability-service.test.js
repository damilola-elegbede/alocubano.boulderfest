/**
 * Unit Tests for Ticket Availability Service
 *
 * Tests the ticket availability validation logic used in checkout flow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateTicketAvailability, getTicketAvailability, isTicketAvailable } from '../../lib/ticket-availability-service.js';
import { getDatabaseClient, resetDatabaseInstance } from '../../lib/database.js';

describe('Ticket Availability Service', () => {
  let client;

  beforeEach(async () => {
    // Reset database instance
    await resetDatabaseInstance();
    client = await getDatabaseClient();

    // Create ticket_types table for testing
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS ticket_types (
          id TEXT PRIMARY KEY,
          event_id INTEGER NOT NULL,
          stripe_price_id TEXT UNIQUE,
          name TEXT NOT NULL,
          description TEXT,
          price_cents INTEGER NOT NULL,
          currency TEXT DEFAULT 'USD',
          status TEXT CHECK(status IN ('available', 'sold-out', 'coming-soon', 'closed', 'test')) DEFAULT 'available',
          max_quantity INTEGER,
          sold_count INTEGER DEFAULT 0,
          display_order INTEGER DEFAULT 0,
          metadata TEXT,
          availability TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      args: []
    });

    // Create ticket_reservations table for testing
    await client.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS ticket_reservations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_type_id TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          status TEXT CHECK(status IN ('active', 'fulfilled', 'released', 'expired')) DEFAULT 'active',
          expires_at DATETIME NOT NULL,
          fulfilled_at DATETIME,
          transaction_id INTEGER,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id)
        )
      `,
      args: []
    });

    // Create test ticket types
    await client.execute({
      sql: `
        INSERT INTO ticket_types (id, event_id, name, description, price_cents, status, max_quantity, sold_count)
        VALUES
        ('test-available', 5, 'Test Available Ticket', 'Available ticket', 5000, 'available', 10, 5),
        ('test-sold-out', 5, 'Test Sold Out Ticket', 'Sold out ticket', 5000, 'sold-out', 10, 10),
        ('test-no-limit', 5, 'Test Unlimited Ticket', 'Unlimited ticket', 5000, 'available', NULL, 100),
        ('test-coming-soon', 5, 'Test Coming Soon', 'Not yet available', 5000, 'coming-soon', 10, 0),
        ('test-closed', 5, 'Test Closed Ticket', 'Sales closed', 5000, 'closed', 10, 5)
      `,
      args: []
    });
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await client.execute({
        sql: 'DELETE FROM ticket_reservations WHERE ticket_type_id LIKE ?',
        args: ['test-%']
      });
      await client.execute({
        sql: 'DELETE FROM ticket_types WHERE id LIKE ?',
        args: ['test-%']
      });
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  });

  describe('validateTicketAvailability', () => {
    it('should validate available tickets with sufficient quantity', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-available',
          name: 'Test Available Ticket',
          quantity: 3
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject tickets with insufficient quantity', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-available',
          name: 'Test Available Ticket',
          quantity: 10 // Only 5 available (10 max - 5 sold)
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].ticketId).toBe('test-available');
      expect(result.errors[0].requested).toBe(10);
      expect(result.errors[0].available).toBe(5);
      expect(result.errors[0].reason).toContain('only 5 tickets remaining');
    });

    it('should reject sold out tickets', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-sold-out',
          name: 'Test Sold Out Ticket',
          quantity: 1
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('Ticket type is sold out');
    });

    it('should accept unlimited tickets with any quantity', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-no-limit',
          name: 'Test Unlimited Ticket',
          quantity: 1000
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject coming-soon tickets', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-coming-soon',
          name: 'Test Coming Soon',
          quantity: 1
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('Ticket not yet available for purchase');
    });

    it('should reject closed tickets', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-closed',
          name: 'Test Closed Ticket',
          quantity: 1
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('Ticket sales have closed');
    });

    it('should reject non-existent ticket types', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'non-existent-ticket',
          name: 'Non-existent Ticket',
          quantity: 1
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toBe('Ticket type not found');
    });

    it('should validate multiple tickets in cart', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-available',
          name: 'Test Available Ticket',
          quantity: 2
        },
        {
          type: 'ticket',
          ticketType: 'test-no-limit',
          name: 'Test Unlimited Ticket',
          quantity: 5
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report all errors for multiple invalid tickets', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-sold-out',
          name: 'Test Sold Out Ticket',
          quantity: 1
        },
        {
          type: 'ticket',
          ticketType: 'test-closed',
          name: 'Test Closed Ticket',
          quantity: 1
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should skip validation for donation-only cart', async () => {
      const cartItems = [
        {
          type: 'donation',
          name: 'General Donation',
          quantity: 1
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate only tickets in mixed cart', async () => {
      const cartItems = [
        {
          type: 'ticket',
          ticketType: 'test-available',
          name: 'Test Available Ticket',
          quantity: 2
        },
        {
          type: 'donation',
          name: 'General Donation',
          quantity: 1
        }
      ];

      const result = await validateTicketAvailability(cartItems);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getTicketAvailability', () => {
    it('should return availability info for existing ticket', async () => {
      const availability = await getTicketAvailability('test-available');

      expect(availability.found).toBe(true);
      expect(availability.id).toBe('test-available');
      expect(availability.name).toBe('Test Available Ticket');
      expect(availability.status).toBe('available');
      expect(availability.maxQuantity).toBe(10);
      expect(availability.soldCount).toBe(5);
      expect(availability.available).toBe(5);
      expect(availability.isUnlimited).toBe(false);
    });

    it('should return unlimited info for tickets without max_quantity', async () => {
      const availability = await getTicketAvailability('test-no-limit');

      expect(availability.found).toBe(true);
      expect(availability.isUnlimited).toBe(true);
      expect(availability.available).toBe(Infinity);
    });

    it('should return not found for non-existent ticket', async () => {
      const availability = await getTicketAvailability('non-existent');

      expect(availability.found).toBe(false);
      expect(availability.status).toBe('not-found');
    });
  });

  describe('isTicketAvailable', () => {
    it('should return true for available tickets with sufficient quantity', async () => {
      const result = await isTicketAvailable('test-available', 3);
      expect(result).toBe(true);
    });

    it('should return false for tickets with insufficient quantity', async () => {
      const result = await isTicketAvailable('test-available', 10);
      expect(result).toBe(false);
    });

    it('should return false for sold out tickets', async () => {
      const result = await isTicketAvailable('test-sold-out', 1);
      expect(result).toBe(false);
    });

    it('should return true for unlimited tickets', async () => {
      const result = await isTicketAvailable('test-no-limit', 1000);
      expect(result).toBe(true);
    });

    it('should return false for non-existent tickets', async () => {
      const result = await isTicketAvailable('non-existent', 1);
      expect(result).toBe(false);
    });
  });
});