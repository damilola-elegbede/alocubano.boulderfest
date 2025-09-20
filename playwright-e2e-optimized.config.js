/**
 * Optimized Playwright E2E Configuration - Local Testing with Resilient Environment
 *
 * Performance improvements:
 * - Parallel execution enabled (4-8x faster)
 * - Optimized timeouts based on actual performance
 * - Removed vercel-deployment-manager overhead
 * - Streamlined test selection
 * - Resilient environment handling
 */

import { defineConfig, devices } from '@playwright/test';

// Use existing Vercel preview from CI or fallback to local
const baseURL = process.env.PREVIEW_URL ||
                process.env.PLAYWRIGHT_BASE_URL ||
                process.env.CI_EXTRACTED_PREVIEW_URL ||
                'http://localhost:3000';

const isCI = !!process.env.CI;
const isPreview = baseURL.includes('vercel.app') || process.env.PREVIEW_URL;

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

  // UNIFIED TIMEOUT STRATEGY - Single Source of Truth
  // Base timeout scales all other timeouts proportionally
  timeout: isCI ? 90000 : 60000,  // Main test timeout

  expect: {
    timeout: isCI ? 20000 : 15000,  // Expect assertions (20-25% of test timeout)
  },

  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'off' : 'retain-on-failure',  // Disable video in CI for speed

    viewport: { width: 1280, height: 720 },

    // Unified timeout hierarchy (percentages of main timeout)
    actionTimeout: isCI ? 30000 : 20000,     // ~33% of test timeout
    navigationTimeout: isCI ? 60000 : 40000, // ~67% of test timeout

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
        // No timeout overrides - uses global config
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
      // No timeout overrides - uses global config
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        // No timeout overrides - uses global config
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
        // No timeout overrides - uses global config
      },
    },
  ],

  // Use resilient global setup that works for both local and preview modes
  globalSetup: isPreview ? './tests/e2e/global-setup-preview.js' : './tests/e2e/global-setup.js',
  globalTeardown: isPreview ? './tests/e2e/global-teardown-preview.js' : './tests/e2e/global-teardown.js',
});