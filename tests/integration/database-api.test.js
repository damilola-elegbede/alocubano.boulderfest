import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMocks } from "node-mocks-http";
import testDbHandler from "../../api/test-db.js";

// Create persistent mock for email subscriber service
const mockEmailSubscriberService = {
  getSubscriberStats: vi.fn(),
};

// Create mock for database service
const mockDatabase = {
  execute: vi.fn(),
};

// Mock the email subscriber service module
vi.mock("../../api/lib/email-subscriber-service.js", () => ({
  getEmailSubscriberService: vi.fn(() => mockEmailSubscriberService),
}));

// Mock the database module
vi.mock("../../api/lib/database.js", () => ({
  getDatabase: vi.fn(() => mockDatabase),
}));

describe("Database API Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up environment variables for tests
    process.env.NODE_ENV = "test";
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = "test://database.url";
    process.env.BREVO_API_KEY = "test-api-key";
    process.env.TURSO_DATABASE_URL = "file:test.db";
    process.env.TURSO_AUTH_TOKEN = "test-token";

    // Mock successful service response by default
    mockEmailSubscriberService.getSubscriberStats.mockResolvedValue({
      total: 1250,
      active: 1100,
      pending: 50,
      unsubscribed: 75,
      bounced: 25,
    });

    // Mock database responses for the new dynamic queries
    mockDatabase.execute.mockImplementation((sql) => {
      if (sql.includes("sqlite_master")) {
        // Return mock table list
        return Promise.resolve({
          rows: [
            { name: "email_subscribers" },
            { name: "email_events" },
            { name: "email_audit_log" },
          ],
        });
      } else if (sql.includes("table_info")) {
        // Return mock column info including all expected subscriber table columns
        return Promise.resolve({
          rows: [
            { name: "id" },
            { name: "email" },
            { name: "status" },
            { name: "created_at" },
            { name: "updated_at" }, // Add updated_at column that test expects
          ],
        });
      } else if (sql.includes("index_list")) {
        // Return mock index info
        return Promise.resolve({
          rows: [{ name: "email_idx" }, { name: "created_at_idx" }],
        });
      } else if (sql.includes("COUNT(*)")) {
        // Return mock row count
        return Promise.resolve({
          rows: [{ count: 42 }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.DATABASE_URL;
    delete process.env.BREVO_API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
  });

  describe("HTTP Method Handling", () => {
    it("should handle OPTIONS request (CORS preflight)", async () => {
      const { req, res } = createMocks({
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000", // Valid origin for preflight
        },
      });

      await testDbHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getHeaders()).toMatchObject({
        "access-control-allow-origin": "http://localhost:3000", // Now matches specific origin
        "access-control-allow-methods": "GET, OPTIONS", // Updated to match security fix
        "access-control-allow-headers": "Content-Type, Authorization",
      });
    });

    it("should reject non-GET methods", async () => {
      const { req, res } = createMocks({
        method: "POST",
      });

      await testDbHandler(req, res);

      expect(res._getStatusCode()).toBe(405);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Method not allowed");
      expect(responseData.message).toBe(
        "Only GET requests are supported for database testing",
      );
    });

    it("should reject PUT method", async () => {
      const { req, res } = createMocks({
        method: "PUT",
      });

      await testDbHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject DELETE method", async () => {
      const { req, res } = createMocks({
        method: "DELETE",
      });

      await testDbHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  describe("Successful Database Tests", () => {
    it("should return 200 when all tests pass", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData.status).toBe("healthy");
      expect(responseData.summary.passed).toBe(4);
      expect(responseData.summary.failed).toBe(0);
      expect(responseData.summary.successRate).toBe("100%");
    });

    it("should have correct response structure", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      // Check top-level structure
      expect(responseData).toHaveProperty("timestamp");
      expect(responseData).toHaveProperty("status");
      expect(responseData).toHaveProperty("tests");
      expect(responseData).toHaveProperty("summary");
      expect(responseData).toHaveProperty("duration");

      // Check timestamp is ISO string
      expect(new Date(responseData.timestamp).toISOString()).toBe(
        responseData.timestamp,
      );

      // Check duration format
      expect(responseData.duration).toMatch(/^\d+ms$/);

      // Check tests structure
      expect(responseData.tests).toHaveProperty("connection");
      expect(responseData.tests).toHaveProperty("tables");
      expect(responseData.tests).toHaveProperty("migrations");
      expect(responseData.tests).toHaveProperty("configuration");

      // Check each test has required properties
      Object.keys(responseData.tests).forEach((testName) => {
        expect(responseData.tests[testName]).toHaveProperty("status");
        expect(responseData.tests[testName]).toHaveProperty("error");
      });

      // Check summary structure
      expect(responseData.summary).toHaveProperty("totalTests");
      expect(responseData.summary).toHaveProperty("passed");
      expect(responseData.summary).toHaveProperty("failed");
      expect(responseData.summary).toHaveProperty("errors");
      expect(responseData.summary).toHaveProperty("successRate");

      expect(responseData.summary.totalTests).toBe(4);
      expect(Array.isArray(responseData.summary.errors)).toBe(true);
    });

    it("should test database connection successfully", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.connection.status).toBe("passed");
      expect(responseData.tests.connection.error).toBeNull();

      expect(mockEmailSubscriberService.getSubscriberStats).toHaveBeenCalled();
    });

    it("should include table information", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.tables.status).toBe("passed");
      expect(responseData.tests.tables.error).toBeNull();
      expect(responseData.tests.tables.data).toBeDefined();

      const tableData = responseData.tests.tables.data;

      // Check expected tables exist
      expect(tableData).toHaveProperty("email_subscribers");
      expect(tableData).toHaveProperty("email_events");
      expect(tableData).toHaveProperty("email_audit_log");

      // Check table structure
      expect(tableData.email_subscribers).toHaveProperty("columns");
      expect(tableData.email_subscribers).toHaveProperty("indexes");
      expect(tableData.email_subscribers).toHaveProperty("rowCount");

      // Check expected columns exist
      const subscriberColumns = tableData.email_subscribers.columns;
      expect(subscriberColumns).toContain("id");
      expect(subscriberColumns).toContain("email");
      expect(subscriberColumns).toContain("status");
      expect(subscriberColumns).toContain("created_at");
      expect(subscriberColumns).toContain("updated_at");
    });

    it("should include migration status", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.migrations.status).toBe("passed");
      expect(responseData.tests.migrations.error).toBeNull();
      expect(responseData.tests.migrations.data).toBeDefined();

      const migrationData = responseData.tests.migrations.data;

      expect(migrationData).toHaveProperty("applied");
      expect(migrationData).toHaveProperty("pending");
      expect(migrationData).toHaveProperty("lastMigration");
      expect(migrationData).toHaveProperty("migrationDate");
      expect(migrationData).toHaveProperty("status");

      expect(Array.isArray(migrationData.applied)).toBe(true);
      expect(Array.isArray(migrationData.pending)).toBe(true);
      // Migration status should be a valid status (dynamic based on actual database state)
      expect(["up_to_date", "pending_migrations", "not_initialized"]).toContain(
        migrationData.status,
      );

      // Migration data should have valid structure (content is dynamic based on actual files)
      if (migrationData.applied.length > 0) {
        // If there are applied migrations, check they have valid format
        expect(
          migrationData.applied.every((name) => typeof name === "string"),
        ).toBe(true);
      }

      if (migrationData.pending.length > 0) {
        // If there are pending migrations, check they have valid format
        expect(
          migrationData.pending.every((name) => typeof name === "string"),
        ).toBe(true);
      }
    });

    it("should include database configuration", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.configuration.status).toBe("passed");
      expect(responseData.tests.configuration.error).toBeNull();
      expect(responseData.tests.configuration.data).toBeDefined();

      const configData = responseData.tests.configuration.data;

      expect(configData).toHaveProperty("type");
      expect(configData).toHaveProperty("version");
      expect(configData).toHaveProperty("environment");
      expect(configData).toHaveProperty("features");
      expect(configData).toHaveProperty("environmentVariables");

      // Check environment variables reporting
      const envVars = configData.environmentVariables;
      expect(envVars).toHaveProperty("NODE_ENV");
      expect(envVars).toHaveProperty("VERCEL_ENV");
      expect(envVars).toHaveProperty("DATABASE_URL");
      expect(envVars).toHaveProperty("BREVO_API_KEY");

      // Environment variables should show configured status, not actual values
      expect(envVars.DATABASE_URL).toBe("configured");
      expect(envVars.BREVO_API_KEY).toBe("configured");

      // Check features object
      expect(configData.features).toHaveProperty("transactions");
      expect(configData.features).toHaveProperty("foreignKeys");
      expect(configData.features).toHaveProperty("fullTextSearch");
      expect(configData.features).toHaveProperty("jsonSupport");
    });
  });

  describe("Database Connection Failures", () => {
    it("should return 207 (Multi-Status) when connection test fails but others pass", async () => {
      // Mock connection failure
      mockEmailSubscriberService.getSubscriberStats.mockRejectedValue(
        new Error("Database connection failed"),
      );

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      expect(res._getStatusCode()).toBe(207); // Multi-Status: partial success

      const responseData = JSON.parse(res._getData());
      expect(responseData.status).toBe("degraded");
      expect(responseData.summary.passed).toBe(3);
      expect(responseData.summary.failed).toBe(1);
      expect(responseData.summary.successRate).toBe("75%");
    });

    it("should handle invalid stats response structure", async () => {
      // Mock invalid response
      mockEmailSubscriberService.getSubscriberStats.mockResolvedValue({
        // Missing required 'total' property
        active: 100,
      });

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.connection.status).toBe("failed");
      expect(responseData.tests.connection.error).toBe(
        "Invalid stats response structure",
      );
      expect(responseData.summary.errors).toContain(
        "Connection: Invalid stats response structure",
      );
    });

    it("should handle service instantiation errors", async () => {
      // Mock service method not existing (simulates instantiation failure)
      mockEmailSubscriberService.getSubscriberStats.mockRejectedValue(
        new Error("Service not available"),
      );

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.connection.status).toBe("failed");
      expect(responseData.tests.connection.error).toBe("Service not available");
    });

    it("should return 500 when critical error occurs in handler", async () => {
      // Mock console.log to throw early in the process
      const originalConsoleLog = console.log;
      let callCount = 0;
      console.log = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First console.log call
          throw new Error("Critical system failure");
        }
      });

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      // Restore console.log
      console.log = originalConsoleLog;

      expect(res._getStatusCode()).toBe(500);

      const responseData = JSON.parse(res._getData());
      expect(responseData.status).toBe("error");
      expect(responseData.error).toBeDefined();
      expect(responseData.error.message).toBe("Critical system failure");
      expect(responseData.summary.passed).toBe(0);
      expect(responseData.summary.failed).toBe(4);
      expect(responseData.summary.successRate).toBe("0%");
    });
  });

  describe("Environment Variable Handling", () => {
    it("should handle missing environment variables", async () => {
      // Remove environment variables
      delete process.env.DATABASE_URL;
      delete process.env.BREVO_API_KEY;
      delete process.env.NODE_ENV;
      delete process.env.VERCEL_ENV;

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      const envVars =
        responseData.tests.configuration.data.environmentVariables;
      expect(envVars.DATABASE_URL).toBe("not_configured");
      expect(envVars.BREVO_API_KEY).toBe("not_configured");
      expect(envVars.NODE_ENV).toBe("not_set");
      expect(envVars.VERCEL_ENV).toBe("not_set");
    });

    it("should show development mode configuration", async () => {
      process.env.NODE_ENV = "development";

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.configuration.data.environment).toBe(
        "development",
      );
      expect(
        responseData.tests.configuration.data.environmentVariables.NODE_ENV,
      ).toBe("development");
    });

    it("should show production mode configuration", async () => {
      process.env.NODE_ENV = "production";
      process.env.VERCEL_ENV = "production";

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.configuration.data.environment).toBe(
        "production",
      );
      // In production, environment variables are hidden for security
      expect(
        responseData.tests.configuration.data.environmentVariables.status,
      ).toBe("configuration_hidden_in_production");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle unexpected errors during test execution", async () => {
      // Mock console.log to throw an error (simulates logging failure)
      const originalConsoleLog = console.log;
      console.log = vi.fn(() => {
        throw new Error("Logging system failure");
      });

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      // Restore console.log
      console.log = originalConsoleLog;

      expect(res._getStatusCode()).toBe(500);

      const responseData = JSON.parse(res._getData());
      expect(responseData.status).toBe("error");
      expect(responseData.error.message).toBe("Logging system failure");
    });

    it("should include stack trace in development mode", async () => {
      process.env.NODE_ENV = "development";

      // Mock console.log to throw early to trigger the error handler
      const originalConsoleLog = console.log;
      console.log = vi.fn(() => {
        const error = new Error("Test error for stack trace");
        error.stack =
          "Error: Test error for stack trace\n    at test.js:1:1\n    at handler.js:2:2";
        throw error;
      });

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      // Restore console.log
      console.log = originalConsoleLog;

      const responseData = JSON.parse(res._getData());
      expect(responseData.error.stack).toBeDefined();
      expect(responseData.error.stack).toContain(
        "Error: Test error for stack trace",
      );
    });

    it("should not include stack trace in production mode", async () => {
      process.env.NODE_ENV = "production";

      // Mock console.log to throw early to trigger the error handler
      const originalConsoleLog = console.log;
      console.log = vi.fn(() => {
        const error = new Error("Test error for production");
        error.stack =
          "Error: Test error for production\n    at test.js:1:1\n    at handler.js:2:2";
        throw error;
      });

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      // Restore console.log
      console.log = originalConsoleLog;

      const responseData = JSON.parse(res._getData());
      expect(responseData.error.stack).toBeUndefined();
    });

    it("should measure and report execution time", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      const startTime = Date.now();
      await testDbHandler(req, res);
      const endTime = Date.now();
      const actualDuration = endTime - startTime;

      const responseData = JSON.parse(res._getData());

      expect(responseData.duration).toMatch(/^\d+ms$/);

      const reportedDuration = parseInt(
        responseData.duration.replace("ms", ""),
      );
      // Allow for some timing variance (within 100ms)
      expect(reportedDuration).toBeCloseTo(actualDuration, -2);
    });

    it("should handle partial failures correctly", async () => {
      // Mock connection to succeed but return null stats (edge case)
      mockEmailSubscriberService.getSubscriberStats.mockResolvedValue(null);

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());

      expect(responseData.tests.connection.status).toBe("failed");
      expect(responseData.tests.connection.error).toBe(
        "Invalid stats response structure",
      );

      // Other tests should still pass
      expect(responseData.tests.tables.status).toBe("passed");
      expect(responseData.tests.migrations.status).toBe("passed");
      expect(responseData.tests.configuration.status).toBe("passed");

      expect(responseData.summary.passed).toBe(3);
      expect(responseData.summary.failed).toBe(1);
    });
  });

  describe("CORS Headers", () => {
    it("should set correct CORS headers for GET requests", async () => {
      const { req, res } = createMocks({
        method: "GET",
        headers: {
          origin: "http://localhost:3000", // Valid origin
        },
      });

      await testDbHandler(req, res);

      expect(res._getHeaders()).toMatchObject({
        "access-control-allow-origin": "http://localhost:3000", // Now matches specific origin
        "access-control-allow-methods": "GET, OPTIONS", // Updated to match security fix
        "access-control-allow-headers": "Content-Type, Authorization",
      });
    });

    it("should set correct CORS headers for error responses", async () => {
      const { req, res } = createMocks({
        method: "POST",
        headers: {
          origin: "http://localhost:3000", // Valid origin
        },
      });

      await testDbHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getHeaders()).toMatchObject({
        "access-control-allow-origin": "http://localhost:3000", // Now matches specific origin
        "access-control-allow-methods": "GET, OPTIONS", // Updated to match security fix
        "access-control-allow-headers": "Content-Type, Authorization",
      });
    });
  });

  describe("Performance and Resource Management", () => {
    it("should complete within reasonable time limits", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      const startTime = Date.now();
      await testDbHandler(req, res);
      const duration = Date.now() - startTime;

      // Should complete within 5 seconds (generous limit for CI environments)
      expect(duration).toBeLessThan(5000);
    });

    it("should handle concurrent requests properly", async () => {
      const requests = Array(3)
        .fill()
        .map(() => {
          const { req, res } = createMocks({
            method: "GET",
          });
          return testDbHandler(req, res);
        });

      const results = await Promise.all(requests);

      // All requests should complete successfully
      expect(results).toHaveLength(3);
    });
  });

  describe("Response Content Validation", () => {
    it("should return valid JSON", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseText = res._getData();
      expect(() => JSON.parse(responseText)).not.toThrow();
    });

    it("should not expose sensitive information", async () => {
      // Set actual secret values in environment
      process.env.BREVO_API_KEY = "sk-123456789abcdef";
      process.env.DATABASE_URL = "postgres://user:password@host:5432/db";

      const { req, res } = createMocks({
        method: "GET",
      });

      await testDbHandler(req, res);

      const responseData = JSON.parse(res._getData());
      const responseText = JSON.stringify(responseData);

      // Should not contain actual sensitive values
      expect(responseText).not.toContain("sk-123456789abcdef");
      expect(responseText).not.toContain("password");
      expect(responseText).not.toContain("postgres://user:password");

      // Should contain only status indicators
      expect(
        responseData.tests.configuration.data.environmentVariables
          .BREVO_API_KEY,
      ).toBe("configured");
      expect(
        responseData.tests.configuration.data.environmentVariables.DATABASE_URL,
      ).toBe("configured");
    });
  });
});
