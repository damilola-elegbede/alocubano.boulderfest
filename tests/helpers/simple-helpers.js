import { vi } from 'vitest';

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
    await global.__databaseInstance.close();
    delete global.__databaseInstance;
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
 * Simple cleanup utility
 */
export async function cleanupTest() {
  // Clear all mocks
  vi.clearAllMocks();
  
  // Reset services
  await resetServices();
  
  // Clear global test state
  if (global.__testState) {
    delete global.__testState;
  }
}