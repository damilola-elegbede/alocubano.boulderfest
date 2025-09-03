#!/usr/bin/env node

/**
 * E2E Testing Setup Script
 * Prepares the environment for running E2E tests with Vercel Dev
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';

const execAsync = promisify(exec);

class E2ETestingSetup {
  constructor() {
    this.port = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);
    this.vercelProcess = null;
    this.setupTimeout = 120000; // 2 minutes
  }

  /**
   * Check if port is available
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });
      
      server.on('error', () => resolve(false));
    });
  }

  /**
   * Wait for server to be ready
   */
  async waitForServer(port, maxAttempts = 60) {
    console.log(`🔍 Waiting for server on port ${port}...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${port}/api/health/check`);
        if (response.ok) {
          console.log('✅ Server is ready!');
          return true;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      process.stdout.write('.');
    }
    
    console.log('\n❌ Server failed to start within timeout');
    return false;
  }

  /**
   * Setup database for E2E testing
   */
  async setupDatabase() {
    console.log('📊 Setting up database for E2E testing...');
    
    try {
      // Run migrations
      await execAsync('npm run migrate:up');
      console.log('✅ Database migrations completed');
      return true;
    } catch (error) {
      console.error('❌ Database setup failed:', error.message);
      return false;
    }
  }

  /**
   * Start Vercel dev server
   */
  async startVercelDev() {
    console.log(`🚀 Starting Vercel dev server on port ${this.port}...`);
    
    // Check if port is available
    const portAvailable = await this.isPortAvailable(this.port);
    if (!portAvailable) {
      console.log(`⚠️  Port ${this.port} is in use, trying to kill existing processes...`);
      try {
        await execAsync(`lsof -ti:${this.port} | xargs kill -9`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        // Port might not be in use anymore
      }
    }

    return new Promise((resolve, reject) => {
      // Start Vercel dev with proper configuration
      this.vercelProcess = spawn('vercel', ['dev', '--listen', `0.0.0.0:${this.port}`, '--yes'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env,
          NODE_ENV: 'development',
          E2E_TEST_MODE: 'true'
        }
      });

      let setupComplete = false;

      this.vercelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output.trim());
        
        // Look for ready indicators
        if (output.includes('Ready!') || output.includes(`localhost:${this.port}`)) {
          if (!setupComplete) {
            setupComplete = true;
            resolve(true);
          }
        }
      });

      this.vercelProcess.stderr.on('data', (data) => {
        console.error(data.toString().trim());
      });

      this.vercelProcess.on('error', (error) => {
        console.error('❌ Failed to start Vercel dev:', error.message);
        if (!setupComplete) {
          setupComplete = true;
          reject(error);
        }
      });

      this.vercelProcess.on('exit', (code) => {
        console.log(`Vercel dev exited with code: ${code}`);
        if (!setupComplete && code !== 0) {
          setupComplete = true;
          reject(new Error(`Vercel dev exited with code: ${code}`));
        }
      });

      // Timeout protection
      setTimeout(() => {
        if (!setupComplete) {
          setupComplete = true;
          reject(new Error('Vercel dev startup timeout'));
        }
      }, this.setupTimeout);
    });
  }

  /**
   * Validate E2E environment
   */
  async validateEnvironment() {
    console.log('🔍 Validating E2E environment...');
    
    try {
      // Check critical API endpoints
      const endpoints = [
        '/api/health/check',
        '/api/admin/login',
        '/api/payments/create-checkout-session'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`http://localhost:${this.port}${endpoint}`, {
            method: endpoint.includes('login') ? 'POST' : 'GET',
            headers: {
              'Content-Type': 'application/json'
            },
            body: endpoint.includes('login') 
              ? JSON.stringify({ password: 'invalid' })
              : undefined
          });
          
          // We expect some response (even error responses are fine)
          console.log(`✅ ${endpoint} - Status: ${response.status}`);
        } catch (error) {
          console.error(`❌ ${endpoint} - Error: ${error.message}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Environment validation failed:', error.message);
      return false;
    }
  }

  /**
   * Stop Vercel dev server
   */
  stopServer() {
    if (this.vercelProcess) {
      console.log('🛑 Stopping Vercel dev server...');
      this.vercelProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.vercelProcess && !this.vercelProcess.killed) {
          this.vercelProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  /**
   * Complete E2E setup
   */
  async setup() {
    console.log('🎯 Setting up E2E testing environment...\n');

    try {
      // 1. Setup database
      const dbSetup = await this.setupDatabase();
      if (!dbSetup) {
        throw new Error('Database setup failed');
      }

      // 2. Start Vercel dev server
      await this.startVercelDev();

      // 3. Wait for server to be ready
      const serverReady = await this.waitForServer(this.port);
      if (!serverReady) {
        throw new Error('Server failed to start');
      }

      // 4. Validate environment
      const envValid = await this.validateEnvironment();
      if (!envValid) {
        throw new Error('Environment validation failed');
      }

      console.log('\n🎉 E2E testing environment is ready!');
      console.log(`📍 Server running at: http://localhost:${this.port}`);
      console.log('🧪 You can now run E2E tests with: npm run test:e2e');
      
      return {
        success: true,
        port: this.port,
        url: `http://localhost:${this.port}`
      };

    } catch (error) {
      console.error('\n❌ E2E setup failed:', error.message);
      this.stopServer();
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Keep server running for interactive testing
   */
  async runInteractive() {
    const result = await this.setup();
    
    if (result.success) {
      console.log('\n💡 Server is running. Press Ctrl+C to stop.');
      
      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        this.stopServer();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\n🛑 Shutting down...');
        this.stopServer();
        process.exit(0);
      });

      // Keep process alive
      return new Promise(() => {}); // Never resolves
    } else {
      process.exit(1);
    }
  }
}

// Handle command line usage
const command = process.argv[2];

if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new E2ETestingSetup();
  
  if (command === 'interactive' || command === 'start') {
    setup.runInteractive();
  } else {
    const result = await setup.setup();
    process.exit(result.success ? 0 : 1);
  }
}

export default E2ETestingSetup;