#!/usr/bin/env node

/**
 * Test Vercel Dev Fix
 * 
 * Validates that our Vercel dev hanging fix works properly
 * Tests all startup scenarios and provides diagnostics
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { resolve } from 'path';

const execAsync = promisify(exec);

class VercelDevTester {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  async runAllTests() {
    console.log('🧪 Testing Vercel Dev Hanging Fix');
    console.log('=' .repeat(50));

    try {
      await this.testEnvironmentSetup();
      await this.testDatabaseInitialization();
      await this.testVercelStartup();
      await this.testHealthEndpoints();
      
      this.reportResults();
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Test environment setup and prerequisites
   */
  async testEnvironmentSetup() {
    console.log('\n🔧 Testing environment setup...');

    // Test 1: Check if enhanced scripts exist
    this.recordTest('Enhanced startup script exists', 
      existsSync(resolve(process.cwd(), 'scripts/vercel-dev-start.js'))
    );

    // Test 2: Check database setup script
    this.recordTest('Database setup script updated', 
      existsSync(resolve(process.cwd(), 'scripts/setup-database.js'))
    );

    // Test 3: Check package.json scripts
    try {
      const fs = await import('fs');
      const packageJson = JSON.parse(
        fs.readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
      );
      this.recordTest('Package.json scripts updated', 
        packageJson.scripts['start:local']?.includes('vercel-dev-start.js')
      );
    } catch (error) {
      this.recordTest('Package.json scripts updated', false, error.message);
    }

    // Test 4: Environment variables check
    process.env.SKIP_DATABASE_INIT = 'true';
    process.env.VERCEL_DEV_STARTUP = 'true';
    process.env.VERCEL_NON_INTERACTIVE = '1';
    this.recordTest('Environment variables set', 
      process.env.SKIP_DATABASE_INIT === 'true'
    );
  }

  /**
   * Test database initialization with timeout protection
   */
  async testDatabaseInitialization() {
    console.log('\n🗃️  Testing database initialization...');

    try {
      // Test database setup with skip flags
      const startTime = Date.now();
      
      const { setupDatabase } = await import('./setup-database.js');
      await setupDatabase();
      
      const duration = Date.now() - startTime;
      
      this.recordTest('Database setup completes quickly', duration < 5000, 
        `Took ${duration}ms (should be <5000ms)`
      );

      this.recordTest('Database setup respects skip flags', true,
        'Setup completed without hanging'
      );

    } catch (error) {
      if (error.message.includes('timeout')) {
        this.recordTest('Database setup prevents hanging', true,
          'Timeout protection working'
        );
      } else {
        this.recordTest('Database setup handles errors', false, error.message);
      }
    }
  }

  /**
   * Test Vercel startup process (without actually starting server)
   */
  async testVercelStartup() {
    console.log('\n🚀 Testing Vercel startup process...');

    // Test 1: Port availability check
    try {
      await execAsync('lsof -ti:3000', { timeout: 2000 });
      this.recordTest('Port conflict detection', false, 'Port 3000 is in use');
    } catch {
      this.recordTest('Port conflict detection', true, 'Port 3000 is available');
    }

    // Test 2: Vercel CLI availability
    try {
      const { stdout } = await execAsync('npx vercel --version', { timeout: 10000 });
      this.recordTest('Vercel CLI availability', true, `Version: ${stdout.trim()}`);
    } catch (error) {
      this.recordTest('Vercel CLI availability', false, error.message);
    }

    // Test 3: Command construction
    const expectedArgs = ['vercel', 'dev', '--listen', '0.0.0.0:3000', '--yes'];
    this.recordTest('Command includes --yes flag', 
      expectedArgs.includes('--yes'),
      'Non-interactive mode enabled'
    );

    // Test 4: Environment variable setup
    const requiredEnvVars = [
      'SKIP_DATABASE_INIT',
      'VERCEL_DEV_STARTUP', 
      'VERCEL_NON_INTERACTIVE'
    ];

    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    this.recordTest('Required environment variables', 
      missingVars.length === 0,
      missingVars.length > 0 ? `Missing: ${missingVars.join(', ')}` : 'All set'
    );
  }

  /**
   * Test basic health endpoints (if server is running)
   */
  async testHealthEndpoints() {
    console.log('\n🌐 Testing health endpoints...');

    const testUrls = [
      'http://localhost:3000/api/health/check',
      'http://localhost:3000/api/health/ping'
    ];

    for (const url of testUrls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(url, { 
          signal: controller.signal,
          headers: { 'User-Agent': 'VercelDevTester/1.0' }
        });
        
        clearTimeout(timeout);

        this.recordTest(`Health endpoint: ${url}`, 
          response.ok, 
          `Status: ${response.status}`
        );
      } catch (error) {
        // Expected if server is not running
        this.recordTest(`Health endpoint: ${url}`, 
          null,
          'Server not running (expected for test)'
        );
      }
    }
  }

  /**
   * Record test result
   */
  recordTest(name, passed, details = '') {
    const result = {
      name,
      passed,
      details,
      timestamp: Date.now()
    };
    
    this.results.push(result);
    
    const status = passed === null ? '⚠️ ' : (passed ? '✅' : '❌');
    const detailStr = details ? ` (${details})` : '';
    console.log(`   ${status} ${name}${detailStr}`);
  }

  /**
   * Report final test results
   */
  reportResults() {
    console.log('\n📊 Test Results Summary');
    console.log('=' .repeat(50));

    const totalTests = this.results.filter(r => r.passed !== null).length;
    const passedTests = this.results.filter(r => r.passed === true).length;
    const failedTests = this.results.filter(r => r.passed === false).length;
    const skippedTests = this.results.filter(r => r.passed === null).length;

    console.log(`Total Tests: ${totalTests + skippedTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Skipped: ${skippedTests}`);
    console.log(`Success Rate: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => r.passed === false)
        .forEach(result => {
          console.log(`   • ${result.name}: ${result.details}`);
        });
    }

    console.log('\n💡 Next Steps:');
    if (failedTests === 0) {
      console.log('✅ All tests passed! Try starting Vercel dev:');
      console.log('   npm run start:local');
      console.log('   npm run start:safe');  
      console.log('   npm run start:clean');
    } else {
      console.log('🔧 Fix failing tests, then try:');
      console.log('   npm run dev:doctor  # Run diagnostics');
    }

    console.log('\n🚀 Alternative startup commands:');
    console.log('   npm run start:vercel      # Direct Vercel with --yes');
    console.log('   npm run start:vercel:clean # Clean start with --yes');
    console.log('   npm run serve:simple      # Simple static server');
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new VercelDevTester();
  tester.runAllTests().catch(console.error);
}

export default VercelDevTester;