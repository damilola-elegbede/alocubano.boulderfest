/**
 * Order Number Generator Unit Tests
 * Tests the ALO-YYYY-NNNN order number generation system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateOrderNumber,
  validateOrderNumber,
  parseOrderNumber,
  getOrderNumberGenerator
} from '../../lib/order-number-generator.js';

// Mock the database client
vi.mock('../../lib/database.js', () => ({
  getDatabaseClient: vi.fn()
}));

describe('Order Number Generator', () => {
  let mockDb;
  let mockExecute;
  let getDatabaseClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockExecute = vi.fn();
    mockDb = {
      execute: mockExecute
    };

    // Import the mocked database client
    const dbModule = await import('../../lib/database.js');
    getDatabaseClient = dbModule.getDatabaseClient;
    getDatabaseClient.mockResolvedValue(mockDb);
  });

  describe('generateOrderNumber', () => {
    it('should generate order number in ALO-YYYY-NNNN format', async () => {
      const currentYear = new Date().getFullYear();

      // Mock database response for new sequence
      mockExecute
        .mockResolvedValueOnce({ rows: [] }) // Update returns no rows (new sequence)
        .mockResolvedValueOnce({ rows: [{ last_number: 1 }] }); // Insert succeeds

      const orderNumber = await generateOrderNumber();

      expect(orderNumber).toMatch(/^ALO-\d{4}-\d{4}$/);
      expect(orderNumber).toBe(`ALO-${currentYear}-0001`);
    });

    it('should generate sequential order numbers', async () => {
      const currentYear = new Date().getFullYear();

      // Mock database responses for existing sequence
      mockExecute
        .mockResolvedValueOnce({ rows: [{ last_number: 5 }] }) // First call returns 5
        .mockResolvedValueOnce({ rows: [{ last_number: 6 }] }); // Second call returns 6

      const orderNumber1 = await generateOrderNumber();
      const orderNumber2 = await generateOrderNumber();

      expect(orderNumber1).toBe(`ALO-${currentYear}-0005`);
      expect(orderNumber2).toBe(`ALO-${currentYear}-0006`);
    });

    it('should handle race conditions gracefully', async () => {
      const currentYear = new Date().getFullYear();

      // Mock race condition scenario
      mockExecute
        .mockResolvedValueOnce({ rows: [] }) // Update returns no rows
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed')) // Insert fails due to race
        .mockResolvedValueOnce({ rows: [{ last_number: 1 }] }); // Retry update succeeds

      const orderNumber = await generateOrderNumber();

      expect(orderNumber).toBe(`ALO-${currentYear}-0001`);
    });

    it('should pad sequence numbers with zeros', async () => {
      const currentYear = new Date().getFullYear();

      mockExecute.mockResolvedValue({ rows: [{ last_number: 42 }] });

      const orderNumber = await generateOrderNumber();

      expect(orderNumber).toBe(`ALO-${currentYear}-0042`);
    });

    it('should handle large sequence numbers', async () => {
      const currentYear = new Date().getFullYear();

      mockExecute.mockResolvedValue({ rows: [{ last_number: 9999 }] });

      const orderNumber = await generateOrderNumber();

      expect(orderNumber).toBe(`ALO-${currentYear}-9999`);
    });
  });

  describe('validateOrderNumber', () => {
    it('should validate correct ALO format', () => {
      expect(validateOrderNumber('ALO-2026-0001')).toBe(true);
      expect(validateOrderNumber('ALO-2025-9999')).toBe(true);
      expect(validateOrderNumber('ALO-2024-0042')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validateOrderNumber('ALCBF-2026-00001')).toBe(false); // Wrong prefix
      expect(validateOrderNumber('ALO-26-0001')).toBe(false); // Short year
      expect(validateOrderNumber('ALO-2026-001')).toBe(false); // Short sequence
      expect(validateOrderNumber('ALO-2026-00001')).toBe(false); // Long sequence
      expect(validateOrderNumber('ALO_2026_0001')).toBe(false); // Wrong separators
      expect(validateOrderNumber('alo-2026-0001')).toBe(false); // Lowercase
      expect(validateOrderNumber('')).toBe(false); // Empty
      expect(validateOrderNumber('invalid')).toBe(false); // Random string
    });
  });

  describe('parseOrderNumber', () => {
    it('should parse valid order numbers', () => {
      const parsed = parseOrderNumber('ALO-2026-0001');

      expect(parsed).toEqual({
        prefix: 'ALO',
        year: 2026,
        sequence: 1
      });
    });

    it('should parse order numbers with different values', () => {
      const parsed = parseOrderNumber('ALO-2025-9999');

      expect(parsed).toEqual({
        prefix: 'ALO',
        year: 2025,
        sequence: 9999
      });
    });

    it('should return null for invalid order numbers', () => {
      expect(parseOrderNumber('ALCBF-2026-00001')).toBeNull();
      expect(parseOrderNumber('ALO-26-0001')).toBeNull();
      expect(parseOrderNumber('invalid')).toBeNull();
      expect(parseOrderNumber('')).toBeNull();
    });
  });

  describe('OrderNumberGenerator class', () => {
    it('should return singleton instance', () => {
      const generator1 = getOrderNumberGenerator();
      const generator2 = getOrderNumberGenerator();

      expect(generator1).toBe(generator2);
    });

    it('should get current sequence for year', async () => {
      mockExecute.mockResolvedValue({ rows: [{ last_number: 42 }] });

      const generator = getOrderNumberGenerator();
      const sequence = await generator.getCurrentSequence(2026);

      expect(sequence).toBe(42);
      expect(mockExecute).toHaveBeenCalledWith({
        sql: 'SELECT last_number FROM order_sequences WHERE sequence_key = ?',
        args: ['ALO-2026']
      });
    });

    it('should return 0 for years with no orders', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const generator = getOrderNumberGenerator();
      const sequence = await generator.getCurrentSequence(2030);

      expect(sequence).toBe(0);
    });

    it('should initialize sequence for year', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const generator = getOrderNumberGenerator();
      await generator.initializeSequence(2026, 0);

      expect(mockExecute).toHaveBeenCalledWith({
        sql: expect.stringContaining('INSERT OR IGNORE INTO order_sequences'),
        args: ['ALO-2026', 0]
      });
    });
  });

  describe('Error handling', () => {
    it('should throw meaningful error on database failure', async () => {
      mockExecute.mockRejectedValue(new Error('Database connection failed'));

      await expect(generateOrderNumber()).rejects.toThrow('Order number generation failed: Database connection failed');
    });

    it('should handle malformed database responses', async () => {
      mockExecute.mockResolvedValue({ rows: [{ something_else: 42 }] });

      // Should still work by falling back to 1 when database response is malformed
      const result = await generateOrderNumber();
      expect(result).toMatch(/^ALO-\d{4}-\d{4}$/);
      expect(result).toContain('-0001'); // Should default to 1
    });
  });
});