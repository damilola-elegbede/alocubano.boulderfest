/**
 * Playwright E2E Configuration - CI with Dynamic Port Allocation
 * 
 * Key Features:
 * - Dynamic port allocation to prevent conflicts in parallel execution
 * - Isolated database per test suite
 * - Optimized for CI environments with proper timeouts and retries
 * - Uses Playwright's webServer for reliable server management
 * - Eliminates dual server startup problem
 * - **FIXED**: Vercel authentication with --token, --scope, and --no-clipboard flags
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
import { E2E_CONFIG, validateE2EEnvironment, logE2EEnvironment, getWebServerEnv } from './config/e2e-env-config.js';

// Validate environment variables for CI with all possible test scenarios
validateE2EEnvironment({
  adminTests: true,
  ciMode: true,
  emailTests: E2E_CONFIG.ADVANCED_SCENARIOS,
  paymentTests: E2E_CONFIG.ADVANCED_SCENARIOS,
  walletTests: E2E_CONFIG.ADVANCED_SCENARIOS,
  throwOnMissing: true,
});

// Log comprehensive environment configuration for CI debugging
logE2EEnvironment(true);

// Configurable timeouts via environment variables for CI/CD flexibility
const STARTUP_TIMEOUT = Number(process.env.E2E_STARTUP_TIMEOUT || 60000);
const TEST_TIMEOUT = Number(process.env.E2E_TEST_TIMEOUT || (E2E_CONFIG.ADVANCED_SCENARIOS ? 120000 : (E2E_CONFIG.CI ? 90000 : 60000)));
const ACTION_TIMEOUT = Number(process.env.E2E_ACTION_TIMEOUT || (E2E_CONFIG.ADVANCED_SCENARIOS ? 45000 : (E2E_CONFIG.CI ? 35000 : 30000)));
const NAVIGATION_TIMEOUT = Number(process.env.E2E_NAVIGATION_TIMEOUT || (E2E_CONFIG.ADVANCED_SCENARIOS ? 60000 : (E2E_CONFIG.CI ? 50000 : 45000)));
const WEBSERVER_TIMEOUT = Number(process.env.E2E_WEBSERVER_TIMEOUT || (E2E_CONFIG.ADVANCED_SCENARIOS ? 240000 : 180000));
const EXPECT_TIMEOUT = Number(process.env.E2E_EXPECT_TIMEOUT || (E2E_CONFIG.ADVANCED_SCENARIOS ? 30000 : (E2E_CONFIG.CI ? 20000 : 15000)));

// Test suite configurations - use centralized config
const PERFORMANCE_TESTING = E2E_CONFIG.PERFORMANCE_TESTING;
const ACCESSIBILITY_TESTING = E2E_CONFIG.ACCESSIBILITY_TESTING;
const SECURITY_TESTING = E2E_CONFIG.SECURITY_TESTING;

/**
 * Build Vercel dev command with authentication using centralized config
 */
function buildVercelCommand(port) {
  const args = [
    'vercel',
    'dev',
    '--yes', // Skip all prompts
    '--listen', port.toString(),
    // Removed --no-clipboard as it's not supported in this Vercel CLI version
  ];
  
  // Require authentication - fail immediately if missing
  if (!process.env.VERCEL_TOKEN) {
    throw new Error('❌ FATAL: VERCEL_TOKEN not found in environment');
  }
  if (!process.env.VERCEL_ORG_ID) {
    throw new Error('❌ FATAL: VERCEL_ORG_ID not found in environment');
  }
  
  args.push('--token', process.env.VERCEL_TOKEN);
  console.log('   ✅ Using VERCEL_TOKEN for authentication');
  
  args.push('--scope', process.env.VERCEL_ORG_ID);
  console.log('   ✅ Using VERCEL_ORG_ID as scope');
  
  return args.join(' ');
}

const VERCEL_COMMAND = buildVercelCommand(PORT);

console.log(`🎭 Playwright E2E CI Config with Dynamic Port Allocation:`);
console.log(`  Dynamic Port: ${PORT} (DYNAMIC_PORT=${process.env.DYNAMIC_PORT}, PORT=${process.env.PORT})`);
console.log(`  Base URL: ${BASE_URL}`);
console.log(`  Health Check URL: ${BASE_URL}/api/health/check`);
console.log(`  CI Mode: ${E2E_CONFIG.CI}`);
console.log(`  Database: Turso (${process.env.TURSO_DATABASE_URL ? 'configured' : 'not configured'})`);
console.log(`  Advanced Scenarios: ${ADVANCED_SCENARIOS}`);
console.log(`  Reuse Existing Server: false (ensures test isolation)`);
console.log(`  Vercel Command: ${VERCEL_COMMAND}`);
console.log(`  Vercel Auth: ✅ configured (VERCEL_TOKEN + VERCEL_ORG_ID)`);

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
  timeout: E2E_CONFIG.ADVANCED_SCENARIOS ? 120000 : (E2E_CONFIG.CI ? 90000 : 60000),
  
  use: {
    baseURL: E2E_CONFIG.PLAYWRIGHT_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Extended timeouts for advanced scenarios and CI stability
    actionTimeout: ACTION_TIMEOUT,
    navigationTimeout: NAVIGATION_TIMEOUT,
    
    // CI-optimized settings for reliability and performance
    ...(E2E_CONFIG.CI && {
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

  // **CRITICAL FIX**: Use Playwright's webServer with dynamic port allocation and authentication
  // This eliminates the dual server startup problem and port conflicts
  webServer: {
    command: VERCEL_COMMAND,
    url: `${E2E_CONFIG.PLAYWRIGHT_BASE_URL}/api/health/check`,
    reuseExistingServer: false, // Always start fresh in CI for test isolation
    timeout: WEBSERVER_TIMEOUT, // Extended for advanced setup
    stdout: 'pipe',
    stderr: 'pipe',
    // Environment variables managed by centralized E2E configuration
    env: getWebServerEnv({
      port: E2E_CONFIG.DYNAMIC_PORT,
      includeServices: true,  // Include all service credentials for CI
      includeVercel: true,    // Include Vercel credentials for CI authentication
    })
  },
  
  // Expect configuration optimized for CI and advanced scenarios
  expect: {
    // Extended timeout for accessibility and performance tests
    timeout: EXPECT_TIMEOUT,
  },
});