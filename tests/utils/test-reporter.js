/**
 * Enhanced Test Reporter
 * Comprehensive test result reporting and analysis
 */

import fs from "fs";
import path from "path";

class TestReporter {
  constructor(testName, options = {}) {
    this.testName = testName;
    this.options = {
      verbose: process.env.NODE_ENV !== "ci" || options.verbose,
      colors: process.stdout.isTTY && !process.env.NO_COLOR,
      jsonOutput: options.jsonOutput || false,
      outputDir: options.outputDir || "test-reports",
      ...options,
    };

    // ANSI color codes
    this.colors = {
      reset: "\x1b[0m",
      bright: "\x1b[1m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      magenta: "\x1b[35m",
      cyan: "\x1b[36m",
      white: "\x1b[37m",
      gray: "\x1b[90m",
    };

    this.startTime = null;
    this.progressTotal = 0;
    this.progressCurrent = 0;
    this.logBuffer = [];

    // Test results tracking
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      coverage: {},
      performance: {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Apply color to text if colors are enabled
   */
  colorize(text, color) {
    if (!this.options.colors) return text;
    return `${this.colors[color]}${text}${this.colors.reset}`;
  }

  /**
   * Start the test with header
   */
  startTest() {
    this.startTime = Date.now();

    this.printHeader();
    this.log(`Starting ${this.testName}...`, "info");
  }

  /**
   * Print test header
   */
  printHeader() {
    const headerLine = "=".repeat(80);
    const title = `A Lo Cubano Boulder Fest - ${this.testName}`;
    const padding = Math.max(0, (80 - title.length) / 2);
    const paddedTitle = " ".repeat(Math.floor(padding)) + title;

    console.log(this.colorize(headerLine, "cyan"));
    console.log(this.colorize(paddedTitle, "bright"));
    console.log(this.colorize(headerLine, "cyan"));
    console.log("");
  }

  /**
   * Log message with level and formatting
   */
  log(message, level = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = this.formatLogMessage(message, level, timestamp);

    console.log(formattedMessage);

    // Store in buffer for report generation
    this.logBuffer.push({
      timestamp,
      level,
      message,
      formatted: formattedMessage,
    });
  }

  /**
   * Format log message
   */
  formatLogMessage(message, level, timestamp) {
    const levelIcons = {
      info: "ℹ",
      success: "✓",
      warning: "⚠",
      error: "✗",
      debug: "🔍",
    };

    const levelColors = {
      info: "blue",
      success: "green",
      warning: "yellow",
      error: "red",
      debug: "gray",
    };

    const icon = levelIcons[level] || "ℹ";
    const color = levelColors[level] || "white";

    if (this.options.verbose) {
      return `${this.colorize(`[${timestamp}]`, "gray")} ${this.colorize(icon, color)} ${message}`;
    } else {
      return `${this.colorize(icon, color)} ${message}`;
    }
  }

  /**
   * Log success message
   */
  success(message) {
    this.log(message, "success");
  }

  /**
   * Log warning message
   */
  warn(message) {
    this.log(message, "warning");
  }

  /**
   * Log error message
   */
  error(message) {
    this.log(message, "error");
  }

  /**
   * Log debug message
   */
  debug(message) {
    if (this.options.verbose) {
      this.log(message, "debug");
    }
  }

  /**
   * Start progress indicator
   */
  startProgress(total) {
    this.progressTotal = total;
    this.progressCurrent = 0;

    if (this.options.verbose) {
      this.log(`Processing ${total} items...`, "info");
    }

    this.updateProgressDisplay();
  }

  /**
   * Update progress
   */
  updateProgress(current) {
    this.progressCurrent = Math.min(current, this.progressTotal);

    if (this.options.colors && !this.options.verbose) {
      this.updateProgressDisplay();
    }
  }

  /**
   * Update progress display
   */
  updateProgressDisplay() {
    if (!this.options.colors || this.options.verbose) return;

    const percentage =
      this.progressTotal > 0
        ? Math.round((this.progressCurrent / this.progressTotal) * 100)
        : 0;

    const barWidth = 40;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;

    const progressBar =
      this.colorize("█".repeat(filledWidth), "green") +
      this.colorize("░".repeat(emptyWidth), "gray");

    const progressText = `[${progressBar}] ${percentage}% (${this.progressCurrent}/${this.progressTotal})`;

    // Clear line and print progress
    process.stdout.write(`\r${progressText}`);
  }

  /**
   * End progress indicator
   */
  endProgress() {
    if (this.options.colors && !this.options.verbose) {
      process.stdout.write("\n");
    }

    if (this.options.verbose) {
      this.log(`Completed processing ${this.progressTotal} items`, "success");
    }
  }

  /**
   * Display comprehensive test results
   */
  displayResults(results, report) {
    const duration = results.endTime - results.startTime;

    console.log("\n");
    this.printSummaryReport(results, duration);
    console.log("\n");

    if (results.broken > 0) {
      this.printBrokenLinksReport(report.brokenLinks);
      console.log("\n");
    }

    this.printDetailedBreakdown(report.breakdown);
    console.log("\n");

    if (report.suggestions && report.suggestions.length > 0) {
      this.printSuggestions(report.suggestions);
      console.log("\n");
    }

    this.printHealthScore(report.healthScore);
    console.log("\n");

    this.printFooter(results.broken === 0, duration);

    // Generate report files
    if (this.options.jsonOutput || results.broken > 0) {
      this.generateReportFiles(results, report);
    }
  }

  /**
   * Print summary report
   */
  printSummaryReport(results, duration) {
    const successRate =
      results.total > 0
        ? (((results.total - results.broken) / results.total) * 100).toFixed(1)
        : 100;

    console.log(this.colorize("📊 SUMMARY REPORT", "bright"));
    console.log(this.colorize("─".repeat(50), "gray"));

    console.log(
      `${this.colorize("Total Links Tested:", "cyan")} ${results.total}`,
    );
    console.log(
      `${this.colorize("Broken Links:", results.broken > 0 ? "red" : "green")} ${results.broken}`,
    );
    console.log(
      `${this.colorize("Success Rate:", successRate >= 95 ? "green" : successRate >= 80 ? "yellow" : "red")} ${successRate}%`,
    );
    console.log(
      `${this.colorize("Test Duration:", "blue")} ${(duration / 1000).toFixed(2)}s`,
    );

    if (results.fixed > 0) {
      console.log(`${this.colorize("Fixed Links:", "green")} ${results.fixed}`);
    }
  }

  /**
   * Print broken links report
   */
  printBrokenLinksReport(brokenLinks) {
    console.log(this.colorize("🔗 BROKEN LINKS DETAILS", "bright"));
    console.log(this.colorize("─".repeat(50), "gray"));

    brokenLinks.forEach((link, index) => {
      console.log(
        `\n${this.colorize(`${index + 1}.`, "yellow")} ${this.colorize(link.url, "red")}`,
      );
      console.log(
        `   ${this.colorize("File:", "cyan")} ${link.file}:${link.lineNumber}`,
      );
      console.log(`   ${this.colorize("Type:", "cyan")} ${link.type}`);
      console.log(`   ${this.colorize("Error:", "red")} ${link.error}`);

      if (link.suggestion) {
        console.log(
          `   ${this.colorize("Suggestion:", "green")} ${link.suggestion}`,
        );
      }

      if (link.context && this.options.verbose) {
        console.log(`   ${this.colorize("Context:", "gray")} ${link.context}`);
      }
    });
  }

  /**
   * Print detailed breakdown
   */
  printDetailedBreakdown(breakdown) {
    console.log(this.colorize("📈 DETAILED BREAKDOWN", "bright"));
    console.log(this.colorize("─".repeat(50), "gray"));

    // By Type
    console.log(this.colorize("\nBy Link Type:", "cyan"));
    Object.entries(breakdown.byType).forEach(([type, stats]) => {
      const successRate =
        stats.total > 0
          ? (((stats.total - stats.broken) / stats.total) * 100).toFixed(0)
          : 100;
      const color = stats.broken > 0 ? "yellow" : "green";

      console.log(
        `  ${this.colorize(type.padEnd(12), "white")}: ${stats.total} total, ${this.colorize(stats.broken + " broken", stats.broken > 0 ? "red" : "green")} (${this.colorize(successRate + "%", color)})`,
      );
    });

    // By Status
    console.log(this.colorize("\nBy Status:", "cyan"));
    Object.entries(breakdown.byStatus).forEach(([status, count]) => {
      const color =
        status === "ok"
          ? "green"
          : status === "broken"
            ? "red"
            : status === "error"
              ? "red"
              : "yellow";

      console.log(
        `  ${this.colorize(status.padEnd(12), "white")}: ${this.colorize(count, color)}`,
      );
    });
  }

  /**
   * Print suggestions
   */
  printSuggestions(suggestions) {
    console.log(this.colorize("💡 IMPROVEMENT SUGGESTIONS", "bright"));
    console.log(this.colorize("─".repeat(50), "gray"));

    suggestions.forEach((suggestion, index) => {
      const priorityColors = {
        high: "red",
        medium: "yellow",
        low: "green",
      };

      const color = priorityColors[suggestion.priority] || "white";

      console.log(
        `\n${index + 1}. ${this.colorize(`[${suggestion.priority.toUpperCase()}]`, color)} ${this.colorize(suggestion.category, "cyan")}`,
      );
      console.log(`   ${suggestion.message}`);
    });
  }

  /**
   * Print health score
   */
  printHealthScore(healthScore) {
    const getScoreColor = (score) => {
      if (score >= 95) return "green";
      if (score >= 80) return "yellow";
      if (score >= 60) return "red";
      return "red";
    };

    const getScoreEmoji = (score) => {
      if (score >= 95) return "🟢";
      if (score >= 80) return "🟡";
      if (score >= 60) return "🟠";
      return "🔴";
    };

    console.log(this.colorize("💯 SITE HEALTH SCORE", "bright"));
    console.log(this.colorize("─".repeat(50), "gray"));
    console.log(
      `\n${getScoreEmoji(healthScore)} Overall Health: ${this.colorize(healthScore + "/100", getScoreColor(healthScore))}`,
    );

    // Health interpretation
    let interpretation;
    if (healthScore >= 95) {
      interpretation = "Excellent! Your site links are in great shape.";
    } else if (healthScore >= 80) {
      interpretation = "Good! Minor issues to address for optimal performance.";
    } else if (healthScore >= 60) {
      interpretation = "Fair. Several link issues need attention.";
    } else {
      interpretation = "Poor. Critical link issues require immediate fixing.";
    }

    console.log(`${this.colorize("Assessment:", "cyan")} ${interpretation}`);
  }

  /**
   * Print footer
   */
  printFooter(success, duration) {
    const footerLine = "=".repeat(80);
    console.log(this.colorize(footerLine, "cyan"));

    if (success) {
      console.log(
        this.colorize(
          "🎉 All tests passed! Your site links are working perfectly.",
          "green",
        ),
      );
    } else {
      console.log(
        this.colorize(
          "❌ Tests failed. Please review and fix the broken links above.",
          "red",
        ),
      );
    }

    console.log(
      this.colorize(
        `⏱ Total execution time: ${(duration / 1000).toFixed(2)}s`,
        "blue",
      ),
    );
    console.log(this.colorize(footerLine, "cyan"));
  }

  /**
   * Generate report files
   */
  generateReportFiles(results, report) {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.options.outputDir)) {
        fs.mkdirSync(this.options.outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const baseFileName = `link-check-${timestamp}`;

      // Generate JSON report
      if (this.options.jsonOutput) {
        const jsonReport = {
          testName: this.testName,
          timestamp: new Date().toISOString(),
          summary: report.summary,
          results,
          report,
          logs: this.logBuffer,
        };

        const jsonPath = path.join(
          this.options.outputDir,
          `${baseFileName}.json`,
        );
        fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
        this.log(`JSON report saved to: ${jsonPath}`, "info");
      }

      // Generate text report for broken links
      if (results.broken > 0) {
        const textReport = this.generateTextReport(results, report);
        const textPath = path.join(
          this.options.outputDir,
          `${baseFileName}.txt`,
        );
        fs.writeFileSync(textPath, textReport);
        this.log(`Text report saved to: ${textPath}`, "info");
      }
    } catch (error) {
      this.error(`Failed to generate report files: ${error.message}`);
    }
  }

  /**
   * Generate text report
   */
  generateTextReport(results, report) {
    const lines = [];
    lines.push(`A Lo Cubano Boulder Fest - ${this.testName} Report`);
    lines.push("=".repeat(80));
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");

    // Summary
    lines.push("SUMMARY");
    lines.push("-".repeat(40));
    lines.push(`Total Links: ${results.total}`);
    lines.push(`Broken Links: ${results.broken}`);
    lines.push(`Success Rate: ${report.summary.successRate}`);
    lines.push(`Duration: ${report.summary.duration}`);
    lines.push("");

    // Broken Links
    if (report.brokenLinks.length > 0) {
      lines.push("BROKEN LINKS");
      lines.push("-".repeat(40));

      report.brokenLinks.forEach((link, index) => {
        lines.push(`${index + 1}. ${link.url}`);
        lines.push(`   File: ${link.file}:${link.lineNumber}`);
        lines.push(`   Type: ${link.type}`);
        lines.push(`   Error: ${link.error}`);
        if (link.suggestion) {
          lines.push(`   Suggestion: ${link.suggestion}`);
        }
        lines.push("");
      });
    }

    // Suggestions
    if (report.suggestions.length > 0) {
      lines.push("SUGGESTIONS");
      lines.push("-".repeat(40));

      report.suggestions.forEach((suggestion, index) => {
        lines.push(
          `${index + 1}. [${suggestion.priority.toUpperCase()}] ${suggestion.category}`,
        );
        lines.push(`   ${suggestion.message}`);
        lines.push("");
      });
    }

    lines.push(`Health Score: ${report.healthScore}/100`);
    lines.push("");
    lines.push("End of Report");

    return lines.join("\n");
  }

  // Generate HTML test report
  generateHTMLReport() {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>A Lo Cubano Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .passed { color: green; }
        .failed { color: red; }
        .coverage { background: #f5f5f5; padding: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>Test Report - ${this.results.timestamp}</h1>
    <div class="summary">
        <h2>Summary</h2>
        <p>Total Tests: ${this.results.total}</p>
        <p class="passed">Passed: ${this.results.passed}</p>
        <p class="failed">Failed: ${this.results.failed}</p>
    </div>
    <div class="coverage">
        <h2>Coverage</h2>
        <pre>${JSON.stringify(this.results.coverage, null, 2)}</pre>
    </div>
</body>
</html>
        `;

    fs.writeFileSync("test-report.html", html);
    console.log("📄 HTML report generated: test-report.html");
  }

  // Generate JSON report for CI/CD
  generateJSONReport() {
    fs.writeFileSync("test-report.json", JSON.stringify(this.results, null, 2));
    console.log("📄 JSON report generated: test-report.json");
  }

  // Integration with Jest custom reporter
  onRunComplete(contexts, results) {
    this.results.total = results.numTotalTests;
    this.results.passed = results.numPassedTests;
    this.results.failed = results.numFailedTests;

    // Generate reports
    this.generateHTMLReport();
    this.generateJSONReport();
  }
}

export { TestReporter };
