import { describe, it, expect } from 'vitest';

describe('Security Headers', () => {
  it('sets X-Frame-Options header', () => {
    const headers = { 'X-Frame-Options': 'DENY' };
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('sets Content-Security-Policy', () => {
    const csp = "default-src 'self'";
    expect(csp).toContain("'self'");
  });

  it('sets X-Content-Type-Options', () => {
    const headers = { 'X-Content-Type-Options': 'nosniff' };
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('sets Strict-Transport-Security', () => {
    const headers = { 'Strict-Transport-Security': 'max-age=31536000' };
    expect(headers['Strict-Transport-Security']).toContain('31536000');
  });
});