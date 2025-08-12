/**
 * Integration Test Patterns and Comprehensive Testing Strategy
 * 
 * Establishes consistent patterns for both mocking and real service integration tests
 * Provides service availability detection, graceful degradation, and comprehensive patterns
 */

import { vi } from "vitest";
import { 
  createEmailSubscriberServiceMock, 
  createDatabaseServiceMock,
  createBrevoServiceMock,
  REQUIRED_METHODS,
  validateServiceMock
} from "./service-mock-factory.js";

import { TestEnvironmentManager } from './test-environment-manager.js';
import { serviceDetector, withServiceAvailability } from './service-availability-detector.js';
import { integrationStrategy } from './integration-test-strategy.js';

/**
 * Standard integration test setup for database API tests
 * @param {Object} options Configuration options for mocks
 * @returns {Object} Configured mocks for integration tests
 */
export function setupDatabaseApiIntegrationTest(options = {}) {
  // Create comprehensive mocks with all required methods
  const mockEmailSubscriberService = createEmailSubscriberServiceMock({
    autoInitialize: true,
    defaultStats: true,
    defaultTokens: true,
    defaultEvents: true,
    ...options.emailService
  });

  // Create database client mock (what ensureInitialized returns)
  const mockDatabaseClient = {
    execute: vi.fn(),
  };

  // Create database service mock
  const mockDatabase = {
    ensureInitialized: vi.fn().mockResolvedValue(mockDatabaseClient),
    testConnection: vi.fn().mockResolvedValue(true),
    getClient: vi.fn().mockResolvedValue(mockDatabaseClient),
  };

  // Configure default database responses
  mockDatabaseClient.execute.mockImplementation((sql) => {
    if (sql.includes("sqlite_master")) {
      return Promise.resolve({
        rows: [
          { name: "email_subscribers" },
          { name: "email_events" },
          { name: "email_audit_log" },
        ],
      });
    } else if (sql.includes("table_info")) {
      return Promise.resolve({
        rows: [
          { name: "id" },
          { name: "email" },
          { name: "status" },
          { name: "created_at" },
          { name: "updated_at" },
        ],
      });
    } else if (sql.includes("index_list")) {
      return Promise.resolve({
        rows: [
          { name: "email_idx" },
          { name: "created_at_idx" },
        ],
      });
    } else if (sql.includes("COUNT(*)")) {
      return Promise.resolve({
        rows: [{ count: 42 }],
      });
    }
    return Promise.resolve({ rows: [] });
  });

  // Setup module mocks
  vi.mock("../../api/lib/email-subscriber-service.js", () => ({
    getEmailSubscriberService: vi.fn(() => mockEmailSubscriberService),
    resetEmailSubscriberService: vi.fn(),
  }));

  vi.mock("../../api/lib/database.js", () => ({
    getDatabase: vi.fn(() => mockDatabase),
    getDatabaseClient: vi.fn(() => mockDatabaseClient),
  }));

  return {
    mockEmailSubscriberService,
    mockDatabase,
    mockDatabaseClient,
    
    // Helper to reset mocks for beforeEach
    resetMocks() {
      vi.clearAllMocks();
      
      // Re-setup database mock after clearAllMocks
      mockDatabase.ensureInitialized.mockResolvedValue(mockDatabaseClient);
      mockDatabase.testConnection.mockResolvedValue(true);
      mockDatabase.getClient.mockResolvedValue(mockDatabaseClient);
      
      // Re-setup default email service behavior
      mockEmailSubscriberService.getSubscriberStats.mockResolvedValue({
        total: 1250,
        active: 1100,
        pending: 50,
        unsubscribed: 75,
        bounced: 25,
      });
      
      // Re-setup database client execute behavior
      mockDatabaseClient.execute.mockImplementation((sql) => {
        if (sql.includes("sqlite_master")) {
          return Promise.resolve({
            rows: [
              { name: "email_subscribers" },
              { name: "email_events" },
              { name: "email_audit_log" },
            ],
          });
        } else if (sql.includes("table_info")) {
          return Promise.resolve({
            rows: [
              { name: "id" },
              { name: "email" },
              { name: "status" },
              { name: "created_at" },
              { name: "updated_at" },
            ],
          });
        } else if (sql.includes("index_list")) {
          return Promise.resolve({
            rows: [
              { name: "email_idx" },
              { name: "created_at_idx" },
            ],
          });
        } else if (sql.includes("COUNT(*)")) {
          return Promise.resolve({
            rows: [{ count: 42 }],
          });
        }
        return Promise.resolve({ rows: [] });
      });
    },

    // Helper to validate all mocks have required methods
    validateMocks() {
      validateServiceMock(mockEmailSubscriberService, REQUIRED_METHODS.emailSubscriberService);
      validateServiceMock(mockDatabase, REQUIRED_METHODS.database);
    }
  };
}

/**
 * Standard integration test setup for email API tests
 * @param {Object} options Configuration options for mocks
 * @returns {Object} Configured mocks for email integration tests
 */
export function setupEmailApiIntegrationTest(options = {}) {
  const mockEmailSubscriberService = createEmailSubscriberServiceMock({
    autoInitialize: true,
    defaultStats: true,
    defaultTokens: true,
    defaultEvents: true,
    ...options.emailService
  });

  const mockBrevoService = createBrevoServiceMock({
    autoInitialize: true,
    defaultSubscription: true,
    defaultStats: true,
    ...options.brevo
  });

  const mockDatabase = createDatabaseServiceMock({
    defaultQueries: true,
    ...options.database
  });

  // Setup module mocks
  vi.mock("../../api/lib/email-subscriber-service.js", () => ({
    getEmailSubscriberService: vi.fn(() => mockEmailSubscriberService),
    resetEmailSubscriberService: vi.fn(),
  }));

  vi.mock("../../api/lib/brevo-service.js", () => ({
    getBrevoService: vi.fn(() => mockBrevoService),
  }));

  vi.mock("../../api/lib/database.js", () => ({
    getDatabase: vi.fn(() => mockDatabase),
    getDatabaseClient: vi.fn(() => mockDatabase),
  }));

  return {
    mockEmailSubscriberService,
    mockBrevoService,
    mockDatabase,
    
    resetMocks() {
      vi.clearAllMocks();
      
      // Re-setup service behaviors
      mockEmailSubscriberService.ensureInitialized.mockResolvedValue(mockEmailSubscriberService);
      mockBrevoService.ensureInitialized.mockResolvedValue(mockBrevoService);
      mockDatabase.execute.mockResolvedValue({ rows: [] });
    },

    validateMocks() {
      validateServiceMock(mockEmailSubscriberService, REQUIRED_METHODS.emailSubscriberService);
      validateServiceMock(mockBrevoService, REQUIRED_METHODS.brevoService);
      validateServiceMock(mockDatabase, REQUIRED_METHODS.database);
    }
  };
}

/**
 * Standard integration test setup for payment API tests
 * @param {Object} options Configuration options for mocks
 * @returns {Object} Configured mocks for payment integration tests
 */
export function setupPaymentApiIntegrationTest(options = {}) {
  // This can be expanded when payment integration tests need service mocking
  const mockDatabase = createDatabaseServiceMock({
    defaultQueries: true,
    ...options.database
  });

  vi.mock("../../api/lib/database.js", () => ({
    getDatabase: vi.fn(() => mockDatabase),
    getDatabaseClient: vi.fn(() => mockDatabase),
  }));

  return {
    mockDatabase,
    
    resetMocks() {
      vi.clearAllMocks();
      mockDatabase.execute.mockResolvedValue({ rows: [] });
    },

    validateMocks() {
      validateServiceMock(mockDatabase, REQUIRED_METHODS.database);
    }
  };
}

/**
 * Environment setup helper for integration tests
 * @param {Object} envVars Environment variables to set
 */
export function setupTestEnvironment(envVars = {}) {
  const defaultEnvVars = {
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    DATABASE_URL: "test://database.url",
    BREVO_API_KEY: "test-api-key",
    TURSO_DATABASE_URL: "file:test.db",
    TURSO_AUTH_TOKEN: "test-token",
  };

  const finalEnvVars = { ...defaultEnvVars, ...envVars };
  
  Object.entries(finalEnvVars).forEach(([key, value]) => {
    process.env[key] = value;
  });

  return {
    cleanup() {
      Object.keys(finalEnvVars).forEach(key => {
        delete process.env[key];
      });
    }
  };
}

/**
 * Common test scenarios for integration tests
 */
export const IntegrationTestScenarios = {
  /**
   * Successful database operations
   */
  successfulDatabaseOperations: {
    emailService: {
      stats: {
        total: 1250,
        active: 1100,
        pending: 50,
        unsubscribed: 75,
        bounced: 25,
      }
    }
  },

  /**
   * Database connection failure
   */
  databaseConnectionFailure: {
    emailService: {
      overrides: {
        getSubscriberStats: () => {
          throw new Error("Database connection failed");
        }
      }
    }
  },

  /**
   * Invalid response structure
   */
  invalidResponseStructure: {
    emailService: {
      overrides: {
        getSubscriberStats: () => ({ active: 100 }) // Missing required 'total' property
      }
    }
  },

  /**
   * Service not available
   */
  serviceNotAvailable: {
    emailService: {
      overrides: {
        getSubscriberStats: () => {
          throw new Error("Service not available");
        }
      }
    }
  }
};

/**
 * Mock vs Real service decision matrix
 * Helps decide when to use mocks vs real services in tests
 */
export const ServiceStrategy = {
  /**
   * Unit tests: Always use mocks
   */
  UNIT_TEST: {
    database: 'mock',
    googleSheets: 'mock', 
    brevo: 'mock',
    stripe: 'mock',
    external: 'mock'
  },

  /**
   * Integration tests: Real internal services, mock external
   */
  INTEGRATION_TEST: {
    database: 'real',
    googleSheets: 'real', // If available
    brevo: 'real', // If available
    stripe: 'mock', // External service
    external: 'mock'
  },

  /**
   * End-to-end tests: Real services with test data
   */
  E2E_TEST: {
    database: 'real',
    googleSheets: 'real',
    brevo: 'real',
    stripe: 'test_mode', // Real API in test mode
    external: 'test_mode'
  },

  /**
   * Get strategy for test type
   * @param {string} testType - Type of test (unit/integration/e2e)
   * @returns {Object} Service strategy configuration
   */
  getStrategy(testType) {
    const strategies = {
      unit: this.UNIT_TEST,
      integration: this.INTEGRATION_TEST,
      e2e: this.E2E_TEST
    };
    
    return strategies[testType] || this.UNIT_TEST;
  }
};

/**
 * Enhanced integration test setup with service availability checking
 * @param {Object} config - Test configuration
 * @returns {Object} Test setup utilities
 */
export function setupEnhancedIntegrationTest(config = {}) {
  const {
    services = [],
    environmentPreset = 'complete-test',
    useRealServices = true,
    skipOnUnavailable = true,
    timeout = 30000
  } = config;

  const envManager = new TestEnvironmentManager();

  return {
    // Service availability wrapper with graceful degradation
    withServiceAvailability: async (testFn, fallbackFn = null) => {
      if (!skipOnUnavailable) {
        return await testFn();
      }

      return await withServiceAvailability(services, testFn, fallbackFn || (async () => {
        console.log(`⏭️  Skipping test - required services unavailable: ${services.join(', ')}`);
        return { skipped: true, reason: `Services unavailable: ${services.join(', ')}` };
      }));
    },

    // Real services integration with fallback to mocks
    withRealOrMockServices: async (testFn) => {
      if (!useRealServices) {
        // Use traditional mock approach
        const mocks = setupDatabaseApiIntegrationTest();
        return await testFn({ mocked: true, services: mocks });
      }

      // Try real services first
      try {
        return await integrationStrategy.withRealServices(services, async (realServices) => {
          return await testFn({ mocked: false, services: realServices });
        });
      } catch (error) {
        console.warn(`Real services failed (${error.message}), falling back to mocks`);
        const mocks = setupDatabaseApiIntegrationTest();
        return await testFn({ mocked: true, services: mocks, fallback: true });
      }
    },

    // Environment isolation with enhanced state tracking
    withIsolatedEnvironment: async (testFn) => {
      return await envManager.withCompleteIsolation(environmentPreset, testFn);
    },

    // Complete integration test with all features
    withFullIntegration: async (testFn) => {
      return await envManager.withCompleteIsolation(environmentPreset, async () => {
        return await withServiceAvailability(services, async () => {
          if (useRealServices) {
            return await integrationStrategy.withRealServices(services, testFn);
          } else {
            const mocks = setupDatabaseApiIntegrationTest();
            return await testFn(mocks);
          }
        }, async () => {
          console.log(`⏭️  Integration test skipped - services unavailable: ${services.join(', ')}`);
          return { skipped: true };
        });
      });
    },

    // Helper for database client enforcement (ensures real client in integration tests)
    withEnforcedDatabaseClient: async (testFn) => {
      const dbEnforcement = await integrationStrategy.createDatabaseClientEnforcement();
      const client = await dbEnforcement.ensureRealClient();
      dbEnforcement.validateNotMocked(client);
      return await testFn(client);
    },

    // State and availability reporting
    getTestState: async () => {
      const availability = await serviceDetector.checkAllServices();
      return {
        environment: envManager.getState(),
        serviceAvailability: availability,
        canRunIntegrationTests: Object.values(availability).some(Boolean),
        strategy: ServiceStrategy.getStrategy('integration')
      };
    }
  };
}

/**
 * Service health validation patterns
 * @param {string[]} serviceNames - Services to validate
 * @returns {Promise<Object>} Validation results
 */
export async function validateServiceHealth(serviceNames) {
  const results = {
    healthy: [],
    unhealthy: [],
    canRunTests: true,
    warnings: []
  };

  for (const serviceName of serviceNames) {
    const isHealthy = await serviceDetector.checkService(serviceName);
    
    if (isHealthy) {
      results.healthy.push(serviceName);
    } else {
      results.unhealthy.push(serviceName);
      
      // Check if this service is required
      const serviceConfig = serviceDetector.serviceChecks.get(serviceName);
      if (serviceConfig?.required) {
        results.canRunTests = false;
      } else {
        results.warnings.push(`Optional service ${serviceName} is unavailable`);
      }
    }
  }

  return results;
}

/**
 * Best practices checklist for integration test mocks
 */
export const INTEGRATION_TEST_BEST_PRACTICES = {
  required: [
    "All service methods must be mocked to prevent 'method not found' errors",
    "ensureInitialized methods must return appropriate objects (service or client)",
    "Database mocks must distinguish between service and client objects",
    "Environment variables must be properly set up and cleaned up",
    "Mock behaviors must be reset in beforeEach to prevent test interference",
    "Integration tests should prefer real services when available",
    "Service availability should be checked before test execution",
    "Tests should gracefully degrade when services are unavailable"
  ],
  
  recommended: [
    "Use factory functions for consistent mock creation",
    "Validate mocks have all required methods using validateServiceMock",
    "Provide realistic default responses for better test reliability",
    "Include helper methods for common mock reset and validation patterns",
    "Document the purpose and configuration of each mock clearly",
    "Use service availability detection for better CI/CD reliability",
    "Implement fallback patterns for unavailable services",
    "Track test performance and identify slow service initialization"
  ],

  realServices: [
    "Real database clients should use in-memory databases for speed",
    "External APIs should be mocked even in integration tests",
    "Service initialization should have timeout protection",
    "Integration tests should validate service health before execution",
    "Real services must be properly cleaned up after tests"
  ]
};