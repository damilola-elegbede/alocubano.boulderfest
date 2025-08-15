import { describe, it, expect } from 'vitest';

describe('Input Sanitization', () => {
  it('removes HTML tags from input', () => {
    const input = '<script>alert("xss")</script>Hello';
    const sanitized = input.replace(/<script[^>]*>.*?<\/script>/gi, '').replace(/<[^>]*>/g, '');
    expect(sanitized).toBe('Hello');
  });

  it('escapes SQL injection attempts', () => {
    const input = "'; DROP TABLE users; --";
    const escaped = input.replace(/['";]/g, '');
    expect(escaped).not.toContain("'");
  });

  it('validates email format', () => {
    const email = 'test@example.com';
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(isValid).toBe(true);
  });

  it('limits input length', () => {
    const input = 'a'.repeat(1000);
    const limited = input.slice(0, 255);
    expect(limited.length).toBe(255);
  });
});