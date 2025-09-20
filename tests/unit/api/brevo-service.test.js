/**
 * Brevo Service Unit Tests
 * Tests the Brevo service initialization and API key validation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BrevoService, resetBrevoService } from "../../../lib/brevo-service.js";

describe("Brevo Service", () => {
  beforeEach(() => {
    // Reset service singleton before each test
    resetBrevoService();
  });

  describe("Initialization", () => {
    it("should fail immediately when BREVO_API_KEY is missing", () => {
      // Save original API key and NODE_ENV
      const originalApiKey = process.env.BREVO_API_KEY;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        // Set NODE_ENV to non-test value to bypass test mode
        process.env.NODE_ENV = 'not-test';

        // Remove API key
        delete process.env.BREVO_API_KEY;

        // Expect constructor to throw immediately
        expect(() => {
          new BrevoService();
        }).toThrow("BREVO_API_KEY environment variable is required and cannot be empty");
      } finally {
        // Restore original API key and NODE_ENV
        if (originalApiKey) {
          process.env.BREVO_API_KEY = originalApiKey;
        }
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("should fail immediately when BREVO_API_KEY is empty string", () => {
      // Save original API key and NODE_ENV
      const originalApiKey = process.env.BREVO_API_KEY;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        // Set NODE_ENV to non-test value to bypass test mode
        process.env.NODE_ENV = 'not-test';

        // Set empty API key
        process.env.BREVO_API_KEY = "";

        // Expect constructor to throw immediately
        expect(() => {
          new BrevoService();
        }).toThrow("BREVO_API_KEY environment variable is required and cannot be empty");
      } finally {
        // Restore original API key and NODE_ENV
        if (originalApiKey) {
          process.env.BREVO_API_KEY = originalApiKey;
        }
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("should initialize successfully when BREVO_API_KEY is provided", () => {
      // Save original API key
      const originalApiKey = process.env.BREVO_API_KEY;

      try {
        // Set valid API key
        process.env.BREVO_API_KEY = "test-api-key-12345";

        // Should not throw
        const service = new BrevoService();
        expect(service).toBeDefined();
        expect(service.apiKey).toBe("test-api-key-12345");
        expect(service.baseUrl).toBe("https://api.brevo.com/v3");
      } finally {
        // Restore original API key
        if (originalApiKey) {
          process.env.BREVO_API_KEY = originalApiKey;
        } else {
          delete process.env.BREVO_API_KEY;
        }
      }
    });

    it("should log fatal error message when API key is missing", () => {
      // Save original API key and console.error
      const originalApiKey = process.env.BREVO_API_KEY;
      const originalConsoleError = console.error;
      const originalNodeEnv = process.env.NODE_ENV;
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
        // Restore original API key, console.error, and NODE_ENV
        console.error = originalConsoleError;
        if (originalApiKey) {
          process.env.BREVO_API_KEY = originalApiKey;
        }
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("should have no test mode or fallback behavior", () => {
      // Save original API key and NODE_ENV
      const originalApiKey = process.env.BREVO_API_KEY;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        // Set NODE_ENV to non-test value to ensure no test mode
        process.env.NODE_ENV = 'not-test';
        process.env.E2E_TEST_MODE = 'false';

        // Remove API key
        delete process.env.BREVO_API_KEY;

        // Should still fail - no fallback behavior
        expect(() => {
          new BrevoService();
        }).toThrow("BREVO_API_KEY environment variable is required and cannot be empty");
      } finally {
        // Restore original API key and NODE_ENV
        if (originalApiKey) {
          process.env.BREVO_API_KEY = originalApiKey;
        }
        process.env.NODE_ENV = originalNodeEnv;
        delete process.env.E2E_TEST_MODE;
      }
    });
  });
});