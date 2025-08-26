#!/usr/bin/env node

/**
 * Test Bloat Prevention Script
 * Enforces hard limits on test suite complexity to prevent bloat
 * Based on .tmp/plan.md specifications
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Hard limits from plan
const LIMITS = {
  totalTests: 25,
  totalTime: 900, // 900ms
  totalLines: 850,
  maxFiles: 7, // 4 new + 3 existing
  avgTimePerTest: 36, // 900ms / 25 tests
  maxSingleFileLines: 300
};

// Color output for better visibility
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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
      prefix = 'ℹ️ ';
      break;
  }
  
  console.log(`${color}${prefix} [${timestamp}] ${message}${colors.reset}`);
}

function analyzeTestFiles() {
  const testFiles = glob.sync('tests/*.test.js', { cwd: process.cwd() });
  let totalLines = 0;
  let totalTests = 0;
  
  const fileAnalysis = [];
  
  for (const file of testFiles) {
    const fullPath = path.join(process.cwd(), file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n').length;
    
    // Count test declarations
    const testMatches = content.match(/test\s*\(/g) || [];
    const itMatches = content.match(/it\s*\(/g) || [];
    const describeMatches = content.match(/describe\s*\(/g) || [];
    
    const fileTests = testMatches.length + itMatches.length;
    totalTests += fileTests;
    totalLines += lines;
    
    fileAnalysis.push({
      file,
      lines,
      tests: fileTests,
      hasDescribeBlocks: describeMatches.length > 0,
      size: fs.statSync(fullPath).size
    });
  }
  
  return {
    totalFiles: testFiles.length,
    totalLines,
    totalTests,
    files: fileAnalysis,
    avgLinesPerFile: Math.round(totalLines / testFiles.length),
    avgTestsPerFile: Math.round(totalTests / testFiles.length)
  };
}

function getTestPerformanceData() {
  try {
    // Try to read Vitest output or test results
    const possibleFiles = [
      '.tmp/test-performance.json',
      'test-results.json',
      'vitest-results.json'
    ];
    
    for (const file of possibleFiles) {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return data;
      }
    }
    
    // If no performance data found, return null
    return null;
  } catch (error) {
    log('warn', `Could not read performance data: ${error.message}`);
    return null;
  }
}

function checkComplexityPatterns(analysis) {
  const warnings = [];
  
  // Check for test frameworks and abstractions
  for (const file of analysis.files) {
    const fullPath = path.join(process.cwd(), file.file);
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Anti-patterns from bloated architecture
    const antiPatterns = [
      { pattern: /beforeEach\s*\(/g, warning: 'Setup abstraction detected' },
      { pattern: /afterEach\s*\(/g, warning: 'Teardown abstraction detected' },
      { pattern: /describe\s*\(/g, warning: 'Test grouping detected' },
      { pattern: /TestBuilder|TestManager|TestFactory/g, warning: 'Test framework abstraction' },
      { pattern: /mockResolvedValue|mockImplementation/g, warning: 'Complex mocking detected' },
      { pattern: /createWrapper|mountComponent/g, warning: 'Component testing abstraction' },
      { pattern: /supertest|request\(/g, warning: 'HTTP testing framework usage' }
    ];
    
    for (const { pattern, warning } of antiPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 2) { // Allow minimal usage
        warnings.push(`${file.file}: ${warning} (${matches.length} instances)`);
      }
    }
    
    // Check for reasonable test size
    if (file.tests > 10) {
      warnings.push(`${file.file}: High test count (${file.tests} tests, recommend <10 per file)`);
    }
    
    // Check for direct API calls (good pattern)
    const directApiCalls = content.match(/testRequest\s*\(/g) || [];
    if (directApiCalls.length === 0 && file.tests > 0) {
      warnings.push(`${file.file}: No direct API calls detected, may be using abstractions`);
    }
  }
  
  return warnings;
}

function generateBloatReport(analysis, performance, warnings) {
  console.log(`\n${colors.bold}=== ANTI-BLOAT TEST SUITE REPORT ===${colors.reset}\n`);
  
  // Summary table
  console.log(`${colors.bold}Current State vs Limits:${colors.reset}`);
  console.log(`┌─────────────────────┬─────────┬─────────┬────────┐`);
  console.log(`│ Metric              │ Current │ Limit   │ Status │`);
  console.log(`├─────────────────────┼─────────┼─────────┼────────┤`);
  
  const metrics = [
    { name: 'Total Tests', current: analysis.totalTests, limit: LIMITS.totalTests },
    { name: 'Total Lines', current: analysis.totalLines, limit: LIMITS.totalLines },
    { name: 'Test Files', current: analysis.totalFiles, limit: LIMITS.maxFiles },
    { name: 'Avg Lines/File', current: analysis.avgLinesPerFile, limit: LIMITS.maxSingleFileLines }
  ];
  
  if (performance && performance.testResults?.[0]?.perfStats?.runtime) {
    metrics.push({
      name: 'Execution Time (ms)',
      current: Math.round(performance.testResults[0].perfStats.runtime),
      limit: LIMITS.totalTime
    });
  }
  
  for (const metric of metrics) {
    const status = metric.current <= metric.limit 
      ? `${colors.green}✓ PASS${colors.reset}` 
      : `${colors.red}✗ FAIL${colors.reset}`;
    
    console.log(`│ ${metric.name.padEnd(19)} │ ${metric.current.toString().padStart(7)} │ ${metric.limit.toString().padStart(7)} │ ${status} │`);
  }
  console.log(`└─────────────────────┴─────────┴─────────┴────────┘\n`);
  
  // File breakdown
  console.log(`${colors.bold}File Analysis:${colors.reset}`);
  for (const file of analysis.files) {
    const efficiency = file.tests > 0 ? Math.round(file.lines / file.tests) : 0;
    const status = file.lines <= LIMITS.maxSingleFileLines 
      ? `${colors.green}✓${colors.reset}` 
      : `${colors.red}✗${colors.reset}`;
    
    console.log(`${status} ${file.file.padEnd(30)} ${file.lines.toString().padStart(3)} lines, ${file.tests.toString().padStart(2)} tests (${efficiency} lines/test)`);
  }
  
  // Complexity warnings
  if (warnings.length > 0) {
    console.log(`\n${colors.yellow}${colors.bold}⚠️  Complexity Warnings:${colors.reset}`);
    for (const warning of warnings) {
      console.log(`   ${colors.yellow}•${colors.reset} ${warning}`);
    }
  }
  
  // Performance insights
  if (performance) {
    console.log(`\n${colors.bold}Performance Insights:${colors.reset}`);
    if (performance.numTotalTests) {
      log('info', `Total tests executed: ${performance.numTotalTests}`);
    }
    if (performance.testResults?.[0]?.perfStats) {
      const stats = performance.testResults[0].perfStats;
      log('info', `Runtime: ${stats.runtime}ms (target: <${LIMITS.totalTime}ms)`);
      if (stats.runtime > LIMITS.totalTime) {
        log('warn', `Execution time exceeds limit by ${stats.runtime - LIMITS.totalTime}ms`);
      }
    }
  }
}

function main() {
  log('info', 'Running anti-bloat test suite analysis...');
  
  const analysis = analyzeTestFiles();
  const performance = getTestPerformanceData();
  const warnings = checkComplexityPatterns(analysis);
  
  generateBloatReport(analysis, performance, warnings);
  
  // Determine exit status
  let exitCode = 0;
  let failures = [];
  
  if (analysis.totalTests > LIMITS.totalTests) {
    failures.push(`Test count: ${analysis.totalTests}/${LIMITS.totalTests}`);
    exitCode = 1;
  }
  
  if (analysis.totalLines > LIMITS.totalLines) {
    failures.push(`Total lines: ${analysis.totalLines}/${LIMITS.totalLines}`);
    exitCode = 1;
  }
  
  if (analysis.totalFiles > LIMITS.maxFiles) {
    failures.push(`File count: ${analysis.totalFiles}/${LIMITS.maxFiles}`);
    exitCode = 1;
  }
  
  if (performance?.testResults?.[0]?.perfStats?.runtime > LIMITS.totalTime) {
    failures.push(`Runtime: ${performance.testResults[0].perfStats.runtime}ms/${LIMITS.totalTime}ms`);
    exitCode = 1;
  }
  
  if (exitCode === 0) {
    log('success', 'All anti-bloat limits passed! Test suite remains lean and focused.');
  } else {
    console.log(`\n${colors.red}${colors.bold}❌ BLOAT DETECTED!${colors.reset}\n`);
    log('error', 'The following limits were exceeded:');
    for (const failure of failures) {
      log('error', `  • ${failure}`);
    }
    console.log(`\n${colors.yellow}Recommended Actions:${colors.reset}`);
    console.log(`• Review test files for unnecessary abstractions`);
    console.log(`• Remove duplicate or redundant test coverage`);
    console.log(`• Consolidate related test cases into single tests`);
    console.log(`• Focus on critical business flows and security boundaries`);
    console.log(`• Refer to .tmp/plan.md for strategic test selection guidance`);
  }
  
  console.log(`\n${colors.blue}💡 Lean Testing Philosophy:${colors.reset}`);
  console.log(`• Every test must protect revenue, security, or critical user flows`);
  console.log(`• Zero abstractions - direct API calls only`);
  console.log(`• Multiple assertions per test for business scenarios`);
  console.log(`• Execution speed matters - fast feedback loops`);
  
  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeTestFiles, checkComplexityPatterns, LIMITS };