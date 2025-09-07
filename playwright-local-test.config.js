/**
 * Simple Playwright Configuration for Local Testing
 * 
 * This is a minimal configuration for testing admin-auth locally without
 * complex preview deployment or CI requirements.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  
  // Execution configuration
  fullyParallel: false,
  retries: 1,
  workers: 1,
  
  // Reporting
  reporter: [['list'], ['html', { open: 'on-failure' }]],
  
  // Test timeout
  timeout: 60000,
  
  // Use configuration
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 30000,
    navigationTimeout: 45000
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],

  // Expect configuration
  expect: {
    timeout: 15000,
  },
});