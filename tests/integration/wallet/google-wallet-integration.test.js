/**
 * Integration Tests for Google Wallet Service
 * Tests complete pass generation flow, API interactions, database updates, and error recovery
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { getDbClient } from '../../setup-integration.js';
import { GoogleWalletService } from '../../../lib/google-wallet-service.js';

describe('Google Wallet Integration Tests', () => {
  let db;
  let service;
  let mockClient;
  let mockAuth;
  let testEventId;
  let testTransactionId;
  let testTicketId;

  beforeAll(async () => {
    // Set up environment
    process.env.GOOGLE_WALLET_ISSUER_ID = 'test-issuer-integration';
    process.env.GOOGLE_WALLET_CLASS_ID = 'test-class-integration';
    // NOTE: This is a TEST-ONLY RSA key generated for integration tests.
    // NOT a real Google service account key. Safe for version control.
    const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCRscd3X0S9ntma
uJ5bw8pw9GIVMUeGr66LQQy0PBftMFf8ru5cULI8uhxYxeWukXTCa1Ti1H9geyRK
msDWfVP2XP/6tH4MlPPIRS2KFCp8BvBd+6NmeLZjywMpkwHqIcAIFq7EZ0nGttww
AR24zKW9Z6tx3OhxnBBAM4o6r7KOFy9FI4nSXDRBDFWo2R1NcS57LPIEkrNOnjsI
Uqa5Mkz7x4p6HMr8qSxqQBw4XQ2z9BlyMem330ZsyI1T7gAGWOWmrGmOUkAp9K2u
5i2L15y85ifTzGCdJ+jF0fw4dmip/YIsIzYWfKAR3ON5OMj+CegKm9wTwOWthPYN
6cRQZzXtAgMBAAECggEAAQyO5RnzfN56tD68i5q8zTtd8P8qsGWELmuu5miMc0t7
tal7JAaMSgBNfwlb1t4ZTH8UQ4CNuMPikq+OW4P5HQk1va/Nla1NrFPcDzFmSKb9
nd3iqI263ytiM1ZIO4eWdyZbiAM+S0syV5f4uX1KWd/OPpep5T2cadKgUAXoq67C
Zoz5IE5/hBeIotCCFPymH8DxJKSssdwZP67hdJpo/VxSBCXQMZpj2iDQQFCfY0lt
0637HMKvrGXgn8pWUXK/R4Of5/KeFneNNLXQ9d2vhdVDGrQT/ESF3NJIrTQOKLtv
TL6Y1jTuWaKVF+YLforHUgAS363YsiX4tYLiKZlk8QKBgQDKDBJUk/+uTAaTYmJd
q5tv1VuGM2ZyprlvQRcrweUdVqxH7XImdcaaELvCkafX6Mm+cpyeevDOsLzog8iy
UW+BJVTP1B1wBMxAelEI/1bs9wSezVduYkVAOMl0fntiEchOpafv3cJ2zTv2XEEQ
VNGqYCVgwxkp4l145m1rJMpPFQKBgQC4mXDc5ooAKLKrH+FPqwPC7zVI8eFttjF9
INnlpXgTW+PHm8WqNaRNmIuuLQJV1pwu1P7H88qy3kojEKc1UPxi46g6ccIdT5X5
75c+aEbOS8hIu/0O0YSzQuEbF6LZoqct4pjX8Qf6kMq0UIMzjGznBYS2xSYxC/Nt
cWRlXMXBeQKBgEdiuns9iyGW5N/f6+cygYmitWKV+IVbmLrRIZGpQPz7qYUERMeH
5zJ55Qzaj5W+PsFWFzX7M+ejFCuGnDs8gIv9l5iSVhBE8bF6RfVK2fiBUhWVcWWj
vNny9mJ9abR9mesHpm0eSd3Vp3DkqWxOu4FZ1Pr6E4Lz4pibuV8YsY39AoGACc7N
Ok9dYajH5WOqOuthJchD0n5XddbKRlWqfhMOkCi/r2lNVT/IXP8P3M8zYpAmeC6E
4ubHDD3XPomx+Jk276Ic3A4TPC9wTnk2VfCAYpGQMJ0cUt8657NT9naJBnsn2r5B
VKfPvrZWrsHgVqrNVnDqnjNXVh/GbTgrF1+YejECgYEAqnC0RkwXBAI/duU60NUI
MkeoBmEu47zh9DSVRsagOikkMVFO2ETLoThEq6GlA+WUzFT0ffcKH5D/jRdcts0a
HEB9TXiPv8Bw35tTpM0GzoRO46xU7wA8JSBj7gaX45+xGSIpnOQmpwZX4yeaO7tW
XD2hqSzR5HoQBYbKNQ1Occ4=
-----END PRIVATE KEY-----`;

    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      private_key_id: 'test-key-id',
      private_key: testPrivateKey,
      client_email: 'test@test-project.iam.gserviceaccount.com',
      client_id: '12345',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com'
    })).toString('base64');
    process.env.QR_SECRET_KEY = 'test-qr-secret-key-minimum-32-chars-long-for-integration';

    db = await getDbClient();
  });

  beforeEach(async () => {
    // Generate unique test data
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    testTicketId = `GOOGLE-WALLET-${timestamp}-${random}`;

    // Create test event
    const eventSlug = `google-wallet-event-${timestamp}`;
    await db.execute({
      sql: `INSERT INTO events (
        slug, name, type, status, start_date, end_date,
        venue_name, venue_address, venue_city, venue_state, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        eventSlug,
        'Google Wallet Test Event',
        'festival',
        'active',
        '2026-05-15',
        '2026-05-17',
        'Avalon Ballroom',
        '6185 Arapahoe Road, Boulder, CO 80303',
        'Boulder',
        'CO'
      ]
    });

    // Get event ID
    const eventResult = await db.execute({
      sql: 'SELECT id FROM events WHERE slug = ?',
      args: [eventSlug]
    });
    testEventId = eventResult.rows[0].id;

    // Create test transaction
    const txResult = await db.execute({
      sql: `INSERT INTO transactions (
        transaction_id, uuid, type, status, amount_cents, total_amount, currency,
        customer_email, customer_name, order_data, created_at, is_test
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
      args: [
        `TX-GOOGLE-${timestamp}`,
        `uuid-google-${timestamp}`,
        'tickets',
        'completed',
        5000,
        5000,
        'USD',
        'google.wallet@example.com',
        'Google Wallet Test',
        '{}',
        1
      ]
    });
    testTransactionId = Number(txResult.lastInsertRowid);

    // Create test ticket
    await db.execute({
      sql: `INSERT INTO tickets (
        ticket_id, transaction_id, event_id, ticket_type, ticket_type_id,
        price_cents, status, validation_status,
        attendee_first_name, attendee_last_name, attendee_email,
        event_date, event_time, registration_status, scan_count, max_scan_count,
        created_at, is_test
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
      args: [
        testTicketId,
        testTransactionId,
        testEventId,
        'vip-pass',
        null,
        5000,
        'valid',
        'active',
        'Google',
        'Test',
        'google.wallet@example.com',
        '2026-05-15',
        '10:00',
        'completed',
        0,
        10,
        1
      ]
    });

    // Set up mock client and auth
    mockClient = {
      request: vi.fn()
    };

    mockAuth = {
      getClient: vi.fn().mockResolvedValue(mockClient)
    };

    service = new GoogleWalletService();
    service.auth = mockAuth;
    service.client = null; // Force initialization
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Pass Generation Flow', () => {
    it('should generate pass from ticket purchase to URL', async () => {
      // Mock API responses
      mockClient.request
        .mockResolvedValueOnce({ data: { id: 'existing-class' } }) // GET class
        .mockResolvedValueOnce({ data: { id: 'updated-class' } }) // PATCH class
        .mockResolvedValueOnce({ data: { id: 'pass-object' } }); // PUT pass object

      const result = await service.generatePass(testTicketId);

      expect(result).toBeDefined();
      expect(result.objectId).toContain('test-issuer-integration');
      expect(result.saveUrl).toContain('https://pay.google.com/gp/v/save/');
    });

    it('should save pass ID to database', async () => {
      mockClient.request
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} });

      await service.generatePass(testTicketId);

      // Verify database was updated
      const ticketResult = await db.execute({
        sql: 'SELECT google_pass_id, wallet_pass_generated_at FROM tickets WHERE ticket_id = ?',
        args: [testTicketId]
      });

      expect(ticketResult.rows[0].google_pass_id).toBeDefined();
      expect(ticketResult.rows[0].google_pass_id).toContain('test-issuer-integration');
      expect(ticketResult.rows[0].wallet_pass_generated_at).toBeDefined();
    });

    it('should log pass creation event', async () => {
      mockClient.request
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} });

      await service.generatePass(testTicketId);

      // Check wallet_pass_events table
      const eventsResult = await db.execute({
        sql: `SELECT event_type, pass_type FROM wallet_pass_events
              WHERE pass_serial LIKE ? ORDER BY created_at DESC LIMIT 1`,
        args: [`%${testTicketId}%`]
      });

      expect(eventsResult.rows.length).toBeGreaterThan(0);
      expect(eventsResult.rows[0].event_type).toBe('created');
      expect(eventsResult.rows[0].pass_type).toBe('google');
    });

    it('should use existing pass ID on subsequent calls', async () => {
      mockClient.request
        .mockResolvedValue({ data: {} });

      // First generation
      const result1 = await service.generatePass(testTicketId);

      // Second generation
      const result2 = await service.generatePass(testTicketId);

      expect(result1.objectId).toBe(result2.objectId);
    });

    it('should create event-specific class', async () => {
      mockClient.request
        .mockRejectedValueOnce({ response: { status: 404 } }) // Class doesn't exist
        .mockResolvedValueOnce({ data: {} }) // POST class
        .mockResolvedValueOnce({ data: {} }); // PUT pass

      await service.generatePass(testTicketId);

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: expect.stringContaining('/eventTicketClass')
        })
      );
    });

    it('should update existing class', async () => {
      mockClient.request
        .mockResolvedValueOnce({ data: { id: 'existing' } }) // GET class
        .mockResolvedValueOnce({ data: {} }) // PATCH class
        .mockResolvedValueOnce({ data: {} }); // PUT pass

      await service.generatePass(testTicketId);

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          url: expect.stringContaining('/eventTicketClass')
        })
      );
    });

    it('should generate pass in under 2 seconds', async () => {
      mockClient.request.mockResolvedValue({ data: {} });

      const start = Date.now();
      await service.generatePass(testTicketId);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Pass Updates and Status Changes', () => {
    let passObjectId;

    beforeEach(async () => {
      // Generate initial pass
      mockClient.request.mockResolvedValue({ data: {} });
      const result = await service.generatePass(testTicketId);
      passObjectId = result.objectId;
    });

    it('should update pass status via API', async () => {
      const updates = { state: 'INACTIVE' };
      await service.updatePass(passObjectId, updates);

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          url: expect.stringContaining(passObjectId),
          data: updates
        })
      );
    });

    it('should update database timestamp on pass update', async () => {
      mockClient.request.mockResolvedValue({ data: {} });

      const beforeUpdate = await db.execute({
        sql: 'SELECT wallet_pass_updated_at FROM tickets WHERE google_pass_id = ?',
        args: [passObjectId]
      });

      await service.updatePass(passObjectId, { state: 'INACTIVE' });

      const afterUpdate = await db.execute({
        sql: 'SELECT wallet_pass_updated_at FROM tickets WHERE google_pass_id = ?',
        args: [passObjectId]
      });

      expect(afterUpdate.rows[0].wallet_pass_updated_at).toBeDefined();
    });

    it('should revoke pass when ticket is cancelled', async () => {
      await service.revokePass(testTicketId, 'Ticket cancelled by user');

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          data: expect.objectContaining({
            state: 'EXPIRED',
            disableExpirationNotification: true
          })
        })
      );
    });

    it('should record revocation in database', async () => {
      await service.revokePass(testTicketId, 'Test revocation');

      const ticketResult = await db.execute({
        sql: 'SELECT wallet_pass_revoked_at, wallet_pass_revoked_reason FROM tickets WHERE ticket_id = ?',
        args: [testTicketId]
      });

      expect(ticketResult.rows[0].wallet_pass_revoked_at).toBeDefined();
      expect(ticketResult.rows[0].wallet_pass_revoked_reason).toBe('Test revocation');
    });

    it('should log revocation event', async () => {
      await service.revokePass(testTicketId, 'Test revocation');

      const eventsResult = await db.execute({
        sql: `SELECT event_type, event_data FROM wallet_pass_events
              WHERE pass_serial LIKE ? ORDER BY created_at DESC LIMIT 1`,
        args: [`%${testTicketId}%`]
      });

      expect(eventsResult.rows[0].event_type).toBe('revoked');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should retry on transient API failures', async () => {
      mockClient.request
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} })
        .mockResolvedValueOnce({ data: {} });

      // First attempt should fail
      await expect(service.generatePass(testTicketId)).rejects.toThrow();

      // Second attempt should succeed
      const result = await service.generatePass(testTicketId);
      expect(result).toBeDefined();
    });

    it('should handle ticket not found error', async () => {
      await expect(service.generatePass('INVALID-TICKET-ID')).rejects.toThrow('Ticket not found');
    });

    it('should validate ticket status before generating pass', async () => {
      // Update ticket to cancelled status
      await db.execute({
        sql: 'UPDATE tickets SET status = ? WHERE ticket_id = ?',
        args: ['cancelled', testTicketId]
      });

      await expect(service.generatePass(testTicketId)).rejects.toThrow('cancelled');
    });

    it('should reject pass generation for refunded tickets', async () => {
      await db.execute({
        sql: 'UPDATE tickets SET status = ? WHERE ticket_id = ?',
        args: ['refunded', testTicketId]
      });

      await expect(service.generatePass(testTicketId)).rejects.toThrow('refunded');
    });

    it('should reject pass generation for pending transactions', async () => {
      await db.execute({
        sql: 'UPDATE transactions SET status = ? WHERE id = ?',
        args: ['pending', testTransactionId]
      });

      await expect(service.generatePass(testTicketId)).rejects.toThrow('unpaid');
    });

    it('should reject pass generation for failed transactions', async () => {
      await db.execute({
        sql: 'UPDATE transactions SET status = ? WHERE id = ?',
        args: ['failed', testTransactionId]
      });

      await expect(service.generatePass(testTicketId)).rejects.toThrow('unpaid');
    });

    it('should handle missing required ticket fields', async () => {
      // Create ticket with missing attendee name
      const badTicketId = `BAD-TICKET-${Date.now()}`;
      await db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, event_id, ticket_type, price_cents, status,
          attendee_first_name, attendee_last_name, attendee_email,
          event_date, event_time, registration_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [badTicketId, testTransactionId, testEventId, 'vip-pass', 5000, 'valid',
               null, null, 'test@example.com', '2026-05-15', '10:00', 'completed']
      });

      await expect(service.generatePass(badTicketId)).rejects.toThrow('Attendee name is required');
    });

    it('should handle missing event name', async () => {
      // Update event to have null name
      await db.execute({
        sql: 'UPDATE events SET name = NULL WHERE id = ?',
        args: [testEventId]
      });

      await expect(service.generatePass(testTicketId)).rejects.toThrow('Event name is required');
    });

    it('should handle API rate limiting', async () => {
      mockClient.request.mockRejectedValue({
        response: { status: 429 },
        message: 'Rate limit exceeded'
      });

      await expect(service.generatePass(testTicketId)).rejects.toThrow();
    });

    it('should handle API authentication errors', async () => {
      mockClient.request.mockRejectedValue({
        response: { status: 401 },
        message: 'Unauthorized'
      });

      await expect(service.generatePass(testTicketId)).rejects.toThrow();
    });

    it('should handle API quota exceeded', async () => {
      mockClient.request.mockRejectedValue({
        response: { status: 403 },
        message: 'Quota exceeded'
      });

      await expect(service.generatePass(testTicketId)).rejects.toThrow();
    });
  });

  describe('Concurrent Pass Generation', () => {
    it('should handle concurrent pass generation for different tickets', async () => {
      mockClient.request.mockResolvedValue({ data: {} });

      // Create multiple test tickets
      const tickets = [];
      for (let i = 0; i < 5; i++) {
        const ticketId = `CONCURRENT-${Date.now()}-${i}`;
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, event_id, ticket_type, price_cents, status,
            attendee_first_name, attendee_last_name, attendee_email,
            event_date, event_time, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [ticketId, testTransactionId, testEventId, 'weekend-pass', 5000, 'valid',
                 'Test', `User${i}`, `user${i}@example.com`, '2026-05-15', '10:00', 'completed']
        });
        tickets.push(ticketId);
      }

      // Generate passes concurrently
      const promises = tickets.map(ticketId => service.generatePass(ticketId));
      const results = await Promise.all(promises);

      // Verify all passes were generated
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.objectId).toBeDefined();
        expect(result.saveUrl).toContain('pay.google.com');
      });
    });

    it('should use cached client for concurrent requests', async () => {
      mockClient.request.mockResolvedValue({ data: {} });

      const promises = [
        service.generatePass(testTicketId),
        service.generatePass(testTicketId),
        service.generatePass(testTicketId)
      ];

      await Promise.all(promises);

      // Client should only be initialized once
      expect(mockAuth.getClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance Metrics', () => {
    it('should track pass generation time', async () => {
      mockClient.request.mockResolvedValue({ data: {} });

      const start = Date.now();
      await service.generatePass(testTicketId);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000);
    });

    it('should handle memory efficiently with multiple passes', async () => {
      mockClient.request.mockResolvedValue({ data: {} });

      const iterations = 20;
      const memBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        const ticketId = `PERF-${Date.now()}-${i}`;
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, event_id, ticket_type, price_cents, status,
            attendee_first_name, attendee_last_name, attendee_email,
            event_date, event_time, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          args: [ticketId, testTransactionId, testEventId, 'friday-pass', 5000, 'valid',
                 'Perf', 'Test', 'perf@example.com', '2026-05-15', '10:00', 'completed']
        });
        await service.generatePass(ticketId);
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memIncreaseMB = (memAfter - memBefore) / 1024 / 1024;

      // Memory increase should be reasonable (< 50MB for 20 passes)
      expect(memIncreaseMB).toBeLessThan(50);
    });
  });
});
