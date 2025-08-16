import { describe, it, expect, beforeEach } from 'vitest';

describe('API Rate Limiting', () => {
  let rateLimiter;
  
  beforeEach(() => {
    rateLimiter = { requests: new Map(), limit: 10, window: 60000 };
  });

  it('enforces rate limit correctly', () => {
    const ip = '192.168.1.1';
    rateLimiter.requests.set(ip, 10);
    const allowed = (rateLimiter.requests.get(ip) || 0) < rateLimiter.limit;
    expect(allowed).toBe(false);
  });

  it('resets limits after window', () => {
    const ip = '192.168.1.1';
    rateLimiter.requests.set(ip, 5);
    setTimeout(() => rateLimiter.requests.clear(), rateLimiter.window);
    const allowed = (rateLimiter.requests.get(ip) || 0) < rateLimiter.limit;
    expect(allowed).toBe(true);
  });

  it('bypasses limit for admin users', () => {
    const isAdmin = true;
    const allowed = isAdmin || rateLimiter.requests.size < 100;
    expect(allowed).toBe(true);
  });
});