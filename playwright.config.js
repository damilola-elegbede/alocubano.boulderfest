/**
 * Unified Playwright Configuration - Environment Aware
 * 
 * This configuration consolidates multiple previously conflicting configurations
 * into a single, environment-aware setup. It automatically adapts based on:
 * - Environment variables (CI vs local development)
 * - Test mode (preview deployments vs local servers)
 * - Advanced scenarios (accessibility, performance, security)
 * 
 * MIGRATION NOTE: This replaces the previous 5 separate configuration files:
 * - playwright-e2e-vercel-main.config.js (main CI config)
 * - playwright-e2e-preview.config.js (preview deployments)
 * - playwright-e2e-ci.config.js (CI with dynamic ports)
 * - playwright-e2e-vercel.config.js (basic Vercel dev)
 * - The deprecated legacy config files
 * 
 * Environment Variables:
 * - PREVIEW_URL: Use Vercel preview deployment (takes precedence)
 * - CI_EXTRACTED_PREVIEW_URL: CI-extracted preview URL
 * - PLAYWRIGHT_BASE_URL: Direct base URL override
 * - DYNAMIC_PORT: Dynamic port for CI parallel execution (default: 3000)
 * - CI: Enable CI optimizations
 * - ADVANCED_SCENARIOS: Enable advanced test scenarios
 * - ALL_BROWSERS: Enable all browser testing (default: true)
 * 
 * Test Environment Detection:
 * 1. Preview Mode: Uses Vercel preview deployments (no local server)
 * 2. CI Mode: Uses local Vercel dev server with dynamic ports
 * 3. Local Mode: Uses localhost:3000 for development
 */

import { defineConfig, devices } from '@playwright/test';

// Environment configuration detection
const getEnvironmentConfig = () => {
  // 1. Preview deployment mode (highest priority)
  if (process.env.PREVIEW_URL) {
    return {
      mode: 'preview',
      baseURL: process.env.PREVIEW_URL,
      useWebServer: false,
      description: 'Vercel Preview Deployment'
    };
  }

  if (process.env.CI_EXTRACTED_PREVIEW_URL) {
    return {
      mode: 'preview',
      baseURL: process.env.CI_EXTRACTED_PREVIEW_URL,
      useWebServer: false,
      description: 'CI-Extracted Preview Deployment'
    };
  }

  // 2. CI mode with dynamic ports
  if (process.env.CI && process.env.DYNAMIC_PORT) {
    const port = parseInt(process.env.DYNAMIC_PORT, 10);
    return {
      mode: 'ci',
      baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`,
      port: port,
      useWebServer: true,
      description: 'CI with Dynamic Port Allocation'
    };
  }

  // 3. Direct base URL override
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return {
      mode: 'custom',
      baseURL: process.env.PLAYWRIGHT_BASE_URL,
      useWebServer: false,
      description: 'Custom Base URL'
    };
  }

  // 4. Default local development
  const defaultPort = parseInt(process.env.PORT || process.env.DYNAMIC_PORT || '3000', 10);
  return {
    mode: 'local',
    baseURL: `http://localhost:${defaultPort}`,
    port: defaultPort,
    useWebServer: true,
    description: 'Local Development'
  };
};

// Feature flags and advanced scenarios
const isCI = !!process.env.CI;
const advancedScenarios = process.env.ADVANCED_SCENARIOS === 'true';
const performanceTesting = process.env.PERFORMANCE_TESTING === 'true';
const accessibilityTesting = process.env.ACCESSIBILITY_TESTING === 'true';
const securityTesting = process.env.SECURITY_TESTING === 'true';
const allBrowsers = process.env.ALL_BROWSERS !== 'false';

// Environment configuration
const envConfig = getEnvironmentConfig();
const isPreviewMode = envConfig.mode === 'preview';
const isCIMode = envConfig.mode === 'ci';
const useWebServer = envConfig.useWebServer && !isPreviewMode;

// Database configuration validation (basic check - full validation in global setup)
const hasTurso = process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN;
if (!hasTurso && (isCIMode || isPreviewMode)) {
  console.warn('\n⚠️  Turso database credentials not found for CI/Preview testing');
  console.warn('   Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for production-like testing');
  console.warn('   Will use SQLite fallback for local testing\n');
} else if (hasTurso) {
  console.log('\n✅ Using Turso database for production-like E2E testing\n');
}

// Secret validation preview
console.log('🔐 Secret validation will run during global setup');
const hasBasicAdminSecrets = process.env.TEST_ADMIN_PASSWORD && process.env.ADMIN_SECRET;
console.log(`   Admin secrets: ${hasBasicAdminSecrets ? '✅' : '❌'} ${hasBasicAdminSecrets ? 'Available' : 'Missing (required for admin tests)'}`);
const hasEmailSecrets = process.env.BREVO_API_KEY;
console.log(`   Email secrets: ${hasEmailSecrets ? '✅' : '⚠️'} ${hasEmailSecrets ? 'Available' : 'Missing (optional - will use mocks)'}`);
const hasPaymentSecrets = process.env.STRIPE_SECRET_KEY;
console.log(`   Payment secrets: ${hasPaymentSecrets ? '✅' : '⚠️'} ${hasPaymentSecrets ? 'Available' : 'Missing (optional - will use mocks)'}`);
console.log('');

// Timeout configuration based on environment and scenarios
const getTimeouts = () => {
  const baseTimeouts = {
    preview: { test: 90000, action: 30000, navigation: 60000, webServer: 0 },
    ci: { test: 90000, action: 35000, navigation: 50000, webServer: 180000 },
    local: { test: 60000, action: 20000, navigation: 40000, webServer: 60000 }
  };

  const mode = isPreviewMode ? 'preview' : (isCIMode ? 'ci' : 'local');
  let timeouts = baseTimeouts[mode];

  // Advanced scenarios need more time
  if (advancedScenarios || performanceTesting) {
    timeouts = {
      test: Math.max(timeouts.test, 120000),
      action: Math.max(timeouts.action, 45000),
      navigation: Math.max(timeouts.navigation, 60000),
      webServer: Math.max(timeouts.webServer, 240000)
    };
  }

  // Allow environment variable overrides
  return {
    test: Number(process.env.E2E_TEST_TIMEOUT || timeouts.test),
    action: Number(process.env.E2E_ACTION_TIMEOUT || timeouts.action),
    navigation: Number(process.env.E2E_NAVIGATION_TIMEOUT || timeouts.navigation),
    webServer: Number(process.env.E2E_WEBSERVER_TIMEOUT || timeouts.webServer),
    expect: Number(process.env.E2E_EXPECT_TIMEOUT || (advancedScenarios ? 30000 : (isCI ? 20000 : 15000)))
  };
};

const timeouts = getTimeouts();

// Browser project configuration
const getBrowserProjects = () => {
  const baseProjects = [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // CI optimizations for Chromium
        ...(isCI && {
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
              // Performance testing flags
              ...(performanceTesting ? [
                '--enable-precise-memory-info',
                '--enable-memory-pressure-api',
                '--force-gpu-mem-available-mb=1024'
              ] : []),
              // Accessibility testing flags
              ...(accessibilityTesting ? [
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
        // CI optimizations for Firefox
        ...(isCI && {
          launchOptions: {
            firefoxUserPrefs: {
              'network.http.max-connections': 200,
              'network.http.max-connections-per-server': 10,
              // Accessibility preferences
              ...(accessibilityTesting && {
                'accessibility.force_disabled': 0
              }),
              // Performance preferences
              ...(performanceTesting && {
                'dom.enable_performance': true,
                'dom.enable_performance_observer': true
              })
            }
          }
        })
      },
    },
  ];

  // Add additional browsers for comprehensive testing
  if (allBrowsers || advancedScenarios) {
    baseProjects.push(
      {
        name: 'webkit',
        use: { 
          ...devices['Desktop Safari'],
          ...(advancedScenarios && {
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
          ...(advancedScenarios && {
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
          ...(advancedScenarios && {
            contextOptions: {
              permissions: ['camera', 'microphone']
            }
          })
        },
      }
    );
  }

  return baseProjects;
};

// Web server configuration for local/CI modes
const getWebServerConfig = () => {
  if (!useWebServer) return undefined;

  const buildVercelCommand = () => {
    const args = ['vercel', 'dev', '--yes', '--listen', envConfig.port.toString()];
    
    // Require authentication - fail immediately if missing
    if (!process.env.VERCEL_TOKEN) {
      throw new Error('❌ FATAL: VERCEL_TOKEN secret not configured');
    }
    if (!process.env.VERCEL_ORG_ID) {
      throw new Error('❌ FATAL: VERCEL_ORG_ID secret not configured');
    }
    
    args.push('--token', process.env.VERCEL_TOKEN);
    args.push('--scope', process.env.VERCEL_ORG_ID);
    
    return args.join(' ');
  };

  return {
    command: isCIMode ? buildVercelCommand() : 'npm run dev',
    url: `${envConfig.baseURL}/api/health/check`,
    reuseExistingServer: !isCI, // Always fresh server in CI
    timeout: timeouts.webServer,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'development',
      PORT: envConfig.port.toString(),
      DYNAMIC_PORT: envConfig.port.toString(),
      E2E_TEST_MODE: 'true',
      // Authentication
      ADMIN_SECRET: process.env.ADMIN_SECRET,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD || 'test-password',
      // Database
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
      // Pass through all environment variables for advanced scenarios
      ...(advancedScenarios && {
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        BREVO_API_KEY: process.env.BREVO_API_KEY,
        WALLET_AUTH_SECRET: process.env.WALLET_AUTH_SECRET,
        APPLE_PASS_KEY: process.env.APPLE_PASS_KEY
      })
    }
  };
};

// Logging configuration summary
console.log('🎭 Unified Playwright Configuration:');
console.log(`   Mode: ${envConfig.description}`);
console.log(`   Base URL: ${envConfig.baseURL}`);
console.log(`   Web Server: ${useWebServer ? 'Enabled' : 'Disabled (using external deployment)'}`);
console.log(`   CI Mode: ${isCI}`);
console.log(`   Advanced Scenarios: ${advancedScenarios}`);
console.log(`   All Browsers: ${allBrowsers}`);
console.log(`   Database: ${hasTurso ? 'Turso (production-like)' : 'SQLite (development)'}`);
console.log(`   Test Timeout: ${timeouts.test}ms`);
console.log(`   Action Timeout: ${timeouts.action}ms`);
console.log(`   Navigation Timeout: ${timeouts.navigation}ms`);
if (useWebServer) {
  console.log(`   Server Port: ${envConfig.port}`);
  console.log(`   Server Timeout: ${timeouts.webServer}ms`);
}

export default defineConfig({
  testDir: './tests/e2e/flows',
  
  // Execution configuration
  fullyParallel: isPreviewMode, // Preview can run parallel, local/CI run sequentially for database safety
  forbidOnly: isCI,
  retries: isCI ? 3 : (isPreviewMode ? 1 : 1), // More retries for remote deployments
  workers: isCI ? (isCIMode ? 1 : 2) : 1, // Conservative parallelism
  
  // Reporting configuration
  reporter: isCI 
    ? [
        ['list'], 
        ['html', { outputFolder: `playwright-report-${envConfig.mode}`, open: 'never' }], 
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['json', { outputFile: 'test-results/test-results.json' }]
      ]
    : [
        ['list'], 
        ['html', { outputFolder: `playwright-report-${envConfig.mode}`, open: 'on-failure' }]
      ],
  
  // Global setup/teardown
  globalSetup: isPreviewMode ? './tests/e2e/global-setup-preview.js' : './tests/e2e/global-setup-ci.js',
  globalTeardown: isPreviewMode ? './tests/e2e/global-teardown-preview.js' : './tests/e2e/global-teardown.js',
  
  // Test timeout
  timeout: timeouts.test,
  
  // Use configuration
  use: {
    baseURL: envConfig.baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Viewport
    viewport: { width: 1280, height: 720 },
    
    // Timeouts
    actionTimeout: timeouts.action,
    navigationTimeout: timeouts.navigation,
    
    // Additional headers for remote testing
    ...(isPreviewMode && {
      extraHTTPHeaders: {
        'User-Agent': 'Playwright-E2E-Preview-Testing'
      }
    })
  },

  // Browser projects
  projects: getBrowserProjects(),

  // Web server configuration
  webServer: getWebServerConfig(),
  
  // Expect configuration
  expect: {
    timeout: timeouts.expect,
  },
});