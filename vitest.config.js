import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default environment is jsdom for browser-based tests
    environment: "jsdom",
    globals: true,
    
    // Enhanced setup files for environment-aware test isolation
    setupFiles: [
      "./tests/setup-vitest.js"                         // Base setup (first)
    ],
    
    // Global setup and teardown for suite-level isolation management
    // globalSetup: "./tests/config/global-test-isolation.js",
    // globalTeardown: "./tests/global-teardown.js",

    // Test file patterns
    include: [
      "tests/unit/**/*.test.js",
      "tests/integration/**/*.test.js",
      "tests/security/**/*.test.js",
      "tests/performance/**/*.test.js",
      "tests/validation/**/*.test.js", // Include validation tests
    ],
    exclude: [
      "tests/e2e/**/*.test.js", // Exclude E2E tests (need Playwright)
      "node_modules/**",
    ],

    // Memory-conscious performance settings with CI optimization
    threads: process.env.CI === "true" ? 4 : 2,
    maxConcurrency: process.env.CI === "true" ? 4 : 2,
    minThreads: 1,
    maxThreads: process.env.CI === "true" ? 4 : 2,
    testTimeout: 60000, // Increased for remote database operations and module loading
    hookTimeout: 30000, // Increased for database initialization and async services

    // Pool options for memory management
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: process.env.CI === "true" ? 4 : 2,
        minThreads: 1,
        isolate: true,
        useAtomics: true,
      },
      forks: {
        singleFork: false,
        maxForks: process.env.CI === "true" ? 4 : 2,
        minForks: 1,
        isolate: true,
      },
    },

    // Bail early on test failures to save resources
    bail: 10,

    // Coverage configuration with proper thresholds
    coverage: {
      enabled: process.env.CI === "true" || process.env.COVERAGE === "true",
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportOnFailure: true,
      exclude: [
        "node_modules/",
        "tests/",
        "**/*.config.js",
        "scripts/build/**",
        "scripts/test-*",
        "public/",
        "css/",
        "images/",
        "migrations/",
        "**/*.d.ts",
        "**/types.js",
      ],
      include: ["api/**/*.js", "js/**/*.js", "scripts/*.js"],
      thresholds: {
        global: {
          branches: 60, // Overall project threshold
          functions: 60,
          lines: 60,
          statements: 60,
        },
        // Critical paths require 80% coverage
        "api/payments/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        "api/tickets/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        "api/admin/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        "js/cart/**": {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
        },
      },
    },

    // Enhanced cleanup options with automatic isolation
    clearMocks: true,
    restoreMocks: true,
    
    // Isolation-specific configuration
    isolate: true, // Ensure test isolation at Vitest level
    pool: 'threads', // Use threads for better isolation
    
    // Environment variables will be set dynamically by environment-aware setup
    // No default env vars here to prevent conflicts between unit/integration tests
    env: {
      TEST_ISOLATION_ENHANCED: 'true',
      TEST_AUTO_ISOLATION: 'true',
      NODE_ENV: 'test'
    },

    // Reporter configuration
    reporter:
      process.env.CI === "true" ? ["default", "junit", "json"] : ["verbose"],

    // Output files for CI reporting
    outputFile: {
      junit: "./test-results/junit.xml",
      json: "./test-results/results.json",
    },

    // Retry configuration for flaky tests
    retry: process.env.CI === "true" ? 2 : 0,
  },
});
