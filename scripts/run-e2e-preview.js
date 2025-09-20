#!/usr/bin/env node

/**
 * E2E Preview Test Runner
 *
 * Comprehensive script that orchestrates E2E testing against Vercel preview deployments:
 * 1. Extracts preview URL from multiple sources
 * 2. Validates preview environment readiness
 * 3. Runs E2E tests with appropriate configuration
 * 4. Generates comprehensive test reports
 * 5. Handles cleanup and error reporting
 *
 * Usage:
 *   node scripts/run-e2e-preview.js [options]
 *
 * Options:
 *   --preview-url <url>    Direct preview URL override
 *   --browser <browser>    Specific browser to test (chromium, firefox, webkit)
 *   --test-pattern <pat>   Test pattern filter (e.g., "gallery", "admin")
 *   --suite <suite>        Test suite (standard, performance, accessibility, security)
 *   --headed              Run tests in headed mode
 *   --debug               Run tests in debug mode
 *   --validate-only       Only validate environment, don't run tests
 */

import { spawn } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import VercelPreviewURLExtractor from './get-vercel-preview-url.js';
import PreviewEnvironmentValidator from './validate-preview-environment.js';

class E2EPreviewTestRunner {
  constructor() {
    this.previewUrl = null;
    this.options = this.parseArguments();
    this.testResults = {
      success: false,
      error: null,
      duration: 0,
      testCount: 0,
      passCount: 0,
      failCount: 0
    };

    console.log('🎭 E2E Preview Test Runner');
    console.log('='.repeat(50));
    console.log(`   Mode: ${this.options.mode}`);
    console.log(`   Browser: ${this.options.browser || 'all'}`);
    console.log(`   Suite: ${this.options.suite}`);
    console.log(`   Pattern: ${this.options.testPattern || 'all tests'}`);
    console.log(`   Validate Only: ${this.options.validateOnly}`);
  }

  /**
   * Parse command line arguments
   */
  parseArguments() {
    const args = process.argv.slice(2);
    const options = {
      previewUrl: null,
      browser: null,
      testPattern: null,
      suite: 'standard',
      headed: false,
      debug: false,
      validateOnly: false,
      mode: 'normal'
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const nextArg = args[i + 1];

      switch (arg) {
        case '--preview-url':
          options.previewUrl = nextArg;
          i++;
          break;
        case '--browser':
          options.browser = nextArg;
          i++;
          break;
        case '--test-pattern':
          options.testPattern = nextArg;
          i++;
          break;
        case '--suite':
          options.suite = nextArg;
          i++;
          break;
        case '--headed':
          options.headed = true;
          options.mode = 'headed';
          break;
        case '--debug':
          options.debug = true;
          options.mode = 'debug';
          break;
        case '--validate-only':
          options.validateOnly = true;
          break;
        case '--help':
          this.showHelp();
          process.exit(0);
          break;
      }
    }

    return options;
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(`
🎭 E2E Preview Test Runner

Usage: node scripts/run-e2e-preview.js [options]

Options:
  --preview-url <url>    Direct preview URL override
  --browser <browser>    Specific browser (chromium, firefox, webkit, mobile-chrome, mobile-safari)
  --test-pattern <pat>   Test pattern filter (e.g., "gallery", "admin", "auth")
  --suite <suite>        Test suite:
                         - standard: Core flows (default)
                         - performance: Performance testing
                         - accessibility: WCAG compliance
                         - security: Security testing
  --headed              Run tests in headed mode (visible browser)
  --debug               Run tests in debug mode (interactive debugging)
  --validate-only       Only validate environment, don't run tests
  --help                Show this help

Examples:
  # Run standard tests against auto-detected preview URL
  node scripts/run-e2e-preview.js

  # Run with specific preview URL
  node scripts/run-e2e-preview.js --preview-url https://my-app-abc123.vercel.app

  # Run performance tests in Chromium only
  node scripts/run-e2e-preview.js --suite performance --browser chromium

  # Debug specific test pattern
  node scripts/run-e2e-preview.js --test-pattern "admin-auth" --debug

  # Validate environment only
  node scripts/run-e2e-preview.js --validate-only

Environment Variables:
  PREVIEW_URL           Direct preview URL
  GITHUB_TOKEN          GitHub API token for PR comment extraction
  VERCEL_TOKEN          Vercel API token for deployment queries
  TEST_ADMIN_PASSWORD   Password for admin panel testing
    `);
  }

  /**
   * Main execution method
   */
  async run() {
    const startTime = Date.now();

    try {
      console.log('\n🚀 Starting E2E Preview Testing Pipeline');
      console.log('='.repeat(60));

      // Step 1: Extract or validate preview URL
      await this.setupPreviewURL();

      // Step 2: Validate preview environment
      await this.validatePreviewEnvironment();

      if (this.options.validateOnly) {
        console.log('\n✅ Environment validation completed - skipping tests');
        return;
      }

      // Step 3: Setup test environment
      await this.setupTestEnvironment();

      // Step 4: Run E2E tests
      await this.runE2ETests();

      // Step 5: Process results
      await this.processTestResults();

      this.testResults.success = true;
      this.testResults.duration = Date.now() - startTime;

      console.log('\n🎉 E2E Preview Testing Completed Successfully');
      this.generateFinalReport();

    } catch (error) {
      this.testResults.error = error.message;
      this.testResults.duration = Date.now() - startTime;

      console.error('\n❌ E2E Preview Testing Failed');
      console.error(`Error: ${error.message}`);

      this.generateErrorReport();
      process.exit(1);
    }
  }

  /**
   * Setup preview URL from various sources
   */
  async setupPreviewURL() {
    console.log('\n🔗 Setting up Preview URL...');

    // Use override if provided
    if (this.options.previewUrl) {
      this.previewUrl = this.options.previewUrl;
      console.log(`   🎯 Using command line URL: ${this.previewUrl}`);
      return;
    }

    // Use environment variable if available
    if (process.env.PREVIEW_URL) {
      this.previewUrl = process.env.PREVIEW_URL;
      console.log(`   🌍 Using environment URL: ${this.previewUrl}`);
      return;
    }

    // Extract from GitHub/Vercel
    console.log('   🤖 Extracting preview URL from GitHub/Vercel...');
    const extractor = new VercelPreviewURLExtractor();

    try {
      this.previewUrl = await extractor.getPreviewURL();
      console.log(`   ✅ Extracted preview URL: ${this.previewUrl}`);
    } catch (error) {
      throw new Error(`Failed to extract preview URL: ${error.message}`);
    }

    // Set environment variable for other processes
    process.env.PREVIEW_URL = this.previewUrl;
    process.env.PLAYWRIGHT_BASE_URL = this.previewUrl;
  }

  /**
   * Validate preview environment readiness
   */
  async validatePreviewEnvironment() {
    console.log('\n🔍 Validating Preview Environment...');

    try {
      const validator = new PreviewEnvironmentValidator();
      await validator.validate();
      console.log('   ✅ Preview environment validation passed');
    } catch (error) {
      throw new Error(`Preview environment validation failed: ${error.message}`);
    }
  }

  /**
   * Setup test environment configuration
   */
  async setupTestEnvironment() {
    console.log('\n📁 Setting up Test Environment...');

    // Create test directories
    const dirs = ['test-results', 'playwright-report-preview', '.tmp'];
    dirs.forEach(dir => {
      const dirPath = resolve(process.cwd(), dir);
      if (!existsSync(dirPath)) {
        require('fs').mkdirSync(dirPath, { recursive: true });
      }
    });

    // Create environment configuration
    const envConfig = `# E2E Preview Test Configuration
# Generated: ${new Date().toISOString()}

PREVIEW_URL=${this.previewUrl}
PLAYWRIGHT_BASE_URL=${this.previewUrl}
E2E_PREVIEW_MODE=true
E2E_TEST_MODE=true
NODE_ENV=test

# Test suite configuration
TEST_SUITE=${this.options.suite}
PERFORMANCE_TESTING=${this.options.suite === 'performance'}
ACCESSIBILITY_TESTING=${this.options.suite === 'accessibility'}
SECURITY_TESTING=${this.options.suite === 'security'}

# Browser configuration
${this.options.browser ? `PLAYWRIGHT_BROWSER=${this.options.browser}` : ''}

# Test execution mode
${this.options.headed ? 'E2E_HEADED_MODE=true' : ''}
${this.options.debug ? 'E2E_DEBUG_MODE=true' : ''}

# Credentials
TEST_ADMIN_PASSWORD=${process.env.TEST_ADMIN_PASSWORD || 'test-password'}
`;

    const envPath = resolve(process.cwd(), '.env.preview');
    writeFileSync(envPath, envConfig);

    console.log(`   ✅ Environment configured: ${envPath}`);
    console.log(`   🎯 Preview URL: ${this.previewUrl}`);
    console.log(`   🧪 Test Suite: ${this.options.suite}`);
    console.log(`   🌐 Browser: ${this.options.browser || 'all'}`);
  }

  /**
   * Run E2E tests with appropriate configuration
   */
  async runE2ETests() {
    console.log('\n🧪 Running E2E Tests...');

    return new Promise((resolve, reject) => {
      // Build Playwright command
      const cmd = 'npx';
      const args = ['playwright', 'test', '--config=playwright-e2e-preview.config.js'];

      // Add browser project if specified
      if (this.options.browser) {
        args.push(`--project=${this.options.browser}`);
      }

      // Add test pattern if specified
      if (this.options.testPattern) {
        args.push(`tests/e2e/flows/*${this.options.testPattern}*`);
      } else {
        // Add suite-specific grep patterns
        switch (this.options.suite) {
          case 'performance':
            args.push('--grep=performance|load|gallery-browsing|user-engagement');
            break;
          case 'accessibility':
            args.push('--grep=accessibility|mobile-registration-experience');
            break;
          case 'security':
            args.push('--grep=security|admin-auth|admin-dashboard');
            break;
          case 'standard':
            args.push('--grep=basic-navigation|cart-functionality|registration-flow|admin-auth|gallery-basic|newsletter-simple');
            break;
        }
      }

      // Add execution mode flags
      if (this.options.headed) {
        args.push('--headed');
      }
      if (this.options.debug) {
        args.push('--debug');
      }

      // Add reporters and timeout
      args.push('--reporter=list,html', '--timeout=120000', '--retries=2');

      console.log(`   📋 Command: ${cmd} ${args.join(' ')}`);

      // Spawn Playwright process
      const testProcess = spawn(cmd, args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          PREVIEW_URL: this.previewUrl,
          PLAYWRIGHT_BASE_URL: this.previewUrl,
          NODE_OPTIONS: '--max-old-space-size=4096'
        }
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log('   ✅ E2E tests completed successfully');
          resolve();
        } else {
          reject(new Error(`E2E tests failed with exit code ${code}`));
        }
      });

      testProcess.on('error', (error) => {
        reject(new Error(`Failed to start E2E tests: ${error.message}`));
      });
    });
  }

  /**
   * Process test results and generate metrics
   */
  async processTestResults() {
    console.log('\n📊 Processing Test Results...');

    // Check for results in playwright report
    const reportPath = resolve(process.cwd(), 'playwright-report-preview');

    if (existsSync(reportPath)) {
      console.log(`   ✅ Test report generated: ${reportPath}`);

      // Try to extract basic metrics from report
      try {
        const fs = require('fs');
        const reportFiles = fs.readdirSync(reportPath);
        console.log(`   📁 Report files: ${reportFiles.length}`);
      } catch (error) {
        console.log(`   ⚠️ Could not analyze report: ${error.message}`);
      }
    }

    // Check test-results directory
    const resultsPath = resolve(process.cwd(), 'test-results');
    if (existsSync(resultsPath)) {
      try {
        const fs = require('fs');
        const resultFiles = fs.readdirSync(resultsPath);
        const screenshots = resultFiles.filter(f => f.endsWith('.png')).length;
        const videos = resultFiles.filter(f => f.endsWith('.webm')).length;

        console.log(`   📸 Screenshots: ${screenshots}`);
        console.log(`   🎥 Videos: ${videos}`);
      } catch (error) {
        console.log(`   ⚠️ Could not analyze results: ${error.message}`);
      }
    }
  }

  /**
   * Generate final success report
   */
  generateFinalReport() {
    console.log('\n📋 Final Test Report');
    console.log('='.repeat(60));
    console.log(`🎯 Preview URL: ${this.previewUrl}`);
    console.log(`⏱️ Duration: ${Math.round(this.testResults.duration / 1000)}s`);
    console.log(`🧪 Test Suite: ${this.options.suite}`);
    console.log(`🌐 Browser: ${this.options.browser || 'all'}`);
    console.log(`📊 Pattern: ${this.options.testPattern || 'all tests'}`);
    console.log(`✅ Status: SUCCESS`);

    console.log('\n🌟 Benefits of Preview Testing:');
    console.log('   • Production-like environment validation');
    console.log('   • No local server conflicts or resource issues');
    console.log('   • Automatic deployment cleanup');
    console.log('   • True CI/CD integration testing');

    console.log('\n📁 Artifacts:');
    console.log('   • HTML Report: playwright-report-preview/');
    console.log('   • Test Results: test-results/');
    console.log('   • Environment: .env.preview');
  }

  /**
   * Generate error report for debugging
   */
  generateErrorReport() {
    console.error('\n🚨 E2E Preview Testing Failed');
    console.error('='.repeat(60));
    console.error(`🎯 Preview URL: ${this.previewUrl || 'Not determined'}`);
    console.error(`⏱️ Duration: ${Math.round(this.testResults.duration / 1000)}s`);
    console.error(`❌ Error: ${this.testResults.error}`);

    console.error('\n🔧 Debugging Steps:');
    console.error('1. Verify preview URL is accessible in browser');
    console.error('2. Check environment variables are set correctly');
    console.error('3. Run validation only: --validate-only');
    console.error('4. Check Vercel deployment logs');
    console.error('5. Try with specific browser: --browser chromium');

    if (this.previewUrl) {
      console.error(`\n🌐 Manual validation commands:`);
      console.error(`   curl ${this.previewUrl}/api/health/check`);
      console.error(`   PREVIEW_URL=${this.previewUrl} node scripts/validate-preview-environment.js`);
    }
  }
}

// Main execution when called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new E2EPreviewTestRunner();
  runner.run().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

export default E2EPreviewTestRunner;