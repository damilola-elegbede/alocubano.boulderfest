import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration test environment
    environment: "node",
    globals: true,
    
    // Integration-specific setup
    setupFiles: [
      "./tests/setup-vitest.js"
    ],
    
    // Integration test patterns only - exclude problematic tests in CI
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
      // Skip these specific tests in CI to prevent conflicts
      ...(process.env.CI === 'true' || process.env.TEST_CI_EXCLUDE_PATTERNS === 'true' ? [
        "tests/integration/google-sheets.test.js",
        "tests/integration/database-api.test.js",
        "tests/integration/monitoring.test.js",
        "tests/integration/database-operations-improved.test.js",
        "tests/integration/brevo-email-improved.test.js"
      ] : []),
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

    // Enhanced cleanup options
    clearMocks: true,
    restoreMocks: true,
    
    // Isolation settings
    isolate: true,
    pool: 'threads',
    
    // Environment variables
    env: {
      NODE_ENV: 'test',
      TEST_INTEGRATION: 'true',
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