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
 * - **FIXED**: Process killing race condition resolved (removed aggressive pkill commands)
 * - **FIXED**: Enhanced authentication validation
 * - **FIXED**: Better error diagnostics and state tracking
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
    this.processState = 'initializing'; // State tracking for better diagnostics
    this.startTime = null;
    this.lastHealthCheckTime = null;
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
      // Removed --no-clipboard as it's not supported in this Vercel CLI version
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
   * Validate Vercel authentication before starting
   */
  async validateVercelAuth() {
    console.log('🔐 Validating Vercel authentication...');
    
    // Check for required tokens
    if (!process.env.VERCEL_TOKEN) {
      console.warn('   ⚠️  VERCEL_TOKEN not found - may cause authentication issues');
      console.warn('   💡 Set VERCEL_TOKEN in GitHub Secrets for CI authentication');
      
      // In CI, this is more critical
      if (process.env.CI === 'true') {
        console.error('   ❌ VERCEL_TOKEN is required in CI environment');
        return false;
      }
    }
    
    if (!process.env.VERCEL_ORG_ID) {
      console.warn('   ⚠️  VERCEL_ORG_ID not found - may cause scope issues');
      console.warn('   💡 Set VERCEL_ORG_ID in GitHub Secrets for proper scope');
    }
    
    // If we have a token, try to validate it
    if (process.env.VERCEL_TOKEN) {
      try {
        const command = process.env.VERCEL_ORG_ID 
          ? `npx vercel whoami --token ${process.env.VERCEL_TOKEN} --scope ${process.env.VERCEL_ORG_ID}`
          : `npx vercel whoami --token ${process.env.VERCEL_TOKEN}`;
          
        const result = await execAsync(command, { timeout: 10000 });
        console.log('   ✅ Vercel authentication validated');
        return true;
      } catch (error) {
        console.error('   ❌ Vercel authentication failed:', error.message);
        console.error('   💡 Please check VERCEL_TOKEN and VERCEL_ORG_ID in GitHub Secrets');
        
        // In CI, this is a fatal error
        if (process.env.CI === 'true') {
          return false;
        }
      }
    }
    
    // If not in CI and no token, we can try to proceed (might work with local auth)
    if (process.env.CI !== 'true') {
      console.log('   ℹ️  Proceeding without explicit authentication (local mode)');
      return true;
    }
    
    return false;
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
    console.log(`🌍 Environment: ${process.env.CI === 'true' ? 'CI' : 'Local'}`);
    console.log('');

    this.startTime = Date.now();

    try {
      // Validate Vercel authentication first
      const authValid = await this.validateVercelAuth();
      if (!authValid && process.env.CI === 'true') {
        throw new Error('Vercel authentication required in CI environment');
      }
      
      // Setup environment
      await this.setupEnvironment();
      
      // Kill any existing processes (with protection)
      await this.killExistingProcesses();
      
      // Start Vercel Dev
      await this.startVercelDev();
      
      // Wait for server to be ready
      await this.waitForServerReady();
      
      const startupTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
      console.log('');
      console.log('✅ Vercel Dev is ready for E2E testing!');
      console.log(`🌐 Server: http://${this.options.host}:${this.options.port}`);
      console.log(`📊 Health: http://${this.options.host}:${this.options.port}${this.options.healthEndpoint}`);
      console.log(`⏱️  Startup time: ${startupTime}s`);
      console.log('');
      console.log('Press Ctrl+C to stop the server');
      
      this.processState = 'running';
      
      // Keep the process alive
      await this.keepAlive();
      
    } catch (error) {
      console.error('❌ Failed to start Vercel Dev:', error.message);
      this.processState = 'failed';
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
   * Kill any existing processes on our port (with protection against self-termination)
   */
  async killExistingProcesses() {
    console.log('🧹 Cleaning up existing processes...');
    
    // Mark that we're in startup phase - prevents cleanup from affecting us
    this.processState = 'cleaning-up';
    
    // Store current process PID to protect it
    const currentPid = process.pid;
    console.log(`   ℹ️  Current process PID: ${currentPid} (protected)`);
    
    try {
      // Only kill processes on our specific port
      const { stdout } = await execAsync(`lsof -ti:${this.options.port}`, { timeout: 5000 });
      if (stdout.trim()) {
        const pids = stdout.trim().split('\n').filter(pid => pid.trim());
        console.log(`   📊 Found ${pids.length} process(es) on port ${this.options.port}`);
        
        let killedCount = 0;
        for (const pid of pids) {
          const pidNum = parseInt(pid.trim());
          
          // Skip invalid PIDs and our own process
          if (isNaN(pidNum) || pidNum === currentPid) {
            if (pidNum === currentPid) {
              console.log(`   ⏭️  Skipping self (PID ${pid})`);
            }
            continue;
          }
          
          try {
            // Use SIGTERM first for graceful shutdown
            await execAsync(`kill -TERM ${pidNum}`, { timeout: 2000 });
            console.log(`   ✅ Sent SIGTERM to process ${pidNum}`);
            killedCount++;
            
            // Wait a bit for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check if still running and force kill if needed
            try {
              await execAsync(`kill -0 ${pidNum}`, { timeout: 1000 });
              // Still running, force kill
              await execAsync(`kill -KILL ${pidNum}`, { timeout: 1000 });
              console.log(`   ⚠️  Force killed stubborn process ${pidNum}`);
            } catch {
              // Process terminated gracefully - good
              console.log(`   ✅ Process ${pidNum} terminated gracefully`);
            }
          } catch (error) {
            // Process might already be dead or permission denied
            console.log(`   ℹ️  Process ${pidNum} cleanup: ${error.message}`);
          }
        }
        
        if (killedCount > 0) {
          // Give extra time for port to be fully released after killing processes
          console.log('   ⏳ Waiting for port to be fully released...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else {
        console.log(`   ✅ Port ${this.options.port} is clear`);
      }
    } catch (error) {
      // lsof failed - likely no processes on port
      console.log(`   ✅ Port ${this.options.port} is available (${error.message})`);
    }
    
    // NOTE: Completely removed aggressive pkill commands that were causing race conditions
    // The previous pkill commands were killing the process we're trying to start!
    
    // Instead, we only rely on port-specific cleanup above which is safer
    // No additional process killing is needed - if port is clear, we're good to go
    
    // Final verification that port is truly available
    try {
      const { stdout } = await execAsync(`lsof -ti:${this.options.port}`, { timeout: 2000 });
      if (stdout.trim()) {
        throw new Error(`Port ${this.options.port} is still occupied after cleanup`);
      }
    } catch (error) {
      if (error.message.includes('still occupied')) {
        throw error;
      }
      // lsof error usually means no processes - good
    }
    
    console.log('   ✅ Process cleanup complete');
    
    // Small delay to ensure system state is stable before starting server
    console.log('   ⏳ Stabilizing system state...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.processState = 'ready-to-start';
  }

  /**
   * Start Vercel Dev server
   */
  async startVercelDev() {
    console.log('🚀 Starting Vercel Dev server...');
    this.processState = 'starting';
    
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
        CI: process.env.CI || 'false',
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
      
      // Track startup progress
      let startupComplete = false;
      let startupTimeout = null;
      
      // Set a timeout for startup detection
      startupTimeout = setTimeout(() => {
        if (!startupComplete && !this.isShuttingDown) {
          console.error('   ⚠️  Vercel Dev startup timeout - process may have failed silently');
          console.error('   💡 Check logs above for error messages');
        }
      }, 30000);
      
      // Handle stdout
      this.vercelProcess.stdout.on('data', (data) => {
        const message = data.toString();
        
        // Detect successful startup
        if (!startupComplete && (
          message.includes('Ready') || 
          message.includes('started on') || 
          message.includes('Listening') ||
          message.includes('Local:') ||
          message.includes(`http://localhost:${this.options.port}`)
        )) {
          startupComplete = true;
          clearTimeout(startupTimeout);
          console.log('   🎉 Vercel Dev startup detected!');
          this.processState = 'started';
        }
        
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
        this.processState = 'error';
        clearTimeout(startupTimeout);
        reject(error);
      });
      
      // Handle unexpected exit with better diagnostics
      this.vercelProcess.on('exit', (code, signal) => {
        if (!this.isShuttingDown) {
          console.error(`   ⚠️  Vercel Dev exited unexpectedly`);
          console.error(`   📊 Exit code: ${code}`);
          console.error(`   📡 Signal: ${signal}`);
          console.error(`   🕐 Process ran for: ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
          
          // Provide diagnostic information based on exit code
          if (code === 1) {
            console.error(`   💡 Possible causes:`);
            console.error(`      - Port ${this.options.port} already in use`);
            console.error(`      - Authentication failure (check VERCEL_TOKEN)`);
            console.error(`      - Missing project configuration`);
            console.error(`      - Database connection issues`);
          } else if (code === 127) {
            console.error(`   💡 Command not found - ensure Vercel CLI is installed`);
            console.error(`      Run: npm install -g vercel`);
          } else if (code === null && signal) {
            console.error(`   💡 Process was killed by signal: ${signal}`);
            console.error(`      This might indicate the process was terminated externally`);
          }
          
          this.processState = 'exited';
          clearTimeout(startupTimeout);
          reject(new Error(`Vercel Dev exited with code ${code} (signal: ${signal})`));
        }
      });
      
      // Setup signal handlers for graceful shutdown
      const handleShutdown = async (signal) => {
        if (this.isShuttingDown) return;
        
        console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
        this.isShuttingDown = true;
        this.processState = 'shutting-down';
        
        clearTimeout(startupTimeout);
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
    this.processState = 'health-checking';
    
    const url = `http://${this.options.host}:${this.options.port}${this.options.healthEndpoint}`;
    let attempts = 0;
    let lastError = null;
    
    while (attempts < this.options.maxHealthChecks) {
      attempts++;
      this.lastHealthCheckTime = Date.now();
      
      // Check if process is still alive before health check
      if (this.vercelProcess && this.vercelProcess.killed) {
        throw new Error('Vercel Dev process died during health checks');
      }
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          timeout: 5000,
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'healthy' || data.ok) {
            console.log('   ✅ Server is healthy and ready!');
            this.processState = 'ready';
            return;
          }
          lastError = `Health check returned: ${JSON.stringify(data)}`;
        } else {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (error) {
        lastError = error.message;
        
        // Provide more detailed feedback
        if (attempts === 1) {
          console.log(`   ⏳ Server starting up...`);
        } else if (attempts % 5 === 0) {
          const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
          console.log(`   ⏳ Still waiting... (${elapsed}s elapsed)`);
          console.log(`   📊 Last error: ${lastError}`);
          
          // Check process state
          if (this.vercelProcess) {
            if (this.vercelProcess.killed) {
              throw new Error('Vercel Dev process died during startup');
            }
            console.log(`   ℹ️  Process state: ${this.processState}`);
          }
        }
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, this.options.healthCheckInterval));
    }
    
    this.processState = 'failed';
    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    throw new Error(`Server failed to become ready after ${totalTime}s. Last error: ${lastError}`);
  }

  /**
   * Keep the process alive
   */
  async keepAlive() {
    // Keep the process running
    return new Promise(() => {
      // This promise never resolves, keeping the process alive
      // It will be terminated by signal handlers
      
      // Periodic health monitoring
      setInterval(() => {
        if (this.vercelProcess && !this.vercelProcess.killed && this.processState === 'running') {
          const uptime = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
          console.log(`   📊 Server healthy - uptime: ${uptime} minutes`);
        }
      }, 60000); // Log every minute
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    if (this.vercelProcess && !this.vercelProcess.killed) {
      try {
        // First try graceful shutdown
        console.log('   📤 Sending SIGTERM to Vercel Dev...');
        this.vercelProcess.kill('SIGTERM');
        
        // Give it time to shut down gracefully
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Force kill if still running
        if (!this.vercelProcess.killed) {
          console.log('   ⚠️  Process still running, sending SIGKILL...');
          this.vercelProcess.kill('SIGKILL');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('   ✅ Vercel Dev process terminated');
      } catch (error) {
        console.error('   ⚠️  Error terminating process:', error.message);
      }
    }
    
    // Clean up the port one final time
    try {
      await execAsync(`lsof -ti:${this.options.port} | xargs kill -9 2>/dev/null || true`, { timeout: 2000 });
    } catch {
      // Port cleanup failed - not critical
    }
    
    console.log('   ✅ Cleanup complete');
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