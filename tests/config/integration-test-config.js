/**
 * Integration Test Configuration
 * 
 * Specific configuration for integration tests that require real database clients
 * and service connections. This configuration ensures integration tests are
 * properly isolated from unit tests and use the correct environment.
 * 
 * @author Principal Architect
 * @version 1.0.0 - Integration Test Architecture Fix
 */

import { TestEnvironments } from './test-environments.js';

export const IntegrationTestConfig = {
  // Environment configuration for integration tests
  environment: {
    // Use real database (not memory) for realistic testing
    database: {
      url: 'file:integration-test.db',
      authToken: 'integration-test-token',
      timeout: 15000
    },
    
    // Real service endpoints (test mode)
    services: {
      brevo: {
        apiKey: 'test-integration-key',
        listId: '2',
        webhookSecret: 'integration-webhook-secret'
      },
      
      stripe: {
        secretKey: 'sk_test_integration_key',
        publishableKey: 'pk_test_integration_key',
        webhookSecret: 'whsec_integration_test'
      }
    },
    
    // Node.js environment for server-side testing
    runtime: 'node'
  },
  
  // Test execution configuration
  execution: {
    // Longer timeouts for real service calls
    testTimeout: 60000,
    hookTimeout: 30000,
    
    // Reduced concurrency for integration tests
    maxConcurrency: 2,
    threads: 2,
    
    // Isolation requirements
    isolate: true,
    clearMocks: false, // Keep real services
    
    // Retry configuration for flaky network calls
    retry: 3
  },
  
  // Service initialization requirements
  services: {
    database: {
      required: true,
      type: 'real',
      validation: 'strict'
    },
    
    email: {
      required: false,
      type: 'real',
      validation: 'warn'
    },
    
    payment: {
      required: false,
      type: 'real',
      validation: 'warn'
    }
  },
  
  // Database schema requirements
  schema: {
    // Ensure all tables exist
    ensureTables: true,
    
    // Clean data between tests
    cleanBetweenTests: true,
    
    // Seed test data
    seedData: false,
    
    // Migration requirements
    requireMigrations: true
  },
  
  // Performance requirements
  performance: {
    // Maximum acceptable test duration
    maxTestDuration: 30000,
    
    // Maximum setup time
    maxSetupTime: 10000,
    
    // Memory limits
    maxMemoryUsage: '512MB'
  },
  
  // Debugging configuration
  debug: {
    enabled: process.env.TEST_DEBUG === 'true',
    logLevel: 'info',
    logServices: true,
    logDatabase: true,
    logPerformance: true
  }
};

/**
 * Get integration test environment variables
 * @returns {Object} Environment variables for integration tests
 */
export function getIntegrationEnvironment() {
  return {
    ...TestEnvironments.COMPLETE_TEST,
    // Override for integration-specific settings
    TURSO_DATABASE_URL: IntegrationTestConfig.environment.database.url,
    TURSO_AUTH_TOKEN: IntegrationTestConfig.environment.database.authToken,
    TEST_TYPE: 'integration',
    VITEST_MODE: 'integration'
  };
}

/**
 * Validate integration test prerequisites
 * @throws {Error} If prerequisites are not met
 */
export function validateIntegrationPrerequisites() {
  const errors = [];
  
  // Check Node.js version
  const nodeVersion = process.versions.node;
  if (!nodeVersion || parseFloat(nodeVersion) < 18) {
    errors.push('Node.js 18+ required for integration tests');
  }
  
  // Check required environment variables
  const required = [
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN'
  ];
  
  const missing = required.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    errors.push(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Check database URL format
  const dbUrl = process.env.TURSO_DATABASE_URL;
  if (dbUrl && dbUrl.includes(':memory:')) {
    errors.push('Integration tests cannot use in-memory database');
  }
  
  if (errors.length > 0) {
    throw new Error(`Integration test prerequisites not met:\n${errors.join('\n')}`);
  }
}

/**
 * Setup integration test environment
 * @param {Object} testContext - Test context
 * @returns {Object} Setup configuration
 */
export function setupIntegrationTest(testContext = {}) {
  // Validate prerequisites
  validateIntegrationPrerequisites();
  
  // Apply environment
  const environment = getIntegrationEnvironment();
  Object.assign(process.env, environment);
  
  // Return setup configuration
  return {
    testType: 'integration',
    environment: 'real',
    config: IntegrationTestConfig,
    context: testContext
  };
}

/**
 * Check if current test should run as integration test
 * @param {Object} testContext - Test context
 * @returns {boolean} True if integration test
 */
export function shouldRunAsIntegrationTest(testContext) {
  const filePath = testContext?.file?.filepath || '';
  
  return (
    filePath.includes('/integration/') ||
    filePath.includes('integration.test.js') ||
    process.env.TEST_TYPE === 'integration' ||
    process.env.VITEST_MODE === 'integration'
  );
}

export default IntegrationTestConfig;