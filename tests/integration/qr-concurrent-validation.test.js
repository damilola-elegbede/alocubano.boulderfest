import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QRTokenService } from "../../api/lib/qr-token-service.js";
import handler from "../../api/tickets/validate.js";
import { createTestDatabase, seedTestData, createLibSQLAdapter } from "../helpers/db.js";

// Mock database for testing
const mockDb = {
  execute: vi.fn(),
  transaction: vi.fn(),
};

// Mock transaction object
const mockTx = {
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
};

// Mock getDatabaseClient for integration test compatibility
vi.mock("../../api/lib/database.js", () => ({
  getDatabaseClient: async () => mockDb,
  getDatabase: () => mockDb, // Keep for backward compatibility
}));

// Mock environment variables
const originalEnv = process.env;

describe("QR Code Concurrent Validation Tests", () => {
  let db;

  beforeEach(() => {
    db = createTestDatabase();
    seedTestData(db, 'minimal');
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      QR_SECRET_KEY: "test-secret-key-for-testing-purposes-only",
      QR_CODE_EXPIRY_DAYS: "180",
      QR_CODE_MAX_SCANS: "5",
      TEST_TYPE: "integration", // Ensure proper integration test mode
    };

    // Setup transaction mock
    mockDb.transaction.mockResolvedValue(mockTx);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    process.env = originalEnv;
  });

  describe("Race Condition Prevention", () => {
    it("should handle concurrent validation attempts without race conditions", async () => {
      const ticketId = "TEST-TICKET-001";
      const token = "test-token";

      // Mock ticket data
      const mockTicket = {
        id: 1,
        ticket_id: ticketId,
        status: "valid",
        scan_count: 3,
        max_scan_count: 5,
        attendee_first_name: "John",
        attendee_last_name: "Doe",
        ticket_type: "Full Pass",
        event_name: "Boulder Fest 2026",
        event_date: "2026-05-15",
      };

      // Setup transaction mock for concurrent requests
      mockTx.execute.mockImplementation((query) => {
        if (query.sql.includes("SELECT")) {
          return Promise.resolve({ rows: [mockTicket] });
        }
        if (query.sql.includes("UPDATE")) {
          // Simulate atomic update
          return Promise.resolve({ rowsAffected: 1 });
        }
        return Promise.resolve({ rows: [] });
      });

      // Create mock request/response objects
      const createMockReq = () => ({
        method: "POST",
        body: { token, validateOnly: false },
        headers: {
          "x-forwarded-for": "192.168.1.1",
          "user-agent": "Test Agent",
        },
        connection: { remoteAddress: "192.168.1.1" },
      });

      const createMockRes = () => ({
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      });

      // Simulate 5 concurrent validation attempts
      const requests = Array(5)
        .fill(null)
        .map(() => {
          const req = createMockReq();
          const res = createMockRes();
          return handler(req, res).then(() => ({ req, res }));
        });

      const results = await Promise.all(requests);

      // Verify all requests were handled
      expect(results).toHaveLength(5);

      // Verify transaction was used (prevents race conditions)
      expect(mockDb.transaction).toHaveBeenCalledTimes(5);
      expect(mockTx.commit).toHaveBeenCalledTimes(5);

      // Verify atomic updates were attempted
      const updateCalls = mockTx.execute.mock.calls.filter((call) =>
        call[0].sql.includes("UPDATE tickets"),
      );
      expect(updateCalls).toHaveLength(5);

      // Verify each update has the safety conditions
      updateCalls.forEach((call) => {
        expect(call[0].sql).toContain("scan_count < max_scan_count");
        expect(call[0].sql).toContain("status = 'valid'");
      });
    });

    it("should reject validation when max scans reached during concurrent attempts", async () => {
      const ticketId = "TEST-TICKET-002";
      const token = "test-token-2";

      // Mock ticket at max scan count
      const mockTicket = {
        id: 2,
        ticket_id: ticketId,
        status: "valid",
        scan_count: 5,
        max_scan_count: 5,
        attendee_first_name: "Jane",
        attendee_last_name: "Smith",
        ticket_type: "Day Pass",
        event_name: "Boulder Fest 2026",
        event_date: "2026-05-16",
      };

      mockTx.execute.mockImplementation((query) => {
        if (query.sql.includes("SELECT")) {
          return Promise.resolve({ rows: [mockTicket] });
        }
        return Promise.resolve({ rows: [] });
      });

      const req = {
        method: "POST",
        body: { token, validateOnly: false },
        headers: { "x-forwarded-for": "192.168.1.2" },
        connection: { remoteAddress: "192.168.1.2" },
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(req, res);

      // Verify rollback was called due to max scans
      expect(mockTx.rollback).toHaveBeenCalled();

      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          error: expect.stringContaining("Maximum scans exceeded"),
        }),
      );
    });

    it("should handle database transaction failures gracefully", async () => {
      const token = "test-token-3";

      // Mock transaction failure
      mockDb.transaction.mockRejectedValue(
        new Error("Database connection failed"),
      );

      const req = {
        method: "POST",
        body: { token, validateOnly: false },
        headers: { "x-forwarded-for": "192.168.1.3" },
        connection: { remoteAddress: "192.168.1.3" },
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(req, res);

      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          error: expect.any(String),
        }),
      );
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limiting on validation endpoint", async () => {
      const token = "test-token-rate";
      const ip = "192.168.1.100";

      // Create many requests from same IP
      const requests = Array(150)
        .fill(null)
        .map(() => ({
          method: "POST",
          body: { token, validateOnly: true },
          headers: { "x-forwarded-for": ip },
          connection: { remoteAddress: ip },
        }));

      const responses = [];

      // Mock successful ticket lookup
      mockDb.execute.mockResolvedValue({
        rows: [
          {
            ticket_id: "TEST-001",
            status: "valid",
            scan_count: 0,
            max_scan_count: 5,
            attendee_first_name: "Test",
            attendee_last_name: "User",
            ticket_type: "Full Pass",
            event_name: "Test Event",
            event_date: "2026-05-15",
          },
        ],
      });

      // Process requests sequentially to test rate limiting
      for (const req of requests) {
        const res = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        };
        await handler(req, res);
        responses.push(res);
      }

      // Check that some requests were rate limited (429 status)
      const rateLimited = responses.filter(
        (res) => res.status.mock.calls[0]?.[0] === 429,
      );

      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Rate limit exceeded"),
        }),
      );
    });
  });

  describe("Token Security", () => {
    it("should only accept POST requests for validation", async () => {
      const req = {
        method: "GET",
        query: { token: "test-token" },
        headers: {},
        connection: {},
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Method not allowed"),
        }),
      );
    });

    it("should require token in request body", async () => {
      const req = {
        method: "POST",
        body: {},
        headers: {},
        connection: {},
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("Token required"),
        }),
      );
    });

    it("should sanitize error messages and not leak sensitive data", async () => {
      const token = "invalid-token";

      // Mock database error with sensitive info
      mockDb.execute.mockRejectedValue(
        new Error("Database error: password=secret123 at table users"),
      );

      const req = {
        method: "POST",
        body: { token },
        headers: { "x-forwarded-for": "192.168.1.50" },
        connection: { remoteAddress: "192.168.1.50" },
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await handler(req, res);

      // Verify error doesn't contain sensitive info
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          error: expect.any(String),
        }),
      );

      // Check that password is not in error message
      const errorCall = res.json.mock.calls[0][0];
      expect(errorCall.error).not.toContain("password");
      expect(errorCall.error).not.toContain("secret123");
    });
  });

  describe("Database Connection Management", () => {
    it("should use fresh database connections for each request", async () => {
      const service = new QRTokenService();

      // Verify no persistent connection in constructor
      expect(service.db).toBeUndefined();

      // Mock getDatabaseClient to track calls
      const getDbSpy = vi.spyOn(service, "getDb");

      // Mock database response
      mockDb.execute.mockResolvedValue({
        rows: [{ qr_token: "existing-token" }],
      });

      // Make multiple token requests
      await service.getOrCreateToken("TICKET-001");
      await service.getOrCreateToken("TICKET-002");

      // Verify fresh connection for each operation
      expect(getDbSpy).toHaveBeenCalledTimes(2);
    });
  });
});
