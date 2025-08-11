/**
 * Database Mock Synchronization Layer
 * Ensures mocks behave consistently with the actual database implementation
 * Provides error handling and initialization patterns matching DatabaseService
 */

import { vi } from "vitest";

export class DatabaseMockSync {
  constructor() {
    this.mockClient = null;
    this.mockBehavior = "success";
    this.initialized = false;
  }

  /**
   * Create synchronized mock that matches actual LibSQL client behavior
   */
  createSynchronizedMock() {
    const mockClient = {
      execute: vi.fn(),
      close: vi.fn(),
      batch: vi.fn(),
    };

    // Setup default successful responses matching LibSQL client
    mockClient.execute.mockImplementation(async (query) => {
      // Handle both string and object query formats like real client
      const sql = typeof query === "string" ? query : query.sql;

      // Simulate successful response structure
      return {
        rows: [],
        rowsAffected: 0,
        columns: [],
        columnTypes: [],
      };
    });

    mockClient.close.mockImplementation(() => {
      // LibSQL close is synchronous, no return value
      return undefined;
    });

    mockClient.batch.mockImplementation(async (statements) => {
      // Return array of results matching LibSQL batch behavior
      return statements.map(() => ({
        rows: [],
        rowsAffected: 0,
        columns: [],
        columnTypes: [],
      }));
    });

    this.mockClient = mockClient;
    return mockClient;
  }

  /**
   * Configure mock to simulate specific behaviors
   * Matches error scenarios from actual DatabaseService
   */
  setBehavior(behavior) {
    this.mockBehavior = behavior;

    switch (behavior) {
      case "missing-url":
        // Simulate missing TURSO_DATABASE_URL - mock will be null
        this.mockClient = null;
        break;

      case "connection-error":
        // Simulate connection failure during execute
        if (this.mockClient) {
          this.mockClient.execute.mockRejectedValue(
            new Error("Failed to connect to database"),
          );
        }
        break;

      case "initialization-error":
        // Simulate initialization failure - client creation fails
        this.mockClient = null;
        break;

      case "invalid-url-format":
        // Simulate invalid database URL format
        this.mockClient = null;
        break;

      case "auth-error":
        // Simulate authentication failure
        if (this.mockClient) {
          this.mockClient.execute.mockRejectedValue(
            new Error("Authentication failed"),
          );
        }
        break;

      case "timeout-error":
        // Simulate timeout during connection
        if (this.mockClient) {
          this.mockClient.execute.mockRejectedValue(
            new Error("Connection timeout"),
          );
        }
        break;

      case "success":
      default:
        // Reset to successful behavior
        this.createSynchronizedMock();
        break;
    }
  }

  /**
   * Mock the DatabaseService class with identical behavior patterns
   * Matches the promise-based lazy singleton pattern from actual implementation
   */
  mockDatabaseService() {
    const syncRef = this; // Reference to the sync instance
    const MockDatabaseService = {
      client: null,
      initialized: false,
      initializationPromise: null,
      maxRetries: 3,
      retryDelay: 1000,

      /**
       * Matches ensureInitialized from actual DatabaseService
       */
      async ensureInitialized() {
        // Return immediately if already initialized (fast path)
        if (this.initialized && this.client) {
          return this.client;
        }

        // If initialization is already in progress, return the existing promise
        if (this.initializationPromise) {
          return this.initializationPromise;
        }

        // Start new initialization
        this.initializationPromise = this._initializeWithRetry();

        try {
          const client = await this.initializationPromise;
          return client;
        } catch (error) {
          // Clear the failed promise so next call can retry
          this.initializationPromise = null;
          throw error;
        }
      },

      /**
       * Mock initialization with retry logic (disabled in tests)
       */
      async _initializeWithRetry(retryCount = 0) {
        try {
          return await this._performInitialization();
        } catch (error) {
          // Only retry in production, not in tests (matches actual implementation)
          if (
            retryCount < this.maxRetries &&
            process.env.NODE_ENV !== "test" &&
            !process.env.VITEST
          ) {
            await this._delay(this.retryDelay * Math.pow(2, retryCount));
            return this._initializeWithRetry(retryCount + 1);
          }
          throw error;
        }
      },

      /**
       * Mock the actual initialization logic
       */
      async _performInitialization() {
        const databaseUrl = process.env.TURSO_DATABASE_URL;
        const authToken = process.env.TURSO_AUTH_TOKEN;

        // Match exact error messages from actual implementation
        if (!databaseUrl) {
          throw new Error(
            "TURSO_DATABASE_URL environment variable is required",
          );
        }

        // Simulate invalid URL format check
        if (databaseUrl === "invalid-url-format") {
          throw new Error(
            "Failed to initialize database client due to configuration error",
          );
        }

        try {
          // Return the mock client based on current behavior
          switch (syncRef.mockBehavior) {
            case "missing-url":
              throw new Error(
                "TURSO_DATABASE_URL environment variable is required",
              );

            case "invalid-url-format":
              throw new Error(
                "Failed to initialize database client due to configuration error",
              );

            case "connection-error":
            case "auth-error":
            case "timeout-error":
              throw new Error(
                "Failed to initialize database client due to configuration error",
              );

            case "success":
            default:
              if (!this.client) {
                this.client = syncRef.createSynchronizedMock();
              }
              this.initialized = true;

              // Skip connection test in tests (matches actual implementation)
              if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
                await this.client.execute("SELECT 1 as test");
              }

              return this.client;
          }
        } catch (error) {
          // Match error handling from actual implementation
          throw new Error(
            "Failed to initialize database client due to configuration error",
          );
        }
      },

      /**
       * Utility method for delay in retry logic
       */
      async _delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      },

      /**
       * Mock initializeClient method (backward compatibility)
       */
      async initializeClient() {
        // In test environment, maintain synchronous-like behavior (matches actual)
        if (process.env.NODE_ENV === "test" || process.env.VITEST) {
          if (this.initialized && this.client) {
            return this.client;
          }

          const databaseUrl = process.env.TURSO_DATABASE_URL;

          if (!databaseUrl) {
            throw new Error(
              "TURSO_DATABASE_URL environment variable is required",
            );
          }

          try {
            if (!this.client) {
              this.client = syncRef.createSynchronizedMock();
            }
            this.initialized = true;
            return this.client;
          } catch (error) {
            throw new Error(
              "Failed to initialize database client due to configuration error",
            );
          }
        }

        // In production, use the full promise-based initialization
        return this.ensureInitialized();
      },

      /**
       * Get database client instance
       */
      async getClient() {
        return this.ensureInitialized();
      },

      /**
       * Mock execute method matching actual behavior
       */
      async execute(queryOrObject, params = []) {
        try {
          const client = await this.ensureInitialized();

          // Handle both string and object formats (matches actual)
          if (typeof queryOrObject === "string") {
            return await client.execute({ sql: queryOrObject, args: params });
          } else {
            return await client.execute(queryOrObject);
          }
        } catch (error) {
          const sqlString =
            typeof queryOrObject === "string"
              ? queryOrObject
              : queryOrObject.sql;

          // Match rollback error handling from actual implementation
          const isRollbackError =
            sqlString === "ROLLBACK" &&
            error.message?.includes("cannot rollback");
          if (!isRollbackError || process.env.NODE_ENV !== "test") {
            // In actual implementation, this would log the error
          }

          throw error;
        }
      },

      /**
       * Mock batch method
       */
      async batch(statements) {
        try {
          const client = await this.ensureInitialized();
          return await client.batch(statements);
        } catch (error) {
          throw error;
        }
      },

      /**
       * Mock close method
       */
      close() {
        if (this.client) {
          try {
            this.client.close();
          } catch (error) {
            // Match error handling from actual implementation
          } finally {
            this.client = null;
            this.initialized = false;
            this.initializationPromise = null;
          }
        }
      },

      /**
       * Mock test connection method
       */
      async testConnection() {
        try {
          const client = await this.ensureInitialized();
          const result = await client.execute("SELECT 1 as test");

          if (result && result.rows !== undefined) {
            return true;
          }

          return false;
        } catch (error) {
          return false;
        }
      },

      /**
       * Mock health check method
       */
      async healthCheck() {
        try {
          const isConnected = await this.testConnection();

          if (!isConnected) {
            return {
              status: "unhealthy",
              error: "Connection test failed",
              timestamp: new Date().toISOString(),
            };
          }

          return {
            status: "healthy",
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return {
            status: "unhealthy",
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      },

      /**
       * Reference to the mock synchronization instance
       */
      mockBehavior: syncRef.mockBehavior,
      createSynchronizedMock: syncRef.createSynchronizedMock.bind(syncRef),
    };

    return MockDatabaseService;
  }

  /**
   * Helper to mock the entire database module
   * Replaces the actual module exports with synchronized mocks
   */
  mockDatabaseModule() {
    const mockService = this.mockDatabaseService();

    // Mock the module exports to match actual database.js structure
    // Use a factory function to avoid closure issues with Vitest hoisting
    vi.mock("../../api/lib/database.js", async () => {
      // Import the class inside the factory to avoid hoisting issues
      const { DatabaseMockSync } = await import("./database-mock-sync.js");

      // Create fresh mock service instance inside the factory
      const sync = new DatabaseMockSync();
      const service = sync.mockDatabaseService();

      return {
        getDatabaseClient: vi.fn(async () => {
          return await service.getClient();
        }),
        getDatabase: vi.fn(() => service),
        testConnection: vi.fn(async () => {
          return await service.testConnection();
        }),
        DatabaseService: vi.fn(() => service),
        default: service,
      };
    });

    return mockService;
  }

  /**
   * Reset all mocks to clean state
   */
  reset() {
    this.mockClient = null;
    this.mockBehavior = "success";
    this.initialized = false;
    vi.clearAllMocks();
  }
}

/**
 * Helper function for tests with specific behavior
 * Provides scoped mock behavior for individual tests
 */
export function withSynchronizedMock(behavior, testFn) {
  const sync = new DatabaseMockSync();
  const mock = sync.createSynchronizedMock();
  sync.setBehavior(behavior);

  try {
    return testFn(mock, sync);
  } finally {
    sync.reset();
  }
}

/**
 * Helper function to create a mock with database service
 * Returns both the mock client and the service for testing
 */
export function withMockDatabaseService(behavior = "success", testFn) {
  const sync = new DatabaseMockSync();
  sync.setBehavior(behavior);
  const mockService = sync.mockDatabaseService();

  try {
    return testFn(mockService, sync);
  } finally {
    sync.reset();
  }
}

/**
 * Export singleton for shared usage
 */
export const dbMockSync = new DatabaseMockSync();

/**
 * Utility to setup environment variables for different test scenarios
 */
export const DatabaseTestScenarios = {
  /**
   * Setup environment for successful connection
   */
  setupSuccess() {
    process.env.TURSO_DATABASE_URL = "libsql://test-database.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test-auth-token";
  },

  /**
   * Setup environment for missing URL
   */
  setupMissingUrl() {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
  },

  /**
   * Setup environment for invalid URL format
   */
  setupInvalidUrl() {
    process.env.TURSO_DATABASE_URL = "invalid-url-format";
    process.env.TURSO_AUTH_TOKEN = "test-auth-token";
  },

  /**
   * Setup environment for auth error
   */
  setupAuthError() {
    process.env.TURSO_DATABASE_URL = "libsql://test-database.turso.io";
    process.env.TURSO_AUTH_TOKEN = "invalid-token";
  },

  /**
   * Cleanup environment
   */
  cleanup() {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
  },
};
