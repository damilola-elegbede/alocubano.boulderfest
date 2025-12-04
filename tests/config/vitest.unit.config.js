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
    // Use node environment for maximum speed in unit tests
    environment: 'node',

    // Configure jsdom environment options for tests that override with @vitest-environment jsdom
    environmentOptions: {
      jsdom: {
        // Provide URL for localStorage to work properly
        url: 'http://localhost:3000',
      },
    },

    // Unit-only mode environment variables
    env: {
      UNIT_ONLY_MODE: 'true',
      CI_ENVIRONMENT: process.env.CI === 'true' ? 'unit-only' : 'unit-dev',
      NODE_ENV: 'test',
      // Performance optimization flags
      SKIP_DATABASE_MIGRATIONS: 'true',  // Skip per-test migrations
      UNIT_TEST_PERFORMANCE_MODE: 'true',

      // Critical API secrets configuration - required for services to initialize
      QR_SECRET_KEY: 'test-qr-secret-key-minimum-32-characters-long-for-security-compliance',
      ADMIN_SECRET: 'test-admin-jwt-secret-minimum-32-characters-for-security',
      WALLET_AUTH_SECRET: 'test-wallet-auth-secret-key-for-testing-purposes-32-chars',
      APPLE_PASS_KEY: 'dGVzdC1hcHBsZS1wYXNzLWtleQ==', // base64 encoded 'test-apple-pass-key'
      APPLE_PASS_CERT: 'dGVzdC1jZXJ0aWZpY2F0ZQ==', // base64 encoded 'test-certificate'
      INTERNAL_API_KEY: 'test-internal-api-key-32-chars-min',
      REGISTRATION_SECRET: 'test-registration-secret-key-minimum-32-chars-long',
      TEST_ADMIN_PASSWORD: 'test-admin-password-123',
      ADMIN_PASSWORD: '$2b$10$test.bcrypt.hash.for.testing.purposes.only',

      // Database configuration for unit tests (match CI exactly)
      DATABASE_URL: ':memory:'
    },

    // Timeouts matching CI configuration exactly
    testTimeout: Number(process.env.VITEST_TEST_TIMEOUT || 8000),  // Match CI: 8s
    hookTimeout: Number(process.env.VITEST_HOOK_TIMEOUT || 3000),  // Match CI: 3s
    setupTimeout: Number(process.env.VITEST_SETUP_TIMEOUT || 5000),
    teardownTimeout: Number(process.env.VITEST_CLEANUP_TIMEOUT || 2000),

    // Unit test specific setup (UNIT-ONLY)
    // setup-jsdom.js MUST come first to fix localStorage before any modules load
    setupFiles: [
      './tests/setup-jsdom.js',       // JSDOM localStorage/sessionStorage fix (MUST BE FIRST)
      './tests/setup-unit.js',        // General unit test setup
      './tests/setup-happy-dom.js',   // Happy-DOM environment setup for frontend tests
      './tests/setup-react.js'        // React Testing Library setup
    ],
    globals: true,

    // Include ONLY unit tests (Integration and E2E excluded)
    // Supports both .js and .jsx test files for React components
    include: ['tests/unit/**/*.test.js', 'tests/unit/**/*.test.jsx'],
    exclude: [
      'node_modules/**',
      'tests/e2e/**',         // E2E tests excluded (disabled)
      'tests/integration/**', // Integration tests excluded (disabled)
      'tests/unit/cron/**',   // Cron tests are integration tests (use TestIsolationManager + real DB, covered in tests/integration/cron/)
      'tests/unit/bootstrap-ticket-architecture.test.js', // API integration test (requires running server)
      'tests/helpers/**',     // Test helpers (utilities only)
      'tests/mocks/**',       // Mock data (utilities only)
      'tests/fixtures/**'     // Test fixtures (utilities only)
    ],

    // Use forks pool (Vitest recommended default for stability)
    // Threads can cause hanging issues with native modules and cleanup
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,      // Use multiple forks for parallelism
        isolate: true,          // Isolate tests for safety
        execArgv: ['--max-old-space-size=2048'],  // Optimized: 2GB (reduced from 4GB)
        exitTimeout: 5000       // Force kill hanging workers after 5 seconds
      }
    },

    // Optimized concurrency to prevent CPU/memory saturation
    maxConcurrency: 2,  // Reduced from 4 to improve stability

    // Zero retry for maximum speed (unit tests should be deterministic)
    retry: 0,

    // CRITICAL: Force process cleanup after tests complete
    forceRerunTriggers: ['**/package.json', '**/vitest.config.*'],
    isolate: true,  // Enable isolation for test safety

    // MINIMAL reporting for speed + hanging-process for debugging
    reporter: process.env.CI === 'true'
      ? ['dot', 'junit']
      : process.env.DEBUG_HANGING
        ? ['default', 'hanging-process']  // Use DEBUG_HANGING=1 to debug hanging
        : 'dot',  // Dot reporter is fastest
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