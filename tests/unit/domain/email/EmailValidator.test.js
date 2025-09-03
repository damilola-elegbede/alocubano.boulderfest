import { describe, it, expect } from 'vitest';
import { EmailValidator } from '../../../../api/lib/domain/email/EmailValidator.js';

describe('EmailValidator Domain Service', () => {
  describe('validateEmail()', () => {
    it('validates correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com',
        'firstname.lastname@company.co',
        'email@123.123.123.123', // IP address
        'user-name@example-domain.com'
      ];
      
      validEmails.forEach(email => {
        const result = EmailValidator.validateEmail(email);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized).toBe(email.toLowerCase());
      });
    });

    it('rejects missing or empty emails', () => {
      let result = EmailValidator.validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email address cannot be empty');

      result = EmailValidator.validateEmail(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email address is required');

      result = EmailValidator.validateEmail(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email address is required');
    });

    it('rejects non-string emails', () => {
      const result = EmailValidator.validateEmail(123);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email must be a string');
    });

    it('rejects invalid email formats', () => {
      const invalidEmails = [
        'invalid',
        'test@',
        '@domain.com',
        'test@domain',
        'test.domain.com',
        'test @domain.com',
        'test@domain .com',
        'test@.com',
        'test@com.',
        ''
      ];
      
      invalidEmails.forEach(email => {
        const result = EmailValidator.validateEmail(email);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('rejects emails with consecutive dots', () => {
      const result = EmailValidator.validateEmail('test..user@domain.com');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email address cannot contain consecutive dots');
    });

    it('rejects emails starting or ending with dots', () => {
      let result = EmailValidator.validateEmail('.test@domain.com');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email address cannot start or end with a dot');

      result = EmailValidator.validateEmail('test@domain.com.');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email address cannot start or end with a dot');
    });

    it('rejects emails with invalid @ symbol placement', () => {
      let result = EmailValidator.validateEmail('test@.domain.com');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format around @ symbol');

      result = EmailValidator.validateEmail('test.@domain.com');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format around @ symbol');
    });

    it('rejects emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      const result = EmailValidator.validateEmail(longEmail);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email address too long (maximum 254 characters)');
    });

    it('sanitizes email by converting to lowercase and trimming', () => {
      const result = EmailValidator.validateEmail('  TEST@EXAMPLE.COM  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('test@example.com');
    });

    it('detects common email typos', () => {
      const result = EmailValidator.validateEmail('test@gmai.com');
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('gmail.com'))).toBe(true);
    });
  });

  describe('checkCommonEmailTypos()', () => {
    it('detects Gmail typos', () => {
      const typos = ['gmai.com', 'gmial.com', 'gmaill.com', 'gmail.co'];
      typos.forEach(typo => {
        const warnings = EmailValidator.checkCommonEmailTypos(`test@${typo}`);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('gmail.com');
      });
    });

    it('detects Yahoo typos', () => {
      const warnings = EmailValidator.checkCommonEmailTypos('test@yaho.com');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('yahoo.com');
    });

    it('detects Hotmail typos', () => {
      const warnings = EmailValidator.checkCommonEmailTypos('test@hotmai.com');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('hotmail.com');
    });

    it('returns empty array for correct domains', () => {
      const warnings = EmailValidator.checkCommonEmailTypos('test@gmail.com');
      expect(warnings).toHaveLength(0);
    });

    it('handles emails without @ symbol', () => {
      const warnings = EmailValidator.checkCommonEmailTypos('invalid-email');
      expect(warnings).toHaveLength(0);
    });
  });

  describe('validateMarketingConsent()', () => {
    it('validates true consent', () => {
      const result = EmailValidator.validateMarketingConsent(true);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects false consent', () => {
      const result = EmailValidator.validateMarketingConsent(false);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Marketing consent is required to subscribe');
    });

    it('rejects missing consent', () => {
      let result = EmailValidator.validateMarketingConsent(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Marketing consent is required');

      result = EmailValidator.validateMarketingConsent(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Marketing consent is required');
    });

    it('rejects non-boolean consent', () => {
      const result = EmailValidator.validateMarketingConsent('true');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Marketing consent must be true or false');
    });
  });

  describe('validateName()', () => {
    it('validates correct names', () => {
      const validNames = [
        'John',
        'Mary-Jane',
        "O'Connor",
        'José Luis',
        'Van Der Berg',
        'Marie Claire'
      ];
      
      validNames.forEach(name => {
        const result = EmailValidator.validateName(name);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized).toBe(name.trim());
      });
    });

    it('handles optional names when not required', () => {
      let result = EmailValidator.validateName('', 'First name', false);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeNull();

      result = EmailValidator.validateName(null, 'First name', false);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeNull();
    });

    it('rejects missing required names', () => {
      const result = EmailValidator.validateName('', 'First name', true);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First name is required');
    });

    it('rejects non-string names', () => {
      const result = EmailValidator.validateName(123, 'First name');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First name must be a string');
    });

    it('rejects names that are too short', () => {
      const result = EmailValidator.validateName('A', 'First name');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First name must be at least 2 characters');
    });

    it('rejects names that are too long', () => {
      const longName = 'a'.repeat(101);
      const result = EmailValidator.validateName(longName, 'First name');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First name too long (maximum 100 characters)');
    });

    it('rejects names with invalid characters', () => {
      const invalidNames = [
        'John123',
        'Mary@Jane',
        'Test User!',
        'User<script>',
        'Name with numbers 42'
      ];
      
      invalidNames.forEach(name => {
        const result = EmailValidator.validateName(name, 'Name');
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Name can only contain letters, spaces, hyphens, and apostrophes');
      });
    });

    it('sanitizes names by trimming whitespace', () => {
      const result = EmailValidator.validateName('  John Doe  ', 'Name');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('John Doe');
    });
  });

  describe('validatePhone()', () => {
    it('validates correct phone numbers', () => {
      const validPhones = [
        '555-123-4567',
        '(555) 123-4567',
        '+1-555-123-4567',
        '555.123.4567',
        '5551234567',
        '+44 20 7946 0958'
      ];
      
      validPhones.forEach(phone => {
        const result = EmailValidator.validatePhone(phone);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitized).toBe(phone.trim());
      });
    });

    it('handles optional phone when not required', () => {
      let result = EmailValidator.validatePhone('', false);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeNull();

      result = EmailValidator.validatePhone(null, false);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeNull();
    });

    it('rejects missing required phone', () => {
      const result = EmailValidator.validatePhone('', true);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Phone number is required');
    });

    it('rejects non-string phone', () => {
      const result = EmailValidator.validatePhone(123456789);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Phone number must be a string');
    });

    it('rejects phone that is too long', () => {
      const longPhone = '1'.repeat(51);
      const result = EmailValidator.validatePhone(longPhone);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Phone number too long (maximum 50 characters)');
    });

    it('rejects invalid phone formats', () => {
      const invalidPhones = [
        'abc-def-ghij',
        '123',
        'phone number',
        '123-abc-4567'
      ];
      
      invalidPhones.forEach(phone => {
        const result = EmailValidator.validatePhone(phone);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Invalid phone number format');
      });
    });

    it('sanitizes phone by trimming whitespace', () => {
      const result = EmailValidator.validatePhone('  555-123-4567  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('555-123-4567');
    });
  });

  describe('validateSource()', () => {
    it('handles valid sources', () => {
      const result = EmailValidator.validateSource('newsletter_signup');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('newsletter_signup');
    });

    it('provides default for missing source', () => {
      let result = EmailValidator.validateSource(null);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('website');

      result = EmailValidator.validateSource('');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('website');
    });

    it('truncates long sources', () => {
      const longSource = 'a'.repeat(150);
      const result = EmailValidator.validateSource(longSource);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toHaveLength(100);
    });

    it('handles non-string sources', () => {
      const result = EmailValidator.validateSource(123);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('website');
    });
  });

  describe('validateAttributes()', () => {
    it('validates valid attributes', () => {
      const attributes = {
        source: 'newsletter',
        campaign: 'summer2026',
        referrer: 'facebook',
        age: 25,
        subscribe_newsletter: true
      };
      
      const result = EmailValidator.validateAttributes(attributes);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized).toEqual(attributes);
    });

    it('handles missing attributes', () => {
      const result = EmailValidator.validateAttributes(null);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual({});
    });

    it('rejects non-object attributes', () => {
      let result = EmailValidator.validateAttributes('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Attributes must be an object');

      result = EmailValidator.validateAttributes([1, 2, 3]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Attributes must be an object');
    });

    it('rejects too many attributes', () => {
      const tooManyAttributes = {};
      for (let i = 0; i < 21; i++) {
        tooManyAttributes[`attr${i}`] = `value${i}`;
      }
      
      const result = EmailValidator.validateAttributes(tooManyAttributes);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Too many attributes (maximum 20)');
    });

    it('sanitizes string attribute values', () => {
      const attributes = {
        longString: 'a'.repeat(600),
        normalString: '  test  '
      };
      
      const result = EmailValidator.validateAttributes(attributes);
      expect(result.valid).toBe(true);
      expect(result.sanitized.longString).toHaveLength(500);
      expect(result.sanitized.normalString).toBe('test');
    });

    it('rejects invalid attribute keys and values', () => {
      const invalidKey = 'a'.repeat(101);
      const attributes = {
        [invalidKey]: 'value',
        validKey: { nested: 'object' }
      };
      
      const result = EmailValidator.validateAttributes(attributes);
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid attribute key'))).toBe(true);
      expect(result.errors.some(error => error.includes('Invalid attribute value'))).toBe(true);
    });
  });

  describe('validateListIds()', () => {
    it('validates valid list IDs', () => {
      const result = EmailValidator.validateListIds([1, 2, 3]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized).toEqual([1, 2, 3]);
    });

    it('provides default for missing list IDs', () => {
      let result = EmailValidator.validateListIds(null);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual([1]);

      result = EmailValidator.validateListIds([]);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual([1]);
    });

    it('rejects non-array list IDs', () => {
      const result = EmailValidator.validateListIds('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('List IDs must be an array');
      expect(result.sanitized).toEqual([1]);
    });

    it('rejects too many list IDs', () => {
      const tooManyIds = Array(11).fill().map((_, i) => i + 1);
      const result = EmailValidator.validateListIds(tooManyIds);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Too many lists (maximum 10)');
    });

    it('validates individual list ID values', () => {
      const result = EmailValidator.validateListIds([1, 'invalid', 0, -1, 2.5]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
      expect(result.sanitized).toEqual([1]);
    });

    it('filters out invalid IDs and keeps valid ones', () => {
      const result = EmailValidator.validateListIds([1, 'invalid', 2, 0, 3]);
      expect(result.sanitized).toEqual([1, 2, 3]);
    });
  });

  describe('validateSubscriptionRequest()', () => {
    it('validates complete valid subscription request', () => {
      const subscriptionData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-123-4567',
        consentToMarketing: true,
        source: 'newsletter',
        attributes: {
          campaign: 'summer2026'
        },
        lists: [1, 2]
      };
      
      const result = EmailValidator.validateSubscriptionRequest(subscriptionData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized.email).toBe('test@example.com');
      expect(result.sanitized.firstName).toBe('John');
    });

    it('validates minimal valid subscription request', () => {
      const subscriptionData = {
        email: 'test@example.com',
        consentToMarketing: true
      };
      
      const result = EmailValidator.validateSubscriptionRequest(subscriptionData);
      expect(result.valid).toBe(true);
      expect(result.sanitized.source).toBe('website');
      expect(result.sanitized.lists).toEqual([1]);
    });

    it('rejects non-object subscription data', () => {
      const result = EmailValidator.validateSubscriptionRequest('invalid');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subscription data must be an object');
      expect(result.sanitized).toBeNull();
    });

    it('accumulates validation errors from all fields', () => {
      const subscriptionData = {
        email: 'invalid-email',
        firstName: 'A',
        consentToMarketing: false,
        phone: '123',
        lists: ['invalid']
      };
      
      const result = EmailValidator.validateSubscriptionRequest(subscriptionData);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(4);
    });

    it('sanitizes all valid fields', () => {
      const subscriptionData = {
        email: '  TEST@EXAMPLE.COM  ',
        firstName: '  john  ',
        lastName: '  doe  ',
        consentToMarketing: true,
        source: '  newsletter  ',
        attributes: {
          test: '  value  '
        }
      };
      
      const result = EmailValidator.validateSubscriptionRequest(subscriptionData);
      expect(result.valid).toBe(true);
      expect(result.sanitized.email).toBe('test@example.com');
      expect(result.sanitized.firstName).toBe('john');
      expect(result.sanitized.source).toBe('newsletter');
    });
  });

  describe('utility methods', () => {
    it('detects disposable email addresses', () => {
      const disposableEmails = [
        'test@10minutemail.com',
        'user@guerrillamail.com',
        'temp@mailinator.com',
        'test@temp-mail.org'
      ];
      
      disposableEmails.forEach(email => {
        expect(EmailValidator.isDisposableEmail(email)).toBe(true);
      });

      expect(EmailValidator.isDisposableEmail('test@gmail.com')).toBe(false);
      expect(EmailValidator.isDisposableEmail('user@company.com')).toBe(false);
    });

    it('handles invalid emails in disposable check', () => {
      expect(EmailValidator.isDisposableEmail('')).toBe(false);
      expect(EmailValidator.isDisposableEmail(null)).toBe(false);
      expect(EmailValidator.isDisposableEmail('invalid')).toBe(false);
    });

    it('validates unsubscribe tokens', () => {
      const validToken = 'a'.repeat(64);
      let result = EmailValidator.validateUnsubscribeToken('test@example.com', validToken);
      expect(result.valid).toBe(true);

      result = EmailValidator.validateUnsubscribeToken('', validToken);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email is required');

      result = EmailValidator.validateUnsubscribeToken('test@example.com', '');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unsubscribe token is required');

      result = EmailValidator.validateUnsubscribeToken('test@example.com', 123);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Token must be a string');

      result = EmailValidator.validateUnsubscribeToken('test@example.com', 'short');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid token format');
    });
  });
});