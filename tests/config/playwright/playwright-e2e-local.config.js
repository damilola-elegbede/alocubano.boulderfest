/**
 * Local E2E Configuration - For Development and Debugging
 * 
 * This configuration runs E2E tests against a local development server
 * with proper environment variable setup and secret management.
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../../..');

// Load test environment
const testEnvPath = join(projectRoot, '.env.test');
console.log('🔧 Loading test environment from:', testEnvPath);

try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: testEnvPath });
  console.log('✅ Test environment loaded');
} catch (error) {
  console.warn('⚠️ Could not load .env.test:', error.message);
  console.log('💡 Create .env.test with required variables for local testing');
}

// Ensure required environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.E2E_TEST_MODE = 'true';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

console.log('🎭 Local E2E Test Configuration:');
console.log(`  Base URL: ${baseURL}`);
console.log(`  Node Environment: ${process.env.NODE_ENV}`);
console.log(`  Test Mode: ${process.env.E2E_TEST_MODE}`);
console.log(`  Admin Password: ${process.env.TEST_ADMIN_PASSWORD ? '✅ Set' : '❌ Missing'}`);
console.log(`  Admin Secret: ${process.env.ADMIN_SECRET ? '✅ Set' : '❌ Missing'}`);

export default defineConfig({
  testDir: '../../e2e/flows',
  testMatch: '**/*.test.js',
  testIgnore: [
    '**/node_modules/**',
    '**/helpers/**',
    '**/fixtures/**',
    '**/config/**',
    '**/utilities/**',
    '**/*.helper.js',
    '**/*.config.js',
    '**/*.setup.js',
    '**/*.teardown.js',
    '**/README*.md'
  ],
  
  // Local testing configuration
  fullyParallel: false, // Sequential for local development and debugging
  forbidOnly: false,    // Allow test.only for debugging
  retries: 1,           // Minimal retries for faster feedback
  workers: 1,           // Single worker for easier debugging
  
  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-local', open: 'on-failure' }]
  ],
  
  // Timeouts - optimized for local development
  timeout: 45000, // 45 seconds for individual tests
  
  // Global expect timeout
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },
  
  use: {
    baseURL: baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Viewport
    viewport: { width: 1280, height: 720 },
    
    // Local development timeouts
    actionTimeout: 10000,      // 10s for actions
    navigationTimeout: 20000,  // 20s for navigation
    
    // Extra headers for local testing
    extraHTTPHeaders: {
      'User-Agent': 'Playwright-E2E-Local-Testing'
    }
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Enable additional browsers only when needed
    ...(process.env.ALL_BROWSERS === 'true' ? [
      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
      },
      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
      }
    ] : [])
  ],

  // Web server configuration for local testing
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/api/health/check`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000, // 60 seconds to start server
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      E2E_TEST_MODE: 'true',
      PORT: '3000',
      // Pass through test environment variables
      TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD,
      ADMIN_SECRET: process.env.ADMIN_SECRET,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    }
  },
  
  // Local setup/teardown
  globalSetup: '../../e2e/global-setup-local.js',
  globalTeardown: '../../e2e/global-teardown-local.js',
});