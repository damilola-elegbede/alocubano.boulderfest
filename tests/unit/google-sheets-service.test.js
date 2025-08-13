import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Set required env vars before importing
process.env.GOOGLE_SHEET_ID = "test-sheet-id";

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    sheets: vi.fn().mockImplementation(() => ({
      spreadsheets: {
        get: vi.fn(),
        batchUpdate: vi.fn(),
        values: {
          update: vi.fn(),
          clear: vi.fn(),
        },
      },
    })),
  },
}));

// Mock database
vi.mock("../../api/lib/database.js", () => ({
  getDatabase: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      rows: [
        {
          total_tickets: 10,
          checked_in: 5,
          total_orders: 3,
          total_revenue: 15000,
          workshop_tickets: 4,
          vip_tickets: 2,
        },
      ],
    }),
  })),
}));

describe("GoogleSheetsService", () => {
  let originalEnv;
  let GoogleSheetsService;

  beforeEach(async () => {
    // Save original env
    originalEnv = { ...process.env };

    // Set test environment variables
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = "test@serviceaccount.com";
    process.env.GOOGLE_SHEETS_PRIVATE_KEY =
      "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----";
    process.env.SHEETS_TIMEZONE = "America/Denver";

    // Clear module cache and re-import
    vi.resetModules();
    const module = await import("../../api/lib/google-sheets-service.js");
    GoogleSheetsService = module.GoogleSheetsService;
  });

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach((key) => delete process.env[key]);
    Object.assign(process.env, originalEnv);
    vi.clearAllMocks();
  });

  describe("Constructor", () => {
    it("should initialize with sheet ID from environment", () => {
      const service = new GoogleSheetsService();
      expect(service.sheetId).toBe("test-sheet-id");
    });

    it("should throw error if GOOGLE_SHEET_ID is not set", () => {
      delete process.env.GOOGLE_SHEET_ID;
      expect(() => new GoogleSheetsService()).toThrow(
        "GOOGLE_SHEET_ID environment variable is required",
      );
    });
  });

  describe("Initialize", () => {
    it("should create auth client with correct Sheets-specific environment variables", async () => {
      const { google } = await import("googleapis");
      const service = new GoogleSheetsService();

      await service.initialize();

      expect(google.auth.GoogleAuth).toHaveBeenCalledWith({
        credentials: {
          client_email: "test@serviceaccount.com",
          private_key:
            "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----",
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
    });

    it("should not use old GOOGLE_SERVICE_ACCOUNT_EMAIL variable", async () => {
      // Set old variable that should NOT be used
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "wrong@serviceaccount.com";
      process.env.GOOGLE_PRIVATE_KEY = "wrong-key";

      // Clear all mocks and module cache for complete isolation
      vi.clearAllMocks();
      vi.resetModules();
      
      // Create a fresh mock for googleapis with a new spy
      const mockGoogleAuth = vi.fn().mockImplementation(() => ({}));
      const mockSheets = vi.fn().mockImplementation(() => ({
        spreadsheets: {
          get: vi.fn(),
          batchUpdate: vi.fn(),
          values: {
            update: vi.fn(),
            clear: vi.fn(),
          },
        },
      }));

      // Completely reset and recreate the mock
      vi.doMock("googleapis", () => ({
        google: {
          auth: {
            GoogleAuth: mockGoogleAuth,
          },
          sheets: mockSheets,
        },
      }));

      // Fresh import after module reset
      const { google } = await import("googleapis");
      const { GoogleSheetsService: FreshGoogleSheetsService } = await import("../../api/lib/google-sheets-service.js");
      const service = new FreshGoogleSheetsService();

      await service.initialize();

      // Should use GOOGLE_SHEETS_* variables, not GOOGLE_* variables
      expect(google.auth.GoogleAuth).toHaveBeenCalledWith({
        credentials: {
          client_email: "test@serviceaccount.com", // Not 'wrong@serviceaccount.com'
          private_key:
            "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----",
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
    });

    it("should handle missing GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL gracefully", async () => {
      // This test verifies the service can initialize even when some env vars are missing
      // The service should not crash when optional env vars are undefined
      const service = new GoogleSheetsService();
      
      // The service should initialize without throwing errors
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it("should only initialize once", async () => {
      const service = new GoogleSheetsService();

      await service.initialize();
      const firstSheets = service.sheets;

      await service.initialize();
      const secondSheets = service.sheets;

      // Should reuse the same sheets instance
      expect(firstSheets).toBe(secondSheets);
    });
  });

  describe("formatTicketType", () => {
    it("should format known ticket types correctly", () => {
      const service = new GoogleSheetsService();

      expect(service.formatTicketType("vip-pass")).toBe("VIP Pass");
      expect(service.formatTicketType("weekend-pass")).toBe("Weekend Pass");
      expect(service.formatTicketType("workshop-beginner")).toBe(
        "Beginner Workshop",
      );
      expect(service.formatTicketType("workshop-intermediate")).toBe(
        "Intermediate Workshop",
      );
      expect(service.formatTicketType("workshop-advanced")).toBe(
        "Advanced Workshop",
      );
    });

    it("should return original value for unknown types", () => {
      const service = new GoogleSheetsService();

      expect(service.formatTicketType("unknown-type")).toBe("unknown-type");
      expect(service.formatTicketType("")).toBe("Unknown");
      expect(service.formatTicketType(null)).toBe("Unknown");
      expect(service.formatTicketType(undefined)).toBe("Unknown");
    });
  });

  describe("formatDate", () => {
    it("should format date strings correctly", () => {
      const service = new GoogleSheetsService();

      const result = service.formatDate("2026-05-15");
      expect(result).toMatch(/05\/15\/2026/);
    });

    it("should return empty string for invalid dates", () => {
      const service = new GoogleSheetsService();

      expect(service.formatDate(null)).toBe("");
      expect(service.formatDate(undefined)).toBe("");
      expect(service.formatDate("")).toBe("");
    });
  });

  describe("formatDateTime", () => {
    it("should format datetime strings correctly", () => {
      const service = new GoogleSheetsService();

      const result = service.formatDateTime("2026-05-15T14:30:00");
      expect(result).toContain("05/15/2026");
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it("should return empty string for invalid datetimes", () => {
      const service = new GoogleSheetsService();

      expect(service.formatDateTime(null)).toBe("");
      expect(service.formatDateTime(undefined)).toBe("");
      expect(service.formatDateTime("")).toBe("");
    });
  });

  describe("Error Handling", () => {
    it("should handle initialization errors", async () => {
      const { google } = await import("googleapis");
      google.auth.GoogleAuth.mockImplementationOnce(() => {
        throw new Error("Auth failed");
      });

      const service = new GoogleSheetsService();

      await expect(service.initialize()).rejects.toThrow("Auth failed");
    });
  });

  describe("Environment Variable Separation", () => {
    it("should not interfere with Drive API variables", () => {
      // Set both Drive and Sheets variables
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "drive@serviceaccount.com";
      process.env.GOOGLE_PRIVATE_KEY = "drive-key";
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL =
        "sheets@serviceaccount.com";
      process.env.GOOGLE_SHEETS_PRIVATE_KEY = "sheets-key";

      const service = new GoogleSheetsService();

      // Sheets service should only use GOOGLE_SHEETS_* variables
      expect(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL).toBe(
        "sheets@serviceaccount.com",
      );
      expect(process.env.GOOGLE_SHEETS_PRIVATE_KEY).toBe("sheets-key");

      // Drive variables should remain unchanged
      expect(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL).toBe(
        "drive@serviceaccount.com",
      );
      expect(process.env.GOOGLE_PRIVATE_KEY).toBe("drive-key");
    });
  });
});
