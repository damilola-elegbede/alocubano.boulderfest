#!/usr/bin/env node

/**
 * Performance Regression Detection Script
 * Compares current performance results with baseline
 */

import fs from "fs";
import path from "path";

const PERFORMANCE_THRESHOLD = {
  response_time: 0.2, // 20% increase is concerning
  error_rate: 0.05, // 5% increase in errors is critical
  throughput: -0.15, // 15% decrease in throughput is concerning
};

async function comparePerformanceResults() {
  try {
    console.log("📊 Starting performance regression analysis...");

    const baselineFile = "baseline-performance.json";
    const currentFile = "performance-results.json";

    if (!fs.existsSync(baselineFile)) {
      console.log("⚠️ No baseline performance data found");
      console.log("💾 Current results will be saved as new baseline");

      if (fs.existsSync(currentFile)) {
        fs.copyFileSync(currentFile, baselineFile);
        console.log("✅ Baseline created successfully");
      }
      return;
    }

    const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
    const current = JSON.parse(fs.readFileSync(currentFile, "utf8"));

    const comparison = analyzePerformanceRegression(baseline, current);

    // Generate report
    const report = generatePerformanceReport(comparison);

    // Save detailed report
    fs.writeFileSync(
      "performance-regression-report.json",
      JSON.stringify(comparison, null, 2),
    );
    fs.writeFileSync("performance-regression-report.md", report);

    console.log("\n" + report);

    // Check for critical regressions
    if (comparison.criticalRegressions.length > 0) {
      console.error("\n❌ Critical performance regressions detected!");
      process.exit(1);
    }

    if (comparison.concerningRegressions.length > 0) {
      console.warn(
        "\n⚠️ Performance concerns detected, but within acceptable thresholds",
      );
    }

    console.log("\n✅ Performance analysis completed");
  } catch (error) {
    console.error("❌ Performance analysis failed:", error.message);
    process.exit(1);
  }
}

function analyzePerformanceRegression(baseline, current) {
  const comparison = {
    timestamp: new Date().toISOString(),
    baseline: baseline.timestamp || "unknown",
    current: current.timestamp || "unknown",
    metrics: {},
    criticalRegressions: [],
    concerningRegressions: [],
    improvements: [],
  };

  // Compare key metrics
  const metrics = [
    "response_time",
    "error_rate",
    "throughput",
    "cpu_usage",
    "memory_usage",
  ];

  for (const metric of metrics) {
    if (baseline[metric] && current[metric]) {
      const baselineValue = parseFloat(baseline[metric]);
      const currentValue = parseFloat(current[metric]);
      const change = (currentValue - baselineValue) / baselineValue;

      comparison.metrics[metric] = {
        baseline: baselineValue,
        current: currentValue,
        change: change,
        changePercent: (change * 100).toFixed(2) + "%",
        status: determineStatus(metric, change),
      };

      // Categorize regressions
      if (comparison.metrics[metric].status === "critical") {
        comparison.criticalRegressions.push({
          metric,
          change: comparison.metrics[metric].changePercent,
          impact: getImpactDescription(metric, change),
        });
      } else if (comparison.metrics[metric].status === "concerning") {
        comparison.concerningRegressions.push({
          metric,
          change: comparison.metrics[metric].changePercent,
          impact: getImpactDescription(metric, change),
        });
      } else if (comparison.metrics[metric].status === "improved") {
        comparison.improvements.push({
          metric,
          change: comparison.metrics[metric].changePercent,
          impact: getImpactDescription(metric, change),
        });
      }
    }
  }

  return comparison;
}

function determineStatus(metric, change) {
  const threshold = PERFORMANCE_THRESHOLD[metric];
  if (!threshold) return "unknown";

  if (metric === "throughput") {
    // For throughput, negative change is bad
    if (change <= threshold) return "critical";
    if (change <= threshold * 0.5) return "concerning";
    if (change > 0) return "improved";
  } else {
    // For response_time, error_rate, positive change is bad
    if (change >= threshold) return "critical";
    if (change >= threshold * 0.5) return "concerning";
    if (change < 0) return "improved";
  }

  return "stable";
}

function getImpactDescription(metric, change) {
  const absChange = Math.abs(change * 100);

  switch (metric) {
    case "response_time":
      return change > 0
        ? `Response time increased by ${absChange.toFixed(1)}%`
        : `Response time improved by ${absChange.toFixed(1)}%`;
    case "error_rate":
      return change > 0
        ? `Error rate increased by ${absChange.toFixed(1)}%`
        : `Error rate decreased by ${absChange.toFixed(1)}%`;
    case "throughput":
      return change > 0
        ? `Throughput improved by ${absChange.toFixed(1)}%`
        : `Throughput decreased by ${absChange.toFixed(1)}%`;
    case "cpu_usage":
      return change > 0
        ? `CPU usage increased by ${absChange.toFixed(1)}%`
        : `CPU usage decreased by ${absChange.toFixed(1)}%`;
    case "memory_usage":
      return change > 0
        ? `Memory usage increased by ${absChange.toFixed(1)}%`
        : `Memory usage decreased by ${absChange.toFixed(1)}%`;
    default:
      return `Changed by ${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`;
  }
}

function generatePerformanceReport(comparison) {
  let report = `# Performance Regression Report\n\n`;
  report += `**Generated:** ${comparison.timestamp}\n`;
  report += `**Baseline:** ${comparison.baseline}\n`;
  report += `**Current:** ${comparison.current}\n\n`;

  // Summary
  report += `## Summary\n\n`;
  report += `- 🔴 Critical Regressions: ${comparison.criticalRegressions.length}\n`;
  report += `- 🟡 Concerning Changes: ${comparison.concerningRegressions.length}\n`;
  report += `- 🟢 Improvements: ${comparison.improvements.length}\n\n`;

  // Critical regressions
  if (comparison.criticalRegressions.length > 0) {
    report += `## 🔴 Critical Regressions\n\n`;
    for (const regression of comparison.criticalRegressions) {
      report += `- **${regression.metric}**: ${regression.impact}\n`;
    }
    report += `\n`;
  }

  // Concerning changes
  if (comparison.concerningRegressions.length > 0) {
    report += `## 🟡 Concerning Changes\n\n`;
    for (const regression of comparison.concerningRegressions) {
      report += `- **${regression.metric}**: ${regression.impact}\n`;
    }
    report += `\n`;
  }

  // Improvements
  if (comparison.improvements.length > 0) {
    report += `## 🟢 Improvements\n\n`;
    for (const improvement of comparison.improvements) {
      report += `- **${improvement.metric}**: ${improvement.impact}\n`;
    }
    report += `\n`;
  }

  // Detailed metrics
  report += `## Detailed Metrics\n\n`;
  report += `| Metric | Baseline | Current | Change | Status |\n`;
  report += `|--------|----------|---------|--------|--------|\n`;

  for (const [metric, data] of Object.entries(comparison.metrics)) {
    const statusIcon =
      {
        critical: "🔴",
        concerning: "🟡",
        improved: "🟢",
        stable: "⚪",
        unknown: "❓",
      }[data.status] || "❓";

    report += `| ${metric} | ${data.baseline} | ${data.current} | ${data.changePercent} | ${statusIcon} ${data.status} |\n`;
  }

  return report;
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  comparePerformanceResults();
}

export { comparePerformanceResults };
