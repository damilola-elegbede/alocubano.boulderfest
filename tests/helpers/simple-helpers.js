import { vi } from 'vitest';

/**
 * Advanced environment isolation utilities
 * Preserves system variables needed for test execution
 */
function preserveSystemVars() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    SHELL: process.env.SHELL,
    CI: process.env.CI,
    VITEST: process.env.VITEST,
    VITEST_WORKER_ID: process.env.VITEST_WORKER_ID,
    VITEST_POOL_ID: process.env.VITEST_POOL_ID,
    // Test-specific variables that should be preserved
    DATABASE_TEST_STRICT_MODE: process.env.DATABASE_TEST_STRICT_MODE,
    TEST_TYPE: process.env.TEST_TYPE,
  };
}

/**
 * Simple environment variable backup/restore
 * Will replace TestEnvironmentManager (721 lines) in PR #2
 */
export function backupEnv(keys) {
  const backup = {};
  keys.forEach(key => {
    backup[key] = process.env[key];
  });
  return backup;
}

export function restoreEnv(backup) {
  // Guard against null/undefined backup
  if (!backup || typeof backup !== 'object') {
    return;
  }
  
  // Clear all current non-system variables first
  const systemVars = preserveSystemVars();
  Object.keys(process.env).forEach(key => {
    if (!systemVars.hasOwnProperty(key)) {
      delete process.env[key];
    }
  });
  
  // Restore from backup
  Object.entries(backup).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
}

/**
 * Simple database creation
 * Will replace complex database utilities (1,017 lines) in PR #4
 * Note: In PR #4, we'll use the actual better-sqlite3 import
 */
export function createTestDatabase() {
  // Simplified mock for now - will be replaced with actual implementation in PR #4
  return {
    memory: true,
    close: () => {},
    prepare: () => ({
      all: () => [
        { name: 'registrations' },
        { name: 'tickets' },
        { name: 'transactions' },
        { name: 'newsletter_subscribers' }
      ]
    }),
    exec: () => {}
  };
}

/**
 * Simple service reset
 * Will replace TestSingletonManager (518 lines) in PR #3
 */
export async function resetServices() {
  // Direct resets without complex coordination
  if (global.__databaseInstance) {
    if (global.__databaseInstance.close) {
      await global.__databaseInstance.close();
    }
    delete global.__databaseInstance;
  }
  
  // Clear any other global service instances
  if (global.__testState) {
    delete global.__testState;
  }
}

/**
 * Simple mock setup
 * Will replace TestMockManager (869 lines) in PR #5
 */
export function setupSimpleMocks(services = []) {
  const mocks = {};
  
  if (services.includes('fetch')) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });
    mocks.fetch = global.fetch;
  }
  
  if (services.includes('stripe')) {
    mocks.stripe = {
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: 'test_session_id' })
        }
      }
    };
  }
  
  if (services.includes('brevo')) {
    mocks.brevo = {
      apiInstance: {
        createContact: vi.fn().mockResolvedValue({ id: 'test_contact_id' }),
        sendTransacEmail: vi.fn().mockResolvedValue({ messageId: 'test_message_id' })
      }
    };
  }
  
  return mocks;
}

/**
 * Simple test data factory
 * Will replace complex test data builders
 */
export function createTestData(type, overrides = {}) {
  const defaults = {
    registration: {
      email: 'test@example.com',
      name: 'Test User',
      tickets: 1,
      amount_paid: 50,
      payment_status: 'completed',
      stripe_session_id: 'test_session_id'
    },
    ticket: {
      id: 'test_ticket_id',
      email: 'test@example.com',
      ticket_type: 'general',
      status: 'active',
      qr_code: 'test_qr_code'
    },
    subscriber: {
      email: 'subscriber@example.com',
      status: 'active',
      brevo_contact_id: 'test_contact_id'
    }
  };
  
  return { ...defaults[type], ...overrides };
}

/**
 * Simple test timer for performance tests
 */
export function measureTime(fn) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return {
    result,
    duration: end - start
  };
}

/**
 * Environment validation utilities
 */
export function validateEnv(required = []) {
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Clear specific environment variable groups
 */
export function clearDatabaseEnv() {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.DATABASE_URL;
}

export function clearAppEnv() {
  // Database
  clearDatabaseEnv();
  
  // Email service
  delete process.env.BREVO_API_KEY;
  delete process.env.BREVO_NEWSLETTER_LIST_ID;
  delete process.env.BREVO_WEBHOOK_SECRET;
  
  // Payment processing
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  
  // Admin
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_SECRET;
  
  // Wallet passes
  delete process.env.APPLE_PASS_KEY;
  delete process.env.APPLE_PASS_PASSWORD;
  delete process.env.WALLET_AUTH_SECRET;
}

/**
 * Environment presets (replaces TestEnvironmentManager.getPreset)
 */
export function getEnvPreset(presetName) {
  const presets = {
    empty: {},
    
    'missing-db': {
      BREVO_API_KEY: 'test-brevo-key',
      STRIPE_SECRET_KEY: 'sk_test_test',
      ADMIN_SECRET: 'test-admin-secret-32-chars-long',
    },
    
    'invalid-db': {
      TURSO_DATABASE_URL: 'invalid-url-format',
      TURSO_AUTH_TOKEN: 'test-token',
      BREVO_API_KEY: 'test-brevo-key',
    },
    
    'valid-local': {
      TURSO_DATABASE_URL: ':memory:',
      TURSO_AUTH_TOKEN: 'test-token',
      BREVO_API_KEY: 'test-brevo-key',
      STRIPE_SECRET_KEY: 'sk_test_local',
      ADMIN_SECRET: 'test-admin-secret-32-chars-long',
    },
    
    'complete-test': {
      // Database
      TURSO_DATABASE_URL: ':memory:',
      TURSO_AUTH_TOKEN: 'test-token',
      
      // Email service
      BREVO_API_KEY: 'test-brevo-api-key',
      BREVO_NEWSLETTER_LIST_ID: '123',
      BREVO_WEBHOOK_SECRET: 'test-webhook-secret',
      
      // Payment processing
      STRIPE_PUBLISHABLE_KEY: 'pk_test_test',
      STRIPE_SECRET_KEY: 'sk_test_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      
      // Admin
      ADMIN_PASSWORD: '$2b$10$test.hash.for.testing',
      ADMIN_SECRET: 'test-admin-secret-32-chars-long',
      
      // Wallet passes
      APPLE_PASS_KEY: 'dGVzdC1hcHBsZS1wYXNzLWtleQ==',
      WALLET_AUTH_SECRET: 'test-wallet-auth-secret-32-chars',
    }
  };
  
  return presets[presetName] || {};
}

/**
 * Complete environment isolation with system variable preservation
 */
export function isolateEnv(envVars = {}) {
  const systemVars = preserveSystemVars();
  
  // Clear all environment variables
  Object.keys(process.env).forEach(key => {
    delete process.env[key];
  });
  
  // Restore system variables
  Object.entries(systemVars).forEach(([key, value]) => {
    if (value !== undefined) {
      process.env[key] = value;
    }
  });
  
  // Set test environment variables
  Object.assign(process.env, envVars);
}

/**
 * Reset database singleton state
 */
export async function resetDatabaseSingleton() {
  try {
    // Dynamic import to avoid issues with mocked modules
    const module = await import('../../api/lib/database.js');
    if (module.resetDatabaseInstance && typeof module.resetDatabaseInstance === 'function') {
      await module.resetDatabaseInstance();
    }
    
    // Clear any global database instances
    if (global.__databaseInstance) {
      if (global.__databaseInstance.close) {
        await global.__databaseInstance.close();
      }
      delete global.__databaseInstance;
    }
  } catch (error) {
    // Module might be mocked or unavailable
    if (!error.message.includes('mock')) {
      console.warn('Database singleton reset failed:', error.message);
    }
  }
}

/**
 * Test isolation wrapper - replaces TestEnvironmentManager.withIsolatedEnv
 */
export async function withIsolatedEnv(preset, testFn) {
  const envBackup = backupEnv(Object.keys(process.env));
  
  try {
    // Handle preset or custom environment object
    let envVars = {};
    if (typeof preset === 'string') {
      envVars = getEnvPreset(preset);
    } else if (typeof preset === 'object' && preset !== null) {
      envVars = preset;
    }
    
    isolateEnv(envVars);
    return await testFn();
  } finally {
    restoreEnv(envBackup);
  }
}

/**
 * Complete test isolation - replaces TestEnvironmentManager.withCompleteIsolation
 */
export async function withCompleteIsolation(preset, testFn) {
  const envBackup = backupEnv(Object.keys(process.env));
  
  try {
    // Reset module-level singletons
    await resetDatabaseSingleton();
    await resetServices();
    
    // Force module reset if Vitest is available
    if (typeof vi !== 'undefined' && vi.resetModules) {
      vi.resetModules();
    }
    
    // Handle preset or custom environment object
    let envVars = {};
    if (typeof preset === 'string') {
      envVars = getEnvPreset(preset);
    } else if (typeof preset === 'object' && preset !== null) {
      envVars = preset;
    }
    
    isolateEnv(envVars);
    return await testFn();
  } finally {
    // Restore state
    await resetDatabaseSingleton();
    await resetServices();
    restoreEnv(envBackup);
  }
}

/**
 * Simple cleanup utility
 */
export async function cleanupTest() {
  // Clear all mocks
  vi.clearAllMocks();
  
  // Reset services
  await resetServices();
  
  // Reset database singleton
  await resetDatabaseSingleton();
  
  // Clear global test state
  if (global.__testState) {
    delete global.__testState;
  }
}

/**
 * Simple test state reset - replaces TestSingletonManager boundary management
 * Provides basic test isolation without complex orchestration
 */
export function resetTestState() {
  // Reset Vitest modules and mocks
  vi.resetModules();
  vi.clearAllMocks();
  
  // Clear global test state
  if (global.__testState) {
    delete global.__testState;
  }
  
  // Clear other global state
  if (global.__testMocks) {
    delete global.__testMocks;
  }
}

/**
 * Simple singleton reset - replaces complex registry management
 * Direct reset without state tracking or coordination
 */
export async function resetSingleton(type = 'all') {
  switch (type) {
    case 'database':
      await resetDatabaseSingleton();
      break;
    case 'services':
      await resetServices();
      break;
    case 'all':
    default:
      await resetDatabaseSingleton();
      await resetServices();
      break;
  }
}

/**
 * Complete test cleanup - replaces TestSingletonManager.clearAllState()
 * Simple comprehensive cleanup without complex state management
 */
export async function cleanupTestState() {
  // Reset all test-related state
  resetTestState();
  
  // Reset all singletons
  await resetSingleton('all');
  
  // Additional cleanup
  if (global.fetch && global.fetch.mockRestore) {
    global.fetch.mockRestore();
  }
  
  // Clear any timers or intervals that might be running
  vi.clearAllTimers();
}

/**
 * Simple test validation - replaces complex state checking
 * Basic validation without extensive state analysis
 */
export function validateTestCleanup() {
  const issues = [];
  
  // Check for global state leaks
  if (global.__testState) {
    issues.push('Global test state not cleaned');
  }
  
  if (global.__databaseInstance) {
    issues.push('Database instance not cleaned');
  }
  
  // Check for mock leaks
  if (global.fetch && global.fetch._isMockFunction) {
    issues.push('Global fetch mock not cleaned');
  }
  
  // Return validation result
  return {
    valid: issues.length === 0,
    issues
  };
}