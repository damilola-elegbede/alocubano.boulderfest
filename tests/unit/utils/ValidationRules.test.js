import { describe, it, expect } from 'vitest';
import {
  NAME_REGEX,
  EMAIL_REGEX,
  PHONE_REGEX,
  INPUT_LIMITS,
  validateName,
  validateEmail,
  validatePhone,
  validateBatchSize,
  validateTicketId,
  validateRegistration,
  validateSubscription
} from './ValidationRules.js';

describe('ValidationRules', () => {
  describe('Regex Patterns', () => {
    describe('NAME_REGEX', () => {
      it('accepts valid names', () => {
        expect(NAME_REGEX.test('John')).toBe(true);
        expect(NAME_REGEX.test('Mary-Jane')).toBe(true);
        expect(NAME_REGEX.test("O'Connor")).toBe(true);
        expect(NAME_REGEX.test('José María')).toBe(true);
        expect(NAME_REGEX.test('Van der Berg')).toBe(true);
      });

      it('rejects invalid names', () => {
        expect(NAME_REGEX.test('J')).toBe(false); // Too short
        expect(NAME_REGEX.test('John123')).toBe(false); // Numbers
        expect(NAME_REGEX.test('John@')).toBe(false); // Special chars
        expect(NAME_REGEX.test('John_Doe')).toBe(false); // Underscore
        expect(NAME_REGEX.test('John.Doe')).toBe(false); // Period
        expect(NAME_REGEX.test('A'.repeat(51))).toBe(false); // Too long
      });

      it('handles edge cases', () => {
        expect(NAME_REGEX.test('')).toBe(false); // Empty
        expect(NAME_REGEX.test(' ')).toBe(false); // Just space
        expect(NAME_REGEX.test('--')).toBe(true); // Just hyphens (valid)
        expect(NAME_REGEX.test("''")).toBe(true); // Just apostrophes (valid)
      });
    });

    describe('EMAIL_REGEX', () => {
      it('accepts valid emails', () => {
        expect(EMAIL_REGEX.test('user@example.com')).toBe(true);
        expect(EMAIL_REGEX.test('test.email@domain.co.uk')).toBe(true);
        expect(EMAIL_REGEX.test('user+tag@example.org')).toBe(true);
        expect(EMAIL_REGEX.test('123@456.com')).toBe(true);
      });

      it('rejects invalid emails', () => {
        expect(EMAIL_REGEX.test('not-an-email')).toBe(false);
        expect(EMAIL_REGEX.test('user@@example.com')).toBe(false);
        expect(EMAIL_REGEX.test('@example.com')).toBe(false);
        expect(EMAIL_REGEX.test('user@')).toBe(false);
        expect(EMAIL_REGEX.test('user@.com')).toBe(false);
        expect(EMAIL_REGEX.test('user@com')).toBe(false);
      });
    });

    describe('PHONE_REGEX', () => {
      it('accepts valid phone numbers', () => {
        expect(PHONE_REGEX.test('1234567890')).toBe(true);
        expect(PHONE_REGEX.test('+1234567890')).toBe(true);
        expect(PHONE_REGEX.test('9876543210')).toBe(true);
        expect(PHONE_REGEX.test('+447123456789')).toBe(true);
      });

      it('rejects invalid phone numbers', () => {
        expect(PHONE_REGEX.test('0123456789')).toBe(false); // Starts with 0
        expect(PHONE_REGEX.test('abc123')).toBe(false); // Contains letters
        expect(PHONE_REGEX.test('123')).toBe(false); // Too short
        expect(PHONE_REGEX.test('')).toBe(false); // Empty
        expect(PHONE_REGEX.test('+')).toBe(false); // Just plus
      });
    });
  });

  describe('validateName', () => {
    it('validates correct names', () => {
      const result = validateName('John Doe');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('John Doe');
    });

    it('trims whitespace', () => {
      const result = validateName('  John Doe  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('John Doe');
    });

    it('rejects empty names', () => {
      const result = validateName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name is required');
    });

    it('rejects null/undefined', () => {
      expect(validateName(null).valid).toBe(false);
      expect(validateName(undefined).valid).toBe(false);
    });

    it('rejects non-string types', () => {
      expect(validateName(123).valid).toBe(false);
      expect(validateName({}).valid).toBe(false);
    });

    it('respects custom field names', () => {
      const result = validateName('', 'First Name');
      expect(result.error).toContain('First Name is required');
    });

    it('enforces minimum length', () => {
      const result = validateName('J');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 2 characters');
    });

    it('enforces maximum length', () => {
      const result = validateName('A'.repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not exceed 50 characters');
    });

    it('rejects invalid characters', () => {
      const result = validateName('John123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, spaces, hyphens, and apostrophes');
    });
  });

  describe('validateEmail', () => {
    it('validates correct emails', () => {
      const result = validateEmail('test@example.com');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('test@example.com');
    });

    it('converts to lowercase', () => {
      const result = validateEmail('TEST@EXAMPLE.COM');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('test@example.com');
    });

    it('trims whitespace', () => {
      const result = validateEmail('  test@example.com  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('test@example.com');
    });

    it('rejects empty emails', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email is required');
    });

    it('rejects invalid format', () => {
      const result = validateEmail('invalid-email');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid email format');
    });

    it('enforces maximum length', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = validateEmail(longEmail);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not exceed 255 characters');
    });
  });

  describe('validatePhone', () => {
    it('validates correct phone numbers', () => {
      const result = validatePhone('+1234567890');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('+1234567890');
    });

    it('cleans formatting', () => {
      const result = validatePhone('(123) 456-7890');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('1234567890');
    });

    it('removes spaces and dashes', () => {
      const result = validatePhone('123 456 7890');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('1234567890');
    });

    it('rejects empty phone', () => {
      const result = validatePhone('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Phone number is required');
    });

    it('rejects invalid format', () => {
      const result = validatePhone('abc123');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid phone number format');
    });

    it('enforces maximum length', () => {
      const result = validatePhone('1'.repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not exceed 50 characters');
    });
  });

  describe('validateBatchSize', () => {
    it('validates correct batch size', () => {
      const result = validateBatchSize([1, 2, 3]);
      expect(result.valid).toBe(true);
      expect(result.count).toBe(3);
    });

    it('rejects non-arrays', () => {
      const result = validateBatchSize('not-array');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Registrations must be an array');
    });

    it('rejects empty arrays', () => {
      const result = validateBatchSize([]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('At least one registration is required');
    });

    it('enforces maximum batch size', () => {
      const result = validateBatchSize(new Array(11).fill({}));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Maximum 10 registrations');
    });

    it('accepts maximum allowed size', () => {
      const result = validateBatchSize(new Array(10).fill({}));
      expect(result.valid).toBe(true);
      expect(result.count).toBe(10);
    });
  });

  describe('validateTicketId', () => {
    it('validates correct ticket ID format', () => {
      const result = validateTicketId('TKT-12345678-ABCDEF');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('TKT-12345678-ABCDEF');
    });

    it('trims whitespace', () => {
      const result = validateTicketId('  TKT-12345678-ABCDEF  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('TKT-12345678-ABCDEF');
    });

    it('rejects empty ticket ID', () => {
      const result = validateTicketId('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Ticket ID is required');
    });

    it('rejects invalid format', () => {
      const result = validateTicketId('invalid-id');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid ticket ID format');
    });

    it('rejects lowercase prefix', () => {
      const result = validateTicketId('tkt-12345678-ABCDEF');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid ticket ID format');
    });
  });

  describe('validateRegistration', () => {
    const validRegistration = {
      ticketId: 'TKT-12345678-ABCDEF',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com'
    };

    it('validates complete registration', () => {
      const result = validateRegistration(validRegistration);
      expect(result.valid).toBe(true);
      expect(result.sanitized.firstName).toBe('John');
      expect(result.sanitized.email).toBe('john@example.com');
    });

    it('rejects non-object input', () => {
      const result = validateRegistration('not-object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Registration must be an object');
    });

    it('collects multiple errors', () => {
      const result = validateRegistration({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('Ticket ID is required');
      expect(result.errors).toContain('First name is required');
    });

    it('sanitizes valid inputs', () => {
      const input = {
        ...validRegistration,
        firstName: '  John  ',
        email: '  JOHN@EXAMPLE.COM  '
      };
      const result = validateRegistration(input);
      expect(result.valid).toBe(true);
      expect(result.sanitized.firstName).toBe('John');
      expect(result.sanitized.email).toBe('john@example.com');
    });
  });

  describe('validateSubscription', () => {
    it('validates email-only subscription', () => {
      const result = validateSubscription({ email: 'test@example.com' });
      expect(result.valid).toBe(true);
      expect(result.sanitized.email).toBe('test@example.com');
    });

    it('validates complete subscription', () => {
      const input = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        source: 'website'
      };
      const result = validateSubscription(input);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        source: 'website'
      });
    });

    it('handles optional fields gracefully', () => {
      const result = validateSubscription({
        email: 'test@example.com',
        firstName: 'John'
      });
      expect(result.valid).toBe(true);
      expect(result.sanitized.email).toBe('test@example.com');
      expect(result.sanitized.firstName).toBe('John');
      expect(result.sanitized.lastName).toBeUndefined();
    });

    it('truncates long source field', () => {
      const result = validateSubscription({
        email: 'test@example.com',
        source: 'a'.repeat(150)
      });
      expect(result.valid).toBe(true);
      expect(result.sanitized.source.length).toBe(100);
    });

    it('rejects non-string source', () => {
      const result = validateSubscription({
        email: 'test@example.com',
        source: 123
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Source must be a string');
    });
  });

  describe('Input Limits', () => {
    it('defines correct constants', () => {
      expect(INPUT_LIMITS.NAME_MIN).toBe(2);
      expect(INPUT_LIMITS.NAME_MAX).toBe(50);
      expect(INPUT_LIMITS.EMAIL_MAX).toBe(255);
      expect(INPUT_LIMITS.PHONE_MAX).toBe(50);
      expect(INPUT_LIMITS.BATCH_MAX).toBe(10);
    });
  });
});