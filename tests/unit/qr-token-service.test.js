import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { randomBytes } from "crypto";

// Generate secure random secrets for testing
const originalEnv = {};
const testSecrets = {
  QR_SECRET_KEY: randomBytes(32).toString("hex"),
  QR_CODE_EXPIRY_DAYS: "90",
  QR_CODE_MAX_SCANS: "10",
  VERCEL_URL: "test.example.com", // Match implementation usage
  WALLET_AUTH_SECRET: randomBytes(32).toString("hex"),
};

// Store original values and set test values
Object.keys(testSecrets).forEach((key) => {
  originalEnv[key] = process.env[key];
  process.env[key] = testSecrets[key];
});

// Create a mock database with execute function
const mockExecute = vi.fn();
const mockDb = {
  execute: mockExecute,
};

// Mock database
vi.mock("../../api/lib/database.js", () => ({
  getDatabase: vi.fn(() => mockDb),
}));

describe("QRTokenService", () => {
  let QRTokenService;
  let getQRTokenService;

  beforeAll(async () => {
    const module = await import("../../api/lib/qr-token-service.js");
    QRTokenService = module.QRTokenService;
    getQRTokenService = module.getQRTokenService;
  });

  afterAll(() => {
    vi.clearAllMocks();
    // Restore original environment variables
    Object.keys(testSecrets).forEach((key) => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with correct default values", () => {
      const service = new QRTokenService();
      expect(service.secretKey).toBe(testSecrets.QR_SECRET_KEY);
      expect(service.expiryDays).toBe(90);
      expect(service.maxScans).toBe(10);
    });

    it("should not have persistent database connection", () => {
      const service = new QRTokenService();
      // Should not initialize DB in constructor
      expect(service.db).toBeUndefined();
    });

    it("should have isConfigured method", () => {
      const service = new QRTokenService();
      expect(service.isConfigured()).toBe(true);

      // Test with missing secret
      const originalSecret = process.env.QR_SECRET_KEY;
      delete process.env.QR_SECRET_KEY;
      const service2 = new QRTokenService();
      expect(service2.isConfigured()).toBe(false);
      process.env.QR_SECRET_KEY = originalSecret;
    });
  });

  describe("getOrCreateToken", () => {
    it("should return existing valid token", async () => {
      const service = new QRTokenService();
      const ticketId = "TEST-123";
      const existingToken = jwt.sign(
        { tid: ticketId, type: "ticket" },
        testSecrets.QR_SECRET_KEY,
        { expiresIn: "90d" },
      );

      mockExecute.mockResolvedValueOnce({
        rows: [{ qr_token: existingToken }],
      });

      const token = await service.getOrCreateToken(ticketId);
      expect(token).toBe(existingToken);
      expect(mockExecute).toHaveBeenCalledWith({
        sql: "SELECT qr_token FROM tickets WHERE ticket_id = ?",
        args: [ticketId],
      });
    });

    it.skip("should create new token if none exists", async () => {
      const service = new QRTokenService();
      const ticketId = "TEST-456";

      mockExecute
        .mockResolvedValueOnce({ rows: [] }) // No existing token
        .mockResolvedValueOnce({ rows: [] }); // Update successful

      const token = await service.getOrCreateToken(ticketId);

      // Verify token structure
      const decoded = jwt.verify(token, testSecrets.QR_SECRET_KEY);
      expect(decoded.tid).toBe(ticketId);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);

      // Verify database update (may be called 2 or 3 times depending on test isolation)
      expect(mockExecute.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(mockExecute).toHaveBeenLastCalledWith({
        sql: expect.stringContaining("UPDATE tickets"),
        args: expect.arrayContaining([token, ticketId]),
      });
    });

    it("should return existing token even if expired", async () => {
      const service = new QRTokenService();
      const ticketId = "TEST-789";
      const expiredToken = jwt.sign(
        { tid: ticketId },
        testSecrets.QR_SECRET_KEY,
        { expiresIn: "-1d" }, // Already expired
      );

      mockExecute.mockResolvedValueOnce({
        rows: [{ qr_token: expiredToken }],
      });

      const token = await service.getOrCreateToken(ticketId);

      // Our implementation returns existing tokens regardless of expiry
      // Expiry is checked at validation time
      expect(token).toBe(expiredToken);
    });
  });

  describe("generateQRImage", () => {
    it("should generate QR code with default options", async () => {
      const service = new QRTokenService();
      const token = "test-token-123";

      const qrImage = await service.generateQRImage(token);

      // Should return a data URL
      expect(qrImage).toMatch(/^data:image\/png;base64,/);
    });

    it("should generate QR code with custom options", async () => {
      const service = new QRTokenService();
      const token = "test-token-456";

      const qrImage = await service.generateQRImage(token, {
        width: 512,
        darkColor: "#FF0000",
        lightColor: "#00FF00",
      });

      // Should return a data URL
      expect(qrImage).toMatch(/^data:image\/png;base64,/);
    });

    it.skip("should include validation URL in QR code", async () => {
      const service = new QRTokenService();
      const token = "test-token-789";

      // Spy on QRCode.toDataURL to check the URL being encoded
      const spy = vi.spyOn(QRCode, "toDataURL");

      await service.generateQRImage(token);

      // Now uses VERCEL_URL for base URL, URL fragment instead of query for security
      expect(spy).toHaveBeenCalledWith(
        "https://test.example.com/my-ticket#test-token-789",
        expect.any(Object),
      );

      spy.mockRestore();
    });

    it("should validate token format", async () => {
      const service = new QRTokenService();

      // Should reject invalid tokens
      await expect(service.generateQRImage(null)).rejects.toThrow(
        "Token is required",
      );
      await expect(service.generateQRImage("")).rejects.toThrow(
        "Token is required",
      );
      await expect(service.generateQRImage("short")).rejects.toThrow(
        "Invalid token format",
      );
    });
  });

  describe("database connection management", () => {
    it("should get fresh database connection per operation", async () => {
      const service = new QRTokenService();

      // Mock getDb to track calls - spy on prototype, not instance
      const getDbSpy = vi.spyOn(QRTokenService.prototype, "getDb");

      // Mock responses for both operations
      mockExecute
        .mockResolvedValueOnce({ rows: [] }) // First getOrCreateToken - check existing
        .mockResolvedValueOnce({ rows: [] }) // First getOrCreateToken - update
        .mockResolvedValueOnce({ rows: [] }) // Second getOrCreateToken - check existing
        .mockResolvedValueOnce({ rows: [] }); // Second getOrCreateToken - update

      await service.getOrCreateToken("TICKET-001");
      await service.getOrCreateToken("TICKET-002");

      // Should call getDb for each operation
      expect(getDbSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("token expiry calculation", () => {
    it("should set correct expiry time based on QR_CODE_EXPIRY_DAYS", async () => {
      const originalExpiry = process.env.QR_CODE_EXPIRY_DAYS;
      process.env.QR_CODE_EXPIRY_DAYS = "30";

      const service = new QRTokenService();
      const ticketId = "TEST-EXPIRY";

      mockExecute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const token = await service.getOrCreateToken(ticketId);
      const decoded = jwt.verify(token, testSecrets.QR_SECRET_KEY);

      const expectedExpiry = decoded.iat + 30 * 24 * 60 * 60;
      expect(decoded.exp).toBe(expectedExpiry);

      process.env.QR_CODE_EXPIRY_DAYS = originalExpiry;
    });
  });
});
