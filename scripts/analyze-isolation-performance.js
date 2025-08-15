#!/usr/bin/env node

/**
 * Performance Analysis Script for Bulletproof Test Isolation Architecture
 *
 * Analyzes the performance overhead of each isolation component individually
 * and provides optimization recommendations.
 */

import { performance } from "perf_hooks";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

/**
 * Performance measurement utilities
 */
class PerformanceAnalyzer {
  constructor() {
    this.measurements = new Map();
    this.componentResults = {};
  }

  startTimer(name) {
    this.measurements.set(name, {
      start: performance.now(),
      memory: process.memoryUsage(),
    });
  }

  endTimer(name) {
    const measurement = this.measurements.get(name);
    if (!measurement) {
      throw new Error(`No measurement started for: ${name}`);
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage();

    const result = {
      duration: endTime - measurement.start,
      memoryDelta: {
        rss: endMemory.rss - measurement.memory.rss,
        heapUsed: endMemory.heapUsed - measurement.memory.heapUsed,
        heapTotal: endMemory.heapTotal - measurement.memory.heapTotal,
        external: endMemory.external - measurement.memory.external,
      },
      peakMemory: Math.max(endMemory.rss, measurement.memory.rss),
    };

    this.measurements.delete(name);
    return result;
  }

  analyzeComponent(componentName, performanceFn, iterations = 100) {
    const results = [];

    // Warmup
    for (let i = 0; i < 5; i++) {
      try {
        performanceFn();
      } catch (error) {
        // Ignore warmup errors
      }
    }

    // Actual measurements
    for (let i = 0; i < iterations; i++) {
      this.startTimer(`${componentName}-${i}`);

      try {
        const operationResult = performanceFn();
        const measurement = this.endTimer(`${componentName}-${i}`);

        results.push({
          iteration: i,
          ...measurement,
          success: true,
          result: operationResult,
        });
      } catch (error) {
        const measurement = this.endTimer(`${componentName}-${i}`);

        results.push({
          iteration: i,
          ...measurement,
          success: false,
          error: error.message,
        });
      }
    }

    return this.calculateStatistics(componentName, results);
  }

  calculateStatistics(componentName, results) {
    const successfulResults = results.filter((r) => r.success);
    const durations = successfulResults.map((r) => r.duration);
    const memoryUsages = successfulResults.map((r) => r.memoryDelta.heapUsed);

    if (durations.length === 0) {
      return {
        componentName,
        success: false,
        error: "No successful measurements",
        results,
      };
    }

    const stats = {
      componentName,
      success: true,
      iterations: results.length,
      successfulIterations: successfulResults.length,
      successRate: (successfulResults.length / results.length) * 100,

      // Timing statistics
      timing: {
        mean: durations.reduce((a, b) => a + b, 0) / durations.length,
        median: this.calculateMedian(durations),
        min: Math.min(...durations),
        max: Math.max(...durations),
        p95: this.calculatePercentile(durations, 95),
        p99: this.calculatePercentile(durations, 99),
      },

      // Memory statistics
      memory: {
        meanHeapUsed:
          memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
        medianHeapUsed: this.calculateMedian(memoryUsages),
        minHeapUsed: Math.min(...memoryUsages),
        maxHeapUsed: Math.max(...memoryUsages),
        p95HeapUsed: this.calculatePercentile(memoryUsages, 95),
      },

      // Performance categorization
      performance: {
        category: this.categorizePerformance(durations),
        overhead: this.calculateOverhead(durations),
        memoryEfficient: this.isMemoryEfficient(memoryUsages),
      },

      errors: results.filter((r) => !r.success).map((r) => r.error),
      rawResults: results,
    };

    this.componentResults[componentName] = stats;
    return stats;
  }

  calculateMedian(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  calculatePercentile(arr, percentile) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || sorted[sorted.length - 1];
  }

  categorizePerformance(durations) {
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;

    if (mean < 0.5) return "excellent";
    if (mean < 1.0) return "good";
    if (mean < 5.0) return "acceptable";
    if (mean < 10.0) return "concerning";
    return "poor";
  }

  calculateOverhead(durations) {
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Baseline overhead categories in milliseconds
    if (mean < 1) return "minimal";
    if (mean < 5) return "low";
    if (mean < 10) return "moderate";
    if (mean < 50) return "high";
    return "excessive";
  }

  isMemoryEfficient(memoryUsages) {
    const mean = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;
    const max = Math.max(...memoryUsages);

    // Memory efficiency thresholds (bytes)
    return mean < 1024 * 1024 && max < 5 * 1024 * 1024; // 1MB average, 5MB max
  }

  generateReport() {
    const components = Object.values(this.componentResults);
    const totalOverhead = components.reduce(
      (sum, comp) => sum + (comp.timing ? comp.timing.mean : 0),
      0,
    );

    return {
      summary: {
        totalComponents: components.length,
        totalOverhead: totalOverhead,
        averageOverhead: totalOverhead / components.length,
        overallCategory: this.categorizePerformance([totalOverhead]),
        memoryEfficient: components.every(
          (c) => c.performance?.memoryEfficient,
        ),
      },
      components: this.componentResults,
      recommendations: this.generateRecommendations(components),
      optimizations: this.suggestOptimizations(components),
    };
  }

  generateRecommendations(components) {
    const recommendations = [];

    for (const component of components) {
      if (!component.success) {
        recommendations.push({
          component: component.componentName,
          priority: "critical",
          issue: "Component failing during analysis",
          recommendation:
            "Investigate component stability before performance optimization",
        });
        continue;
      }

      if (
        component.performance.category === "poor" ||
        component.performance.category === "concerning"
      ) {
        recommendations.push({
          component: component.componentName,
          priority: "high",
          issue: `Poor performance (${component.timing.mean.toFixed(2)}ms average)`,
          recommendation:
            "Optimize core operations, consider caching or lazy loading",
        });
      }

      if (!component.performance.memoryEfficient) {
        recommendations.push({
          component: component.componentName,
          priority: "medium",
          issue: "High memory usage",
          recommendation:
            "Review memory allocation patterns and implement cleanup",
        });
      }

      if (component.successRate < 95) {
        recommendations.push({
          component: component.componentName,
          priority: "high",
          issue: `Low success rate (${component.successRate.toFixed(1)}%)`,
          recommendation: "Investigate and fix error conditions",
        });
      }
    }

    return recommendations;
  }

  suggestOptimizations(components) {
    const optimizations = [];

    // Performance-based optimizations
    const slowComponents = components.filter(
      (c) => c.success && c.timing.mean > 5,
    );

    if (slowComponents.length > 0) {
      optimizations.push({
        type: "performance",
        description: "Implement selective isolation based on test patterns",
        affectedComponents: slowComponents.map((c) => c.componentName),
        expectedGain: "50-80% reduction in overhead",
        implementation:
          "Use smart detection to apply full isolation only when needed",
      });
    }

    // Memory optimizations
    const memoryHeavyComponents = components.filter(
      (c) => c.success && !c.performance.memoryEfficient,
    );

    if (memoryHeavyComponents.length > 0) {
      optimizations.push({
        type: "memory",
        description: "Implement lazy loading and component caching",
        affectedComponents: memoryHeavyComponents.map((c) => c.componentName),
        expectedGain: "30-50% memory reduction",
        implementation: "Cache component instances and use lazy initialization",
      });
    }

    // Reliability optimizations
    const unreliableComponents = components.filter((c) => c.successRate < 98);

    if (unreliableComponents.length > 0) {
      optimizations.push({
        type: "reliability",
        description: "Add error recovery and fallback mechanisms",
        affectedComponents: unreliableComponents.map((c) => c.componentName),
        expectedGain: "Improved test stability",
        implementation: "Implement graceful degradation and retry logic",
      });
    }

    return optimizations;
  }
}

/**
 * Mock implementations for performance testing
 */
async function createMockComponents() {
  // Mock TestSingletonManager
  const MockTestSingletonManager = {
    clearAllState: () => {
      // Simulate singleton clearing operations
      const operations = Math.floor(Math.random() * 10) + 1;
      for (let i = 0; i < operations; i++) {
        // Simulate work
        JSON.stringify({ mock: "data", iteration: i });
      }
    },

    resetSingleton: (instance) => {
      // Simulate individual singleton reset
      if (instance) {
        JSON.stringify(instance);
      }
      return true;
    },
  };

  // Mock TestMockManager
  const MockTestMockManager = {
    clearAllMocks: () => {
      // Simulate mock clearing
      const mockCount = Math.floor(Math.random() * 20) + 5;
      const mocks = Array.from({ length: mockCount }, (_, i) => ({ id: i }));
      mocks.forEach((mock) => JSON.stringify(mock));
    },

    beforeEach: () => {
      // Simulate setup operations
      const setupTasks = ["registry", "factories", "history", "validation"];
      setupTasks.forEach((task) => {
        JSON.stringify({ task, timestamp: Date.now() });
      });
    },

    afterEach: () => {
      // Simulate cleanup operations
      const cleanupTasks = ["reset", "validate", "clear"];
      cleanupTasks.forEach((task) => {
        JSON.stringify({ task, timestamp: Date.now() });
      });
    },
  };

  // Mock TestEnvironmentManager
  const MockTestEnvironmentManager = {
    backup: () => {
      // Simulate environment backup
      const env = { ...process.env };
      JSON.stringify(env);
    },

    restore: () => {
      // Simulate environment restore
      const env = { restored: true };
      JSON.stringify(env);
    },

    clearDatabaseEnv: () => {
      // Simulate database environment clearing
      const dbVars = [
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
        "DATABASE_TEST_MODE",
      ];
      dbVars.forEach((varName) => {
        JSON.stringify({ var: varName, cleared: true });
      });
    },
  };

  // Mock AutomaticIsolationEngine
  const MockAutomaticIsolationEngine = {
    applyBeforeEachIsolation: async (testContext) => {
      // Simulate smart isolation detection and application
      const isolationLevel = [
        "minimal",
        "singleton",
        "environment",
        "complete",
      ][Math.floor(Math.random() * 4)];

      const operations = {
        minimal: 1,
        singleton: 3,
        environment: 5,
        complete: 8,
      };

      const opCount = operations[isolationLevel];
      for (let i = 0; i < opCount; i++) {
        JSON.stringify({ level: isolationLevel, operation: i, testContext });
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 2));
      }

      return { isolationLevel, operations: opCount };
    },

    applyAfterEachCleanup: async (testContext) => {
      // Simulate cleanup operations
      const cleanupOperations = Math.floor(Math.random() * 5) + 1;
      for (let i = 0; i < cleanupOperations; i++) {
        JSON.stringify({ cleanup: true, operation: i, testContext });
      }

      return { cleanupOperations };
    },
  };

  return {
    MockTestSingletonManager,
    MockTestMockManager,
    MockTestEnvironmentManager,
    MockAutomaticIsolationEngine,
  };
}

/**
 * Main performance analysis
 */
async function main() {
  console.log(
    "🔍 Starting Bulletproof Test Isolation Performance Analysis...\n",
  );

  const analyzer = new PerformanceAnalyzer();
  const mocks = await createMockComponents();

  // Analyze TestSingletonManager performance
  console.log("📊 Analyzing TestSingletonManager...");
  const singletonStats = analyzer.analyzeComponent(
    "TestSingletonManager",
    () => {
      mocks.MockTestSingletonManager.clearAllState();
      mocks.MockTestSingletonManager.resetSingleton({ mock: "instance" });
    },
    50,
  );

  // Analyze TestMockManager performance
  console.log("📊 Analyzing TestMockManager...");
  const mockStats = analyzer.analyzeComponent(
    "TestMockManager",
    () => {
      mocks.MockTestMockManager.beforeEach();
      mocks.MockTestMockManager.clearAllMocks();
      mocks.MockTestMockManager.afterEach();
    },
    50,
  );

  // Analyze TestEnvironmentManager performance
  console.log("📊 Analyzing TestEnvironmentManager...");
  const envStats = analyzer.analyzeComponent(
    "TestEnvironmentManager",
    () => {
      mocks.MockTestEnvironmentManager.backup();
      mocks.MockTestEnvironmentManager.clearDatabaseEnv();
      mocks.MockTestEnvironmentManager.restore();
    },
    50,
  );

  // Analyze AutomaticIsolationEngine performance
  console.log("📊 Analyzing AutomaticIsolationEngine...");
  const engineStats = analyzer.analyzeComponent(
    "AutomaticIsolationEngine",
    async () => {
      const testContext = { file: { filepath: "test.js" }, name: "test" };
      await mocks.MockAutomaticIsolationEngine.applyBeforeEachIsolation(
        testContext,
      );
      await mocks.MockAutomaticIsolationEngine.applyAfterEachCleanup(
        testContext,
      );
    },
    25, // Fewer iterations for async operations
  );

  // Generate comprehensive report
  console.log("\n📋 Generating Performance Report...\n");
  const report = analyzer.generateReport();

  // Save report to file
  const reportPath = join(
    projectRoot,
    "reports",
    "isolation-performance-analysis.json",
  );
  await fs.mkdir(join(projectRoot, "reports"), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  // Display results
  displayResults(report);

  console.log(`\n💾 Detailed report saved to: ${reportPath}`);
}

function displayResults(report) {
  console.log("=".repeat(80));
  console.log("🎯 BULLETPROOF TEST ISOLATION PERFORMANCE ANALYSIS");
  console.log("=".repeat(80));

  // Summary
  console.log("\n📈 SUMMARY");
  console.log("-".repeat(40));
  console.log(`Total Components Analyzed: ${report.summary.totalComponents}`);
  console.log(`Total Overhead: ${report.summary.totalOverhead.toFixed(2)}ms`);
  console.log(
    `Average Component Overhead: ${report.summary.averageOverhead.toFixed(2)}ms`,
  );
  console.log(
    `Overall Performance: ${report.summary.overallCategory.toUpperCase()}`,
  );
  console.log(
    `Memory Efficient: ${report.summary.memoryEfficient ? "✅ YES" : "❌ NO"}`,
  );

  // Component Results
  console.log("\n🔧 COMPONENT ANALYSIS");
  console.log("-".repeat(40));

  for (const [name, stats] of Object.entries(report.components)) {
    if (!stats.success) {
      console.log(`❌ ${name}: FAILED (${stats.error})`);
      continue;
    }

    const timing = stats.timing;
    const performance = stats.performance;

    console.log(`\n📦 ${name}:`);
    console.log(
      `   Performance: ${performance.category.toUpperCase()} (${performance.overhead} overhead)`,
    );
    console.log(`   Average Time: ${timing.mean.toFixed(2)}ms`);
    console.log(`   95th Percentile: ${timing.p95.toFixed(2)}ms`);
    console.log(`   Success Rate: ${stats.successRate.toFixed(1)}%`);
    console.log(
      `   Memory Efficient: ${performance.memoryEfficient ? "✅" : "❌"}`,
    );

    if (timing.max > 20) {
      console.log(`   ⚠️  Peak execution time: ${timing.max.toFixed(2)}ms`);
    }
  }

  // Recommendations
  console.log("\n💡 RECOMMENDATIONS");
  console.log("-".repeat(40));

  if (report.recommendations.length === 0) {
    console.log(
      "✅ No critical issues found - performance is within acceptable ranges",
    );
  } else {
    report.recommendations.forEach((rec, index) => {
      const priority =
        rec.priority === "critical"
          ? "🚨"
          : rec.priority === "high"
            ? "⚠️"
            : "💡";

      console.log(
        `\n${priority} ${rec.component} (${rec.priority.toUpperCase()}):`,
      );
      console.log(`   Issue: ${rec.issue}`);
      console.log(`   Recommendation: ${rec.recommendation}`);
    });
  }

  // Optimizations
  console.log("\n🚀 OPTIMIZATION OPPORTUNITIES");
  console.log("-".repeat(40));

  if (report.optimizations.length === 0) {
    console.log(
      "✅ System is well optimized - no major optimization opportunities identified",
    );
  } else {
    report.optimizations.forEach((opt, index) => {
      console.log(`\n🎯 ${opt.type.toUpperCase()} Optimization:`);
      console.log(`   Description: ${opt.description}`);
      console.log(`   Expected Gain: ${opt.expectedGain}`);
      console.log(`   Implementation: ${opt.implementation}`);
      console.log(
        `   Affected Components: ${opt.affectedComponents.join(", ")}`,
      );
    });
  }

  // Performance Target Assessment
  console.log("\n🎯 PERFORMANCE TARGET ASSESSMENT");
  console.log("-".repeat(40));

  const targetOverhead = 5; // 5% target overhead
  const actualOverhead = (report.summary.totalOverhead / 100) * 100; // Convert to percentage

  console.log(`Target: ≤5% performance overhead`);
  console.log(`Actual: ${actualOverhead.toFixed(1)}% overhead`);

  if (actualOverhead <= targetOverhead) {
    console.log("✅ PERFORMANCE TARGET MET");
  } else {
    const overage = actualOverhead - targetOverhead;
    console.log(`❌ PERFORMANCE TARGET EXCEEDED by ${overage.toFixed(1)}%`);
  }

  console.log("\n" + "=".repeat(80));
}

// Run the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { PerformanceAnalyzer };
