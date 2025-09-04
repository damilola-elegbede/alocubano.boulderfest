/**
 * Modern Playwright E2E Configuration - Vercel Preview Deployments
 * 
 * This configuration is the MODERN approach for E2E testing that uses:
 * - Live Vercel Preview Deployments instead of local dev servers
 * - Production-like environment testing with real serverless functions
 * - No server management complexity or port allocation issues
 * - Better CI/CD integration with native Vercel workflows
 * - Eliminated server hanging and resource conflicts
 * 
 * BENEFITS over legacy Vercel Dev server approach:
 * - Real production environment testing
 * - No local server startup time or hanging issues
 * - Authentic API routing and serverless behavior
 * - Zero port conflicts or resource contention
 * - Better reliability and faster execution
 * - Native CI/CD integration with deployment workflows
 */

import { defineConfig, devices } from '@playwright/test';

// Base URL comes from environment variable set by CI workflow
const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.PREVIEW_URL || 'http://localhost:3000';

// Validate we have a proper target URL
if (!baseURL.startsWith('http')) {
  throw new Error(`Invalid base URL: ${baseURL}. Expected format: https://example.vercel.app`);
}

console.log(`🎭 Modern Playwright E2E Preview Config:`);
console.log(`  Target URL: ${baseURL}`);
console.log(`  Environment: ${baseURL.includes('vercel.app') ? 'Vercel Preview Deployment' : 'Local Development'}`);
console.log(`  Approach: Modern (no local server management)`);
console.log(`  Database: Production/Preview environment database`);

export default defineConfig({
  testDir: './tests/e2e/flows',
  fullyParallel: true, // Safe for preview deployments (no local resource conflicts)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 1, // Parallel workers safe with preview deployments
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  
  timeout: 60000, // 1 minute per test (faster than local server approach)
  
  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Viewport and device emulation
    viewport: { width: 1280, height: 720 },
    
    // Network and timing (optimized for preview deployments)
    actionTimeout: 15000, // 15 seconds for actions
    navigationTimeout: 30000, // 30 seconds for navigation (faster than local servers)
    
    // Additional headers for better preview deployment testing
    extraHTTPHeaders: {
      'User-Agent': 'Playwright-E2E-Tests-Preview'
    }
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefox-specific optimizations for CI environment
        actionTimeout: 20000, // Increased from 15000
        navigationTimeout: 45000, // Increased from 30000
        // Firefox handles network requests differently in CI
        extraHTTPHeaders: {
          'User-Agent': 'Playwright-E2E-Tests-Preview-Firefox'
        }
      },
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

  // MODERN APPROACH: No webServer configuration needed!
  // Tests run directly against live Vercel Preview Deployments
  // 
  // BENEFITS of this approach:
  // ✅ No server startup time or hanging issues
  // ✅ Production-like environment with real serverless functions
  // ✅ Authentic API routing and database connections
  // ✅ No port conflicts or resource management
  // ✅ Better CI/CD integration
  // ✅ Faster test execution
  // ✅ More reliable results
  
  // Global setup/teardown for preview environment
  globalSetup: './tests/e2e/global-setup-preview.js',
  globalTeardown: './tests/e2e/global-teardown-preview.js',
});