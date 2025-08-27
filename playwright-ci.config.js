import { defineConfig, devices } from "@playwright/test";

/**
 * CI-specific Playwright configuration
 * Optimized for CI/CD environments with enhanced performance, reliability, and reporting
 * Extends base configuration with CI-specific optimizations
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",

  // Test file patterns - same as base config
  testMatch: ['**/*.spec.js', '**/*.e2e.js', '**/*.test.js'],

  // CI-optimized parallel execution
  fullyParallel: true,

  // Strict mode for CI
  forbidOnly: true, // Always forbid test.only in CI

  // CI-specific retry strategy
  retries: 3, // More retries in CI due to potential instability

  // CI-optimized worker configuration
  workers: process.env.PLAYWRIGHT_WORKERS 
    ? parseInt(process.env.PLAYWRIGHT_WORKERS)
    : process.env.GITHUB_ACTIONS 
      ? 2  // Conservative for GitHub Actions
      : process.env.CI 
        ? 3  // Moderate for other CI systems
        : 4, // Default for local

  // Enhanced CI reporting
  reporter: [
    // Always include these for CI
    ["list", { printSteps: true }],
    
    // HTML report with detailed output
    ["html", { 
      outputFolder: "./playwright-report",
      open: "never", // Never auto-open in CI
      attachmentsBaseURL: process.env.CI_ARTIFACTS_URL // For CI artifact URLs
    }],
    
    // JUnit XML for CI integration
    ["junit", { 
      outputFile: "./test-results/e2e-results.xml",
      includeProjectInTestName: true,
      stripANSIControlSequences: true
    }],
    
    // JSON for programmatic processing
    ["json", { 
      outputFile: "./test-results/e2e-results.json"
    }],
    
    // GitHub Actions integration
    ...(process.env.GITHUB_ACTIONS ? [["github"]] : []),
    
    // TeamCity integration if detected
    ...(process.env.TEAMCITY_VERSION ? [["teamcity"]] : []),
    
    // Azure DevOps integration if detected
    ...(process.env.TF_BUILD ? [["azure-devops"]] : []),

    // Custom dot reporter for concise CI output
    ...(process.env.CI_CONCISE_OUTPUT ? [["dot"]] : [])
  ],

  // CI-specific timeouts (more generous for stability)
  timeout: 45 * 1000, // 45 seconds per test
  
  // Global setup timeout
  globalTimeout: 15 * 60 * 1000, // 15 minutes total

  // Expect timeout
  expect: {
    timeout: 10 * 1000, // 10 seconds for assertions
  },

  // CI-optimized shared settings
  use: {
    // Base URL with CI flexibility
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 
             process.env.TEST_BASE_URL || 
             process.env.CI_TEST_URL ||
             "http://localhost:3000",

    // Enhanced tracing for CI debugging
    trace: "retain-on-failure", // Keep traces on failure for debugging

    // Screenshot configuration for CI
    screenshot: {
      mode: "only-on-failure",
      fullPage: true
    },

    // Video recording optimized for CI
    video: {
      mode: "retain-on-failure",
      size: { width: 1280, height: 720 } // Optimized size for CI storage
    },

    // CI-appropriate timeouts
    actionTimeout: 15 * 1000, // 15 seconds for actions
    navigationTimeout: 30 * 1000, // 30 seconds for navigation

    // Consistent rendering for CI
    reducedMotion: 'reduce',
    forcedColors: 'none',
    
    // Disable downloads in CI by default
    acceptDownloads: false,

    // Consistent viewport for CI
    viewport: { width: 1280, height: 720 },

    // CI-specific headers for identification
    extraHTTPHeaders: {
      'X-Test-Environment': 'ci',
      'X-Test-Runner': 'playwright',
      'X-CI-Build': process.env.GITHUB_RUN_NUMBER || 
                   process.env.BUILD_NUMBER || 
                   process.env.CI_BUILD_ID || 
                   'unknown'
    },

    // Handle HTTPS certificates in CI
    ignoreHTTPSErrors: process.env.CI_IGNORE_HTTPS_ERRORS === 'true',

    // User agent for CI identification
    userAgent: `Playwright/E2E-CI (${process.platform}; ${process.env.CI_PROVIDER || 'generic-ci'})`,

    // Locale consistency
    locale: 'en-US',
    timezoneId: 'UTC',

    // Color scheme for consistency
    colorScheme: 'light',

    // Bypass CSP if needed in CI
    bypassCSP: process.env.CI_BYPASS_CSP === 'true'
  },

  // CI-optimized browser projects
  projects: [
    // Primary browsers for CI
    {
      name: "chromium",
      use: { 
        ...devices["Desktop Chrome"],
        channel: "chrome", // Use stable Chrome in CI
        headless: true, // Always headless in CI
        
        // CI-specific Chrome args
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            ...(process.env.CI_CHROME_ARGS ? process.env.CI_CHROME_ARGS.split(' ') : [])
          ]
        }
      },
    },

    {
      name: "firefox",
      use: { 
        ...devices["Desktop Firefox"],
        headless: true,
        
        // Firefox-specific CI configuration
        launchOptions: {
          firefoxUserPrefs: {
            'dom.webnotifications.enabled': false,
            'dom.push.enabled': false,
            'media.navigator.permission.disabled': true,
            'permissions.default.microphone': 2,
            'permissions.default.camera': 2,
            'permissions.default.desktop-notification': 2
          }
        }
      },
    },

    {
      name: "webkit",
      use: { 
        ...devices["Desktop Safari"],
        headless: true
      },
    },

    // Mobile testing in CI (optional)
    ...(process.env.CI_INCLUDE_MOBILE !== 'false' ? [
      {
        name: "mobile-chrome",
        use: {
          ...devices["Pixel 5"],
          headless: true,
          
          // Mobile Chrome CI args
          launchOptions: {
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage'
            ]
          }
        },
      },

      {
        name: "mobile-safari",
        use: {
          ...devices["iPhone 13"],
          headless: true,
        },
      },
    ] : []),

    // Edge browser for comprehensive CI testing
    ...(process.env.CI_INCLUDE_EDGE !== 'false' ? [
      {
        name: "edge",
        use: {
          ...devices["Desktop Edge"],
          channel: "msedge",
          headless: true,
          
          // Edge-specific CI args
          launchOptions: {
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage'
            ]
          }
        },
      },
    ] : []),
  ],

  // CI-specific global setup and teardown
  globalSetup: "./scripts/ci-setup.js",
  globalTeardown: "./scripts/ci-cleanup.js",

  // Output directory for CI artifacts
  outputDir: "./test-results/playwright",

  // CI-specific test filtering
  grep: process.env.CI_TEST_FILTER ? new RegExp(process.env.CI_TEST_FILTER) : undefined,
  grepInvert: process.env.CI_EXCLUDE_TESTS ? new RegExp(process.env.CI_EXCLUDE_TESTS) : undefined,

  // Metadata for CI reporting
  metadata: {
    environment: 'ci',
    platform: process.platform,
    nodeVersion: process.version,
    ciProvider: process.env.CI_PROVIDER || 
               (process.env.GITHUB_ACTIONS ? 'github-actions' : 
                process.env.CI ? 'generic-ci' : 'unknown'),
    buildId: process.env.GITHUB_RUN_NUMBER || 
             process.env.BUILD_NUMBER || 
             process.env.CI_BUILD_ID,
    commitSha: process.env.GITHUB_SHA || 
               process.env.CI_COMMIT_SHA,
    branch: process.env.GITHUB_REF_NAME || 
            process.env.CI_BRANCH,
    timestamp: new Date().toISOString()
  },

  // CI-specific test configuration
  testIgnore: [
    // Ignore tests that shouldn't run in CI
    '**/local-only/**',
    '**/manual/**',
    ...(process.env.CI_IGNORE_PATTERNS ? 
        process.env.CI_IGNORE_PATTERNS.split(',') : [])
  ],

  // Preserve output for CI artifact collection
  preserveOutput: 'failures-only',

  // Web server configuration for CI
  webServer: {
    command: 'node scripts/ci-server.js',
    port: 3000,
    timeout: 60 * 1000, // 1 minute timeout for CI
    reuseExistingServer: false, // Always start fresh in CI
    cwd: '.',
    env: {
      NODE_ENV: 'test',
      CI: 'true',
      E2E_TEST_MODE: 'true',
      PORT: '3000',
      CI_PORT: '3000',
      // Inherit other environment variables
      ...process.env
    },
    
    // Enhanced stdout/stderr handling for CI
    stdout: 'pipe',
    stderr: 'pipe',
    
    // Wait for specific ready signal
    ignoreHTTPSErrors: true,
    
    // Custom ready check for CI
    waitForText: 'Context-Aware CI Server running',
  },

  // CI-specific reporter options
  reportSlowTests: {
    max: 10, // Report top 10 slowest tests
    threshold: 15000 // Report tests slower than 15 seconds
  },

  // Maximum failures before stopping (fail-fast in CI)
  maxFailures: process.env.CI_MAX_FAILURES ? 
               parseInt(process.env.CI_MAX_FAILURES) : 
               undefined, // No limit by default, let CI decide

  // Shard configuration for distributed CI
  shard: process.env.CI_SHARD ? {
    current: parseInt(process.env.CI_SHARD_INDEX) + 1,
    total: parseInt(process.env.CI_SHARD_TOTAL)
  } : undefined,
  
  // Update snapshots in CI only when explicitly requested
  updateSnapshots: process.env.CI_UPDATE_SNAPSHOTS === 'true' ? 'all' : 'none'
});