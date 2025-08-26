/**
 * Global Test Setup - Server Management
 * Starts CI server before all tests and stops it after all tests complete.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Test server configuration
const CI_PORT = process.env.CI_PORT || process.env.PORT || '3000';
const BASE_URL = `http://localhost:${CI_PORT}`;

let serverProcess = null;

// Wait for server to be ready
async function waitForServer(maxAttempts = 30) {
  // Import fetch dynamically to avoid issues in different environments
  const fetch = (await import('node-fetch')).default;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${BASE_URL}/health`, { 
        timeout: 1000 
      });
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`CI Server failed to start within ${maxAttempts} seconds`);
}

// Global setup - runs once before all test suites
export async function setup() {
  console.log('🚀 Starting CI server for test suite...');
  
  serverProcess = spawn('node', ['scripts/ci-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'test',
      PORT: CI_PORT,
      CI_PORT: CI_PORT
    },
    cwd: rootDir,
    detached: false
  });

  // Only log errors to keep output clean
  serverProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg.includes('Error') || msg.includes('error')) {
      console.error(`[CI SERVER ERROR] ${msg}`);
    }
  });

  serverProcess.on('error', (error) => {
    console.error('CI Server startup failed:', error.message);
    throw error;
  });

  // Wait for server to be ready
  await waitForServer();
  console.log(`✅ CI Server ready at ${BASE_URL}`);
  
  // Store server info for tests
  process.env.TEST_BASE_URL = BASE_URL;
  
  return {
    baseUrl: BASE_URL,
    port: CI_PORT
  };
}

// Global teardown - runs once after all test suites
export async function teardown() {
  if (!serverProcess) return;
  
  console.log('🛑 Stopping CI server...');
  
  return new Promise((resolve) => {
    let exited = false;
    
    const onExit = () => {
      if (!exited) {
        exited = true;
        console.log('✅ CI Server stopped');
        serverProcess = null;
        resolve();
      }
    };
    
    serverProcess.once('exit', onExit);
    serverProcess.kill('SIGTERM');
    
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (!exited && serverProcess) {
        console.log('⚠️ Force killing CI server...');
        serverProcess.kill('SIGKILL');
      }
    }, 5000);
  });
}