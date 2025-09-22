/**
 * Brevo Service Unit Tests
 * Tests the Brevo service initialization and API key validation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BrevoService, resetBrevoService } from "../../../lib/brevo-service.js";

describe("Brevo Service", () => {
  // Store original environment variables for restoration
  let originalEnv = {};

  beforeEach(() => {
    // Reset service singleton before each test
    resetBrevoService();

    // Capture current environment state for restoration
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      BREVO_API_KEY: process.env.BREVO_API_KEY,
      E2E_TEST_MODE: process.env.E2E_TEST_MODE
    };
  });

  afterEach(() => {
    // CRITICAL: Restore original environment variables after each test
    // to prevent environment pollution affecting other tests
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });

    // Reset service singleton again after environment restoration
    resetBrevoService();
  });

  describe("Initialization", () => {
    it("should fail immediately when BREVO_API_KEY is missing", () => {
      // Set NODE_ENV to non-test value to bypass test mode
      process.env.NODE_ENV = 'not-test';

      // Remove API key
      delete process.env.BREVO_API_KEY;

      // Expect constructor to throw immediately
      expect(() => {
        new BrevoService();
      }).toThrow("BREVO_API_KEY environment variable is required and cannot be empty");
    });

    it("should fail immediately when BREVO_API_KEY is empty string", () => {
      // Set NODE_ENV to non-test value to bypass test mode
      process.env.NODE_ENV = 'not-test';

      // Set empty API key
      process.env.BREVO_API_KEY = "";

      // Expect constructor to throw immediately
      expect(() => {
        new BrevoService();
      }).toThrow("BREVO_API_KEY environment variable is required and cannot be empty");
    });

    it("should initialize successfully when BREVO_API_KEY is provided", () => {
      // Set valid API key
      process.env.BREVO_API_KEY = "test-api-key-12345";

      // Should not throw
      const service = new BrevoService();
      expect(service).toBeDefined();
      expect(service.apiKey).toBe("test-api-key-12345");
      expect(service.baseUrl).toBe("https://api.brevo.com/v3");
    });

    it("should log fatal error message when API key is missing", () => {
      // Save original console.error
      const originalConsoleError = console.error;
      const logMessages = [];

      try {
        // Mock console.error to capture log messages
        console.error = (message) => {
          logMessages.push(message);
        };

        // Set NODE_ENV to non-test value to bypass test mode
        process.env.NODE_ENV = 'not-test';

        // Remove API key
        delete process.env.BREVO_API_KEY;

        // Try to create service (should throw)
        expect(() => {
          new BrevoService();
        }).toThrow();

        // Verify fatal error was logged
        expect(logMessages).toContain("❌ FATAL: BREVO_API_KEY secret not configured");
      } finally {
        // Restore original console.error
        console.error = originalConsoleError;
      }
    });

    it("should have no test mode or fallback behavior", () => {
      // Set NODE_ENV to non-test value to ensure no test mode
      process.env.NODE_ENV = 'not-test';
      process.env.E2E_TEST_MODE = 'false';

      // Remove API key
      delete process.env.BREVO_API_KEY;

      // Should still fail - no fallback behavior
      expect(() => {
        new BrevoService();
      }).toThrow("BREVO_API_KEY environment variable is required and cannot be empty");
    });
  });
});