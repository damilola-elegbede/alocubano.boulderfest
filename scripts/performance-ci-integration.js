#!/usr/bin/env node

/**
 * Performance Testing CI/CD Integration for Vercel Deployments
 *
 * This script integrates performance testing into the CI/CD pipeline,
 * with special handling for Vercel preview deployments and serverless optimization.
 *
 * Features:
 * - Automatic Vercel deployment URL detection
 * - Serverless-optimized test execution
 * - Performance regression detection
 * - Deployment approval/rejection based on performance
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promises as fs } from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
import {
  PerformanceTestOrchestrator,
  BaselineManager,
} from "./performance-test-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Load environment variables
dotenv.config({ path: join(projectRoot, ".env.vercel") });
dotenv.config({ path: join(projectRoot, ".env") });

/**
 * CI/CD Performance Testing Configuration
 */
const CI_CONFIG = {
  // Performance gates for different deployment types
  gates: {
    preview: {
      max_degradation: 0.15, // 15% performance degradation allowed
      max_error_rate: 0.05, // 5% error rate threshold
      timeout_seconds: 300, // 5 minute test timeout
      tests: ["ticket-sales"], // Critical path only
    },
    production: {
      max_degradation: 0.05, // 5% degradation for production
      max_error_rate: 0.02, // 2% error rate threshold
      timeout_seconds: 600, // 10 minute test timeout
      tests: ["ticket-sales", "check-in"], // Full critical path
    },
  },

  // Vercel-specific settings
  vercel: {
    deployment_timeout: 120, // Wait up to 2 minutes for deployment
    function_warmup_time: 30, // Function warm-up time in seconds
    regions: ["us-east-1"], // Primary region for testing
    max_retries: 2, // Retry failed tests due to cold starts
  },
};

/**
 * Vercel Deployment Manager
 */
class VercelDeploymentManager {
  constructor() {
    this.vercelToken = process.env.VERCEL_TOKEN;
    this.projectId = process.env.VERCEL_PROJECT_ID;
    this.teamId = process.env.VERCEL_TEAM_ID;
  }

  async getDeploymentUrl() {
    // Check for environment-provided URL first
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }

    if (process.env.LOAD_TEST_BASE_URL) {
      return process.env.LOAD_TEST_BASE_URL;
    }

    // For local development
    if (process.env.NODE_ENV === "development") {
      return "http://localhost:3000";
    }

    // Attempt to get latest deployment from Vercel API
    if (this.vercelToken && this.projectId) {
      return await this.getLatestDeployment();
    }

    throw new Error(
      "No deployment URL available. Set VERCEL_URL or LOAD_TEST_BASE_URL environment variable.",
    );
  }

  async getLatestDeployment() {
    const headers = {
      Authorization: `Bearer ${this.vercelToken}`,
      "Content-Type": "application/json",
    };

    const params = new URLSearchParams({
      projectId: this.projectId,
      limit: "1",
      state: "READY",
    });

    if (this.teamId) {
      params.append("teamId", this.teamId);
    }

    try {
      const response = await fetch(
        `https://api.vercel.com/v6/deployments?${params}`,
        {
          headers,
          timeout: 10000,
        },
      );

      if (!response.ok) {
        throw new Error(`Vercel API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.deployments && data.deployments.length > 0) {
        const deployment = data.deployments[0];
        return `https://${deployment.url}`;
      }

      throw new Error("No ready deployments found");
    } catch (error) {
      console.error("Failed to get deployment from Vercel API:", error.message);
      throw error;
    }
  }

  async waitForDeployment(deploymentUrl, timeoutSeconds = 120) {
    const startTime = Date.now();
    const timeout = timeoutSeconds * 1000;

    console.log(`⏳ Waiting for deployment to be ready: ${deploymentUrl}`);

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${deploymentUrl}/api/health/check`, {
          timeout: 10000,
          headers: {
            "User-Agent": "Performance-Test-CI/1.0",
          },
        });

        if (response.ok) {
          console.log("✅ Deployment is ready");
          return true;
        }

        console.log(`⏳ Deployment not ready (${response.status}), waiting...`);
      } catch (error) {
        console.log(`⏳ Deployment not ready (${error.message}), waiting...`);
      }

      // Wait 10 seconds before next check
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    throw new Error(`Deployment not ready after ${timeoutSeconds} seconds`);
  }
}

/**
 * CI Performance Gate
 */
class PerformanceGate {
  constructor(config, deploymentType = "preview") {
    this.config = config.gates[deploymentType];
    this.deploymentType = deploymentType;
    this.baselineManager = new BaselineManager();
  }

  async evaluate(testResults, comparisons = {}) {
    console.log(`\n🚦 Evaluating performance gate (${this.deploymentType})...`);

    const results = {
      passed: true,
      issues: [],
      metrics: {},
      recommendations: [],
    };

    // Check error rates
    for (const result of testResults) {
      const errorRate = result.results.summary.error_rates?.http_failed || 0;
      results.metrics[`${result.testConfig.name}_error_rate`] = errorRate;

      if (errorRate > this.config.max_error_rate) {
        results.passed = false;
        results.issues.push({
          type: "error_rate",
          test: result.testConfig.name,
          value: errorRate,
          threshold: this.config.max_error_rate,
          severity: "high",
        });
      }
    }

    // Check performance degradation
    for (const [testName, comparison] of Object.entries(comparisons)) {
      if (comparison.hasBaseline && comparison.regressions.length > 0) {
        const maxRegression = Math.max(
          ...comparison.regressions.map((r) => Math.abs(r.change)),
        );
        results.metrics[`${testName}_max_degradation`] = maxRegression;

        if (maxRegression > this.config.max_degradation) {
          results.passed = false;
          results.issues.push({
            type: "performance_degradation",
            test: testName,
            value: maxRegression,
            threshold: this.config.max_degradation,
            severity:
              maxRegression > this.config.max_degradation * 2
                ? "critical"
                : "high",
            regressions: comparison.regressions,
          });
        }
      }
    }

    // Generate recommendations
    if (!results.passed) {
      results.recommendations = this.generateRecommendations(results.issues);
    }

    return results;
  }

  generateRecommendations(issues) {
    const recommendations = [];

    for (const issue of issues) {
      switch (issue.type) {
        case "error_rate":
          recommendations.push({
            category: "Reliability",
            priority: "High",
            suggestion: "Investigate error patterns and implement retry logic",
            details: `${issue.test} has ${(issue.value * 100).toFixed(2)}% error rate (threshold: ${(issue.threshold * 100).toFixed(2)}%)`,
          });
          break;

        case "performance_degradation":
          recommendations.push({
            category: "Performance",
            priority: issue.severity === "critical" ? "Critical" : "High",
            suggestion: "Review recent changes for performance impact",
            details: `${issue.test} degraded by ${(issue.value * 100).toFixed(2)}% (threshold: ${(issue.threshold * 100).toFixed(2)}%)`,
          });
          break;
      }
    }

    return recommendations;
  }

  printResults(results) {
    console.log(
      `\n🚦 Performance Gate Results (${this.deploymentType.toUpperCase()}):`,
    );
    console.log("=".repeat(50));

    if (results.passed) {
      console.log("✅ PASSED - Deployment approved");
    } else {
      console.log("❌ FAILED - Performance gate blocked deployment");
    }

    console.log(`\n📊 Metrics:`);
    for (const [metric, value] of Object.entries(results.metrics)) {
      console.log(
        `  ${metric}: ${typeof value === "number" ? (value * 100).toFixed(2) + "%" : value}`,
      );
    }

    if (results.issues.length > 0) {
      console.log(`\n⚠️  Issues (${results.issues.length}):`);
      for (const issue of results.issues) {
        console.log(
          `  [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.test}`,
        );
        console.log(
          `    Value: ${(issue.value * 100).toFixed(2)}% | Threshold: ${(issue.threshold * 100).toFixed(2)}%`,
        );
      }
    }

    if (results.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      for (const rec of results.recommendations) {
        console.log(`  [${rec.priority}] ${rec.category}: ${rec.suggestion}`);
        console.log(`    ${rec.details}`);
      }
    }

    return results.passed;
  }
}

/**
 * Main CI Integration Function
 */
async function runCIPerformanceTests() {
  console.log("🎯 A Lo Cubano Performance CI Integration");
  console.log("==========================================");

  try {
    // Determine deployment type
    const deploymentType =
      process.env.VERCEL_ENV === "production" ? "production" : "preview";
    const isCI = process.env.CI === "true";

    console.log(`🏗️  Deployment Type: ${deploymentType}`);
    console.log(`🤖 CI Environment: ${isCI ? "Yes" : "No"}`);

    // Get deployment URL
    const deploymentManager = new VercelDeploymentManager();
    const deploymentUrl = await deploymentManager.getDeploymentUrl();

    console.log(`🌐 Target URL: ${deploymentUrl}`);

    // Wait for deployment to be ready
    if (deploymentUrl.includes("vercel.app")) {
      await deploymentManager.waitForDeployment(
        deploymentUrl,
        CI_CONFIG.vercel.deployment_timeout,
      );

      // Additional warm-up time for serverless functions
      console.log(
        `🔥 Warming up serverless functions (${CI_CONFIG.vercel.function_warmup_time}s)...`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, CI_CONFIG.vercel.function_warmup_time * 1000),
      );
    }

    // Configure performance tests
    const testConfig = CI_CONFIG.gates[deploymentType];
    const orchestrator = new PerformanceTestOrchestrator({
      baseUrl: deploymentUrl,
      environment: deploymentType,
      testsToRun: testConfig.tests,
      timeout: testConfig.timeout_seconds,
      verbose: false,
      skipHealthCheck: false,
    });

    // Execute performance tests with retries
    let testResults = null;
    let comparisons = null;

    for (
      let attempt = 1;
      attempt <= CI_CONFIG.vercel.max_retries + 1;
      attempt++
    ) {
      try {
        console.log(
          `\n🧪 Running performance tests (attempt ${attempt}/${CI_CONFIG.vercel.max_retries + 1})...`,
        );

        const result = await orchestrator.execute();
        testResults = result.testResults;
        comparisons = result.comparisons;

        console.log("✅ Performance tests completed successfully");
        break;
      } catch (error) {
        if (attempt <= CI_CONFIG.vercel.max_retries) {
          console.log(`⚠️  Test attempt ${attempt} failed: ${error.message}`);
          console.log(`🔄 Retrying in 30 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 30000));
        } else {
          throw error;
        }
      }
    }

    if (!testResults) {
      throw new Error("All test attempts failed");
    }

    // Evaluate performance gate
    const gate = new PerformanceGate(CI_CONFIG, deploymentType);
    const gateResults = await gate.evaluate(testResults, comparisons);
    const passed = gate.printResults(gateResults);

    // Set output for GitHub Actions
    if (isCI && process.env.GITHUB_OUTPUT) {
      await fs.appendFile(
        process.env.GITHUB_OUTPUT,
        `performance_passed=${passed}\n` +
          `performance_issues=${gateResults.issues.length}\n` +
          `deployment_url=${deploymentUrl}\n`,
      );
    }

    // Exit with appropriate code
    process.exit(passed ? 0 : 1);
  } catch (error) {
    console.error("❌ CI Performance Testing Failed:", error.message);

    // Set failure output for GitHub Actions
    if (process.env.CI === "true" && process.env.GITHUB_OUTPUT) {
      await fs.appendFile(
        process.env.GITHUB_OUTPUT,
        `performance_passed=false\n` + `performance_error=${error.message}\n`,
      );
    }

    process.exit(1);
  }
}

// CLI handling
if (import.meta.url === `file://${process.argv[1]}`) {
  runCIPerformanceTests().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { VercelDeploymentManager, PerformanceGate, runCIPerformanceTests };
