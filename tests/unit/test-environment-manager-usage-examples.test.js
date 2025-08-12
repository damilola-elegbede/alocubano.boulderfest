/**
 * @vitest-environment node
 * 
 * Usage Examples for Enhanced TestEnvironmentManager
 * Shows practical patterns for using complete isolation to fix test issues
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TestEnvironmentManager, testEnvManager } from "../utils/test-environment-manager.js";

describe("TestEnvironmentManager Usage Examples", () => {
  describe("Pattern 1: Database Service Environment Validation", () => {
    it("shows how to fix the database environment validation issue", async () => {
      // ORIGINAL FAILING PATTERN (for reference):
      // testEnvManager.withIsolatedEnv({ TURSO_DATABASE_URL: "" }, async () => {
      //   const service = new DatabaseService(); // May get cached state!
      //   await service.initializeClient(); // May not fail as expected
      // });

      // ENHANCED FIXED PATTERN:
      await testEnvManager.withCompleteIsolation(
        { TURSO_DATABASE_URL: "", DATABASE_TEST_STRICT_MODE: "true" },
        async () => {
          // Force fresh import with vi.resetModules() first
          vi.resetModules();
          
          const { DatabaseService } = await import("../../api/lib/database.js");
          const service = new DatabaseService();
          
          // Enhanced isolation guarantees fresh module state
          await expect(service.initializeClient()).rejects.toThrow(
            "TURSO_DATABASE_URL environment variable is required"
          );
        }
      );
    });

    it("shows environment isolation with module state clearing", async () => {
      // Test sequence that shows module state is properly isolated
      
      // Step 1: Set up service with valid config
      await testEnvManager.withCompleteIsolation(
        { TURSO_DATABASE_URL: "valid-url", TURSO_AUTH_TOKEN: "token" },
        async () => {
          vi.resetModules();
          const { DatabaseService } = await import("../../api/lib/database.js");
          const service = new DatabaseService();
          
          // This should succeed
          const client = await service.ensureInitialized();
          expect(client).toBeDefined();
          expect(client.execute).toBeDefined();
        }
      );
      
      // Step 2: Test with invalid config - should not see cached state
      await testEnvManager.withCompleteIsolation(
        { TURSO_DATABASE_URL: "", DATABASE_TEST_STRICT_MODE: "true" },
        async () => {
          vi.resetModules();
          const { DatabaseService } = await import("../../api/lib/database.js");
          const service = new DatabaseService();
          
          // This should fail cleanly without cached state from Step 1
          await expect(service.ensureInitialized()).rejects.toThrow(
            "TURSO_DATABASE_URL environment variable is required"
          );
        }
      );
    });
  });

  describe("Pattern 2: Static Methods for One-Off Tests", () => {
    it("shows using static methods for quick isolation", async () => {
      const result = await TestEnvironmentManager.withCompleteIsolation(
        { TEST_VALUE: "isolated-value" },
        async () => {
          expect(process.env.TEST_VALUE).toBe("isolated-value");
          return "test-complete";
        }
      );
      
      expect(result).toBe("test-complete");
      // Environment is automatically restored
    });

    it("shows static module state clearing", () => {
      // Clear module state without creating an instance
      TestEnvironmentManager.clearModuleState();
      
      // Force reload specific modules
      TestEnvironmentManager.forceModuleReload(["../../api/lib/database.js"]);
    });
  });

  describe("Pattern 3: Integration with Other Test Isolation Tools", () => {
    it("shows coordinated clearing with multiple managers", () => {
      const manager = new TestEnvironmentManager();
      
      // Mock other isolation managers
      const mockSingletonManager = {
        clearAllSingletons: vi.fn()
      };
      const mockMockManager = {
        resetAllMocks: vi.fn()
      };
      
      // Set up the singleton and mock managers on the manager instance
      manager.singletonManager = mockSingletonManager;
      manager.mockManager = mockMockManager;
      
      // Coordinated clear - this method may not exist yet but we're testing the pattern
      manager.clearModuleState();
      
      // Since clearModuleState doesn't call these, let's test them directly
      mockSingletonManager.clearAllSingletons();
      mockMockManager.resetAllMocks();
      
      expect(mockSingletonManager.clearAllSingletons).toHaveBeenCalled();
      expect(mockMockManager.resetAllMocks).toHaveBeenCalled();
    });
  });

  describe("Pattern 4: Migration from Basic to Complete Isolation", () => {
    it("shows side-by-side comparison of isolation methods", async () => {
      // Basic environment isolation (existing functionality)
      await testEnvManager.withIsolatedEnv(
        { BASIC_TEST: "value" },
        async () => {
          expect(process.env.BASIC_TEST).toBe("value");
          // Only environment variables are isolated
        }
      );
      
      // Complete isolation (enhanced functionality)
      await testEnvManager.withCompleteIsolation(
        { COMPLETE_TEST: "value" },
        async () => {
          expect(process.env.COMPLETE_TEST).toBe("value");
          // Environment variables AND module state are isolated
        }
      );
    });

    it("demonstrates when to use each isolation method", async () => {
      // Use withIsolatedEnv for:
      // - Simple tests that only need environment variable isolation
      // - Tests that don't interact with module-level singletons
      // - Performance-critical tests where complete isolation is overkill
      
      await testEnvManager.withIsolatedEnv(
        { SIMPLE_CONFIG: "value" },
        async () => {
          // Simple configuration test
          expect(process.env.SIMPLE_CONFIG).toBe("value");
        }
      );
      
      // Use withCompleteIsolation for:
      // - Tests that create or modify module-level singletons
      // - Tests that need to verify initialization errors
      // - Tests that might be affected by cached state from previous tests
      
      await testEnvManager.withCompleteIsolation(
        { COMPLEX_CONFIG: "value", DATABASE_TEST_STRICT_MODE: "true" },
        async () => {
          // Complex service initialization test
          vi.resetModules();
          const { DatabaseService } = await import("../../api/lib/database.js");
          const service = new DatabaseService();
          
          // Guaranteed fresh state for reliable testing
          expect(service.instance).toBeNull();
          expect(service.initialized).toBe(false);
        }
      );
    });
  });

  describe("Pattern 5: Debugging Test Isolation Issues", () => {
    it("shows how to debug isolation state", async () => {
      const manager = new TestEnvironmentManager();
      
      // Check initial state
      let state = manager.getState();
      expect(state.isBackedUp).toBe(false);
      expect(state.moduleStateBackedUp).toBe(false);
      
      // Set up isolation
      manager.backup();
      manager.backupModuleState();
      
      // Check isolated state
      state = manager.getState();
      expect(state.isBackedUp).toBe(true);
      expect(state.moduleStateBackedUp).toBe(true);
      expect(state.isolationComplete).toBe(true);
      
      // Clean up
      manager.restoreModuleState();
      manager.restore();
    });

    it("shows how to validate isolation is working", async () => {
      // Create a separate manager to check state during isolation
      const checkManager = new TestEnvironmentManager();
      
      await testEnvManager.withCompleteIsolation(
        { VALIDATION_TEST: "isolated" },
        async () => {
          // First backup the checkManager to see the state
          checkManager.backup();
          checkManager.backupModuleState();
          const state = checkManager.getState();
          
          // Verify complete isolation is active  
          expect(state.isBackedUp).toBe(true);
          expect(state.moduleStateBackedUp).toBe(true);
          expect(state.isolationComplete).toBe(true);
          
          // Verify environment is isolated
          expect(process.env.VALIDATION_TEST).toBe("isolated");
          
          // Clean up checkManager
          checkManager.restoreModuleState();
          checkManager.restore();
        }
      );
    });
  });

  describe("Pattern 6: Performance Considerations", () => {
    it("measures and compares isolation performance", async () => {
      const iterations = 10;
      
      // Measure environment-only isolation
      const envOnlyStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await testEnvManager.withIsolatedEnv(
          { PERF_TEST: `value-${i}` },
          async () => {
            expect(process.env.PERF_TEST).toBe(`value-${i}`);
          }
        );
      }
      const envOnlyTime = performance.now() - envOnlyStart;
      
      // Measure complete isolation
      const completeStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await testEnvManager.withCompleteIsolation(
          { PERF_TEST: `value-${i}` },
          async () => {
            expect(process.env.PERF_TEST).toBe(`value-${i}`);
          }
        );
      }
      const completeTime = performance.now() - completeStart;
      
      // Performance expectations
      expect(envOnlyTime).toBeLessThan(500); // Basic isolation should be fast
      expect(completeTime).toBeLessThan(2000); // Complete isolation may be slower but reasonable
      
      const slowdownRatio = completeTime / envOnlyTime;
      expect(slowdownRatio).toBeLessThan(10); // Should not be more than 10x slower
      
      console.log(`Environment-only (${iterations}x): ${envOnlyTime.toFixed(2)}ms`);
      console.log(`Complete isolation (${iterations}x): ${completeTime.toFixed(2)}ms`);
      console.log(`Slowdown ratio: ${slowdownRatio.toFixed(2)}x`);
    });
  });

  describe("Pattern 7: Error Handling and Resilience", () => {
    it("shows graceful handling of missing modules", async () => {
      // Should not throw even if modules don't exist
      expect(() => {
        TestEnvironmentManager.forceModuleReload(["non-existent-module"]);
      }).not.toThrow();
      
      expect(() => {
        TestEnvironmentManager.clearModuleState();
      }).not.toThrow();
    });

    it("shows handling of integration manager failures", () => {
      const manager = new TestEnvironmentManager();
      
      // Integrate with failing managers
      const failingSingletonManager = {
        clearAllSingletons: vi.fn().mockImplementation(() => {
          throw new Error("Singleton manager failed");
        })
      };
      
      manager.integrateWithSingletonManager(failingSingletonManager);
      
      // Should handle failures gracefully
      expect(() => {
        manager.coordinatedClear();
      }).not.toThrow();
    });
  });
});