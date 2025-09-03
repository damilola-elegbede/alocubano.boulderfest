#!/usr/bin/env node

/**
 * Vercel Dev Server for E2E Testing
 * 
 * This script provides a bulletproof way to start Vercel Dev for E2E tests
 * without recursion, hanging, or configuration conflicts.
 * 
 * Key Features:
 * - No recursive invocation (uses direct vercel command)
 * - Automatic environment setup
 * - Health check validation
 * - Clean process management
 * - **FIXED**: Vercel authentication with --token, --scope, and --no-clipboard flags
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const execAsync = promisify(exec);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');

class VercelDevE2E {
  constructor() {
    // Configurable timeouts via environment variables for CI/CD flexibility
    const STARTUP_TIMEOUT = Number(process.env.E2E_STARTUP_TIMEOUT || 60000);
    const HEALTH_CHECK_INTERVAL = Number(process.env.E2E_HEALTH_CHECK_INTERVAL || 2000);
    const MAX_HEALTH_CHECKS = Math.ceil(STARTUP_TIMEOUT / HEALTH_CHECK_INTERVAL);
    
    this.options = {
      port: parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10),
      host: 'localhost',
      healthEndpoint: '/api/health/check',
      startupTimeout: STARTUP_TIMEOUT, // Configurable startup timeout
      healthCheckInterval: HEALTH_CHECK_INTERVAL, // Configurable health check interval
      maxHealthChecks: MAX_HEALTH_CHECKS, // Calculated max attempts based on timeout
    };
    
    this.vercelProcess = null;
    this.isShuttingDown = false;
  }

  /**
   * Build Vercel command with authentication
   */
  buildVercelCommand() {
    const args = [
      'vercel',
      'dev',
      '--yes', // Skip all prompts
      '--listen', `${this.options.port}`, // Bind to specific port
      '--no-clipboard' // Prevent clipboard operations
    ];
    
    // Add authentication if token is available
    if (process.env.VERCEL_TOKEN) {
      args.push('--token', process.env.VERCEL_TOKEN);
      console.log('   ✅ Using VERCEL_TOKEN for authentication');
    }
    
    // Add scope if org ID is available
    if (process.env.VERCEL_ORG_ID) {
      args.push('--scope', process.env.VERCEL_ORG_ID);
      console.log('   ✅ Using VERCEL_ORG_ID as scope');
    }
    
    return args;
  }

  /**
   * Main entry point
   */
  async start() {
    console.log('🚀 Vercel Dev E2E Server');
    console.log('=' .repeat(50));
    console.log(`📡 Port: ${this.options.port}`);
    console.log(`🔍 Health endpoint: ${this.options.healthEndpoint}`);
    console.log(`🔐 Auth: ${process.env.VERCEL_TOKEN ? 'configured' : 'not configured'}`);
    console.log('');

    try {
      // Setup environment
      await this.setupEnvironment();
      
      // Kill any existing processes
      await this.killExistingProcesses();
      
      // Start Vercel Dev
      await this.startVercelDev();
      
      // Wait for server to be ready
      await this.waitForServerReady();
      
      console.log('');
      console.log('✅ Vercel Dev is ready for E2E testing!');
      console.log(`🌐 Server: http://${this.options.host}:${this.options.port}`);
      console.log(`📊 Health: http://${this.options.host}:${this.options.port}${this.options.healthEndpoint}`);
      console.log('');
      console.log('Press Ctrl+C to stop the server');
      
      // Keep the process alive
      await this.keepAlive();
      
    } catch (error) {
      console.error('❌ Failed to start Vercel Dev:', error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Setup environment for E2E testing
   */
  async setupEnvironment() {
    console.log('🔧 Setting up E2E environment...');
    
    // Ensure required environment variables
    process.env.NODE_ENV = 'development';
    process.env.E2E_TEST_MODE = 'true';
    process.env.PORT = this.options.port.toString();
    
    // Skip database initialization to prevent hanging
    process.env.SKIP_DATABASE_INIT = 'true';
    process.env.VERCEL_DEV_STARTUP = 'true';
    
    // Ensure .env.local exists with minimal config
    const envLocalPath = resolve(projectRoot, '.env.local');
    if (!existsSync(envLocalPath)) {
      const minimalEnv = `# E2E Testing Environment
NODE_ENV=development
E2E_TEST_MODE=true
PORT=${this.options.port}

# Database Configuration (Turso required for E2E)
TURSO_DATABASE_URL=${process.env.TURSO_DATABASE_URL || ''}
TURSO_AUTH_TOKEN=${process.env.TURSO_AUTH_TOKEN || ''}

# Admin Configuration
TEST_ADMIN_PASSWORD=${process.env.TEST_ADMIN_PASSWORD || 'test-password'}
ADMIN_SECRET=${process.env.ADMIN_SECRET || 'test-secret-key-for-e2e-testing-only'}
ADMIN_PASSWORD=${process.env.ADMIN_PASSWORD || '$2a$10$YourHashedPasswordHere'}
`;
      writeFileSync(envLocalPath, minimalEnv);
      console.log('   ✅ Created .env.local for E2E testing');
    }
    
    // Ensure data directory exists
    const dataDir = resolve(projectRoot, 'data');
    if (!existsSync(dataDir)) {
      await execAsync(`mkdir -p ${dataDir}`);
      console.log('   ✅ Created data directory');
    }
    
    console.log('   ✅ Environment ready');
  }

  /**
   * Kill any existing processes on our port
   */
  async killExistingProcesses() {
    console.log('🧹 Cleaning up existing processes...');
    
    try {
      // Kill processes on our port
      const { stdout } = await execAsync(`lsof -ti:${this.options.port}`, { timeout: 5000 });
      if (stdout.trim()) {
        const pids = stdout.trim().split('\n');
        for (const pid of pids) {
          try {
            await execAsync(`kill -9 ${pid}`, { timeout: 2000 });
            console.log(`   ✅ Killed process ${pid} on port ${this.options.port}`);
          } catch {
            // Process might already be dead
          }
        }
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch {
      // No processes to kill - this is fine
    }
    
    // Also kill any vercel dev processes
    try {
      await execAsync('pkill -f "vercel.*dev" || true', { timeout: 5000 });
    } catch {
      // No processes to kill
    }
    
    console.log('   ✅ Process cleanup complete');
  }

  /**
   * Start Vercel Dev server
   */
  async startVercelDev() {
    console.log('🚀 Starting Vercel Dev server...');
    
    return new Promise((resolve, reject) => {
      const args = this.buildVercelCommand();
      
      // Environment for the process
      const env = {
        ...process.env,
        NODE_ENV: 'development',
        E2E_TEST_MODE: 'true',
        PORT: this.options.port.toString(),
        SKIP_DATABASE_INIT: 'true',
        VERCEL_DEV_STARTUP: 'true',
        // Prevent interactive prompts
        FORCE_COLOR: '0', // Disable color output for cleaner logs
        CI: 'false', // Not in CI mode
        VERCEL_NON_INTERACTIVE: '1',
        NO_UPDATE_NOTIFIER: '1'
      };
      
      console.log(`   📦 Command: npx ${args.join(' ')}`);
      console.log(`   🔐 Authentication: ${process.env.VERCEL_TOKEN ? 'enabled' : 'disabled'}`);
      
      // Spawn the process
      this.vercelProcess = spawn('npx', args, {
        cwd: projectRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin to prevent prompts
        detached: false,
      });
      
      // Handle stdout
      this.vercelProcess.stdout.on('data', (data) => {
        const message = data.toString();
        // Log with prefix for clarity
        process.stdout.write(`   [vercel] ${message}`);
      });
      
      // Handle stderr (filter out warnings)
      this.vercelProcess.stderr.on('data', (data) => {
        const message = data.toString();
        // Filter out common non-error messages
        if (!message.includes('Warning') && 
            !message.includes('ExperimentalWarning') &&
            !message.includes('Listening on')) {
          process.stderr.write(`   [vercel] ${message}`);
        }
      });
      
      // Handle process errors
      this.vercelProcess.on('error', (error) => {
        console.error('   ❌ Process error:', error.message);
        reject(error);
      });
      
      // Handle unexpected exit
      this.vercelProcess.on('exit', (code, signal) => {
        if (!this.isShuttingDown) {
          console.error(`   ⚠️  Vercel Dev exited unexpectedly (code: ${code}, signal: ${signal})`);
          reject(new Error(`Vercel Dev exited with code ${code}`));
        }
      });
      
      // Setup signal handlers for graceful shutdown
      const handleShutdown = async (signal) => {
        if (this.isShuttingDown) return;
        
        console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
        this.isShuttingDown = true;
        
        await this.cleanup();
        process.exit(0);
      };
      
      process.on('SIGINT', () => handleShutdown('SIGINT'));
      process.on('SIGTERM', () => handleShutdown('SIGTERM'));
      
      // Resolve immediately - we'll check health separately
      resolve();
    });
  }

  /**
   * Wait for the server to be ready by checking health endpoint
   */
  async waitForServerReady() {
    console.log('⏳ Waiting for server to be ready...');
    
    const url = `http://${this.options.host}:${this.options.port}${this.options.healthEndpoint}`;
    let attempts = 0;
    
    while (attempts < this.options.maxHealthChecks) {
      attempts++;
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          timeout: 5000,
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'healthy' || data.ok) {
            console.log('   ✅ Server is healthy and ready!');
            return;
          }
        }
      } catch (error) {
        // Server not ready yet
        if (attempts === 1) {
          console.log(`   ⏳ Server starting up...`);
        } else if (attempts % 5 === 0) {
          console.log(`   ⏳ Still waiting... (${attempts * 2} seconds)`);
        }
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, this.options.healthCheckInterval));
    }
    
    throw new Error(`Server failed to become ready after ${this.options.maxHealthChecks * 2} seconds`);
  }

  /**
   * Keep the process alive
   */
  async keepAlive() {
    // Keep the process running
    return new Promise(() => {
      // This promise never resolves, keeping the process alive
      // It will be terminated by signal handlers
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    if (this.vercelProcess && !this.vercelProcess.killed) {
      try {
        this.vercelProcess.kill('SIGTERM');
        
        // Give it time to shut down gracefully
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Force kill if still running
        if (!this.vercelProcess.killed) {
          this.vercelProcess.kill('SIGKILL');
        }
        
        console.log('   ✅ Vercel Dev process terminated');
      } catch (error) {
        console.error('   ⚠️  Error terminating process:', error.message);
      }
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const portIndex = args.findIndex(arg => arg === '--port' || arg === '-p');
if (portIndex !== -1 && args[portIndex + 1]) {
  process.env.PORT = args[portIndex + 1];
}

// Check if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new VercelDevE2E();
  server.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default VercelDevE2E;