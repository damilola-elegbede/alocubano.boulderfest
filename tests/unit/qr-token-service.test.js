import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";

// Mock environment variables
process.env.QR_SECRET_KEY =
  "test-secret-key-that-is-at-least-32-characters-long";
process.env.QR_CODE_EXPIRY_DAYS = "90";
process.env.QR_CODE_MAX_SCANS = "10";
process.env.WALLET_BASE_URL = "https://test.example.com";

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
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with correct default values", () => {
      const service = new QRTokenService();
      expect(service.secretKey).toBe(
        "test-secret-key-that-is-at-least-32-characters-long",
      );
      expect(service.expiryDays).toBe(90);
      expect(service.maxScans).toBe(10);
    });

    it("should throw error if QR_SECRET_KEY is too short", () => {
      const originalSecret = process.env.QR_SECRET_KEY;
      process.env.QR_SECRET_KEY = "short";

      expect(() => new QRTokenService()).toThrow(
        "QR_SECRET_KEY must be at least 32 characters long",
      );

      process.env.QR_SECRET_KEY = originalSecret;
    });

    it("should throw error if QR_SECRET_KEY is not set", () => {
      const originalSecret = process.env.QR_SECRET_KEY;
      delete process.env.QR_SECRET_KEY;

      expect(() => new QRTokenService()).toThrow(
        "QR_SECRET_KEY must be at least 32 characters long",
      );

      process.env.QR_SECRET_KEY = originalSecret;
    });
  });

  describe("getOrCreateToken", () => {
    it("should return existing valid token", async () => {
      const service = new QRTokenService();
      const ticketId = "TEST-123";
      const existingToken = jwt.sign(
        { tid: ticketId, type: "ticket" },
        process.env.QR_SECRET_KEY,
        { expiresIn: "90d" },
      );

      mockExecute.mockResolvedValueOnce({
        rows: [{ qr_token: existingToken, qr_generated_at: new Date() }],
      });

      const token = await service.getOrCreateToken(ticketId);
      expect(token).toBe(existingToken);
      expect(mockExecute).toHaveBeenCalledWith({
        sql: "SELECT qr_token, qr_generated_at FROM tickets WHERE ticket_id = ?",
        args: [ticketId],
      });
    });

    it("should create new token if none exists", async () => {
      const service = new QRTokenService();
      const ticketId = "TEST-456";

      mockExecute
        .mockResolvedValueOnce({ rows: [] }) // No existing token
        .mockResolvedValueOnce({ rows: [] }); // Update successful

      const token = await service.getOrCreateToken(ticketId);

      // Verify token structure
      const decoded = jwt.verify(token, process.env.QR_SECRET_KEY);
      expect(decoded.tid).toBe(ticketId);
      expect(decoded.type).toBe("ticket");
      expect(decoded.exp).toBeGreaterThan(decoded.iat);

      // Verify database update
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockExecute).toHaveBeenLastCalledWith({
        sql: "UPDATE tickets SET qr_token = ?, qr_generated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?",
        args: [token, ticketId],
      });
    });

    it("should create new token if existing token is expired", async () => {
      const service = new QRTokenService();
      const ticketId = "TEST-789";
      const expiredToken = jwt.sign(
        { tid: ticketId, type: "ticket" },
        process.env.QR_SECRET_KEY,
        { expiresIn: "-1d" }, // Already expired
      );

      mockExecute
        .mockResolvedValueOnce({
          rows: [{ qr_token: expiredToken, qr_generated_at: new Date() }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Update successful

      const token = await service.getOrCreateToken(ticketId);

      // Should be a new token, not the expired one
      expect(token).not.toBe(expiredToken);

      // Verify new token is valid
      const decoded = jwt.verify(token, process.env.QR_SECRET_KEY);
      expect(decoded.tid).toBe(ticketId);
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

    it("should include validation URL in QR code", async () => {
      const service = new QRTokenService();
      const token = "test-token-789";

      // Spy on QRCode.toDataURL to check the URL being encoded
      const spy = vi.spyOn(QRCode, "toDataURL");

      await service.generateQRImage(token);

      expect(spy).toHaveBeenCalledWith(
        "https://test.example.com/api/tickets/validate?token=test-token-789",
        expect.any(Object),
      );

      spy.mockRestore();
    });
  });

  describe("getQRTokenService singleton", () => {
    it("should return the same instance", () => {
      const instance1 = getQRTokenService();
      const instance2 = getQRTokenService();

      expect(instance1).toBe(instance2);
    });

    it("should be properly initialized", () => {
      const instance = getQRTokenService();

      expect(instance).toBeInstanceOf(QRTokenService);
      expect(instance.secretKey).toBeDefined();
      expect(instance.expiryDays).toBeDefined();
      expect(instance.maxScans).toBeDefined();
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
      const decoded = jwt.verify(token, process.env.QR_SECRET_KEY);

      const expectedExpiry = decoded.iat + 30 * 24 * 60 * 60;
      expect(decoded.exp).toBe(expectedExpiry);

      process.env.QR_CODE_EXPIRY_DAYS = originalExpiry;
    });
  });
});
