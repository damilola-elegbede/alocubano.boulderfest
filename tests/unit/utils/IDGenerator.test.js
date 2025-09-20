import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ID_FORMATS,
  CHAR_SETS,
  generateRandomString,
  generateTimestamp,
  generateSecureId,
  generateTicketId,
  generateTransactionId,
  generateSessionId,
  generateEmailId,
  validateIdFormat,
  extractTimestamp,
  generateBatchIds,
  calculateCollisionProbability,
  generateUUID,
  generateShortId,
  generateNumericId,
  generateHashId
} from './IDGenerator.js';

describe('IDGenerator', () => {
  describe('Format Constants', () => {
    it('defines correct ID formats', () => {
      expect(ID_FORMATS.TICKET.PREFIX).toBe('TKT');
      expect(ID_FORMATS.TICKET.TOTAL_LENGTH).toBe(19);
      expect(ID_FORMATS.TRANSACTION.PREFIX).toBe('TXN');
      expect(ID_FORMATS.TRANSACTION.TOTAL_LENGTH).toBe(23);
      expect(ID_FORMATS.SESSION.PREFIX).toBe('SES');
      expect(ID_FORMATS.SESSION.TOTAL_LENGTH).toBe(25);
      expect(ID_FORMATS.EMAIL.PREFIX).toBe('EML');
      expect(ID_FORMATS.EMAIL.TOTAL_LENGTH).toBe(21);
    });

    it('defines character sets', () => {
      expect(CHAR_SETS.NUMERIC).toBe('0123456789');
      expect(CHAR_SETS.ALPHA_UPPER).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(CHAR_SETS.ALPHANUMERIC).toHaveLength(36);
      expect(CHAR_SETS.HEX).toBe('0123456789ABCDEF');
      expect(CHAR_SETS.BASE58).not.toContain('0'); // Base58 excludes confusing chars
    });
  });

  describe('generateRandomString', () => {
    it('generates string of correct length', () => {
      expect(generateRandomString(10)).toHaveLength(10);
      expect(generateRandomString(5)).toHaveLength(5);
    });

    it('uses correct character set', () => {
      const numeric = generateRandomString(20, CHAR_SETS.NUMERIC);
      expect(numeric).toMatch(/^[0-9]+$/);

      const hex = generateRandomString(20, CHAR_SETS.HEX);
      expect(hex).toMatch(/^[0-9A-F]+$/);
    });

    it('generates unique strings', () => {
      const strings = [];
      for (let i = 0; i < 100; i++) {
        strings.push(generateRandomString(8));
      }
      const unique = new Set(strings);
      expect(unique.size).toBe(100);
    });

    it('throws error for invalid length', () => {
      expect(() => generateRandomString(0)).toThrow('Length must be positive');
      expect(() => generateRandomString(-1)).toThrow('Length must be positive');
    });

    it('throws error for empty character set', () => {
      expect(() => generateRandomString(5, '')).toThrow('Character set must not be empty');
      expect(() => generateRandomString(5, null)).toThrow('Character set must not be empty');
    });

    it('handles different character sets correctly', () => {
      const alphaUpper = generateRandomString(10, CHAR_SETS.ALPHA_UPPER);
      expect(alphaUpper).toMatch(/^[A-Z]+$/);

      const alphaLower = generateRandomString(10, CHAR_SETS.ALPHA_LOWER);
      expect(alphaLower).toMatch(/^[a-z]+$/);
    });
  });

  describe('generateTimestamp', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('generates timestamp of correct length', () => {
      expect(generateTimestamp(8)).toHaveLength(8);
      expect(generateTimestamp(10)).toHaveLength(10);
    });

    it('generates consistent timestamp for same time', () => {
      const ts1 = generateTimestamp(8);
      const ts2 = generateTimestamp(8);
      expect(ts1).toBe(ts2);
    });

    it('pads short timestamps', () => {
      // Mock a very early timestamp
      vi.setSystemTime(new Date('1970-01-01T00:00:01.000Z'));
      const ts = generateTimestamp(10);
      expect(ts).toHaveLength(10);
      expect(ts).toMatch(/^0+/); // Should be padded with zeros
    });

    it('truncates long timestamps', () => {
      const ts = generateTimestamp(4);
      expect(ts).toHaveLength(4);
    });

    it('uses correct base', () => {
      const ts36 = generateTimestamp(8, 36);
      expect(ts36).toMatch(/^[0-9A-Z]+$/);

      const ts16 = generateTimestamp(8, 16);
      expect(ts16).toMatch(/^[0-9A-F]+$/);
    });
  });

  describe('generateSecureId', () => {
    it('generates ID with correct structure', () => {
      const id = generateSecureId('TKT', 8, 6);
      const parts = id.split('-');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('TKT');
      expect(parts[1]).toHaveLength(8);
      expect(parts[2]).toHaveLength(6);
    });

    it('works without prefix', () => {
      const id = generateSecureId('', 8, 6);
      const parts = id.split('-');
      expect(parts).toHaveLength(2);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(6);
    });

    it('generates unique IDs', () => {
      const ids = [];
      for (let i = 0; i < 100; i++) {
        ids.push(generateSecureId('TKT', 8, 6));
      }
      const unique = new Set(ids);
      expect(unique.size).toBe(100);
    });

    it('uses hex characters for random part', () => {
      const id = generateSecureId('TKT', 8, 6);
      const randomPart = id.split('-')[2];
      expect(randomPart).toMatch(/^[0-9A-F]+$/);
    });
  });

  describe('generateTicketId', () => {
    beforeEach(() => {
      delete process.env.TICKET_PREFIX;
    });

    it('generates ticket ID with default prefix', () => {
      const id = generateTicketId();
      expect(id).toMatch(/^TKT-[0-9A-Z]+-[0-9A-F]{6}$/);
      expect(id).toHaveLength(19);
    });

    it('uses custom prefix', () => {
      const id = generateTicketId('CUSTOM');
      expect(id).toMatch(/^CUSTOM-[0-9A-Z]+-[0-9A-F]{6}$/);
    });

    it('uses environment prefix', () => {
      process.env.TICKET_PREFIX = 'ENV';
      const id = generateTicketId();
      expect(id).toMatch(/^ENV-[0-9A-Z]+-[0-9A-F]{6}$/);
      delete process.env.TICKET_PREFIX;
    });

    it('custom prefix overrides environment', () => {
      process.env.TICKET_PREFIX = 'ENV';
      const id = generateTicketId('CUSTOM');
      expect(id).toMatch(/^CUSTOM-[0-9A-Z]+-[0-9A-F]{6}$/);
      delete process.env.TICKET_PREFIX;
    });
  });

  describe('generateTransactionId', () => {
    it('generates transaction ID with correct format', () => {
      const id = generateTransactionId();
      expect(id).toMatch(/^TXN-[0-9A-Z]+-[0-9A-F]{8}$/);
      expect(id).toHaveLength(23);
    });

    it('uses custom prefix', () => {
      const id = generateTransactionId('CUSTOM');
      expect(id).toMatch(/^CUSTOM-[0-9A-Z]+-[0-9A-F]{8}$/);
    });
  });

  describe('generateSessionId', () => {
    it('generates session ID with correct format', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^SES-[0-9A-Z]+-[0-9A-F]{12}$/);
      expect(id).toHaveLength(25);
    });
  });

  describe('generateEmailId', () => {
    it('generates email ID with correct format', () => {
      const id = generateEmailId();
      expect(id).toMatch(/^EML-[0-9A-Z]+-[0-9A-F]{10}$/);
      expect(id).toHaveLength(21);
    });
  });

  describe('validateIdFormat', () => {
    it('validates correct ticket ID format', () => {
      const id = 'TKT-MF3HT6EB-A4991C';
      const result = validateIdFormat(id, 'TICKET');
      expect(result.valid).toBe(true);
    });

    it('rejects invalid length', () => {
      const result = validateIdFormat('TKT-12345678-ABCDE', 'TICKET'); // Too short
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Expected length 19, got 18');
    });

    it('rejects wrong prefix', () => {
      const result = validateIdFormat('XXX-MF3HT6EB-A4991C', 'TICKET');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Expected prefix TKT-');
    });

    it('rejects invalid structure', () => {
      const result = validateIdFormat('TKTMF3HT6EBA4991C', 'TICKET'); // No hyphens
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exactly 3 parts separated by hyphens');
    });

    it('validates timestamp part', () => {
      const result = validateIdFormat('TKT-F3HT6EB-A4991C', 'TICKET'); // Wrong timestamp length
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Timestamp part should be 8 characters');
    });

    it('validates random part', () => {
      const result = validateIdFormat('TKT-MF3HT6EB-A499', 'TICKET'); // Wrong random length
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Random part should be 6 characters');
    });

    it('rejects invalid characters in timestamp', () => {
      const result = validateIdFormat('TKT-MF3HT6E@-A4991C', 'TICKET');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Timestamp part contains invalid characters');
    });

    it('rejects invalid characters in random part', () => {
      const result = validateIdFormat('TKT-MF3HT6EB-A499XG', 'TICKET');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Random part contains invalid characters');
    });

    it('handles all ID formats', () => {
      const validIds = {
        TICKET: 'TKT-MF3HT6EB-A4991C',
        TRANSACTION: 'TXN-00MF3HT6EC-74B38911',
        SESSION: 'SES-MF3HT6EC-60A5AADF296A',
        EMAIL: 'EML-3HT6EC-9566B215BF'
      };

      Object.entries(validIds).forEach(([format, id]) => {
        const result = validateIdFormat(id, format);
        expect(result.valid).toBe(true);
      });
    });

    it('handles invalid input', () => {
      expect(validateIdFormat('', 'TICKET').valid).toBe(false);
      expect(validateIdFormat(null, 'TICKET').valid).toBe(false);
      expect(validateIdFormat('id', 'UNKNOWN').valid).toBe(false);
    });
  });

  describe('extractTimestamp', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('extracts timestamp from valid ID', () => {
      const id = generateTicketId();
      const timestamp = extractTimestamp(id);
      expect(timestamp).toBeInstanceOf(Date);

      // Should be very close to mocked time
      const timeDiff = Math.abs(timestamp.getTime() - Date.now());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('throws error for invalid ID format', () => {
      expect(() => extractTimestamp('invalid')).toThrow('Invalid ID format');
      expect(() => extractTimestamp('TKT-INVALID')).toThrow('Invalid ID format');
    });

    it('handles different ID types', () => {
      const ticketId = generateTicketId();
      const transactionId = generateTransactionId();

      const ticketTime = extractTimestamp(ticketId);
      const transactionTime = extractTimestamp(transactionId);

      expect(ticketTime).toBeInstanceOf(Date);
      expect(transactionTime).toBeInstanceOf(Date);
    });
  });

  describe('generateBatchIds', () => {
    it('generates correct number of unique IDs', () => {
      const ids = generateBatchIds(10, 'TICKET');
      expect(ids).toHaveLength(10);

      const unique = new Set(ids);
      expect(unique.size).toBe(10);
    });

    it('throws error for invalid count', () => {
      expect(() => generateBatchIds(0, 'TICKET')).toThrow('Count must be between 1 and 1000');
      expect(() => generateBatchIds(1001, 'TICKET')).toThrow('Count must be between 1 and 1000');
    });

    it('generates different ID types', () => {
      const ticketIds = generateBatchIds(5, 'TICKET');
      const transactionIds = generateBatchIds(5, 'TRANSACTION');

      ticketIds.forEach(id => expect(id).toMatch(/^TKT-/));
      transactionIds.forEach(id => expect(id).toMatch(/^TXN-/));
    });

    it('uses custom prefix', () => {
      const ids = generateBatchIds(5, 'TICKET', 'CUSTOM');
      ids.forEach(id => expect(id).toMatch(/^CUSTOM-/));
    });

    it('throws error for unknown type', () => {
      expect(() => generateBatchIds(5, 'UNKNOWN')).toThrow('Unknown ID type: UNKNOWN');
    });

    it('handles large batches efficiently', () => {
      const start = Date.now();
      const ids = generateBatchIds(100, 'TICKET');
      const duration = Date.now() - start;

      expect(ids).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('calculateCollisionProbability', () => {
    it('calculates collision probability for ticket IDs', () => {
      const stats = calculateCollisionProbability('TICKET', 1000);
      expect(stats.probability).toBeGreaterThan(0);
      expect(stats.percentage).toContain('%');
      expect(stats.totalPossibilities).toBeGreaterThan(0);
      expect(stats.recommended).toBeGreaterThan(0);
    });

    it('shows higher probability for larger counts', () => {
      const small = calculateCollisionProbability('TICKET', 100);
      const large = calculateCollisionProbability('TICKET', 10000);
      expect(large.probability).toBeGreaterThan(small.probability);
    });

    it('calculates for different ID types', () => {
      const ticket = calculateCollisionProbability('TICKET', 1000);
      const transaction = calculateCollisionProbability('TRANSACTION', 1000);

      // Transaction IDs have longer random parts, so lower collision probability
      expect(transaction.probability).toBeLessThan(ticket.probability);
    });

    it('throws error for unknown format', () => {
      expect(() => calculateCollisionProbability('UNKNOWN', 100))
        .toThrow('Unknown format: UNKNOWN');
    });

    it('provides birthday paradox approximation', () => {
      // For very small counts, probability should be very low
      const stats = calculateCollisionProbability('TICKET', 10);
      expect(stats.probability).toBeLessThan(0.001);
    });
  });

  describe('generateUUID', () => {
    it('generates valid UUID v4 format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('generates unique UUIDs', () => {
      const uuids = [];
      for (let i = 0; i < 100; i++) {
        uuids.push(generateUUID());
      }
      const unique = new Set(uuids);
      expect(unique.size).toBe(100);
    });

    it('has correct version and variant bits', () => {
      const uuid = generateUUID();
      const parts = uuid.split('-');

      // Version 4 check
      expect(parts[2].charAt(0)).toBe('4');

      // Variant check (should start with 8, 9, a, or b)
      expect(['8', '9', 'a', 'b']).toContain(parts[3].charAt(0));
    });
  });

  describe('generateShortId', () => {
    it('generates ID of correct length', () => {
      expect(generateShortId(8)).toHaveLength(8);
      expect(generateShortId(12)).toHaveLength(12);
    });

    it('uses Base58 characters', () => {
      const shortId = generateShortId(20);
      expect(shortId).toMatch(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
    });

    it('excludes confusing characters', () => {
      const shortId = generateShortId(100);
      expect(shortId).not.toContain('0');
      expect(shortId).not.toContain('O');
      expect(shortId).not.toContain('I');
      expect(shortId).not.toContain('l');
    });

    it('generates unique short IDs', () => {
      const ids = [];
      for (let i = 0; i < 100; i++) {
        ids.push(generateShortId());
      }
      const unique = new Set(ids);
      expect(unique.size).toBe(100);
    });
  });

  describe('generateNumericId', () => {
    it('generates numeric ID of correct length', () => {
      const id = generateNumericId(12);
      expect(id).toHaveLength(12);
      expect(id).toMatch(/^[0-9]+$/);
    });

    it('generates unique numeric IDs', () => {
      const ids = [];
      for (let i = 0; i < 100; i++) {
        ids.push(generateNumericId(16));
      }
      const unique = new Set(ids);
      expect(unique.size).toBe(100);
    });

    it('handles different lengths', () => {
      expect(generateNumericId(6)).toHaveLength(6);
      expect(generateNumericId(20)).toHaveLength(20);
    });
  });

  describe('generateHashId', () => {
    it('generates consistent hash for same input', () => {
      const input = 'test-input';
      const hash1 = generateHashId(input);
      const hash2 = generateHashId(input);
      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different inputs', () => {
      const hash1 = generateHashId('input1');
      const hash2 = generateHashId('input2');
      expect(hash1).not.toBe(hash2);
    });

    it('generates hash of correct length', () => {
      expect(generateHashId('test', 8)).toHaveLength(8);
      expect(generateHashId('test', 16)).toHaveLength(16);
    });

    it('uses uppercase hex characters', () => {
      const hash = generateHashId('test', 16);
      expect(hash).toMatch(/^[0-9A-F]+$/);
    });

    it('throws error for invalid input', () => {
      expect(() => generateHashId('', 8)).toThrow('Input must be a non-empty string');
      expect(() => generateHashId(null, 8)).toThrow('Input must be a non-empty string');
      expect(() => generateHashId(123, 8)).toThrow('Input must be a non-empty string');
    });

    it('handles long inputs consistently', () => {
      const longInput = 'a'.repeat(1000);
      const hash = generateHashId(longInput, 12);
      expect(hash).toHaveLength(12);

      // Should be reproducible
      const hash2 = generateHashId(longInput, 12);
      expect(hash).toBe(hash2);
    });
  });
});