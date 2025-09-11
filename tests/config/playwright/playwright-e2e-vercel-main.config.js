/**
 * DEPRECATED: Playwright E2E Configuration - Vercel Dev Server
 * 
 * This configuration is DEPRECATED as of the migration to Vercel Preview Deployments.
 * Local Vercel dev servers are no longer used for E2E testing.
 * 
 * REPLACEMENT: E2E tests now use Vercel Preview Deployments which provide:
 * - Real production environment testing
 * - No local server management complexity
 * - No port allocation or conflicts
 * - Better CI/CD integration
 * - Eliminated server hanging issues
 * 
 * LEGACY FEATURES:
 * - Dynamic port allocation (3000-3005) for parallel CI execution
 * - Database isolation per test suite using port-specific databases
 * - Local Vercel dev server startup management
 * - Always fresh server startup for test isolation
 * 
 * @deprecated Use Vercel Preview Deployments for E2E testing instead
 * @see New E2E testing approach in CI/CD workflows
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

// Standardized port configuration: DYNAMIC_PORT takes precedence, fallback to PORT, default to 3000
const testPort = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || '3000', 10);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${testPort}`;

console.log(`🎭 Playwright E2E Vercel Config:`);
console.log(`  Port: ${testPort} (DYNAMIC_PORT=${process.env.DYNAMIC_PORT}, PORT=${process.env.PORT})`);
console.log(`  Base URL: ${baseURL}`);
console.log(`  Health Check: ${baseURL}/api/health/check`);
console.log(`  Reuse Server: ${!process.env.CI} (CI isolation: ${!!process.env.CI})`);
console.log(`  Database: Port-isolated for test safety`);

export default defineConfig({
  testDir: '../../e2e/flows',
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

  // DEPRECATED: webServer configuration removed
  // E2E tests now use Vercel Preview Deployments instead of local servers
  // 
  // LEGACY webServer config (now commented out):
  // - Local Vercel dev server startup via scripts/vercel-dev-e2e.js
  // - Dynamic port allocation and health checks
  // - Complex environment variable configuration
  // - Server process management and cleanup
  //
  // REPLACEMENT: Tests run against Vercel Preview Deployment URLs
  // configured via PLAYWRIGHT_BASE_URL environment variable
  
  // webServer: {
  //   command: `node scripts/vercel-dev-e2e.js --port ${testPort}`,
  //   url: `${baseURL}/api/health/check`,
  //   reuseExistingServer: false,
  //   timeout: 60000,
  //   env: { /* complex local server environment */ }
  // },
  
  // Global setup/teardown standardized across all configs
  globalSetup: '../../e2e/global-setup-ci.js',
  globalTeardown: '../../e2e/global-teardown.js',
});