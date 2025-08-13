#!/usr/bin/env node

/**
 * Real-World Performance Analysis for Test Isolation Architecture
 * 
 * Measures actual performance overhead by running real tests with and without isolation.
 * This provides accurate performance data for the bulletproof test isolation system.
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';

/**
 * Test execution configuration
 */
const TEST_CONFIGS = {
  baseline: {
    name: 'Baseline (No Enhanced Isolation)',
    config: 'vitest.baseline.config.js',
    env: {
      TEST_ISOLATION_ENHANCED: 'false',
      TEST_AUTO_ISOLATION: 'false'
    }
  },
  enhanced: {
    name: 'Enhanced Isolation Architecture',
    config: 'vitest.config.js', 
    env: {
      TEST_ISOLATION_ENHANCED: 'true',
      TEST_AUTO_ISOLATION: 'true'
    }
  },
  selective: {
    name: 'Selective Isolation (Optimized)',
    config: 'vitest.config.js',
    env: {
      TEST_ISOLATION_ENHANCED: 'true',
      TEST_AUTO_ISOLATION: 'true',
      TEST_SELECTIVE_ISOLATION: 'true'
    }
  }
};

/**
 * Test suites for performance measurement
 */
const TEST_SUITES = {
  unit_basic: {
    name: 'Basic Unit Tests',
    pattern: 'tests/unit/gallery-consolidated.test.js tests/unit/accessibility.test.js tests/unit/api-gallery-logic.test.js',
    expected: 'low overhead'
  },
  unit_services: {
    name: 'Service Unit Tests',
    pattern: 'tests/unit/brevo-service.test.js tests/unit/email-subscriber-service.test.js',
    expected: 'medium overhead'
  },
  unit_database: {
    name: 'Database Unit Tests',
    pattern: 'tests/unit/database-client.test.js',
    expected: 'high overhead'
  },
  isolation: {
    name: 'Isolation Component Tests',
    pattern: 'tests/unit/test-singleton-manager.test.js tests/unit/test-mock-manager.test.js',
    expected: 'high overhead'
  }
};

class RealPerformanceAnalyzer {
  constructor() {
    this.results = {};
    this.projectRoot = process.cwd();
  }

  /**
   * Run a single test configuration and measure performance
   */
  async runTestSuite(configName, testSuiteName, iterations = 3) {
    const config = TEST_CONFIGS[configName];
    const testSuite = TEST_SUITES[testSuiteName];
    
    console.log(`\n🧪 Running ${testSuite.name} with ${config.name}...`);
    
    const results = [];
    
    for (let i = 0; i < iterations; i++) {
      console.log(`   Iteration ${i + 1}/${iterations}...`);
      
      const startTime = performance.now();
      const startMemory = process.memoryUsage();
      
      try {
        const result = await this.executeTest(config, testSuite);
        const endTime = performance.now();
        const endMemory = process.memoryUsage();
        
        results.push({
          iteration: i + 1,
          duration: endTime - startTime,
          memoryDelta: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          },
          testResults: result,
          success: result.success
        });
        
      } catch (error) {
        results.push({
          iteration: i + 1,
          duration: performance.now() - startTime,
          success: false,
          error: error.message
        });
      }
      
      // Small delay between iterations
      await this.sleep(1000);
    }
    
    return this.calculateSuiteStatistics(configName, testSuiteName, results);
  }

  /**
   * Execute a test using child process
   */
  async executeTest(config, testSuite) {
    return new Promise((resolve, reject) => {
      const args = [
        'npx', 'vitest', 'run',
        '--config', config.config,
        '--reporter', 'json',
        '--coverage', 'false',
        '--run',
        ...testSuite.pattern.split(' ')
      ];

      const env = {
        ...process.env,
        ...config.env
      };

      const child = spawn('node', args, {
        env,
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Test execution timeout'));
      }, 30000); // 30 second timeout

      child.on('close', (code) => {
        clearTimeout(timeout);
        
        try {
          // Parse JSON output if possible
          let jsonOutput = null;
          try {
            const jsonMatch = stdout.match(/\{[^]*\}/);
            if (jsonMatch) {
              jsonOutput = JSON.parse(jsonMatch[0]);
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }

          resolve({
            success: code === 0,
            exitCode: code,
            stdout,
            stderr,
            jsonOutput,
            testCount: jsonOutput ? jsonOutput.numTotalTests : 0,
            passedTests: jsonOutput ? jsonOutput.numPassedTests : 0,
            failedTests: jsonOutput ? jsonOutput.numFailedTests : 0
          });
        } catch (error) {
          reject(error);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Calculate statistics for a test suite
   */
  calculateSuiteStatistics(configName, testSuiteName, results) {
    const successfulResults = results.filter(r => r.success);
    const durations = successfulResults.map(r => r.duration);
    
    if (durations.length === 0) {
      return {
        configName,
        testSuiteName,
        success: false,
        error: 'No successful test runs',
        results
      };
    }

    return {
      configName,
      testSuiteName,
      success: true,
      iterations: results.length,
      successfulIterations: successfulResults.length,
      
      timing: {
        mean: this.mean(durations),
        median: this.median(durations),
        min: Math.min(...durations),
        max: Math.max(...durations),
        stdDev: this.standardDeviation(durations)
      },
      
      testMetrics: {
        totalTests: this.mean(successfulResults.map(r => r.testResults.testCount || 0)),
        avgPassedTests: this.mean(successfulResults.map(r => r.testResults.passedTests || 0)),
        avgFailedTests: this.mean(successfulResults.map(r => r.testResults.failedTests || 0)),
        successRate: (successfulResults.length / results.length) * 100
      },
      
      memory: {
        avgHeapUsed: this.mean(successfulResults.map(r => r.memoryDelta.heapUsed)),
        maxHeapUsed: Math.max(...successfulResults.map(r => r.memoryDelta.heapUsed)),
        avgRss: this.mean(successfulResults.map(r => r.memoryDelta.rss))
      },
      
      rawResults: results
    };
  }

  /**
   * Run complete performance analysis
   */
  async runCompleteAnalysis() {
    console.log('🚀 Starting Real-World Test Isolation Performance Analysis...\n');
    
    const analysisResults = {};
    
    // Run each configuration against each test suite
    for (const [configName, config] of Object.entries(TEST_CONFIGS)) {
      analysisResults[configName] = {};
      
      console.log(`\n📊 Testing Configuration: ${config.name}`);
      console.log('=' .repeat(60));
      
      for (const [testSuiteName, testSuite] of Object.entries(TEST_SUITES)) {
        try {
          const result = await this.runTestSuite(configName, testSuiteName, 2);
          analysisResults[configName][testSuiteName] = result;
          
          if (result.success) {
            console.log(`   ✅ ${testSuite.name}: ${result.timing.mean.toFixed(0)}ms avg`);
          } else {
            console.log(`   ❌ ${testSuite.name}: FAILED`);
          }
        } catch (error) {
          console.log(`   ❌ ${testSuite.name}: ERROR - ${error.message}`);
          analysisResults[configName][testSuiteName] = {
            success: false,
            error: error.message
          };
        }
      }
    }
    
    // Generate comprehensive report
    const report = this.generateComparisonReport(analysisResults);
    
    // Save results
    const reportPath = path.join(this.projectRoot, 'reports', 'real-isolation-performance.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    this.displayReport(report);
    
    console.log(`\n💾 Detailed report saved to: ${reportPath}`);
    
    return report;
  }

  /**
   * Generate comparison report between configurations
   */
  generateComparisonReport(analysisResults) {
    const report = {
      summary: {},
      configurations: analysisResults,
      comparisons: {},
      recommendations: []
    };

    // Calculate configuration summaries
    for (const [configName, configResults] of Object.entries(analysisResults)) {
      const successfulSuites = Object.values(configResults).filter(r => r.success);
      const avgTime = this.mean(successfulSuites.map(s => s.timing.mean));
      
      report.summary[configName] = {
        avgExecutionTime: avgTime,
        successfulSuites: successfulSuites.length,
        totalSuites: Object.keys(configResults).length,
        reliability: (successfulSuites.length / Object.keys(configResults).length) * 100
      };
    }

    // Calculate overhead comparisons
    const baseline = report.summary.baseline;
    if (baseline && baseline.avgExecutionTime > 0) {
      for (const [configName, summary] of Object.entries(report.summary)) {
        if (configName === 'baseline') continue;
        
        const overhead = ((summary.avgExecutionTime - baseline.avgExecutionTime) / baseline.avgExecutionTime) * 100;
        report.comparisons[configName] = {
          overhead: overhead,
          overheadMs: summary.avgExecutionTime - baseline.avgExecutionTime,
          performance: this.categorizeOverhead(overhead)
        };
      }
    }

    // Generate recommendations
    report.recommendations = this.generatePerformanceRecommendations(report);

    return report;
  }

  /**
   * Categorize overhead performance
   */
  categorizeOverhead(overheadPercent) {
    if (overheadPercent <= 5) return 'excellent';
    if (overheadPercent <= 15) return 'good';
    if (overheadPercent <= 30) return 'acceptable';
    if (overheadPercent <= 50) return 'concerning';
    return 'poor';
  }

  /**
   * Generate performance recommendations
   */
  generatePerformanceRecommendations(report) {
    const recommendations = [];
    
    for (const [configName, comparison] of Object.entries(report.comparisons)) {
      if (comparison.overhead > 50) {
        recommendations.push({
          priority: 'critical',
          config: configName,
          issue: `Excessive overhead: ${comparison.overhead.toFixed(1)}%`,
          recommendation: 'Consider disabling or optimizing isolation components'
        });
      } else if (comparison.overhead > 30) {
        recommendations.push({
          priority: 'high',
          config: configName,
          issue: `High overhead: ${comparison.overhead.toFixed(1)}%`,
          recommendation: 'Implement selective isolation based on test patterns'
        });
      } else if (comparison.overhead > 15) {
        recommendations.push({
          priority: 'medium',
          config: configName,
          issue: `Moderate overhead: ${comparison.overhead.toFixed(1)}%`,
          recommendation: 'Consider optimizing component initialization'
        });
      } else if (comparison.overhead <= 5) {
        recommendations.push({
          priority: 'info',
          config: configName,
          issue: 'Performance target met',
          recommendation: 'Current configuration is optimal'
        });
      }
    }

    return recommendations;
  }

  /**
   * Display formatted report
   */
  displayReport(report) {
    console.log('\n' + '=' .repeat(80));
    console.log('🎯 REAL-WORLD TEST ISOLATION PERFORMANCE ANALYSIS');
    console.log('=' .repeat(80));

    // Configuration summaries
    console.log('\n📊 CONFIGURATION SUMMARIES');
    console.log('-' .repeat(50));
    
    for (const [configName, summary] of Object.entries(report.summary)) {
      console.log(`\n${TEST_CONFIGS[configName].name}:`);
      console.log(`   Average Execution: ${summary.avgExecutionTime.toFixed(0)}ms`);
      console.log(`   Successful Suites: ${summary.successfulSuites}/${summary.totalSuites}`);
      console.log(`   Reliability: ${summary.reliability.toFixed(1)}%`);
    }

    // Overhead analysis
    if (Object.keys(report.comparisons).length > 0) {
      console.log('\n⚡ PERFORMANCE OVERHEAD ANALYSIS');
      console.log('-' .repeat(50));
      
      for (const [configName, comparison] of Object.entries(report.comparisons)) {
        const performance = comparison.performance.toUpperCase();
        const indicator = comparison.performance === 'excellent' ? '✅' : 
                         comparison.performance === 'good' ? '👍' : 
                         comparison.performance === 'acceptable' ? '⚠️' : '❌';
        
        console.log(`\n${indicator} ${TEST_CONFIGS[configName].name}:`);
        console.log(`   Overhead: ${comparison.overhead.toFixed(1)}% (+${comparison.overheadMs.toFixed(0)}ms)`);
        console.log(`   Performance: ${performance}`);
      }
    }

    // Recommendations
    console.log('\n💡 PERFORMANCE RECOMMENDATIONS');
    console.log('-' .repeat(50));
    
    if (report.recommendations.length === 0) {
      console.log('✅ No recommendations - all configurations performing well');
    } else {
      for (const rec of report.recommendations) {
        const priority = rec.priority === 'critical' ? '🚨' : 
                        rec.priority === 'high' ? '⚠️' : 
                        rec.priority === 'medium' ? '💡' : 'ℹ️';
        
        console.log(`\n${priority} ${rec.config.toUpperCase()} (${rec.priority}):`);
        console.log(`   Issue: ${rec.issue}`);
        console.log(`   Recommendation: ${rec.recommendation}`);
      }
    }

    console.log('\n' + '=' .repeat(80));
  }

  // Utility functions
  mean(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  standardDeviation(arr) {
    const avg = this.mean(arr);
    const squaredDiffs = arr.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(this.mean(squaredDiffs));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run analysis if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new RealPerformanceAnalyzer();
  analyzer.runCompleteAnalysis().catch(console.error);
}

export { RealPerformanceAnalyzer };