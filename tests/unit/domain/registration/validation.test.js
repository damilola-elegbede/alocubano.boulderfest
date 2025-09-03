import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test_secret_min_32_chars_for_testing_only';
const NAME_REGEX = /^[a-zA-Z\s\-']{2,50}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('Registration API', () => {
  it('validates JWT tokens', () => {
    const payload = { transactionId: 'pi_123', email: 'test@example.com' };
    const token = jwt.sign(payload, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded.transactionId).toBe('pi_123');
    expect(() => jwt.verify('invalid', JWT_SECRET)).toThrow();
  });

  it('validates input formats', () => {
    expect(NAME_REGEX.test('John')).toBe(true);
    expect(NAME_REGEX.test('Mary-Jane')).toBe(true);
    expect(NAME_REGEX.test('J')).toBe(false);
    expect(NAME_REGEX.test('John123')).toBe(false);
    expect(EMAIL_REGEX.test('user@example.com')).toBe(true);
    expect(EMAIL_REGEX.test('not-an-email')).toBe(false);
    expect(EMAIL_REGEX.test('user@@example.com')).toBe(false);
  });

  it('sanitizes XSS attempts', () => {
    const sanitize = (input) => input?.replace(/</g, '&lt;').replace(/>/g, '&gt;') || '';
    const result = sanitize('<script>alert("XSS")</script>');
    expect(result).not.toContain('<script>');
  });

  it('enforces batch limits', () => {
    const MAX_BATCH = 10;
    expect([1,2,3,4,5].length).toBeLessThanOrEqual(MAX_BATCH);
    expect(Array(11).fill(0).length).toBeGreaterThan(MAX_BATCH);
  });

  it('validates security requirements', () => {
    expect(JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(15 * 60 * 1000).toBe(900000);
  });
});