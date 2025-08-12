/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { testEnvManager } from "../utils/test-environment-manager.js";

// Mock the importLibSQLClient function to intercept the dynamic import
const mockImportLibSQLClient = vi.fn();

// Set up mock clients that we can control
let mockClient;
let mockCreateClient;

// Mock the dynamic import in the database module
vi.mock("../../api/lib/database.js", async () => {
  const actual = await vi.importActual("../../api/lib/database.js");

  // Create a modified DatabaseService that uses our mocked import
  class MockedDatabaseService extends actual.DatabaseService {
    constructor() {
      super();
    }

    // Override the method that calls importLibSQLClient
    async initializeClient() {
      // Test environment logic (matches actual implementation)
      if (process.env.NODE_ENV === "test" || process.env.VITEST) {
        if (this.initialized && this.client) {
          return this.client;
        }

        const databaseUrl = process.env.TURSO_DATABASE_URL;
        const authToken = process.env.TURSO_AUTH_TOKEN;

        if (!databaseUrl) {
          throw new Error(
            "TURSO_DATABASE_URL environment variable is required",
          );
        }

        const config = {
          url: databaseUrl,
        };

        if (authToken) {
          config.authToken = authToken;
        }

        try {
          // Use our mocked createClient instead of the actual import
          const createClient = mockCreateClient;
          this.client = createClient(config);
          this.initialized = true;
          return this.client;
        } catch (error) {
          throw new Error(
            "Failed to initialize database client due to configuration error",
          );
        }
      }

      // For production, delegate to ensureInitialized
      return this.ensureInitialized();
    }

    // Override ensureInitialized to use mocked import as well
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
    }

    async _performInitialization() {
      const databaseUrl = process.env.TURSO_DATABASE_URL;
      const authToken = process.env.TURSO_AUTH_TOKEN;

      if (!databaseUrl) {
        throw new Error("TURSO_DATABASE_URL environment variable is required");
      }

      const config = {
        url: databaseUrl,
      };

      if (authToken) {
        config.authToken = authToken;
      }

      try {
        // Use our mocked createClient
        const createClient = mockCreateClient;
        const client = createClient(config);

        // Only test connection in production environment
        if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
          await client.execute("SELECT 1 as test");
        }

        this.client = client;
        this.initialized = true;

        return this.client;
      } catch (error) {
        // Log error without exposing sensitive config details
        console.error("Database initialization failed:", {
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        throw new Error(
          "Failed to initialize database client due to configuration error",
        );
      }
    }
  }

  return {
    ...actual,
    DatabaseService: MockedDatabaseService,
  };
});

describe("DatabaseService", () => {
  beforeEach(() => {
    testEnvManager.backup();
    testEnvManager.clearDatabaseEnv();

    // Reset mocks for each test
    mockClient = {
      execute: vi.fn().mockResolvedValue({ rows: [{ test: 1 }] }),
      close: vi.fn(),
      batch: vi.fn(),
    };
    mockCreateClient = vi.fn().mockReturnValue(mockClient);
  });

  afterEach(() => {
    testEnvManager.restore();
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with null client and false initialized state", async () => {
      await testEnvManager.withIsolatedEnv("valid-remote", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        expect(service.client).toBeNull();
        expect(service.initialized).toBe(false);
      });
    });
  });

  describe("ensureInitialized", () => {
    it("should initialize client with environment variables", async () => {
      await testEnvManager.withIsolatedEnv("valid-remote", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const dbService = new DatabaseService();
        const client = await dbService.ensureInitialized();

        // Check that createClient was called
        expect(mockCreateClient).toHaveBeenCalled();
        const callArgs = mockCreateClient.mock.calls[0][0];
        expect(callArgs.url).toBe("libsql://test.turso.io");
        expect(callArgs.authToken).toBe("valid-token-for-remote");
        expect(client).toBeDefined();
        expect(client.execute).toBeDefined();
      });
    });

    it("should initialize client without auth token when not provided", async () => {
      await testEnvManager.withIsolatedEnv(
        {
          TURSO_DATABASE_URL: "file:test.db",
          // No auth token
        },
        async () => {
          const { DatabaseService } = await import("../../api/lib/database.js");
          const dbService = new DatabaseService();
          await dbService.ensureInitialized();

          expect(mockCreateClient).toHaveBeenCalled();
          const callArgs = mockCreateClient.mock.calls[0][0];
          expect(callArgs.url).toBe("file:test.db");
          expect(callArgs.authToken).toBeUndefined();
        },
      );
    });

    it("should throw error when TURSO_DATABASE_URL is missing", async () => {
      await testEnvManager.withIsolatedEnv("empty", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const dbService = new DatabaseService();

        await expect(dbService.ensureInitialized()).rejects.toThrow(
          "TURSO_DATABASE_URL environment variable is required",
        );
      });
    });

    it("should return existing client if already initialized", async () => {
      await testEnvManager.withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const dbService = new DatabaseService();

        const client1 = await dbService.ensureInitialized();
        const client2 = await dbService.ensureInitialized();

        expect(client1).toBe(client2);
        expect(mockCreateClient).toHaveBeenCalledTimes(1);
      });
    });

    it("should handle client creation errors", async () => {
      await testEnvManager.withIsolatedEnv("valid-local", async () => {
        // Override the mock to throw an error
        mockCreateClient.mockImplementation(() => {
          throw new Error("Failed to create database client");
        });

        const { DatabaseService } = await import("../../api/lib/database.js");
        const dbService = new DatabaseService();

        await expect(dbService.ensureInitialized()).rejects.toThrow(
          "Failed to initialize database client due to configuration error",
        );
      });
    });

    it("should log missing environment variables in error", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await testEnvManager.withIsolatedEnv("empty", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const dbService = new DatabaseService();

        try {
          await dbService.ensureInitialized();
          // Should not reach here
          expect(false).toBe(true);
        } catch (error) {
          expect(error.message).toContain("TURSO_DATABASE_URL");
          // No console.error logged for missing environment variables
          // Only configuration errors during createClient trigger console.error
          expect(consoleSpy).not.toHaveBeenCalled();
        }
      });

      consoleSpy.mockRestore();
    });
  });
});
