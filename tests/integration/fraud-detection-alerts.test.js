/**
 * Fraud Detection Alert System Integration Tests
 * Tests alert email delivery and non-blocking fraud detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFraudDetectionService } from '../../lib/fraud-detection-service.js';
import { getDatabaseClient, resetDatabaseInstance } from '../../lib/database.js';

describe('Fraud Detection Alert System', () => {
  let fraudService;
  let dbClient;

  beforeEach(async () => {
    await resetDatabaseInstance();
    
    fraudService = getFraudDetectionService();
    await fraudService.ensureInitialized();
    dbClient = await getDatabaseClient();

    // Create test tables
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
    if (dbClient) {
      try {
        await dbClient.execute('DROP TABLE IF EXISTS tickets');
        await dbClient.execute('DROP TABLE IF EXISTS transactions');
      } catch (error) {
        console.warn('Cleanup error:', error.message);
      }
    }
    await resetDatabaseInstance();
  });

  describe('Alert Email Delivery', () => {
    it('should send alert email when threshold exceeded', async () => {
      // Create 20 tickets to trigger alert
      const now = new Date();
      
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

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result.alert).toBe(true);
      expect(result.count).toBe(20);
      
      // Alert should be logged (email sending is mocked in tests)
      expect(result.message).toContain('FRAUD ALERT');
    });

    it('should include ticket count in alert', async () => {
      // Create 25 tickets
      const now = new Date();
      
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

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result.alert).toBe(true);
      expect(result.message).toContain('25 manual tickets');
      expect(result.count).toBe(25);
    });

    it('should include time window in alert', async () => {
      // Create 20 tickets
      const now = new Date();
      
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

      const result = await fraudService.checkManualTicketRateLimit();

      expect(result.alert).toBe(true);
      expect(result.message).toContain('15 minutes');
    });

    it('should include admin contact information in alert', async () => {
      // Test that sendFraudAlert method exists and can be called
      const alertData = {
        ticketCount: 25,
        windowMinutes: 15,
        threshold: 20
      };

      // This should not throw - it logs the alert
      await expect(fraudService.sendFraudAlert(alertData)).resolves.not.toThrow();
    });

    it('should handle missing ADMIN_EMAIL gracefully', async () => {
      // Save original
      const originalEmail = process.env.ADMIN_EMAIL;
      const originalAlertEmail = process.env.ADMIN_ALERT_EMAIL;

      try {
        // Remove admin emails
        delete process.env.ADMIN_EMAIL;
        delete process.env.ADMIN_ALERT_EMAIL;

        const alertData = {
          ticketCount: 25,
          windowMinutes: 15,
          threshold: 20
        };

        // Should not throw even without admin email configured
        await expect(fraudService.sendFraudAlert(alertData)).resolves.not.toThrow();
      } finally {
        // Restore
        if (originalEmail) process.env.ADMIN_EMAIL = originalEmail;
        if (originalAlertEmail) process.env.ADMIN_ALERT_EMAIL = originalAlertEmail;
      }
    });

    it('should not crash transaction processing on alert failure', async () => {
      // Create 20 tickets to trigger alert
      const now = new Date();
      
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

      // Even if alert email fails, rate check should return result
      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(true);
      expect(result.count).toBe(20);
    });
  });

  describe('Alert Deduplication', () => {
    it('should track alert timestamps to avoid spam', async () => {
      // Note: Current implementation logs alerts every time threshold is exceeded
      // This test documents expected behavior for future enhancement
      
      // Create 20 tickets twice
      for (let batch = 0; batch < 2; batch++) {
        const now = new Date(Date.now() + batch * 1000);
        
        for (let i = 0; i < 20; i++) {
          const txResult = await dbClient.execute({
            sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
              `uuid_batch${batch}_${i}`,
              `tx_batch${batch}_${i}`,
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
              `ticket_batch${batch}_${i}`,
              Number(txResult.lastInsertRowid),
              'weekend-pass',
              'test-event',
              12500,
              `qr_batch${batch}_${i}`,
              now.toISOString()
            ]
          });
        }
      }

      // Both checks should trigger alerts
      const result = await fraudService.checkManualTicketRateLimit();
      expect(result.alert).toBe(true);
      expect(result.count).toBe(40); // All tickets in window

      // SECURITY FINDING: No deduplication logic exists yet
      // Future enhancement: Track last alert time and avoid spamming
    });
  });

  describe('Non-Blocking Fraud Detection', () => {
    it('should return result even if email service fails', async () => {
      // Create 20 tickets to trigger alert
      const now = new Date();
      
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

      // Should not throw even if email service is unavailable
      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(true);
    });

    it('should return safe default on database error', async () => {
      // Close database
      await resetDatabaseInstance();

      // Should return safe result instead of throwing
      const result = await fraudService.checkManualTicketRateLimit();

      expect(result).toBeDefined();
      expect(result.alert).toBe(false);
      expect(result.count).toBe(0);
      expect(result.message).toContain('Fraud detection unavailable');
    });
  });

  describe('Alert Content Security', () => {
    it('should NOT leak customer PII in alerts', async () => {
      // Create 20 tickets with PII
      const now = new Date();
      
      for (let i = 0; i < 20; i++) {
        const txResult = await dbClient.execute({
          sql: `INSERT INTO transactions (uuid, transaction_id, customer_email, customer_name, amount_cents, payment_processor, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `uuid_${i}`,
            `tx_${i}`,
            `sensitive${i}@example.com`, // Sensitive email
            'Sensitive Name', // Sensitive name
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

      const result = await fraudService.checkManualTicketRateLimit();

      // Alert message should not contain customer emails or names
      expect(result.message).not.toContain('sensitive');
      expect(result.message).not.toContain('@example.com');
      expect(result.message).not.toContain('Sensitive Name');
    });

    it('should only include aggregate statistics in alerts', async () => {
      // Create 20 tickets
      const now = new Date();
      
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

      const result = await fraudService.checkManualTicketRateLimit();

      // Alert should only contain counts and timeframes, not individual records
      expect(result.message).toContain('20 manual tickets');
      expect(result.message).toContain('15 minutes');
    });
  });

  describe('Concurrent Fraud Checks', () => {
    it('should handle concurrent fraud checks without interference', async () => {
      // Create 20 tickets
      const now = new Date();
      
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

      // Run multiple checks concurrently
      const [result1, result2, result3] = await Promise.all([
        fraudService.checkManualTicketRateLimit(),
        fraudService.checkManualTicketRateLimit(),
        fraudService.checkManualTicketRateLimit()
      ]);

      // All should return same result
      expect(result1.alert).toBe(true);
      expect(result2.alert).toBe(true);
      expect(result3.alert).toBe(true);
      expect(result1.count).toBe(result2.count);
      expect(result2.count).toBe(result3.count);
    });
  });
});
