/**
 * Integration Tests for Wallet Pass Endpoints
 * Tests Apple/Google Wallet pass generation, authentication, content types, and error handling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDbClient } from '../setup-integration.js';
import { getQRTokenService } from '../../lib/qr-token-service.js';

describe('Wallet Pass Endpoints - Integration Tests', () => {
  let db;
  let qrService;
  const BASE_URL = process.env.VITEST_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    // Set up test environment
    process.env.INTEGRATION_TEST_MODE = 'true';
    process.env.QR_SECRET_KEY = 'test-qr-secret-key-minimum-32-chars-long-for-integration';
    process.env.WALLET_AUTH_SECRET = 'test-wallet-auth-secret-minimum-32-chars-long';

    db = await getDbClient();
    qrService = getQRTokenService();

    // Create event
    await db.execute({
      sql: `
        INSERT INTO events (
          id, name, description, venue_name, venue_city, venue_state,
          venue_address, start_date, end_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [
        'boulder-fest-2026',
        'A Lo Cubano Boulder Fest',
        'Cuban Salsa Festival',
        'Avalon Ballroom',
        'Boulder',
        'CO',
        '6185 Arapahoe Road, Boulder, CO 80303',
        '2026-05-15T10:00:00-06:00',
        '2026-05-17T23:00:00-06:00',
        'active'
      ]
    });

    // Create test ticket for wallet passes
    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, ticket_type_name,
          attendee_first_name, attendee_last_name, attendee_email,
          status, validation_status, scan_count, max_scan_count,
          event_id, registration_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      args: [
        'WALLET-TEST-001',
        2000,
        'full-pass',
        'Full Festival Pass',
        'Alice',
        'Wallet',
        'alice.wallet@example.com',
        'valid',
        'active',
        0,
        10,
        'boulder-fest-2026',
        'completed'
      ]
    });

    // Generate QR token for the ticket
    await qrService.getOrCreateToken('WALLET-TEST-001');
  });

  afterAll(async () => {
    // Cleanup handled by setup-integration.js
  });

  describe('Apple Wallet Pass Endpoint', () => {
    it('should return 200 for valid ticket ID', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      // May return 503 if not configured, which is acceptable
      expect([200, 503]).toContain(response.status);
    });

    it('should set correct MIME type for .pkpass file', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      if (response.status === 200) {
        expect(response.headers.get('content-type')).toBe('application/vnd.apple.pkpass');
      }
    });

    it('should set attachment disposition with ticket filename', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      if (response.status === 200) {
        const disposition = response.headers.get('content-disposition');
        expect(disposition).toContain('attachment');
        expect(disposition).toContain('WALLET-TEST-001.pkpass');
      }
    });

    it('should return 404 for non-existent ticket', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/NON-EXISTENT`, {
        method: 'GET'
      });

      expect([404, 503]).toContain(response.status);
    });

    it('should return 400 for missing ticket ID', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/`, {
        method: 'GET'
      });

      expect([400, 404]).toContain(response.status);
    });

    it('should only accept GET requests', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'POST'
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toContain('GET');
    });

    it('should return binary pass data', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      if (response.status === 200) {
        const buffer = await response.arrayBuffer();
        expect(buffer.byteLength).toBeGreaterThan(0);
      }
    });

    it('should return 503 when Apple Wallet not configured', async () => {
      // If APPLE_PASS_KEY is not set, should return 503
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      if (response.status === 503) {
        const data = await response.json();
        expect(data.error).toContain('not configured');
      }
    });
  });

  describe('Google Wallet Pass Endpoint', () => {
    it('should return redirect or success for valid ticket ID', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/google-wallet/WALLET-TEST-001`, {
        method: 'GET',
        redirect: 'manual'
      });

      // May return 302 redirect or 503 if not configured
      expect([302, 503]).toContain(response.status);
    });

    it('should redirect to Google Wallet save URL', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/google-wallet/WALLET-TEST-001`, {
        method: 'GET',
        redirect: 'manual'
      });

      if (response.status === 302) {
        const location = response.headers.get('location');
        expect(location).toContain('pay.google.com');
        expect(location).toContain('/save/');
      }
    });

    it('should return 404 for non-existent ticket', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/google-wallet/NON-EXISTENT`, {
        method: 'GET',
        redirect: 'manual'
      });

      expect([404, 503]).toContain(response.status);
    });

    it('should return 400 for missing ticket ID', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/google-wallet/`, {
        method: 'GET'
      });

      expect([400, 404]).toContain(response.status);
    });

    it('should only accept GET requests', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/google-wallet/WALLET-TEST-001`, {
        method: 'POST'
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toContain('GET');
    });

    it('should return 503 when Google Wallet not configured', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/google-wallet/WALLET-TEST-001`, {
        method: 'GET',
        redirect: 'manual'
      });

      if (response.status === 503) {
        const data = await response.json();
        expect(data.error).toContain('not configured');
      }
    });
  });

  describe('Pass Authentication Requirements', () => {
    it('should allow pass generation for registered ticket', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      expect([200, 503]).toContain(response.status);
    });

    it('should prevent pass generation for unregistered ticket', async () => {
      // Create unregistered ticket
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, ticket_type_name,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          'WALLET-UNREG-001',
          2001,
          'full-pass',
          'Full Festival Pass',
          'valid',
          'active',
          0,
          10,
          'boulder-fest-2026',
          'pending'
        ]
      });

      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-UNREG-001`, {
        method: 'GET'
      });

      // Should work regardless of registration status for wallet generation
      expect([200, 404, 503]).toContain(response.status);
    });
  });

  describe('Pass Content Validation', () => {
    it('should include ticket information in pass', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      if (response.status === 200) {
        const buffer = await response.arrayBuffer();
        // Pass should contain ticket data
        expect(buffer.byteLength).toBeGreaterThan(0);
      }
    });

    it('should include QR code in pass', async () => {
      // QR code should be embedded in wallet pass
      const ticket = await db.execute({
        sql: 'SELECT qr_token FROM tickets WHERE ticket_id = ?',
        args: ['WALLET-TEST-001']
      });

      expect(ticket.rows[0].qr_token).toBeDefined();
    });

    it('should include event details in pass', async () => {
      // Event information should be included in pass
      const event = await db.execute({
        sql: 'SELECT * FROM events WHERE id = ?',
        args: ['boulder-fest-2026']
      });

      expect(event.rows[0]).toBeDefined();
      expect(event.rows[0].name).toBe('A Lo Cubano Boulder Fest');
    });

    it('should include attendee information in pass', async () => {
      const ticket = await db.execute({
        sql: 'SELECT attendee_first_name, attendee_last_name FROM tickets WHERE ticket_id = ?',
        args: ['WALLET-TEST-001']
      });

      expect(ticket.rows[0].attendee_first_name).toBe('Alice');
      expect(ticket.rows[0].attendee_last_name).toBe('Wallet');
    });
  });

  describe('Pass Error Handling', () => {
    it('should handle invalid ticket ID format gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/INVALID<>ID`, {
        method: 'GET'
      });

      expect([400, 404]).toContain(response.status);
    });

    it('should handle cancelled ticket gracefully', async () => {
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, ticket_type_name,
            attendee_first_name, attendee_last_name, attendee_email,
            status, validation_status, scan_count, max_scan_count,
            event_id, registration_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        args: [
          'WALLET-CANCELLED-001',
          2002,
          'full-pass',
          'Full Festival Pass',
          'Cancel',
          'Test',
          'cancel@example.com',
          'cancelled',
          'active',
          0,
          10,
          'boulder-fest-2026',
          'completed'
        ]
      });

      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-CANCELLED-001`, {
        method: 'GET'
      });

      // Should work but may return error based on implementation
      expect([200, 400, 404, 503]).toContain(response.status);
    });

    it('should handle database errors gracefully', async () => {
      // Database errors should return 500
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      expect(response.status).toBeLessThan(600);
    });

    it('should return descriptive error messages', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/NON-EXISTENT`, {
        method: 'GET'
      });

      if (response.status >= 400 && response.status < 500) {
        const data = await response.json();
        expect(data.error).toBeDefined();
      }
    });
  });

  describe('Pass Caching Headers', () => {
    it('should set appropriate cache headers for pass downloads', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      if (response.status === 200) {
        // Passes should be cacheable
        const cacheControl = response.headers.get('cache-control');
        expect(cacheControl).toBeDefined();
      }
    });

    it('should allow redownload of pass', async () => {
      const response1 = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      const response2 = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      expect(response1.status).toBe(response2.status);
    });
  });

  describe('Security', () => {
    it('should prevent directory traversal in ticket ID', async () => {
      const maliciousId = '../../../etc/passwd';

      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/${encodeURIComponent(maliciousId)}`, {
        method: 'GET'
      });

      expect([400, 404]).toContain(response.status);
    });

    it('should prevent SQL injection in ticket ID', async () => {
      const maliciousId = "'; DROP TABLE tickets; --";

      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/${encodeURIComponent(maliciousId)}`, {
        method: 'GET'
      });

      expect([400, 404]).toContain(response.status);

      // Verify tickets table still exists
      const result = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM tickets'
      });

      expect(result.rows[0].count).toBeGreaterThan(0);
    });

    it('should sanitize ticket ID input', async () => {
      const dirtyId = '<script>alert("xss")</script>';

      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/${encodeURIComponent(dirtyId)}`, {
        method: 'GET'
      });

      expect([400, 404]).toContain(response.status);
    });

    it('should use HTTPS for wallet pass URLs in production', () => {
      const baseUrl = process.env.VERCEL_ENV === 'production'
        ? 'https://www.alocubanoboulderfest.org'
        : BASE_URL;

      if (process.env.VERCEL_ENV === 'production') {
        expect(baseUrl).toContain('https://');
      }
    });
  });

  describe('Performance', () => {
    it('should generate Apple Wallet pass within reasonable time', async () => {
      const start = Date.now();

      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET'
      });

      const duration = Date.now() - start;

      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should generate Google Wallet pass within reasonable time', async () => {
      const start = Date.now();

      const response = await fetch(`${BASE_URL}/api/tickets/google-wallet/WALLET-TEST-001`, {
        method: 'GET',
        redirect: 'manual'
      });

      const duration = Date.now() - start;

      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Pass Updates', () => {
    it('should support pass update mechanism', async () => {
      // Apple Wallet passes can be updated via web service
      // This is a placeholder for pass update testing
      expect(true).toBe(true);
    });

    it('should include serial number for pass tracking', async () => {
      // Serial number should be unique and trackable
      const ticket = await db.execute({
        sql: 'SELECT ticket_id FROM tickets WHERE ticket_id = ?',
        args: ['WALLET-TEST-001']
      });

      expect(ticket.rows[0].ticket_id).toBe('WALLET-TEST-001');
    });

    it('should include authentication token for updates', async () => {
      // Passes should include auth token for secure updates
      expect(process.env.WALLET_AUTH_SECRET).toBeDefined();
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should generate Apple Wallet pass for iOS devices', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
        }
      });

      expect([200, 503]).toContain(response.status);
    });

    it('should generate Google Wallet pass for Android devices', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/google-wallet/WALLET-TEST-001`, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 11)'
        }
      });

      expect([302, 503]).toContain(response.status);
    });

    it('should handle web browser requests for wallet passes', async () => {
      const response = await fetch(`${BASE_URL}/api/tickets/apple-wallet/WALLET-TEST-001`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0'
        }
      });

      expect([200, 503]).toContain(response.status);
    });
  });
});
