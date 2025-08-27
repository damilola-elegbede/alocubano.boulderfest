import { defineConfig, devices } from "@playwright/test";

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",

  // Test file patterns
  testMatch: ['**/*.spec.js', '**/*.e2e.js', '**/*.test.js'],

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 1,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 2 : 4,

  // Reporter configuration
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { outputFolder: "./playwright-report", open: "never" }],
        ["junit", { outputFile: "./test-results/e2e-results.xml" }],
        ["json", { outputFile: "./test-results/e2e-results.json" }],
        ["github"],
        ["./tests/e2e/monitoring/test-reporter.js", { 
          enableEnvironmentValidation: true,
          generateDashboard: true 
        }],
      ]
    : [
        ["list"],
        ["html", { outputFolder: "./playwright-report", open: "on-failure" }],
        ["./tests/e2e/monitoring/test-reporter.js", { 
          enableEnvironmentValidation: true,
          generateDashboard: true 
        }],
      ],

  // Global test timeout
  timeout: 30 * 1000,

  // Expect timeout
  expect: {
    timeout: 5000,
  },

  // Shared settings for all projects
  use: {
    // Base URL for all tests
    baseURL: process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_BASE_URL || "http://localhost:3000",

    // Collect trace when retrying failed test
    trace: "on-first-retry",

    // Capture screenshot on failure
    screenshot: {
      mode: "only-on-failure",
      fullPage: true
    },

    // Record video on failure
    video: process.env.CI ? "retain-on-failure" : "off",

    // Global timeout for actions
    actionTimeout: 10 * 1000,

    // Navigation timeout
    navigationTimeout: 15 * 1000,

    // Disable animations for consistent testing
    reducedMotion: 'reduce',

    // Accept downloads
    acceptDownloads: true,

    // Browser viewport size
    viewport: { width: 1280, height: 720 },

    // Ignore HTTPS errors only when explicitly allowed (e.g., local self-signed certs)
    ignoreHTTPSErrors: process.env.ALLOW_INSECURE === 'true',

    // User agent suffix to identify Playwright tests
    userAgent: 'Playwright/E2E-Test',
  },

  // Configure projects for major browsers
  projects: [
    // Desktop browsers
    {
      name: "chromium",
      use: { 
        ...devices["Desktop Chrome"],
        channel: undefined, // Use Playwright's bundled Chromium
        headless: process.env.CI ? true : false,
      },
    },

    {
      name: "firefox",
      use: { 
        ...devices["Desktop Firefox"],
        headless: process.env.CI ? true : false,
      },
    },

    {
      name: "webkit",
      use: { 
        ...devices["Desktop Safari"],
        headless: process.env.CI ? true : false,
      },
    },

    // Mobile viewports
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        headless: process.env.CI ? true : false,
      },
    },
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 13"],
        headless: process.env.CI ? true : false,
      },
    },

    // Tablet viewports
    {
      name: "tablet-ipad",
      use: {
        ...devices["iPad Mini"],
        headless: process.env.CI ? true : false,
      },
    },

    // Edge browser (optional, CI only)
    ...(process.env.CI
      ? [
          {
            name: "edge",
            use: {
              ...devices["Desktop Edge"],
              channel: "msedge",
              headless: true,
            },
          },
        ]
      : []),
  ],

  // Web server configuration for local development
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run start:local",
        port: 3000,
        timeout: 120 * 1000,
        reuseExistingServer: true,
        stderr: 'pipe',
        stdout: 'pipe',
        env: {
          NODE_ENV: 'test',
          PORT: '3000',
          // E2E tests use TURSO_DATABASE_URL from .env.local (dev/test database)
          // Unit/integration tests use local SQLite
          E2E_TEST_MODE: 'true',
        },
      },

  // Global setup and teardown
  globalSetup: "./tests/e2e/global-setup.js",
  globalTeardown: "./tests/e2e/global-teardown.js",

  // Output directory for test results
  outputDir: "./test-results/playwright",
});
