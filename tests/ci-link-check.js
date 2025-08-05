#!/usr/bin/env node

/**
 * A Lo Cubano Boulder Fest - CI/CD Link Validation
 * Optimized for CI/CD environments with structured output
 */

import { LinkChecker } from "./link-checker.js";
import { TestReporter } from "./utils/test-reporter.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CILinkChecker {
  constructor() {
    this.isCI =
      process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
    this.options = {
      verbose: false,
      colors: !this.isCI,
      checkExternal: process.env.CHECK_EXTERNAL !== "false",
      jsonOutput: true,
      outputDir: path.join(__dirname, "..", "test-reports"),
      timeout: 10000, // Longer timeout for CI
      maxRetries: 3, // More retries for CI
    };
  }

  async run() {
    console.log("🔗 Starting CI Link Validation for A Lo Cubano Boulder Fest");

    try {
      // Initialize link checker
      const linkChecker = new LinkChecker(this.options);

      // Run validation
      const result = await linkChecker.checkAllLinks();

      // Generate CI-specific outputs
      await this.generateCIOutputs(result);

      // Exit with appropriate code
      if (result.success) {
        console.log("✅ All link validation tests passed");
        process.exit(0);
      } else {
        console.error(
          `❌ Link validation failed with ${result.results.broken} broken links`,
        );
        process.exit(1);
      }
    } catch (error) {
      console.error("💥 CI Link validation failed:", error.message);

      // Generate error report
      await this.generateErrorReport(error);

      process.exit(1);
    }
  }

  /**
   * Generate CI-specific outputs
   */
  async generateCIOutputs(result) {
    const { results, report } = result;

    // GitHub Actions specific outputs
    if (process.env.GITHUB_ACTIONS) {
      await this.generateGitHubOutputs(results, report);
    }

    // General CI outputs
    await this.generateJUnitReport(results, report);
    await this.generateSummaryReport(results, report);
  }

  /**
   * Generate GitHub Actions specific outputs
   */
  async generateGitHubOutputs(results, report) {
    try {
      // Set GitHub Actions outputs
      if (process.env.GITHUB_OUTPUT) {
        const outputs = [
          `total_links=${results.total}`,
          `broken_links=${results.broken}`,
          `success_rate=${report.summary.successRate}`,
          `health_score=${report.healthScore}`,
          `test_passed=${results.broken === 0}`,
        ];

        fs.appendFileSync(process.env.GITHUB_OUTPUT, outputs.join("\n") + "\n");
      }

      // Generate step summary
      if (process.env.GITHUB_STEP_SUMMARY) {
        const summary = this.generateMarkdownSummary(results, report);
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
      }

      // Generate annotations for broken links
      if (results.broken > 0 && report.brokenLinks) {
        report.brokenLinks.forEach((link) => {
          console.log(
            `::error file=${link.file},line=${link.lineNumber}::Broken link: ${link.url} - ${link.error}`,
          );
        });
      }
    } catch (error) {
      console.warn("Failed to generate GitHub Actions outputs:", error.message);
    }
  }

  /**
   * Generate Markdown summary for GitHub Actions
   */
  generateMarkdownSummary(results, report) {
    const lines = [];

    lines.push("# 🔗 Link Validation Report");
    lines.push("");

    // Summary table
    lines.push("## 📊 Summary");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Total Links | ${results.total} |`);
    lines.push(`| Broken Links | ${results.broken} |`);
    lines.push(`| Success Rate | ${report.summary.successRate} |`);
    lines.push(`| Health Score | ${report.healthScore}/100 |`);
    lines.push(`| Duration | ${report.summary.duration} |`);
    lines.push("");

    // Status indicator
    if (results.broken === 0) {
      lines.push("## ✅ Status: PASSED");
      lines.push("All links are working correctly!");
    } else {
      lines.push("## ❌ Status: FAILED");
      lines.push(
        `Found ${results.broken} broken link${results.broken === 1 ? "" : "s"} that need attention.`,
      );
    }
    lines.push("");

    // Breakdown by type
    lines.push("## 📈 Breakdown by Type");
    lines.push("| Type | Total | Broken | Success Rate |");
    lines.push("|------|-------|--------|--------------|");

    Object.entries(report.breakdown.byType).forEach(([type, stats]) => {
      const successRate =
        stats.total > 0
          ? `${(((stats.total - stats.broken) / stats.total) * 100).toFixed(1)}%`
          : "100%";
      lines.push(
        `| ${type} | ${stats.total} | ${stats.broken} | ${successRate} |`,
      );
    });
    lines.push("");

    // Broken links details
    if (results.broken > 0 && report.brokenLinks) {
      lines.push("## 🔴 Broken Links Details");

      report.brokenLinks.forEach((link, index) => {
        lines.push(`### ${index + 1}. \`${link.url}\``);
        lines.push(`- **File**: ${link.file}:${link.lineNumber}`);
        lines.push(`- **Type**: ${link.type}`);
        lines.push(`- **Error**: ${link.error}`);
        if (link.suggestion) {
          lines.push(`- **Suggestion**: ${link.suggestion}`);
        }
        lines.push("");
      });
    }

    // Suggestions
    if (report.suggestions && report.suggestions.length > 0) {
      lines.push("## 💡 Suggestions");

      report.suggestions.forEach((suggestion, index) => {
        const priority = suggestion.priority.toUpperCase();
        const emoji =
          priority === "HIGH" ? "🚨" : priority === "MEDIUM" ? "⚠️" : "💡";

        lines.push(`### ${emoji} ${suggestion.category}`);
        lines.push(`**Priority**: ${priority}`);
        lines.push(suggestion.message);
        lines.push("");
      });
    }

    return lines.join("\n");
  }

  /**
   * Generate JUnit XML report
   */
  async generateJUnitReport(results, report) {
    try {
      const timestamp = new Date().toISOString();
      const duration = (results.endTime - results.startTime) / 1000;

      const lines = [];
      lines.push('<?xml version="1.0" encoding="UTF-8"?>');
      lines.push(
        `<testsuites name="LinkValidation" tests="${results.total}" failures="${results.broken}" time="${duration.toFixed(3)}" timestamp="${timestamp}">`,
      );
      lines.push(
        `  <testsuite name="A Lo Cubano Boulder Fest Link Validation" tests="${results.total}" failures="${results.broken}" time="${duration.toFixed(3)}">`,
      );

      // Add test cases for each link
      results.details.forEach((detail, index) => {
        const testName = `Link_${index + 1}_${detail.type}_${detail.url.replace(/[^a-zA-Z0-9]/g, "_")}`;

        if (detail.status === "ok") {
          lines.push(
            `    <testcase name="${testName}" classname="LinkValidation" time="0"/>`,
          );
        } else {
          lines.push(
            `    <testcase name="${testName}" classname="LinkValidation" time="0">`,
          );
          lines.push(
            `      <failure message="${detail.error}" type="${detail.status}">`,
          );
          lines.push(`        <![CDATA[`);
          lines.push(`URL: ${detail.url}`);
          lines.push(`File: ${detail.file}:${detail.lineNumber}`);
          lines.push(`Type: ${detail.type}`);
          lines.push(`Error: ${detail.error}`);
          if (detail.suggestion) {
            lines.push(`Suggestion: ${detail.suggestion}`);
          }
          lines.push(`        ]]>`);
          lines.push(`      </failure>`);
          lines.push(`    </testcase>`);
        }
      });

      lines.push("  </testsuite>");
      lines.push("</testsuites>");

      // Save JUnit report
      if (!fs.existsSync(this.options.outputDir)) {
        fs.mkdirSync(this.options.outputDir, { recursive: true });
      }

      const junitPath = path.join(
        this.options.outputDir,
        "junit-link-validation.xml",
      );
      fs.writeFileSync(junitPath, lines.join("\n"));

      console.log(`📄 JUnit report saved to: ${junitPath}`);
    } catch (error) {
      console.warn("Failed to generate JUnit report:", error.message);
    }
  }

  /**
   * Generate summary report for CI
   */
  async generateSummaryReport(results, report) {
    try {
      const summary = {
        timestamp: new Date().toISOString(),
        status: results.broken === 0 ? "PASSED" : "FAILED",
        summary: report.summary,
        healthScore: report.healthScore,
        brokenLinksCount: results.broken,
        totalLinksCount: results.total,
        brokenLinks: report.brokenLinks || [],
        suggestions: report.suggestions || [],
      };

      const summaryPath = path.join(
        this.options.outputDir,
        "link-validation-summary.json",
      );
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

      console.log(`📊 Summary report saved to: ${summaryPath}`);
    } catch (error) {
      console.warn("Failed to generate summary report:", error.message);
    }
  }

  /**
   * Generate error report
   */
  async generateErrorReport(error) {
    try {
      const errorReport = {
        timestamp: new Date().toISOString(),
        status: "ERROR",
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      };

      if (!fs.existsSync(this.options.outputDir)) {
        fs.mkdirSync(this.options.outputDir, { recursive: true });
      }

      const errorPath = path.join(
        this.options.outputDir,
        "link-validation-error.json",
      );
      fs.writeFileSync(errorPath, JSON.stringify(errorReport, null, 2));

      console.log(`🚨 Error report saved to: ${errorPath}`);
    } catch (reportError) {
      console.warn("Failed to generate error report:", reportError.message);
    }
  }
}

// Run CI link checker
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new CILinkChecker();
  checker.run();
}
