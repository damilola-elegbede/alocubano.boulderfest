/**
 * Test Environment Manager Verification Test
 * Simple test to verify the TestEnvironmentManager works correctly
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  TestEnvironmentManager,
  testEnvManager,
} from "../utils/test-environment-manager.js";

describe("TestEnvironmentManager", () => {
  let manager;
  let originalEnv;

  beforeEach(() => {
    // Create fresh instance for each test
    manager = new TestEnvironmentManager();
    // Backup original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Always restore original environment after each test
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  });

  describe("backup and restore functionality", () => {
    it("should backup and restore environment correctly", () => {
      // Set test values
      process.env.TEST_VAR = "original-value";
      process.env.TURSO_DATABASE_URL = "original-db-url";

      // Backup environment
      manager.backup();

      // Modify environment
      process.env.TEST_VAR = "modified-value";
      delete process.env.TURSO_DATABASE_URL;
      process.env.NEW_VAR = "new-value";

      // Verify modifications
      expect(process.env.TEST_VAR).toBe("modified-value");
      expect(process.env.TURSO_DATABASE_URL).toBeUndefined();
      expect(process.env.NEW_VAR).toBe("new-value");

      // Restore environment
      manager.restore();

      // Verify restoration
      expect(process.env.TEST_VAR).toBe("original-value");
      expect(process.env.TURSO_DATABASE_URL).toBe("original-db-url");
      expect(process.env.NEW_VAR).toBeUndefined();
    });

    it("should handle restore without backup gracefully", () => {
      // Should not throw error
      expect(() => manager.restore()).not.toThrow();
    });
  });

  describe("database environment clearing", () => {
    it("should clear database-related environment variables", () => {
      // Set database variables
      process.env.TURSO_DATABASE_URL = "test-url";
      process.env.TURSO_AUTH_TOKEN = "test-token";
      process.env.DATABASE_URL = "fallback-url";
      process.env.OTHER_VAR = "should-remain";

      // Clear database environment
      manager.clearDatabaseEnv();

      // Verify database vars are cleared
      expect(process.env.TURSO_DATABASE_URL).toBeUndefined();
      expect(process.env.TURSO_AUTH_TOKEN).toBeUndefined();
      expect(process.env.DATABASE_URL).toBeUndefined();

      // Verify other vars remain
      expect(process.env.OTHER_VAR).toBe("should-remain");
    });
  });

  describe("application environment clearing", () => {
    it("should clear all application-specific environment variables", () => {
      // Set various app variables
      process.env.TURSO_DATABASE_URL = "test-db";
      process.env.BREVO_API_KEY = "test-brevo";
      process.env.STRIPE_SECRET_KEY = "test-stripe";
      process.env.ADMIN_SECRET = "test-admin";
      process.env.APPLE_PASS_KEY = "test-apple";
      process.env.NODE_ENV = "test"; // Should remain

      // Clear app environment
      manager.clearAppEnv();

      // Verify app vars are cleared
      expect(process.env.TURSO_DATABASE_URL).toBeUndefined();
      expect(process.env.BREVO_API_KEY).toBeUndefined();
      expect(process.env.STRIPE_SECRET_KEY).toBeUndefined();
      expect(process.env.ADMIN_SECRET).toBeUndefined();
      expect(process.env.APPLE_PASS_KEY).toBeUndefined();

      // Verify system vars remain
      expect(process.env.NODE_ENV).toBe("test");
    });
  });

  describe("mock environment setting", () => {
    it("should set mock environment variables", () => {
      const mockVars = {
        TEST_VAR: "test-value",
        ANOTHER_VAR: "another-value",
      };

      manager.setMockEnv(mockVars);

      expect(process.env.TEST_VAR).toBe("test-value");
      expect(process.env.ANOTHER_VAR).toBe("another-value");
    });
  });

  describe("preset environments", () => {
    it("should provide empty preset", () => {
      const preset = manager.getPreset("empty");
      expect(preset).toEqual({});
    });

    it("should provide missing-db preset", () => {
      const preset = manager.getPreset("missing-db");
      expect(preset.BREVO_API_KEY).toBe("test-brevo-key");
      expect(preset.TURSO_DATABASE_URL).toBeUndefined();
    });

    it("should provide valid-local preset", () => {
      const preset = manager.getPreset("valid-local");
      expect(preset.TURSO_DATABASE_URL).toBe("file:test.db");
      expect(preset.TURSO_AUTH_TOKEN).toBe("test-token");
      expect(preset.BREVO_API_KEY).toBe("test-brevo-key");
    });

    it("should provide complete-test preset", () => {
      const preset = manager.getPreset("complete-test");
      expect(preset).toHaveProperty("TURSO_DATABASE_URL");
      expect(preset).toHaveProperty("BREVO_API_KEY");
      expect(preset).toHaveProperty("STRIPE_SECRET_KEY");
      expect(preset).toHaveProperty("ADMIN_SECRET");
      expect(preset).toHaveProperty("APPLE_PASS_KEY");
    });

    it("should return empty object for unknown preset", () => {
      const preset = manager.getPreset("unknown-preset");
      expect(preset).toEqual({});
    });
  });

  describe("isolated environment execution", () => {
    it("should execute function with isolated environment using preset", async () => {
      // Set original values
      process.env.ORIGINAL_VAR = "original";
      process.env.TURSO_DATABASE_URL = "original-db";

      const result = await manager.withIsolatedEnv("valid-local", () => {
        // Verify isolated environment
        expect(process.env.TURSO_DATABASE_URL).toBe("file:test.db");
        expect(process.env.ORIGINAL_VAR).toBeUndefined();
        return "test-result";
      });

      // Verify restoration
      expect(process.env.ORIGINAL_VAR).toBe("original");
      expect(process.env.TURSO_DATABASE_URL).toBe("original-db");
      expect(result).toBe("test-result");
    });

    it("should execute function with custom environment object", async () => {
      const customEnv = { CUSTOM_VAR: "custom-value" };

      await manager.withIsolatedEnv(customEnv, () => {
        expect(process.env.CUSTOM_VAR).toBe("custom-value");
      });
    });

    it("should restore environment even if test function throws", async () => {
      process.env.ORIGINAL_VAR = "original";

      try {
        await manager.withIsolatedEnv("empty", () => {
          throw new Error("Test error");
        });
      } catch (error) {
        expect(error.message).toBe("Test error");
      }

      // Verify restoration happened despite error
      expect(process.env.ORIGINAL_VAR).toBe("original");
    });
  });

  describe("isolated environment controller", () => {
    it("should create and manage isolated environment", () => {
      process.env.ORIGINAL_VAR = "original";
      const originalDbUrl = process.env.TURSO_DATABASE_URL;

      const envController = manager.createIsolatedEnv("valid-local");

      // Verify isolation
      expect(process.env.TURSO_DATABASE_URL).toBe("file:test.db");
      expect(process.env.ORIGINAL_VAR).toBeUndefined();

      // Add additional environment
      envController.setAdditionalEnv({ EXTRA_VAR: "extra-value" });
      expect(process.env.EXTRA_VAR).toBe("extra-value");

      // Get current environment
      const currentEnv = envController.getCurrentEnv();
      expect(currentEnv.TURSO_DATABASE_URL).toBe("file:test.db");
      expect(currentEnv.EXTRA_VAR).toBe("extra-value");

      // Restore
      envController.restore();
      expect(process.env.ORIGINAL_VAR).toBe("original");
      expect(process.env.TURSO_DATABASE_URL).toBe(originalDbUrl);
    });
  });

  describe("state inspection", () => {
    it("should provide environment state information", () => {
      process.env.TURSO_DATABASE_URL = "test-db";

      manager.backup();
      const state = manager.getState();

      expect(state.isBackedUp).toBe(true);
      expect(state.databaseEnvPresent).toBe(true);
      expect(Array.isArray(state.originalEnvKeys)).toBe(true);
      expect(Array.isArray(state.currentEnvKeys)).toBe(true);
    });
  });

  describe("singleton instance", () => {
    it("should provide working singleton instance", async () => {
      process.env.TEST_VAR = "original";

      const result = await testEnvManager.withIsolatedEnv("empty", () => {
        expect(process.env.TEST_VAR).toBeUndefined();
        return "singleton-works";
      });

      expect(result).toBe("singleton-works");
      expect(process.env.TEST_VAR).toBe("original");
    });
  });
});
