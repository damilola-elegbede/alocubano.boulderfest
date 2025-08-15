#!/usr/bin/env node

// IMMEDIATE CI SKIP - Must be at the very top
if (process.env.CI && process.env.SKIP_PERFORMANCE_INTENSIVE_TESTS) {
  console.log("\n⚠️  Skipping performance tests in CI environment");
  console.log("✅ Performance test suite skipped successfully\n");
  process.exit(0);
}

/**
 * Automated Performance Testing Orchestration System
 *
 * Manages K6 test execution, data collection, baseline comparison,
 * and comprehensive reporting generation for A Lo Cubano Boulder Fest.
 *
 * Features:
 * - Orchestrates multiple K6 tests (sequential/parallel)
 * - Baseline management and regression detection
 * - Comprehensive HTML/JSON reporting
 * - CI/CD integration with pass/fail criteria
 * - Alert notifications for performance issues
 */

import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { existsSync, promises as fs } from "fs";
import { execSync, spawn } from "child_process";
import { createWriteStream } from "fs";
import { promisify } from "util";
import { pipeline } from "stream";
import fetch from "node-fetch";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Load environment variables
dotenv.config({ path: join(projectRoot, ".env.local") });
dotenv.config({ path: join(projectRoot, ".env") });

// Constants and Configuration
const REPORTS_DIR = join(projectRoot, "reports", "load-test-results");
const BASELINES_DIR = join(projectRoot, "reports", "performance-baselines");
const TESTS_DIR = join(projectRoot, "tests", "load");
const CONFIG_FILE = join(projectRoot, "config", "performance-thresholds.json");
const ENVIRONMENT_THRESHOLDS = join(
  projectRoot,
  "config",
  "environment-thresholds.json",
);
const THRESHOLD_SELECTOR = join(
  projectRoot,
  "scripts",
  "threshold-selector.js",
);

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

/**
 * Performance Test Configuration (Optimized for Vercel Serverless)
 */
const TEST_CONFIGURATIONS = {
  "ticket-sales": {
    file: "k6-ticket-sales.js",
    name: "Peak Ticket Sales",
    description:
      "Simulates high-traffic ticket purchasing scenarios (serverless-optimized)",
    duration: "12m",
    peakVUs: 100, // Reduced for serverless efficiency
    priority: 1,
    tags: ["sales", "payment", "cart", "serverless"],
    thresholds: {
      http_req_duration: { p95: 800, p99: 2000 }, // Adjusted for cold starts
      http_req_failed: { rate: 0.02 }, // Higher tolerance for serverless
      ticket_purchase_success: { rate: 0.9 }, // More realistic
      checkout_completion: { rate: 0.85 }, // Account for timeouts
    },
  },
  "check-in": {
    file: "k6-check-in-rush.js",
    name: "Check-in Rush",
    description: "High-frequency QR validation (serverless-optimized)",
    duration: "15m",
    peakVUs: 50, // Reduced for serverless stability
    priority: 2,
    tags: ["checkin", "qr", "validation", "serverless"],
    thresholds: {
      http_req_duration: { p95: 200, p99: 500 }, // Account for cold starts
      checkin_success_rate: { rate: 0.95 }, // More realistic
      qr_validation_duration: { avg: 100, p95: 250 }, // Serverless processing
    },
  },
  sustained: {
    file: "k6-sustained-load.js",
    name: "Sustained Load",
    description: "Long-running serverless stability test",
    duration: "20m", // Reduced for cost optimization
    peakVUs: 75, // Optimized for serverless
    priority: 3,
    tags: ["baseline", "sustained", "stability", "serverless"],
    thresholds: {
      http_req_duration: { p95: 800, p99: 2000 }, // Serverless expectations
      http_req_failed: { rate: 0.05 }, // Higher tolerance
      memory_usage: { avg: 256 }, // Vercel function limits
    },
  },
  stress: {
    file: "k6-stress-test.js",
    name: "Stress Test",
    description: "Serverless breaking point analysis",
    duration: "15m", // Reduced duration for cost
    peakVUs: 300, // Reasonable for serverless
    priority: 4,
    tags: ["stress", "capacity", "breaking-point", "serverless"],
    thresholds: {
      http_req_duration: { p95: 3000, p99: 8000 }, // Serverless scaling
      http_req_failed: { rate: 0.15 }, // Higher tolerance for stress
    },
  },
};

// Performance thresholds for regression detection
const REGRESSION_THRESHOLDS = {
  response_time_degradation: 0.1, // 10% slower = regression
  error_rate_increase: 0.02, // 2% increase in errors = regression
  throughput_decrease: 0.15, // 15% decrease in throughput = regression
  success_rate_decrease: 0.05, // 5% decrease in success rate = regression
};

/**
 * Utility Functions
 */
function print(message, color = "reset", bold = false) {
  const colorCode = colors[color] || colors.reset;
  const boldCode = bold ? colors.bold : "";
  console.log(`${boldCode}${colorCode}${message}${colors.reset}`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Environment Detection and Threshold Management
 */
function detectEnvironment() {
  // Check explicit override
  if (process.env.PERF_TEST_ENV) {
    return process.env.PERF_TEST_ENV;
  }

  // Check CI indicators
  if (
    process.env.GITHUB_ACTIONS ||
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION
  ) {
    return "ci";
  }

  // Check URL patterns
  const baseUrl = process.env.LOAD_TEST_BASE_URL || "";
  if (
    baseUrl.includes("staging") ||
    baseUrl.includes("preview") ||
    baseUrl.includes("dev")
  ) {
    return "staging";
  }

  if (
    baseUrl.includes("production") ||
    baseUrl.includes("prod") ||
    baseUrl.includes("alocubanoboulderfest.vercel.app")
  ) {
    return "production";
  }

  // Default fallback
  return "ci";
}

function validateThresholds(testName) {
  try {
    const environment = detectEnvironment();
    print(`🎯 Environment detected: ${environment}`, "cyan");

    // Run threshold selector to validate
    const result = execSync(
      `node "${THRESHOLD_SELECTOR}" validate ${testName}`,
      {
        encoding: "utf8",
        cwd: projectRoot,
        env: { ...process.env, PERF_TEST_ENV: environment },
      },
    );

    print(`✅ Thresholds validated for ${testName} in ${environment}`, "green");
    return true;
  } catch (error) {
    print(`⚠️ Threshold validation warning: ${error.message}`, "yellow");
    return false; // Don't fail, just warn
  }
}

function getThresholdInfo(testName) {
  try {
    const environment = detectEnvironment();
    const result = execSync(
      `node "${THRESHOLD_SELECTOR}" get ${testName} ${environment}`,
      {
        encoding: "utf8",
        cwd: projectRoot,
        env: { ...process.env, PERF_TEST_ENV: environment },
      },
    );

    return JSON.parse(result);
  } catch (error) {
    print(`❌ Failed to get threshold info: ${error.message}`, "red");
    return null;
  }
}

/**
 * K6 Test Executor
 */
class K6TestExecutor {
  constructor(testConfig, options = {}) {
    this.testConfig = testConfig;
    this.options = {
      baseUrl:
        options.baseUrl ||
        process.env.LOAD_TEST_BASE_URL ||
        "http://localhost:3000",
      environment: options.environment || process.env.NODE_ENV || "test",
      outputDir: options.outputDir || REPORTS_DIR,
      verbose: options.verbose || false,
      ...options,
    };

    this.testFile = join(TESTS_DIR, testConfig.file);
    this.testId = `${testConfig.name.toLowerCase().replace(/\s+/g, "-")}-${timestamp()}`;
    this.startTime = null;
    this.endTime = null;
  }

  async execute() {
    print(
      `\n🚀 Starting ${this.testConfig.name} performance test...`,
      "cyan",
      true,
    );
    print(`   File: ${this.testConfig.file}`, "blue");
    print(`   Duration: ${this.testConfig.duration}`, "blue");
    print(`   Peak VUs: ${this.testConfig.peakVUs}`, "blue");
    print(`   Target: ${this.options.baseUrl}`, "blue");

    if (!existsSync(this.testFile)) {
      throw new Error(`Test file not found: ${this.testFile}`);
    }

    await ensureDir(this.options.outputDir);

    this.startTime = Date.now();
    const outputFile = join(this.options.outputDir, `${this.testId}-raw.json`);
    const logFile = join(this.options.outputDir, `${this.testId}-log.txt`);

    // Prepare K6 command
    const k6Command = [
      "k6",
      "run",
      "--out",
      `json=${outputFile}`,
      "--env",
      `LOAD_TEST_BASE_URL=${this.options.baseUrl}`,
      "--env",
      `TEST_ENV=${this.options.environment}`,
      "--env",
      `TEST_ID=${this.testId}`,
      this.testFile,
    ];

    if (this.options.verbose) {
      k6Command.push("--verbose");
    }

    try {
      print("📊 Executing K6 test...", "blue");

      // Execute K6 test with streaming output capture
      await this.executeWithStreaming(k6Command, logFile);

      this.endTime = Date.now();
      const duration = this.endTime - this.startTime;

      print(`✅ Test completed in ${formatDuration(duration)}`, "green");

      // Parse and process results
      const results = await this.parseResults(outputFile);

      return {
        testId: this.testId,
        testConfig: this.testConfig,
        options: this.options,
        startTime: this.startTime,
        endTime: this.endTime,
        duration,
        results,
        outputFile,
        logFile,
      };
    } catch (error) {
      this.endTime = Date.now();
      print(`❌ Test failed: ${error.message}`, "red");
      throw error;
    }
  }

  async executeWithStreaming(command, logFile) {
    return new Promise((resolve, reject) => {
      const process = spawn(command[0], command.slice(1), {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: projectRoot,
      });

      const logStream = createWriteStream(logFile);

      // Stream stdout and stderr to log file and console
      process.stdout.on("data", (data) => {
        const output = data.toString();
        logStream.write(output);
        if (this.options.verbose) {
          console.log(output.trim());
        }
      });

      process.stderr.on("data", (data) => {
        const output = data.toString();
        logStream.write(output);
        if (this.options.verbose) {
          console.error(output.trim());
        }
      });

      process.on("close", (code) => {
        logStream.end();
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`K6 process exited with code ${code}`));
        }
      });

      process.on("error", (error) => {
        logStream.end();
        reject(error);
      });
    });
  }

  async parseResults(outputFile) {
    if (!existsSync(outputFile)) {
      throw new Error(`Results file not found: ${outputFile}`);
    }

    print("📈 Processing test results...", "blue");

    try {
      const rawData = await fs.readFile(outputFile, "utf8");
      const lines = rawData.trim().split("\n");
      const metrics = {};
      const dataPoints = [];

      // Process each JSON line from K6 output
      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line);

          if (data.type === "Metric") {
            metrics[data.metric] = data.data;
          } else if (data.type === "Point") {
            dataPoints.push(data);
          }
        } catch (parseError) {
          // Skip malformed lines
        }
      }

      // Extract key performance indicators
      const summary = this.extractKPIs(metrics, dataPoints);

      return {
        metrics,
        dataPoints,
        summary,
      };
    } catch (error) {
      throw new Error(`Failed to parse results: ${error.message}`);
    }
  }

  extractKPIs(metrics, dataPoints) {
    const kpis = {
      response_times: {},
      error_rates: {},
      throughput: {},
      custom_metrics: {},
    };

    // Extract response time metrics
    if (metrics["http_req_duration"]) {
      kpis.response_times = {
        avg: metrics["http_req_duration"].avg || 0,
        min: metrics["http_req_duration"].min || 0,
        max: metrics["http_req_duration"].max || 0,
        p50: metrics["http_req_duration"]["p(50)"] || 0,
        p95: metrics["http_req_duration"]["p(95)"] || 0,
        p99: metrics["http_req_duration"]["p(99)"] || 0,
      };
    }

    // Extract error rates
    if (metrics["http_req_failed"]) {
      kpis.error_rates.http_failed = metrics["http_req_failed"].rate || 0;
    }

    // Extract throughput metrics
    if (metrics["http_reqs"]) {
      kpis.throughput = {
        total_requests: metrics["http_reqs"].count || 0,
        rate: metrics["http_reqs"].rate || 0,
      };
    }

    // Extract custom business metrics
    const customMetricKeys = Object.keys(metrics).filter(
      (key) =>
        !key.startsWith("http_") &&
        !key.startsWith("data_") &&
        !key.startsWith("vus") &&
        !key.startsWith("iteration"),
    );

    for (const key of customMetricKeys) {
      kpis.custom_metrics[key] = metrics[key];
    }

    return kpis;
  }
}

/**
 * Baseline Management System
 */
class BaselineManager {
  constructor() {
    this.baselinesFile = join(BASELINES_DIR, "performance-baselines.json");
  }

  async loadBaselines() {
    await ensureDir(BASELINES_DIR);

    if (!existsSync(this.baselinesFile)) {
      return {};
    }

    try {
      const data = await fs.readFile(this.baselinesFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      print(`⚠️  Failed to load baselines: ${error.message}`, "yellow");
      return {};
    }
  }

  async saveBaselines(baselines) {
    await ensureDir(BASELINES_DIR);

    try {
      await fs.writeFile(
        this.baselinesFile,
        JSON.stringify(baselines, null, 2),
        "utf8",
      );
      print(`✅ Baselines saved to ${this.baselinesFile}`, "green");
    } catch (error) {
      print(`❌ Failed to save baselines: ${error.message}`, "red");
    }
  }

  async updateBaseline(testName, results) {
    const baselines = await this.loadBaselines();

    baselines[testName] = {
      timestamp: Date.now(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "test",
      kpis: results.summary,
      metadata: {
        testId: results.testId,
        duration: results.duration,
        peakVUs: results.testConfig.peakVUs,
      },
    };

    await this.saveBaselines(baselines);
    print(`📊 Baseline updated for ${testName}`, "blue");
  }

  async compareWithBaseline(testName, currentResults) {
    const baselines = await this.loadBaselines();
    const baseline = baselines[testName];

    if (!baseline) {
      return {
        hasBaseline: false,
        message: "No baseline found - this will become the new baseline",
        regressions: [],
        improvements: [],
      };
    }

    print(
      `🔍 Comparing against baseline from ${new Date(baseline.timestamp).toLocaleDateString()}`,
      "blue",
    );

    const comparison = {
      hasBaseline: true,
      baseline: baseline.kpis,
      current: currentResults.summary,
      regressions: [],
      improvements: [],
      neutral: [],
    };

    // Compare response times
    this.compareMetric(
      comparison,
      "Response Time P95",
      baseline.kpis.response_times?.p95,
      currentResults.summary.response_times?.p95,
      REGRESSION_THRESHOLDS.response_time_degradation,
      "lower_is_better",
    );

    this.compareMetric(
      comparison,
      "Response Time Average",
      baseline.kpis.response_times?.avg,
      currentResults.summary.response_times?.avg,
      REGRESSION_THRESHOLDS.response_time_degradation,
      "lower_is_better",
    );

    // Compare error rates
    this.compareMetric(
      comparison,
      "HTTP Error Rate",
      baseline.kpis.error_rates?.http_failed,
      currentResults.summary.error_rates?.http_failed,
      REGRESSION_THRESHOLDS.error_rate_increase,
      "lower_is_better",
    );

    // Compare throughput
    this.compareMetric(
      comparison,
      "Request Rate",
      baseline.kpis.throughput?.rate,
      currentResults.summary.throughput?.rate,
      REGRESSION_THRESHOLDS.throughput_decrease,
      "higher_is_better",
    );

    // Compare custom metrics
    for (const [metricName, metricData] of Object.entries(
      currentResults.summary.custom_metrics || {},
    )) {
      const baselineValue = baseline.kpis.custom_metrics?.[metricName];
      if (baselineValue && typeof metricData.rate === "number") {
        this.compareMetric(
          comparison,
          metricName
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          baselineValue.rate,
          metricData.rate,
          REGRESSION_THRESHOLDS.success_rate_decrease,
          "higher_is_better",
        );
      }
    }

    return comparison;
  }

  compareMetric(
    comparison,
    name,
    baselineValue,
    currentValue,
    threshold,
    direction,
  ) {
    if (baselineValue == null || currentValue == null) {
      return;
    }

    const percentChange = (currentValue - baselineValue) / baselineValue;
    const isRegression =
      direction === "lower_is_better"
        ? percentChange > threshold
        : percentChange < -threshold;

    const isImprovement =
      direction === "lower_is_better"
        ? percentChange < -threshold
        : percentChange > threshold;

    const result = {
      name,
      baseline: baselineValue,
      current: currentValue,
      change: percentChange,
      changeFormatted: `${(percentChange * 100).toFixed(2)}%`,
    };

    if (isRegression) {
      comparison.regressions.push(result);
    } else if (isImprovement) {
      comparison.improvements.push(result);
    } else {
      comparison.neutral.push(result);
    }
  }
}

/**
 * Report Generation System
 */
class ReportGenerator {
  constructor() {
    this.reportsDir = REPORTS_DIR;
  }

  async generateComprehensiveReport(testResults, comparisons = {}) {
    const reportId = `performance-report-${timestamp()}`;
    const htmlReport = join(this.reportsDir, `${reportId}.html`);
    const jsonReport = join(this.reportsDir, `${reportId}.json`);

    print("📝 Generating comprehensive performance report...", "cyan");

    // Generate JSON report
    const jsonData = {
      reportId,
      timestamp: Date.now(),
      summary: this.generateExecutiveSummary(testResults, comparisons),
      testResults,
      comparisons,
      recommendations: this.generateRecommendations(testResults, comparisons),
      metadata: {
        environment: process.env.NODE_ENV || "test",
        version: process.env.npm_package_version || "1.0.0",
        generator: "performance-test-runner",
        generatorVersion: "1.0.0",
      },
    };

    await fs.writeFile(jsonReport, JSON.stringify(jsonData, null, 2));

    // Generate HTML report
    const htmlContent = await this.generateHTMLReport(jsonData);
    await fs.writeFile(htmlReport, htmlContent);

    print(`✅ Reports generated:`, "green");
    print(`   📊 JSON: ${jsonReport}`, "blue");
    print(`   🌐 HTML: ${htmlReport}`, "blue");

    return {
      htmlReport,
      jsonReport,
      reportData: jsonData,
    };
  }

  generateExecutiveSummary(testResults, comparisons) {
    const summary = {
      totalTests: testResults.length,
      totalDuration: testResults.reduce((sum, r) => sum + r.duration, 0),
      testsWithRegressions: 0,
      totalRegressions: 0,
      criticalIssues: [],
      overallStatus: "PASS",
    };

    // Analyze results
    for (const result of testResults) {
      const testName = result.testConfig.name;
      const comparison = comparisons[testName];

      if (
        comparison &&
        comparison.hasBaseline &&
        comparison.regressions.length > 0
      ) {
        summary.testsWithRegressions++;
        summary.totalRegressions += comparison.regressions.length;

        // Check for critical regressions
        for (const regression of comparison.regressions) {
          if (Math.abs(regression.change) > 0.25) {
            // >25% degradation
            summary.criticalIssues.push({
              test: testName,
              metric: regression.name,
              severity: "CRITICAL",
              change: regression.changeFormatted,
            });
            summary.overallStatus = "FAIL";
          } else if (Math.abs(regression.change) > 0.15) {
            // >15% degradation
            summary.criticalIssues.push({
              test: testName,
              metric: regression.name,
              severity: "WARNING",
              change: regression.changeFormatted,
            });
            if (summary.overallStatus === "PASS") {
              summary.overallStatus = "WARNING";
            }
          }
        }
      }
    }

    return summary;
  }

  generateRecommendations(testResults, comparisons) {
    const recommendations = [];

    // Analyze each test for optimization opportunities
    for (const result of testResults) {
      const testName = result.testConfig.name;
      const kpis = result.results.summary;

      // Response time recommendations
      if (kpis.response_times?.p95 > 1000) {
        recommendations.push({
          type: "PERFORMANCE",
          priority: "HIGH",
          test: testName,
          issue: "High response times detected",
          description: `P95 response time is ${Math.round(kpis.response_times.p95)}ms, exceeding the 1000ms threshold`,
          suggestions: [
            "Implement caching strategies",
            "Optimize database queries",
            "Consider CDN for static assets",
            "Review API endpoint performance",
          ],
        });
      }

      // Error rate recommendations
      if (kpis.error_rates?.http_failed > 0.01) {
        recommendations.push({
          type: "RELIABILITY",
          priority: "CRITICAL",
          test: testName,
          issue: "High error rate detected",
          description: `HTTP error rate is ${(kpis.error_rates.http_failed * 100).toFixed(2)}%, exceeding the 1% threshold`,
          suggestions: [
            "Review application logs for error patterns",
            "Implement circuit breaker patterns",
            "Add retry logic with exponential backoff",
            "Scale infrastructure resources",
          ],
        });
      }

      // Throughput recommendations
      if (kpis.throughput?.rate < result.testConfig.peakVUs * 0.5) {
        recommendations.push({
          type: "CAPACITY",
          priority: "MEDIUM",
          test: testName,
          issue: "Low throughput detected",
          description: `Request rate is lower than expected for the given load`,
          suggestions: [
            "Profile application for bottlenecks",
            "Optimize connection pooling",
            "Consider horizontal scaling",
            "Review load balancer configuration",
          ],
        });
      }
    }

    // Regression-specific recommendations
    for (const [testName, comparison] of Object.entries(comparisons)) {
      if (!comparison.hasBaseline || comparison.regressions.length === 0)
        continue;

      for (const regression of comparison.regressions) {
        recommendations.push({
          type: "REGRESSION",
          priority: Math.abs(regression.change) > 0.25 ? "CRITICAL" : "HIGH",
          test: testName,
          issue: `Performance regression in ${regression.name}`,
          description: `${regression.name} degraded by ${regression.changeFormatted} compared to baseline`,
          suggestions: [
            "Review recent code changes",
            "Check infrastructure changes",
            "Verify database performance",
            "Consider rollback if regression is severe",
          ],
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async generateHTMLReport(reportData) {
    const { summary, testResults, comparisons, recommendations } = reportData;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Test Report - A Lo Cubano Boulder Fest</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1rem; }
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 0.9rem;
            margin-top: 15px;
        }
        .status-pass { background: #d4edda; color: #155724; }
        .status-warning { background: #fff3cd; color: #856404; }
        .status-fail { background: #f8d7da; color: #721c24; }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-left: 4px solid #667eea;
        }
        .metric-value {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .metric-label {
            color: #666;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .section {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        .section h2 {
            color: #333;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #eee;
        }
        
        .test-result {
            border: 1px solid #eee;
            border-radius: 8px;
            margin-bottom: 20px;
            overflow: hidden;
        }
        .test-header {
            background: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #eee;
        }
        .test-name {
            font-size: 1.2rem;
            font-weight: bold;
            color: #333;
        }
        .test-duration {
            color: #666;
            font-size: 0.9rem;
        }
        .test-body {
            padding: 20px;
        }
        
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }
        .kpi-item {
            text-align: center;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 5px;
        }
        .kpi-value {
            font-size: 1.3rem;
            font-weight: bold;
            color: #667eea;
        }
        .kpi-label {
            font-size: 0.8rem;
            color: #666;
            margin-top: 3px;
        }
        
        .comparison {
            margin-top: 15px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .regression {
            color: #dc3545;
            font-weight: bold;
        }
        .improvement {
            color: #28a745;
            font-weight: bold;
        }
        
        .recommendations {
            margin-top: 20px;
        }
        .recommendation {
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 8px;
            border-left: 4px solid;
        }
        .rec-critical { 
            background: #f8d7da; 
            border-color: #dc3545; 
        }
        .rec-high { 
            background: #fff3cd; 
            border-color: #ffc107; 
        }
        .rec-medium { 
            background: #d1ecf1; 
            border-color: #17a2b8; 
        }
        .recommendation h4 {
            margin-bottom: 8px;
        }
        .recommendation ul {
            margin-left: 20px;
            margin-top: 10px;
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9rem;
        }
        
        @media (max-width: 768px) {
            .metrics-grid, .kpi-grid {
                grid-template-columns: 1fr;
            }
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Performance Test Report</h1>
            <p>A Lo Cubano Boulder Fest - Festival Management System</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
            <div class="status-badge status-${summary.overallStatus.toLowerCase()}">
                ${summary.overallStatus}
            </div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${summary.totalTests}</div>
                <div class="metric-label">Tests Executed</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${formatDuration(summary.totalDuration)}</div>
                <div class="metric-label">Total Duration</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.totalRegressions}</div>
                <div class="metric-label">Regressions Found</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.criticalIssues.length}</div>
                <div class="metric-label">Critical Issues</div>
            </div>
        </div>
        
        <div class="section">
            <h2>🧪 Test Results</h2>
            ${testResults.map((result) => this.generateTestResultHTML(result, comparisons[result.testConfig.name])).join("")}
        </div>
        
        ${
          recommendations.length > 0
            ? `
        <div class="section">
            <h2>💡 Recommendations</h2>
            <div class="recommendations">
                ${recommendations
                  .map(
                    (rec) => `
                    <div class="recommendation rec-${rec.priority.toLowerCase()}">
                        <h4>🔍 ${rec.issue} (${rec.test})</h4>
                        <p><strong>Priority:</strong> ${rec.priority}</p>
                        <p>${rec.description}</p>
                        <ul>
                            ${rec.suggestions.map((s) => `<li>${s}</li>`).join("")}
                        </ul>
                    </div>
                `,
                  )
                  .join("")}
            </div>
        </div>
        `
            : ""
        }
        
        <div class="footer">
            <p>Generated by A Lo Cubano Performance Test Runner v1.0.0</p>
            <p>Report ID: ${reportData.reportId}</p>
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  generateTestResultHTML(result, comparison) {
    const kpis = result.results.summary;

    return `
        <div class="test-result">
            <div class="test-header">
                <div class="test-name">${result.testConfig.name}</div>
                <div class="test-duration">
                    Duration: ${formatDuration(result.duration)} | 
                    Peak VUs: ${result.testConfig.peakVUs} |
                    Test ID: ${result.testId}
                </div>
            </div>
            <div class="test-body">
                <div class="kpi-grid">
                    <div class="kpi-item">
                        <div class="kpi-value">${Math.round(kpis.response_times?.avg || 0)}ms</div>
                        <div class="kpi-label">Avg Response</div>
                    </div>
                    <div class="kpi-item">
                        <div class="kpi-value">${Math.round(kpis.response_times?.p95 || 0)}ms</div>
                        <div class="kpi-label">P95 Response</div>
                    </div>
                    <div class="kpi-item">
                        <div class="kpi-value">${((kpis.error_rates?.http_failed || 0) * 100).toFixed(2)}%</div>
                        <div class="kpi-label">Error Rate</div>
                    </div>
                    <div class="kpi-item">
                        <div class="kpi-value">${(kpis.throughput?.rate || 0).toFixed(1)}/s</div>
                        <div class="kpi-label">Req/sec</div>
                    </div>
                </div>
                
                ${
                  comparison && comparison.hasBaseline
                    ? `
                    <div class="comparison">
                        <h4>📊 Baseline Comparison</h4>
                        ${
                          comparison.regressions.length > 0
                            ? `
                            <div class="regression">
                                ⚠️ ${comparison.regressions.length} regression(s) detected:
                                <ul>
                                    ${comparison.regressions
                                      .map(
                                        (r) =>
                                          `<li>${r.name}: ${r.changeFormatted} slower</li>`,
                                      )
                                      .join("")}
                                </ul>
                            </div>
                        `
                            : ""
                        }
                        ${
                          comparison.improvements.length > 0
                            ? `
                            <div class="improvement">
                                ✅ ${comparison.improvements.length} improvement(s):
                                <ul>
                                    ${comparison.improvements
                                      .map(
                                        (r) =>
                                          `<li>${r.name}: ${r.changeFormatted} better</li>`,
                                      )
                                      .join("")}
                                </ul>
                            </div>
                        `
                            : ""
                        }
                    </div>
                `
                    : comparison
                      ? `
                    <div class="comparison">
                        <p>📈 No baseline found - results will become the new baseline</p>
                    </div>
                `
                      : ""
                }
            </div>
        </div>
    `;
  }
}

/**
 * Alert and Notification System
 */
class AlertSystem {
  constructor() {
    this.webhookUrl = process.env.ALERT_WEBHOOK_URL;
    this.escalationUrl = process.env.ESCALATION_WEBHOOK_URL;
  }

  async sendAlert(level, message, details = {}) {
    if (!this.webhookUrl) {
      print("⚠️  No webhook configured for alerts", "yellow");
      return;
    }

    const payload = {
      text: message,
      username: "Performance Test Runner",
      icon_emoji: level === "critical" ? ":rotating_light:" : ":warning:",
      attachments: [
        {
          color: level === "critical" ? "danger" : "warning",
          fields: [
            {
              title: "Environment",
              value: process.env.NODE_ENV || "test",
              short: true,
            },
            {
              title: "Timestamp",
              value: new Date().toISOString(),
              short: true,
            },
          ],
        },
      ],
    };

    // Add details to attachment
    if (details.regressions) {
      payload.attachments[0].fields.push({
        title: "Regressions",
        value: details.regressions
          .map((r) => `• ${r.name}: ${r.changeFormatted}`)
          .join("\n"),
        short: false,
      });
    }

    try {
      const url =
        level === "critical" && this.escalationUrl
          ? this.escalationUrl
          : this.webhookUrl;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        print(`✅ Alert sent: ${message}`, "green");
      } else {
        print(`❌ Failed to send alert: ${response.status}`, "red");
      }
    } catch (error) {
      print(`❌ Alert sending failed: ${error.message}`, "red");
    }
  }

  async notifyResults(summary, criticalRegressions = []) {
    if (summary.overallStatus === "FAIL") {
      await this.sendAlert(
        "critical",
        `🚨 Performance tests FAILED with ${summary.criticalIssues.length} critical issues`,
        {
          regressions: criticalRegressions.slice(0, 5), // Limit to first 5
        },
      );
    } else if (summary.overallStatus === "WARNING") {
      await this.sendAlert(
        "warning",
        `⚠️ Performance tests completed with warnings: ${summary.totalRegressions} regressions detected`,
      );
    }
  }
}

/**
 * Main Test Orchestrator
 */
class PerformanceTestOrchestrator {
  constructor(options = {}) {
    this.options = {
      baseUrl:
        options.baseUrl ||
        process.env.LOAD_TEST_BASE_URL ||
        "http://localhost:3000",
      environment: options.environment || process.env.NODE_ENV || "test",
      parallel: options.parallel || false,
      updateBaselines: options.updateBaselines || false,
      testsToRun: options.testsToRun || Object.keys(TEST_CONFIGURATIONS),
      verbose: options.verbose || false,
      skipHealthCheck: options.skipHealthCheck || false,
      ...options,
    };

    this.reportsDir = REPORTS_DIR; // Initialize reportsDir property
    this.baselineManager = new BaselineManager();
    this.reportGenerator = new ReportGenerator();
    this.alertSystem = new AlertSystem();
  }

  async execute() {
    print("🎪 A Lo Cubano Performance Test Orchestrator", "magenta", true);
    print("================================================", "magenta");

    const startTime = Date.now();

    try {
      // Pre-flight checks
      await this.preFlightChecks();

      // Execute tests
      const testResults = await this.executeTests();

      // Compare with baselines
      const comparisons = await this.compareWithBaselines(testResults);

      // Update baselines if requested
      if (this.options.updateBaselines) {
        await this.updateAllBaselines(testResults);
      }

      // Generate reports
      const report = await this.reportGenerator.generateComprehensiveReport(
        testResults,
        comparisons,
      );

      // Send alerts if needed
      const criticalRegressions = this.extractCriticalRegressions(comparisons);
      await this.alertSystem.notifyResults(
        report.reportData.summary,
        criticalRegressions,
      );

      // Final summary
      const totalDuration = Date.now() - startTime;
      this.printFinalSummary(report.reportData.summary, totalDuration);

      return {
        success: report.reportData.summary.overallStatus !== "FAIL",
        report: report.reportData,
        testResults,
        comparisons,
      };
    } catch (error) {
      print(`❌ Test execution failed: ${error.message}`, "red");
      await this.alertSystem.sendAlert(
        "critical",
        `Performance test execution failed: ${error.message}`,
      );
      throw error;
    }
  }

  async preFlightChecks() {
    print("\n🔍 Running pre-flight checks...", "cyan");

    // Check K6 installation
    try {
      execSync("k6 version", { stdio: "pipe" });
      print("  ✅ K6 is installed", "green");
    } catch (error) {
      throw new Error(
        "K6 is not installed. Install with: brew install k6 (macOS) or https://k6.io/docs/getting-started/installation/",
      );
    }

    // Detect Vercel deployment environment
    if (this.options.baseUrl.includes("vercel.app")) {
      print(
        "  🌐 Detected Vercel deployment - optimizing for serverless",
        "blue",
      );
      this.isVercelDeployment = true;
    }

    // Verify test files exist
    for (const testName of this.options.testsToRun) {
      const config = TEST_CONFIGURATIONS[testName];
      if (!config) {
        throw new Error(`Unknown test: ${testName}`);
      }

      const testFile = join(TESTS_DIR, config.file);
      if (!existsSync(testFile)) {
        throw new Error(`Test file not found: ${testFile}`);
      }
    }
    print("  ✅ All test files found", "green");

    // Health check with serverless awareness
    if (!this.options.skipHealthCheck) {
      try {
        const healthUrl = `${this.options.baseUrl}/api/health/check`;
        const response = await fetch(healthUrl, {
          timeout: this.isVercelDeployment ? 15000 : 10000, // Extended for cold starts
        });
        if (response.ok) {
          print("  ✅ Target system is healthy", "green");

          // For Vercel, also check function regions
          if (this.isVercelDeployment) {
            const region =
              response.headers.get("x-vercel-edge-region") || "unknown";
            print(`  🌍 Vercel edge region: ${region}`, "blue");
          }
        } else {
          print("  ⚠️  Target system returned non-200 status", "yellow");
        }
      } catch (error) {
        if (this.isVercelDeployment) {
          print(
            "  ⚠️  Cold start detected, functions may need warming",
            "yellow",
          );
        } else {
          print("  ⚠️  Health check failed, continuing anyway", "yellow");
        }
      }
    }

    // Create directories
    await ensureDir(this.reportsDir);
    await ensureDir(BASELINES_DIR);

    print("✅ Pre-flight checks completed", "green");
  }

  async executeTests() {
    print("\n🚀 Executing performance tests...", "cyan");

    const testsToExecute = this.options.testsToRun
      .map((name) => TEST_CONFIGURATIONS[name])
      .sort((a, b) => a.priority - b.priority);

    const results = [];

    // Warm up functions if running against Vercel
    if (this.isVercelDeployment) {
      await this.warmUpVercelFunctions();
    }

    if (this.options.parallel && testsToExecute.length > 1) {
      print("📊 Running tests in parallel...", "blue");
      if (this.isVercelDeployment) {
        print(
          "  ⚠️  Parallel execution on Vercel may hit rate limits",
          "yellow",
        );
      }

      // Execute tests in parallel
      const promises = testsToExecute.map(async (testConfig) => {
        const executor = new K6TestExecutor(testConfig, this.options);
        return await executor.execute();
      });

      const parallelResults = await Promise.allSettled(promises);

      for (let i = 0; i < parallelResults.length; i++) {
        const result = parallelResults[i];
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          print(
            `❌ Test ${testsToExecute[i].name} failed: ${result.reason.message}`,
            "red",
          );
          throw result.reason;
        }
      }
    } else {
      print("📊 Running tests sequentially...", "blue");

      // Execute tests sequentially
      for (const testConfig of testsToExecute) {
        const executor = new K6TestExecutor(testConfig, this.options);
        const result = await executor.execute();
        results.push(result);

        // Brief pause between tests
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Post-test analysis for Vercel
    if (this.isVercelDeployment) {
      await this.analyzeVercelPerformance(results);
    }

    print(`✅ All ${results.length} tests completed successfully`, "green");
    return results;
  }

  async warmUpVercelFunctions() {
    print("🔥 Warming up Vercel serverless functions...", "blue");

    const warmupEndpoints = [
      "/api/health/check",
      "/api/cart/create",
      "/api/tickets/availability",
      "/api/monitoring/metrics",
    ];

    const warmupPromises = warmupEndpoints.map(async (endpoint) => {
      try {
        await fetch(`${this.options.baseUrl}${endpoint}`, { timeout: 10000 });
      } catch (error) {
        // Ignore warmup failures
      }
    });

    await Promise.allSettled(warmupPromises);
    print("  🔥 Function warm-up completed", "green");

    // Allow functions to initialize
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  async analyzeVercelPerformance(results) {
    print("\n📊 Analyzing Vercel serverless performance...", "cyan");

    for (const result of results) {
      const kpis = result.results.summary;

      // Check for cold start indicators
      const coldStartRate = this.calculateColdStartRate(result);
      if (coldStartRate > 0.1) {
        print(
          `  ❄️  High cold start rate detected in ${result.testConfig.name}: ${(coldStartRate * 100).toFixed(1)}%`,
          "yellow",
        );
      }

      // Check for serverless timeout issues
      const timeoutRate = this.calculateTimeoutRate(result);
      if (timeoutRate > 0.05) {
        print(
          `  ⏱️  Function timeouts detected in ${result.testConfig.name}: ${(timeoutRate * 100).toFixed(1)}%`,
          "yellow",
        );
      }
    }
  }

  calculateColdStartRate(result) {
    // Heuristic: requests > 2s response time likely cold starts
    const slowRequests =
      result.results.dataPoints?.filter(
        (point) =>
          point.metric === "http_req_duration" && point.data.value > 2000,
      ) || [];

    const totalRequests =
      result.results.summary.throughput?.total_requests || 1;
    return slowRequests.length / totalRequests;
  }

  calculateTimeoutRate(result) {
    // Look for 504 Gateway Timeout responses
    const timeouts =
      result.results.dataPoints?.filter(
        (point) =>
          point.metric === "http_req_failed" && point.tags?.status === "504",
      ) || [];

    const totalRequests =
      result.results.summary.throughput?.total_requests || 1;
    return timeouts.length / totalRequests;
  }

  async compareWithBaselines(testResults) {
    print("\n📊 Comparing results with baselines...", "cyan");

    const comparisons = {};

    for (const result of testResults) {
      const testName = result.testConfig.name
        .toLowerCase()
        .replace(/\s+/g, "-");
      const comparison = await this.baselineManager.compareWithBaseline(
        testName,
        result,
      );
      comparisons[result.testConfig.name] = comparison;

      if (comparison.hasBaseline) {
        if (comparison.regressions.length > 0) {
          print(
            `  ⚠️  ${result.testConfig.name}: ${comparison.regressions.length} regression(s)`,
            "yellow",
          );
        } else if (comparison.improvements.length > 0) {
          print(
            `  ✅ ${result.testConfig.name}: ${comparison.improvements.length} improvement(s)`,
            "green",
          );
        } else {
          print(`  📊 ${result.testConfig.name}: Performance stable`, "blue");
        }
      } else {
        print(
          `  📈 ${result.testConfig.name}: No baseline (first run)`,
          "blue",
        );
      }
    }

    return comparisons;
  }

  async updateAllBaselines(testResults) {
    print("\n💾 Updating performance baselines...", "cyan");

    for (const result of testResults) {
      const testName = result.testConfig.name
        .toLowerCase()
        .replace(/\s+/g, "-");
      await this.baselineManager.updateBaseline(testName, result);
    }
  }

  extractCriticalRegressions(comparisons) {
    const critical = [];

    for (const [testName, comparison] of Object.entries(comparisons)) {
      if (comparison.hasBaseline && comparison.regressions.length > 0) {
        for (const regression of comparison.regressions) {
          if (Math.abs(regression.change) > 0.25) {
            critical.push({
              test: testName,
              name: regression.name,
              changeFormatted: regression.changeFormatted,
            });
          }
        }
      }
    }

    return critical;
  }

  printFinalSummary(summary, totalDuration) {
    print("\n================================================", "magenta");
    print("             EXECUTION SUMMARY", "magenta", true);
    print("================================================", "magenta");

    print(`📊 Tests Executed: ${summary.totalTests}`, "blue");
    print(`⏱️  Total Duration: ${formatDuration(totalDuration)}`, "blue");
    print(`📈 Regressions Found: ${summary.totalRegressions}`, "blue");
    print(`🚨 Critical Issues: ${summary.criticalIssues.length}`, "blue");
    print(
      `🎯 Overall Status: ${summary.overallStatus}`,
      summary.overallStatus === "PASS"
        ? "green"
        : summary.overallStatus === "WARNING"
          ? "yellow"
          : "red",
      true,
    );

    if (summary.criticalIssues.length > 0) {
      print("\n🚨 Critical Issues:", "red", true);
      for (const issue of summary.criticalIssues.slice(0, 5)) {
        print(
          `  • ${issue.test}: ${issue.metric} degraded by ${issue.change}`,
          "red",
        );
      }
    }

    print("\n📁 Reports generated in:", "cyan");
    print(`   ${REPORTS_DIR}`, "blue");
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse CLI options
  const options = {
    baseUrl: process.env.LOAD_TEST_BASE_URL || "http://localhost:3000",
    environment: detectEnvironment(), // Use environment detection
    parallel: args.includes("--parallel"),
    updateBaselines: args.includes("--update-baselines"),
    verbose: args.includes("--verbose") || args.includes("-v"),
    skipHealthCheck: args.includes("--skip-health-check"),
    testsToRun: Object.keys(TEST_CONFIGURATIONS),
  };

  // Display environment and threshold information
  print("\n🎯 Performance Test Configuration", "cyan", true);
  print(`Environment: ${options.environment}`, "blue");
  print(`Base URL: ${options.baseUrl}`, "blue");

  // Validate thresholds for all tests
  print("\n🔍 Validating Dynamic Thresholds...", "cyan");
  for (const testName of options.testsToRun) {
    validateThresholds(testName);
  }

  // Parse specific tests to run
  const testArg = args.find((arg) => arg.startsWith("--tests="));
  if (testArg) {
    options.testsToRun = testArg.split("=")[1].split(",");
  }

  // Parse base URL
  const urlArg = args.find((arg) => arg.startsWith("--url="));
  if (urlArg) {
    options.baseUrl = urlArg.split("=")[1];
  }

  // Show help
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🎪 A Lo Cubano Performance Test Runner

Usage: node scripts/performance-test-runner.js [options]

Options:
  --tests=<list>        Comma-separated list of tests to run
                        Available: ${Object.keys(TEST_CONFIGURATIONS).join(", ")}
                        Default: all tests
  
  --url=<url>           Base URL for testing
                        Default: http://localhost:3000
  
  --parallel            Run tests in parallel (faster but more resource intensive)
  
  --update-baselines    Update performance baselines with current results
  
  --skip-health-check   Skip target system health check
  
  --verbose, -v         Enable verbose output
  
  --help, -h           Show this help message

Examples:
  # Run all tests sequentially
  node scripts/performance-test-runner.js
  
  # Run specific tests in parallel
  node scripts/performance-test-runner.js --tests=ticket-sales,check-in --parallel
  
  # Update baselines after running tests
  node scripts/performance-test-runner.js --update-baselines
  
  # Run against staging environment
  node scripts/performance-test-runner.js --url=https://staging.alocubano.com

Environment Variables:
  LOAD_TEST_BASE_URL          Target URL for tests
  ALERT_WEBHOOK_URL           Webhook for performance alerts
  ESCALATION_WEBHOOK_URL      Webhook for critical issues
  NODE_ENV                    Environment (test, staging, production)
`);
    process.exit(0);
  }

  try {
    const orchestrator = new PerformanceTestOrchestrator(options);
    const result = await orchestrator.execute();

    // Exit with appropriate code for CI/CD
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    print(`\n❌ Performance testing failed: ${error.message}`, "red");
    process.exit(1);
  }
}

// Run if called directly
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("performance-test-runner.js")
) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export {
  PerformanceTestOrchestrator,
  K6TestExecutor,
  BaselineManager,
  ReportGenerator,
  AlertSystem,
  TEST_CONFIGURATIONS,
  REGRESSION_THRESHOLDS,
};
