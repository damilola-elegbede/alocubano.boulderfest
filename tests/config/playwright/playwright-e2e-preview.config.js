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
 * 
 * CRITICAL: Always use 'npx playwright' instead of global 'playwright' command
 * to avoid version mismatches between CLI and @playwright/test package versions.
 */

import { defineConfig, devices } from '@playwright/test';

// Base URL comes from environment variable set by CI workflow or preview extraction
const baseURL = process.env.PREVIEW_URL || 
                process.env.PLAYWRIGHT_BASE_URL || 
                process.env.CI_EXTRACTED_PREVIEW_URL ||
                'http://localhost:3000';

// Validate we have a proper target URL
if (!baseURL.startsWith('http')) {
  throw new Error(`Invalid base URL: ${baseURL}. Expected format: https://example.vercel.app`);
}

console.log(`🎭 Modern Playwright E2E Preview Config:`);
console.log(`  Target URL: ${baseURL}`);
console.log(`  Environment: ${baseURL.includes('vercel.app') ? 'Vercel Preview Deployment' : 'Local Development'}`);
console.log(`  Approach: Modern (no local server management)`);
console.log(`  Database: Production/Preview environment database`);
console.log(`  Timeout Strategy: ${process.env.CI ? 'CI-optimized (extended)' : 'Local (faster)'}`);

export default defineConfig({
  testDir: '../../e2e/flows',
  testMatch: '**/*.test.js',
  testIgnore: [
    '**/node_modules/**',
    '**/helpers/**',
    '**/fixtures/**',
    '**/config/**',
    '**/utilities/**',
    '**/*.helper.js',
    '**/*.config.js',
    '**/*.setup.js',
    '**/*.teardown.js',
    '**/README*.md'
  ],
  fullyParallel: true, // Safe for preview deployments (no local resource conflicts)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 1, // Parallel workers safe with preview deployments
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  
  // Environment-based timeout configurations
  timeout: process.env.CI 
    ? parseInt(process.env.E2E_TEST_TIMEOUT || '90000', 10)  // 90s in CI
    : parseInt(process.env.E2E_TEST_TIMEOUT || '60000', 10), // 60s locally
  
  // Global expect timeout
  expect: {
    timeout: process.env.CI
      ? parseInt(process.env.E2E_EXPECT_TIMEOUT || '20000', 10) // 20s in CI
      : parseInt(process.env.E2E_EXPECT_TIMEOUT || '15000', 10) // 15s locally
  },
  
  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Viewport and device emulation
    viewport: { width: 1280, height: 720 },
    
    // Environment-adaptive timeout configurations
    actionTimeout: process.env.CI
      ? parseInt(process.env.E2E_ACTION_TIMEOUT || '30000', 10)      // 30s in CI
      : parseInt(process.env.E2E_ACTION_TIMEOUT || '15000', 10),     // 15s locally
    
    navigationTimeout: process.env.CI
      ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '60000', 10)  // 60s in CI  
      : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '30000', 10), // 30s locally
    
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
        // Firefox-specific timeout optimizations for CI environment
        actionTimeout: process.env.CI
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '40000', 10)      // 40s in CI (Firefox needs more)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '20000', 10),     // 20s locally
        
        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '75000', 10)  // 75s in CI (Firefox needs more)  
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '45000', 10), // 45s locally
        
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
      use: { 
        ...devices['Pixel 5'],
        // Mobile Chrome timeout optimizations
        actionTimeout: process.env.CI
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '35000', 10)      // 35s in CI (mobile needs more)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '20000', 10),     // 20s locally
        
        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '70000', 10)  // 70s in CI (mobile needs more)
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '40000', 10), // 40s locally
      },
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        // Mobile Safari timeout optimizations
        actionTimeout: process.env.CI
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '40000', 10)      // 40s in CI (Safari mobile needs most)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '25000', 10),     // 25s locally
        
        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '80000', 10)  // 80s in CI (Safari mobile needs most)
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '50000', 10), // 50s locally
      },
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

  // TIMEOUT CONFIGURATION STRATEGY:
  // ===================================
  //
  // Environment-Adaptive Timeouts:
  // - CI environments get extended timeouts due to resource constraints
  // - Local development uses faster timeouts for developer productivity
  // - All timeouts can be overridden via environment variables
  //
  // Browser-Specific Optimizations:
  // - Firefox: Gets 33% longer timeouts (known to be slower in CI)
  // - Mobile Safari: Gets longest timeouts (most resource intensive)
  // - Mobile Chrome: Gets moderate mobile timeout boosts
  // - Desktop Chrome/Safari: Use standard timeouts
  //
  // Timeout Hierarchy (CI vs Local):
  // - Test Timeout: 90s vs 60s (overall test duration)
  // - Action Timeout: 30s vs 15s (clicks, inputs, etc.)
  // - Navigation Timeout: 60s vs 30s (page loads)
  // - Expect Timeout: 20s vs 15s (assertions)
  //
  // Override via Environment Variables:
  // - E2E_TEST_TIMEOUT: Overall test timeout
  // - E2E_ACTION_TIMEOUT: Action timeout  
  // - E2E_NAVIGATION_TIMEOUT: Navigation timeout
  // - E2E_EXPECT_TIMEOUT: Assertion timeout
  //
  // Special Cases:
  // - Firefox timeouts: +33% longer than base
  // - Mobile timeouts: +50% longer than desktop
  // - Safari mobile: +75% longer than base (most demanding)
  
  // Global setup/teardown for preview environment
  globalSetup: '../../e2e/global-setup-preview.js',
  globalTeardown: '../../e2e/global-teardown-preview.js',
});