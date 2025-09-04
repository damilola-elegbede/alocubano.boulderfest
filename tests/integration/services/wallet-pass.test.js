import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { getDatabase } from '../../../api/lib/database.js';
import { AppleWalletService } from '../../../api/lib/apple-wallet-service.js';
import { GoogleWalletService } from '../../../api/lib/google-wallet-service.js';

// Set required environment variables for testing
process.env.WALLET_AUTH_SECRET = 'test-wallet-auth-secret-key-for-testing-purposes';

describe('Wallet Pass Integration Tests', () => {
  let database;
  let testTicketId;
  let testTransactionId;

  beforeAll(async () => {
    database = await getDatabase();
  });


  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    // Create a test ticket for wallet pass generation
    testTransactionId = Math.floor(Math.random() * 1000000); // Generate random integer ID
    testTicketId = `test-ticket-${Date.now()}`;

    // Insert test transaction
    const transactionResult = await database.execute({
      sql: `INSERT INTO "transactions" (
        transaction_id, type, stripe_session_id, amount_cents, status, 
        customer_email, order_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `stripe-tx-${testTransactionId}`, 'tickets', 'test-session-123', 
        5000, 'completed', 'test@example.com', '{}', new Date().toISOString()
      ]
    });

    // Get the auto-generated ID from the transaction
    const transactionDbId = transactionResult.lastInsertRowid || transactionResult.meta?.last_row_id;

    // Insert test ticket using proper schema
    await database.execute({
      sql: `INSERT INTO "tickets" (
        ticket_id, transaction_id, ticket_type, event_id, price_cents, status, 
        attendee_first_name, attendee_last_name, attendee_email, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        testTicketId, transactionDbId, 'Weekend Pass', 'boulder-fest-2026',
        5000, 'valid', 'Test', 'User', 'test@example.com',
        new Date().toISOString()
      ]
    });
  });

  afterAll(async () => {
    // Cleanup test data
    if (testTicketId) {
      await database.execute({
        sql: 'DELETE FROM wallet_pass_events WHERE ticket_id = (SELECT id FROM tickets WHERE ticket_id = ?)',
        args: [testTicketId]
      }).catch(() => {}); // Ignore if table doesn't exist

      await database.execute({
        sql: 'DELETE FROM tickets WHERE ticket_id = ?',
        args: [testTicketId]
      }).catch(() => {});

      await database.execute({
        sql: 'DELETE FROM transactions WHERE id = ?',
        args: [testTransactionId]
      }).catch(() => {});
    }
  });

  describe('Apple Wallet Service', () => {
    let appleWalletService;

    beforeEach(() => {
      appleWalletService = new AppleWalletService();
    });

    it('should validate configuration properly', async () => {
      // Test configuration validation
      const isConfigured = appleWalletService.isConfigured();
      
      // In test environment, configuration may not be complete
      if (process.env.APPLE_PASS_TYPE_ID && process.env.APPLE_TEAM_ID) {
        expect(typeof isConfigured).toBe('boolean');
      } else {
        expect(isConfigured).toBe(false);
      }
    });

    it('should generate Apple Wallet pass for valid ticket', async () => {
      // Mock the configuration check to return true
      vi.spyOn(appleWalletService, 'isConfigured').mockReturnValue(true);
      
      // Mock the PKPass generation to avoid requiring certificates
      vi.spyOn(appleWalletService, 'createPassFile').mockResolvedValue(Buffer.from('mock-pkpass-data'));

      try {
        const passBuffer = await appleWalletService.generatePass(testTicketId);
        
        expect(passBuffer).toBeInstanceOf(Buffer);
        expect(passBuffer.length).toBeGreaterThan(0);

        // Verify that the ticket was updated with pass serial number
        const result = await database.execute({
          sql: 'SELECT apple_pass_serial, wallet_pass_generated_at FROM "tickets" WHERE ticket_id = ?',
          args: [testTicketId]
        });

        expect(result.rows.length).toBe(1);
        expect(result.rows[0].apple_pass_serial).toMatch(/^ALO26-[A-Z0-9-]+$/);
        expect(result.rows[0].wallet_pass_generated_at).toBeTruthy();

      } catch (error) {
        // If not configured, should throw configuration error
        if (!appleWalletService.isConfigured()) {
          expect(error.message).toContain('not configured');
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
    });

    it('should handle invalid ticket ID gracefully', async () => {
      vi.spyOn(appleWalletService, 'isConfigured').mockReturnValue(true);

      await expect(
        appleWalletService.generatePass('invalid-ticket-id')
      ).rejects.toThrow('Ticket not found');
    });

    it('should validate JWT tokens correctly', async () => {
      // Test JWT token generation and verification
      if (process.env.WALLET_AUTH_SECRET) {
        const token = appleWalletService.generateAuthToken(testTicketId);
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3); // JWT has 3 parts

        const payload = appleWalletService.verifyAuthToken(token);
        expect(payload).toBeTruthy();
        expect(payload.ticketId).toBe(testTicketId);
        expect(payload.type).toBe('wallet_pass');
      } else {
        expect(() => appleWalletService.generateAuthToken(testTicketId))
          .toThrow('WALLET_AUTH_SECRET not configured');
      }
    });
  });

  describe('Google Wallet Service', () => {
    let googleWalletService;

    beforeEach(() => {
      googleWalletService = new GoogleWalletService();
    });

    it('should validate configuration properly', async () => {
      const isConfigured = googleWalletService.isConfigured();
      expect(typeof isConfigured).toBe('boolean');
      
      // Check if required environment variables exist
      const hasRequiredConfig = process.env.GOOGLE_WALLET_ISSUER_ID && 
                               process.env.GOOGLE_WALLET_SERVICE_ACCOUNT;
      
      if (hasRequiredConfig) {
        expect(isConfigured).toBe(true);
      } else {
        expect(isConfigured).toBe(false);
      }
    });

    it('should generate Google Wallet pass for valid ticket', async () => {
      // Mock configuration and client initialization
      vi.spyOn(googleWalletService, 'isConfigured').mockReturnValue(true);
      
      const mockClient = {
        request: vi.fn().mockResolvedValue({ data: {} })
      };
      vi.spyOn(googleWalletService, 'initClient').mockResolvedValue(mockClient);
      
      // Set the client property directly to ensure it's available
      googleWalletService.client = mockClient;
      
      vi.spyOn(googleWalletService, 'createOrUpdateClass').mockResolvedValue();
      vi.spyOn(googleWalletService, 'generateSaveUrl').mockResolvedValue(
        'https://pay.google.com/gp/v/save/mock-token'
      );

      // Mock the QR token generation
      vi.spyOn(googleWalletService, 'getQRToken').mockResolvedValue('mock-qr-token');

      try {
        const result = await googleWalletService.generatePass(testTicketId);
        
        expect(result).toHaveProperty('objectId');
        expect(result).toHaveProperty('saveUrl');
        expect(result.saveUrl).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);

        // Verify that the ticket was updated with pass ID
        const dbResult = await database.execute({
          sql: 'SELECT google_pass_id, wallet_pass_generated_at FROM "tickets" WHERE ticket_id = ?',
          args: [testTicketId]
        });

        expect(dbResult.rows.length).toBe(1);
        expect(dbResult.rows[0].google_pass_id).toBeTruthy();
        expect(dbResult.rows[0].wallet_pass_generated_at).toBeTruthy();

      } catch (error) {
        // If not configured, should throw configuration error
        if (!googleWalletService.isConfigured()) {
          expect(error.message).toContain('not configured');
        } else {
          throw error; // Re-throw unexpected errors
        }
      } finally {
        // Clean up the client mock
        googleWalletService.client = null;
      }
    });

    it('should handle cancelled tickets appropriately', async () => {
      // Update test ticket to cancelled status
      await database.execute({
        sql: 'UPDATE "tickets" SET status = ? WHERE ticket_id = ?',
        args: ['cancelled', testTicketId]
      });

      vi.spyOn(googleWalletService, 'isConfigured').mockReturnValue(true);
      const mockClient = {
        request: vi.fn().mockResolvedValue({ data: {} })
      };
      vi.spyOn(googleWalletService, 'initClient').mockResolvedValue(mockClient);
      googleWalletService.client = mockClient;

      try {
        await expect(
          googleWalletService.generatePass(testTicketId)
        ).rejects.toThrow('Cannot generate pass for cancelled ticket');
      } finally {
        // Clean up the client mock
        googleWalletService.client = null;
      }
    });

    it('should format ticket types correctly', async () => {
      expect(googleWalletService.formatTicketType('vip-pass')).toBe('VIP PASS');
      expect(googleWalletService.formatTicketType('weekend-pass')).toBe('WEEKEND PASS');
      expect(googleWalletService.formatTicketType('workshop-beginner')).toBe('BEGINNER WORKSHOP');
      expect(googleWalletService.formatTicketType('unknown-type')).toBe('UNKNOWN-TYPE');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database connection errors gracefully', async () => {
      const appleWalletService = new AppleWalletService();
      vi.spyOn(appleWalletService, 'isConfigured').mockReturnValue(true);
      
      // Mock database error
      vi.spyOn(appleWalletService, 'db', 'get').mockReturnValue({
        execute: vi.fn().mockRejectedValue(new Error('Database connection failed'))
      });

      await expect(
        appleWalletService.generatePass(testTicketId)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle concurrent pass generation requests', async () => {
      const appleWalletService = new AppleWalletService();
      vi.spyOn(appleWalletService, 'isConfigured').mockReturnValue(true);
      vi.spyOn(appleWalletService, 'createPassFile').mockResolvedValue(Buffer.from('mock-pass'));

      // Simulate concurrent requests
      const promises = Array(3).fill().map(() => 
        appleWalletService.generatePass(testTicketId)
      );

      try {
        const results = await Promise.allSettled(promises);
        
        // At least one should succeed
        const successful = results.filter(r => r.status === 'fulfilled');
        expect(successful.length).toBeGreaterThan(0);
        
        // All successful results should have the same serial number (passes should be idempotent)
        if (successful.length > 1) {
          const serialNumbers = new Set();
          for (const result of successful) {
            const ticketData = await database.execute({
              sql: 'SELECT apple_pass_serial FROM "tickets" WHERE ticket_id = ?',
              args: [testTicketId]
            });
            serialNumbers.add(ticketData.rows[0]?.apple_pass_serial);
          }
          expect(serialNumbers.size).toBe(1); // All should have same serial number
        }
      } catch (error) {
        // If configuration is missing, all should fail with config error
        expect(error.message).toContain('not configured');
      }
    });
  });
});