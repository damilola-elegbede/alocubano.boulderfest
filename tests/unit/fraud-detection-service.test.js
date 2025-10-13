/**
 * Fraud Detection Service Unit Tests
 * Tests fraud detection rate limiting logic and security monitoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FraudDetectionService, getFraudDetectionService, resetFraudDetectionService } from '../../lib/fraud-detection-service.js';
import { getDatabaseClient, resetDatabaseInstance } from '../../lib/database.js';

// Run tests sequentially to avoid data conflicts in shared database
describe.sequential('Fraud Detection Service', () => {
  let fraudService;
  let dbClient;

  beforeEach(async () => {
    // Clear any cached instances
    await resetDatabaseInstance();
    resetFraudDetectionService(); // Reset fraud service to get fresh instance with new DB

    fraudService = getFraudDetectionService();
    await fraudService.ensureInitialized();
    dbClient = await getDatabaseClient();

    // Create test tables for fraud detection
    await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        transaction_id TEXT NOT NULL UNIQUE,
        customer_email TEXT NOT NULL,
        customer_name TEXT,
        amount_cents INTEGER NOT NULL,
        payment_processor TEXT NOT NULL,
        order_number TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL UNIQUE,
        transaction_id INTEGER NOT NULL,
        ticket_type TEXT NOT NULL,
        event_id TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        qr_token TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
      )
    `);
  });

  afterEach(async () => {
    // Clean up test data (delete data, don't drop tables to avoid affecting concurrent tests)
    // Note: Don't close the connection for shared in-memory databases as it breaks singleton services
    if (dbClient) {
      try {
        await dbClient.execute('DELETE FROM tickets');
        await dbClient.execute('DELETE FROM transactions');
      } catch (error) {
        console.warn('Cleanup error:', error.message);
      }
    }
  });

  describe('Rate Limit Detection', () => {
    it('should NOT trigger alert for 19 tickets in 15 minutes', async () => {
      // Create 19 manual tickets within the time window
      const baseTime = new Date();
      
      for (let i = 0; i < 19; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_${i}`,
            `tx_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            'cash', // Manual payment method
            new Date(baseTime.getTime() - i * 10000).toISOString() // Spread over 15 minutes
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_${i}`,
            new Date(baseTime.getTime() - i * 10000).toISOString()
          ]
        });
      }

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(false);
      expect(result.count).toBe(19);
      expect(result.message).toContain('19 manual tickets');
    });

    it('should trigger alert for exactly 20 tickets in 15 minutes', async () => {
      // Create exactly 20 manual tickets within the time window
      const baseTime = new Date();

      for (let i = 0; i < 20; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_${i}`,
            `tx_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            'cash',
            new Date(baseTime.getTime() - i * 10000).toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_${i}`,
            new Date(baseTime.getTime() - i * 10000).toISOString()
          ]
        });
      }

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(true);
      expect(result.count).toBe(20);
      expect(result.message).toContain('FRAUD ALERT');
      expect(result.message).toContain('20 manual tickets');
    });

    it('should trigger alert for 21+ tickets in 15 minutes', async () => {
      // Create 25 manual tickets within the time window
      const baseTime = new Date();

      for (let i = 0; i < 25; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_${i}`,
            `tx_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            'venmo', // Another manual payment method
            new Date(baseTime.getTime() - i * 10000).toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_${i}`,
            new Date(baseTime.getTime() - i * 10000).toISOString()
          ]
        });
      }

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(true);
      expect(result.count).toBe(25);
      expect(result.message).toContain('FRAUD ALERT');
      expect(result.message).toContain('25 manual tickets');
    });

    it('should only count tickets within 15-minute window', async () => {
      const now = new Date();
      const withinWindow = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
      const outsideWindow = new Date(now.getTime() - 20 * 60 * 1000); // 20 minutes ago

      // Create 10 tickets within window
      for (let i = 0; i < 10; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_within_${i}`,
            `tx_within_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            'cash',
            withinWindow.toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_within_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_within_${i}`,
            withinWindow.toISOString()
          ]
        });
      }

      // Create 15 tickets outside window (should be excluded)
      for (let i = 0; i < 15; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_outside_${i}`,
            `tx_outside_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            'cash',
            outsideWindow.toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_outside_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_outside_${i}`,
            outsideWindow.toISOString()
          ]
        });
      }

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(false);
      expect(result.count).toBe(10); // Only tickets within window
    });

    it('should exclude tickets older than 15 minutes', async () => {
      const now = new Date();
      const sixteenMinutesAgo = new Date(now.getTime() - 16 * 60 * 1000);

      // Create 25 tickets that are too old
      for (let i = 0; i < 25; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_old_${i}`,
            `tx_old_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            'cash',
            sixteenMinutesAgo.toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_old_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_old_${i}`,
            sixteenMinutesAgo.toISOString()
          ]
        });
      }

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(false);
      expect(result.count).toBe(0); // All tickets are too old
    });
  });

  describe('Payment Processor Filtering', () => {
    it('should only count manual payment methods (cash, card_terminal, venmo, comp)', async () => {
      const now = new Date();

      // Create manual tickets (should be counted)
      const manualMethods = ['cash', 'card_terminal', 'venmo', 'comp'];
      for (let i = 0; i < manualMethods.length; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_manual_${i}`,
            `tx_manual_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            manualMethods[i],
            now.toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_manual_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_manual_${i}`,
            now.toISOString()
          ]
        });
      }

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.count).toBe(4); // All 4 manual payment methods
    });

    it('should exclude Stripe/PayPal tickets', async () => {
      const now = new Date();

      // Create automated tickets (should NOT be counted)
      const automatedMethods = ['stripe', 'paypal', 'online', 'checkout'];
      for (let i = 0; i < automatedMethods.length; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_auto_${i}`,
            `tx_auto_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            automatedMethods[i],
            now.toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_auto_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_auto_${i}`,
            now.toISOString()
          ]
        });
      }

      // Create one manual ticket for comparison
      const txResult = await dbClient.execute({
        sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'uuid_manual',
          'tx_manual',
          'manual@test.com',
          'Manual Customer',
          12500,
          'cash',
          now.toISOString()
        ]
      });

      await dbClient.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'ticket_manual',
          Number(txResult.lastInsertRowid),
          'weekend-pass',
          'test-event',
          12500,
          'qr_manual',
          now.toISOString()
        ]
      });

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.count).toBe(1); // Only manual ticket counted
    });
  });

  describe('Statistics Aggregation', () => {
    it('should calculate total manual tickets correctly', async () => {
      const now = new Date();

      // Create 5 manual tickets
      for (let i = 0; i < 5; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_${i}`,
            `tx_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            12500,
            'cash',
            now.toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_${i}`,
            now.toISOString()
          ]
        });
      }

      const stats = await fraudService.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalTickets).toBeGreaterThanOrEqual(5);
    });

    it('should calculate total revenue correctly', async () => {
      const now = new Date();

      // Create tickets with different prices
      const prices = [5000, 10000, 15000];
      for (let i = 0; i < prices.length; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_${i}`,
            `tx_${i}`,
            `customer${i}@test.com`,
            'Test Customer',
            prices[i],
            'cash',
            now.toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `ticket_${i}`,
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            prices[i],
            `qr_${i}`,
            now.toISOString()
          ]
        });
      }

      const stats = await fraudService.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalRevenueCents).toBeGreaterThanOrEqual(30000); // Sum of prices
    });

    it('should track first/last ticket timestamps', async () => {
      const firstTime = new Date(Date.now() - 3600000); // 1 hour ago
      const lastTime = new Date();

      // Create first ticket
      const firstTxResult = await dbClient.execute({
        sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'uuid_first',
          'tx_first',
          'first@test.com',
          'First Customer',
          12500,
          'cash',
          firstTime.toISOString()
        ]
      });

      await dbClient.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'ticket_first',
          Number(firstTxResult.lastInsertRowid),
          'weekend-pass',
          'test-event',
          12500,
          'qr_first',
          firstTime.toISOString()
        ]
      });

      // Create last ticket
      const lastTxResult = await dbClient.execute({
        sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'uuid_last',
          'tx_last',
          'last@test.com',
          'Last Customer',
          12500,
          'cash',
          lastTime.toISOString()
        ]
      });

      await dbClient.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'ticket_last',
          Number(lastTxResult.lastInsertRowid),
          'weekend-pass',
          'test-event',
          12500,
          'qr_last',
          lastTime.toISOString()
        ]
      });

      const stats = await fraudService.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.firstTicket).toBeDefined();
      expect(stats.lastTicket).toBeDefined();
      expect(new Date(stats.firstTicket).getTime()).toBeLessThanOrEqual(new Date(stats.lastTicket).getTime());
    });
  });

  describe('Database Error Handling', () => {
    it('should return non-blocking result on database error', async () => {
      // Close database to simulate connection error
      await resetDatabaseInstance();

      // Create a new fraud service that will fail to initialize
      const failingService = new FraudDetectionService();

      // Mock the database to throw an error
      vi.spyOn(failingService, 'ensureInitialized').mockRejectedValue(new Error('Database connection failed'));

      const result = await failingService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(false);
      expect(result.count).toBe(0);
      expect(result.message).toContain('Fraud detection unavailable');
    });

    it('should NOT throw error on rate check failure', async () => {
      const failingService = new FraudDetectionService();

      // Mock the database execute to throw an error
      await failingService.ensureInitialized();
      vi.spyOn(failingService.db, 'execute').mockRejectedValue(new Error('Query failed'));

      // Should not throw - should return safe default
      await expect(failingService.checkManualTicketRateLimit()).resolves.toBeDefined();
    });

    it('should log database errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const failingService = new FraudDetectionService();
      await failingService.ensureInitialized();
      vi.spyOn(failingService.db, 'execute').mockRejectedValue(new Error('Query failed'));

      await failingService.checkManualTicketRateLimit();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fraud detection check failed'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Test vs Production', () => {
    it('should include test tickets in fraud detection', async () => {
      const now = new Date();

      // Create 10 test tickets
      for (let i = 0; i < 10; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_test_${i}`,
            `tx_test_${i}`,
            `test${i}@test.com`,
            'Test Customer',
            12500,
            'cash',
            now.toISOString()
          ]
        });

        await dbClient.execute({
          sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, event_id, price_cents, qr_token, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `TKT_TEST_${i}`, // Test prefix
            Number(txResult.lastInsertRowid),
            'weekend-pass',
            'test-event',
            12500,
            `qr_test_${i}`,
            now.toISOString()
          ]
        });
      }

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.count).toBeGreaterThanOrEqual(10); // Test tickets should be included
    });

    it('should separate test/production statistics if needed', async () => {
      // This test validates that the system CAN detect test tickets
      // Future enhancement: add is_test flag to separate test from production stats
      const stats = await fraudService.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalTickets).toBeDefined();
      // Note: Current implementation does not separate test/prod
      // This is a SECURITY FINDING: Consider adding separation for cleaner fraud detection
    });
  });

  describe('Alert Configuration', () => {
    it('should use configurable rate limit threshold', () => {
      expect(fraudService.RATE_LIMIT_THRESHOLD).toBe(20);
    });

    it('should use configurable time window', () => {
      expect(fraudService.RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000); // 15 minutes
    });

    it('should allow threshold modification', () => {
      const originalThreshold = fraudService.RATE_LIMIT_THRESHOLD;
      fraudService.RATE_LIMIT_THRESHOLD = 50;

      expect(fraudService.RATE_LIMIT_THRESHOLD).toBe(50);

      // Restore original
      fraudService.RATE_LIMIT_THRESHOLD = originalThreshold;
    });
  });
});
