/**
 * Playwright E2E Configuration - Advanced CI Environment
 * Optimized for GitHub Actions CI with comprehensive test coverage
 * Supports all 26 E2E tests including advanced scenarios:
 * - Accessibility compliance (WCAG 2.1)
 * - Performance load testing
 * - Wallet pass generation (Apple & Google)
 * - Enhanced security testing
 * - Database integrity validation
 * - Network resilience testing
 * - Email transactional flows
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/flows',
  fullyParallel: false, // Run sequentially to avoid database conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to avoid race conditions with SQLite
  reporter: process.env.CI 
    ? [
        ['list'], 
        ['html', { outputFolder: 'playwright-report', open: 'never' }], 
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['json', { outputFile: 'test-results/test-results.json' }]
      ]
    : [['list'], ['html']],
  
  // Extended timeout for advanced scenarios (accessibility, performance, security)
  timeout: process.env.ADVANCED_SCENARIOS === 'true' ? 120000 : 60000,
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Extended timeouts for advanced scenarios
    actionTimeout: process.env.ADVANCED_SCENARIOS === 'true' ? 45000 : 30000,
    navigationTimeout: process.env.ADVANCED_SCENARIOS === 'true' ? 60000 : 45000,
    
    // CI-optimized settings
    ...(process.env.CI && {
      headless: true,
      viewport: { width: 1280, height: 720 },
    })
  },

  // Global setup and teardown for advanced scenarios
  globalSetup: process.env.ADVANCED_SCENARIOS === 'true' 
    ? './tests/e2e/global-setup-advanced.js' 
    : './tests/e2e/global-setup-ci.js',
  globalTeardown: process.env.ADVANCED_SCENARIOS === 'true' 
    ? './tests/e2e/global-teardown-advanced.js' 
    : './tests/e2e/global-teardown-ci.js',

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Enhanced for CI stability and advanced scenarios
        ...(process.env.CI && {
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
              ...(process.env.PERFORMANCE_TESTING === 'true' ? [
                '--enable-precise-memory-info',
                '--enable-memory-pressure-api',
                '--force-gpu-mem-available-mb=1024'
              ] : []),
              ...(process.env.ACCESSIBILITY_TESTING === 'true' ? [
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
        ...(process.env.CI && {
          launchOptions: {
            firefoxUserPrefs: {
              'network.http.max-connections': 200,
              'network.http.max-connections-per-server': 10,
              // Advanced scenario preferences
              ...(process.env.ACCESSIBILITY_TESTING === 'true' && {
                'accessibility.force_disabled': 0
              }),
              ...(process.env.PERFORMANCE_TESTING === 'true' && {
                'dom.enable_performance': true,
                'dom.enable_performance_observer': true
              })
            }
          }
        })
      },
    },

    // Only include webkit/mobile if specifically enabled or for advanced/nightly testing
    ...(process.env.ALL_BROWSERS !== 'false' || process.env.ADVANCED_SCENARIOS === 'true' ? [
      {
        name: 'webkit',
        use: { 
          ...devices['Desktop Safari'],
          // Safari-specific configuration for advanced scenarios
          ...(process.env.ADVANCED_SCENARIOS === 'true' && {
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
          ...(process.env.ADVANCED_SCENARIOS === 'true' && {
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
          ...(process.env.ADVANCED_SCENARIOS === 'true' && {
            contextOptions: {
              permissions: ['camera', 'microphone']
            }
          })
        },
      },
    ] : []),
  ],

  // Web server configuration for CI with advanced scenario support
  webServer: {
    command: 'npm run start:ci',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.ADVANCED_SCENARIOS === 'true' ? 240000 : 180000, // Extended for advanced setup
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      CI_PORT: '3000',
      SKIP_DATABASE_INIT: 'false', // Enable for advanced scenario setup
      CI_ENVIRONMENT: 'true',
      // Advanced scenario environment variables
      ADVANCED_SCENARIOS: process.env.ADVANCED_SCENARIOS || 'false',
      PERFORMANCE_TESTING: process.env.PERFORMANCE_TESTING || 'false',
      ACCESSIBILITY_TESTING: process.env.ACCESSIBILITY_TESTING || 'false',
      SECURITY_TESTING: process.env.SECURITY_TESTING || 'false',
      // Pass through test credentials for advanced scenarios
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || 'test-password-123',
      ADMIN_SECRET: process.env.ADMIN_SECRET || 'test-admin-secret-key-minimum-32-characters',
      // Advanced test service configuration
      BREVO_API_KEY: process.env.BREVO_API_KEY || '',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
      APPLE_PASS_KEY: process.env.APPLE_PASS_KEY || '',
      GOOGLE_WALLET_ISSUER_ID: process.env.GOOGLE_WALLET_ISSUER_ID || '',
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || '',
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || ''
    }
  },
  
  // Expect configuration for advanced scenarios
  expect: {
    // Extended timeout for accessibility and performance tests
    timeout: process.env.ADVANCED_SCENARIOS === 'true' ? 30000 : 15000,
  },
});