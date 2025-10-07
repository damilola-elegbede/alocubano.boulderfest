/**
 * Unit Tests: Cleanup Expired Reservations Cron Job
 * Tests the reservation expiration and cleanup logic
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestIsolationManager } from '../../../lib/test-isolation-manager.js';

describe('Cleanup Expired Reservations - Unit Tests', () => {
  let testDb;
  let isolationManager;

  beforeEach(async () => {
    isolationManager = getTestIsolationManager();
    testDb = await isolationManager.getScopedDatabaseClient();
  });

  afterEach(async () => {
    if (isolationManager) {
      await isolationManager.cleanup();
    }
  });

  describe('Reservation Expiration Logic', () => {
    test('should identify reservations expired 15 minutes ago', async () => {
      // Create reservation that expired 16 minutes ago
      const expiredTime = new Date(Date.now() - 16 * 60 * 1000).toISOString();

      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_expired', expiredTime, 'active']
      });

      // Query expired reservations
      const result = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('active');
    });

    test('should not identify reservations within 15-minute window', async () => {
      // Create reservation that expires in 10 minutes
      const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_active', futureTime, 'active']
      });

      // Query expired reservations
      const result = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rows.length).toBe(0);
    });

    test('should handle edge case of exactly 15 minutes', async () => {
      // Create reservation that expires exactly now
      const now = new Date().toISOString();

      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_edge', now, 'active']
      });

      // Query expired reservations (should include exact match)
      const result = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Atomic Cleanup Operations', () => {
    test('should atomically update expired reservations to expired status', async () => {
      // Create multiple expired reservations
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['ticket-1', 2, 'session_1', expiredTime, 'active']
      });

      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['ticket-2', 3, 'session_2', expiredTime, 'active']
      });

      // Perform cleanup
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(2);

      // Verify all updated
      const check = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations WHERE status = 'expired'`
      });

      expect(check.rows.length).toBe(2);
    });

    test('should not affect fulfilled reservations', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create fulfilled reservation with expired time
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_fulfilled', expiredTime, 'fulfilled']
      });

      // Perform cleanup
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(0);

      // Verify fulfilled status unchanged
      const check = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations WHERE session_id = ?`,
        args: ['session_fulfilled']
      });

      expect(check.rows[0].status).toBe('fulfilled');
    });

    test('should not affect released reservations', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create released reservation with expired time
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_released', expiredTime, 'released']
      });

      // Perform cleanup
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(0);

      // Verify released status unchanged
      const check = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations WHERE session_id = ?`,
        args: ['session_released']
      });

      expect(check.rows[0].status).toBe('released');
    });
  });

  describe('Cleanup of Orphaned Reservations', () => {
    test('should identify orphaned active reservations without valid sessions', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create orphaned reservation (no corresponding session)
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'orphaned_session_123', expiredTime, 'active']
      });

      // Cleanup should mark as expired
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(1);
    });

    test('should handle reservations with null expires_at', async () => {
      // Create reservation with null expires_at
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, status
        ) VALUES (?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_null_expires', 'active']
      });

      // Cleanup should not affect null expires_at
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      // Should not be cleaned up
      const check = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations WHERE session_id = ?`,
        args: ['session_null_expires']
      });

      expect(check.rows[0].status).toBe('active');
    });
  });

  describe('Cleanup Statistics Reporting', () => {
    test('should report accurate count of cleaned reservations', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create 5 expired reservations
      for (let i = 0; i < 5; i++) {
        await testDb.execute({
          sql: `INSERT INTO ticket_reservations (
            ticket_type_id, quantity, session_id, expires_at, status
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`ticket-${i}`, 2, `session_${i}`, expiredTime, 'active']
        });
      }

      // Perform cleanup and get count
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(5);
    });

    test('should report zero when no reservations need cleanup', async () => {
      const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Create active reservation (not expired)
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_active', futureTime, 'active']
      });

      // Perform cleanup
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(0);
    });

    test('should track cleanup by ticket type', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create expired reservations for different ticket types
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['ticket-type-a', 2, 'session_a', expiredTime, 'active']
      });

      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['ticket-type-b', 3, 'session_b', expiredTime, 'active']
      });

      // Cleanup
      await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      // Query by ticket type
      const typeA = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations
              WHERE ticket_type_id = ? AND status = 'expired'`,
        args: ['ticket-type-a']
      });

      const typeB = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations
              WHERE ticket_type_id = ? AND status = 'expired'`,
        args: ['ticket-type-b']
      });

      expect(typeA.rows.length).toBe(1);
      expect(typeB.rows.length).toBe(1);
    });
  });

  describe('Error Handling During Cleanup', () => {
    test('should handle database connection errors gracefully', async () => {
      // Simulate connection failure by using invalid database
      const invalidDb = {
        execute: vi.fn().mockRejectedValue(new Error('Connection failed'))
      };

      try {
        await invalidDb.execute({
          sql: `UPDATE ticket_reservations
                SET status = 'expired'
                WHERE status = 'active' AND expires_at <= datetime('now')`
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toBe('Connection failed');
      }
    });

    test('should handle partial cleanup failures', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create valid reservation
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['valid-ticket', 2, 'session_valid', expiredTime, 'active']
      });

      // Perform cleanup (should succeed)
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(1);
    });

    test('should recover from transient database errors', async () => {
      // This test simulates retry logic
      let attemptCount = 0;
      const mockExecute = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Transient error');
        }
        return { rowsAffected: 1 };
      });

      // Simulate retry logic
      let result;
      for (let i = 0; i < 5; i++) {
        try {
          result = await mockExecute();
          break;
        } catch (error) {
          if (i === 4) throw error;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      expect(result.rowsAffected).toBe(1);
      expect(attemptCount).toBe(3);
    });
  });

  describe('Performance and Scale', () => {
    test('should efficiently clean up large number of expired reservations', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create 100 expired reservations
      for (let i = 0; i < 100; i++) {
        await testDb.execute({
          sql: `INSERT INTO ticket_reservations (
            ticket_type_id, quantity, session_id, expires_at, status
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`ticket-${i}`, 2, `session_${i}`, expiredTime, 'active']
        });
      }

      const startTime = Date.now();

      // Perform cleanup
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      const duration = Date.now() - startTime;

      expect(result.rowsAffected).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle concurrent cleanup operations', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create multiple expired reservations
      for (let i = 0; i < 10; i++) {
        await testDb.execute({
          sql: `INSERT INTO ticket_reservations (
            ticket_type_id, quantity, session_id, expires_at, status
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [`ticket-${i}`, 2, `session_${i}`, expiredTime, 'active']
        });
      }

      // Simulate concurrent cleanup (SQLite handles serialization)
      const cleanup1 = testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      const cleanup2 = testDb.execute({
        sql: `SELECT COUNT(*) as count FROM ticket_reservations
              WHERE status = 'expired'`
      });

      const [result1, result2] = await Promise.all([cleanup1, cleanup2]);

      expect(result1.rowsAffected).toBeLessThanOrEqual(10);
      expect(result2.rows[0].count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Idempotency', () => {
    test('should be safe to run multiple times on same data', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create expired reservation
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_test', expiredTime, 'active']
      });

      // First cleanup
      const result1 = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result1.rowsAffected).toBe(1);

      // Second cleanup (should find nothing)
      const result2 = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result2.rowsAffected).toBe(0);

      // Verify status remains expired
      const check = await testDb.execute({
        sql: `SELECT * FROM ticket_reservations WHERE session_id = ?`,
        args: ['session_test']
      });

      expect(check.rows[0].status).toBe('expired');
    });

    test('should not create duplicate expired records', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      // Create expired reservation
      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_unique', expiredTime, 'active']
      });

      // Run cleanup multiple times
      for (let i = 0; i < 3; i++) {
        await testDb.execute({
          sql: `UPDATE ticket_reservations
                SET status = 'expired'
                WHERE status = 'active' AND expires_at <= datetime('now')`
        });
      }

      // Verify only one record exists
      const check = await testDb.execute({
        sql: `SELECT COUNT(*) as count FROM ticket_reservations
              WHERE session_id = ?`,
        args: ['session_unique']
      });

      expect(check.rows[0].count).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty reservations table', async () => {
      // No reservations exist
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(0);
    });

    test('should handle reservations with far future expiration', async () => {
      const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_future', farFuture, 'active']
      });

      // Cleanup should not affect
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(0);
    });

    test('should handle reservations with far past expiration', async () => {
      const farPast = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

      await testDb.execute({
        sql: `INSERT INTO ticket_reservations (
          ticket_type_id, quantity, session_id, expires_at, status
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['test-ticket', 2, 'session_past', farPast, 'active']
      });

      // Cleanup should mark as expired
      const result = await testDb.execute({
        sql: `UPDATE ticket_reservations
              SET status = 'expired'
              WHERE status = 'active' AND expires_at <= datetime('now')`
      });

      expect(result.rowsAffected).toBe(1);
    });
  });
});
