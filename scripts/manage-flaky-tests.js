#!/usr/bin/env node

/**
 * Flaky Test Management Script
 * 
 * This script helps manage flaky tests by providing utilities to:
 * - Detect flaky test patterns from test results
 * - Manage test quarantine system
 * - Generate flaky test reports
 * - Automatically retry flaky tests
 * - Track success rates and failure patterns
 * 
 * Usage:
 *   node scripts/manage-flaky-tests.js <command> [options]
 * 
 * Commands:
 *   detect     - Detect flaky tests from recent test runs
 *   list       - List all known flaky tests
 *   quarantine - Quarantine or unquarantine tests
 *   report     - Generate flaky test report
 *   cleanup    - Clean up old flaky test data
 *   analyze    - Analyze test failure patterns
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Escape HTML entities to prevent injection attacks
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Ensure directory exists
 */
async function ensureDirectory(dirPath) {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}
const projectRoot = join(__dirname, '..');

// Configuration
const CONFIG = {
  paths: {
    testResults: join(projectRoot, 'test-results'),
    flakyData: join(projectRoot, '.tmp/flaky-tests.json'),
    reports: join(projectRoot, 'reports'),
    quarantine: join(projectRoot, '.tmp/quarantine.json')
  },
  thresholds: {
    failureRate: 0.3, // 30% failure rate triggers flaky detection
    minimumRuns: 3, // Minimum test runs before considering flaky
    quarantineThreshold: 0.7, // Success rate below 70% gets quarantined
    staleDataDays: 30 // Remove data older than 30 days
  }
};

class FlakyTestManager {
  constructor() {
    this.flakyTests = this.loadFlakyTestData();
    this.quarantine = this.loadQuarantineData();
  }

  /**
   * Detect flaky tests from test results
   */
  async detectFlakyTests(options = {}) {
    console.log('🔍 Detecting flaky tests from recent test runs...');
    
    const { daysBack = 7, verbose = false } = options;
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    
    // Collect test results
    const testResults = await this.collectTestResults(cutoffDate);
    
    if (testResults.length === 0) {
      console.log('ℹ️ No test results found for analysis');
      return [];
    }
    
    console.log(`📊 Analyzing ${testResults.length} test result files...`);
    
    // Analyze test patterns
    const testStats = this.analyzeTestPatterns(testResults);
    
    // Identify flaky tests
    const flakyTests = this.identifyFlakyTests(testStats);
    
    if (flakyTests.length === 0) {
      console.log('✅ No flaky tests detected');
      return [];
    }
    
    console.log(`🔄 Detected ${flakyTests.length} flaky tests:`);
    
    flakyTests.forEach(test => {
      console.log(`  - ${test.name} (${test.suite})`);
      console.log(`    Failure rate: ${(test.failureRate * 100).toFixed(1)}%`);
      console.log(`    Runs: ${test.totalRuns} (${test.failures} failures)`);
      
      if (verbose) {
        console.log(`    Last failure: ${test.lastFailure}`);
        console.log(`    Common errors: ${test.commonErrors.slice(0, 2).join(', ')}`);
      }
    });
    
    // Update flaky test database
    await this.updateFlakyTestDatabase(flakyTests);
    
    return flakyTests;
  }

  /**
   * List all known flaky tests
   */
  listFlakyTests(options = {}) {
    console.log('📋 Known Flaky Tests:');
    console.log('═'.repeat(60));
    
    const { showQuarantined = true, sortBy = 'failureRate' } = options;
    
    if (this.flakyTests.tests.length === 0) {
      console.log('✅ No flaky tests recorded');
      return;
    }
    
    // Filter and sort tests
    let tests = this.flakyTests.tests.slice();
    
    if (!showQuarantined) {
      tests = tests.filter(test => !test.quarantined);
    }
    
    tests.sort((a, b) => {
      switch (sortBy) {
        case 'failureRate':
          return (b.failureRate || 0) - (a.failureRate || 0);
        case 'lastSeen':
          return new Date(b.lastFailure || b.detectedAt) - new Date(a.lastFailure || a.detectedAt);
        case 'name':
          return a.testName.localeCompare(b.testName);
        default:
          return 0;
      }
    });
    
    tests.forEach((test, index) => {
      const status = test.quarantined ? '🚨 QUARANTINED' : '🔄 MONITORED';
      const failureRate = test.failureRate ? `${(test.failureRate * 100).toFixed(1)}%` : 'Unknown';
      
      console.log(`${index + 1}. ${status} ${escapeHtml(test.testName)}`);
      console.log(`   Suite: ${escapeHtml(test.testSuite)}`);
      console.log(`   Failure Rate: ${failureRate}`);
      console.log(`   Last Seen: ${escapeHtml(this.formatDate(test.lastFailure || test.detectedAt))}`);
      
      if (test.quarantined && test.quarantineUntil) {
        const until = new Date(test.quarantineUntil);
        const remaining = Math.max(0, Math.ceil((until - new Date()) / (24 * 60 * 60 * 1000)));
        console.log(`   Quarantine: ${remaining} days remaining`);
      }
      
      console.log('');
    });
    
    console.log('═'.repeat(60));
    console.log(`Total: ${tests.length} flaky tests`);
    
    if (!showQuarantined) {
      const quarantinedCount = this.flakyTests.tests.filter(t => t.quarantined).length;
      if (quarantinedCount > 0) {
        console.log(`(${quarantinedCount} quarantined tests hidden - use --show-quarantined to see all)`);
      }
    }
  }

  /**
   * Quarantine or unquarantine tests
   */
  async quarantineTest(testName, testSuite, action = 'quarantine', options = {}) {
    const { reason = 'Manual quarantine', duration = 7 } = options;
    
    console.log(`${action === 'quarantine' ? '🚨' : '✅'} ${action === 'quarantine' ? 'Quarantining' : 'Unquarantining'} test: ${testName}`);
    
    // Find the test
    const testIndex = this.flakyTests.tests.findIndex(test => 
      test.testName === testName && test.testSuite === testSuite
    );
    
    if (testIndex === -1) {
      // Create new flaky test entry if quarantining
      if (action === 'quarantine') {
        const newTest = {
          testName,
          testSuite,
          detectedAt: new Date().toISOString(),
          failureRate: 1.0, // Assume high failure rate for manual quarantine
          quarantined: true,
          quarantineReason: reason,
          quarantineUntil: new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString()
        };
        
        this.flakyTests.tests.push(newTest);
        console.log(`✅ Test quarantined for ${duration} days`);
      } else {
        console.log('❌ Test not found in flaky test database');
        return false;
      }
    } else {
      // Update existing test
      const test = this.flakyTests.tests[testIndex];
      
      if (action === 'quarantine') {
        test.quarantined = true;
        test.quarantineReason = reason;
        test.quarantineUntil = new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString();
        console.log(`✅ Test quarantined for ${duration} days`);
      } else {
        test.quarantined = false;
        test.unquarantinedAt = new Date().toISOString();
        delete test.quarantineUntil;
        delete test.quarantineReason;
        console.log('✅ Test unquarantined');
      }
    }
    
    await this.saveFlakyTestData();
    return true;
  }

  /**
   * Generate comprehensive flaky test report
   */
  async generateReport(options = {}) {
    console.log('📊 Generating flaky test report...');
    
    const { format = 'console', outputFile = null } = options;
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateReportSummary(),
      tests: this.flakyTests.tests.map(test => ({
        ...test,
        age: this.calculateTestAge(test),
        severity: this.calculateSeverity(test)
      })),
      recommendations: this.generateRecommendations(),
      trends: this.analyzeTrends()
    };
    
    if (format === 'json') {
      const jsonReport = JSON.stringify(report, null, 2);
      
      if (outputFile) {
        const dirPath = dirname(outputFile);
        await ensureDirectory(dirPath);        writeFileSync(outputFile, jsonReport);
        console.log(`📄 JSON report saved to: ${outputFile}`);
      } else {
        console.log(jsonReport);
      }
    } else if (format === 'html') {
      const htmlReport = this.generateHTMLReport(report);
      
      if (outputFile) {
        const dirPath = dirname(outputFile);
        await ensureDirectory(dirPath);        writeFileSync(outputFile, htmlReport);
        console.log(`📄 HTML report saved to: ${outputFile}`);
      } else {
        console.log(htmlReport);
      }
    } else {
      // Console format (default)
      this.displayConsoleReport(report);
    }
    
    return report;
  }

  /**
   * Analyze test failure patterns
   */
  analyzePatterns(options = {}) {
    console.log('🔍 Analyzing test failure patterns...');
    
    const { groupBy = 'error', showTop = 10 } = options;
    
    if (this.flakyTests.tests.length === 0) {
      console.log('ℹ️ No flaky test data available for analysis');
      return;
    }
    
    console.log('\n📊 Failure Pattern Analysis:');
    console.log('═'.repeat(60));
    
    // Analyze by error patterns
    if (groupBy === 'error') {
      const errorPatterns = {};
      
      this.flakyTests.tests.forEach(test => {
        if (test.commonErrors) {
          test.commonErrors.forEach(error => {
            const key = this.extractErrorPattern(error);
            if (!errorPatterns[key]) {
              errorPatterns[key] = { count: 0, tests: [] };
            }
            errorPatterns[key].count++;
            errorPatterns[key].tests.push(`${escapeHtml(test.testSuite)}/${escapeHtml(test.testName)}`);
          });
        }
      });
      
      const sortedPatterns = Object.entries(errorPatterns)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, showTop);
      
      console.log('Most Common Error Patterns:');
      sortedPatterns.forEach(([pattern, data], index) => {
        console.log(`${index + 1}. ${pattern} (${data.count} tests affected)`);
        console.log(`   Example tests: ${data.tests.slice(0, 3).join(', ')}`);
      });
    }
    
    // Analyze by test suite
    if (groupBy === 'suite') {
      const suiteStats = {};
      
      this.flakyTests.tests.forEach(test => {
        if (!suiteStats[test.testSuite]) {
          suiteStats[test.testSuite] = { count: 0, avgFailureRate: 0 };
        }
        suiteStats[test.testSuite].count++;
        suiteStats[test.testSuite].avgFailureRate += (test.failureRate || 0);
      });
      
      Object.keys(suiteStats).forEach(suite => {
        suiteStats[suite].avgFailureRate /= suiteStats[suite].count;
      });
      
      const sortedSuites = Object.entries(suiteStats)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, showTop);
      
      console.log('\nFlaky Tests by Suite:');
      sortedSuites.forEach(([suite, stats], index) => {
        console.log(`${index + 1}. ${suite}`);
        console.log(`   Flaky tests: ${stats.count}`);
        console.log(`   Average failure rate: ${(stats.avgFailureRate * 100).toFixed(1)}%`);
      });
    }
    
    console.log('═'.repeat(60));
  }

  /**
   * Clean up old flaky test data
   */
  async cleanup(options = {}) {
    console.log('🧹 Cleaning up old flaky test data...');
    
    const { daysOld = CONFIG.thresholds.staleDataDays, dryRun = false } = options;
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    const before = this.flakyTests.tests.length;
    
    // Remove old tests that are no longer flaky
    const activeTests = this.flakyTests.tests.filter(test => {
      const testDate = new Date(test.lastFailure || test.detectedAt);
      const isRecent = testDate > cutoffDate;
      const isQuarantined = test.quarantined;
      
      return isRecent || isQuarantined; // Keep recent tests and quarantined tests
    });
    
    const removed = before - activeTests.length;
    
    if (dryRun) {
      console.log(`🧪 Dry run: Would remove ${removed} old test entries`);
    } else {
      this.flakyTests.tests = activeTests;
      this.flakyTests.lastCleanup = new Date().toISOString();
      await this.saveFlakyTestData();
      
      console.log(`✅ Removed ${removed} old test entries (kept ${activeTests.length})`);
    }
    
    // Also clean up old test result files
    this.cleanupOldTestResults(cutoffDate, dryRun);
  }

  // Helper methods

  loadFlakyTestData() {
    if (existsSync(CONFIG.paths.flakyData)) {
      try {
        return JSON.parse(readFileSync(CONFIG.paths.flakyData, 'utf8'));
      } catch (error) {
        console.warn(`⚠️ Failed to load flaky test data: ${error.message}`);
      }
    }
    
    return {
      version: '1.0.0',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tests: []
    };
  }

  async saveFlakyTestData() {
    const dirPath = dirname(CONFIG.paths.flakyData);
    await ensureDirectory(dirPath);
    this.flakyTests.updated = new Date().toISOString();
    writeFileSync(CONFIG.paths.flakyData, JSON.stringify(this.flakyTests, null, 2));
  }

  loadQuarantineData() {
    if (existsSync(CONFIG.paths.quarantine)) {
      try {
        return JSON.parse(readFileSync(CONFIG.paths.quarantine, 'utf8'));
      } catch (error) {
        console.warn(`⚠️ Failed to load quarantine data: ${error.message}`);
      }
    }
    
    return {
      version: '1.0.0',
      quarantined: [],
      updated: new Date().toISOString()
    };
  }

  async collectTestResults(cutoffDate) {
    const results = [];
    
    if (!existsSync(CONFIG.paths.testResults)) {
      return results;
    }
    
    const files = readdirSync(CONFIG.paths.testResults, { withFileTypes: true });
    
    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.json')) {
        const filePath = join(CONFIG.paths.testResults, file.name);
        const stats = require('fs').statSync(filePath);
        
        if (stats.mtime > cutoffDate) {
          try {
            const content = JSON.parse(readFileSync(filePath, 'utf8'));
            results.push({ file: file.name, data: content, mtime: stats.mtime });
          } catch (error) {
            console.warn(`⚠️ Failed to parse ${file.name}: ${error.message}`);
          }
        }
      }
    }
    
    return results;
  }

  analyzeTestPatterns(testResults) {
    const testStats = {};
    
    testResults.forEach(result => {
      const tests = this.extractTestsFromResult(result.data);
      
      tests.forEach(test => {
        const key = `${test.suite}/${test.name}`;
        
        if (!testStats[key]) {
          testStats[key] = {
            name: test.name,
            suite: test.suite,
            totalRuns: 0,
            failures: 0,
            successes: 0,
            errors: []
          };
        }
        
        testStats[key].totalRuns++;
        
        if (test.status === 'failed' || test.outcome === 'unexpected') {
          testStats[key].failures++;
          if (test.error) {
            testStats[key].errors.push(test.error);
          }
        } else if (test.status === 'passed' || test.outcome === 'expected') {
          testStats[key].successes++;
        }
      });
    });
    
    return testStats;
  }

  identifyFlakyTests(testStats) {
    const flakyTests = [];
    
    Object.values(testStats).forEach(stats => {
      if (stats.totalRuns >= CONFIG.thresholds.minimumRuns) {
        const failureRate = stats.failures / stats.totalRuns;
        
        // A test is flaky if it has some failures but not all failures
        if (failureRate >= CONFIG.thresholds.failureRate && failureRate < 1.0 && stats.successes > 0) {
          flakyTests.push({
            name: stats.name,
            suite: stats.suite,
            totalRuns: stats.totalRuns,
            failures: stats.failures,
            successes: stats.successes,
            failureRate,
            commonErrors: this.findCommonErrors(stats.errors),
            lastFailure: new Date().toISOString()
          });
        }
      }
    });
    
    return flakyTests;
  }

  extractTestsFromResult(resultData) {
    const tests = [];
    
    // Handle different test result formats
    if (resultData.testResults) {
      // Jest format
      resultData.testResults.forEach(file => {
        file.assertionResults?.forEach(test => {
          tests.push({
            name: test.title,
            suite: file.testFilePath,
            status: test.status,
            error: test.failureMessages?.join('\n')
          });
        });
      });
    } else if (resultData.suites) {
      // Playwright format
      resultData.suites.forEach(suite => {
        suite.tests?.forEach(test => {
          tests.push({
            name: test.title,
            suite: suite.file,
            outcome: test.outcome,
            error: test.error?.message
          });
        });
      });
    }
    
    return tests;
  }

  findCommonErrors(errors) {
    if (!errors || errors.length === 0) return [];
    
    // Extract error patterns
    const patterns = errors.map(error => this.extractErrorPattern(error));
    
    // Count occurrences
    const counts = {};
    patterns.forEach(pattern => {
      counts[pattern] = (counts[pattern] || 0) + 1;
    });
    
    // Return most common patterns
    return Object.entries(counts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([pattern]) => pattern);
  }

  extractErrorPattern(error) {
    if (!error) return 'Unknown error';
    
    // Extract key patterns from error messages
    const patterns = [
      /TimeoutError/i,
      /NetworkError/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /Server not responding/i,
      /Element not found/i,
      /Navigation timeout/i,
      /Page crashed/i
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(error)) {
        return pattern.source.replace(/[\/\\]/g, '').replace(/i$/, '');
      }
    }
    
    // Extract first line of error for generic pattern
    return error.split('\n')[0].substring(0, 50);
  }

  async updateFlakyTestDatabase(newFlakyTests) {
    newFlakyTests.forEach(newTest => {
      const existingIndex = this.flakyTests.tests.findIndex(test => 
        test.testName === newTest.name && test.testSuite === newTest.suite
      );
      
      if (existingIndex >= 0) {
        // Update existing test
        const existing = this.flakyTests.tests[existingIndex];
        existing.lastFailure = new Date().toISOString();
        existing.failureRate = newTest.failureRate;
        existing.totalRuns = newTest.totalRuns;
        existing.failures = newTest.failures;
        existing.commonErrors = newTest.commonErrors;
        
        // Check if should be quarantined
        if (newTest.failureRate < CONFIG.thresholds.quarantineThreshold && !existing.quarantined) {
          existing.quarantined = true;
          existing.quarantineReason = 'Automatic quarantine due to high failure rate';
          existing.quarantineUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        }
      } else {
        // Add new test
        this.flakyTests.tests.push({
          testName: newTest.name,
          testSuite: newTest.suite,
          detectedAt: new Date().toISOString(),
          lastFailure: new Date().toISOString(),
          failureRate: newTest.failureRate,
          totalRuns: newTest.totalRuns,
          failures: newTest.failures,
          commonErrors: newTest.commonErrors,
          quarantined: newTest.failureRate < CONFIG.thresholds.quarantineThreshold
        });
      }
    });
    
    await this.saveFlakyTestData();
  }

  generateReportSummary() {
    const total = this.flakyTests.tests.length;
    const quarantined = this.flakyTests.tests.filter(t => t.quarantined).length;
    const active = total - quarantined;
    
    const avgFailureRate = total > 0 ? 
      this.flakyTests.tests.reduce((sum, test) => sum + (test.failureRate || 0), 0) / total : 0;
    
    return {
      totalFlakyTests: total,
      quarantinedTests: quarantined,
      activeTests: active,
      averageFailureRate: avgFailureRate
    };
  }

  calculateTestAge(test) {
    const created = new Date(test.detectedAt);
    const now = new Date();
    return Math.floor((now - created) / (24 * 60 * 60 * 1000));
  }

  calculateSeverity(test) {
    if (test.failureRate >= 0.8) return 'critical';
    if (test.failureRate >= 0.5) return 'high';
    if (test.failureRate >= 0.3) return 'medium';
    return 'low';
  }

  generateRecommendations() {
    const recommendations = [];
    
    const criticalTests = this.flakyTests.tests.filter(t => this.calculateSeverity(t) === 'critical');
    if (criticalTests.length > 0) {
      recommendations.push({
        type: 'urgent',
        message: `${criticalTests.length} tests have critical failure rates (>80%). Immediate attention required.`
      });
    }
    
    const oldTests = this.flakyTests.tests.filter(t => this.calculateTestAge(t) > 30);
    if (oldTests.length > 0) {
      recommendations.push({
        type: 'maintenance',
        message: `${oldTests.length} flaky tests are over 30 days old. Consider fixing or removing them.`
      });
    }
    
    return recommendations;
  }

  analyzeTrends() {
    // Simple trend analysis - could be enhanced with more sophisticated analytics
    const now = new Date();
    const lastWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(now - 30 * 24 * 60 * 60 * 1000);
    
    const recentTests = this.flakyTests.tests.filter(t => 
      new Date(t.lastFailure || t.detectedAt) > lastWeek
    ).length;
    
    const monthlyTests = this.flakyTests.tests.filter(t => 
      new Date(t.lastFailure || t.detectedAt) > lastMonth
    ).length;
    
    return {
      newThisWeek: recentTests,
      newThisMonth: monthlyTests,
      trend: recentTests > 5 ? 'increasing' : recentTests < 2 ? 'decreasing' : 'stable'
    };
  }

  displayConsoleReport(report) {
    console.log('\n📊 Flaky Test Report');
    console.log('═'.repeat(60));
    console.log(`Generated: ${escapeHtml(this.formatDate(report.timestamp))}`);
    console.log('');
    
    const summary = report.summary;
    console.log('📈 Summary:');
    console.log(`  Total Flaky Tests: ${summary.totalFlakyTests}`);
    console.log(`  Quarantined: ${summary.quarantinedTests}`);
    console.log(`  Active: ${summary.activeTests}`);
    console.log(`  Average Failure Rate: ${(summary.averageFailureRate * 100).toFixed(1)}%`);
    console.log('');
    
    if (report.recommendations.length > 0) {
      console.log('💡 Recommendations:');
      report.recommendations.forEach(rec => {
        const icon = rec.type === 'urgent' ? '🚨' : '🔧';
        console.log(`  ${icon} ${rec.message}`);
      });
      console.log('');
    }
    
    console.log('📊 Trends:');
    console.log(`  New this week: ${report.trends.newThisWeek}`);
    console.log(`  New this month: ${report.trends.newThisMonth}`);
    console.log(`  Overall trend: ${report.trends.trend}`);
    
    console.log('═'.repeat(60));
  }

  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flaky Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #495057; }
        .metric .value { font-size: 2em; font-weight: bold; color: #007bff; }
        .section { margin: 30px 0; }
        .test-item { border: 1px solid #dee2e6; border-radius: 5px; padding: 15px; margin: 10px 0; }
        .severity-critical { border-left: 5px solid #dc3545; }
        .severity-high { border-left: 5px solid #fd7e14; }
        .severity-medium { border-left: 5px solid #ffc107; }
        .severity-low { border-left: 5px solid #28a745; }
        .quarantined { background: #f8d7da; }
        .recommendations { background: #d1ecf1; padding: 15px; border-radius: 5px; }
        .urgent { color: #721c24; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔄 Flaky Test Report</h1>
            <p>Generated: ${escapeHtml(this.formatDate(report.timestamp))}</p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <h3>Total Flaky Tests</h3>
                <div class="value">${escapeHtml(String(report.summary.totalFlakyTests))}</div>
            </div>
            <div class="metric">
                <h3>Quarantined</h3>
                <div class="value">${escapeHtml(String(report.summary.quarantinedTests))}</div>
            </div>
            <div class="metric">
                <h3>Active</h3>
                <div class="value">${escapeHtml(String(report.summary.activeTests))}</div>
            </div>
            <div class="metric">
                <h3>Avg Failure Rate</h3>
                <div class="value">${(report.summary.averageFailureRate * 100).toFixed(1)}%</div>
            </div>
        </div>
        
        ${report.recommendations.length > 0 ? `
        <div class="section">
            <h2>💡 Recommendations</h2>
            <div class="recommendations">
                ${report.recommendations.map(rec => `
                    <p class="${(rec.type || '').replace(/[^a-zA-Z0-9_-]/g, '')}">${escapeHtml(rec.message)}</p>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        <div class="section">
            <h2>🔄 Flaky Tests</h2>
            ${report.tests.map(test => `
                <div class="test-item severity-${(test.severity || '').replace(/[^a-zA-Z0-9_-]/g, '')} ${test.quarantined ? 'quarantined' : ''}">
                    <h3>${escapeHtml(test.testName)} ${test.quarantined ? '🚨' : ''}</h3>
                    <p><strong>Suite:</strong> ${escapeHtml(test.testSuite)}</p>
                    <p><strong>Failure Rate:</strong> ${(test.failureRate * 100).toFixed(1)}%</p>
                    <p><strong>Age:</strong> ${escapeHtml(String(test.age))} days</p>
                    <p><strong>Last Failure:</strong> ${escapeHtml(this.formatDate(test.lastFailure || test.detectedAt))}</p>
                    ${test.commonErrors && test.commonErrors.length > 0 ? `
                        <p><strong>Common Errors:</strong> ${test.commonErrors.map(error => escapeHtml(error)).join(', ')}</p>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>
    `;
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleString();
  }

  cleanupOldTestResults(cutoffDate, dryRun) {
    // Implementation for cleaning up old test result files
    console.log(`${dryRun ? 'Would clean' : 'Cleaning'} test results older than ${cutoffDate.toLocaleDateString()}`);
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  const manager = new FlakyTestManager();
  
  const parseOptions = (args) => {
    const options = {};
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        options[key.replace(/-/g, '_')] = value || true;
      }
    }
    return options;
  };
  
  const options = parseOptions(args);
  
  try {
    switch (command) {
      case 'detect':
        await manager.detectFlakyTests(options);
        break;
        
      case 'list':
        manager.listFlakyTests(options);
        break;
        
      case 'quarantine':
        const testName = options.test_name || args.find(arg => !arg.startsWith('--'));
        const testSuite = options.test_suite || args.find((arg, i) => !arg.startsWith('--') && i > 0);
        const action = options.unquarantine ? 'unquarantine' : 'quarantine';
        
        if (!testName || !testSuite) {
          console.error('❌ Test name and suite are required for quarantine operations');
          console.log('Usage: node scripts/manage-flaky-tests.js quarantine <test-name> <test-suite> [options]');
          process.exit(1);
        }
        
        await manager.quarantineTest(testName, testSuite, action, options);
        break;
        
      case 'report':
        await manager.generateReport(options);
        break;
        
      case 'analyze':
        manager.analyzePatterns(options);
        break;
        
      case 'cleanup':
        manager.cleanup(options);
        break;
        
      default:
        console.log(`
🔄 Flaky Test Manager

Usage:
  node scripts/manage-flaky-tests.js <command> [options]

Commands:
  detect        Detect flaky tests from recent test runs
  list          List all known flaky tests
  quarantine    Quarantine or unquarantine a specific test
  report        Generate detailed flaky test report
  analyze       Analyze test failure patterns
  cleanup       Clean up old flaky test data

Examples:
  # Detect flaky tests from last 7 days
  node scripts/manage-flaky-tests.js detect

  # List all flaky tests with details
  node scripts/manage-flaky-tests.js list --verbose

  # Quarantine a specific test
  node scripts/manage-flaky-tests.js quarantine "test name" "test suite"

  # Generate HTML report
  node scripts/manage-flaky-tests.js report --format=html --output-file=report.html

  # Analyze error patterns
  node scripts/manage-flaky-tests.js analyze --group-by=error

Options:
  --days-back=N       Number of days to look back (default: 7)
  --verbose          Show detailed information
  --dry-run          Show what would be done without making changes
  --format=FORMAT    Report format: console, json, html
  --output-file=FILE Output file for reports
        `);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { FlakyTestManager };