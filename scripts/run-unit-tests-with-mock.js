#!/usr/bin/env node

// Test runner that starts mock server before running unit tests
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const isPortAvailable = async (port) => {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
};

const waitForServer = async (port, maxRetries = 20, interval = 500) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health/check`);
      if (response.ok) {
        console.log(`✅ Mock server ready after ${i * interval}ms`);
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    if (i === maxRetries - 1) {
      console.error(`❌ Mock server failed to start within ${maxRetries * interval}ms`);
      return false;
    }
    
    await setTimeout(interval);
  }
  return false;
};

async function runTestsWithMockServer() {
  const port = process.env.CI_PORT || process.env.PORT || '3000';
  
  console.log('🚀 Starting unit tests with mock server...');
  console.log(`📋 Target port: ${port}`);
  
  // Check if port is available
  const available = await isPortAvailable(port);
  if (!available) {
    console.error(`❌ Port ${port} is already in use`);
    process.exit(1);
  }
  
  let mockServer = null;
  let testProcess = null;
  
  try {
    // Start mock server
    console.log('🔧 Starting CI mock server...');
    mockServer = spawn('node', ['tests/ci-mock-server.js'], {
      env: { ...process.env, CI_PORT: port, PORT: port },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Handle mock server output
    mockServer.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[Mock Server] ${output}`);
      }
    });
    
    mockServer.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error && !error.includes('ExperimentalWarning')) {
        console.error(`[Mock Server Error] ${error}`);
      }
    });
    
    // Wait for server to be ready
    console.log('⏳ Waiting for mock server to be ready...');
    const ready = await waitForServer(port);
    if (!ready) {
      throw new Error('Mock server failed to start');
    }
    
    // Run unit tests
    console.log('🧪 Running unit tests...');
    testProcess = spawn('npm', ['run', 'test:simple'], {
      env: { 
        ...process.env, 
        CI_PORT: port,
        PORT: port,
        NODE_ENV: 'test' 
      },
      stdio: 'inherit'
    });
    
    // Wait for tests to complete
    const testResult = await new Promise((resolve) => {
      testProcess.on('close', (code) => {
        resolve(code);
      });
    });
    
    if (testResult === 0) {
      console.log('✅ Unit tests completed successfully');
    } else {
      console.error('❌ Unit tests failed');
      process.exit(testResult);
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up processes
    console.log('🧹 Cleaning up...');
    
    if (testProcess && !testProcess.killed) {
      testProcess.kill('SIGTERM');
    }
    
    if (mockServer && !mockServer.killed) {
      mockServer.kill('SIGTERM');
      
      // Give it a moment to shut down gracefully
      await setTimeout(1000);
      
      if (!mockServer.killed) {
        mockServer.kill('SIGKILL');
      }
    }
    
    console.log('✅ Cleanup completed');
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  process.exit(0);
});

// Run the tests
runTestsWithMockServer().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});