import { describe, it, expect } from 'vitest';
import { SubscriberBuilder } from '../../../../lib/domain/email/SubscriberBuilder.js';

describe('SubscriberBuilder Domain Service', () => {
  describe('buildSubscriberData()', () => {
    it('builds complete subscriber data with all fields', () => {
      const requestData = {
        email: '  TEST@EXAMPLE.COM  ',
        firstName: '  john  ',
        lastName: '  doe  ',
        phone: '555-123-4567',
        source: 'newsletter_signup',
        lists: [1, 2],
        attributes: {
          campaign: 'summer2026'
        }
      };

      const options = {
        requireVerification: false,
        defaultListId: 1,
        defaultStatus: 'active',
        consentIp: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0'
      };

      const result = SubscriberBuilder.buildSubscriberData(requestData, options);

      expect(result.email).toBe('test@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.phone).toBe('555-123-4567');
      expect(result.status).toBe('active');
      expect(result.listIds).toEqual([1, 2]);
      expect(result.consentSource).toBe('newsletter_signup');
      expect(result.consentIp).toBe('192.168.1.1');
      expect(result.consentUserAgent).toBe('Mozilla/5.0 Chrome/120.0.0.0');
      expect(result.verificationToken).toBeNull();
      expect(result.consentDate).toBeDefined();
      expect(result.attributes).toBeDefined();
    });

    it('builds minimal subscriber data with defaults', () => {
      const requestData = {
        email: 'test@example.com'
      };

      const result = SubscriberBuilder.buildSubscriberData(requestData);

      expect(result.email).toBe('test@example.com');
      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.status).toBe('active');
      expect(result.listIds).toEqual([1]);
      expect(result.consentSource).toBe('website');
      expect(result.verificationToken).toBeNull();
    });

    it('sets pending status when verification required', () => {
      const requestData = { email: 'test@example.com' };
      const options = { requireVerification: true };

      const result = SubscriberBuilder.buildSubscriberData(requestData, options);

      expect(result.status).toBe('pending');
      expect(result.verificationToken).toBeDefined();
      expect(result.verificationToken).toHaveLength(64);
    });

    it('throws error for missing request data', () => {
      expect(() => {
        SubscriberBuilder.buildSubscriberData(null);
      }).toThrow('Request data is required');

      expect(() => {
        SubscriberBuilder.buildSubscriberData('invalid');
      }).toThrow('Request data is required');
    });

    it('throws error for missing email', () => {
      expect(() => {
        SubscriberBuilder.buildSubscriberData({});
      }).toThrow('Email is required');
    });

    it('builds comprehensive attributes', () => {
      const requestData = {
        email: 'test@example.com',
        source: 'social_media',
        language: 'es-ES',
        timezone: 'America/Denver',
        interests: ['salsa', 'dance', 'music'],
        attributes: {
          customField: 'customValue'
        }
      };

      const options = {
        consentIp: '192.168.1.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'
      };

      const result = SubscriberBuilder.buildSubscriberData(requestData, options);

      expect(result.attributes.SIGNUP_PAGE).toBe('social_media');
      expect(result.attributes.CONSENT_IP).toBe('192.168.1.1');
      expect(result.attributes.USER_AGENT).toBe('Chrome');
      expect(result.attributes.PREFERRED_LANGUAGE).toBe('es');
      expect(result.attributes.TIMEZONE).toBe('America/Denver');
      expect(result.attributes.INTERESTS).toBe('salsa, dance, music');
      expect(result.attributes.CUSTOM_CUSTOMFIELD).toBe('customValue');
    });
  });

  describe('normalizeEmail()', () => {
    it('normalizes email to lowercase and trims', () => {
      expect(SubscriberBuilder.normalizeEmail('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
      expect(SubscriberBuilder.normalizeEmail('User@Domain.ORG')).toBe('user@domain.org');
    });

    it('throws error for invalid email', () => {
      expect(() => {
        SubscriberBuilder.normalizeEmail('');
      }).toThrow('Valid email is required');

      expect(() => {
        SubscriberBuilder.normalizeEmail(null);
      }).toThrow('Valid email is required');

      expect(() => {
        SubscriberBuilder.normalizeEmail(123);
      }).toThrow('Valid email is required');
    });
  });

  describe('normalizeName()', () => {
    it('normalizes names to proper case', () => {
      expect(SubscriberBuilder.normalizeName('john doe')).toBe('John Doe');
      expect(SubscriberBuilder.normalizeName('mary-jane smith')).toBe('Mary-jane Smith');
      expect(SubscriberBuilder.normalizeName('VAN DER BERG')).toBe('Van Der Berg');
    });

    it('trims whitespace from names', () => {
      expect(SubscriberBuilder.normalizeName('  john  ')).toBe('John');
      expect(SubscriberBuilder.normalizeName('   ')).toBeNull();
    });

    it('returns null for invalid names', () => {
      expect(SubscriberBuilder.normalizeName('')).toBeNull();
      expect(SubscriberBuilder.normalizeName(null)).toBeNull();
      expect(SubscriberBuilder.normalizeName(123)).toBeNull();
    });

    it('truncates long names', () => {
      const longName = 'a'.repeat(150);
      const result = SubscriberBuilder.normalizeName(longName);
      expect(result).toHaveLength(100);
    });
  });

  describe('normalizePhone()', () => {
    it('normalizes phone numbers', () => {
      expect(SubscriberBuilder.normalizePhone('  555-123-4567  ')).toBe('555-123-4567');
      expect(SubscriberBuilder.normalizePhone('(555) 123-4567')).toBe('(555) 123-4567');
    });

    it('returns null for invalid phones', () => {
      expect(SubscriberBuilder.normalizePhone('')).toBeNull();
      expect(SubscriberBuilder.normalizePhone('   ')).toBeNull();
      expect(SubscriberBuilder.normalizePhone(null)).toBeNull();
      expect(SubscriberBuilder.normalizePhone(123)).toBeNull();
    });

    it('truncates long phone numbers', () => {
      const longPhone = '1'.repeat(100);
      const result = SubscriberBuilder.normalizePhone(longPhone);
      expect(result).toHaveLength(50);
    });
  });

  describe('determineInitialStatus()', () => {
    it('returns pending when verification required', () => {
      expect(SubscriberBuilder.determineInitialStatus(true)).toBe('pending');
    });

    it('returns default status when no verification', () => {
      expect(SubscriberBuilder.determineInitialStatus(false, 'active')).toBe('active');
      expect(SubscriberBuilder.determineInitialStatus(false, 'pending')).toBe('pending');
    });

    it('returns active for invalid default status', () => {
      expect(SubscriberBuilder.determineInitialStatus(false, 'invalid')).toBe('active');
      expect(SubscriberBuilder.determineInitialStatus(false)).toBe('active');
    });
  });

  describe('normalizeListIds()', () => {
    it('normalizes valid list ID arrays', () => {
      expect(SubscriberBuilder.normalizeListIds([1, 2, 3])).toEqual([1, 2, 3]);
      expect(SubscriberBuilder.normalizeListIds([5])).toEqual([5]);
    });

    it('returns default for empty or invalid arrays', () => {
      expect(SubscriberBuilder.normalizeListIds([])).toEqual([1]);
      expect(SubscriberBuilder.normalizeListIds(null)).toEqual([1]);
      expect(SubscriberBuilder.normalizeListIds('invalid')).toEqual([1]);
    });

    it('filters out invalid IDs', () => {
      expect(SubscriberBuilder.normalizeListIds([1, 'invalid', 2, 0, -1, 3])).toEqual([1, 2, 3]);
    });

    it('limits to maximum 10 lists', () => {
      const manyIds = Array(15).fill().map((_, i) => i + 1);
      const result = SubscriberBuilder.normalizeListIds(manyIds);
      expect(result).toHaveLength(10);
    });

    it('uses custom default list ID', () => {
      expect(SubscriberBuilder.normalizeListIds([], 5)).toEqual([5]);
      expect(SubscriberBuilder.normalizeListIds(['invalid'], 3)).toEqual([3]);
    });
  });

  describe('buildAttributes()', () => {
    it('builds basic attributes', () => {
      const result = SubscriberBuilder.buildAttributes({});

      expect(result.SIGNUP_DATE).toBeDefined();
      expect(result.CONSENT_DATE).toBeDefined();
      expect(result.SIGNUP_PAGE).toBe('website');
      expect(result.SIGNUP_METHOD).toBe('web_form');
    });

    it('includes optional system attributes', () => {
      const options = {
        consentIp: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
        signupMethod: 'api'
      };

      const result = SubscriberBuilder.buildAttributes({}, options);

      expect(result.CONSENT_IP).toBe('192.168.1.1');
      expect(result.USER_AGENT).toBe('Chrome');
      expect(result.SIGNUP_METHOD).toBe('api');
    });

    it('includes user-provided attributes', () => {
      const requestData = {
        language: 'es-US',
        timezone: 'America/New_York',
        interests: ['dance', 'music', 'festivals'],
        attributes: {
          customField1: 'value1',
          customField2: 123,
          customField3: true
        }
      };

      const result = SubscriberBuilder.buildAttributes(requestData);

      expect(result.PREFERRED_LANGUAGE).toBe('es');
      expect(result.TIMEZONE).toBe('America/New_York');
      expect(result.INTERESTS).toBe('dance, music, festivals');
      expect(result.CUSTOM_CUSTOMFIELD1).toBe('value1');
      expect(result.CUSTOM_CUSTOMFIELD2).toBe('123');
      expect(result.CUSTOM_CUSTOMFIELD3).toBe('true');
    });

    it('normalizes source attribute', () => {
      let result = SubscriberBuilder.buildAttributes({ source: 'social_media' });
      expect(result.SIGNUP_PAGE).toBe('social_media');

      result = SubscriberBuilder.buildAttributes({ source: '  NEWSLETTER  ' });
      expect(result.SIGNUP_PAGE).toBe('newsletter');
    });
  });

  describe('normalizeSource()', () => {
    it('normalizes valid sources', () => {
      expect(SubscriberBuilder.normalizeSource('newsletter')).toBe('newsletter');
      expect(SubscriberBuilder.normalizeSource('  SOCIAL_MEDIA  ')).toBe('social_media');
    });

    it('maps common source aliases', () => {
      expect(SubscriberBuilder.normalizeSource('web')).toBe('website');
      expect(SubscriberBuilder.normalizeSource('site')).toBe('website');
      expect(SubscriberBuilder.normalizeSource('fb')).toBe('facebook');
      expect(SubscriberBuilder.normalizeSource('ig')).toBe('instagram');
      expect(SubscriberBuilder.normalizeSource('social')).toBe('social_media');
    });

    it('returns default for invalid sources', () => {
      expect(SubscriberBuilder.normalizeSource('')).toBe('website');
      expect(SubscriberBuilder.normalizeSource(null)).toBe('website');
      expect(SubscriberBuilder.normalizeSource(123)).toBe('website');
    });

    it('truncates long sources', () => {
      const longSource = 'a'.repeat(150);
      const result = SubscriberBuilder.normalizeSource(longSource);
      expect(result).toHaveLength(100);
    });
  });

  describe('normalizeUserAgent()', () => {
    it('detects common browsers', () => {
      expect(SubscriberBuilder.normalizeUserAgent('Mozilla/5.0 Chrome/120.0.0.0')).toBe('Chrome');
      expect(SubscriberBuilder.normalizeUserAgent('Mozilla/5.0 Firefox/120.0')).toBe('Firefox');
      expect(SubscriberBuilder.normalizeUserAgent('Mozilla/5.0 Safari/605.1.15')).toBe('Safari');
      expect(SubscriberBuilder.normalizeUserAgent('Mozilla/5.0 Edge/120.0.0.0')).toBe('Edge');
    });

    it('handles Chrome vs Safari detection correctly', () => {
      // Chrome also contains Safari in user agent
      expect(SubscriberBuilder.normalizeUserAgent('Mozilla/5.0 Safari/605.1.15 Chrome/120.0.0.0')).toBe('Chrome');
      // Real Safari doesn't contain Chrome
      expect(SubscriberBuilder.normalizeUserAgent('Mozilla/5.0 Safari/605.1.15')).toBe('Safari');
    });

    it('returns truncated user agent for unknown browsers', () => {
      const customUA = 'CustomBrowser/1.0 with very long description that should be truncated because it exceeds the 200 character limit that we have imposed in the normalizeUserAgent method for performance and storage reasons. This string needs to be very long to test the truncation functionality properly and ensure that the method works as expected when dealing with extremely verbose user agent strings that might be encountered in real-world scenarios.';
      const result = SubscriberBuilder.normalizeUserAgent(customUA);
      expect(result).toHaveLength(200);
    });

    it('returns default for invalid user agents', () => {
      expect(SubscriberBuilder.normalizeUserAgent('')).toBe('unknown');
      expect(SubscriberBuilder.normalizeUserAgent(null)).toBe('unknown');
      expect(SubscriberBuilder.normalizeUserAgent(123)).toBe('unknown');
    });
  });

  describe('normalizeLanguage()', () => {
    it('normalizes valid language codes', () => {
      expect(SubscriberBuilder.normalizeLanguage('en-US')).toBe('en');
      expect(SubscriberBuilder.normalizeLanguage('es-ES')).toBe('es');
      expect(SubscriberBuilder.normalizeLanguage('FR')).toBe('fr');
    });

    it('validates against known language codes', () => {
      expect(SubscriberBuilder.normalizeLanguage('en')).toBe('en');
      expect(SubscriberBuilder.normalizeLanguage('es')).toBe('es');
      expect(SubscriberBuilder.normalizeLanguage('unknown')).toBe('en');
      expect(SubscriberBuilder.normalizeLanguage('xyz')).toBe('en');
    });

    it('returns default for invalid inputs', () => {
      expect(SubscriberBuilder.normalizeLanguage('')).toBe('en');
      expect(SubscriberBuilder.normalizeLanguage(null)).toBe('en');
      expect(SubscriberBuilder.normalizeLanguage(123)).toBe('en');
    });
  });

  describe('normalizeTimezone()', () => {
    it('validates and normalizes valid timezones', () => {
      expect(SubscriberBuilder.normalizeTimezone('America/Denver')).toBe('America/Denver');
      expect(SubscriberBuilder.normalizeTimezone('Europe/London')).toBe('Europe/London');
      expect(SubscriberBuilder.normalizeTimezone('Asia/Tokyo')).toBe('Asia/Tokyo');
    });

    it('returns UTC for invalid timezones', () => {
      expect(SubscriberBuilder.normalizeTimezone('X/Y')).toBe('UTC'); // Too short parts
      expect(SubscriberBuilder.normalizeTimezone('EST')).toBe('UTC');
      expect(SubscriberBuilder.normalizeTimezone('')).toBe('UTC');
      expect(SubscriberBuilder.normalizeTimezone(null)).toBe('UTC');
    });

    it('truncates very long timezone strings', () => {
      const longTz = 'VeryLongTimezoneName/ThatExceedsNormalLengthLimits';
      const result = SubscriberBuilder.normalizeTimezone(longTz);
      expect(result).toHaveLength(50);
    });
  });

  describe('normalizeInterests()', () => {
    it('normalizes valid interest arrays', () => {
      const interests = ['salsa', 'bachata', 'music', 'dance'];
      const result = SubscriberBuilder.normalizeInterests(interests);
      expect(result).toBe('salsa, bachata, music, dance');
    });

    it('filters out invalid interests', () => {
      const interests = ['salsa', 123, '', '   ', 'music', null];
      const result = SubscriberBuilder.normalizeInterests(interests);
      expect(result).toBe('salsa, music');
    });

    it('limits to 10 interests', () => {
      const manyInterests = Array(15).fill().map((_, i) => `interest${i}`);
      const result = SubscriberBuilder.normalizeInterests(manyInterests);
      const splitResult = result.split(', ');
      expect(splitResult).toHaveLength(10);
    });

    it('truncates long individual interests', () => {
      const longInterest = 'a'.repeat(100);
      const result = SubscriberBuilder.normalizeInterests([longInterest]);
      expect(result).toHaveLength(50);
    });

    it('returns empty string for non-array input', () => {
      expect(SubscriberBuilder.normalizeInterests('invalid')).toBe('');
      expect(SubscriberBuilder.normalizeInterests(null)).toBe('');
    });
  });

  describe('normalizeCustomAttributes()', () => {
    it('normalizes valid custom attributes', () => {
      const attributes = {
        customField1: 'value1',
        'custom-field-2': 'value2',
        customField3: 123,
        customField4: true
      };

      const result = SubscriberBuilder.normalizeCustomAttributes(attributes);

      expect(result.CUSTOM_CUSTOMFIELD1).toBe('value1');
      expect(result.CUSTOM_CUSTOM_FIELD_2).toBe('value2');
      expect(result.CUSTOM_CUSTOMFIELD3).toBe('123');
      expect(result.CUSTOM_CUSTOMFIELD4).toBe('true');
    });

    it('filters out invalid keys and values', () => {
      const longKey = 'a'.repeat(60);
      const attributes = {
        [longKey]: 'long key',
        validKey: { nested: 'object' },
        anotherValidKey: 'valid value'
      };

      const result = SubscriberBuilder.normalizeCustomAttributes(attributes);

      expect(result.CUSTOM_ANOTHERVALIDKEY).toBe('valid value');
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('truncates long string values', () => {
      const attributes = {
        longValue: 'a'.repeat(600)
      };

      const result = SubscriberBuilder.normalizeCustomAttributes(attributes);
      expect(result.CUSTOM_LONGVALUE).toHaveLength(500);
    });

    it('returns empty object for invalid input', () => {
      expect(SubscriberBuilder.normalizeCustomAttributes(null)).toEqual({});
      expect(SubscriberBuilder.normalizeCustomAttributes('invalid')).toEqual({});
    });
  });

  describe('buildBrevoContactData()', () => {
    it('builds complete Brevo contact data', () => {
      const subscriberData = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-123-4567',
        listIds: [1, 2],
        attributes: {
          SIGNUP_DATE: '2023-01-01',
          CUSTOM_FIELD: 'custom_value'
        }
      };

      const result = SubscriberBuilder.buildBrevoContactData(subscriberData);

      expect(result.email).toBe('test@example.com');
      expect(result.listIds).toEqual([1, 2]);
      expect(result.attributes.FIRSTNAME).toBe('John');
      expect(result.attributes.LASTNAME).toBe('Doe');
      expect(result.attributes.SMS).toBe('555-123-4567');
      expect(result.attributes.SIGNUP_DATE).toBe('2023-01-01');
      expect(result.attributes.CUSTOM_FIELD).toBe('custom_value');
    });

    it('handles minimal subscriber data', () => {
      const subscriberData = {
        email: 'test@example.com'
      };

      const result = SubscriberBuilder.buildBrevoContactData(subscriberData);

      expect(result.email).toBe('test@example.com');
      expect(result.listIds).toEqual([1]);
      expect(result.attributes).toEqual({});
    });
  });

  describe('generateVerificationToken()', () => {
    it('generates 64-character verification token', () => {
      const token = SubscriberBuilder.generateVerificationToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('generates unique tokens', () => {
      const token1 = SubscriberBuilder.generateVerificationToken();
      const token2 = SubscriberBuilder.generateVerificationToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('buildSubscriberResponse()', () => {
    const mockSubscriberData = {
      id: 1,
      email: 'test@example.com',
      first_name: 'John',
      last_name: 'Doe',
      phone: '555-123-4567',
      status: 'active',
      list_ids: [1, 2],
      attributes: { SIGNUP_DATE: '2023-01-01' },
      consent_source: 'website',
      consent_date: '2023-01-01',
      verified_at: null,
      unsubscribed_at: null,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    };

    it('builds public subscriber response', () => {
      const result = SubscriberBuilder.buildSubscriberResponse(mockSubscriberData, false);

      expect(result.email).toBe('test@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.status).toBe('active');
      expect(result.subscribedAt).toBe('2023-01-01T00:00:00Z');
      expect(result.updatedAt).toBe('2023-01-01T00:00:00Z');

      // Private fields should not be included
      expect(result.id).toBeUndefined();
      expect(result.phone).toBeUndefined();
      expect(result.listIds).toBeUndefined();
    });

    it('builds private subscriber response', () => {
      const result = SubscriberBuilder.buildSubscriberResponse(mockSubscriberData, true);

      expect(result.email).toBe('test@example.com');
      expect(result.id).toBe(1);
      expect(result.phone).toBe('555-123-4567');
      expect(result.listIds).toEqual([1, 2]);
      expect(result.attributes).toEqual({ SIGNUP_DATE: '2023-01-01' });
      expect(result.consentSource).toBe('website');
      expect(result.consentDate).toBe('2023-01-01');
    });

    it('returns null for missing subscriber data', () => {
      expect(SubscriberBuilder.buildSubscriberResponse(null)).toBeNull();
      expect(SubscriberBuilder.buildSubscriberResponse(undefined)).toBeNull();
    });
  });

  describe('validateBuiltSubscriber()', () => {
    it('validates complete valid subscriber', () => {
      const subscriberData = {
        email: 'test@example.com',
        status: 'active',
        listIds: [1],
        consentDate: '2023-01-01'
      };

      const result = SubscriberBuilder.validateBuiltSubscriber(subscriberData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects invalid subscriber data', () => {
      let result = SubscriberBuilder.validateBuiltSubscriber(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subscriber data must be an object');

      result = SubscriberBuilder.validateBuiltSubscriber({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email is required');
      expect(result.errors).toContain('Valid status is required');
      expect(result.errors).toContain('At least one list ID is required');
      expect(result.errors).toContain('Consent date is required');
    });

    it('validates status values', () => {
      const subscriberData = {
        email: 'test@example.com',
        status: 'invalid',
        listIds: [1],
        consentDate: '2023-01-01'
      };

      const result = SubscriberBuilder.validateBuiltSubscriber(subscriberData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Valid status is required');
    });

    it('validates list IDs array', () => {
      const subscriberData = {
        email: 'test@example.com',
        status: 'active',
        listIds: [],
        consentDate: '2023-01-01'
      };

      const result = SubscriberBuilder.validateBuiltSubscriber(subscriberData);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one list ID is required');
    });
  });
});