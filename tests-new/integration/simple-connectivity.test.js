/**
 * Simple Connectivity Integration Test
 * Basic test to verify the test infrastructure works
 */
import { describe, it, expect } from 'vitest';
import { databaseHelper } from '../core/database.js';
import { authHelper } from '../core/auth.js';
import { TestDataFactory } from '../helpers/test-data.js';

describe('Simple Connectivity Integration', () => {
  describe('Database Connection', () => {
    it('should connect to database and create test data', async () => {
      await databaseHelper.initialize();
      
      const stats = await databaseHelper.getStats();
      expect(stats).toMatchObject({
        tickets: expect.any(Number),
        subscribers: expect.any(Number),
        transactions: expect.any(Number),
        initialized: true
      });
    });

    it('should create and retrieve test ticket', async () => {
      await databaseHelper.initialize();
      
      const ticketData = TestDataFactory.createTicketData({
        buyer_email: 'connectivity@test.com'
      });
      
      const ticket = await databaseHelper.createTestTicket(ticketData);
      expect(ticket.id).toBeDefined();
      expect(ticket.buyer_email).toBe('connectivity@test.com');
      
      const retrieved = await databaseHelper.getTicket(ticket.id);
      expect(retrieved.buyer_email).toBe('connectivity@test.com');
      
      // Cleanup
      await databaseHelper.cleanBetweenTests();
    });
  });

  describe('Authentication', () => {
    it('should generate and validate JWT tokens', async () => {
      const token = authHelper.generateTestAdminToken();
      expect(token).toBeDefined();
      
      const verification = await authHelper.verifyToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.decoded.admin).toBe(true);
    });

    it('should validate environment configuration', () => {
      const validation = authHelper.validateAdminConfig();
      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });
  });

  describe('Test Data Factory', () => {
    it('should generate consistent test data', () => {
      const ticket = TestDataFactory.createTicketData();
      expect(ticket).toMatchObject({
        event_name: 'Test Event 2026',
        ticket_type: 'Weekend Pass',
        buyer_name: 'Test User',
        currency: 'usd',
        status: 'confirmed'
      });
    });

    it('should allow data overrides', () => {
      const customTicket = TestDataFactory.createTicketData({
        buyer_name: 'Custom User',
        ticket_type: 'VIP Pass'
      });
      
      expect(customTicket.buyer_name).toBe('Custom User');
      expect(customTicket.ticket_type).toBe('VIP Pass');
      expect(customTicket.event_name).toBe('Test Event 2026'); // Default preserved
    });
  });

  describe('Environment Setup', () => {
    it('should have test environment configured', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.TEST_TYPE).toBe('integration');
      expect(process.env.ADMIN_SECRET).toBeDefined();
      expect(process.env.ADMIN_SECRET.length).toBeGreaterThanOrEqual(32);
    });

    it('should have database URL configured', () => {
      expect(process.env.TURSO_DATABASE_URL).toBeDefined();
      expect(typeof process.env.TURSO_DATABASE_URL).toBe('string');
    });
  });
});