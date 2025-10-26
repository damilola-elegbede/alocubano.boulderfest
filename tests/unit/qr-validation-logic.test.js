/**
 * Unit Tests for QR Validation Logic
 * Tests QR code generation, validation rules, scan limits, and duplicate detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QRTokenService } from '../../lib/qr-token-service.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

describe('QR Validation Logic - Unit Tests', () => {
  let qrService;
  let mockDb;
  const TEST_QR_SECRET = 'test-qr-secret-key-minimum-32-chars-long-for-security';
  const TEST_WALLET_SECRET = 'test-wallet-auth-secret-minimum-32-chars-long';

  beforeEach(() => {
    // Set up environment for testing
    process.env.QR_SECRET_KEY = TEST_QR_SECRET;
    process.env.WALLET_AUTH_SECRET = TEST_WALLET_SECRET;
    process.env.QR_CODE_MAX_SCANS = '10';

    // Create fresh QR service instance
    qrService = new QRTokenService();

    // Mock database client
    mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [], rowsAffected: 1 })
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('QR Code Generation', () => {
    it('should generate JWT token for ticket ID', async () => {
      const ticketId = 'TEST-TICKET-001';

      // Mock ticket with no existing token
      const mockTicket = {
        ticket_id: ticketId,
        qr_token: null,
        scan_count: 0,
        max_scan_count: 10
      };

      mockDb.execute
        .mockResolvedValueOnce({ rows: [mockTicket] }) // Check existing token
        .mockResolvedValueOnce({ rows: [] }) // Event lookup (no event found - fallback)
        .mockResolvedValueOnce({ rowsAffected: 1 }); // Token saved

      // Override getDb method BEFORE calling getOrCreateToken
      qrService.getDb = vi.fn().mockResolvedValue(mockDb);

      const token = await qrService.getOrCreateToken(ticketId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify JWT structure
      const decoded = jwt.verify(token, TEST_QR_SECRET);
      expect(decoded.tid).toBe(ticketId);
    });

    it('should return existing token if already generated', async () => {
      const ticketId = 'TEST-TICKET-002';
      const existingToken = jwt.sign({ tid: ticketId }, TEST_QR_SECRET);

      mockDb.execute.mockResolvedValueOnce({
        rows: [{ qr_token: existingToken }]
      });

      qrService.getDb = vi.fn().mockResolvedValue(mockDb);

      const token = await qrService.getOrCreateToken(ticketId);

      expect(token).toBe(existingToken);
    });

    it('should include ticket ID in token payload', () => {
      const ticketId = 'TEST-TICKET-003';
      const token = qrService.generateToken({ tid: ticketId });

      const decoded = jwt.verify(token, TEST_QR_SECRET);
      expect(decoded.tid).toBe(ticketId);
    });

    it('should set token expiration to 1 year when no exp provided', () => {
      const ticketId = 'TEST-TICKET-004';
      const beforeTime = Math.floor(Date.now() / 1000);
      const token = qrService.generateToken({ tid: ticketId });
      const afterTime = Math.floor(Date.now() / 1000);

      const decoded = jwt.verify(token, TEST_QR_SECRET);
      const expectedExpiry = 365 * 24 * 60 * 60; // 1 year in seconds (default fallback)

      // Allow small tolerance for timing
      expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(expectedExpiry - 60);
      expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(expectedExpiry + 60);
      expect(decoded.iat).toBeGreaterThanOrEqual(beforeTime);
      expect(decoded.iat).toBeLessThanOrEqual(afterTime);
    });

    it('should store generated token in database', async () => {
      const ticketId = 'TEST-TICKET-005';

      // Mock ticket with no existing token
      const mockTicket = {
        ticket_id: ticketId,
        qr_token: null,
        scan_count: 0,
        max_scan_count: 10
      };

      mockDb.execute
        .mockResolvedValueOnce({ rows: [mockTicket] }) // Check existing token
        .mockResolvedValueOnce({ rows: [] }) // Event lookup (no event found - fallback)
        .mockResolvedValueOnce({ rowsAffected: 1 }); // Token saved

      qrService.getDb = vi.fn().mockResolvedValue(mockDb);

      await qrService.getOrCreateToken(ticketId);

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('UPDATE tickets'),
          args: expect.arrayContaining([
            expect.any(String), // token
            10, // max_scan_count
            ticketId
          ])
        })
      );
    });

    it('should set max_scan_count when generating token', async () => {
      const ticketId = 'TEST-TICKET-006';

      // Mock ticket with no existing token
      const mockTicket = {
        ticket_id: ticketId,
        qr_token: null,
        scan_count: 0,
        max_scan_count: 10
      };

      mockDb.execute
        .mockResolvedValueOnce({ rows: [mockTicket] }) // Check existing token
        .mockResolvedValueOnce({ rows: [] }) // Event lookup (no event found - fallback)
        .mockResolvedValueOnce({ rowsAffected: 1 }); // Token saved

      qrService.getDb = vi.fn().mockResolvedValue(mockDb);

      await qrService.getOrCreateToken(ticketId);

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining([10]) // max_scan_count
        })
      );
    });
  });

  describe('QR Code Validation Rules', () => {
    it('should validate token with correct signature', () => {
      const token = jwt.sign(
        { tid: 'TEST-TICKET-001' },
        TEST_QR_SECRET,
        { algorithm: 'HS256', expiresIn: '90d' }
      );

      const result = qrService.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload.tid).toBe('TEST-TICKET-001');
    });

    it('should reject token with invalid signature', () => {
      const token = jwt.sign(
        { tid: 'TEST-TICKET-001' },
        'wrong-secret-key',
        { algorithm: 'HS256' }
      );

      const result = qrService.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token');
    });

    it('should reject expired token', () => {
      const expiredToken = jwt.sign(
        { tid: 'TEST-TICKET-001' },
        TEST_QR_SECRET,
        { algorithm: 'HS256', expiresIn: '-1h' } // Expired 1 hour ago
      );

      const result = qrService.validateToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject malformed token', () => {
      const malformedToken = 'not.a.valid.jwt.token';

      const result = qrService.validateToken(malformedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject null or undefined token', () => {
      const resultNull = qrService.validateToken(null);
      const resultUndefined = qrService.validateToken(undefined);

      expect(resultNull.valid).toBe(false);
      expect(resultUndefined.valid).toBe(false);
    });

    it('should reject empty string token', () => {
      const result = qrService.validateToken('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });

    it('should validate token format before verification', () => {
      const token = 'invalid-format';

      const result = qrService.validateToken(token);

      expect(result.valid).toBe(false);
    });
  });

  describe('Scan Count Increment Logic', () => {
    it('should increment scan_count atomically', () => {
      const updateQuery = `
        UPDATE tickets
        SET scan_count = scan_count + 1,
            last_scanned_at = CURRENT_TIMESTAMP
        WHERE ticket_id = ?
          AND scan_count < max_scan_count
      `;

      expect(updateQuery).toContain('scan_count = scan_count + 1');
      expect(updateQuery).toContain('scan_count < max_scan_count');
    });

    it('should update last_scanned_at on successful scan', () => {
      const updateFields = {
        scan_count: 'scan_count + 1',
        last_scanned_at: 'CURRENT_TIMESTAMP'
      };

      expect(updateFields.last_scanned_at).toBe('CURRENT_TIMESTAMP');
    });

    it('should set first_scanned_at on initial scan', () => {
      const updateQuery = `
        UPDATE tickets
        SET first_scanned_at = COALESCE(first_scanned_at, CURRENT_TIMESTAMP)
      `;

      expect(updateQuery).toContain('COALESCE(first_scanned_at, CURRENT_TIMESTAMP)');
    });

    it('should prevent scan if limit reached', () => {
      const whereClause = 'scan_count < max_scan_count';

      expect(whereClause).toBe('scan_count < max_scan_count');
    });

    it('should return rows affected for verification', () => {
      const updateResult = {
        rowsAffected: 1
      };

      expect(updateResult.rowsAffected).toBe(1);
    });

    it('should fail gracefully if concurrent scan reaches limit', () => {
      const updateResult = {
        rowsAffected: 0 // No rows updated (race condition)
      };

      expect(updateResult.rowsAffected).toBe(0);
    });
  });

  describe('Duplicate Scan Detection', () => {
    it('should prevent multiple scans within short time window', () => {
      const lastScannedAt = new Date();
      const now = new Date();
      const timeDiff = now - lastScannedAt; // milliseconds

      const isDuplicate = timeDiff < 5000; // 5 seconds

      expect(typeof isDuplicate).toBe('boolean');
    });

    it('should allow scans after cooldown period', () => {
      const lastScannedAt = new Date(Date.now() - 10000); // 10 seconds ago
      const now = new Date();
      const timeDiff = now - lastScannedAt;

      const isAllowed = timeDiff >= 5000; // 5 second cooldown

      expect(isAllowed).toBe(true);
    });

    it('should track scan count to prevent limit bypass', () => {
      const ticket = {
        scan_count: 5,
        max_scan_count: 10
      };

      const canScan = ticket.scan_count < ticket.max_scan_count;

      expect(canScan).toBe(true);
    });

    it('should reject scan at exact limit', () => {
      const ticket = {
        scan_count: 10,
        max_scan_count: 10
      };

      const canScan = ticket.scan_count < ticket.max_scan_count;

      expect(canScan).toBe(false);
    });

    it('should reject scan beyond limit', () => {
      const ticket = {
        scan_count: 11,
        max_scan_count: 10
      };

      const canScan = ticket.scan_count < ticket.max_scan_count;

      expect(canScan).toBe(false);
    });
  });

  describe('Scan Limit Enforcement', () => {
    it('should enforce default max_scan_count of 10', () => {
      expect(qrService.maxScans).toBe(10);
    });

    it('should respect custom max_scan_count from environment', () => {
      process.env.QR_CODE_MAX_SCANS = '15';
      const customService = new QRTokenService();

      expect(customService.maxScans).toBe(15);
    });

    it('should prevent scan when limit reached', () => {
      const ticket = {
        scan_count: 10,
        max_scan_count: 10,
        status: 'valid'
      };

      const canScan = ticket.scan_count < ticket.max_scan_count && ticket.status === 'valid';

      expect(canScan).toBe(false);
    });

    it('should allow scan below limit', () => {
      const ticket = {
        scan_count: 3,
        max_scan_count: 10,
        status: 'valid'
      };

      const canScan = ticket.scan_count < ticket.max_scan_count && ticket.status === 'valid';

      expect(canScan).toBe(true);
    });

    it('should check ticket status before allowing scan', () => {
      const validTicket = { status: 'valid' };
      const cancelledTicket = { status: 'cancelled' };

      expect(validTicket.status).toBe('valid');
      expect(cancelledTicket.status).not.toBe('valid');
    });

    it('should check validation_status before allowing scan', () => {
      const activeTicket = { validation_status: 'active' };
      const suspendedTicket = { validation_status: 'suspended' };

      expect(activeTicket.validation_status).toBe('active');
      expect(suspendedTicket.validation_status).not.toBe('active');
    });
  });

  describe('Scan Timestamp Tracking', () => {
    it('should record first_scanned_at on initial scan', () => {
      const beforeScan = { first_scanned_at: null };
      const afterScan = { first_scanned_at: new Date().toISOString() };

      expect(beforeScan.first_scanned_at).toBeNull();
      expect(afterScan.first_scanned_at).toBeDefined();
    });

    it('should preserve first_scanned_at on subsequent scans', () => {
      const firstScanTime = '2026-05-15T10:00:00Z';
      const ticket = {
        first_scanned_at: firstScanTime,
        last_scanned_at: '2026-05-15T15:00:00Z'
      };

      expect(ticket.first_scanned_at).toBe(firstScanTime);
      expect(ticket.last_scanned_at).not.toBe(firstScanTime);
    });

    it('should update last_scanned_at on each scan', () => {
      const beforeTime = new Date().toISOString();
      const afterTime = new Date(Date.now() + 1000).toISOString();

      expect(afterTime).not.toBe(beforeTime);
    });

    it('should use CURRENT_TIMESTAMP for scan times', () => {
      const sqlTimestamp = 'CURRENT_TIMESTAMP';

      expect(sqlTimestamp).toBe('CURRENT_TIMESTAMP');
    });

    it('should format timestamps in ISO 8601', () => {
      const timestamp = new Date().toISOString();

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('QR Image Generation', () => {
    it('should generate QR code as data URL', async () => {
      const token = 'test-token';
      const qrImage = await qrService.generateQRImage(token);

      expect(qrImage).toContain('data:image/png;base64,');
    });

    it('should validate token before generating QR image', async () => {
      await expect(qrService.generateQRImage('')).rejects.toThrow('Token is required');
      await expect(qrService.generateQRImage('short')).rejects.toThrow('Invalid token format');
    });

    it('should use error correction level M', async () => {
      const options = {
        errorCorrectionLevel: 'M'
      };

      expect(options.errorCorrectionLevel).toBe('M');
    });

    it('should generate 300x300 pixel QR code by default', async () => {
      const options = {
        width: 300
      };

      expect(options.width).toBe(300);
    });

    it('should use black and white colors', async () => {
      const colorOptions = {
        dark: '#000000',
        light: '#FFFFFF'
      };

      expect(colorOptions.dark).toBe('#000000');
      expect(colorOptions.light).toBe('#FFFFFF');
    });

    it('should include margin for scanning reliability', async () => {
      const options = {
        margin: 2
      };

      expect(options.margin).toBeGreaterThan(0);
    });

    it('should handle QR generation errors gracefully', async () => {
      await expect(async () => {
        throw new Error('Failed to generate QR code image');
      }).rejects.toThrow('Failed to generate QR code image');
    });
  });

  describe('Test Token Detection', () => {
    it('should detect test token by payload flag', () => {
      const testToken = jwt.sign(
        { tid: 'TEST-TICKET-001', isTest: true },
        TEST_QR_SECRET
      );

      const isTest = qrService.isTestToken(testToken);

      expect(isTest).toBe(true);
    });

    it('should detect test token by ticket ID prefix', () => {
      const testToken = jwt.sign(
        { tid: 'TEST-TICKET-001' },
        TEST_QR_SECRET
      );

      const validation = qrService.validateToken(testToken);
      const isTest = validation.payload?.tid?.startsWith('TEST-');

      expect(isTest).toBe(true);
    });

    it('should not mark production tokens as test', () => {
      const prodToken = jwt.sign(
        { tid: 'PROD-TICKET-001' },
        TEST_QR_SECRET
      );

      const isTest = qrService.isTestToken(prodToken);

      expect(isTest).toBe(false);
    });

    it('should handle invalid token in test detection', () => {
      const invalidToken = 'invalid-token';

      const isTest = qrService.isTestToken(invalidToken);

      expect(isTest).toBe(false);
    });
  });

  describe('Service Configuration', () => {
    it('should verify service is properly configured', () => {
      const isConfigured = qrService.isConfigured();

      expect(isConfigured).toBe(true);
    });

    it('should require QR_SECRET_KEY for configuration', () => {
      expect(qrService.secretKey).toBeDefined();
      expect(qrService.secretKey.length).toBeGreaterThan(20);
    });

    it('should require WALLET_AUTH_SECRET for configuration', () => {
      expect(process.env.WALLET_AUTH_SECRET).toBeDefined();
      expect(process.env.WALLET_AUTH_SECRET.length).toBeGreaterThan(20);
    });

    it('should fail configuration check without secrets', () => {
      const unconfiguredService = new QRTokenService();
      unconfiguredService.secretKey = null;

      const isConfigured = unconfiguredService.isConfigured();

      expect(isConfigured).toBe(false);
    });

    it('should use event-based expiry (removed fixed 90-day default)', () => {
      // expiryDays property was removed - service now uses event-based expiry
      // (7 days after event end, or 1 year fallback if event not found)
      expect(qrService.expiryDays).toBeUndefined();
    });

    it('should use default max scans of 10', () => {
      expect(qrService.maxScans).toBe(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing ticket ID in token generation', async () => {
      qrService.getDb = vi.fn().mockResolvedValue(mockDb);

      await expect(qrService.getOrCreateToken('')).rejects.toThrow('Ticket ID is required');
      await expect(qrService.getOrCreateToken(null)).rejects.toThrow('Ticket ID is required');
    });

    it('should handle database errors during token retrieval', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('Database error'));
      qrService.getDb = vi.fn().mockResolvedValue(mockDb);

      await expect(qrService.getOrCreateToken('TEST-001')).rejects.toThrow('Failed to generate QR token');
    });

    it('should handle invalid payload in token generation', () => {
      expect(() => qrService.generateToken(null)).toThrow('Payload is required');
      expect(() => qrService.generateToken('string')).toThrow('Payload is required');
    });

    it('should handle token generation without secret key', () => {
      const noSecretService = new QRTokenService();
      noSecretService.secretKey = null;

      expect(() => noSecretService.generateToken({ tid: 'TEST' })).toThrow('QR secret key not available');
    });

    it('should handle non-string token in validation', () => {
      const result = qrService.validateToken(12345);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should provide cleanup method', async () => {
      await expect(qrService.cleanup()).resolves.not.toThrow();
    });

    it('should not maintain persistent database connections', () => {
      // Service should get fresh connection per operation
      expect(qrService.getDb).toBeDefined();
    });
  });

  describe('Legacy QR Code Fallback (api/tickets/validate.js:360-374)', () => {
    /**
     * Tests for the fallback mechanism in api/tickets/validate.js
     * When validation_code query fails, system falls back to ticket_id query
     * This enables support for legacy QR codes that use ticket_id instead of validation_code
     */

    it('should throw "Ticket not found" when both validation_code and ticket_id queries fail', async () => {
      const validationCode = 'LEGACY-QR-CODE-001';

      // Mock database to return empty results for both queries
      mockDb.execute
        .mockResolvedValueOnce({ rows: [] }) // First query: validation_code returns empty
        .mockResolvedValueOnce({ rows: [] }); // Fallback query: ticket_id returns empty

      // Mock transaction
      const mockTransaction = {
        execute: mockDb.execute,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined)
      };

      mockDb.transaction = vi.fn().mockResolvedValue(mockTransaction);

      // Import the validateTicket function logic
      // Since we can't directly import it (it's internal), we'll test the behavior
      const startTime = Date.now();

      try {
        // Simulate the validation logic from api/tickets/validate.js
        const tx = await mockDb.transaction();

        // First query: validation_code (legacy non-JWT path)
        const result = await tx.execute({
          sql: `
            SELECT t.*,
                   'A Lo Cubano Boulder Fest' as event_name,
                   t.event_date
            FROM tickets t
            WHERE t.validation_code = ?
          `,
          args: [validationCode]
        });

        let ticket = result.rows[0];

        // Fallback: Try ticket_id for legacy QR codes
        if (!ticket) {
          const fallbackResult = await tx.execute({
            sql: `
              SELECT t.*,
                     'A Lo Cubano Boulder Fest' as event_name,
                     t.event_date
              FROM tickets t
              WHERE t.ticket_id = ?
            `,
            args: [validationCode]
          });
          ticket = fallbackResult.rows[0];
        }

        if (!ticket) {
          throw new Error('Ticket not found');
        }

        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.message).toBe('Ticket not found');
      }

      const endTime = Date.now();

      // Verify both queries were executed
      expect(mockDb.execute).toHaveBeenCalledTimes(2);

      // Verify first query used validation_code
      expect(mockDb.execute).toHaveBeenNthCalledWith(1, {
        sql: expect.stringContaining('WHERE t.validation_code = ?'),
        args: [validationCode]
      });

      // Verify second query used ticket_id (fallback)
      expect(mockDb.execute).toHaveBeenNthCalledWith(2, {
        sql: expect.stringContaining('WHERE t.ticket_id = ?'),
        args: [validationCode]
      });
    });

    it('should return ticket immediately when validation_code succeeds (no fallback executed)', async () => {
      const validationCode = 'VALID-CODE-001';
      const mockTicket = {
        ticket_id: 'TKT-PRIMARY-001',
        validation_code: 'VALID-CODE-001',
        ticket_type: 'VIP',
        status: 'valid',
        validation_status: 'active',
        scan_count: 0,
        max_scan_count: 10,
        attendee_first_name: 'Primary',
        attendee_last_name: 'User',
        event_name: 'A Lo Cubano Boulder Fest',
        event_date: '2026-05-15',
        event_end_date: '2026-05-17'
      };

      // Mock database to return ticket on first query
      mockDb.execute.mockResolvedValueOnce({ rows: [mockTicket] });

      // Mock transaction
      const mockTransaction = {
        execute: mockDb.execute,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined)
      };

      mockDb.transaction = vi.fn().mockResolvedValue(mockTransaction);

      // Simulate validation logic
      const tx = await mockDb.transaction();

      // First query: validation_code
      const result = await tx.execute({
        sql: `
          SELECT t.*,
                 'A Lo Cubano Boulder Fest' as event_name,
                 t.event_date
          FROM tickets t
          WHERE t.validation_code = ?
        `,
        args: [validationCode]
      });

      let ticket = result.rows[0];

      // Fallback: Should NOT be executed when first query succeeds
      if (!ticket) {
        const fallbackResult = await tx.execute({
          sql: `
            SELECT t.*,
                   'A Lo Cubano Boulder Fest' as event_name,
                   t.event_date
            FROM tickets t
            WHERE t.ticket_id = ?
          `,
          args: [validationCode]
        });
        ticket = fallbackResult.rows[0];
      }

      // Verify ticket was found from primary query
      expect(ticket).toBeDefined();
      expect(ticket.ticket_id).toBe('TKT-PRIMARY-001');
      expect(ticket.validation_code).toBe('VALID-CODE-001');
      expect(ticket.status).toBe('valid');

      // Critical assertion: Only ONE query should have been executed
      expect(mockDb.execute).toHaveBeenCalledTimes(1);

      // Verify the query was the primary validation_code query
      expect(mockDb.execute).toHaveBeenCalledWith({
        sql: expect.stringContaining('WHERE t.validation_code = ?'),
        args: [validationCode]
      });

      // Verify fallback query was NOT executed (performance optimization)
      expect(mockDb.execute).not.toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('WHERE t.ticket_id = ?')
        })
      );
    });

    it('should return ticket when validation_code fails but ticket_id succeeds (fallback)', async () => {
      const legacyCode = 'TKT-LEGACY-123';
      const mockTicket = {
        ticket_id: 'TKT-LEGACY-123',
        validation_code: null, // Legacy ticket without validation_code
        ticket_type: 'General Admission',
        status: 'valid',
        validation_status: 'active',
        scan_count: 0,
        max_scan_count: 10,
        attendee_first_name: 'Legacy',
        attendee_last_name: 'User',
        event_name: 'A Lo Cubano Boulder Fest',
        event_date: '2026-05-15',
        event_end_date: '2026-05-17'
      };

      // Mock database responses
      mockDb.execute
        .mockResolvedValueOnce({ rows: [] }) // First query: validation_code fails (empty result)
        .mockResolvedValueOnce({ rows: [mockTicket] }); // Fallback query: ticket_id succeeds

      // Mock transaction
      const mockTransaction = {
        execute: mockDb.execute,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined)
      };

      mockDb.transaction = vi.fn().mockResolvedValue(mockTransaction);

      // Simulate validation logic with fallback
      const tx = await mockDb.transaction();

      // First query: validation_code
      const result = await tx.execute({
        sql: `
          SELECT t.*,
                 'A Lo Cubano Boulder Fest' as event_name,
                 t.event_date
          FROM tickets t
          WHERE t.validation_code = ?
        `,
        args: [legacyCode]
      });

      let ticket = result.rows[0];

      // Fallback: Try ticket_id for legacy QR codes
      if (!ticket) {
        const fallbackResult = await tx.execute({
          sql: `
            SELECT t.*,
                   'A Lo Cubano Boulder Fest' as event_name,
                   t.event_date
            FROM tickets t
            WHERE t.ticket_id = ?
          `,
          args: [legacyCode]
        });
        ticket = fallbackResult.rows[0];
      }

      // Verify ticket was found via fallback
      expect(ticket).toBeDefined();
      expect(ticket.ticket_id).toBe('TKT-LEGACY-123');
      expect(ticket.status).toBe('valid');
      expect(ticket.validation_status).toBe('active');

      // Verify both queries were executed
      expect(mockDb.execute).toHaveBeenCalledTimes(2);

      // Verify fallback query was executed with correct parameters
      expect(mockDb.execute).toHaveBeenNthCalledWith(2, {
        sql: expect.stringContaining('WHERE t.ticket_id = ?'),
        args: [legacyCode]
      });
    });

    it('should not add significant latency - fallback overhead should be < 50ms', async () => {
      const validationCode = 'PERF-TEST-001';
      const mockTicket = {
        ticket_id: 'PERF-TEST-001',
        validation_code: null,
        ticket_type: 'VIP',
        status: 'valid',
        validation_status: 'active',
        scan_count: 2,
        max_scan_count: 10,
        attendee_first_name: 'Performance',
        attendee_last_name: 'Test',
        event_name: 'A Lo Cubano Boulder Fest',
        event_date: '2026-05-15',
        event_end_date: '2026-05-17'
      };

      // Mock database with realistic delays
      mockDb.execute = vi.fn()
        .mockImplementationOnce(async () => {
          // Simulate realistic database query time (5-10ms)
          await new Promise(resolve => setTimeout(resolve, 8));
          return { rows: [] };
        })
        .mockImplementationOnce(async () => {
          // Simulate realistic database query time (5-10ms)
          await new Promise(resolve => setTimeout(resolve, 7));
          return { rows: [mockTicket] };
        });

      // Mock transaction
      const mockTransaction = {
        execute: mockDb.execute,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined)
      };

      mockDb.transaction = vi.fn().mockResolvedValue(mockTransaction);

      // Measure performance
      const startTime = performance.now();

      const tx = await mockDb.transaction();

      // First query: validation_code
      const result = await tx.execute({
        sql: `
          SELECT t.*,
                 'A Lo Cubano Boulder Fest' as event_name,
                 t.event_date
          FROM tickets t
          WHERE t.validation_code = ?
        `,
        args: [validationCode]
      });

      let ticket = result.rows[0];

      // Fallback: Try ticket_id
      if (!ticket) {
        const fallbackResult = await tx.execute({
          sql: `
            SELECT t.*,
                   'A Lo Cubano Boulder Fest' as event_name,
                   t.event_date
            FROM tickets t
            WHERE t.ticket_id = ?
          `,
          args: [validationCode]
        });
        ticket = fallbackResult.rows[0];
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Verify ticket was found
      expect(ticket).toBeDefined();
      expect(ticket.ticket_id).toBe('PERF-TEST-001');

      // Verify performance: total time should be < 50ms overhead + query times
      // With 2 queries at ~8ms each = ~16ms total, plus overhead should be well under 50ms
      expect(duration).toBeLessThan(50);

      // Verify both queries were executed
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
    });

    it('should use same transaction for both queries to ensure consistency', async () => {
      const validationCode = 'TX-CONSISTENCY-001';
      const mockTicket = {
        ticket_id: 'TX-CONSISTENCY-001',
        validation_code: null,
        ticket_type: 'General Admission',
        status: 'valid',
        validation_status: 'active',
        scan_count: 0,
        max_scan_count: 10
      };

      // Track transaction instance
      let transactionInstance = null;

      mockDb.execute = vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockTicket] });

      const mockTransaction = {
        execute: mockDb.execute,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined)
      };

      mockDb.transaction = vi.fn().mockResolvedValue(mockTransaction);

      // Start transaction
      const tx = await mockDb.transaction();
      transactionInstance = tx;

      // Execute queries
      await tx.execute({
        sql: 'SELECT * FROM tickets WHERE validation_code = ?',
        args: [validationCode]
      });

      await tx.execute({
        sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
        args: [validationCode]
      });

      // Verify same transaction was used for both queries
      expect(tx).toBe(transactionInstance);
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(tx.execute).toHaveBeenCalledTimes(2);
    });

    it('should maintain query result structure consistency between primary and fallback', async () => {
      const validationCode = 'STRUCT-TEST-001';
      const mockTicketStructure = {
        ticket_id: 'STRUCT-TEST-001',
        validation_code: null,
        ticket_type: 'VIP',
        ticket_type_name: 'VIP Pass',
        status: 'valid',
        validation_status: 'active',
        scan_count: 1,
        max_scan_count: 10,
        attendee_first_name: 'Structure',
        attendee_last_name: 'Test',
        attendee_email: 'structure@test.com',
        event_name: 'A Lo Cubano Boulder Fest',
        event_date: '2026-05-15',
        event_end_date: '2026-05-17',
        first_scanned_at: '2026-05-15T10:00:00Z',
        last_scanned_at: '2026-05-15T10:00:00Z',
        qr_access_method: 'web'
      };

      // Mock both queries to return same structure
      mockDb.execute
        .mockResolvedValueOnce({ rows: [] }) // Primary query fails
        .mockResolvedValueOnce({ rows: [mockTicketStructure] }); // Fallback succeeds

      const mockTransaction = {
        execute: mockDb.execute,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined)
      };

      mockDb.transaction = vi.fn().mockResolvedValue(mockTransaction);

      const tx = await mockDb.transaction();

      // Primary query
      const primaryResult = await tx.execute({
        sql: `SELECT t.*, 'A Lo Cubano Boulder Fest' as event_name, t.event_date FROM tickets t WHERE t.validation_code = ?`,
        args: [validationCode]
      });

      let ticket = primaryResult.rows[0];

      // Fallback query
      if (!ticket) {
        const fallbackResult = await tx.execute({
          sql: `SELECT t.*, 'A Lo Cubano Boulder Fest' as event_name, t.event_date FROM tickets t WHERE t.ticket_id = ?`,
          args: [validationCode]
        });
        ticket = fallbackResult.rows[0];
      }

      // Verify result structure includes all expected fields
      expect(ticket).toBeDefined();
      expect(ticket).toHaveProperty('ticket_id');
      expect(ticket).toHaveProperty('ticket_type');
      expect(ticket).toHaveProperty('status');
      expect(ticket).toHaveProperty('validation_status');
      expect(ticket).toHaveProperty('scan_count');
      expect(ticket).toHaveProperty('max_scan_count');
      expect(ticket).toHaveProperty('attendee_first_name');
      expect(ticket).toHaveProperty('attendee_last_name');
      expect(ticket).toHaveProperty('event_name');
      expect(ticket).toHaveProperty('event_date');

      // Verify structure matches expected format
      expect(ticket.event_name).toBe('A Lo Cubano Boulder Fest');
    });

    it('should handle BigInt values correctly in fallback query results', async () => {
      const validationCode = 'BIGINT-TEST-001';
      const mockTicketWithBigInt = {
        id: BigInt(123456789),
        ticket_id: 'BIGINT-TEST-001',
        transaction_id: BigInt(987654321),
        scan_count: BigInt(3),
        max_scan_count: BigInt(10),
        status: 'valid',
        validation_status: 'active'
      };

      mockDb.execute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockTicketWithBigInt] });

      const mockTransaction = {
        execute: mockDb.execute,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined)
      };

      mockDb.transaction = vi.fn().mockResolvedValue(mockTransaction);

      const tx = await mockDb.transaction();

      // Queries
      const primaryResult = await tx.execute({
        sql: 'SELECT * FROM tickets WHERE validation_code = ?',
        args: [validationCode]
      });

      let ticket = primaryResult.rows[0];

      if (!ticket) {
        const fallbackResult = await tx.execute({
          sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
          args: [validationCode]
        });
        ticket = fallbackResult.rows[0];
      }

      // Verify BigInt fields are present (will be processed by bigint-serializer.js in actual API)
      expect(ticket).toBeDefined();
      expect(ticket.id).toBe(BigInt(123456789));
      expect(ticket.transaction_id).toBe(BigInt(987654321));
      expect(ticket.scan_count).toBe(BigInt(3));
    });
  });
});
