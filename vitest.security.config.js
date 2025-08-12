import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Security tests need isolated environment
    environment: "node",
    globals: true,
    
    // Enhanced setup for security tests
    setupFiles: [
      "./tests/setup-vitest.js"
    ],

    // Security tests only
    include: [
      "tests/security/**/*.test.js",
    ],
    exclude: [
      "tests/unit/**/*.test.js",
      "tests/integration/**/*.test.js",
      "tests/performance/**/*.test.js",
      "tests/e2e/**/*.test.js",
      "node_modules/**",
      // CI-specific exclusions for performance-intensive security tests
      ...(process.env.SECURITY_SKIP_PERFORMANCE_TESTS === 'true' || process.env.TEST_CI_EXCLUDE_PATTERNS === 'true' ? [
        "tests/security/security-performance-impact.test.js"
      ] : []),
    ],

    // Single-threaded execution for security tests
    threads: 1,
    maxConcurrency: 1,
    minThreads: 1,
    maxThreads: 1,
    testTimeout: 30000, // Medium timeout for security checks
    hookTimeout: 15000,

    // Isolated pool for security tests
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 1,
        minThreads: 1,
        isolate: true,
        useAtomics: false,
      },
    },

    // No early bail for comprehensive security testing
    bail: 0,

    // Coverage for security tests (focus on security-related paths)
    coverage: {
      enabled: process.env.COVERAGE === "true",
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportOnFailure: true,
      exclude: [
        "node_modules/",
        "tests/",
        "**/*.config.js",
        "scripts/build/**",
        "public/",
        "css/",
        "images/",
        "migrations/",
      ],
      include: [
        "api/security/**/*.js",
        "api/admin/**/*.js",
        "api/payments/**/*.js",
        "api/tickets/**/*.js",
      ],
      thresholds: {
        global: {
          branches: 85, // Higher threshold for security code
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
    },

    // Enhanced cleanup for security tests
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    pool: 'threads',
    
    // Environment for security tests
    env: {
      NODE_ENV: 'test',
      TEST_TYPE: 'security',
      SECURITY_TEST: 'true',
      // Dedicated memory allocation
      NODE_OPTIONS: '--max-old-space-size=2048',
    },

    // Detailed reporter for security results
    reporter: process.env.CI === "true" ? 
      ["default", "junit", "json"] : 
      ["verbose", "json"],

    // Output files for security tracking
    outputFile: {
      junit: "./test-results/security-junit.xml",
      json: "./test-results/security-results.json",
    },

    // No retry for security tests - issues should be consistent
    retry: 0,
    
    // No file watching for security tests
    watch: false,
    
    // Sequential execution for security tests
    sequence: {
      shuffle: false,
      concurrent: false,
    },
  },
});