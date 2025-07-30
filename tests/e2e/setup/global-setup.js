/**
 * Playwright Global Setup
 * Sets up test environment before all E2E tests
 */

import { chromium } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

async function globalSetup(config) {
  console.log('🔧 Setting up E2E test environment...');

  // Load test environment variables
  dotenv.config({ path: '.env.test' });
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.PLAYWRIGHT_TEST = 'true';
  
  try {
    // Setup test database
    console.log('📊 Setting up test database...');
    await execAsync('npm run db:migrate -- --test');
    
    // Warm up the application
    console.log('🔥 Warming up application...');
    await warmupApplication(config);
    
    // Create test user session if needed
    console.log('👤 Setting up test user session...');
    await setupTestUserSession(config);
    
    console.log('✅ E2E test environment ready');
    
  } catch (error) {
    console.error('❌ E2E setup failed:', error);
    process.exit(1);
  }
}

/**
 * Warm up the application by making initial requests
 */
async function warmupApplication(config) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    const baseURL = config.projects[0].use.baseURL;
    
    // Visit main pages to warm up
    await page.goto(`${baseURL}/`);
    await page.waitForLoadState('networkidle');
    
    await page.goto(`${baseURL}/tickets`);
    await page.waitForLoadState('networkidle');
    
    // Pre-load critical resources
    await page.evaluate(() => {
      // Preload payment form
      if (window.loadPaymentForm) {
        window.loadPaymentForm();
      }
    });
    
  } finally {
    await browser.close();
  }
}

/**
 * Setup test user session for authenticated tests
 */
async function setupTestUserSession(config) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    const baseURL = config.projects[0].use.baseURL;
    
    // Create test user session
    await page.goto(`${baseURL}/`);
    
    // Set test user data in localStorage
    await page.evaluate(() => {
      localStorage.setItem('test_user', JSON.stringify({
        email: 'e2e-test@example.com',
        name: 'E2E Test User',
        preferences: {
          currency: 'USD',
          newsletter: false
        }
      }));
    });
    
    // Save authentication state
    await context.storageState({ path: 'tests/e2e/setup/auth.json' });
    
  } finally {
    await browser.close();
  }
}

export default globalSetup;