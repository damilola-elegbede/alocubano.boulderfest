#!/usr/bin/env node

/**
 * DEPRECATED: Vercel Dev CI Server Script
 *
 * This script is DEPRECATED as of the migration to Vercel Preview Deployments for E2E testing.
 * Local Vercel dev servers are no longer used for E2E testing in CI/CD pipelines.
 *
 * REPLACEMENT: E2E tests now use Vercel Preview Deployments which provide:
 * - Real production environment testing
 * - No local server management complexity
 * - Better CI/CD integration
 * - Eliminated port conflicts and server hanging issues
 *
 * LEGACY PURPOSE:
 * This script was used for starting Vercel Dev on dynamic ports (3000-3005)
 * for parallel test execution with comprehensive health checking.
 *
 * @deprecated Use Vercel Preview Deployments for E2E testing instead
 * @see CI/CD workflows for current E2E testing approach
 */

import { spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

class VercelDevCIServer {
  constructor() {
    // Read port from DYNAMIC_PORT (CI primary) or PORT (fallback)
    this.port = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);
    this.serverUrl = `http://localhost:${this.port}`;
    this.isHealthy = false;
    this.vercelProcess = null;
    this.startupTimeout = 90000; // 90 seconds for CI
    this.healthCheckRetries = 3;
    this.shutdownTimeout = 10000; // 10 seconds for graceful shutdown

    console.log(`🚀 Vercel Dev CI Server`);
    console.log(`   Port: ${this.port} (DYNAMIC_PORT=${process.env.DYNAMIC_PORT}, PORT=${process.env.PORT})`);
    console.log(`   URL: ${this.serverUrl}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'test'}`);
    console.log(`   Database: Port-isolated (${this.port})`);
    console.log(`   Auth: ${process.env.VERCEL_TOKEN ? 'configured' : 'not configured'}`);
  }

  /**
   * Build Vercel command with authentication
   */
  buildVercelCommand() {
    const args = [
      'vercel',
      'dev',
      '--yes', // Non-interactive mode
      '--listen', `0.0.0.0:${this.port}`
      // Removed --no-clipboard as it's not supported in this Vercel CLI version
    ];

    // Require authentication - fail immediately if missing
    if (!process.env.VERCEL_TOKEN) {
      throw new Error('❌ FATAL: VERCEL_TOKEN secret not configured');
    }
    if (!process.env.VERCEL_ORG_ID) {
      throw new Error('❌ FATAL: VERCEL_ORG_ID secret not configured');
    }

    args.push('--token', process.env.VERCEL_TOKEN);
    console.log('   ✅ Using VERCEL_TOKEN for authentication');

    args.push('--scope', process.env.VERCEL_ORG_ID);
    console.log('   ✅ Using VERCEL_ORG_ID as scope');

    return args;
  }

  /**
   * Main startup method
   */
  async start() {
    try {
      console.log('\n🔧 Starting Vercel Dev CI Server...');
      console.log('═'.repeat(60));

      await this.validateEnvironment();
      await this.setupEnvironmentFiles();
      await this.clearPortConflicts();
      await this.startVercelDev();
      await this.waitForHealth();

      console.log('\n✅ Vercel Dev CI Server ready!');
      console.log(`🌐 Health check: ${this.serverUrl}/api/health/check`);
      console.log(`📊 Database: ${(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) ? 'Turso (production-like)' : 'SQLite (fallback)'}`);
      console.log(`🔐 Authentication: ${process.env.VERCEL_TOKEN ? 'enabled' : 'disabled'}`);
      console.log('═'.repeat(60));

      this.setupSignalHandlers();
      return this.serverUrl;

    } catch (error) {
      console.error(`\n❌ Failed to start Vercel Dev CI Server: ${error.message}`);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Validate environment and prerequisites
   */
  async validateEnvironment() {
    console.log('🔍 Validating CI environment...');

    // Validate port range (3000-3005 for CI matrix)
    if (this.port < 3000 || this.port > 3005) {
      throw new Error(`Invalid port ${this.port}. CI supports ports 3000-3005 only.`);
    }

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      throw new Error(`Node.js ${nodeVersion} is unsupported. Requires 18+`);
    }

    // Verify Vercel CLI availability
    try {
      const { spawn } = await import('child_process');
      await new Promise((resolve, reject) => {
        const vercel = spawn('vercel', ['--version'], { stdio: 'pipe', timeout: 10000 });
        vercel.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Vercel CLI not available (exit code: ${code})`));
          }
        });
        vercel.on('error', reject);
      });
    } catch (error) {
      throw new Error(`Vercel CLI validation failed: ${error.message}`);
    }

    // Add better environment debugging
    console.log('📋 Environment Configuration:');
    console.log(`   CI: ${process.env.CI || 'false'}`);
    console.log(`   Node Env: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Turso URL: ${process.env.TURSO_DATABASE_URL ? '✅ Set' : '❌ Not set'}`);
    console.log(`   Turso Token: ${process.env.TURSO_AUTH_TOKEN ? '✅ Set' : '❌ Not set'}`);
    console.log(`   Fallback DB: ${process.env.DATABASE_URL || 'Not configured'}`);

    // Check for CI-specific variable names as fallback
    if (!process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL_CI) {
      process.env.TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL_CI;
      console.log('   🔄 Using TURSO_DATABASE_URL_CI as fallback');
    }
    if (!process.env.TURSO_AUTH_TOKEN && process.env.TURSO_AUTH_TOKEN_CI) {
      process.env.TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN_CI;
      console.log('   🔄 Using TURSO_AUTH_TOKEN_CI as fallback');
    }

    // In CI, Turso credentials might be optional or use different names
    const requiredVars = [];

    // Only require Turso in production-like environments
    if (process.env.REQUIRE_TURSO === 'true') {
      requiredVars.push('TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN');
    }

    const missingVars = requiredVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
      console.warn(`⚠️  Missing optional E2E variables: ${missingVars.join(', ')}`);
      console.warn('   Using SQLite fallback for E2E testing');
      // Don't throw error - use fallback instead
      process.env.DATABASE_URL = 'file:./data/test.db';
    } else if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
      console.warn('⚠️  Turso credentials not available, using SQLite fallback');
      process.env.DATABASE_URL = 'file:./data/test.db';
    }

    console.log('   ✅ Environment validation passed');
    console.log(`   Node.js: ${nodeVersion}`);
    console.log(`   Port: ${this.port} (in valid range 3000-3005)`);

    // Log which database configuration will be used
    if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
      console.log(`   Database: Turso (production-like E2E testing)`);
    } else {
      console.log(`   Database: SQLite fallback (local E2E testing)`);
    }
  }

  /**
   * Setup port-specific environment files
   */
  async setupEnvironmentFiles() {
    console.log('📁 Setting up port-specific environment...');

    // Create .tmp directory for port-specific configs
    const tmpDir = resolve(projectRoot, '.tmp');
    const portDir = resolve(tmpDir, `port-${this.port}`);

    try {
      await mkdir(tmpDir, { recursive: true });
      await mkdir(portDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directories: ${error.message}`);
    }

    // Create port-specific environment configuration
    const portEnvPath = resolve(portDir, 'ci.env');

    // Determine database configuration
    const hasTurso = process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN;
    const databaseConfig = hasTurso
      ? `# Database configuration (production-like with Turso)
TURSO_DATABASE_URL=${process.env.TURSO_DATABASE_URL}
TURSO_AUTH_TOKEN=${process.env.TURSO_AUTH_TOKEN}`
      : `# Database configuration (SQLite fallback for CI)
DATABASE_URL=file:./data/test.db
# TURSO_DATABASE_URL not available - using SQLite fallback
# TURSO_AUTH_TOKEN not available - using SQLite fallback`;

    const portConfig = `# Vercel Dev CI Configuration - Port ${this.port}
NODE_ENV=test
CI=true
E2E_TEST_MODE=true
PORT=${this.port}
DYNAMIC_PORT=${this.port}

${databaseConfig}

# CI-specific settings
VERCEL_DEV=1
VERCEL_NON_INTERACTIVE=1
DISABLE_DATABASE_WARMUP=false
SKIP_BROWSER_LAUNCH=true

# Test credentials (not production)
TEST_ADMIN_PASSWORD=${process.env.TEST_ADMIN_PASSWORD || 'test-password'}

# Performance settings for CI
NODE_OPTIONS=--max-old-space-size=3072
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Logging
DEBUG_PORT=${this.port}
LOG_LEVEL=info
`;

    writeFileSync(portEnvPath, portConfig);
    console.log(`   ✅ Port-specific environment created: ${portEnvPath}`);

    // Set environment variables for current process
    process.env.PORT = this.port.toString();
    process.env.DYNAMIC_PORT = this.port.toString();
    process.env.NODE_ENV = 'test';
    process.env.CI = 'true';
    process.env.E2E_TEST_MODE = 'true';
    process.env.VERCEL_DEV = '1';
    process.env.VERCEL_NON_INTERACTIVE = '1';

    // Ensure fallback database URL is set if Turso isn't available
    if (!hasTurso && !process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'file:./data/test.db';
    }

    console.log(`   ✅ Environment configured for port ${this.port}`);
    console.log(`   📊 Database: ${hasTurso ? 'Turso (production-like)' : 'SQLite (fallback)'}`);
  }

  /**
   * Clear any processes using the target port
   */
  async clearPortConflicts() {
    console.log(`🧹 Clearing port ${this.port} conflicts...`);

    try {
      const { execSync } = await import('child_process');

      // Check for processes on the port
      try {
        const output = execSync(`lsof -ti:${this.port}`, {
          encoding: 'utf8',
          timeout: 5000,
          stdio: 'pipe'
        }).trim();

        if (output) {
          console.log(`   🔫 Killing process ${output} on port ${this.port}`);
          execSync(`kill -9 ${output}`, { timeout: 5000 });

          // Wait for cleanup
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        // No processes on port - expected
      }

      // Kill any lingering vercel dev processes
      try {
        execSync('pkill -f "vercel.*dev" || true', { timeout: 5000 });
        console.log('   🔫 Cleared lingering Vercel dev processes');
      } catch (error) {
        // No lingering processes - expected
      }

    } catch (error) {
      console.warn(`   ⚠️  Port cleanup warning: ${error.message}`);
    }

    console.log(`   ✅ Port ${this.port} is clear`);
  }

  /**
   * Start Vercel Dev server with CI optimizations
   */
  async startVercelDev() {
    console.log(`🚀 Starting Vercel dev server on port ${this.port}...`);

    return new Promise((resolve, reject) => {
      const args = this.buildVercelCommand();

      // CI-optimized environment
      const env = {
        ...process.env,
        PORT: this.port.toString(),
        DYNAMIC_PORT: this.port.toString(),
        NODE_ENV: 'test',
        CI: 'true',
        E2E_TEST_MODE: 'true',
        VERCEL_DEV: '1',
        VERCEL_NON_INTERACTIVE: '1',
        // Prevent interactive prompts
        FORCE_COLOR: '0',
        NO_UPDATE_NOTIFIER: '1',
        CI_ENVIRONMENT: 'true'
      };

      console.log(`   📦 Command: npx ${args.join(' ')}`);
      console.log(`   🌍 Environment: CI-optimized, non-interactive`);
      console.log(`   🔐 Authentication: ${process.env.VERCEL_TOKEN ? 'enabled' : 'disabled'}`);

      this.vercelProcess = spawn('npx', args, {
        cwd: projectRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin to prevent hanging
        detached: false
      });

      let output = '';
      let hasStarted = false;

      // Startup timeout protection
      const timeout = setTimeout(() => {
        if (!hasStarted) {
          console.error(`❌ Vercel dev startup timeout after ${this.startupTimeout}ms`);
          this.cleanup();
          reject(new Error(`Server startup timeout on port ${this.port}`));
        }
      }, this.startupTimeout);

      // Monitor stdout for startup indicators
      this.vercelProcess.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;

        // Look for startup success patterns
        const successPatterns = [
          /ready/i,
          /running/i,
          /started/i,
          /listening/i,
          new RegExp(`localhost:${this.port}`, 'i'),
          new RegExp(`0\\.0\\.0\\.0:${this.port}`, 'i')
        ];

        if (successPatterns.some(pattern => pattern.test(message))) {
          if (!hasStarted) {
            hasStarted = true;
            clearTimeout(timeout);
            console.log('   ✅ Vercel dev server started');
            console.log(`   🌐 Server URL: ${this.serverUrl}`);
            resolve();
          }
        }

        // Log important messages (filtered)
        const lines = message.split('\n');
        lines.forEach(line => {
          if (line.trim() &&
              !line.includes('Warning') &&
              !line.includes('ExperimentalWarning') &&
              (line.includes('ready') ||
               line.includes('Running') ||
               line.includes('Error') ||
               line.includes(this.port.toString()))) {
            console.log(`      ${line.trim()}`);
          }
        });
      });

      // Monitor stderr for critical errors
      this.vercelProcess.stderr.on('data', (data) => {
        const message = data.toString();

        // Filter out warnings and focus on actual errors
        if (message.includes('Error') &&
            !message.includes('Warning') &&
            !message.includes('ExperimentalWarning')) {
          console.error(`   ❌ ${message.trim()}`);
        }
      });

      // Handle process errors
      this.vercelProcess.on('error', (error) => {
        clearTimeout(timeout);
        if (!hasStarted) {
          reject(new Error(`Process error: ${error.message}`));
        }
      });

      // Handle unexpected exit
      this.vercelProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (!hasStarted && code !== 0) {
          reject(new Error(`Vercel dev exited unexpectedly (code: ${code}, signal: ${signal})`));
        }
      });
    });
  }

  /**
   * Wait for server health with retries
   */
  async waitForHealth() {
    console.log(`🏥 Waiting for server health check...`);

    const healthUrl = `${this.serverUrl}/api/health/check`;
    let retries = 0;

    while (retries < this.healthCheckRetries) {
      try {
        console.log(`   🔍 Health check attempt ${retries + 1}/${this.healthCheckRetries}: ${healthUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(healthUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Vercel-Dev-CI-Health-Check'
          }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          console.log(`   ✅ Health check passed (${response.status})`);
          console.log(`   📊 Response: ${JSON.stringify(data, null, 2).replace(/\n/g, '\n      ')}`);
          this.isHealthy = true;
          return;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

      } catch (error) {
        retries++;
        console.log(`   ⚠️  Health check failed (${retries}/${this.healthCheckRetries}): ${error.message}`);

        if (retries < this.healthCheckRetries) {
          const waitTime = Math.min(2000 * retries, 10000); // Exponential backoff, max 10s
          console.log(`   ⏳ Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw new Error(`Health check failed after ${this.healthCheckRetries} attempts`);
  }

  /**
   * Setup graceful shutdown signal handlers
   */
  setupSignalHandlers() {
    const handleSignal = (signal) => {
      console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
      this.gracefulShutdown()
        .then(() => {
          console.log('✅ Graceful shutdown completed');
          process.exit(0);
        })
        .catch((error) => {
          console.error(`❌ Shutdown error: ${error.message}`);
          process.exit(1);
        });
    };

    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));

    // Keep process alive for CI
    process.stdin.resume();
  }

  /**
   * Graceful shutdown with cleanup
   */
  async gracefulShutdown() {
    console.log('🧹 Cleaning up Vercel Dev CI Server...');

    if (this.vercelProcess && !this.vercelProcess.killed) {
      console.log('   🛑 Stopping Vercel dev server...');

      // Try graceful shutdown first
      this.vercelProcess.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          console.log('   🔫 Force killing Vercel dev server...');
          if (!this.vercelProcess.killed) {
            this.vercelProcess.kill('SIGKILL');
          }
          resolve();
        }, this.shutdownTimeout);

        this.vercelProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.isHealthy = false;
    console.log('   ✅ Cleanup completed');
  }

  /**
   * Emergency cleanup (non-graceful)
   */
  async cleanup() {
    if (this.vercelProcess && !this.vercelProcess.killed) {
      this.vercelProcess.kill('SIGKILL');
    }
    this.isHealthy = false;
  }
}

/**
 * Health check endpoint for external validation
 */
export async function healthCheck(port = 3000) {
  const serverUrl = `http://localhost:${port}`;
  const healthUrl = `${serverUrl}/api/health/check`;

  try {
    const response = await fetch(healthUrl, { timeout: 5000 });
    const data = await response.json();

    return {
      healthy: response.ok,
      status: response.status,
      port,
      url: serverUrl,
      data
    };
  } catch (error) {
    return {
      healthy: false,
      port,
      url: serverUrl,
      error: error.message
    };
  }
}

/**
 * Port availability checker
 */
export async function checkPortAvailable(port) {
  try {
    const { execSync } = await import('child_process');
    execSync(`lsof -ti:${port}`, { stdio: 'pipe', timeout: 2000 });
    return false; // Port is in use
  } catch (error) {
    return true; // Port is available
  }
}

// Main execution when called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new VercelDevCIServer();

  // Handle command line arguments
  const args = process.argv.slice(2);

  if (args.includes('--health-check')) {
    const port = parseInt(args[args.indexOf('--port') + 1] || process.env.DYNAMIC_PORT || process.env.PORT || '3000');
    healthCheck(port).then(result => {
      console.log('Health Check Result:', JSON.stringify(result, null, 2));
      process.exit(result.healthy ? 0 : 1);
    }).catch(error => {
      console.error('Health check error:', error.message);
      process.exit(1);
    });
  } else {
    // Start server
    server.start().catch(error => {
      console.error('Startup failed:', error.message);
      process.exit(1);
    });
  }
}

export default VercelDevCIServer;