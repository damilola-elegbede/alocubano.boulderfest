#!/usr/bin/env node

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const METADATA_DIR = join(__dirname, '..', '.tmp', 'test-validation');
const SKIP_RATE_THRESHOLD = 0.20; // 20%
const PERF_REGRESSION_THRESHOLD = 1.5; // 50% slower
const MIN_TOTAL_TESTS = 1; // Minimum expected tests per suite

// Priority Levels
const PRIORITY = {
  CRITICAL: 'P1',
  WARNING: 'P2',
  INFO: 'P3'
};

/**
 * Find all test metadata files in the artifacts directory
 */
function findMetadataFiles() {
  if (!existsSync(METADATA_DIR)) {
    console.error(`Metadata directory not found: ${METADATA_DIR}`);
    return [];
  }

  const files = [];

  function walkDir(dir) {
    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (entry === 'test-metadata.json') {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error walking directory ${dir}:`, error.message);
    }
  }

  walkDir(METADATA_DIR);
  return files;
}

/**
 * Read and parse all metadata files
 */
function readAllMetadata(files) {
  const metadata = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      const data = JSON.parse(content);

      // Add file path for debugging
      data._sourcePath = file;

      metadata.push(data);
    } catch (error) {
      console.error(`Failed to read metadata file ${file}:`, error.message);

      // Add failed read as metadata issue
      metadata.push({
        _sourcePath: file,
        _parseError: error.message,
        workflow: extractWorkflowName(file),
        status: 'parse_error'
      });
    }
  }

  return metadata;
}

/**
 * Extract workflow name from file path
 */
function extractWorkflowName(filePath) {
  const parts = filePath.split('/');
  const artifactDir = parts[parts.length - 2];
  return artifactDir || 'unknown';
}

/**
 * Pattern 1: Exit Code Discrepancy
 * Exit=0 but failed>0 OR exit!=0 but failed=0 and passed>0
 */
function checkExitCodeDiscrepancy(metadata, results) {
  for (const data of metadata) {
    if (data._parseError) continue;

    const exitCode = data.exitCode ?? data.exit_code ?? null;
    const failed = data.failed ?? 0;
    const passed = data.passed ?? 0;

    if (exitCode === null) continue;

    // Case 1: Success exit but has failures
    if (exitCode === 0 && failed > 0) {
      results.priority1.push({
        severity: PRIORITY.CRITICAL,
        pattern: 'exit_code_discrepancy',
        workflow: data.workflow || extractWorkflowName(data._sourcePath),
        testType: data.testType || 'unknown',
        nodeVersion: data.nodeVersion,
        browser: data.browser,
        description: `Exit code 0 but ${failed} test(s) failed`,
        recommendation: 'Check test framework configuration. Test failures may not be propagating to process exit code.',
        details: {
          exitCode,
          passed,
          failed,
          total: data.total
        }
      });
    }

    // Case 2: Error exit but no failures (and has passes)
    if (exitCode !== 0 && failed === 0 && passed > 0) {
      results.priority2.push({
        severity: PRIORITY.WARNING,
        pattern: 'exit_code_discrepancy',
        workflow: data.workflow || extractWorkflowName(data._sourcePath),
        testType: data.testType || 'unknown',
        nodeVersion: data.nodeVersion,
        browser: data.browser,
        description: `Exit code ${exitCode} but 0 test failures (${passed} passed)`,
        recommendation: 'Investigate non-test error causing process exit. Check for unhandled exceptions or infrastructure issues.',
        details: {
          exitCode,
          passed,
          failed,
          total: data.total
        }
      });
    }
  }
}

/**
 * Pattern 2: Test Count Anomaly
 * total=0 OR passed+failed+skipped != total
 */
function checkTestCountAnomaly(metadata, results) {
  for (const data of metadata) {
    if (data._parseError) continue;

    const total = data.total ?? 0;
    const passed = data.passed ?? 0;
    const failed = data.failed ?? 0;
    const skipped = data.skipped ?? 0;

    // Check if total is 0 (no tests run)
    if (total === 0 && data.exitCode === 0) {
      results.priority1.push({
        severity: PRIORITY.CRITICAL,
        pattern: 'test_count_anomaly',
        workflow: data.workflow || extractWorkflowName(data._sourcePath),
        testType: data.testType || 'unknown',
        nodeVersion: data.nodeVersion,
        browser: data.browser,
        description: 'No tests were executed (total = 0)',
        recommendation: 'Verify test files exist and patterns match test files. Check test runner configuration.',
        details: { total, passed, failed, skipped }
      });
    }

    // Check if counts don't add up
    const sum = passed + failed + skipped;
    if (total > 0 && sum !== total) {
      results.priority2.push({
        severity: PRIORITY.WARNING,
        pattern: 'test_count_anomaly',
        workflow: data.workflow || extractWorkflowName(data._sourcePath),
        testType: data.testType || 'unknown',
        nodeVersion: data.nodeVersion,
        browser: data.browser,
        description: `Test count mismatch: passed(${passed}) + failed(${failed}) + skipped(${skipped}) = ${sum}, but total = ${total}`,
        recommendation: 'Check for unreported test states (pending, timeout, etc.). Verify test result parsing.',
        details: { total, passed, failed, skipped, sum, difference: total - sum }
      });
    }
  }
}

/**
 * Pattern 3: All Tests Skipped
 * total>0 but passed=0 and failed=0 and skipped=total
 */
function checkAllTestsSkipped(metadata, results) {
  for (const data of metadata) {
    if (data._parseError) continue;

    const total = data.total ?? 0;
    const passed = data.passed ?? 0;
    const failed = data.failed ?? 0;
    const skipped = data.skipped ?? 0;

    if (total > 0 && passed === 0 && failed === 0 && skipped === total) {
      results.priority1.push({
        severity: PRIORITY.CRITICAL,
        pattern: 'all_tests_skipped',
        workflow: data.workflow || extractWorkflowName(data._sourcePath),
        testType: data.testType || 'unknown',
        nodeVersion: data.nodeVersion,
        browser: data.browser,
        description: `All ${total} tests were skipped`,
        recommendation: 'Check test conditions and skip logic. Verify environment setup is correct.',
        details: { total, skipped }
      });
    }
  }
}

/**
 * Pattern 4: JSON Parsing Failure
 * Metadata file exists but couldn't be parsed
 */
function checkJsonParsingFailure(metadata, results) {
  for (const data of metadata) {
    if (data._parseError) {
      results.priority1.push({
        severity: PRIORITY.CRITICAL,
        pattern: 'json_parsing_failure',
        workflow: data.workflow || extractWorkflowName(data._sourcePath),
        testType: 'unknown',
        description: 'Failed to parse test metadata JSON',
        recommendation: 'Check test metadata generation script. Verify JSON is valid.',
        details: {
          error: data._parseError,
          file: data._sourcePath
        }
      });
    }
  }
}

/**
 * Pattern 5: High Skip Rate
 * skipped/total > SKIP_RATE_THRESHOLD
 */
function checkHighSkipRate(metadata, results) {
  for (const data of metadata) {
    if (data._parseError) continue;

    const total = data.total ?? 0;
    const skipped = data.skipped ?? 0;

    if (total === 0) continue;

    const skipRate = skipped / total;

    if (skipRate > SKIP_RATE_THRESHOLD) {
      results.priority2.push({
        severity: PRIORITY.WARNING,
        pattern: 'high_skip_rate',
        workflow: data.workflow || extractWorkflowName(data._sourcePath),
        testType: data.testType || 'unknown',
        nodeVersion: data.nodeVersion,
        browser: data.browser,
        description: `${(skipRate * 100).toFixed(1)}% of tests skipped (${skipped}/${total})`,
        recommendation: 'Review skipped tests. Consider removing obsolete tests or fixing skip conditions.',
        details: {
          total,
          skipped,
          skipRate: skipRate.toFixed(3),
          threshold: SKIP_RATE_THRESHOLD
        }
      });
    }
  }
}

/**
 * Pattern 6: Performance Regression
 * duration > baseline * PERF_REGRESSION_THRESHOLD
 */
function checkPerformanceRegression(metadata, results) {
  // Group by test type and environment
  const groups = {};

  for (const data of metadata) {
    if (data._parseError) continue;
    if (!data.duration) continue;

    const key = `${data.testType}-${data.nodeVersion || 'unknown'}-${data.browser || 'node'}`;

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(data);
  }

  // Check for outliers within each group
  for (const [key, group] of Object.entries(groups)) {
    if (group.length < 2) continue;

    const durations = group.map(d => d.duration).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];

    for (const data of group) {
      if (data.duration > median * PERF_REGRESSION_THRESHOLD) {
        results.priority3.push({
          severity: PRIORITY.INFO,
          pattern: 'performance_regression',
          workflow: data.workflow || extractWorkflowName(data._sourcePath),
          testType: data.testType || 'unknown',
          nodeVersion: data.nodeVersion,
          browser: data.browser,
          description: `Test duration ${data.duration}s exceeds median ${median.toFixed(1)}s by ${((data.duration / median - 1) * 100).toFixed(1)}%`,
          recommendation: 'Investigate slow tests. Check for infrastructure issues or test inefficiencies.',
          details: {
            duration: data.duration,
            median,
            threshold: PERF_REGRESSION_THRESHOLD,
            total: data.total
          }
        });
      }
    }
  }
}

/**
 * Pattern 7: Version Inconsistency
 * Different Node versions or browsers report different results
 */
function checkVersionInconsistency(metadata, results) {
  // Group by test type
  const groups = {};

  for (const data of metadata) {
    if (data._parseError) continue;

    const testType = data.testType || 'unknown';

    if (!groups[testType]) {
      groups[testType] = [];
    }

    groups[testType].push(data);
  }

  // Check for inconsistent results within each test type
  for (const [testType, group] of Object.entries(groups)) {
    if (group.length < 2) continue;

    // Compare failure counts
    const failureCounts = group.map(d => d.failed ?? 0);
    const minFailures = Math.min(...failureCounts);
    const maxFailures = Math.max(...failureCounts);

    if (minFailures !== maxFailures) {
      const failing = group.filter(d => (d.failed ?? 0) > minFailures);

      for (const data of failing) {
        results.priority2.push({
          severity: PRIORITY.WARNING,
          pattern: 'version_inconsistency',
          workflow: data.workflow || extractWorkflowName(data._sourcePath),
          testType,
          nodeVersion: data.nodeVersion,
          browser: data.browser,
          description: `Inconsistent results across environments: ${data.failed} failures vs ${minFailures} in other environments`,
          recommendation: 'Check for environment-specific issues. Verify test assumptions about Node/browser versions.',
          details: {
            failed: data.failed,
            minFailures,
            maxFailures,
            environment: data.nodeVersion || data.browser || 'unknown'
          }
        });
      }
    }
  }
}

/**
 * Pattern 8: Browser-Specific Failures
 * E2E tests fail only in specific browsers
 */
function checkBrowserSpecificFailures(metadata, results) {
  const e2eTests = metadata.filter(d => !d._parseError && d.testType === 'e2e');

  if (e2eTests.length < 2) return;

  // Group by browser
  const browsers = {};

  for (const data of e2eTests) {
    const browser = data.browser || 'unknown';

    if (!browsers[browser]) {
      browsers[browser] = [];
    }

    browsers[browser].push(data);
  }

  // Find browsers with failures
  const browserResults = Object.entries(browsers).map(([browser, tests]) => ({
    browser,
    failed: tests.reduce((sum, t) => sum + (t.failed ?? 0), 0),
    total: tests.reduce((sum, t) => sum + (t.total ?? 0), 0)
  }));

  const minFailures = Math.min(...browserResults.map(b => b.failed));

  for (const result of browserResults) {
    if (result.failed > minFailures && result.failed > 0) {
      results.priority2.push({
        severity: PRIORITY.WARNING,
        pattern: 'browser_specific_failures',
        workflow: 'e2e-tests',
        testType: 'e2e',
        browser: result.browser,
        description: `Browser-specific failures: ${result.failed} failures in ${result.browser} vs ${minFailures} in other browsers`,
        recommendation: 'Check for browser compatibility issues. Verify selectors and timing work across browsers.',
        details: {
          browser: result.browser,
          failed: result.failed,
          total: result.total,
          minFailures
        }
      });
    }
  }
}

/**
 * Pattern 9: Flaky Tests
 * Tests that passed on retry but failed initially
 */
function checkFlakyTests(metadata, results) {
  for (const data of metadata) {
    if (data._parseError) continue;

    const retries = data.retries ?? 0;
    const passed = data.passed ?? 0;

    // If retries exist and tests passed, they might be flaky
    if (retries > 0 && passed > 0) {
      results.priority3.push({
        severity: PRIORITY.INFO,
        pattern: 'flaky_tests',
        workflow: data.workflow || extractWorkflowName(data._sourcePath),
        testType: data.testType || 'unknown',
        nodeVersion: data.nodeVersion,
        browser: data.browser,
        description: `${retries} test(s) required retry to pass`,
        recommendation: 'Investigate flaky tests. Add proper waits, fix race conditions, or improve test isolation.',
        details: {
          retries,
          passed,
          total: data.total
        }
      });
    }
  }
}

/**
 * Pattern 10: Retry Success Mask
 * All tests passed after retries, potentially hiding issues
 */
function checkRetrySuccess(metadata, results) {
  for (const data of metadata) {
    if (data._parseError) continue;

    const retries = data.retries ?? 0;
    const failed = data.failed ?? 0;
    const passed = data.passed ?? 0;
    const total = data.total ?? 0;

    // If significant retries but zero failures, might be masking issues
    if (retries > 0 && failed === 0 && passed === total && total > 0) {
      const retryRate = retries / total;

      if (retryRate > 0.1) { // More than 10% retry rate
        results.priority2.push({
          severity: PRIORITY.WARNING,
          pattern: 'retry_success_mask',
          workflow: data.workflow || extractWorkflowName(data._sourcePath),
          testType: data.testType || 'unknown',
          nodeVersion: data.nodeVersion,
          browser: data.browser,
          description: `${(retryRate * 100).toFixed(1)}% of tests required retry (${retries}/${total}) but all eventually passed`,
          recommendation: 'High retry rate may mask underlying instability. Fix root causes instead of relying on retries.',
          details: {
            retries,
            total,
            retryRate: retryRate.toFixed(3)
          }
        });
      }
    }
  }
}

/**
 * Pattern 11: Placeholder Tests
 * Tests that don't actually test anything (expect(true).toBe(true))
 */
function checkPlaceholderTests(results) {
  const testFiles = [
    'tests/unit/api/ticket-verification.test.js'
  ];

  for (const file of testFiles) {
    const filePath = join(__dirname, '..', file);

    if (!existsSync(filePath)) continue;

    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const placeholders = [];

      lines.forEach((line, index) => {
        if (line.includes('expect(true).toBe(true)')) {
          placeholders.push({
            line: index + 1,
            content: line.trim()
          });
        }
      });

      if (placeholders.length > 0) {
        results.priority1.push({
          severity: PRIORITY.CRITICAL,
          pattern: 'placeholder_tests',
          file,
          description: `${placeholders.length} placeholder test(s) detected with expect(true).toBe(true)`,
          recommendation: 'Implement real tests with actual assertions. Placeholder tests provide no coverage and can mask bugs.',
          details: {
            count: placeholders.length,
            locations: placeholders.slice(0, 5).map(p => `Line ${p.line}: ${p.content}`),
            total_placeholders: placeholders.length
          }
        });
      }
    } catch (error) {
      console.error(`Failed to check ${file} for placeholders:`, error.message);
    }
  }
}

/**
 * Pattern 12: PII Exposure in Code
 * Scans for PII leaks in logging statements
 */
function checkPIIExposure(results) {
  try {
    const { execSync } = require('child_process');
    const output = execSync('node scripts/check-pii-exposure.js --json', {
      encoding: 'utf8',
      cwd: join(__dirname, '..')
    });

    const piiResults = JSON.parse(output);
    const errors = piiResults.errors || 0;
    const warnings = piiResults.warnings || 0;

    if (errors > 0) {
      results.priority1.push({
        severity: PRIORITY.CRITICAL,
        pattern: 'pii_exposure',
        description: `${errors} PII exposure error(s) detected in code`,
        recommendation: 'Use maskEmail() or sanitization utilities for all PII in logging statements.',
        details: {
          errors,
          warnings,
          violations: piiResults.violations || 0,
          files: (piiResults.details || []).filter(d => d.severity === 'error').map(d => ({
            file: d.file,
            line: d.line,
            message: d.message
          }))
        }
      });
    }

    if (warnings > 10) {
      results.priority2.push({
        severity: PRIORITY.WARNING,
        pattern: 'pii_exposure_warnings',
        description: `${warnings} PII exposure warning(s) detected in code`,
        recommendation: 'Review and fix PII warnings. High warning count may indicate systematic issues.',
        details: {
          warnings,
          threshold: 10
        }
      });
    }
  } catch (error) {
    // PII scanner failed - treat as critical
    results.priority1.push({
      severity: PRIORITY.CRITICAL,
      pattern: 'pii_scan_failure',
      description: 'PII exposure scanner failed to execute',
      recommendation: 'Fix PII scanner before proceeding. This is a critical quality gate.',
      details: {
        error: error.message
      }
    });
  }
}

/**
 * Main validation function
 */
async function validateTestResults() {
  const metadataFiles = findMetadataFiles();

  if (metadataFiles.length === 0) {
    console.error('No test metadata files found in', METADATA_DIR);
    return {
      priority1: [],
      priority2: [],
      priority3: [],
      metadata: [],
      warning: 'No test metadata files found'
    };
  }

  console.error(`Found ${metadataFiles.length} metadata file(s)`);

  const allMetadata = readAllMetadata(metadataFiles);

  const results = {
    priority1: [], // Critical
    priority2: [], // Warnings
    priority3: [], // Informational
    metadata: allMetadata
  };

  // Run all 12 validation patterns
  checkExitCodeDiscrepancy(allMetadata, results);
  checkTestCountAnomaly(allMetadata, results);
  checkAllTestsSkipped(allMetadata, results);
  checkJsonParsingFailure(allMetadata, results);
  checkHighSkipRate(allMetadata, results);
  checkPerformanceRegression(allMetadata, results);
  checkVersionInconsistency(allMetadata, results);
  checkBrowserSpecificFailures(allMetadata, results);
  checkFlakyTests(allMetadata, results);
  checkRetrySuccess(allMetadata, results);
  checkPlaceholderTests(results);
  checkPIIExposure(results);

  return results;
}

/**
 * Calculate exit code based on validation results
 */
function calculateExitCode(results) {
  if (results.priority1.length > 0 || results.priority2.length > 0) {
    return 1; // Fail on P1 or P2 issues
  }
  return 0; // Pass on P3 or no issues
}

/**
 * Generate report
 */
function generateReport(results) {
  const totalIssues = results.priority1.length + results.priority2.length + results.priority3.length;
  const totalTests = results.metadata.reduce((sum, m) => sum + (m.total ?? 0), 0);

  const status = results.priority1.length > 0 ? 'FAIL' :
                 results.priority2.length > 0 ? 'WARN' : 'PASS';

  const exitCode = calculateExitCode(results);

  return {
    validation_status: status,
    exit_code: exitCode,
    summary: {
      priority1_issues: results.priority1.length,
      priority2_issues: results.priority2.length,
      priority3_issues: results.priority3.length,
      total_issues: totalIssues,
      total_tests_validated: totalTests,
      metadata_files_processed: results.metadata.length
    },
    issues: [
      ...results.priority1,
      ...results.priority2,
      ...results.priority3
    ],
    metadata_summary: results.metadata.map(m => ({
      workflow: m.workflow || extractWorkflowName(m._sourcePath),
      testType: m.testType,
      nodeVersion: m.nodeVersion,
      browser: m.browser,
      total: m.total,
      passed: m.passed,
      failed: m.failed,
      skipped: m.skipped,
      duration: m.duration,
      exitCode: m.exitCode ?? m.exit_code,
      parseError: m._parseError
    })),
    recommendations: generateRecommendations(results)
  };
}

/**
 * Generate actionable recommendations based on issues found
 */
function generateRecommendations(results) {
  const recommendations = [];

  if (results.priority1.length > 0) {
    recommendations.push({
      priority: 'CRITICAL',
      action: 'Fix P1 issues immediately',
      description: 'Critical issues detected that indicate test result unreliability. Do not merge until resolved.'
    });
  }

  if (results.priority2.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      action: 'Review P2 warnings',
      description: 'Warnings detected that may indicate underlying issues. Review before merging.'
    });
  }

  if (results.priority3.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Consider addressing P3 issues',
      description: 'Informational issues detected. Consider addressing for improved test reliability.'
    });
  }

  if (results.priority1.length === 0 && results.priority2.length === 0 && results.priority3.length === 0) {
    recommendations.push({
      priority: 'LOW',
      action: 'No issues detected',
      description: 'All test results validated successfully.'
    });
  }

  return recommendations;
}

/**
 * Main execution
 */
validateTestResults()
  .then(results => {
    const report = generateReport(results);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.exit_code);
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
