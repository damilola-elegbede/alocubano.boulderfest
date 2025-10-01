/**
 * BigInt Serialization Unit Tests
 * Tests the BigInt handling utilities to prevent JSON serialization errors
 *
 * Context: SQLite/Turso return INTEGER columns as BigInt in JavaScript
 * Problem: JSON.stringify() cannot serialize BigInt values
 * Solution: lib/bigint-serializer.js converts BigInt to safe formats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sanitizeBigInt,
  processDatabaseResult,
  bigIntReplacer,
  safeStringify,
  detectBigIntValues,
  isJsonSafe
} from '../../lib/bigint-serializer.js';

describe('BigInt Serialization', () => {
  describe('sanitizeBigInt', () => {
    it('should convert small BigInt to number', () => {
      const result = sanitizeBigInt(BigInt(42));
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should convert large BigInt to string (exceeds MAX_SAFE_INTEGER)', () => {
      const largeValue = BigInt(9007199254740992); // 2^53, exceeds MAX_SAFE_INTEGER
      const result = sanitizeBigInt(largeValue);
      expect(result).toBe('9007199254740992');
      expect(typeof result).toBe('string');
    });

    it('should handle BigInt at MAX_SAFE_INTEGER boundary', () => {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER); // 9007199254740991
      const result = sanitizeBigInt(maxSafe);
      expect(result).toBe(Number.MAX_SAFE_INTEGER);
      expect(typeof result).toBe('number');
    });

    it('should pass through non-BigInt values', () => {
      expect(sanitizeBigInt(42)).toBe(42);
      expect(sanitizeBigInt('hello')).toBe('hello');
      expect(sanitizeBigInt(null)).toBe(null);
      expect(sanitizeBigInt(undefined)).toBe(undefined);
    });
  });

  describe('processDatabaseResult - Transaction Data', () => {
    it('should handle transaction with large ID', () => {
      const mockTransaction = {
        id: BigInt('9223372036854775807'), // Much larger than MAX_SAFE_INTEGER (2^63-1)
        uuid: 'TXN-123',
        amount_cents: BigInt(5000),
        customer_email: 'test@example.com'
      };

      const processed = processDatabaseResult(mockTransaction);

      expect(processed.id).toBe('9223372036854775807');
      expect(typeof processed.id).toBe('string');
      expect(processed.amount_cents).toBe(5000); // Within safe range
      expect(typeof processed.amount_cents).toBe('number');
      expect(processed.uuid).toBe('TXN-123');
      expect(() => JSON.stringify(processed)).not.toThrow();
    });

    it('should handle ticket with multiple BigInt IDs', () => {
      const mockTicket = {
        id: BigInt(100),
        transaction_id: BigInt(200),
        event_id: BigInt(1),
        ticket_id: 'TKT-123',
        price_cents: BigInt(7500),
        scan_count: BigInt(0)
      };

      const processed = processDatabaseResult(mockTicket);

      expect(processed.id).toBe(100);
      expect(processed.transaction_id).toBe(200);
      expect(processed.event_id).toBe(1);
      expect(processed.price_cents).toBe(7500);
      expect(processed.scan_count).toBe(0);
      expect(() => JSON.stringify(processed)).not.toThrow();
    });
  });

  describe('processDatabaseResult - Arrays', () => {
    it('should process array of tickets', () => {
      const mockTickets = [
        { id: BigInt(1), ticket_id: 'TKT-001', price_cents: BigInt(5000) },
        { id: BigInt(2), ticket_id: 'TKT-002', price_cents: BigInt(7500) },
        { id: BigInt(3), ticket_id: 'TKT-003', price_cents: BigInt(10000) }
      ];

      const processed = processDatabaseResult(mockTickets);

      expect(Array.isArray(processed)).toBe(true);
      expect(processed.length).toBe(3);
      expect(processed[0].id).toBe(1);
      expect(processed[1].id).toBe(2);
      expect(processed[2].id).toBe(3);
      expect(() => JSON.stringify(processed)).not.toThrow();
    });
  });

  describe('processDatabaseResult - Database Query Result', () => {
    it('should handle database query result with rows', () => {
      const mockDbResult = {
        rows: [
          { id: BigInt(1), name: 'Event 1' },
          { id: BigInt(2), name: 'Event 2' }
        ],
        rowsAffected: BigInt(2),
        lastInsertRowid: BigInt(2)
      };

      const processed = processDatabaseResult(mockDbResult);

      expect(processed.rows[0].id).toBe(1);
      expect(processed.rows[1].id).toBe(2);
      expect(processed.rowsAffected).toBe(2);
      expect(processed.lastInsertRowid).toBe(2);
      expect(() => JSON.stringify(processed)).not.toThrow();
    });
  });

  describe('processDatabaseResult - Nested Objects', () => {
    it('should handle deeply nested BigInt values', () => {
      const mockData = {
        transaction: {
          id: BigInt(100),
          tickets: [
            { id: BigInt(1), price: BigInt(5000) },
            { id: BigInt(2), price: BigInt(7500) }
          ]
        },
        metadata: {
          counts: {
            total: BigInt(2),
            pending: BigInt(1)
          }
        }
      };

      const processed = processDatabaseResult(mockData);

      expect(processed.transaction.id).toBe(100);
      expect(processed.transaction.tickets[0].id).toBe(1);
      expect(processed.transaction.tickets[1].price).toBe(7500);
      expect(processed.metadata.counts.total).toBe(2);
      expect(() => JSON.stringify(processed)).not.toThrow();
    });
  });

  describe('bigIntReplacer', () => {
    it('should work as JSON.stringify replacer', () => {
      const data = {
        id: BigInt('9223372036854775807'),
        name: 'Test'
      };

      const json = JSON.stringify(data, bigIntReplacer);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe('9223372036854775807');
      expect(parsed.name).toBe('Test');
    });
  });

  describe('safeStringify', () => {
    it('should safely stringify object with BigInt', () => {
      const data = {
        id: BigInt(123456789),
        nested: {
          value: BigInt(987654321)
        }
      };

      const json = safeStringify(data);
      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.id).toBe(123456789);
      expect(parsed.nested.value).toBe(987654321);
    });

    it('should handle pretty printing with spacing', () => {
      const data = { id: BigInt(42), name: 'Test' };
      const json = safeStringify(data, 2);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  describe('detectBigIntValues', () => {
    it('should detect BigInt values in object', () => {
      const data = {
        id: BigInt(123),
        name: 'Test',
        nested: {
          value: BigInt(456)
        }
      };

      const paths = detectBigIntValues(data);

      expect(paths).toContain('id');
      expect(paths).toContain('nested.value');
      expect(paths.length).toBe(2);
    });

    it('should detect BigInt in arrays', () => {
      const data = {
        items: [
          { id: BigInt(1) },
          { id: BigInt(2) }
        ]
      };

      const paths = detectBigIntValues(data);

      expect(paths).toContain('items[0].id');
      expect(paths).toContain('items[1].id');
    });

    it('should return empty array when no BigInt values', () => {
      const data = {
        id: 123,
        name: 'Test',
        count: 42
      };

      const paths = detectBigIntValues(data);
      expect(paths).toEqual([]);
    });
  });

  describe('isJsonSafe', () => {
    it('should return true for JSON-safe values', () => {
      expect(isJsonSafe(42)).toBe(true);
      expect(isJsonSafe('hello')).toBe(true);
      expect(isJsonSafe(true)).toBe(true);
      expect(isJsonSafe(null)).toBe(true);
      expect(isJsonSafe({ a: 1 })).toBe(true);
      expect(isJsonSafe([1, 2, 3])).toBe(true);
    });

    it('should return false for BigInt values', () => {
      expect(isJsonSafe(BigInt(123))).toBe(false);
    });

    it('should return true for undefined (JSON.stringify handles it)', () => {
      expect(isJsonSafe(undefined)).toBe(true);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle admin dashboard response', () => {
      const mockDashboardData = {
        stats: {
          total_transactions: BigInt(150),
          total_revenue: BigInt(250000),
          ticket_count: BigInt(300)
        },
        recentRegistrations: [
          {
            id: BigInt(1),
            transaction_id: BigInt(100),
            email: 'test1@example.com',
            created_at: '2025-01-01T00:00:00Z'
          },
          {
            id: BigInt(2),
            transaction_id: BigInt(101),
            email: 'test2@example.com',
            created_at: '2025-01-02T00:00:00Z'
          }
        ],
        ticketBreakdown: [
          { ticket_type: 'VIP', count: BigInt(50), revenue: BigInt(50000) },
          { ticket_type: 'General', count: BigInt(250), revenue: BigInt(200000) }
        ]
      };

      const processed = processDatabaseResult(mockDashboardData);

      expect(processed.stats.total_transactions).toBe(150);
      expect(processed.recentRegistrations[0].id).toBe(1);
      expect(processed.ticketBreakdown[0].count).toBe(50);
      expect(() => JSON.stringify(processed)).not.toThrow();
    });

    it('should handle ticket validation response', () => {
      const mockValidationData = {
        valid: true,
        ticket: {
          id: BigInt(12345),
          ticket_id: 'TKT-123',
          transaction_id: BigInt(67890),
          event_id: BigInt(1),
          scan_count: BigInt(1),
          max_scan_count: BigInt(10)
        },
        transaction: {
          id: BigInt(67890),
          amount_cents: BigInt(7500)
        }
      };

      const processed = processDatabaseResult(mockValidationData);

      expect(processed.ticket.id).toBe(12345);
      expect(processed.ticket.transaction_id).toBe(67890);
      expect(processed.transaction.id).toBe(67890);
      expect(() => JSON.stringify(processed)).not.toThrow();
    });

    it('should handle registration batch response', () => {
      const mockBatchData = {
        success: true,
        registered: [
          {
            ticket_id: 'TKT-001',
            id: BigInt(1),
            transaction_id: BigInt(100)
          },
          {
            ticket_id: 'TKT-002',
            id: BigInt(2),
            transaction_id: BigInt(100)
          }
        ],
        failed: [],
        summary: {
          total: BigInt(2),
          successful: BigInt(2),
          failed: BigInt(0)
        }
      };

      const processed = processDatabaseResult(mockBatchData);

      expect(processed.registered[0].id).toBe(1);
      expect(processed.summary.total).toBe(2);
      expect(() => JSON.stringify(processed)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      const data = { id: null, value: BigInt(42) };
      const processed = processDatabaseResult(data);
      expect(processed.id).toBe(null);
      expect(processed.value).toBe(42);
    });

    it('should handle empty objects', () => {
      const processed = processDatabaseResult({});
      expect(processed).toEqual({});
    });

    it('should handle empty arrays', () => {
      const processed = processDatabaseResult([]);
      expect(processed).toEqual([]);
    });

    it('should handle Date objects', () => {
      const date = new Date('2025-01-01');
      const data = { timestamp: date, id: BigInt(42) };
      const processed = processDatabaseResult(data);
      expect(processed.timestamp).toBeInstanceOf(Date);
      expect(processed.id).toBe(42);
    });

    it('should handle mixed types in arrays', () => {
      const data = [
        BigInt(1),
        'string',
        42,
        null,
        { id: BigInt(2) }
      ];
      const processed = processDatabaseResult(data);
      expect(processed[0]).toBe(1);
      expect(processed[1]).toBe('string');
      expect(processed[2]).toBe(42);
      expect(processed[3]).toBe(null);
      expect(processed[4].id).toBe(2);
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: BigInt(i + 1),
        transaction_id: BigInt(i + 1000),
        price_cents: BigInt(5000)
      }));

      const startTime = performance.now();
      const processed = processDatabaseResult(largeDataset);
      const endTime = performance.now();

      expect(processed.length).toBe(1000);
      expect(processed[0].id).toBe(1);
      expect(processed[999].id).toBe(1000);
      expect(endTime - startTime).toBeLessThan(100); // Should process in < 100ms
    });
  });
});
