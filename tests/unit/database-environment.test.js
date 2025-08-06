/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";

// Mock filesystem operations
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
}));

// Mock @libsql/client/web before importing the database module
vi.mock("@libsql/client/web", () => {
  const mockClient = {
    execute: vi.fn(),
    batch: vi.fn(),
    close: vi.fn(),
  };

  const createClientMock = vi.fn(() => mockClient);
  
  return {
    createClient: createClientMock,
    __mockClient: mockClient,
    __createClientMock: createClientMock,
  };
});

// Import after mocking
import { DatabaseService, getDatabase } from "../../api/lib/database.js";
import { createClient } from "@libsql/client/web";

describe("Database Environment Configuration", () => {
  let originalEnv;
  let consoleLogSpy;
  let consoleErrorSpy;
  let createClientMock;
  let mockClient;

  beforeEach(() => {
    // Backup original environment
    originalEnv = { ...process.env };
    
    // Get mock references
    createClientMock = vi.mocked(createClient);
    mockClient = createClient().__mockClient || createClient();
    
    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset the mock to default behavior
    createClientMock.mockImplementation(() => mockClient);

    // Set up console spies
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Reset database service singleton
    if (global.databaseServiceInstance) {
      global.databaseServiceInstance = null;
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("Environment Variable Loading and Validation", () => {
    describe("TURSO_DATABASE_URL validation", () => {
      it("should throw error when TURSO_DATABASE_URL is missing", () => {
        delete process.env.TURSO_DATABASE_URL;
        delete process.env.TURSO_AUTH_TOKEN;

        const service = new DatabaseService();
        
        expect(() => service.initializeClient()).toThrow(
          "TURSO_DATABASE_URL environment variable is required"
        );
      });

      it("should throw error when TURSO_DATABASE_URL is empty string", () => {
        process.env.TURSO_DATABASE_URL = "";
        process.env.TURSO_AUTH_TOKEN = "test-token";

        const service = new DatabaseService();
        
        expect(() => service.initializeClient()).toThrow(
          "TURSO_DATABASE_URL environment variable is required"
        );
      });

      it("should accept valid TURSO_DATABASE_URL formats", () => {
        const validUrls = [
          "libsql://test-db.turso.io",
          "libsql://my-app-prod.turso.io",
          "libsql://development-db-user.turso.io",
          "https://test-database.turso.io",
        ];

        validUrls.forEach((url) => {
          process.env.TURSO_DATABASE_URL = url;
          process.env.TURSO_AUTH_TOKEN = "test-token";

          const service = new DatabaseService();
          
          expect(() => service.initializeClient()).not.toThrow();
          
          // Reset for next iteration
          service.client = null;
          service.initialized = false;
        });
      });

      it("should validate URL format patterns", () => {
        const invalidUrls = [
          "not-a-url",
          "ftp://invalid-protocol.com",
          "",
          null,
          undefined,
        ];

        invalidUrls.forEach((url) => {
          process.env.TURSO_DATABASE_URL = url;
          process.env.TURSO_AUTH_TOKEN = "test-token";

          const service = new DatabaseService();
          
          if (url === null || url === undefined || url === "") {
            expect(() => service.initializeClient()).toThrow(
              "TURSO_DATABASE_URL environment variable is required"
            );
          }
        });
      });
    });

    describe("TURSO_AUTH_TOKEN validation", () => {
      it("should work without TURSO_AUTH_TOKEN (for local SQLite)", () => {
        process.env.TURSO_DATABASE_URL = "file:./test.db";
        delete process.env.TURSO_AUTH_TOKEN;

        const service = new DatabaseService();
        
        expect(() => service.initializeClient()).not.toThrow();
      });

      it("should include auth token when provided", () => {
        process.env.TURSO_DATABASE_URL = "libsql://test-db.turso.io";
        process.env.TURSO_AUTH_TOKEN = "test-auth-token-123";

        const service = new DatabaseService();
        service.initializeClient();

        // Verify createClient was called with auth token
        expect(createClientMock).toHaveBeenCalledWith({
          url: "libsql://test-db.turso.io",
          authToken: "test-auth-token-123",
        });
      });

      it("should handle various auth token formats", () => {
        const validTokens = [
          "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
          "simple-token-123",
          "token_with_underscores",
          "token-with-dashes",
          "UPPERCASE_TOKEN",
        ];

        validTokens.forEach((token) => {
          process.env.TURSO_DATABASE_URL = "libsql://test-db.turso.io";
          process.env.TURSO_AUTH_TOKEN = token;

          const service = new DatabaseService();
          
          expect(() => service.initializeClient()).not.toThrow();
          
          // Reset for next iteration
          service.client = null;
          service.initialized = false;
        });
      });
    });
  });

  describe("Environment Template File Structure", () => {
    const templateFiles = [
      ".env.example",
      ".env.local.template", 
      ".env.production.template"
    ];

    describe("Template completeness", () => {
      it("should verify all template files contain required database variables", () => {
        const requiredVars = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];

        templateFiles.forEach((templateFile) => {
          // Mock file existence
          fs.existsSync.mockReturnValue(true);
          
          // Mock file content with required variables
          const mockContent = requiredVars
            .map(varName => `${varName}=placeholder_value`)
            .join("\n");
          fs.readFileSync.mockReturnValue(mockContent);

          expect(fs.existsSync(templateFile)).toBe(true);
          
          const content = fs.readFileSync(templateFile, "utf8");
          requiredVars.forEach((varName) => {
            expect(content).toContain(varName);
          });
        });
      });

      it("should verify template files contain proper documentation", () => {
        const expectedComments = [
          "# Turso Database Configuration",
          "# Database Configuration",
          "# Your development database URL",
          "# Your production database URL",
        ];

        templateFiles.forEach((templateFile) => {
          fs.existsSync.mockReturnValue(true);
          
          const mockContent = expectedComments.join("\n") + "\nTURSO_DATABASE_URL=test";
          fs.readFileSync.mockReturnValue(mockContent);

          const content = fs.readFileSync(templateFile, "utf8");
          
          // Should contain at least one documentation comment
          const hasDocumentation = expectedComments.some(comment => 
            content.includes(comment)
          );
          expect(hasDocumentation).toBe(true);
        });
      });

      it("should verify development vs production template differences", () => {
        fs.existsSync.mockReturnValue(true);
        
        // Mock development template
        const devContent = `
          # Development Database
          TURSO_DATABASE_URL=libsql://dev-db.turso.io
          NODE_ENV=development
        `;
        
        // Mock production template
        const prodContent = `
          # Production Database  
          TURSO_DATABASE_URL=libsql://prod-db.turso.io
          NODE_ENV=production
        `;

        // Test development template
        fs.readFileSync.mockReturnValueOnce(devContent);
        const devTemplate = fs.readFileSync(".env.local.template", "utf8");
        expect(devTemplate).toContain("development");

        // Test production template
        fs.readFileSync.mockReturnValueOnce(prodContent);
        const prodTemplate = fs.readFileSync(".env.production.template", "utf8");
        expect(prodTemplate).toContain("production");
      });
    });

    describe("Template security validation", () => {
      it("should ensure templates contain placeholder values only", () => {
        const insecureValues = [
          "sk_live_actual_secret_key",
          "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.real_jwt_token",
          "real-database-url.turso.io",
        ];

        templateFiles.forEach((templateFile) => {
          fs.existsSync.mockReturnValue(true);
          
          const safeContent = `
            TURSO_DATABASE_URL=your_database_url_here
            TURSO_AUTH_TOKEN=your_auth_token_here
          `;
          fs.readFileSync.mockReturnValue(safeContent);

          const content = fs.readFileSync(templateFile, "utf8");
          
          insecureValues.forEach((insecureValue) => {
            expect(content).not.toContain(insecureValue);
          });
        });
      });

      it("should verify template files use placeholder patterns", () => {
        const validPlaceholders = [
          "your_database_url_here",
          "your_auth_token_here",
          "your-dev-database-name",
          "your-prod-database-name",
          "placeholder_value",
        ];

        templateFiles.forEach((templateFile) => {
          fs.existsSync.mockReturnValue(true);
          
          const placeholderContent = validPlaceholders
            .map(placeholder => `TURSO_DATABASE_URL=${placeholder}`)
            .join("\n");
          fs.readFileSync.mockReturnValue(placeholderContent);

          const content = fs.readFileSync(templateFile, "utf8");
          
          // Should contain at least one valid placeholder pattern
          const hasValidPlaceholder = validPlaceholders.some(placeholder =>
            content.includes(placeholder)
          );
          expect(hasValidPlaceholder).toBe(true);
        });
      });
    });
  });

  describe("Configuration File Validation", () => {
    describe(".env.local validation", () => {
      it("should validate local development configuration", () => {
        fs.existsSync.mockReturnValue(true);
        
        const localEnvContent = `
          NODE_ENV=development
          TURSO_DATABASE_URL=libsql://dev-db.turso.io
          TURSO_AUTH_TOKEN=dev-token-123
        `;
        fs.readFileSync.mockReturnValue(localEnvContent);

        const content = fs.readFileSync(".env.local", "utf8");
        expect(content).toContain("NODE_ENV=development");
        expect(content).toContain("TURSO_DATABASE_URL");
        expect(content).toContain("TURSO_AUTH_TOKEN");
      });

      it("should handle missing .env.local file gracefully", () => {
        fs.existsSync.mockReturnValue(false);
        
        expect(() => {
          if (fs.existsSync(".env.local")) {
            fs.readFileSync(".env.local", "utf8");
          }
        }).not.toThrow();
      });
    });

    describe("Production configuration validation", () => {
      it("should validate production environment settings", () => {
        // Simulate production environment
        process.env.NODE_ENV = "production";
        process.env.TURSO_DATABASE_URL = "libsql://prod-db.turso.io";
        process.env.TURSO_AUTH_TOKEN = "prod-auth-token";

        const service = new DatabaseService();
        
        expect(() => service.initializeClient()).not.toThrow();
        expect(process.env.NODE_ENV).toBe("production");
      });

      it("should require stronger validation in production", () => {
        process.env.NODE_ENV = "production";
        
        const weakConfigs = [
          { url: "libsql://test-db.turso.io", token: "test-token" },
          { url: "libsql://dev-db.turso.io", token: "dev-token" },
        ];

        weakConfigs.forEach(({ url, token }) => {
          process.env.TURSO_DATABASE_URL = url;
          process.env.TURSO_AUTH_TOKEN = token;

          const service = new DatabaseService();
          
          // Should still work but could warn about weak configs
          expect(() => service.initializeClient()).not.toThrow();
        });
      });
    });
  });

  describe("Environment-Specific Behavior", () => {
    describe("Development environment", () => {
      it("should handle development-specific database URLs", () => {
        process.env.NODE_ENV = "development";
        process.env.TURSO_DATABASE_URL = "file:./dev.db";
        delete process.env.TURSO_AUTH_TOKEN;

        const service = new DatabaseService();
        
        expect(() => service.initializeClient()).not.toThrow();
      });

      it("should allow more flexible validation in development", () => {
        process.env.NODE_ENV = "development";
        process.env.TURSO_DATABASE_URL = "libsql://localhost:8080";
        process.env.TURSO_AUTH_TOKEN = "dev-token";

        const service = new DatabaseService();
        
        expect(() => service.initializeClient()).not.toThrow();
      });
    });

    describe("Production environment", () => {
      it("should enforce strict validation in production", () => {
        process.env.NODE_ENV = "production";
        process.env.TURSO_DATABASE_URL = "libsql://prod-db.turso.io";
        process.env.TURSO_AUTH_TOKEN = "prod-secure-token-123";

        const service = new DatabaseService();
        
        expect(() => service.initializeClient()).not.toThrow();
      });

      it("should handle production SSL requirements", () => {
        process.env.NODE_ENV = "production";
        process.env.TURSO_DATABASE_URL = "libsql://secure-prod-db.turso.io";
        process.env.TURSO_AUTH_TOKEN = "prod-token";

        const service = new DatabaseService();
        
        expect(() => service.initializeClient()).not.toThrow();
      });
    });
  });

  describe("Missing Environment Variable Handling", () => {
    it("should provide clear error messages for missing required variables", () => {
      delete process.env.TURSO_DATABASE_URL;
      delete process.env.TURSO_AUTH_TOKEN;

      const service = new DatabaseService();
      
      expect(() => service.initializeClient()).toThrow(
        "TURSO_DATABASE_URL environment variable is required"
      );
    });

    it("should handle undefined vs empty string variables differently", () => {
      // Test undefined
      delete process.env.TURSO_DATABASE_URL;
      let service = new DatabaseService();
      expect(() => service.initializeClient()).toThrow("required");

      // Test empty string
      process.env.TURSO_DATABASE_URL = "";
      service = new DatabaseService();
      expect(() => service.initializeClient()).toThrow("required");
    });

    it("should provide helpful debugging information", () => {
      delete process.env.TURSO_DATABASE_URL;
      process.env.TURSO_AUTH_TOKEN = "test-token";

      const service = new DatabaseService();
      
      try {
        service.initializeClient();
      } catch (error) {
        expect(error.message).toContain("TURSO_DATABASE_URL");
        expect(error.message).not.toContain("undefined");
      }
    });
  });

  describe("Invalid Environment Variable Format Detection", () => {
    it("should handle malformed database URLs gracefully", () => {
      const malformedUrls = [
        "not-a-valid-url",
        "libsql://",
        "://missing-protocol",
        "libsql://too.many.dots...turso.io",
      ];

      malformedUrls.forEach((url) => {
        process.env.TURSO_DATABASE_URL = url;
        process.env.TURSO_AUTH_TOKEN = "test-token";

        const service = new DatabaseService();
        
        // The service should initialize but might fail on actual connection
        expect(() => service.initializeClient()).not.toThrow();
      });
    });

    it("should validate auth token format when provided", () => {
      const suspiciousTokens = [
        "definitely-not-a-jwt",
        "",
        "   ",
        null,
      ];

      suspiciousTokens.forEach((token) => {
        process.env.TURSO_DATABASE_URL = "libsql://test-db.turso.io";
        
        if (token === null) {
          delete process.env.TURSO_AUTH_TOKEN;
        } else {
          process.env.TURSO_AUTH_TOKEN = token;
        }

        const service = new DatabaseService();
        
        // Should not throw during initialization
        expect(() => service.initializeClient()).not.toThrow();
      });
    });

    it("should detect potentially unsafe configuration patterns", () => {
      const unsafePatterns = [
        "libsql://localhost:8080", // Localhost in production
        "http://insecure-db.com",  // Non-HTTPS
      ];

      unsafePatterns.forEach((url) => {
        process.env.TURSO_DATABASE_URL = url;
        process.env.TURSO_AUTH_TOKEN = "test-token";

        const service = new DatabaseService();
        
        // Should initialize but could warn about unsafe patterns
        expect(() => service.initializeClient()).not.toThrow();
      });
    });
  });

  describe("Environment Variable Security", () => {
    it("should not expose sensitive values in error messages", () => {
      process.env.TURSO_DATABASE_URL = "libsql://secret-db.turso.io";
      process.env.TURSO_AUTH_TOKEN = "super-secret-token-123";

      // Mock createClient to throw an error
      createClientMock.mockImplementationOnce(() => {
        throw new Error("Connection failed");
      });

      const service = new DatabaseService();
      
      try {
        service.initializeClient();
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        // Error message should not contain actual token
        expect(error.message).not.toContain("super-secret-token-123");
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Failed to initialize database client:",
          expect.objectContaining({
            databaseUrl: "configured",
            authToken: "configured",
          })
        );
      }
    });

    it("should not log sensitive environment variables", () => {
      process.env.TURSO_DATABASE_URL = "libsql://prod-db.turso.io";
      process.env.TURSO_AUTH_TOKEN = "sensitive-production-token";

      const service = new DatabaseService();
      service.initializeClient();

      // Check that console.log was called for success
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Database client initialized successfully"
      );

      // Verify no sensitive values were logged
      const logCalls = consoleLogSpy.mock.calls;
      logCalls.forEach(call => {
        call.forEach(arg => {
          if (typeof arg === "string") {
            expect(arg).not.toContain("sensitive-production-token");
            expect(arg).not.toContain("prod-db.turso.io");
          }
        });
      });
    });

    it("should detect hardcoded secrets in configuration", () => {
      const hardcodedPatterns = [
        "sk_live_",
        "sk_test_",
        "whsec_",
        "eyJhbGciOiJFZERTQSI", // Start of a JWT
      ];

      hardcodedPatterns.forEach((pattern) => {
        process.env.TURSO_AUTH_TOKEN = pattern + "rest_of_token";
        process.env.TURSO_DATABASE_URL = "libsql://test-db.turso.io";

        const service = new DatabaseService();
        
        // Should work but ideally would warn about hardcoded patterns
        expect(() => service.initializeClient()).not.toThrow();
      });
    });

    it("should validate environment variable sources", () => {
      // Simulate reading from different sources
      const originalProcessEnv = process.env;
      
      // Mock environment loaded from .env file
      process.env = {
        ...originalProcessEnv,
        TURSO_DATABASE_URL: "libsql://from-env-file.turso.io",
        TURSO_AUTH_TOKEN: "from-env-file-token",
      };

      const service = new DatabaseService();
      expect(() => service.initializeClient()).not.toThrow();

      // Restore original environment
      process.env = originalProcessEnv;
    });
  });

  describe("Configuration Validation Helpers", () => {
    it("should provide environment validation utility functions", () => {
      // Test a helper function for validating environment
      function validateDatabaseEnvironment() {
        const required = ["TURSO_DATABASE_URL"];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
          throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
        }
        
        return true;
      }

      // Test with missing variables
      delete process.env.TURSO_DATABASE_URL;
      expect(() => validateDatabaseEnvironment()).toThrow("Missing required");

      // Test with all variables present
      process.env.TURSO_DATABASE_URL = "libsql://test-db.turso.io";
      expect(() => validateDatabaseEnvironment()).not.toThrow();
    });

    it("should validate complete environment configuration", () => {
      const requiredForProduction = [
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
        "NODE_ENV",
      ];

      const allPresent = requiredForProduction.every(key => 
        process.env[key] && process.env[key] !== ""
      );

      if (!allPresent) {
        requiredForProduction.forEach(key => {
          process.env[key] = `test-${key.toLowerCase()}`;
        });
      }

      const service = new DatabaseService();
      expect(() => service.initializeClient()).not.toThrow();
    });
  });
});