/**
 * Integration Test Setup - Real Database & Services
 * Target: ~30-50 tests with proper database isolation
 */
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { configureEnvironment, cleanupEnvironment, validateEnvironment, TEST_ENVIRONMENTS } from './config/test-environment.js';

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
    // Clean test data while preserving schema (tables must exist in database schema)
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
    
    // Check if table exists before attempting to clean
    const checkTableExists = async (tableName) => {
      try {
        const result = await dbClient.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          [tableName]
        );
        return result.rows && result.rows.length > 0;
      } catch (error) {
        return false;
      }
    };
    
    let cleanedTables = 0;
    let skippedTables = 0;
    
    for (const table of tables) {
      try {
        const exists = await checkTableExists(table);
        if (exists) {
          const result = await dbClient.execute(`DELETE FROM ${table}`);
          const deletedCount = result.changes || 0;
          if (deletedCount > 0) {
            console.log(`🧹 Cleaned ${deletedCount} records from ${table}`);
          }
          cleanedTables++;
        } else {
          console.log(`⚠️ Table ${table} does not exist, skipping cleanup`);
          skippedTables++;
        }
      } catch (error) {
        console.warn(`⚠️ Failed to clean table ${table}: ${error.message}`);
        skippedTables++;
      }
    }
    
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