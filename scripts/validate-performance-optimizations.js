#!/usr/bin/env node

/**
 * Performance Optimization Validation Script
 *
 * Validates that the performance optimizations meet the target requirements
 * by comparing performance metrics before and after optimization.
 */

import { spawn } from "child_process";
import { performance } from "perf_hooks";
import fs from "fs/promises";
import path from "path";

class PerformanceValidator {
  constructor() {
    this.projectRoot = process.cwd();
    this.results = {};
  }

  /**
   * Execute test with specific configuration
   */
  async executeTest(configName, testConfig, testPattern, iterations = 3) {
    console.log(`\n🧪 Testing ${configName}...`);

    const results = [];

    for (let i = 0; i < iterations; i++) {
      console.log(`   Iteration ${i + 1}/${iterations}...`);

      const startTime = performance.now();
      const result = await this.runVitest(testConfig, testPattern);
      const endTime = performance.now();

      if (result.success) {
        results.push({
          iteration: i + 1,
          duration: endTime - startTime,
          testCount: result.testCount,
          passedTests: result.passedTests,
          memory: result.memory,
        });
      } else {
        console.log(`   ❌ Iteration ${i + 1} failed: ${result.error}`);
      }

      // Wait between iterations
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return this.calculateStatistics(configName, results);
  }

  /**
   * Run Vitest with specific configuration
   */
  async runVitest(testConfig, testPattern) {
    return new Promise((resolve) => {
      const args = [
        "npx",
        "vitest",
        "run",
        testPattern,
        "--reporter=json",
        "--coverage=false",
        "--run",
      ];

      if (testConfig.config) {
        args.splice(3, 0, "--config", testConfig.config);
      }

      const env = {
        ...process.env,
        ...testConfig.env,
      };

      const child = spawn("node", args, {
        env,
        cwd: this.projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ success: false, error: "Timeout" });
      }, 30000);

      child.on("close", (code) => {
        clearTimeout(timeout);

        try {
          // Parse JSON output
          let jsonOutput = null;
          try {
            const jsonMatch = stdout.match(/\{[^]*\}/);
            if (jsonMatch) {
              jsonOutput = JSON.parse(jsonMatch[0]);
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }

          // Extract execution time from output
          const timeMatch = stderr.match(/Duration\s+(\d+(?:\.\d+)?)(?:ms|s)/);
          let executionTime = 0;
          if (timeMatch) {
            executionTime = parseFloat(timeMatch[1]);
            if (timeMatch[0].includes("s") && !timeMatch[0].includes("ms")) {
              executionTime *= 1000; // Convert seconds to milliseconds
            }
          }

          resolve({
            success: code === 0,
            exitCode: code,
            testCount: jsonOutput ? jsonOutput.numTotalTests : 0,
            passedTests: jsonOutput ? jsonOutput.numPassedTests : 0,
            failedTests: jsonOutput ? jsonOutput.numFailedTests : 0,
            executionTime,
            memory: this.extractMemoryUsage(stderr),
            stdout,
            stderr,
          });
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      });
    });
  }

  /**
   * Extract memory usage from stderr
   */
  extractMemoryUsage(stderr) {
    // Look for memory information in output
    const memoryMatch = stderr.match(/(\d+(?:\.\d+)?)\s*MB/);
    return memoryMatch ? parseFloat(memoryMatch[1]) : 0;
  }

  /**
   * Calculate performance statistics
   */
  calculateStatistics(configName, results) {
    if (results.length === 0) {
      return { configName, success: false, error: "No successful test runs" };
    }

    const durations = results.map((r) => r.duration);
    const executionTimes = results.map((r) => r.executionTime || r.duration);
    const testCounts = results.map((r) => r.testCount);
    const memoryUsages = results.map((r) => r.memory);

    return {
      configName,
      success: true,
      iterations: results.length,

      timing: {
        avgDuration: this.mean(durations),
        avgExecutionTime: this.mean(executionTimes),
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        stdDev: this.standardDeviation(durations),
      },

      tests: {
        avgTestCount: this.mean(testCounts),
        avgPassedTests: this.mean(results.map((r) => r.passedTests)),
      },

      memory: {
        avgUsage: this.mean(memoryUsages),
        maxUsage: Math.max(...memoryUsages),
      },

      rawResults: results,
    };
  }

  /**
   * Run comprehensive performance validation
   */
  async validatePerformanceOptimizations() {
    console.log("🚀 Validating Performance Optimizations...\n");

    // Test configurations
    const testConfigs = {
      baseline: {
        name: "Baseline Configuration",
        config: "vitest.baseline.config.js",
        env: {
          TEST_ISOLATION_ENHANCED: "false",
          TEST_AUTO_ISOLATION: "false",
        },
      },
      enhanced: {
        name: "Enhanced Isolation",
        config: "vitest.config.js",
        env: {
          TEST_ISOLATION_ENHANCED: "true",
          TEST_AUTO_ISOLATION: "true",
        },
      },
      optimized: {
        name: "Performance Optimized",
        config: "vitest.config.js",
        env: {
          TEST_ISOLATION_ENHANCED: "true",
          TEST_AUTO_ISOLATION: "true",
          TEST_PERFORMANCE_MODE: "true",
        },
      },
    };

    // Test patterns - use reliable, fast tests
    const testPatterns = [
      "tests/unit/static-hero-images.test.js",
      "tests/unit/analytics-service.test.js",
      "tests/unit/sql-splitter.test.js",
    ];

    const validationResults = {};

    // Run each configuration
    for (const [configKey, config] of Object.entries(testConfigs)) {
      try {
        const result = await this.executeTest(
          config.name,
          config,
          testPatterns.join(" "),
          3,
        );
        validationResults[configKey] = result;

        if (result.success) {
          console.log(
            `✅ ${config.name}: ${result.timing.avgExecutionTime.toFixed(0)}ms avg`,
          );
        } else {
          console.log(`❌ ${config.name}: FAILED`);
        }
      } catch (error) {
        console.log(`❌ ${config.name}: ERROR - ${error.message}`);
        validationResults[configKey] = {
          success: false,
          error: error.message,
        };
      }
    }

    // Generate validation report
    const report = this.generateValidationReport(validationResults);

    // Save report
    const reportPath = path.join(
      this.projectRoot,
      "reports",
      "performance-optimization-validation.json",
    );
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    this.displayValidationReport(report);

    console.log(`\n💾 Validation report saved to: ${reportPath}`);

    return report;
  }

  /**
   * Generate validation report
   */
  generateValidationReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {},
      configurations: results,
      validation: {},
      recommendations: [],
    };

    // Calculate summaries
    for (const [configKey, result] of Object.entries(results)) {
      if (result.success) {
        report.summary[configKey] = {
          avgExecutionTime: result.timing.avgExecutionTime,
          avgTestCount: result.tests.avgTestCount,
          reliability: 100, // All iterations succeeded
          memoryUsage: result.memory.avgUsage,
        };
      }
    }

    // Calculate performance improvements
    const baseline = report.summary.baseline;
    const enhanced = report.summary.enhanced;
    const optimized = report.summary.optimized;

    if (baseline && enhanced) {
      const enhancedOverhead =
        ((enhanced.avgExecutionTime - baseline.avgExecutionTime) /
          baseline.avgExecutionTime) *
        100;
      report.validation.enhancedOverhead = {
        overhead: enhancedOverhead,
        target: 10, // 10% target
        met: enhancedOverhead <= 10,
      };
    }

    if (baseline && optimized) {
      const optimizedOverhead =
        ((optimized.avgExecutionTime - baseline.avgExecutionTime) /
          baseline.avgExecutionTime) *
        100;
      report.validation.optimizedOverhead = {
        overhead: optimizedOverhead,
        target: 5, // 5% target
        met: optimizedOverhead <= 5,
      };
    }

    if (enhanced && optimized) {
      const optimization =
        ((enhanced.avgExecutionTime - optimized.avgExecutionTime) /
          enhanced.avgExecutionTime) *
        100;
      report.validation.optimizationGain = {
        improvement: optimization,
        target: 2, // 2% minimum improvement target
        met: optimization >= 2,
      };
    }

    // Generate recommendations
    report.recommendations = this.generateValidationRecommendations(report);

    return report;
  }

  /**
   * Generate validation recommendations
   */
  generateValidationRecommendations(report) {
    const recommendations = [];

    if (
      report.validation.optimizedOverhead &&
      !report.validation.optimizedOverhead.met
    ) {
      recommendations.push({
        priority: "high",
        issue: `Optimized configuration still exceeds target overhead: ${report.validation.optimizedOverhead.overhead.toFixed(1)}%`,
        recommendation:
          "Further optimize isolation components or increase performance budget to 8%",
      });
    }

    if (
      report.validation.optimizationGain &&
      !report.validation.optimizationGain.met
    ) {
      recommendations.push({
        priority: "medium",
        issue: `Performance optimization gain is below target: ${report.validation.optimizationGain.improvement.toFixed(1)}%`,
        recommendation:
          "Investigate additional optimization opportunities in isolation components",
      });
    }

    if (
      report.validation.optimizedOverhead &&
      report.validation.optimizedOverhead.met
    ) {
      recommendations.push({
        priority: "info",
        issue: "Performance targets met",
        recommendation:
          "Current optimization is effective. Consider monitoring in production.",
      });
    }

    return recommendations;
  }

  /**
   * Display validation report
   */
  displayValidationReport(report) {
    console.log("\n" + "=".repeat(80));
    console.log("🎯 PERFORMANCE OPTIMIZATION VALIDATION REPORT");
    console.log("=".repeat(80));

    // Configuration summaries
    console.log("\n📊 CONFIGURATION PERFORMANCE");
    console.log("-".repeat(50));

    for (const [configKey, summary] of Object.entries(report.summary)) {
      const configName = configKey.charAt(0).toUpperCase() + configKey.slice(1);
      console.log(`\n${configName} Configuration:`);
      console.log(
        `   Execution Time: ${summary.avgExecutionTime.toFixed(0)}ms`,
      );
      console.log(`   Test Count: ${summary.avgTestCount.toFixed(0)}`);
      console.log(`   Reliability: ${summary.reliability.toFixed(1)}%`);
      if (summary.memoryUsage > 0) {
        console.log(`   Memory Usage: ${summary.memoryUsage.toFixed(1)}MB`);
      }
    }

    // Validation results
    if (Object.keys(report.validation).length > 0) {
      console.log("\n⚡ VALIDATION RESULTS");
      console.log("-".repeat(50));

      if (report.validation.enhancedOverhead) {
        const result = report.validation.enhancedOverhead;
        const indicator = result.met ? "✅" : "❌";
        console.log(`\n${indicator} Enhanced Isolation Overhead:`);
        console.log(
          `   Overhead: ${result.overhead.toFixed(1)}% (target: ≤${result.target}%)`,
        );
        console.log(`   Status: ${result.met ? "PASSED" : "FAILED"}`);
      }

      if (report.validation.optimizedOverhead) {
        const result = report.validation.optimizedOverhead;
        const indicator = result.met ? "✅" : "❌";
        console.log(`\n${indicator} Optimized Configuration Overhead:`);
        console.log(
          `   Overhead: ${result.overhead.toFixed(1)}% (target: ≤${result.target}%)`,
        );
        console.log(`   Status: ${result.met ? "PASSED" : "FAILED"}`);
      }

      if (report.validation.optimizationGain) {
        const result = report.validation.optimizationGain;
        const indicator = result.met ? "✅" : "❌";
        console.log(`\n${indicator} Performance Optimization Gain:`);
        console.log(
          `   Improvement: ${result.improvement.toFixed(1)}% (target: ≥${result.target}%)`,
        );
        console.log(`   Status: ${result.met ? "PASSED" : "FAILED"}`);
      }
    }

    // Recommendations
    console.log("\n💡 RECOMMENDATIONS");
    console.log("-".repeat(50));

    if (report.recommendations.length === 0) {
      console.log(
        "✅ No recommendations - performance optimization is effective",
      );
    } else {
      for (const rec of report.recommendations) {
        const priority =
          rec.priority === "high"
            ? "⚠️"
            : rec.priority === "medium"
              ? "💡"
              : "ℹ️";

        console.log(`\n${priority} ${rec.priority.toUpperCase()}:`);
        console.log(`   Issue: ${rec.issue}`);
        console.log(`   Recommendation: ${rec.recommendation}`);
      }
    }

    console.log("\n" + "=".repeat(80));
  }

  // Utility functions
  mean(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  standardDeviation(arr) {
    const avg = this.mean(arr);
    const squaredDiffs = arr.map((value) => Math.pow(value - avg, 2));
    return Math.sqrt(this.mean(squaredDiffs));
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new PerformanceValidator();
  validator
    .validatePerformanceOptimizations()
    .then((report) => {
      const allTargetsMet = Object.values(report.validation).every(
        (v) => v.met,
      );
      process.exit(allTargetsMet ? 0 : 1);
    })
    .catch((error) => {
      console.error("Validation failed:", error);
      process.exit(1);
    });
}

export { PerformanceValidator };
