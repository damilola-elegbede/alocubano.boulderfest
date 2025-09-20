/**
 * Optimized Playwright E2E Configuration - Vercel Preview Deployments
 *
 * Performance improvements:
 * - Parallel execution enabled (4-8x faster)
 * - Optimized timeouts based on actual performance
 * - Removed vercel-deployment-manager overhead
 * - Streamlined test selection
 */

import { defineConfig, devices } from '@playwright/test';

// Use existing Vercel preview from CI or fallback to local
const baseURL = process.env.PREVIEW_URL ||
                process.env.PLAYWRIGHT_BASE_URL ||
                process.env.CI_EXTRACTED_PREVIEW_URL ||
                'http://localhost:3000';

const isCI = !!process.env.CI;
const isPreview = baseURL.includes('vercel.app');

console.log(`🚀 Optimized E2E Configuration:`);
console.log(`   Target: ${baseURL}`);
console.log(`   Mode: ${isPreview ? 'Vercel Preview' : 'Local'}`);
console.log(`   Parallel: Enabled (${isCI ? '2 workers' : '4 workers'})`);

// Standard test ignore patterns
const testIgnorePatterns = [
  '**/node_modules/**',
  '**/helpers/**',
  '**/fixtures/**',
  '**/config/**',
  '**/*.helper.js',
  '**/*.config.js',
  '**/*.setup.js',
  '**/*.teardown.js',
  '**/*.bak*'
];

export default defineConfig({
  testDir: './tests/e2e/flows',
  testMatch: '**/*.test.js',
  testIgnore: testIgnorePatterns,

  // Enable parallel execution for massive speed improvements
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,  // Reduced from 3
  workers: isCI ? 2 : 4,   // Increased parallelism

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ...(isCI ? [
      ['junit', { outputFile: 'test-results/junit.xml' }],
      ['json', { outputFile: 'test-results/results.json' }]
    ] : [])
  ],

  // Optimized timeouts based on actual performance
  timeout: isCI ? 60000 : 45000,  // Reduced from 120s/90s

  expect: {
    timeout: isCI ? 15000 : 10000,  // Reduced from 30s/25s
  },

  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'off' : 'retain-on-failure',  // Disable video in CI for speed

    viewport: { width: 1280, height: 720 },

    // Tightened timeouts
    actionTimeout: isCI ? 20000 : 15000,     // Reduced from 45s/30s
    navigationTimeout: isCI ? 45000 : 25000, // Increased to 45s for CI (gallery needs more time)

    // Performance headers
    extraHTTPHeaders: {
      'User-Agent': 'Playwright-E2E-Optimized',
      'Accept-Encoding': 'gzip, deflate, br',
    }
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            ...(isCI ? ['--no-sandbox', '--disable-gpu'] : [])
          ]
        }
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Firefox-specific optimizations
        actionTimeout: isCI ? 25000 : 20000,     // Slightly longer for Firefox
        navigationTimeout: isCI ? 50000 : 30000, // Firefox needs more time for gallery
        launchOptions: {
          firefoxUserPrefs: {
            'network.http.max-connections': 200,
            'network.http.max-connections-per-server': 20,
            // Disable unnecessary features for speed
            'media.autoplay.enabled': false,
            'media.autoplay.default': 5,
          }
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
        actionTimeout: isCI ? 25000 : 20000,     // Mobile needs slightly more
        navigationTimeout: isCI ? 50000 : 30000, // Mobile needs more time for gallery
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
        actionTimeout: isCI ? 30000 : 25000,     // Safari mobile needs most
        navigationTimeout: isCI ? 60000 : 35000, // Safari mobile needs most time for gallery
      },
    },
  ],

  // No webServer needed - uses existing Vercel preview
  globalSetup: './tests/e2e/global-setup-preview.js',
  globalTeardown: './tests/e2e/global-teardown-preview.js',
});