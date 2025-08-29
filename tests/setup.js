/**
 * Test setup configuration - handles CI and local environments
 */
import { beforeAll, afterAll } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';

// Use in-memory SQLite for tests
process.env.TURSO_DATABASE_URL = 'file::memory:';
process.env.DATABASE_URL = 'file::memory:';

// Remove auth token for local testing
delete process.env.TURSO_AUTH_TOKEN;

// Configure API base URL based on environment
const CI_PORT = process.env.CI_PORT || process.env.PORT || '3000';
const API_BASE_URL = process.env.CI === 'true' 
  ? `http://localhost:${CI_PORT}`
  : 'http://localhost:3000';

// Set test base URL
process.env.TEST_BASE_URL = API_BASE_URL;

// Export for tests to use
export const getApiUrl = (path) => `${API_BASE_URL}${path}`;

// Simple fetch polyfill for Node.js if needed
if (!globalThis.fetch) {
  try {
    const { default: fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
  } catch (error) {
    // Fetch not available, tests will handle this
  }
}

// Mock server detection and environment setup
let mockServerDetected = false;

// Test lifecycle management
beforeAll(async () => {
  // Check if we're running against a mock server
  try {
    const response = await fetch(`${API_BASE_URL}/api/health/check`);
    const data = await response.json();
    mockServerDetected = data.environment === 'ci-mock';
  } catch (error) {
    // Server not available, tests will handle gracefully
    mockServerDetected = false;
  }

  console.log('🧪 Test environment initialized');
  console.log(`📍 API Base URL: ${API_BASE_URL}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
  console.log(`🤖 Mock Server: ${mockServerDetected ? 'detected' : 'not detected'}`);
}, 10000); // 10 second timeout for setup

afterAll(async () => {
  // Cleanup any test resources if needed
  console.log('🧹 Test environment cleanup completed');
}, 5000); // 5 second timeout for cleanup

// Export mock server detection for tests
export const isMockServer = () => mockServerDetected;

// Environment helpers
export const isCI = () => process.env.CI === 'true';
export const getTestTimeout = () => isCI() ? 30000 : 15000; // 30s for CI, 15s for local

console.log('🧪 Test environment ready');