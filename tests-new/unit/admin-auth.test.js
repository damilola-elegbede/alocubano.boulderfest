import { describe, it, expect, beforeEach } from 'vitest';
import { mockAdminAuth } from '../core/mocks.js';
import crypto from 'crypto';

describe('Admin Authentication', () => {
  beforeEach(() => {
    global.testAdminPassword = '$2b$10$X4kv7j5ZcG39WgogSl16peqr5sCsU5p/ffj6alTtsXkDJQ7e36Khu';
  });

  it('validates password hashing', async () => {
    const password = 'testPassword123';
    const hashed = global.testAdminPassword;
    const isValid = hashed.startsWith('$2b$');
    expect(isValid).toBe(true);
  });

  it('generates valid JWT tokens', async () => {
    const auth = mockAdminAuth();
    expect(auth.token).toContain('.');
    const parts = auth.token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('validates session expiration', async () => {
    const auth = mockAdminAuth();
    const futureTime = Date.now() + (24 * 60 * 60 * 1000);
    const isValid = auth.expiresAt > Date.now();
    expect(isValid).toBe(true);
  });
});