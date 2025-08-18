#!/usr/bin/env node

/**
 * Test Infrastructure Metrics Monitor
 * 
 * Tracks test infrastructure complexity to prevent bloat.
 * Outputs metrics in JSON format for CI integration.
 * 
 * Usage:
 *   node scripts/test-metrics.js
 *   node scripts/test-metrics.js --format=table
 *   node scripts/test-metrics.js --watch
 */

import { readFileSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Thresholds for complexity alerts
const THRESHOLDS = {
  TOTAL_LINES: 3000,
  MAX_TEST_FILE_LINES: 200,
  MAX_UTILITY_FILE_LINES: 150,
  MAX_UTILITY_FILES: 15,
  MAX_TEST_FILES: 50
};

/**
 * Count lines in a file
 */
function countLines(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch (error) {
    return 0;
  }
}

/**
 * Get all JavaScript files in a directory recursively
 */
function getJavaScriptFiles(dirPath, basePath = PROJECT_ROOT) {
  const results = [];
  
  try {
    const items = readdirSync(dirPath);
    
    for (const item of items) {
      if (item.startsWith('.') || item === 'node_modules') continue;
      
      const fullPath = join(dirPath, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        results.push(...getJavaScriptFiles(fullPath, basePath));
      } else if (item.endsWith('.js')) {
        results.push({
          path: fullPath,
          relativePath: fullPath.replace(basePath + '/', ''),
          lines: countLines(fullPath),
          size: stat.size,
          modified: stat.mtime
        });
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return results;
}

/**
 * Categorize test files by type
 */
function categorizeTestFiles() {
  const categories = {
    unit: [],
    integration: [],
    e2e: [],
    performance: [],
    utilities: [],
    fixtures: [],
    config: [],
    unknown: []
  };

  // Focus only on the new simplified test framework
  const testPaths = [
    join(PROJECT_ROOT, 'tests-new')
  ];

  for (const testPath of testPaths) {
    const files = getJavaScriptFiles(testPath);
    
    for (const file of files) {
      const path = file.relativePath.toLowerCase();
      
      if (path.includes('/unit/') || path.includes('unit.test')) {
        categories.unit.push(file);
      } else if (path.includes('/integration/') || path.includes('integration.test')) {
        categories.integration.push(file);
      } else if (path.includes('/e2e/') || path.includes('e2e.test')) {
        categories.e2e.push(file);
      } else if (path.includes('/performance/') || path.includes('performance.test')) {
        categories.performance.push(file);
      } else if (path.includes('/core/') || path.includes('/helpers/') || 
                 path.includes('/utils/') || path.includes('/setup') ||
                 !path.includes('.test.')) {
        categories.utilities.push(file);
      } else if (path.includes('/fixtures/') || path.includes('/mocks/')) {
        categories.fixtures.push(file);
      } else if (path.includes('/config/') || path.includes('config.')) {
        categories.config.push(file);
      } else {
        categories.unknown.push(file);
      }
    }
  }

  return categories;
}

/**
 * Calculate execution time trends
 */
function getExecutionTrends() {
  const trends = {
    current: null,
    history: [],
    trend: null
  };

  try {
    // Try to get current test execution time
    const startTime = Date.now();
    execSync('npm run test:unit -- --reporter=json --run 2>/dev/null || echo "0"', { 
      timeout: 10000,
      stdio: 'pipe'
    });
    trends.current = Date.now() - startTime;
    
    // Load historical data if it exists
    try {
      const historyPath = join(PROJECT_ROOT, 'test-metrics-history.json');
      const history = JSON.parse(readFileSync(historyPath, 'utf-8'));
      trends.history = history.slice(-10); // Last 10 runs
      
      if (trends.history.length >= 2) {
        const recent = trends.history.slice(-3).map(h => h.executionTime);
        const older = trends.history.slice(0, -3).map(h => h.executionTime);
        
        if (recent.length && older.length) {
          const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
          const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
          trends.trend = recentAvg > olderAvg ? 'slower' : 'faster';
        }
      }
    } catch (error) {
      // No history file yet
    }
  } catch (error) {
    // Can't run tests
  }

  return trends;
}

/**
 * Generate complexity analysis
 */
function analyzeComplexity(categories) {
  const analysis = {
    alerts: [],
    warnings: [],
    recommendations: []
  };

  // Calculate totals
  const totalLines = Object.values(categories)
    .flat()
    .reduce((sum, file) => sum + file.lines, 0);
  
  const totalFiles = Object.values(categories)
    .flat()
    .length;

  // Check thresholds
  if (totalLines > THRESHOLDS.TOTAL_LINES) {
    analysis.alerts.push({
      type: 'TOTAL_LINES_EXCEEDED',
      message: `Total test lines (${totalLines}) exceeds threshold (${THRESHOLDS.TOTAL_LINES})`,
      severity: 'error'
    });
  }

  if (totalFiles > THRESHOLDS.MAX_TEST_FILES) {
    analysis.warnings.push({
      type: 'TOO_MANY_FILES',
      message: `Total test files (${totalFiles}) exceeds recommended maximum (${THRESHOLDS.MAX_TEST_FILES})`,
      severity: 'warning'
    });
  }

  if (categories.utilities.length > THRESHOLDS.MAX_UTILITY_FILES) {
    analysis.warnings.push({
      type: 'TOO_MANY_UTILITIES',
      message: `Utility files (${categories.utilities.length}) exceeds recommended maximum (${THRESHOLDS.MAX_UTILITY_FILES})`,
      severity: 'warning'
    });
  }

  // Check individual file sizes
  const allFiles = Object.values(categories).flat();
  for (const file of allFiles) {
    const isUtility = categories.utilities.includes(file);
    const threshold = isUtility ? THRESHOLDS.MAX_UTILITY_FILE_LINES : THRESHOLDS.MAX_TEST_FILE_LINES;
    
    if (file.lines > threshold) {
      analysis.warnings.push({
        type: 'LARGE_FILE',
        message: `${file.relativePath} has ${file.lines} lines (>${threshold})`,
        file: file.relativePath,
        lines: file.lines,
        severity: 'warning'
      });
    }
  }

  // Generate recommendations
  if (categories.utilities.length > 10) {
    analysis.recommendations.push({
      type: 'REDUCE_UTILITIES',
      message: 'Consider consolidating or removing test utilities'
    });
  }

  if (totalLines > THRESHOLDS.TOTAL_LINES * 0.8) {
    analysis.recommendations.push({
      type: 'APPROACHING_LIMIT',
      message: 'Test infrastructure approaching complexity limit - consider simplification'
    });
  }

  const avgLinesPerFile = totalFiles > 0 ? Math.round(totalLines / totalFiles) : 0;
  if (avgLinesPerFile > 100) {
    analysis.recommendations.push({
      type: 'LARGE_AVERAGE_FILE',
      message: `Average file size (${avgLinesPerFile} lines) suggests over-complex tests`
    });
  }

  return analysis;
}

/**
 * Main metrics collection
 */
function collectMetrics() {
  const categories = categorizeTestFiles();
  const trends = getExecutionTrends();
  const analysis = analyzeComplexity(categories);

  // Calculate summary metrics
  const summary = {
    totalLines: Object.values(categories)
      .flat()
      .reduce((sum, file) => sum + file.lines, 0),
    totalFiles: Object.values(categories)
      .flat()
      .length,
    averageFileSize: 0,
    largestFile: null,
    categoryBreakdown: {},
    thresholdStatus: {}
  };

  // Category breakdown
  for (const [category, files] of Object.entries(categories)) {
    summary.categoryBreakdown[category] = {
      fileCount: files.length,
      totalLines: files.reduce((sum, file) => sum + file.lines, 0),
      averageLines: files.length > 0 ? 
        Math.round(files.reduce((sum, file) => sum + file.lines, 0) / files.length) : 0
    };
  }

  // Largest file
  const allFiles = Object.values(categories).flat();
  if (allFiles.length > 0) {
    summary.largestFile = allFiles.reduce((largest, file) => 
      file.lines > largest.lines ? file : largest
    );
    summary.averageFileSize = Math.round(summary.totalLines / summary.totalFiles);
  }

  // Threshold status
  summary.thresholdStatus = {
    totalLines: {
      current: summary.totalLines,
      threshold: THRESHOLDS.TOTAL_LINES,
      percentage: Math.round((summary.totalLines / THRESHOLDS.TOTAL_LINES) * 100),
      status: summary.totalLines > THRESHOLDS.TOTAL_LINES ? 'exceeded' : 'ok'
    },
    fileCount: {
      current: summary.totalFiles,
      threshold: THRESHOLDS.MAX_TEST_FILES,
      percentage: Math.round((summary.totalFiles / THRESHOLDS.MAX_TEST_FILES) * 100),
      status: summary.totalFiles > THRESHOLDS.MAX_TEST_FILES ? 'exceeded' : 'ok'
    },
    utilityFiles: {
      current: categories.utilities.length,
      threshold: THRESHOLDS.MAX_UTILITY_FILES,
      percentage: Math.round((categories.utilities.length / THRESHOLDS.MAX_UTILITY_FILES) * 100),
      status: categories.utilities.length > THRESHOLDS.MAX_UTILITY_FILES ? 'exceeded' : 'ok'
    }
  };

  return {
    timestamp: new Date().toISOString(),
    summary,
    categories,
    trends,
    analysis,
    thresholds: THRESHOLDS
  };
}

/**
 * Format metrics for display
 */
function formatMetrics(metrics, format = 'json') {
  if (format === 'table') {
    console.log('\n📊 Test Infrastructure Metrics Report');
    console.log('=====================================');
    console.log(`Generated: ${new Date(metrics.timestamp).toLocaleString()}`);
    
    console.log('\n📈 Summary:');
    console.log(`  Total Lines: ${metrics.summary.totalLines} / ${metrics.thresholds.TOTAL_LINES} (${metrics.summary.thresholdStatus.totalLines.percentage}%)`);
    console.log(`  Total Files: ${metrics.summary.totalFiles}`);
    console.log(`  Average File Size: ${metrics.summary.averageFileSize} lines`);
    
    if (metrics.summary.largestFile) {
      console.log(`  Largest File: ${metrics.summary.largestFile.relativePath} (${metrics.summary.largestFile.lines} lines)`);
    }

    console.log('\n📂 By Category:');
    for (const [category, data] of Object.entries(metrics.summary.categoryBreakdown)) {
      if (data.fileCount > 0) {
        console.log(`  ${category}: ${data.fileCount} files, ${data.totalLines} lines (avg: ${data.averageLines})`);
      }
    }

    if (metrics.analysis.alerts.length > 0) {
      console.log('\n🚨 Alerts:');
      for (const alert of metrics.analysis.alerts) {
        console.log(`  ❌ ${alert.message}`);
      }
    }

    if (metrics.analysis.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of metrics.analysis.warnings) {
        console.log(`  ⚠️  ${warning.message}`);
      }
    }

    if (metrics.analysis.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      for (const rec of metrics.analysis.recommendations) {
        console.log(`  💡 ${rec.message}`);
      }
    }
    
    console.log('\n');
  } else {
    // JSON format
    console.log(JSON.stringify(metrics, null, 2));
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const format = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'json';
  const watch = args.includes('--watch');

  if (watch) {
    console.log('👁️  Watching test infrastructure...');
    setInterval(() => {
      const metrics = collectMetrics();
      if (metrics.analysis.alerts.length > 0) {
        console.log(`\n🚨 ${new Date().toLocaleTimeString()} - Test complexity alerts detected!`);
        formatMetrics(metrics, 'table');
      }
    }, 30000); // Check every 30 seconds
  } else {
    const metrics = collectMetrics();
    formatMetrics(metrics, format);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { collectMetrics, analyzeComplexity, THRESHOLDS };