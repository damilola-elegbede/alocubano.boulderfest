/**
 * Database Mock Synchronization Tests
 * Verifies that mock synchronization layer behaves consistently with actual implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DatabaseMockSync,
  withSynchronizedMock,
  withMockDatabaseService,
  DatabaseTestScenarios,
  dbMockSync,
} from "../utils/database-mock-sync.js";

describe("DatabaseMockSync", () => {
  let mockSync;
  let originalEnv;

  beforeEach(() => {
    mockSync = new DatabaseMockSync();
    // Preserve original environment
    originalEnv = { ...process.env };
    // Setup test environment
    process.env.NODE_ENV = "test";
    process.env.VITEST = "true";
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    mockSync?.reset();
    vi.clearAllMocks();
  });

  describe("Mock Client Creation", () => {
    it("should create synchronized mock with correct methods", () => {
      const mockClient = mockSync.createSynchronizedMock();

      expect(mockClient).toBeDefined();
      expect(mockClient.execute).toBeDefined();
      expect(mockClient.close).toBeDefined();
      expect(mockClient.batch).toBeDefined();
      expect(vi.isMockFunction(mockClient.execute)).toBe(true);
      expect(vi.isMockFunction(mockClient.close)).toBe(true);
      expect(vi.isMockFunction(mockClient.batch)).toBe(true);
    });

    it("should handle both string and object query formats", async () => {
      const mockClient = mockSync.createSynchronizedMock();

      // Test string query
      const stringResult = await mockClient.execute("SELECT 1");
      expect(stringResult).toEqual({
        rows: [],
        rowsAffected: 0,
        columns: [],
        columnTypes: [],
      });

      // Test object query
      const objectResult = await mockClient.execute({
        sql: "SELECT 1",
        args: [],
      });
      expect(objectResult).toEqual({
        rows: [],
        rowsAffected: 0,
        columns: [],
        columnTypes: [],
      });
    });

    it("should handle batch operations", async () => {
      const mockClient = mockSync.createSynchronizedMock();

      const statements = [
        { sql: "SELECT 1", args: [] },
        { sql: "SELECT 2", args: [] },
      ];

      const results = await mockClient.batch(statements);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        rows: [],
        rowsAffected: 0,
        columns: [],
        columnTypes: [],
      });
    });

    it("should handle close operation", () => {
      const mockClient = mockSync.createSynchronizedMock();

      // Should not throw and return undefined (like LibSQL)
      const result = mockClient.close();
      expect(result).toBeUndefined();
    });
  });

  describe("Behavior Configuration", () => {
    it("should configure success behavior by default", () => {
      mockSync.setBehavior("success");
      expect(mockSync.mockBehavior).toBe("success");
      expect(mockSync.mockClient).toBeDefined();
    });

    it("should configure missing URL behavior", () => {
      mockSync.setBehavior("missing-url");
      expect(mockSync.mockBehavior).toBe("missing-url");
      expect(mockSync.mockClient).toBeNull();
    });

    it("should configure connection error behavior", async () => {
      mockSync.createSynchronizedMock();
      mockSync.setBehavior("connection-error");

      await expect(mockSync.mockClient.execute("SELECT 1")).rejects.toThrow(
        "Failed to connect to database",
      );
    });

    it("should configure initialization error behavior", () => {
      mockSync.setBehavior("initialization-error");
      expect(mockSync.mockClient).toBeNull();
    });
  });

  describe("Database Service Mock", () => {
    it("should create mock service with correct structure", () => {
      const mockService = mockSync.mockDatabaseService();

      expect(mockService).toHaveProperty("client", null);
      expect(mockService).toHaveProperty("initialized", false);
      expect(mockService).toHaveProperty("initializationPromise", null);
      expect(mockService).toHaveProperty("ensureInitialized");
      expect(mockService).toHaveProperty("getClient");
      expect(mockService).toHaveProperty("execute");
      expect(mockService).toHaveProperty("batch");
      expect(mockService).toHaveProperty("close");
      expect(mockService).toHaveProperty("testConnection");
      expect(mockService).toHaveProperty("healthCheck");
    });

    it("should throw correct error when TURSO_DATABASE_URL is missing", async () => {
      DatabaseTestScenarios.setupMissingUrl();

      const mockService = mockSync.mockDatabaseService();

      await expect(mockService.ensureInitialized()).rejects.toThrow(
        "TURSO_DATABASE_URL environment variable is required",
      );
    });

    it("should initialize successfully with valid environment", async () => {
      DatabaseTestScenarios.setupSuccess();
      mockSync.setBehavior("success");

      const mockService = mockSync.mockDatabaseService();
      const client = await mockService.ensureInitialized();

      expect(client).toBeDefined();
      expect(mockService.initialized).toBe(true);
      expect(mockService.client).toBe(client);
    });

    it("should handle initialization promise caching", async () => {
      DatabaseTestScenarios.setupSuccess();
      mockSync.setBehavior("success");

      const mockService = mockSync.mockDatabaseService();

      // Start two concurrent initializations
      const promise1 = mockService.ensureInitialized();
      const promise2 = mockService.ensureInitialized();

      const [client1, client2] = await Promise.all([promise1, promise2]);

      // Should return the same client instance
      expect(client1).toBe(client2);
      expect(mockService.initialized).toBe(true);
    });

    it("should clear failed promise on initialization error", async () => {
      DatabaseTestScenarios.setupMissingUrl();

      const mockService = mockSync.mockDatabaseService();

      // First attempt should fail
      await expect(mockService.ensureInitialized()).rejects.toThrow();
      expect(mockService.initializationPromise).toBeNull();

      // Second attempt should also fail (not return cached promise)
      await expect(mockService.ensureInitialized()).rejects.toThrow();
    });

    it("should handle execute method with error scenarios", async () => {
      DatabaseTestScenarios.setupSuccess();
      mockSync.setBehavior("success");

      const mockService = mockSync.mockDatabaseService();

      // Should execute successfully
      const result = await mockService.execute("SELECT 1");
      expect(result).toEqual({
        rows: [],
        rowsAffected: 0,
        columns: [],
        columnTypes: [],
      });

      // Should handle object format
      const objectResult = await mockService.execute({
        sql: "SELECT 1",
        args: [],
      });
      expect(objectResult).toEqual({
        rows: [],
        rowsAffected: 0,
        columns: [],
        columnTypes: [],
      });
    });

    it("should handle close method correctly", () => {
      DatabaseTestScenarios.setupSuccess();
      const mockService = mockSync.mockDatabaseService();

      // Initialize with a mock client
      mockService.client = mockSync.createSynchronizedMock();
      mockService.initialized = true;

      mockService.close();

      expect(mockService.client).toBeNull();
      expect(mockService.initialized).toBe(false);
      expect(mockService.initializationPromise).toBeNull();
    });

    it("should handle test connection correctly", async () => {
      DatabaseTestScenarios.setupSuccess();
      mockSync.setBehavior("success");

      const mockService = mockSync.mockDatabaseService();
      const result = await mockService.testConnection();

      expect(result).toBe(true);
    });

    it("should handle health check correctly", async () => {
      DatabaseTestScenarios.setupSuccess();
      mockSync.setBehavior("success");

      const mockService = mockSync.mockDatabaseService();
      const health = await mockService.healthCheck();

      expect(health.status).toBe("healthy");
      expect(health.timestamp).toBeDefined();
    });

    it("should handle health check failure", async () => {
      DatabaseTestScenarios.setupMissingUrl();

      const mockService = mockSync.mockDatabaseService();
      const health = await mockService.healthCheck();

      expect(health.status).toBe("unhealthy");
      expect(health.error).toBeDefined();
      expect(health.timestamp).toBeDefined();
    });
  });

  describe("Helper Functions", () => {
    it("should provide withSynchronizedMock helper", () => {
      const result = withSynchronizedMock("success", (mock, sync) => {
        expect(mock).toBeDefined();
        expect(sync).toBeInstanceOf(DatabaseMockSync);
        expect(sync.mockBehavior).toBe("success");
        return "test-result";
      });

      expect(result).toBe("test-result");
    });

    it("should provide withMockDatabaseService helper", () => {
      DatabaseTestScenarios.setupSuccess();

      const result = withMockDatabaseService("success", (service, sync) => {
        expect(service).toBeDefined();
        expect(service.ensureInitialized).toBeDefined();
        expect(sync).toBeInstanceOf(DatabaseMockSync);
        return "service-result";
      });

      expect(result).toBe("service-result");
    });

    it("should cleanup after helper functions", () => {
      let syncInstance;

      withSynchronizedMock("success", (mock, sync) => {
        syncInstance = sync;
        expect(sync.mockBehavior).toBe("success");
      });

      // After helper completes, mock should be reset
      expect(syncInstance.mockClient).toBeNull();
      expect(syncInstance.mockBehavior).toBe("success"); // Reset sets to success
    });
  });

  describe("Test Scenarios", () => {
    it("should setup success scenario correctly", () => {
      DatabaseTestScenarios.setupSuccess();

      expect(process.env.TURSO_DATABASE_URL).toBe(
        "libsql://test-database.turso.io",
      );
      expect(process.env.TURSO_AUTH_TOKEN).toBe("test-auth-token");
    });

    it("should setup missing URL scenario correctly", () => {
      DatabaseTestScenarios.setupMissingUrl();

      expect(process.env.TURSO_DATABASE_URL).toBeUndefined();
      expect(process.env.TURSO_AUTH_TOKEN).toBeUndefined();
    });

    it("should setup invalid URL scenario correctly", () => {
      DatabaseTestScenarios.setupInvalidUrl();

      expect(process.env.TURSO_DATABASE_URL).toBe("invalid-url-format");
      expect(process.env.TURSO_AUTH_TOKEN).toBe("test-auth-token");
    });

    it("should cleanup scenarios correctly", () => {
      DatabaseTestScenarios.setupSuccess();
      expect(process.env.TURSO_DATABASE_URL).toBeDefined();

      DatabaseTestScenarios.cleanup();
      expect(process.env.TURSO_DATABASE_URL).toBeUndefined();
      expect(process.env.TURSO_AUTH_TOKEN).toBeUndefined();
    });
  });

  describe("Singleton Export", () => {
    it("should provide singleton instance", () => {
      expect(dbMockSync).toBeInstanceOf(DatabaseMockSync);
    });

    it("should maintain state across calls", () => {
      dbMockSync.setBehavior("connection-error");
      expect(dbMockSync.mockBehavior).toBe("connection-error");

      // Reset for other tests
      dbMockSync.reset();
      expect(dbMockSync.mockBehavior).toBe("success");
    });
  });

  describe("Error Handling Scenarios", () => {
    it("should handle authentication errors", async () => {
      DatabaseTestScenarios.setupAuthError();
      mockSync.setBehavior("auth-error");

      const mockService = mockSync.mockDatabaseService();

      await expect(mockService.ensureInitialized()).rejects.toThrow(
        "Failed to initialize database client due to configuration error",
      );
    });

    it("should handle timeout errors", async () => {
      DatabaseTestScenarios.setupSuccess();
      mockSync.setBehavior("timeout-error");

      const mockService = mockSync.mockDatabaseService();

      await expect(mockService.ensureInitialized()).rejects.toThrow(
        "Failed to initialize database client due to configuration error",
      );
    });

    it("should handle invalid URL format errors", async () => {
      DatabaseTestScenarios.setupInvalidUrl();
      mockSync.setBehavior("invalid-url-format");

      const mockService = mockSync.mockDatabaseService();

      await expect(mockService.ensureInitialized()).rejects.toThrow(
        "Failed to initialize database client due to configuration error",
      );
    });
  });
});
