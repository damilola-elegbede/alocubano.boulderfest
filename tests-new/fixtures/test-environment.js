/**
 * Test Environment Configuration
 * Manages environment variables and configuration for integration tests
 */

export class TestEnvironment {
  constructor() {
    this.originalEnv = {};
    this.isSetup = false;
  }

  /**
   * Setup test environment with required variables
   */
  setup() {
    if (this.isSetup) {
      return;
    }

    // Store original environment variables
    this.originalEnv = { ...process.env };

    // Set test-specific environment variables
    this.setTestEnvironment();
    
    this.isSetup = true;
    console.log('✅ Test environment configured');
  }

  /**
   * Restore original environment
   */
  teardown() {
    if (!this.isSetup) {
      return;
    }

    // Restore original environment
    process.env = { ...this.originalEnv };
    
    this.isSetup = false;
    console.log('✅ Test environment restored');
  }

  /**
   * Set test-specific environment variables
   */
  setTestEnvironment() {
    // Ensure test mode
    process.env.NODE_ENV = 'test';
    process.env.TEST_TYPE = 'integration';

    // Test database configuration
    if (!process.env.TURSO_DATABASE_URL) {
      process.env.TURSO_DATABASE_URL = 'file:./test-integration.db';
    }

    // Test server configuration
    process.env.TEST_PORT = process.env.TEST_PORT || '3001';
    process.env.DISABLE_NGROK = 'true';

    // Database test configuration
    process.env.DATABASE_TEST_STRICT_MODE = 'true';

    // Ensure required secrets exist for testing
    if (!process.env.ADMIN_SECRET) {
      process.env.ADMIN_SECRET = 'test-admin-secret-key-32-characters-long';
    }

    if (!process.env.QR_SECRET_KEY) {
      process.env.QR_SECRET_KEY = 'test-qr-secret-key-32-characters-long-abc';
    }

    // Set test webhook secrets if not provided
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_webhook_secret_for_integration_tests';
    }

    if (!process.env.BREVO_WEBHOOK_SECRET) {
      process.env.BREVO_WEBHOOK_SECRET = 'brevo_test_webhook_secret_for_integration_tests';
    }

    // Admin configuration for testing
    if (!process.env.ADMIN_PASSWORD) {
      const bcrypt = require('bcryptjs');
      process.env.ADMIN_PASSWORD = bcrypt.hashSync('test-admin-password', 10);
    }

    // Performance and timeout settings
    process.env.ADMIN_SESSION_DURATION = '3600000'; // 1 hour
    process.env.ADMIN_MAX_LOGIN_ATTEMPTS = '5';
    process.env.QR_CODE_EXPIRY_DAYS = '180';
    process.env.QR_CODE_MAX_SCANS = '5';

    // Rate limiting for tests
    process.env.RATE_LIMIT_MAX = '1000'; // Higher limit for tests
    process.env.RATE_LIMIT_WINDOW_MS = '60000';

    // Disable external services that might interfere with tests
    process.env.ENABLE_PERFORMANCE_MONITORING = 'false';
  }

  /**
   * Get test database URL
   */
  getTestDatabaseUrl() {
    return process.env.TURSO_DATABASE_URL || 'file:./test-integration.db';
  }

  /**
   * Get test server URL
   */
  getTestServerUrl() {
    const port = process.env.TEST_PORT || 3001;
    return `http://localhost:${port}`;
  }

  /**
   * Check if running in test environment
   */
  isTestEnvironment() {
    return process.env.NODE_ENV === 'test' && process.env.TEST_TYPE === 'integration';
  }

  /**
   * Validate test environment configuration
   */
  validateEnvironment() {
    const required = [
      'NODE_ENV',
      'TEST_TYPE',
      'ADMIN_SECRET',
      'QR_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate environment values
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('NODE_ENV must be "test" for integration tests');
    }

    if (process.env.TEST_TYPE !== 'integration') {
      throw new Error('TEST_TYPE must be "integration"');
    }

    if (process.env.ADMIN_SECRET.length < 32) {
      throw new Error('ADMIN_SECRET must be at least 32 characters long');
    }

    return true;
  }

  /**
   * Set environment variable temporarily
   */
  setEnvVar(key, value) {
    process.env[key] = value;
  }

  /**
   * Restore environment variable to original value
   */
  restoreEnvVar(key) {
    if (this.originalEnv.hasOwnProperty(key)) {
      process.env[key] = this.originalEnv[key];
    } else {
      delete process.env[key];
    }
  }

  /**
   * Get environment information for debugging
   */
  getEnvironmentInfo() {
    return {
      nodeEnv: process.env.NODE_ENV,
      testType: process.env.TEST_TYPE,
      testPort: process.env.TEST_PORT,
      databaseUrl: this.getTestDatabaseUrl(),
      serverUrl: this.getTestServerUrl(),
      hasAdminSecret: !!process.env.ADMIN_SECRET,
      hasStripeConfig: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      hasBrevoConfig: !!(process.env.BREVO_API_KEY && process.env.BREVO_WEBHOOK_SECRET),
      strictMode: process.env.DATABASE_TEST_STRICT_MODE === 'true',
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const testEnvironment = new TestEnvironment();

// Auto-setup on import
testEnvironment.setup();