/**
 * Integration Test Setup - Real Database & Services
 * Target: ~30-50 tests with proper database isolation
 */

// Force build-time cache access for integration tests (must be before any imports)
process.env.INTEGRATION_TEST_MODE = 'true';

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { configureEnvironment, cleanupEnvironment, validateEnvironment, TEST_ENVIRONMENTS } from './config/test-environment.js';
import { resetDatabaseInstance } from '../lib/database.js';
import { resetConnectionManager } from '../lib/connection-manager.js';
import { resetEnterpriseDatabaseService } from '../lib/enterprise-database-integration.js';

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

// Force local SQLite for integration tests (prevent Turso usage)
process.env.DATABASE_URL = 'file:./data/test-integration.db';
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.TURSO_DATABASE_URL;
// Ensure this is not detected as E2E test
delete process.env.E2E_TEST_MODE;
delete process.env.PLAYWRIGHT_BROWSER;
delete process.env.VERCEL_DEV_STARTUP;
// Set explicit integration test context (already set at top of file)

// Additional safety measures for integration test isolation
process.env.TEST_DATABASE_TYPE = 'sqlite_file';
process.env.FORCE_LOCAL_DATABASE = 'true';

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

console.log('✅ Integration test environment fully configured and validated');

// Export utilities for integration tests
export const getApiUrl = (path) => `${process.env.TEST_BASE_URL}${path}`;
export const isCI = () => process.env.CI === 'true';
export const getTestTimeout = () => Number(process.env.VITEST_TEST_TIMEOUT || config.timeouts.test);

// Database client reference (will be initialized in beforeAll)
let dbClient = null;

/**
 * Initialize Database for Integration Tests
 */
const initializeDatabase = async () => {
  try {
    // Import database client and migration system
    const { getDatabaseClient, resetDatabaseInstance } = await import('../lib/database.js');
    const { MigrationSystem } = await import('../scripts/migrate.js');

    // Set flag to keep migration connection open
    process.env.KEEP_MIGRATION_CONNECTION = 'true';

    // Run migrations (connection will stay open due to INTEGRATION_TEST_MODE flag)
    console.log('🔄 Running database migrations for integration tests...');
    const migrationSystem = new MigrationSystem();
    const migrationResult = await migrationSystem.runMigrations();
    console.log(`✅ Migration completed: ${migrationResult.executed} executed, ${migrationResult.skipped} skipped`);

    // Try to reuse the migration system's connection if available
    let client = migrationSystem.getDbClient();

    if (client) {
      console.log('♻️ Reusing migration system database connection');
      dbClient = client;
    } else {
      // Fallback: get a fresh connection if migration didn't keep one
      console.log('🔄 Getting fresh database client...');
      dbClient = await getDatabaseClient();
    }

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

    console.log('✅ Integration database initialized and tested');
    return dbClient;
  } catch (error) {
    console.error('❌ Failed to initialize integration database:', error);

    // If initialization fails, reset the dbClient so next attempt gets a fresh connection
    dbClient = null;

    throw error;
  }
};

/**
 * Clean Database Between Tests
 */
const cleanDatabase = async () => {
  try {
    // Get fresh database client to handle closed connections
    const { getDatabaseClient } = await import('../lib/database.js');
    const client = await getDatabaseClient();

    // Update global dbClient reference for future operations
    dbClient = client;

    // Get all tables from database to avoid checking individual existence
    const tableQuery = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const existingTables = new Set(tableQuery.rows.map(row => row.name));

    // Clean test data while preserving schema (ordered by foreign key dependencies)
    const tables = [
      'email_events',           // Clean child tables first (foreign key dependencies)
      'email_audit_log',
      'payment_events',
      'transaction_items',
      'qr_validations',
      'wallet_pass_events',
      'registrations',         // Then parent tables
      'transactions',          // Fixed: was 'payments', should be 'transactions'
      'tickets',
      'email_subscribers',     // Newsletter system table
      'newsletter_subscriptions', // Legacy newsletter table
      'admin_sessions'
    ];

    // Batch cleanup using prepared statements for performance
    const cleanupPromises = [];
    let cleanedTables = 0;

    for (const table of tables) {
      if (existingTables.has(table)) {
        cleanupPromises.push(
          client.execute(`DELETE FROM "${table}"`)
            .then(result => {
              const deletedCount = result.rowsAffected ?? result.changes ?? 0;
              if (deletedCount > 0) {
                console.log(`🧹 Cleaned ${deletedCount} records from ${table}`);
              }
              cleanedTables++;
            })
            .catch(error => {
              console.warn(`⚠️ Failed to clean table ${table}: ${error.message}`);
            })
        );
      }
    }

    // Execute cleanup in parallel for better performance
    await Promise.all(cleanupPromises);
    const skippedTables = tables.length - cleanedTables;

    console.log(`🧹 Database cleanup completed: ${cleanedTables} tables cleaned, ${skippedTables} skipped`);
  } catch (error) {
    console.warn('⚠️ Database cleanup warning:', error.message);

    // If cleanup fails due to connection issues, try to get a fresh connection
    if (error.message.includes('CLIENT_CLOSED') || error.message.includes('connection') || error.message.includes('closed')) {
      console.log('🔄 Attempting to recover from connection error...');
      try {
        const { resetDatabaseInstance, getDatabaseClient } = await import('../lib/database.js');
        await resetDatabaseInstance();
        dbClient = await getDatabaseClient();
        console.log('✅ Database connection recovered');
      } catch (recoveryError) {
        console.error('❌ Failed to recover database connection:', recoveryError.message);
        // Set dbClient to null so next operation will get a fresh connection
        dbClient = null;
      }
    }
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

// Integration test lifecycle
beforeAll(async () => {
  console.log('🚀 Integration test environment initialized');
  console.log(`📊 Target: ~30-50 tests with real database`);
  console.log(`🗄️ Database: ${config.database.description}`);
  console.log(`🔧 Port: ${config.port.port} (${config.port.description})`);
  console.log(`🔐 Secrets: ${secretValidation.totalChecked} checked, ${secretValidation.warnings.length} warnings`);
  
  if (secretValidation.warnings.length > 0) {
    console.log('⚠️ Integration test warnings:');
    secretValidation.warnings.forEach(warning => console.log(`   - ${warning}`));
  }
  
  // Initialize database
  await initializeDatabase();
}, config.timeouts.setup);

beforeEach(async () => {
  // Clean database FIRST (this will use/create the old singleton if needed)
  await cleanDatabase();

  // THEN reset all database singletons after cleaning
  // This ensures each test gets a fresh connection to the same database file
  // and the singleton created by cleanDatabase is discarded
  await resetDatabaseInstance();
  await resetConnectionManager();
  await resetEnterpriseDatabaseService();
}, config.timeouts.hook);

afterEach(async () => {
  // Optional: Additional cleanup after each test
  // await cleanDatabase(); // Uncomment if needed
}, config.timeouts.hook);

afterAll(async () => {
  // Final cleanup
  if (dbClient) {
    try {
      // Ensure WAL checkpoint before closing to persist all changes
      try {
        await dbClient.execute('PRAGMA wal_checkpoint(TRUNCATE)');
        console.log('✅ Final WAL checkpoint completed');
      } catch (walError) {
        // Ignore WAL errors during cleanup
        if (!walError.message.includes('CLIENT_CLOSED')) {
          console.warn('⚠️ WAL checkpoint warning:', walError.message);
        }
      }

      // Check if connection is still valid before attempting to close
      if (typeof dbClient.close === 'function') {
        await dbClient.close();
        console.log('✅ Database connection closed');
      }
    } catch (error) {
      // Ignore close errors - connection may already be closed
      if (!error.message.includes('CLIENT_CLOSED') && !error.message.includes('closed')) {
        console.warn('⚠️ Database connection cleanup warning:', error.message);
      }
    }
  }

  // Reset the database instance for good measure
  try {
    const { resetDatabaseInstance } = await import('../lib/database.js');
    await resetDatabaseInstance();
  } catch (error) {
    // Ignore reset errors during cleanup
  }

  // Clean up test database files
  try {
    const fs = await import('fs');
    const dbPath = './data/test-integration.db';
    const walPath = './data/test-integration.db-wal';
    const shmPath = './data/test-integration.db-shm';

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('🧹 Cleaned up test database: ' + dbPath);
    }
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }
  } catch (error) {
    console.warn('⚠️ Failed to clean up test database files:', error.message);
  }

  await cleanupEnvironment(TEST_ENVIRONMENTS.INTEGRATION);
  console.log('✅ Integration test cleanup completed');
}, config.timeouts.cleanup);

// Export database client for tests
export const getDbClient = async () => {
  // Always return a fresh client to avoid closed connection issues
  if (!dbClient) {
    const { getDatabaseClient } = await import('../lib/database.js');
    dbClient = await getDatabaseClient();
  }
  return dbClient;
};

// Export secret validation result for tests that need to check availability
export const getSecretValidation = () => secretValidation;

console.log('🧪 Integration test environment ready - database & services configured');