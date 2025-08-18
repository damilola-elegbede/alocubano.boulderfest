/**
 * Vitest Configuration for Integration Tests
 * Configures real server testing with actual APIs and database
 */
import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Test environment configuration
    environment: 'jsdom',
    testTimeout: 30000,
    setupFiles: [
      resolve(__dirname, 'core/setup.js')
    ],
    
    // Global test configuration
    globals: true,
    
    // File patterns - ONLY include tests-new directory
    include: [
      'integration/**/*.test.js',
      'integration/**/*.spec.js',
      '**/integration/**/*.test.js',
      '**/integration/**/*.spec.js'
    ],
    exclude: [
      'node_modules/**',
      'tests/**',  // Exclude old tests directory
      '**/*.config.js',
      'tests-new/core/**',
      'tests-new/fixtures/**',
      'tests-new/helpers/**'
    ],
    
    // Reporters
    reporters: ['verbose', 'json'],
    outputFile: {
      json: 'test-results/integration-results.json'
    },
    
    // Coverage configuration
    coverage: {
      enabled: false, // Disabled for integration tests - focused on E2E behavior
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage/integration',
      exclude: [
        'core/**',
        'fixtures/**',
        'helpers/**',
        'node_modules/**',
        '**/*.config.js'
      ]
    },
    
    // Retry configuration for flaky external API calls
    retry: 2,
    
    // Pool configuration for stability
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true // Use single fork for database stability
      }
    },
    
    // Environment variables for integration tests
    env: {
      NODE_ENV: 'test',
      TEST_TYPE: 'integration',
      TEST_PORT: '3005',
      DATABASE_TEST_STRICT_MODE: 'true',
      // Use in-memory database for integration tests to avoid locking issues
      // This allows proper testing of database operations without file locking
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || ':memory:',
      // Authentication secrets for testing
      ADMIN_SECRET: process.env.ADMIN_SECRET || 'test-admin-secret-key-32-characters-long',
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '$2b$10$PMCZ6tj2JVicCvLQIV.NfuQ93bMjJbxrA8AsJsSngMrwm4G4iN5eG',
      QR_SECRET_KEY: process.env.QR_SECRET_KEY || 'test-qr-secret-key-32-characters-long-abc',
      // Webhook secrets for testing
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_webhook_secret_for_integration_tests',
      BREVO_WEBHOOK_SECRET: process.env.BREVO_WEBHOOK_SECRET || 'brevo_test_webhook_secret_for_integration_tests',
      // Webhook timestamp tolerance for tests (10 minutes vs 5 minutes in production)
      STRIPE_WEBHOOK_TOLERANCE_SECONDS: '600'
    }
  },
  
  // Resolution configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, '../api'),
      '@lib': resolve(__dirname, '../api/lib')
      // Note: @core, @fixtures, @helpers aliases removed as tests use relative imports
      // This prevents confusion and ensures consistent import patterns
    }
  }
});