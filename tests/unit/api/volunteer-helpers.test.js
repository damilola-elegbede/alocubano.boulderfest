/**
 * Unit Tests for Volunteer Helper Functions
 *
 * Testing Approach: Option B - Direct testing after extraction
 * These helper functions were extracted from api/volunteer/submit.js into
 * lib/volunteer-helpers.js to improve testability and reusability.
 *
 * Functions tested:
 * 1. escapeHtml() - XSS prevention through HTML entity encoding
 * 2. getClientIp() - Client IP extraction from various request sources
 * 3. maskEmail() - PII protection through email masking
 * 4. formatAreasOfInterest() - Human-readable area labels
 * 5. formatAvailability() - Human-readable day labels
 */

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  getClientIp,
  maskEmail,
  formatAreasOfInterest,
  formatAvailability
} from '../../../lib/volunteer-helpers.js';

describe('Volunteer Helper Functions', () => {
  describe('escapeHtml()', () => {
    it('should escape ampersand character', () => {
      const result = escapeHtml('Tom & Jerry');
      expect(result).toBe('Tom &amp; Jerry');
    });

    it('should escape less-than character', () => {
      const result = escapeHtml('5 < 10');
      expect(result).toBe('5 &lt; 10');
    });

    it('should escape greater-than character', () => {
      const result = escapeHtml('10 > 5');
      expect(result).toBe('10 &gt; 5');
    });

    it('should escape double quote character', () => {
      const result = escapeHtml('She said "hello"');
      expect(result).toBe('She said &quot;hello&quot;');
    });

    it('should escape single quote character', () => {
      const result = escapeHtml("It's great");
      expect(result).toBe('It&#039;s great');
    });

    it('should escape all special characters in XSS attempt', () => {
      const xssAttempt = '<script>alert("XSS")</script>';
      const result = escapeHtml(xssAttempt);
      expect(result).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('should escape multiple special characters in complex HTML', () => {
      const html = '<div class="test" data-value=\'123\'>A & B</div>';
      const result = escapeHtml(html);
      expect(result).toBe('&lt;div class=&quot;test&quot; data-value=&#039;123&#039;&gt;A &amp; B&lt;/div&gt;');
    });

    it('should handle null input by returning empty string', () => {
      const result = escapeHtml(null);
      expect(result).toBe('');
    });

    it('should handle undefined input by returning empty string', () => {
      const result = escapeHtml(undefined);
      expect(result).toBe('');
    });

    it('should handle empty string input', () => {
      const result = escapeHtml('');
      expect(result).toBe('');
    });

    it('should handle text without special characters', () => {
      const result = escapeHtml('Hello World');
      expect(result).toBe('Hello World');
    });

    it('should convert non-string input to string before escaping', () => {
      const result = escapeHtml(12345);
      expect(result).toBe('12345');
    });
  });

  describe('getClientIp()', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.195'
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('203.0.113.195');
    });

    it('should extract first IP from multiple x-forwarded-for values', () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178'
        }
      };
      const result = getClientIp(req);
      // Security fix: Only use first IP to prevent spoofing
      expect(result).toBe('203.0.113.195');
    });

    it('should fall back to connection.remoteAddress when x-forwarded-for is missing', () => {
      const req = {
        headers: {},
        connection: {
          remoteAddress: '192.168.1.100'
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('192.168.1.100');
    });

    it('should fall back to socket.remoteAddress when connection is undefined', () => {
      const req = {
        headers: {},
        socket: {
          remoteAddress: '10.0.0.50'
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('10.0.0.50');
    });

    it('should fall back to connection.socket.remoteAddress as last resort', () => {
      const req = {
        headers: {},
        connection: {
          socket: {
            remoteAddress: '172.16.0.1'
          }
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('172.16.0.1');
    });

    it('should return default 127.0.0.1 when no IP source is available', () => {
      const req = {
        headers: {}
      };
      const result = getClientIp(req);
      expect(result).toBe('127.0.0.1');
    });

    it('should use X-Real-IP header when X-Forwarded-For is not present', () => {
      const req = {
        headers: {
          'x-real-ip': '198.51.100.42'
        },
        connection: {
          remoteAddress: '192.168.1.1'
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('198.51.100.42');
    });

    it('should trim whitespace from X-Forwarded-For IP', () => {
      const req = {
        headers: {
          'x-forwarded-for': '  203.0.113.195  '
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('203.0.113.195');
    });

    it('should trim whitespace from X-Real-IP', () => {
      const req = {
        headers: {
          'x-real-ip': '  198.51.100.42  '
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('198.51.100.42');
    });

    it('should prioritize x-forwarded-for over connection.remoteAddress', () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.195'
        },
        connection: {
          remoteAddress: '192.168.1.100'
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('203.0.113.195');
    });

    it('should handle IPv6 addresses', () => {
      const req = {
        headers: {
          'x-forwarded-for': '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
        }
      };
      const result = getClientIp(req);
      expect(result).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    });
  });

  describe('maskEmail()', () => {
    it('should mask valid email with standard format', () => {
      const result = maskEmail('john@example.com');
      expect(result).toBe('jo***@example.com');
    });

    it('should mask valid email with long local part', () => {
      const result = maskEmail('johndoe@example.com');
      expect(result).toBe('jo***@example.com');
    });

    it('should mask valid email with short local part (2 chars)', () => {
      const result = maskEmail('ab@example.com');
      expect(result).toBe('ab***@example.com');
    });

    it('should return [malformed-email] for single character local part', () => {
      const result = maskEmail('a@example.com');
      expect(result).toBe('a***@example.com');
    });

    it('should return [malformed-email] for email missing @ symbol', () => {
      const result = maskEmail('johndoe.example.com');
      expect(result).toBe('[malformed-email]');
    });

    it('should return [malformed-email] for email missing domain', () => {
      const result = maskEmail('johndoe@');
      expect(result).toBe('[malformed-email]');
    });

    it('should return [malformed-email] for email missing local part', () => {
      const result = maskEmail('@example.com');
      expect(result).toBe('[malformed-email]');
    });

    it('should return [invalid-email] for null input', () => {
      const result = maskEmail(null);
      expect(result).toBe('[invalid-email]');
    });

    it('should return [invalid-email] for undefined input', () => {
      const result = maskEmail(undefined);
      expect(result).toBe('[invalid-email]');
    });

    it('should return [invalid-email] for empty string', () => {
      const result = maskEmail('');
      expect(result).toBe('[invalid-email]');
    });

    it('should return [invalid-email] for non-string input (number)', () => {
      const result = maskEmail(12345);
      expect(result).toBe('[invalid-email]');
    });

    it('should return [invalid-email] for non-string input (object)', () => {
      const result = maskEmail({ email: 'test@example.com' });
      expect(result).toBe('[invalid-email]');
    });

    it('should handle email with subdomain', () => {
      const result = maskEmail('user@mail.example.com');
      expect(result).toBe('us***@mail.example.com');
    });

    it('should handle email with plus addressing', () => {
      const result = maskEmail('user+tag@example.com');
      expect(result).toBe('us***@example.com');
    });

    it('should handle email with dots in local part', () => {
      const result = maskEmail('first.last@example.com');
      expect(result).toBe('fi***@example.com');
    });
  });

  describe('formatAreasOfInterest()', () => {
    it('should format single area of interest', () => {
      const result = formatAreasOfInterest(['setup']);
      expect(result).toBe('Event Setup/Breakdown');
    });

    it('should format multiple areas of interest', () => {
      const result = formatAreasOfInterest(['setup', 'registration', 'artist']);
      expect(result).toBe('Event Setup/Breakdown, Registration Desk, Artist Support');
    });

    it('should format all areas of interest', () => {
      const result = formatAreasOfInterest([
        'setup',
        'registration',
        'artist',
        'merchandise',
        'info',
        'social'
      ]);
      expect(result).toBe(
        'Event Setup/Breakdown, Registration Desk, Artist Support, ' +
        'Merchandise Sales, Information Booth, Social Media Team'
      );
    });

    it('should handle unknown area by using original value', () => {
      const result = formatAreasOfInterest(['setup', 'unknown-area', 'registration']);
      expect(result).toBe('Event Setup/Breakdown, unknown-area, Registration Desk');
    });

    it('should return "None specified" for empty array', () => {
      const result = formatAreasOfInterest([]);
      expect(result).toBe('None specified');
    });

    it('should return "None specified" for null input', () => {
      const result = formatAreasOfInterest(null);
      expect(result).toBe('None specified');
    });

    it('should return "None specified" for undefined input', () => {
      const result = formatAreasOfInterest(undefined);
      expect(result).toBe('None specified');
    });

    it('should format specific area: registration', () => {
      const result = formatAreasOfInterest(['registration']);
      expect(result).toBe('Registration Desk');
    });

    it('should format specific area: artist', () => {
      const result = formatAreasOfInterest(['artist']);
      expect(result).toBe('Artist Support');
    });

    it('should format specific area: merchandise', () => {
      const result = formatAreasOfInterest(['merchandise']);
      expect(result).toBe('Merchandise Sales');
    });

    it('should format specific area: info', () => {
      const result = formatAreasOfInterest(['info']);
      expect(result).toBe('Information Booth');
    });

    it('should format specific area: social', () => {
      const result = formatAreasOfInterest(['social']);
      expect(result).toBe('Social Media Team');
    });
  });

  describe('formatAvailability()', () => {
    it('should format single day availability', () => {
      const result = formatAvailability(['friday']);
      expect(result).toBe('Friday, May 15');
    });

    it('should format multiple days availability', () => {
      const result = formatAvailability(['friday', 'saturday']);
      expect(result).toBe('Friday, May 15, Saturday, May 16');
    });

    it('should format all days availability', () => {
      const result = formatAvailability(['friday', 'saturday', 'sunday']);
      expect(result).toBe('Friday, May 15, Saturday, May 16, Sunday, May 17');
    });

    it('should handle unknown day by using original value', () => {
      const result = formatAvailability(['friday', 'monday', 'saturday']);
      expect(result).toBe('Friday, May 15, monday, Saturday, May 16');
    });

    it('should return "None specified" for empty array', () => {
      const result = formatAvailability([]);
      expect(result).toBe('None specified');
    });

    it('should return "None specified" for null input', () => {
      const result = formatAvailability(null);
      expect(result).toBe('None specified');
    });

    it('should return "None specified" for undefined input', () => {
      const result = formatAvailability(undefined);
      expect(result).toBe('None specified');
    });

    it('should format specific day: saturday', () => {
      const result = formatAvailability(['saturday']);
      expect(result).toBe('Saturday, May 16');
    });

    it('should format specific day: sunday', () => {
      const result = formatAvailability(['sunday']);
      expect(result).toBe('Sunday, May 17');
    });

    it('should format days in given order', () => {
      const result = formatAvailability(['sunday', 'friday']);
      expect(result).toBe('Sunday, May 17, Friday, May 15');
    });
  });
});
