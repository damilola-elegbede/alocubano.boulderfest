/**
 * Unit tests for lib/value-utils.js
 *
 * Tests the value normalization utilities that replace the problematic
 * `value || null` pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeToNull,
  optionalField,
  requiredField,
  isEmpty,
  isNotEmpty,
  coalesce,
  normalizeFields
} from '../../lib/value-utils.js';

describe('value-utils', () => {
  let consoleDebugSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('normalizeToNull', () => {
    describe('null/undefined handling', () => {
      it('should return null for undefined', () => {
        expect(normalizeToNull(undefined)).toBe(null);
      });

      it('should return null for null', () => {
        expect(normalizeToNull(null)).toBe(null);
      });
    });

    describe('string handling', () => {
      it('should return trimmed string for non-empty string', () => {
        expect(normalizeToNull('hello')).toBe('hello');
      });

      it('should return null for empty string', () => {
        expect(normalizeToNull('')).toBe(null);
      });

      it('should return null for whitespace-only string', () => {
        expect(normalizeToNull('   ')).toBe(null);
        expect(normalizeToNull('\t\n')).toBe(null);
      });

      it('should trim leading/trailing whitespace', () => {
        expect(normalizeToNull('  hello  ')).toBe('hello');
        expect(normalizeToNull('\thello\n')).toBe('hello');
      });

      it('should preserve internal whitespace', () => {
        expect(normalizeToNull('hello world')).toBe('hello world');
        expect(normalizeToNull('  hello world  ')).toBe('hello world');
      });
    });

    describe('non-string falsy values', () => {
      it('should preserve zero', () => {
        expect(normalizeToNull(0)).toBe(0);
      });

      it('should preserve false', () => {
        expect(normalizeToNull(false)).toBe(false);
      });

      it('should preserve NaN', () => {
        expect(Number.isNaN(normalizeToNull(NaN))).toBe(true);
      });
    });

    describe('truthy values', () => {
      it('should preserve numbers', () => {
        expect(normalizeToNull(42)).toBe(42);
        expect(normalizeToNull(-1)).toBe(-1);
        expect(normalizeToNull(3.14)).toBe(3.14);
      });

      it('should preserve objects', () => {
        const obj = { key: 'value' };
        expect(normalizeToNull(obj)).toBe(obj);
      });

      it('should preserve arrays', () => {
        const arr = [1, 2, 3];
        expect(normalizeToNull(arr)).toBe(arr);
      });

      it('should preserve functions', () => {
        const fn = () => {};
        expect(normalizeToNull(fn)).toBe(fn);
      });
    });

    describe('options', () => {
      it('should log when logEmpty is true and string is empty', () => {
        normalizeToNull('', 'testField', { logEmpty: true });
        expect(consoleDebugSpy).toHaveBeenCalledWith(
          '[value-utils] Empty string converted to null: testField'
        );
      });

      it('should not log when logEmpty is false', () => {
        normalizeToNull('', 'testField', { logEmpty: false });
        expect(consoleDebugSpy).not.toHaveBeenCalled();
      });

      it('should not log when fieldName is null', () => {
        normalizeToNull('', null, { logEmpty: true });
        expect(consoleDebugSpy).not.toHaveBeenCalled();
      });

      it('should not trim when trim is false', () => {
        expect(normalizeToNull('  hello  ', null, { trim: false })).toBe('  hello  ');
      });

      it('should return null for empty string even when trim is false', () => {
        expect(normalizeToNull('', null, { trim: false })).toBe(null);
      });

      it('should not return null for whitespace when trim is false', () => {
        expect(normalizeToNull('   ', null, { trim: false })).toBe('   ');
      });
    });
  });

  describe('optionalField', () => {
    it('should normalize empty strings to null', () => {
      expect(optionalField('')).toBe(null);
    });

    it('should normalize whitespace to null', () => {
      expect(optionalField('   ')).toBe(null);
    });

    it('should trim and return non-empty strings', () => {
      expect(optionalField('  value  ')).toBe('value');
    });

    it('should return null for undefined', () => {
      expect(optionalField(undefined)).toBe(null);
    });

    it('should return null for null', () => {
      expect(optionalField(null)).toBe(null);
    });

    it('should preserve zero', () => {
      expect(optionalField(0)).toBe(0);
    });

    it('should preserve false', () => {
      expect(optionalField(false)).toBe(false);
    });

    it('should not log by default', () => {
      optionalField('', 'testField');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('requiredField', () => {
    it('should warn when value is empty', () => {
      requiredField('', 'requiredFieldName');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[value-utils] Required field is empty: requiredFieldName'
      );
    });

    it('should warn when value is null', () => {
      requiredField(null, 'requiredFieldName');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[value-utils] Required field is empty: requiredFieldName'
      );
    });

    it('should warn when value is undefined', () => {
      requiredField(undefined, 'requiredFieldName');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[value-utils] Required field is empty: requiredFieldName'
      );
    });

    it('should log debug when converting empty string', () => {
      requiredField('', 'requiredFieldName');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[value-utils] Empty string converted to null: requiredFieldName'
      );
    });

    it('should not warn when value is present', () => {
      const result = requiredField('value', 'requiredFieldName');
      expect(result).toBe('value');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not warn when value is zero', () => {
      const result = requiredField(0, 'requiredFieldName');
      expect(result).toBe(0);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not warn when value is false', () => {
      const result = requiredField(false, 'requiredFieldName');
      expect(result).toBe(false);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('isEmpty', () => {
    it('should return true for null', () => {
      expect(isEmpty(null)).toBe(true);
    });

    it('should return true for undefined', () => {
      expect(isEmpty(undefined)).toBe(true);
    });

    it('should return true for empty string', () => {
      expect(isEmpty('')).toBe(true);
    });

    it('should return true for whitespace-only string', () => {
      expect(isEmpty('   ')).toBe(true);
      expect(isEmpty('\t\n')).toBe(true);
    });

    it('should return false for non-empty string', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty('  hello  ')).toBe(false);
    });

    it('should return false for zero', () => {
      expect(isEmpty(0)).toBe(false);
    });

    it('should return false for false', () => {
      expect(isEmpty(false)).toBe(false);
    });

    it('should return false for objects', () => {
      expect(isEmpty({})).toBe(false);
      expect(isEmpty([])).toBe(false);
    });
  });

  describe('isNotEmpty', () => {
    it('should return false for null', () => {
      expect(isNotEmpty(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isNotEmpty(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isNotEmpty('')).toBe(false);
    });

    it('should return true for non-empty string', () => {
      expect(isNotEmpty('hello')).toBe(true);
    });

    it('should return true for zero', () => {
      expect(isNotEmpty(0)).toBe(true);
    });

    it('should return true for false', () => {
      expect(isNotEmpty(false)).toBe(true);
    });
  });

  describe('coalesce', () => {
    it('should return first non-empty value', () => {
      expect(coalesce('first', 'second')).toBe('first');
    });

    it('should skip empty strings', () => {
      expect(coalesce('', 'second')).toBe('second');
    });

    it('should skip whitespace-only strings', () => {
      expect(coalesce('   ', 'second')).toBe('second');
    });

    it('should skip null', () => {
      expect(coalesce(null, 'second')).toBe('second');
    });

    it('should skip undefined', () => {
      expect(coalesce(undefined, 'second')).toBe('second');
    });

    it('should return null if all values are empty', () => {
      expect(coalesce('', null, undefined, '   ')).toBe(null);
    });

    it('should return zero if first non-empty', () => {
      expect(coalesce('', 0, 'fallback')).toBe(0);
    });

    it('should return false if first non-empty', () => {
      expect(coalesce('', false, 'fallback')).toBe(false);
    });

    it('should trim string values', () => {
      expect(coalesce('', '  value  ')).toBe('value');
    });

    it('should handle multiple fallbacks', () => {
      expect(coalesce('', '', '', 'fourth')).toBe('fourth');
    });
  });

  describe('normalizeFields', () => {
    it('should normalize specified fields', () => {
      const obj = {
        name: 'John',
        phone: '',
        email: '  john@example.com  '
      };
      const result = normalizeFields(obj, ['phone', 'email']);
      expect(result).toEqual({
        name: 'John',
        phone: null,
        email: 'john@example.com'
      });
    });

    it('should not modify original object', () => {
      const obj = { name: 'John', phone: '' };
      const result = normalizeFields(obj, ['phone']);
      expect(obj.phone).toBe('');
      expect(result.phone).toBe(null);
    });

    it('should handle non-existent fields', () => {
      const obj = { name: 'John' };
      const result = normalizeFields(obj, ['phone']);
      expect(result).toEqual({ name: 'John' });
    });

    it('should preserve non-specified fields', () => {
      const obj = { name: '  John  ', phone: '' };
      const result = normalizeFields(obj, ['phone']);
      expect(result.name).toBe('  John  '); // Not normalized
      expect(result.phone).toBe(null);
    });

    it('should handle empty fields array', () => {
      const obj = { name: 'John' };
      const result = normalizeFields(obj, []);
      expect(result).toEqual({ name: 'John' });
    });
  });

  describe('real-world scenarios', () => {
    describe('form submission', () => {
      it('should handle typical form data', () => {
        const formData = {
          firstName: 'John',
          lastName: '',
          phone: '   ',
          email: '  john@example.com  '
        };

        const normalized = normalizeFields(formData, [
          'firstName',
          'lastName',
          'phone',
          'email'
        ]);

        expect(normalized).toEqual({
          firstName: 'John',
          lastName: null,
          phone: null,
          email: 'john@example.com'
        });
      });
    });

    describe('API response handling', () => {
      it('should handle nested optional chaining results', () => {
        const session = {
          customer_details: {
            email: '',
            name: '  Jane Doe  '
          },
          customer_email: null
        };

        // This is how the pattern should be used in API handlers
        const email = coalesce(
          session.customer_details?.email,
          session.customer_email
        );
        const name = optionalField(session.customer_details?.name);

        expect(email).toBe(null);
        expect(name).toBe('Jane Doe');
      });
    });

    describe('database insertion', () => {
      it('should prepare values for database', () => {
        const customerInfo = {
          phone: '',
          postalCode: '  90210  '
        };

        const dbValues = {
          phone: optionalField(customerInfo.phone),
          postal_code: optionalField(customerInfo.postalCode)
        };

        expect(dbValues).toEqual({
          phone: null,
          postal_code: '90210'
        });
      });
    });

    describe('audit logging', () => {
      it('should warn about missing required audit fields', () => {
        const auditData = {
          adminUser: '',
          sessionId: null,
          action: 'update'
        };

        const normalized = {
          adminUser: requiredField(auditData.adminUser, 'adminUser'),
          sessionId: requiredField(auditData.sessionId, 'sessionId'),
          action: optionalField(auditData.action)
        };

        expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
        expect(normalized).toEqual({
          adminUser: null,
          sessionId: null,
          action: 'update'
        });
      });
    });

    describe('comparison with || null pattern', () => {
      it('should differ from || null for zero', () => {
        const value = 0;

        // Old pattern (broken for zero)
        const oldResult = value || null;

        // New pattern (correct)
        const newResult = optionalField(value);

        expect(oldResult).toBe(null); // WRONG!
        expect(newResult).toBe(0); // CORRECT
      });

      it('should differ from || null for false', () => {
        const value = false;

        // Old pattern (broken for false)
        const oldResult = value || null;

        // New pattern (correct)
        const newResult = optionalField(value);

        expect(oldResult).toBe(null); // WRONG!
        expect(newResult).toBe(false); // CORRECT
      });

      it('should behave same as || null for undefined', () => {
        const value = undefined;

        const oldResult = value || null;
        const newResult = optionalField(value);

        expect(oldResult).toBe(null);
        expect(newResult).toBe(null);
      });

      it('should behave same as || null for empty string', () => {
        const value = '';

        const oldResult = value || null;
        const newResult = optionalField(value);

        expect(oldResult).toBe(null);
        expect(newResult).toBe(null);
      });
    });
  });
});
