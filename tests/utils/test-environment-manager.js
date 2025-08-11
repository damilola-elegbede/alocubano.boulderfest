/**
 * Test Environment Manager
 * Provides environment variable isolation for tests, preventing .env.local values
 * from bleeding into test execution and enabling controlled test environments.
 */

export class TestEnvironmentManager {
  constructor() {
    this.originalEnv = {};
    this.mockEnv = {};
    this.isBackedUp = false;
  }

  /**
   * Backup current environment variables
   * @returns {TestEnvironmentManager} Chainable instance
   */
  backup() {
    this.originalEnv = { ...process.env };
    this.isBackedUp = true;
    return this;
  }

  /**
   * Restore original environment variables
   * @returns {TestEnvironmentManager} Chainable instance
   */
  restore() {
    if (!this.isBackedUp) {
      console.warn("TestEnvironmentManager: No backup found, skipping restore");
      return this;
    }

    // Clear all current env vars
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });

    // Restore original environment
    Object.assign(process.env, this.originalEnv);
    this.isBackedUp = false;
    return this;
  }

  /**
   * Clear specific database-related environment variables
   * @returns {TestEnvironmentManager} Chainable instance
   */
  clearDatabaseEnv() {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.DATABASE_URL;
    return this;
  }

  /**
   * Clear all application-specific environment variables
   * @returns {TestEnvironmentManager} Chainable instance
   */
  clearAppEnv() {
    // Database
    this.clearDatabaseEnv();

    // Email service
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_NEWSLETTER_LIST_ID;
    delete process.env.BREVO_WEBHOOK_SECRET;

    // Payment processing
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    // Admin
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_SECRET;

    // Wallet passes
    delete process.env.APPLE_PASS_KEY;
    delete process.env.APPLE_PASS_PASSWORD;
    delete process.env.WALLET_AUTH_SECRET;

    return this;
  }

  /**
   * Set mock environment variables
   * @param {Object} vars - Environment variables to set
   * @returns {TestEnvironmentManager} Chainable instance
   */
  setMockEnv(vars) {
    Object.assign(process.env, vars);
    this.mockEnv = { ...this.mockEnv, ...vars };
    return this;
  }

  /**
   * Get preset environment configurations
   * @param {string} presetName - Name of the preset
   * @returns {Object} Environment variables object
   */
  getPreset(presetName) {
    const presets = {
      // Empty environment (no variables set)
      empty: {},

      // Missing database configuration
      "missing-db": {
        BREVO_API_KEY: "test-brevo-key",
        STRIPE_SECRET_KEY: "sk_test_test",
        ADMIN_SECRET: "test-admin-secret-32-chars-long",
        // Intentionally missing TURSO_DATABASE_URL
      },

      // Invalid database configuration
      "invalid-db": {
        TURSO_DATABASE_URL: "invalid-url-format",
        TURSO_AUTH_TOKEN: "test-token",
        BREVO_API_KEY: "test-brevo-key",
      },

      // Valid local database configuration
      "valid-local": {
        TURSO_DATABASE_URL: "file:test.db",
        TURSO_AUTH_TOKEN: "test-token",
        BREVO_API_KEY: "test-brevo-key",
        STRIPE_SECRET_KEY: "sk_test_local",
        ADMIN_SECRET: "test-admin-secret-32-chars-long",
      },

      // Valid remote database configuration
      "valid-remote": {
        TURSO_DATABASE_URL: "libsql://test.turso.io",
        TURSO_AUTH_TOKEN: "valid-token-for-remote",
        BREVO_API_KEY: "test-brevo-key",
        STRIPE_SECRET_KEY: "sk_test_remote",
        ADMIN_SECRET: "test-admin-secret-32-chars-long",
      },

      // Complete test environment with all services
      "complete-test": {
        // Database
        TURSO_DATABASE_URL: "file:test.db",
        TURSO_AUTH_TOKEN: "test-token",

        // Email service
        BREVO_API_KEY: "test-brevo-api-key",
        BREVO_NEWSLETTER_LIST_ID: "123",
        BREVO_WEBHOOK_SECRET: "test-webhook-secret",

        // Payment processing
        STRIPE_PUBLISHABLE_KEY: "pk_test_test",
        STRIPE_SECRET_KEY: "sk_test_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",

        // Admin
        ADMIN_PASSWORD: "$2b$10$test.hash.for.testing",
        ADMIN_SECRET: "test-admin-secret-32-chars-long",

        // Wallet passes
        APPLE_PASS_KEY: "dGVzdC1hcHBsZS1wYXNzLWtleQ==", // base64 encoded test key
        WALLET_AUTH_SECRET: "test-wallet-auth-secret-32-chars",
      },

      // Production-like environment (for integration tests)
      "production-like": {
        TURSO_DATABASE_URL: "libsql://prod-like.turso.io",
        TURSO_AUTH_TOKEN: "prod-like-token",
        BREVO_API_KEY: "prod-like-brevo-key",
        STRIPE_SECRET_KEY: "sk_test_prod_like",
        ADMIN_SECRET: "prod-like-admin-secret-32-chars",
        NODE_ENV: "production",
      },
    };

    return presets[presetName] || {};
  }

  /**
   * Helper to run test function with isolated environment
   * @param {string|Object} preset - Preset name or custom environment object
   * @param {Function} testFn - Test function to execute
   * @returns {Promise<any>} Result of test function
   */
  async withIsolatedEnv(preset, testFn) {
    this.backup();

    try {
      // Clear entire environment except for system variables
      this._clearEnvironmentForTesting();

      if (typeof preset === "string") {
        this.setMockEnv(this.getPreset(preset));
      } else if (typeof preset === "object" && preset !== null) {
        this.setMockEnv(preset);
      }

      return await testFn();
    } finally {
      this.restore();
    }
  }

  /**
   * Clear environment for testing while preserving essential system variables
   * @private
   */
  _clearEnvironmentForTesting() {
    // System variables to preserve
    const systemVars = {
      NODE_ENV: process.env.NODE_ENV,
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      SHELL: process.env.SHELL,
      CI: process.env.CI,
      // Vitest-specific variables
      VITEST: process.env.VITEST,
      VITEST_WORKER_ID: process.env.VITEST_WORKER_ID,
      VITEST_POOL_ID: process.env.VITEST_POOL_ID,
    };

    // Clear all environment variables
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });

    // Restore system variables
    Object.entries(systemVars).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      }
    });
  }

  /**
   * Create isolated environment for multiple test operations
   * @param {string|Object} preset - Preset name or custom environment object
   * @returns {Object} Environment controller with restore method
   */
  createIsolatedEnv(preset) {
    this.backup();
    this._clearEnvironmentForTesting();

    if (typeof preset === "string") {
      this.setMockEnv(this.getPreset(preset));
    } else if (typeof preset === "object" && preset !== null) {
      this.setMockEnv(preset);
    }

    return {
      restore: () => this.restore(),
      setAdditionalEnv: (vars) => this.setMockEnv(vars),
      getCurrentEnv: () => ({ ...process.env }),
    };
  }

  /**
   * Get current environment state for debugging
   * @returns {Object} Environment state information
   */
  getState() {
    return {
      isBackedUp: this.isBackedUp,
      originalEnvKeys: Object.keys(this.originalEnv),
      currentEnvKeys: Object.keys(process.env),
      mockEnvKeys: Object.keys(this.mockEnv),
      databaseEnvPresent: !!(
        process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL
      ),
    };
  }
}

// Export singleton instance for common usage
export const testEnvManager = new TestEnvironmentManager();

// Export class for custom instances
export default TestEnvironmentManager;
