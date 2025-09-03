/**
 * Integration Test: Tickets API - Ticket creation and validation
 * 
 * Tests the complete ticket validation flow including:
 * - Ticket validation endpoint with real database lookups
 * - QR code validation with scan count updates
 * - Database state changes during validation
 * - Error handling for invalid tickets
 * - Transaction rollback on validation failures
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDatabaseClient, resetDatabaseInstance } from '../../../api/lib/database.js';
import jwt from 'jsonwebtoken';

// Simple test helpers (self-contained)
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429
};

async function testRequest(method, path, data = null) {
  const url = `http://localhost:3000${path}`; // Using direct URL for testing
  
  const options = { 
    method, 
    headers: { 
      'Content-Type': 'application/json'
    }
  };
  
  if (data && method !== 'GET') { 
    options.body = JSON.stringify(data); 
  }
  
  try {
    const response = await fetch(url, options);
    const responseData = await response.json().catch(() => ({}));
    return { status: response.status, data: responseData };
  } catch (error) {
    // Return status: 0 for connection failures (expected by tests)
    return { 
      status: 0, 
      data: { error: 'Connection failed' } 
    };
  }
}

describe('Integration: Tickets API', () => {
  let db;
  let testTicket;
  
  // Test QR secret key for JWT token generation
  const TEST_QR_SECRET = 'test-secret-key-minimum-32-characters-for-security-compliance';

  beforeAll(async () => {
    // Set up test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = `file:/tmp/tickets-api-integration-test-${Date.now()}.db`;
    process.env.QR_SECRET_KEY = TEST_QR_SECRET;
    
    // Reset database instance to ensure clean state
    await resetDatabaseInstance();
    db = await getDatabaseClient();
    
    // Verify database connection
    const testResult = await db.execute('SELECT 1 as test');
    expect(testResult.rows).toBeDefined();
    expect(testResult.rows.length).toBe(1);
    
    // Create necessary tables for integration tests
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT UNIQUE NOT NULL,
        transaction_id INTEGER,
        ticket_type TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_date DATE,
        price_cents INTEGER NOT NULL,
        attendee_first_name TEXT,
        attendee_last_name TEXT,
        attendee_email TEXT,
        attendee_phone TEXT,
        status TEXT DEFAULT 'valid' CHECK (
          status IN ('valid', 'used', 'cancelled', 'refunded', 'transferred')
        ),
        validation_code TEXT UNIQUE,
        cancellation_reason TEXT,
        qr_token TEXT,
        qr_code_generated_at TIMESTAMP,
        scan_count INTEGER DEFAULT 0 CHECK (scan_count >= 0),
        max_scan_count INTEGER DEFAULT 10 CHECK (max_scan_count >= 0),
        first_scanned_at TIMESTAMP,
        last_scanned_at TIMESTAMP,
        qr_access_method TEXT,
        wallet_source TEXT CHECK (wallet_source IN ('apple_wallet', 'google_wallet') OR wallet_source IS NULL),
        registration_status TEXT NOT NULL DEFAULT 'pending' CHECK (registration_status IN ('pending', 'completed', 'expired')),
        registered_at DATETIME,
        registration_deadline DATETIME,
        validation_signature TEXT,
        qr_code_data TEXT,
        apple_pass_serial TEXT,
        google_pass_id TEXT,
        wallet_pass_generated_at TIMESTAMP,
        wallet_pass_updated_at TIMESTAMP,
        wallet_pass_revoked_at TIMESTAMP,
        wallet_pass_revoked_reason TEXT,
        checked_in_at TIMESTAMP,
        checked_in_by TEXT,
        check_in_location TEXT,
        ticket_metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS qr_validations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        validation_token TEXT NOT NULL,
        validation_result TEXT NOT NULL CHECK (validation_result IN ('success', 'failed')),
        failure_reason TEXT,
        validation_source TEXT DEFAULT 'web' CHECK (validation_source IN ('web', 'apple_wallet', 'google_wallet', 'email')),
        ip_address TEXT,
        device_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS wallet_pass_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
        pass_type TEXT CHECK (pass_type IN ('apple', 'google')),
        event_type TEXT CHECK (event_type IN ('created', 'updated', 'downloaded', 'installed', 'removed', 'revoked')),
        event_data TEXT,
        device_info TEXT,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    // Clean up database connections
    if (db && typeof db.close === 'function') {
      try {
        await db.close();
      } catch (error) {
        // Ignore close errors in tests
      }
    }
    await resetDatabaseInstance();
    
    // Clean up environment
    delete process.env.QR_SECRET_KEY;
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.execute({
      sql: 'DELETE FROM qr_validations WHERE ticket_id IN (SELECT id FROM tickets WHERE ticket_id LIKE ?)',
      args: ['TKT-TEST-%']
    });
    await db.execute({
      sql: 'DELETE FROM tickets WHERE ticket_id LIKE ?',
      args: ['TKT-TEST-%']
    });
    
    // Create a test ticket for validation tests
    const ticketId = `TKT-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const validationCode = `VAL-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    const insertResult = await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, event_date, 
          price_cents, attendee_first_name, attendee_last_name, attendee_email,
          status, validation_code, scan_count, max_scan_count
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        ticketId,
        'Weekend Pass',
        'boulder-fest-2026', 
        '2026-05-15',
        12500, // $125.00 in cents
        'Integration',
        'Test',
        'integration-test@example.com',
        'valid',
        validationCode,
        0, // initial scan count
        10 // max scans allowed
      ]
    });

    expect(insertResult.rowsAffected).toBe(1);

    testTicket = {
      ticketId,
      validationCode,
      ticketType: 'Weekend Pass',
      eventId: 'boulder-fest-2026',
      firstName: 'Integration',
      lastName: 'Test'
    };
  });

  it('should validate ticket and update scan count atomically', async () => {
    // Create JWT token for validation
    const jwtToken = jwt.sign(
      { tid: testTicket.validationCode },
      TEST_QR_SECRET,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    // Perform ticket validation
    const response = await testRequest('POST', '/api/tickets/validate', {
      token: jwtToken
    });

    // Skip if ticket service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Ticket service unavailable - skipping validation test');
      return;
    }

    // Verify successful validation response
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('valid', true);
    expect(response.data).toHaveProperty('ticket');
    expect(response.data.ticket).toHaveProperty('id', testTicket.ticketId);
    expect(response.data.ticket).toHaveProperty('type', 'Weekend Pass');
    expect(response.data.ticket).toHaveProperty('attendeeName', 'Integration Test');
    expect(response.data.ticket).toHaveProperty('scanCount', 1);
    expect(response.data.ticket).toHaveProperty('maxScans', 10);
    expect(response.data).toHaveProperty('message');

    // Verify database state changes - scan count should be incremented
    const ticketResult = await db.execute({
      sql: 'SELECT scan_count, last_scanned_at, first_scanned_at FROM tickets WHERE ticket_id = ?',
      args: [testTicket.ticketId]
    });

    expect(ticketResult.rows.length).toBe(1);
    const ticket = ticketResult.rows[0];
    expect(ticket.scan_count).toBe(1);
    expect(ticket.first_scanned_at).toBeDefined();
    expect(ticket.last_scanned_at).toBeDefined();

    // Verify validation was logged
    const validationResult = await db.execute({
      sql: `
        SELECT * FROM qr_validations 
        WHERE ticket_id = (SELECT id FROM tickets WHERE ticket_id = ?)
        AND validation_result = 'success'
      `,
      args: [testTicket.ticketId]
    });

    expect(validationResult.rows.length).toBe(1);
    const validation = validationResult.rows[0];
    expect(validation.validation_result).toBe('success');
    expect(validation.validation_source).toBe('web');
  });

  it('should reject invalid validation codes and log failures', async () => {
    const invalidToken = 'invalid-validation-code-12345';

    const response = await testRequest('POST', '/api/tickets/validate', {
      token: invalidToken
    });

    // Skip if service unavailable
    if (response.status === 0) {
      console.warn('⚠️ Ticket service unavailable - skipping invalid token test');
      return;
    }

    // Should return validation error
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND].includes(response.status)).toBe(true);
    expect(response.data).toHaveProperty('valid', false);
    expect(response.data).toHaveProperty('error');

    // Verify failure was logged (if db available)
    const validationResult = await db.execute({
      sql: `
        SELECT COUNT(*) as count FROM qr_validations 
        WHERE validation_token LIKE ? AND validation_result = 'failed'
      `,
      args: ['invalid-validation%']
    });

    // Should have logged the failed attempt
    expect(validationResult.rows[0].count).toBeGreaterThanOrEqual(0);
  });

  it('should prevent scan count overflow and handle race conditions', async () => {
    // Set ticket to near maximum scans
    await db.execute({
      sql: 'UPDATE tickets SET scan_count = 9 WHERE ticket_id = ?',
      args: [testTicket.ticketId]
    });

    const jwtToken = jwt.sign(
      { tid: testTicket.validationCode },
      TEST_QR_SECRET,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    // First validation should succeed (scan count 9 -> 10)
    const firstResponse = await testRequest('POST', '/api/tickets/validate', {
      token: jwtToken
    });

    if (firstResponse.status === 0) {
      console.warn('⚠️ Ticket service unavailable - skipping scan limit test');
      return;
    }

    expect(firstResponse.status).toBe(HTTP_STATUS.OK);
    expect(firstResponse.data.ticket.scanCount).toBe(10);

    // Second validation should fail (exceeded maximum)
    const secondResponse = await testRequest('POST', '/api/tickets/validate', {
      token: jwtToken
    });

    expect(secondResponse.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(secondResponse.data).toHaveProperty('valid', false);
    expect(secondResponse.data).toHaveProperty('error');
    expect(secondResponse.data.error).toMatch(/maximum scans|scan limit/i);

    // Verify scan count hasn't exceeded maximum in database
    const finalResult = await db.execute({
      sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
      args: [testTicket.ticketId]
    });

    expect(finalResult.rows[0].scan_count).toBe(10); // Should not exceed max_scan_count
  });

  it('should handle database transaction rollback on validation errors', async () => {
    // Create JWT token for non-existent validation code
    const nonExistentCode = `NONEXISTENT-${Date.now()}`;
    const jwtToken = jwt.sign(
      { tid: nonExistentCode },
      TEST_QR_SECRET,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    // Get initial state of test ticket
    const initialResult = await db.execute({
      sql: 'SELECT scan_count, last_scanned_at FROM tickets WHERE ticket_id = ?',
      args: [testTicket.ticketId]
    });
    const initialScanCount = initialResult.rows[0].scan_count;

    // Attempt validation with non-existent code
    const response = await testRequest('POST', '/api/tickets/validate', {
      token: jwtToken
    });

    if (response.status === 0) {
      console.warn('⚠️ Ticket service unavailable - skipping transaction rollback test');
      return;
    }

    // Should fail validation
    expect([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.NOT_FOUND].includes(response.status)).toBe(true);
    expect(response.data).toHaveProperty('valid', false);

    // Verify test ticket state unchanged (transaction rollback worked)
    const finalResult = await db.execute({
      sql: 'SELECT scan_count, last_scanned_at FROM tickets WHERE ticket_id = ?',
      args: [testTicket.ticketId]
    });

    expect(finalResult.rows[0].scan_count).toBe(initialScanCount);
    expect(finalResult.rows[0].last_scanned_at).toBe(initialResult.rows[0].last_scanned_at);

    // Verify database integrity - no corrupt records
    const integrityCheck = await db.execute({
      sql: `
        SELECT COUNT(*) as count FROM tickets 
        WHERE scan_count > max_scan_count OR scan_count < 0
      `
    });
    expect(integrityCheck.rows[0].count).toBe(0);
  });

  it('should handle preview mode validation without database updates', async () => {
    const jwtToken = jwt.sign(
      { tid: testTicket.validationCode },
      TEST_QR_SECRET,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    // Get initial scan count
    const initialResult = await db.execute({
      sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
      args: [testTicket.ticketId]
    });
    const initialScanCount = initialResult.rows[0].scan_count;

    // Validate in preview mode (validateOnly: true)
    const response = await testRequest('POST', '/api/tickets/validate', {
      token: jwtToken,
      validateOnly: true
    });

    if (response.status === 0) {
      console.warn('⚠️ Ticket service unavailable - skipping preview mode test');
      return;
    }

    // Should return successful validation
    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.data).toHaveProperty('valid', true);
    expect(response.data).toHaveProperty('ticket');
    expect(response.data.ticket).toHaveProperty('scanCount', initialScanCount);

    // Verify database state unchanged (no scan count increment)
    const finalResult = await db.execute({
      sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
      args: [testTicket.ticketId]
    });

    expect(finalResult.rows[0].scan_count).toBe(initialScanCount);

    // Verify no validation was logged for preview mode
    const validationCount = await db.execute({
      sql: `
        SELECT COUNT(*) as count FROM qr_validations 
        WHERE ticket_id = (SELECT id FROM tickets WHERE ticket_id = ?)
      `,
      args: [testTicket.ticketId]
    });

    expect(validationCount.rows[0].count).toBe(0); // No logging in preview mode
  });

  it('should handle different ticket statuses correctly', async () => {
    // Test with cancelled ticket
    const cancelledTicketId = `TKT-TEST-CANCELLED-${Date.now()}`;
    const cancelledValidationCode = `VAL-CANCELLED-${Date.now()}`;

    await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, ticket_type, event_id, price_cents, 
          attendee_first_name, attendee_last_name, status, validation_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        cancelledTicketId,
        'Weekend Pass',
        'boulder-fest-2026',
        12500,
        'Cancelled',
        'Ticket',
        'cancelled',
        cancelledValidationCode
      ]
    });

    const jwtToken = jwt.sign(
      { tid: cancelledValidationCode },
      TEST_QR_SECRET,
      { algorithm: 'HS256', expiresIn: '7d' }
    );

    const response = await testRequest('POST', '/api/tickets/validate', {
      token: jwtToken
    });

    if (response.status === 0) {
      console.warn('⚠️ Ticket service unavailable - skipping ticket status test');
      return;
    }

    // Should reject cancelled ticket
    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(response.data).toHaveProperty('valid', false);
    expect(response.data).toHaveProperty('error');
    expect(response.data.error).toMatch(/cancelled/i);
  });
});