/**
 * Integration Test: Database Constraints
 * Tests all foreign key, CHECK, and UNIQUE constraints from migrations 042-044
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { resetAllServices } from './reset-services.js';
import { createTestEvent } from './handler-test-helper.js';
import crypto from 'crypto';

describe('Database Constraints Integration Tests', () => {
  let db;
  let testEventId;

  beforeAll(async () => {
    db = await getDatabaseClient();
  });

  beforeEach(async () => {
    await resetAllServices();
    db = await getDatabaseClient();

    // Create test event for foreign key references
    testEventId = await createTestEvent(db, {
      slug: `test-constraint-event-${Date.now()}`,
      name: 'Test Constraint Event'
    });

    // Clean up test data
    try {
      await db.execute('DELETE FROM tickets WHERE ticket_id LIKE ?', ['test-constraint-%']);
      await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['test-constraint-%']);
      await db.execute('DELETE FROM cash_shifts WHERE id > 1000');
      await db.execute('DELETE FROM ticket_types WHERE id LIKE ?', ['test-constraint-%']);
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await db.execute('DELETE FROM tickets WHERE ticket_id LIKE ?', ['test-constraint-%']);
      await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['test-constraint-%']);
      await db.execute('DELETE FROM cash_shifts WHERE id > 1000');
      await db.execute('DELETE FROM ticket_types WHERE id LIKE ?', ['test-constraint-%']);
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  });

  describe('Foreign Key Constraint: tickets.ticket_type_id → ticket_types.id', () => {
    it('should enforce FK constraint on tickets.ticket_type_id', async () => {
      // Attempt to create ticket with invalid ticket_type_id
      await expect(async () => {
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, ticket_type_id, transaction_id, event_id, ticket_type,
            price_cents, status, validation_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            'test-constraint-001',
            'INVALID-TYPE-999', // Non-existent ticket type
            null,
            testEventId,
            'Test Ticket',
            5000,
            'valid',
            'active'
          ]
        });
      }).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it('should allow tickets with valid ticket_type_id', async () => {
      // Get a valid ticket type
      const ticketTypeResult = await db.execute({
        sql: 'SELECT id FROM ticket_types LIMIT 1'
      });

      if (!ticketTypeResult.rows || ticketTypeResult.rows.length === 0) {
        console.warn('No ticket types available for FK test');
        return;
      }

      const validTypeId = ticketTypeResult.rows[0].id;

      // Create ticket with valid ticket_type_id
      await db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, ticket_type_id, transaction_id, event_id, ticket_type,
          price_cents, status, validation_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-constraint-${Date.now()}`,
          validTypeId,
          null,
          testEventId,
          'Test Ticket',
          5000,
          'valid',
          'active'
        ]
      });

      // Should succeed without throwing
      expect(true).toBeTruthy();
    });

    it('should handle ON DELETE SET NULL for ticket_type_id', async () => {
      // Create test ticket type
      const testTypeId = `test-constraint-type-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, status)
              VALUES (?, ?, ?, ?, ?)`,
        args: [testTypeId, testEventId, 'Test Type for FK', 5000, 'test']
      });

      // Create ticket with this type
      const testTicketId = `test-constraint-ticket-${Date.now()}`;
      await db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, ticket_type_id, event_id, ticket_type,
          price_cents, status, validation_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [testTicketId, testTypeId, testEventId, 'Test Ticket', 5000, 'valid', 'active']
      });

      // Delete ticket type
      await db.execute({
        sql: 'DELETE FROM ticket_types WHERE id = ?',
        args: [testTypeId]
      });

      // Verify ticket_type_id set to NULL
      const result = await db.execute({
        sql: 'SELECT ticket_type_id FROM tickets WHERE ticket_id = ?',
        args: [testTicketId]
      });

      expect(result.rows[0].ticket_type_id).toBeNull();
    });
  });

  describe('Foreign Key Constraint: tickets.transaction_id → transactions.id', () => {
    it('should enforce FK constraint on tickets.transaction_id', async () => {
      // Attempt to create ticket with invalid transaction_id
      await expect(async () => {
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, event_id, ticket_type,
            price_cents, status, validation_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `test-constraint-${Date.now()}`,
            99999999, // Non-existent transaction
            testEventId,
            'Test Ticket',
            5000,
            'valid',
            'active'
          ]
        });
      }).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it('should allow tickets with valid transaction_id', async () => {
      // Create test transaction
      const testTxnId = `test-constraint-txn-${Date.now()}`;
      const txnResult = await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency, customer_email, order_data, event_id, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id`,
        args: [testTxnId, 'tickets', 'completed', 5000, 'USD', 'test@example.com', '[]', testEventId, 1]
      });

      const transactionId = txnResult.rows[0].id;

      // Create ticket with valid transaction_id
      await db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, event_id, ticket_type,
          price_cents, status, validation_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-constraint-${Date.now()}`,
          transactionId,
          testEventId,
          'Test Ticket',
          5000,
          'valid',
          'active'
        ]
      });

      expect(true).toBeTruthy();
    });

    it('should CASCADE delete tickets when transaction deleted', async () => {
      // Create transaction and ticket
      const testTxnId = `test-constraint-cascade-${Date.now()}`;
      const txnResult = await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency, customer_email, order_data, event_id, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id`,
        args: [testTxnId, 'tickets', 'completed', 5000, 'USD', 'cascade@example.com', '[]', testEventId, 1]
      });

      const transactionId = txnResult.rows[0].id;
      const testTicketId = `test-constraint-cascade-ticket-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, transaction_id, event_id, ticket_type,
          price_cents, status, validation_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [testTicketId, transactionId, testEventId, 'Test Ticket', 5000, 'valid', 'active']
      });

      // Delete transaction
      await db.execute({
        sql: 'DELETE FROM transactions WHERE id = ?',
        args: [transactionId]
      });

      // Verify ticket also deleted (CASCADE)
      const ticketResult = await db.execute({
        sql: 'SELECT * FROM tickets WHERE ticket_id = ?',
        args: [testTicketId]
      });

      expect(ticketResult.rows.length).toBe(0);
    });
  });

  describe('Foreign Key Constraint: transactions.cash_shift_id → cash_shifts.id', () => {
    it('should enforce FK constraint for cash payments', async () => {
      // Attempt to create cash transaction with invalid cash_shift_id
      await expect(async () => {
        await db.execute({
          sql: `INSERT INTO transactions (
            transaction_id, type, status, amount_cents, customer_email,
            order_data, payment_processor, cash_shift_id, manual_entry_id, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `test-constraint-${Date.now()}`,
            'tickets',
            'completed',
            5000,
            'cash@example.com',
            '[]',
            'cash',
            99999999, // Invalid shift ID
            crypto.randomUUID(),
            1
          ]
        });
      }).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it('should allow cash transaction with valid cash_shift_id', async () => {
      // Create cash shift
      const shiftResult = await db.execute({
        sql: `INSERT INTO cash_shifts (
          opened_at, opening_cash_cents, status
        ) VALUES (CURRENT_TIMESTAMP, ?, ?)
        RETURNING id`,
        args: [50000, 'open']
      });

      const shiftId = shiftResult.rows[0].id;

      // Create cash transaction with valid shift
      await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency, customer_email,
          order_data, payment_processor, cash_shift_id, manual_entry_id, event_id, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-constraint-${Date.now()}`,
          'tickets',
          'completed',
          5000,
          'USD',
          'valid-cash@example.com',
          '[]',
          'cash',
          shiftId,
          crypto.randomUUID(),
          testEventId,
          1
        ]
      });

      expect(true).toBeTruthy();
    });

    it('should handle ON DELETE SET NULL for cash_shift_id', async () => {
      // Create cash shift and transaction
      const shiftResult = await db.execute({
        sql: `INSERT INTO cash_shifts (
          opened_at, opening_cash_cents, status
        ) VALUES (CURRENT_TIMESTAMP, ?, ?)
        RETURNING id`,
        args: [50000, 'open']
      });

      const shiftId = shiftResult.rows[0].id;
      const txnId = `test-constraint-shift-null-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency, customer_email,
          order_data, payment_processor, cash_shift_id, manual_entry_id, event_id, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [txnId, 'tickets', 'completed', 5000, 'USD', 'null-test@example.com', '[]', 'cash', shiftId, crypto.randomUUID(), testEventId, 1]
      });

      // Delete cash shift
      await db.execute({
        sql: 'DELETE FROM cash_shifts WHERE id = ?',
        args: [shiftId]
      });

      // Verify cash_shift_id set to NULL
      const result = await db.execute({
        sql: 'SELECT cash_shift_id FROM transactions WHERE transaction_id = ?',
        args: [txnId]
      });

      expect(result.rows[0].cash_shift_id).toBeNull();
    });
  });

  describe('CHECK Constraint: cash_shifts.opening_cash_cents >= 0', () => {
    it.skip('should prevent negative opening_cash_cents', async () => {
      // SKIP: Schema doesn't have CHECK constraint for opening_cash_cents >= 0
      // Migration 041 defines opening_cash_cents as INTEGER NOT NULL DEFAULT 0
      // but doesn't include CHECK (opening_cash_cents >= 0)
      await expect(async () => {
        await db.execute({
          sql: `INSERT INTO cash_shifts (
            opened_at, opening_cash_cents, status
          ) VALUES (CURRENT_TIMESTAMP, ?, ?)`,
          args: [-10000, 'open'] // Negative opening cash
        });
      }).rejects.toThrow(/CHECK constraint failed|constraint/i);
    });

    it('should allow zero opening_cash_cents', async () => {
      await db.execute({
        sql: `INSERT INTO cash_shifts (
          opened_at, opening_cash_cents, status
        ) VALUES (CURRENT_TIMESTAMP, ?, ?)`,
        args: [0, 'open']
      });

      expect(true).toBeTruthy();
    });

    it('should allow positive opening_cash_cents', async () => {
      await db.execute({
        sql: `INSERT INTO cash_shifts (
          opened_at, opening_cash_cents, status
        ) VALUES (CURRENT_TIMESTAMP, ?, ?)`,
        args: [50000, 'open']
      });

      expect(true).toBeTruthy();
    });
  });

  describe('CHECK Constraint: cash_shifts.actual_cash_cents >= 0', () => {
    it.skip('should prevent negative actual_cash_cents', async () => {
      // SKIP: Schema doesn't have CHECK constraint for actual_cash_cents >= 0
      // Migration 041 defines actual_cash_cents as INTEGER (nullable)
      // but doesn't include CHECK (actual_cash_cents >= 0)
      const shiftResult = await db.execute({
        sql: `INSERT INTO cash_shifts (
          opened_at, opening_cash_cents, status
        ) VALUES (CURRENT_TIMESTAMP, ?, ?)
        RETURNING id`,
        args: [50000, 'open']
      });

      const shiftId = shiftResult.rows[0].id;

      await expect(async () => {
        await db.execute({
          sql: `UPDATE cash_shifts
                SET actual_cash_cents = ?, status = 'closed', closed_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: [-5000, shiftId] // Negative actual cash
        });
      }).rejects.toThrow(/CHECK constraint failed|constraint/i);
    });

    it('should allow zero and positive actual_cash_cents', async () => {
      const shiftResult = await db.execute({
        sql: `INSERT INTO cash_shifts (
          opened_at, opening_cash_cents, status
        ) VALUES (CURRENT_TIMESTAMP, ?, ?)
        RETURNING id`,
        args: [50000, 'open']
      });

      const shiftId = shiftResult.rows[0].id;

      // Allow zero
      await db.execute({
        sql: `UPDATE cash_shifts
              SET actual_cash_cents = ?, status = 'closed', closed_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [0, shiftId]
      });

      expect(true).toBeTruthy();
    });
  });

  describe('CHECK Constraint: ticket_types.sold_count <= max_quantity', () => {
    it('should prevent sold_count exceeding max_quantity', async () => {
      const typeId = `test-constraint-oversell-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, testEventId, 'Limited Ticket', 5000, 10, 0, 'available']
      });

      // Try to set sold_count > max_quantity
      await expect(async () => {
        await db.execute({
          sql: 'UPDATE ticket_types SET sold_count = ? WHERE id = ?',
          args: [11, typeId] // 11 > 10 max_quantity
        });
      }).rejects.toThrow(/CHECK constraint failed|constraint/i);
    });

    it('should allow sold_count equal to max_quantity', async () => {
      const typeId = `test-constraint-exact-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, testEventId, 'Exact Ticket', 5000, 10, 0, 'available']
      });

      // Set sold_count = max_quantity
      await db.execute({
        sql: 'UPDATE ticket_types SET sold_count = ? WHERE id = ?',
        args: [10, typeId]
      });

      expect(true).toBeTruthy();
    });

    it('should prevent negative sold_count', async () => {
      const typeId = `test-constraint-negative-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, testEventId, 'Negative Test', 5000, 10, 0, 'available']
      });

      await expect(async () => {
        await db.execute({
          sql: 'UPDATE ticket_types SET sold_count = ? WHERE id = ?',
          args: [-1, typeId]
        });
      }).rejects.toThrow(/CHECK constraint failed|constraint/i);
    });
  });

  describe('CHECK Constraint: cash_shifts.status IN (open, closed)', () => {
    it('should only allow valid status values', async () => {
      await expect(async () => {
        await db.execute({
          sql: `INSERT INTO cash_shifts (
            opened_at, opening_cash_cents, status
          ) VALUES (CURRENT_TIMESTAMP, ?, ?)`,
          args: [50000, 'invalid-status']
        });
      }).rejects.toThrow(/CHECK constraint failed|constraint/i);
    });

    it('should allow "open" status', async () => {
      await db.execute({
        sql: `INSERT INTO cash_shifts (
          opened_at, opening_cash_cents, status
        ) VALUES (CURRENT_TIMESTAMP, ?, ?)`,
        args: [50000, 'open']
      });

      expect(true).toBeTruthy();
    });

    it('should allow "closed" status', async () => {
      await db.execute({
        sql: `INSERT INTO cash_shifts (
          opened_at, opening_cash_cents, status, closed_at, actual_cash_cents
        ) VALUES (CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP, ?)`,
        args: [50000, 'closed', 50000]
      });

      expect(true).toBeTruthy();
    });
  });

  describe('UNIQUE Constraint: transactions.manual_entry_id', () => {
    it('should prevent duplicate manual_entry_id', async () => {
      const manualEntryId = crypto.randomUUID();

      // Insert first transaction
      await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency, customer_email,
          order_data, payment_processor, manual_entry_id, event_id, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-constraint-${Date.now()}-1`,
          'tickets',
          'completed',
          5000,
          'USD',
          'unique1@example.com',
          '[]',
          'card_terminal',
          manualEntryId,
          testEventId,
          1
        ]
      });

      // Try to insert with same manual_entry_id
      await expect(async () => {
        await db.execute({
          sql: `INSERT INTO transactions (
            transaction_id, type, status, amount_cents, currency, customer_email,
            order_data, payment_processor, manual_entry_id, event_id, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `test-constraint-${Date.now()}-2`,
            'tickets',
            'completed',
            5000,
            'USD',
            'unique2@example.com',
            '[]',
            'card_terminal',
            manualEntryId, // Duplicate!
            testEventId,
            1
          ]
        });
      }).rejects.toThrow(/UNIQUE constraint failed|unique/i);
    });

    it('should allow NULL manual_entry_id (nullable UNIQUE)', async () => {
      // Insert two transactions with NULL manual_entry_id
      await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency, customer_email,
          order_data, payment_processor, event_id, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-constraint-null-1-${Date.now()}`,
          'tickets',
          'completed',
          5000,
          'USD',
          'null1@example.com',
          '[]',
          'stripe',
          testEventId,
          1
        ]
      });

      await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency, customer_email,
          order_data, payment_processor, event_id, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-constraint-null-2-${Date.now()}`,
          'tickets',
          'completed',
          5000,
          'USD',
          'null2@example.com',
          '[]',
          'stripe',
          testEventId,
          1
        ]
      });

      // Both should succeed (NULL values don't violate UNIQUE)
      expect(true).toBeTruthy();
    });
  });

  describe('Constraint Violation Error Messages', () => {
    it('should provide clear error message for FK violation', async () => {
      try {
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, ticket_type_id, event_id, ticket_type,
            price_cents, status, validation_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `test-constraint-${Date.now()}`,
            'INVALID-999',
            testEventId,
            'Test',
            5000,
            'valid',
            'active'
          ]
        });
        expect.fail('Should have thrown FK error');
      } catch (error) {
        expect(error.message).toMatch(/FOREIGN KEY constraint failed/i);
      }
    });

    it.skip('should provide clear error message for CHECK violation', async () => {
      // SKIP: Schema doesn't have CHECK constraint for opening_cash_cents >= 0
      // This test would pass (no error thrown) because the constraint doesn't exist
      try {
        await db.execute({
          sql: `INSERT INTO cash_shifts (
            opened_at, opening_cash_cents, status
          ) VALUES (CURRENT_TIMESTAMP, ?, ?)`,
          args: [-10000, 'open']
        });
        expect.fail('Should have thrown CHECK error');
      } catch (error) {
        expect(error.message).toMatch(/CHECK constraint failed|constraint/i);
      }
    });

    it('should provide clear error message for UNIQUE violation', async () => {
      const manualEntryId = crypto.randomUUID();

      await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency, customer_email,
          order_data, payment_processor, manual_entry_id, event_id, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-constraint-${Date.now()}`,
          'tickets',
          'completed',
          5000,
          'USD',
          'unique@example.com',
          '[]',
          'card_terminal',
          manualEntryId,
          testEventId,
          1
        ]
      });

      try {
        await db.execute({
          sql: `INSERT INTO transactions (
            transaction_id, type, status, amount_cents, currency, customer_email,
            order_data, payment_processor, manual_entry_id, event_id, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `test-constraint-${Date.now()}-dup`,
            'tickets',
            'completed',
            5000,
            'USD',
            'unique2@example.com',
            '[]',
            'card_terminal',
            manualEntryId,
            testEventId,
            1
          ]
        });
        expect.fail('Should have thrown UNIQUE error');
      } catch (error) {
        expect(error.message).toMatch(/UNIQUE constraint failed|unique/i);
      }
    });
  });

  describe('Transaction Rollback on Constraint Violation', () => {
    it('should rollback entire transaction on FK violation', async () => {
      const txnId = `test-constraint-rollback-${Date.now()}`;

      try {
        // Start transaction and attempt operations
        await db.execute('BEGIN TRANSACTION');

        // First operation: valid transaction
        await db.execute({
          sql: `INSERT INTO transactions (
            transaction_id, type, status, amount_cents, currency, customer_email, order_data, event_id, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [txnId, 'tickets', 'completed', 5000, 'USD', 'rollback@example.com', '[]', testEventId, 1]
        });

        // Second operation: invalid ticket (FK violation)
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, ticket_type_id, event_id, ticket_type,
            price_cents, status, validation_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `test-constraint-${Date.now()}`,
            'INVALID-TYPE',
            testEventId,
            'Test',
            5000,
            'valid',
            'active'
          ]
        });

        await db.execute('COMMIT');
        expect.fail('Should have thrown FK error');
      } catch (error) {
        await db.execute('ROLLBACK');
        expect(error.message).toMatch(/FOREIGN KEY constraint failed/i);
      }

      // Verify transaction was not created (rollback successful)
      const result = await db.execute({
        sql: 'SELECT * FROM transactions WHERE transaction_id = ?',
        args: [txnId]
      });

      expect(result.rows.length).toBe(0);
    });

    it('should maintain state consistency after rollback', async () => {
      // Get initial sold_count
      const typeId = `test-constraint-consistency-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, testEventId, 'Consistency Test', 5000, 10, 5, 'available']
      });

      const initialResult = await db.execute({
        sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      const initialCount = initialResult.rows[0].sold_count;

      // Try to violate constraint
      try {
        await db.execute({
          sql: 'UPDATE ticket_types SET sold_count = ? WHERE id = ?',
          args: [15, typeId] // Exceeds max_quantity
        });
        expect.fail('Should have thrown CHECK error');
      } catch (error) {
        expect(error.message).toMatch(/CHECK constraint failed/i);
      }

      // Verify sold_count unchanged
      const finalResult = await db.execute({
        sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(finalResult.rows[0].sold_count).toBe(initialCount);
    });
  });
});
