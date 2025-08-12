import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Performance tests need node environment for better control
    environment: "node",
    globals: true,
    
    // Minimal setup for performance tests
    setupFiles: [
      "./tests/setup-vitest.js"
    ],

    // Performance tests only
    include: [
      "tests/performance/**/*.test.js",
    ],
    exclude: [
      "tests/unit/**/*.test.js",
      "tests/integration/**/*.test.js",
      "tests/e2e/**/*.test.js",
      "node_modules/**",
    ],

    // Single-threaded execution for consistent performance metrics
    threads: 1,
    maxConcurrency: 1,
    minThreads: 1,
    maxThreads: 1,
    testTimeout: 120000, // Very long timeout for performance tests
    hookTimeout: 60000,

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

    // No early bail for performance tests
    bail: 0,

    // No coverage for performance tests
    coverage: {
      enabled: false,
    },

    // Minimal cleanup for performance tests
    clearMocks: true,
    restoreMocks: false, // Keep state between performance runs
    isolate: false, // Allow state persistence for benchmarking
    pool: 'threads',
    
    // Environment for performance tests
    env: {
      NODE_ENV: 'test',
      TEST_TYPE: 'performance',
      PERFORMANCE_TEST: 'true',
      // Dedicated memory allocation
      NODE_OPTIONS: '--max-old-space-size=4096',
    },

    // Detailed reporter for performance metrics
    reporter: process.env.CI === "true" ? 
      ["default", "junit", "json"] : 
      ["verbose", "json"],

    // Output files for performance tracking
    outputFile: {
      junit: "./test-results/performance-junit.xml",
      json: "./test-results/performance-results.json",
    },

    // No retry for performance tests - results should be consistent
    retry: 0,
    
    // No file watching for performance tests
    watch: false,
    
    // Strict sequential execution for performance tests
    sequence: {
      shuffle: false,
      concurrent: false,
    },
  },
});