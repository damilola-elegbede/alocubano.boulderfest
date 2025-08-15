/**
 * Consolidated Test Helpers Index
 *
 * Single import point for all test helpers, replacing the complex
 * TestInitializationOrchestrator infrastructure with simple, direct imports.
 *
 * Usage Examples:
 *
 * // Import everything
 * import * as helpers from './tests/helpers/index.js';
 *
 * // Import specific helpers
 * import { setupTest, teardownTest } from './tests/helpers/index.js';
 * import { createTestDatabase, seedTestData } from './tests/helpers/index.js';
 * import { mockBrevoService, mockStripeService } from './tests/helpers/index.js';
 *
 * // Use in tests
 * const setup = await setupTest({ database: true, mocks: ['brevo', 'stripe'] });
 * // ... test logic
 * await teardownTest(setup);
 */

// Setup and teardown functions
export { setupTest, teardownTest, setupIntegrationTest } from "./setup.js";

// Database helpers
export {
  createTestDatabase,
  seedTestData,
  createTestUser,
  createTestTicket,
  createTestTransaction,
  createTestSubscriber,
  createLibSQLAdapter,
  queryHelper,
} from "./db.js";

// Mock services
export {
  mockFetch,
  mockBrevoService,
  mockStripeService,
  mockDatabaseClient,
  assertMockCalled,
  resetMocks,
} from "./mocks.js";

// Environment and utilities
export {
  backupEnv,
  restoreEnv,
  clearAppEnv,
  getEnvPreset,
  resetServices,
  resetTestState,
  cleanupTest,
  cleanupTestState,
  validateTestCleanup,
  withIsolatedEnv,
  withCompleteIsolation,
  createTestData,
  measureTime,
  validateEnv,
} from "./simple-helpers.js";

/**
 * Convenience function for most common test setup pattern
 * Combines database, environment, and basic mocks
 */
export async function quickSetup(options = {}) {
  const defaults = {
    database: true,
    env: "complete-test",
    mocks: ["fetch"],
    seed: "minimal",
  };

  const config = { ...defaults, ...options };
  const { setupTest } = await import("./setup.js");
  return setupTest(config);
}

/**
 * Convenience function for integration test setup
 * Pre-configured for integration testing with all services
 */
export async function integrationSetup(envPreset = "complete-test") {
  const { setupIntegrationTest } = await import("./setup.js");
  return setupIntegrationTest(envPreset);
}

/**
 * Helper for database-only tests
 * Minimal setup with just database and basic environment
 */
export async function databaseOnlySetup(seed = "minimal") {
  const { setupTest } = await import("./setup.js");
  return setupTest({
    database: true,
    env: "valid-local",
    mocks: [],
    seed,
  });
}

/**
 * Helper for API tests with mocked external services
 * Database + environment + all service mocks
 */
export async function apiTestSetup() {
  const { setupTest } = await import("./setup.js");
  return setupTest({
    database: true,
    env: "complete-test",
    mocks: ["fetch", "brevo", "stripe"],
    seed: "integration",
  });
}
