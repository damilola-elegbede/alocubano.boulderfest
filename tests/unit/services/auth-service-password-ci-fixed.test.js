/**
 * Auth Service Password Verification Unit Tests - CI Fixed Version
 *
 * This test file uses proper module isolation to fix CI failures caused by:
 * - Module caching issues with singleton AuthService instances
 * - Environment variable persistence between tests
 * - bcryptjs mock state pollution
 *
 * Key improvements:
 * - vi.resetModules() to clear module cache between tests
 * - Dynamic imports after setting environment variables
 * - Controlled bcryptjs mocking with proper cleanup
 * - Complete isolation of test environments
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("AuthService Password Verification - CI Fixed", () => {
  let originalEnv;
  let bcryptMock;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Reset all modules to clear singleton state
    vi.resetModules();

    // Create fresh bcrypt mock for each test
    bcryptMock = {
      compare: vi.fn()
    };

    // Mock bcryptjs module before any imports
    vi.doMock("bcryptjs", () => ({
      default: bcryptMock
    }));
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clear all mocks
    vi.clearAllMocks();
    vi.resetModules();
  });

  /**
   * Helper to set environment and import fresh AuthService
   */
  const createAuthServiceWithEnv = async (envVars = {}) => {
    // Clear environment variables that affect production detection
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.CI;
    delete process.env.E2E_TEST_MODE;

    // Set required environment variables
    process.env.ADMIN_SECRET = "test-admin-jwt-secret-minimum-32-characters-for-security";
    process.env.TEST_ADMIN_PASSWORD = "test-admin-password-123";
    process.env.ADMIN_PASSWORD = "$2b$10$test.bcrypt.hash.for.testing.purposes.only";

    // Apply custom environment variables
    Object.keys(envVars).forEach(key => {
      if (envVars[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envVars[key];
      }
    });

    // Dynamic import to get fresh module after environment setup
    const { AuthService } = await import("../../../lib/auth-service.js");
    return new AuthService();
  };

  describe("Environment Detection", () => {
    it("should detect non-production when VERCEL_ENV is preview", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        VERCEL_ENV: "preview",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should detect non-production when NODE_ENV is test", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should detect non-production when CI is true", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        CI: "true",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should detect non-production when E2E_TEST_MODE is true", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        E2E_TEST_MODE: "true",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should use production only when both NODE_ENV and VERCEL_ENV are production", async () => {
      // Arrange
      bcryptMock.compare.mockResolvedValue(true);

      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ADMIN_PASSWORD: "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH."
      });

      // Act
      const result = await authService.verifyPassword("production123");

      // Assert
      expect(result).toBe(true);
      expect(bcryptMock.compare).toHaveBeenCalledWith("production123", "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH.");
    });
  });

  describe("TEST_ADMIN_PASSWORD in Non-Production", () => {
    it("should authenticate with TEST_ADMIN_PASSWORD", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should reject wrong TEST_ADMIN_PASSWORD without fallback", async () => {
      // Arrange
      bcryptMock.compare.mockResolvedValue(true);

      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "test123",
        ADMIN_PASSWORD: "$2a$10$hashedpassword"
      });

      // Act
      const result = await authService.verifyPassword("wrongpassword");

      // Assert - No fallback in non-prod
      expect(result).toBe(false);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should handle TEST_ADMIN_PASSWORD with trimming", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "  test123  "
      });

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when TEST_ADMIN_PASSWORD is not configured", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: undefined
      });

      // Act
      const result = await authService.verifyPassword("anypassword");

      // Assert
      expect(result).toBe(false);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should handle empty string TEST_ADMIN_PASSWORD", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: ""
      });

      // Act
      const result = await authService.verifyPassword("anypassword");

      // Assert - Empty string means no password configured
      expect(result).toBe(false);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });
  });

  describe("ADMIN_PASSWORD in Production", () => {
    it("should use bcrypt in production", async () => {
      // Arrange
      bcryptMock.compare.mockResolvedValue(true);

      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ADMIN_PASSWORD: "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH."
      });

      // Act
      const result = await authService.verifyPassword("password123");

      // Assert
      expect(result).toBe(true);
      expect(bcryptMock.compare).toHaveBeenCalledWith("password123", "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH.");
    });

    it("should return false when bcrypt comparison fails", async () => {
      // Arrange
      bcryptMock.compare.mockResolvedValue(false);

      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ADMIN_PASSWORD: "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH."
      });

      // Act
      const result = await authService.verifyPassword("wrongpassword");

      // Assert
      expect(result).toBe(false);
      expect(bcryptMock.compare).toHaveBeenCalledWith("wrongpassword", "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH.");
    });

    it("should validate bcrypt hash format", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ADMIN_PASSWORD: "not-a-bcrypt-hash"
      });

      // Act
      const result = await authService.verifyPassword("password");

      // Assert - Invalid hash format
      expect(result).toBe(false);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should handle bcrypt comparison errors", async () => {
      // Arrange
      bcryptMock.compare.mockRejectedValue(new Error("Bcrypt error"));

      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ADMIN_PASSWORD: "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH."
      });

      // Act
      const result = await authService.verifyPassword("password");

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when ADMIN_PASSWORD is not configured", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ADMIN_PASSWORD: undefined
      });

      // Act
      const result = await authService.verifyPassword("password");

      // Assert
      expect(result).toBe(false);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should return false for null password", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword(null);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for undefined password", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword(undefined);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for empty string password", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword("");

      // Assert
      expect(result).toBe(false);
    });

    it("should throw when initialization fails", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "test123",
        ADMIN_SECRET: undefined // This will cause initialization to fail
      });

      // Act & Assert
      await expect(authService.verifyPassword("test123")).rejects.toThrow("ADMIN_SECRET not configured");
    });
  });

  describe("Security Considerations", () => {
    it("should handle passwords with special characters", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "p@$$w0rd!<>&"
      });

      // Act
      const result = await authService.verifyPassword("p@$$w0rd!<>&");

      // Assert
      expect(result).toBe(true);
    });

    it("should handle very long passwords", async () => {
      // Arrange
      const longPassword = "a".repeat(200);
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: longPassword
      });

      // Act
      const result = await authService.verifyPassword(longPassword);

      // Assert
      expect(result).toBe(true);
    });

    it("should be case-sensitive", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "TestPassword"
      });

      // Act
      const result1 = await authService.verifyPassword("testpassword");
      const result2 = await authService.verifyPassword("TestPassword");

      // Assert
      expect(result1).toBe(false);
      expect(result2).toBe(true);
    });

    it("should handle whitespace-only passwords", async () => {
      // Arrange
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "   " // Only spaces
      });

      // Act
      const result = await authService.verifyPassword("   ");

      // Assert - Both are trimmed to empty, so they match (both empty)
      expect(result).toBe(true);
    });
  });

  describe("Mixed Environment Scenarios", () => {
    it("should handle Vercel preview environment correctly", async () => {
      // Arrange - Vercel preview is non-production
      bcryptMock.compare.mockResolvedValue(true);

      const authService = await createAuthServiceWithEnv({
        VERCEL_ENV: "preview",
        NODE_ENV: "production", // This should be overridden
        TEST_ADMIN_PASSWORD: "preview123",
        ADMIN_PASSWORD: "$2a$10$hash"
      });

      // Act
      const result = await authService.verifyPassword("preview123");

      // Assert - Should use TEST_ADMIN_PASSWORD
      expect(result).toBe(true);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it("should require both NODE_ENV and VERCEL_ENV for production", async () => {
      // Arrange - Only NODE_ENV=production is not enough
      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: undefined, // Missing VERCEL_ENV
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert - Should still be non-production
      expect(result).toBe(true);
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });
  });

  describe("CI-Specific Test Cases", () => {
    it("should handle production environment detection in CI", async () => {
      // Arrange
      bcryptMock.compare.mockResolvedValue(true);

      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        CI: "true", // This should not affect production detection
        ADMIN_PASSWORD: "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH."
      });

      // Act
      const result = await authService.verifyPassword("password123");

      // Assert - Should still use production bcrypt even in CI
      expect(result).toBe(true);
      expect(bcryptMock.compare).toHaveBeenCalledWith("password123", "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH.");
    });

    it("should handle bcrypt mock verification correctly", async () => {
      // Arrange
      bcryptMock.compare.mockImplementation((password, hash) => {
        // Simulate actual bcrypt behavior
        return Promise.resolve(password === "correct" && hash.startsWith("$2b$"));
      });

      const authService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ADMIN_PASSWORD: "$2b$10$N9qo8uLOickgx2ZMRZoMye.YjZyGqI6nw/mDIHG/J7QXUY7nJlxH."
      });

      // Act
      const correctResult = await authService.verifyPassword("correct");
      const wrongResult = await authService.verifyPassword("wrong");

      // Assert
      expect(correctResult).toBe(true);
      expect(wrongResult).toBe(false);
      expect(bcryptMock.compare).toHaveBeenCalledTimes(2);
    });

    it("should isolate modules between test runs", async () => {
      // This test verifies that module isolation is working
      // First create service with test environment
      const testService = await createAuthServiceWithEnv({
        NODE_ENV: "test",
        TEST_ADMIN_PASSWORD: "test123"
      });

      // Verify test environment works
      const testResult = await testService.verifyPassword("test123");
      expect(testResult).toBe(true);

      // Reset modules and create production service
      vi.resetModules();
      bcryptMock.compare.mockResolvedValue(true);
      vi.doMock("bcryptjs", () => ({ default: bcryptMock }));

      const prodService = await createAuthServiceWithEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        ADMIN_PASSWORD: "$2b$10$hash"
      });

      // Verify production environment works independently
      const prodResult = await prodService.verifyPassword("password");
      expect(prodResult).toBe(true);
      expect(bcryptMock.compare).toHaveBeenCalledWith("password", "$2b$10$hash");
    });
  });
});