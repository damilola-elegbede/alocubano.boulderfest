#!/usr/bin/env node

/**
 * Test Results Aggregation Script
 *
 * Aggregates test results from various sources and formats them
 * for consumption by GitHub Actions and PR comments.
 *
 * Usage:
 *   node scripts/aggregate-test-results.js [options]
 *
 * Options:
 *   --unit-results <path>       Path to unit test results JSON
 *   --e2e-results <glob>        Glob pattern for E2E test results
 *   --performance-results <path> Path to performance test results
 *   --security-results <path>   Path to security scan results
 *   --output <path>             Output file for aggregated results
 *   --format <format>           Output format: json, github-summary, pr-comment
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

class TestResultsAggregator {
  constructor() {
    this.results = {
      unit: null,
      e2e: [],
      performance: null,
      security: null,
      overall: {
        status: 'unknown',
        total_tests: 0,
        passed_tests: 0,
        failed_tests: 0,
        skipped_tests: 0,
        total_execution_time: 0,
        timestamp: new Date().toISOString()
      }
    };
  }

  async loadUnitResults(filePath) {
    try {
      if (!filePath) return null;

      console.log(`📊 Loading unit test results from ${filePath}...`);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      const unitResults = {
        type: 'unit',
        status: data.numFailedTests > 0 ? 'failure' : 'success',
        total_tests: data.numTotalTests || 0,
        passed_tests: data.numPassedTests || 0,
        failed_tests: data.numFailedTests || 0,
        skipped_tests: data.numPendingTests || 0,
        execution_time: data.testResults?.[0]?.duration || 0,
        coverage: null
      };

      // Try to load coverage if available
      try {
        const coveragePath = path.join(path.dirname(filePath), '../coverage/coverage-summary.json');
        const coverageContent = await fs.readFile(coveragePath, 'utf8');
        const coverageData = JSON.parse(coverageContent);
        unitResults.coverage = Math.round(coverageData.total?.lines?.pct || 0);
      } catch (err) {
        console.log('ℹ️ Coverage data not found');
      }

      this.results.unit = unitResults;
      console.log(`✅ Unit test results loaded: ${unitResults.passed_tests}/${unitResults.total_tests} passed`);

      return unitResults;
    } catch (error) {
      console.error(`❌ Failed to load unit test results: ${error.message}`);
      return null;
    }
  }

  async loadE2EResults(pattern) {
    try {
      if (!pattern) return [];

      console.log(`🎭 Loading E2E test results from pattern: ${pattern}...`);
      const files = await glob(pattern);

      const e2eResults = [];

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf8');
          const data = JSON.parse(content);

          // Extract browser name from filename
          const browserMatch = path.basename(file).match(/e2e-(\w+)-results\.json/);
          const browser = browserMatch ? browserMatch[1] : 'unknown';

          // Parse Playwright test results
          const suites = data.suites || [];
          let totalTests = 0;
          let passedTests = 0;
          let failedTests = 0;
          let skippedTests = 0;
          let flakyTests = [];

          for (const suite of suites) {
            const specs = suite.specs || [];
            for (const spec of specs) {
              totalTests++;

              if (spec.ok) {
                passedTests++;

                // Check for flaky tests (passed after retry)
                const tests = spec.tests || [];
                for (const test of tests) {
                  const results = test.results || [];
                  for (const result of results) {
                    if (result.retry > 0 && result.status === 'passed') {
                      flakyTests.push(spec.title);
                    }
                  }
                }
              } else {
                failedTests++;
              }
            }
          }

          const e2eResult = {
            type: 'e2e',
            browser,
            status: failedTests > 0 ? 'failure' : 'success',
            total_tests: totalTests,
            passed_tests: passedTests,
            failed_tests: failedTests,
            skipped_tests: skippedTests,
            execution_time: this.extractExecutionTime(data),
            flaky_tests: flakyTests
          };

          e2eResults.push(e2eResult);
          console.log(`✅ E2E results loaded for ${browser}: ${passedTests}/${totalTests} passed`);

        } catch (error) {
          console.error(`⚠️ Failed to parse E2E result file ${file}: ${error.message}`);
        }
      }

      this.results.e2e = e2eResults;
      return e2eResults;
    } catch (error) {
      console.error(`❌ Failed to load E2E test results: ${error.message}`);
      return [];
    }
  }

  async loadPerformanceResults(filePath) {
    try {
      if (!filePath) return null;

      console.log(`⚡ Loading performance test results from ${filePath}...`);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      const performanceResults = {
        type: 'performance',
        status: 'success', // Will be determined based on thresholds
        metrics: {
          health_check_time: data.health_check_time || 'N/A',
          target_url: data.target_url || '',
          response_times: data.response_times || {},
          error_rate: data.error_rate || 0
        },
        timestamp: data.timestamp || new Date().toISOString()
      };

      // Simple performance validation - can be enhanced
      if (data.error_rate && data.error_rate > 0.01) {
        performanceResults.status = 'failure';
      }

      this.results.performance = performanceResults;
      console.log(`✅ Performance results loaded: ${performanceResults.status}`);

      return performanceResults;
    } catch (error) {
      console.error(`❌ Failed to load performance results: ${error.message}`);
      return null;
    }
  }

  async loadSecurityResults(filePath) {
    try {
      if (!filePath) return null;

      console.log(`🔒 Loading security scan results from ${filePath}...`);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      let vulnerabilities = 0;
      let critical_vulnerabilities = 0;

      for (const line of lines) {
        if (line.includes('vulnerabilities')) {
          const match = line.match(/(\d+)\s+vulnerabilities/);
          if (match) {
            vulnerabilities += parseInt(match[1], 10);
          }
        }
        if (line.includes('critical')) {
          const match = line.match(/(\d+)\s+critical/);
          if (match) {
            critical_vulnerabilities += parseInt(match[1], 10);
          }
        }
      }

      const securityResults = {
        type: 'security',
        status: critical_vulnerabilities > 0 ? 'failure' : (vulnerabilities > 0 ? 'warning' : 'success'),
        vulnerabilities,
        critical_vulnerabilities,
        summary: `${vulnerabilities} vulnerabilities found (${critical_vulnerabilities} critical)`
      };

      this.results.security = securityResults;
      console.log(`✅ Security results loaded: ${securityResults.summary}`);

      return securityResults;
    } catch (error) {
      console.error(`❌ Failed to load security results: ${error.message}`);
      return null;
    }
  }

  extractExecutionTime(data) {
    // Try to extract execution time from Playwright results
    if (data.config?.metadata?.executionTime) {
      return Math.round(data.config.metadata.executionTime / 1000);
    }

    // Fallback: calculate from test durations
    let totalDuration = 0;
    const suites = data.suites || [];

    for (const suite of suites) {
      const specs = suite.specs || [];
      for (const spec of specs) {
        const tests = spec.tests || [];
        for (const test of tests) {
          const results = test.results || [];
          for (const result of results) {
            totalDuration += result.duration || 0;
          }
        }
      }
    }

    return Math.round(totalDuration / 1000); // Convert to seconds
  }

  calculateOverallStatus() {
    let status = 'success';
    let total_tests = 0;
    let passed_tests = 0;
    let failed_tests = 0;
    let skipped_tests = 0;
    let total_execution_time = 0;

    // Aggregate unit test results
    if (this.results.unit) {
      total_tests += this.results.unit.total_tests;
      passed_tests += this.results.unit.passed_tests;
      failed_tests += this.results.unit.failed_tests;
      skipped_tests += this.results.unit.skipped_tests;
      total_execution_time += this.results.unit.execution_time;

      if (this.results.unit.status === 'failure') {
        status = 'failure';
      }
    }

    // Aggregate E2E test results
    for (const e2eResult of this.results.e2e) {
      total_tests += e2eResult.total_tests;
      passed_tests += e2eResult.passed_tests;
      failed_tests += e2eResult.failed_tests;
      skipped_tests += e2eResult.skipped_tests;
      total_execution_time = Math.max(total_execution_time, e2eResult.execution_time);

      if (e2eResult.status === 'failure') {
        status = 'failure';
      }
    }

    // Check performance results
    if (this.results.performance?.status === 'failure') {
      status = status === 'success' ? 'warning' : status;
    }

    // Check security results
    if (this.results.security?.status === 'failure') {
      status = 'failure';
    } else if (this.results.security?.status === 'warning' && status === 'success') {
      status = 'warning';
    }

    this.results.overall = {
      status,
      total_tests,
      passed_tests,
      failed_tests,
      skipped_tests,
      total_execution_time,
      timestamp: new Date().toISOString()
    };

    return this.results.overall;
  }

  generateGitHubSummary() {
    const overall = this.results.overall;
    const statusEmoji = overall.status === 'success' ? '✅' : (overall.status === 'failure' ? '❌' : '⚠️');

    let summary = `## ${statusEmoji} Test Results Summary\n\n`;
    summary += `**Overall Status:** ${overall.status.toUpperCase()}\n`;
    summary += `**Total Tests:** ${overall.total_tests}\n`;
    summary += `**Passed:** ${overall.passed_tests}\n`;
    summary += `**Failed:** ${overall.failed_tests}\n`;
    summary += `**Execution Time:** ${this.formatDuration(overall.total_execution_time)}\n\n`;

    if (this.results.unit) {
      summary += `### Unit Tests\n`;
      summary += `- **Status:** ${this.results.unit.status === 'success' ? '✅ Passed' : '❌ Failed'}\n`;
      summary += `- **Tests:** ${this.results.unit.passed_tests}/${this.results.unit.total_tests} passed\n`;
      if (this.results.unit.coverage) {
        summary += `- **Coverage:** ${this.results.unit.coverage}%\n`;
      }
      summary += `- **Time:** ${this.formatDuration(this.results.unit.execution_time)}\n\n`;
    }

    if (this.results.e2e.length > 0) {
      summary += `### E2E Tests\n`;
      for (const e2e of this.results.e2e) {
        const emoji = e2e.status === 'success' ? '✅' : '❌';
        summary += `- **${e2e.browser}** ${emoji}: ${e2e.passed_tests}/${e2e.total_tests} passed`;
        if (e2e.flaky_tests.length > 0) {
          summary += ` (${e2e.flaky_tests.length} flaky)`;
        }
        summary += `\n`;
      }
      summary += '\n';
    }

    if (this.results.performance) {
      const emoji = this.results.performance.status === 'success' ? '✅' : (this.results.performance.status === 'failure' ? '❌' : '⚠️');
      summary += `### Performance Tests\n`;
      summary += `- **Status:** ${emoji} ${this.results.performance.status}\n`;
      summary += `- **Health Check:** ${this.results.performance.metrics.health_check_time}\n\n`;
    }

    if (this.results.security) {
      const emoji = this.results.security.status === 'success' ? '✅' : (this.results.security.status === 'failure' ? '❌' : '⚠️');
      summary += `### Security Scan\n`;
      summary += `- **Status:** ${emoji} ${this.results.security.status}\n`;
      summary += `- **Summary:** ${this.results.security.summary}\n\n`;
    }

    return summary;
  }

  formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    } else {
      return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
    }
  }

  async saveResults(outputPath, format = 'json') {
    try {
      let content;

      switch (format) {
        case 'json':
          content = JSON.stringify(this.results, null, 2);
          break;
        case 'github-summary':
          content = this.generateGitHubSummary();
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      await fs.writeFile(outputPath, content, 'utf8');
      console.log(`✅ Results saved to ${outputPath} (${format} format)`);
    } catch (error) {
      console.error(`❌ Failed to save results: ${error.message}`);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '').replace(/-/g, '_');
    const value = args[i + 1];
    if (key && value) {
      options[key] = value;
    }
  }

  const aggregator = new TestResultsAggregator();

  console.log('🔄 Aggregating test results...');

  // Load results from various sources
  if (options.unit_results) {
    await aggregator.loadUnitResults(options.unit_results);
  }

  if (options.e2e_results) {
    await aggregator.loadE2EResults(options.e2e_results);
  }

  if (options.performance_results) {
    await aggregator.loadPerformanceResults(options.performance_results);
  }

  if (options.security_results) {
    await aggregator.loadSecurityResults(options.security_results);
  }

  // Calculate overall status
  const overall = aggregator.calculateOverallStatus();
  console.log(`📊 Overall status: ${overall.status} (${overall.passed_tests}/${overall.total_tests} passed)`);

  // Save results
  const outputPath = options.output || 'aggregated-test-results.json';
  const format = options.format || 'json';

  await aggregator.saveResults(outputPath, format);

  // Exit with appropriate code
  process.exit(overall.status === 'failure' ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Aggregation failed:', error);
    process.exit(1);
  });
}

export { TestResultsAggregator };