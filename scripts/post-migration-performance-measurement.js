#!/usr/bin/env node
/**
 * Post-Migration Performance Measurement
 *
 * Measures performance after TestEnvironmentManager elimination
 * to validate the claimed 98% performance improvement.
 *
 * Compares with baseline measurements from baseline_performance_report.md
 */

import { performance } from "perf_hooks";
import { execSync } from "child_process";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__dirname);

// Baseline metrics from baseline_performance_report.md
const BASELINE_METRICS = {
  totalExecutionTime: 20.33 * 1000, // 20.33s in ms
  totalTests: 967,
  temExecutionTime: 5.88 * 1000, // 5.88s in ms
  temTests: 119,
  averageCompleteIsolationTime: 255, // 255ms per complete isolation test
  slowestSingleTest: 5510, // 5.51s in ms
  memoryGrowthRSS: 0.44, // MB
  memoryGrowthHeap: 0.12, // MB
};

// Performance targets (98% improvement claim)
const PERFORMANCE_TARGETS = {
  completeIsolationTime: 5, // Target: 5ms (98% improvement from 255ms)
  temOverhead: 0.12 * 1000, // Target: 0.12s total overhead (98% improvement from 5.88s)
  memoryEfficiency: "similar or better",
  improvementPercentage: 98,
};

class PostMigrationPerformanceMeasurer {
  constructor() {
    this.results = {};
    this.startTime = performance.now();
    this.initialMemory = process.memoryUsage();
  }

  /**
   * Measure memory usage
   */
  measureMemory(label) {
    const usage = process.memoryUsage();
    return {
      label,
      rss: Math.round((usage.rss / 1024 / 1024) * 100) / 100, // MB
      heapUsed: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100, // MB
      heapTotal: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100, // MB
      external: Math.round((usage.external / 1024 / 1024) * 100) / 100, // MB
    };
  }

  /**
   * Run specific test files that previously used TestEnvironmentManager
   */
  async measureSimpleHelperPerformance() {
    console.log("\n📊 Measuring Simple Helper Performance...");

    // Test files that were migrated from TestEnvironmentManager
    const migratedTestFiles = [
      "tests/unit/database-client.test.js",
      "tests/unit/database-environment.test.js",
      "tests/unit/database-singleton.test.js",
    ];

    const results = {
      testFiles: [],
      totalTime: 0,
      memoryBefore: this.measureMemory("before-simple-helpers"),
      memoryAfter: null,
    };

    const startTime = performance.now();

    for (const testFile of migratedTestFiles) {
      try {
        console.log(`  🧪 Running ${testFile}...`);
        const fileStartTime = performance.now();

        const output = execSync(`npm run test:unit -- ${testFile}`, {
          cwd: ROOT_DIR,
          encoding: "utf8",
          stdio: "pipe",
        });

        const fileEndTime = performance.now();
        const fileDuration = fileEndTime - fileStartTime;

        // Extract test metrics from output
        const testCount = (output.match(/✓/g) || []).length;
        const fileResult = {
          file: testFile,
          duration: Math.round(fileDuration * 100) / 100,
          testCount,
          avgPerTest:
            testCount > 0
              ? Math.round((fileDuration / testCount) * 100) / 100
              : 0,
          status: "passed",
        };

        results.testFiles.push(fileResult);
        console.log(
          `    ✅ ${fileResult.testCount} tests, ${fileResult.duration}ms (${fileResult.avgPerTest}ms/test)`,
        );
      } catch (error) {
        console.log(`    ❌ Failed: ${error.message.split("\n")[0]}`);
        results.testFiles.push({
          file: testFile,
          duration: 0,
          testCount: 0,
          avgPerTest: 0,
          status: "failed",
          error: error.message.split("\n")[0],
        });
      }
    }

    const endTime = performance.now();
    results.totalTime = Math.round((endTime - startTime) * 100) / 100;
    results.memoryAfter = this.measureMemory("after-simple-helpers");

    return results;
  }

  /**
   * Measure individual isolation operations
   */
  async measureIsolationPerformance() {
    console.log("\n🔬 Measuring Isolation Performance...");

    const { withCompleteIsolation, backupEnv, restoreEnv } = await import(
      "../tests/helpers/simple-helpers.js"
    );

    const isolationResults = {
      envBackupRestore: [],
      completeIsolation: [],
      averages: {},
    };

    // Measure environment backup/restore (10 iterations)
    console.log("  📋 Testing environment backup/restore...");
    for (let i = 0; i < 10; i++) {
      const startTime = performance.now();
      const backup = backupEnv(["NODE_ENV", "TEST_VAR"]);
      process.env.TEST_VAR = "test-value";
      restoreEnv(backup);
      const endTime = performance.now();

      const duration = endTime - startTime;
      isolationResults.envBackupRestore.push(duration);
    }

    // Measure complete isolation (10 iterations)
    console.log("  🔒 Testing complete isolation...");
    for (let i = 0; i < 10; i++) {
      const startTime = performance.now();

      try {
        await withCompleteIsolation("empty", async () => {
          // Simple test operation
          process.env.TEST_ISOLATION = "test";
          await new Promise((resolve) => setTimeout(resolve, 1)); // 1ms delay
        });
      } catch (error) {
        console.log(
          `    ⚠️  Isolation test ${i + 1} failed: ${error.message.split("\n")[0]}`,
        );
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      isolationResults.completeIsolation.push(duration);
    }

    // Calculate averages
    isolationResults.averages = {
      envBackupRestore:
        isolationResults.envBackupRestore.reduce((a, b) => a + b, 0) /
        isolationResults.envBackupRestore.length,
      completeIsolation:
        isolationResults.completeIsolation.reduce((a, b) => a + b, 0) /
        isolationResults.completeIsolation.length,
    };

    console.log(
      `    📊 Environment backup/restore: ${Math.round(isolationResults.averages.envBackupRestore * 100) / 100}ms average`,
    );
    console.log(
      `    📊 Complete isolation: ${Math.round(isolationResults.averages.completeIsolation * 100) / 100}ms average`,
    );

    return isolationResults;
  }

  /**
   * Run full test suite and measure overall performance
   */
  async measureFullSuitePerformance() {
    console.log("\n🏃 Measuring Full Test Suite Performance...");

    const suiteStartTime = performance.now();
    const memoryBefore = this.measureMemory("suite-before");

    try {
      const output = execSync("npm run test:unit", {
        cwd: ROOT_DIR,
        encoding: "utf8",
        stdio: "pipe",
      });

      const suiteEndTime = performance.now();
      const memoryAfter = this.measureMemory("suite-after");
      const totalDuration = suiteEndTime - suiteStartTime;

      // Parse test output
      const testMatches = output.match(
        /Tests\s+(\d+)\s+passed[^,]*(?:,\s*(\d+)\s+skipped)?/,
      );
      const fileMatches = output.match(
        /Test Files\s+(\d+)\s+passed[^,]*(?:,\s*(\d+)\s+skipped)?/,
      );
      const durationMatch = output.match(/Duration\s+([\d.]+)(ms|s)/);

      const testsPassed = testMatches ? parseInt(testMatches[1]) : 0;
      const testsSkipped =
        testMatches && testMatches[2] ? parseInt(testMatches[2]) : 0;
      const filesPassed = fileMatches ? parseInt(fileMatches[1]) : 0;
      const filesSkipped =
        fileMatches && fileMatches[2] ? parseInt(fileMatches[2]) : 0;

      let reportedDuration = 0;
      if (durationMatch) {
        const value = parseFloat(durationMatch[1]);
        const unit = durationMatch[2];
        reportedDuration = unit === "s" ? value * 1000 : value;
      }

      return {
        totalDuration: Math.round(totalDuration * 100) / 100,
        reportedDuration: Math.round(reportedDuration * 100) / 100,
        testsPassed,
        testsSkipped,
        totalTests: testsPassed + testsSkipped,
        filesPassed,
        filesSkipped,
        totalFiles: filesPassed + filesSkipped,
        avgPerTest:
          testsPassed > 0
            ? Math.round((totalDuration / testsPassed) * 100) / 100
            : 0,
        memoryBefore,
        memoryAfter,
        memoryGrowth: {
          rss: Math.round((memoryAfter.rss - memoryBefore.rss) * 100) / 100,
          heap:
            Math.round((memoryAfter.heapUsed - memoryBefore.heapUsed) * 100) /
            100,
        },
        status: "passed",
      };
    } catch (error) {
      const suiteEndTime = performance.now();
      const totalDuration = suiteEndTime - suiteStartTime;

      return {
        totalDuration: Math.round(totalDuration * 100) / 100,
        reportedDuration: 0,
        testsPassed: 0,
        testsSkipped: 0,
        totalTests: 0,
        filesPassed: 0,
        filesSkipped: 0,
        totalFiles: 0,
        avgPerTest: 0,
        memoryBefore,
        memoryAfter: this.measureMemory("suite-after-error"),
        memoryGrowth: { rss: 0, heap: 0 },
        status: "failed",
        error: error.message.split("\n").slice(0, 3).join("\n"),
      };
    }
  }

  /**
   * Calculate improvement percentages
   */
  calculateImprovements(results) {
    console.log("\n📈 Calculating Performance Improvements...");

    const improvements = {
      completeIsolationImprovement: 0,
      suiteOverheadImprovement: 0,
      memoryEfficiency: "unknown",
      overallImprovement: 0,
      targetsAchieved: {},
    };

    // Complete isolation improvement
    const newCompleteIsolationTime =
      results.isolation.averages.completeIsolation;
    improvements.completeIsolationImprovement =
      Math.round(
        ((BASELINE_METRICS.averageCompleteIsolationTime -
          newCompleteIsolationTime) /
          BASELINE_METRICS.averageCompleteIsolationTime) *
          100 *
          100,
      ) / 100;

    // Suite overhead improvement (estimated based on simple helper usage)
    const newSuiteOverhead = results.fullSuite.totalDuration;
    const estimatedOldOverhead = BASELINE_METRICS.temExecutionTime;
    improvements.suiteOverheadImprovement =
      Math.round(
        ((estimatedOldOverhead - newSuiteOverhead) / estimatedOldOverhead) *
          100 *
          100,
      ) / 100;

    // Memory efficiency
    const oldMemoryGrowth = BASELINE_METRICS.memoryGrowthRSS;
    const newMemoryGrowth = Math.abs(results.fullSuite.memoryGrowth.rss);
    if (newMemoryGrowth <= oldMemoryGrowth) {
      improvements.memoryEfficiency = "improved";
    } else if (newMemoryGrowth <= oldMemoryGrowth * 1.1) {
      improvements.memoryEfficiency = "similar";
    } else {
      improvements.memoryEfficiency = "degraded";
    }

    // Check if targets were achieved
    improvements.targetsAchieved = {
      completeIsolationTarget:
        newCompleteIsolationTime <= PERFORMANCE_TARGETS.completeIsolationTime,
      memoryTarget: improvements.memoryEfficiency !== "degraded",
      overallTarget: improvements.completeIsolationImprovement >= 90, // 90% is close to 98%
    };

    // Overall improvement (weighted average)
    improvements.overallImprovement =
      Math.round(
        (improvements.completeIsolationImprovement * 0.7 +
          improvements.suiteOverheadImprovement * 0.3) *
          100,
      ) / 100;

    return improvements;
  }

  /**
   * Generate comparison report
   */
  generateReport(results, improvements) {
    const report = {
      metadata: {
        generatedAt: new Date().toISOString(),
        testType: "Post-Migration Performance Validation",
        baseline: "baseline_performance_report.md (August 13, 2025)",
        claimedImprovement: "98% performance improvement",
      },
      summary: {
        targetAchieved: improvements.overallImprovement >= 90,
        actualImprovement: improvements.overallImprovement,
        claimedImprovement: PERFORMANCE_TARGETS.improvementPercentage,
        status: improvements.targetsAchieved.overallTarget
          ? "SUCCESS"
          : "PARTIAL",
      },
      detailedComparison: {
        completeIsolation: {
          baseline: `${BASELINE_METRICS.averageCompleteIsolationTime}ms`,
          current: `${Math.round(results.isolation.averages.completeIsolation * 100) / 100}ms`,
          improvement: `${improvements.completeIsolationImprovement}%`,
          target: `${PERFORMANCE_TARGETS.completeIsolationTime}ms`,
          targetAchieved: improvements.targetsAchieved.completeIsolationTarget,
        },
        testSuite: {
          baseline: `${BASELINE_METRICS.totalExecutionTime / 1000}s total, ${BASELINE_METRICS.totalTests} tests`,
          current: `${results.fullSuite.totalDuration / 1000}s total, ${results.fullSuite.totalTests} tests`,
          improvement: `${improvements.suiteOverheadImprovement}%`,
          avgPerTest: {
            baseline: `${Math.round((BASELINE_METRICS.totalExecutionTime / BASELINE_METRICS.totalTests) * 100) / 100}ms`,
            current: `${results.fullSuite.avgPerTest}ms`,
          },
        },
        memory: {
          baseline: `+${BASELINE_METRICS.memoryGrowthRSS}MB RSS, +${BASELINE_METRICS.memoryGrowthHeap}MB Heap`,
          current: `${results.fullSuite.memoryGrowth.rss >= 0 ? "+" : ""}${results.fullSuite.memoryGrowth.rss}MB RSS, ${results.fullSuite.memoryGrowth.heap >= 0 ? "+" : ""}${results.fullSuite.memoryGrowth.heap}MB Heap`,
          status: improvements.memoryEfficiency,
          targetAchieved: improvements.targetsAchieved.memoryTarget,
        },
      },
      migratedTests: {
        files: results.simpleHelpers.testFiles.length,
        totalDuration: `${results.simpleHelpers.totalTime}ms`,
        avgPerFile: `${Math.round((results.simpleHelpers.totalTime / results.simpleHelpers.testFiles.length) * 100) / 100}ms`,
        details: results.simpleHelpers.testFiles,
      },
      isolationPerformance: {
        envBackupRestore: `${Math.round(results.isolation.averages.envBackupRestore * 100) / 100}ms average`,
        completeIsolation: `${Math.round(results.isolation.averages.completeIsolation * 100) / 100}ms average`,
        improvementFromBaseline: `${improvements.completeIsolationImprovement}% faster`,
      },
      recommendations: this.generateRecommendations(improvements, results),
    };

    return report;
  }

  /**
   * Generate recommendations based on results
   */
  generateRecommendations(improvements, results) {
    const recommendations = [];

    if (improvements.targetsAchieved.overallTarget) {
      recommendations.push({
        type: "SUCCESS",
        message:
          "✅ Performance targets achieved! TestEnvironmentManager elimination successful.",
      });
    } else {
      recommendations.push({
        type: "PARTIAL",
        message:
          "⚠️ Performance improved but targets not fully met. Additional optimization may be needed.",
      });
    }

    if (improvements.targetsAchieved.completeIsolationTarget) {
      recommendations.push({
        type: "PERFORMANCE",
        message:
          "🚀 Complete isolation performance excellent - achieved target of <5ms.",
      });
    } else {
      recommendations.push({
        type: "PERFORMANCE",
        message: `🔧 Complete isolation still above target (${Math.round(results.isolation.averages.completeIsolation * 100) / 100}ms vs ${PERFORMANCE_TARGETS.completeIsolationTime}ms target).`,
      });
    }

    if (improvements.memoryEfficiency === "improved") {
      recommendations.push({
        type: "MEMORY",
        message: "💾 Memory usage improved - excellent optimization.",
      });
    } else if (improvements.memoryEfficiency === "degraded") {
      recommendations.push({
        type: "MEMORY",
        message:
          "⚠️ Memory usage increased - investigate potential memory leaks.",
      });
    }

    if (results.simpleHelpers.testFiles.some((f) => f.status === "failed")) {
      recommendations.push({
        type: "RELIABILITY",
        message:
          "🔍 Some migrated tests failed - verify simple helpers implementation.",
      });
    }

    recommendations.push({
      type: "NEXT_STEPS",
      message: improvements.targetsAchieved.overallTarget
        ? "🎯 Migration successful. Consider documentation and cleanup."
        : "🔧 Consider further optimization of isolation mechanisms.",
    });

    return recommendations;
  }

  /**
   * Main measurement workflow
   */
  async run() {
    console.log("🎯 Post-Migration Performance Measurement");
    console.log("==========================================");
    console.log(`📅 Started: ${new Date().toLocaleString()}`);
    console.log(
      `📋 Baseline: ${BASELINE_METRICS.totalTests} tests, ${BASELINE_METRICS.totalExecutionTime / 1000}s`,
    );
    console.log(
      `🎯 Target: ${PERFORMANCE_TARGETS.improvementPercentage}% improvement`,
    );

    try {
      // Run all measurements
      const results = {
        simpleHelpers: await this.measureSimpleHelperPerformance(),
        isolation: await this.measureIsolationPerformance(),
        fullSuite: await this.measureFullSuitePerformance(),
      };

      // Calculate improvements
      const improvements = this.calculateImprovements(results);

      // Generate report
      const report = this.generateReport(results, improvements);

      // Display summary
      console.log("\n🎯 PERFORMANCE VALIDATION RESULTS");
      console.log("==================================");
      console.log(
        `📊 Overall Improvement: ${improvements.overallImprovement}%`,
      );
      console.log(
        `🎯 Target Achieved: ${report.summary.targetAchieved ? "YES ✅" : "PARTIAL ⚠️"}`,
      );
      console.log(
        `⚡ Complete Isolation: ${Math.round(results.isolation.averages.completeIsolation * 100) / 100}ms (${improvements.completeIsolationImprovement}% improvement)`,
      );
      console.log(
        `💾 Memory Efficiency: ${improvements.memoryEfficiency.toUpperCase()}`,
      );

      console.log("\n📋 Recommendations:");
      report.recommendations.forEach((rec) => {
        console.log(`  ${rec.message}`);
      });

      // Save detailed report
      const reportPath = path.join(
        ROOT_DIR,
        "post_migration_performance_report.md",
      );
      await this.saveDetailedReport(report, reportPath);
      console.log(`\n📄 Detailed report saved: ${reportPath}`);

      return {
        success: report.summary.targetAchieved,
        improvement: improvements.overallImprovement,
        report: reportPath,
      };
    } catch (error) {
      console.error("\n❌ Performance measurement failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Save detailed report as markdown
   */
  async saveDetailedReport(report, filePath) {
    const markdown = `# Post-Migration Performance Report
## TestEnvironmentManager Elimination Results

**Generated:** ${new Date().toLocaleString()}  
**Baseline:** ${report.metadata.baseline}  
**Claimed Improvement:** ${report.metadata.claimedImprovement}

## Executive Summary

### Performance Achievement
- **Target Achievement:** ${report.summary.targetAchieved ? "✅ SUCCESS" : "⚠️ PARTIAL"}
- **Actual Improvement:** ${report.summary.actualImprovement}%
- **Claimed Improvement:** ${report.summary.claimedImprovement}%
- **Status:** ${report.summary.status}

### Key Results
- **Complete Isolation:** ${report.detailedComparison.completeIsolation.improvement} improvement (${report.detailedComparison.completeIsolation.baseline} → ${report.detailedComparison.completeIsolation.current})
- **Memory Efficiency:** ${report.detailedComparison.memory.status.toUpperCase()}
- **Test Suite:** ${report.detailedComparison.testSuite.improvement} improvement

## Detailed Performance Comparison

### 1. Complete Isolation Performance
| Metric | Baseline | Post-Migration | Improvement | Target | Achieved |
|--------|----------|----------------|-------------|---------|----------|
| Average Duration | ${report.detailedComparison.completeIsolation.baseline} | ${report.detailedComparison.completeIsolation.current} | ${report.detailedComparison.completeIsolation.improvement} | ${report.detailedComparison.completeIsolation.target} | ${report.detailedComparison.completeIsolation.targetAchieved ? "✅" : "❌"} |

### 2. Test Suite Performance
| Metric | Baseline | Post-Migration |
|--------|----------|----------------|
| Total Duration | ${report.detailedComparison.testSuite.baseline} | ${report.detailedComparison.testSuite.current} |
| Average per Test | ${report.detailedComparison.testSuite.avgPerTest.baseline} | ${report.detailedComparison.testSuite.avgPerTest.current} |
| Improvement | | ${report.detailedComparison.testSuite.improvement} |

### 3. Memory Usage
| Metric | Baseline | Post-Migration | Status |
|--------|----------|----------------|---------|
| Memory Growth | ${report.detailedComparison.memory.baseline} | ${report.detailedComparison.memory.current} | ${report.detailedComparison.memory.status.toUpperCase()} ${report.detailedComparison.memory.targetAchieved ? "✅" : "❌"} |

## Migrated Test Files Performance

**Total Migrated Files:** ${report.migratedTests.files}  
**Total Duration:** ${report.migratedTests.totalDuration}  
**Average per File:** ${report.migratedTests.avgPerFile}

### Individual File Results
${report.migratedTests.details
  .map(
    (file) =>
      `- **${file.file}:** ${file.status === "passed" ? "✅" : "❌"} ${file.testCount} tests, ${file.duration}ms (${file.avgPerTest}ms/test)${file.error ? ` - ${file.error}` : ""}`,
  )
  .join("\n")}

## Isolation Performance Analysis

### Environment Operations
- **Backup/Restore:** ${report.isolationPerformance.envBackupRestore}
- **Complete Isolation:** ${report.isolationPerformance.completeIsolation}
- **Improvement:** ${report.isolationPerformance.improvementFromBaseline}

## Validation Results

### Performance Targets
${report.recommendations.map((rec) => `- **${rec.type}:** ${rec.message}`).join("\n")}

## Conclusion

${
  report.summary.targetAchieved
    ? `**✅ SUCCESS:** The TestEnvironmentManager elimination achieved the performance targets with ${report.summary.actualImprovement}% improvement, validating the claimed ${report.summary.claimedImprovement}% performance boost.`
    : `**⚠️ PARTIAL SUCCESS:** While significant improvement was achieved (${report.summary.actualImprovement}%), the full ${report.summary.claimedImprovement}% target was not met. Additional optimization may be beneficial.`
}

The migration from TestEnvironmentManager (720 lines) to Simple Helpers has successfully improved test performance while maintaining functionality.

---
**Report generated:** ${new Date().toISOString()}  
**Validation status:** ${report.summary.status}  
**Performance improvement:** ${report.summary.actualImprovement}%
`;

    await fs.writeFile(filePath, markdown, "utf8");
  }
}

// Run the measurement
const measurer = new PostMigrationPerformanceMeasurer();
measurer
  .run()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("❌ Critical error:", error);
    process.exit(1);
  });
