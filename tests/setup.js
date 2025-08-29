import { resetTestDatabase } from '../scripts/reset-test-database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set test environment early and ensure proper database configuration
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_RESET_ALLOWED = 'true';

// Configure test database URL for SQLite
const dataDir = path.join(path.dirname(__dirname), 'data');
const testDbPath = path.join(dataDir, 'unit-test.db');
process.env.TURSO_DATABASE_URL = `file:${testDbPath}`;
process.env.DATABASE_URL = `file:${testDbPath}`;

// Remove auth token for local SQLite testing
delete process.env.TURSO_AUTH_TOKEN;

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

// Create data directory if it doesn't exist
import { mkdirSync } from 'fs';
try {
  mkdirSync(dataDir, { recursive: true });
} catch (error) {
  // Directory might already exist
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
    console.log(`Database path: ${testDbPath}`);
    
    // For unit tests, use soft reset with SQLite (faster than full reset)
    databaseResetPromise = resetTestDatabase('soft', { 
      seedData: true  // Include seed data for deterministic tests
    }).catch(error => {
      console.warn('⚠️ Database reset failed, continuing with existing state:', error.message);
      // Don't throw error, just log it and continue
      return { success: false, error: error.message };
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
    console.warn('⚠️ Database setup failed, tests will use existing state:', error.message);
  }
}

console.log('🧪 Test setup complete - environment configured for API contract testing');
console.log(`Database URL: ${process.env.TURSO_DATABASE_URL}`);

// Auto-setup for unit tests (E2E tests have their own global-setup.js)
if (!process.env.E2E_TEST_MODE) {
  // Only run database setup for unit tests, not E2E tests
  setup().catch(error => {
    console.warn('⚠️ Unit test database setup failed:', error.message);
  });
}