import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests optimized for speed and isolation
    environment: "jsdom",
    globals: true,
    
    // Basic setup for unit tests only
    setupFiles: [
      "./tests/setup-vitest.js"
    ],

    // Unit tests only - exclude integration and performance
    include: [
      "tests/unit/**/*.test.js",
    ],
    exclude: [
      "tests/e2e/**/*.test.js",
      "tests/integration/**/*.test.js",
      "tests/performance/**/*.test.js",
      "tests/security/**/*.test.js",
      "tests/validation/**/*.test.js",
      "node_modules/**",
      // Ensure problematic tests are excluded even if they're somehow included
      "**/google-sheets.test.js",
      "**/database-api.test.js",
      // CI-specific exclusions for problematic tests
      ...(process.env.TEST_CI_EXCLUDE_PATTERNS === 'true' ? [
        "tests/unit/test-environment-manager-usage-examples.test.js",
        "tests/unit/complete-isolation-demo.test.js", 
        "tests/unit/test-singleton-manager.test.js",
        "tests/unit/test-mock-manager.test.js"
      ] : []),
    ],

    // Optimized settings for unit tests
    threads: process.env.CI === "true" ? 1 : 2,
    maxConcurrency: process.env.CI === "true" ? 1 : 2,
    minThreads: 1,
    maxThreads: process.env.CI === "true" ? 1 : 2,
    testTimeout: 15000, // Shorter timeout for fast unit tests
    hookTimeout: 10000,

    // Pool options optimized for unit test performance
    poolOptions: {
      threads: {
        singleThread: process.env.CI === "true",
        maxThreads: process.env.CI === "true" ? 1 : 2,
        minThreads: 1,
        isolate: true,
        useAtomics: false,
      },
    },

    // Fast failure for unit tests
    bail: 5,

    // Coverage configuration for unit tests
    coverage: {
      enabled: process.env.COVERAGE === "true",
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
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
        // Critical paths require higher coverage
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
      },
    },

    // Standard cleanup for unit tests
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    pool: 'threads',
    
    // Environment for unit tests
    env: {
      NODE_ENV: 'test',
      TEST_TYPE: 'unit',
    },

    // Reporter configuration
    reporter: process.env.CI === "true" ? ["default", "junit", "json"] : ["verbose"],

    // Output files for CI reporting
    outputFile: {
      junit: "./test-results/unit-junit.xml",
      json: "./test-results/unit-results.json",
    },

    // No retry for unit tests - they should be deterministic
    retry: 0,
    
    // File watching for development
    watch: process.env.CI !== "true",
    
    // Fast sequential execution for unit tests
    sequence: {
      shuffle: false,
      concurrent: true,
    },
  },
});
