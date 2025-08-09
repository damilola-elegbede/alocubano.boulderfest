import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default environment is jsdom for browser-based tests
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup-vitest.js"],
    globalTeardown: "./tests/global-teardown.js",

    // Test file patterns
    include: ["tests/unit/**/*.test.js", "tests/integration/**/*.test.js"],
    exclude: [
      "tests/e2e/**/*.test.js", // Exclude E2E tests (need Playwright)
      "node_modules/**",
    ],

    // Memory-conscious performance settings for CI
    threads: process.env.CI ? false : true, // Disable threading in CI for stability
    maxConcurrency: process.env.CI ? 1 : 2, // Single thread in CI
    minThreads: 1,
    maxThreads: process.env.CI ? 1 : 2,
    testTimeout: process.env.CI ? 30000 : 10000, // Longer timeout for CI

    // Pool options for memory management
    poolOptions: {
      threads: {
        singleThread: process.env.CI ? true : false,
        maxThreads: process.env.CI ? 1 : 2,
        minThreads: 1,
        isolate: true,
        // Use worker threads instead of child processes
        useAtomics: process.env.CI ? false : true,
      },
      forks: {
        singleFork: process.env.CI ? true : false,
        maxForks: process.env.CI ? 1 : 2,
        minForks: 1,
        isolate: true,
      },
    },

    // Bail early on test failures to save resources
    bail: 10,

    // Disable coverage by default to save memory
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/",
        "tests/",
        "**/*.config.js",
        "scripts/",
        "public/",
        "css/",
        "images/",
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },

    // Enhanced cleanup options
    clearMocks: true,
    restoreMocks: true,

    // Reporter configuration
    reporter: ["verbose"],
  },
});
