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
    
    // Integration test patterns only
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

    // Bail on first failure to save time
    bail: 1,

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
    },

    // Reporter configuration
    reporter: process.env.CI === "true" ? ["default", "json"] : ["verbose"],

    // Retry configuration for stability
    retry: process.env.CI === "true" ? 2 : 0,
    
    // Sequence options
    sequence: {
      shuffle: false,
      concurrent: false, // Run integration tests sequentially
    },
  },
});