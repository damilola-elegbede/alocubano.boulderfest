#!/usr/bin/env node

/**
 * Test Performance Analysis Script
 * Monitors test execution performance and prevents regression
 * Ensures sub-900ms execution target is maintained
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PERFORMANCE_TARGETS = {
  maxTotalTime: 900, // 900ms total budget
  maxAvgPerTest: 36, // 900ms / 25 tests
  warningThreshold: 750, // Warn at 750ms
  regressionThreshold: 1.2 // 20% increase is regression
};

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(level, message) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  let color = colors.reset;
  let prefix = '';
  
  switch (level) {
    case 'error':
      color = colors.red;
      prefix = '❌';
      break;
    case 'warn':
      color = colors.yellow;
      prefix = '⚠️ ';
      break;
    case 'success':
      color = colors.green;
      prefix = '✅';
      break;
    case 'info':
      color = colors.blue;
      prefix = '📊';
      break;
  }
  
  console.log(`${color}${prefix} [${timestamp}] ${message}${colors.reset}`);
}

function collectTestMetrics() {
  const startTime = Date.now();
  
  try {
    // Run tests and capture timing
    log('info', 'Executing test suite for performance measurement...');
    
    const result = execSync('npm test 2>&1', { 
      encoding: 'utf8',
      timeout: 30000 // 30 second timeout
    });
    
    const endTime = Date.now();
    const totalRuntime = endTime - startTime;
    
    // Parse test output for test count
    const testLines = result.split('\n');
    let testCount = 0;
    let passedTests = 0;
    let failedTests = 0;
    let testFiles = [];
    
    // Parse Vitest output patterns
    for (const line of testLines) {
      // Match: "✓ test description (123ms)"
      const testMatch = line.match(/✓|✗|⚠/);
      if (testMatch) {
        testCount++;
        if (line.includes('✓')) passedTests++;
        if (line.includes('✗')) failedTests++;
      }
      
      // Match file execution: "tests/example.test.js (5 tests) 234ms"
      const fileMatch = line.match(/(tests\/[^\.]+\.test\.js).*?(\d+)ms/);
      if (fileMatch) {
        testFiles.push({
          file: fileMatch[1],
          runtime: parseInt(fileMatch[2])
        });
      }
    }
    
    // Extract summary if available
    const summaryMatch = result.match(/Test Files.*?(\d+).*?Tests.*?(\d+).*?Time.*?(\d+(?:\.\d+)?)(m?s)/);
    if (summaryMatch) {
      testCount = parseInt(summaryMatch[2]);
      let timeValue = parseFloat(summaryMatch[3]);
      if (summaryMatch[4] === 'ms') {
        // Already in milliseconds
      } else if (summaryMatch[4] === 's') {
        timeValue *= 1000; // Convert to ms
      }
      totalRuntime = Math.min(totalRuntime, timeValue); // Use more accurate time if available
    }
    
    return {
      totalRuntime,
      testCount,
      passedTests,
      failedTests,
      testFiles,
      avgTimePerTest: testCount > 0 ? Math.round(totalRuntime / testCount) : 0,
      rawOutput: result
    };
    
  } catch (error) {
    log('error', `Test execution failed: ${error.message}`);
    
    // Try to extract partial results from error output
    const output = error.stdout || error.message || '';
    const lines = output.split('\n');
    
    let testCount = 0;
    for (const line of lines) {
      if (line.match(/✓|✗/)) testCount++;
    }
    
    return {
      totalRuntime: Date.now() - startTime,
      testCount,
      passedTests: 0,
      failedTests: testCount,
      testFiles: [],
      avgTimePerTest: 0,
      error: error.message,
      rawOutput: output
    };
  }
}

function loadHistoricalData() {
  const historyFile = '.tmp/test-performance-history.json';
  
  try {
    if (fs.existsSync(historyFile)) {
      return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
  } catch (error) {
    log('warn', `Could not load performance history: ${error.message}`);
  }
  
  return { runs: [] };
}

function savePerformanceData(metrics, history) {
  const performanceDir = '.tmp';
  if (!fs.existsSync(performanceDir)) {
    fs.mkdirSync(performanceDir, { recursive: true });
  }
  
  // Save current run data
  const currentData = {
    timestamp: new Date().toISOString(),
    ...metrics
  };
  
  fs.writeFileSync(
    path.join(performanceDir, 'test-performance.json'),
    JSON.stringify(currentData, null, 2)
  );
  
  // Update history
  history.runs.push(currentData);
  
  // Keep only last 50 runs
  if (history.runs.length > 50) {
    history.runs = history.runs.slice(-50);
  }
  
  fs.writeFileSync(
    path.join(performanceDir, 'test-performance-history.json'),
    JSON.stringify(history, null, 2)
  );
}

function analyzePerformance(metrics, history) {
  const analysis = {
    status: 'good',
    warnings: [],
    errors: [],
    insights: []
  };
  
  // Check absolute performance targets
  if (metrics.totalRuntime > PERFORMANCE_TARGETS.maxTotalTime) {
    analysis.status = 'failed';
    analysis.errors.push(
      `Total runtime ${metrics.totalRuntime}ms exceeds limit of ${PERFORMANCE_TARGETS.maxTotalTime}ms`
    );
  } else if (metrics.totalRuntime > PERFORMANCE_TARGETS.warningThreshold) {
    analysis.status = 'warning';
    analysis.warnings.push(
      `Runtime ${metrics.totalRuntime}ms approaching limit of ${PERFORMANCE_TARGETS.maxTotalTime}ms`
    );
  }
  
  if (metrics.avgTimePerTest > PERFORMANCE_TARGETS.maxAvgPerTest) {
    analysis.warnings.push(
      `Average test time ${metrics.avgTimePerTest}ms exceeds target of ${PERFORMANCE_TARGETS.maxAvgPerTest}ms`
    );
  }
  
  // Check for performance regression
  if (history.runs.length >= 3) {
    const recentRuns = history.runs.slice(-3);
    const avgRecentTime = recentRuns.reduce((sum, run) => sum + run.totalRuntime, 0) / recentRuns.length;
    
    const olderRuns = history.runs.slice(-10, -3);
    if (olderRuns.length > 0) {
      const avgOlderTime = olderRuns.reduce((sum, run) => sum + run.totalRuntime, 0) / olderRuns.length;
      const regressionRatio = avgRecentTime / avgOlderTime;
      
      if (regressionRatio > PERFORMANCE_TARGETS.regressionThreshold) {
        analysis.warnings.push(
          `Performance regression detected: ${Math.round((regressionRatio - 1) * 100)}% slower than previous average`
        );
      }
    }
  }
  
  // File-specific insights
  if (metrics.testFiles.length > 0) {
    const slowestFile = metrics.testFiles.reduce((max, file) => 
      file.runtime > max.runtime ? file : max
    );
    
    if (slowestFile.runtime > 100) {
      analysis.insights.push(`Slowest test file: ${slowestFile.file} (${slowestFile.runtime}ms)`);
    }
    
    const fastFiles = metrics.testFiles.filter(file => file.runtime < 50);
    if (fastFiles.length > 0) {
      analysis.insights.push(`${fastFiles.length} files completed in <50ms (excellent performance)`);
    }
  }
  
  return analysis;
}

function generatePerformanceReport(metrics, analysis, history) {
  console.log(`\n${colors.bold}=== TEST PERFORMANCE REPORT ===${colors.reset}\n`);
  
  // Current performance summary
  console.log(`${colors.bold}Current Performance:${colors.reset}`);
  console.log(`┌──────────────────────┬─────────┬─────────┬────────┐`);
  console.log(`│ Metric               │ Current │ Target  │ Status │`);
  console.log(`├──────────────────────┼─────────┼─────────┼────────┤`);
  
  const performanceMetrics = [
    {
      name: 'Total Runtime (ms)',
      current: metrics.totalRuntime,
      target: `<${PERFORMANCE_TARGETS.maxTotalTime}`,
      status: metrics.totalRuntime <= PERFORMANCE_TARGETS.maxTotalTime ? 'PASS' : 'FAIL'
    },
    {
      name: 'Test Count',
      current: metrics.testCount,
      target: '≤25',
      status: metrics.testCount <= 25 ? 'PASS' : 'WARN'
    },
    {
      name: 'Avg Time/Test (ms)',
      current: metrics.avgTimePerTest,
      target: `<${PERFORMANCE_TARGETS.maxAvgPerTest}`,
      status: metrics.avgTimePerTest <= PERFORMANCE_TARGETS.maxAvgPerTest ? 'PASS' : 'WARN'
    }
  ];
  
  for (const metric of performanceMetrics) {
    let statusColor = colors.green;
    let statusSymbol = '✓';
    
    if (metric.status === 'FAIL') {
      statusColor = colors.red;
      statusSymbol = '✗';
    } else if (metric.status === 'WARN') {
      statusColor = colors.yellow;
      statusSymbol = '⚠';
    }
    
    console.log(`│ ${metric.name.padEnd(20)} │ ${metric.current.toString().padStart(7)} │ ${metric.target.padStart(7)} │ ${statusColor}${statusSymbol} ${metric.status}${colors.reset} │`);
  }
  console.log(`└──────────────────────┴─────────┴─────────┴────────┘\n`);
  
  // Test results
  if (metrics.passedTests > 0 || metrics.failedTests > 0) {
    console.log(`${colors.bold}Test Results:${colors.reset}`);
    console.log(`${colors.green}✓ Passed: ${metrics.passedTests}${colors.reset}`);
    if (metrics.failedTests > 0) {
      console.log(`${colors.red}✗ Failed: ${metrics.failedTests}${colors.reset}`);
    }
    console.log();
  }
  
  // File performance breakdown
  if (metrics.testFiles.length > 0) {
    console.log(`${colors.bold}File Performance:${colors.reset}`);
    const sortedFiles = [...metrics.testFiles].sort((a, b) => b.runtime - a.runtime);
    
    for (const file of sortedFiles.slice(0, 8)) { // Top 8 files
      const status = file.runtime > 100 ? colors.red : file.runtime > 50 ? colors.yellow : colors.green;
      console.log(`${status}│${colors.reset} ${file.file.padEnd(35)} ${file.runtime.toString().padStart(4)}ms`);
    }
    console.log();
  }
  
  // Performance trends (if history available)
  if (history.runs.length >= 5) {
    console.log(`${colors.bold}Performance Trend (Last 5 runs):${colors.reset}`);
    const recentRuns = history.runs.slice(-5);
    const runtimes = recentRuns.map(run => run.totalRuntime);
    const trend = runtimes[runtimes.length - 1] - runtimes[0];
    
    const trendSymbol = trend > 50 ? '📈 Slower' : trend < -50 ? '📉 Faster' : '➡️  Stable';
    const trendColor = trend > 50 ? colors.red : trend < -50 ? colors.green : colors.blue;
    
    console.log(`${trendColor}${trendSymbol}: ${trend > 0 ? '+' : ''}${trend}ms over last 5 runs${colors.reset}`);
    
    const sparkline = runtimes.map(time => {
      const normalized = (time - Math.min(...runtimes)) / (Math.max(...runtimes) - Math.min(...runtimes));
      return normalized > 0.75 ? '█' : normalized > 0.5 ? '▆' : normalized > 0.25 ? '▃' : '▁';
    }).join('');
    
    console.log(`Trend: ${sparkline} (${Math.min(...runtimes)}ms - ${Math.max(...runtimes)}ms)`);
    console.log();
  }
  
  // Analysis results
  if (analysis.errors.length > 0) {
    console.log(`${colors.red}${colors.bold}❌ Performance Issues:${colors.reset}`);
    for (const error of analysis.errors) {
      console.log(`   ${colors.red}•${colors.reset} ${error}`);
    }
    console.log();
  }
  
  if (analysis.warnings.length > 0) {
    console.log(`${colors.yellow}${colors.bold}⚠️  Performance Warnings:${colors.reset}`);
    for (const warning of analysis.warnings) {
      console.log(`   ${colors.yellow}•${colors.reset} ${warning}`);
    }
    console.log();
  }
  
  if (analysis.insights.length > 0) {
    console.log(`${colors.cyan}${colors.bold}💡 Performance Insights:${colors.reset}`);
    for (const insight of analysis.insights) {
      console.log(`   ${colors.cyan}•${colors.reset} ${insight}`);
    }
    console.log();
  }
}

function main() {
  log('info', 'Starting test performance analysis...');
  
  const metrics = collectTestMetrics();
  const history = loadHistoricalData();
  const analysis = analyzePerformance(metrics, history);
  
  savePerformanceData(metrics, history);
  generatePerformanceReport(metrics, analysis, history);
  
  // Determine exit code
  let exitCode = 0;
  
  if (analysis.status === 'failed') {
    exitCode = 1;
    log('error', 'Performance targets not met!');
  } else if (analysis.status === 'warning') {
    log('warn', 'Performance approaching limits');
  } else {
    log('success', `Test suite completed in ${metrics.totalRuntime}ms (target: <${PERFORMANCE_TARGETS.maxTotalTime}ms)`);
  }
  
  // Performance recommendations
  console.log(`${colors.blue}💡 Performance Tips:${colors.reset}`);
  console.log(`• Keep tests focused on critical business flows`);
  console.log(`• Use direct API calls instead of test frameworks`);
  console.log(`• Mock external services for consistent timing`);
  console.log(`• Group related assertions in single test cases`);
  console.log(`• Monitor performance trends over time`);
  
  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = { collectTestMetrics, analyzePerformance, PERFORMANCE_TARGETS };