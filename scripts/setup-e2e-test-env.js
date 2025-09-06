#!/usr/bin/env node

/**
 * E2E Test Environment Setup Script
 * 
 * Sets up environment variables and database for E2E test execution with dynamic port allocation.
 * Each test suite gets its own port (3000-3005) and isolated database to prevent conflicts
 * when running in parallel CI matrix jobs.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Test suite to port mapping for parallel execution
const SUITE_PORT_MAP = {
  'standard': 3000,
  'advanced': 3001, 
  'firefox': 3002,
  'performance': 3003,
  'accessibility': 3004,
  'security': 3005
};

// Default suite if not specified
const DEFAULT_SUITE = 'standard';

class E2EEnvironmentSetup {
  constructor() {
    this.testSuite = process.env.E2E_TEST_SUITE || DEFAULT_SUITE;
    this.port = SUITE_PORT_MAP[this.testSuite] || SUITE_PORT_MAP[DEFAULT_SUITE];
    this.databaseName = `e2e-ci-test-${this.testSuite}.db`;
    this.isDryRun = process.argv.includes('--dry-run');
    this.isCleanupMode = process.argv.includes('--cleanup');
    this.isValidatePort = process.argv.includes('--validate-port');
  }

  /**
   * Get environment variables for this test suite
   */
  getEnvironmentVariables() {
    return {
      // Core E2E settings
      PORT: this.port,
      E2E_TEST_SUITE: this.testSuite,
      NODE_ENV: 'test',
      E2E_TEST_MODE: 'true',
      
      // Database configuration - isolated per suite
      DATABASE_URL: path.join(projectRoot, '.tmp', 'databases', this.databaseName),
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || '',
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || '',
      
      // Test configuration
      TEST_TIMEOUT: '30000',
      PLAYWRIGHT_BROWSERS_PATH: '0',
      
      // Admin credentials for testing
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || 'test123',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
      ADMIN_SECRET: process.env.ADMIN_SECRET || 'test-secret-key-for-e2e-testing-only',
      
      // API keys (use test values if not set)
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy',
      BREVO_API_KEY: process.env.BREVO_API_KEY || 'xkeysib-dummy',
      BREVO_NEWSLETTER_LIST_ID: process.env.BREVO_NEWSLETTER_LIST_ID || '1',
      BREVO_WEBHOOK_SECRET: process.env.BREVO_WEBHOOK_SECRET || 'dummy_secret',
      
      // Wallet pass configuration - Pass through without fallbacks
      APPLE_PASS_KEY: process.env.APPLE_PASS_KEY,
      WALLET_AUTH_SECRET: process.env.WALLET_AUTH_SECRET
    };
  }

  /**
   * Validate port allocation logic
   */
  validatePortAllocation() {
    if (this.isValidatePort) {
      const vars = this.getEnvironmentVariables();
      console.log(`PORT=${vars.PORT}`);
      console.log(`E2E_TEST_SUITE=${vars.E2E_TEST_SUITE}`);
      console.log(`DATABASE=${this.databaseName}`);
      return;
    }
  }

  /**
   * Setup database directory and file
   */
  async setupDatabase() {
    const dbDir = path.join(projectRoot, '.tmp', 'databases');
    const dbPath = path.join(dbDir, this.databaseName);
    
    if (this.isDryRun) {
      console.log(`[DRY RUN] Would create database directory: ${dbDir}`);
      console.log(`[DRY RUN] Would setup database: ${dbPath}`);
      return dbPath;
    }

    try {
      // Ensure database directory exists
      await fs.mkdir(dbDir, { recursive: true });
      
      // Initialize database if it doesn't exist
      const dbExists = await fs.access(dbPath).then(() => true).catch(() => false);
      if (!dbExists) {
        console.log(`📊 Creating database for ${this.testSuite} suite: ${this.databaseName}`);
        await fs.writeFile(dbPath, ''); // Create empty database file
      }
      
      console.log(`✅ Database ready: ${this.databaseName}`);
      return dbPath;
    } catch (error) {
      console.error(`❌ Database setup failed:`, error.message);
      throw error;
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations() {
    if (this.isDryRun) {
      console.log('[DRY RUN] Would run database migrations');
      return;
    }

    console.log('🔄 Running database migrations...');
    
    return new Promise((resolve, reject) => {
      const env = this.getEnvironmentVariables();
      const migrationProcess = spawn('npm', ['run', 'migrate:up'], {
        stdio: 'pipe',
        cwd: projectRoot,
        env: { ...process.env, ...env }
      });

      let output = '';
      migrationProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      migrationProcess.stderr?.on('data', (data) => {
        output += data.toString();
      });

      migrationProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Database migrations completed');
          resolve(true);
        } else {
          console.error('❌ Migration failed:', output);
          reject(new Error(`Migration failed with code ${code}`));
        }
      });
    });
  }

  /**
   * Cleanup databases
   */
  async cleanup() {
    const dbDir = path.join(projectRoot, '.tmp', 'databases');
    
    if (this.isDryRun) {
      console.log('[DRY RUN] Would cleanup database directory:', dbDir);
      // List all database files that would be cleaned
      for (const suite of Object.keys(SUITE_PORT_MAP)) {
        const dbName = `e2e-ci-test-${suite}.db`;
        console.log(`[DRY RUN] Would cleanup: ${dbName}`);
      }
      return;
    }

    try {
      console.log('🧹 Cleaning up E2E test databases...');
      
      // Remove all suite databases
      for (const suite of Object.keys(SUITE_PORT_MAP)) {
        const dbName = `e2e-ci-test-${suite}.db`;
        const dbPath = path.join(dbDir, dbName);
        
        try {
          await fs.unlink(dbPath);
          console.log(`✅ Removed: ${dbName}`);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn(`⚠️  Failed to remove ${dbName}:`, error.message);
          }
        }
      }
      
      // Remove directory if empty
      try {
        const files = await fs.readdir(dbDir);
        if (files.length === 0) {
          await fs.rmdir(dbDir);
          console.log('✅ Removed empty database directory');
        }
      } catch (error) {
        // Directory might not exist or not be empty
      }
      
      console.log('🎉 Cleanup completed');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Print environment setup
   */
  printEnvironment() {
    const vars = this.getEnvironmentVariables();
    
    if (this.isDryRun || this.isValidatePort) {
      // For validation and dry run, output parseable format
      console.log(`PORT=${vars.PORT}`);
      console.log(`E2E_TEST_SUITE=${vars.E2E_TEST_SUITE}`);
      console.log(`DATABASE=${this.databaseName}`);
      return;
    }
    
    console.log('\n📋 E2E Environment Configuration:');
    console.log('='.repeat(50));
    console.log(`Test Suite: ${this.testSuite}`);
    console.log(`Port: ${vars.PORT}`);
    console.log(`Database: ${this.databaseName}`);
    console.log(`Mode: ${this.isDryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log('='.repeat(50));
    
    if (process.env.CI) {
      console.log('\n🏗️  CI Environment Variables:');
      Object.entries(vars).forEach(([key, value]) => {
        if (key.includes('SECRET') || key.includes('KEY')) {
          console.log(`${key}=[REDACTED]`);
        } else {
          console.log(`${key}=${value}`);
        }
      });
    }
  }

  /**
   * Setup complete E2E environment
   */
  async setup() {
    try {
      console.log(`🚀 Setting up E2E environment for ${this.testSuite} suite...`);
      
      // Handle special modes
      if (this.isValidatePort) {
        this.validatePortAllocation();
        return { success: true };
      }
      
      if (this.isCleanupMode) {
        await this.cleanup();
        return { success: true };
      }
      
      // Setup database
      const dbPath = await this.setupDatabase();
      
      // Run migrations (if not dry run)
      if (!this.isDryRun) {
        await this.runMigrations();
      }
      
      // Print configuration
      this.printEnvironment();
      
      if (!this.isDryRun && !this.isValidatePort) {
        console.log(`\n🎉 E2E environment ready for ${this.testSuite} suite!`);
        console.log(`📍 Server will run on port ${this.port}`);
        console.log(`📊 Database: ${this.databaseName}`);
      }
      
      return {
        success: true,
        port: this.port,
        database: this.databaseName,
        environment: this.getEnvironmentVariables()
      };
      
    } catch (error) {
      console.error(`❌ E2E setup failed for ${this.testSuite}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new E2EEnvironmentSetup();
  
  try {
    const result = await setup.setup();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

export { E2EEnvironmentSetup, SUITE_PORT_MAP };