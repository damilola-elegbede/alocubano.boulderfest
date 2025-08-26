/**
 * Global setup for Playwright E2E tests
 * Runs once before all test suites
 * Handles environment initialization, database setup, and browser warming
 */

import { chromium, firefox, webkit } from '@playwright/test';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');

// Global variables to track server and browser processes
let serverProcess = null;
let browsers = [];

/**
 * Verify we're not running against production
 */
function validateEnvironment() {
  const prohibitedUrls = [
    'alocubanoboulderfest.com',
    'alocubano.com',
    'production',
    'prod.vercel'
  ];
  
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_BASE_URL || 'http://localhost:3000';
  
  for (const prohibited of prohibitedUrls) {
    if (baseUrl.includes(prohibited)) {
      console.error(`❌ SAFETY CHECK FAILED: Cannot run E2E tests against ${prohibited} URL`);
      console.error(`   Current URL: ${baseUrl}`);
      console.error(`   Set TEST_BASE_URL or PLAYWRIGHT_BASE_URL to a test environment`);
      throw new Error(`Safety check failed for base URL: ${baseUrl}`);
    }
  }
  
  // Ensure we're in test mode
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot run E2E tests in production mode');
    throw new Error('NODE_ENV must not be production for E2E tests');
  }
  
  console.log('✅ Environment validation passed');
  console.log(`   Test URL: ${baseUrl}`);
}

/**
 * Setup E2E test database
 */
async function setupDatabase() {
  console.log('🗄️  Setting up E2E test database...');
  
  // Check if setup script exists
  const setupScript = path.join(projectRoot, 'scripts', 'setup-e2e-database.js');
  if (!existsSync(setupScript)) {
    console.log('   ℹ️  E2E database setup script not found, skipping database setup');
    return;
  }
  
  return new Promise((resolve, reject) => {
    const setup = spawn('node', [setupScript, 'setup'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        E2E_TEST_MODE: 'true',
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });
    
    let output = '';
    setup.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`   ${data.toString().trim()}`);
    });
    
    setup.stderr.on('data', (data) => {
      console.error(`   ⚠️  ${data.toString().trim()}`);
    });
    
    setup.on('close', (code) => {
      if (code !== 0) {
        console.error(`   ❌ Database setup failed with code ${code}`);
        reject(new Error('Database setup failed'));
      } else {
        console.log('   ✅ E2E test database ready');
        resolve();
      }
    });
  });
}

/**
 * Start local test server if needed
 */
async function startTestServer() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_BASE_URL || 'http://localhost:3000';
  
  // Skip if not localhost
  if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    console.log(`ℹ️  Using external test server: ${baseUrl}`);
    return;
  }
  
  // Check if server is already running
  try {
    const response = await fetch(`${baseUrl}/api/health/check`);
    if (response.ok) {
      console.log('✅ Test server already running');
      return;
    }
  } catch (error) {
    // Server not running, we'll start it
  }
  
  console.log('🚀 Starting local test server...');
  
  return new Promise((resolve, reject) => {
    serverProcess = spawn('npm', ['run', 'start:local'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3000',
        // E2E tests use TURSO_DATABASE_URL from .env.local
        // Don't override DATABASE_URL - let it use TURSO
        E2E_TEST_MODE: 'true',
        CI: 'true' // Suppress interactive prompts
      },
      detached: false,
      stdio: 'pipe'
    });
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server running') || output.includes('Ready on') || output.includes('started on port')) {
        console.log('   ✅ Test server started');
        // Give server a moment to fully initialize
        setTimeout(resolve, 2000);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('Warning') && !error.includes('Deprecation')) {
        console.error(`   Server error: ${error}`);
      }
    });
    
    serverProcess.on('error', (error) => {
      console.error('   ❌ Failed to start server:', error);
      reject(error);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (!serverProcess.killed) {
        console.log('   ⚠️  Server start timeout, proceeding anyway');
        resolve();
      }
    }, 30000);
  });
}

/**
 * Warm up browser engines to reduce first test latency
 */
async function warmupBrowsers() {
  console.log('🔥 Warming up browser engines...');
  
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_BASE_URL || 'http://localhost:3000';
  
  // Only warm up browsers that will be used in tests
  const browsersToWarm = [];
  
  if (!process.env.PLAYWRIGHT_BROWSER || process.env.PLAYWRIGHT_BROWSER.includes('chromium')) {
    browsersToWarm.push({ name: 'Chromium', launcher: chromium });
  }
  if (!process.env.PLAYWRIGHT_BROWSER || process.env.PLAYWRIGHT_BROWSER.includes('firefox')) {
    browsersToWarm.push({ name: 'Firefox', launcher: firefox });
  }
  if (!process.env.PLAYWRIGHT_BROWSER || process.env.PLAYWRIGHT_BROWSER.includes('webkit')) {
    browsersToWarm.push({ name: 'WebKit', launcher: webkit });
  }
  
  for (const { name, launcher } of browsersToWarm) {
    try {
      console.log(`   🌐 Warming up ${name}...`);
      const browser = await launcher.launch({ 
        headless: true,
        timeout: 10000 
      });
      
      const context = await browser.newContext();
      const page = await context.newPage();
      
      // Navigate to base URL to warm up
      await page.goto(baseUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      }).catch(() => {
        // Ignore navigation errors during warmup
      });
      
      await page.close();
      await context.close();
      await browser.close();
      
      console.log(`   ✅ ${name} warmed up`);
    } catch (error) {
      console.log(`   ⚠️  Failed to warm up ${name}: ${error.message}`);
    }
  }
}

/**
 * Main global setup function
 */
async function globalSetup() {
  console.log('\n🎭 Playwright E2E Test Setup\n');
  console.log('═'.repeat(50));
  
  try {
    // 1. Validate environment
    validateEnvironment();
    
    // 2. Setup database (if script exists)
    await setupDatabase().catch(error => {
      console.log('   ⚠️  Database setup skipped:', error.message);
    });
    
    // 3. Start test server (if needed)
    await startTestServer().catch(error => {
      console.log('   ⚠️  Server start skipped:', error.message);
    });
    
    // 4. Warm up browsers (optional, improves first test speed)
    if (!process.env.SKIP_BROWSER_WARMUP) {
      await warmupBrowsers().catch(error => {
        console.log('   ⚠️  Browser warmup skipped:', error.message);
      });
    }
    
    console.log('\n✅ Global setup complete\n');
    console.log('═'.repeat(50));
    
    // Store server process reference for teardown
    if (serverProcess) {
      global.__SERVER_PROCESS__ = serverProcess;
    }
    
  } catch (error) {
    console.error('\n❌ Global setup failed:', error);
    
    // Clean up on failure
    if (serverProcess) {
      serverProcess.kill();
    }
    
    throw error;
  }
}

export default globalSetup;