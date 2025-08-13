#!/usr/bin/env node

/**
 * Test CI Server
 * 
 * Quick validation that the CI server can start and serve basic endpoints
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess = null;
let testsPassed = 0;
let testsTotal = 0;

async function runTest(name, testFn) {
  testsTotal++;
  try {
    console.log(`⏳ ${name}...`);
    await testFn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
  }
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`, { timeout: 1000 });
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Server failed to start within timeout');
}

async function startServer() {
  console.log('🚀 Starting CI server...');
  
  serverProcess = spawn('node', ['scripts/ci-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'ci'
    }
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[SERVER] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[SERVER ERROR] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (error) => {
    console.error('Server process error:', error);
  });

  // Wait for server to be ready
  await waitForServer();
  console.log('✅ Server is ready\n');
}

function stopServer() {
  if (serverProcess) {
    console.log('\n🛑 Stopping server...');
    
    return new Promise((resolve) => {
      let exited = false;
      
      const onExit = () => {
        if (!exited) {
          exited = true;
          console.log('✅ Server stopped');
          serverProcess = null;
          resolve();
        }
      };
      
      serverProcess.once('exit', onExit);
      serverProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!exited && serverProcess) {
          console.log('⚠️ Force killing server...');
          serverProcess.kill('SIGKILL');
        }
      }, 5000);
    });
  } else {
    return Promise.resolve();
  }
}

async function testHealthEndpoint() {
  const response = await fetch(`${BASE_URL}/health`);
  
  if (!response.ok) {
    throw new Error(`Health endpoint returned ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.status !== 'ok') {
    throw new Error(`Expected status 'ok', got '${data.status}'`);
  }
}

async function testApiHealthSimple() {
  const response = await fetch(`${BASE_URL}/api/health/simple`);
  
  if (!response.ok) {
    throw new Error(`API health/simple returned ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.status !== 'healthy') {
    throw new Error(`Expected status 'healthy', got '${data.status}'`);
  }
}

async function test404Handling() {
  const response = await fetch(`${BASE_URL}/api/nonexistent`);
  
  if (response.status !== 404) {
    throw new Error(`Expected 404 for nonexistent endpoint, got ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.error || !data.error.includes('not found')) {
    throw new Error(`Expected error message about endpoint not found`);
  }
}

async function testStaticFiles() {
  // Test that index.html or at least some HTML response is served
  const response = await fetch(`${BASE_URL}/`);
  
  if (!response.ok) {
    throw new Error(`Root path returned ${response.status}`);
  }
  
  // Should return HTML content or at least not error
  const contentType = response.headers.get('content-type');
  if (!contentType || (!contentType.includes('html') && !contentType.includes('text'))) {
    console.warn(`Warning: Root path returned unexpected content-type: ${contentType}`);
  }
}

async function runTests() {
  console.log('🧪 Testing CI Server\n');
  
  try {
    await startServer();
    
    // Run tests
    await runTest('Health endpoint', testHealthEndpoint);
    await runTest('API health/simple endpoint', testApiHealthSimple);
    await runTest('404 handling', test404Handling);
    await runTest('Static files', testStaticFiles);
    
  } catch (error) {
    console.error('Setup error:', error);
  } finally {
    await stopServer();
  }
  
  // Report results
  console.log('\n📊 Test Results');
  console.log('================');
  console.log(`Passed: ${testsPassed}/${testsTotal}`);
  
  if (testsPassed === testsTotal) {
    console.log('✅ All tests passed! CI server is ready.');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Check the CI server implementation.');
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n⚠️  Test interrupted');
  await stopServer();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Test terminated');
  await stopServer();
  process.exit(1);
});

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});