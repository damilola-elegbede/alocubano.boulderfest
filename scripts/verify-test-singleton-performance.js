#!/usr/bin/env node
/**
 * Performance verification script for TestSingletonManager
 * Verifies that operations meet the <5ms target
 */

// Mock vitest functions for standalone testing
const vi = {
  clearAllMocks: () => {},
  resetModules: () => {},
};

// Global for performance API
global.performance = {
  now: () => Date.now(),
};

global.vi = vi;

// Mock singleton for testing
const mockSingleton = {
  resetForTesting: () => {},
  client: { close: () => {} },
  initialized: true,
  initializationPromise: null,
};

async function runPerformanceTest() {
  console.log("🚀 TestSingletonManager Performance Verification");
  console.log("Target: All operations should complete in <5ms\n");

  try {
    // Import the TestSingletonManager
    const { TestSingletonManager } = await import(
      "../tests/utils/test-singleton-manager.js"
    );

    const results = [];

    // Test 1: resetSingleton performance
    console.time("resetSingleton");
    const start1 = performance.now();
    TestSingletonManager.resetSingleton(mockSingleton);
    const end1 = performance.now();
    console.timeEnd("resetSingleton");
    results.push({ operation: "resetSingleton", duration: end1 - start1 });

    // Test 2: registerSingleton + clearAllState performance
    console.time("clearAllState");
    const start2 = performance.now();
    TestSingletonManager.registerSingleton("perf-test", mockSingleton);
    TestSingletonManager.clearAllState();
    const end2 = performance.now();
    console.timeEnd("clearAllState");
    results.push({ operation: "clearAllState", duration: end2 - start2 });

    // Test 3: forceRecreation performance
    console.time("forceRecreation");
    const start3 = performance.now();
    await TestSingletonManager.forceRecreation("test-module");
    const end3 = performance.now();
    console.timeEnd("forceRecreation");
    results.push({ operation: "forceRecreation", duration: end3 - start3 });

    // Test 4: validateCleanState performance
    console.time("validateCleanState");
    const start4 = performance.now();
    TestSingletonManager.validateCleanState();
    const end4 = performance.now();
    console.timeEnd("validateCleanState");
    results.push({ operation: "validateCleanState", duration: end4 - start4 });

    // Test 5: resetDatabaseSingleton performance
    console.time("resetDatabaseSingleton");
    const start5 = performance.now();
    TestSingletonManager.resetDatabaseSingleton(mockSingleton);
    const end5 = performance.now();
    console.timeEnd("resetDatabaseSingleton");
    results.push({
      operation: "resetDatabaseSingleton",
      duration: end5 - start5,
    });

    // Test 6: Lifecycle hooks performance
    console.time("lifecycle-hooks");
    const start6 = performance.now();
    TestSingletonManager.beforeEach();
    TestSingletonManager.afterEach();
    const end6 = performance.now();
    console.timeEnd("lifecycle-hooks");
    results.push({ operation: "lifecycle-hooks", duration: end6 - start6 });

    console.log("\n📊 Performance Results:");
    console.log("========================");

    let allPassed = true;
    const threshold = 5; // 5ms threshold

    results.forEach(({ operation, duration }) => {
      const passed = duration < threshold;
      const status = passed ? "✅" : "❌";
      const formattedDuration = duration.toFixed(3);

      console.log(`${status} ${operation.padEnd(25)} ${formattedDuration}ms`);

      if (!passed) {
        allPassed = false;
      }
    });

    // Get internal performance stats if available
    const debugInfo = TestSingletonManager.getDebugInfo();
    if (debugInfo.performanceStats) {
      console.log("\n📈 Internal Performance Stats:");
      console.log("==============================");
      const stats = debugInfo.performanceStats;
      console.log(`Average Duration: ${stats.averageDuration.toFixed(3)}ms`);
      console.log(`Max Duration: ${stats.maxDuration.toFixed(3)}ms`);
      console.log(`Min Duration: ${stats.minDuration.toFixed(3)}ms`);
      console.log(`Total Operations: ${stats.totalOperations}`);
    }

    console.log("\n🎯 Performance Summary:");
    console.log("=======================");

    if (allPassed) {
      console.log("✅ ALL OPERATIONS MEET <5ms TARGET");
      console.log("🚀 TestSingletonManager is production-ready!");
    } else {
      console.log("❌ SOME OPERATIONS EXCEED 5ms TARGET");
      console.log("⚠️  Consider optimization for production use.");
    }

    // Memory usage check
    if (typeof process !== "undefined" && process.memoryUsage) {
      const memory = process.memoryUsage();
      console.log("\n💾 Memory Usage:");
      console.log(
        `Heap Used: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      );
      console.log(
        `Heap Total: ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      );
    }

    return allPassed;
  } catch (error) {
    console.error("❌ Performance test failed:", error.message);
    return false;
  }
}

// Run the test
runPerformanceTest()
  .then((passed) => {
    process.exit(passed ? 0 : 1);
  })
  .catch((error) => {
    console.error("Performance test crashed:", error);
    process.exit(1);
  });
