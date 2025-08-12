/**
 * Vitest Global Setup
 * Configures test environment for both Node.js and Edge runtime compatibility
 * Uses TestEnvironmentManager for proper test isolation
 */

import { vi } from "vitest";
import { testEnvManager } from "./utils/test-environment-manager.js";
import { dbMockSync } from "./utils/database-mock-sync.js";
import { environmentAwareTestSetup } from "./config/environment-aware-test-setup.js";
import { testEnvironmentDetector } from "./utils/test-environment-detector.js";
import { runMigrationsForTest } from "./utils/test-migration-runner.js";

// REMOVED: dotenv loading to prevent .env.local bleeding into tests
// dotenv.config({ path: '.env.local' });

// Set up test-specific environment variables that don't conflict with production
if (!process.env.TURSO_DATABASE_URL) {
  // Use in-memory database for tests to prevent file conflicts
  process.env.TURSO_DATABASE_URL = process.env.CI === 'true' ? ':memory:' : 'file:test.db';
}

// For local databases (:memory: or file:), auth token is not required
// Set a dummy token if not present to satisfy other components that check for it
if (!process.env.TURSO_AUTH_TOKEN) {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const isLocalDatabase = dbUrl === ':memory:' || dbUrl.startsWith('file:');
  if (isLocalDatabase) {
    process.env.TURSO_AUTH_TOKEN = 'test-auth-token';
  }
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

// Set busy timeout for SQLite to prevent SQLITE_BUSY errors
if (!process.env.SQLITE_BUSY_TIMEOUT) {
  process.env.SQLITE_BUSY_TIMEOUT = '30000'; // 30 seconds
}

// Set required service environment variables for integration tests
if (!process.env.BREVO_API_KEY) {
  process.env.BREVO_API_KEY = "test-api-key";
}
if (!process.env.BREVO_NEWSLETTER_LIST_ID) {
  process.env.BREVO_NEWSLETTER_LIST_ID = "1";
}
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
}

// Increase default timeout for remote operations and module loading
vi.setConfig({
  testTimeout: 60000,
  hookTimeout: 30000,
});

// Mock globals for browser environment simulation with full mock capabilities
const mockFetch = vi.fn();
mockFetch.mockResolvedValueOnce = vi.fn().mockReturnThis();
mockFetch.mockRejectedValueOnce = vi.fn().mockReturnThis();
mockFetch.mockResolvedValue = vi.fn().mockReturnThis();
mockFetch.mockRejectedValue = vi.fn().mockReturnThis();

global.fetch = global.fetch || mockFetch;
global.Request = global.Request || vi.fn();
global.Response = global.Response || vi.fn();
global.Headers = global.Headers || vi.fn();

// Mock localStorage for cart operations testing
if (typeof global.localStorage === "undefined") {
  const localStorageMock = {
    store: {},
    getItem: function (key) {
      return this.store[key] || null;
    },
    setItem: function (key, value) {
      this.store[key] = value;
    },
    removeItem: function (key) {
      delete this.store[key];
    },
    clear: function () {
      this.store = {};
    },
  };
  global.localStorage = localStorageMock;
}

// Mock process for browser environment checks
if (typeof global.process === "undefined") {
  global.process = {
    env: {},
    versions: { node: "18.0.0" }, // Ensure Node.js detection works
  };
}

// Set test isolation mode immediately to prevent environment variable warnings
process.env.TEST_ISOLATION_MODE = "true";

// Environment setup will be handled dynamically by environment-aware setup
// based on test type detection - no static environment setting here

// Global setup hooks for test lifecycle management
beforeAll(async () => {
  // Run migrations before any tests execute to ensure database is ready
  if (process.env.TEST_INTEGRATION === 'true' || process.env.TEST_TYPE === 'integration') {
    try {
      console.log('Running migrations for test environment...');
      const databaseModule = await import('../api/lib/database.js');
      const client = await databaseModule.getDatabaseClient();
      
      // Execute all migrations to ensure database schema is ready
      await runMigrationsForTest(client, {
        logLevel: process.env.CI === 'true' ? 'error' : 'warn',
        createMigrationsTable: true,
        continueOnError: false,
        transactionMode: true
      });
      
      console.log('Migrations completed successfully');
    } catch (error) {
      console.warn('Migration execution failed:', error.message);
      // Don't fail setup if migrations fail - let individual tests handle it
    }
  }
  
  // Additional setup per test file if needed
  // Environment is already isolated at this point
});

// Global teardown - restore original environment
afterAll(async () => {
  // Force cleanup of all database connections
  if (process.env.TEST_INTEGRATION === 'true' || process.env.TEST_TYPE === 'integration') {
    try {
      const databaseModule = await import('../api/lib/database.js');
      
      // Check if resetDatabaseInstance exists (not mocked or missing)
      if (typeof databaseModule.resetDatabaseInstance === 'function') {
        await databaseModule.resetDatabaseInstance();
        
        // Additional delay for connection cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        console.debug('resetDatabaseInstance not available, skipping final database cleanup');
      }
    } catch (error) {
      if (!error.message.includes('mock') && !error.message.includes('vi.mock')) {
        console.warn('Final database cleanup failed:', error.message);
      }
    }
  }

  // Restore the original environment
  testEnvManager.restore();

  // Reset database mocks
  dbMockSync.reset();

  // Clear test isolation mode
  delete process.env.TEST_ISOLATION_MODE;
});

// Reset mocks between tests to ensure test isolation
afterEach(async () => {
  // Clear all Vitest mocks
  vi.clearAllMocks();

  // Reset fetch mock properly
  if (global.fetch && typeof global.fetch.mockClear === "function") {
    global.fetch.mockClear();
  }

  // Reset database mock state
  dbMockSync.reset();

  // Force database connection cleanup for integration tests with proper async handling
  if (process.env.TEST_INTEGRATION === 'true' || process.env.TEST_TYPE === 'integration') {
    try {
      // Use the enhanced test environment manager for coordinated cleanup
      await testEnvManager.coordinatedClear();
      
      // Additional wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 150));
      
    } catch (error) {
      // Handle different types of errors appropriately
      if (error.message.includes('mock') || error.message.includes('vi.mock')) {
        console.debug('Database module is mocked, skipping cleanup');
      } else if (process.env.TEST_INTEGRATION === 'true') {
        console.warn('Database cleanup failed:', error.message);
      }
    }
  }

  // Clear localStorage between tests
  if (global.localStorage) {
    global.localStorage.clear();
  }
});

// Environment validation (only warn if not in isolated test mode)
const requiredEnvVars = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "BREVO_API_KEY",
  "BREVO_NEWSLETTER_LIST_ID",
  "BREVO_WEBHOOK_SECRET",
];

// Only warn about missing vars if not in isolated test mode
if (!process.env.TEST_ISOLATION_MODE) {
  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );
  if (missingVars.length > 0) {
    console.warn(
      "⚠️  Missing environment variables for tests:",
      missingVars.join(", "),
    );
    console.warn("   Some tests may be skipped or fail");
  }
}

// Configure test environment logging
if (process.env.CI === "true") {
  // Reduce logging in CI
  console.log = vi.fn();
  console.info = vi.fn();
} else {
  // Keep logging for local development
  console.log("🧪 Test environment initialized");
  console.log(`   Node.js version: ${process.version}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "test"}`);
}
