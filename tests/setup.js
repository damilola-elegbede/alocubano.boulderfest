/**
 * Test Setup - Basic Configuration Only
 * Minimal environment setup for tests.
 * Target: < 50 lines
 */
import { afterEach } from 'vitest';
import { cleanup } from './helpers.js';

// Set test environment
process.env.NODE_ENV = 'test';

// Use test database if not specified
if (!process.env.TURSO_DATABASE_URL) {
  process.env.TURSO_DATABASE_URL = 'file:test.db';
}

// Cleanup after each test - simple and reliable
afterEach(async () => {
  await cleanup();
});