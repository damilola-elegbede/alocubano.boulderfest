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
    // Import database client
    const { getDatabaseClient } = await import('../api/lib/database.js');
    dbClient = await getDatabaseClient();
    
    // Run migrations if needed
    const { runMigrations } = await import('../scripts/migrate.js');
    await runMigrations();
    
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
    // Clean test data while preserving schema
    const tables = [
      'newsletter_subscriptions',
      'registrations', 
      'payments',
      'tickets',
      'admin_sessions'
    ];
    
    for (const table of tables) {
      await dbClient.execute(`DELETE FROM ${table}`);
    }
    
    console.log('🧹 Database cleaned for next test');
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