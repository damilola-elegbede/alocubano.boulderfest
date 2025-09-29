#!/usr/bin/env node
/**
 * Deployment Readiness Validation Script
 *
 * Comprehensive validation script that simulates and validates the entire
 * deployment pipeline from migrations through bootstrap to final build.
 *
 * This script can be run before actual deployments to ensure everything
 * will work correctly in production.
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
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title, emoji = '📋') {
  console.log('\n' + '='.repeat(70));
  console.log(`${colors.bright}${colors.cyan}${emoji} ${title}${colors.reset}`);
  console.log('='.repeat(70));
}

class DeploymentValidator {
  constructor(environment = 'production') {
    this.environment = environment;
    this.results = {
      checks: [],
      passed: 0,
      failed: 0,
      warnings: 0,
      critical: 0
    };
    this.startTime = Date.now();
  }

  /**
   * Add a check result
   */
  addResult(name, status, message = '', level = 'info') {
    const result = {
      name,
      status, // 'pass', 'fail', 'warning'
      message,
      level, // 'info', 'warning', 'critical'
      timestamp: new Date().toISOString()
    };

    this.results.checks.push(result);

    if (status === 'pass') {
      this.results.passed++;
      log(`   ✅ ${name}`, colors.green);
    } else if (status === 'fail') {
      this.results.failed++;
      if (level === 'critical') this.results.critical++;
      const color = level === 'critical' ? colors.red : colors.yellow;
      log(`   ${level === 'critical' ? '🚫' : '❌'} ${name}${message ? `: ${message}` : ''}`, color);
    } else if (status === 'warning') {
      this.results.warnings++;
      log(`   ⚠️  ${name}${message ? `: ${message}` : ''}`, colors.yellow);
    }

    if (message && status === 'pass') {
      log(`      ${message}`, colors.cyan);
    }
  }

  /**
   * Execute a command safely and return result
   */
  executeCommand(command, description = '', options = {}) {
    try {
      log(`\n🔧 ${description || 'Executing command'}...`, colors.blue);
      log(`   Command: ${command}`, colors.cyan);

      const result = execSync(command, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'inherit',
        timeout: options.timeout || 60000,
        ...options
      });

      log(`   ✅ Command completed successfully`, colors.green);
      return { success: true, output: result };

    } catch (error) {
      log(`   ❌ Command failed: ${error.message}`, colors.red);
      return { success: false, error: error.message, output: error.stdout || error.stderr };
    }
  }

  /**
   * Validate environment variables
   */
  validateEnvironmentVariables() {
    section('Environment Variables Validation', '🔐');

    const envConfig = {
      production: {
        required: ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
        recommended: ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_SECRET'],
        optional: ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'BREVO_API_KEY']
      },
      preview: {
        required: ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
        recommended: ['ADMIN_EMAIL'],
        optional: ['TEST_ADMIN_PASSWORD']
      },
      development: {
        required: [],
        recommended: ['ADMIN_EMAIL'],
        optional: []
      }
    };

    const config = envConfig[this.environment] || envConfig.development;

    // Check required variables
    config.required.forEach(envVar => {
      if (process.env[envVar]) {
        this.addResult(`Required env var: ${envVar}`, 'pass', 'Set and available');
      } else {
        this.addResult(
          `Required env var: ${envVar}`,
          'fail',
          'Missing required environment variable',
          'critical'
        );
      }
    });

    // Check recommended variables
    config.recommended.forEach(envVar => {
      if (process.env[envVar]) {
        this.addResult(`Recommended env var: ${envVar}`, 'pass', 'Set and available');
      } else {
        this.addResult(
          `Recommended env var: ${envVar}`,
          'warning',
          'Missing recommended environment variable'
        );
      }
    });

    // Check optional variables
    config.optional.forEach(envVar => {
      if (process.env[envVar]) {
        this.addResult(`Optional env var: ${envVar}`, 'pass', 'Set and available');
      } else {
        this.addResult(`Optional env var: ${envVar}`, 'warning', 'Not set (optional)');
      }
    });
  }

  /**
   * Validate configuration files
   */
  validateConfigurationFiles() {
    section('Configuration Files Validation', '📄');

    // Check vercel.json
    try {
      const vercelConfig = JSON.parse(readFileSync(join(projectRoot, 'vercel.json'), 'utf8'));
      this.addResult('vercel.json syntax', 'pass', 'Valid JSON structure');

      if (vercelConfig.buildCommand) {
        this.addResult('vercel.json buildCommand', 'pass', vercelConfig.buildCommand);
      } else {
        this.addResult('vercel.json buildCommand', 'fail', 'No build command specified', 'critical');
      }

    } catch (error) {
      this.addResult('vercel.json syntax', 'fail', `Parse error: ${error.message}`, 'critical');
    }

    // Check package.json
    try {
      const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
      this.addResult('package.json syntax', 'pass', 'Valid JSON structure');

      const requiredScripts = ['migrate:vercel', 'bootstrap:vercel', 'build'];
      requiredScripts.forEach(script => {
        if (packageJson.scripts?.[script]) {
          this.addResult(`package.json script: ${script}`, 'pass', 'Script defined');
        } else {
          this.addResult(`package.json script: ${script}`, 'fail', 'Missing script', 'critical');
        }
      });

    } catch (error) {
      this.addResult('package.json syntax', 'fail', `Parse error: ${error.message}`, 'critical');
    }

    // Check bootstrap configuration
    const bootstrapFile = join(projectRoot, 'bootstrap', `${this.environment}.json`);
    if (existsSync(bootstrapFile)) {
      try {
        const config = JSON.parse(readFileSync(bootstrapFile, 'utf8'));
        this.addResult(`Bootstrap config: ${this.environment}`, 'pass', 'Valid JSON structure');

        if (config.events && Array.isArray(config.events)) {
          this.addResult(
            'Bootstrap events configuration',
            'pass',
            `${config.events.length} events configured`
          );
        } else {
          this.addResult(
            'Bootstrap events configuration',
            'fail',
            'Missing or invalid events array',
            'critical'
          );
        }

      } catch (error) {
        this.addResult(
          `Bootstrap config: ${this.environment}`,
          'fail',
          `Parse error: ${error.message}`,
          'critical'
        );
      }
    } else {
      this.addResult(
        `Bootstrap config: ${this.environment}`,
        'fail',
        'Configuration file not found',
        'critical'
      );
    }
  }

  /**
   * Test database connectivity (if possible)
   */
  async testDatabaseConnectivity() {
    section('Database Connectivity Test', '🗄️');

    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
      this.addResult(
        'Database connectivity test',
        'warning',
        'Skipped - database credentials not available'
      );
      return;
    }

    try {
      // Import and test database connection
      const { getDatabaseClient } = await import('../lib/database.js');
      const client = await getDatabaseClient();

      // Test basic query
      const result = await client.execute('SELECT 1 as test');
      if (result.rows && result.rows.length > 0) {
        this.addResult('Database connectivity', 'pass', 'Connection successful');
      } else {
        this.addResult('Database connectivity', 'fail', 'Invalid response from database');
      }

    } catch (error) {
      this.addResult(
        'Database connectivity',
        'fail',
        `Connection failed: ${error.message}`,
        'critical'
      );
    }
  }

  /**
   * Test migration status
   */
  testMigrationStatus() {
    section('Migration System Test', '🗃️');

    const migrationResult = this.executeCommand(
      'npm run migrate:status',
      'Checking migration status',
      { silent: true }
    );

    if (migrationResult.success) {
      this.addResult('Migration status check', 'pass', 'Migration system functional');
    } else {
      this.addResult(
        'Migration status check',
        'fail',
        'Migration system not working',
        'critical'
      );
    }
  }

  /**
   * Test bootstrap system
   */
  testBootstrapSystem() {
    section('Bootstrap System Test', '🚀');

    // Test bootstrap script syntax
    const bootstrapPath = join(projectRoot, 'scripts', 'bootstrap.js');
    if (existsSync(bootstrapPath)) {
      this.addResult('Bootstrap script exists', 'pass', 'Script file found');

      // Test if script can be imported (syntax check)
      try {
        execSync(`node -c "${bootstrapPath}"`, { stdio: 'pipe' });
        this.addResult('Bootstrap script syntax', 'pass', 'No syntax errors');
      } catch (error) {
        this.addResult(
          'Bootstrap script syntax',
          'fail',
          'Syntax error in bootstrap script',
          'critical'
        );
      }

    } else {
      this.addResult(
        'Bootstrap script exists',
        'fail',
        'Bootstrap script not found',
        'critical'
      );
    }

    // Test bootstrap configuration loading
    try {
      const configPath = join(projectRoot, 'config', 'bootstrap.json');
      const config = JSON.parse(readFileSync(configPath, 'utf8'));

      this.addResult('Bootstrap config loading', 'pass', 'Configuration loaded successfully');

      // Validate events have required fields
      let validEvents = 0;
      config.events?.forEach((event, index) => {
        const requiredFields = ['slug', 'name', 'type', 'status'];
        const hasAllRequired = requiredFields.every(field => event[field]);

        if (hasAllRequired) {
          validEvents++;
        }
      });

      if (validEvents === (config.events?.length || 0)) {
        this.addResult(
          'Bootstrap event validation',
          'pass',
          `All ${validEvents} events have required fields`
        );
      } else {
        this.addResult(
          'Bootstrap event validation',
          'fail',
          `${validEvents}/${config.events?.length || 0} events valid`
        );
      }

    } catch (error) {
      this.addResult(
        'Bootstrap config loading',
        'fail',
        `Configuration error: ${error.message}`
      );
    }
  }

  /**
   * Test build process
   */
  testBuildProcess() {
    section('Build Process Test', '🔨');

    // Check if build can be tested safely
    const buildResult = this.executeCommand(
      'npm run verify-structure',
      'Testing build structure verification',
      { silent: true, timeout: 30000 }
    );

    if (buildResult.success) {
      this.addResult('Build structure verification', 'pass', 'Build structure is valid');
    } else {
      this.addResult(
        'Build structure verification',
        'fail',
        'Build structure issues detected'
      );
    }

    // Test documentation embedding (part of build process)
    try {
      execSync('node scripts/embed-docs.cjs', {
        stdio: 'pipe',
        cwd: projectRoot,
        timeout: 30000
      });
      this.addResult('Documentation embedding', 'pass', 'Documentation embedded successfully');
    } catch (error) {
      this.addResult(
        'Documentation embedding',
        'fail',
        'Documentation embedding failed'
      );
    }
  }

  /**
   * Test health check endpoints
   */
  testHealthCheckEndpoints() {
    section('Health Check Endpoints Test', '🏥');

    const healthEndpoints = [
      'api/health/check.js',
      'api/health/database.js'
    ];

    healthEndpoints.forEach(endpoint => {
      const endpointPath = join(projectRoot, endpoint);
      if (existsSync(endpointPath)) {
        this.addResult(`Health endpoint: ${endpoint}`, 'pass', 'Endpoint file exists');

        // Test syntax
        try {
          execSync(`node -c "${endpointPath}"`, { stdio: 'pipe' });
          this.addResult(`Health endpoint syntax: ${endpoint}`, 'pass', 'No syntax errors');
        } catch (error) {
          this.addResult(
            `Health endpoint syntax: ${endpoint}`,
            'fail',
            'Syntax error in endpoint'
          );
        }

      } else {
        this.addResult(
          `Health endpoint: ${endpoint}`,
          'fail',
          'Endpoint file not found'
        );
      }
    });
  }

  /**
   * Test security configuration
   */
  testSecurityConfiguration() {
    section('Security Configuration Test', '🔒');

    try {
      const vercelConfig = JSON.parse(readFileSync(join(projectRoot, 'vercel.json'), 'utf8'));

      // Check security headers
      if (vercelConfig.headers) {
        const securityHeaders = vercelConfig.headers.find(h =>
          h.headers?.some(header => header.key === 'Content-Security-Policy')
        );

        if (securityHeaders) {
          this.addResult('Security headers', 'pass', 'CSP and security headers configured');
        } else {
          this.addResult('Security headers', 'warning', 'Security headers not found');
        }
      } else {
        this.addResult('Security headers', 'warning', 'No headers configuration found');
      }

      // Check HTTPS enforcement
      const httpsRedirect = vercelConfig.headers?.some(h =>
        h.headers?.some(header => header.key === 'Strict-Transport-Security')
      );

      if (httpsRedirect) {
        this.addResult('HTTPS enforcement', 'pass', 'HSTS header configured');
      } else {
        this.addResult('HTTPS enforcement', 'warning', 'HSTS not configured');
      }

    } catch (error) {
      this.addResult('Security configuration', 'fail', `Configuration error: ${error.message}`);
    }
  }

  /**
   * Generate deployment readiness report
   */
  generateReport() {
    const duration = Date.now() - this.startTime;

    section('📊 DEPLOYMENT READINESS REPORT', '📊');

    // Summary statistics
    const total = this.results.passed + this.results.failed + this.results.warnings;
    const successRate = total > 0 ? ((this.results.passed / total) * 100).toFixed(1) : 0;

    console.log(`\n${colors.bright}Environment:${colors.reset} ${this.environment}`);
    console.log(`${colors.bright}Duration:${colors.reset} ${duration}ms`);
    console.log(`${colors.bright}Timestamp:${colors.reset} ${new Date().toISOString()}\n`);

    console.log(`${colors.bright}Summary:${colors.reset}`);
    console.log(`   ✅ Passed: ${this.results.passed}`);
    console.log(`   ❌ Failed: ${this.results.failed}`);
    console.log(`   ⚠️  Warnings: ${this.results.warnings}`);
    console.log(`   🚫 Critical: ${this.results.critical}`);
    console.log(`   📊 Success Rate: ${successRate}%`);

    // Deployment readiness determination
    const isReady = this.results.critical === 0 && this.results.failed <= 2;

    if (isReady) {
      if (this.results.failed === 0 && this.results.warnings === 0) {
        log('\n🎉 DEPLOYMENT READY - All checks passed!', colors.green);
      } else if (this.results.warnings > 0) {
        log('\n✅ DEPLOYMENT READY - Minor warnings present', colors.green);
      } else {
        log('\n✅ DEPLOYMENT READY - Non-critical issues present', colors.green);
      }
    } else {
      if (this.results.critical > 0) {
        log('\n🚫 DEPLOYMENT NOT READY - Critical issues must be resolved', colors.red);
      } else {
        log('\n❌ DEPLOYMENT NOT READY - Too many issues present', colors.red);
      }
    }

    // Critical issues summary
    if (this.results.critical > 0) {
      console.log(`\n${colors.bright}${colors.red}Critical Issues:${colors.reset}`);
      this.results.checks
        .filter(check => check.level === 'critical' && check.status === 'fail')
        .forEach(check => {
          console.log(`   🚫 ${check.name}: ${check.message}`);
        });
    }

    // Warnings summary
    if (this.results.warnings > 0) {
      console.log(`\n${colors.bright}${colors.yellow}Warnings:${colors.reset}`);
      this.results.checks
        .filter(check => check.status === 'warning')
        .slice(0, 5) // Show max 5 warnings
        .forEach(check => {
          console.log(`   ⚠️  ${check.name}: ${check.message}`);
        });

      if (this.results.warnings > 5) {
        console.log(`   ... and ${this.results.warnings - 5} more warnings`);
      }
    }

    // Recommendations
    console.log(`\n${colors.bright}Recommendations:${colors.reset}`);

    if (this.results.critical > 0) {
      console.log('   1. Resolve all critical issues before deploying');
      console.log('   2. Test the deployment in preview environment first');
    } else if (this.results.failed > 0) {
      console.log('   1. Review and fix non-critical issues');
      console.log('   2. Monitor deployment closely');
    }

    if (this.results.warnings > 0) {
      console.log('   3. Address warnings to improve deployment reliability');
    }

    console.log('   4. Run health checks after deployment');
    console.log('   5. Monitor application logs for issues');

    return isReady;
  }

  /**
   * Run all validation checks
   */
  async runValidation() {
    log(`\n🚀 Starting deployment readiness validation for ${this.environment} environment...`, colors.cyan);

    this.validateEnvironmentVariables();
    this.validateConfigurationFiles();
    await this.testDatabaseConnectivity();
    this.testMigrationStatus();
    this.testBootstrapSystem();
    this.testBuildProcess();
    this.testHealthCheckEndpoints();
    this.testSecurityConfiguration();

    return this.generateReport();
  }
}

// Execute validation if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const environment = process.argv[2] || 'production';
  const validator = new DeploymentValidator(environment);

  validator.runValidation().then(isReady => {
    process.exit(isReady ? 0 : 1);
  }).catch(error => {
    console.error(`\n💥 Validation failed: ${error.message}`);
    process.exit(1);
  });
}

export { DeploymentValidator };