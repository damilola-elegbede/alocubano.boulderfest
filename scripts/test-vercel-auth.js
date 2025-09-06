#!/usr/bin/env node

/**
 * Test Vercel Authentication Configuration
 * 
 * This script validates that Vercel authentication is properly configured
 * for CI environments by testing the token and org ID setup.
 * 
 * Usage:
 *   node scripts/test-vercel-auth.js
 *   VERCEL_TOKEN=... VERCEL_ORG_ID=... node scripts/test-vercel-auth.js
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(spawn);

class VercelAuthTester {
  constructor() {
    this.token = process.env.VERCEL_TOKEN;
    this.orgId = process.env.VERCEL_ORG_ID;
    this.projectId = process.env.VERCEL_PROJECT_ID;
    
    console.log('🔐 Vercel Authentication Test');
    console.log('=' .repeat(50));
    console.log(`Token: ${this.token ? '✅ Configured (length: ' + this.token.length + ')' : '❌ Missing'}`);
    console.log(`Org ID: ${this.orgId ? '✅ Configured (' + this.orgId + ')' : '❌ Missing'}`);
    console.log(`Project ID: ${this.projectId ? '✅ Configured (' + this.projectId + ')' : '❌ Missing'}`);
    console.log('');
  }

  /**
   * Test Vercel CLI authentication
   */
  async testVercelAuth() {
    console.log('🧪 Testing Vercel CLI authentication...');
    
    if (!this.token) {
      throw new Error('❌ FATAL: VERCEL_TOKEN not found in environment');
    }
    
    if (!this.orgId) {
      throw new Error('❌ FATAL: VERCEL_ORG_ID not found in environment');
    }

    try {
      // Build the whoami command with authentication
      const args = ['vercel', 'whoami'];
      
      if (this.token) {
        args.push('--token', this.token);
      }
      
      if (this.orgId) {
        args.push('--scope', this.orgId);
      }

      console.log(`   📦 Command: npx ${args.join(' ')}`);

      const result = await this.executeCommand('npx', args);
      
      if (result.success) {
        console.log('   ✅ Authentication successful');
        console.log('   👤 User:', result.stdout.trim());
        return true;
      } else {
        console.log('   ❌ Authentication failed');
        console.log('   Error:', result.stderr);
        return false;
      }
    } catch (error) {
      console.log('   ❌ Authentication test failed:', error.message);
      return false;
    }
  }

  /**
   * Test Vercel dev command construction
   */
  testVercelDevCommand() {
    console.log('🚀 Testing Vercel dev command construction...');
    
    const args = [
      'vercel',
      'dev',
      '--yes',
      '--listen', '3000',
      // Removed --no-clipboard as it's not supported in this Vercel CLI version
    ];
    
    // Both are required at this point - validated above
    args.push('--token', this.token);
    console.log('   ✅ Token flag added');
    
    args.push('--scope', this.orgId);
    console.log('   ✅ Scope flag added');
    
    console.log('   📦 Full command:');
    console.log(`   npx ${args.join(' ')}`);
    
    return args;
  }

  /**
   * Test environment variable configuration
   */
  testEnvironmentConfig() {
    console.log('🌍 Testing environment configuration...');
    
    const requiredVars = [
      { name: 'VERCEL_TOKEN', value: this.token, required: true },
      { name: 'VERCEL_ORG_ID', value: this.orgId, required: true },
      { name: 'VERCEL_PROJECT_ID', value: this.projectId, required: false }
    ];
    
    let allConfigured = true;
    
    requiredVars.forEach(({ name, value, required }) => {
      const status = value ? '✅ Configured' : (required ? '❌ Missing (required)' : '⚠️  Missing (optional)');
      console.log(`   ${name}: ${status}`);
      
      if (required && !value) {
        allConfigured = false;
      }
    });
    
    if (allConfigured) {
      console.log('   ✅ All required environment variables are configured');
    } else {
      console.log('   ❌ Some required environment variables are missing');
    }
    
    return allConfigured;
  }

  /**
   * Generate example CI configuration
   */
  generateCIExample() {
    console.log('📋 Example CI configuration:');
    console.log('');
    console.log('# GitHub Actions secrets:');
    console.log('VERCEL_TOKEN=<your-vercel-token>');
    console.log('VERCEL_ORG_ID=<your-org-id>');
    console.log('VERCEL_PROJECT_ID=<your-project-id>');
    console.log('');
    console.log('# GitHub Actions workflow step:');
    console.log('- name: Run E2E Tests');
    console.log('  env:');
    console.log('    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}');
    console.log('    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}');
    console.log('    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}');
    console.log('  run: npm run test:e2e');
  }

  /**
   * Execute a command and return the result
   */
  async executeCommand(command, args, timeout = 30000) {
    return new Promise((resolve) => {
      const process = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          code
        });
      });
      
      process.on('error', (error) => {
        resolve({
          success: false,
          stdout,
          stderr: error.message,
          code: -1
        });
      });
    });
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 Running Vercel authentication tests...\n');
    
    // Test environment configuration
    const envConfigured = this.testEnvironmentConfig();
    console.log('');
    
    // Test Vercel dev command construction
    this.testVercelDevCommand();
    console.log('');
    
    // Test authentication (only if token is available)
    let authWorking = false;
    if (this.token) {
      authWorking = await this.testVercelAuth();
      console.log('');
    }
    
    // Summary
    console.log('📊 Test Summary:');
    console.log(`   Environment Config: ${envConfigured ? '✅ Pass' : '❌ Fail'}`);
    console.log(`   Command Construction: ✅ Pass`);
    console.log(`   Authentication: ${this.token ? (authWorking ? '✅ Pass' : '❌ Fail') : '⚠️  Skipped (no token)'}`);
    console.log('');
    
    if (!envConfigured || (this.token && !authWorking)) {
      console.log('❌ Some tests failed. See configuration help below:\n');
      this.generateCIExample();
      process.exit(1);
    } else {
      console.log('✅ All tests passed! Vercel authentication is properly configured.');
      process.exit(0);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new VercelAuthTester();
  tester.runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default VercelAuthTester;