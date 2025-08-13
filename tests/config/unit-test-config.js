/**
 * Unit Test Configuration
 * 
 * Specific configuration for unit tests that use mocks and isolated testing.
 * This configuration ensures unit tests are fast, isolated, and don't require
 * real service connections.
 * 
 * @author Principal Architect
 * @version 1.0.0 - Integration Test Architecture Fix
 */

import { TestEnvironments } from './test-environments.js';

export const UnitTestConfig = {
  // Environment configuration for unit tests
  environment: {
    // In-memory database for fast testing
    database: {
      url: ':memory:',
      authToken: 'unit-test-token',
      timeout: 5000
    },
    
    // Mock service endpoints
    services: {
      brevo: {
        apiKey: 'test-unit-mock-key',
        listId: '2',
        webhookSecret: 'unit-mock-webhook-secret'
      },
      
      stripe: {
        secretKey: 'sk_test_unit_mock',
        publishableKey: 'pk_test_unit_mock',
        webhookSecret: 'whsec_unit_mock'
      }
    },
    
    // JSDOM environment for browser simulation
    runtime: 'jsdom'
  },
  
  // Test execution configuration
  execution: {
    // Shorter timeouts for fast unit tests
    testTimeout: 10000,
    hookTimeout: 5000,
    
    // High concurrency for fast execution
    maxConcurrency: 4,
    threads: 4,
    
    // Strict isolation requirements
    isolate: true,
    clearMocks: true,
    restoreMocks: true,
    
    // No retries for unit tests (should be deterministic)
    retry: 0
  },
  
  // Service mock requirements
  services: {
    database: {
      required: true,
      type: 'mock',
      validation: 'strict'
    },
    
    email: {
      required: false,
      type: 'mock',
      validation: 'warn'
    },
    
    payment: {
      required: false,
      type: 'mock',
      validation: 'warn'
    }
  },
  
  // Mock configuration
  mocks: {
    // Automatically mock external dependencies
    autoMock: true,
    
    // Mock implementation strategies
    strategies: {
      database: 'vitest',
      http: 'fetch-mock',
      filesystem: 'mock-fs'
    },
    
    // Default mock return values
    defaults: {
      database: {
        execute: { rows: [], lastInsertRowid: 1 },
        close: undefined
      },
      
      brevo: {
        subscribeToNewsletter: { id: 'mock_123' },
        unsubscribeContact: { success: true }
      },
      
      stripe: {
        createCheckoutSession: { url: 'https://mock-checkout.stripe.com' },
        retrieveSession: { payment_status: 'paid' }
      }
    }
  },
  
  // Performance requirements (stricter for unit tests)
  performance: {
    // Maximum acceptable test duration
    maxTestDuration: 5000,
    
    // Maximum setup time
    maxSetupTime: 1000,
    
    // Memory limits
    maxMemoryUsage: '256MB'
  },
  
  // Coverage requirements
  coverage: {
    enabled: true,
    threshold: {
      functions: 80,
      lines: 80,
      branches: 70,
      statements: 80
    }
  },
  
  // Debugging configuration
  debug: {
    enabled: process.env.TEST_DEBUG === 'true',
    logLevel: 'warn',
    logMocks: true,
    logPerformance: false
  }
};

/**
 * Get unit test environment variables
 * @returns {Object} Environment variables for unit tests
 */
export function getUnitEnvironment() {
  return {
    ...TestEnvironments.VALID_LOCAL,
    // Override for unit-specific settings
    TURSO_DATABASE_URL: ':memory:',
    TURSO_AUTH_TOKEN: 'unit-test-token',
    TEST_TYPE: 'unit',
    VITEST_MODE: 'unit'
  };
}

/**
 * Validate unit test prerequisites
 * @throws {Error} If prerequisites are not met
 */
export function validateUnitPrerequisites() {
  const errors = [];
  
  // Check Node.js version
  const nodeVersion = process.versions.node;
  if (!nodeVersion || parseFloat(nodeVersion) < 18) {
    errors.push('Node.js 18+ required for unit tests');
  }
  
  // Unit tests should not require real service credentials
  const prohibited = [
    { env: 'TURSO_DATABASE_URL', pattern: /^libsql:\/\//, message: 'Unit tests should not use real Turso database' },
    { env: 'BREVO_API_KEY', pattern: /^xkeysib-[a-f0-9]{64}$/, message: 'Unit tests should not use real Brevo API key' }
  ];
  
  for (const { env, pattern, message } of prohibited) {
    const value = process.env[env];
    if (value && pattern.test(value)) {
      errors.push(message);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Unit test prerequisites not met:\n${errors.join('\n')}`);
  }
}

/**
 * Setup unit test environment
 * @param {Object} testContext - Test context
 * @returns {Object} Setup configuration
 */
export function setupUnitTest(testContext = {}) {
  // Validate prerequisites
  validateUnitPrerequisites();
  
  // Apply environment
  const environment = getUnitEnvironment();
  Object.assign(process.env, environment);
  
  // Return setup configuration
  return {
    testType: 'unit',
    environment: 'mock',
    config: UnitTestConfig,
    context: testContext
  };
}

/**
 * Check if current test should run as unit test
 * @param {Object} testContext - Test context
 * @returns {boolean} True if unit test
 */
export function shouldRunAsUnitTest(testContext) {
  const filePath = testContext?.file?.filepath || '';
  
  return (
    filePath.includes('/unit/') ||
    filePath.includes('unit.test.js') ||
    process.env.TEST_TYPE === 'unit' ||
    process.env.VITEST_MODE === 'unit' ||
    (!filePath.includes('/integration/') && !filePath.includes('/performance/'))
  );
}

/**
 * Create mock services for unit tests
 * @returns {Object} Mock services
 */
export function createUnitTestMocks() {
  const { vi } = require('vitest');
  
  return {
    database: {
      execute: vi.fn().mockResolvedValue({ rows: [], lastInsertRowid: 1 }),
      close: vi.fn(),
      _isMockClient: true,
      __vitest_mock__: true
    },
    
    brevoService: {
      subscribeToNewsletter: vi.fn().mockResolvedValue({ id: 'mock_123' }),
      unsubscribeContact: vi.fn().mockResolvedValue({ success: true }),
      healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
      _isMockService: true
    },
    
    stripeService: {
      createCheckoutSession: vi.fn().mockResolvedValue({ 
        url: 'https://mock-checkout.stripe.com' 
      }),
      retrieveSession: vi.fn().mockResolvedValue({ 
        payment_status: 'paid' 
      }),
      _isMockService: true
    }
  };
}

export default UnitTestConfig;