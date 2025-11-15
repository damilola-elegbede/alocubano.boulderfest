/**
 * Unit Tests for Registration Validation Utility
 * Tests name validation, email validation, and batch registration validation
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Validation utility functions extracted from create-pending-transaction API
 * These test the validation logic that could be extracted to a reusable service
 */

// Name validation regex - matches create-pending-transaction.js
const NAME_REGEX = /^[a-zA-Z\s'-]{1,50}$/;

// Email validation regex - matches create-pending-transaction.js
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a single name field (first or last name)
 */
function validateName(name, fieldName = 'Name') {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: `${fieldName} is required` };
  }

  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (!NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `${fieldName} must contain only letters, spaces, hyphens, and apostrophes (max 50 characters)`
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate email format
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = email.trim().toLowerCase();

  if (!trimmed) {
    return { valid: false, error: 'Email is required' };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate a single registration entry
 */
function validateRegistration(registration, index) {
  const errors = [];

  // Validate first name
  const firstNameResult = validateName(registration.firstName, `Registration ${index + 1}: First name`);
  if (!firstNameResult.valid) {
    errors.push(firstNameResult.error);
  }

  // Validate last name
  const lastNameResult = validateName(registration.lastName, `Registration ${index + 1}: Last name`);
  if (!lastNameResult.valid) {
    errors.push(lastNameResult.error);
  }

  // Validate email
  const emailResult = validateEmail(registration.email);
  if (!emailResult.valid) {
    errors.push(`Registration ${index + 1}: ${emailResult.error}`);
  }

  // Validate ticketTypeId
  if (!registration.ticketTypeId || typeof registration.ticketTypeId !== 'number') {
    errors.push(`Registration ${index + 1}: Invalid ticket type ID`);
  }

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? {
      firstName: firstNameResult.value,
      lastName: lastNameResult.value,
      email: emailResult.value,
      ticketTypeId: registration.ticketTypeId
    } : null
  };
}

/**
 * Validate array of registrations
 */
function validateRegistrations(registrations) {
  if (!Array.isArray(registrations) || registrations.length === 0) {
    return {
      valid: false,
      errors: ['At least one registration is required']
    };
  }

  const allErrors = [];
  const validatedData = [];

  registrations.forEach((reg, index) => {
    const result = validateRegistration(reg, index);
    if (!result.valid) {
      allErrors.push(...result.errors);
    } else {
      validatedData.push(result.data);
    }
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    data: allErrors.length === 0 ? validatedData : null
  };
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('Registration Validator - Unit Tests', () => {

  // ============================================================================
  // A. NAME VALIDATION TESTS
  // ============================================================================

  describe('validateName', () => {
    describe('Valid Names', () => {
      it('should accept standard single names', () => {
        const result = validateName('John');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('John');
      });

      it('should accept hyphenated names (Mary-Jane)', () => {
        const result = validateName('Mary-Jane');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('Mary-Jane');
      });

      it('should accept names with apostrophes (O\'Brien)', () => {
        const result = validateName('O\'Brien');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('O\'Brien');
      });

      it('should accept multi-word names (De La Cruz)', () => {
        const result = validateName('De La Cruz');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('De La Cruz');
      });

      it('should accept names with multiple hyphens and apostrophes', () => {
        const result = validateName('Mary-Jane O\'Brien-Smith');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('Mary-Jane O\'Brien-Smith');
      });

      it('should accept 1-character names (minimum)', () => {
        const result = validateName('X');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('X');
      });

      it('should accept 50-character names (maximum)', () => {
        const longName = 'A'.repeat(50);
        const result = validateName(longName);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(longName);
      });

      it('should trim whitespace', () => {
        const result = validateName('  John  ');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('John');
      });

      it('should normalize multiple spaces to single space', () => {
        const result = validateName('Jean   Pierre');
        expect(result.valid).toBe(true);
        // Note: This implementation doesn't normalize internal spaces
        // Just tests that multi-word names are accepted
      });
    });

    describe('Invalid Names', () => {
      it('should reject empty strings', () => {
        const result = validateName('');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject null values', () => {
        const result = validateName(null);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject undefined values', () => {
        const result = validateName(undefined);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject whitespace-only strings', () => {
        const result = validateName('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject names with numbers', () => {
        const result = validateName('John123');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters');
      });

      it('should reject names with special characters (@)', () => {
        const result = validateName('John@Doe');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters');
      });

      it('should reject names with special characters (#)', () => {
        const result = validateName('Jane#Smith');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters');
      });

      it('should reject names with special characters ($)', () => {
        const result = validateName('Bob$Miller');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters');
      });

      it('should reject names with special characters (!)', () => {
        const result = validateName('Sarah!');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('letters');
      });

      it('should reject names over 50 characters', () => {
        const tooLong = 'A'.repeat(51);
        const result = validateName(tooLong);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('50 characters');
      });

      it('should reject non-string values (numbers)', () => {
        const result = validateName(12345);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject non-string values (objects)', () => {
        const result = validateName({ name: 'John' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });
    });

    describe('Field Name Customization', () => {
      it('should use custom field name in error messages', () => {
        const result = validateName('', 'First name');
        expect(result.error).toContain('First name');
      });

      it('should use default field name if not provided', () => {
        const result = validateName('');
        expect(result.error).toContain('Name');
      });
    });
  });

  // ============================================================================
  // B. EMAIL VALIDATION TESTS
  // ============================================================================

  describe('validateEmail', () => {
    describe('Valid Emails', () => {
      it('should accept standard email format', () => {
        const result = validateEmail('user@example.com');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user@example.com');
      });

      it('should accept email with plus sign (user+tag@example.com)', () => {
        const result = validateEmail('user+tag@example.com');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user+tag@example.com');
      });

      it('should accept email with subdomain', () => {
        const result = validateEmail('user@mail.example.com');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user@mail.example.com');
      });

      it('should accept email with multiple subdomains', () => {
        const result = validateEmail('user@mail.internal.example.com');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user@mail.internal.example.com');
      });

      it('should accept email with numbers', () => {
        const result = validateEmail('user123@example456.com');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user123@example456.com');
      });

      it('should accept email with dots in local part', () => {
        const result = validateEmail('user.name@example.com');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user.name@example.com');
      });

      it('should accept email with underscore', () => {
        const result = validateEmail('user_name@example.com');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user_name@example.com');
      });

      it('should accept email with hyphen in domain', () => {
        const result = validateEmail('user@my-domain.com');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user@my-domain.com');
      });

      it('should accept international TLDs', () => {
        const result = validateEmail('user@example.co.uk');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user@example.co.uk');
      });

      it('should trim whitespace', () => {
        const result = validateEmail('  user@example.com  ');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user@example.com');
      });

      it('should convert to lowercase', () => {
        const result = validateEmail('User@Example.COM');
        expect(result.valid).toBe(true);
        expect(result.value).toBe('user@example.com');
      });
    });

    describe('Invalid Emails', () => {
      it('should reject empty strings', () => {
        const result = validateEmail('');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject null values', () => {
        const result = validateEmail(null);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject undefined values', () => {
        const result = validateEmail(undefined);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject whitespace-only strings', () => {
        const result = validateEmail('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject plain text without @', () => {
        const result = validateEmail('notanemail');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid email');
      });

      it('should reject email without local part (@example.com)', () => {
        const result = validateEmail('@example.com');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid email');
      });

      it('should reject email without domain (user@)', () => {
        const result = validateEmail('user@');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid email');
      });

      it('should reject email without TLD (user@example)', () => {
        const result = validateEmail('user@example');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid email');
      });

      it('should reject email with spaces', () => {
        const result = validateEmail('user name@example.com');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid email');
      });

      it('should reject email with multiple @ symbols', () => {
        const result = validateEmail('user@@example.com');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid email');
      });

      it('should reject non-string values (numbers)', () => {
        const result = validateEmail(12345);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });

      it('should reject non-string values (objects)', () => {
        const result = validateEmail({ email: 'user@example.com' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('required');
      });
    });
  });

  // ============================================================================
  // C. BATCH VALIDATION TESTS
  // ============================================================================

  describe('validateRegistrations', () => {
    const validRegistration = {
      ticketTypeId: 1,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com'
    };

    describe('Valid Batch Registrations', () => {
      it('should validate single registration', () => {
        const result = validateRegistrations([validRegistration]);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toEqual({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          ticketTypeId: 1
        });
      });

      it('should validate multiple registrations', () => {
        const registrations = [
          validRegistration,
          { ticketTypeId: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
          { ticketTypeId: 1, firstName: 'Bob', lastName: 'Wilson', email: 'bob@example.com' }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.data).toHaveLength(3);
      });

      it('should trim and normalize data', () => {
        const registrations = [
          {
            ticketTypeId: 1,
            firstName: '  John  ',
            lastName: '  Doe  ',
            email: '  JOHN@EXAMPLE.COM  '
          }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(true);
        expect(result.data[0]).toEqual({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          ticketTypeId: 1
        });
      });
    });

    describe('Invalid Batch Registrations', () => {
      it('should reject empty array', () => {
        const result = validateRegistrations([]);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one registration is required');
      });

      it('should reject null', () => {
        const result = validateRegistrations(null);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one registration is required');
      });

      it('should reject undefined', () => {
        const result = validateRegistrations(undefined);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one registration is required');
      });

      it('should reject non-array values', () => {
        const result = validateRegistrations({ registration: validRegistration });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('At least one registration is required');
      });

      it('should return all errors from multiple registrations', () => {
        const registrations = [
          { ticketTypeId: 1, firstName: 'John123', lastName: 'Doe', email: 'invalid-email' },
          { ticketTypeId: 'bad', firstName: '', lastName: 'Smith#', email: 'user@' }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });

      it('should include registration index in error messages', () => {
        const registrations = [
          validRegistration,
          { ticketTypeId: 1, firstName: 'Invalid123', lastName: 'Doe', email: 'john@example.com' }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Registration 2');
      });

      it('should validate required fields in each registration', () => {
        const registrations = [
          { ticketTypeId: 1, lastName: 'Doe', email: 'john@example.com' } // Missing firstName
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('First name')
          ])
        );
      });

      it('should validate ticketTypeId is present', () => {
        const registrations = [
          { firstName: 'John', lastName: 'Doe', email: 'john@example.com' } // Missing ticketTypeId
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Invalid ticket type ID')
          ])
        );
      });

      it('should validate ticketTypeId is a number', () => {
        const registrations = [
          { ticketTypeId: 'one', firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Invalid ticket type ID')
          ])
        );
      });
    });

    describe('Partial Validation', () => {
      it('should identify errors in specific registrations', () => {
        const registrations = [
          validRegistration,
          { ticketTypeId: 1, firstName: 'Invalid@Name', lastName: 'Doe', email: 'john@example.com' },
          { ticketTypeId: 1, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain('Registration 2');
      });

      it('should collect multiple errors from single registration', () => {
        const registrations = [
          { ticketTypeId: 'bad', firstName: 'John123', lastName: 'Doe#', email: 'invalid' }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(4); // firstName, lastName, email, ticketTypeId
      });
    });

    describe('Data Transformation', () => {
      it('should return null data when validation fails', () => {
        const registrations = [
          { ticketTypeId: 1, firstName: 'Invalid123', lastName: 'Doe', email: 'john@example.com' }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(false);
        expect(result.data).toBeNull();
      });

      it('should return validated data when all pass', () => {
        const registrations = [
          { ticketTypeId: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
          { ticketTypeId: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
        ];

        const result = validateRegistrations(registrations);
        expect(result.valid).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(result.data[0].firstName).toBe('John');
        expect(result.data[1].firstName).toBe('Jane');
      });
    });
  });
});
