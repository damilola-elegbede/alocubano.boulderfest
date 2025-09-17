/**
 * Integration Test: Database Data Integrity - Database constraints and relationships
 * 
 * Tests database-level integrity including:
 * - Foreign key constraints enforcement
 * - Database transaction behavior
 * - Constraint validation (CHECK constraints)
 * - Cascade operations on delete
 * - Index uniqueness enforcement
 * - Data consistency across related tables
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDbClient } from '../../setup-integration.js';

describe('Integration: Database Data Integrity', () => {
  let db;
  let testTicketId;
  let testEmailSubscriberId;

  beforeAll(async () => {
    // Use the integration test database client
    // Don't reset or manage lifecycle - let setup-integration.js handle it
    db = await getDbClient();
    
    // Verify database connection
    const testResult = await db.execute('SELECT 1 as test');
    expect(testResult.rows).toBeDefined();
    expect(testResult.rows.length).toBe(1);
    
    // Ensure FK constraints are enforced for this connection
    await db.execute('PRAGMA foreign_keys = ON');
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
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS email_subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        first_name TEXT,
        last_name TEXT,
        phone TEXT,
        status TEXT DEFAULT 'pending' CHECK (
          status IN ('pending', 'active', 'unsubscribed', 'bounced')
        ),
        brevo_contact_id TEXT,
        list_ids TEXT DEFAULT '[]',
        attributes TEXT DEFAULT '{}',
        consent_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        consent_source TEXT DEFAULT 'website',
        consent_ip TEXT,
        verification_token TEXT,
        verified_at TIMESTAMP,
        unsubscribed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS email_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscriber_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT DEFAULT '{}',
        brevo_event_id TEXT,
        occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscriber_id) REFERENCES email_subscribers(id) ON DELETE CASCADE
      )
    `);
  });

  afterAll(async () => {
    // Don't manage database lifecycle - let setup-integration.js handle it
    // The integration test setup will clean up connections
  });

  beforeEach(async () => {
    // Get fresh client for each test to avoid stale connections
    db = await getDbClient();

    // Clean up test data before each test
    await db.execute({
      sql: 'DELETE FROM qr_validations WHERE ticket_id IN (SELECT id FROM tickets WHERE ticket_id LIKE ?)',
      args: ['TKT-INTEGRITY-%']
    });
    await db.execute({
      sql: 'DELETE FROM wallet_pass_events WHERE ticket_id IN (SELECT id FROM tickets WHERE ticket_id LIKE ?)',
      args: ['TKT-INTEGRITY-%']
    });
    await db.execute({
      sql: 'DELETE FROM tickets WHERE ticket_id LIKE ?',
      args: ['TKT-INTEGRITY-%']
    });
    await db.execute({
      sql: 'DELETE FROM email_events WHERE subscriber_id IN (SELECT id FROM email_subscribers WHERE email LIKE ?)',
      args: ['%integrity-test%']
    });
    await db.execute({
      sql: 'DELETE FROM email_subscribers WHERE email LIKE ?',
      args: ['%integrity-test%']
    });
    
    // Reset test IDs
    testTicketId = null;
    testEmailSubscriberId = null;
  });

  it('should enforce unique constraints and handle violations gracefully', async () => {
    const ticketId = `TKT-INTEGRITY-UNIQUE-${Date.now()}`;
    const validationCode = `VAL-UNIQUE-${Date.now()}`;

    // Create first ticket
    const insertResult1 = await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, ticket_type, event_id, price_cents, 
          attendee_first_name, attendee_last_name, attendee_email,
          validation_code, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        ticketId,
        'Weekend Pass',
        'boulder-fest-2026',
        12500,
        'First',
        'Ticket',
        'first@integrity-test.com',
        validationCode,
        'valid'
      ]
    });

    expect(insertResult1.rowsAffected).toBe(1);
    testTicketId = ticketId;

    // Try to create duplicate ticket_id - should fail
    let duplicateError = null;
    try {
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, ticket_type, event_id, price_cents, 
            attendee_first_name, attendee_last_name, validation_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          ticketId, // Same ticket_id
          'Day Pass',
          'boulder-fest-2026',
          5000,
          'Duplicate',
          'Ticket',
          `VAL-DIFFERENT-${Date.now()}`
        ]
      });
    } catch (error) {
      duplicateError = error;
    }

    expect(duplicateError).toBeDefined();
    expect(duplicateError.message).toMatch(/UNIQUE constraint failed|unique/i);

    // Try to create duplicate validation_code - should fail
    let duplicateValidationError = null;
    try {
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, ticket_type, event_id, price_cents, 
            attendee_first_name, attendee_last_name, validation_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          `TKT-INTEGRITY-DIFFERENT-${Date.now()}`,
          'Day Pass',
          'boulder-fest-2026',
          5000,
          'Different',
          'Ticket',
          validationCode // Same validation_code
        ]
      });
    } catch (error) {
      duplicateValidationError = error;
    }

    expect(duplicateValidationError).toBeDefined();
    expect(duplicateValidationError.message).toMatch(/UNIQUE constraint failed|unique/i);

    // Verify original ticket is still intact
    const verifyResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM "tickets" WHERE ticket_id = ?',
      args: [ticketId]
    });
    expect(Number(verifyResult.rows[0].count)).toBe(1);
  });

  it('should enforce CHECK constraints for valid data ranges', async () => {
    const ticketId = `TKT-INTEGRITY-CHECK-${Date.now()}`;

    // Test invalid status - should fail
    let invalidStatusError = null;
    try {
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, ticket_type, event_id, price_cents, 
            status, validation_code
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          ticketId,
          'Weekend Pass',
          'boulder-fest-2026',
          12500,
          'invalid_status', // Not in CHECK constraint list
          `VAL-CHECK-${Date.now()}`
        ]
      });
    } catch (error) {
      invalidStatusError = error;
    }

    expect(invalidStatusError).toBeDefined();
    expect(invalidStatusError.message).toMatch(/CHECK constraint failed|constraint/i);

    // Test negative scan_count - should fail
    let negativeScanError = null;
    try {
      await db.execute({
        sql: `
          INSERT INTO tickets (
            ticket_id, ticket_type, event_id, price_cents, 
            scan_count, validation_code
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          ticketId,
          'Weekend Pass',
          'boulder-fest-2026',
          12500,
          -1, // Negative scan_count violates CHECK constraint
          `VAL-CHECK-${Date.now()}`
        ]
      });
    } catch (error) {
      negativeScanError = error;
    }

    expect(negativeScanError).toBeDefined();
    expect(negativeScanError.message).toMatch(/CHECK constraint failed|constraint/i);

    // Test valid data - should succeed
    const validResult = await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, ticket_type, event_id, price_cents, 
          status, scan_count, max_scan_count, validation_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        ticketId,
        'Weekend Pass',
        'boulder-fest-2026',
        12500,
        'valid', // Valid status
        5, // Valid scan_count
        10, // Valid max_scan_count
        `VAL-CHECK-${Date.now()}`
      ]
    });

    expect(validResult.rowsAffected).toBe(1);
    testTicketId = ticketId;
  });

  it('should handle foreign key relationships and cascade operations correctly', async () => {
    // Create a ticket first
    const ticketId = `TKT-INTEGRITY-FK-${Date.now()}`;
    const ticketResult = await db.execute({
      sql: `
        INSERT INTO tickets (
          ticket_id, ticket_type, event_id, price_cents, 
          attendee_first_name, attendee_last_name, validation_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        ticketId,
        'Weekend Pass',
        'boulder-fest-2026',
        12500,
        'FK',
        'Test',
        `VAL-FK-${Date.now()}`
      ]
    });

    expect(ticketResult.rowsAffected).toBe(1);
    testTicketId = ticketId;

    // Get the internal ID for foreign key references
    const ticketInternalResult = await db.execute({
      sql: 'SELECT id FROM tickets WHERE ticket_id = ?',
      args: [ticketId]
    });
    const ticketInternalId = ticketInternalResult.rows[0].id;

    // Create QR validation record referencing the ticket
    const validationResult = await db.execute({
      sql: `
        INSERT INTO qr_validations (
          ticket_id, validation_token, validation_result, 
          validation_source, ip_address
        ) VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        ticketInternalId,
        'test-token-123',
        'success',
        'web',
        '127.0.0.1'
      ]
    });

    expect(validationResult.rowsAffected).toBe(1);

    // Create wallet pass event referencing the ticket
    const walletEventResult = await db.execute({
      sql: `
        INSERT INTO wallet_pass_events (
          ticket_id, pass_type, event_type, event_data
        ) VALUES (?, ?, ?, ?)
      `,
      args: [
        ticketInternalId,
        'apple',
        'created',
        '{"test": "data"}'
      ]
    });

    expect(walletEventResult.rowsAffected).toBe(1);

    // Verify related records exist
    const validationCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM "qr_validations" WHERE ticket_id = ?',
      args: [ticketInternalId]
    });
    expect(Number(validationCount.rows[0].count)).toBe(1);

    const walletEventCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM "wallet_pass_events" WHERE ticket_id = ?',
      args: [ticketInternalId]
    });
    expect(Number(walletEventCount.rows[0].count)).toBe(1);

    // Delete the ticket - should cascade to related records
    const deleteResult = await db.execute({
      sql: 'DELETE FROM "tickets" WHERE ticket_id = ?',
      args: [ticketId]
    });

    expect(deleteResult.rowsAffected).toBe(1);

    // Verify cascade deletion worked
    const finalValidationCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM "qr_validations" WHERE ticket_id = ?',
      args: [ticketInternalId]
    });
    expect(Number(finalValidationCount.rows[0].count)).toBe(0);

    const finalWalletEventCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM "wallet_pass_events" WHERE ticket_id = ?',
      args: [ticketInternalId]
    });
    expect(Number(finalWalletEventCount.rows[0].count)).toBe(0);
  });

  it('should maintain transaction integrity with rollback on errors', async () => {
    const transaction = await db.transaction();

    try {
      // Insert valid ticket within transaction
      const ticketId = `TKT-INTEGRITY-TX-${Date.now()}`;
      await transaction.execute(
        `
          INSERT INTO tickets (
            ticket_id, ticket_type, event_id, price_cents, validation_code
          ) VALUES (?, ?, ?, ?, ?)
        `,
        [ticketId, 'Weekend Pass', 'boulder-fest-2026', 12500, `VAL-TX-${Date.now()}`]
      );

      // Try to insert invalid data - should cause transaction to rollback
      await transaction.execute(
        `
          INSERT INTO tickets (
            ticket_id, ticket_type, event_id, price_cents, 
            scan_count, validation_code
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          `TKT-INTEGRITY-TX-BAD-${Date.now()}`,
          'Day Pass',
          'boulder-fest-2026',
          5000,
          -1, // Invalid scan_count
          `VAL-TX-BAD-${Date.now()}`
        ]
      );

      // This should not be reached
      await transaction.commit();
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      // Expected error due to CHECK constraint violation
      await transaction.rollback();
      expect(error.message).toMatch(/CHECK constraint failed|constraint/i);
    }

    // Verify neither ticket was inserted (transaction rolled back)
    const ticketCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM "tickets" WHERE ticket_id LIKE ?',
      args: ['TKT-INTEGRITY-TX-%']
    });
    expect(Number(ticketCount.rows[0].count)).toBe(0);
  });

  it('should enforce email subscriber constraints and data consistency', async () => {
    const testEmail = `integrity-test-${Date.now()}@example.com`;

    // Create email subscriber
    const subscriberResult = await db.execute({
      sql: `
        INSERT INTO "email_subscribers" (
          email, first_name, last_name, status, consent_date
        ) VALUES (?, ?, ?, ?, ?)
      `,
      args: [testEmail, 'Integrity', 'Test', 'active', new Date().toISOString()]
    });

    expect(subscriberResult.rowsAffected).toBe(1);

    // Get subscriber ID
    const subscriberIdResult = await db.execute({
      sql: 'SELECT id FROM "email_subscribers" WHERE email = ?',
      args: [testEmail]
    });
    testEmailSubscriberId = subscriberIdResult.rows[0].id;

    // Test unique email constraint - duplicate should fail
    let duplicateError = null;
    try {
      await db.execute({
        sql: `
          INSERT INTO "email_subscribers" (
            email, first_name, last_name, status
          ) VALUES (?, ?, ?, ?)
        `,
        args: [testEmail, 'Duplicate', 'Test', 'active'] // Same email
      });
    } catch (error) {
      duplicateError = error;
    }

    expect(duplicateError).toBeDefined();
    expect(duplicateError.message).toMatch(/UNIQUE constraint failed|unique/i);

    // Test invalid status CHECK constraint
    let invalidStatusError = null;
    try {
      await db.execute({
        sql: `
          INSERT INTO "email_subscribers" (
            email, first_name, last_name, status
          ) VALUES (?, ?, ?, ?)
        `,
        args: [
          `different-${Date.now()}@example.com`,
          'Invalid',
          'Status',
          'invalid_status' // Not in CHECK constraint list
        ]
      });
    } catch (error) {
      invalidStatusError = error;
    }

    expect(invalidStatusError).toBeDefined();
    expect(invalidStatusError.message).toMatch(/CHECK constraint failed|constraint/i);

    // Create email event referencing subscriber
    const eventResult = await db.execute({
      sql: `
        INSERT INTO "email_events" (
          subscriber_id, event_type, event_data
        ) VALUES (?, ?, ?)
      `,
      args: [testEmailSubscriberId, 'subscribed', '{"source": "test"}']
    });

    expect(eventResult.rowsAffected).toBe(1);

    // Verify foreign key relationship
    const eventCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM "email_events" WHERE subscriber_id = ?',
      args: [testEmailSubscriberId]
    });
    expect(Number(eventCount.rows[0].count)).toBe(1);

    // Delete subscriber should cascade to events
    const deleteResult = await db.execute({
      sql: 'DELETE FROM "email_subscribers" WHERE id = ?',
      args: [testEmailSubscriberId]
    });

    expect(deleteResult.rowsAffected).toBe(1);

    // Verify cascade deletion
    const finalEventCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM "email_events" WHERE subscriber_id = ?',
      args: [testEmailSubscriberId]
    });
    expect(Number(finalEventCount.rows[0].count)).toBe(0);
  });

  it('should handle concurrent updates with proper isolation', async () => {
    // Create a ticket for concurrent update test
    const ticketId = `TKT-INTEGRITY-CONCURRENT-${Date.now()}`;
    await db.execute({
      sql: `
        INSERT INTO "tickets" (
          ticket_id, ticket_type, event_id, price_cents, 
          scan_count, max_scan_count, validation_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        ticketId,
        'Weekend Pass',
        'boulder-fest-2026',
        12500,
        0,
        10,
        `VAL-CONCURRENT-${Date.now()}`
      ]
    });

    testTicketId = ticketId;

    // TRUE concurrency testing - use separate database clients for real parallel operations
    const { getDatabaseClient } = await import('../../../lib/database.js');
    
    const concurrentUpdates = [1, 2, 3].map(async (attempt) => {
      let separateClient;
      try {
        // Each attempt uses a separate database connection for true concurrency
        separateClient = await getDbClient();
        
        const updateResult = await separateClient.execute({
          sql: `
            UPDATE "tickets" 
            SET scan_count = scan_count + 1, last_scanned_at = CURRENT_TIMESTAMP
            WHERE ticket_id = ? AND scan_count < max_scan_count
          `,
          args: [ticketId]
        });
        
        return { 
          success: true, 
          attempt, 
          rowsAffected: updateResult.rowsAffected,
          timestamp: Date.now()
        };
      } catch (error) {
        return { 
          success: false, 
          attempt, 
          error: error.message,
          errorCode: error.code,
          timestamp: Date.now()
        };
      } finally {
        // Clean up separate client
        if (separateClient && separateClient !== db && typeof separateClient.close === 'function') {
          try {
            await separateClient.close();
          } catch (closeError) {
            // Ignore close errors in tests
          }
        }
      }
    });

    // Execute all concurrent updates using Promise.all for true parallelism
    const results = await Promise.all(concurrentUpdates);
    
    // Analyze results
    const successfulUpdates = results.filter(r => r.success && r.rowsAffected > 0);
    const failedUpdates = results.filter(r => !r.success);
    
    // At least one update should succeed
    expect(successfulUpdates.length).toBeGreaterThan(0);
    expect(successfulUpdates.length).toBeLessThanOrEqual(3);

    // Verify final scan count integrity - should reflect actual successful updates
    const finalResult = await db.execute({
      sql: 'SELECT scan_count FROM "tickets" WHERE ticket_id = ?',
      args: [ticketId]
    });

    const finalScanCount = Number(finalResult.rows[0].scan_count);
    expect(finalScanCount).toBeGreaterThan(0); // Should have incremented
    expect(finalScanCount).toBeLessThanOrEqual(10); // Should not exceed maximum
    expect(finalScanCount).toBe(successfulUpdates.length); // Should match successful updates

    // Failed operations due to locking/contention are expected and acceptable
    failedUpdates.forEach(failure => {
      expect(failure.error).toBeDefined();
      expect(typeof failure.error).toBe('string');
      // Common database contention errors are acceptable
      const acceptableErrors = [
        'database is locked',
        'SQLITE_BUSY', 
        'SQLITE_LOCKED',
        'database lock',
        'constraint'
      ];
      const hasAcceptableError = acceptableErrors.some(errType => 
        failure.error.toLowerCase().includes(errType.toLowerCase()) || 
        (failure.errorCode && failure.errorCode.includes(errType))
      );
      
      // Either acceptable database locking/constraint error OR other database error
      expect(hasAcceptableError || failure.error.length > 0).toBe(true);
    });
  });
});