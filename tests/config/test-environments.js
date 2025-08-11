/**
 * Test Environment Presets
 *
 * Centralized configuration for different test scenarios with predefined
 * environment variable sets to ensure consistent testing across scenarios.
 */

export const TestEnvironments = {
  // Empty environment - for testing missing variable scenarios
  EMPTY: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
  },

  // Missing database configuration
  MISSING_DATABASE: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    BREVO_API_KEY: "test-key",
    BREVO_NEWSLETTER_LIST_ID: "2",
    STRIPE_SECRET_KEY: "sk_test_123",
    // Intentionally missing TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
  },

  // Invalid database configuration
  INVALID_DATABASE: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "invalid-url-format",
    TURSO_AUTH_TOKEN: "test-token",
    BREVO_API_KEY: "test-key",
    BREVO_NEWSLETTER_LIST_ID: "2",
    STRIPE_SECRET_KEY: "sk_test_123",
  },

  // Valid local SQLite configuration
  VALID_LOCAL: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "file:test.db",
    TURSO_AUTH_TOKEN: "test-token",
    BREVO_API_KEY: "test-key",
    BREVO_NEWSLETTER_LIST_ID: "2",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  },

  // Valid remote Turso configuration
  VALID_REMOTE: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "libsql://test.turso.io",
    TURSO_AUTH_TOKEN: "valid-auth-token-123",
    BREVO_API_KEY: "test-key",
    BREVO_NEWSLETTER_LIST_ID: "2",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  },

  // Complete test environment with all services
  COMPLETE_TEST: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "file:test.db",
    TURSO_AUTH_TOKEN: "test-token",
    BREVO_API_KEY: "test-key-123",
    BREVO_NEWSLETTER_LIST_ID: "2",
    BREVO_WEBHOOK_SECRET: "test-webhook-secret",
    BREVO_TICKET_CONFIRMATION_TEMPLATE_ID: "2",
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_PUBLISHABLE_KEY: "pk_test_123",
    STRIPE_WEBHOOK_SECRET: "whsec_test_123",
    ADMIN_PASSWORD: "$2a$10$test",
    ADMIN_SECRET: "test-secret-minimum-32-characters-long",
    WALLET_AUTH_SECRET: "test-wallet-secret-minimum-32-chars",
    APPLE_PASS_KEY: "test-apple-key",
    GOOGLE_WALLET_ISSUER_ID: "test-issuer",
    GOOGLE_WALLET_KEY_FILE: "test-key-file",
  },

  // Production-like environment for integration testing
  PRODUCTION_LIKE: {
    NODE_ENV: "production",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "libsql://prod-test.turso.io",
    TURSO_AUTH_TOKEN: "prod-test-auth-token",
    BREVO_API_KEY: "prod-test-api-key",
    BREVO_NEWSLETTER_LIST_ID: "1",
    BREVO_WEBHOOK_SECRET: "prod-test-webhook-secret",
    BREVO_TICKET_CONFIRMATION_TEMPLATE_ID: "1",
    STRIPE_SECRET_KEY: "sk_test_prod_123",
    STRIPE_PUBLISHABLE_KEY: "pk_test_prod_123",
    STRIPE_WEBHOOK_SECRET: "whsec_prod_test_123",
    ADMIN_PASSWORD: "$2a$10$prodtest",
    ADMIN_SECRET: "production-test-secret-minimum-32-characters",
    WALLET_AUTH_SECRET: "prod-test-wallet-secret-32-chars-min",
    APPLE_PASS_KEY: "prod-test-apple-key",
    GOOGLE_WALLET_ISSUER_ID: "prod-test-issuer",
    GOOGLE_WALLET_KEY_FILE: "prod-test-key-file",
  },

  // Minimal environment for basic functionality testing
  MINIMAL: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "file:minimal-test.db",
    TURSO_AUTH_TOKEN: "minimal-token",
  },

  // Environment for testing missing Brevo configuration
  MISSING_BREVO: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "file:test.db",
    TURSO_AUTH_TOKEN: "test-token",
    STRIPE_SECRET_KEY: "sk_test_123",
    // Intentionally missing Brevo configuration
  },

  // Environment for testing missing Stripe configuration
  MISSING_STRIPE: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "file:test.db",
    TURSO_AUTH_TOKEN: "test-token",
    BREVO_API_KEY: "test-key",
    BREVO_NEWSLETTER_LIST_ID: "2",
    // Intentionally missing Stripe configuration
  },

  // Environment for wallet testing
  WALLET_TEST: {
    NODE_ENV: "test",
    TEST_ISOLATION_MODE: "true",
    TURSO_DATABASE_URL: "file:wallet-test.db",
    TURSO_AUTH_TOKEN: "wallet-token",
    WALLET_AUTH_SECRET: "wallet-test-secret-minimum-32-chars",
    APPLE_PASS_KEY: "base64-encoded-apple-pass-key-for-testing",
    GOOGLE_WALLET_ISSUER_ID: "test-wallet-issuer-id",
    GOOGLE_WALLET_KEY_FILE: "test-wallet-key-file-path",
  },
};

/**
 * Helper function to apply an environment preset
 * @param {string} presetName - Name of the preset to apply
 * @returns {Object} The applied environment variables
 */
export function applyEnvironmentPreset(presetName) {
  const preset = TestEnvironments[presetName];
  if (!preset) {
    throw new Error(
      `Unknown environment preset: ${presetName}. Available presets: ${Object.keys(TestEnvironments).join(", ")}`,
    );
  }

  // Store original environment for restoration
  const originalEnv = { ...process.env };

  // Clear test-related environment variables (preserve system variables)
  const systemVars = [
    "PATH",
    "HOME",
    "USER",
    "SHELL",
    "TERM",
    "PWD",
    "LANG",
    "NODE_PATH",
    "npm_config_user_config",
    "CI",
    "GITHUB_ACTIONS",
  ];

  Object.keys(process.env).forEach((key) => {
    if (!systemVars.some((sysVar) => key.startsWith(sysVar))) {
      delete process.env[key];
    }
  });

  // Apply preset
  Object.assign(process.env, preset);

  return {
    applied: preset,
    original: originalEnv,
  };
}

/**
 * Helper to get environment for specific test scenarios
 * @param {string} testType - Type of test scenario
 * @returns {Object} Environment configuration for the test type
 */
export function getEnvironmentForTest(testType) {
  const mapping = {
    "database-missing": TestEnvironments.MISSING_DATABASE,
    "database-invalid": TestEnvironments.INVALID_DATABASE,
    "database-valid": TestEnvironments.VALID_LOCAL,
    integration: TestEnvironments.COMPLETE_TEST,
    production: TestEnvironments.PRODUCTION_LIKE,
    empty: TestEnvironments.EMPTY,
    minimal: TestEnvironments.MINIMAL,
    "brevo-missing": TestEnvironments.MISSING_BREVO,
    "stripe-missing": TestEnvironments.MISSING_STRIPE,
    wallet: TestEnvironments.WALLET_TEST,
  };

  const environment = mapping[testType];
  if (!environment) {
    throw new Error(
      `Unknown test type: ${testType}. Available types: ${Object.keys(mapping).join(", ")}`,
    );
  }

  return environment;
}

/**
 * Restore original environment variables
 * @param {Object} originalEnv - Original environment to restore
 */
export function restoreEnvironment(originalEnv) {
  if (!originalEnv) {
    throw new Error("No original environment provided for restoration");
  }

  // Clear current environment
  Object.keys(process.env).forEach((key) => {
    delete process.env[key];
  });

  // Restore original
  Object.assign(process.env, originalEnv);
}

/**
 * Create a test-scoped environment preset application
 * @param {string} presetName - Name of the preset to apply
 * @param {Function} testFn - Test function to run with the environment
 * @returns {Promise<any>} Result of the test function
 */
export async function withEnvironmentPreset(presetName, testFn) {
  const { original } = applyEnvironmentPreset(presetName);

  try {
    return await testFn();
  } finally {
    restoreEnvironment(original);
  }
}

/**
 * Validate that an environment preset contains required variables
 * @param {string} presetName - Name of the preset to validate
 * @param {string[]} requiredVars - Array of required variable names
 * @returns {boolean} True if all required variables are present
 */
export function validateEnvironmentPreset(presetName, requiredVars) {
  const preset = TestEnvironments[presetName];
  if (!preset) {
    return false;
  }

  return requiredVars.every((varName) => preset.hasOwnProperty(varName));
}

/**
 * Get all available preset names
 * @returns {string[]} Array of preset names
 */
export function getAvailablePresets() {
  return Object.keys(TestEnvironments);
}

/**
 * Create a custom environment preset by merging base preset with overrides
 * @param {string} basePreset - Name of base preset to extend
 * @param {Object} overrides - Environment variables to override/add
 * @returns {Object} Merged environment configuration
 */
export function createCustomPreset(basePreset, overrides = {}) {
  const base = TestEnvironments[basePreset];
  if (!base) {
    throw new Error(`Base preset '${basePreset}' not found`);
  }

  return { ...base, ...overrides };
}

// Export for use in tests
export default TestEnvironments;
