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

console.log(`🎭 Enhanced Playwright E2E Preview Config for Vercel Deployments:`);
console.log(`  Target URL: ${baseURL}`);
console.log(`  Environment: ${baseURL.includes('vercel.app') ? 'Vercel Preview Deployment' : 'Local Development'}`);
console.log(`  Approach: Modern (no local server management)`);
console.log(`  Database: Production/Preview environment database`);
console.log(`  Timeout Strategy: ${process.env.CI ? 'CI-extended (cold start optimized)' : 'Local-enhanced (preview optimized)'}`);
console.log(`  Test Timeout: ${process.env.CI ? '120s' : '90s'} (enhanced for serverless cold starts)`);
console.log(`  Action Timeout: ${process.env.CI ? '45s' : '30s'} (enhanced for API latency)`);
console.log(`  Navigation Timeout: ${process.env.CI ? '90s' : '60s'} (enhanced for cold starts + network)`);
console.log(`  Retry Strategy: ${process.env.CI ? '3 retries' : '2 retries'} (network-optimized)`);

export default defineConfig({
  testDir: './tests/e2e/flows',
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
  retries: process.env.CI ? 3 : 2, // Increased retries for network-dependent preview deployments
  workers: process.env.CI ? 1 : 1, // Conservative workers to avoid rate limiting on preview deployments
  reporter: process.env.CI ? [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/test-results.json' }],
    ['github'] // GitHub Actions annotations
  ] : [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'on-failure' }]
  ],
  
  // Environment-based timeout configurations - Enhanced for Vercel deployments
  timeout: process.env.CI 
    ? parseInt(process.env.E2E_TEST_TIMEOUT || '120000', 10)  // 120s in CI (increased for cold starts)
    : parseInt(process.env.E2E_TEST_TIMEOUT || '90000', 10),  // 90s locally (increased for preview deployments)
  
  // Global expect timeout - Enhanced for serverless functions
  expect: {
    timeout: process.env.CI
      ? parseInt(process.env.E2E_EXPECT_TIMEOUT || '30000', 10) // 30s in CI (increased for network latency)
      : parseInt(process.env.E2E_EXPECT_TIMEOUT || '25000', 10) // 25s locally (increased for cold starts)
  },
  
  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Viewport and device emulation
    viewport: { width: 1280, height: 720 },
    
    // Environment-adaptive timeout configurations - Enhanced for Vercel cold starts
    actionTimeout: process.env.CI
      ? parseInt(process.env.E2E_ACTION_TIMEOUT || '45000', 10)      // 45s in CI (increased for serverless latency)
      : parseInt(process.env.E2E_ACTION_TIMEOUT || '30000', 10),     // 30s locally (increased for cold starts)
    
    navigationTimeout: process.env.CI
      ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '90000', 10)  // 90s in CI (increased for cold starts + network)  
      : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '60000', 10), // 60s locally (increased for cold starts)
    
    // Additional headers and options for better preview deployment testing
    extraHTTPHeaders: {
      'User-Agent': 'Playwright-E2E-Tests-Preview',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    },
    
    // Enhanced network handling for Vercel serverless functions
    ignoreHTTPSErrors: true, // Ignore SSL issues with preview deployments
    
    // Improved wait strategies for serverless cold starts
    waitForLoadState: 'domcontentloaded', // Don't wait for all resources, just DOM
    
    // Connection settings optimized for preview deployments
    connectOptions: {
      timeout: 60000 // 60s connection timeout for slow Vercel regions
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
        // Firefox-specific timeout optimizations - Enhanced for Vercel deployments
        actionTimeout: process.env.CI
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '60000', 10)      // 60s in CI (Firefox + Vercel cold starts)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '40000', 10),     // 40s locally (Firefox + cold starts)
        
        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '120000', 10)  // 120s in CI (Firefox + Vercel needs most time)  
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '90000', 10),  // 90s locally (Firefox + cold starts)
        
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
        // Mobile Chrome timeout optimizations - Enhanced for Vercel deployments
        actionTimeout: process.env.CI
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '50000', 10)      // 50s in CI (mobile + Vercel cold starts)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '35000', 10),     // 35s locally (mobile + cold starts)
        
        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '100000', 10)  // 100s in CI (mobile + Vercel cold starts)
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '70000', 10),  // 70s locally (mobile + cold starts)
      },
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        // Mobile Safari timeout optimizations - Enhanced for Vercel deployments
        actionTimeout: process.env.CI
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '70000', 10)      // 70s in CI (Safari mobile + Vercel - needs most time)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '45000', 10),     // 45s locally (Safari mobile + cold starts)
        
        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '140000', 10)  // 140s in CI (Safari mobile + Vercel - maximum time)
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '90000', 10),  // 90s locally (Safari mobile + cold starts)
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

  // ENHANCED TIMEOUT CONFIGURATION STRATEGY FOR VERCEL DEPLOYMENTS:
  // =================================================================
  //
  // Environment-Adaptive Timeouts (Enhanced for Vercel Cold Starts):
  // - CI environments: Extended timeouts for cold starts + network latency
  // - Local development: Moderate timeouts for preview deployment testing
  // - All timeouts can be overridden via environment variables
  // - Accounts for 10-15s Vercel serverless function cold start time
  //
  // Browser-Specific Optimizations (Enhanced):
  // - Firefox: Gets 50% longer timeouts (known to be slower with serverless)
  // - Mobile Safari: Gets longest timeouts (most resource intensive + mobile network)
  // - Mobile Chrome: Gets moderate mobile timeout boosts + serverless overhead
  // - Desktop Chrome/Safari: Enhanced base timeouts for cold starts
  //
  // Enhanced Timeout Hierarchy (CI vs Local) - Vercel Preview Optimized:
  // - Test Timeout: 120s vs 90s (overall test duration + cold starts)
  // - Action Timeout: 45s vs 30s (clicks, inputs, API calls + serverless latency)
  // - Navigation Timeout: 90s vs 60s (page loads + cold starts + network)
  // - Expect Timeout: 30s vs 25s (assertions + API response times)
  //
  // Override via Environment Variables:
  // - E2E_TEST_TIMEOUT: Overall test timeout (default: 120s CI / 90s local)
  // - E2E_ACTION_TIMEOUT: Action timeout (default: 45s CI / 30s local)  
  // - E2E_NAVIGATION_TIMEOUT: Navigation timeout (default: 90s CI / 60s local)
  // - E2E_EXPECT_TIMEOUT: Assertion timeout (default: 30s CI / 25s local)
  //
  // Special Cases for Vercel Deployments:
  // - Firefox timeouts: +50% longer than base (Firefox + serverless overhead)
  // - Mobile timeouts: +67% longer than desktop (mobile + serverless + network)
  // - Safari mobile: +100% longer than base (most demanding + all overhead)
  // - First test run: Expect longer times due to cold start cascades
  // - Retry attempts: Subsequent runs may be faster due to warm functions
  
  // Global setup/teardown for preview environment
  globalSetup: './tests/e2e/global-setup-preview.js',
  globalTeardown: './tests/e2e/global-teardown-preview.js',
});