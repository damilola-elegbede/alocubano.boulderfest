import { resetTestDatabase } from '../scripts/reset-test-database.js';

// Set test environment early
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_RESET_ALLOWED = 'true';

const CI_PORT = process.env.CI_PORT || process.env.PORT || '3000';
if (!process.env.TEST_BASE_URL) {
  process.env.TEST_BASE_URL = `http://localhost:${CI_PORT}`;
}

// Global fetch polyfill for Node.js
if (!globalThis.fetch) {
  try {
    const { default: fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
  } catch (error) {
    console.warn('⚠️ Could not import node-fetch for global fetch polyfill');
  }
}

// Database reset for unit tests (soft reset for speed)
let databaseResetPromise = null;

/**
 * Reset database once before all tests
 * Uses soft reset for fast execution and SQLite for unit tests
 */
export async function setupTestDatabase() {
  if (!databaseResetPromise) {
    console.log('🧪 Setting up test database (unit test mode)...');
    
    // For unit tests, use soft reset with SQLite (faster than full reset)
    databaseResetPromise = resetTestDatabase('soft', { 
      seedData: true  // Include seed data for deterministic tests
    });
  }
  
  return databaseResetPromise;
}

/**
 * Initialize test environment - called automatically by Vitest
 */
export async function setup() {
  try {
    await setupTestDatabase();
    console.log('✅ Unit test database setup complete');
  } catch (error) {
    console.warn('⚠️  Database setup failed, tests will use existing state:', error.message);
  }
}

console.log('🧪 Test setup complete - environment configured for API contract testing');

// Auto-setup for unit tests (E2E tests have their own global-setup.js)
if (!process.env.E2E_TEST_MODE) {
  // Only run database setup for unit tests, not E2E tests
  setup().catch(error => {
    console.warn('⚠️  Unit test database setup failed:', error.message);
  });
}