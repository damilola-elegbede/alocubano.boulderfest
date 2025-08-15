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

// Optional Vitest import pattern to prevent eager loading in re-exports
function _getVi(injectedVi) {
  return injectedVi ?? globalThis?.vi ?? undefined;
}
// Database imports moved to dynamic imports below to avoid conflicts
import { mockBrevoService, mockStripeService, mockFetch } from "./mocks.js";
import {
  backupEnv,
  restoreEnv,
  clearAppEnv,
  getEnvPreset,
  resetServices,
  resetTestState,
} from "./simple-helpers.js";

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
    options,
  };

  // Environment setup
  if (options.env || options.isolate) {
    setup.envBackup = backupEnv(Object.keys(process.env));

    // Get environment variables first
    let envVars = {};
    if (options.env) {
      envVars =
        typeof options.env === "string"
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
    // Import dynamically to avoid conflicts - first check exports
    const dbModule = await import('./db.js');
    const createAsyncTestDatabase = dbModule.createAsyncTestDatabase || dbModule.default?.createAsyncTestDatabase;
    if (!createAsyncTestDatabase) {
      throw new Error('createAsyncTestDatabase not found in db.js module');
    }
    const { db, client } = await createAsyncTestDatabase();
    
    setup.database = db;
    setup.client = client;
    
    // Mock the database module to return our test client
    const { createMockDatabaseService } = await import('./mocks.js');
    const mockService = createMockDatabaseService(client);
    
    vi.doMock('../../api/lib/database.js', () => ({
      getDatabase: () => mockService,
      getDatabaseClient: async () => client,
      testConnection: async () => true,
      resetDatabaseInstance: async () => {
        await mockService.resetForTesting();
      },
      DatabaseService: class {
        constructor() {
          return mockService;
        }
      }
    }));

    // Seed with test data
    if (options.seed !== false) {
      const fixture = options.seed || "minimal";
      try {
        const { seedTestData } = await import('./db.js');
        seedTestData(setup.database, fixture);
      } catch (error) {
        // Continue without seeding if fixture doesn't exist
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  // Mock setup
  if (options.mocks && Array.isArray(options.mocks)) {
    for (const service of options.mocks) {
      switch (service) {
        case "brevo":
          setup.mocks.brevo = mockBrevoService();
          break;
        case "stripe":
          setup.mocks.stripe = mockStripeService();
          break;
        case "fetch":
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
  const vi = _getVi();
  if (vi) {
    vi.clearAllMocks();
  }

  // Close database properly with await
  if (setup.database) {
    if (setup.client && typeof setup.client.close === "function") {
      await setup.client.close();
    } else if (typeof setup.database.close === "function") {
      const result = setup.database.close();
      // Await if it returns a Promise
      if (result && typeof result.then === "function") {
        await result;
      }
    }
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
export async function setupIntegrationTest(envPreset = "complete-test") {
  return setupTest({
    database: true,
    env: envPreset,
    mocks: ["fetch", "brevo", "stripe"],
    seed: "integration",
    isolate: true,
  });
}
