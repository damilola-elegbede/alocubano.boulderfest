/**
 * Database Operations Integration Tests
 * Tests database interactions with real Turso connection
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { databaseHelper } from '../core/database.js';

describe('Database Operations Integration', () => {
  beforeEach(async () => {
    await databaseHelper.initialize();
    await databaseHelper.cleanBetweenTests();
  });

  afterEach(async () => {
    await databaseHelper.cleanBetweenTests();
  });

  describe('Connection Management', () => {
    it('should establish database connection', async () => {
      const stats = await databaseHelper.getStats();
      
      expect(stats).toMatchObject({
        tickets: expect.any(Number),
        subscribers: expect.any(Number),
        transactions: expect.any(Number),
        connectionUrl: expect.any(String),
        initialized: true
      });
    });

    it('should handle connection verification', async () => {
      await expect(databaseHelper.verifyConnection()).resolves.not.toThrow();
    });

    it('should support transaction testing', async () => {
      const result = await databaseHelper.testTransaction();
      
      expect(result).toMatchObject({
        success: true,
        insertId: expect.any(BigInt)
      });
    });
  });

  describe('Ticket Operations', () => {
    it('should create test ticket', async () => {
      const ticketData = {
        buyer_name: 'Integration Test User',
        buyer_email: 'integration@test.com',
        event_name: 'Test Event 2026',
        ticket_type: 'Weekend Pass'
      };

      const ticket = await databaseHelper.createTestTicket(ticketData);
      
      expect(ticket).toMatchObject({
        id: expect.any(BigInt),
        buyer_name: 'Integration Test User',
        buyer_email: 'integration@test.com',
        status: 'confirmed',
        qr_token: expect.any(String)
      });
    });

    it('should retrieve ticket by ID', async () => {
      const createdTicket = await databaseHelper.createTestTicket({
        buyer_email: 'retrieve@test.com'
      });

      const retrievedTicket = await databaseHelper.getTicket(createdTicket.id);
      
      expect(retrievedTicket).toMatchObject({
        id: Number(createdTicket.id),
        buyer_email: 'retrieve@test.com',
        status: 'confirmed'
      });
    });

    it('should retrieve ticket by QR token', async () => {
      const qrToken = `qr_integration_${Date.now()}`;
      const createdTicket = await databaseHelper.createTestTicket({
        qr_token: qrToken,
        buyer_email: 'qr@test.com'
      });

      const retrievedTicket = await databaseHelper.getTicketByQrToken(qrToken);
      
      expect(retrievedTicket).toMatchObject({
        id: Number(createdTicket.id),
        qr_token: qrToken,
        buyer_email: 'qr@test.com'
      });
    });

    it('should update ticket scan count', async () => {
      const ticket = await databaseHelper.createTestTicket({
        buyer_email: 'scan@test.com'
      });

      await databaseHelper.updateTicketScanCount(ticket.id, 3);
      
      const updatedTicket = await databaseHelper.getTicket(ticket.id);
      expect(updatedTicket.scanned_count).toBe(3);
    });

    it('should handle ticket not found', async () => {
      const nonExistentTicket = await databaseHelper.getTicket(999999);
      expect(nonExistentTicket).toBeNull();
    });
  });

  describe('Email Subscriber Operations', () => {
    it('should create test subscriber', async () => {
      const subscriberData = {
        email: 'subscriber@test.com',
        source: 'integration-test'
      };

      const subscriber = await databaseHelper.createTestSubscriber(subscriberData);
      
      expect(subscriber).toMatchObject({
        id: expect.any(Number),
        email: 'subscriber@test.com',
        source: 'integration-test',
        status: 'active'
      });
    });

    it('should retrieve subscriber by email', async () => {
      const email = 'retrieve-subscriber@test.com';
      await databaseHelper.createTestSubscriber({ email });

      const retrievedSubscriber = await databaseHelper.getSubscriber(email);
      
      expect(retrievedSubscriber).toMatchObject({
        email,
        status: 'active'
      });
    });

    it('should handle duplicate email subscribers', async () => {
      const email = 'duplicate@test.com';
      
      // Create first subscriber
      await databaseHelper.createTestSubscriber({ email });
      
      // Attempt to create duplicate should fail
      await expect(
        databaseHelper.createTestSubscriber({ email })
      ).rejects.toThrow();
    });

    it('should handle subscriber not found', async () => {
      const nonExistentSubscriber = await databaseHelper.getSubscriber('nonexistent@test.com');
      expect(nonExistentSubscriber).toBeNull();
    });
  });

  describe('Raw Query Operations', () => {
    it('should execute raw SELECT queries', async () => {
      // Create test data
      await databaseHelper.createTestTicket({
        buyer_email: 'rawquery@test.com'
      });

      const result = await databaseHelper.query(
        'SELECT * FROM tickets WHERE buyer_email = ?',
        ['rawquery@test.com']
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        buyer_email: 'rawquery@test.com'
      });
    });

    it('should execute raw INSERT queries', async () => {
      const email = `rawinsert-${Date.now()}@test.com`;
      
      const result = await databaseHelper.query(
        'INSERT INTO email_subscribers (email, source) VALUES (?, ?)',
        [email, 'raw-query-test']
      );
      
      expect(result.lastInsertRowid).toBeDefined();
      expect(result.lastInsertRowid).toBeGreaterThan(0);
    });

    it('should execute raw UPDATE queries', async () => {
      const subscriber = await databaseHelper.createTestSubscriber({
        email: 'rawupdate@test.com'
      });

      const result = await databaseHelper.query(
        'UPDATE email_subscribers SET status = ? WHERE id = ?',
        ['inactive', subscriber.id]
      );
      
      expect(result.rowsAffected).toBe(1);
    });

    it('should execute raw DELETE queries', async () => {
      const subscriber = await databaseHelper.createTestSubscriber({
        email: 'rawdelete@test.com'
      });

      const result = await databaseHelper.query(
        'DELETE FROM email_subscribers WHERE id = ?',
        [subscriber.id]
      );
      
      expect(result.rowsAffected).toBe(1);
    });
  });

  describe('Data Cleanup', () => {
    it('should clean test data between tests', async () => {
      // Create test data
      await databaseHelper.createTestTicket({
        buyer_email: 'cleanup@test.com'
      });
      await databaseHelper.createTestSubscriber({
        email: 'cleanup@test.com'
      });

      // Verify data exists
      const ticketBefore = await databaseHelper.query(
        'SELECT * FROM tickets WHERE buyer_email = ?',
        ['cleanup@test.com']
      );
      const subscriberBefore = await databaseHelper.query(
        'SELECT * FROM email_subscribers WHERE email = ?',
        ['cleanup@test.com']
      );
      
      expect(ticketBefore.rows).toHaveLength(1);
      expect(subscriberBefore.rows).toHaveLength(1);

      // Clean test data
      await databaseHelper.cleanBetweenTests();

      // Verify data is cleaned
      const ticketAfter = await databaseHelper.query(
        'SELECT * FROM tickets WHERE buyer_email = ?',
        ['cleanup@test.com']
      );
      const subscriberAfter = await databaseHelper.query(
        'SELECT * FROM email_subscribers WHERE email = ?',
        ['cleanup@test.com']
      );
      
      expect(ticketAfter.rows).toHaveLength(0);
      expect(subscriberAfter.rows).toHaveLength(0);
    });
  });
});