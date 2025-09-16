/**
 * Unit Test Setup - Optimized for Speed
 * Target: 806+ tests in <2 seconds
 * Native Module Handling: Graceful fallbacks for CI environments
 */
import { beforeAll, afterAll } from 'vitest';
import { configureEnvironment, cleanupEnvironment, validateEnvironment, TEST_ENVIRONMENTS } from './config/test-environment.js';

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
    message.includes('Cannot find module') ||
    message.includes('optional dependencies')
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
    message.includes('falling back to web client')
  ) {
    // Expected behavior in CI - suppress noise
    return;
  }
  originalConsoleWarn.apply(console, args);
};

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

// Unit test lifecycle
beforeAll(async () => {
  console.log('🚀 Unit test environment initialized');
  console.log(`📊 Target: 806+ tests in <2 seconds`);
  console.log(`🗄️ Database: ${config.database.description}`);
  console.log(`⚡ Optimized for maximum speed`);
}, config.timeouts.setup);

afterAll(async () => {
  await cleanupEnvironment(TEST_ENVIRONMENTS.UNIT);
  console.log('✅ Unit test cleanup completed');
}, config.timeouts.cleanup);

console.log('🧪 Unit test environment ready - optimized for speed');