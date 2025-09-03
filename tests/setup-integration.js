/**
 * Integration Test Setup - Real Database & Services
 * Target: ~30-50 tests with proper database isolation
 */
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { configureEnvironment, cleanupEnvironment, validateEnvironment, TEST_ENVIRONMENTS } from './config/test-environment.js';

// Force local SQLite for integration tests (prevent Turso usage)
process.env.DATABASE_URL = 'file:./data/test-integration.db';
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.TURSO_DATABASE_URL;
// Ensure this is not detected as E2E test
delete process.env.E2E_TEST_MODE;
delete process.env.PLAYWRIGHT_BROWSER;
delete process.env.VERCEL_DEV_STARTUP;
// Set explicit integration test context
process.env.INTEGRATION_TEST_MODE = 'true';

// Configure integration test environment
const config = configureEnvironment(TEST_ENVIRONMENTS.INTEGRATION);

// Validate environment setup
validateEnvironment(TEST_ENVIRONMENTS.INTEGRATION);

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
    const { getDatabaseClient } = await import('../api/lib/database.js');
    const { MigrationSystem } = await import('../scripts/migrate.js');
    
    dbClient = await getDatabaseClient();
    
    // Basic connection test
    const testResult = await dbClient.execute('SELECT 1 as test');
    if (!testResult || !testResult.rows || testResult.rows.length !== 1) {
      throw new Error('Database connection test failed');
    }
    
    // Run migrations to ensure database schema is up to date
    console.log('🔄 Running database migrations for integration tests...');
    const migrationSystem = new MigrationSystem();
    const migrationResult = await migrationSystem.runMigrations();
    
    console.log(`✅ Migration completed: ${migrationResult.executed} executed, ${migrationResult.skipped} skipped`);
    console.log('✅ Integration database initialized');
    return dbClient;
  } catch (error) {
    console.error('❌ Failed to initialize integration database:', error);
    throw error;
  }
};

/**
 * Clean Database Between Tests
 */
const cleanDatabase = async () => {
  if (!dbClient) return;
  
  try {
    // Get all tables from database to avoid checking individual existence
    const tableQuery = await dbClient.execute(
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
          dbClient.execute(`DELETE FROM ${table}`)
            .then(result => {
              const deletedCount = result.changes || 0;
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
  
  // Initialize database
  await initializeDatabase();
}, config.timeouts.setup);

beforeEach(async () => {
  // Clean database before each test to ensure isolation
  await cleanDatabase();
}, config.timeouts.hook);

afterEach(async () => {
  // Optional: Additional cleanup after each test
  // await cleanDatabase(); // Uncomment if needed
}, config.timeouts.hook);

afterAll(async () => {
  // Final cleanup
  if (dbClient) {
    try {
      await dbClient.close?.();
    } catch (error) {
      console.warn('⚠️ Database connection cleanup warning:', error.message);
    }
  }
  
  await cleanupEnvironment(TEST_ENVIRONMENTS.INTEGRATION);
  console.log('✅ Integration test cleanup completed');
}, config.timeouts.cleanup);

// Export database client for tests
export const getDbClient = () => dbClient;

console.log('🧪 Integration test environment ready - database & services configured');