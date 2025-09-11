/**
 * Auth Service Password Verification Unit Tests
 * Tests password verification logic for production vs non-production environments
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { AuthService } from "../../../lib/auth-service.js";

// Mock bcrypt
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn()
  }
}));

describe("AuthService Password Verification", () => {
  let authService;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set required ADMIN_SECRET for initialization
    process.env.ADMIN_SECRET = "test-admin-secret-that-is-long-enough-for-validation";
    
    // Create fresh service instance
    authService = new AuthService();
    
    // Reset mock
    bcrypt.compare.mockReset();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("Environment Detection", () => {
    it("should detect non-production when VERCEL_ENV is preview", async () => {
      // Arrange
      process.env.VERCEL_ENV = "preview";
      delete process.env.NODE_ENV;
      process.env.TEST_ADMIN_PASSWORD = "test123";
      
      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should detect non-production when NODE_ENV is test", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      delete process.env.VERCEL_ENV;
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should detect non-production when CI is true", async () => {
      // Arrange
      process.env.CI = "true";
      delete process.env.NODE_ENV;
      delete process.env.VERCEL_ENV;
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should detect non-production when E2E_TEST_MODE is true", async () => {
      // Arrange
      process.env.E2E_TEST_MODE = "true";
      delete process.env.NODE_ENV;
      delete process.env.VERCEL_ENV;
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should use production only when both NODE_ENV and VERCEL_ENV are production", async () => {
      // Arrange
      process.env.NODE_ENV = "production";
      process.env.VERCEL_ENV = "production";
      delete process.env.E2E_TEST_MODE;
      delete process.env.CI;
      delete process.env.TEST_ADMIN_PASSWORD;
      
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await authService.verifyPassword("production123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith("production123", "$2a$10$hashedpassword");
    });
  });

  describe("TEST_ADMIN_PASSWORD in Non-Production", () => {
    beforeEach(() => {
      // Set non-production environment
      process.env.NODE_ENV = "test";
    });

    it("should authenticate with TEST_ADMIN_PASSWORD", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "test123";
      delete process.env.ADMIN_PASSWORD;

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should reject wrong TEST_ADMIN_PASSWORD without fallback", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "test123";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword"; // This should be ignored
      bcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await authService.verifyPassword("wrongpassword");

      // Assert - No fallback in non-prod
      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should handle TEST_ADMIN_PASSWORD with trimming", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "  test123  "; // With spaces

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when TEST_ADMIN_PASSWORD is not configured", async () => {
      // Arrange
      delete process.env.TEST_ADMIN_PASSWORD;

      // Act
      const result = await authService.verifyPassword("anypassword");

      // Assert
      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should handle empty string TEST_ADMIN_PASSWORD", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "";

      // Act
      const result = await authService.verifyPassword("anypassword");

      // Assert - Empty string means no password configured
      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe("ADMIN_PASSWORD in Production", () => {
    beforeEach(() => {
      // Set production environment
      process.env.NODE_ENV = "production";
      process.env.VERCEL_ENV = "production";
      delete process.env.CI;
      delete process.env.E2E_TEST_MODE;
    });

    it("should use bcrypt in production", async () => {
      // Arrange
      delete process.env.TEST_ADMIN_PASSWORD;
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await authService.verifyPassword("password123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith("password123", "$2a$10$hashedpassword");
    });

    it("should return false when bcrypt comparison fails", async () => {
      // Arrange
      delete process.env.TEST_ADMIN_PASSWORD;
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(false);

      // Act
      const result = await authService.verifyPassword("wrongpassword");

      // Assert
      expect(result).toBe(false);
      expect(bcrypt.compare).toHaveBeenCalledWith("wrongpassword", "$2a$10$hashedpassword");
    });

    it("should validate bcrypt hash format", async () => {
      // Arrange
      delete process.env.TEST_ADMIN_PASSWORD;
      process.env.ADMIN_PASSWORD = "not-a-bcrypt-hash";

      // Act
      const result = await authService.verifyPassword("password");

      // Assert - Invalid hash format
      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should handle bcrypt comparison errors", async () => {
      // Arrange
      delete process.env.TEST_ADMIN_PASSWORD;
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockRejectedValue(new Error("Bcrypt error"));

      // Act
      const result = await authService.verifyPassword("password");

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when ADMIN_PASSWORD is not configured", async () => {
      // Arrange
      delete process.env.TEST_ADMIN_PASSWORD;
      delete process.env.ADMIN_PASSWORD;

      // Act
      const result = await authService.verifyPassword("password");

      // Assert
      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should return false for null password", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await authService.verifyPassword(null);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for undefined password", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await authService.verifyPassword(undefined);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for empty string password", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await authService.verifyPassword("");

      // Assert
      expect(result).toBe(false);
    });

    it("should throw when initialization fails", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "test123";
      
      // Force an error by deleting ADMIN_SECRET and reinitializing
      delete process.env.ADMIN_SECRET;
      authService.initialized = false;
      authService.initializationPromise = null;

      // Act & Assert - Should throw when service can't initialize
      await expect(authService.verifyPassword("test123")).rejects.toThrow("ADMIN_SECRET not configured");
    });
  });

  describe("Security Considerations", () => {
    it("should handle passwords with special characters", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "p@$$w0rd!<>&";

      // Act
      const result = await authService.verifyPassword("p@$$w0rd!<>&");

      // Assert
      expect(result).toBe(true);
    });

    it("should handle very long passwords", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      const longPassword = "a".repeat(200);
      process.env.TEST_ADMIN_PASSWORD = longPassword;

      // Act
      const result = await authService.verifyPassword(longPassword);

      // Assert
      expect(result).toBe(true);
    });

    it("should be case-sensitive", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "TestPassword";

      // Act
      const result1 = await authService.verifyPassword("testpassword");
      const result2 = await authService.verifyPassword("TestPassword");

      // Assert
      expect(result1).toBe(false);
      expect(result2).toBe(true);
    });

    it("should handle whitespace-only passwords", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "   "; // Only spaces

      // Act
      const result = await authService.verifyPassword("   ");

      // Assert - Both are trimmed to empty, so they match (both empty)
      expect(result).toBe(true);
    });
  });

  describe("Mixed Environment Scenarios", () => {
    it("should handle Vercel preview environment correctly", async () => {
      // Arrange - Vercel preview is non-production
      process.env.VERCEL_ENV = "preview";
      process.env.NODE_ENV = "production"; // This should be overridden
      process.env.TEST_ADMIN_PASSWORD = "preview123";
      process.env.ADMIN_PASSWORD = "$2a$10$hash"; // Should be ignored

      // Act
      const result = await authService.verifyPassword("preview123");

      // Assert - Should use TEST_ADMIN_PASSWORD
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should require both NODE_ENV and VERCEL_ENV for production", async () => {
      // Arrange - Only NODE_ENV=production is not enough
      process.env.NODE_ENV = "production";
      delete process.env.VERCEL_ENV;
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert - Should still be non-production
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });
});