import { defineConfig } from 'vitest/config';

/**
 * Unit Test Configuration - UNIT-ONLY MODE
 * Target: 806+ tests in <2 seconds (extraordinary performance!)
 * 
 * UNIT-ONLY MODE: Integration and E2E tests are disabled for focused unit testing.
 * This configuration exclusively handles unit tests with maximum speed optimization.
 * 
 * Key Features:
 * - In-memory SQLite database (unit test only)
 * - No external service dependencies
 * - Maximum speed optimization
 * - Isolated test environment
 * - Memory optimized for 806+ tests
 * - Sub-2-second execution target
 */
export default defineConfig({
  test: {
    environment: 'node',
    
    // Unit-only mode environment variables
    env: {
      UNIT_ONLY_MODE: 'true',
      CI_ENVIRONMENT: process.env.CI === 'true' ? 'unit-only' : 'unit-dev',
      NODE_ENV: 'test'
    },
    
    // Optimized timeouts for massive unit test suite
    testTimeout: Number(process.env.VITEST_TEST_TIMEOUT || (process.env.CI === 'true' ? 15000 : 10000)),
    hookTimeout: Number(process.env.VITEST_HOOK_TIMEOUT || (process.env.CI === 'true' ? 8000 : 5000)),
    setupTimeout: Number(process.env.VITEST_SETUP_TIMEOUT || 10000),
    teardownTimeout: Number(process.env.VITEST_CLEANUP_TIMEOUT || 5000),
    
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
    
    // Speed optimization settings for massive unit test suite
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Single process for consistent performance with 806+ tests
        isolate: true     // Ensure test isolation
      }
    },
    
    // Maximum concurrency optimized for unit tests only
    maxConcurrency: process.env.CI === 'true' ? 4 : 12, // Increased for unit-only workload
    
    // Minimal retry for fast unit tests
    retry: process.env.CI === 'true' ? 1 : 0,
    
    // Streamlined reporting optimized for large unit test suite
    reporter: process.env.CI === 'true' ? ['verbose', 'junit'] : 'verbose',
    outputFile: process.env.CI === 'true' ? './unit-test-results.xml' : undefined,
    
    // Performance tracking for 806+ tests
    logHeapUsage: process.env.CI === 'true',
    slowTestThreshold: 1000, // Flag slow unit tests (should be fast)
    
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