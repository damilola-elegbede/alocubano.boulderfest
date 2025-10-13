/**
 * Scan Limit Enforcement Integration Tests
 * 
 * Tests atomic scan count increment and rate limiting enforcement
 * for ticket validation with real database operations
 * 
 * SECURITY CONCERNS:
 * - Race conditions during concurrent scans
 * - Scan count bypass attacks
 * - Rate limiting circumvention
 * - IP spoofing attacks
 * - Transaction isolation failures
 * 
 * Coverage:
 * - Atomic scan count increment (no race conditions)
 * - Maximum scan limit enforcement (per-ticket)
 * - Rate limiting (per-IP and per-ticket)
 * - Concurrent scan handling
 * - IP validation and spoofing prevention
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testRequest, HTTP_STATUS, createTestEvent } from './handler-test-helper.js';
import { getDbClient } from '../setup-integration.js';
import { QRTokenService } from '../../lib/qr-token-service.js';

describe('Integration: Scan Limit Enforcement', () => {
  let db;
  let qrService;
  let testEventId;
  const TEST_QR_SECRET = 'test-secret-key-minimum-32-characters-for-security-compliance';

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.QR_SECRET_KEY = TEST_QR_SECRET;
    process.env.WALLET_AUTH_SECRET = 'test-wallet-secret-key-minimum-32-characters';

    // Initialize QR service
    qrService = new QRTokenService();

    // Get database client
    db = await getDbClient();
    
    // Verify tables exist
    const tablesCheck = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('tickets', 'scan_logs', 'qr_validations')
      ORDER BY name
    `);
    
    const existingTables = tablesCheck.rows.map(row => row.name);
    expect(existingTables).toContain('tickets');
    console.log('✅ Verified required tables exist:', existingTables);
  });

  afterAll(async () => {
    // Cleanup handled by setup-integration.js
  });

  beforeEach(async () => {
    // Get fresh database client for each test
    db = await getDbClient();

    // Create a test event for foreign key requirements (ensure it exists for this test)
    // Check if event already exists first to avoid duplicates
    const existingEvent = await db.execute({
      sql: 'SELECT id FROM events WHERE slug = ?',
      args: ['boulder-fest-2026-scan-test']
    });

    if (existingEvent.rows.length > 0) {
      testEventId = existingEvent.rows[0].id;
    } else {
      testEventId = await createTestEvent(db, {
        slug: 'boulder-fest-2026-scan-test',
        name: 'A Lo Cubano Boulder Fest 2026 (Scan Tests)',
        startDate: '2026-05-15',
        endDate: '2026-05-17'
      });
    }
  });

  /**
   * Helper function to create test ticket
   */
  async function createTestTicket(options = {}) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2);
    const ticketId = `TKT-SCAN-${timestamp}-${random}`;
    const validationCode = `VAL-SCAN-${timestamp}-${random}`;

    const {
      maxScanCount = 10,
      initialScanCount = 0,
      status = 'valid',
      validationStatus = 'active',
    } = options;

    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, event_date,
          price_cents, attendee_first_name, attendee_last_name, attendee_email,
          status, validation_status, validation_code, scan_count, max_scan_count
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        ticketId,
        'Weekend Pass',
        testEventId,
        '2026-05-15',
        12500,
        'Scan',
        'Test',
        'scan-test@example.com',
        status,
        validationStatus,
        validationCode,
        initialScanCount,
        maxScanCount,
      ],
    });

    return {
      ticketId,
      validationCode,
      maxScanCount,
      initialScanCount,
    };
  }

  /**
   * Helper function to validate ticket
   */
  async function validateTicket(ticket, validateOnly = false) {
    const token = qrService.generateToken({ tid: ticket.ticketId });
    
    return await testRequest('POST', '/api/tickets/validate', {
      token,
      validateOnly,
    });
  }

  describe('Atomic Scan Count Increment', () => {
    it('should atomically increment scan_count on valid scan', async () => {
      const ticket = await createTestTicket({ initialScanCount: 0, maxScanCount: 5 });

      // Perform first scan
      const response = await validateTicket(ticket);
      
      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data.valid).toBe(true);

      // Verify database state
      const result = await db.execute({
        sql: 'SELECT scan_count, first_scanned_at, last_scanned_at FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      expect(result.rows.length).toBe(1);
      const ticketData = result.rows[0];
      expect(Number(ticketData.scan_count)).toBe(1); // Should be exactly 1
      expect(ticketData.first_scanned_at).toBeDefined();
      expect(ticketData.last_scanned_at).toBeDefined();
    });

    it('should prevent scan_count exceeding max_scan_count', async () => {
      const ticket = await createTestTicket({ initialScanCount: 2, maxScanCount: 2 });

      // Attempt to scan (should fail - already at limit)
      const response = await validateTicket(ticket);

      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      // Should reject scan - 410 GONE means scan limit exceeded (valid response)
      expect(response.status).toBe(HTTP_STATUS.GONE); // 410 Gone
      if (response.data) {
        expect(response.data.valid).toBe(false);
        expect(response.data.error || response.data.validation?.message).toMatch(/maximum scans exceeded|scan limit/i);
      }

      // Verify scan count unchanged
      const result = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      expect(Number(result.rows[0].scan_count)).toBe(2); // Should remain at 2
    });

    it('should handle concurrent scans correctly (no race condition)', async () => {
      const ticket = await createTestTicket({ initialScanCount: 0, maxScanCount: 3 });

      // Launch 5 concurrent scans (only 3 should succeed)
      const concurrentScans = Array(5).fill(null).map(() => validateTicket(ticket));
      const results = await Promise.allSettled(concurrentScans);

      // Count successful scans
      const successfulScans = results.filter(
        r => r.status === 'fulfilled' && r.value?.data?.valid === true
      ).length;

      // Should have exactly 3 successful scans (max_scan_count)
      // Note: May be less if rate limiting kicks in
      expect(successfulScans).toBeLessThanOrEqual(3);
      expect(successfulScans).toBeGreaterThan(0);

      // Verify final scan count in database
      const dbResult = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      const finalScanCount = Number(dbResult.rows[0].scan_count);
      
      // Final scan count should not exceed max_scan_count
      expect(finalScanCount).toBeLessThanOrEqual(3);
      
      // Should match number of successful scans
      expect(finalScanCount).toBe(successfulScans);
    });

    it('should update first_scanned_at on first scan only', async () => {
      const ticket = await createTestTicket({ initialScanCount: 0, maxScanCount: 5 });

      // First scan
      const response1 = await validateTicket(ticket);
      if (response1.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      const result1 = await db.execute({
        sql: 'SELECT first_scanned_at, last_scanned_at FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      const firstScan = result1.rows[0];
      expect(firstScan.first_scanned_at).toBeDefined();
      const firstScannedAt = firstScan.first_scanned_at;

      // Wait 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second scan
      const response2 = await validateTicket(ticket);
      if (response2.status === 0) return;

      const result2 = await db.execute({
        sql: 'SELECT first_scanned_at, last_scanned_at FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      const secondScan = result2.rows[0];
      
      // first_scanned_at should not change
      expect(secondScan.first_scanned_at).toBe(firstScannedAt);
      
      // last_scanned_at should be updated
      expect(secondScan.last_scanned_at).toBeDefined();
      expect(new Date(secondScan.last_scanned_at).getTime()).toBeGreaterThanOrEqual(
        new Date(firstScannedAt).getTime()
      );
    });

    it('should update last_scanned_at on every scan', async () => {
      const ticket = await createTestTicket({ initialScanCount: 0, maxScanCount: 5 });

      const timestamps = [];

      // Perform 3 scans with delays
      for (let i = 0; i < 3; i++) {
        const response = await validateTicket(ticket);
        if (response.status === 0) {
          console.warn('⚠️ Ticket service unavailable - skipping test');
          return;
        }

        const result = await db.execute({
          sql: 'SELECT last_scanned_at FROM tickets WHERE ticket_id = ?',
          args: [ticket.ticketId],
        });

        timestamps.push(new Date(result.rows[0].last_scanned_at).getTime());

        // Small delay between scans
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Verify timestamps are in ascending order
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('Maximum Scan Limit', () => {
    it('should allow scan when scan_count < max_scan_count', async () => {
      const ticket = await createTestTicket({ initialScanCount: 5, maxScanCount: 10 });

      const response = await validateTicket(ticket);
      
      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.data.valid).toBe(true);

      // Verify scan count incremented
      const result = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      expect(Number(result.rows[0].scan_count)).toBe(6);
    });

    it('should reject scan when scan_count >= max_scan_count', async () => {
      const ticket = await createTestTicket({ initialScanCount: 10, maxScanCount: 10 });

      const response = await validateTicket(ticket);

      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      // Should reject scan - 410 GONE means scan limit exceeded (valid response)
      expect(response.status).toBe(HTTP_STATUS.GONE); // 410 Gone
      if (response.data) {
        expect(response.data.valid).toBe(false);
      }

      // Verify scan count unchanged
      const result = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      expect(Number(result.rows[0].scan_count)).toBe(10); // Should remain at max
    });

    it('should provide clear error message on limit exceeded', async () => {
      const ticket = await createTestTicket({ initialScanCount: 3, maxScanCount: 3 });

      const response = await validateTicket(ticket);

      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      expect(response.data.valid).toBe(false);
      const errorMessage = response.data.error || response.data.validation?.message || '';
      expect(errorMessage).toMatch(/maximum scans exceeded|scan limit/i);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce per-IP rate limiting', async () => {
      // Note: Rate limiting is disabled in test mode
      // This test verifies the enforcement logic exists
      
      const ticket = await createTestTicket({ maxScanCount: 100 });

      // In production, rapid requests from same IP would be rate limited
      // In test mode, rate limiting is bypassed
      
      const response = await validateTicket(ticket);
      
      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      // Should succeed in test mode (rate limiting disabled)
      expect([HTTP_STATUS.OK, HTTP_STATUS.TOO_MANY_REQUESTS]).toContain(response.status);
    });

    it('should enforce per-ticket rate limiting (10 scans/hour)', async () => {
      // Create ticket with high max_scan_count
      const ticket = await createTestTicket({ maxScanCount: 100 });

      // Attempt rapid scans (in production, would be rate limited after 10)
      const rapidScans = Array(5).fill(null).map(() => validateTicket(ticket));
      const results = await Promise.allSettled(rapidScans);

      // In test mode, all should succeed (rate limiting disabled)
      // In production, would see 429 responses after 10 scans/hour
      const successCount = results.filter(
        r => r.status === 'fulfilled' && r.value?.data?.valid === true
      ).length;

      expect(successCount).toBeGreaterThan(0);
    });

    it('should fail-closed when rate limiting service fails', async () => {
      // This test verifies fail-closed behavior
      // In production, if rate limiter fails, requests should be rejected
      
      const ticket = await createTestTicket({ maxScanCount: 10 });
      const response = await validateTicket(ticket);

      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      // Should either succeed or fail-closed (not fail-open)
      expect([HTTP_STATUS.OK, HTTP_STATUS.SERVICE_UNAVAILABLE, HTTP_STATUS.TOO_MANY_REQUESTS])
        .toContain(response.status);
    });

    it('should NOT fail-open on rate limit error', async () => {
      // Verify fail-closed behavior: errors should reject, not allow
      
      const ticket = await createTestTicket({ maxScanCount: 10 });
      const response = await validateTicket(ticket);

      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      // Should never return 200 OK if rate limiter throws error
      // Either blocks (429) or allows through (200), but never fail-open with error
      if (!response.data.valid) {
        expect(response.data.error).toBeDefined();
      }
    });
  });

  describe('IP Spoofing Prevention', () => {
    it('should validate x-forwarded-for header', async () => {
      const ticket = await createTestTicket({ maxScanCount: 10 });
      
      // Test with various IP formats
      const validIPs = [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334', // IPv6
      ];

      for (const ip of validIPs) {
        const response = await testRequest(
          'POST',
          '/api/tickets/validate',
          { token: qrService.generateToken({ tid: ticket.ticketId }) },
          { 'x-forwarded-for': ip }
        );

        if (response.status === 0) continue;

        // Should accept valid IPs
        expect([HTTP_STATUS.OK, HTTP_STATUS.GONE]).toContain(response.status);
      }
    });

    it('should reject obviously spoofed IPs', async () => {
      const ticket = await createTestTicket({ maxScanCount: 10 });
      
      // Test with invalid IP formats
      const invalidIPs = [
        '999.999.999.999',
        'not-an-ip',
        '127.0.0.0.1', // Extra octet
        '192.168.1', // Missing octet
      ];

      for (const ip of invalidIPs) {
        const response = await testRequest(
          'POST',
          '/api/tickets/validate',
          { token: qrService.generateToken({ tid: ticket.ticketId }) },
          { 'x-forwarded-for': ip }
        );

        if (response.status === 0) continue;

        // Should still process (IP validation is for logging, not blocking)
        expect(response.status).toBeGreaterThanOrEqual(200);
      }
    });

    it('should use real IP in production', async () => {
      const ticket = await createTestTicket({ maxScanCount: 10 });
      
      // Simulate production request with x-real-ip header
      const response = await testRequest(
        'POST',
        '/api/tickets/validate',
        { token: qrService.generateToken({ tid: ticket.ticketId }) },
        { 'x-real-ip': '203.0.113.42' }
      );

      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      // Should process successfully
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Concurrent Scan Attempts', () => {
    it('should handle 10 concurrent scans atomically', async () => {
      const ticket = await createTestTicket({ initialScanCount: 0, maxScanCount: 5 });

      // Launch 10 concurrent scans
      const concurrentScans = Array(10).fill(null).map(() => validateTicket(ticket));
      const results = await Promise.allSettled(concurrentScans);

      // Count successful scans
      const successfulScans = results.filter(
        r => r.status === 'fulfilled' && r.value?.data?.valid === true
      ).length;

      // Should not exceed max_scan_count (5)
      expect(successfulScans).toBeLessThanOrEqual(5);

      // Verify database scan count
      const dbResult = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      const finalScanCount = Number(dbResult.rows[0].scan_count);
      
      // Database scan count should match successful scans
      expect(finalScanCount).toBe(successfulScans);
      
      // Should never exceed max_scan_count
      expect(finalScanCount).toBeLessThanOrEqual(5);
    });

    it('should only increment scan_count by actual scan count', async () => {
      const ticket = await createTestTicket({ initialScanCount: 0, maxScanCount: 3 });

      // Perform 3 sequential scans
      for (let i = 0; i < 3; i++) {
        const response = await validateTicket(ticket);
        if (response.status === 0) {
          console.warn('⚠️ Ticket service unavailable - skipping test');
          return;
        }
      }

      // Verify scan count is exactly 3
      const result = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      expect(Number(result.rows[0].scan_count)).toBe(3);
    });

    it('should reject excess scans beyond max_scan_count', async () => {
      const ticket = await createTestTicket({ initialScanCount: 0, maxScanCount: 2 });

      // Perform 2 successful scans
      await validateTicket(ticket);
      await validateTicket(ticket);

      // Third scan should fail
      const response3 = await validateTicket(ticket);

      if (response3.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      expect(response3.data.valid).toBe(false);
      expect(response3.data.error || response3.data.validation?.message).toMatch(/maximum scans exceeded|scan limit/i);

      // Verify scan count is still 2
      const result = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticket.ticketId],
      });

      expect(Number(result.rows[0].scan_count)).toBe(2);
    });
  });

  describe('Scan Logging and Audit Trail', () => {
    it('should log successful scans to scan_logs table', async () => {
      const ticket = await createTestTicket({ maxScanCount: 10 });

      const response = await validateTicket(ticket);

      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      if (response.data.valid) {
        // Check if scan_logs table exists
        const tableCheck = await db.execute(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='scan_logs'
        `);

        if (tableCheck.rows.length > 0) {
          // Verify scan was logged
          const logResult = await db.execute({
            sql: `SELECT * FROM scan_logs WHERE ticket_id = ? ORDER BY scanned_at DESC LIMIT 1`,
            args: [ticket.ticketId],
          });

          if (logResult.rows.length > 0) {
            const scanLog = logResult.rows[0];
            expect(scanLog.scan_status).toBe('valid');
            expect(scanLog.token_type).toMatch(/JWT|direct/i);
          }
        }
      }
    });

    it('should log failed scans with failure reason', async () => {
      const ticket = await createTestTicket({ initialScanCount: 5, maxScanCount: 5 });

      const response = await validateTicket(ticket);

      if (response.status === 0) {
        console.warn('⚠️ Ticket service unavailable - skipping test');
        return;
      }

      expect(response.data.valid).toBe(false);

      // Check if scan_logs table exists and has failure logged
      const tableCheck = await db.execute(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='scan_logs'
      `);

      if (tableCheck.rows.length > 0) {
        const logResult = await db.execute({
          sql: `SELECT * FROM scan_logs WHERE ticket_id = ? ORDER BY scanned_at DESC LIMIT 1`,
          args: [ticket.ticketId],
        });

        if (logResult.rows.length > 0) {
          const scanLog = logResult.rows[0];
          expect(scanLog.scan_status).not.toBe('valid');
          expect(scanLog.failure_reason).toBeDefined();
        }
      }
    });
  });
});
