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

// REMOVED: dotenv loading to prevent .env.local bleeding into tests
// dotenv.config({ path: '.env.local' });

// Set up test-specific environment variables that don't conflict with production
if (!process.env.TURSO_DATABASE_URL) {
  process.env.TURSO_DATABASE_URL = "file:test.db";
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
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
beforeAll(() => {
  // Additional setup per test file if needed
  // Environment is already isolated at this point
});

// Global teardown - restore original environment
afterAll(() => {
  // Restore the original environment
  testEnvManager.restore();

  // Reset database mocks
  dbMockSync.reset();

  // Clear test isolation mode
  delete process.env.TEST_ISOLATION_MODE;
});

// Reset mocks between tests to ensure test isolation
afterEach(() => {
  // Clear all Vitest mocks
  vi.clearAllMocks();

  // Reset fetch mock properly
  if (global.fetch && typeof global.fetch.mockClear === "function") {
    global.fetch.mockClear();
  }

  // Reset database mock state
  dbMockSync.reset();
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
