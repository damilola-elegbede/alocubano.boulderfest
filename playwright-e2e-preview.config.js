/**
 * Playwright E2E Configuration - Vercel Preview Deployments
 * 
 * This configuration runs E2E tests against live Vercel preview deployments
 * instead of starting local servers. Provides better reliability and 
 * production-like testing environment.
 * 
 * Key Features:
 * - Uses live Vercel preview URLs extracted from GitHub PR comments
 * - No local server startup required
 * - Production-like environment testing
 * - Automatic deployment readiness validation
 * - Support for multiple URL sources (PR comments, API, CLI)
 * - Enhanced timeout handling for remote deployments
 * 
 * Environment Variables:
 * - PREVIEW_URL: Direct preview URL override
 * - GITHUB_TOKEN: Required for GitHub API access
 * - VERCEL_TOKEN: Optional for Vercel API access
 * - GITHUB_PR_NUMBER: PR number for comment extraction
 * - GITHUB_SHA: Commit SHA for deployment matching
 */

import { defineConfig, devices } from '@playwright/test';

// Determine base URL - priority order:
// 1. Direct PREVIEW_URL environment variable
// 2. Extracted from CI environment (set by setup script)
// 3. localhost fallback (for local development only)
const getBaseURL = () => {
  // Direct preview URL
  if (process.env.PREVIEW_URL) {
    console.log(`🎯 Using direct preview URL: ${process.env.PREVIEW_URL}`);
    return process.env.PREVIEW_URL;
  }

  // CI-extracted URL
  if (process.env.CI_EXTRACTED_PREVIEW_URL) {
    console.log(`🤖 Using CI-extracted preview URL: ${process.env.CI_EXTRACTED_PREVIEW_URL}`);
    return process.env.CI_EXTRACTED_PREVIEW_URL;
  }

  // Fallback for local development
  const fallbackUrl = 'http://localhost:3000';
  console.log(`🔧 Using localhost fallback: ${fallbackUrl}`);
  console.log('   Note: For preview testing, set PREVIEW_URL environment variable');
  return fallbackUrl;
};

const baseURL = getBaseURL();
const isPreviewMode = baseURL.includes('vercel.app') || baseURL.includes('now.sh');

console.log('🎭 Playwright E2E Preview Config:');
console.log(`   Mode: ${isPreviewMode ? 'Preview Deployment' : 'Local Development'}`);
console.log(`   Base URL: ${baseURL}`);
console.log(`   Health Check: ${baseURL}/api/health/check`);
console.log(`   Environment: Production-like preview`);
console.log(`   Deployment Validation: ${isPreviewMode ? 'Enabled' : 'Disabled'}`);

export default defineConfig({
  testDir: './tests/e2e/flows',
  fullyParallel: true, // Can run in parallel since no local server conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 3 : 1, // More retries for remote deployments
  workers: process.env.CI ? 2 : 1, // Conservative parallelism for remote testing
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-preview', open: 'never' }]
  ],
  
  // Extended timeouts for remote deployments
  timeout: isPreviewMode ? 90000 : 45000, // 90s for preview, 45s for local
  
  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Viewport and device emulation
    viewport: { width: 1280, height: 720 },
    
    // Extended timeouts for remote deployments
    actionTimeout: isPreviewMode ? 30000 : 20000, // 30s for preview actions
    navigationTimeout: isPreviewMode ? 60000 : 40000, // 60s for preview navigation
    
    // Additional context for remote testing
    extraHTTPHeaders: {
      'User-Agent': 'Playwright-E2E-Preview-Testing'
    }
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

  // No webServer needed - testing against live deployment
  webServer: undefined,
  
  // Global setup/teardown for preview testing
  globalSetup: './tests/e2e/global-setup-preview.js',
  globalTeardown: './tests/e2e/global-teardown-preview.js',
});