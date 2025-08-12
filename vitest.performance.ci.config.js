import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Performance tests in CI need minimal, focused testing
    environment: "node",
    globals: true,
    
    // Minimal setup for CI performance tests
    setupFiles: [
      "./tests/setup-vitest.js"
    ],

    // Only safe performance tests in CI
    include: [
      "tests/performance/checkout-performance.test.js",
      // Explicitly exclude load-integration tests that require HTTP connections
    ],
    exclude: [
      "tests/unit/**/*.test.js",
      "tests/integration/**/*.test.js",
      "tests/e2e/**/*.test.js",
      "tests/performance/load-integration.test.js", // Always exclude HTTP-based tests
      "node_modules/**",
    ],

    // Single-threaded for consistent CI results
    threads: 1,
    maxConcurrency: 1,
    minThreads: 1,
    maxThreads: 1,
    testTimeout: 60000, // Shorter timeout in CI
    hookTimeout: 30000,

    // Dedicated single-threaded pool
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 1,
        minThreads: 1,
        isolate: true,
        useAtomics: false,
      },
    },

    // Fast fail in CI
    bail: 1,

    // No coverage for performance tests
    coverage: {
      enabled: false,
    },

    // Minimal cleanup for performance tests
    clearMocks: true,
    restoreMocks: false,
    isolate: false,
    pool: 'threads',
    
    // CI environment for performance tests
    env: {
      NODE_ENV: 'test',
      TEST_TYPE: 'performance',
      PERFORMANCE_TEST: 'true',
      CI: 'true',
      // Reduced memory allocation for CI
      NODE_OPTIONS: '--max-old-space-size=2048',
    },

    // CI-focused reporters
    reporter: ["default", "junit", "json"],

    // Output files for CI tracking
    outputFile: {
      junit: "./test-results/performance-ci-junit.xml",
      json: "./test-results/performance-ci-results.json",
    },

    // No retry in CI
    retry: 0,
    
    // No file watching in CI
    watch: false,
    
    // Strict sequential execution
    sequence: {
      shuffle: false,
      concurrent: false,
    },
  },
});