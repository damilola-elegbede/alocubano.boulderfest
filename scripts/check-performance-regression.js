#!/usr/bin/env node

/**
 * Performance Regression Detection System
 *
 * Advanced statistical analysis of performance metrics to detect regressions,
 * trends, and anomalies in the A Lo Cubano Boulder Fest ticketing system.
 *
 * Features:
 * - Statistical regression detection using multiple algorithms
 * - Trend analysis with moving averages and seasonal adjustments
 * - Anomaly detection using z-score and IQR methods
 * - CI/CD integration with pass/fail criteria
 * - Alerting and notification system
 * - Performance budget validation
 * - Historical data management and cleanup
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promises as fs, existsSync } from "fs";
import { execSync } from "child_process";
import fetch from "node-fetch";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Load environment variables
dotenv.config({ path: join(projectRoot, ".env.local") });
dotenv.config({ path: join(projectRoot, ".env") });

// Configuration
const REPORTS_DIR = join(projectRoot, "reports", "load-test-results");
const BASELINES_DIR = join(projectRoot, "reports", "performance-baselines");
const REGRESSION_REPORTS_DIR = join(
  projectRoot,
  "reports",
  "regression-analysis",
);
const PERFORMANCE_HISTORY_FILE = join(
  BASELINES_DIR,
  "performance-history.json",
);
const CONFIG_FILE = join(projectRoot, "config", "performance-thresholds.json");

// Statistical constants
const STATISTICAL_CONFIG = {
  // Regression detection thresholds
  regression: {
    warning: 0.1, // 10% degradation = warning
    critical: 0.25, // 25% degradation = critical
    minSamples: 3, // Minimum samples needed for regression analysis
    confidenceLevel: 0.95, // 95% confidence for statistical tests
  },

  // Trend analysis parameters
  trend: {
    movingAverageWindow: 7, // 7-day moving average
    trendWindow: 14, // 14-day trend analysis
    seasonalWindow: 28, // 28-day seasonal adjustment
    volatilityThreshold: 0.3, // 30% coefficient of variation = high volatility
  },

  // Anomaly detection parameters
  anomaly: {
    zScoreThreshold: 2.5, // Z-score > 2.5 = anomaly
    iqrMultiplier: 1.5, // IQR * 1.5 for outlier detection
    minHistoricalSamples: 10, // Minimum historical data for anomaly detection
  },

  // Performance budgets (business-critical thresholds)
  budgets: {
    responseTime: {
      p95_critical: 2000, // P95 response time > 2s = critical
      p95_warning: 1000, // P95 response time > 1s = warning
      avg_critical: 1500, // Average > 1.5s = critical
      avg_warning: 800, // Average > 800ms = warning
    },
    errorRate: {
      critical: 0.05, // 5% error rate = critical
      warning: 0.02, // 2% error rate = warning
    },
    throughput: {
      degradation_critical: 0.3, // 30% throughput drop = critical
      degradation_warning: 0.15, // 15% throughput drop = warning
    },
  },
};

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

function print(message, color = "reset", bold = false) {
  const colorCode = colors[color] || colors.reset;
  const boldCode = bold ? colors.bold : "";
  console.log(`${boldCode}${colorCode}${message}${colors.reset}`);
}

/**
 * Performance Data Management
 */
class PerformanceDataManager {
  constructor() {
    this.historyFile = PERFORMANCE_HISTORY_FILE;
  }

  async loadPerformanceHistory() {
    if (!existsSync(this.historyFile)) {
      return { tests: {}, metadata: { version: "1.0.0", created: Date.now() } };
    }

    try {
      const data = await fs.readFile(this.historyFile, "utf8");
      return JSON.parse(data);
    } catch (error) {
      print(
        `⚠️ Failed to load performance history: ${error.message}`,
        "yellow",
      );
      return { tests: {}, metadata: { version: "1.0.0", created: Date.now() } };
    }
  }

  async savePerformanceHistory(history) {
    await this.ensureDir(dirname(this.historyFile));
    history.metadata.lastUpdated = Date.now();

    try {
      await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      print(`❌ Failed to save performance history: ${error.message}`, "red");
    }
  }

  async addPerformanceData(testName, data) {
    const history = await this.loadPerformanceHistory();

    if (!history.tests[testName]) {
      history.tests[testName] = [];
    }

    // Add new data point with timestamp
    const dataPoint = {
      timestamp: Date.now(),
      date: new Date().toISOString().split("T")[0], // YYYY-MM-DD format
      ...data,
    };

    history.tests[testName].push(dataPoint);

    // Keep last 100 data points per test to manage storage
    if (history.tests[testName].length > 100) {
      history.tests[testName] = history.tests[testName].slice(-100);
    }

    await this.savePerformanceHistory(history);
    return history;
  }

  async getTestHistory(testName, days = 30) {
    const history = await this.loadPerformanceHistory();
    const testData = history.tests[testName] || [];

    // Filter to last N days
    const cutoffDate = Date.now() - days * 24 * 60 * 60 * 1000;
    return testData.filter((point) => point.timestamp > cutoffDate);
  }

  async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

/**
 * Statistical Analysis Engine
 */
class StatisticalAnalyzer {
  constructor() {
    this.config = STATISTICAL_CONFIG;
  }

  /**
   * Calculate basic statistical measures
   */
  calculateBasicStats(values) {
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    return {
      count: n,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((sum, val) => sum + val, 0) / n,
      median:
        n % 2 === 0
          ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
          : sorted[Math.floor(n / 2)],
      p25: sorted[Math.floor(n * 0.25)],
      p75: sorted[Math.floor(n * 0.75)],
      p95: sorted[Math.floor(n * 0.95)],
      p99: sorted[Math.floor(n * 0.99)],
      stdDev: this.calculateStandardDeviation(values),
      variance: this.calculateVariance(values),
    };
  }

  calculateStandardDeviation(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    return Math.sqrt(variance);
  }

  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return (
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length
    );
  }

  /**
   * Detect performance regressions using multiple algorithms
   */
  detectRegressions(historical, current, metric = "response_time") {
    if (!historical || historical.length < this.config.regression.minSamples) {
      return {
        hasRegression: false,
        confidence: 0,
        message: "Insufficient historical data for regression analysis",
      };
    }

    const results = {
      statistical: this.statisticalRegression(historical, current),
      percentage: this.percentageRegression(historical, current),
      trend: this.trendRegression(historical, current),
      composite: null,
    };

    // Composite analysis combining all methods
    results.composite = this.compositeRegressionAnalysis(results);

    return results.composite;
  }

  statisticalRegression(historical, current) {
    const historicalValues = historical.map((h) => h.value);
    const historicalStats = this.calculateBasicStats(historicalValues);

    if (!historicalStats) return { hasRegression: false, confidence: 0 };

    // Z-score based regression detection
    const zScore = (current - historicalStats.mean) / historicalStats.stdDev;
    const confidence = this.zScoreToConfidence(Math.abs(zScore));

    return {
      method: "statistical",
      hasRegression: zScore > 2.0, // 2 standard deviations
      confidence,
      zScore,
      historical: historicalStats,
      current,
      message: `Current value is ${zScore.toFixed(2)} standard deviations from historical mean`,
    };
  }

  percentageRegression(historical, current) {
    const recentValues = historical.slice(-5).map((h) => h.value); // Last 5 measurements
    const recentMean =
      recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;

    const percentageChange = (current - recentMean) / recentMean;
    const hasRegression = percentageChange > this.config.regression.warning;

    return {
      method: "percentage",
      hasRegression,
      confidence: Math.min(Math.abs(percentageChange) * 2, 1.0), // Scale to 0-1
      percentageChange,
      baseline: recentMean,
      current,
      message: `${(percentageChange * 100).toFixed(2)}% change from recent baseline`,
    };
  }

  trendRegression(historical, current) {
    if (historical.length < this.config.trend.trendWindow) {
      return {
        hasRegression: false,
        confidence: 0,
        message: "Insufficient data for trend analysis",
      };
    }

    const values = historical.map((h) => h.value);
    const trend = this.calculateLinearTrend(values);
    const predicted = trend.slope * values.length + trend.intercept;
    const deviation = Math.abs(current - predicted) / predicted;

    return {
      method: "trend",
      hasRegression: deviation > this.config.regression.warning,
      confidence: Math.min(deviation * 2, 1.0),
      trend,
      predicted,
      deviation,
      current,
      message: `${(deviation * 100).toFixed(2)}% deviation from trend prediction`,
    };
  }

  calculateLinearTrend(values) {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  compositeRegressionAnalysis(results) {
    const methods = [
      results.statistical,
      results.percentage,
      results.trend,
    ].filter((r) => r.confidence > 0);

    if (methods.length === 0) {
      return {
        hasRegression: false,
        confidence: 0,
        message: "No valid regression analysis methods",
      };
    }

    // Weighted composite confidence
    const weightedConfidence = methods.reduce((sum, method) => {
      const weight =
        method.method === "statistical"
          ? 0.4
          : method.method === "percentage"
            ? 0.4
            : 0.2; // Trend gets less weight
      return sum + method.confidence * weight;
    }, 0);

    const regressionCount = methods.filter((m) => m.hasRegression).length;
    const hasRegression =
      regressionCount >= 2 || // At least 2 methods agree
      (regressionCount >= 1 && weightedConfidence > 0.8); // Or high confidence

    const severity =
      weightedConfidence > 0.8
        ? "critical"
        : weightedConfidence > 0.5
          ? "warning"
          : "info";

    return {
      hasRegression,
      confidence: weightedConfidence,
      severity,
      methodsAgreeing: regressionCount,
      totalMethods: methods.length,
      details: methods,
      message: `${regressionCount}/${methods.length} methods detected regression (confidence: ${(weightedConfidence * 100).toFixed(1)}%)`,
    };
  }

  zScoreToConfidence(zScore) {
    // Convert z-score to confidence level (0-1)
    return Math.min(Math.max((zScore - 1) / 3, 0), 1);
  }

  /**
   * Detect anomalies in performance data
   */
  detectAnomalies(historical, current) {
    if (historical.length < this.config.anomaly.minHistoricalSamples) {
      return {
        hasAnomaly: false,
        message: "Insufficient historical data for anomaly detection",
      };
    }

    const values = historical.map((h) => h.value);
    const stats = this.calculateBasicStats(values);

    // Z-score based anomaly detection
    const zScore = Math.abs(current - stats.mean) / stats.stdDev;
    const zScoreAnomaly = zScore > this.config.anomaly.zScoreThreshold;

    // IQR based outlier detection
    const iqr = stats.p75 - stats.p25;
    const lowerBound = stats.p25 - this.config.anomaly.iqrMultiplier * iqr;
    const upperBound = stats.p75 + this.config.anomaly.iqrMultiplier * iqr;
    const iqrAnomaly = current < lowerBound || current > upperBound;

    const hasAnomaly = zScoreAnomaly || iqrAnomaly;

    return {
      hasAnomaly,
      confidence: Math.min(zScore / this.config.anomaly.zScoreThreshold, 1.0),
      zScore: {
        value: zScore,
        isAnomaly: zScoreAnomaly,
        threshold: this.config.anomaly.zScoreThreshold,
      },
      iqr: {
        isAnomaly: iqrAnomaly,
        bounds: [lowerBound, upperBound],
        iqrValue: iqr,
      },
      historical: stats,
      current,
    };
  }

  /**
   * Calculate moving averages for trend analysis
   */
  calculateMovingAverages(historical, windowSize = 7) {
    const values = historical.map((h) => h.value);
    const movingAverages = [];

    for (let i = windowSize - 1; i < values.length; i++) {
      const window = values.slice(i - windowSize + 1, i + 1);
      const average = window.reduce((sum, val) => sum + val, 0) / window.length;
      movingAverages.push({
        index: i,
        timestamp: historical[i].timestamp,
        value: average,
        originalValue: values[i],
      });
    }

    return movingAverages;
  }
}

/**
 * Performance Budget Validator
 */
class BudgetValidator {
  constructor() {
    this.budgets = STATISTICAL_CONFIG.budgets;
  }

  validatePerformanceBudgets(metrics) {
    const violations = [];
    const warnings = [];

    // Response Time Budget Validation
    if (metrics.response_times) {
      const { p95, avg } = metrics.response_times;

      if (p95 > this.budgets.responseTime.p95_critical) {
        violations.push({
          type: "response_time",
          metric: "P95",
          value: p95,
          threshold: this.budgets.responseTime.p95_critical,
          severity: "critical",
          message: `P95 response time ${p95.toFixed(0)}ms exceeds critical budget of ${this.budgets.responseTime.p95_critical}ms`,
        });
      } else if (p95 > this.budgets.responseTime.p95_warning) {
        warnings.push({
          type: "response_time",
          metric: "P95",
          value: p95,
          threshold: this.budgets.responseTime.p95_warning,
          severity: "warning",
          message: `P95 response time ${p95.toFixed(0)}ms exceeds warning budget of ${this.budgets.responseTime.p95_warning}ms`,
        });
      }

      if (avg > this.budgets.responseTime.avg_critical) {
        violations.push({
          type: "response_time",
          metric: "Average",
          value: avg,
          threshold: this.budgets.responseTime.avg_critical,
          severity: "critical",
          message: `Average response time ${avg.toFixed(0)}ms exceeds critical budget of ${this.budgets.responseTime.avg_critical}ms`,
        });
      } else if (avg > this.budgets.responseTime.avg_warning) {
        warnings.push({
          type: "response_time",
          metric: "Average",
          value: avg,
          threshold: this.budgets.responseTime.avg_warning,
          severity: "warning",
          message: `Average response time ${avg.toFixed(0)}ms exceeds warning budget of ${this.budgets.responseTime.avg_warning}ms`,
        });
      }
    }

    // Error Rate Budget Validation
    if (metrics.error_rates && metrics.error_rates.http_failed) {
      const errorRate = metrics.error_rates.http_failed;

      if (errorRate > this.budgets.errorRate.critical) {
        violations.push({
          type: "error_rate",
          metric: "HTTP Error Rate",
          value: errorRate,
          threshold: this.budgets.errorRate.critical,
          severity: "critical",
          message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds critical budget of ${(this.budgets.errorRate.critical * 100).toFixed(2)}%`,
        });
      } else if (errorRate > this.budgets.errorRate.warning) {
        warnings.push({
          type: "error_rate",
          metric: "HTTP Error Rate",
          value: errorRate,
          threshold: this.budgets.errorRate.warning,
          severity: "warning",
          message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds warning budget of ${(this.budgets.errorRate.warning * 100).toFixed(2)}%`,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      warnings,
      summary: {
        totalViolations: violations.length,
        totalWarnings: warnings.length,
        criticalViolations: violations.filter((v) => v.severity === "critical")
          .length,
      },
    };
  }
}

/**
 * Regression Report Generator
 */
class RegressionReportGenerator {
  constructor() {
    this.reportsDir = REGRESSION_REPORTS_DIR;
  }

  async generateRegressionReport(analyses, budgetResults, metadata = {}) {
    await this.ensureDir(this.reportsDir);

    const reportId = `regression-analysis-${Date.now()}`;
    const jsonReport = join(this.reportsDir, `${reportId}.json`);
    const htmlReport = join(this.reportsDir, `${reportId}.html`);

    const reportData = {
      reportId,
      timestamp: Date.now(),
      metadata: {
        environment: process.env.NODE_ENV || "test",
        version: process.env.npm_package_version || "1.0.0",
        ...metadata,
      },
      summary: this.generateSummary(analyses, budgetResults),
      analyses,
      budgetValidation: budgetResults,
      recommendations: this.generateRecommendations(analyses, budgetResults),
    };

    // Generate JSON report
    await fs.writeFile(jsonReport, JSON.stringify(reportData, null, 2));

    // Generate HTML report
    const htmlContent = this.generateHTMLReport(reportData);
    await fs.writeFile(htmlReport, htmlContent);

    print(`📊 Regression analysis report generated:`, "cyan");
    print(`   JSON: ${jsonReport}`, "blue");
    print(`   HTML: ${htmlReport}`, "blue");

    return {
      jsonReport,
      htmlReport,
      reportData,
    };
  }

  generateSummary(analyses, budgetResults) {
    const summary = {
      totalTests: Object.keys(analyses).length,
      regressions: 0,
      anomalies: 0,
      budgetViolations: budgetResults.summary?.totalViolations || 0,
      criticalIssues: 0,
      overallStatus: "PASS",
    };

    // Count regressions and anomalies
    for (const [testName, analysis] of Object.entries(analyses)) {
      if (analysis.regression && analysis.regression.hasRegression) {
        summary.regressions++;
        if (analysis.regression.severity === "critical") {
          summary.criticalIssues++;
        }
      }

      if (analysis.anomaly && analysis.anomaly.hasAnomaly) {
        summary.anomalies++;
      }
    }

    // Determine overall status
    if (
      summary.criticalIssues > 0 ||
      (budgetResults.summary?.criticalViolations || 0) > 0
    ) {
      summary.overallStatus = "FAIL";
    } else if (
      summary.regressions > 0 ||
      (budgetResults.summary?.totalWarnings || 0) > 0
    ) {
      summary.overallStatus = "WARNING";
    }

    return summary;
  }

  generateRecommendations(analyses, budgetResults) {
    const recommendations = [];

    // Analysis-based recommendations
    for (const [testName, analysis] of Object.entries(analyses)) {
      if (analysis.regression && analysis.regression.hasRegression) {
        const severity =
          analysis.regression.severity === "critical" ? "CRITICAL" : "HIGH";

        recommendations.push({
          type: "REGRESSION",
          priority: severity,
          test: testName,
          issue: "Performance regression detected",
          description: analysis.regression.message,
          suggestions: [
            "Review recent code changes that may impact performance",
            "Check infrastructure changes or scaling issues",
            "Analyze database query performance and optimization",
            "Consider rollback if regression is severe",
            "Monitor related metrics for cascading effects",
          ],
        });
      }

      if (analysis.anomaly && analysis.anomaly.hasAnomaly) {
        recommendations.push({
          type: "ANOMALY",
          priority: "MEDIUM",
          test: testName,
          issue: "Performance anomaly detected",
          description: `Unusual performance pattern detected (Z-score: ${analysis.anomaly.zScore.value.toFixed(2)})`,
          suggestions: [
            "Investigate external factors affecting performance",
            "Check for resource contention or scaling events",
            "Review monitoring alerts for system-wide issues",
            "Validate test environment consistency",
          ],
        });
      }
    }

    // Budget violation recommendations
    for (const violation of budgetResults.violations || []) {
      recommendations.push({
        type: "BUDGET_VIOLATION",
        priority: violation.severity.toUpperCase(),
        test: "All Tests",
        issue: `Performance budget exceeded: ${violation.metric}`,
        description: violation.message,
        suggestions: this.getBudgetRecommendations(violation.type),
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  getBudgetRecommendations(budgetType) {
    const recommendations = {
      response_time: [
        "Implement application-level caching strategies",
        "Optimize database queries and add indexing",
        "Consider CDN implementation for static assets",
        "Review and optimize critical code paths",
        "Scale infrastructure resources horizontally",
      ],
      error_rate: [
        "Implement circuit breaker patterns for external dependencies",
        "Add retry logic with exponential backoff",
        "Review error handling and graceful degradation",
        "Increase monitoring and alerting coverage",
        "Consider auto-scaling policies",
      ],
      throughput: [
        "Optimize connection pooling and keep-alive settings",
        "Review load balancer configuration",
        "Consider async processing for heavy operations",
        "Implement request queuing and rate limiting",
        "Evaluate horizontal scaling opportunities",
      ],
    };

    return (
      recommendations[budgetType] || [
        "Review overall system performance and capacity",
        "Consult performance engineering team",
        "Consider comprehensive performance audit",
      ]
    );
  }

  generateHTMLReport(reportData) {
    const { summary, analyses, budgetValidation, recommendations } = reportData;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Regression Analysis - A Lo Cubano Boulder Fest</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6; color: #333; background: #f8f9fa;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { 
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
            color: white; padding: 40px 20px; border-radius: 10px; margin-bottom: 30px; text-align: center;
        }
        .status-badge {
            display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold;
            text-transform: uppercase; font-size: 0.9rem; margin-top: 15px;
        }
        .status-pass { background: #d4edda; color: #155724; }
        .status-warning { background: #fff3cd; color: #856404; }
        .status-fail { background: #f8d7da; color: #721c24; }
        
        .metrics-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px; margin-bottom: 30px;
        }
        .metric-card {
            background: white; padding: 20px; border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-left: 4px solid #e74c3c;
        }
        .metric-value { font-size: 2rem; font-weight: bold; color: #e74c3c; margin-bottom: 5px; }
        .metric-label { color: #666; font-size: 0.9rem; text-transform: uppercase; }
        
        .section {
            background: white; padding: 30px; border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px;
        }
        .section h2 { color: #333; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #eee; }
        
        .analysis-item {
            border: 1px solid #eee; border-radius: 8px; margin-bottom: 20px; overflow: hidden;
        }
        .analysis-header {
            background: #f8f9fa; padding: 15px 20px; border-bottom: 1px solid #eee;
            display: flex; justify-content: space-between; align-items: center;
        }
        .regression-badge, .anomaly-badge {
            padding: 4px 12px; border-radius: 15px; font-size: 0.8rem; font-weight: bold;
        }
        .regression-critical { background: #f8d7da; color: #721c24; }
        .regression-warning { background: #fff3cd; color: #856404; }
        .anomaly-detected { background: #fce4ec; color: #ad1457; }
        
        .details-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px; padding: 20px;
        }
        .detail-box {
            padding: 15px; background: #f8f9fa; border-radius: 5px;
        }
        .detail-value { font-size: 1.2rem; font-weight: bold; color: #e74c3c; }
        .detail-label { font-size: 0.9rem; color: #666; margin-top: 5px; }
        
        .recommendations {
            margin-top: 20px;
        }
        .recommendation {
            padding: 15px; margin-bottom: 15px; border-radius: 8px; border-left: 4px solid;
        }
        .rec-critical { background: #f8d7da; border-color: #dc3545; }
        .rec-high { background: #fff3cd; border-color: #ffc107; }
        .rec-medium { background: #d1ecf1; border-color: #17a2b8; }
        
        .footer { text-align: center; padding: 20px; color: #666; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Performance Regression Analysis</h1>
            <p>A Lo Cubano Boulder Fest - Statistical Performance Analysis</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
            <div class="status-badge status-${summary.overallStatus.toLowerCase()}">
                ${summary.overallStatus}
            </div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${summary.totalTests}</div>
                <div class="metric-label">Tests Analyzed</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.regressions}</div>
                <div class="metric-label">Regressions</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.anomalies}</div>
                <div class="metric-label">Anomalies</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.budgetViolations}</div>
                <div class="metric-label">Budget Violations</div>
            </div>
        </div>
        
        <div class="section">
            <h2>🔍 Regression Analysis Results</h2>
            ${Object.entries(analyses)
              .map(
                ([testName, analysis]) => `
                <div class="analysis-item">
                    <div class="analysis-header">
                        <h3>${testName}</h3>
                        <div>
                            ${
                              analysis.regression &&
                              analysis.regression.hasRegression
                                ? `<span class="regression-badge regression-${analysis.regression.severity}">${analysis.regression.severity.toUpperCase()} REGRESSION</span>`
                                : ""
                            }
                            ${
                              analysis.anomaly && analysis.anomaly.hasAnomaly
                                ? `<span class="anomaly-badge anomaly-detected">ANOMALY</span>`
                                : ""
                            }
                        </div>
                    </div>
                    <div class="details-grid">
                        ${
                          analysis.regression
                            ? `
                            <div class="detail-box">
                                <div class="detail-value">${(analysis.regression.confidence * 100).toFixed(1)}%</div>
                                <div class="detail-label">Regression Confidence</div>
                            </div>
                        `
                            : ""
                        }
                        ${
                          analysis.anomaly
                            ? `
                            <div class="detail-box">
                                <div class="detail-value">${analysis.anomaly.zScore.value.toFixed(2)}</div>
                                <div class="detail-label">Z-Score</div>
                            </div>
                        `
                            : ""
                        }
                        <div class="detail-box">
                            <div class="detail-value">${analysis.dataPoints || "N/A"}</div>
                            <div class="detail-label">Historical Data Points</div>
                        </div>
                    </div>
                </div>
            `,
              )
              .join("")}
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
            <p>Generated by A Lo Cubano Performance Regression Detector v1.0.0</p>
            <p>Report ID: ${reportData.reportId}</p>
        </div>
    </div>
</body>
</html>`;
  }

  async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

/**
 * Main Regression Detection System
 */
class PerformanceRegressionDetector {
  constructor(options = {}) {
    this.options = {
      analysisWindow: options.analysisWindow || 30, // days
      minSamples: options.minSamples || 5,
      verbose: options.verbose || false,
      ...options,
    };

    this.dataManager = new PerformanceDataManager();
    this.analyzer = new StatisticalAnalyzer();
    this.budgetValidator = new BudgetValidator();
    this.reportGenerator = new RegressionReportGenerator();
  }

  async analyzePerformanceRegressions(currentResults) {
    print("🔍 Starting performance regression analysis...", "cyan", true);

    const analyses = {};
    const overallBudgetResult = { violations: [], warnings: [] };

    // Analyze each test result
    for (const testResult of currentResults) {
      const testName = testResult.testConfig.name
        .toLowerCase()
        .replace(/\s+/g, "-");

      print(`\n📊 Analyzing ${testResult.testConfig.name}...`, "blue");

      // Get historical data
      const historical = await this.dataManager.getTestHistory(
        testName,
        this.options.analysisWindow,
      );

      if (historical.length < this.options.minSamples) {
        print(
          `   ⚠️  Insufficient historical data (${historical.length} samples, need ${this.options.minSamples})`,
          "yellow",
        );
        analyses[testResult.testConfig.name] = {
          hasData: false,
          dataPoints: historical.length,
          message: "Insufficient historical data for analysis",
        };
        continue;
      }

      // Extract current metrics
      const currentMetrics = testResult.results.summary;

      // Regression analysis for key metrics
      const responseTimeRegression = await this.analyzeMetricRegression(
        historical,
        currentMetrics.response_times?.p95,
        "response_time_p95",
      );

      const errorRateRegression = await this.analyzeMetricRegression(
        historical,
        currentMetrics.error_rates?.http_failed,
        "error_rate",
      );

      // Anomaly detection
      const responseTimeAnomaly = this.analyzer.detectAnomalies(
        historical.map((h) => ({
          value: h.response_time_p95 || h.response_times?.p95 || 0,
        })),
        currentMetrics.response_times?.p95 || 0,
      );

      // Budget validation
      const budgetResult =
        this.budgetValidator.validatePerformanceBudgets(currentMetrics);
      overallBudgetResult.violations.push(...budgetResult.violations);
      overallBudgetResult.warnings.push(...budgetResult.warnings);

      // Store current data for future analysis
      await this.dataManager.addPerformanceData(testName, {
        response_time_p95: currentMetrics.response_times?.p95 || 0,
        response_time_avg: currentMetrics.response_times?.avg || 0,
        error_rate: currentMetrics.error_rates?.http_failed || 0,
        throughput: currentMetrics.throughput?.rate || 0,
        testId: testResult.testId,
      });

      analyses[testResult.testConfig.name] = {
        hasData: true,
        dataPoints: historical.length,
        regression: this.selectBestRegression([
          responseTimeRegression,
          errorRateRegression,
        ]),
        anomaly: responseTimeAnomaly,
        budget: budgetResult,
        metrics: currentMetrics,
      };

      // Print analysis results
      this.printAnalysisResults(
        testResult.testConfig.name,
        analyses[testResult.testConfig.name],
      );
    }

    // Consolidate budget results
    const consolidatedBudgetResult = {
      violations: overallBudgetResult.violations,
      warnings: overallBudgetResult.warnings,
      summary: {
        totalViolations: overallBudgetResult.violations.length,
        totalWarnings: overallBudgetResult.warnings.length,
        criticalViolations: overallBudgetResult.violations.filter(
          (v) => v.severity === "critical",
        ).length,
      },
    };

    // Generate comprehensive report
    const report = await this.reportGenerator.generateRegressionReport(
      analyses,
      consolidatedBudgetResult,
      {
        analysisWindow: this.options.analysisWindow,
        totalTests: currentResults.length,
      },
    );

    return {
      analyses,
      budgetValidation: consolidatedBudgetResult,
      report: report.reportData,
      success: report.reportData.summary.overallStatus !== "FAIL",
    };
  }

  async analyzeMetricRegression(historical, currentValue, metricName) {
    if (currentValue == null || historical.length === 0) return null;

    const metricHistory = historical
      .map((h) => ({
        value: h[metricName] || 0,
        timestamp: h.timestamp,
      }))
      .filter((h) => h.value > 0);

    if (metricHistory.length < this.options.minSamples) return null;

    return this.analyzer.detectRegressions(
      metricHistory,
      currentValue,
      metricName,
    );
  }

  selectBestRegression(regressions) {
    const validRegressions = regressions.filter((r) => r != null);
    if (validRegressions.length === 0) return null;

    // Return regression with highest confidence
    return validRegressions.reduce((best, current) =>
      current.confidence > best.confidence ? current : best,
    );
  }

  printAnalysisResults(testName, analysis) {
    if (!analysis.hasData) {
      print(`   📈 ${testName}: ${analysis.message}`, "blue");
      return;
    }

    if (analysis.regression && analysis.regression.hasRegression) {
      const color =
        analysis.regression.severity === "critical" ? "red" : "yellow";
      print(
        `   ⚠️  ${testName}: REGRESSION detected (${analysis.regression.severity})`,
        color,
      );
      print(`      ${analysis.regression.message}`, color);
    } else {
      print(`   ✅ ${testName}: No significant regression`, "green");
    }

    if (analysis.anomaly && analysis.anomaly.hasAnomaly) {
      print(
        `   🔍 ${testName}: Anomaly detected (Z-score: ${analysis.anomaly.zScore.value.toFixed(2)})`,
        "yellow",
      );
    }

    if (analysis.budget && analysis.budget.violations.length > 0) {
      print(
        `   💰 ${testName}: ${analysis.budget.violations.length} budget violation(s)`,
        "red",
      );
    }
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  // Skip regression checks in CI when requested
  if (process.env.CI === 'true' && 
      (process.env.SKIP_PERFORMANCE_TESTS === 'true' || 
       process.env.SKIP_PERFORMANCE_INTENSIVE_TESTS === 'true')) {
    console.log('\n⚠️  Skipping performance regression analysis in CI environment');
    console.log('✅ Performance regression check skipped successfully\n');
    process.exit(0);
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🔍 A Lo Cubano Performance Regression Detector

Usage: node scripts/check-performance-regression.js [options]

Options:
  --reports-dir <path>     Directory containing performance test reports
                          Default: reports/load-test-results
  
  --analysis-window <days> Number of days of historical data to analyze
                          Default: 30
  
  --min-samples <count>    Minimum samples needed for regression analysis
                          Default: 5
  
  --verbose, -v           Enable verbose output
  
  --help, -h              Show this help message

Examples:
  # Analyze recent performance test results
  node scripts/check-performance-regression.js
  
  # Analyze with extended historical window
  node scripts/check-performance-regression.js --analysis-window 60
  
  # Verbose analysis output
  node scripts/check-performance-regression.js --verbose

The tool automatically:
  - Loads recent performance test results
  - Analyzes statistical regressions using multiple algorithms
  - Detects performance anomalies
  - Validates performance budgets
  - Generates comprehensive HTML and JSON reports
  - Provides actionable recommendations
`);
    process.exit(0);
  }

  const options = {
    reportsDir:
      args.find((arg) => arg.startsWith("--reports-dir="))?.split("=")[1] ||
      REPORTS_DIR,
    analysisWindow:
      parseInt(
        args.find((arg) => arg.startsWith("--analysis-window="))?.split("=")[1],
      ) || 30,
    minSamples:
      parseInt(
        args.find((arg) => arg.startsWith("--min-samples="))?.split("=")[1],
      ) || 5,
    verbose: args.includes("--verbose") || args.includes("-v"),
  };

  try {
    const detector = new PerformanceRegressionDetector(options);

    // Load recent performance test results
    print("📁 Loading recent performance test results...", "cyan");
    const recentResults = await loadRecentPerformanceResults(
      options.reportsDir,
    );

    if (recentResults.length === 0) {
      print("❌ No recent performance test results found", "red");
      print(`   Check directory: ${options.reportsDir}`, "blue");
      process.exit(1);
    }

    print(`📊 Found ${recentResults.length} recent test result(s)`, "green");

    // Run regression analysis
    const analysis =
      await detector.analyzePerformanceRegressions(recentResults);

    // Print summary
    print("\n================================================", "magenta");
    print("         REGRESSION ANALYSIS SUMMARY", "magenta", true);
    print("================================================", "magenta");

    const summary = analysis.report.summary;
    print(`📊 Tests Analyzed: ${summary.totalTests}`, "blue");
    print(`⚠️  Regressions Found: ${summary.regressions}`, "blue");
    print(`🔍 Anomalies Detected: ${summary.anomalies}`, "blue");
    print(`💰 Budget Violations: ${summary.budgetViolations}`, "blue");
    print(
      `🎯 Overall Status: ${summary.overallStatus}`,
      summary.overallStatus === "PASS"
        ? "green"
        : summary.overallStatus === "WARNING"
          ? "yellow"
          : "red",
      true,
    );

    // Exit with appropriate code for CI/CD
    process.exit(analysis.success ? 0 : 1);
  } catch (error) {
    print(`❌ Regression analysis failed: ${error.message}`, "red");
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Load recent performance test results from reports directory
 */
async function loadRecentPerformanceResults(reportsDir) {
  if (!existsSync(reportsDir)) {
    return [];
  }

  try {
    const files = await fs.readdir(reportsDir);
    const resultFiles = files
      .filter(
        (f) =>
          f.includes("-summary.json") ||
          (f.endsWith(".json") && !f.includes("raw")),
      )
      .sort()
      .reverse()
      .slice(0, 5); // Get last 5 test runs

    const results = [];
    for (const file of resultFiles) {
      try {
        const filePath = join(reportsDir, file);
        const data = JSON.parse(await fs.readFile(filePath, "utf8"));

        // Convert to expected format if needed
        if (data.testResults) {
          results.push(...data.testResults);
        } else if (data.metrics) {
          // Single test result format
          results.push({
            testId: file.replace(".json", ""),
            testConfig: { name: "Unknown Test" },
            results: { summary: data },
          });
        }
      } catch (error) {
        print(`⚠️ Failed to load ${file}: ${error.message}`, "yellow");
      }
    }

    return results;
  } catch (error) {
    print(`❌ Failed to scan reports directory: ${error.message}`, "red");
    return [];
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export {
  PerformanceRegressionDetector,
  StatisticalAnalyzer,
  BudgetValidator,
  PerformanceDataManager,
  RegressionReportGenerator,
};
