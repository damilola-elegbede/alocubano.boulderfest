/**
 * Playwright E2E Configuration - CI with Dynamic Port Allocation
 * 
 * Key Features:
 * - Dynamic port allocation to prevent conflicts in parallel execution
 * - Isolated database per test suite
 * - Optimized for CI environments with proper timeouts and retries
 * - Uses Playwright's webServer for reliable server management
 * - Eliminates dual server startup problem
 * 
 * Compatible with all 26 E2E tests including advanced scenarios:
 * - Accessibility compliance (WCAG 2.1)
 * - Performance load testing
 * - Wallet pass generation (Apple & Google)
 * - Enhanced security testing
 * - Database integrity validation
 * - Network resilience testing
 * - Email transactional flows
 */

import { defineConfig, devices } from '@playwright/test';

// Dynamic port configuration for CI parallel execution
// Support multiple environment variables for maximum flexibility
const PORT = process.env.DYNAMIC_PORT || process.env.PORT || '3000';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

// CI-specific configuration
const CI_MODE = !!process.env.CI;
const E2E_TEST_MODE = process.env.E2E_TEST_MODE === 'true';
const ADVANCED_SCENARIOS = process.env.ADVANCED_SCENARIOS === 'true';

// Test suite configurations
const PERFORMANCE_TESTING = process.env.PERFORMANCE_TESTING === 'true';
const ACCESSIBILITY_TESTING = process.env.ACCESSIBILITY_TESTING === 'true';
const SECURITY_TESTING = process.env.SECURITY_TESTING === 'true';

console.log(`🎭 Playwright E2E CI Config with Dynamic Port Allocation:`);
console.log(`  Dynamic Port: ${PORT} (from DYNAMIC_PORT=${process.env.DYNAMIC_PORT} or PORT=${process.env.PORT})`);
console.log(`  Base URL: ${BASE_URL}`);
console.log(`  Health Check URL: ${BASE_URL}/api/health/check`);
console.log(`  CI Mode: ${CI_MODE}`);
console.log(`  Database: Turso (${process.env.TURSO_DATABASE_URL ? 'configured' : 'not configured'})`);
console.log(`  Advanced Scenarios: ${ADVANCED_SCENARIOS}`);
console.log(`  Reuse Existing Server: false (ensures test isolation)`);

export default defineConfig({
  testDir: './tests/e2e/flows',
  
  // Parallel execution disabled for CI stability with isolated resources
  fullyParallel: false,
  forbidOnly: CI_MODE,
  retries: CI_MODE ? 2 : 1,
  workers: 1, // Single worker per suite to avoid race conditions with isolated databases
  
  // CI-optimized reporting
  reporter: CI_MODE 
    ? [
        ['list'], 
        ['html', { outputFolder: 'playwright-report', open: 'never' }], 
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['json', { outputFile: 'test-results/test-results.json' }]
      ]
    : [['list'], ['html']],
  
  // Global setup for database migrations and configuration
  globalSetup: './tests/e2e/global-setup-ci.js',
  globalTeardown: './tests/e2e/global-teardown.js',
  
  // Extended timeout for advanced scenarios and CI environment
  timeout: ADVANCED_SCENARIOS ? 120000 : (CI_MODE ? 90000 : 60000),
  
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Extended timeouts for advanced scenarios and CI stability
    actionTimeout: ADVANCED_SCENARIOS ? 45000 : (CI_MODE ? 35000 : 30000),
    navigationTimeout: ADVANCED_SCENARIOS ? 60000 : (CI_MODE ? 50000 : 45000),
    
    // CI-optimized settings for reliability and performance
    ...(CI_MODE && {
      headless: true,
      viewport: { width: 1280, height: 720 },
    })
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Enhanced for CI stability and advanced scenarios
        ...(CI_MODE && {
          launchOptions: {
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-web-security',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding',
              '--disable-ipc-flooding-protection',
              // Additional flags for advanced scenarios
              ...(PERFORMANCE_TESTING ? [
                '--enable-precise-memory-info',
                '--enable-memory-pressure-api',
                '--force-gpu-mem-available-mb=1024'
              ] : []),
              ...(ACCESSIBILITY_TESTING ? [
                '--force-renderer-accessibility'
              ] : [])
            ]
          }
        })
      },
    },
    
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Enhanced for CI stability and advanced scenarios
        ...(CI_MODE && {
          launchOptions: {
            firefoxUserPrefs: {
              'network.http.max-connections': 200,
              'network.http.max-connections-per-server': 10,
              // Advanced scenario preferences
              ...(ACCESSIBILITY_TESTING && {
                'accessibility.force_disabled': 0
              }),
              ...(PERFORMANCE_TESTING && {
                'dom.enable_performance': true,
                'dom.enable_performance_observer': true
              })
            }
          }
        })
      },
    },

    // Only include webkit/mobile if specifically enabled or for advanced/nightly testing
    ...(process.env.ALL_BROWSERS !== 'false' || ADVANCED_SCENARIOS ? [
      {
        name: 'webkit',
        use: { 
          ...devices['Desktop Safari'],
          // Safari-specific configuration for advanced scenarios
          ...(ADVANCED_SCENARIOS && {
            contextOptions: {
              permissions: ['clipboard-read', 'clipboard-write']
            }
          })
        },
      },
      {
        name: 'mobile-chrome',
        use: { 
          ...devices['Pixel 5'],
          // Mobile-specific configuration for advanced scenarios
          ...(ADVANCED_SCENARIOS && {
            contextOptions: {
              permissions: ['geolocation', 'notifications']
            }
          })
        },
      },
      {
        name: 'mobile-safari',
        use: { 
          ...devices['iPhone 12'],
          // iOS Safari specific configuration
          ...(ADVANCED_SCENARIOS && {
            contextOptions: {
              permissions: ['camera', 'microphone']
            }
          })
        },
      },
    ] : []),
  ],

  // **CRITICAL FIX**: Use Playwright's webServer with dynamic port allocation
  // This eliminates the dual server startup problem and port conflicts
  webServer: {
    command: `vercel dev --yes --listen ${PORT}${process.env.VERCEL_TOKEN ? ' --token=' + process.env.VERCEL_TOKEN : ''}`,
    url: `${BASE_URL}/api/health/check`,
    reuseExistingServer: false, // Always start fresh in CI for test isolation
    timeout: ADVANCED_SCENARIOS ? 240000 : 180000, // Extended for advanced setup
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      PORT: PORT,
      DYNAMIC_PORT: PORT, // Ensure both PORT and DYNAMIC_PORT are set
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
      // Advanced scenario environment variables
      ADVANCED_SCENARIOS: ADVANCED_SCENARIOS ? 'true' : 'false',
      PERFORMANCE_TESTING: PERFORMANCE_TESTING ? 'true' : 'false',
      ACCESSIBILITY_TESTING: ACCESSIBILITY_TESTING ? 'true' : 'false',
      SECURITY_TESTING: SECURITY_TESTING ? 'true' : 'false',
      // Pass through test credentials for advanced scenarios
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || 'test-password',
      ADMIN_SECRET: process.env.ADMIN_SECRET || 'test-admin-secret-key-minimum-32-characters',
      // Advanced test service configuration
      BREVO_API_KEY: process.env.BREVO_API_KEY || '',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
      APPLE_PASS_KEY: process.env.APPLE_PASS_KEY || '',
      GOOGLE_WALLET_ISSUER_ID: process.env.GOOGLE_WALLET_ISSUER_ID || '',
      // Vercel configuration for CI
      VERCEL_TOKEN: process.env.VERCEL_TOKEN || '',
      VERCEL_ORG_ID: process.env.VERCEL_ORG_ID || '',
      VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID || '',
      // CI environment markers
      CI: 'true',
      E2E_TEST_MODE: 'true'
    }
  },
  
  // Expect configuration optimized for CI and advanced scenarios
  expect: {
    // Extended timeout for accessibility and performance tests
    timeout: ADVANCED_SCENARIOS ? 30000 : (CI_MODE ? 20000 : 15000),
  },
});