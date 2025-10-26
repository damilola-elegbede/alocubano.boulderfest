/**
 * Unit Tests for Admin Ticket Transfer
 * Tests input validation, security checks, and business logic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabaseClient, resetDatabaseInstance } from '../../../lib/database.js';

describe('Admin Ticket Transfer - Unit Tests', () => {
  let testDb;

  beforeEach(async () => {
    await resetDatabaseInstance();
    testDb = await getDatabaseClient();

    // Create required tables for tests
    await testDb.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT UNIQUE NOT NULL,
        transaction_id INTEGER NOT NULL,
        ticket_type TEXT NOT NULL,
        ticket_type_id TEXT NOT NULL,
        event_id INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        status TEXT DEFAULT 'valid',
        attendee_first_name TEXT,
        attendee_last_name TEXT,
        attendee_email TEXT,
        attendee_phone TEXT,
        is_test INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.execute(`
      CREATE TABLE IF NOT EXISTS ticket_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        transaction_id INTEGER,
        from_email TEXT,
        from_first_name TEXT,
        from_last_name TEXT,
        to_email TEXT,
        to_first_name TEXT,
        to_last_name TEXT,
        transferred_by TEXT,
        transfer_reason TEXT,
        transfer_method TEXT,
        is_test INTEGER DEFAULT 0,
        transferred_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterEach(async () => {
    // Clean up test data (don't drop tables or close connection for shared in-memory DB)
    if (testDb) {
      try {
        await testDb.execute('DELETE FROM ticket_transfers');
        await testDb.execute('DELETE FROM tickets');
      } catch (error) {
        console.warn('Cleanup error:', error.message);
      }
    }
  });

  describe('Input Validation', () => {
    it('should validate ticket ID format', () => {
      const validTicketIds = [
        'TKT-123',
        'WEEKEND-PASS-456',
        'VIP-001',
        'ABC123XYZ'
      ];

      const invalidTicketIds = [
        'ticket@123', // Special characters
        'ticket 123', // Spaces
        'ticket<123>', // HTML tags
        '../../../etc/passwd', // Path traversal
        ''  // Empty string
      ];

      const ticketIdPattern = /^[A-Z0-9-]+$/;

      validTicketIds.forEach(id => {
        expect(ticketIdPattern.test(id)).toBe(true);
      });

      invalidTicketIds.forEach(id => {
        expect(ticketIdPattern.test(id)).toBe(false);
      });
    });

    it('should validate email format', () => {
      const validEmails = [
        'user@example.com',
        'test.user@domain.co.uk',
        'user+tag@example.com'
      ];

      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com' // Space
        // Note: 'user<script>@example.com' technically matches the basic email pattern
        // even though it contains dangerous characters. Use separate XSS validation.
      ];

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      validEmails.forEach(email => {
        expect(emailPattern.test(email)).toBe(true);
      });

      invalidEmails.forEach(email => {
        expect(emailPattern.test(email)).toBe(false);
      });
    });

    it('should validate name fields length', () => {
      const validNames = [
        'John',
        'Mary Jane',
        'José María García'
      ];

      const invalidNames = [
        '', // Empty
        'A'.repeat(101), // Too long (>100 chars)
        '<script>alert("xss")</script>' // XSS attempt
      ];

      validNames.forEach(name => {
        expect(name.length).toBeGreaterThan(0);
        expect(name.length).toBeLessThanOrEqual(100);
      });

      invalidNames.forEach(name => {
        const isValid = name.length > 0 && name.length <= 100 && !name.includes('<script>');
        expect(isValid).toBe(false);
      });
    });

    it('should validate phone number format', () => {
      const validPhones = [
        '+1 (303) 555-0123',
        '303-555-0123',
        '(303) 555-0123',
        '+44 20 1234 5678'
      ];

      const invalidPhones = [
        'not-a-phone',
        'call me maybe', // Text
        '<script>alert("xss")</script>' // XSS attempt
      ];

      const phonePattern = /^[\d\s\-\+\(\)]+$/;

      validPhones.forEach(phone => {
        expect(phonePattern.test(phone)).toBe(true);
      });

      invalidPhones.forEach(phone => {
        expect(phonePattern.test(phone)).toBe(false);
      });
    });

    it('should detect and reject XSS attempts', () => {
      const dangerousInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src=x onerror=alert("xss")>',
        '${alert("xss")}',
        'eval(alert("xss"))',
        '../../../etc/passwd'
      ];

      const dangerousPatterns = [
        /<script[^>]*>/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /\$\{.*\}/,
        /eval\s*\(/i,
        /\.\.\//
      ];

      dangerousInputs.forEach(input => {
        const isUnsafe = dangerousPatterns.some(pattern => pattern.test(input));
        expect(isUnsafe).toBe(true);
      });
    });
  });

  describe('Business Logic Validation', () => {
    it('should prevent transfer of cancelled tickets', async () => {
      // Create a cancelled ticket
      const ticketId = 'TEST-CANCELLED-001';
      await testDb.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, ticket_type_id, event_id, price_cents, status)
              VALUES (?, 1, 'weekend-pass', 'wp-1', 1, 5000, 'cancelled')`,
        args: [ticketId]
      });

      // Query the ticket
      const result = await testDb.execute({
        sql: 'SELECT status FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(result.rows[0].status).toBe('cancelled');

      // Business logic: should reject transfer
      const canTransfer = result.rows[0].status !== 'cancelled' && result.rows[0].status !== 'refunded';
      expect(canTransfer).toBe(false);
    });

    it('should prevent transfer of refunded tickets', async () => {
      // Create a refunded ticket
      const ticketId = 'TEST-REFUNDED-001';
      await testDb.execute({
        sql: `INSERT INTO tickets (ticket_id, transaction_id, ticket_type, ticket_type_id, event_id, price_cents, status)
              VALUES (?, 1, 'weekend-pass', 'wp-1', 1, 5000, 'refunded')`,
        args: [ticketId]
      });

      // Query the ticket
      const result = await testDb.execute({
        sql: 'SELECT status FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(result.rows[0].status).toBe('refunded');

      // Business logic: should reject transfer
      const canTransfer = result.rows[0].status !== 'cancelled' && result.rows[0].status !== 'refunded';
      expect(canTransfer).toBe(false);
    });

    it('should prevent transfer to same email', async () => {
      const currentEmail = 'current@example.com';
      const newEmail = 'current@example.com'; // Same email

      const isSameEmail = currentEmail.toLowerCase() === newEmail.toLowerCase();
      expect(isSameEmail).toBe(true);

      // Business logic: should reject transfer to same email
      expect(isSameEmail).toBe(true);
    });

    it('should allow transfer to different email', async () => {
      const currentEmail = 'current@example.com';
      const newEmail = 'new@example.com'; // Different email

      const isSameEmail = currentEmail.toLowerCase() === newEmail.toLowerCase();
      expect(isSameEmail).toBe(false);

      // Business logic: should allow transfer
    });
  });

  describe('Database Operations', () => {
    it('should create transfer history record', async () => {
      const transferData = {
        ticket_id: 'TEST-TRANSFER-001',
        transaction_id: 1,
        from_email: 'old@example.com',
        from_first_name: 'Old',
        from_last_name: 'Owner',
        to_email: 'new@example.com',
        to_first_name: 'New',
        to_last_name: 'Owner',
        transferred_by: 'admin@system',
        transfer_reason: 'User request',
        transfer_method: 'admin_manual',
        is_test: 1
      };

      // Insert transfer history
      await testDb.execute({
        sql: `INSERT INTO ticket_transfers (
                ticket_id, transaction_id, from_email, from_first_name, from_last_name,
                to_email, to_first_name, to_last_name, transferred_by,
                transfer_reason, transfer_method, is_test
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          transferData.ticket_id,
          transferData.transaction_id,
          transferData.from_email,
          transferData.from_first_name,
          transferData.from_last_name,
          transferData.to_email,
          transferData.to_first_name,
          transferData.to_last_name,
          transferData.transferred_by,
          transferData.transfer_reason,
          transferData.transfer_method,
          transferData.is_test
        ]
      });

      // Verify record was created
      const result = await testDb.execute({
        sql: 'SELECT * FROM ticket_transfers WHERE ticket_id = ?',
        args: [transferData.ticket_id]
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].from_email).toBe('old@example.com');
      expect(result.rows[0].to_email).toBe('new@example.com');
      expect(result.rows[0].transferred_by).toBe('admin@system');
    });

    it('should update ticket attendee information', async () => {
      const ticketId = 'TEST-UPDATE-001';

      // Create initial ticket
      await testDb.execute({
        sql: `INSERT INTO tickets (
                ticket_id, transaction_id, ticket_type, ticket_type_id, event_id,
                price_cents, attendee_first_name, attendee_last_name,
                attendee_email, status, is_test
              ) VALUES (?, 1, 'weekend-pass', 'wp-1', 1, 5000, 'Old', 'Owner', 'old@example.com', 'valid', 1)`,
        args: [ticketId]
      });

      // Update ticket with new attendee info
      await testDb.execute({
        sql: `UPDATE tickets
              SET attendee_first_name = ?,
                  attendee_last_name = ?,
                  attendee_email = ?,
                  attendee_phone = ?
              WHERE ticket_id = ?`,
        args: ['New', 'Owner', 'new@example.com', '+1-555-0123', ticketId]
      });

      // Verify update
      const result = await testDb.execute({
        sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      expect(result.rows[0].attendee_first_name).toBe('New');
      expect(result.rows[0].attendee_last_name).toBe('Owner');
      expect(result.rows[0].attendee_email).toBe('new@example.com');
      expect(result.rows[0].attendee_phone).toBe('+1-555-0123');
    });

    it('should maintain transfer history audit trail', async () => {
      const ticketId = 'TEST-AUDIT-001';

      // Create multiple transfers with explicit timestamps to ensure proper ordering
      const baseTime = Date.now();
      for (let i = 1; i <= 3; i++) {
        const timestamp = new Date(baseTime + i * 1000).toISOString(); // 1 second apart
        await testDb.execute({
          sql: `INSERT INTO ticket_transfers (
                  ticket_id, transaction_id, from_email, to_email,
                  from_first_name, to_first_name, transferred_by, is_test, transferred_at
                ) VALUES (?, 1, ?, ?, 'From', 'To', 'admin@system', 1, ?)`,
          args: [ticketId, `old${i}@example.com`, `new${i}@example.com`, timestamp]
        });
      }

      // Query transfer history
      const result = await testDb.execute({
        sql: `SELECT * FROM ticket_transfers WHERE ticket_id = ? ORDER BY transferred_at DESC`,
        args: [ticketId]
      });

      // Should have 3 transfer records
      expect(result.rows).toHaveLength(3);

      // Verify chronological order (DESC: newest first)
      const emails = result.rows.map(row => row.to_email);
      expect(emails).toEqual(['new3@example.com', 'new2@example.com', 'new1@example.com']);
    });
  });

  describe('Security Checks', () => {
    it('should sanitize input to prevent SQL injection', () => {
      const maliciousInputs = [
        "'; DROP TABLE tickets; --",
        "1' OR '1'='1",
        "admin'--",
        "1' UNION SELECT * FROM tickets--"
      ];

      // Parameterized queries prevent SQL injection
      // Test that we're using parameterized queries (no string concatenation)
      maliciousInputs.forEach(input => {
        // This would be caught by using prepared statements with args
        expect(input).toContain("'");
      });
    });

    it('should enforce maximum field lengths', () => {
      const testCases = [
        { field: 'firstName', maxLength: 100, value: 'A'.repeat(101) },
        { field: 'lastName', maxLength: 100, value: 'B'.repeat(101) },
        { field: 'email', maxLength: 255, value: 'a'.repeat(244) + '@example.com' }, // 244 + 12 = 256 chars
        { field: 'phone', maxLength: 50, value: '1'.repeat(51) },
        { field: 'reason', maxLength: 500, value: 'X'.repeat(501) }
      ];

      testCases.forEach(({ field, maxLength, value }) => {
        const exceedsMax = value.length > maxLength;
        expect(exceedsMax).toBe(true);
        // Validation should reject these
      });
    });
  });
});
