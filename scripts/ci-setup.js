#!/usr/bin/env node

/**
 * CI Environment Setup and Validation for Vercel Dev Server E2E Testing
 * Comprehensive CI/CD pipeline setup with Vercel dev server support
 * Implements async initialization pattern and follows project conventions
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// CI Setup State Management (Promise-based singleton pattern)
class CISetupManager {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.state = {
      startTime: Date.now(),
      environment: 'ci',
      processes: new Map(),
      validations: new Map(),
      metrics: {
        setupDuration: 0,
        validationDuration: 0,
        warmupDuration: 0,
        totalDuration: 0
      },
      artifacts: []
    };
  }

  async ensureInitialized() {
    if (this.initialized) {
      return this.state;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      const result = await this.initializationPromise;
      this.initialized = true;
      return result;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    console.log('🚀 Initializing CI Setup Manager for Vercel E2E...');

    // Load environment configuration
    this._loadEnvironment();

    // Validate CI environment
    this._validateCIEnvironment();

    // Initialize directories
    await this._initializeDirectories();

    console.log('✅ CI Setup Manager initialized');
    return this.state;
  }

  _loadEnvironment() {
    // Load environment variables based on context
    if (!process.env.VERCEL && !process.env.CI && !process.env.GITHUB_ACTIONS) {
      const envPath = resolve(projectRoot, '.env.local');
      if (existsSync(envPath)) {
        config({ path: envPath });
        console.log('📄 Loaded local environment configuration');
      }
    }

    // Set CI-specific defaults
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
    process.env.CI = 'true';
    process.env.E2E_TEST_MODE = 'true';
    process.env.ENVIRONMENT = 'ci-test';

    // Ensure port configuration
    process.env.PORT = process.env.DYNAMIC_PORT || process.env.PORT || process.env.CI_PORT || '3000';
  }

  _validateCIEnvironment() {
    const requiredVars = ['NODE_ENV'];
    const missingVars = requiredVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Validate Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0]);
    if (majorVersion < 18) {
      throw new Error(`Node.js version ${nodeVersion} is not supported. Minimum required: v18.0.0`);
    }

    console.log('✅ CI environment validation passed');
    console.log(`   Node.js: ${nodeVersion}`);
    console.log(`   Environment: ${process.env.NODE_ENV}`);
    console.log(`   Port: ${process.env.PORT}`);
  }

  async _initializeDirectories() {
    const directories = [
      'test-results',
      'playwright-report',
      'coverage',
      '.tmp/ci',
      '.tmp/metrics',
      '.tmp/artifacts',
      'data'  // For SQLite databases
    ];

    for (const dir of directories) {
      const fullPath = resolve(projectRoot, dir);
      try {
        await mkdir(fullPath, { recursive: true });
        console.log(`📁 Directory ensured: ${dir}`);
      } catch (error) {
        console.error(`❌ Failed to create directory ${dir}:`, error.message);
        throw error;
      }
    }
  }

  recordValidation(name, result, duration = 0) {
    this.state.validations.set(name, {
      result,
      duration,
      timestamp: Date.now()
    });
  }

  recordProcess(name, process) {
    this.state.processes.set(name, process);
  }

  addArtifact(type, path, metadata = {}) {
    this.state.artifacts.push({
      type,
      path,
      metadata,
      createdAt: Date.now()
    });
  }
}

// Global CI setup manager instance
const ciSetup = new CISetupManager();

/**
 * Environment Variable Validation for Vercel E2E Testing
 */
async function validateEnvironmentVariables() {
  console.log('\n🔧 Validating environment variables...');
  const startTime = Date.now();

  const validations = [
    { name: 'NODE_ENV', required: true, value: process.env.NODE_ENV },
    { name: 'CI', required: true, value: process.env.CI },
    { name: 'E2E_TEST_MODE', required: true, value: process.env.E2E_TEST_MODE },
    { name: 'PORT', required: true, value: process.env.PORT },

    // Database credentials (optional for CI)
    { name: 'TURSO_DATABASE_URL', required: false, value: process.env.TURSO_DATABASE_URL },
    { name: 'TURSO_AUTH_TOKEN', required: false, value: process.env.TURSO_AUTH_TOKEN },

    // API credentials (optional for CI)
    { name: 'STRIPE_SECRET_KEY', required: false, value: process.env.STRIPE_SECRET_KEY ? '***' : undefined },
    { name: 'BREVO_API_KEY', required: false, value: process.env.BREVO_API_KEY ? '***' : undefined },
    { name: 'ADMIN_PASSWORD', required: false, value: process.env.ADMIN_PASSWORD ? '***' : undefined },

    // Vercel configuration (optional)
    { name: 'VERCEL_ORG_ID', required: false, value: process.env.VERCEL_ORG_ID ? '***' : undefined },
    { name: 'VERCEL_PROJECT_ID', required: false, value: process.env.VERCEL_PROJECT_ID ? '***' : undefined },
  ];

  let hasErrors = false;

  for (const validation of validations) {
    if (validation.required && !validation.value) {
      console.error(`   ❌ Missing required variable: ${validation.name}`);
      hasErrors = true;
    } else if (validation.value) {
      // Always mask sensitive values and never log actual credentials
      const isCredential = validation.name.toLowerCase().includes('token') ||
                          validation.name.toLowerCase().includes('key') ||
                          validation.name.toLowerCase().includes('password') ||
                          validation.name.toLowerCase().includes('secret') ||
                          validation.name.toLowerCase().includes('id');

      const displayValue = isCredential ? '***' : (validation.value === '***' ? '***' : validation.value);
      console.log(`   ✅ ${validation.name}: ${displayValue}`);
    } else {
      console.log(`   ℹ️  ${validation.name}: not set (optional)`);
    }
  }

  const duration = Date.now() - startTime;
  ciSetup.recordValidation('environment_variables', !hasErrors, duration);

  if (hasErrors) {
    throw new Error('Environment variable validation failed');
  }

  console.log(`   ⏱️  Completed in ${duration}ms`);
}

/**
 * Vercel CLI Installation and Configuration
 */
async function validateVercelCLI() {
  console.log('\n📦 Validating Vercel CLI...');
  const startTime = Date.now();

  try {
    // Check if Vercel CLI is available
    const vercelVersion = await new Promise((resolve, reject) => {
      const vercel = spawn('vercel', ['--version'], { stdio: 'pipe' });
      let version = '';

      vercel.stdout.on('data', (data) => {
        version += data.toString().trim();
      });

      vercel.on('close', (code) => {
        if (code === 0) {
          resolve(version);
        } else {
          reject(new Error(`Vercel CLI check failed with code ${code}`));
        }
      });

      setTimeout(() => {
        vercel.kill();
        reject(new Error('Vercel CLI check timeout'));
      }, 10000);
    });

    console.log(`   ✅ Vercel CLI version: ${vercelVersion}`);

    const duration = Date.now() - startTime;
    ciSetup.recordValidation('vercel_cli', true, duration);
    console.log(`   ⏱️  Vercel CLI validation completed in ${duration}ms`);

  } catch (error) {
    const duration = Date.now() - startTime;
    ciSetup.recordValidation('vercel_cli', false, duration);
    console.error(`   ❌ Vercel CLI validation failed: ${error.message}`);

    // For CI, Vercel CLI is required for E2E tests
    throw new Error('Vercel CLI is required for E2E testing with Vercel dev server');
  }
}

/**
 * Database Connection Validation
 */
async function validateDatabaseConnection() {
  console.log('\n🗄️  Validating E2E database connection...');
  const startTime = Date.now();

  // Use standard Turso database credentials
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const databaseUrl = process.env.TURSO_DATABASE_URL;

  if (!authToken || !databaseUrl) {
    console.log('   ℹ️  Database credentials not configured, skipping database validation');
    ciSetup.recordValidation('database_connection', true, Date.now() - startTime);
    return;
  }

  try {
    const client = createClient({
      url: databaseUrl,
      authToken: authToken,
      // Add connection security settings
      timeout: {
        query: 10000, // 10 second query timeout
        connection: 5000 // 5 second connection timeout
      }
    });

    // Test basic connection with timeout
    const connectionTest = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database connection timeout'));
      }, 10000);

      client.execute('SELECT 1 as test')
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });

    const result = await connectionTest;

    if (result.rows[0].test === 1) {
      console.log('   ✅ Database connection successful');

      // Validate required tables exist using parameterized query
      const requiredTables = ['migrations', 'registrations', 'email_subscribers'];
      const placeholders = requiredTables.map(() => '?').join(',');

      const tables = await client.execute({
        sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders}) ORDER BY name`,
        args: requiredTables
      });

      const tableNames = tables.rows.map(row => row.name);
      console.log(`   ✅ Found tables: ${tableNames.join(', ')}`);
    }

    // Ensure proper cleanup
    try {
      client.close();
    } catch (closeError) {
      console.warn(`   ⚠️  Warning: Failed to close database connection: ${closeError.message}`);
    }

    const duration = Date.now() - startTime;
    ciSetup.recordValidation('database_connection', true, duration);
    console.log(`   ⏱️  Completed in ${duration}ms`);

  } catch (error) {
    const duration = Date.now() - startTime;
    ciSetup.recordValidation('database_connection', false, duration);
    console.error(`   ❌ Database validation failed: ${error.message}`);

    // For CI, database connection failures are warnings, not hard failures
    if (process.env.STRICT_DB_VALIDATION === 'true') {
      throw error;
    } else {
      console.log('   ⚠️  Continuing without database validation (set STRICT_DB_VALIDATION=true to require)');
    }
  }
}

/**
 * Playwright Installation and Browser Setup
 */
async function validatePlaywrightSetup() {
  console.log('\n🎭 Validating Playwright installation...');
  const startTime = Date.now();

  try {
    const playwrightVersion = await new Promise((resolve, reject) => {
      const playwright = spawn('npx', ['playwright', '--version'], {
        stdio: 'pipe',
        cwd: projectRoot
      });
      let version = '';

      playwright.stdout.on('data', (data) => {
        version += data.toString().trim();
      });

      playwright.on('close', (code) => {
        if (code === 0) {
          resolve(version);
        } else {
          reject(new Error(`Playwright check failed with code ${code}`));
        }
      });

      setTimeout(() => {
        playwright.kill();
        reject(new Error('Playwright version check timeout'));
      }, 10000);
    });

    console.log(`   ✅ ${playwrightVersion}`);

    const duration = Date.now() - startTime;
    ciSetup.recordValidation('playwright_setup', true, duration);
    console.log(`   ⏱️  Playwright validation completed in ${duration}ms`);

  } catch (error) {
    const duration = Date.now() - startTime;
    ciSetup.recordValidation('playwright_setup', false, duration);
    console.error(`   ❌ Playwright validation failed: ${error.message}`);

    // Playwright is required for E2E tests
    throw new Error('Playwright is required for E2E testing');
  }
}

/**
 * Vercel Dev Server Health Check
 */
async function validateVercelDevServer() {
  console.log('\n🚀 Validating Vercel dev server startup...');
  const startTime = Date.now();

  const port = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);
  const serverUrl = `http://localhost:${port}`;

  try {
    // Check if server is already running
    try {
      const response = await fetch(`${serverUrl}/api/health/check`);
      if (response.ok) {
        console.log('   ✅ Vercel dev server already running');
        ciSetup.recordValidation('vercel_dev_server', true, Date.now() - startTime);
        return serverUrl;
      }
    } catch (error) {
      // Server not running, which is expected in CI setup
    }

    // Test that Vercel dev can start (we'll stop it immediately)
    const testProcess = spawn('vercel', ['dev', '--yes', '--listen', port.toString()], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: port.toString(),
        NODE_ENV: 'test',
        E2E_TEST_MODE: 'true'
      },
      stdio: 'pipe',
      detached: false
    });

    const serverReady = new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => {
        testProcess.kill();
        reject(new Error('Vercel dev server test startup timeout after 45 seconds'));
      }, 45000);

      testProcess.stdout.on('data', (data) => {
        output += data.toString();
        const message = data.toString();

        if (message.includes('ready') || message.includes('Ready') || message.includes('running')) {
          clearTimeout(timeout);
          testProcess.kill();
          console.log('   ✅ Vercel dev server can start successfully');
          resolve(true);
        }
      });

      testProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('Error') && !error.includes('Warning') && !error.includes('ExperimentalWarning')) {
          clearTimeout(timeout);
          testProcess.kill();
          reject(new Error(`Vercel dev server error: ${error.trim()}`));
        }
      });

      testProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start Vercel dev server test: ${error.message}`));
      });

      testProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          // Expected termination
          resolve(true);
        } else if (code !== 0) {
          reject(new Error(`Vercel dev server test exited with code ${code}`));
        }
      });
    });

    await serverReady;

    const duration = Date.now() - startTime;
    ciSetup.recordValidation('vercel_dev_server', true, duration);
    console.log(`   ⏱️  Vercel dev server validation completed in ${duration}ms`);

  } catch (error) {
    const duration = Date.now() - startTime;
    ciSetup.recordValidation('vercel_dev_server', false, duration);
    console.error(`   ❌ Vercel dev server validation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Database Migration Execution and Verification
 */
async function executeDatabaseMigrations() {
  console.log('\n🔄 Executing database migrations...');
  const startTime = Date.now();

  const migrationScript = resolve(projectRoot, 'scripts/migrate-e2e.js');

  if (!existsSync(migrationScript)) {
    console.log('   ℹ️  E2E migration script not found, skipping migrations');
    ciSetup.recordValidation('database_migrations', true, Date.now() - startTime);
    return;
  }

  return new Promise((resolve, reject) => {
    const migration = spawn('node', [migrationScript, 'up'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        E2E_TEST_MODE: 'true',
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });

    let output = '';
    let hasError = false;

    migration.stdout.on('data', (data) => {
      const message = data.toString();
      output += message;
      console.log(`   ${message.trim()}`);
    });

    migration.stderr.on('data', (data) => {
      const error = data.toString();
      console.error(`   ⚠️  ${error.trim()}`);
      if (!error.includes('Warning')) {
        hasError = true;
      }
    });

    migration.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code === 0 && !hasError) {
        console.log('   ✅ Database migrations completed successfully');
        ciSetup.recordValidation('database_migrations', true, duration);
        console.log(`   ⏱️  Migrations completed in ${duration}ms`);
        resolve();
      } else {
        console.error(`   ❌ Migration failed with code ${code}`);
        ciSetup.recordValidation('database_migrations', false, duration);

        // Save migration output as artifact
        try {
          const artifactPath = resolve(projectRoot, '.tmp/ci/migration-output.log');
          writeFileSync(artifactPath, output);
          ciSetup.addArtifact('migration_log', artifactPath);
        } catch (writeError) {
          console.error(`   ⚠️  Failed to save migration log: ${writeError.message}`);
        }

        if (process.env.STRICT_MIGRATION_VALIDATION === 'true') {
          reject(new Error('Database migration validation failed'));
        } else {
          console.log('   ⚠️  Continuing despite migration issues');
          resolve();
        }
      }
    });

    setTimeout(() => {
      if (!migration.killed) {
        migration.kill();
        reject(new Error('Migration timeout after 60 seconds'));
      }
    }, 60000);
  });
}

/**
 * Pre-test Warmup Procedures for Vercel Dev Server
 */
async function executeWarmupProcedures() {
  console.log('\n🔥 Executing pre-test warmup procedures...');
  const startTime = Date.now();

  const port = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);
  const serverUrl = `http://localhost:${port}`;

  try {
    // Essential endpoints to warmup
    const endpoints = [
      '/api/health/check',
      '/api/health/database',
      '/api/gallery',
      '/api/featured-photos'
    ];

    console.log(`   🌐 Warming up ${endpoints.length} endpoints on ${serverUrl}...`);

    const warmupPromises = endpoints.map(async (endpoint) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${serverUrl}${endpoint}`, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        return { endpoint, status: response.status, ok: response.ok };
      } catch (error) {
        return { endpoint, error: error.message };
      }
    });

    const results = await Promise.all(warmupPromises);

    let successCount = 0;
    results.forEach(result => {
      if (result.ok) {
        console.log(`      ✅ ${result.endpoint} (${result.status})`);
        successCount++;
      } else {
        console.log(`      ⚠️  ${result.endpoint} (${result.error || result.status})`);
      }
    });

    console.log(`   ✅ Warmed up ${successCount}/${endpoints.length} endpoints`);

    const duration = Date.now() - startTime;
    ciSetup.recordValidation('warmup_procedures', true, duration);
    console.log(`   ⏱️  Warmup completed in ${duration}ms`);

  } catch (error) {
    const duration = Date.now() - startTime;
    ciSetup.recordValidation('warmup_procedures', false, duration);
    console.error(`   ❌ Warmup failed: ${error.message}`);

    if (process.env.STRICT_WARMUP === 'true') {
      throw error;
    } else {
      console.log('   ⚠️  Continuing without warmup');
    }
  }
}

/**
 * Generate setup report and save artifacts
 */
async function generateSetupReport() {
  console.log('\n📊 Generating setup report...');

  const state = await ciSetup.ensureInitialized();
  const endTime = Date.now();

  state.metrics.totalDuration = endTime - state.startTime;

  const report = {
    timestamp: new Date().toISOString(),
    duration: state.metrics,
    validations: Object.fromEntries(state.validations),
    artifacts: state.artifacts,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      ci: process.env.CI,
      environment: process.env.NODE_ENV,
      port: process.env.PORT,
      vercelMode: true
    },
    processes: Array.from(state.processes.keys()),
    summary: {
      totalValidations: state.validations.size,
      passedValidations: Array.from(state.validations.values()).filter(v => v.result).length,
      failedValidations: Array.from(state.validations.values()).filter(v => !v.result).length
    }
  };

  try {
    const reportPath = resolve(projectRoot, '.tmp/ci/setup-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`   📄 Setup report saved: ${reportPath}`);
    console.log(`   ⏱️  Total duration: ${report.duration.totalDuration}ms`);
    console.log(`   ✅ Validations passed: ${report.summary.passedValidations}/${report.summary.totalValidations}`);

    if (report.summary.failedValidations > 0) {
      console.log(`   ❌ Validations failed: ${report.summary.failedValidations}`);
    }
  } catch (error) {
    console.error(`   ❌ Failed to save setup report: ${error.message}`);
  }

  return report;
}

/**
 * Main CI setup function for Vercel E2E Testing
 */
async function main() {
  console.log('\n🎯 CI Environment Setup and Validation - Vercel E2E Mode');
  console.log('═'.repeat(70));
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    // Initialize CI setup manager
    await ciSetup.ensureInitialized();

    // Execute setup phases
    await validateEnvironmentVariables();
    await validateVercelCLI();
    await validateDatabaseConnection();
    await validatePlaywrightSetup();
    await executeDatabaseMigrations();
    await validateVercelDevServer();
    await executeWarmupProcedures();

    // Generate final report
    const report = await generateSetupReport();

    console.log('\n✅ CI setup completed successfully!');
    console.log('🚀 Ready for Vercel E2E testing with dev server');
    console.log('═'.repeat(70));

    // Exit with success
    process.exit(0);

  } catch (error) {
    console.error('\n❌ CI setup failed:', error.message);

    // Try to generate partial report
    try {
      await generateSetupReport();
    } catch (reportError) {
      console.error('   Failed to generate error report:', reportError.message);
    }

    console.log('═'.repeat(70));
    process.exit(1);
  }
}

// Handle process signals for cleanup
process.on('SIGINT', async () => {
  console.log('\n⚠️  Received SIGINT, cleaning up...');

  try {
    const state = await ciSetup.ensureInitialized();

    // Kill any spawned processes
    for (const [name, process] of state.processes) {
      if (!process.killed) {
        console.log(`   🛑 Stopping ${name}...`);
        process.kill('SIGTERM');
      }
    }
  } catch (error) {
    console.error('   ⚠️  Cleanup error:', error.message);
  }

  process.exit(130);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Received SIGTERM, cleaning up...');

  try {
    const state = await ciSetup.ensureInitialized();

    // Graceful shutdown
    for (const [name, process] of state.processes) {
      if (!process.killed) {
        console.log(`   🛑 Gracefully stopping ${name}...`);
        process.kill('SIGTERM');
      }
    }
  } catch (error) {
    console.error('   ⚠️  Cleanup error:', error.message);
  }

  setTimeout(() => process.exit(143), 5000);
});

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;