#!/usr/bin/env node

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

// Test configuration
const TEST_SUITES = [
  {
    name: 'Ticket Sales Peak Load',
    script: 'tests/load/k6-ticket-sales.js',
    duration: '12m',
    thresholds: {
      successRate: 0.95,
      p95ResponseTime: 500,
      errorRate: 0.01,
    },
  },
  {
    name: 'Check-in Rush',
    script: 'tests/load/k6-check-in-rush.js',
    duration: '15m',
    thresholds: {
      successRate: 0.98,
      avgValidationTime: 50,
      checkinsPerSecond: 15,
    },
  },
  {
    name: 'Sustained Load',
    script: 'tests/load/k6-sustained-load.js',
    duration: '30m',
    thresholds: {
      successRate: 0.99,
      avgResponseTime: 300,
      errorRate: 0.01,
    },
  },
  {
    name: 'Stress Test',
    script: 'tests/load/k6-stress-test.js',
    duration: '13m',
    thresholds: {
      maxErrors: 0.05,
      gracefulDegradation: true,
      recovery: true,
    },
  },
];

class PerformanceTestRunner {
  constructor(options = {}) {
    this.options = options;
    this.results = {};
    this.baselines = null;
    this.baselineFile = path.join(__dirname, '..', 'reports', 'performance-baseline-report.json');
    this.reportDir = path.join(__dirname, '..', 'reports', 'load-test-results');
  }

  async initialize() {
    // Ensure directories exist
    await fs.mkdir(this.reportDir, { recursive: true });
    
    // Load baselines if they exist
    try {
      const baselineData = await fs.readFile(this.baselineFile, 'utf8');
      this.baselines = JSON.parse(baselineData);
      console.log('✅ Loaded performance baselines');
    } catch (error) {
      console.log('⚠️  No baselines found. This run will establish baselines.');
      this.baselines = null;
    }
    
    // Check if k6 is installed
    try {
      await execAsync('k6 version');
      console.log('✅ K6 is installed');
    } catch (error) {
      console.error('❌ K6 is not installed. Please run: npm run perf:install');
      process.exit(1);
    }
  }

  async runTest(testSuite) {
    console.log(`\n🚀 Running: ${testSuite.name}`);
    console.log(`📝 Script: ${testSuite.script}`);
    console.log(`⏱️  Duration: ${testSuite.duration}`);
    
    const startTime = Date.now();
    const resultFile = path.join(this.reportDir, `${testSuite.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`);
    
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        LOAD_TEST_BASE_URL: process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000',
      };
      
      const k6Process = spawn('k6', ['run', '--out', `json=${resultFile}`, testSuite.script], {
        env,
        stdio: ['inherit', 'pipe', 'pipe'],
      });
      
      let stdout = '';
      let stderr = '';
      
      k6Process.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });
      
      k6Process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });
      
      k6Process.on('close', async (code) => {
        const duration = Date.now() - startTime;
        
        // Read the results file
        let results = {};
        try {
          const resultData = await fs.readFile(resultFile, 'utf8');
          const lines = resultData.split('\n').filter(line => line);
          const metrics = {};
          
          // Parse JSON lines format
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.type === 'Metric') {
                metrics[data.metric] = data.data;
              }
            } catch (e) {
              // Skip invalid lines
            }
          }
          
          results = {
            name: testSuite.name,
            duration: duration,
            exitCode: code,
            metrics: metrics,
            passed: code === 0,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          console.error('Error reading results:', error);
          results = {
            name: testSuite.name,
            duration: duration,
            exitCode: code,
            error: error.message,
            passed: false,
          };
        }
        
        if (code === 0) {
          console.log(`✅ ${testSuite.name} completed successfully`);
          resolve(results);
        } else {
          console.log(`❌ ${testSuite.name} failed with exit code ${code}`);
          resolve(results); // Still resolve to continue other tests
        }
      });
      
      k6Process.on('error', (error) => {
        console.error(`Error running test: ${error.message}`);
        reject(error);
      });
    });
  }

  async runFullTestSuite() {
    console.log('🏃 Starting Performance Test Suite');
    console.log('=' .repeat(50));
    
    const suiteStartTime = Date.now();
    const testResults = [];
    
    // Run tests based on mode
    if (this.options.parallel) {
      console.log('Running tests in parallel...');
      const promises = TEST_SUITES.map(suite => this.runTest(suite));
      const results = await Promise.allSettled(promises);
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          testResults.push(result.value);
          this.results[result.value.name] = result.value;
        } else {
          console.error('Test failed:', result.reason);
        }
      }
    } else {
      console.log('Running tests sequentially...');
      for (const suite of TEST_SUITES) {
        try {
          const result = await this.runTest(suite);
          testResults.push(result);
          this.results[suite.name] = result;
          
          // Optional: Add delay between tests
          if (TEST_SUITES.indexOf(suite) < TEST_SUITES.length - 1) {
            console.log('\n⏸️  Waiting 30 seconds before next test...\n');
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
        } catch (error) {
          console.error(`Failed to run ${suite.name}:`, error);
        }
      }
    }
    
    const suiteDuration = Date.now() - suiteStartTime;
    
    // Analyze results
    await this.analyzeResults(testResults);
    
    // Generate report
    await this.generateReport(testResults, suiteDuration);
    
    // Check for regressions
    if (this.baselines) {
      const regressions = await this.detectRegressions(testResults);
      if (regressions.length > 0) {
        await this.notifyRegressions(regressions);
      }
    }
    
    // Update baselines if requested
    if (this.options.baseline) {
      await this.updateBaselines(testResults);
    }
    
    return testResults;
  }

  async analyzeResults(results) {
    console.log('\n📊 Analyzing Test Results');
    console.log('=' .repeat(50));
    
    let totalPassed = 0;
    let totalFailed = 0;
    
    for (const result of results) {
      if (result.passed) {
        totalPassed++;
        console.log(`✅ ${result.name}: PASSED`);
      } else {
        totalFailed++;
        console.log(`❌ ${result.name}: FAILED`);
      }
    }
    
    console.log(`\nSummary: ${totalPassed} passed, ${totalFailed} failed`);
    
    return {
      totalTests: results.length,
      passed: totalPassed,
      failed: totalFailed,
      successRate: totalPassed / results.length,
    };
  }

  async detectRegressions(results) {
    if (!this.baselines) return [];
    
    console.log('\n🔍 Checking for Performance Regressions');
    const regressions = [];
    
    for (const result of results) {
      const baseline = this.baselines[result.name];
      if (!baseline) continue;
      
      // Compare key metrics
      if (result.metrics) {
        for (const [metric, value] of Object.entries(result.metrics)) {
          const baselineValue = baseline.metrics?.[metric];
          if (!baselineValue) continue;
          
          // Check if performance degraded by more than 10%
          const degradation = ((value - baselineValue) / baselineValue) * 100;
          if (degradation > 10) {
            regressions.push({
              test: result.name,
              metric: metric,
              baseline: baselineValue,
              current: value,
              degradation: degradation.toFixed(2) + '%',
            });
          }
        }
      }
    }
    
    if (regressions.length > 0) {
      console.log(`⚠️  Found ${regressions.length} performance regressions`);
      for (const regression of regressions) {
        console.log(`  - ${regression.test}: ${regression.metric} degraded by ${regression.degradation}`);
      }
    } else {
      console.log('✅ No performance regressions detected');
    }
    
    return regressions;
  }

  async generateReport(results, duration) {
    console.log('\n📝 Generating Performance Report');
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: duration,
      environment: process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000',
      summary: await this.analyzeResults(results),
      tests: results,
      recommendations: this.generateRecommendations(results),
    };
    
    // Save comprehensive report
    const reportFile = path.join(this.reportDir, `performance-report-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    
    // Generate HTML report
    const htmlReport = this.generateHTMLReport(report);
    const htmlFile = path.join(this.reportDir, `performance-report-${Date.now()}.html`);
    await fs.writeFile(htmlFile, htmlReport);
    
    console.log(`✅ Report saved to ${reportFile}`);
    console.log(`📊 HTML report: ${htmlFile}`);
    
    return report;
  }

  generateRecommendations(results) {
    const recommendations = [];
    
    for (const result of results) {
      if (!result.passed && result.metrics) {
        // Analyze failure patterns
        if (result.name.includes('Ticket Sales')) {
          recommendations.push({
            area: 'Payment Processing',
            issue: 'High latency during peak ticket sales',
            recommendation: 'Implement payment request queuing and async processing',
            priority: 'HIGH',
          });
        }
        
        if (result.name.includes('Check-in')) {
          recommendations.push({
            area: 'QR Validation',
            issue: 'Validation time exceeds threshold',
            recommendation: 'Add QR code caching and optimize database queries',
            priority: 'HIGH',
          });
        }
        
        if (result.name.includes('Stress')) {
          recommendations.push({
            area: 'System Capacity',
            issue: 'System degradation under 2x load',
            recommendation: 'Implement rate limiting and auto-scaling',
            priority: 'MEDIUM',
          });
        }
      }
    }
    
    // Add general recommendations
    if (results.some(r => !r.passed)) {
      recommendations.push({
        area: 'Caching',
        issue: 'Database load causing bottlenecks',
        recommendation: 'Implement Redis caching for frequently accessed data',
        priority: 'HIGH',
      });
      
      recommendations.push({
        area: 'Monitoring',
        issue: 'Need better visibility into performance issues',
        recommendation: 'Deploy APM solution for real-time performance tracking',
        priority: 'MEDIUM',
      });
    }
    
    return recommendations;
  }

  generateHTMLReport(report) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Report - ${new Date(report.timestamp).toLocaleString()}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
        .summary { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .test-result { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #3498db; }
        .test-result.failed { border-left-color: #e74c3c; }
        .test-result.passed { border-left-color: #27ae60; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 10px; }
        .metric { background: #ecf0f1; padding: 10px; border-radius: 3px; }
        .recommendations { background: #fff3cd; padding: 20px; margin: 20px 0; border-radius: 5px; border: 1px solid #ffc107; }
        .recommendation { margin: 10px 0; padding: 10px; background: white; border-radius: 3px; }
        .priority-HIGH { color: #e74c3c; font-weight: bold; }
        .priority-MEDIUM { color: #f39c12; font-weight: bold; }
        .priority-LOW { color: #95a5a6; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Test Report</h1>
        <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
        <p>Duration: ${Math.round(report.duration / 1000 / 60)} minutes</p>
        <p>Environment: ${report.environment}</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <p>Total Tests: ${report.summary.totalTests}</p>
        <p>Passed: ${report.summary.passed} (${(report.summary.successRate * 100).toFixed(1)}%)</p>
        <p>Failed: ${report.summary.failed}</p>
    </div>
    
    <h2>Test Results</h2>
    ${report.tests.map(test => `
        <div class="test-result ${test.passed ? 'passed' : 'failed'}">
            <h3>${test.name} - ${test.passed ? '✅ PASSED' : '❌ FAILED'}</h3>
            <p>Duration: ${Math.round(test.duration / 1000)}s</p>
            ${test.metrics ? `
                <div class="metrics">
                    ${Object.entries(test.metrics).slice(0, 6).map(([key, value]) => `
                        <div class="metric">
                            <strong>${key}:</strong> ${typeof value === 'number' ? value.toFixed(2) : value}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `).join('')}
    
    ${report.recommendations.length > 0 ? `
        <div class="recommendations">
            <h2>Recommendations</h2>
            ${report.recommendations.map(rec => `
                <div class="recommendation">
                    <span class="priority-${rec.priority}">[${rec.priority}]</span>
                    <strong>${rec.area}:</strong> ${rec.recommendation}
                    <br><small>Issue: ${rec.issue}</small>
                </div>
            `).join('')}
        </div>
    ` : ''}
</body>
</html>`;
  }

  async updateBaselines(results) {
    console.log('\n📈 Updating Performance Baselines');
    
    const baselines = {};
    for (const result of results) {
      if (result.passed) {
        baselines[result.name] = {
          metrics: result.metrics,
          timestamp: result.timestamp,
        };
      }
    }
    
    await fs.writeFile(this.baselineFile, JSON.stringify(baselines, null, 2));
    console.log('✅ Baselines updated successfully');
  }

  async notifyRegressions(regressions) {
    console.log('\n🔔 Performance Regression Alert');
    // In a real implementation, this would send notifications
    // via email, Slack, PagerDuty, etc.
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    parallel: args.includes('--parallel'),
    baseline: args.includes('--baseline'),
    report: args.includes('--report'),
  };
  
  if (args.includes('--help')) {
    console.log(`
Performance Test Runner

Usage: node performance-test-runner.js [options]

Options:
  --parallel    Run tests in parallel
  --baseline    Update performance baselines
  --report      Generate report only (skip tests)
  --help        Show this help message

Examples:
  npm run perf:test                    # Run all tests sequentially
  npm run perf:test -- --parallel      # Run tests in parallel
  npm run perf:baseline                # Run tests and update baselines
`);
    process.exit(0);
  }
  
  const runner = new PerformanceTestRunner(options);
  
  try {
    await runner.initialize();
    
    if (options.report) {
      // Generate report from existing results
      console.log('Generating report from existing results...');
      // Implementation for report-only mode
    } else {
      // Run full test suite
      const results = await runner.runFullTestSuite();
      
      // Exit with appropriate code
      const allPassed = results.every(r => r.passed);
      process.exit(allPassed ? 0 : 1);
    }
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default PerformanceTestRunner;