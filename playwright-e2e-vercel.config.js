/**
 * Playwright E2E Configuration - Vercel Dev Server + Database (Turso or SQLite)
 * Optimized for CI/CD with integrated Vercel dev server startup
 * OPTIONAL: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for production-like testing
 * FALLBACK: Uses SQLite for local development and CI testing
 * 
 * Note: Uses localhost:3000 with Vercel dev for local development and testing
 */

import { defineConfig, devices } from '@playwright/test';

// Check Turso database configuration (optional)
const hasTurso = process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN;
if (!hasTurso) {
  console.warn('\n⚠️  Turso database credentials not found');
  console.warn('E2E tests will use SQLite fallback for local testing');
  console.warn('For production-like testing, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN\n');
} else {
  console.log('\n✅ Using Turso database for production-like E2E testing\n');
}

// Configurable timeouts via environment variables for CI/CD flexibility
const STARTUP_TIMEOUT = Number(process.env.E2E_STARTUP_TIMEOUT || 60000);
const TEST_TIMEOUT = Number(process.env.E2E_TEST_TIMEOUT || 90000);
const ACTION_TIMEOUT = Number(process.env.E2E_ACTION_TIMEOUT || 30000);
const NAVIGATION_TIMEOUT = Number(process.env.E2E_NAVIGATION_TIMEOUT || 45000);
const WEBSERVER_TIMEOUT = Number(process.env.E2E_WEBSERVER_TIMEOUT || 30000);

export default defineConfig({
  testDir: './tests/e2e/flows',
  fullyParallel: false, // Run sequentially to avoid database conflicts with Turso
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to avoid race conditions
  reporter: process.env.CI 
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html']],
  
  timeout: TEST_TIMEOUT, // Configurable test timeout for Vercel dev server + network latency
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: ACTION_TIMEOUT, // Configurable action timeout
    navigationTimeout: NAVIGATION_TIMEOUT, // Configurable navigation timeout
    
    // Enhanced debugging
    ...(process.env.CI && {
      headless: true,
      viewport: { width: 1280, height: 720 },
    })
  },

  // Global setup and teardown standardized across all configs
  globalSetup: './tests/e2e/global-setup-ci.js',
  globalTeardown: './tests/e2e/global-teardown.js',

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Enhanced for CI stability
        ...(process.env.CI && {
          launchOptions: {
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-web-security',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding'
            ]
          }
        })
      },
    },
    
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Enhanced for CI stability
        ...(process.env.CI && {
          launchOptions: {
            firefoxUserPrefs: {
              'network.http.max-connections': 200,
              'network.http.max-connections-per-server': 10
            }
          }
        })
      },
    },
  ],

  // Integrated Vercel dev server startup
  webServer: {
    // Server runs locally on port 3000
    command: 'npm run dev',
    url: 'http://localhost:3000/api/health/check',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: WEBSERVER_TIMEOUT, // Configurable Vercel dev startup timeout
    stdout: 'pipe',
    stderr: 'pipe',
    
    env: {
      NODE_ENV: 'development',
      PORT: '3000',
      // E2E testing configuration
      E2E_TEST_MODE: 'true',
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || 'test-password',
      // Pass through authentication variables
      ADMIN_SECRET: process.env.ADMIN_SECRET,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      // Database configuration
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    },
  },
});