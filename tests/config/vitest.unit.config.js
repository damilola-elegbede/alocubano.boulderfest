import { defineConfig } from 'vitest/config';

/**
 * Unit Test Configuration - OPTIMIZED FOR <2 SECOND TARGET
 * Current: 1126+ tests in 5.13s → Target: <2 seconds (61% performance improvement needed)
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Aggressive timeout reduction
 * - Memory allocation optimization
 * - Enhanced concurrency settings
 * - Database migration optimization
 * - Resource pooling improvements
 *
 * Key Features:
 * - In-memory SQLite database (unit test only)
 * - No external service dependencies
 * - Maximum speed optimization
 * - Isolated test environment
 * - Memory optimized for 1126+ tests
 * - Sub-2-second execution target
 */
export default defineConfig({
  test: {
    // Use jsdom as default since most failing tests need DOM
    environment: 'jsdom',

    // Unit-only mode environment variables
    env: {
      UNIT_ONLY_MODE: 'true',
      CI_ENVIRONMENT: process.env.CI === 'true' ? 'unit-only' : 'unit-dev',
      NODE_ENV: 'test',
      // Performance optimization flags
      SKIP_DATABASE_MIGRATIONS: 'true',  // Skip per-test migrations
      UNIT_TEST_PERFORMANCE_MODE: 'true'
    },

    // AGGRESSIVE timeout optimization for <2s target
    testTimeout: Number(process.env.VITEST_TEST_TIMEOUT || (process.env.CI === 'true' ? 8000 : 5000)),
    hookTimeout: Number(process.env.VITEST_HOOK_TIMEOUT || (process.env.CI === 'true' ? 3000 : 2000)),
    setupTimeout: Number(process.env.VITEST_SETUP_TIMEOUT || 5000),
    teardownTimeout: Number(process.env.VITEST_CLEANUP_TIMEOUT || 2000),
    
    // Unit test specific setup (UNIT-ONLY)
    setupFiles: ['./tests/setup-unit.js'],
    globals: true,
    
    // Include ONLY unit tests (Integration and E2E excluded)
    include: ['tests/unit/**/*.test.js'],
    exclude: [
      'node_modules/**', 
      'tests/e2e/**',         // E2E tests excluded (disabled)
      'tests/integration/**', // Integration tests excluded (disabled)
      'tests/helpers/**',     // Test helpers (utilities only)
      'tests/mocks/**',       // Mock data (utilities only)
      'tests/fixtures/**'     // Test fixtures (utilities only)
    ],
    
    // OPTIMIZED pooling for maximum performance with stability
    pool: 'forks',  // Use forks for better stability (still very fast)
    poolOptions: {
      forks: {
        singleFork: false,    // Enable multi-process for performance
        isolate: false,       // Reduce isolation overhead for unit tests
        minForks: process.env.CI === 'true' ? 1 : 2,
        maxForks: process.env.CI === 'true' ? 3 : 6
      }
    },

    // ENHANCED concurrency for unit test performance
    maxConcurrency: process.env.CI === 'true' ? 6 : 12,  // Optimized concurrency
    minWorkers: process.env.CI === 'true' ? 1 : 2,
    maxWorkers: process.env.CI === 'true' ? 3 : 6,

    // Zero retry for maximum speed (unit tests should be deterministic)
    retry: 0,

    // MINIMAL reporting for speed
    reporter: process.env.CI === 'true' ? ['dot', 'junit'] : 'dot',  // Dot reporter is fastest
    outputFile: process.env.CI === 'true' ? './unit-test-results.xml' : undefined,

    // Performance tracking optimized
    logHeapUsage: false,  // Disable for speed unless CI
    slowTestThreshold: 500,  // Flag slow unit tests more aggressively
    
    // Coverage configuration for unit tests only
    coverage: {
      provider: 'v8',
      include: [
        'api/**/*.js',  // API functions (unit tested)
        'js/**/*.js'    // Frontend logic (unit tested)
      ],
      exclude: [
        'tests/**',           // Test files
        'scripts/**',         // Build/dev scripts
        'config/**',          // Configuration files
        'migrations/**',      // Database migrations
        'e2e/**',            // E2E directories (disabled)
        'integration/**'     // Integration directories (disabled)
      ],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/unit-only',
      
      // Coverage thresholds for unit tests
      thresholds: {
        global: {
          branches: 80,
          functions: 85,
          lines: 85,
          statements: 85
        }
      }
    }
  },
  
  // Unit-only mode configuration metadata
  define: {
    __UNIT_ONLY_MODE__: 'true',
    __INTEGRATION_DISABLED__: 'true',
    __E2E_DISABLED__: 'true',
    __TEST_STRATEGY__: '"unit-only"'
  }
});