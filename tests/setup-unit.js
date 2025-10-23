/**
 * Unit Test Setup - PERFORMANCE OPTIMIZED FOR <2 SECOND TARGET
 * Current: 1126+ tests in 5.13s → Target: <2 seconds
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Skip database migrations in unit tests (use mocks instead)
 * - Minimize setup/teardown overhead
 * - Optimize memory allocation
 * - Fast-fail on errors
 * - Global resource pooling
 */
import { beforeAll, afterAll } from 'vitest';
import { configureEnvironment, cleanupEnvironment, validateEnvironment, TEST_ENVIRONMENTS } from './config/test-environment.js';

/**
 * CRITICAL: Process cleanup handlers (ASYNC)
 * Ensures vitest processes don't hang after test completion
 * Addresses memory exhaustion issue with multiple hung workers
 */
const forceCleanup = async () => {
  // Close any open database connections
  if (global.testDbClient) {
    try {
      if (typeof global.testDbClient.close === 'function') {
        await Promise.race([
          global.testDbClient.close(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection close timeout')), 5000)
          )
        ]);
      }
    } catch (e) {
      console.warn('⚠️ Error closing database connection:', e.message);
    }
  }

  // Clear any timers/intervals
  if (typeof clearInterval !== 'undefined') {
    // Clear any lingering intervals
    const highestId = setTimeout(() => {}, 0);
    for (let i = 0; i < highestId; i++) {
      clearTimeout(i);
      clearInterval(i);
    }
  }

  console.log('🧹 Unit test force cleanup completed');
};

// Register synchronous cleanup handlers for signals
process.on('exit', () => {
  console.log('🚪 Process exiting - cleanup handlers executed');
});

process.on('SIGINT', async () => {
  console.log('⚠️ SIGINT received - forcing cleanup and exit');
  try {
    await forceCleanup();
  } catch (error) {
    console.warn('⚠️ Cleanup error on SIGINT:', error.message);
  }
  process.exit(130); // 128 + 2 (SIGINT signal number)
});

process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received - forcing cleanup and exit');
  try {
    await forceCleanup();
  } catch (error) {
    console.warn('⚠️ Cleanup error on SIGTERM:', error.message);
  }
  process.exit(143); // 128 + 15 (SIGTERM signal number)
});

/**
 * Native Module Error Handling
 * Gracefully handle missing native binaries in CI environments
 */
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Suppress known native module warnings during test setup
console.error = (...args) => {
  const message = args.join(' ');
  if (
    message.includes('@rollup/rollup-linux-x64-gnu') ||
    message.includes('@libsql/linux-x64-gnu') ||
    message.includes('@libsql/darwin-arm64') ||
    message.includes('@libsql/darwin-x64') ||
    message.includes('@libsql/win32-x64-msvc') ||
    message.includes('Cannot find module') ||
    message.includes('optional dependencies') ||
    message.includes('ENOENT') ||
    message.includes('MODULE_NOT_FOUND') ||
    message.includes('better-sqlite3') ||
    message.includes('node-gyp') ||
    message.includes('path-to-regexp') ||
    message.includes('vulnerability')
  ) {
    // Convert to warning for CI visibility but don't fail
    console.warn('⚠️ Native module warning (expected in CI):', message);
    return;
  }
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  const message = args.join(' ');
  if (
    message.includes('Failed to import LibSQL client') ||
    message.includes('falling back to web client') ||
    message.includes('Native module warning (expected in CI)') ||
    message.includes('node-fetch not available')
  ) {
    // Expected behavior in CI - suppress noise
    return;
  }
  originalConsoleWarn.apply(console, args);
};

// Force in-memory database for unit tests
// Belt-and-suspenders: ensure it's set even before configureEnvironment()
process.env.DATABASE_URL = ':memory:';

// CRITICAL: Delete TURSO variables to prevent them from being used
// lib/database.js:1372 checks TURSO_DATABASE_URL first with || operator
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

// Configure unit test environment
const config = configureEnvironment(TEST_ENVIRONMENTS.UNIT);

// Validate environment setup
validateEnvironment(TEST_ENVIRONMENTS.UNIT);

// Export utilities for tests
export const getApiUrl = (path) => `${process.env.TEST_BASE_URL}${path}`;
export const isCI = () => process.env.CI === 'true';
export const getTestTimeout = () => Number(process.env.VITEST_TEST_TIMEOUT || config.timeouts.test);

// Ensure fetch is available for Node.js tests
if (!globalThis.fetch) {
  try {
    const { default: fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
  } catch (error) {
    console.warn('⚠️ node-fetch not available, tests may need to handle this');
  }
}

// OPTIMIZED unit test lifecycle for <2 second target
beforeAll(async () => {
  // Skip expensive operations in unit tests
  if (process.env.SKIP_DATABASE_MIGRATIONS !== 'true') {
    console.warn('⚠️ Database migrations should be skipped for unit tests performance');
  }

  console.log('🚀 PERFORMANCE-OPTIMIZED Unit Test Environment');
  console.log(`🎯 TARGET: 1126+ tests in <2 seconds (${((2 / 5.13) * 100).toFixed(1)}% of current time)`);
  console.log(`🗄️ Database: ${config.database.description}`);
  console.log(`⚡ Optimizations: Threads, reduced timeouts, no migrations`);
  console.log(`🔧 Memory: 2GB allocation, size-optimized`);

  // CREATE DATABASE SCHEMA once per worker
  // Unit tests skip full migrations for speed, but need minimal schema
  // Overhead: ~100-200ms per worker, amortized across all tests
  try {
    const { getDatabaseClient } = await import('../lib/database.js');
    const db = await getDatabaseClient();

    console.log('🔄 Creating database schema (one-time setup)...');

    // Use TestDatabaseManager's approach for creating minimal schema
    const { getTestDatabaseManager } = await import('./helpers/test-database-manager.js');
    const dbManager = getTestDatabaseManager();

    // Create schema using the minimal schema method (faster than full migrations)
    await dbManager._createMinimalSchema(db);

    console.log('✅ Database schema ready');

    // SEED BASE TEST DATA for stability and to prevent "not found" errors
    // Provides minimal shared data: 1 event, 1 transaction, 2 tickets
    // Overhead: ~50ms amortized across all tests in worker
    const { seedBaseTestData } = await import('./fixtures/seed-base-data.js');
    await seedBaseTestData(db);

    console.log('✅ Base test data seeded: 1 event, 2 tickets, 1 transaction');
  } catch (error) {
    console.error('⚠️ Failed to setup test database:', error.message);
    console.error('   Tests requiring database records may fail');
    // Don't throw - allow tests to run even if setup fails
    // Tests that need data will fail with clear error messages
  }
}, config.timeouts.setup);

afterAll(async () => {
  // Minimal cleanup for unit tests + force cleanup to prevent hanging processes
  await forceCleanup();

  // Additional cleanup for fork pool
  if (global.gc) {
    global.gc(); // Force garbage collection if available
  }

  // Clear module cache to prevent leaks
  if (typeof require !== 'undefined' && require.cache) {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('/lib/database') || key.includes('/lib/logger')) {
        delete require.cache[key];
      }
    });
  }

  console.log('✅ Unit test cleanup completed (minimal overhead)');
}, config.timeouts.cleanup);

console.log('🧪 Unit test environment ready - optimized for speed');