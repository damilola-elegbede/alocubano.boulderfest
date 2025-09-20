#!/usr/bin/env node

/**
 * Vercel Configuration Validator
 * Ensures all configuration is properly set up for E2E testing
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

class VercelConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.checks = [];
  }

  /**
   * Validate vercel.json configuration
   */
  async validateVercelJson() {
    this.checks.push('Validating vercel.json');

    try {
      const vercelPath = path.join(projectRoot, 'vercel.json');
      const content = await fs.readFile(vercelPath, 'utf-8');
      const config = JSON.parse(content);

      // Check required properties
      const required = ['buildCommand', 'outputDirectory', 'functions', 'rewrites'];
      for (const prop of required) {
        if (!config[prop]) {
          this.errors.push(`vercel.json missing required property: ${prop}`);
        }
      }

      // Check if devCommand exists
      if (!config.devCommand) {
        this.warnings.push('vercel.json missing devCommand - adding default');
      }

      // Validate functions configuration
      const functions = config.functions || {};
      const hasCatchAll = functions['api/**/*.js'];
      if (!hasCatchAll) {
        this.errors.push('vercel.json missing catch-all function configuration: api/**/*.js');
      }

      // Check critical API routes
      const criticalRoutes = [
        'api/admin/**/*.js',
        'api/email/**/*.js',
        'api/health/**/*.js',
        'api/registration/**/*.js'
      ];

      for (const route of criticalRoutes) {
        if (!functions[route]) {
          this.warnings.push(`vercel.json missing function config for: ${route}`);
        }
      }

      console.log('✅ vercel.json validation passed');
      return true;
    } catch (error) {
      this.errors.push(`Failed to validate vercel.json: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate .vercel/project.json configuration
   */
  async validateProjectJson() {
    this.checks.push('Validating .vercel/project.json');

    try {
      const projectPath = path.join(projectRoot, '.vercel', 'project.json');
      const content = await fs.readFile(projectPath, 'utf-8');
      const config = JSON.parse(content);

      // Check required properties
      if (!config.projectId || !config.orgId) {
        this.errors.push('.vercel/project.json missing projectId or orgId');
        return false;
      }

      console.log('✅ .vercel/project.json validation passed');
      return true;
    } catch (error) {
      this.errors.push(`Failed to validate .vercel/project.json: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate environment variables
   */
  async validateEnvironment() {
    this.checks.push('Validating environment variables');

    try {
      const envPath = path.join(projectRoot, '.env.local');
      const content = await fs.readFile(envPath, 'utf-8');

      // Critical variables for E2E testing
      const critical = [
        'TEST_ADMIN_PASSWORD',
        'E2E_TEST_MODE',
        'NODE_ENV',
        'STRIPE_PUBLISHABLE_KEY',
        'STRIPE_SECRET_KEY',
        'BREVO_API_KEY',
        'ADMIN_PASSWORD',
        'ADMIN_SECRET'
      ];

      const missing = [];
      for (const variable of critical) {
        if (!content.includes(`${variable}=`)) {
          missing.push(variable);
        }
      }

      if (missing.length > 0) {
        this.errors.push(`Missing critical environment variables: ${missing.join(', ')}`);
        return false;
      }

      // Check E2E specific variables
      if (!content.includes('E2E_TEST_MODE=true')) {
        this.warnings.push('E2E_TEST_MODE should be set to true for testing');
      }

      console.log('✅ Environment variables validation passed');
      return true;
    } catch (error) {
      this.errors.push(`Failed to validate environment: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate API routes exist
   */
  async validateApiRoutes() {
    this.checks.push('Validating API routes');

    try {
      const apiPath = path.join(projectRoot, 'api');
      const criticalRoutes = [
        'health/check.js',
        'admin/login.js',
        'admin/dashboard.js',
        'email/subscribe.js',
        'payments/create-checkout-session.js',
        'tickets/validate.js',
        'registration/batch.js'
      ];

      const missing = [];
      for (const route of criticalRoutes) {
        const routePath = path.join(apiPath, route);
        try {
          await fs.access(routePath);
        } catch {
          missing.push(route);
        }
      }

      if (missing.length > 0) {
        this.errors.push(`Missing critical API routes: ${missing.join(', ')}`);
        return false;
      }

      console.log('✅ API routes validation passed');
      return true;
    } catch (error) {
      this.errors.push(`Failed to validate API routes: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate database setup
   */
  async validateDatabase() {
    this.checks.push('Validating database setup');

    try {
      // Check migrations directory
      const migrationsPath = path.join(projectRoot, 'migrations');
      try {
        await fs.access(migrationsPath);
      } catch {
        this.errors.push('Migrations directory not found');
        return false;
      }

      // Check database service
      const dbServicePath = path.join(projectRoot, 'api', 'lib', 'database.js');
      try {
        await fs.access(dbServicePath);
      } catch {
        this.errors.push('Database service not found at api/lib/database.js');
        return false;
      }

      console.log('✅ Database setup validation passed');
      return true;
    } catch (error) {
      this.errors.push(`Failed to validate database: ${error.message}`);
      return false;
    }
  }

  /**
   * Run all validations
   */
  async runAllValidations() {
    console.log('🔍 Validating Vercel configuration for E2E testing...\n');

    const validations = [
      this.validateVercelJson(),
      this.validateProjectJson(),
      this.validateEnvironment(),
      this.validateApiRoutes(),
      this.validateDatabase()
    ];

    const results = await Promise.all(validations);
    const allPassed = results.every(result => result === true);

    console.log('\n📋 Validation Summary:');
    console.log('='.repeat(50));

    if (this.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.errors.forEach(error => console.log(`  • ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.warnings.forEach(warning => console.log(`  • ${warning}`));
    }

    console.log(`\n✅ Checks completed: ${this.checks.length}`);
    console.log(`❌ Errors: ${this.errors.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);

    if (allPassed && this.errors.length === 0) {
      console.log('\n🎉 Vercel configuration is ready for E2E testing!');
      return true;
    } else {
      console.log('\n🚨 Configuration issues found. Please fix errors before running E2E tests.');
      return false;
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new VercelConfigValidator();
  const success = await validator.runAllValidations();
  process.exit(success ? 0 : 1);
}

export default VercelConfigValidator;