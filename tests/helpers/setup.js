/**
 * Simple Test Setup Helper
 * 
 * Replaces the complex TestInitializationOrchestrator (~2000+ lines) with straightforward,
 * direct setup and cleanup functions (~100 lines). No complex orchestration or dependency
 * management - just simple, predictable test initialization.
 * 
 * Key differences from the complex orchestrator:
 * - Direct function calls instead of orchestrated initialization
 * - Simple cleanup without complex state tracking
 * - No dependency management or transaction stacking
 * - Uses existing simple-helpers instead of complex managers
 * - Predictable behavior with clear error handling
 * 
 * Usage Examples:
 * 
 * // Basic database test
 * const setup = await setupTest();
 * // ... use setup.client for database operations
 * await teardownTest(setup);
 * 
 * // Integration test with mocks
 * const setup = await setupIntegrationTest();
 * // ... has database, mocks, and environment ready
 * await teardownTest(setup);
 * 
 * // Custom configuration
 * const setup = await setupTest({
 *   database: true,
 *   env: 'complete-test',
 *   mocks: ['fetch', 'brevo'],
 *   seed: 'integration'
 * });
 */

import { vi } from 'vitest';
import { createTestDatabase, createLibSQLAdapter, seedTestData } from './db.js';
import { mockBrevoService, mockStripeService, mockFetch } from './mocks.js';
import { 
  backupEnv, 
  restoreEnv, 
  clearAppEnv, 
  getEnvPreset,
  resetServices,
  resetTestState 
} from './simple-helpers.js';

/**
 * Main test setup function with flexible configuration
 * @param {Object} options - Setup options
 * @param {boolean} options.database - Whether to set up database (default: true)
 * @param {string|Object} options.env - Environment preset name or custom env vars
 * @param {Array<string>} options.mocks - Services to mock ['brevo', 'stripe', 'fetch']
 * @param {string} options.seed - Database seed fixture name (default: 'minimal')
 * @param {boolean} options.isolate - Whether to isolate environment (default: false)
 * @returns {Object} Setup context for cleanup
 */
export async function setupTest(options = {}) {
  const setup = {
    database: null,
    client: null,
    mocks: {},
    envBackup: null,
    options
  };

  // Environment setup
  if (options.env || options.isolate) {
    setup.envBackup = backupEnv(Object.keys(process.env));
    
    // Get environment variables first
    let envVars = {};
    if (options.env) {
      envVars = typeof options.env === 'string' 
        ? getEnvPreset(options.env)
        : options.env;
    }
    
    if (options.isolate) {
      clearAppEnv();
    }
    
    // Set environment variables after clearing if needed
    if (Object.keys(envVars).length > 0) {
      Object.assign(process.env, envVars);
    }
  }

  // Database setup
  if (options.database !== false) {
    setup.database = createTestDatabase();
    setup.client = createLibSQLAdapter(setup.database);
    
    // Seed with test data
    if (options.seed !== false) {
      const fixture = options.seed || 'minimal';
      try {
        seedTestData(setup.database, fixture);
      } catch (error) {
        // Continue without seeding if fixture doesn't exist
        if (!error.message.includes('ENOENT')) {
          throw error;
        }
      }
    }
  }

  // Mock setup
  if (options.mocks && Array.isArray(options.mocks)) {
    for (const service of options.mocks) {
      switch (service) {
        case 'brevo':
          setup.mocks.brevo = mockBrevoService();
          break;
        case 'stripe':
          setup.mocks.stripe = mockStripeService();
          break;
        case 'fetch':
          setup.mocks.fetch = mockFetch();
          global.fetch = setup.mocks.fetch;
          break;
      }
    }
  }

  return setup;
}

/**
 * Cleanup function for test teardown
 * @param {Object} setup - Setup context from setupTest()
 */
export async function teardownTest(setup) {
  if (!setup) return;

  // Clear mocks
  if (setup.mocks.fetch && global.fetch === setup.mocks.fetch) {
    delete global.fetch;
  }
  vi.clearAllMocks();

  // Close database
  if (setup.database) {
    setup.database.close();
  }

  // Reset services
  await resetServices();
  resetTestState();

  // Restore environment
  if (setup.envBackup) {
    restoreEnv(setup.envBackup);
  }
}

/**
 * Convenience function for integration tests
 * Sets up database, environment, and common mocks
 */
export async function setupIntegrationTest(envPreset = 'complete-test') {
  return setupTest({
    database: true,
    env: envPreset,
    mocks: ['fetch', 'brevo', 'stripe'],
    seed: 'integration',
    isolate: true
  });
}