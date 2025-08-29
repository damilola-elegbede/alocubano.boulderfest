/**
 * Minimal test setup - keeping it simple
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Use in-memory SQLite for tests
process.env.TURSO_DATABASE_URL = 'file::memory:';
process.env.DATABASE_URL = 'file::memory:';

// Remove auth token for local testing
delete process.env.TURSO_AUTH_TOKEN;

// Set test base URL
const PORT = process.env.CI_PORT || process.env.PORT || '3000';
process.env.TEST_BASE_URL = `http://localhost:${PORT}`;

// Simple fetch polyfill for Node.js if needed
if (!globalThis.fetch) {
  try {
    const { default: fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
  } catch (error) {
    // Fetch not available, tests will handle this
  }
}

console.log('🧪 Test environment ready');