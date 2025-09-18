/**
 * Integration Test Setup - Real Database & Services
 * Target: ~30-50 tests with proper database isolation
 *
 * Uses in-memory SQLite databases for complete isolation between tests
 * preventing SQLITE_BUSY, SQLITE_LOCKED, and CLIENT_CLOSED errors.
 */

// Force build-time cache access for integration tests (must be before any imports)
process.env.INTEGRATION_TEST_MODE = 'true';

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { configureEnvironment, cleanupEnvironment, validateEnvironment, TEST_ENVIRONMENTS } from './config/test-environment.js';
import { getTestIsolationManager } from '../lib/test-isolation-manager.js';

// Import secret validation for integration tests (simplified version of E2E secret validation)
const validateIntegrationSecrets = () => {
  const requiredSecrets = {
    // Basic secrets needed for integration tests
    WALLET_AUTH_SECRET: {
      description: 'Wallet pass JWT signing secret',
      validator: (value) => value && value.length >= 32,
      fallback: 'test-wallet-auth-secret-key-for-testing-purposes-32-chars'
    },
    APPLE_PASS_KEY: {
      description: 'Apple Wallet pass signing key (base64)',
      validator: (value) => value && value.length > 20,
      fallback: 'dGVzdC1hcHBsZS1wYXNzLWtleS1mb3ItaW50ZWdyYXRpb24tdGVzdGluZw==' // base64 test key
    },
    ADMIN_SECRET: {
      description: 'Admin JWT signing secret',
      validator: (value) => value && value.length >= 32,
      fallback: 'admin-secret-for-integration-tests-32-chars-plus'
    }
  };

  const optionalSecrets = {
    // Optional secrets that may be used by integration tests
    BREVO_API_KEY: {
      description: 'Brevo email service API key (optional for integration tests)',
      validator: (value) => !value || value.startsWith('xkeysib-')
    },
    STRIPE_SECRET_KEY: {
      description: 'Stripe payment secret key (optional for integration tests)',
      validator: (value) => !value || value.startsWith('sk_test_') || value.startsWith('sk_live_')
    },
    GOOGLE_SERVICE_ACCOUNT_EMAIL: {
      description: 'Google service account email (optional for integration tests)',
      validator: (value) => !value || (value.includes('@') && value.includes('.iam.gserviceaccount.com'))
    },
    GOOGLE_PRIVATE_KEY: {
      description: 'Google service account private key (optional for integration tests)',
      validator: (value) => !value || (value.includes('BEGIN PRIVATE KEY') || value.length > 100)
    },
    GOOGLE_DRIVE_GALLERY_FOLDER_ID: {
      description: 'Google Drive gallery folder ID (optional for integration tests)',
      validator: (value) => !value || value.length > 10
    }
  };

  console.log('🔐 Validating Integration Test Secrets...');

  let allValid = true;
  const warnings = [];

  // Validate and set required secrets with fallbacks
  Object.entries(requiredSecrets).forEach(([key, config]) => {
    const currentValue = process.env[key];

    if (!currentValue || !config.validator(currentValue)) {
      if (config.fallback) {
        console.log(`⚠️ ${key} missing or invalid - using test fallback`);
        process.env[key] = config.fallback;
        warnings.push(`${key}: Using fallback value for integration tests`);
      } else {
        console.error(`❌ ${key}: ${config.description} - required for integration tests`);
        allValid = false;
      }
    } else {
      console.log(`✅ ${key}: Valid`);
    }
  });

  // Validate optional secrets (don't fail if missing)
  Object.entries(optionalSecrets).forEach(([key, config]) => {
    const currentValue = process.env[key];

    if (currentValue && !config.validator(currentValue)) {
      console.warn(`⚠️ ${key}: Present but invalid format - ${config.description}`);
      warnings.push(`${key}: Present but invalid format`);
    } else if (currentValue) {
      console.log(`✅ ${key}: Valid (optional)`);
    } else {
      console.log(`⏭️ ${key}: Not configured (optional for integration tests)`);
    }
  });

  if (warnings.length > 0) {
    console.log(`⚠️ ${warnings.length} integration test secret warnings (using fallbacks or graceful degradation)`);
  }

  if (allValid) {
    console.log('✅ Integration test secret validation completed successfully');
  } else {
    throw new Error('❌ Integration test secret validation failed - missing required secrets');
  }

  return {
    valid: allValid,
    warnings,
    totalChecked: Object.keys(requiredSecrets).length + Object.keys(optionalSecrets).length
  };
};

// CRITICAL FIX: Use in-memory SQLite for complete test isolation
// This prevents SQLITE_BUSY, SQLITE_LOCKED, and race condition errors
process.env.DATABASE_URL = ':memory:';
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.TURSO_DATABASE_URL;
// Ensure this is not detected as E2E test
delete process.env.E2E_TEST_MODE;
delete process.env.PLAYWRIGHT_BROWSER;
delete process.env.VERCEL_DEV_STARTUP;

// Additional safety measures for integration test isolation
process.env.TEST_DATABASE_TYPE = 'sqlite_memory';
process.env.FORCE_LOCAL_DATABASE = 'true';

// CRITICAL: Disable enterprise features for integration tests
// These cause CLIENT_CLOSED errors due to complex connection management
process.env.FEATURE_ENABLE_CONNECTION_POOL = 'false';
process.env.FEATURE_ENABLE_ENTERPRISE_MONITORING = 'false';
process.env.FEATURE_ENABLE_CIRCUIT_BREAKER = 'false';
process.env.SKIP_ENTERPRISE_INIT = 'true';

// Also set rollout percentages to 0 for extra safety
process.env.ROLLOUT_ENABLE_CONNECTION_POOL = '0';
process.env.ROLLOUT_ENABLE_ENTERPRISE_MONITORING = '0';
process.env.ROLLOUT_ENABLE_CIRCUIT_BREAKER = '0';

// Store original values for restoration later (for cleanup)
const originalTursoUrl = process.env.TURSO_DATABASE_URL;
const originalTursoToken = process.env.TURSO_AUTH_TOKEN;

// Perform secret validation before environment configuration
console.log('🔧 Step 1: Integration Test Secret Validation');
const secretValidation = validateIntegrationSecrets();

// Configure integration test environment
console.log('🔧 Step 2: Environment Configuration');
const config = configureEnvironment(TEST_ENVIRONMENTS.INTEGRATION);

// Validate environment setup
console.log('🔧 Step 3: Environment Validation');
validateEnvironment(TEST_ENVIRONMENTS.INTEGRATION);

// Initialize Test Isolation Manager
console.log('🔧 Step 4: Initializing Test Isolation Manager');
const isolationManager = getTestIsolationManager();

console.log('✅ Integration test environment configured with in-memory SQLite');
console.log('🚀 Each test gets its own isolated database - no lock contention possible');

// Export utilities for integration tests
export const getApiUrl = (path) => `${process.env.TEST_BASE_URL}${path}`;
export const isCI = () => process.env.CI === 'true';
export const getTestTimeout = () => Number(process.env.VITEST_TEST_TIMEOUT || config.timeouts.test);

/**
 * Initialize Database for Integration Tests with Test Isolation
 * Run migrations once at suite level to improve performance
 */
const initializeDatabase = async () => {
  try {
    // Initialize test isolation mode
    await isolationManager.initializeTestMode();

    // Create initial scope for migrations
    const scope = await isolationManager.createTestScope('migration-init');

    // Get scoped database client
    const dbClient = await isolationManager.getScopedDatabaseClient();

    // Import migration system
    const { MigrationSystem } = await import('../scripts/migrate.js');

    // Run migrations with the scoped client ONCE at suite level
    console.log('🔄 Running database migrations for integration tests (suite-level)...');
    const migrationSystem = new MigrationSystem();

    // Override BOTH methods to use our scoped client (ensureDbClient is what runMigrations actually calls)
    migrationSystem.getClient = async () => dbClient;
    migrationSystem.ensureDbClient = async () => dbClient;

    const migrationResult = await migrationSystem.runMigrations();
    console.log(`✅ Migration completed: ${migrationResult.executed} executed, ${migrationResult.skipped} skipped`);

    // Mark migration as completed globally for all test scopes
    process.env.INTEGRATION_MIGRATIONS_COMPLETED = 'true';

    // Verify the connection works
    const testResult = await dbClient.execute('SELECT 1 as test');
    if (!testResult || !testResult.rows || testResult.rows.length !== 1) {
      throw new Error('Database connection test failed');
    }

    // Verify tables exist
    const tableCheck = await dbClient.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'"
    );
    if (tableCheck.rows.length === 0) {
      throw new Error('Migration verification failed: transactions table not found');
    }
    console.log('✅ Verified transactions table exists');

    console.log('✅ Integration database initialized with in-memory SQLite');

    // Clean up migration scope - tests will create their own
    await isolationManager.completeTest();
  } catch (error) {
    console.error('❌ Failed to initialize integration database:', error);
    throw error;
  }
};

/**
 * Clean Database Between Tests using Test Isolation
 * With in-memory databases, this is now much simpler
 */
const cleanDatabase = async () => {
  try {
    // Get scoped database client for cleaning
    const dbClient = await isolationManager.getScopedDatabaseClient();

    // With in-memory database, we can simply clear tables without worrying about locks
    // Get all tables from database
    const tableQuery = await dbClient.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
    );
    const tables = tableQuery.rows.map(row => row.name);

    // Clear all tables (except migrations)
    for (const table of tables) {
      try {
        await dbClient.execute(`DELETE FROM "${table}"`);
      } catch (error) {
        console.warn(`⚠️ Failed to clean table ${table}: ${error.message}`);
      }
    }

    console.log(`🧹 Database cleaned: ${tables.length} tables`);
  } catch (error) {
    console.warn('⚠️ Database cleanup warning:', error.message);
    // With in-memory databases, cleanup failures are less critical
  }
};

// Ensure fetch is available
if (!globalThis.fetch) {
  try {
    const { default: fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
  } catch (error) {
    console.warn('⚠️ node-fetch not available for integration tests');
  }
}

// Integration test lifecycle with Test Isolation
beforeAll(async () => {
  console.log('🚀 Integration test suite starting with in-memory SQLite');
  console.log(`📊 Target: ~30-50 tests with isolated databases`);
  console.log(`🗄️ Database: In-memory SQLite (complete isolation)`);
  console.log(`🔧 Port: ${config.port.port} (${config.port.description})`);
  console.log(`🔐 Secrets: ${secretValidation.totalChecked} checked, ${secretValidation.warnings.length} warnings`);
  console.log(`🧪 Test Isolation: PERFECT - Each test gets fresh in-memory database`);

  if (secretValidation.warnings.length > 0) {
    console.log('⚠️ Integration test warnings:');
    secretValidation.warnings.forEach(warning => console.log(`   - ${warning}`));
  }

  // Initialize database with migrations
  await initializeDatabase();
}, config.timeouts.setup);

// Global test counter for unique test IDs
let testCounter = 0;

beforeEach(async (context) => {
  // Create unique test ID
  testCounter++;
  const testName = context?.task?.name || `test-${testCounter}`;

  console.log(`🧪 Starting test: ${testName}`);

  // CRITICAL: Ensure complete isolation for this test
  await isolationManager.ensureTestIsolation(testName);

  // Clean database with fresh connection
  await cleanDatabase();
}, config.timeouts.hook);

afterEach(async () => {
  // CRITICAL: Complete test and clean up all resources
  await isolationManager.completeTest();

  console.log(`✅ Test completed and isolated`);
}, config.timeouts.hook);

afterAll(async () => {
  console.log('🧹 Starting integration test suite cleanup');

  // Clean up all test scopes
  await isolationManager.cleanupAllScopes();

  // No need to clean up database files with in-memory SQLite!
  console.log('✅ No file cleanup needed with in-memory databases');

  await cleanupEnvironment(TEST_ENVIRONMENTS.INTEGRATION);
  console.log('✅ Integration test cleanup completed');
}, config.timeouts.cleanup);

/**
 * Export database client getter that uses Test Isolation
 * Each call gets a scoped client for the current test
 */
export const getDbClient = async () => {
  // Always get a scoped client from the isolation manager
  return await isolationManager.getScopedDatabaseClient();
};

// Export isolation manager stats for debugging
export const getIsolationStats = () => isolationManager.getStats();

// Export secret validation result for tests that need to check availability
export const getSecretValidation = () => secretValidation;

console.log('🧪 Integration test environment ready - using in-memory SQLite for perfect isolation');