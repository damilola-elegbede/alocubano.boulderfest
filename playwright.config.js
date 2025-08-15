import { defineConfig, devices } from "@playwright/test";

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 4 : undefined,

  // Reporter configuration
  reporter: process.env.CI
    ? [
        ["html", { outputFolder: "./playwright-report" }],
        ["junit", { outputFile: "./test-results/e2e-results.xml" }],
        ["json", { outputFile: "./test-results/e2e-results.json" }],
        ["github"],
      ]
    : [["html", { open: "never" }]],

  // Global test timeout
  timeout: 30 * 1000,

  // Expect timeout
  expect: {
    timeout: 5000,
  },

  // Shared settings for all projects
  use: {
    // Base URL for all tests
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",

    // Collect trace when retrying failed test
    trace: "on-first-retry",

    // Capture screenshot on failure
    screenshot: "only-on-failure",

    // Record video on failure
    video: "retain-on-failure",

    // Global timeout for actions
    actionTimeout: 10 * 1000,

    // Navigation timeout
    navigationTimeout: 15 * 1000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /.*\.test\.js$/,
    },

    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // Pass browser type to global setup
        launchOptions: {
          env: { PLAYWRIGHT_BROWSER: "firefox" },
        },
      },
      testMatch: /.*\.test\.js$/,
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: /.*\.test\.js$/,
    },

    // Test against mobile viewports
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
      testMatch: /.*mobile.*\.test\.js$/,
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
      testMatch: /.*mobile.*\.test\.js$/,
    },

    // Test against branded browsers (CI only)
    ...(process.env.CI
      ? [
          {
            name: "Microsoft Edge",
            use: { ...devices["Desktop Edge"], channel: "msedge" },
            testMatch: /.*\.test\.js$/,
          },
        ]
      : []),

    ...(process.env.CI
      ? [
          {
            name: "Google Chrome",
            use: { ...devices["Desktop Chrome"], channel: "chrome" },
            testMatch: /.*\.test\.js$/,
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
        reuseExistingServer: !process.env.CI,
      },

  // Global setup and teardown
  globalSetup: "./tests/e2e/global-setup.js",
  globalTeardown: "./tests/e2e/global-teardown.js",

  // Output directory for test results
  outputDir: "./test-results/playwright",
});
