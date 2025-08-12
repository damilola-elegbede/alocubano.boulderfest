/**
 * Database Cleanup Utilities
 * Provides utilities for proper database cleanup in tests to prevent SQLITE_BUSY errors
 */

/**
 * Force close all database connections with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<void>}
 */
export async function forceCloseAllConnections(timeoutMs = 5000) {
  try {
    // Skip cleanup if database module is mocked (during unit tests)
    if (process.env.TEST_TYPE === 'unit') {
      return;
    }
    
    // Dynamic import to avoid circular dependencies
    const module = await import('../../api/lib/database.js');
    
    // Check if resetDatabaseInstance exists (not mocked)
    if (typeof module.resetDatabaseInstance !== 'function') {
      console.warn('Database module appears to be mocked, skipping cleanup');
      return;
    }
    
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database cleanup timeout')), timeoutMs)
    );
    
    // Race between cleanup and timeout
    await Promise.race([
      module.resetDatabaseInstance(),
      timeoutPromise
    ]);
    
    // Additional delay to ensure connections are fully released
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    // Only warn if this isn't a mock-related error
    if (!error.message.includes('mock') && !error.message.includes('vi.mock')) {
      console.warn('Force close connections failed:', error.message);
    }
  }
}

/**
 * Wait for all pending database operations to complete
 * @param {number} maxWaitMs - Maximum wait time in milliseconds
 * @returns {Promise<boolean>} True if all operations completed
 */
export async function waitForDatabaseOperations(maxWaitMs = 3000) {
  const startTime = Date.now();
  let attempts = 0;
  const maxAttempts = Math.floor(maxWaitMs / 100);
  
  while (attempts < maxAttempts) {
    try {
      // Try to acquire database connection - this will fail if busy
      const { getDatabaseClient } = await import('../../api/lib/database.js');
      const client = await getDatabaseClient();
      
      // Try a simple query to verify database is accessible
      await client.execute('SELECT 1');
      
      return true; // Database is accessible
    } catch (error) {
      const isBusyError = error.message && (
        error.message.includes('SQLITE_BUSY') ||
        error.message.includes('database is locked') ||
        error.message.includes('database is busy')
      );
      
      if (!isBusyError) {
        // Different error, not a busy state
        return false;
      }
      
      // Wait a bit before trying again
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }
  
  console.warn(`Database still busy after ${Date.now() - startTime}ms`);
  return false;
}

/**
 * Clean up specific database file if it exists
 * @param {string} dbPath - Path to database file
 * @returns {Promise<void>}
 */
export async function cleanupDatabaseFile(dbPath) {
  if (!dbPath || dbPath === ':memory:') {
    return; // Nothing to clean up for in-memory databases
  }
  
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Convert relative paths to absolute
    const absolutePath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
    
    // Check if file exists
    try {
      await fs.access(absolutePath);
      
      // File exists, try to remove it
      await fs.unlink(absolutePath);
      console.log(`Cleaned up database file: ${absolutePath}`);
      
      // Also clean up WAL and SHM files if they exist
      const walFile = `${absolutePath}-wal`;
      const shmFile = `${absolutePath}-shm`;
      
      try {
        await fs.unlink(walFile);
      } catch (error) {
        // WAL file might not exist, ignore
      }
      
      try {
        await fs.unlink(shmFile);
      } catch (error) {
        // SHM file might not exist, ignore
      }
      
    } catch (error) {
      // File doesn't exist, nothing to clean up
    }
    
  } catch (error) {
    console.warn(`Failed to cleanup database file ${dbPath}:`, error.message);
  }
}

/**
 * Comprehensive database cleanup for test teardown
 * @param {Object} options - Cleanup options
 * @returns {Promise<void>}
 */
export async function comprehensiveDatabaseCleanup(options = {}) {
  const {
    closeConnections = true,
    waitForOperations = true,
    cleanupFiles = false,
    dbPath = null,
    timeoutMs = 5000
  } = options;
  
  try {
    // Step 1: Wait for pending operations if requested
    if (waitForOperations) {
      await waitForDatabaseOperations(timeoutMs);
    }
    
    // Step 2: Force close connections if requested
    if (closeConnections) {
      await forceCloseAllConnections(timeoutMs);
    }
    
    // Step 3: Clean up database files if requested
    if (cleanupFiles && dbPath) {
      await cleanupDatabaseFile(dbPath);
    }
    
    // Step 4: Final delay to ensure everything is cleaned up
    await new Promise(resolve => setTimeout(resolve, 50));
    
  } catch (error) {
    console.warn('Comprehensive database cleanup failed:', error.message);
  }
}

/**
 * Setup proper database cleanup for test suites
 * @param {Object} testContext - Test context object
 * @param {Object} options - Cleanup options
 * @returns {Object} Cleanup functions
 */
export function setupDatabaseCleanup(testContext = {}, options = {}) {
  const cleanupOptions = {
    closeConnections: true,
    waitForOperations: true,
    cleanupFiles: process.env.NODE_ENV === 'test',
    timeoutMs: 5000,
    ...options
  };
  
  // AfterEach cleanup function
  const afterEachCleanup = async () => {
    await comprehensiveDatabaseCleanup({
      ...cleanupOptions,
      dbPath: testContext.dbPath || process.env.TURSO_DATABASE_URL
    });
  };
  
  // AfterAll cleanup function
  const afterAllCleanup = async () => {
    await comprehensiveDatabaseCleanup({
      ...cleanupOptions,
      cleanupFiles: true,
      dbPath: testContext.dbPath || process.env.TURSO_DATABASE_URL
    });
  };
  
  return {
    afterEachCleanup,
    afterAllCleanup,
    forceCleanup: () => comprehensiveDatabaseCleanup(cleanupOptions)
  };
}

/**
 * Create isolated database for testing
 * @param {string} testSuiteName - Name of the test suite
 * @returns {Promise<Object>} Database configuration
 */
export async function createIsolatedDatabase(testSuiteName) {
  const testDbPath = `:memory:`; // Always use in-memory for isolation
  
  const config = {
    TURSO_DATABASE_URL: testDbPath,
    TURSO_AUTH_TOKEN: 'test-token',
  };
  
  // Apply the configuration to environment
  Object.assign(process.env, config);
  
  return {
    dbPath: testDbPath,
    config,
    cleanup: async () => {
      await comprehensiveDatabaseCleanup({
        closeConnections: true,
        waitForOperations: true,
        cleanupFiles: false, // In-memory database, no files to clean
        dbPath: testDbPath
      });
    }
  };
}

export default {
  forceCloseAllConnections,
  waitForDatabaseOperations,
  cleanupDatabaseFile,
  comprehensiveDatabaseCleanup,
  setupDatabaseCleanup,
  createIsolatedDatabase
};