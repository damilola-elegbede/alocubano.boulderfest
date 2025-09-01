#!/usr/bin/env node
/**
 * Mock Drift Detector - Ensures mock responses stay in sync with real API responses
 * 
 * Features:
 * - Compares mock server responses with real Vercel dev responses
 * - Detects structural differences in API responses
 * - Generates comprehensive drift reports
 * - Supports CI integration for weekly automated checks
 * - Provides detailed analysis and recommendations
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import fetch from 'node-fetch';

class MockDriftDetector {
  constructor(options = {}) {
    this.baseURL = options.baseURL || 'http://localhost:3000';
    this.mockURL = options.mockURL || 'http://localhost:3001';
    this.outputDir = options.outputDir || '.tmp/drift-reports';
    this.verbose = options.verbose || false;
    this.timeout = options.timeout || 10000;
    
    // Core API endpoints to monitor
    this.endpoints = [
      // Health endpoints
      { method: 'GET', path: '/api/health/check', category: 'health' },
      { method: 'GET', path: '/api/health/database', category: 'health' },
      
      // Email endpoints  
      { method: 'POST', path: '/api/email/subscribe', category: 'email',
        testPayload: { email: 'test@example.com', consentToMarketing: true }
      },
      
      // Payment endpoints
      { method: 'POST', path: '/api/payments/create-checkout-session', category: 'payments',
        testPayload: { items: [{ price: 'price_test', quantity: 1 }] }
      },
      
      // Ticket endpoints
      { method: 'POST', path: '/api/tickets/validate', category: 'tickets',
        testPayload: { qrCode: 'TEST-QR-CODE-123' }
      },
      { method: 'POST', path: '/api/tickets/register', category: 'tickets',
        testPayload: { 
          ticketId: 'TKT-TEST-123', 
          email: 'test@example.com', 
          firstName: 'John', 
          lastName: 'Doe' 
        }
      },
      
      // Registration endpoints
      { method: 'GET', path: '/api/registration/TEST-TOKEN', category: 'registration' },
      { method: 'GET', path: '/api/registration/health', category: 'registration' },
      { method: 'POST', path: '/api/registration/batch', category: 'registration',
        testPayload: { 
          token: 'TEST-TOKEN',
          registrations: [{ ticketId: 'TKT-TEST-123', email: 'test@example.com' }]
        }
      },
      
      // Gallery endpoints
      { method: 'GET', path: '/api/gallery', category: 'gallery' },
      { method: 'GET', path: '/api/featured-photos', category: 'gallery' },
      
      // Admin endpoints (will return auth errors, but structure is important)
      { method: 'GET', path: '/api/admin/dashboard', category: 'admin' },
      { method: 'POST', path: '/api/admin/login', category: 'admin',
        testPayload: { password: 'invalid-password' }
      }
    ];
    
    // Servers to manage
    this.servers = {
      real: null,
      mock: null
    };
    
    this.results = [];
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async startServer(type, port, command) {
    return new Promise((resolve, reject) => {
      this.log(`Starting ${type} server on port ${port}...`);
      
      const server = spawn('node', command.split(' '), {
        stdio: this.verbose ? 'inherit' : 'pipe',
        env: { ...process.env, PORT: port.toString() }
      });

      // Give server time to start
      setTimeout(() => {
        if (server.exitCode === null) {
          this.servers[type] = server;
          resolve(server);
        } else {
          reject(new Error(`${type} server failed to start`));
        }
      }, 3000);

      server.on('error', (error) => {
        this.log(`${type} server error: ${error.message}`, 'error');
        reject(error);
      });
    });
  }

  async stopServer(type) {
    if (this.servers[type]) {
      this.log(`Stopping ${type} server...`);
      this.servers[type].kill();
      this.servers[type] = null;
    }
  }

  async makeRequest(url, endpoint) {
    const requestUrl = `${url}${endpoint.path}`;
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MockDriftDetector/1.0'
      },
      timeout: this.timeout
    };

    if (endpoint.testPayload && (endpoint.method === 'POST' || endpoint.method === 'PUT')) {
      options.body = JSON.stringify(endpoint.testPayload);
    }

    try {
      const response = await fetch(requestUrl, options);
      const text = await response.text();
      
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { __raw_response: text };
      }

      return {
        success: true,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        responseTime: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: null,
        data: null,
        responseTime: Date.now()
      };
    }
  }

  compareStructure(obj1, obj2, path = '') {
    const differences = [];
    
    // Type comparison
    if (typeof obj1 !== typeof obj2) {
      differences.push({
        path,
        type: 'type_mismatch',
        mock: typeof obj1,
        real: typeof obj2,
        severity: 'high'
      });
      return differences;
    }

    // Handle primitives
    if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) {
      if (obj1 !== obj2) {
        differences.push({
          path,
          type: 'value_mismatch',
          mock: obj1,
          real: obj2,
          severity: 'medium'
        });
      }
      return differences;
    }

    // Handle arrays
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
      differences.push({
        path,
        type: 'array_type_mismatch',
        mock: Array.isArray(obj1),
        real: Array.isArray(obj2),
        severity: 'high'
      });
      return differences;
    }

    if (Array.isArray(obj1)) {
      // Compare array structures (first element if exists)
      if (obj1.length > 0 && obj2.length > 0) {
        differences.push(...this.compareStructure(obj1[0], obj2[0], `${path}[0]`));
      } else if (obj1.length !== obj2.length) {
        differences.push({
          path,
          type: 'array_length_mismatch',
          mock: obj1.length,
          real: obj2.length,
          severity: 'low'
        });
      }
      return differences;
    }

    // Compare object keys
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    const missingInReal = keys1.filter(key => !keys2.includes(key));
    const missingInMock = keys2.filter(key => !keys1.includes(key));
    
    missingInReal.forEach(key => {
      differences.push({
        path: `${path}.${key}`,
        type: 'missing_in_real',
        mock: obj1[key],
        real: undefined,
        severity: 'high'
      });
    });
    
    missingInMock.forEach(key => {
      differences.push({
        path: `${path}.${key}`,
        type: 'missing_in_mock',
        mock: undefined,
        real: obj2[key],
        severity: 'high'
      });
    });

    // Compare common keys
    const commonKeys = keys1.filter(key => keys2.includes(key));
    commonKeys.forEach(key => {
      const newPath = path ? `${path}.${key}` : key;
      differences.push(...this.compareStructure(obj1[key], obj2[key], newPath));
    });

    return differences;
  }

  async compareEndpoint(endpoint) {
    this.log(`Testing ${endpoint.method} ${endpoint.path}...`);
    
    const startTime = Date.now();
    
    // Get responses from both servers
    const [mockResponse, realResponse] = await Promise.all([
      this.makeRequest(this.mockURL, endpoint),
      this.makeRequest(this.baseURL, endpoint)
    ]);
    
    const responseTime = Date.now() - startTime;
    
    // Compare responses
    const comparison = {
      endpoint: `${endpoint.method} ${endpoint.path}`,
      category: endpoint.category,
      responseTime,
      mock: mockResponse,
      real: realResponse,
      differences: [],
      match: true,
      severity: 'none'
    };

    // Status code comparison
    if (mockResponse.status !== realResponse.status) {
      comparison.differences.push({
        path: 'status',
        type: 'status_mismatch',
        mock: mockResponse.status,
        real: realResponse.status,
        severity: 'high'
      });
    }

    // Data structure comparison
    if (mockResponse.success && realResponse.success && 
        mockResponse.data && realResponse.data) {
      const structuralDiffs = this.compareStructure(mockResponse.data, realResponse.data);
      comparison.differences.push(...structuralDiffs);
    }

    // Determine overall match and severity
    comparison.match = comparison.differences.length === 0;
    comparison.severity = this.calculateSeverity(comparison.differences);

    if (!comparison.match) {
      this.log(`Drift detected in ${endpoint.path}`, 'warn');
    }

    return comparison;
  }

  calculateSeverity(differences) {
    if (differences.length === 0) return 'none';
    
    const severityLevels = differences.map(diff => diff.severity);
    
    if (severityLevels.includes('high')) return 'high';
    if (severityLevels.includes('medium')) return 'medium';
    return 'low';
  }

  async detectDrift() {
    this.log('Starting Mock Drift Detection...', 'info');
    
    try {
      await this.ensureOutputDir();
      
      // Start both servers
      await this.startServer('mock', 3001, 'tests/ci-mock-server.js');
      await this.startServer('real', 3000, 'scripts/vercel-dev-wrapper.js');
      
      // Wait for servers to be fully ready
      this.log('Waiting for servers to be ready...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Test all endpoints
      this.log(`Testing ${this.endpoints.length} endpoints...`);
      const results = await Promise.all(
        this.endpoints.map(endpoint => this.compareEndpoint(endpoint))
      );
      
      this.results = results;
      
      // Generate report
      const report = this.generateReport(results);
      
      // Save report
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportPath = path.join(this.outputDir, `drift-report-${timestamp}.json`);
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      this.log(`Report saved to ${reportPath}`, 'success');
      
      // Generate summary
      this.printSummary(report);
      
      return report;
      
    } finally {
      // Clean up servers
      await this.stopServer('mock');
      await this.stopServer('real');
    }
  }

  generateReport(results) {
    const timestamp = new Date().toISOString();
    const summary = this.generateSummary(results);
    
    return {
      metadata: {
        timestamp,
        version: '1.0.0',
        detector: 'MockDriftDetector',
        endpoints_tested: results.length,
        total_differences: results.reduce((sum, r) => sum + r.differences.length, 0)
      },
      summary,
      results,
      recommendations: this.generateRecommendations(results)
    };
  }

  generateSummary(results) {
    const total = results.length;
    const matched = results.filter(r => r.match).length;
    const drifted = total - matched;
    
    const byCategory = results.reduce((acc, result) => {
      if (!acc[result.category]) {
        acc[result.category] = { total: 0, matched: 0, drifted: 0 };
      }
      acc[result.category].total++;
      if (result.match) {
        acc[result.category].matched++;
      } else {
        acc[result.category].drifted++;
      }
      return acc;
    }, {});
    
    const bySeverity = results.reduce((acc, result) => {
      acc[result.severity] = (acc[result.severity] || 0) + 1;
      return acc;
    }, {});
    
    return {
      overall: {
        total_endpoints: total,
        matched: matched,
        drifted: drifted,
        match_rate: ((matched / total) * 100).toFixed(1) + '%'
      },
      by_category: byCategory,
      by_severity: bySeverity,
      health_score: this.calculateHealthScore(results)
    };
  }

  calculateHealthScore(results) {
    if (results.length === 0) return 0;
    
    const weights = { none: 100, low: 80, medium: 50, high: 20 };
    const totalScore = results.reduce((sum, result) => {
      return sum + (weights[result.severity] || 0);
    }, 0);
    
    return Math.round(totalScore / results.length);
  }

  generateRecommendations(results) {
    const recommendations = [];
    
    const highSeverityIssues = results.filter(r => r.severity === 'high');
    if (highSeverityIssues.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'critical_drift',
        title: 'Critical Mock Drift Detected',
        description: `${highSeverityIssues.length} endpoints have high-severity drift that may cause test failures.`,
        action: 'Update mock responses to match real API responses immediately.',
        endpoints: highSeverityIssues.map(r => r.endpoint)
      });
    }
    
    const structuralIssues = results.filter(r => 
      r.differences.some(d => d.type.includes('missing') || d.type.includes('type_mismatch'))
    );
    if (structuralIssues.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'structural_changes',
        title: 'API Structure Changes Detected',
        description: 'Some endpoints have structural changes that need mock updates.',
        action: 'Review and update mock response structures.',
        endpoints: structuralIssues.map(r => r.endpoint)
      });
    }
    
    const slowEndpoints = results.filter(r => r.responseTime > 5000);
    if (slowEndpoints.length > 0) {
      recommendations.push({
        priority: 'low',
        category: 'performance',
        title: 'Slow Response Times',
        description: 'Some endpoints are responding slowly during testing.',
        action: 'Monitor endpoint performance and consider timeout adjustments.',
        endpoints: slowEndpoints.map(r => r.endpoint)
      });
    }
    
    return recommendations;
  }

  printSummary(report) {
    const { summary, recommendations } = report;
    
    console.log('\n' + '='.repeat(60));
    console.log('                  DRIFT DETECTION SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\n📊 Overall Results:`);
    console.log(`   Total Endpoints: ${summary.overall.total_endpoints}`);
    console.log(`   Matched: ${summary.overall.matched}`);
    console.log(`   Drifted: ${summary.overall.drifted}`);
    console.log(`   Match Rate: ${summary.overall.match_rate}`);
    console.log(`   Health Score: ${summary.health_score}/100`);
    
    console.log(`\n📈 By Category:`);
    Object.entries(summary.by_category).forEach(([category, stats]) => {
      console.log(`   ${category}: ${stats.matched}/${stats.total} matched`);
    });
    
    console.log(`\n⚡ By Severity:`);
    Object.entries(summary.by_severity).forEach(([severity, count]) => {
      const icon = severity === 'high' ? '🔴' : severity === 'medium' ? '🟡' : 
                   severity === 'low' ? '🟢' : '⚪';
      console.log(`   ${icon} ${severity}: ${count}`);
    });
    
    if (recommendations.length > 0) {
      console.log(`\n🔧 Recommendations:`);
      recommendations.forEach((rec, i) => {
        const icon = rec.priority === 'high' ? '🚨' : 
                     rec.priority === 'medium' ? '⚠️' : 'ℹ️';
        console.log(`   ${i + 1}. ${icon} ${rec.title}`);
        console.log(`      ${rec.description}`);
        console.log(`      Action: ${rec.action}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Exit code based on results
    if (summary.overall.drifted > 0) {
      const highSeverity = summary.by_severity.high || 0;
      if (highSeverity > 0) {
        this.log(`Detected ${highSeverity} high-severity drift issues`, 'error');
        process.exitCode = 2; // Critical drift
      } else {
        this.log(`Detected ${summary.overall.drifted} drift issues`, 'warn');
        process.exitCode = 1; // Minor drift
      }
    } else {
      this.log('No drift detected - all mocks are in sync!', 'success');
      process.exitCode = 0; // Success
    }
  }
}

// CLI Support
async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    baseURL: process.env.REAL_API_URL || 'http://localhost:3000',
    mockURL: process.env.MOCK_API_URL || 'http://localhost:3001',
    outputDir: process.env.DRIFT_REPORTS_DIR || '.tmp/drift-reports'
  };
  
  // Handle help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Mock Drift Detector - Ensures mock responses stay in sync with real API responses

Usage:
  node scripts/mock-drift-detector.js [options]

Options:
  --verbose, -v           Enable verbose logging
  --help, -h             Show this help message

Environment Variables:
  REAL_API_URL           Base URL for real API (default: http://localhost:3000)
  MOCK_API_URL           Base URL for mock API (default: http://localhost:3001)  
  DRIFT_REPORTS_DIR      Output directory for reports (default: .tmp/drift-reports)

Examples:
  npm run drift:detect                    # Basic drift detection
  VERBOSE=true npm run drift:detect       # With verbose logging
  npm run drift:detect:weekly            # Weekly CI check
`);
    process.exit(0);
  }
  
  const detector = new MockDriftDetector(options);
  
  try {
    await detector.detectDrift();
  } catch (error) {
    console.error('❌ Drift detection failed:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(3); // System error
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MockDriftDetector };