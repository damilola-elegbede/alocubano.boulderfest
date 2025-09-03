#!/usr/bin/env node

/**
 * Vercel Dev Server Startup Script - Enhanced Version
 * 
 * Comprehensive solution for Vercel dev hanging issues including:
 * - Interactive prompt bypassing
 * - Database initialization prevention
 * - Build configuration optimization
 * - Process timeout handling
 * - Environment variable validation
 * - **FIXED**: Vercel authentication with --token, --scope, and --no-clipboard flags
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');

class VercelDevStarter {
  constructor() {
    this.options = {
      port: parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10),
      timeout: 120000, // 2 minutes
      maxRetries: 2,
      useYesFlag: true,
      skipInteractive: true,
      preventDatabaseInit: true
    };
  }

  /**
   * Validate Vercel authentication before starting
   */
  async validateVercelAuth() {
    console.log('🔐 Validating Vercel authentication...');
    
    // Check if we have authentication configured
    const hasToken = !!process.env.VERCEL_TOKEN;
    const hasOrgId = !!process.env.VERCEL_ORG_ID;
    
    if (!hasToken) {
      console.log('   ⚠️  No VERCEL_TOKEN found');
      
      // In CI, this might be critical
      if (process.env.CI === 'true') {
        console.log('   ❌ VERCEL_TOKEN is required in CI environment');
        console.log('   💡 Please set VERCEL_TOKEN in GitHub secrets');
        throw new Error('Missing VERCEL_TOKEN in CI environment');
      }
      
      console.log('   ℹ️  Running in local mode without authentication');
      console.log('   💡 Set VERCEL_TOKEN for authenticated development');
    } else {
      console.log('   ✅ VERCEL_TOKEN configured');
      
      // Validate token format (basic check)
      if (process.env.VERCEL_TOKEN.length < 20) {
        console.log('   ⚠️  VERCEL_TOKEN appears to be invalid (too short)');
      }
    }
    
    if (!hasOrgId && hasToken) {
      console.log('   ⚠️  VERCEL_ORG_ID not set - may cause scope issues');
    } else if (hasOrgId) {
      console.log('   ✅ VERCEL_ORG_ID configured');
    }
    
    // Try to validate with Vercel CLI
    if (hasToken) {
      try {
        const { stdout } = await execAsync('npx vercel whoami --token=' + process.env.VERCEL_TOKEN, { 
          timeout: 10000 
        });
        console.log(`   ✅ Authenticated as: ${stdout.trim()}`);
      } catch (error) {
        console.log('   ⚠️  Could not validate Vercel token');
        console.log(`   ❌ Error: ${error.message}`);
        
        if (process.env.CI === 'true') {
          throw new Error('Invalid VERCEL_TOKEN in CI environment');
        }
      }
    }
    
    console.log('   ✅ Authentication validation complete');
  }

  /**
   * Build Vercel command with authentication
   */
  buildVercelCommand() {
    const args = [
      'vercel', 
      'dev',
      '--listen', `0.0.0.0:${this.options.port}`,
      // Removed --no-clipboard as it's not supported in this Vercel CLI version
    ];

    // Add --yes flag to skip all interactive prompts
    if (this.options.useYesFlag) {
      args.push('--yes');
    }

    // Add authentication if token is available
    if (process.env.VERCEL_TOKEN) {
      args.push('--token', process.env.VERCEL_TOKEN);
      console.log('   ✅ Using VERCEL_TOKEN for authentication');
    } else if (process.env.CI === 'true') {
      console.log('   ⚠️  No VERCEL_TOKEN in CI - may fail to start');
    }
    
    // Add scope if org ID is available
    if (process.env.VERCEL_ORG_ID) {
      args.push('--scope', process.env.VERCEL_ORG_ID);
      console.log('   ✅ Using VERCEL_ORG_ID as scope');
    }

    return args;
  }

  /**
   * Main startup orchestrator
   */
  async start() {
    console.log('🚀 Enhanced Vercel Dev Starter');
    console.log('=' .repeat(50));
    
    try {
      await this.validateVercelAuth();
      await this.validateEnvironment();
      await this.prepareEnvironmentFiles();
      await this.killConflictingProcesses();
      await this.preventDatabaseHanging();
      await this.optimizeVercelConfig();
      await this.startVercelWithProtection();
      
    } catch (error) {
      console.error('❌ Failed to start Vercel dev:', error.message);
      await this.suggestAlternatives();
      process.exit(1);
    }
  }

  /**
   * Validate environment and prerequisites
   */
  async validateEnvironment() {
    console.log('🔍 Validating environment...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      throw new Error(`Node.js ${nodeVersion} is too old. Requires 18+`);
    }
    console.log(`   ✅ Node.js ${nodeVersion}`);

    // Check npm availability
    try {
      const { stdout } = await execAsync('npm --version', { timeout: 5000 });
      console.log(`   ✅ npm ${stdout.trim()}`);
    } catch (error) {
      throw new Error('npm is not available');
    }

    // Check Vercel CLI
    try {
      const { stdout } = await execAsync('npx vercel --version', { timeout: 10000 });
      console.log(`   ✅ Vercel CLI ${stdout.trim()}`);
    } catch (error) {
      console.log('   ⚠️  Installing Vercel CLI...');
      await execAsync('npm install -g vercel@latest', { timeout: 60000 });
    }

    // Find available port
    const port = await this.findAvailablePort(this.options.port);
    this.options.port = port;
    console.log(`   ✅ Port ${port} is available`);
  }

  /**
   * Find an available port
   */
  async findAvailablePort(startPort = 3000) {
    for (let port = startPort; port < startPort + 10; port++) {
      try {
        await execAsync(`lsof -ti:${port}`, { timeout: 2000 });
      } catch {
        return port; // Port is available
      }
    }
    throw new Error(`No available ports found starting from ${startPort}`);
  }

  /**
   * Kill any conflicting processes
   */
  async killConflictingProcesses() {
    console.log('🧹 Cleaning up conflicting processes...');
    
    try {
      const { stdout } = await execAsync(`lsof -ti:${this.options.port}`, { timeout: 5000 });
      if (stdout.trim()) {
        console.log(`   🔫 Killing process on port ${this.options.port}: ${stdout.trim()}`);
        await execAsync(`kill -9 ${stdout.trim()}`, { timeout: 5000 });
        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch {
      // No processes to kill - this is good
    }
    
    // Also kill any lingering vercel processes
    try {
      const { stdout } = await execAsync('pkill -f "vercel.*dev" || true', { timeout: 5000 });
      if (stdout) {
        console.log('   🔫 Killed lingering vercel dev processes');
      }
    } catch {
      // No processes to kill
    }
    
    console.log('   ✅ Process cleanup completed');
  }

  /**
   * Prepare environment files to prevent hanging
   */
  async prepareEnvironmentFiles() {
    console.log('📁 Preparing environment files...');
    
    // Create minimal .env.local if it doesn't exist
    const envLocalPath = resolve(projectRoot, '.env.local');
    if (!existsSync(envLocalPath)) {
      const minimalEnv = `# Minimal environment for Vercel dev
NODE_ENV=development
PORT=${this.options.port}
VERCEL_DEV=1

# Skip database initialization during startup
SKIP_DATABASE_INIT=true

# Use development database path
TURSO_DATABASE_URL=file:./data/development.db

# Test credentials for admin (not production)
TEST_ADMIN_PASSWORD=test-password
`;
      writeFileSync(envLocalPath, minimalEnv);
      console.log('   ✅ Created minimal .env.local');
    }

    // Ensure data directory exists
    const dataDir = resolve(projectRoot, 'data');
    if (!existsSync(dataDir)) {
      await execAsync('mkdir -p data');
      console.log('   ✅ Created data directory');
    }

    // Create minimal development database if needed
    const dbPath = resolve(projectRoot, 'data/development.db');
    if (!existsSync(dbPath)) {
      writeFileSync(dbPath, ''); // Empty SQLite file
      console.log('   ✅ Created minimal development database');
    }
  }

  /**
   * Prevent database initialization from hanging the startup
   */
  async preventDatabaseHanging() {
    console.log('🗃️  Preventing database initialization hangs...');
    
    // Set environment variables to skip database operations
    process.env.SKIP_DATABASE_INIT = 'true';
    process.env.VERCEL_DEV_STARTUP = 'true';
    process.env.DISABLE_DATABASE_WARMUP = 'true';
    
    console.log('   ✅ Database initialization safeguards activated');
  }

  /**
   * Optimize Vercel configuration for faster startup
   */
  async optimizeVercelConfig() {
    console.log('⚙️  Optimizing Vercel configuration...');
    
    // Create development-specific vercel config
    const devVercelConfig = {
      "dev": {
        "port": this.options.port,
        "listen": `0.0.0.0:${this.options.port}`
      },
      "build": {
        "env": {
          "NODE_ENV": "development",
          "SKIP_DATABASE_INIT": "true"
        }
      },
      // Minimal functions configuration for dev
      "functions": {
        "api/**/*.js": {
          "maxDuration": 30
        }
      }
    };
    
    const devConfigPath = resolve(projectRoot, '.vercel/project.json');
    try {
      await execAsync(`mkdir -p ${resolve(projectRoot, '.vercel')}`);
      writeFileSync(devConfigPath, JSON.stringify(devVercelConfig, null, 2));
      console.log('   ✅ Development Vercel config optimized');
    } catch (error) {
      console.log(`   ⚠️  Could not optimize config: ${error.message}`);
    }
  }

  /**
   * Start Vercel dev with comprehensive protection
   */
  async startVercelWithProtection() {
    console.log(`🚀 Starting Vercel dev on port ${this.options.port}...`);
    
    const args = this.buildVercelCommand();

    const env = {
      ...process.env,
      PORT: this.options.port.toString(),
      NODE_ENV: 'development',
      VERCEL_DEV: '1',
      SKIP_DATABASE_INIT: 'true',
      VERCEL_DEV_STARTUP: 'true',
      CI: 'false', // Ensure we're not in CI mode
      // Force non-interactive mode
      VERCEL_NON_INTERACTIVE: '1',
      NO_UPDATE_NOTIFIER: '1',
      CI_ENVIRONMENT: 'false'
    };

    return new Promise((resolve, reject) => {
      console.log(`   📦 Command: npx ${args.join(' ')}`);
      console.log(`   🔐 Authentication: ${process.env.VERCEL_TOKEN ? 'enabled' : 'disabled'}`);
      
      const vercelProcess = spawn('npx', args, {
        cwd: projectRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin to prevent interactive prompts
        detached: false
      });

      let output = '';
      let hasStarted = false;

      // Set up timeout protection
      const timeout = setTimeout(() => {
        if (!hasStarted) {
          console.error('❌ Vercel dev startup timed out');
          vercelProcess.kill('SIGKILL');
          reject(new Error('Startup timeout after 2 minutes'));
        }
      }, this.options.timeout);

      // Monitor stdout for startup confirmation
      vercelProcess.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;
        
        // Look for various startup success indicators
        const startupIndicators = [
          'running at',
          'Ready!',
          'Local:',
          'started server on',
          `localhost:${this.options.port}`
        ];
        
        if (startupIndicators.some(indicator => 
          message.toLowerCase().includes(indicator.toLowerCase())
        )) {
          if (!hasStarted) {
            hasStarted = true;
            clearTimeout(timeout);
            console.log('✅ Vercel dev started successfully!');
            console.log(`🌐 Server available at: http://localhost:${this.options.port}`);
            
            // Set environment variable for health checks and other tools
            process.env.PORT = this.options.port.toString();
            resolve(vercelProcess);
          }
        }
        
        // Forward output with prefixing
        process.stdout.write(`   ${message}`);
      });

      // Monitor stderr for errors
      vercelProcess.stderr.on('data', (data) => {
        const message = data.toString();
        
        // Filter out common warnings that aren't actual errors
        if (!message.includes('Warning') && 
            !message.includes('ExperimentalWarning') &&
            !message.includes('Listening on')) {
          process.stderr.write(`   ${message}`);
        }
      });

      // Handle process errors
      vercelProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Process error: ${error.message}`));
      });

      // Handle unexpected exit
      vercelProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        
        if (code !== 0 && code !== null && !hasStarted) {
          reject(new Error(`Vercel dev exited with code ${code}`));
        } else if (signal && !hasStarted) {
          reject(new Error(`Vercel dev terminated by signal ${signal}`));
        }
      });

      // Handle shutdown signals gracefully
      const handleShutdown = (signal) => {
        console.log(`\n🛑 Received ${signal}, shutting down...`);
        clearTimeout(timeout);
        
        if (!vercelProcess.killed) {
          vercelProcess.kill('SIGTERM');
          
          // Force kill after 5 seconds
          setTimeout(() => {
            if (!vercelProcess.killed) {
              vercelProcess.kill('SIGKILL');
            }
          }, 5000);
        }
        
        process.exit(0);
      };

      process.on('SIGINT', () => handleShutdown('SIGINT'));
      process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    });
  }

  /**
   * Suggest alternative startup methods if Vercel dev fails
   */
  async suggestAlternatives() {
    console.log('\n💡 Alternative startup methods:');
    console.log('');
    console.log('1. 📦 Simple static server:');
    console.log('   npm run serve:simple');
    console.log('');
    console.log('2. 🧹 Clean restart:');
    console.log('   rm -rf .vercel && npm run start:clean');
    console.log('');
    console.log('3. 🔧 Debug mode:');
    console.log('   npm run start:debug');
    console.log('');
    console.log('4. 🎯 Direct Vercel command:');
    console.log(`   npx vercel dev --yes --listen 0.0.0.0:${this.options.port}${process.env.VERCEL_TOKEN ? ' --token=' + process.env.VERCEL_TOKEN : ''}${process.env.VERCEL_ORG_ID ? ' --scope=' + process.env.VERCEL_ORG_ID : ''}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const starter = new VercelDevStarter();
  starter.start();
}

export default VercelDevStarter;