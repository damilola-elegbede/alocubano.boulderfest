/**
 * Integration Test Setup
 * Enhanced setup specifically for integration tests with proper database isolation
 */

import { vi } from "vitest";
import { setupDatabaseCleanup } from "./utils/database-cleanup.js";
import { testEnvManager } from "./utils/test-environment-manager.js";

// Track test context for cleanup
const testContext = {
  dbPath: null,
  cleanupFns: null
};

// Global setup for integration tests
beforeAll(async () => {
  // Set integration test environment
  process.env.TEST_TYPE = 'integration';
  process.env.TEST_INTEGRATION = 'true';
  
  // Use in-memory database for integration tests to prevent file conflicts
  if (!process.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL.includes('file:')) {
    process.env.TURSO_DATABASE_URL = ':memory:';
    console.log('🧪 Using in-memory database for integration tests');
  }
  
  testContext.dbPath = process.env.TURSO_DATABASE_URL;
  
  // Set up database cleanup functions
  testContext.cleanupFns = setupDatabaseCleanup(testContext, {
    closeConnections: true,
    waitForOperations: true,
    cleanupFiles: false, // In-memory DB, no files
    timeoutMs: 10000
  });
  
  console.log('🧪 Integration test environment initialized');
  console.log(`   Database: ${testContext.dbPath}`);
  console.log(`   Node.js version: ${process.version}`);
}, 30000);

// Enhanced cleanup between tests
afterEach(async () => {
  // Clear all mocks
  vi.clearAllMocks();
  
  // Database cleanup
  if (testContext.cleanupFns) {
    try {
      await testContext.cleanupFns.afterEachCleanup();
    } catch (error) {
      console.warn('Integration test cleanup warning:', error.message);
    }
  }
  
  // Reset localStorage if available
  if (global.localStorage) {
    global.localStorage.clear();
  }
  
  // Small delay to ensure cleanup completes
  await new Promise(resolve => setTimeout(resolve, 100));
}, 15000);

// Global teardown
afterAll(async () => {
  // Final database cleanup
  if (testContext.cleanupFns) {
    try {
      await testContext.cleanupFns.afterAllCleanup();
    } catch (error) {
      console.warn('Integration test final cleanup warning:', error.message);
    }
  }
  
  // Restore environment
  testEnvManager.restore();
  
  // Clear test flags
  delete process.env.TEST_INTEGRATION;
  delete process.env.TEST_TYPE;
  
  console.log('🧪 Integration test environment cleaned up');
}, 15000);

// Handle uncaught errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection in integration test:', reason);
});

// Export context for tests that need it
export { testContext };