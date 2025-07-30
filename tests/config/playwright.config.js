/**
 * Playwright configuration for E2E tests
 * Supports cross-browser and mobile testing
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '../e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ['html'],
        ['junit', { outputFile: 'test-results/e2e-results.xml' }],
        ['json', { outputFile: 'test-results/e2e-results.json' }]
    ],
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15000,
        navigationTimeout: 30000,
    },

    projects: [
        // Desktop browsers
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
            name: 'edge',
            use: { ...devices['Desktop Edge'] },
        },

        // Mobile browsers
        {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 14'] },
        },
        {
            name: 'Tablet Safari',
            use: { ...devices['iPad Pro'] },
        },

        // Test specific payment scenarios
        {
            name: 'payment-flow',
            testMatch: /payment-checkout\.e2e\.js/,
            use: {
                ...devices['Desktop Chrome'],
                locale: 'en-US',
                timezoneId: 'America/Denver',
                permissions: ['payment-handler'],
            },
        },

        // International testing
        {
            name: 'international-ca',
            testMatch: /international/,
            use: {
                ...devices['Desktop Chrome'],
                locale: 'en-CA',
                timezoneId: 'America/Toronto',
                geolocation: { longitude: -79.3832, latitude: 43.6532 },
            },
        },
        {
            name: 'international-mx',
            testMatch: /international/,
            use: {
                ...devices['Desktop Chrome'],
                locale: 'es-MX',
                timezoneId: 'America/Mexico_City',
                geolocation: { longitude: -99.1332, latitude: 19.4326 },
            },
        },
    ],

    // Web server configuration
    webServer: {
        command: 'npm run start:test',
        port: 3000,
        timeout: 120 * 1000,
        reuseExistingServer: !process.env.CI,
        env: {
            NODE_ENV: 'test',
            STRIPE_SECRET_KEY: process.env.STRIPE_TEST_SECRET_KEY,
            ENABLE_TEST_MODE: 'true',
        },
    },

    // Global setup/teardown
    globalSetup: require.resolve('./global-setup'),
    globalTeardown: require.resolve('./global-teardown'),
});