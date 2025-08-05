#!/usr/bin/env node

/**
 * A Lo Cubano Boulder Fest - Test Reporting Demo
 * Demonstrates the capabilities of the test output formatting system
 */

import { TestReporter } from "./utils/test-reporter.js";
import { performance } from "perf_hooks";

class ReportingDemo {
  constructor() {
    this.reporter = new TestReporter("Demo Test Suite", {
      verbose: true,
      colors: true,
      jsonOutput: true,
    });
  }

  async runDemo() {
    console.log("🚀 A Lo Cubano Boulder Fest - Test Reporting System Demo\n");

    // Start the demo test
    this.reporter.startTest();

    // Simulate different types of log messages
    await this.demonstrateLogging();

    // Simulate progress tracking
    await this.demonstrateProgress();

    // Simulate test results
    await this.demonstrateResults();

    console.log(
      "\n✨ Demo completed! Check the generated reports in test-reports/\n",
    );
  }

  async demonstrateLogging() {
    this.reporter.log("Demonstrating different log levels...", "info");

    await this.sleep(500);
    this.reporter.success("Successfully connected to test server");

    await this.sleep(300);
    this.reporter.warn("Non-critical warning detected");

    await this.sleep(300);
    this.reporter.debug("Debug information (only visible in verbose mode)");

    await this.sleep(300);
    this.reporter.error("Sample error message for demonstration");

    await this.sleep(500);
  }

  async demonstrateProgress() {
    this.reporter.log("Demonstrating progress tracking...", "info");

    const total = 50;
    this.reporter.startProgress(total);

    for (let i = 0; i <= total; i += 5) {
      this.reporter.updateProgress(i);
      await this.sleep(100);
    }

    this.reporter.endProgress();
    await this.sleep(500);
  }

  async demonstrateResults() {
    // Create mock test results
    const mockResults = {
      total: 100,
      broken: 12,
      fixed: 3,
      external: 25,
      internal: 75,
      byType: {
        navigation: { total: 30, broken: 8 },
        content: { total: 20, broken: 2 },
        asset: { total: 25, broken: 1 },
        external: { total: 25, broken: 1 },
      },
      details: this.generateMockDetails(),
      startTime: performance.now() - 5000,
      endTime: performance.now(),
    };

    const mockReport = {
      summary: {
        totalLinks: mockResults.total,
        brokenLinks: mockResults.broken,
        successRate: "88.0%",
        duration: "5.00s",
        timestamp: new Date().toISOString(),
      },
      breakdown: {
        byType: mockResults.byType,
        byStatus: {
          ok: 88,
          broken: 12,
          fixed: 3,
        },
      },
      brokenLinks: this.generateMockBrokenLinks(),
      suggestions: this.generateMockSuggestions(),
      healthScore: 88,
    };

    // Display the comprehensive results
    this.reporter.displayResults(mockResults, mockReport);
  }

  generateMockDetails() {
    const details = [];

    // Generate some mock successful links
    for (let i = 0; i < 88; i++) {
      details.push({
        url: `/page-${i}.html`,
        type: "navigation",
        file: `pages/page-${i}.html`,
        lineNumber: 25,
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    }

    // Generate some mock broken links
    const brokenUrls = [
      "/missing-page.html",
      "/old-resource.css",
      "https://example-broken-external.com",
      "/images/missing-image.jpg",
    ];

    brokenUrls.forEach((url, index) => {
      details.push({
        url,
        type: url.includes("http")
          ? "external"
          : url.includes(".css") || url.includes(".jpg")
            ? "asset"
            : "navigation",
        file: `pages/demo-page-${index}.html`,
        lineNumber: 45 + index,
        status: "broken",
        error: "Resource not found",
        suggestion: "Check if the file exists and path is correct",
        timestamp: new Date().toISOString(),
      });
    });

    return details;
  }

  generateMockBrokenLinks() {
    return [
      {
        url: "/missing-page.html",
        type: "navigation",
        file: "pages/demo-page-1.html",
        lineNumber: 45,
        error: "File not found",
        suggestion: "Check if the file exists in the pages directory",
        context: '<a href="/missing-page.html">Missing Link</a>',
      },
      {
        url: "/old-resource.css",
        type: "asset",
        file: "pages/demo-page-2.html",
        lineNumber: 12,
        error: "Resource not found",
        suggestion: "Update CSS file reference to correct path",
        context: '<link rel="stylesheet" href="/old-resource.css">',
      },
      {
        url: "https://example-broken-external.com",
        type: "external",
        file: "pages/demo-page-3.html",
        lineNumber: 78,
        error: "HTTP 404 Not Found",
        suggestion: "Verify external URL is still valid",
        context:
          '<a href="https://example-broken-external.com">External Link</a>',
      },
    ];
  }

  generateMockSuggestions() {
    return [
      {
        priority: "high",
        category: "Critical Navigation",
        message: "Fix broken navigation links to ensure proper site navigation",
      },
      {
        priority: "medium",
        category: "External Links",
        message:
          "Review external links and consider implementing link monitoring",
      },
      {
        priority: "low",
        category: "Performance",
        message:
          "Consider implementing automated link checking in CI/CD pipeline",
      },
    ];
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new ReportingDemo();
  demo.runDemo().catch((error) => {
    console.error("Demo failed:", error);
    process.exit(1);
  });
}
