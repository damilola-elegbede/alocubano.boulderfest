/**
 * Playwright E2E Configuration - CI Environment
 * Optimized for GitHub Actions CI with SQLite database
 * Uses local test server without external dependencies like Turso or ngrok
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/flows',
  fullyParallel: false, // Run sequentially to avoid database conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to avoid race conditions with SQLite
  reporter: process.env.CI 
    ? [
        ['list'], 
        ['html', { outputFolder: 'playwright-report', open: 'never' }], 
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['json', { outputFile: 'test-results/test-results.json' }]
      ]
    : [['list'], ['html']],
  
  timeout: 60000, // 60 seconds for CI (increased for memory-constrained environments)
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000, // 30 seconds for actions (increased for CI)
    navigationTimeout: 45000, // 45 seconds for navigation (increased for CI)
    
    // CI-optimized settings
    ...(process.env.CI && {
      headless: true,
      viewport: { width: 1280, height: 720 },
    })
  },

  // Global setup and teardown
  globalSetup: './tests/e2e/global-setup-ci.js',
  globalTeardown: './tests/e2e/global-teardown-ci.js',

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
              '--disable-renderer-backgrounding',
              '--disable-ipc-flooding-protection'
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

    // Only include webkit/mobile if specifically enabled
    ...(process.env.ALL_BROWSERS !== 'false' ? [
      {
        name: 'webkit',
        use: { 
          ...devices['Desktop Safari'],
        },
      },
      {
        name: 'mobile-chrome',
        use: { ...devices['Pixel 5'] },
      },
      {
        name: 'mobile-safari',
        use: { ...devices['iPhone 12'] },
      },
    ] : []),
  ],

  // Web server configuration for CI
  webServer: {
    command: 'npm run start:ci',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 180000, // 3 minutes startup timeout (increased for memory-constrained CI)
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      CI_PORT: '3000',
      SKIP_DATABASE_INIT: 'true',
      CI_ENVIRONMENT: 'true'
    }
  },
});