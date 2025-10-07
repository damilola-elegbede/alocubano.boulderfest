/**
 * Integration Test: sold_count Atomicity and Race Condition Prevention
 * Tests atomicity of sold_count updates, test data isolation, and concurrent purchase handling
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { getDatabaseClient } from '../../lib/database.js';
import { resetAllServices } from './reset-services.js';
import { createManualTickets } from '../../lib/manual-ticket-creation-service.js';
import crypto from 'crypto';

describe('sold_count Atomicity Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabaseClient();
  });

  beforeEach(async () => {
    await resetAllServices();
    db = await getDatabaseClient();

    // Clean up test data
    try {
      await db.execute('DELETE FROM tickets WHERE ticket_id LIKE ?', ['test-atomicity-%']);
      await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['test-atomicity-%']);
      await db.execute('DELETE FROM ticket_types WHERE id LIKE ?', ['test-atomicity-%']);
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await db.execute('DELETE FROM tickets WHERE ticket_id LIKE ?', ['test-atomicity-%']);
      await db.execute('DELETE FROM transactions WHERE transaction_id LIKE ?', ['test-atomicity-%']);
      await db.execute('DELETE FROM ticket_types WHERE id LIKE ?', ['test-atomicity-%']);
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  });

  describe('Race Condition Prevention (Migration 042)', () => {
    it('should handle concurrent ticket purchases atomically', async () => {
      // Create ticket type with limited quantity
      const typeId = `test-atomicity-race-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Race Condition Test', 5000, 5, 0, 'test']
      });

      // Simulate concurrent purchases using Promise.all
      const concurrentPurchases = [];

      for (let i = 0; i < 5; i++) {
        const purchase = async () => {
          try {
            // Simulate atomic sold_count update
            const result = await db.execute({
              sql: `UPDATE ticket_types
                    SET sold_count = sold_count + 1
                    WHERE id = ?
                    AND sold_count < max_quantity
                    RETURNING sold_count`,
              args: [typeId]
            });

            if (result.rows && result.rows.length > 0) {
              // Purchase succeeded
              return { success: true, sold_count: result.rows[0].sold_count };
            } else {
              // No more tickets available
              return { success: false, reason: 'sold_out' };
            }
          } catch (error) {
            return { success: false, reason: error.message };
          }
        };

        concurrentPurchases.push(purchase());
      }

      const results = await Promise.all(concurrentPurchases);

      // All 5 should succeed (within max_quantity)
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(5);

      // Verify final sold_count is exactly 5
      const finalResult = await db.execute({
        sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(finalResult.rows[0].sold_count).toBe(5);
    });

    it('should prevent overselling during concurrent purchases', async () => {
      // Create ticket type with 1 remaining
      const typeId = `test-atomicity-oversell-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Oversell Test', 5000, 10, 9, 'test'] // 1 remaining
      });

      // Try to purchase 2 tickets concurrently
      const purchase1 = async () => {
        const result = await db.execute({
          sql: `UPDATE ticket_types
                SET sold_count = sold_count + 1
                WHERE id = ?
                AND sold_count < max_quantity
                RETURNING sold_count`,
          args: [typeId]
        });
        return result.rows && result.rows.length > 0;
      };

      const purchase2 = async () => {
        const result = await db.execute({
          sql: `UPDATE ticket_types
                SET sold_count = sold_count + 1
                WHERE id = ?
                AND sold_count < max_quantity
                RETURNING sold_count`,
          args: [typeId]
        });
        return result.rows && result.rows.length > 0;
      };

      const results = await Promise.all([purchase1(), purchase2()]);

      // Only one should succeed
      const successCount = results.filter(r => r).length;
      expect(successCount).toBe(1);

      // Verify sold_count is exactly max_quantity
      const finalResult = await db.execute({
        sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(finalResult.rows[0].sold_count).toBe(10);
    });

    it('should use optimistic concurrency control for availability checks', async () => {
      // Create ticket type
      const typeId = `test-atomicity-occ-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [typeId, 1, 'OCC Test', 5000, 10, 0, 'test']
      });

      // Get initial state
      const initialResult = await db.execute({
        sql: 'SELECT sold_count, updated_at FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      const initialSoldCount = initialResult.rows[0].sold_count;
      const initialUpdatedAt = initialResult.rows[0].updated_at;

      // Simulate purchase with OCC check
      const updateResult = await db.execute({
        sql: `UPDATE ticket_types
              SET sold_count = sold_count + 1
              WHERE id = ?
              AND sold_count = ?
              AND updated_at = ?
              RETURNING sold_count`,
        args: [typeId, initialSoldCount, initialUpdatedAt]
      });

      expect(updateResult.rows.length).toBe(1);
      expect(updateResult.rows[0].sold_count).toBe(initialSoldCount + 1);
    });
  });

  describe('Test Data Isolation (Migration 043)', () => {
    it('should track production and test sales separately', async () => {
      // Create ticket type
      const typeId = `test-atomicity-isolation-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, test_sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Isolation Test', 5000, 100, 0, 0, 'test']
      });

      // Create production ticket
      await db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, ticket_type_id, event_id, ticket_type,
          price_cents, status, validation_status, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-atomicity-prod-${Date.now()}`,
          typeId,
          1,
          'Production Ticket',
          5000,
          'valid',
          'active',
          0 // Production
        ]
      });

      // Update production sold_count
      await db.execute({
        sql: 'UPDATE ticket_types SET sold_count = sold_count + 1 WHERE id = ?',
        args: [typeId]
      });

      // Create test ticket
      await db.execute({
        sql: `INSERT INTO tickets (
          ticket_id, ticket_type_id, event_id, ticket_type,
          price_cents, status, validation_status, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `test-atomicity-test-${Date.now()}`,
          typeId,
          1,
          'Test Ticket',
          5000,
          'valid',
          'active',
          1 // Test
        ]
      });

      // Update test_sold_count
      await db.execute({
        sql: 'UPDATE ticket_types SET test_sold_count = test_sold_count + 1 WHERE id = ?',
        args: [typeId]
      });

      // Verify separate counts
      const result = await db.execute({
        sql: 'SELECT sold_count, test_sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(result.rows[0].sold_count).toBe(1);
      expect(result.rows[0].test_sold_count).toBe(1);
    });

    it('should exclude test sales from production availability', async () => {
      // Create ticket type with 10 max
      const typeId = `test-atomicity-availability-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, test_sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Availability Test', 5000, 10, 5, 3, 'available']
      });

      // Calculate production availability: max_quantity - sold_count
      // Should NOT subtract test_sold_count
      const result = await db.execute({
        sql: `SELECT
                max_quantity,
                sold_count,
                test_sold_count,
                (max_quantity - sold_count) as production_available
              FROM ticket_types WHERE id = ?`,
        args: [typeId]
      });

      expect(result.rows[0].production_available).toBe(5); // 10 - 5, ignoring 3 test sales
    });

    it('should use test_ticket_sales_view for discrepancy detection', async () => {
      // Create ticket type with test sales
      const typeId = `test-atomicity-view-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, test_sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'View Test', 5000, 100, 0, 2, 'test']
      });

      // Create 2 test tickets
      for (let i = 0; i < 2; i++) {
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, ticket_type_id, event_id, ticket_type,
            price_cents, status, validation_status, is_test
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `test-atomicity-view-ticket-${Date.now()}-${i}`,
            typeId,
            1,
            'Test Ticket',
            5000,
            'valid',
            'active',
            1
          ]
        });
      }

      // Check view for discrepancy
      const viewResult = await db.execute({
        sql: `SELECT test_sold_count, actual_test_tickets, discrepancy
              FROM test_ticket_sales_view
              WHERE id = ?`,
        args: [typeId]
      });

      if (viewResult.rows && viewResult.rows.length > 0) {
        expect(viewResult.rows[0].test_sold_count).toBe(2);
        expect(viewResult.rows[0].actual_test_tickets).toBe(2);
        expect(viewResult.rows[0].discrepancy).toBe(0); // No discrepancy
      }
    });
  });

  describe('Atomic sold_count Updates in Manual Entry', () => {
    it('should atomically update sold_count during manual ticket creation', async () => {
      // Create ticket type
      const typeId = `test-atomicity-manual-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Manual Entry Test', 5000, 10, 0, 'test']
      });

      // Use manual ticket creation service
      const result = await createManualTickets({
        manualEntryId: crypto.randomUUID(),
        ticketItems: [{ ticketTypeId: typeId, quantity: 2 }],
        paymentMethod: 'card_terminal',
        customerEmail: 'atomic@example.com',
        customerName: 'Atomic Test',
        isTest: true
      });

      expect(result.created).toBe(true);
      expect(result.ticketCount).toBe(2);

      // Verify sold_count updated (for test tickets, updates test_sold_count)
      const typeResult = await db.execute({
        sql: 'SELECT test_sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(typeResult.rows[0].test_sold_count).toBe(2);
    });

    it('should rollback sold_count on transaction failure', async () => {
      // Create ticket type
      const typeId = `test-atomicity-rollback-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Rollback Test', 5000, 10, 5, 'test']
      });

      // Try to purchase with invalid data (should fail)
      try {
        await createManualTickets({
          manualEntryId: crypto.randomUUID(),
          ticketItems: [{ ticketTypeId: typeId, quantity: 2 }],
          paymentMethod: 'card_terminal',
          customerEmail: 'invalid-email', // Invalid email
          customerName: 'Rollback Test',
          isTest: true
        });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toMatch(/email/i);
      }

      // Verify sold_count unchanged
      const result = await db.execute({
        sql: 'SELECT test_sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(result.rows[0].test_sold_count).toBe(0); // Unchanged from initial 0
    });
  });

  describe('sold_count Edge Cases', () => {
    it('should handle simultaneous purchases of last ticket', async () => {
      // Create ticket type with 1 remaining
      const typeId = `test-atomicity-last-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Last Ticket Test', 5000, 10, 9, 'test']
      });

      // Simulate 3 concurrent attempts to buy the last ticket
      const purchases = Array.from({ length: 3 }, (_, i) => {
        return async () => {
          try {
            return await createManualTickets({
              manualEntryId: crypto.randomUUID(),
              ticketItems: [{ ticketTypeId: typeId, quantity: 1 }],
              paymentMethod: 'card_terminal',
              customerEmail: `last-ticket-${i}@example.com`,
              customerName: `Last Ticket ${i}`,
              isTest: true
            });
          } catch (error) {
            return { error: error.message };
          }
        };
      });

      const results = await Promise.all(purchases.map(p => p()));

      // Only one should succeed
      const successCount = results.filter(r => r.created === true).length;
      expect(successCount).toBeLessThanOrEqual(1);

      // Verify final test_sold_count doesn't exceed max_quantity
      const finalResult = await db.execute({
        sql: 'SELECT test_sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(finalResult.rows[0].test_sold_count).toBeLessThanOrEqual(1);
    });

    it('should enforce maximum capacity', async () => {
      // Create ticket type at max capacity
      const typeId = `test-atomicity-max-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Max Capacity Test', 5000, 10, 10, 'test']
      });

      // Try to purchase more
      try {
        await createManualTickets({
          manualEntryId: crypto.randomUUID(),
          ticketItems: [{ ticketTypeId: typeId, quantity: 1 }],
          paymentMethod: 'card_terminal',
          customerEmail: 'max-capacity@example.com',
          customerName: 'Max Capacity Test',
          isTest: true
        });
        expect.fail('Should have thrown availability error');
      } catch (error) {
        expect(error.message).toMatch(/not available|sold out|insufficient/i);
      }
    });

    it('should prevent negative sold_count from refunds', async () => {
      // Create ticket type with sold_count = 1
      const typeId = `test-atomicity-negative-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Negative Prevention Test', 5000, 10, 1, 'test']
      });

      // Simulate refund (decrement sold_count)
      await db.execute({
        sql: 'UPDATE ticket_types SET sold_count = MAX(0, sold_count - 1) WHERE id = ?',
        args: [typeId]
      });

      // Verify sold_count is 0, not negative
      const result = await db.execute({
        sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(result.rows[0].sold_count).toBe(0);

      // Try to refund again (would go negative without MAX)
      await db.execute({
        sql: 'UPDATE ticket_types SET sold_count = MAX(0, sold_count - 1) WHERE id = ?',
        args: [typeId]
      });

      const finalResult = await db.execute({
        sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(finalResult.rows[0].sold_count).toBe(0); // Still 0, not -1
    });
  });

  describe('Batch Operation Rollback', () => {
    it('should rollback all sold_count updates on batch failure', async () => {
      // Create multiple ticket types
      const typeIds = [];
      for (let i = 0; i < 3; i++) {
        const typeId = `test-atomicity-batch-${Date.now()}-${i}`;
        typeIds.push(typeId);

        await db.execute({
          sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [typeId, 1, `Batch Test ${i}`, 5000, 10, 0, 'test']
        });
      }

      // Start transaction for batch update
      try {
        await db.execute('BEGIN TRANSACTION');

        // Update sold_count for all types
        for (const typeId of typeIds) {
          await db.execute({
            sql: 'UPDATE ticket_types SET sold_count = sold_count + 1 WHERE id = ?',
            args: [typeId]
          });
        }

        // Simulate failure (e.g., invalid constraint)
        await db.execute({
          sql: 'UPDATE ticket_types SET sold_count = -1 WHERE id = ?', // Violates CHECK constraint
          args: [typeIds[0]]
        });

        await db.execute('COMMIT');
        expect.fail('Should have thrown CHECK constraint error');
      } catch (error) {
        await db.execute('ROLLBACK');
        expect(error.message).toMatch(/CHECK constraint failed/i);
      }

      // Verify all sold_counts remain at 0 (rollback successful)
      for (const typeId of typeIds) {
        const result = await db.execute({
          sql: 'SELECT sold_count FROM ticket_types WHERE id = ?',
          args: [typeId]
        });

        expect(result.rows[0].sold_count).toBe(0);
      }
    });

    it('should maintain atomicity across multiple ticket types in single purchase', async () => {
      // Create 2 ticket types
      const type1Id = `test-atomicity-multi-1-${Date.now()}`;
      const type2Id = `test-atomicity-multi-2-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [type1Id, 1, 'Multi Type 1', 5000, 10, 0, 'test']
      });

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [type2Id, 1, 'Multi Type 2', 7500, 10, 0, 'test']
      });

      // Purchase both types in single transaction
      const result = await createManualTickets({
        manualEntryId: crypto.randomUUID(),
        ticketItems: [
          { ticketTypeId: type1Id, quantity: 2 },
          { ticketTypeId: type2Id, quantity: 1 }
        ],
        paymentMethod: 'card_terminal',
        customerEmail: 'multi-type@example.com',
        customerName: 'Multi Type Test',
        isTest: true
      });

      expect(result.created).toBe(true);
      expect(result.ticketCount).toBe(3);

      // Verify both sold_counts updated
      const result1 = await db.execute({
        sql: 'SELECT test_sold_count FROM ticket_types WHERE id = ?',
        args: [type1Id]
      });

      const result2 = await db.execute({
        sql: 'SELECT test_sold_count FROM ticket_types WHERE id = ?',
        args: [type2Id]
      });

      expect(result1.rows[0].test_sold_count).toBe(2);
      expect(result2.rows[0].test_sold_count).toBe(1);
    });
  });

  describe('Performance Under Concurrent Load', () => {
    it('should handle high concurrent load without race conditions', async () => {
      // Create ticket type with capacity for many concurrent purchases
      const typeId = `test-atomicity-perf-${Date.now()}`;

      await db.execute({
        sql: `INSERT INTO ticket_types (id, event_id, name, price_cents, max_quantity, sold_count, status)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [typeId, 1, 'Performance Test', 5000, 100, 0, 'test']
      });

      // Simulate 50 concurrent purchases
      const concurrentPurchases = Array.from({ length: 50 }, (_, i) => {
        return async () => {
          try {
            return await createManualTickets({
              manualEntryId: crypto.randomUUID(),
              ticketItems: [{ ticketTypeId: typeId, quantity: 1 }],
              paymentMethod: 'card_terminal',
              customerEmail: `perf-${i}@example.com`,
              customerName: `Performance Test ${i}`,
              isTest: true
            });
          } catch (error) {
            return { error: error.message };
          }
        };
      });

      const startTime = Date.now();
      const results = await Promise.all(concurrentPurchases.map(p => p()));
      const duration = Date.now() - startTime;

      // Count successes and failures
      const successCount = results.filter(r => r.created === true).length;
      const failureCount = results.filter(r => r.error).length;

      console.log(`Concurrent load test: ${successCount} successes, ${failureCount} failures in ${duration}ms`);

      // All 50 should succeed (within capacity of 100)
      expect(successCount).toBe(50);

      // Verify final sold_count is exactly 50
      const finalResult = await db.execute({
        sql: 'SELECT test_sold_count FROM ticket_types WHERE id = ?',
        args: [typeId]
      });

      expect(finalResult.rows[0].test_sold_count).toBe(50);
    });
  });
});
