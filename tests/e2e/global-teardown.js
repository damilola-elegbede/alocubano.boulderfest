/**
 * Global teardown for Playwright E2E tests
 * Runs once after all test suites complete
 * Handles cleanup, resource closure, and verification
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..', '..');

/**
 * Clean up E2E test database
 */
async function cleanupDatabase() {
  console.log('🧹 Cleaning up E2E test database...');
  
  // Check if cleanup script exists
  const setupScript = path.join(projectRoot, 'scripts', 'setup-e2e-database.js');
  if (!existsSync(setupScript)) {
    console.log('   ℹ️  E2E database cleanup script not found, skipping');
    return;
  }
  
  return new Promise((resolve) => {
    const cleanup = spawn('node', [setupScript, 'clean'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        E2E_TEST_MODE: 'true',
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });
    
    cleanup.stdout.on('data', (data) => {
      console.log(`   ${data.toString().trim()}`);
    });
    
    cleanup.stderr.on('data', (data) => {
      console.error(`   ⚠️  ${data.toString().trim()}`);
    });
    
    cleanup.on('close', (code) => {
      if (code !== 0) {
        console.error(`   ⚠️  Database cleanup exited with code ${code}`);
      } else {
        console.log('   ✅ Database cleaned up');
      }
      resolve(); // Always resolve, don't fail teardown
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!cleanup.killed) {
        cleanup.kill();
        resolve();
      }
    }, 10000);
  });
}

/**
 * Stop the test server if it was started
 */
async function stopTestServer() {
  const serverProcess = global.__SERVER_PROCESS__;
  
  if (!serverProcess || serverProcess.killed) {
    return;
  }
  
  console.log('🛑 Stopping test server...');
  
  return new Promise((resolve) => {
    // Try graceful shutdown first
    serverProcess.kill('SIGTERM');
    
    // Give it time to shut down gracefully
    setTimeout(() => {
      if (!serverProcess.killed) {
        // Force kill if still running
        serverProcess.kill('SIGKILL');
      }
      console.log('   ✅ Test server stopped');
      resolve();
    }, 2000);
  });
}

/**
 * Verify no resource leaks or dangling processes
 */
async function verifyCleanState() {
  console.log('🔍 Verifying clean state...');
  
  // Check for any leaked browser processes
  const browserProcesses = ['chromium', 'firefox', 'webkit', 'chrome', 'msedge'];
  
  return new Promise((resolve) => {
    const ps = spawn('ps', ['aux'], {
      stdio: 'pipe'
    });
    
    let output = '';
    ps.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ps.on('close', () => {
      const lines = output.split('\n');
      const leakedProcesses = lines.filter(line => {
        const lowerLine = line.toLowerCase();
        return browserProcesses.some(browser => 
          lowerLine.includes(browser) && 
          (lowerLine.includes('playwright') || lowerLine.includes('e2e'))
        );
      });
      
      if (leakedProcesses.length > 0) {
        console.log(`   ⚠️  Found ${leakedProcesses.length} potential leaked browser processes`);
        leakedProcesses.forEach(process => {
          console.log(`      ${process.substring(0, 80)}...`);
        });
      } else {
        console.log('   ✅ No leaked browser processes detected');
      }
      
      resolve();
    });
    
    ps.on('error', () => {
      // ps command not available, skip verification
      console.log('   ℹ️  Process verification skipped');
      resolve();
    });
  });
}

/**
 * Generate summary report
 */
function generateSummary() {
  console.log('\n📊 Test Run Summary');
  console.log('═'.repeat(50));
  
  const reportPath = path.join(projectRoot, 'playwright-report', 'index.html');
  const resultsPath = path.join(projectRoot, 'test-results');
  
  if (existsSync(reportPath)) {
    console.log(`📈 HTML Report: ${reportPath}`);
  }
  
  if (existsSync(resultsPath)) {
    console.log(`📁 Test Results: ${resultsPath}`);
  }
  
  console.log('\n💡 Tips:');
  console.log('   - Run "npx playwright show-report" to view HTML report');
  console.log('   - Check test-results/ for screenshots and videos');
  console.log('   - Use --headed flag to run tests with browser UI');
}

/**
 * Main global teardown function
 */
async function globalTeardown() {
  console.log('\n🎭 Playwright E2E Test Teardown\n');
  console.log('═'.repeat(50));
  
  try {
    // 1. Stop test server
    await stopTestServer().catch(error => {
      console.error('   ⚠️  Server stop error:', error.message);
    });
    
    // 2. Clean up database
    if (!process.env.KEEP_TEST_DATA) {
      await cleanupDatabase().catch(error => {
        console.error('   ⚠️  Database cleanup error:', error.message);
      });
    } else {
      console.log('ℹ️  Keeping test data (KEEP_TEST_DATA=true)');
    }
    
    // 3. Verify clean state
    await verifyCleanState().catch(error => {
      console.error('   ⚠️  Verification error:', error.message);
    });
    
    // 4. Generate summary
    generateSummary();
    
    console.log('\n✅ Global teardown complete\n');
    console.log('═'.repeat(50));
    
  } catch (error) {
    console.error('\n⚠️  Global teardown encountered errors:', error);
    // Don't throw - we want teardown to complete even with errors
  }
}

export default globalTeardown;