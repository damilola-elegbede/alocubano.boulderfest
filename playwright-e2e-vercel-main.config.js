/**
 * Playwright E2E Configuration - Vercel Dev Server with Dynamic Port Allocation
 * 
 * Key Features:
 * - Dynamic port allocation (3000-3005) for parallel CI execution
 * - Database isolation per test suite using port-specific databases
 * - Production-like testing environment with Vercel dev server
 * - Always starts fresh server (reuseExistingServer: false) for test isolation
 * 
 * Environment Variables:
 * - DYNAMIC_PORT: CI matrix port allocation (3000-3005)
 * - PORT: Standard port environment variable
 * - PLAYWRIGHT_BASE_URL: Override base URL if needed
 * - TURSO_DATABASE_URL & TURSO_AUTH_TOKEN: Required for E2E tests
 * 
 * Port Allocation Matrix:
 * - Standard Suite: 3000 (port-offset: 0)
 * - Advanced Suite: 3001 (port-offset: 1)
 * - Firefox Suite: 3002 (port-offset: 2)
 * - Performance Suite: 3003 (port-offset: 3)
 * - Accessibility Suite: 3004 (port-offset: 4)
 * - Security Suite: 3005 (port-offset: 5)
 */

import { defineConfig, devices } from '@playwright/test';

// Require Turso database for E2E tests
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error('\n❌ ERROR: Turso database credentials are required for E2E tests');
  console.error('Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables');
  console.error('E2E tests require production-like database for comprehensive testing\n');
  process.exit(1);
}

// Dynamic port allocation for parallel test execution
// Support multiple environment variables for maximum flexibility:
// - DYNAMIC_PORT: Used by CI matrix for port allocation (3000-3005)
// - PORT: Standard environment variable
// - Default: 3000 for local development
const testPort = process.env.DYNAMIC_PORT || process.env.PORT || 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${testPort}`;

console.log(`🎭 Playwright E2E Vercel Config:`);
console.log(`  Port: ${testPort} (DYNAMIC_PORT=${process.env.DYNAMIC_PORT}, PORT=${process.env.PORT})`);
console.log(`  Base URL: ${baseURL}`);
console.log(`  Health Check: ${baseURL}/api/health/check`);
console.log(`  Reuse Server: ${!process.env.CI} (CI isolation: ${!!process.env.CI})`);
console.log(`  Database: Port-isolated for test safety`);

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
    baseURL: baseURL,
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
    // Use our optimized Vercel dev E2E script with dynamic port support
    // This avoids all recursion and configuration issues
    command: `node scripts/vercel-dev-e2e.js --port ${testPort}`,
    url: `${baseURL}/api/health/check`,
    port: parseInt(testPort, 10),
    reuseExistingServer: false, // Always false for CI isolation and test safety
    timeout: 60000, // 60 seconds for Vercel dev startup
    stdout: 'pipe',
    stderr: 'pipe',
    
    // Environment variables for the server
    env: {
      NODE_ENV: 'development',
      PORT: testPort.toString(),
      DYNAMIC_PORT: testPort.toString(), // Ensure both are set for compatibility
      // E2E testing configuration
      E2E_TEST_MODE: 'true',
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || 'test-password',
      // Pass through authentication variables
      ADMIN_SECRET: process.env.ADMIN_SECRET,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      // Database configuration (required for E2E tests)
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
      // Skip database init to prevent hanging
      SKIP_DATABASE_INIT: 'true',
      // Vercel dev specific settings
      VERCEL_DEV_STARTUP: 'true',
      // CI environment markers
      CI: process.env.CI || 'false',
    },
  },
  
  // Global setup/teardown can still be used with Vercel dev
  globalSetup: './tests/e2e/global-setup.js',
  globalTeardown: './tests/e2e/global-teardown.js',
});