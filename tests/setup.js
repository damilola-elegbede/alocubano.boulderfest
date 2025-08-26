/**
 * Test Setup - Basic Configuration
 * Environment setup for streamlined tests with CI server integration.
 * Server lifecycle managed by global-setup.js
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Ensure TEST_BASE_URL is set (will be overridden by global setup if needed)
const CI_PORT = process.env.CI_PORT || process.env.PORT || '3000';
if (!process.env.TEST_BASE_URL) {
  process.env.TEST_BASE_URL = `http://localhost:${CI_PORT}`;
}

// Import node-fetch for the test helpers
if (!globalThis.fetch) {
  try {
    const { default: fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
  } catch (error) {
    console.warn('⚠️ Could not import node-fetch for global fetch polyfill');
  }
}

console.log('🧪 Test setup complete - environment configured for API contract testing');