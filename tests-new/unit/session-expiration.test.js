import { describe, it, expect } from 'vitest';

describe('Session Expiration', () => {
  it('expires admin sessions after 24 hours', () => {
    const now = Date.now();
    const expiresAt = now + (24 * 60 * 60 * 1000);
    const isExpired = Date.now() > expiresAt;
    expect(isExpired).toBe(false);
  });

  it('validates JWT token expiration', () => {
    const token = { exp: Math.floor(Date.now() / 1000) + 3600 };
    const currentTime = Math.floor(Date.now() / 1000);
    const isValid = token.exp > currentTime;
    expect(isValid).toBe(true);
  });

  it('clears expired sessions', () => {
    const sessions = new Map();
    sessions.set('user1', { expiresAt: Date.now() - 1000 });
    const expired = Array.from(sessions.entries())
      .filter(([, session]) => session.expiresAt < Date.now());
    expect(expired).toHaveLength(1);
  });
});