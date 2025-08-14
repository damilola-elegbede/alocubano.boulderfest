// Single setup file for all tests
import { vi } from 'vitest';

// Test environment
process.env.NODE_ENV = 'test';

// Default test database
process.env.TURSO_DATABASE_URL = ':memory:';

// Disable external services in tests
process.env.DISABLE_EXTERNAL_SERVICES = 'true';

// Global mocks
global.fetch = vi.fn();

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});

// Suppress console errors in tests
if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  global.console.error = vi.fn();
  global.console.warn = vi.fn();
}