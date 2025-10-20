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
    hookTimeout: Number(process.env.VITEST_HOOK_TIMEOUT || (process.env.CI === 'true' ? 15000 : 10000)),

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

    // PARALLEL EXECUTION WITH RESOURCE LIMITS
    // Switch to forks pool for better isolation and memory management
    // Reduced worker count to prevent memory exhaustion (was causing hangs)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,      // Use multiple forks for parallelism
        isolate: true,          // Maintain test isolation
        execArgv: ['--max-old-space-size=2048'],  // 2GB memory limit per fork (down from 4GB)
        exitTimeout: 5000       // Force kill workers after 5 seconds if they don't exit
      }
    },

    // Reduced concurrency to prevent memory exhaustion
    // CI: 2 workers × 2GB = 4GB max (down from 4 workers × 4GB+ = 16GB+)
    // Local: 1 worker × 2GB = 2GB max (down from 2 workers × 4GB+ = 8GB+)
    maxConcurrency: process.env.CI === 'true' ? 2 : 1,
    minWorkers: process.env.CI === 'true' ? 1 : 1,
    maxWorkers: process.env.CI === 'true' ? 2 : 1,

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