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
  retries: process.env.CI ? 3 : 2, // Increased retries for preview deployment stability
  workers: process.env.CI ? 1 : 1, // Single worker to prevent preview deployment overload
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],

  // INFRASTRUCTURE FIX: Increased timeouts for Vercel Preview Deployments
  timeout: process.env.CI
    ? parseInt(process.env.E2E_TEST_TIMEOUT || '120000', 10)  // 120s in CI (was 90s)
    : parseInt(process.env.E2E_TEST_TIMEOUT || '90000', 10),  // 90s locally (was 60s)

  // Global expect timeout - increased for preview deployment latency
  expect: {
    timeout: process.env.CI
      ? parseInt(process.env.E2E_EXPECT_TIMEOUT || '30000', 10) // 30s in CI (was 20s)
      : parseInt(process.env.E2E_EXPECT_TIMEOUT || '25000', 10) // 25s locally (was 15s)
  },

  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Viewport and device emulation
    viewport: { width: 1280, height: 720 },

    // INFRASTRUCTURE FIX: Extended timeouts for Vercel Preview Deployment latency
    actionTimeout: process.env.CI
      ? parseInt(process.env.E2E_ACTION_TIMEOUT || '45000', 10)      // 45s in CI (was 30s)
      : parseInt(process.env.E2E_ACTION_TIMEOUT || '30000', 10),     // 30s locally (was 15s)

    navigationTimeout: process.env.CI
      ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '90000', 10)  // 90s in CI (was 60s)
      : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '60000', 10), // 60s locally (was 30s)

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
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '60000', 10)      // 60s in CI (Firefox needs more)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '40000', 10),     // 40s locally

        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '120000', 10)  // 120s in CI (Firefox needs more)
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '75000', 10),  // 75s locally

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
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '50000', 10)      // 50s in CI (mobile needs more)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '35000', 10),     // 35s locally

        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '100000', 10)  // 100s in CI (mobile needs more)
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '70000', 10),  // 70s locally
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
        // Mobile Safari timeout optimizations
        actionTimeout: process.env.CI
          ? parseInt(process.env.E2E_ACTION_TIMEOUT || '70000', 10)      // 70s in CI (Safari mobile needs most)
          : parseInt(process.env.E2E_ACTION_TIMEOUT || '45000', 10),     // 45s locally

        navigationTimeout: process.env.CI
          ? parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '140000', 10)  // 140s in CI (Safari mobile needs most)
          : parseInt(process.env.E2E_NAVIGATION_TIMEOUT || '90000', 10),  // 90s locally
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
  // INFRASTRUCTURE FIXES APPLIED:
  // - Increased all base timeouts by 50-100% for Vercel Preview Deployment latency
  // - Single worker configuration to prevent deployment overload
  // - Increased retries for deployment stability
  // - Browser-specific timeout multipliers for known performance differences
  //
  // Environment-Adaptive Timeouts:
  // - CI environments get extended timeouts due to resource constraints + deployment latency
  // - Local development uses moderate timeouts for developer productivity
  // - All timeouts can be overridden via environment variables
  //
  // Browser-Specific Optimizations:
  // - Firefox: Gets 33% longer timeouts (known to be slower in CI + deployment)
  // - Mobile Safari: Gets longest timeouts (most resource intensive + mobile network simulation)
  // - Mobile Chrome: Gets moderate mobile timeout boosts + deployment latency
  // - Desktop Chrome/Safari: Use standard timeouts with deployment latency buffer
  //
  // Timeout Hierarchy (CI vs Local) with INFRASTRUCTURE FIXES:
  // - Test Timeout: 120s vs 90s (overall test duration) - INCREASED
  // - Action Timeout: 45s vs 30s (clicks, inputs, etc.) - INCREASED
  // - Navigation Timeout: 90s vs 60s (page loads) - INCREASED
  // - Expect Timeout: 30s vs 25s (assertions) - INCREASED
  //
  // Override via Environment Variables:
  // - E2E_TEST_TIMEOUT: Overall test timeout
  // - E2E_ACTION_TIMEOUT: Action timeout
  // - E2E_NAVIGATION_TIMEOUT: Navigation timeout
  // - E2E_EXPECT_TIMEOUT: Assertion timeout
  //
  // Special Cases with INFRASTRUCTURE OPTIMIZATIONS:
  // - Firefox timeouts: +33% longer than base (deployment + browser overhead)
  // - Mobile timeouts: +50-75% longer than desktop (deployment + mobile simulation)
  // - Safari mobile: +100% longer than base (most demanding + deployment latency)

  // Global setup/teardown for preview environment
  globalSetup: './tests/e2e/global-setup-preview.js',
  globalTeardown: './tests/e2e/global-teardown-preview.js',
});