/**
 * Auth Service Password Verification Unit Tests
 * Tests password verification fallback logic, environment detection, and error handling
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
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe("Environment Detection", () => {
    it("should detect test environment when NODE_ENV is test", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "test123";
      delete process.env.ADMIN_PASSWORD;

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should detect test environment when E2E_TEST_MODE is true", async () => {
      // Arrange
      process.env.E2E_TEST_MODE = "true";
      process.env.TEST_ADMIN_PASSWORD = "e2e123";
      delete process.env.ADMIN_PASSWORD;

      // Act
      const result = await authService.verifyPassword("e2e123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should detect test environment when CI is true", async () => {
      // Arrange
      process.env.CI = "true";
      process.env.TEST_ADMIN_PASSWORD = "ci123";
      delete process.env.ADMIN_PASSWORD;

      // Act
      const result = await authService.verifyPassword("ci123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should detect test environment when VERCEL_ENV is preview", async () => {
      // Arrange
      process.env.VERCEL_ENV = "preview";
      process.env.TEST_ADMIN_PASSWORD = "preview123";
      delete process.env.ADMIN_PASSWORD;

      // Act
      const result = await authService.verifyPassword("preview123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should use production environment detection when none of the test flags are set", async () => {
      // Arrange
      delete process.env.NODE_ENV;
      delete process.env.E2E_TEST_MODE;
      delete process.env.CI;
      delete process.env.VERCEL_ENV;
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

  describe("TEST_ADMIN_PASSWORD Functionality", () => {
    beforeEach(() => {
      // Set test environment
      process.env.NODE_ENV = "test";
    });

    it("should authenticate with TEST_ADMIN_PASSWORD in test environment", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "test123";
      delete process.env.ADMIN_PASSWORD;

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should reject wrong TEST_ADMIN_PASSWORD but fallback to bcrypt", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "test123";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await authService.verifyPassword("wrongpassword");

      // Assert
      expect(result).toBe(true); // Should pass due to bcrypt fallback
      expect(bcrypt.compare).toHaveBeenCalledWith("wrongpassword", "$2a$10$hashedpassword");
    });

    it("should handle case where TEST_ADMIN_PASSWORD matches", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "test123";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled(); // Should not fallback to bcrypt
    });

    it("should work when TEST_ADMIN_PASSWORD is empty string", async () => {
      // Arrange
      process.env.TEST_ADMIN_PASSWORD = "";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await authService.verifyPassword("anypassword");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith("anypassword", "$2a$10$hashedpassword");
    });
  });

  describe("Bcrypt ADMIN_PASSWORD Fallback", () => {
    it("should use bcrypt when TEST_ADMIN_PASSWORD doesn't match", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "test123";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await authService.verifyPassword("differentpassword");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith("differentpassword", "$2a$10$hashedpassword");
    });

    it("should use bcrypt in production environment", async () => {
      // Arrange
      delete process.env.NODE_ENV;
      delete process.env.E2E_TEST_MODE;
      delete process.env.CI;
      delete process.env.VERCEL_ENV;
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(true);

      // Act
      const result = await authService.verifyPassword("prodpassword");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith("prodpassword", "$2a$10$hashedpassword");
    });

    it("should return false when bcrypt comparison fails", async () => {
      // Arrange
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(false);

      // Act
      const result = await authService.verifyPassword("wrongpassword");

      // Assert
      expect(result).toBe(false);
      expect(bcrypt.compare).toHaveBeenCalledWith("wrongpassword", "$2a$10$hashedpassword");
    });
  });

  describe("Error Handling", () => {
    it("should handle bcrypt comparison errors gracefully", async () => {
      // Arrange
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      const bcryptError = new Error("Bcrypt comparison failed");
      bcrypt.compare.mockRejectedValue(bcryptError);
      
      const originalConsoleError = console.error;
      const errorMessages = [];
      console.error = (...args) => errorMessages.push(args.join(' '));

      try {
        // Act
        const result = await authService.verifyPassword("anypassword");

        // Assert
        expect(result).toBe(false);
        expect(bcrypt.compare).toHaveBeenCalledWith("anypassword", "$2a$10$hashedpassword");
        expect(errorMessages.some(msg => msg.includes("Bcrypt comparison error:") && msg.includes("Bcrypt comparison failed"))).toBe(true);
      } finally {
        console.error = originalConsoleError;
      }
    });

    it("should handle general password verification errors", async () => {
      // Arrange
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      
      // Force an error by causing bcrypt.compare to throw during execution
      bcrypt.compare.mockImplementation(() => {
        throw new Error("Unexpected error");
      });
      
      const originalConsoleError = console.error;
      const errorMessages = [];
      console.error = (...args) => errorMessages.push(args.join(' '));

      try {
        // Act
        const result = await authService.verifyPassword("anypassword");

        // Assert
        expect(result).toBe(false);
        // The error should be caught by the bcrypt error handling, not general error handling
        expect(errorMessages.some(msg => msg.includes("Bcrypt comparison error:"))).toBe(true);
      } finally {
        console.error = originalConsoleError;
      }
    });

    it("should return false when neither password is configured", async () => {
      // Arrange
      delete process.env.TEST_ADMIN_PASSWORD;
      delete process.env.ADMIN_PASSWORD;
      
      const originalConsoleError = console.error;
      const errorMessages = [];
      console.error = (...args) => errorMessages.push(args.join(' '));

      try {
        // Act
        const result = await authService.verifyPassword("anypassword");

        // Assert
        expect(result).toBe(false);
        expect(bcrypt.compare).not.toHaveBeenCalled();
        expect(errorMessages.some(msg => msg.includes("No admin password configured"))).toBe(true);
      } finally {
        console.error = originalConsoleError;
      }
    });

    it("should return false for invalid input types", async () => {
      // Arrange
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";

      // Act & Assert
      expect(await authService.verifyPassword(null)).toBe(false);
      expect(await authService.verifyPassword(undefined)).toBe(false);
      expect(await authService.verifyPassword(123)).toBe(false);
      expect(await authService.verifyPassword({})).toBe(false);
      expect(await authService.verifyPassword([])).toBe(false);
      expect(await authService.verifyPassword("")).toBe(false);

      // Ensure bcrypt was not called for invalid inputs
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle test environment with both passwords configured", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "test123";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";

      // Act - Test password matches
      const testResult = await authService.verifyPassword("test123");
      expect(testResult).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();

      // Reset mock
      vi.clearAllMocks();
      bcrypt.compare.mockResolvedValue(true);

      // Act - Different password, should fallback to bcrypt
      const fallbackResult = await authService.verifyPassword("prod123");
      expect(fallbackResult).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith("prod123", "$2a$10$hashedpassword");
    });

    it("should handle multiple environment variables set simultaneously", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.E2E_TEST_MODE = "true";
      process.env.CI = "true";
      process.env.VERCEL_ENV = "preview";
      process.env.TEST_ADMIN_PASSWORD = "multi123";

      // Act
      const result = await authService.verifyPassword("multi123");

      // Assert
      expect(result).toBe(true);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should handle bcrypt fallback failure when TEST_ADMIN_PASSWORD doesn't match", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "test123";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(false);

      // Act
      const result = await authService.verifyPassword("wrongpassword");

      // Assert
      expect(result).toBe(false);
      expect(bcrypt.compare).toHaveBeenCalledWith("wrongpassword", "$2a$10$hashedpassword");
    });

    it("should ensure service initialization before password verification", async () => {
      // Arrange
      const uninitializedService = new AuthService();
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await uninitializedService.verifyPassword("test123");

      // Assert
      expect(result).toBe(true);
      expect(uninitializedService.initialized).toBe(true);
    });

    it("should handle service initialization failure", async () => {
      // Arrange
      const originalSecret = process.env.ADMIN_SECRET;
      delete process.env.ADMIN_SECRET;
      
      try {
        const failingService = new AuthService();

        // Act & Assert
        await expect(failingService.verifyPassword("anypassword")).rejects.toThrow("❌ FATAL: ADMIN_SECRET not configured");
      } finally {
        // Restore for other tests
        process.env.ADMIN_SECRET = originalSecret;
      }
    });
  });

  describe("Security Considerations", () => {
    it("should not log passwords in error messages", async () => {
      // Arrange
      delete process.env.TEST_ADMIN_PASSWORD;
      delete process.env.ADMIN_PASSWORD;
      
      const originalConsoleError = console.error;
      const errorMessages = [];
      console.error = (...args) => errorMessages.push(args.join(' '));

      try {
        // Act
        await authService.verifyPassword("sensitivepassword");

        // Assert - ensure password is not logged
        const allMessages = errorMessages.join(" ");
        expect(allMessages).not.toContain("sensitivepassword");
      } finally {
        console.error = originalConsoleError;
      }
    });

    it("should treat empty string password as invalid", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "test123";

      // Act
      const result = await authService.verifyPassword("");

      // Assert
      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it("should handle whitespace-only passwords", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "test123";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(false);

      // Act
      const result = await authService.verifyPassword("   ");

      // Assert
      expect(result).toBe(false);
      // Whitespace passwords don't match TEST_ADMIN_PASSWORD, so they fall back to bcrypt
      expect(bcrypt.compare).toHaveBeenCalledWith("   ", "$2a$10$hashedpassword");
    });

    it("should be case-sensitive for TEST_ADMIN_PASSWORD", async () => {
      // Arrange
      process.env.NODE_ENV = "test";
      process.env.TEST_ADMIN_PASSWORD = "Test123";
      process.env.ADMIN_PASSWORD = "$2a$10$hashedpassword";
      bcrypt.compare.mockResolvedValue(false);

      // Act
      const result = await authService.verifyPassword("test123");

      // Assert
      expect(result).toBe(false); // Should not match due to case sensitivity
      expect(bcrypt.compare).toHaveBeenCalledWith("test123", "$2a$10$hashedpassword");
    });
  });
});