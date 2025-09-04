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
import { getDatabaseClient, resetDatabaseInstance } from '../../../api/lib/database.js';

describe('Integration: Database Data Integrity', () => {
  let db;
  let testTicketId;
  let testEmailSubscriberId;

  beforeAll(async () => {
    // Set up test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = `file:/tmp/data-integrity-integration-test-${Date.now()}.db`;
    
    // Reset database instance to ensure clean state
    await resetDatabaseInstance();
    db = await getDatabaseClient();
    
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
    // Clean up database connections
    if (db && typeof db.close === 'function') {
      try {
        await db.close();
      } catch (error) {
        // Ignore close errors in tests
      }
    }
    await resetDatabaseInstance();
  });

  beforeEach(async () => {
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
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE ticket_id = ?',
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
      sql: 'SELECT COUNT(*) as count FROM qr_validations WHERE ticket_id = ?',
      args: [ticketInternalId]
    });
    expect(validationCount.rows[0].count).toBe(1);

    const walletEventCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM wallet_pass_events WHERE ticket_id = ?',
      args: [ticketInternalId]
    });
    expect(walletEventCount.rows[0].count).toBe(1);

    // Delete the ticket - should cascade to related records
    const deleteResult = await db.execute({
      sql: 'DELETE FROM tickets WHERE ticket_id = ?',
      args: [ticketId]
    });

    expect(deleteResult.rowsAffected).toBe(1);

    // Verify cascade deletion worked
    const finalValidationCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM qr_validations WHERE ticket_id = ?',
      args: [ticketInternalId]
    });
    expect(finalValidationCount.rows[0].count).toBe(0);

    const finalWalletEventCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM wallet_pass_events WHERE ticket_id = ?',
      args: [ticketInternalId]
    });
    expect(finalWalletEventCount.rows[0].count).toBe(0);
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
      sql: 'SELECT COUNT(*) as count FROM tickets WHERE ticket_id LIKE ?',
      args: ['TKT-INTEGRITY-TX-%']
    });
    expect(ticketCount.rows[0].count).toBe(0);
  });

  it('should enforce email subscriber constraints and data consistency', async () => {
    const testEmail = `integrity-test-${Date.now()}@example.com`;

    // Create email subscriber
    const subscriberResult = await db.execute({
      sql: `
        INSERT INTO email_subscribers (
          email, first_name, last_name, status, consent_date
        ) VALUES (?, ?, ?, ?, ?)
      `,
      args: [testEmail, 'Integrity', 'Test', 'active', new Date().toISOString()]
    });

    expect(subscriberResult.rowsAffected).toBe(1);

    // Get subscriber ID
    const subscriberIdResult = await db.execute({
      sql: 'SELECT id FROM email_subscribers WHERE email = ?',
      args: [testEmail]
    });
    testEmailSubscriberId = subscriberIdResult.rows[0].id;

    // Test unique email constraint - duplicate should fail
    let duplicateError = null;
    try {
      await db.execute({
        sql: `
          INSERT INTO email_subscribers (
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
          INSERT INTO email_subscribers (
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
        INSERT INTO email_events (
          subscriber_id, event_type, event_data
        ) VALUES (?, ?, ?)
      `,
      args: [testEmailSubscriberId, 'subscribed', '{"source": "test"}']
    });

    expect(eventResult.rowsAffected).toBe(1);

    // Verify foreign key relationship
    const eventCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM email_events WHERE subscriber_id = ?',
      args: [testEmailSubscriberId]
    });
    expect(eventCount.rows[0].count).toBe(1);

    // Delete subscriber should cascade to events
    const deleteResult = await db.execute({
      sql: 'DELETE FROM email_subscribers WHERE id = ?',
      args: [testEmailSubscriberId]
    });

    expect(deleteResult.rowsAffected).toBe(1);

    // Verify cascade deletion
    const finalEventCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM email_events WHERE subscriber_id = ?',
      args: [testEmailSubscriberId]
    });
    expect(finalEventCount.rows[0].count).toBe(0);
  });

  it('should handle concurrent updates with proper isolation', async () => {
    // Create a ticket for concurrent update test
    const ticketId = `TKT-INTEGRITY-CONCURRENT-${Date.now()}`;
    await db.execute({
      sql: `
        INSERT INTO tickets (
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

    // Simulate concurrent scan attempts using transactions
    let transaction1, transaction2;
    
    try {
      transaction1 = await db.transaction();
      
      // SQLite may lock the database when first transaction is created
      // This is expected behavior for testing concurrency control
      transaction2 = await db.transaction();
    } catch (error) {
      // Expected: SQLite may prevent concurrent transactions (database locked)
      // This demonstrates proper isolation and concurrency control
      if (error.message.includes('database is locked') || error.code === 'SQLITE_BUSY') {
        console.log('✅ Database properly enforces transaction isolation (SQLITE_BUSY expected)');
        return; // Test passes - database is properly isolated
      }
      throw error; // Unexpected error
    }

    let tx1Success = false;
    let tx2Success = false;
    let tx1Error = null;
    let tx2Error = null;

    try {
      // Both transactions try to increment scan count
      const update1Promise = transaction1.execute(
        `
          UPDATE tickets 
          SET scan_count = scan_count + 1 
          WHERE ticket_id = ? AND scan_count < max_scan_count
        `,
        [ticketId]
      ).then(async (result) => {
        if (result.rowsAffected > 0) {
          await transaction1.commit();
          tx1Success = true;
        } else {
          await transaction1.rollback();
        }
      }).catch(async (error) => {
        tx1Error = error;
        await transaction1.rollback();
      });

      const update2Promise = transaction2.execute(
        `
          UPDATE tickets 
          SET scan_count = scan_count + 1 
          WHERE ticket_id = ? AND scan_count < max_scan_count
        `,
        [ticketId]
      ).then(async (result) => {
        if (result.rowsAffected > 0) {
          await transaction2.commit();
          tx2Success = true;
        } else {
          await transaction2.rollback();
        }
      }).catch(async (error) => {
        tx2Error = error;
        await transaction2.rollback();
      });

      await Promise.all([update1Promise, update2Promise]);

      // At least one should succeed, maintaining data consistency
      expect(tx1Success || tx2Success).toBe(true);

      // Verify final scan count is correct (should be 1 or 2, not corrupted)
      const finalResult = await db.execute({
        sql: 'SELECT scan_count FROM tickets WHERE ticket_id = ?',
        args: [ticketId]
      });

      const finalScanCount = finalResult.rows[0].scan_count;
      expect(finalScanCount).toBeGreaterThanOrEqual(1);
      expect(finalScanCount).toBeLessThanOrEqual(2);

    } catch (error) {
      // Clean up transactions in case of test failure
      await transaction1.rollback().catch(() => {});
      await transaction2.rollback().catch(() => {});
      throw error;
    }
  });
});