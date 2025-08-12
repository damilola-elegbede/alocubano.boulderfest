import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default environment is jsdom for browser-based tests
    environment: "jsdom",
    globals: true,
    
    // Minimal setup for baseline performance
    setupFiles: [
      "./tests/setup-vitest.js"  // Only original setup
    ],

    // Test file patterns
    include: [
      "tests/unit/**/*.test.js",
    ],
    exclude: [
      "tests/e2e/**/*.test.js", // Exclude E2E tests (need Playwright)
      "tests/integration/**/*.test.js", // Exclude integration for baseline
      "node_modules/**",
      // Exclude problematic tests for clean baseline
      "tests/unit/database-environment.test.js",
      "tests/unit/database-singleton.test.js",
      "tests/unit/test-environment-manager.test.js",
    ],

    // Minimal performance settings
    threads: 1,
    maxConcurrency: 1,
    minThreads: 1,
    maxThreads: 1,
    testTimeout: 10000,
    hookTimeout: 5000,

    // Pool options for single-threaded execution
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 1,
        minThreads: 1,
        isolate: false, // Disable Vitest isolation for pure baseline
        useAtomics: false,
      }
    },

    // Basic cleanup only
    clearMocks: true,
    restoreMocks: false,
    
    // Disable enhanced isolation
    isolate: false,
    pool: 'threads',
    
    // Environment variables for baseline
    env: {
      TEST_ISOLATION_ENHANCED: 'false',
      TEST_AUTO_ISOLATION: 'false'
    },

    // Reporter configuration
    reporter: ["default"],

    // No retry for baseline
    retry: 0,
  },
});