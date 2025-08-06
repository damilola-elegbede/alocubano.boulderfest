/**
 * Unit Tests for Stripe Checkout Session Creation
 * Tests the create-checkout-session API endpoint with various scenarios
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
      create: vi.fn(),
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
let checkoutSessionHandler;

describe("Checkout Session Creation", () => {
  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set up environment variables
    process.env.STRIPE_SECRET_KEY = "test_stripe_key";
    process.env.NODE_ENV = "test";

    // Import the handler after mocks are set up
    const module = await import(
      "../../api/payments/create-checkout-session.js"
    );
    checkoutSessionHandler = module.default;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NODE_ENV;
  });

  describe("Request Validation", () => {
    it("should reject non-POST requests", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Method not allowed");
    });

    it("should handle OPTIONS preflight requests", async () => {
      const { req, res } = createMocks({
        method: "OPTIONS",
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("should reject empty cart items", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [],
          customerInfo: {
            email: "test@example.com",
            firstName: "John",
            lastName: "Doe",
          },
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Cart items required");
    });

    it("should reject missing cart items", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          customerInfo: {
            email: "test@example.com",
            firstName: "John",
            lastName: "Doe",
          },
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Cart items required");
    });

    it("should accept incomplete customer information (Stripe will collect)", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            {
              name: "Early Bird Ticket",
              price: 25,
              quantity: 1,
              type: "ticket",
            },
          ],
          customerInfo: {
            email: "test@example.com",
            // Missing firstName and lastName - OK, Stripe will collect
          },
        },
      });

      // Mock successful checkout session creation
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: "cs_test_partial_info",
        url: "https://checkout.stripe.com/pay/cs_test_partial_info",
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.sessionId).toBe("cs_test_partial_info");
    });

    it("should validate email format", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            {
              name: "Early Bird Ticket",
              price: 25,
              quantity: 1,
              type: "ticket",
            },
          ],
          customerInfo: {
            email: "invalid-email",
            firstName: "John",
            lastName: "Doe",
          },
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Invalid email format");
    });

    it("should validate cart item structure", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            {
              name: "Early Bird Ticket",
              price: 25,
              quantity: 0,
              type: "ticket",
            }, // Invalid quantity
          ],
          customerInfo: {
            email: "test@example.com",
            firstName: "John",
            lastName: "Doe",
          },
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Invalid item: Early Bird Ticket");
    });

    it("should validate cart item missing required fields", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Early Bird Ticket", quantity: 1, type: "ticket" }, // Missing price
          ],
          customerInfo: {
            email: "test@example.com",
            firstName: "John",
            lastName: "Doe",
          },
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Invalid item: Early Bird Ticket");
    });
  });

  describe("Cart Processing", () => {
    const validCustomerInfo = {
      email: "test@example.com",
      firstName: "John",
      lastName: "Doe",
    };

    it("should process ticket-only cart", async () => {
      const mockSession = {
        id: "cs_test_123",
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
      };

      mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order creation
      mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order update
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            {
              name: "Early Bird Ticket",
              price: 25,
              quantity: 2,
              type: "ticket",
              ticketType: "early_bird",
              eventDate: "2026-05-15",
              description: "Festival pass for all 3 days",
            },
          ],
          customerInfo: validCustomerInfo,
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.checkoutUrl).toBe(mockSession.url);
      expect(responseData.sessionId).toBe(mockSession.id);
      expect(responseData.totalAmount).toBe(50); // 25 * 2

      // Verify database order creation
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO orders"),
        expect.arrayContaining([
          expect.stringMatching(/^order_/),
          expect.stringMatching(/^checkout_pending_/),
          "test@example.com",
          "John Doe",
          null, // phone
          "tickets",
          expect.any(String), // JSON order details
          5000, // 50.00 in cents
          "awaiting_payment",
          null, // special requests
        ]),
      );

      // Verify Stripe session creation
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method_types: ["card", "link"],
          mode: "payment",
          customer_email: "test@example.com",
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: "usd",
                unit_amount: 2500, // $25.00 in cents
                product_data: expect.objectContaining({
                  name: "Early Bird Ticket",
                  description: "Festival pass for all 3 days",
                  metadata: {
                    type: "ticket",
                    ticket_type: "early_bird",
                    event_date: "2026-05-15",
                  },
                }),
              }),
              quantity: 2,
            }),
          ],
          success_url: expect.stringContaining("/success"),
          cancel_url: expect.stringContaining("/failure"),
          metadata: expect.objectContaining({
            orderType: "tickets",
            customerName: "John Doe",
          }),
        }),
      );
    });

    it("should process donation-only cart", async () => {
      const mockSession = {
        id: "cs_test_456",
        url: "https://checkout.stripe.com/c/pay/cs_test_456",
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            {
              name: "Support the Festival",
              price: 10,
              quantity: 1,
              type: "donation",
              category: "general",
              description: "Help support our festival",
            },
          ],
          customerInfo: validCustomerInfo,
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.totalAmount).toBe(10);

      // Verify order type is set to 'donation'
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO orders"),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          "test@example.com",
          "John Doe",
          null,
          "donation", // Order type should be donation
          expect.any(String),
          1000, // $10.00 in cents
          "awaiting_payment",
          null,
        ]),
      );

      // Verify Stripe metadata
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            orderType: "donation",
          }),
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                product_data: expect.objectContaining({
                  metadata: {
                    type: "donation",
                    donation_category: "general",
                  },
                }),
              }),
            }),
          ],
        }),
      );
    });

    it("should process mixed cart (tickets and donations)", async () => {
      const mockSession = {
        id: "cs_test_789",
        url: "https://checkout.stripe.com/c/pay/cs_test_789",
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            {
              name: "Early Bird Ticket",
              price: 25,
              quantity: 1,
              type: "ticket",
              ticketType: "early_bird",
            },
            {
              name: "Festival Support",
              price: 15,
              quantity: 1,
              type: "donation",
              category: "general",
            },
          ],
          customerInfo: validCustomerInfo,
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      expect(responseData.totalAmount).toBe(40); // 25 + 15

      // Mixed cart should be classified as 'tickets' (since it has tickets)
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO orders"),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          "test@example.com",
          "John Doe",
          null,
          "tickets", // Mixed cart defaults to 'tickets'
          expect.any(String),
          4000, // $40.00 in cents
          "awaiting_payment",
          null,
        ]),
      );

      // Should have two line items
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: expect.arrayContaining([
            expect.objectContaining({
              price_data: expect.objectContaining({
                product_data: expect.objectContaining({
                  name: "Early Bird Ticket",
                  metadata: expect.objectContaining({
                    type: "ticket",
                  }),
                }),
              }),
            }),
            expect.objectContaining({
              price_data: expect.objectContaining({
                product_data: expect.objectContaining({
                  name: "Festival Support",
                  metadata: expect.objectContaining({
                    type: "donation",
                  }),
                }),
              }),
            }),
          ]),
        }),
      );
    });

    it("should handle special requests and phone number", async () => {
      const mockSession = {
        id: "cs_test_special",
        url: "https://checkout.stripe.com/c/pay/cs_test_special",
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "VIP Ticket", price: 50, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            ...validCustomerInfo,
            phone: "+1234567890",
            specialRequests: "Wheelchair accessible seating please",
          },
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      // Verify special requests and phone are stored
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO orders"),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          "test@example.com",
          "John Doe",
          "+1234567890", // phone
          "tickets",
          expect.any(String),
          5000,
          "awaiting_payment",
          "Wheelchair accessible seating please", // special requests
        ]),
      );

      // Custom fields removed - Stripe handles all customer info
    });
  });

  describe("Database Integration", () => {
    const validRequestBody = {
      cartItems: [
        { name: "Test Ticket", price: 25, quantity: 1, type: "ticket" },
      ],
      customerInfo: {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
      },
    };

    it("should handle database connection failures", async () => {
      mockDb.run.mockRejectedValue(new Error("Database connection failed"));

      const { req, res } = createMocks({
        method: "POST",
        body: validRequestBody,
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Failed to create preliminary order");
    });

    it("should continue if session ID update fails", async () => {
      const mockSession = {
        id: "cs_test_update_fail",
        url: "https://checkout.stripe.com/c/pay/cs_test_update_fail",
      };

      mockDb.run.mockResolvedValueOnce({ changes: 1 }); // Order creation succeeds
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);
      mockDb.run.mockRejectedValueOnce(new Error("Update failed")); // Session ID update fails

      const { req, res } = createMocks({
        method: "POST",
        body: validRequestBody,
      });

      await checkoutSessionHandler(req, res);

      // Should still return success even if update fails
      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData.checkoutUrl).toBe(mockSession.url);
    });
  });

  describe("Stripe Integration", () => {
    const validRequestBody = {
      cartItems: [
        { name: "Test Ticket", price: 25, quantity: 1, type: "ticket" },
      ],
      customerInfo: {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
      },
    };

    beforeEach(() => {
      mockDb.run.mockResolvedValue({ changes: 1 });
    });

    it("should handle Stripe invalid request errors", async () => {
      const stripeError = new Error("Invalid request");
      stripeError.type = "StripeInvalidRequestError";
      stripeError.message = "Your request was invalid";

      mockStripe.checkout.sessions.create.mockRejectedValue(stripeError);

      const { req, res } = createMocks({
        method: "POST",
        body: validRequestBody,
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Invalid request");
      expect(responseData.message).toBe("Your request was invalid");
    });

    it("should handle Stripe API errors", async () => {
      const stripeError = new Error("API Error");
      stripeError.type = "StripeAPIError";

      mockStripe.checkout.sessions.create.mockRejectedValue(stripeError);

      const { req, res } = createMocks({
        method: "POST",
        body: validRequestBody,
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Stripe API error");
      expect(responseData.message).toBe(
        "Payment service temporarily unavailable",
      );
    });

    it("should handle Stripe connection errors", async () => {
      const stripeError = new Error("Connection Error");
      stripeError.type = "StripeConnectionError";

      mockStripe.checkout.sessions.create.mockRejectedValue(stripeError);

      const { req, res } = createMocks({
        method: "POST",
        body: validRequestBody,
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Connection error");
      expect(responseData.message).toBe("Unable to connect to payment service");
    });

    it("should handle Stripe authentication errors", async () => {
      const stripeError = new Error("Authentication Error");
      stripeError.type = "StripeAuthenticationError";

      mockStripe.checkout.sessions.create.mockRejectedValue(stripeError);

      const { req, res } = createMocks({
        method: "POST",
        body: validRequestBody,
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Configuration error");
      expect(responseData.message).toBe("Payment service configuration error");
    });

    it("should handle unknown errors", async () => {
      const unknownError = new Error("Unknown error");

      mockStripe.checkout.sessions.create.mockRejectedValue(unknownError);

      const { req, res } = createMocks({
        method: "POST",
        body: validRequestBody,
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Checkout session creation failed");
      expect(responseData.message).toBe("An unexpected error occurred");
    });
  });

  describe("Order ID Generation", () => {
    it("should generate unique order IDs", async () => {
      const mockSession = {
        id: "cs_test_orderid",
        url: "https://checkout.stripe.com/test",
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Test Ticket", price: 25, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            email: "test@example.com",
            firstName: "John",
            lastName: "Doe",
          },
        },
      });

      await checkoutSessionHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());

      // Order ID should follow the pattern order_timestamp_randomstring
      expect(responseData.orderId).toMatch(/^order_\d+_[a-z0-9]+$/);
    });
  });

  describe("Session Configuration", () => {
    it("should set correct session expiration (24 hours)", async () => {
      const mockSession = {
        id: "cs_test_expiry",
        url: "https://checkout.stripe.com/test",
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Test Ticket", price: 25, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            email: "test@example.com",
            firstName: "John",
            lastName: "Doe",
          },
        },
      });

      const startTime = Math.floor(Date.now() / 1000);
      await checkoutSessionHandler(req, res);
      const endTime = Math.floor(Date.now() / 1000);

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: expect.any(Number),
        }),
      );

      // Get the actual expires_at value
      const callArgs = mockStripe.checkout.sessions.create.mock.calls[0][0];
      const expiresAt = callArgs.expires_at;

      // Should be approximately 24 hours from now (within 1 minute tolerance)
      const expectedExpiry = startTime + 24 * 60 * 60;
      expect(expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 60);
      expect(expiresAt).toBeLessThanOrEqual(endTime + 24 * 60 * 60);
    });

    it("should set billing address collection to required", async () => {
      const mockSession = {
        id: "cs_test_billing",
        url: "https://checkout.stripe.com/test",
      };

      mockDb.run.mockResolvedValue({ changes: 1 });
      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Test Ticket", price: 25, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            email: "test@example.com",
            firstName: "John",
            lastName: "Doe",
          },
        },
      });

      await checkoutSessionHandler(req, res);

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          billing_address_collection: "required",
        }),
      );
    });
  });
});
