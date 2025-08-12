import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration test environment
    environment: "node",
    globals: true,
    
    // Integration-specific setup with enhanced database cleanup
    setupFiles: [
      "./tests/setup-vitest.js",
      "./tests/setup-integration.js"
    ],
    
    // Integration test patterns only - now including previously problematic tests with fixes
    include: [
      "tests/integration/**/*.test.js",
    ],
    exclude: [
      "tests/unit/**/*.test.js",
      "tests/e2e/**/*.test.js", 
      "tests/performance/**/*.test.js",
      "tests/security/**/*.test.js",
      "tests/validation/**/*.test.js",
      "node_modules/**",
      // Only exclude tests that are genuinely incompatible with CI
      // Remove blanket exclusions to maximize coverage
      // Use selective CI skip conditions in individual test files instead
    ],

    // Conservative settings for integration tests
    threads: 1, // Single thread to prevent conflicts
    maxConcurrency: 1,
    testTimeout: 60000, // Longer timeout for HTTP tests
    hookTimeout: 30000,

    // Pool options for stability
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 1,
        minThreads: 1,
        isolate: true,
      },
    },

    // Allow all tests to run in CI for complete feedback
    bail: process.env.CI === "true" ? false : 1,

    // Coverage for integration tests
    coverage: {
      enabled: false, // Disable coverage for integration tests
    },

    // Enhanced cleanup options for database isolation
    clearMocks: true,
    restoreMocks: true,
    
    // Custom teardown for database cleanup
    teardownTimeout: 10000,
    
    // Isolation settings
    isolate: true,
    pool: 'threads',
    
    // Environment variables
    env: {
      NODE_ENV: 'test',
      TEST_INTEGRATION: 'true',
      TEST_TYPE: 'integration',
      // Use in-memory database for integration tests to prevent SQLITE_BUSY
      TURSO_DATABASE_URL: ':memory:',
      TURSO_AUTH_TOKEN: 'integration-test-token',
      // SQLite busy timeout
      SQLITE_BUSY_TIMEOUT: '30000',
      // Explicitly set CI flag for test detection
      CI: process.env.CI || 'false',
    },

    // Reporter configuration
    reporter: process.env.CI === "true" ? ["default", "json"] : ["verbose"],

    // No retries for deterministic behavior
    retry: 0,
    
    // Sequence options
    sequence: {
      shuffle: false,
      concurrent: false, // Run integration tests sequentially
    },
  },
});