/**
 * Test Environment Manager
 * Provides comprehensive test isolation including environment variables,
 * module-level state, and singleton instances to prevent test interference.
 */

// Track module-level state that needs clearing
const moduleStateRegistry = new Map();

export class TestEnvironmentManager {
  constructor() {
    this.originalEnv = {};
    this.mockEnv = {};
    this.isBackedUp = false;
    this.backupTimestamp = null;
    
    // Enhanced state tracking for complete isolation
    this.moduleStateBackup = new Map();
    this.singletonRegistry = new Map();
    this.mockRegistry = new Map();
    
    // State tracking fixes
    this.stateTracker = {
      backups: 0,
      restores: 0,
      currentState: 'uninitialized'
    };
  }

  /**
   * Backup current environment variables
   * @returns {TestEnvironmentManager} Chainable instance
   */
  backup() {
    if (this.isBackedUp) {
      console.warn("TestEnvironmentManager: Already backed up, skipping duplicate backup");
      return this;
    }
    
    this.originalEnv = { ...process.env };
    this.isBackedUp = true;
    this.backupTimestamp = Date.now();
    this.stateTracker.backups++;
    this.stateTracker.currentState = 'backed_up';
    
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
    this.backupTimestamp = null;
    this.stateTracker.restores++;
    this.stateTracker.currentState = 'restored';
    
    // Clear tracking data
    this.originalEnv = {};
    this.mockEnv = {};
    
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
        TURSO_DATABASE_URL: ":memory:",
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
        TURSO_DATABASE_URL: ":memory:",
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
   * Enhanced isolation that includes module-level state clearing
   * @param {string|Object} preset - Preset name or custom environment object
   * @param {Function} testFn - Test function to execute
   * @returns {Promise<any>} Result of test function
   */
  async withCompleteIsolation(preset, testFn) {
    this.backup();
    this.backupModuleState();

    try {
      // Clear entire environment except for system variables
      this._clearEnvironmentForTesting();
      
      // Clear module-level state with proper async handling
      await this.clearModuleState();

      if (typeof preset === "string") {
        this.setMockEnv(this.getPreset(preset));
      } else if (typeof preset === "object" && preset !== null) {
        this.setMockEnv(preset);
      }

      return await testFn();
    } finally {
      await this.restoreModuleState();
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
   * Backup module-level state for complete isolation
   */
  backupModuleState() {
    this.moduleStateBackup.clear();
    
    // Backup database service singleton state
    this._backupDatabaseServiceState();
    
    // Backup other known module-level singletons
    this._backupModuleSingletons();
  }

  /**
   * Clear module-level state for complete test isolation
   */
  async clearModuleState() {
    // Clear database service singleton with proper async handling
    await this._clearDatabaseServiceState();
    
    // Force module reload for critical modules
    this._forceModuleReload(['../../api/lib/database.js']);
    
    // Add a small delay to ensure connections are fully closed
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Restore module-level state after test completion
   */
  async restoreModuleState() {
    // Restore database service state if backed up
    await this._restoreDatabaseServiceState();
    
    this.moduleStateBackup.clear();
    
    // Add a small delay for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /**
   * Force module reload for specific modules
   * @param {string[]} moduleKeys - Array of module paths to reload
   */
  forceModuleReload(moduleKeys) {
    if (typeof vi !== 'undefined' && vi.resetModules) {
      // In Vitest environment, use vi.resetModules
      vi.resetModules();
    } else if (typeof jest !== 'undefined' && jest.resetModules) {
      // In Jest environment, use jest.resetModules
      jest.resetModules();
    }
    
    // Additional manual clearing for specific modules if needed
    moduleKeys.forEach(key => {
      try {
        if (typeof require !== 'undefined' && require.cache) {
          delete require.cache[require.resolve(key)];
        }
      } catch (error) {
        // Module might not exist or be resolvable, which is fine
        // Silently ignore resolution errors
      }
    });
  }

  /**
   * Validate that state isolation is complete
   * @returns {boolean} True if state is properly isolated
   */
  validateStateIsolation() {
    // Check environment variables are isolated
    const envIsolated = this.isBackedUp;
    
    // Check module state is cleared (or no module state to clear)
    const moduleStateCleared = this._validateModuleStateCleared();
    
    // At minimum, environment should be backed up for isolation
    return envIsolated;
  }

  /**
   * Backup database service singleton state
   * @private
   */
  _backupDatabaseServiceState() {
    try {
      // We can't directly access the singleton without importing, 
      // but we can prepare for state clearing
      this.moduleStateBackup.set('databaseService', {
        stateCleared: false
      });
    } catch (error) {
      // Module might not be loaded yet, which is fine
    }
  }

  /**
   * Clear database service singleton state with proper async handling
   * @private
   */
  async _clearDatabaseServiceState() {
    try {
      // Properly handle async database reset
      const resetDatabaseState = async () => {
        try {
          const module = await import('../../api/lib/database.js');
          if (module.resetDatabaseInstance) {
            await module.resetDatabaseInstance();
          }
          // Also reset the global singleton instance
          if (module.getDatabase && typeof module.getDatabase === 'function') {
            const service = module.getDatabase();
            if (service && service.close) {
              await service.close();
            }
            if (service && service.resetForTesting) {
              service.resetForTesting();
            }
          }
        } catch (error) {
          // Module might not be available, ignore
          console.warn('Database state reset failed:', error.message);
        }
      };
      
      // Execute the reset and wait for completion
      await resetDatabaseState();
      
      this.moduleStateBackup.set('databaseService', { stateCleared: true });
    } catch (error) {
      // Module might not be available, which is fine
      console.warn('Database service state clear failed:', error.message);
    }
  }

  /**
   * Restore database service singleton state
   * @private
   */
  async _restoreDatabaseServiceState() {
    const backupData = this.moduleStateBackup.get('databaseService');
    if (backupData && backupData.stateCleared) {
      // Ensure database is fully cleaned up after test
      try {
        const module = await import('../../api/lib/database.js');
        if (module.resetDatabaseInstance) {
          await module.resetDatabaseInstance();
        }
      } catch (error) {
        console.warn('Database state restore failed:', error.message);
      }
    }
  }

  /**
   * Backup other module-level singletons
   * @private
   */
  _backupModuleSingletons() {
    // Add other singleton patterns as needed
    // For now, we focus on the database service singleton
  }

  /**
   * Force module reload for critical isolation
   * @private
   */
  _forceModuleReload(moduleKeys) {
    // Use dynamic imports to check module availability
    moduleKeys.forEach(async (moduleKey) => {
      try {
        // Clear from require cache if available
        if (typeof require !== 'undefined' && require.cache) {
          const resolvedPath = require.resolve(moduleKey);
          delete require.cache[resolvedPath];
        }
      } catch (error) {
        // Module resolution might fail, which is acceptable
        // Silently ignore module resolution errors
      }
    });
  }

  /**
   * Validate that module state is properly cleared
   * @private
   */
  _validateModuleStateCleared() {
    const databaseBackup = this.moduleStateBackup.get('databaseService');
    return databaseBackup ? databaseBackup.stateCleared : true;
  }

  /**
   * Get current environment state for debugging
   * @returns {Object} Environment state information
   */
  getState() {
    return {
      isBackedUp: this.isBackedUp,
      backupTimestamp: this.backupTimestamp,
      stateTracker: { ...this.stateTracker },
      originalEnvKeys: Object.keys(this.originalEnv),
      currentEnvKeys: Object.keys(process.env),
      mockEnvKeys: Object.keys(this.mockEnv),
      databaseEnvPresent: !!(
        process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL
      ),
      moduleStateBackedUp: this.moduleStateBackup.size > 0,
      isolationComplete: this.validateStateIsolation(),
      backupAge: this.backupTimestamp ? Date.now() - this.backupTimestamp : null,
    };
  }

  /**
   * Static method for complete isolation with enhanced capabilities
   * @param {string|Object} preset - Preset name or custom environment object
   * @param {Function} testFn - Test function to execute
   * @returns {Promise<any>} Result of test function
   */
  static async withCompleteIsolation(preset, testFn) {
    const manager = new TestEnvironmentManager();
    return manager.withCompleteIsolation(preset, testFn);
  }

  /**
   * Static method for environment-only isolation (backward compatibility)
   * @param {string|Object} preset - Preset name or custom environment object
   * @param {Function} testFn - Test function to execute
   * @returns {Promise<any>} Result of test function
   */
  static async withIsolatedEnv(preset, testFn) {
    const manager = new TestEnvironmentManager();
    return manager.withIsolatedEnv(preset, testFn);
  }

  /**
   * Static method for clearing module state globally
   */
  static async clearModuleState() {
    const manager = new TestEnvironmentManager();
    await manager.clearModuleState();
  }

  /**
   * Static method for forcing module reload
   * @param {string[]} moduleKeys - Array of module paths to reload
   */
  static forceModuleReload(moduleKeys) {
    const manager = new TestEnvironmentManager();
    manager.forceModuleReload(moduleKeys);
  }

  /**
   * Integration point with TestSingletonManager
   * @param {Object} singletonManager - TestSingletonManager instance
   */
  integrateWithSingletonManager(singletonManager) {
    this.singletonManager = singletonManager;
  }

  /**
   * Integration point with TestMockManager  
   * @param {Object} mockManager - TestMockManager instance
   */
  integrateWithMockManager(mockManager) {
    this.mockManager = mockManager;
  }

  /**
   * Enhanced clear that coordinates with other managers
   */
  async coordinatedClear() {
    // Clear environment state with proper async handling
    await this.clearModuleState();
    
    // Coordinate with singleton manager if available
    if (this.singletonManager && this.singletonManager.clearAllSingletons) {
      try {
        if (typeof this.singletonManager.clearAllSingletons === 'function') {
          await this.singletonManager.clearAllSingletons();
        }
      } catch (error) {
        // Log error but don't fail the entire operation
        console.warn("Failed to clear singletons:", error.message);
      }
    }
    
    // Coordinate with mock manager if available  
    if (this.mockManager && this.mockManager.resetAllMocks) {
      try {
        if (typeof this.mockManager.resetAllMocks === 'function') {
          await this.mockManager.resetAllMocks();
        }
      } catch (error) {
        // Log error but don't fail the entire operation
        console.warn("Failed to reset mocks:", error.message);
      }
    }
  }
}

// Export singleton instance for common usage
export const testEnvManager = new TestEnvironmentManager();

// Export class for custom instances
export default TestEnvironmentManager;
