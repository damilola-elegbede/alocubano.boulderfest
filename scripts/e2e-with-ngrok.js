#!/usr/bin/env node

/**
 * DEPRECATED: E2E Test Runner with ngrok Tunnel
 * 
 * This script is DEPRECATED as of the migration to Vercel Preview Deployments for E2E testing.
 * 
 * REPLACEMENT: E2E tests now use Vercel Preview Deployments which provide:
 * - Real production environment testing
 * - No need for ngrok tunneling
 * - No local server management
 * - Better CI/CD integration
 * - Eliminated complex orchestration
 * 
 * LEGACY PURPOSE:
 * This script orchestrated ngrok tunneling + Vercel dev server + E2E tests:
 * 1. Started ngrok tunnel with subdomain 'alocubanoboulderfest'  
 * 2. Started Vercel dev server on port 3000
 * 3. Ran E2E tests against the tunnel URL
 * 4. Cleaned up all processes
 * 
 * @deprecated Use Vercel Preview Deployments for E2E testing instead
 * @see CI/CD workflows for current E2E testing approach
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import path from 'path';

const execAsync = promisify(exec);

// Configuration
const NGROK_SUBDOMAIN = 'alocubanoboulderfest';
const NGROK_URL = `https://${NGROK_SUBDOMAIN}.ngrok.io`;
const SERVER_PORT = 3000;
const HEALTH_CHECK_URL = `${NGROK_URL}/api/health/check`;
const PLAYWRIGHT_CONFIG = 'playwright-e2e-vercel-main.config.js';

// Process tracking
let ngrokProcess = null;
let vercelProcess = null;
let playwrightProcess = null;

/**
 * Check if ngrok is installed and configured
 */
async function checkNgrokInstallation() {
  console.log('🔍 Checking ngrok installation...');
  
  try {
    await execAsync('which ngrok');
    console.log('✅ ngrok is installed');
  } catch {
    console.error('❌ ngrok is not installed. Please install it first:');
    console.error('   brew install ngrok/ngrok/ngrok  (macOS)');
    console.error('   or visit: https://ngrok.com/download');
    throw new Error('ngrok not installed');
  }

  // Check auth token for subdomain support
  const authToken = process.env.NGROK_AUTHTOKEN;
  if (!authToken) {
    console.warn('⚠️  NGROK_AUTHTOKEN not set. Subdomain feature requires a paid plan.');
    console.warn('   Set your token: export NGROK_AUTHTOKEN=your_token_here');
    console.warn('   Using random ngrok URL instead of fixed subdomain.');
  } else {
    console.log('✅ ngrok auth token configured');
  }
}

/**
 * Start ngrok tunnel with subdomain
 */
async function startNgrokTunnel() {
  console.log(`🌐 Starting ngrok tunnel to port ${SERVER_PORT}...`);
  
  // Use subdomain if auth token is available, otherwise use random URL
  const authToken = process.env.NGROK_AUTHTOKEN;
  const ngrokCommand = authToken 
    ? `ngrok http ${SERVER_PORT} --subdomain=${NGROK_SUBDOMAIN}`
    : `ngrok http ${SERVER_PORT}`;

  ngrokProcess = spawn(ngrokCommand, {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  return new Promise((resolve, reject) => {
    let tunnelUrl = null;
    let outputBuffer = '';
    
    // Timeout for ngrok startup
    const timeout = setTimeout(() => {
      if (!tunnelUrl) {
        reject(new Error('ngrok tunnel failed to start within timeout'));
      }
    }, 15000);

    ngrokProcess.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      
      // Look for tunnel URL in output
      const urlMatch = output.match(/https:\/\/[^\s]+\.ngrok[^\s]*/);
      if (urlMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[0];
        clearTimeout(timeout);
        
        console.log('✅ ngrok tunnel established:');
        console.log(`   Local:  http://localhost:${SERVER_PORT}`);
        console.log(`   Public: ${tunnelUrl}`);
        console.log('📊 ngrok Inspector: http://localhost:4040');
        
        resolve(tunnelUrl);
      }
    });

    ngrokProcess.stderr.on('data', (data) => {
      const error = data.toString();
      if (error.includes('ERR_NGROK') || error.includes('error')) {
        clearTimeout(timeout);
        console.error('❌ ngrok error:', error);
        reject(new Error(`ngrok failed: ${error}`));
      }
    });

    ngrokProcess.on('exit', (code) => {
      if (code !== 0 && !tunnelUrl) {
        clearTimeout(timeout);
        reject(new Error(`ngrok exited with code ${code}`));
      }
    });
  });
}

/**
 * Verify ngrok tunnel is accessible
 */
async function verifyNgrokTunnel(tunnelUrl) {
  console.log(`🔍 Verifying ngrok tunnel accessibility...`);
  
  const maxAttempts = 10;
  const delay = 2000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${maxAttempts}: Testing ${tunnelUrl}`);
      
      const response = await fetch(tunnelUrl, { 
        method: 'HEAD',
        timeout: 5000 
      });
      
      if (response.ok || response.status === 404) {
        // 404 is acceptable - it means ngrok is working, just no content at root
        console.log('✅ ngrok tunnel is accessible');
        return true;
      }
      
      console.log(`   Status: ${response.status} - retrying...`);
    } catch (error) {
      console.log(`   Error: ${error.message} - retrying...`);
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('ngrok tunnel is not accessible after multiple attempts');
}

/**
 * Start Vercel dev server
 */
async function startVercelServer() {
  console.log(`🚀 Starting Vercel dev server on port ${SERVER_PORT}...`);
  
  vercelProcess = spawn('vercel', ['dev', '--yes', '--listen', SERVER_PORT.toString()], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: SERVER_PORT.toString(),
      NODE_ENV: 'development',
      E2E_TEST_MODE: 'true'
    }
  });

  return new Promise((resolve, reject) => {
    let serverReady = false;
    let outputBuffer = '';
    
    // Timeout for server startup
    const timeout = setTimeout(() => {
      if (!serverReady) {
        reject(new Error('Vercel dev server failed to start within timeout'));
      }
    }, 60000); // Vercel can take some time to start

    vercelProcess.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      console.log('📝 Vercel:', output.trim());
      
      // Look for "Ready!" or similar indicators
      if (output.includes('Ready!') || output.includes('ready on') || output.includes('Local:')) {
        if (!serverReady) {
          serverReady = true;
          clearTimeout(timeout);
          console.log('✅ Vercel dev server is ready');
          resolve();
        }
      }
    });

    vercelProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('📝 Vercel error:', error.trim());
      
      if (error.includes('Error') && !error.includes('Warning')) {
        clearTimeout(timeout);
        reject(new Error(`Vercel server failed: ${error}`));
      }
    });

    vercelProcess.on('exit', (code) => {
      if (code !== 0 && !serverReady) {
        clearTimeout(timeout);
        reject(new Error(`Vercel server exited with code ${code}`));
      }
    });
  });
}

/**
 * Wait for application health check
 */
async function waitForApplicationReady() {
  console.log('🔍 Waiting for application to be ready...');
  
  const maxAttempts = 20;
  const delay = 3000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`   Health check ${attempt}/${maxAttempts}: ${HEALTH_CHECK_URL}`);
      
      const response = await fetch(HEALTH_CHECK_URL, { 
        timeout: 8000,
        headers: {
          'User-Agent': 'E2E-Test-Runner'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Application is ready:', data.status || 'healthy');
        return;
      }
      
      console.log(`   Status: ${response.status} - retrying...`);
    } catch (error) {
      console.log(`   Error: ${error.message} - retrying...`);
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Application health check failed after multiple attempts');
}

/**
 * Run Playwright E2E tests
 */
async function runPlaywrightTests(testArgs = []) {
  console.log('🎭 Running Playwright E2E tests...');
  
  const configPath = path.resolve(PLAYWRIGHT_CONFIG);
  const playwrightArgs = ['test', `--config=${configPath}`, ...testArgs];
  
  console.log(`   Command: npx playwright ${playwrightArgs.join(' ')}`);
  
  return new Promise((resolve, reject) => {
    playwrightProcess = spawn('npx', ['playwright', ...playwrightArgs], {
      stdio: 'inherit',
      env: {
        ...process.env,
        E2E_BASE_URL: NGROK_URL
      }
    });

    playwrightProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('✅ All E2E tests completed successfully');
        resolve(code);
      } else {
        console.error(`❌ E2E tests failed with exit code ${code}`);
        resolve(code); // Don't reject, let caller handle exit code
      }
    });

    playwrightProcess.on('error', (error) => {
      console.error('❌ Failed to run Playwright tests:', error.message);
      reject(error);
    });
  });
}

/**
 * Clean up all processes
 */
async function cleanup() {
  console.log('\n🛑 Cleaning up processes...');
  
  const processes = [
    { name: 'Playwright', process: playwrightProcess },
    { name: 'Vercel', process: vercelProcess },
    { name: 'ngrok', process: ngrokProcess }
  ];

  for (const { name, process } of processes) {
    if (process && !process.killed) {
      console.log(`   Stopping ${name}...`);
      try {
        process.kill('SIGTERM');
        // Give process time to gracefully shutdown
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!process.killed) {
          console.log(`   Force killing ${name}...`);
          process.kill('SIGKILL');
        }
      } catch (error) {
        console.warn(`   Warning: Could not stop ${name}:`, error.message);
      }
    }
  }
  
  console.log('✅ Cleanup completed');
}

/**
 * Main execution
 */
async function main() {
  console.log('🎵 A Lo Cubano Boulder Fest - E2E Tests with ngrok');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Get test arguments (everything after --)
  const testArgs = process.argv.slice(2);
  
  let exitCode = 0;
  
  try {
    // Step 1: Check ngrok installation
    await checkNgrokInstallation();
    
    // Step 2: Start ngrok tunnel
    const tunnelUrl = await startNgrokTunnel();
    
    // Step 3: Verify tunnel accessibility
    await verifyNgrokTunnel(tunnelUrl);
    
    // Step 4: Start Vercel dev server
    await startVercelServer();
    
    // Step 5: Wait for application to be ready
    await waitForApplicationReady();
    
    console.log('\n✨ Environment is ready for E2E testing!');
    console.log(`   Application URL: ${NGROK_URL}`);
    console.log(`   Health endpoint: ${HEALTH_CHECK_URL}`);
    console.log('');
    
    // Step 6: Run E2E tests
    exitCode = await runPlaywrightTests(testArgs);
    
  } catch (error) {
    console.error('❌ E2E test setup failed:', error.message);
    exitCode = 1;
  } finally {
    // Step 7: Clean up
    await cleanup();
  }
  
  console.log('\n👋 E2E test run completed');
  process.exit(exitCode);
}

// Handle shutdown signals
process.on('SIGINT', async () => {
  console.log('\n⚠️  Received SIGINT, cleaning up...');
  await cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Received SIGTERM, cleaning up...');
  await cleanup();
  process.exit(1);
});

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught exception:', error);
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  await cleanup();
  process.exit(1);
});

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error) => {
    console.error('❌ Fatal error:', error);
    await cleanup();
    process.exit(1);
  });
}

export { 
  checkNgrokInstallation, 
  startNgrokTunnel, 
  startVercelServer, 
  runPlaywrightTests, 
  cleanup 
};