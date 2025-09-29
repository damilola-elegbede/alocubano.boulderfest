#!/usr/bin/env node
/**
 * Production Readiness Verification Script
 *
 * Comprehensive verification of production deployment readiness
 * including bootstrap system, environment variables, and configurations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ProductionReadinessChecker {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.checks = [];
    this.environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  }

  /**
   * Add an issue (critical error)
   */
  addIssue(category, message, details = null) {
    this.issues.push({ category, message, details });
  }

  /**
   * Add a warning (non-critical issue)
   */
  addWarning(category, message, details = null) {
    this.warnings.push({ category, message, details });
  }

  /**
   * Add a successful check
   */
  addCheck(category, message) {
    this.checks.push({ category, message });
  }

  /**
   * Check if a file exists
   */
  fileExists(filePath) {
    try {
      return fs.existsSync(filePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Read and parse JSON file
   */
  readJsonFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify Vercel configuration
   */
  checkVercelConfig() {
    console.log('🔧 Checking Vercel Configuration...');

    const vercelConfigPath = path.join(__dirname, '../vercel.json');

    if (!this.fileExists(vercelConfigPath)) {
      this.addIssue('vercel', 'vercel.json not found');
      return;
    }

    const config = this.readJsonFile(vercelConfigPath);
    if (!config) {
      this.addIssue('vercel', 'vercel.json is invalid JSON');
      return;
    }

    // Check build command includes bootstrap
    if (!config.buildCommand || !config.buildCommand.includes('bootstrap:vercel')) {
      this.addIssue('vercel', 'Build command missing bootstrap:vercel step');
    } else {
      this.addCheck('vercel', 'Build command includes bootstrap step');
    }

    // Check function timeout configurations
    if (config.functions) {
      const timeouts = Object.entries(config.functions);
      if (timeouts.length > 0) {
        this.addCheck('vercel', `Function timeouts configured for ${timeouts.length} function groups`);
      }
    }

    // Check image optimization patterns
    if (config.images?.remotePatterns) {
      const hasGoogleDrive = config.images.remotePatterns.some(
        pattern => pattern.hostname === 'drive.google.com' || pattern.hostname === '*.googleusercontent.com'
      );
      if (hasGoogleDrive) {
        this.addCheck('vercel', 'Image optimization configured for Google Drive');
      } else {
        this.addWarning('vercel', 'Google Drive image patterns not configured');
      }
    }

    // Check security headers
    const securityHeaders = config.headers?.find(h => h.source === '/(.*)')?.headers || [];
    const requiredHeaders = ['X-Content-Type-Options', 'X-Frame-Options', 'Content-Security-Policy'];

    for (const header of requiredHeaders) {
      if (securityHeaders.some(h => h.key === header)) {
        this.addCheck('vercel', `Security header ${header} configured`);
      } else {
        this.addWarning('vercel', `Security header ${header} missing`);
      }
    }
  }

  /**
   * Verify package.json scripts
   */
  checkPackageScripts() {
    console.log('📦 Checking Package Scripts...');

    const packagePath = path.join(__dirname, '../package.json');

    if (!this.fileExists(packagePath)) {
      this.addIssue('package', 'package.json not found');
      return;
    }

    const pkg = this.readJsonFile(packagePath);
    if (!pkg) {
      this.addIssue('package', 'package.json is invalid JSON');
      return;
    }

    const requiredScripts = [
      'bootstrap:vercel',
      'bootstrap:local',
      'migrate:vercel',
      'migrate:up',
      'build',
      'test',
      'lint'
    ];

    for (const script of requiredScripts) {
      if (pkg.scripts && pkg.scripts[script]) {
        this.addCheck('package', `Script ${script} configured`);
      } else {
        this.addIssue('package', `Required script ${script} missing`);
      }
    }

    // Check Node.js version requirement
    if (pkg.engines?.node) {
      this.addCheck('package', `Node.js version constraint: ${pkg.engines.node}`);
    } else {
      this.addWarning('package', 'Node.js version not specified in engines');
    }
  }

  /**
   * Verify bootstrap configurations
   */
  checkBootstrapConfigs() {
    console.log('🚀 Checking Bootstrap Configurations...');

    const bootstrapDir = path.join(__dirname, '../bootstrap');

    if (!this.fileExists(bootstrapDir)) {
      this.addIssue('bootstrap', 'Bootstrap directory not found');
      return;
    }

    const environments = ['production', 'preview', 'development'];

    for (const env of environments) {
      const configPath = path.join(bootstrapDir, `${env}.json`);

      if (!this.fileExists(configPath)) {
        this.addIssue('bootstrap', `Bootstrap config missing for ${env} environment`);
        continue;
      }

      const config = this.readJsonFile(configPath);
      if (!config) {
        this.addIssue('bootstrap', `Invalid JSON in ${env} bootstrap config`);
        continue;
      }

      // Verify basic structure
      if (!config.version) {
        this.addIssue('bootstrap', `Missing version in ${env} config`);
      }

      if (!config.environment || config.environment !== env) {
        this.addIssue('bootstrap', `Environment mismatch in ${env} config`);
      }

      if (!config.events || !Array.isArray(config.events)) {
        this.addIssue('bootstrap', `Missing or invalid events array in ${env} config`);
      } else {
        this.addCheck('bootstrap', `${env} config has ${config.events.length} events`);

        // Verify event structure
        for (const event of config.events) {
          const requiredFields = ['slug', 'name', 'type', 'status'];
          for (const field of requiredFields) {
            if (!event[field]) {
              this.addIssue('bootstrap', `Event missing required field ${field} in ${env} config`);
            }
          }
        }
      }

      if (config.admin_access) {
        this.addCheck('bootstrap', `Admin access configured in ${env} config`);
      } else {
        this.addWarning('bootstrap', `No admin access configured in ${env} config`);
      }
    }
  }

  /**
   * Verify bootstrap system files
   */
  checkBootstrapSystem() {
    console.log('🔧 Checking Bootstrap System Files...');

    const bootstrapFiles = [
      'scripts/bootstrap.js',
      'lib/bootstrap-service.js',
      'config/bootstrap.json'
    ];

    for (const file of bootstrapFiles) {
      const filePath = path.join(__dirname, `../${file}`);
      if (this.fileExists(filePath)) {
        this.addCheck('bootstrap-system', `File ${file} exists`);
      } else {
        this.addIssue('bootstrap-system', `Missing bootstrap file: ${file}`);
      }
    }

    // Check if bootstrap script is executable
    const bootstrapScript = path.join(__dirname, '../scripts/bootstrap.js');
    if (this.fileExists(bootstrapScript)) {
      try {
        const stats = fs.statSync(bootstrapScript);
        if (stats.mode & parseInt('111', 8)) {
          this.addCheck('bootstrap-system', 'Bootstrap script has execute permissions');
        } else {
          this.addWarning('bootstrap-system', 'Bootstrap script may need execute permissions');
        }
      } catch (error) {
        this.addWarning('bootstrap-system', 'Could not check bootstrap script permissions');
      }
    }
  }

  /**
   * Check environment variable requirements
   */
  checkEnvironmentVariables() {
    console.log('🔐 Checking Environment Variables...');

    const productionRequiredVars = [
      'TURSO_DATABASE_URL',
      'TURSO_AUTH_TOKEN'
    ];

    const recommendedVars = [
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
      'ADMIN_SECRET',
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_SECRET_KEY',
      'BREVO_API_KEY'
    ];

    // Check required variables
    for (const varName of productionRequiredVars) {
      if (process.env[varName]) {
        this.addCheck('env-vars', `Required variable ${varName} is set`);
      } else {
        if (this.environment === 'production') {
          this.addIssue('env-vars', `Required production variable ${varName} not set`);
        } else {
          this.addWarning('env-vars', `Production variable ${varName} not set (OK for ${this.environment})`);
        }
      }
    }

    // Check recommended variables
    for (const varName of recommendedVars) {
      if (process.env[varName]) {
        this.addCheck('env-vars', `Recommended variable ${varName} is set`);
      } else {
        this.addWarning('env-vars', `Recommended variable ${varName} not set`);
      }
    }
  }

  /**
   * Check GitHub Actions configuration
   */
  checkGitHubActions() {
    console.log('🔄 Checking GitHub Actions Configuration...');

    const workflowsDir = path.join(__dirname, '../.github/workflows');

    if (!this.fileExists(workflowsDir)) {
      this.addWarning('github-actions', 'GitHub Actions workflows directory not found');
      return;
    }

    const ciPipelinePath = path.join(workflowsDir, 'ci-pipeline.yml');
    if (this.fileExists(ciPipelinePath)) {
      this.addCheck('github-actions', 'CI pipeline workflow exists');
    } else {
      this.addWarning('github-actions', 'CI pipeline workflow not found');
    }

    // Count workflow files
    try {
      const workflows = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      this.addCheck('github-actions', `${workflows.length} workflow files found`);
    } catch (error) {
      this.addWarning('github-actions', 'Could not read workflows directory');
    }
  }

  /**
   * Check documentation
   */
  checkDocumentation() {
    console.log('📚 Checking Documentation...');

    const docs = [
      'docs/DEPLOYMENT.md',
      'docs/DEPLOYMENT_CHECKLIST.md',
      'CLAUDE.md',
      'README.md'
    ];

    for (const doc of docs) {
      const docPath = path.join(__dirname, `../${doc}`);
      if (this.fileExists(docPath)) {
        this.addCheck('documentation', `Documentation file ${doc} exists`);
      } else {
        this.addWarning('documentation', `Documentation file ${doc} missing`);
      }
    }
  }

  /**
   * Generate report
   */
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 PRODUCTION READINESS REPORT');
    console.log('='.repeat(80));

    console.log(`\n📊 Summary for ${this.environment} environment:`);
    console.log(`   ✅ Successful checks: ${this.checks.length}`);
    console.log(`   ⚠️  Warnings: ${this.warnings.length}`);
    console.log(`   ❌ Critical issues: ${this.issues.length}`);

    // Group checks by category
    const checksByCategory = {};
    const warningsByCategory = {};
    const issuesByCategory = {};

    this.checks.forEach(check => {
      if (!checksByCategory[check.category]) checksByCategory[check.category] = [];
      checksByCategory[check.category].push(check.message);
    });

    this.warnings.forEach(warning => {
      if (!warningsByCategory[warning.category]) warningsByCategory[warning.category] = [];
      warningsByCategory[warning.category].push(warning.message);
    });

    this.issues.forEach(issue => {
      if (!issuesByCategory[issue.category]) issuesByCategory[issue.category] = [];
      issuesByCategory[issue.category].push(issue.message);
    });

    // Display results by category
    const allCategories = new Set([
      ...Object.keys(checksByCategory),
      ...Object.keys(warningsByCategory),
      ...Object.keys(issuesByCategory)
    ]);

    for (const category of allCategories) {
      console.log(`\n📁 ${category.toUpperCase()}:`);

      if (checksByCategory[category]) {
        checksByCategory[category].forEach(msg => console.log(`   ✅ ${msg}`));
      }

      if (warningsByCategory[category]) {
        warningsByCategory[category].forEach(msg => console.log(`   ⚠️  ${msg}`));
      }

      if (issuesByCategory[category]) {
        issuesByCategory[category].forEach(msg => console.log(`   ❌ ${msg}`));
      }
    }

    // Final assessment
    console.log('\n' + '='.repeat(80));
    if (this.issues.length === 0) {
      console.log('🎉 PRODUCTION READINESS: PASSED');
      console.log('   All critical checks passed. System is ready for deployment.');
      if (this.warnings.length > 0) {
        console.log(`   Note: ${this.warnings.length} warnings should be addressed when possible.`);
      }
    } else {
      console.log('🚨 PRODUCTION READINESS: FAILED');
      console.log(`   ${this.issues.length} critical issues must be resolved before deployment.`);
    }
    console.log('='.repeat(80));

    return this.issues.length === 0;
  }

  /**
   * Run all checks
   */
  async run() {
    console.log('🔍 Running Production Readiness Verification...\n');

    this.checkVercelConfig();
    this.checkPackageScripts();
    this.checkBootstrapConfigs();
    this.checkBootstrapSystem();
    this.checkEnvironmentVariables();
    this.checkGitHubActions();
    this.checkDocumentation();

    const passed = this.generateReport();

    // Exit with appropriate code
    process.exit(passed ? 0 : 1);
  }
}

// Run verification if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const checker = new ProductionReadinessChecker();
  checker.run().catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}

export { ProductionReadinessChecker };