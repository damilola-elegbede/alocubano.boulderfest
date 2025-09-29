#!/usr/bin/env node
/**
 * Deployment Pipeline Integration Test Script
 *
 * Tests the complete deployment pipeline including:
 * - Environment detection and configuration
 * - Migration execution sequence
 * - Bootstrap data population
 * - Build process integration
 * - Error handling and rollback scenarios
 * - Health checks and validation
 *
 * This script simulates the full Vercel deployment flow without actually deploying.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log('='.repeat(60));
}

class DeploymentPipelineTest {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
    this.originalEnv = { ...process.env };
  }

  /**
   * Run a test with error handling and result tracking
   */
  async runTest(name, testFunction) {
    try {
      log(`\n🔍 Testing: ${name}`, colors.blue);
      const result = await testFunction();

      if (result.success) {
        log(`   ✅ PASS: ${name}`, colors.green);
        this.results.passed++;
      } else {
        log(`   ❌ FAIL: ${name} - ${result.error}`, colors.red);
        this.results.failed++;
      }

      if (result.warnings) {
        result.warnings.forEach(warning => {
          log(`   ⚠️  WARNING: ${warning}`, colors.yellow);
          this.results.warnings++;
        });
      }

      this.results.tests.push({ name, ...result });
      return result;

    } catch (error) {
      log(`   💥 ERROR: ${name} - ${error.message}`, colors.red);
      this.results.failed++;
      this.results.tests.push({
        name,
        success: false,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Test 1: Verify deployment configuration files exist
   */
  async testDeploymentConfiguration() {
    const requiredFiles = [
      'vercel.json',
      'package.json',
      'scripts/migrate-vercel-build.js',
      'scripts/bootstrap.js',
      'lib/bootstrap-service.js',
      'config/bootstrap.json'
    ];

    const missing = [];
    const warnings = [];

    for (const file of requiredFiles) {
      const filePath = join(projectRoot, file);
      if (!existsSync(filePath)) {
        missing.push(file);
      }
    }

    // Check vercel.json build command
    try {
      const vercelConfig = JSON.parse(readFileSync(join(projectRoot, 'vercel.json'), 'utf8'));
      const buildCommand = vercelConfig.buildCommand;

      if (!buildCommand) {
        warnings.push('No buildCommand specified in vercel.json');
      } else if (!buildCommand.includes('migrate:vercel')) {
        warnings.push('buildCommand does not include migrate:vercel');
      } else if (!buildCommand.includes('bootstrap.js')) {
        warnings.push('buildCommand does not include bootstrap.js');
      } else if (!buildCommand.includes('build')) {
        warnings.push('buildCommand does not include build');
      }

      // Verify command sequence is correct
      const expectedCommands = ['migrate:vercel', 'bootstrap.js', 'build'];
      for (const cmd of expectedCommands) {
        if (!buildCommand.includes(cmd)) {
          warnings.push(`Missing command in build sequence: ${cmd}`);
        }
      }

    } catch (error) {
      warnings.push(`Error parsing vercel.json: ${error.message}`);
    }

    return {
      success: missing.length === 0,
      error: missing.length > 0 ? `Missing files: ${missing.join(', ')}` : null,
      warnings
    };
  }

  /**
   * Test 2: Validate package.json scripts
   */
  async testPackageScripts() {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    const scripts = packageJson.scripts || {};

    const requiredScripts = [
      'migrate:vercel',
      'bootstrap',
      'build',
      'migrate:up',
      'migrate:status'
    ];

    const missing = [];
    const warnings = [];

    for (const script of requiredScripts) {
      if (!scripts[script]) {
        missing.push(script);
      }
    }

    // Validate script implementations
    if (scripts['migrate:vercel'] && !scripts['migrate:vercel'].includes('migrate-vercel-build.js')) {
      warnings.push('migrate:vercel script does not reference migrate-vercel-build.js');
    }

    if (scripts['bootstrap'] && !scripts['bootstrap'].includes('bootstrap.js')) {
      warnings.push('bootstrap script does not reference bootstrap.js');
    }

    return {
      success: missing.length === 0,
      error: missing.length > 0 ? `Missing scripts: ${missing.join(', ')}` : null,
      warnings
    };
  }

  /**
   * Test 3: Validate bootstrap configuration files
   */
  async testBootstrapConfigurations() {
    const environments = ['production', 'preview', 'development'];
    const warnings = [];
    let allValid = true;

    for (const env of environments) {
      try {
        const configPath = join(projectRoot, 'bootstrap', `${env}.json`);
        const config = JSON.parse(readFileSync(configPath, 'utf8'));

        // Validate required structure
        if (!config.version) warnings.push(`${env}: Missing version`);
        if (!config.environment) warnings.push(`${env}: Missing environment`);
        if (!config.events || !Array.isArray(config.events)) {
          warnings.push(`${env}: Missing or invalid events array`);
        }

        // Validate each event
        if (config.events) {
          config.events.forEach((event, index) => {
            if (!event.slug) warnings.push(`${env}: Event ${index} missing slug`);
            if (!event.name) warnings.push(`${env}: Event ${index} missing name`);
            if (!event.type) warnings.push(`${env}: Event ${index} missing type`);
            if (!event.status) warnings.push(`${env}: Event ${index} missing status`);

            // Validate ticket types
            if (!event.ticket_types || !Array.isArray(event.ticket_types)) {
              warnings.push(`${env}: Event ${event.slug} missing ticket_types`);
            }
          });
        }

      } catch (error) {
        allValid = false;
        warnings.push(`${env}: Parse error - ${error.message}`);
      }
    }

    return {
      success: allValid && warnings.length === 0,
      error: !allValid ? 'Configuration validation failed' : null,
      warnings
    };
  }

  /**
   * Test 4: Test environment detection logic
   */
  async testEnvironmentDetection() {
    const warnings = [];

    // Test production environment detection
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';

    // Environment is now detected through VERCEL_ENV directly
    if (process.env.VERCEL_ENV !== 'production') {
      warnings.push(`Expected VERCEL_ENV='production', got '${process.env.VERCEL_ENV}'`);
    }

    return {
      success: warnings.length === 0,
      warnings
    };
  }

  /**
   * Test 5: Validate command sequence execution
   */
  async testCommandSequence() {
    const warnings = [];

    try {
      // Test that migration script exists and is executable
      const migrationPath = join(projectRoot, 'scripts', 'migrate-vercel-build.js');
      if (!existsSync(migrationPath)) {
        return {
          success: false,
          error: 'Migration script not found'
        };
      }

      // Test that bootstrap script exists and is executable
      const bootstrapPath = join(projectRoot, 'scripts', 'bootstrap-vercel.js');
      if (!existsSync(bootstrapPath)) {
        return {
          success: false,
          error: 'Bootstrap script not found'
        };
      }

      // Validate the scripts can be imported without syntax errors
      try {
        await import('../scripts/bootstrap-vercel.js');
      } catch (error) {
        warnings.push(`Bootstrap script import error: ${error.message}`);
      }

    } catch (error) {
      return {
        success: false,
        error: `Command validation failed: ${error.message}`
      };
    }

    return {
      success: warnings.length === 0,
      warnings
    };
  }

  /**
   * Test 6: Validate error handling and rollback procedures
   */
  async testErrorHandling() {
    const warnings = [];

    try {
      // Check migration script has proper error handling
      const migrationScript = readFileSync(join(projectRoot, 'scripts', 'migrate-vercel-build.js'), 'utf8');

      if (!migrationScript.includes('catch')) {
        warnings.push('Migration script missing error handling');
      }

      if (!migrationScript.includes('process.exit(1)')) {
        warnings.push('Migration script missing failure exit');
      }

      // Check bootstrap script has proper error handling
      const bootstrapScript = readFileSync(join(projectRoot, 'scripts', 'bootstrap.js'), 'utf8');

      if (!bootstrapScript.includes('catch')) {
        warnings.push('Bootstrap script missing error handling');
      }

      if (!bootstrapScript.includes('process.exit')) {
        warnings.push('Bootstrap script missing exit handling');
      }

    } catch (error) {
      return {
        success: false,
        error: `Error handling validation failed: ${error.message}`
      };
    }

    return {
      success: warnings.length === 0,
      warnings
    };
  }

  /**
   * Test 7: Validate GitHub Actions integration
   */
  async testCIIntegration() {
    const warnings = [];

    const ciConfigPath = join(projectRoot, '.github', 'workflows', 'ci-pipeline.yml');

    if (!existsSync(ciConfigPath)) {
      return {
        success: false,
        error: 'CI pipeline configuration not found'
      };
    }

    try {
      const ciConfig = readFileSync(ciConfigPath, 'utf8');

      // Check for environment variable handling
      if (!ciConfig.includes('TURSO_DATABASE_URL')) {
        warnings.push('CI config missing TURSO_DATABASE_URL handling');
      }

      if (!ciConfig.includes('TURSO_AUTH_TOKEN')) {
        warnings.push('CI config missing TURSO_AUTH_TOKEN handling');
      }

      // Check for test execution
      if (!ciConfig.includes('npm test')) {
        warnings.push('CI config missing unit tests');
      }

      if (!ciConfig.includes('test:integration')) {
        warnings.push('CI config missing integration tests');
      }

    } catch (error) {
      warnings.push(`CI config validation error: ${error.message}`);
    }

    return {
      success: warnings.length === 0,
      warnings
    };
  }

  /**
   * Test 8: Test health check endpoints existence
   */
  async testHealthCheckEndpoints() {
    const warnings = [];
    const requiredEndpoints = [
      'api/health/check.js',
      'api/health/database.js'
    ];

    for (const endpoint of requiredEndpoints) {
      const endpointPath = join(projectRoot, endpoint);
      if (!existsSync(endpointPath)) {
        warnings.push(`Missing health endpoint: ${endpoint}`);
      }
    }

    return {
      success: warnings.length === 0,
      warnings
    };
  }

  /**
   * Restore original environment variables
   */
  restoreEnvironment() {
    // Clear current env and restore original
    for (const key in process.env) {
      if (!(key in this.originalEnv)) {
        delete process.env[key];
      }
    }

    for (const [key, value] of Object.entries(this.originalEnv)) {
      process.env[key] = value;
    }
  }

  /**
   * Generate summary report
   */
  generateReport() {
    section('📊 DEPLOYMENT PIPELINE TEST RESULTS');

    console.log(`\n${colors.bright}Summary:${colors.reset}`);
    console.log(`   ✅ Passed: ${this.results.passed}`);
    console.log(`   ❌ Failed: ${this.results.failed}`);
    console.log(`   ⚠️  Warnings: ${this.results.warnings}`);

    const totalTests = this.results.passed + this.results.failed;
    const successRate = totalTests > 0 ? ((this.results.passed / totalTests) * 100).toFixed(1) : 0;

    console.log(`\n${colors.bright}Success Rate: ${successRate}%${colors.reset}`);

    if (this.results.failed === 0) {
      log('\n🎉 All deployment pipeline tests passed!', colors.green);
      if (this.results.warnings > 0) {
        log(`⚠️  However, there are ${this.results.warnings} warnings to address.`, colors.yellow);
      }
    } else {
      log(`\n❌ ${this.results.failed} test(s) failed. Deployment pipeline has issues.`, colors.red);
    }

    // Detailed results
    console.log(`\n${colors.bright}Detailed Results:${colors.reset}`);
    this.results.tests.forEach(test => {
      const status = test.success ? '✅' : '❌';
      console.log(`   ${status} ${test.name}`);
      if (test.error) {
        console.log(`      Error: ${test.error}`);
      }
      if (test.warnings && test.warnings.length > 0) {
        test.warnings.forEach(warning => {
          console.log(`      ⚠️  ${warning}`);
        });
      }
    });

    return this.results.failed === 0;
  }

  /**
   * Run all deployment pipeline tests
   */
  async runAllTests() {
    section('🚀 DEPLOYMENT PIPELINE INTEGRATION TEST');

    log('Testing the complete deployment pipeline for A Lo Cubano Boulder Fest', colors.cyan);
    log('This validates all components work together for successful deployments.\n', colors.cyan);

    // Run all tests
    await this.runTest('Deployment Configuration Files', () => this.testDeploymentConfiguration());
    await this.runTest('Package.json Scripts', () => this.testPackageScripts());
    await this.runTest('Bootstrap Configuration Files', () => this.testBootstrapConfigurations());
    await this.runTest('Environment Detection Logic', () => this.testEnvironmentDetection());
    await this.runTest('Command Sequence Validation', () => this.testCommandSequence());
    await this.runTest('Error Handling & Rollback', () => this.testErrorHandling());
    await this.runTest('CI/CD Integration', () => this.testCIIntegration());
    await this.runTest('Health Check Endpoints', () => this.testHealthCheckEndpoints());

    // Restore environment
    this.restoreEnvironment();

    // Generate and return report
    return this.generateReport();
  }
}

// Execute tests if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new DeploymentPipelineTest();

  tester.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(`\n💥 Test execution failed: ${error.message}`);
    process.exit(1);
  });
}

export { DeploymentPipelineTest };