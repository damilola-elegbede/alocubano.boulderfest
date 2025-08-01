/**
 * Playwright Configuration for E2E Testing
 * Comprehensive setup for browser testing across multiple environments
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  // Test directory
  testDir: join(__dirname, '../tests/e2e'),
  
  // Timeout settings
  timeout: 30000, // 30 seconds per test
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },
  
  // Test execution settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'tests/e2e-results' }],
    ['json', { outputFile: 'tests/e2e-results/results.json' }],
    ['junit', { outputFile: 'tests/e2e-results/results.xml' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  // Global setup and teardown
  globalSetup: join(__dirname, '../tests/e2e/setup/global-setup.js'),
  globalTeardown: join(__dirname, '../tests/e2e/setup/global-teardown.js'),
  
  // Output directory
  outputDir: 'tests/e2e-results/artifacts',
  
  // Shared settings for all projects
  use: {
    // Base URL for tests
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    
    // Browser settings
    headless: process.env.CI ? true : false,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    
    // Recording settings
    video: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    
    // Network settings
    acceptDownloads: true,
    permissions: ['geolocation'],
    
    // Test data and state
    storageState: 'tests/e2e/setup/auth.json',
    
    // Custom test fixtures
    actionTimeout: 15000,
    navigationTimeout: 30000
  },

  // Test projects for different browsers and scenarios
  projects: [
    // Setup project - runs before all tests
    {
      name: 'setup',
      testMatch: /setup\/.*\.setup\.js/,
      use: { ...devices['Desktop Chrome'] }
    },
    
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup']
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup']
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup']
    },
    
    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup']
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
      dependencies: ['setup']
    },
    
    // High DPI displays
    {
      name: 'high-dpi',
      use: { 
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 2,
        viewport: { width: 1920, height: 1080 }
      },
      dependencies: ['setup']
    },
    
    // Accessibility testing
    {
      name: 'accessibility',
      use: { 
        ...devices['Desktop Chrome'],
        colorScheme: 'dark' // Test dark mode
      },
      testMatch: /.*\.a11y\.e2e\.js/,
      dependencies: ['setup']
    },
    
    // Performance testing
    {
      name: 'performance',
      use: { 
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-precise-memory-info']
        }
      },
      testMatch: /.*\.perf\.e2e\.js/,
      dependencies: ['setup']
    }
  ],

  // Web server configuration
  webServer: process.env.CI ? undefined : {
    command: 'npm start',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_TEST_PUBLISHABLE_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_TEST_SECRET_KEY,
      MOCK_PAYMENTS: 'true',
      MOCK_EMAILS: 'true'
    }
  },

  // Test metadata
  metadata: {
    testSuite: 'A Lo Cubano Boulder Fest Payment System E2E Tests',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'test',
    buildId: process.env.GITHUB_RUN_ID || 'local'
  }
});