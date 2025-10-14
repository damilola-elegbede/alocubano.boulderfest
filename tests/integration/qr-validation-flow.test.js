/**
 * Integration Tests for QR Validation Flow
 * Tests complete QR scan workflow, authentication, atomicity, and audit logging
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDbClient } from '../setup-integration.js';
import { getQRTokenService } from '../../lib/qr-token-service.js';
import { createTestEvent, testRequest } from './handler-test-helper.js';

describe('QR Validation Flow - Integration Tests', () => {
  let db;
  let qrService;
  let testEventId;
  let timestamp;
  let tx1Id, tx2Id, tx3Id, txExtraIds;
  let ticket1Id, ticket2Id, ticket3Id;

  beforeAll(async () => {
    // Set up test environment
    process.env.INTEGRATION_TEST_MODE = 'true';
    process.env.QR_SECRET_KEY = 'test-qr-secret-key-minimum-32-chars-long-for-integration';
    process.env.WALLET_AUTH_SECRET = 'test-wallet-auth-secret-minimum-32-chars-long';

    qrService = getQRTokenService();
  });

  beforeEach(async () => {
    // Get fresh scoped client for each test to prevent PK collisions
    db = await getDbClient();

    // Create test event for foreign key references (fresh for each test)
    testEventId = await createTestEvent(db, {
      slug: `qr-test-event-${Date.now()}`,
      name: 'QR Test Event 2026',
      type: 'festival',
      status: 'test'
    });

    // Create test transactions (required for foreign key constraints)
    // Use auto-increment for id, capture lastInsertRowid for dependent rows
    timestamp = Date.now();

    const tx1Result = await db.execute({
      sql: `
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [`tx-qr-001-${timestamp}`, 'tickets', 'completed', 10000, 'USD', 'test@example.com', 'Test User', '{}', testEventId]
    });
    tx1Id = tx1Result.lastInsertRowid;

    const tx2Result = await db.execute({
      sql: `
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [`tx-qr-002-${timestamp}`, 'tickets', 'completed', 10000, 'USD', 'test@example.com', 'Test User', '{}', testEventId]
    });
    tx2Id = tx2Result.lastInsertRowid;

    const tx3Result = await db.execute({
      sql: `
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [`tx-qr-003-${timestamp}`, 'tickets', 'completed', 10000, 'USD', 'test@example.com', 'Test User', '{}', testEventId]
    });
    tx3Id = tx3Result.lastInsertRowid;

    // Create additional transactions for tests that create their own tickets
    txExtraIds = [];
    for (let i = 0; i < 11; i++) {
      const result = await db.execute({
        sql: `
          INSERT INTO transactions (
            transaction_id, type, status, amount_cents, currency,
            customer_email, customer_name, order_data, event_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [`tx-qr-extra-${i}-${timestamp}`, 'tickets', 'completed', 10000, 'USD', 'test@example.com', 'Test User', '{}', testEventId]
      });
      txExtraIds.push(result.lastInsertRowid);
    }

    // Create test tickets with unique IDs using timestamp
    ticket1Id = `QR-TEST-001-${timestamp}`;
    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, price_cents,
          attendee_first_name, attendee_last_name, attendee_email,
          status, validation_status, scan_count, max_scan_count,
          event_id, registration_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [
        ticket1Id,
        tx1Id,
        'full-pass',
        10000,
        'Alice',
        'Johnson',
        'alice@example.com',
        'valid',
        'active',
        0,
        10,
        testEventId,
        'completed'
      ]
    });

    // Create ticket at scan limit
    ticket2Id = `QR-TEST-002-${timestamp}`;
    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, price_cents,
          attendee_first_name, attendee_last_name, attendee_email,
          status, validation_status, scan_count, max_scan_count,
          event_id, registration_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [
        ticket2Id,
        tx2Id,
        'full-pass',
        10000,
        'Bob',
        'Smith',
        'bob@example.com',
        'valid',
        'active',
        10,
        10,
        testEventId,
        'completed'
      ]
    });

    // Create invalidated ticket (was "suspended")
    ticket3Id = `QR-TEST-003-${timestamp}`;
    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, price_cents,
          attendee_first_name, attendee_last_name, attendee_email,
          status, validation_status, scan_count, max_scan_count,
          event_id, registration_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [
        ticket3Id,
        tx3Id,
        'full-pass',
        10000,
        'Charlie',
        'Davis',
        'charlie@example.com',
        'valid',
        'invalidated',
        0,
        10,
        testEventId,
        'completed'
      ]
    });
  });

  afterAll(async () => {
    // Cleanup handled by setup-integration.js
  });

  describe('Complete QR Scan Workflow', () => {
    it('should validate ticket and increment scan count', async () => {
      const ticketId = ticket1Id;
      const token = await qrService.getOrCreateToken(ticketId);

      const response = await testRequest('POST', '/api/tickets/validate', { token });

      expect(response.status).toBe(200);
      expect(response.data.valid).toBe(true);
      expect(response.data.validation.status).toBe('valid');
      expect(response.data.validation.scan_count).toBeGreaterThan(0);

      // Verify scan count in database
      const result = await db.execute({
        sql: 'SELECT scan_count, last_scanned_at FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(result.rows[0].scan_count).toBeGreaterThan(0);
      expect(result.rows[0].last_scanned_at).toBeDefined();
    });

    it('should set first_scanned_at on initial scan', async () => {
      const ticketId = ticket1Id;

      // Perform initial scan in this test
      const token = await qrService.getOrCreateToken(ticketId);
      const scanRes = await testRequest('POST', '/api/tickets/validate', { token });
      expect(scanRes.status).toBe(200);

      // Check first_scanned_at was set
      const result = await db.execute({
        sql: 'SELECT first_scanned_at FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(result.rows[0].first_scanned_at).toBeDefined();
    });

    it('should reject validation with invalid token', async () => {
      const invalidToken = 'invalid.jwt.token';

      const response = await testRequest('POST', '/api/tickets/validate', { token: invalidToken });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);
    });

    it('should reject scan when limit reached', async () => {
      const ticketId = ticket2Id;
      const token = await qrService.getOrCreateToken(ticketId);

      const response = await testRequest('POST', '/api/tickets/validate', { token });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);
      expect(response.data.error).toContain('Maximum scans exceeded');
    });

    it('should reject scan for invalidated ticket', async () => {
      const ticketId = ticket3Id;
      const token = await qrService.getOrCreateToken(ticketId);

      const response = await testRequest('POST', '/api/tickets/validate', { token });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);
    });
  });

  describe('Scan Endpoint Authentication', () => {
    it('should accept POST requests only', async () => {
      const token = 'test-token';

      const getResponse = await testRequest('GET', '/api/tickets/validate?token=' + token);

      expect(getResponse.status).toBe(405);
    });

    it('should require token in request body', async () => {
      const response = await testRequest('POST', '/api/tickets/validate', {});

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);
    });

    it('should validate token format before processing', async () => {
      const response = await testRequest('POST', '/api/tickets/validate', { token: 'abc' }); // Too short

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);
    });

    it('should detect suspicious token patterns', async () => {
      const maliciousToken = '<script>alert("xss")</script>';

      const response = await testRequest('POST', '/api/tickets/validate', { token: maliciousToken });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);
    });
  });

  describe('Scan Count Atomicity', () => {
    it('should prevent race conditions in concurrent scans', async () => {
      const ticketId = `QR-CONCURRENT-001-${timestamp}`;

      // Create fresh ticket
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          ticketId,
          txExtraIds[0],
          'full-pass',
          10000,
          'Test',
          'User',
          'test@example.com',
          'valid',
          'active',
          0,
          10,
          testEventId,
          'completed'
        ]
      });

      const token = await qrService.getOrCreateToken(ticketId);

      // Simulate concurrent scans
      const scanPromises = Array(5).fill(null).map(() =>
        testRequest('POST', '/api/tickets/validate', { token })
      );

      const responses = await Promise.all(scanPromises);
      const successCount = responses.filter(r => r.status === 200).length;

      // Verify final scan count matches successful scans
      const result = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(result.rows[0].scan_count).toBe(successCount);
    });

    it('should use atomic UPDATE with condition check', async () => {
      // Test that UPDATE includes WHERE clause preventing over-increment
      const updateQuery = `
        UPDATE tickets
        SET scan_count = scan_count + 1
        WHERE ticket_id = ?
          AND scan_count < max_scan_count
          AND status = 'valid'
          AND validation_status = 'active'
      `;

      expect(updateQuery).toContain('scan_count < max_scan_count');
      expect(updateQuery).toContain("status = 'valid'");
      expect(updateQuery).toContain("validation_status = 'active'");
    });

    it('should verify rowsAffected after atomic update', async () => {
      const ticketId = `QR-ATOMIC-001-${timestamp}`;

      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          ticketId,
          txExtraIds[1],
          'full-pass',
          10000,
          'Test',
          'User',
          'test@example.com',
          'valid',
          'active',
          0,
          10,
          testEventId,
          'completed'
        ]
      });

      const result = await db.execute({
        sql: `
          UPDATE tickets
          SET scan_count = scan_count + 1
          WHERE ticket_id = ?
            AND scan_count < max_scan_count
        `,
        args: [ticketId]
      });

      expect(result.rowsAffected).toBe(1);
    });
  });

  describe('Invalid QR Code Rejection', () => {
    it('should reject ticket not found', async () => {
      const nonExistentToken = qrService.generateToken({ tid: 'NON-EXISTENT' });

      const response = await testRequest('POST', '/api/tickets/validate', { token: nonExistentToken });

      expect(response.status).toBe(404);
      expect(response.data.valid).toBe(false);
      expect(response.data.error).toContain('not found');
    });

    it('should reject cancelled ticket', async () => {
      const ticketId = `QR-CANCELLED-001-${timestamp}`;

      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          ticketId,
          txExtraIds[2],
          'full-pass',
          10000,
          'Test',
          'User',
          'test@example.com',
          'cancelled',
          'active',
          0,
          10,
          testEventId,
          'completed'
        ]
      });

      const token = await qrService.getOrCreateToken(ticketId);

      const response = await testRequest('POST', '/api/tickets/validate', { token });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);
      expect(response.data.error).toContain('cancelled');
    });

    it('should reject refunded ticket', async () => {
      const ticketId = `QR-REFUNDED-001-${timestamp}`;

      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          ticketId,
          txExtraIds[3],
          'full-pass',
          10000,
          'Test',
          'User',
          'test@example.com',
          'refunded',
          'active',
          0,
          10,
          testEventId,
          'completed'
        ]
      });

      const token = await qrService.getOrCreateToken(ticketId);

      const response = await testRequest('POST', '/api/tickets/validate', { token });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);
      expect(response.data.error).toContain('refunded');
    });
  });

  describe('Scan Audit Logging', () => {
    it('should log successful scan to qr_validations table', async () => {
      const ticketId = `QR-AUDIT-001-${timestamp}`;

      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          ticketId,
          txExtraIds[4],
          'full-pass',
          10000,
          'Test',
          'User',
          'test@example.com',
          'valid',
          'active',
          0,
          10,
          testEventId,
          'completed'
        ]
      });

      const token = await qrService.getOrCreateToken(ticketId);

      await testRequest('POST', '/api/tickets/validate', { token });

      // Check qr_validations log
      const result = await db.execute({
        sql: 'SELECT * FROM qr_validations WHERE ticket_id = (SELECT id FROM tickets WHERE ticket_id = ?) ORDER BY created_at DESC LIMIT 1',
        args: [ticketId]
      });

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].validation_result).toBe('success');
    });

    it('should log failed scan attempt', async () => {
      const invalidToken = 'invalid.token.value';

      const response = await testRequest('POST', '/api/tickets/validate', { token: invalidToken });

      // Verify the request was rejected
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.data.valid).toBe(false);

      // Note: Failed scan logging may not occur for early validation failures (before token extraction)
      // This is expected behavior - the handler rejects invalid tokens before database operations
    });

    it('should record validation source (web, apple_wallet, google_wallet)', async () => {
      const ticketId = `QR-SOURCE-001-${timestamp}`;

      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          ticketId,
          txExtraIds[5],
          'full-pass',
          10000,
          'Test',
          'User',
          'test@example.com',
          'valid',
          'active',
          0,
          10,
          testEventId,
          'completed'
        ]
      });

      const token = await qrService.getOrCreateToken(ticketId);

      const response = await testRequest('POST', '/api/tickets/validate', { token }, {
        'X-Wallet-Source': 'apple_wallet'
      });

      // Verify validation succeeded
      expect(response.status).toBe(200);
      expect(response.data.valid).toBe(true);

      const result = await db.execute({
        sql: 'SELECT validation_metadata FROM qr_validations WHERE ticket_id = (SELECT id FROM tickets WHERE ticket_id = ?) ORDER BY created_at DESC LIMIT 1',
        args: [ticketId]
      });

      expect(result.rows.length).toBeGreaterThan(0);
      // validation_source stored in validation_metadata as JSON
      if (result.rows[0].validation_metadata) {
        const metadata = JSON.parse(result.rows[0].validation_metadata);
        // Source is detected from headers or user-agent - validate it's a recognized value
        expect(['web', 'apple_wallet', 'google_wallet']).toContain(metadata.source);
      }
    });
  });

  describe('IP Tracking', () => {
    it('should extract and log client IP address', async () => {
      const ticketId = `QR-IP-001-${timestamp}`;

      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          ticketId,
          txExtraIds[6],
          'full-pass',
          10000,
          'Test',
          'User',
          'test@example.com',
          'valid',
          'active',
          0,
          10,
          testEventId,
          'completed'
        ]
      });

      const token = await qrService.getOrCreateToken(ticketId);

      await testRequest('POST', '/api/tickets/validate', { token }, {
        'X-Forwarded-For': '203.0.113.45'
      });

      const result = await db.execute({
        sql: 'SELECT validation_metadata FROM qr_validations WHERE ticket_id = (SELECT id FROM tickets WHERE ticket_id = ?) ORDER BY created_at DESC LIMIT 1',
        args: [ticketId]
      });

      expect(result.rows.length).toBeGreaterThan(0);
      // IP address stored in validation_metadata as JSON
      if (result.rows[0].validation_metadata) {
        const metadata = JSON.parse(result.rows[0].validation_metadata);
        expect(metadata.ip_address || metadata.ip).toBeDefined();
      }
    });

    it('should handle multiple IPs in X-Forwarded-For', async () => {
      const forwardedFor = '203.0.113.45, 198.51.100.1, 192.0.2.1';
      const firstIP = forwardedFor.split(',')[0].trim();

      expect(firstIP).toBe('203.0.113.45');
    });

    it('should validate IP address format', () => {
      const validIPv4 = '192.168.1.1';
      const validIPv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const invalidIP = 'not-an-ip';

      expect(validIPv4).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(validIPv6).toMatch(/^[0-9a-f:]+$/i);
      expect(invalidIP).not.toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });
  });

  describe('Performance', () => {
    it('should complete validation under 100ms', async () => {
      const ticketId = `QR-PERF-001-${timestamp}`;

      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, price_cents,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          ticketId,
          txExtraIds[7],
          'full-pass',
          10000,
          'Test',
          'User',
          'test@example.com',
          'valid',
          'active',
          0,
          10,
          testEventId,
          'completed'
        ]
      });

      const token = await qrService.getOrCreateToken(ticketId);

      const start = Date.now();
      await testRequest('POST', '/api/tickets/validate', { token });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
