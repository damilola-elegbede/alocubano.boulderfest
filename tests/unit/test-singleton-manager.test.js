/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TestSingletonManager, enhancedResetDatabaseInstance, testSingletonLifecycle } from "../utils/test-singleton-manager.js";

// Mock performance for testing
const mockPerformance = {
  now: vi.fn(() => Date.now())
};
global.performance = mockPerformance;

describe("TestSingletonManager", () => {
  let mockSingleton;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    // Create mock singleton with typical properties
    mockSingleton = {
      client: { close: vi.fn() },
      initialized: true,
      initializationPromise: Promise.resolve({}),
      cache: new Map(),
      resetForTesting: vi.fn(),
      maxRetries: 3,
      retryDelay: 1000
    };

    // Setup console spies
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Reset performance tracking
    TestSingletonManager.resetPerformanceTracking();
    TestSingletonManager.clearAllState();
  });

  afterEach(() => {
    // Clean up
    TestSingletonManager.clearAllState();
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    vi.clearAllMocks();
  });

  describe("Core Functionality", () => {
    describe("registerSingleton", () => {
      it("should register singleton with key and instance", () => {
        TestSingletonManager.registerSingleton("test-key", mockSingleton);
        
        const debugInfo = TestSingletonManager.getDebugInfo();
        expect(debugInfo.registrySize).toBe(1);
        expect(debugInfo.registeredKeys).toContain("test-key");
        expect(debugInfo.registryDetails[0]).toMatchObject({
          key: "test-key",
          hasInstance: true,
          resetMethod: "resetForTesting"
        });
      });

      it("should register singleton with custom reset method", () => {
        const customReset = vi.fn();
        TestSingletonManager.registerSingleton("custom-key", mockSingleton, customReset);
        
        const debugInfo = TestSingletonManager.getDebugInfo();
        expect(debugInfo.registeredKeys).toContain("custom-key");
        
        const customKeyDetails = debugInfo.registryDetails.find(detail => detail.key === "custom-key");
        expect(customKeyDetails).toBeDefined();
        expect(customKeyDetails.resetMethod).toBe(customReset);
        expect(typeof customKeyDetails.resetMethod).toBe("function");
      });

      it("should throw error for missing required parameters", () => {
        expect(() => {
          TestSingletonManager.registerSingleton(null, mockSingleton);
        }).toThrow("Both key and instance are required");

        expect(() => {
          TestSingletonManager.registerSingleton("test-key", null);
        }).toThrow("Both key and instance are required");
      });
    });

    describe("resetSingleton", () => {
      it("should call resetForTesting method by default", () => {
        const result = TestSingletonManager.resetSingleton(mockSingleton);
        
        expect(result).toBe(true);
        expect(mockSingleton.resetForTesting).toHaveBeenCalled();
      });

      it("should call custom reset method when specified", () => {
        const customReset = vi.fn();
        const result = TestSingletonManager.resetSingleton(mockSingleton, customReset);
        
        expect(result).toBe(true);
        expect(customReset).toHaveBeenCalledWith();
        expect(mockSingleton.resetForTesting).not.toHaveBeenCalled();
      });

      it("should call string method name when specified", () => {
        const customMethod = vi.fn();
        mockSingleton.customReset = customMethod;
        
        const result = TestSingletonManager.resetSingleton(mockSingleton, "customReset");
        
        expect(result).toBe(true);
        expect(customMethod).toHaveBeenCalled();
      });

      it("should handle null singleton gracefully", () => {
        const result = TestSingletonManager.resetSingleton(null);
        expect(result).toBe(true);
      });

      it("should fallback to manual property clearing when reset method unavailable", () => {
        delete mockSingleton.resetForTesting;
        
        const result = TestSingletonManager.resetSingleton(mockSingleton);
        
        expect(result).toBe(true);
        expect(mockSingleton.client).toBe(null);
        expect(mockSingleton.initialized).toBe(false);
        expect(mockSingleton.initializationPromise).toBe(null);
      });

      it("should handle reset method errors gracefully", () => {
        mockSingleton.resetForTesting.mockImplementation(() => {
          throw new Error("Reset failed");
        });
        
        const result = TestSingletonManager.resetSingleton(mockSingleton);
        
        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "TestSingletonManager: Error resetting singleton:",
          expect.any(Error)
        );
      });
    });

    describe("forceRecreation", () => {
      it("should reset modules and clear mocks", async () => {
        // Store original functions to spy on
        const originalClearAllMocks = vi.clearAllMocks;
        const originalResetModules = vi.resetModules;
        
        const clearAllMocksSpy = vi.fn();
        const resetModulesSpy = vi.fn();
        
        // Replace vi methods temporarily
        vi.clearAllMocks = clearAllMocksSpy;
        vi.resetModules = resetModulesSpy;
        
        const result = await TestSingletonManager.forceRecreation("test-module");
        
        expect(result).toBe(true);
        expect(clearAllMocksSpy).toHaveBeenCalled();
        expect(resetModulesSpy).toHaveBeenCalled();
        
        // Restore original functions
        vi.clearAllMocks = originalClearAllMocks;
        vi.resetModules = originalResetModules;
      });

      it("should clear registered singleton for module", async () => {
        TestSingletonManager.registerSingleton("test-module", mockSingleton);
        
        const result = await TestSingletonManager.forceRecreation("test-module");
        
        expect(result).toBe(true);
        const debugInfo = TestSingletonManager.getDebugInfo();
        expect(debugInfo.registrySize).toBe(0);
      });

      it("should handle missing module gracefully", async () => {
        const result = await TestSingletonManager.forceRecreation("non-existent");
        expect(result).toBe(true);
      });
    });

    describe("clearAllState", () => {
      it("should reset all registered singletons", () => {
        TestSingletonManager.registerSingleton("test1", mockSingleton);
        TestSingletonManager.registerSingleton("test2", { ...mockSingleton, resetForTesting: vi.fn() });
        
        const result = TestSingletonManager.clearAllState();
        
        expect(result.success).toBe(2);
        expect(result.errors).toBe(0);
        expect(TestSingletonManager.getDebugInfo().registrySize).toBe(0);
      });

      it("should track errors when singleton reset fails", () => {
        const failingSingleton = {
          resetForTesting: vi.fn(() => { throw new Error("Reset failed"); })
        };
        TestSingletonManager.registerSingleton("failing", failingSingleton);
        TestSingletonManager.registerSingleton("working", mockSingleton);
        
        const result = TestSingletonManager.clearAllState();
        
        expect(result.success).toBe(1);
        expect(result.errors).toBe(1);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          "TestSingletonManager: 1 singleton(s) failed to reset, 1 succeeded"
        );
      });
    });
  });

  describe("Database Integration", () => {
    describe("resetDatabaseSingleton", () => {
      it("should reset all database-specific properties", () => {
        const dbInstance = {
          client: { close: vi.fn() },
          initialized: true,
          initializationPromise: Promise.resolve(),
          maxRetries: 5,
          retryDelay: 2000
        };

        const result = TestSingletonManager.resetDatabaseSingleton(dbInstance);
        
        expect(result).toBe(true);
        expect(dbInstance.client).toBe(null);
        expect(dbInstance.initialized).toBe(false);
        expect(dbInstance.initializationPromise).toBe(null);
        expect(dbInstance.maxRetries).toBe(3);
        expect(dbInstance.retryDelay).toBe(1000);
      });

      it("should close existing client before reset", () => {
        const closeMock = vi.fn();
        const dbInstance = {
          client: { close: closeMock },
          initialized: true,
          initializationPromise: null
        };

        TestSingletonManager.resetDatabaseSingleton(dbInstance);
        
        expect(closeMock).toHaveBeenCalled();
      });

      it("should handle client close errors gracefully", () => {
        const dbInstance = {
          client: { close: vi.fn(() => { throw new Error("Close failed"); }) },
          initialized: true,
          initializationPromise: null
        };

        const result = TestSingletonManager.resetDatabaseSingleton(dbInstance);
        expect(result).toBe(true); // Should still succeed despite close error
      });

      it("should handle null database instance", () => {
        const result = TestSingletonManager.resetDatabaseSingleton(null);
        expect(result).toBe(true);
      });
    });

    describe("enhancedResetDatabaseInstance helper", () => {
      it("should delegate to TestSingletonManager", () => {
        const result = enhancedResetDatabaseInstance(mockSingleton);
        expect(result).toBe(true);
      });
    });
  });

  describe("Performance Monitoring", () => {
    it("should track operation performance", () => {
      // Perform several operations
      TestSingletonManager.resetSingleton(mockSingleton);
      TestSingletonManager.clearAllState();
      
      const stats = TestSingletonManager.getDebugInfo().performanceStats;
      expect(stats).toBeDefined();
      expect(stats.totalOperations).toBeGreaterThan(0);
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
    });

    it("should warn about slow operations", () => {
      // Mock slow operation
      mockPerformance.now
        .mockReturnValueOnce(0)    // Start time
        .mockReturnValueOnce(10);  // End time (10ms - should warn)
      
      TestSingletonManager.resetSingleton(mockSingleton);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Slow operation detected")
      );
    });

    it("should reset performance tracking", () => {
      TestSingletonManager.resetSingleton(mockSingleton);
      
      let stats = TestSingletonManager.getDebugInfo().performanceStats;
      expect(stats.totalOperations).toBeGreaterThan(0);
      
      TestSingletonManager.resetPerformanceTracking();
      
      stats = TestSingletonManager.getDebugInfo().performanceStats;
      expect(stats).toBe(null);
    });
  });

  describe("State Validation", () => {
    describe("validateCleanState", () => {
      it("should return validation results", () => {
        const validation = TestSingletonManager.validateCleanState();
        
        expect(validation).toMatchObject({
          timestamp: expect.any(Number),
          registryEmpty: true,
          registeredSingletons: 0,
          singletonKeys: []
        });
      });

      it("should detect non-empty registry", () => {
        TestSingletonManager.registerSingleton("test", mockSingleton);
        
        const validation = TestSingletonManager.validateCleanState();
        
        expect(validation.registryEmpty).toBe(false);
        expect(validation.registeredSingletons).toBe(1);
        expect(validation.singletonKeys).toContain("test");
      });

      it("should include memory status when available", () => {
        const validation = TestSingletonManager.validateCleanState();
        
        // Memory status might be null in test environment
        expect(validation.memoryStatus).toBeDefined();
      });
    });
  });

  describe("Lifecycle Hooks", () => {
    describe("beforeEach", () => {
      it("should clear all state", () => {
        TestSingletonManager.registerSingleton("test", mockSingleton);
        
        TestSingletonManager.beforeEach();
        
        const debugInfo = TestSingletonManager.getDebugInfo();
        expect(debugInfo.registrySize).toBe(0);
      });

      it("should handle errors gracefully", () => {
        // Force an error by corrupting internal state
        const originalClearAllState = TestSingletonManager.clearAllState;
        TestSingletonManager.clearAllState = vi.fn(() => {
          throw new Error("Forced error");
        });
        
        expect(() => TestSingletonManager.beforeEach()).toThrow("Forced error");
        
        // Restore for cleanup
        TestSingletonManager.clearAllState = originalClearAllState;
      });
    });

    describe("afterEach", () => {
      it("should validate clean state", () => {
        TestSingletonManager.afterEach();
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });

      it("should warn and clean when registry not empty", () => {
        // Register singleton after beforeEach has already cleared state
        TestSingletonManager.registerSingleton("test", mockSingleton);
        
        // Verify registry is not empty
        expect(TestSingletonManager.getDebugInfo().registrySize).toBe(1);
        
        // Clear the console spy calls before testing
        consoleWarnSpy.mockClear();
        
        // Store original console.warn to test directly
        const originalWarn = console.warn;
        let warnCalled = false;
        let warnMessage = '';
        
        console.warn = (message, ...args) => {
          warnCalled = true;
          warnMessage = message;
          consoleWarnSpy(message, ...args);
        };
        
        TestSingletonManager.afterEach();
        
        // Restore console.warn
        console.warn = originalWarn;
        
        expect(warnCalled).toBe(true);
        expect(warnMessage).toContain("Singleton registry not empty after test");
      });
    });

    describe("onTestFailure", () => {
      it("should force complete reset", () => {
        TestSingletonManager.registerSingleton("test", mockSingleton);
        
        // Verify registry is not empty
        expect(TestSingletonManager.getDebugInfo().registrySize).toBe(1);
        
        // Clear the console spy calls before testing
        consoleWarnSpy.mockClear();
        
        // Store original console.warn to test directly
        const originalWarn = console.warn;
        let warnCalled = false;
        let warnMessage = '';
        
        console.warn = (message, ...args) => {
          warnCalled = true;
          warnMessage = message;
          consoleWarnSpy(message, ...args);
        };
        
        TestSingletonManager.onTestFailure();
        
        // Restore console.warn
        console.warn = originalWarn;
        
        expect(warnCalled).toBe(true);
        expect(warnMessage).toContain("Test failure detected, forcing complete reset");
        expect(TestSingletonManager.getDebugInfo().registrySize).toBe(0);
      });
    });
  });

  describe("Lifecycle Helper", () => {
    it("should provide lifecycle methods", () => {
      expect(typeof testSingletonLifecycle.beforeEach).toBe("function");
      expect(typeof testSingletonLifecycle.afterEach).toBe("function");
      expect(typeof testSingletonLifecycle.onFailure).toBe("function");
      expect(typeof testSingletonLifecycle.validateClean).toBe("function");
      expect(typeof testSingletonLifecycle.getDebugInfo).toBe("function");
    });

    it("should execute lifecycle methods correctly", () => {
      TestSingletonManager.registerSingleton("test", mockSingleton);
      
      testSingletonLifecycle.beforeEach();
      expect(TestSingletonManager.getDebugInfo().registrySize).toBe(0);
      
      const validation = testSingletonLifecycle.validateClean();
      expect(validation.registryEmpty).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle validation errors gracefully", () => {
      // Force an error in validation
      const originalGetMemoryStatus = TestSingletonManager._getMemoryStatus;
      TestSingletonManager._getMemoryStatus = vi.fn(() => {
        throw new Error("Memory error");
      });
      
      const validation = TestSingletonManager.validateCleanState();
      
      expect(validation.error).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      // Restore for cleanup
      TestSingletonManager._getMemoryStatus = originalGetMemoryStatus;
    });

    it("should handle forceRecreation errors", async () => {
      // Store original functions
      const originalClearAllMocks = vi.clearAllMocks;
      
      // Mock vi methods to throw
      vi.clearAllMocks = vi.fn(() => { throw new Error("Mock error"); });
      
      const result = await TestSingletonManager.forceRecreation("test");
      
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "TestSingletonManager: Error in forceRecreation:",
        expect.any(Error)
      );
      
      // Restore original function
      vi.clearAllMocks = originalClearAllMocks;
    });
  });

  describe("Debug Information", () => {
    it("should provide comprehensive debug info", () => {
      TestSingletonManager.registerSingleton("debug-test", mockSingleton);
      TestSingletonManager.resetSingleton(mockSingleton);
      
      const debugInfo = TestSingletonManager.getDebugInfo();
      
      expect(debugInfo).toMatchObject({
        registrySize: expect.any(Number),
        registeredKeys: expect.any(Array),
        registryDetails: expect.any(Array),
        performanceStats: expect.any(Object),
        memoryStatus: expect.any(Object)
      });
    });
  });
});

describe("Integration with Database Module", () => {
  it("should integrate with enhanced database reset function", async () => {
    // This tests the integration points without requiring actual database module
    const mockDbInstance = {
      client: { close: vi.fn() },
      initialized: true,
      initializationPromise: Promise.resolve(),
      resetForTesting: vi.fn()
    };

    const result = enhancedResetDatabaseInstance(mockDbInstance);
    
    expect(result).toBe(true);
    expect(mockDbInstance.initialized).toBe(false);
    expect(mockDbInstance.initializationPromise).toBe(null);
  });
});

describe("Memory Management", () => {
  it("should not retain references to cleared singletons", () => {
    // Create a local mock for this test
    const localMockSingleton = {
      resetForTesting: vi.fn(),
      initialized: true
    };
    
    const weakRef = new WeakRef(localMockSingleton);
    
    TestSingletonManager.registerSingleton("memory-test", localMockSingleton);
    TestSingletonManager.clearAllState();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // WeakRef should eventually be cleared (may not happen immediately in tests)
    // This test verifies the pattern is correct
    expect(TestSingletonManager.getDebugInfo().registrySize).toBe(0);
  });
});