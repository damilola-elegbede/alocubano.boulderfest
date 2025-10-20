/**
 * Test Environment Management
 * Centralized configuration for different test layers
 */

/**
 * Test Environment Types
 */
export const TEST_ENVIRONMENTS = {
  UNIT: 'unit',
  INTEGRATION: 'integration',
  E2E: 'e2e'
};

/**
 * Database Configuration by Test Type
 */
export const getDatabaseConfig = (testType) => {
  switch (testType) {
    case TEST_ENVIRONMENTS.UNIT:
      return {
        url: ':memory:',  // In-memory database for unit tests
        authToken: null,
        description: 'In-memory SQLite for fast unit tests (no migrations)',
        persistent: false,
        skipMigrations: true,  // Skip migrations for unit test performance
        useSharedCache: true   // Share cache across tests for speed
      };

    case TEST_ENVIRONMENTS.INTEGRATION:
      // Always use in-memory database for perfect test isolation
      // Each test worker gets its own isolated database instance
      // File-based databases cause lock contention with parallel workers
      return {
        url: ':memory:',
        authToken: null, // Integration tests never need auth tokens
        description: 'In-memory SQLite for perfect test isolation',
        persistent: true,
        cleanup: true,
        remoteAllowed: false // Explicitly flag that remote databases are not allowed
      };

    case TEST_ENVIRONMENTS.E2E:
      return {
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
        description: 'Turso production database for E2E tests',
        persistent: true,
        cleanup: false
      };

    default:
      throw new Error(`Unknown test environment type: ${testType}`);
  }
};

/**
 * Mock Configuration by Test Type
 */
export const getMockConfig = (testType) => {
  switch (testType) {
    case TEST_ENVIRONMENTS.UNIT:
      return {
        externalServices: true,  // Mock all external services
        database: false,         // Use real in-memory database
        apis: true,              // Mock external APIs
        payments: true,          // Mock payment processing
        email: true              // Mock email sending
      };

    case TEST_ENVIRONMENTS.INTEGRATION:
      return {
        externalServices: false, // Use real services where possible
        database: false,         // Use real database
        apis: true,              // Mock external APIs (partially)
        payments: true,          // Mock payments (test mode)
        email: true              // Mock email (test mode)
      };

    case TEST_ENVIRONMENTS.E2E:
      return {
        externalServices: false, // Use real services
        database: false,         // Use real database
        apis: false,             // Use real APIs
        payments: false,         // Use real payments (test mode)
        email: false             // Use real email (test mode)
      };

    default:
      throw new Error(`Unknown test environment type: ${testType}`);
  }
};

/**
 * Timeout Configuration by Test Type
 */
export const getTimeoutConfig = (testType) => {
  const isCI = process.env.CI === 'true';

  switch (testType) {
    case TEST_ENVIRONMENTS.UNIT:
      return {
        test: isCI ? 8000 : 5000,    // Aggressive timeout reduction for <2s target
        hook: isCI ? 3000 : 2000,    // Minimal hook time for unit tests
        setup: isCI ? 5000 : 3000,   // Fast setup for unit tests
        cleanup: isCI ? 2000 : 1000  // Minimal cleanup for unit tests
      };

    case TEST_ENVIRONMENTS.INTEGRATION:
      return {
        test: isCI ? 120000 : 60000,
        hook: isCI ? 30000 : 20000,
        setup: isCI ? 30000 : 20000,
        cleanup: isCI ? 20000 : 10000
      };

    case TEST_ENVIRONMENTS.E2E:
      return {
        test: isCI ? 300000 : 180000,
        hook: isCI ? 60000 : 30000,
        setup: isCI ? 60000 : 30000,
        cleanup: isCI ? 30000 : 15000
      };

    default:
      throw new Error(`Unknown test environment type: ${testType}`);
  }
};

/**
 * Port Configuration by Test Type
 */
export const getPortConfig = (testType) => {
  const basePort = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);

  switch (testType) {
    case TEST_ENVIRONMENTS.UNIT:
      return {
        port: basePort,
        description: 'Unit tests use mocked APIs, port for reference only'
      };

    case TEST_ENVIRONMENTS.INTEGRATION:
      return {
        port: basePort + 1, // Offset to avoid conflicts
        description: 'Integration tests require real API server'
      };

    case TEST_ENVIRONMENTS.E2E:
      return {
        port: basePort + 2, // Further offset
        description: 'E2E tests use Vercel Preview Deployment or dedicated server'
      };

    default:
      throw new Error(`Unknown test environment type: ${testType}`);
  }
};

/**
 * Configure Environment for Test Type
 */
export const configureEnvironment = (testType) => {
  const dbConfig = getDatabaseConfig(testType);
  const mockConfig = getMockConfig(testType);
  const timeoutConfig = getTimeoutConfig(testType);
  const portConfig = getPortConfig(testType);

  // Set environment variables
  process.env.NODE_ENV = 'test';
  process.env.TEST_TYPE = testType;

  // Database configuration
  process.env.DATABASE_URL = dbConfig.url;
  if (dbConfig.authToken) {
    process.env.TURSO_AUTH_TOKEN = dbConfig.authToken;
  } else {
    delete process.env.TURSO_AUTH_TOKEN;
  }

  // Additional safety for integration tests - force delete any Turso variables
  if (testType === TEST_ENVIRONMENTS.INTEGRATION) {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    // DATABASE_URL is always set to :memory: by configureEnvironment
  }

  // Port configuration
  process.env.TEST_PORT = portConfig.port.toString();
  process.env.TEST_BASE_URL = `http://localhost:${portConfig.port}`;

  // Timeout configuration
  Object.entries(timeoutConfig).forEach(([key, value]) => {
    process.env[`VITEST_${key.toUpperCase()}_TIMEOUT`] = value.toString();
  });

  // Critical API secrets configuration - required for services to initialize
  // QR Token Service (required by ticket validation API)
  process.env.QR_SECRET_KEY = process.env.QR_SECRET_KEY || 'test-qr-secret-key-minimum-32-characters-long-for-security-compliance';

  // Admin Authentication (required for JWT signing in admin APIs)
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || 'test-admin-jwt-secret-minimum-32-characters-for-security';

  // Wallet service configuration (required for ticket services)
  process.env.WALLET_AUTH_SECRET = process.env.WALLET_AUTH_SECRET || 'test-wallet-auth-secret-key-for-testing-purposes-32-chars';
  process.env.APPLE_PASS_KEY = process.env.APPLE_PASS_KEY || 'dGVzdC1hcHBsZS1wYXNzLWtleQ=='; // base64 encoded 'test-apple-pass-key'
  process.env.APPLE_PASS_CERT = process.env.APPLE_PASS_CERT || 'dGVzdC1jZXJ0aWZpY2F0ZQ=='; // base64 encoded 'test-certificate'

  // Internal API Security (required for secure internal operations)
  process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-api-key-32-chars-min';

  // Brevo Email Service Configuration (required for email services)
  if (!process.env.BREVO_API_KEY && testType !== TEST_ENVIRONMENTS.E2E) {
    process.env.BREVO_API_KEY = testType === TEST_ENVIRONMENTS.UNIT ?
      'test-brevo-api-key-for-unit-tests' :
      'test-brevo-api-key-for-integration-tests';
  }
  process.env.BREVO_NEWSLETTER_LIST_ID = process.env.BREVO_NEWSLETTER_LIST_ID || '1';
  process.env.BREVO_WEBHOOK_SECRET = process.env.BREVO_WEBHOOK_SECRET || 'test-brevo-webhook-secret';

  // Test admin credentials (required for admin panel integration tests)
  process.env.TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'test-admin-password-123';
  // Do NOT set ADMIN_PASSWORD in test environments - it interferes with TEST_ADMIN_PASSWORD
  delete process.env.ADMIN_PASSWORD;

  console.log(`🧪 Test environment configured for: ${testType.toUpperCase()}`);
  console.log(`📍 Database: ${dbConfig.description}`);
  console.log(`🔧 Port: ${portConfig.port} (${portConfig.description})`);
  console.log(`⚡ Timeouts: Test=${timeoutConfig.test}ms, Hook=${timeoutConfig.hook}ms`);

  return {
    testType,
    database: dbConfig,
    mocks: mockConfig,
    timeouts: timeoutConfig,
    port: portConfig
  };
};

/**
 * Cleanup Environment after Tests
 */
export const cleanupEnvironment = async (testType) => {
  const dbConfig = getDatabaseConfig(testType);

  if (dbConfig.cleanup && dbConfig.persistent) {
    try {
      const fs = await import('fs/promises');
      const pathModule = await import('path');

      let dbPath = dbConfig.url.replace('file:', '');

      // Handle relative paths correctly
      if (dbPath.startsWith('./')) {
        dbPath = pathModule.join(process.cwd(), dbPath.substring(2));
      }

      if (dbPath !== ':memory:' && dbPath && !dbPath.startsWith('libsql://')) {
        await fs.unlink(dbPath).catch(() => {}); // Ignore if file doesn't exist
        console.log(`🧹 Cleaned up test database: ${dbPath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not cleanup test database: ${error.message}`);
    }
  }

  console.log(`🧹 Environment cleanup completed for: ${testType.toUpperCase()}`);
};

/**
 * Environment Validation
 */
export const validateEnvironment = (testType) => {
  const errors = [];

  const dbConfig = getDatabaseConfig(testType);
  const mockConfig = getMockConfig(testType);

  // Validate database configuration
  if (testType === TEST_ENVIRONMENTS.E2E) {
    if (!dbConfig.url || !dbConfig.authToken) {
      errors.push('E2E tests require TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
    }
  }

  // Validate Node.js environment
  if (!process.env.NODE_ENV) {
    errors.push('NODE_ENV must be set');
  }

  // Validate test type
  if (!Object.values(TEST_ENVIRONMENTS).includes(testType)) {
    errors.push(`Invalid test type: ${testType}`);
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  console.log(`✅ Environment validation passed for: ${testType.toUpperCase()}`);
  return true;
};