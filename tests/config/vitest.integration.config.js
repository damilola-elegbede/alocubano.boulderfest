import { defineConfig } from 'vitest/config';

/**
 * Integration Test Configuration - Real Database & Services
 * Target: ~30-50 tests with real database connections
 * 
 * Key Features:
 * - SQLite database with real file storage
 * - Limited external service integration
 * - Proper test isolation with cleanup
 * - Comprehensive API testing
 */
export default defineConfig({
  test: {
    environment: 'node',
    
    // Longer timeouts for integration tests (database/API operations)
    testTimeout: Number(process.env.VITEST_TEST_TIMEOUT || (process.env.CI === 'true' ? 120000 : 60000)),
    hookTimeout: Number(process.env.VITEST_HOOK_TIMEOUT || (process.env.CI === 'true' ? 30000 : 20000)),
    
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
    
    // Sequential execution for integration tests to avoid database conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,     // Single process to avoid database locks
        isolate: true         // Ensure complete test isolation
      }
    },
    
    // Limited concurrency for integration tests (database safety)
    maxConcurrency: process.env.CI === 'true' ? 1 : 2,
    
    // More retry attempts for integration tests (network/database issues)
    retry: process.env.CI === 'true' ? 2 : 1,
    
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