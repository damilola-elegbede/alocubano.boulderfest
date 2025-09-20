import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  sanitizeInput,
  detectXSS,
  detectSQLInjection,
  escapeHtml,
  stripHtml,
  sanitizeFilename,
  sanitizeUrl,
  sanitizeApiInput,
  validateSecurityHeaders,
  validatePasswordStrength
} from './SecurityUtils.js';

describe('SecurityUtils', () => {
  describe('sanitizeHtml', () => {
    it('escapes basic HTML entities', () => {
      expect(sanitizeHtml('Hello & World')).toBe('Hello &amp; World');
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('handles all dangerous characters', () => {
      const input = `<>"'/\`=`;
      const result = sanitizeHtml(input);
      expect(result).toBe('&lt;&gt;&quot;&#039;&#x2F;&#x60;&#x3D;');
    });

    it('returns empty string for null/undefined', () => {
      expect(sanitizeHtml(null)).toBe('');
      expect(sanitizeHtml(undefined)).toBe('');
      expect(sanitizeHtml('')).toBe('');
    });

    it('handles non-string input', () => {
      expect(sanitizeHtml(123)).toBe('');
      expect(sanitizeHtml({})).toBe('');
      expect(sanitizeHtml([])).toBe('');
    });

    it('preserves safe content', () => {
      expect(sanitizeHtml('Hello World')).toBe('Hello World');
      expect(sanitizeHtml('123 456')).toBe('123 456');
    });
  });

  describe('sanitizeInput', () => {
    it('performs basic XSS sanitization', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeInput(input);
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('trims whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
    });

    it('handles empty input', () => {
      expect(sanitizeInput('')).toBe('');
      expect(sanitizeInput(null)).toBe('');
      expect(sanitizeInput(undefined)).toBe('');
    });

    it('prevents basic XSS vectors', () => {
      const vectors = [
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<svg onload=alert(1)>'
      ];

      vectors.forEach(vector => {
        const result = sanitizeInput(vector);
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        expect(result).not.toContain('"');
      });
    });
  });

  describe('detectXSS', () => {
    it('detects script tags', () => {
      const result = detectXSS('<script>alert("xss")</script>');
      expect(result.hasXSS).toBe(true);
      expect(result.threats).toHaveLength(1);
      expect(result.threats[0].type).toBe('XSS');
    });

    it('detects javascript: URLs', () => {
      const result = detectXSS('javascript:alert(1)');
      expect(result.hasXSS).toBe(true);
      expect(result.threats).toHaveLength(1);
    });

    it('detects event handlers', () => {
      const result = detectXSS('<img onclick="alert(1)">');
      expect(result.hasXSS).toBe(true);
      expect(result.threats).toHaveLength(1);
    });

    it('detects multiple threats', () => {
      const result = detectXSS('<script>alert(1)</script><img onclick="alert(2)">');
      expect(result.hasXSS).toBe(true);
      expect(result.threats.length).toBeGreaterThan(1);
    });

    it('returns false for safe content', () => {
      const result = detectXSS('Hello World');
      expect(result.hasXSS).toBe(false);
      expect(result.threats).toHaveLength(0);
    });

    it('handles empty input', () => {
      const result = detectXSS('');
      expect(result.hasXSS).toBe(false);
      expect(result.threats).toHaveLength(0);
    });

    it('detects iframe injection', () => {
      const result = detectXSS('<iframe src="http://evil.com"></iframe>');
      expect(result.hasXSS).toBe(true);
    });

    it('detects form injection', () => {
      const result = detectXSS('<form action="http://evil.com"><input type="password"></form>');
      expect(result.hasXSS).toBe(true);
    });
  });

  describe('detectSQLInjection', () => {
    it('detects SQL keywords', () => {
      const result = detectSQLInjection("'; DROP TABLE users; --");
      expect(result.hasSQLInjection).toBe(true);
      expect(result.threats).toHaveLength(2); // DROP keyword + semicolon/comment patterns
    });

    it('detects UNION attacks', () => {
      const result = detectSQLInjection('1 UNION SELECT * FROM users');
      expect(result.hasSQLInjection).toBe(true);
    });

    it('detects comment injection', () => {
      const result = detectSQLInjection('admin/**/OR/**/1=1');
      expect(result.hasSQLInjection).toBe(true);
    });

    it('detects stored procedure calls', () => {
      const result = detectSQLInjection('EXEC xp_cmdshell');
      expect(result.hasSQLInjection).toBe(true);
    });

    it('returns false for safe content', () => {
      const result = detectSQLInjection('john@example.com');
      expect(result.hasSQLInjection).toBe(false);
      expect(result.threats).toHaveLength(0);
    });

    it('handles empty input', () => {
      const result = detectSQLInjection('');
      expect(result.hasSQLInjection).toBe(false);
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML entities', () => {
      expect(escapeHtml('<div>Hello</div>')).toBe('&lt;div&gt;Hello&lt;/div&gt;');
    });

    it('handles quotes and ampersands', () => {
      expect(escapeHtml('Tom & Jerry "cartoon"')).toBe('Tom &amp; Jerry &quot;cartoon&quot;');
    });

    it('handles empty input', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('stripHtml', () => {
    it('removes HTML tags completely', () => {
      expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
    });

    it('handles nested tags', () => {
      expect(stripHtml('<div><span><b>Text</b></span></div>')).toBe('Text');
    });

    it('handles self-closing tags', () => {
      expect(stripHtml('Hello <br/> World')).toBe('Hello  World');
    });

    it('trims whitespace', () => {
      expect(stripHtml('  <p>Hello</p>  ')).toBe('Hello');
    });

    it('handles empty input', () => {
      expect(stripHtml('')).toBe('');
      expect(stripHtml(null)).toBe('');
    });
  });

  describe('sanitizeFilename', () => {
    it('replaces unsafe characters', () => {
      expect(sanitizeFilename('file<>:"/\\|?*.txt')).toBe('file_.txt'); // Unsafe chars replaced and collapsed
    });

    it('removes leading/trailing underscores', () => {
      expect(sanitizeFilename('___file___')).toBe('file');
    });

    it('collapses multiple underscores', () => {
      expect(sanitizeFilename('file___name')).toBe('file_name');
    });

    it('limits length', () => {
      const longName = 'a'.repeat(300);
      const result = sanitizeFilename(longName);
      expect(result.length).toBe(255);
    });

    it('preserves safe filenames', () => {
      expect(sanitizeFilename('document_2023-12-01.pdf')).toBe('document_2023-12-01.pdf');
    });

    it('handles empty input', () => {
      expect(sanitizeFilename('')).toBe('');
      expect(sanitizeFilename(null)).toBe('');
    });
  });

  describe('sanitizeUrl', () => {
    it('accepts valid HTTP URLs', () => {
      const result = sanitizeUrl('https://example.com');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('https://example.com');
    });

    it('accepts relative URLs', () => {
      const result = sanitizeUrl('/path/to/resource');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('/path/to/resource');
    });

    it('accepts mailto URLs', () => {
      const result = sanitizeUrl('mailto:test@example.com');
      expect(result.valid).toBe(true);
    });

    it('rejects javascript: URLs', () => {
      const result = sanitizeUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Dangerous URL scheme');
    });

    it('rejects data: URLs', () => {
      const result = sanitizeUrl('data:text/html,<script>alert(1)</script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Dangerous URL scheme');
    });

    it('rejects invalid schemes', () => {
      const result = sanitizeUrl('ftp://example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL scheme');
    });

    it('handles empty input', () => {
      const result = sanitizeUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('URL is required');
    });
  });

  describe('sanitizeApiInput', () => {
    it('sanitizes string input', () => {
      const result = sanitizeApiInput('<script>alert(1)</script>');
      expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('converts numbers to strings', () => {
      expect(sanitizeApiInput(123)).toBe('123');
    });

    it('converts booleans to strings', () => {
      expect(sanitizeApiInput(true)).toBe('true');
      expect(sanitizeApiInput(false)).toBe('false');
    });

    it('handles null and undefined', () => {
      expect(sanitizeApiInput(null)).toBe('');
      expect(sanitizeApiInput(undefined)).toBe('');
    });

    it('limits length', () => {
      const longInput = 'a'.repeat(2000);
      const result = sanitizeApiInput(longInput, 100);
      expect(result.length).toBe(100);
    });

    it('uses default length limit', () => {
      const longInput = 'a'.repeat(2000);
      const result = sanitizeApiInput(longInput);
      expect(result.length).toBe(1000);
    });
  });

  describe('validateSecurityHeaders', () => {
    it('identifies missing security headers', () => {
      const result = validateSecurityHeaders({});
      expect(result.secure).toBe(false);
      expect(result.issues).toContain('Missing X-Frame-Options header');
      expect(result.issues).toContain('Missing X-Content-Type-Options header');
      expect(result.issues).toContain('Missing X-XSS-Protection header');
      expect(result.issues).toContain('Missing Content-Security-Policy header');
    });

    it('passes with all security headers', () => {
      const headers = {
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'x-xss-protection': '1; mode=block',
        'content-security-policy': "default-src 'self'"
      };
      const result = validateSecurityHeaders(headers);
      expect(result.secure).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('identifies partial security headers', () => {
      const headers = {
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff'
      };
      const result = validateSecurityHeaders(headers);
      expect(result.secure).toBe(false);
      expect(result.issues).toHaveLength(2);
    });
  });

  describe('validatePasswordStrength', () => {
    it('validates strong passwords', () => {
      const result = validatePasswordStrength('StrongP@ss123');
      expect(result.strong).toBe(true);
      expect(result.score).toBe(5);
      expect(result.issues).toHaveLength(0);
    });

    it('rejects weak passwords', () => {
      const result = validatePasswordStrength('weak');
      expect(result.strong).toBe(false);
      expect(result.score).toBe(1);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('requires minimum length', () => {
      const result = validatePasswordStrength('Sh0rt!');
      expect(result.issues).toContain('Password must be at least 8 characters');
    });

    it('requires lowercase letters', () => {
      const result = validatePasswordStrength('PASSWORD123!');
      expect(result.issues).toContain('Password must contain lowercase letters');
    });

    it('requires uppercase letters', () => {
      const result = validatePasswordStrength('password123!');
      expect(result.issues).toContain('Password must contain uppercase letters');
    });

    it('requires numbers', () => {
      const result = validatePasswordStrength('Password!');
      expect(result.issues).toContain('Password must contain numbers');
    });

    it('requires special characters', () => {
      const result = validatePasswordStrength('Password123');
      expect(result.issues).toContain('Password must contain special characters');
    });

    it('handles empty input', () => {
      const result = validatePasswordStrength('');
      expect(result.strong).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues).toContain('Password is required');
    });

    it('calculates correct scores', () => {
      expect(validatePasswordStrength('password').score).toBe(2); // length + lowercase
      expect(validatePasswordStrength('Password').score).toBe(3); // length + lowercase + uppercase
      expect(validatePasswordStrength('Password1').score).toBe(4); // length + lowercase + uppercase + numbers
      expect(validatePasswordStrength('Password1!').score).toBe(5); // all criteria met
    });
  });
});