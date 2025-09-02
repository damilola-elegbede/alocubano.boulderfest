/**
 * Playwright E2E Configuration - Vercel Dev Server with Real APIs
 * Uses Vercel dev server with Turso database for production-like testing environment
 * REQUIRES: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables
 * 
 * Note: Uses localhost:3000 with Vercel dev for local development and testing
 */

import { defineConfig, devices } from '@playwright/test';

// Require Turso database for E2E tests
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error('\n❌ ERROR: Turso database credentials are required for E2E tests');
  console.error('Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables');
  console.error('E2E tests require production-like database for comprehensive testing\n');
  process.exit(1);
}

export default defineConfig({
  testDir: './tests/e2e/flows',
  fullyParallel: false, // Run sequentially to avoid database conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Allow one retry locally for flaky tests
  workers: 1, // Single worker to avoid database race conditions
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  
  timeout: 45000, // 45 seconds for better stability with Vercel dev server
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Viewport and device emulation
    viewport: { width: 1280, height: 720 },
    
    // Network and timing (increased for stability)
    actionTimeout: 20000, // 20 seconds for actions
    navigationTimeout: 40000, // 40 seconds for navigation
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    // Use our optimized Vercel dev E2E script
    // This avoids all recursion and configuration issues
    command: 'node scripts/vercel-dev-e2e.js',
    url: 'http://localhost:3000/api/health/check',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 60000, // 60 seconds for Vercel dev startup
    stdout: 'pipe',
    stderr: 'pipe',
    
    // Environment variables for the server
    env: {
      NODE_ENV: 'development',
      PORT: '3000',
      // E2E testing configuration
      E2E_TEST_MODE: 'true',
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || 'test-password',
      // Pass through authentication variables
      ADMIN_SECRET: process.env.ADMIN_SECRET,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      // Database configuration (required)
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
      // Skip database init to prevent hanging
      SKIP_DATABASE_INIT: 'true',
    },
  },
  
  // Global setup/teardown can still be used with Vercel dev
  globalSetup: './tests/e2e/global-setup.js',
  globalTeardown: './tests/e2e/global-teardown.js',
});