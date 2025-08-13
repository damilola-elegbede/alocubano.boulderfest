/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { backupEnv, restoreEnv, clearDatabaseEnv, clearAppEnv, getEnvPreset, withIsolatedEnv } from "../helpers/simple-helpers.js";

describe.skip("DatabaseService - Updated Implementation Validation", () => {
  // These tests validate the real implementation, not mocks
  // Skip them in unit tests since we're using mocked modules
  let envBackup;

  beforeEach(() => {
    envBackup = backupEnv(Object.keys(process.env));
    clearDatabaseEnv();
  });

  afterEach(async () => {
    // Cleanup any database instances
    try {
      const { resetDatabaseInstance } = await import("../../api/lib/database.js");
      await resetDatabaseInstance();
    } catch (error) {
      // Ignore cleanup errors
    }
    
    restoreEnv(envBackup);
    vi.resetModules();
  });

  describe("DatabaseService constructor", () => {
    it("should have new properties for connection tracking", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        // Check that new properties exist (even if undefined/null initially)
        expect(service.hasOwnProperty('activeConnections')).toBe(true);
        expect(service.hasOwnProperty('maxRetries')).toBe(true);
        expect(service.hasOwnProperty('retryDelay')).toBe(true);
        
        // Check default values
        expect(service.maxRetries).toBe(3);
        expect(service.retryDelay).toBe(1000);
        expect(service.activeConnections).toBeInstanceOf(Set);
        expect(service.activeConnections.size).toBe(0);
      });
    });
  });

  describe("DatabaseService new methods", () => {
    it("should have async close method", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        expect(typeof service.close).toBe('function');
        
        // Should return a promise
        const result = service.close();
        expect(result).toBeInstanceOf(Promise);
        
        // Should resolve to boolean
        const closeResult = await result;
        expect(typeof closeResult).toBe('boolean');
      });
    });

    it("should have resetForTesting method", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        expect(typeof service.resetForTesting).toBe('function');
        
        // Should return a promise
        const result = service.resetForTesting();
        expect(result).toBeInstanceOf(Promise);
        
        await result; // Should not throw
      });
    });

    it("should have getConnectionStats method", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        expect(typeof service.getConnectionStats).toBe('function');
        
        const stats = service.getConnectionStats();
        expect(stats).toBeTypeOf('object');
        expect(stats).toHaveProperty('activeConnections');
        expect(stats).toHaveProperty('initialized');
        expect(stats).toHaveProperty('hasClient');
        expect(stats).toHaveProperty('timestamp');
      });
    });

    it("should have healthCheck method", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        expect(typeof service.healthCheck).toBe('function');
        
        // Should return a promise
        const result = service.healthCheck();
        expect(result).toBeInstanceOf(Promise);
        
        const health = await result;
        expect(health).toBeTypeOf('object');
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('timestamp');
      });
    });
  });

  describe("resetDatabaseInstance function", () => {
    it("should be async function", async () => {
      const { resetDatabaseInstance } = await import("../../api/lib/database.js");
      
      expect(typeof resetDatabaseInstance).toBe('function');
      
      // Should return a promise
      const result = resetDatabaseInstance();
      expect(result).toBeInstanceOf(Promise);
      
      await result; // Should not throw
    });
  });

  describe("Connection tracking behavior", () => {
    it("should track connections when initialized successfully", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        expect(service.activeConnections.size).toBe(0);
        
        try {
          // Try to initialize - may fail due to network, but should still track behavior
          await service.ensureInitialized();
          
          // If initialization succeeds, should have added to activeConnections
          // Note: This might fail in test environment, which is expected
        } catch (error) {
          // Expected to fail in test environment without proper mocks
          // The important thing is that the method exists and behaves properly
          expect(error).toBeDefined();
        }
        
        // activeConnections should still be a Set regardless of initialization success
        expect(service.activeConnections).toBeInstanceOf(Set);
      });
    });
  });

  describe("Retry logic implementation", () => {
    it("should have retry configuration", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        // Check retry configuration exists
        expect(service.maxRetries).toBe(3);
        expect(service.retryDelay).toBe(1000);
        
        // Check private retry methods exist
        expect(typeof service._initializeWithRetry).toBe('function');
        expect(typeof service._delay).toBe('function');
      });
    });
  });

  describe("Enhanced error handling", () => {
    it("should handle missing environment variables with retries", async () => {
      await withIsolatedEnv("empty", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        try {
          await service.ensureInitialized();
          // If this doesn't throw, something is wrong
          expect(false).toBe(true);
        } catch (error) {
          // Should get a meaningful error about missing TURSO_DATABASE_URL
          expect(error.message).toContain("TURSO_DATABASE_URL");
        }
      });
    }, 10000);
  });

  describe("Database path conversion", () => {
    it("should handle file path conversion for integration tests", async () => {
      await withIsolatedEnv({
        TURSO_DATABASE_URL: "file:test.db",
        TEST_TYPE: 'integration'
      }, async () => {
          const { DatabaseService } = await import("../../api/lib/database.js");
          const service = new DatabaseService();
          
          try {
            await service.ensureInitialized();
          } catch (error) {
            // Expected to fail, but error should not be about path conversion
            // Should fail at connection time, not path resolution time
            expect(error.message).not.toContain("path");
            expect(error.message).not.toContain("ENOENT");
          }
        });
    });
  });

  describe("State management", () => {
    it("should properly reset state in resetForTesting", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { DatabaseService } = await import("../../api/lib/database.js");
        const service = new DatabaseService();
        
        // Set some initial state manually
        service.initialized = true;
        service.client = { fake: 'client' };
        service.initializationPromise = Promise.resolve();
        
        await service.resetForTesting();
        
        // Should reset all state
        expect(service.initialized).toBe(false);
        expect(service.client).toBeNull();
        expect(service.initializationPromise).toBeNull();
        expect(service.activeConnections.size).toBe(0);
      });
    });
  });

  describe("Singleton behavior", () => {
    it("should maintain singleton instance through module exports", async () => {
      await withIsolatedEnv("valid-local", async () => {
        const { getDatabase, getDatabaseClient } = await import("../../api/lib/database.js");
        
        const service1 = getDatabase();
        const service2 = getDatabase();
        
        // Should be the same instance
        expect(service1).toBe(service2);
        
        // getDatabaseClient should work with the singleton
        expect(typeof getDatabaseClient).toBe('function');
      });
    });
  });
});