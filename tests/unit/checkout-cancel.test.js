/**
 * Unit Tests for Checkout Cancel API Endpoint
 * Tests the checkout-cancel API endpoint for various scenarios
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMocks } from "node-mocks-http";

// Mock dependencies
const mockDb = {
  run: vi.fn(),
  get: vi.fn(),
};

// Mock modules
vi.mock("../../api/lib/database.js", () => ({
  openDb: vi.fn(() => Promise.resolve(mockDb)),
}));

// Load the handler after mocking
let checkoutCancelHandler;

describe("Checkout Cancel Handler", () => {
  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set up environment variables
    process.env.NODE_ENV = "test";
    process.env.ALLOWED_ORIGINS = "https://alocubano.boulderfest.com,https://test.com";

    // Import the handler after mocks are set up
    const module = await import("../../api/payments/checkout-cancel.js");
    checkoutCancelHandler = module.default;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.ALLOWED_ORIGINS;
  });

  describe("Request Validation", () => {
    it("should reject non-GET requests", async () => {
      const { req, res } = createMocks({
        method: "POST",
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Method not allowed");
    });

    it("should handle OPTIONS preflight requests", async () => {
      const { req, res } = createMocks({
        method: "OPTIONS",
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("should apply CORS headers correctly for allowed origins", async () => {
      const { req, res } = createMocks({
        method: "GET",
        headers: {
          origin: "https://alocubano.boulderfest.com",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getHeaders()["access-control-allow-origin"]).toBe(
        "https://alocubano.boulderfest.com"
      );
    });

    it("should not set CORS origin header for disallowed origins", async () => {
      const { req, res } = createMocks({
        method: "GET",
        headers: {
          origin: "https://malicious.com",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getHeaders()["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("Cancellation Processing", () => {
    it("should handle cancellation without order_id", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_123",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      
      expect(responseData.cancelled).toBe(true);
      expect(responseData.message).toBe(
        "Checkout was cancelled. Your cart items have been preserved."
      );
      expect(responseData.instructions.preserveCart).toBe(true);
      expect(responseData.instructions.redirectDelay).toBe(20000);
      expect(responseData.instructions.redirectUrl).toBe("/tickets");
    });

    it("should handle cancellation with order_id in awaiting_payment status", async () => {
      const mockOrder = {
        id: "order_123",
        fulfillment_status: "awaiting_payment",
      };

      mockDb.get.mockResolvedValue(mockOrder);
      mockDb.run.mockResolvedValue({ changes: 1 });

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_123",
          order_id: "order_123",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      
      // Verify database calls
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, fulfillment_status"),
        ["order_123"]
      );
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE orders"),
        ["order_123"]
      );

      const responseData = JSON.parse(res._getData());
      expect(responseData.cancelled).toBe(true);
    });

    it("should skip update for orders not in awaiting_payment status", async () => {
      const mockOrder = {
        id: "order_123",
        fulfillment_status: "paid",
      };

      mockDb.get.mockResolvedValue(mockOrder);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_123",
          order_id: "order_123",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockDb.get).toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled(); // Should not update

      const responseData = JSON.parse(res._getData());
      expect(responseData.cancelled).toBe(true);
    });

    it("should handle non-existent order gracefully", async () => {
      mockDb.get.mockResolvedValue(null);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_123",
          order_id: "order_nonexistent",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockDb.get).toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();

      const responseData = JSON.parse(res._getData());
      expect(responseData.cancelled).toBe(true);
    });
  });

  describe("Database Error Handling", () => {
    it("should continue on database connection failure", async () => {
      mockDb.get.mockRejectedValue(new Error("Database connection failed"));

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_123",
          order_id: "order_123",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.cancelled).toBe(true);
      expect(responseData.instructions.preserveCart).toBe(true);
    });

    it("should continue on database update failure", async () => {
      const mockOrder = {
        id: "order_123",
        fulfillment_status: "awaiting_payment",
      };

      mockDb.get.mockResolvedValue(mockOrder);
      mockDb.run.mockRejectedValue(new Error("Update failed"));

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_123",
          order_id: "order_123",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.cancelled).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle unexpected errors gracefully", async () => {
      // Mock an error that occurs outside of database operations
      const { req, res } = createMocks({
        method: "GET",
        query: {},
      });

      // Override the openDb to throw an unexpected error
      vi.doMock("../../api/lib/database.js", () => ({
        openDb: vi.fn(() => {
          throw new Error("Unexpected error");
        }),
      }));

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      
      expect(responseData.cancelled).toBe(true);
      // The error case still returns the standard message
      expect(responseData.message).toBe(
        "Checkout was cancelled. Your cart items have been preserved."
      );
    });
  });

  describe("Response Format", () => {
    it("should return properly formatted cancellation response", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_format",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      // Validate response structure
      expect(responseData).toEqual({
        cancelled: true,
        message: "Checkout was cancelled. Your cart items have been preserved.",
        instructions: {
          preserveCart: true,
          redirectUrl: "/tickets",
          redirectDelay: 20000,
          nextSteps: [
            "Your cart items are still saved",
            "You can complete your purchase anytime",
            "Contact us if you experienced any issues",
          ],
        },
        supportInfo: {
          email: "alocubanoboulderfest@gmail.com",
          instagram: "@alocubano.boulderfest",
          message: "Need help? Contact us for assistance with your purchase.",
        },
      });
    });

    it("should include all expected next steps", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {},
      });

      await checkoutCancelHandler(req, res);

      const responseData = JSON.parse(res._getData());
      
      expect(responseData.instructions.nextSteps).toHaveLength(3);
      expect(responseData.instructions.nextSteps[0]).toContain("cart items are still saved");
      expect(responseData.instructions.nextSteps[1]).toContain("complete your purchase anytime");
      expect(responseData.instructions.nextSteps[2]).toContain("Contact us");
    });
  });

  describe("Edge Cases", () => {
    it("should handle request with neither session_id nor order_id", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {},
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.cancelled).toBe(true);
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    it("should handle empty string parameters", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "",
          order_id: "",
        },
      });

      await checkoutCancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.cancelled).toBe(true);
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });
});