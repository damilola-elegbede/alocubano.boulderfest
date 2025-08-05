/**
 * Unit Tests for Stripe Checkout Success Handler
 * Tests the checkout-success API endpoint for session verification and order updates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMocks } from "node-mocks-http";

// Mock dependencies
const mockDb = {
  run: vi.fn(),
  get: vi.fn(),
};

const mockStripe = {
  checkout: {
    sessions: {
      retrieve: vi.fn(),
    },
  },
};

// Mock modules
vi.mock("../../api/lib/database.js", () => ({
  openDb: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => mockStripe),
}));

// Load the handler after mocking
let checkoutSuccessHandler;

describe("Checkout Success Handler", () => {
  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set up environment variables
    process.env.STRIPE_SECRET_KEY = "test_stripe_key";
    process.env.NODE_ENV = "test";

    // Import the handler after mocks are set up
    const module = await import("../../api/payments/checkout-success.js");
    checkoutSuccessHandler = module.default;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NODE_ENV;
  });

  describe("Request Validation", () => {
    it("should reject non-GET requests", async () => {
      const { req, res } = createMocks({
        method: "POST",
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Method not allowed");
    });

    it("should handle OPTIONS preflight requests", async () => {
      const { req, res } = createMocks({
        method: "OPTIONS",
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("should reject missing session_id parameter", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {},
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Invalid session ID");
      expect(responseData.message).toBe("Valid Stripe session ID required");
    });

    it("should reject invalid session_id format", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "invalid_session_id",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Invalid session ID");
      expect(responseData.message).toBe("Valid Stripe session ID required");
    });

    it("should accept valid session_id format", async () => {
      const mockSession = {
        id: "cs_test_valid_session",
        payment_status: "paid",
        metadata: { orderId: "order_123" },
        amount_total: 5000,
        customer_details: { email: "test@example.com" },
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue({
        id: "order_123",
        customer_email: "test@example.com",
        customer_name: "John Doe",
        order_type: "tickets",
        order_total: 5000,
        order_details: JSON.stringify({ items: [] }),
        created_at: "2025-01-01 12:00:00",
      });

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_valid_session",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockStripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
        "cs_test_valid_session",
      );
    });
  });

  describe("Session Validation", () => {
    it("should handle non-existent session", async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValue(null);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_nonexistent",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Session not found");
      expect(responseData.message).toBe("Checkout session could not be found");
    });

    it("should reject unpaid sessions", async () => {
      const mockSession = {
        id: "cs_test_unpaid",
        payment_status: "unpaid",
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_unpaid",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Payment not completed");
      expect(responseData.message).toBe(
        "Payment was not successfully completed",
      );
      expect(responseData.paymentStatus).toBe("unpaid");
    });

    it("should handle sessions with pending payment status", async () => {
      const mockSession = {
        id: "cs_test_pending",
        payment_status: "processing",
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_pending",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Payment not completed");
      expect(responseData.paymentStatus).toBe("processing");
    });
  });

  describe("Order Status Updates", () => {
    const createValidSession = (orderId = "order_123") => ({
      id: "cs_test_session",
      payment_status: "paid",
      metadata: { orderId },
      amount_total: 5000,
      customer_details: { email: "test@example.com" },
    });

    const createValidOrder = (orderId = "order_123") => ({
      id: orderId,
      customer_email: "test@example.com",
      customer_name: "John Doe",
      order_type: "tickets",
      order_total: 5000,
      order_details: JSON.stringify({
        items: [{ name: "Early Bird Ticket", price: 25, quantity: 2 }],
      }),
      created_at: "2025-01-01 12:00:00",
    });

    it("should successfully update order status to paid", async () => {
      const mockSession = createValidSession();
      const mockOrder = createValidOrder();

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue(mockOrder);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_session",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      // Verify database update
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE orders"),
        ["cs_test_session", "order_123"],
      );

      // Verify response structure
      expect(responseData.success).toBe(true);
      expect(responseData.message).toBe(
        "Payment successful! Thank you for your purchase.",
      );
      expect(responseData.order).toEqual({
        id: "order_123",
        customerEmail: "test@example.com",
        customerName: "John Doe",
        orderType: "tickets",
        totalAmount: 50, // Converted from cents
        items: [{ name: "Early Bird Ticket", price: 25, quantity: 2 }],
        createdAt: "2025-01-01 12:00:00",
      });

      expect(responseData.session).toEqual({
        id: "cs_test_session",
        paymentStatus: "paid",
        customerEmail: "test@example.com",
        amountTotal: 50, // Converted from cents
      });

      expect(responseData.instructions).toEqual({
        clearCart: true,
        redirectDelay: 5000,
        nextSteps: [
          "Check your email for order confirmation",
          "Save your order confirmation number",
          "Contact us if you have any questions",
        ],
      });
    });

    it("should handle order not found in database", async () => {
      const mockSession = createValidSession();

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 0 }); // No rows updated
      mockDb.get.mockResolvedValue(null); // Order not found

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_session",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.success).toBe(true);
      expect(responseData.warning).toBe("Order details could not be retrieved");
      expect(responseData.session).toEqual({
        id: "cs_test_session",
        paymentStatus: "paid",
        customerEmail: "test@example.com",
        amountTotal: 50,
      });
    });

    it("should handle missing order ID in session metadata", async () => {
      const mockSession = {
        id: "cs_test_no_orderid",
        payment_status: "paid",
        metadata: {}, // No orderId
        amount_total: 5000,
        customer_details: { email: "test@example.com" },
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_no_orderid",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.success).toBe(true);
      expect(responseData.warning).toBe("Order ID not found in session");

      // Should not attempt database operations
      expect(mockDb.run).not.toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    it("should continue on database update failure", async () => {
      const mockSession = createValidSession();

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockRejectedValue(new Error("Database update failed"));

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_session",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      // Should still return success even if DB operations fail
      expect(responseData.success).toBe(true);
      expect(responseData.message).toBe(
        "Payment successful! Thank you for your purchase.",
      );
      expect(responseData.warning).toBe("Order details could not be retrieved");
    });

    it("should handle order retrieval failure after successful update", async () => {
      const mockSession = createValidSession();

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 }); // Update succeeds
      mockDb.get.mockRejectedValue(new Error("Failed to retrieve order")); // Retrieval fails

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_session",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      // Should still return success
      expect(responseData.success).toBe(true);
      expect(responseData.warning).toBe("Order details could not be retrieved");
    });
  });

  describe("Order Details Processing", () => {
    it("should handle malformed order details JSON", async () => {
      const mockSession = {
        id: "cs_test_malformed",
        payment_status: "paid",
        metadata: { orderId: "order_malformed" },
        amount_total: 5000,
        customer_details: { email: "test@example.com" },
      };

      const mockOrder = {
        id: "order_malformed",
        customer_email: "test@example.com",
        customer_name: "John Doe",
        order_type: "tickets",
        order_total: 5000,
        order_details: "invalid json{", // Malformed JSON
        created_at: "2025-01-01 12:00:00",
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue(mockOrder);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_malformed",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.success).toBe(true);
      // Should handle malformed JSON gracefully
      expect(responseData.order.items).toEqual([]); // Default to empty array
    });

    it("should handle null order details", async () => {
      const mockSession = {
        id: "cs_test_null_details",
        payment_status: "paid",
        metadata: { orderId: "order_null" },
        amount_total: 5000,
        customer_details: { email: "test@example.com" },
      };

      const mockOrder = {
        id: "order_null",
        customer_email: "test@example.com",
        customer_name: "John Doe",
        order_type: "tickets",
        order_total: 5000,
        order_details: null,
        created_at: "2025-01-01 12:00:00",
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue(mockOrder);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_null_details",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.success).toBe(true);
      expect(responseData.order.items).toEqual([]); // Default to empty array
    });
  });

  describe("Stripe Error Handling", () => {
    it("should handle Stripe invalid request errors", async () => {
      const stripeError = new Error("Invalid session ID");
      stripeError.type = "StripeInvalidRequestError";

      mockStripe.checkout.sessions.retrieve.mockRejectedValue(stripeError);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_invalid",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Invalid session");
      expect(responseData.message).toBe("The provided session ID is invalid");
    });

    it("should handle Stripe API errors", async () => {
      const stripeError = new Error("API Error");
      stripeError.type = "StripeAPIError";

      mockStripe.checkout.sessions.retrieve.mockRejectedValue(stripeError);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_api_error",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Stripe API error");
      expect(responseData.message).toBe("Unable to verify payment status");
    });

    it("should handle Stripe connection errors", async () => {
      const stripeError = new Error("Connection Error");
      stripeError.type = "StripeConnectionError";

      mockStripe.checkout.sessions.retrieve.mockRejectedValue(stripeError);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_connection_error",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Connection error");
      expect(responseData.message).toBe("Unable to connect to payment service");
    });

    it("should handle Stripe authentication errors", async () => {
      const stripeError = new Error("Authentication Error");
      stripeError.type = "StripeAuthenticationError";

      mockStripe.checkout.sessions.retrieve.mockRejectedValue(stripeError);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_auth_error",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Configuration error");
      expect(responseData.message).toBe("Payment service configuration error");
    });

    it("should handle unknown errors", async () => {
      const unknownError = new Error("Unknown error");

      mockStripe.checkout.sessions.retrieve.mockRejectedValue(unknownError);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_unknown_error",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Payment verification failed");
      expect(responseData.message).toBe(
        "An unexpected error occurred while verifying your payment",
      );
    });
  });

  describe("Response Format Validation", () => {
    it("should return properly formatted success response with complete order data", async () => {
      const mockSession = {
        id: "cs_test_complete",
        payment_status: "paid",
        metadata: { orderId: "order_complete" },
        amount_total: 7500,
        customer_details: { email: "complete@example.com" },
      };

      const mockOrder = {
        id: "order_complete",
        customer_email: "complete@example.com",
        customer_name: "Complete User",
        order_type: "tickets",
        order_total: 7500,
        order_details: JSON.stringify({
          items: [
            { name: "VIP Ticket", price: 50, quantity: 1 },
            { name: "Donation", price: 25, quantity: 1 },
          ],
        }),
        created_at: "2025-01-01 12:00:00",
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue(mockOrder);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_complete",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      // Validate response structure
      expect(responseData).toEqual({
        success: true,
        message: "Payment successful! Thank you for your purchase.",
        order: {
          id: "order_complete",
          customerEmail: "complete@example.com",
          customerName: "Complete User",
          orderType: "tickets",
          totalAmount: 75, // Converted from cents
          items: [
            { name: "VIP Ticket", price: 50, quantity: 1 },
            { name: "Donation", price: 25, quantity: 1 },
          ],
          createdAt: "2025-01-01 12:00:00",
        },
        session: {
          id: "cs_test_complete",
          paymentStatus: "paid",
          customerEmail: "complete@example.com",
          amountTotal: 75, // Converted from cents
        },
        instructions: {
          clearCart: true,
          redirectDelay: 5000,
          nextSteps: [
            "Check your email for order confirmation",
            "Save your order confirmation number",
            "Contact us if you have any questions",
          ],
        },
      });
    });

    it("should return properly formatted success response without order data", async () => {
      const mockSession = {
        id: "cs_test_no_order",
        payment_status: "paid",
        metadata: {},
        amount_total: 5000,
        customer_details: { email: "noorder@example.com" },
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_no_order",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      // Validate fallback response structure
      expect(responseData).toEqual({
        success: true,
        message: "Payment successful! Thank you for your purchase.",
        session: {
          id: "cs_test_no_order",
          paymentStatus: "paid",
          customerEmail: "noorder@example.com",
          amountTotal: 50, // Converted from cents
        },
        instructions: {
          clearCart: true,
          redirectDelay: 5000,
          nextSteps: [
            "Check your email for order confirmation",
            "Contact us if you have any questions about your order",
          ],
        },
        warning: "Order ID not found in session",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle session with zero amount", async () => {
      const mockSession = {
        id: "cs_test_zero",
        payment_status: "paid",
        metadata: { orderId: "order_zero" },
        amount_total: 0,
        customer_details: { email: "zero@example.com" },
      };

      const mockOrder = {
        id: "order_zero",
        customer_email: "zero@example.com",
        customer_name: "Zero User",
        order_type: "donation",
        order_total: 0,
        order_details: JSON.stringify({ items: [] }),
        created_at: "2025-01-01 12:00:00",
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue(mockOrder);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_zero",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.success).toBe(true);
      expect(responseData.order.totalAmount).toBe(0);
      expect(responseData.session.amountTotal).toBe(0);
    });

    it("should handle session without customer details", async () => {
      const mockSession = {
        id: "cs_test_no_customer",
        payment_status: "paid",
        metadata: { orderId: "order_no_customer" },
        amount_total: 5000,
        customer_details: null,
      };

      const mockOrder = {
        id: "order_no_customer",
        customer_email: "nocustomer@example.com",
        customer_name: "No Customer User",
        order_type: "tickets",
        order_total: 5000,
        order_details: JSON.stringify({ items: [] }),
        created_at: "2025-01-01 12:00:00",
      };

      mockStripe.checkout.sessions.retrieve.mockResolvedValue(mockSession);
      mockDb.run.mockResolvedValue({ changes: 1 });
      mockDb.get.mockResolvedValue(mockOrder);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          session_id: "cs_test_no_customer",
        },
      });

      await checkoutSuccessHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.success).toBe(true);
      expect(responseData.session.customerEmail).toBeUndefined();
    });
  });
});
