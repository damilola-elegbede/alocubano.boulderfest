import { defineConfig } from 'vitest/config';

/**
 * Integration Test Configuration - Real Database & Services
 * Target: ~30-50 tests with real database connections
 *
 * Key Features:
 * - In-memory SQLite databases for perfect test isolation
 * - Parallel test execution enabled (no more lock contention!)
 * - Limited external service integration
 * - Proper test isolation with cleanup
 * - Comprehensive API testing
 */
export default defineConfig({
  test: {
    environment: 'node',

    // Optimized timeouts for in-memory databases (faster than file-based)
    testTimeout: Number(process.env.VITEST_TEST_TIMEOUT || (process.env.CI === 'true' ? 30000 : 15000)),
    hookTimeout: Number(process.env.VITEST_HOOK_TIMEOUT || (process.env.CI === 'true' ? 10000 : 5000)),

    // Integration test specific setup
    setupFiles: ['./tests/setup-integration.js'],
    globals: true,

    // Include only integration tests
    include: ['tests/integration/**/*.test.js'],
    exclude: [
      'node_modules/**',
      'tests/e2e/**',
      'tests/unit/**',
      'tests/helpers/**'
    ],

    // PARALLEL EXECUTION ENABLED!
    // In-memory SQLite allows safe parallel test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 2,
        maxThreads: process.env.CI === 'true' ? 4 : 2, // More workers in CI
        isolate: true // Maintain test isolation
      }
    },

    // Enable concurrent test execution (no more database locks!)
    maxConcurrency: 4,
    minWorkers: 2,
    maxWorkers: process.env.CI === 'true' ? 4 : 2,

    // Fewer retries needed with in-memory databases
    retry: process.env.CI === 'true' ? 1 : 0,

    // Detailed reporting for integration tests
    reporter: process.env.CI === 'true' ? ['verbose', 'junit'] : 'verbose',
    outputFile: process.env.CI === 'true' ? './integration-test-results.xml' : undefined,

    // Resource monitoring for integration tests
    logHeapUsage: true,

    // Coverage configuration for integration tests
    coverage: {
      provider: 'v8',
      include: [
        'api/**/*.js',
        'js/**/*.js'
      ],
      exclude: [
        'tests/**',
        'scripts/**',
        'config/**',
        'migrations/**'
      ],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/integration'
    }
  }
});