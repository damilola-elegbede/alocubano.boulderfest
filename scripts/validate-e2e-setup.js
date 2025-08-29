#!/usr/bin/env node

/**
 * Validation Script for E2E Testing Setup
 * 
 * This script validates that all prerequisites for E2E testing with ngrok are met:
 * - ngrok installation and configuration
 * - Required environment variables
 * - Playwright installation
 * - Database connectivity
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { checkNgrokInstallation } from './e2e-with-ngrok.js';

const execAsync = promisify(exec);

/**
 * Check if Playwright is properly installed
 */
async function checkPlaywrightSetup() {
  console.log('🎭 Checking Playwright installation...');
  
  try {
    const { stdout } = await execAsync('npx playwright --version');
    console.log('✅ Playwright is installed:', stdout.trim());
    
    // Check if browsers are installed
    try {
      await execAsync('npx playwright install --dry-run');
      console.log('✅ Playwright browsers are installed');
    } catch {
      console.warn('⚠️  Some Playwright browsers may be missing');
      console.warn('   Run: npm run test:e2e:install');
    }
  } catch {
    console.error('❌ Playwright is not installed');
    console.error('   Run: npm install @playwright/test');
    return false;
  }
  
  return true;
}

/**
 * Check environment variables
 */
function checkEnvironmentVariables() {
  console.log('🔧 Checking environment variables...');
  
  const requiredVars = [
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN'
  ];
  
  const optionalVars = [
    'NGROK_AUTHTOKEN',
    'TEST_ADMIN_PASSWORD',
    'ADMIN_SECRET',
    'ADMIN_PASSWORD'
  ];
  
  let allRequired = true;
  
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      console.log(`✅ ${varName} is set`);
    } else {
      console.error(`❌ ${varName} is not set (required)`);
      allRequired = false;
    }
  }
  
  for (const varName of optionalVars) {
    if (process.env[varName]) {
      console.log(`✅ ${varName} is set`);
    } else {
      console.warn(`⚠️  ${varName} is not set (optional)`);
    }
  }
  
  if (!allRequired) {
    console.error('\nRequired environment variables missing.');
    console.error('Please check your .env.local file or environment setup.');
  }
  
  return allRequired;
}

/**
 * Check database connectivity
 */
async function checkDatabaseConnectivity() {
  console.log('🗄️  Checking database connectivity...');
  
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('❌ Database credentials not available');
    return false;
  }
  
  try {
    // Import and test database connection
    const { getDatabaseClient } = await import('../api/lib/database.js');
    const client = await getDatabaseClient();
    
    // Simple connectivity test
    await client.execute('SELECT 1 as test');
    console.log('✅ Database connectivity successful');
    return true;
  } catch (error) {
    console.error('❌ Database connectivity failed:', error.message);
    return false;
  }
}

/**
 * Check Vercel CLI availability
 */
async function checkVercelCLI() {
  console.log('▲ Checking Vercel CLI...');
  
  try {
    const { stdout } = await execAsync('vercel --version');
    console.log('✅ Vercel CLI is installed:', stdout.trim());
    return true;
  } catch {
    console.error('❌ Vercel CLI is not installed');
    console.error('   Run: npm install -g vercel');
    return false;
  }
}

/**
 * Check port availability
 */
async function checkPortAvailability() {
  console.log('🔌 Checking port availability...');
  
  const port = 3000;
  
  try {
    await execAsync(`lsof -ti:${port}`);
    console.warn(`⚠️  Port ${port} is currently in use`);
    console.warn('   This may cause conflicts during testing');
    return false;
  } catch {
    console.log(`✅ Port ${port} is available`);
    return true;
  }
}

/**
 * Test basic internet connectivity
 */
async function checkInternetConnectivity() {
  console.log('🌐 Checking internet connectivity...');
  
  try {
    const response = await fetch('https://www.google.com', { 
      method: 'HEAD',
      timeout: 5000 
    });
    
    if (response.ok) {
      console.log('✅ Internet connectivity is working');
      return true;
    } else {
      console.warn('⚠️  Internet connectivity may be limited');
      return false;
    }
  } catch (error) {
    console.error('❌ Internet connectivity failed:', error.message);
    return false;
  }
}

/**
 * Generate validation report
 */
function generateReport(results) {
  console.log('\n📋 VALIDATION REPORT');
  console.log('═══════════════════════════════════════════════════');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([check, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${check}`);
  });
  
  console.log('═══════════════════════════════════════════════════');
  console.log(`📊 Results: ${passed}/${total} checks passed`);
  
  if (passed === total) {
    console.log('🎉 All checks passed! E2E testing setup is ready.');
    console.log('\nYou can now run:');
    console.log('   npm run test:e2e:ngrok');
  } else {
    console.log('⚠️  Some checks failed. Please address the issues above.');
    console.log('\nFor help, see: docs/testing/NGROK_E2E_SETUP.md');
  }
  
  return passed === total;
}

/**
 * Main validation function
 */
async function main() {
  console.log('🧪 A Lo Cubano Boulder Fest - E2E Setup Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const results = {};
  
  try {
    results['ngrok Installation'] = await checkNgrokInstallation().then(() => true).catch(() => false);
    results['Playwright Setup'] = await checkPlaywrightSetup();
    results['Environment Variables'] = checkEnvironmentVariables();
    results['Database Connectivity'] = await checkDatabaseConnectivity();
    results['Vercel CLI'] = await checkVercelCLI();
    results['Port Availability'] = await checkPortAvailability();
    results['Internet Connectivity'] = await checkInternetConnectivity();
    
  } catch (error) {
    console.error('❌ Validation failed with error:', error.message);
    return false;
  }
  
  const allPassed = generateReport(results);
  process.exit(allPassed ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Fatal validation error:', error);
    process.exit(1);
  });
}

export { 
  checkPlaywrightSetup, 
  checkEnvironmentVariables, 
  checkDatabaseConnectivity,
  checkVercelCLI,
  checkPortAvailability,
  checkInternetConnectivity
};