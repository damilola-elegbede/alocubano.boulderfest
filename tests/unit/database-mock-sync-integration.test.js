/**
 * Database Mock Sync Integration Test
 * Demonstrates the mock synchronization layer working with actual service code
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DatabaseMockSync,
  DatabaseTestScenarios,
  withMockDatabaseService,
} from "../utils/database-mock-sync.js";

describe("Database Mock Sync Integration", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NODE_ENV = "test";
    process.env.VITEST = "true";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("Service Integration Patterns", () => {
    it("should properly mock database initialization in service code", async () => {
      await withMockDatabaseService("success", async (mockService) => {
        DatabaseTestScenarios.setupSuccess();

        // Simulate service code that uses database
        const client = await mockService.ensureInitialized();
        expect(client).toBeDefined();
        expect(mockService.initialized).toBe(true);

        // Execute a query like service would
        const result = await mockService.execute(
          "INSERT INTO test VALUES (?)",
          ["test-value"],
        );
        expect(result).toEqual({
          rows: [],
          rowsAffected: 0,
          columns: [],
          columnTypes: [],
        });
      });
    });

    it("should handle service initialization failures correctly", async () => {
      await withMockDatabaseService("missing-url", async (mockService) => {
        DatabaseTestScenarios.setupMissingUrl();

        // Service code should receive proper error
        await expect(mockService.ensureInitialized()).rejects.toThrow(
          "TURSO_DATABASE_URL environment variable is required",
        );

        // Service should remain uninitialized
        expect(mockService.initialized).toBe(false);
        expect(mockService.client).toBeNull();
      });
    });

    it("should simulate transaction-like operations", async () => {
      await withMockDatabaseService("success", async (mockService) => {
        DatabaseTestScenarios.setupSuccess();

        const client = await mockService.ensureInitialized();

        // Simulate transaction operations
        const statements = [
          { sql: "BEGIN TRANSACTION", args: [] },
          {
            sql: "INSERT INTO subscriptions (email) VALUES (?)",
            args: ["test@example.com"],
          },
          {
            sql: "UPDATE lists SET subscriber_count = subscriber_count + 1",
            args: [],
          },
          { sql: "COMMIT", args: [] },
        ];

        const results = await mockService.batch(statements);
        expect(results).toHaveLength(4);

        // Each result should follow LibSQL format
        results.forEach((result) => {
          expect(result).toEqual({
            rows: [],
            rowsAffected: 0,
            columns: [],
            columnTypes: [],
          });
        });
      });
    });

    it("should handle connection recovery scenarios", async () => {
      const mockSync = new DatabaseMockSync();

      try {
        // Start with connection error
        mockSync.setBehavior("connection-error");
        const mockService = mockSync.mockDatabaseService();
        DatabaseTestScenarios.setupSuccess();

        // First attempt should fail
        await expect(mockService.ensureInitialized()).rejects.toThrow(
          "Failed to initialize database client due to configuration error",
        );

        // Verify failed state
        expect(mockService.initialized).toBe(false);
        expect(mockService.initializationPromise).toBeNull(); // Should be cleared after failure

        // Fix the connection by resetting the mock behavior
        mockSync.setBehavior("success");

        // Reset the service state to allow retry
        mockService.client = null;
        mockService.initialized = false;
        mockService.initializationPromise = null;

        // Service should be able to retry and succeed
        const client = await mockService.ensureInitialized();
        expect(client).toBeDefined();
        expect(mockService.initialized).toBe(true);
      } finally {
        mockSync.reset();
      }
    });

    it("should maintain consistent behavior across multiple operations", async () => {
      await withMockDatabaseService("success", async (mockService) => {
        DatabaseTestScenarios.setupSuccess();

        // Initialize once
        const client1 = await mockService.ensureInitialized();

        // Multiple calls should return same client (singleton behavior)
        const client2 = await mockService.getClient();
        const client3 = await mockService.ensureInitialized();

        expect(client1).toBe(client2);
        expect(client2).toBe(client3);
        expect(mockService.initialized).toBe(true);

        // All operations should work with same client
        await mockService.execute("SELECT * FROM users");
        await mockService.batch([{ sql: "SELECT 1", args: [] }]);

        const health = await mockService.healthCheck();
        expect(health.status).toBe("healthy");
      });
    });
  });

  describe("Error Scenario Integration", () => {
    it("should properly simulate auth failures in service context", async () => {
      await withMockDatabaseService("auth-error", async (mockService) => {
        DatabaseTestScenarios.setupAuthError();

        // Service initialization should fail with auth error
        await expect(mockService.ensureInitialized()).rejects.toThrow(
          "Failed to initialize database client due to configuration error",
        );

        // Service should remain uninitialized
        expect(mockService.initialized).toBe(false);
        expect(mockService.client).toBeNull();
      });
    });

    it("should handle timeout scenarios in async service operations", async () => {
      await withMockDatabaseService("timeout-error", async (mockService) => {
        DatabaseTestScenarios.setupSuccess();

        // Service should timeout during initialization
        await expect(mockService.ensureInitialized()).rejects.toThrow(
          "Failed to initialize database client due to configuration error",
        );

        // Service should handle cleanup properly
        expect(mockService.client).toBeNull();
        expect(mockService.initialized).toBe(false);
        expect(mockService.initializationPromise).toBeNull();
      });
    });

    it("should simulate connection loss during operations", async () => {
      const mockSync = new DatabaseMockSync();

      try {
        mockSync.setBehavior("success");
        const mockService = mockSync.mockDatabaseService();
        DatabaseTestScenarios.setupSuccess();

        // Initialize successfully
        await mockService.ensureInitialized();
        expect(mockService.initialized).toBe(true);

        // Simulate connection loss
        mockSync.setBehavior("connection-error");

        // Operations should fail
        await expect(mockService.execute("SELECT 1")).rejects.toThrow(
          "Failed to connect to database",
        );

        // Service should handle the error gracefully
        const health = await mockService.healthCheck();
        expect(health.status).toBe("unhealthy");
      } finally {
        mockSync.reset();
      }
    });
  });

  describe("Performance and Memory Patterns", () => {
    it("should not leak promises or clients", async () => {
      await withMockDatabaseService("success", async (mockService) => {
        DatabaseTestScenarios.setupSuccess();

        // Multiple rapid initialization calls
        const promises = Array.from({ length: 10 }, () =>
          mockService.ensureInitialized(),
        );
        const clients = await Promise.all(promises);

        // All should return the same client instance
        const uniqueClients = new Set(clients);
        expect(uniqueClients.size).toBe(1);

        // Only one initialization promise should have been created
        expect(mockService.initializationPromise).not.toBeNull();
      });
    });

    it("should properly cleanup resources", async () => {
      await withMockDatabaseService("success", async (mockService) => {
        DatabaseTestScenarios.setupSuccess();

        // Initialize and use
        await mockService.ensureInitialized();
        await mockService.execute("SELECT 1");

        // Close should clean up properly
        mockService.close();

        expect(mockService.client).toBeNull();
        expect(mockService.initialized).toBe(false);
        expect(mockService.initializationPromise).toBeNull();

        // Should be able to reinitialize after close
        const newClient = await mockService.ensureInitialized();
        expect(newClient).toBeDefined();
        expect(mockService.initialized).toBe(true);
      });
    });
  });
});
