/**
 * Playwright E2E Configuration - Vercel Dev Server + Turso Database
 * Optimized for CI/CD with integrated Vercel dev server startup
 * REQUIRES: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables
 * 
 * Note: Uses ngrok tunnel (alocubanoboulderfest.ngrok.io) for external access
 * while server runs locally on port 3000 via Vercel dev
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
  fullyParallel: false, // Run sequentially to avoid database conflicts with Turso
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to avoid race conditions
  reporter: process.env.CI 
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html']],
  
  timeout: 90000, // 90 seconds for Vercel dev server + network latency
  
  use: {
    baseURL: 'https://alocubanoboulderfest.ngrok.io',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000, // 30 seconds for actions
    navigationTimeout: 45000, // 45 seconds for navigation
    
    // Enhanced debugging
    ...(process.env.CI && {
      headless: true,
      viewport: { width: 1280, height: 720 },
    })
  },

  // Global setup and teardown
  globalSetup: './tests/e2e/global-setup.js',
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
    // Server runs locally on port 3000, accessed via ngrok tunnel
    command: 'vercel dev --yes --listen 3000',
    url: 'https://alocubanoboulderfest.ngrok.io/api/health/check',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 30000, // 30 seconds for Vercel dev startup
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