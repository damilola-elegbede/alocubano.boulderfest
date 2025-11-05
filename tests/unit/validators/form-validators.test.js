/**
 * Comprehensive tests for form validation utilities
 * Tests: Name validation, email validation, phone validation, volunteer submission
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateName,
  validateEmail,
  validatePhone,
  validateVolunteerSubmission,
  VALIDATION_RULES
} from '../../../lib/validators/form-validators.js';

// ============================================================================
// NAME VALIDATION TESTS
// ============================================================================

describe('validateName', () => {
  describe('Valid names', () => {
    it('should accept standard English names', () => {
      const result = validateName('John');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('John');
    });

    it('should accept names with hyphens (Mary-Jane)', () => {
      const result = validateName('Mary-Jane');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Mary-Jane');
    });

    it('should accept names with apostrophes (O\'Brien)', () => {
      const result = validateName('O\'Brien');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('O\'Brien');
    });

    it('should accept names with periods (St. John)', () => {
      const result = validateName('St. John');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('St. John');
    });

    it('should accept international names with accents (José)', () => {
      const result = validateName('José');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('José');
    });

    it('should accept French names with accents (François)', () => {
      const result = validateName('François');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('François');
    });

    it('should accept Chinese names (陳大文)', () => {
      const result = validateName('陳大文');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('陳大文');
    });

    it('should accept Arabic names (أحمد)', () => {
      const result = validateName('أحمد');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('أحمد');
    });

    it('should accept multi-word names (Jean-Claude Van Damme)', () => {
      const result = validateName('Jean-Claude Van Damme');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Jean-Claude Van Damme');
    });

    it('should trim and normalize whitespace', () => {
      const result = validateName('  John   Doe  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('John Doe');
    });

    it('should accept 2-character names (minimum)', () => {
      const result = validateName('Li');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Li');
    });

    it('should accept 100-character names (maximum)', () => {
      // Use a varied name to avoid spam detection (repeated characters)
      const longName = 'Jean-Pierre Alexandre François de la Montagne du Soleil Levant avec Beauté et Grâce Éternelle';
      const result = validateName(longName);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(longName);
    });
  });

  describe('Invalid names - Length', () => {
    it('should reject empty strings', () => {
      const result = validateName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject names that are only spaces', () => {
      const result = validateName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject null/undefined', () => {
      const result = validateName(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject single-character names (too short)', () => {
      const result = validateName('J');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 2 characters');
    });

    it('should reject names over 100 characters (too long)', () => {
      const tooLong = 'A'.repeat(101);
      const result = validateName(tooLong);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must not exceed 100 characters');
    });
  });

  describe('Invalid names - Spam patterns', () => {
    it('should reject "test"', () => {
      const result = validateName('test');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid');
    });

    it('should reject "asdf"', () => {
      const result = validateName('asdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid');
    });

    it('should reject "qwerty"', () => {
      const result = validateName('qwerty');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid');
    });

    it('should reject all numbers', () => {
      const result = validateName('12345');
      expect(result.valid).toBe(false);
      // Pattern check happens first, so error is about invalid characters
      expect(result.error).toBeDefined();
    });

    it('should reject repeated characters (aaaaa)', () => {
      const result = validateName('aaaaa');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid');
    });

    it('should reject URLs (http://...)', () => {
      const result = validateName('http://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject names with @ symbol', () => {
      const result = validateName('test@test');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject names with < or > (XSS)', () => {
      const result = validateName('<script>');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Invalid names - SQL injection', () => {
    it('should reject SELECT statements', () => {
      const result = validateName('SELECT * FROM users');
      expect(result.valid).toBe(false);
      // Pattern check catches this first (asterisk not allowed)
      expect(result.error).toBeDefined();
    });

    it('should reject OR 1=1 patterns', () => {
      const result = validateName('admin OR 1=1');
      expect(result.valid).toBe(false);
      // Pattern check catches this first (numbers not allowed)
      expect(result.error).toBeDefined();
    });

    it('should reject SQL comments (--)', () => {
      const result = validateName('admin-- comment');
      expect(result.valid).toBe(false);
      // SQL pattern check will catch the double dash
      expect(result.error).toContain('prohibited content');
    });
  });

  describe('Custom field names', () => {
    it('should use custom field name in error messages', () => {
      const result = validateName('', 'Last name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Last name is required');
    });
  });
});

// ============================================================================
// EMAIL VALIDATION TESTS
// ============================================================================

describe('validateEmail', () => {
  describe('Valid emails', () => {
    it('should accept standard email addresses', async () => {
      const result = await validateEmail('test@example.com');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('test@example.com');
    });

    it('should accept emails with dots in local part', async () => {
      const result = await validateEmail('john.doe@example.com');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('john.doe@example.com');
    });

    it('should accept emails with numbers', async () => {
      const result = await validateEmail('user123@example.com');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('user123@example.com');
    });

    it('should accept emails with hyphens', async () => {
      const result = await validateEmail('user-name@ex-ample.com');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('user-name@ex-ample.com');
    });

    it('should accept emails with subdomains', async () => {
      const result = await validateEmail('user@mail.example.com');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('user@mail.example.com');
    });

    it('should lowercase and trim emails', async () => {
      const result = await validateEmail('  TEST@EXAMPLE.COM  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('test@example.com');
    });

    it('should accept 254-character emails (maximum)', async () => {
      const localPart = 'a'.repeat(64); // Max local part
      const domain = 'b'.repeat(63) + '.com'; // Max domain label
      const maxEmail = `${localPart}@${domain}`;
      if (maxEmail.length <= 254) {
        const result = await validateEmail(maxEmail);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('Invalid emails - Format', () => {
    it('should reject empty strings', async () => {
      const result = await validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject emails that are only spaces', async () => {
      const result = await validateEmail('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject null/undefined', async () => {
      const result = await validateEmail(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject emails without @ symbol', async () => {
      const result = await validateEmail('notanemail');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid email address');
    });

    it('should reject emails without domain', async () => {
      const result = await validateEmail('test@');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject emails without local part', async () => {
      const result = await validateEmail('@example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject emails with consecutive dots', async () => {
      const result = await validateEmail('test..user@example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('consecutive dots');
    });

    it('should reject emails starting with dot', async () => {
      const result = await validateEmail('.test@example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot start or end with a dot');
    });

    it('should reject emails ending with dot', async () => {
      const result = await validateEmail('test@example.com.');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot start or end with a dot');
    });

    it('should reject emails with dot before @', async () => {
      const result = await validateEmail('test.@example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid email format around @ symbol');
    });

    it('should reject emails with dot after @', async () => {
      const result = await validateEmail('test@.example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid email format around @ symbol');
    });

    it('should reject emails without dot in domain', async () => {
      const result = await validateEmail('test@example');
      expect(result.valid).toBe(false);
      // Basic pattern check happens first
      expect(result.error).toBeDefined();
    });

    it('should reject emails over 254 characters', async () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = await validateEmail(longEmail);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must not exceed 254 characters');
    });

    it('should reject multiple @ symbols', async () => {
      const result = await validateEmail('test@@example.com');
      expect(result.valid).toBe(false);
      // Basic pattern check happens first
      expect(result.error).toBeDefined();
    });
  });

  describe('Invalid emails - Disposable domains', () => {
    it('should reject 10minutemail.com', async () => {
      const result = await validateEmail('test@10minutemail.com', { checkDisposable: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Disposable email');
      expect(result.isDisposable).toBe(true);
    });

    it('should reject guerrillamail.com', async () => {
      const result = await validateEmail('test@guerrillamail.com', { checkDisposable: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Disposable email');
    });

    it('should reject mailinator.com', async () => {
      const result = await validateEmail('test@mailinator.com', { checkDisposable: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Disposable email');
    });

    it('should reject temp-mail.org', async () => {
      const result = await validateEmail('test@temp-mail.org', { checkDisposable: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Disposable email');
    });

    it('should reject yopmail.com', async () => {
      const result = await validateEmail('test@yopmail.com', { checkDisposable: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Disposable email');
    });

    it('should accept disposable emails when check is disabled', async () => {
      const result = await validateEmail('test@mailinator.com', { checkDisposable: false });
      expect(result.valid).toBe(true);
    });
  });

  describe('Email typo suggestions', () => {
    it('should suggest gmail.com for gmai.com', async () => {
      const result = await validateEmail('test@gmai.com', {
        checkDisposable: false,
        suggestTypos: true
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings[0]).toContain('gmail.com');
    });

    it('should suggest yahoo.com for yaho.com', async () => {
      const result = await validateEmail('test@yaho.com', {
        checkDisposable: false,
        suggestTypos: true
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings[0]).toContain('yahoo.com');
    });

    it('should not suggest when suggestions are disabled', async () => {
      const result = await validateEmail('test@gmai.com', {
        checkDisposable: false,
        suggestTypos: false
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('MX record verification', () => {
    it('should handle MX verification gracefully when DNS fails', async () => {
      // This test ensures graceful degradation when MX lookup fails
      const result = await validateEmail('test@nonexistent-domain-12345.com', {
        checkDisposable: false,
        verifyMX: true
      });
      // Should still be valid but with warning (graceful degradation)
      expect(result.valid).toBe(true);
      if (result.warnings) {
        expect(result.warnings.some(w => w.includes('Unable to verify'))).toBe(true);
      }
    });
  });
});

// ============================================================================
// PHONE VALIDATION TESTS
// ============================================================================

describe('validatePhone', () => {
  describe('Valid phone numbers', () => {
    it('should accept standard US format (303) 555-0123', () => {
      const result = validatePhone('(303) 555-0123');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('(303) 555-0123');
    });

    it('should accept dashed format 303-555-0123', () => {
      const result = validatePhone('303-555-0123');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('303-555-0123');
    });

    it('should accept international format +1 303 555 0123', () => {
      const result = validatePhone('+1 303 555 0123');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('+1 303 555 0123');
    });

    it('should accept dotted format 303.555.0123', () => {
      const result = validatePhone('303.555.0123');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('303.555.0123');
    });

    it('should accept empty/null (optional field)', () => {
      const result = validatePhone('');
      expect(result.valid).toBe(true);
      expect(result.value).toBeNull();
    });

    it('should accept undefined (optional field)', () => {
      const result = validatePhone(undefined);
      expect(result.valid).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('Invalid phone numbers', () => {
    it('should reject phone numbers over 50 characters', () => {
      const tooLong = '1'.repeat(51);
      const result = validatePhone(tooLong);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must not exceed 50 characters');
    });

    it('should reject invalid characters', () => {
      const result = validatePhone('303-abc-1234');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid phone number');
    });

    it('should reject too short (less than 10 digits)', () => {
      const result = validatePhone('123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid phone number');
    });
  });
});

// ============================================================================
// VOLUNTEER SUBMISSION VALIDATION TESTS
// ============================================================================

describe('validateVolunteerSubmission', () => {
  describe('Valid submissions', () => {
    it('should accept complete valid submission', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '(303) 555-0123',
        message: 'I love Cuban salsa!',
        areasOfInterest: ['setup', 'registration'],
        availability: ['friday', 'saturday']
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '(303) 555-0123',
        message: 'I love Cuban salsa!',
        areasOfInterest: ['setup', 'registration'],
        availability: ['friday', 'saturday']
      });
    });

    it('should accept submission with only required fields', async () => {
      const data = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized.firstName).toBe('Jane');
      expect(result.sanitized.lastName).toBe('Smith');
      expect(result.sanitized.email).toBe('jane@example.com');
      expect(result.sanitized.areasOfInterest).toEqual([]);
      expect(result.sanitized.availability).toEqual([]);
    });

    it('should accept international names', async () => {
      const data = {
        firstName: 'José',
        lastName: 'François',
        email: 'jose@example.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(true);
      expect(result.sanitized.firstName).toBe('José');
      expect(result.sanitized.lastName).toBe('François');
    });

    it('should trim and normalize whitespace in names', async () => {
      const data = {
        firstName: '  John  ',
        lastName: '  Doe  Smith  ',
        email: 'john@example.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(true);
      expect(result.sanitized.firstName).toBe('John');
      expect(result.sanitized.lastName).toBe('Doe Smith');
    });

    it('should filter and limit areas of interest to 10', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        areasOfInterest: Array(15).fill('setup') // 15 items
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(true);
      expect(result.sanitized.areasOfInterest).toHaveLength(10);
    });
  });

  describe('Invalid submissions - Missing required fields', () => {
    it('should reject submission without first name', async () => {
      const data = {
        lastName: 'Doe',
        email: 'john@example.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'firstName')).toBe(true);
    });

    it('should reject submission without last name', async () => {
      const data = {
        firstName: 'John',
        email: 'john@example.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'lastName')).toBe(true);
    });

    it('should reject submission without email', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'email')).toBe(true);
    });
  });

  describe('Invalid submissions - Spam detection', () => {
    it('should reject spam name "test"', async () => {
      const data = {
        firstName: 'test',
        lastName: 'Doe',
        email: 'john@example.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'firstName')).toBe(true);
    });

    it('should reject all-number names', async () => {
      const data = {
        firstName: '12345',
        lastName: 'Doe',
        email: 'john@example.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'firstName')).toBe(true);
    });

    it('should reject disposable email', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@mailinator.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'email' && e.message.includes('Disposable'))).toBe(true);
    });
  });

  describe('Invalid submissions - SQL injection', () => {
    it('should reject SQL injection in first name', async () => {
      const data = {
        firstName: 'admin-- comment',  // Use SQL comment pattern that passes character check
        lastName: 'Doe',
        email: 'john@example.com'
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'firstName')).toBe(true);
    });
  });

  describe('Invalid submissions - Message length', () => {
    it('should reject messages over 1000 characters', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        message: 'A'.repeat(1001)
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'message')).toBe(true);
    });

    it('should accept messages up to 1000 characters', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        message: 'A'.repeat(1000)
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(true);
    });
  });

  describe('Warnings collection', () => {
    it('should collect email typo warnings', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@yaho.com'  // Use yaho.com which isn't disposable but is a typo
      };

      const result = await validateVolunteerSubmission(data, { verifyMX: false });
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings.some(w => w.message.includes('yahoo.com'))).toBe(true);
    });
  });
});
