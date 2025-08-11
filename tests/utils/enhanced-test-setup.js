/**
 * Enhanced Test Setup
 * Improved setup and teardown patterns for integration tests
 */

import { vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { testInit } from "./test-initialization-helpers.js";
import { dbTestHelpers } from "./database-test-helpers.js";

/**
 * Enhanced test suite setup for integration tests
 */
export function setupIntegrationTests(options = {}) {
  const {
    enableDatabase = true,
    enableMocks = true,
    timeout = 30000,
    cleanDatabase = true,
    serviceDefinitions = {},
  } = options;

  let services = {};
  let app = null;

  beforeAll(async () => {
    vi.setConfig({ testTimeout: timeout, hookTimeout: timeout - 5000 });

    // Setup test environment
    testInit.setupTestEnvironment();

    // Initialize services
    const defaultServices = {
      database: {
        factory: async () => {
          if (enableDatabase) {
            const { getDatabase } = await import("../../api/lib/database.js");
            const db = getDatabase();
            await testInit.waitForDatabase(db, 15000);
            await dbTestHelpers.initialize();
            return db;
          }
          return testInit.createMockServices().database;
        },
        timeout: 15000,
      },
      brevoService: {
        factory: async () => {
          if (enableMocks) {
            return testInit.createMockServices().brevoService;
          } else {
            const { getBrevoService } = await import(
              "../../api/lib/brevo-service.js"
            );
            return getBrevoService();
          }
        },
        dependencies: [],
        timeout: 5000,
      },
      emailService: {
        factory: async () => {
          if (enableMocks) {
            return {
              createSubscriber: vi.fn().mockResolvedValue({
                id: 1,
                email: "test@example.com",
                status: "active",
              }),
              subscribe: vi.fn().mockResolvedValue({ success: true }),
              unsubscribe: vi.fn().mockResolvedValue({ success: true }),
              getByEmail: vi.fn().mockResolvedValue({
                id: 1,
                email: "test@example.com",
              }),
            };
          } else {
            const { getEmailSubscriberService } = await import(
              "../../api/lib/email-subscriber-service.js"
            );
            return getEmailSubscriberService();
          }
        },
        dependencies: ["database", "brevoService"],
        timeout: 5000,
      },
      ...serviceDefinitions,
    };

    services = await testInit.initializeServices(defaultServices);

    // Clean database if enabled
    if (enableDatabase && cleanDatabase) {
      await dbTestHelpers.cleanDatabase();
    }

    console.log("🎯 Integration test suite setup complete");
  }, timeout);

  afterAll(async () => {
    if (app) {
      // Close Express server if running
      app.close?.();
    }

    // Clean database
    if (enableDatabase && cleanDatabase) {
      try {
        await dbTestHelpers.cleanDatabase();
      } catch (error) {
        console.warn("Database cleanup warning:", error.message);
      }
    }

    // Cleanup all services
    await testInit.cleanup();

    console.log("🧹 Integration test suite cleanup complete");
  }, timeout);

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Clear database before each test if enabled
    if (enableDatabase && cleanDatabase) {
      await dbTestHelpers.cleanDatabase();
    }
  });

  afterEach(async () => {
    // Additional per-test cleanup if needed
    vi.clearAllMocks();
  });

  return {
    getServices: () => services,
    getService: (name) => services[name] || null,
    createApp: async (handlers) => {
      if (!app) {
        app = await testInit.createTestApp(handlers);
      }
      return app;
    },
  };
}

/**
 * Enhanced test suite setup for API handler tests
 */
export function setupApiTests(options = {}) {
  const {
    mockDatabase = true,
    mockExternalServices = true,
    timeout = 15000,
  } = options;

  let mockDb;
  let mockServices = {};

  beforeAll(async () => {
    testInit.setupTestEnvironment();
  });

  beforeEach(async () => {
    // Create fresh mocks for each test
    mockDb = {
      execute: vi.fn(),
      close: vi.fn(),
      batch: vi.fn(),
      testConnection: vi.fn().mockResolvedValue(true),
    };

    if (mockExternalServices) {
      mockServices = {
        brevoService: {
          subscribeToNewsletter: vi.fn(),
          unsubscribeContact: vi.fn(),
          createOrUpdateContact: vi.fn(),
          healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
        },
        emailService: {
          createSubscriber: vi.fn(),
          subscribe: vi.fn(),
          unsubscribe: vi.fn(),
          getByEmail: vi.fn(),
        },
      };
    }

    // Mock database module
    if (mockDatabase) {
      vi.doMock("../../api/lib/database.js", () => ({
        getDatabase: () => mockDb,
        getDatabaseClient: () => mockDb,
        testConnection: () => mockDb.testConnection(),
      }));
    }

    // Mock service modules
    if (mockExternalServices) {
      vi.doMock("../../api/lib/brevo-service.js", () => ({
        getBrevoService: () => mockServices.brevoService,
      }));

      vi.doMock("../../api/lib/email-subscriber-service.js", () => ({
        getEmailSubscriberService: () => mockServices.emailService,
      }));
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.doUnmock("../../api/lib/database.js");
    vi.doUnmock("../../api/lib/brevo-service.js");
    vi.doUnmock("../../api/lib/email-subscriber-service.js");
  });

  return {
    getMockDatabase: () => mockDb,
    getMockServices: () => mockServices,
    setupMockResponses: (responses) => {
      Object.entries(responses).forEach(([service, methods]) => {
        Object.entries(methods).forEach(([method, response]) => {
          if (service === "database") {
            mockDb[method] = vi.fn().mockResolvedValue(response);
          } else if (mockServices[service]) {
            mockServices[service][method] = vi.fn().mockResolvedValue(response);
          }
        });
      });
    },
  };
}

/**
 * Setup for database-only tests
 */
export function setupDatabaseTests(options = {}) {
  const { cleanBeforeEach = true, timeout = 20000 } = options;

  beforeAll(async () => {
    testInit.setupTestEnvironment();
    await dbTestHelpers.initialize();
    await dbTestHelpers.cleanDatabase();
  }, timeout);

  afterAll(async () => {
    await dbTestHelpers.cleanDatabase();
  }, timeout);

  if (cleanBeforeEach) {
    beforeEach(async () => {
      await dbTestHelpers.cleanDatabase();
    });

    afterEach(async () => {
      await dbTestHelpers.cleanDatabase();
    });
  }

  return {
    getHelpers: () => dbTestHelpers,
  };
}

/**
 * Create isolated test environment
 */
export async function createIsolatedTest(testFn, options = {}) {
  const {
    services = {},
    mocks = {},
    timeout = 15000,
    cleanup = true,
  } = options;

  const testHelpers = new (
    await import("./test-initialization-helpers.js")
  ).TestInitializationHelpers();

  try {
    testHelpers.setupTestEnvironment();

    // Setup mocks
    Object.entries(mocks).forEach(([path, mock]) => {
      vi.doMock(path, () => mock);
    });

    // Initialize services
    const initializedServices = await testHelpers.initializeServices(services);

    // Run test
    return await testFn(initializedServices);
  } finally {
    if (cleanup) {
      await testHelpers.cleanup();
      vi.resetModules();
    }
  }
}
