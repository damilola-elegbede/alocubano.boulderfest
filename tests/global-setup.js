/**
 * Global setup for unit tests
 * Starts CI server and ensures database is properly initialized once before all tests run
 * Uses SQLite for fast unit test execution
 */

import { spawn } from 'child_process';
import { setupTestDatabase } from './setup.js';

let serverProcess = null;

/**
 * Wait for server to be ready by polling health endpoint
 */
async function waitForServer(maxAttempts = 30) {
  const PORT = process.env.CI_PORT || process.env.PORT || '3000';
  const BASE_URL = `http://localhost:${PORT}`;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`, { timeout: 2000 });
      if (response.ok) {
        console.log('✅ CI server is ready');
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('CI server failed to start within timeout');
}

/**
 * Start CI server for unit tests
 */
async function startServer() {
  console.log('🚀 Starting CI server for unit tests...');
  
  serverProcess = spawn('node', ['scripts/ci-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'test',
      CI_PORT: process.env.CI_PORT || process.env.PORT || '3000'
    }
  });

  // Log server output for debugging
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output && !output.includes('Context-Aware CI Server running')) {
      console.log(`[SERVER] ${output}`);
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[SERVER ERROR] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (error) => {
    console.error('Server process error:', error);
  });

  // Wait for server to be ready
  await waitForServer();
}

/**
 * Global setup for unit tests - runs once before all tests
 * This is called by Vitest's globalSetup configuration
 */
async function globalSetup() {
  console.log('\n🧪 Unit Test Global Setup Starting...\n');
  
  try {
    // Start CI server first
    await startServer();
    
    // Initialize test database using the setup from setup.js
    await setupTestDatabase();
    console.log('✅ Unit test database setup complete');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error.message);
    // Clean up server if it was started
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    }
    throw error;
  }
  
  console.log('✨ Unit Test Global Setup Complete\n');
  
  // Return teardown function to stop server after tests
  return async () => {
    console.log('\n🛑 Stopping CI server...');
    if (serverProcess) {
      return new Promise((resolve) => {
        let exited = false;
        
        const onExit = () => {
          if (!exited) {
            exited = true;
            console.log('✅ CI server stopped');
            serverProcess = null;
            resolve();
          }
        };
        
        serverProcess.once('exit', onExit);
        serverProcess.kill('SIGTERM');
        
        // Force kill after 3 seconds if still running
        setTimeout(() => {
          if (!exited && serverProcess) {
            console.log('⚠️ Force killing CI server...');
            serverProcess.kill('SIGKILL');
          }
        }, 3000);
      });
    }
  };
}

export default globalSetup;