#!/usr/bin/env node

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import { writeFileSync } from 'fs';
import os from 'os';
import v8 from 'v8';

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startTime: 0,
      endTime: 0,
      executionTime: 0,
      memoryPeak: 0,
      memorySnapshots: [],
      cpuUsage: [],
      testResults: null,
      systemInfo: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        nodeVersion: process.version
      }
    };
    
    this.sampleInterval = null;
  }

  startMonitoring() {
    this.metrics.startTime = performance.now();
    
    // Sample memory and CPU every 100ms
    this.sampleInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      this.metrics.memorySnapshots.push({
        timestamp: performance.now() - this.metrics.startTime,
        heapUsed: memoryMB,
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      });
      
      // Track peak memory
      if (memoryMB > this.metrics.memoryPeak) {
        this.metrics.memoryPeak = memoryMB;
      }
      
      // Track CPU usage
      const cpuUsage = process.cpuUsage();
      this.metrics.cpuUsage.push({
        timestamp: performance.now() - this.metrics.startTime,
        user: cpuUsage.user / 1000, // Convert to milliseconds
        system: cpuUsage.system / 1000
      });
    }, 100);
  }

  stopMonitoring() {
    this.metrics.endTime = performance.now();
    this.metrics.executionTime = Math.round(this.metrics.endTime - this.metrics.startTime);
    
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
    }
  }

  async runTests() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting performance monitoring for integration tests...\n');
      
      this.startMonitoring();
      
      const testProcess = spawn('npm', ['run', 'test:new'], {
        cwd: '/Users/damilola/Documents/Projects/alocubano.boulderfest', // Run from project root
        env: { 
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=512',
          CI: 'true'
        },
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text);
        output += text;
      });

      testProcess.stderr.on('data', (data) => {
        const text = data.toString();
        process.stderr.write(text);
        errorOutput += text;
      });

      testProcess.on('close', (code) => {
        this.stopMonitoring();
        
        // Parse test results from output
        const passMatch = output.match(/(\d+) passed/);
        const failMatch = output.match(/(\d+) failed/);
        const durationMatch = output.match(/Duration\s+([\d.]+)ms/);
        const testsMatch = output.match(/Tests\s+(\d+)/);
        
        this.metrics.testResults = {
          exitCode: code,
          passed: passMatch ? parseInt(passMatch[1]) : 0,
          failed: failMatch ? parseInt(failMatch[1]) : 0,
          total: testsMatch ? parseInt(testsMatch[1]) : 0,
          duration: durationMatch ? parseFloat(durationMatch[1]) : this.metrics.executionTime
        };
        
        resolve(code === 0);
      });

      testProcess.on('error', (error) => {
        this.stopMonitoring();
        reject(error);
      });
    });
  }

  generateReport() {
    const executionTimeSeconds = this.metrics.executionTime / 1000;
    const testsPerSecond = this.metrics.testResults ? 
      (this.metrics.testResults.total / executionTimeSeconds).toFixed(2) : 0;
    
    // Calculate average memory usage
    const avgMemory = this.metrics.memorySnapshots.length > 0 ?
      Math.round(this.metrics.memorySnapshots.reduce((sum, snapshot) => 
        sum + snapshot.heapUsed, 0) / this.metrics.memorySnapshots.length) : 0;
    
    // Find memory growth rate
    const memoryGrowth = this.metrics.memorySnapshots.length > 1 ?
      (this.metrics.memorySnapshots[this.metrics.memorySnapshots.length - 1].heapUsed - 
       this.metrics.memorySnapshots[0].heapUsed) : 0;
    
    const report = {
      summary: {
        status: this.metrics.testResults?.exitCode === 0 ? 'PASSED' : 'FAILED',
        executionTime: `${executionTimeSeconds.toFixed(2)}s`,
        memoryPeak: `${this.metrics.memoryPeak}MB`,
        testsRun: this.metrics.testResults?.total || 0,
        testsPassed: this.metrics.testResults?.passed || 0,
        testsFailed: this.metrics.testResults?.failed || 0,
        throughput: `${testsPerSecond} tests/second`
      },
      performance: {
        executionTimeMs: this.metrics.executionTime,
        executionTimeSeconds: executionTimeSeconds,
        memoryPeakMB: this.metrics.memoryPeak,
        memoryAverageMB: avgMemory,
        memoryGrowthMB: memoryGrowth,
        cpuTimeMs: this.metrics.cpuUsage.length > 0 ? 
          Math.round(this.metrics.cpuUsage[this.metrics.cpuUsage.length - 1].user) : 0
      },
      requirements: {
        executionTimeTarget: '< 30 seconds',
        executionTimeActual: `${executionTimeSeconds.toFixed(2)} seconds`,
        executionTimeMet: executionTimeSeconds < 30,
        memoryTarget: '< 512MB peak',
        memoryActual: `${this.metrics.memoryPeak}MB peak`,
        memoryMet: this.metrics.memoryPeak < 512
      },
      systemInfo: this.metrics.systemInfo,
      timestamp: new Date().toISOString()
    };
    
    return report;
  }

  printReport(report) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 PERFORMANCE VALIDATION REPORT');
    console.log('='.repeat(70));
    
    console.log('\n✅ TEST EXECUTION SUMMARY');
    console.log('-'.repeat(40));
    console.log(`Status:           ${report.summary.status}`);
    console.log(`Tests Run:        ${report.summary.testsRun}`);
    console.log(`Tests Passed:     ${report.summary.testsPassed}`);
    console.log(`Tests Failed:     ${report.summary.testsFailed}`);
    console.log(`Execution Time:   ${report.summary.executionTime}`);
    console.log(`Memory Peak:      ${report.summary.memoryPeak}`);
    console.log(`Test Throughput:  ${report.summary.throughput}`);
    
    console.log('\n🎯 PERFORMANCE REQUIREMENTS');
    console.log('-'.repeat(40));
    console.log(`Execution Time Requirement: ${report.requirements.executionTimeTarget}`);
    console.log(`Actual Execution Time:      ${report.requirements.executionTimeActual}`);
    console.log(`Requirement Met:            ${report.requirements.executionTimeMet ? '✅ YES' : '❌ NO'}`);
    console.log();
    console.log(`Memory Usage Requirement:   ${report.requirements.memoryTarget}`);
    console.log(`Actual Memory Peak:         ${report.requirements.memoryActual}`);
    console.log(`Requirement Met:            ${report.requirements.memoryMet ? '✅ YES' : '❌ NO'}`);
    
    console.log('\n📈 DETAILED METRICS');
    console.log('-'.repeat(40));
    console.log(`Execution Time (ms):     ${report.performance.executionTimeMs}`);
    console.log(`Memory Peak (MB):        ${report.performance.memoryPeakMB}`);
    console.log(`Memory Average (MB):     ${report.performance.memoryAverageMB}`);
    console.log(`Memory Growth (MB):      ${report.performance.memoryGrowthMB}`);
    console.log(`CPU Time (ms):           ${report.performance.cpuTimeMs}`);
    
    console.log('\n💻 SYSTEM INFORMATION');
    console.log('-'.repeat(40));
    console.log(`Platform:     ${report.systemInfo.platform}`);
    console.log(`Architecture: ${report.systemInfo.arch}`);
    console.log(`CPU Cores:    ${report.systemInfo.cpus}`);
    console.log(`Total Memory: ${Math.round(report.systemInfo.totalMemory / 1024 / 1024 / 1024)}GB`);
    console.log(`Node Version: ${report.systemInfo.nodeVersion}`);
    
    console.log('\n🏁 GO/NO-GO DECISION');
    console.log('-'.repeat(40));
    const allRequirementsMet = report.requirements.executionTimeMet && report.requirements.memoryMet;
    if (allRequirementsMet) {
      console.log('✅ ALL PERFORMANCE REQUIREMENTS MET - GO FOR PRODUCTION');
    } else {
      console.log('❌ PERFORMANCE REQUIREMENTS NOT MET - NO GO');
      if (!report.requirements.executionTimeMet) {
        console.log('  - Execution time exceeds 30 second limit');
      }
      if (!report.requirements.memoryMet) {
        console.log('  - Memory usage exceeds 512MB limit');
      }
    }
    
    console.log('\n' + '='.repeat(70));
  }

  saveReport(report) {
    const filename = 'performance-validation-report.json';
    writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`\n📁 Full report saved to: ${filename}`);
  }
}

// Main execution
async function main() {
  const monitor = new PerformanceMonitor();
  
  try {
    const success = await monitor.runTests();
    const report = monitor.generateReport();
    
    monitor.printReport(report);
    monitor.saveReport(report);
    
    // Exit with appropriate code
    const meetsRequirements = report.requirements.executionTimeMet && report.requirements.memoryMet;
    process.exit(meetsRequirements && success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error during performance monitoring:', error);
    process.exit(1);
  }
}

main();