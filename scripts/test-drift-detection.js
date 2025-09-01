#!/usr/bin/env node
/**
 * Test Mock Drift Detection System
 * 
 * This script validates that the drift detection system is working correctly
 * by running various test scenarios and verifying expected behavior.
 */

import { MockDriftDetector } from './mock-drift-detector.js';
import { DriftHelper } from './drift-helper.js';
import fs from 'fs/promises';
import path from 'path';

class DriftDetectionTester {
  constructor() {
    this.testResults = [];
    this.outputDir = '.tmp/drift-test-results';
  }

  async runTests() {
    console.log('🧪 Testing Mock Drift Detection System...\n');
    
    try {
      await this.setupTestEnvironment();
      
      // Run test scenarios
      await this.testBasicDetection();
      await this.testHelperFunctions();
      await this.testErrorHandling();
      await this.testReportGeneration();
      
      // Generate test report
      await this.generateTestReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  async setupTestEnvironment() {
    console.log('📋 Setting up test environment...');
    
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    
    this.log('✅ Test environment ready');
  }

  async testBasicDetection() {
    console.log('\n🔍 Testing Basic Drift Detection...');
    
    try {
      const detector = new MockDriftDetector({
        verbose: false,
        outputDir: this.outputDir,
        timeout: 5000
      });
      
      // Test that detector initializes correctly
      this.assert(detector.endpoints.length > 0, 'Detector should have endpoints configured');
      this.assert(detector.baseURL === 'http://localhost:3000', 'Base URL should be set correctly');
      this.assert(detector.mockURL === 'http://localhost:3001', 'Mock URL should be set correctly');
      
      this.log('✅ Basic detection initialization test passed');
      
    } catch (error) {
      this.log(`❌ Basic detection test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async testHelperFunctions() {
    console.log('\n🔧 Testing Helper Functions...');
    
    try {
      const helper = new DriftHelper();
      
      // Test endpoint listing
      const listOutput = await this.captureOutput(() => helper.listEndpoints());
      this.assert(listOutput.includes('HEALTH'), 'Should list health endpoints');
      this.assert(listOutput.includes('PAYMENTS'), 'Should list payment endpoints');
      
      this.log('✅ Helper functions test passed');
      
    } catch (error) {
      this.log(`❌ Helper functions test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async testErrorHandling() {
    console.log('\n⚠️ Testing Error Handling...');
    
    try {
      const detector = new MockDriftDetector({
        verbose: false,
        baseURL: 'http://localhost:9999', // Non-existent server
        mockURL: 'http://localhost:9998', // Non-existent server
        timeout: 1000 // Short timeout
      });
      
      // Test single endpoint request that should fail
      const testEndpoint = { method: 'GET', path: '/api/health/check', category: 'health' };
      const response = await detector.makeRequest(detector.baseURL, testEndpoint);
      
      this.assert(response.success === false, 'Should fail gracefully for unreachable server');
      this.assert(response.error, 'Should provide error message');
      
      this.log('✅ Error handling test passed');
      
    } catch (error) {
      this.log(`❌ Error handling test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async testReportGeneration() {
    console.log('\n📊 Testing Report Generation...');
    
    try {
      const detector = new MockDriftDetector({
        verbose: false,
        outputDir: this.outputDir
      });
      
      // Create mock test results
      const mockResults = [
        {
          endpoint: 'GET /api/health/check',
          category: 'health',
          match: true,
          severity: 'none',
          differences: [],
          responseTime: 100
        },
        {
          endpoint: 'POST /api/tickets/validate',
          category: 'tickets',
          match: false,
          severity: 'high',
          differences: [
            {
              path: 'status',
              type: 'status_mismatch',
              mock: 404,
              real: 200,
              severity: 'high'
            }
          ],
          responseTime: 150
        }
      ];
      
      // Test report generation
      const report = detector.generateReport(mockResults);
      
      // Validate report structure
      this.assert(report.metadata, 'Report should have metadata');
      this.assert(report.summary, 'Report should have summary');
      this.assert(report.results, 'Report should have results');
      this.assert(report.recommendations, 'Report should have recommendations');
      
      // Validate summary calculations
      this.assert(report.summary.overall.total_endpoints === 2, 'Should count total endpoints correctly');
      this.assert(report.summary.overall.matched === 1, 'Should count matched endpoints correctly');
      this.assert(report.summary.overall.drifted === 1, 'Should count drifted endpoints correctly');
      this.assert(report.summary.overall.match_rate === '50.0%', 'Should calculate match rate correctly');
      
      // Validate severity analysis
      this.assert(report.summary.by_severity.high === 1, 'Should count high severity issues');
      this.assert(report.summary.by_severity.none === 1, 'Should count no-issue endpoints');
      
      // Validate health score
      this.assert(report.summary.health_score > 0 && report.summary.health_score < 100, 'Health score should reflect mixed results');
      
      // Validate recommendations
      this.assert(report.recommendations.length > 0, 'Should generate recommendations for drift');
      const criticalRec = report.recommendations.find(r => r.priority === 'high');
      this.assert(criticalRec, 'Should have high-priority recommendation for critical drift');
      
      this.log('✅ Report generation test passed');
      
    } catch (error) {
      this.log(`❌ Report generation test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async testStructureComparison() {
    console.log('\n🔬 Testing Structure Comparison...');
    
    try {
      const detector = new MockDriftDetector();
      
      // Test identical structures
      const obj1 = { status: 'ok', data: { id: 1, name: 'test' } };
      const obj2 = { status: 'ok', data: { id: 1, name: 'test' } };
      const diffs1 = detector.compareStructure(obj1, obj2);
      this.assert(diffs1.length === 0, 'Identical structures should have no differences');
      
      // Test type mismatch
      const obj3 = { status: 'ok', data: { id: 1, name: 'test' } };
      const obj4 = { status: 'ok', data: { id: '1', name: 'test' } }; // id is string
      const diffs2 = detector.compareStructure(obj3, obj4);
      this.assert(diffs2.length > 0, 'Type differences should be detected');
      this.assert(diffs2.some(d => d.type === 'value_mismatch'), 'Should detect value mismatch');
      
      // Test missing fields
      const obj5 = { status: 'ok', data: { id: 1, name: 'test', extra: 'field' } };
      const obj6 = { status: 'ok', data: { id: 1, name: 'test' } };
      const diffs3 = detector.compareStructure(obj5, obj6);
      this.assert(diffs3.length > 0, 'Missing fields should be detected');
      this.assert(diffs3.some(d => d.type === 'missing_in_real'), 'Should detect missing field in real response');
      
      this.log('✅ Structure comparison test passed');
      
    } catch (error) {
      this.log(`❌ Structure comparison test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async generateTestReport() {
    const timestamp = new Date().toISOString();
    const passedTests = this.testResults.filter(r => r.passed).length;
    const totalTests = this.testResults.length;
    
    const report = {
      timestamp,
      summary: {
        total_tests: totalTests,
        passed: passedTests,
        failed: totalTests - passedTests,
        success_rate: `${((passedTests / totalTests) * 100).toFixed(1)}%`
      },
      test_results: this.testResults
    };
    
    const reportPath = path.join(this.outputDir, `test-report-${timestamp.replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('              DRIFT DETECTION TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`\nTotal Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${report.summary.success_rate}`);
    console.log(`\nTest Report: ${reportPath}`);
    console.log('='.repeat(60));
    
    if (passedTests < totalTests) {
      console.log('\n❌ Some tests failed. Check the report for details.');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed! Drift detection system is working correctly.');
    }
  }

  async captureOutput(fn) {
    const originalLog = console.log;
    let output = '';
    
    console.log = (...args) => {
      output += args.join(' ') + '\n';
    };
    
    try {
      await fn();
    } finally {
      console.log = originalLog;
    }
    
    return output;
  }

  assert(condition, message) {
    const result = {
      message,
      passed: Boolean(condition),
      timestamp: new Date().toISOString()
    };
    
    this.testResults.push(result);
    
    if (result.passed) {
      this.log(`  ✅ ${message}`);
    } else {
      this.log(`  ❌ ${message}`, 'error');
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} ${message}`);
  }
}

// Run tests if called directly
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Mock Drift Detection Test Suite

Usage:
  node scripts/test-drift-detection.js [options]

Options:
  --help, -h    Show this help message

This script validates the drift detection system by running comprehensive tests
including basic detection, helper functions, error handling, and report generation.
`);
    process.exit(0);
  }
  
  const tester = new DriftDetectionTester();
  await tester.runTests();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DriftDetectionTester };