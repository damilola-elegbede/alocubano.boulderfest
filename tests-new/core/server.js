/**
 * Test Server Management
 * Handles starting and stopping the Vercel dev server for integration tests
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import waitOn from 'wait-on';
import { promisify } from 'util';
import { exec } from 'child_process';
import net from 'net';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);

// Detect CI environment and mock mode
const IS_CI = process.env.CI === 'true';
const HAS_VERCEL_TOKEN = Boolean(process.env.VERCEL_TOKEN);
const USE_MOCK_SERVER = IS_CI && !HAS_VERCEL_TOKEN;

// Import mock server conditionally
let mockServer;
if (USE_MOCK_SERVER) {
  const module = await import('./mock-server.js');
  mockServer = module.mockServer;
}

class ServerManager {
  constructor() {
    this.useMockServer = USE_MOCK_SERVER;
    this.serverProcess = null;
    this.serverUrl = null;
    this.port = null;
    this.isRunning = false;
    this.startupTimeout = 90000; // 90 seconds for server startup
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds between retries
  }

  /**
   * Start the test server with retry logic
   */
  async start() {
    if (this.isRunning) {
      return this.serverUrl;
    }

    // Use mock server in CI without Vercel token
    if (this.useMockServer) {
      console.log('🎭 Using mock server in CI environment');
      this.serverUrl = await mockServer.start();
      this.port = mockServer.port;
      this.isRunning = true;
      return this.serverUrl;
    }

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🚀 Starting test server (attempt ${attempt}/${this.maxRetries})...`);
        
        // Kill any existing processes on our target ports first
        await this._killExistingProcesses();
        
        // Find available port
        this.port = await this._findAvailablePort();
        this.serverUrl = `http://localhost:${this.port}`;
        
        console.log(`📍 Using port ${this.port} for test server`);
        
        // Start Vercel dev server
        await this._startVercelServer();
        
        // Wait for server to be ready with health check
        await this._waitForServerWithHealthCheck();
        
        this.isRunning = true;
        console.log(`✅ Test server running at ${this.serverUrl}`);
        
        return this.serverUrl;
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Server start attempt ${attempt} failed:`, error.message);
        
        // Clean up failed attempt
        await this.stop();
        
        if (attempt < this.maxRetries) {
          console.log(`⏳ Waiting ${this.retryDelay/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }
    
    console.error('❌ Failed to start test server after all retries');
    throw lastError;
  }

  /**
   * Stop the test server
   */
  async stop() {
    if (!this.serverProcess && !this.isRunning) {
      return;
    }

    // Stop mock server if in use
    if (this.useMockServer) {
      await mockServer.stop();
      this.isRunning = false;
      this.port = null;
      this.serverUrl = null;
      return;
    }

    console.log('🛑 Stopping test server...');
    
    try {
      // Kill the server process and any child processes
      if (this.serverProcess?.pid) {
        try {
          // Kill the entire process group
          process.kill(-this.serverProcess.pid, 'SIGTERM');
        } catch (e) {
          // If that fails, kill just the process
          process.kill(this.serverProcess.pid, 'SIGTERM');
        }
        
        // Wait for graceful shutdown
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 5000); // Force after 5 seconds
          this.serverProcess.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      
      // Also kill any remaining vercel processes on our port
      if (this.port) {
        await this._killProcessOnPort(this.port).catch(() => {
          // Ignore errors - port might already be free
        });
      }
    } catch (error) {
      console.warn('⚠️ Error stopping server process:', error.message);
    } finally {
      this.serverProcess = null;
      this.isRunning = false;
      this.port = null;
      this.serverUrl = null;
      console.log('✅ Test server stopped');
    }
  }

  /**
   * Get the server URL
   */
  getUrl() {
    if (!this.isRunning) {
      throw new Error('Test server is not running');
    }
    if (this.useMockServer) {
      return mockServer.getUrl();
    }
    return this.serverUrl;
  }

  /**
   * Check if server is running
   */
  isServerRunning() {
    if (this.useMockServer) {
      return mockServer.isServerRunning();
    }
    return this.isRunning;
  }

  /**
   * Find an available port for the test server
   * @private
   */
  async _findAvailablePort() {
    // Use higher port range to avoid conflicts with common dev servers
    const preferredPorts = [
      parseInt(process.env.TEST_PORT) || 3005,
      3006, 3007, 3008, 3009, 3010
    ];
    
    for (const port of preferredPorts) {
      if (await this._isPortAvailable(port)) {
        return port;
      }
    }
    
    // Find any available port in range 3011-3100
    for (let port = 3011; port <= 3100; port++) {
      if (await this._isPortAvailable(port)) {
        return port;
      }
    }
    
    throw new Error('No available ports found in range 3005-3100');
  }

  /**
   * Check if a port is available
   * @private
   */
  async _isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, 'localhost', () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', () => resolve(false));
    });
  }

  /**
   * Kill existing processes on target ports
   * @private
   */
  async _killExistingProcesses() {
    const portsToCheck = [3000, 3001, 3002, 3003];
    
    for (const port of portsToCheck) {
      try {
        await this._killProcessOnPort(port);
      } catch (error) {
        // Ignore errors - port might already be free
      }
    }
  }

  /**
   * Kill process running on specific port
   * @private
   */
  async _killProcessOnPort(port) {
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(pid => pid);
      
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid), 'SIGTERM');
          console.log(`🔪 Killed process ${pid} on port ${port}`);
        } catch (e) {
          // Process might already be dead
        }
      }
    } catch (error) {
      // No process found on port or lsof failed
    }
  }

  /**
   * Start the Vercel development server
   * @private
   */
  async _startVercelServer() {
    return new Promise((resolve, reject) => {
      const args = ['dev', '--listen', this.port, '--yes'];
      
      // Ensure we're running from the project root
      const projectRoot = process.cwd().includes('tests-new') 
        ? process.cwd().replace('/tests-new', '') 
        : process.cwd();
      
      console.log(`Running: npx vercel ${args.join(' ')} from ${projectRoot}`);
      
      this.serverProcess = spawn('npx', ['vercel', ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: projectRoot, // Run from project root, not tests-new
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TEST_TYPE: 'integration',
          // Use integration test database
          TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || 'file:./test-integration.db',
          // Disable ngrok in test environment
          DISABLE_NGROK: 'true',
          // Force the port
          PORT: this.port,
          VERCEL_PORT: this.port
        },
        detached: true // Allow process group management
      });

      let startupOutput = '';
      let errorOutput = '';
      let resolved = false;

      this.serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        startupOutput += output;
        console.log('Server stdout:', output.trim());
        
        // Look for ready signals - be more flexible about port
        if (!resolved && (output.includes('Ready!') || 
            output.includes('localhost:') ||
            output.includes('Local:') ||
            output.includes('Available at'))) {
          // Extract the actual port if different
          const portMatch = output.match(/localhost:(\d+)/);
          if (portMatch) {
            const actualPort = parseInt(portMatch[1]);
            if (actualPort !== this.port) {
              console.log(`⚠️ Server started on different port: ${actualPort} (requested: ${this.port})`);
              this.port = actualPort;
              this.serverUrl = `http://localhost:${this.port}`;
            }
          }
          console.log(`✅ Vercel server ready on port ${this.port}`);
          resolved = true;
          resolve();
        }
      });

      this.serverProcess.stderr?.on('data', (data) => {
        const error = data.toString();
        errorOutput += error;
        console.log('Server stderr:', error.trim());
        
        // Check for ready signals in stderr (Vercel sometimes outputs here)
        if (!resolved && (error.includes('Ready!') || 
            error.includes('Available at') ||
            error.includes('localhost:'))) {
          // Extract the actual port if different
          const portMatch = error.match(/localhost:(\d+)/);
          if (portMatch) {
            const actualPort = parseInt(portMatch[1]);
            if (actualPort !== this.port) {
              console.log(`⚠️ Server started on different port: ${actualPort} (requested: ${this.port})`);
              this.port = actualPort;
              this.serverUrl = `http://localhost:${this.port}`;
            }
          }
          console.log(`✅ Vercel server ready on port ${this.port} (detected from stderr)`);
          resolved = true;
          resolve();
          return;
        }
        
        // Check for port conflict errors
        if (error.includes('EADDRINUSE') || error.includes('port') && error.includes('already in use')) {
          if (!resolved) {
            resolved = true;
            reject(new Error(`Port ${this.port} is already in use: ${error}`));
          }
        }
      });

      this.serverProcess.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Failed to start Vercel server: ${error.message}`));
        }
      });

      this.serverProcess.on('exit', (code, signal) => {
        if (!resolved && code !== 0 && code !== null) {
          resolved = true;
          reject(new Error(`Vercel server exited with code ${code}. Error: ${errorOutput}`));
        }
      });

      // Timeout after 90 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Server startup timeout after ${this.startupTimeout/1000}s. Output: ${startupOutput}, Errors: ${errorOutput}`));
        }
      }, this.startupTimeout);
    });
  }

  /**
   * Wait for server to respond to requests with health check
   * @private
   */
  async _waitForServerWithHealthCheck() {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second
    const startTime = Date.now();
    
    console.log(`⏳ Waiting for server health check at ${this.serverUrl}/api/health/simple...`);
    
    // Give the server a moment to fully start before first check
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // First try basic connectivity
        const response = await fetch(`${this.serverUrl}/api/health/simple`, {
          method: 'GET',
          headers: {
            'User-Agent': 'Integration-Test-Client',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(5000) // 5 second timeout per request
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'healthy' || data.status === 'ok') {
            console.log('✅ Server health check passed');
            return;
          }
        }
        
        console.log(`⏳ Health check failed (${response.status}), retrying...`);
      } catch (error) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏳ Server not ready yet after ${elapsed}s (${error.message}), retrying...`);
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    throw new Error(`Server health check failed after ${maxWaitTime/1000} seconds`);
  }

  /**
   * Wait for server to respond to requests (fallback method)
   * @private
   */
  async _waitForServer() {
    const waitOptions = {
      resources: [this.serverUrl],
      delay: 1000,
      interval: 1000,
      timeout: 30000,
      tcpTimeout: 5000,
      httpTimeout: 10000,
      headers: {
        'User-Agent': 'Integration-Test-Client'
      }
    };

    try {
      await waitOn(waitOptions);
      console.log('✅ Server is responding to requests');
    } catch (error) {
      throw new Error(`Server failed to respond: ${error.message}`);
    }
  }

  /**
   * Health check the running server
   */
  async healthCheck() {
    if (!this.isRunning) {
      return { healthy: false, error: 'Server not running' };
    }

    if (this.useMockServer) {
      return mockServer.healthCheck();
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/health/check`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Integration-Test-Client'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      const data = await response.json();
      
      return {
        healthy: response.ok && (data.status === 'healthy' || data.status === 'degraded'),
        status: response.status,
        serverStatus: data.status,
        data,
        url: this.serverUrl,
        port: this.port
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        url: this.serverUrl,
        port: this.port
      };
    }
  }

  /**
   * Quick connectivity check
   */
  async ping() {
    if (!this.isRunning) {
      return { reachable: false, error: 'Server not running' };
    }

    if (this.useMockServer) {
      return mockServer.ping();
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/health/simple`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Integration-Test-Client'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      return {
        reachable: response.ok,
        status: response.status,
        url: this.serverUrl,
        port: this.port
      };
    } catch (error) {
      return {
        reachable: false,
        error: error.message,
        url: this.serverUrl,
        port: this.port
      };
    }
  }
}

// Export singleton instance
export const serverManager = new ServerManager();

// Cleanup on process exit
process.on('exit', () => {
  serverManager.stop();
});

process.on('SIGINT', async () => {
  await serverManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await serverManager.stop();
  process.exit(0);
});