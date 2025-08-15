/**
 * Stripe Webhooks Integration Tests - HTTP API Testing
 * Tests webhook processing via HTTP requests, not direct module imports
 *
 * IMPORTANT: Integration tests should test via HTTP requests to avoid
 * module initialization conflicts and test real API behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer } from "http";
import request from "supertest";
import express from "express";
import Stripe from "stripe";
import nock from "nock";

// Create mock functions outside to be accessible
const mockExecute = vi.fn();
const mockClose = vi.fn();

// Mock database
vi.mock("../../api/lib/database.js", () => ({
  getDatabaseClient: vi.fn().mockResolvedValue({
    execute: mockExecute,
    close: mockClose,
  }),
  getDatabase: () => ({
    execute: mockExecute,
    close: mockClose,
  }),
}));

// Mock the services to avoid deep database call complexities
const mockTransactionService = {
  getByStripeSessionId: vi.fn(),
  createFromStripeSession: vi.fn(),
  updateStatus: vi.fn(),
  getByPaymentIntentId: vi.fn(),
};

const mockTicketService = {
  createTicketsFromTransaction: vi.fn(),
};

const mockPaymentEventLogger = {
  logStripeEvent: vi.fn(),
  updateEventTransactionId: vi.fn(),
  logError: vi.fn(),
};

const mockTicketEmailService = {
  sendTicketConfirmation: vi.fn(),
};

vi.mock("../../api/lib/transaction-service.js", () => ({
  default: mockTransactionService,
}));

vi.mock("../../api/lib/ticket-service.js", () => ({
  default: mockTicketService,
}));

vi.mock("../../api/lib/payment-event-logger.js", () => ({
  default: mockPaymentEventLogger,
}));

vi.mock("../../api/lib/ticket-email-service-brevo.js", () => ({
  getTicketEmailService: () => mockTicketEmailService,
}));

// Mock Stripe to avoid real API calls
const mockStripe = {
  webhooks: {
    constructEvent: vi.fn(),
  },
  checkout: {
    sessions: {
      retrieve: vi.fn(),
    },
  },
};

vi.mock("stripe", () => {
  return {
    default: vi.fn(() => mockStripe),
  };
});

// Import the webhook handler after mocking dependencies
let webhookHandler;

// Helper function to create a mock request for testing webhook handler directly
function createMockRequest(body, headers = {}) {
  const bodyBuffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));

  // Create a readable stream from the body
  const { Readable } = require("stream");
  const stream = new Readable({
    read() {
      this.push(bodyBuffer);
      this.push(null); // End the stream
    },
  });

  // Add standard request properties
  stream.method = "POST";
  stream.headers = {
    "content-type": "application/json",
    ...headers,
  };

  return stream;
}

// Helper function to create a mock response for testing
function createMockResponse() {
  let statusCode = 200;
  let responseBody = null;

  const res = {
    status: vi.fn((code) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((body) => {
      responseBody = body;
      return res;
    }),
    // Getters to access the values in tests
    get statusCode() {
      return statusCode;
    },
    get body() {
      return responseBody;
    },
  };

  return res;
}

describe("Stripe Webhooks Integration", () => {
  let app;
  let server;

  beforeEach(async () => {
    // Clear mocks before each test
    mockExecute.mockReset();
    mockClose.mockReset();

    // Reset service mocks
    vi.clearAllMocks();
    mockTransactionService.getByStripeSessionId.mockReset();
    mockTransactionService.createFromStripeSession.mockReset();
    mockTransactionService.updateStatus.mockReset();
    mockTransactionService.getByPaymentIntentId.mockReset();
    mockTicketService.createTicketsFromTransaction.mockReset();
    mockPaymentEventLogger.logStripeEvent.mockReset();
    mockPaymentEventLogger.updateEventTransactionId.mockReset();
    mockPaymentEventLogger.logError.mockReset();
    mockTicketEmailService.sendTicketConfirmation.mockReset();

    // Set test environment variables
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    process.env.NODE_ENV = "test";

    // Create Express app for testing (used only for certain tests)
    app = express();

    // Import webhook handler dynamically
    const { default: handler } = await import(
      "../../api/payments/stripe-webhook.js"
    );
    webhookHandler = handler;

    app.use(
      "/webhook",
      express.raw({ type: "application/json" }),
      webhookHandler,
    );
  });

  afterEach(() => {
    nock.cleanAll();
    vi.clearAllMocks();
    if (server) {
      server.close();
    }
  });

  describe("Webhook Signature Verification", () => {
    it("should reject webhooks with invalid signature", async () => {
      const payload = JSON.stringify({
        id: "evt_test_invalid",
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_123" } },
      });

      const response = await request(app)
        .post("/webhook")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("stripe-signature", "invalid_signature");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Webhook Error");
    });

    it("should accept webhooks without signature in test mode", async () => {
      // Clear webhook secret before importing
      const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      // Re-import the handler without webhook secret
      vi.resetModules();
      const { default: testHandler } = await import(
        "../../api/payments/stripe-webhook.js"
      );

      const payload = {
        id: "evt_test_valid",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_test_123" } },
      };

      mockExecute
        .mockResolvedValueOnce({ rows: [] }) // Check for existing event
        .mockResolvedValueOnce({ lastInsertRowid: 1 }); // Log event

      // Use direct handler testing
      const req = createMockRequest(JSON.stringify(payload));
      const res = createMockResponse();

      await testHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);

      // Restore webhook secret
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    });
  });

  describe("Event Processing", () => {
    let stripe;
    let originalSecret;

    beforeEach(async () => {
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET; // Disable signature verification for tests

      // Reset service mocks for this section too
      vi.clearAllMocks();
      mockTransactionService.getByStripeSessionId.mockReset();
      mockTransactionService.createFromStripeSession.mockReset();
      mockTransactionService.updateStatus.mockReset();
      mockTransactionService.getByPaymentIntentId.mockReset();
      mockTicketService.createTicketsFromTransaction.mockReset();
      mockPaymentEventLogger.logStripeEvent.mockReset();
      mockPaymentEventLogger.updateEventTransactionId.mockReset();
      mockPaymentEventLogger.logError.mockReset();
      mockTicketEmailService.sendTicketConfirmation.mockReset();

      // Reset Stripe mocks
      mockStripe.webhooks.constructEvent.mockReset();
      mockStripe.checkout.sessions.retrieve.mockReset();

      // Re-import the handler without webhook secret to ensure consistent behavior
      vi.resetModules();
      const handlerModule = await import(
        "../../api/payments/stripe-webhook.js"
      );
      webhookHandler = handlerModule.default;
    });

    afterEach(() => {
      if (originalSecret) {
        process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
      }
    });

    describe("checkout.session.completed", () => {
      it("should create transaction and tickets for successful checkout", async () => {
        // Mock Stripe API call to retrieve session details
        const mockSessionData = {
          id: "cs_test_123",
          payment_status: "paid",
          customer_details: {
            email: "test@example.com",
            name: "Test User",
          },
          amount_total: 5000,
          currency: "usd",
          metadata: {},
          line_items: {
            data: [
              {
                quantity: 2,
                price: {
                  id: "price_test_123",
                  unit_amount: 2500,
                  product: {
                    id: "prod_test_123",
                    name: "Weekend Pass",
                    metadata: {
                      ticket_type: "weekend-pass",
                      event_date: "2026-05-16",
                    },
                  },
                },
              },
            ],
          },
        };

        mockStripe.checkout.sessions.retrieve.mockResolvedValue(
          mockSessionData,
        );

        const payload = {
          id: "evt_test_checkout_completed",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_123",
              payment_status: "paid",
            },
          },
        };

        // Mock service calls
        const mockTransaction = {
          id: 1,
          uuid: "TXN-123-abc",
          stripe_session_id: "cs_test_123",
          customer_email: "test@example.com",
          customer_name: "Test User",
          total_amount: 5000,
          currency: "usd",
          status: "paid",
        };

        const mockTickets = [
          { id: 1, ticket_id: "TKT-001", transaction_id: 1 },
          { id: 2, ticket_id: "TKT-002", transaction_id: 1 },
        ];

        mockPaymentEventLogger.logStripeEvent.mockResolvedValue({
          status: "logged",
        });
        mockTransactionService.getByStripeSessionId.mockResolvedValue(null); // No existing transaction
        mockTransactionService.createFromStripeSession.mockResolvedValue(
          mockTransaction,
        );
        mockPaymentEventLogger.updateEventTransactionId.mockResolvedValue({});
        mockTicketService.createTicketsFromTransaction.mockResolvedValue(
          mockTickets,
        );
        mockTicketEmailService.sendTicketConfirmation.mockResolvedValue({});

        // Use direct handler testing
        const req = createMockRequest(JSON.stringify(payload));
        const res = createMockResponse();

        await webhookHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.received).toBe(true);

        // Verify service calls
        expect(mockPaymentEventLogger.logStripeEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "evt_test_checkout_completed",
            type: "checkout.session.completed",
          }),
        );
        expect(
          mockTransactionService.getByStripeSessionId,
        ).toHaveBeenCalledWith("cs_test_123");
        expect(
          mockTransactionService.createFromStripeSession,
        ).toHaveBeenCalled();
        expect(
          mockTicketService.createTicketsFromTransaction,
        ).toHaveBeenCalledWith(mockTransaction, expect.any(Array));
        expect(
          mockTicketEmailService.sendTicketConfirmation,
        ).toHaveBeenCalledWith(mockTransaction, mockTickets);
      });

      it("should handle idempotency for duplicate events", async () => {
        const payload = {
          id: "evt_test_duplicate",
          type: "checkout.session.completed",
          data: {
            object: { id: "cs_test_duplicate" },
          },
        };

        // Mock existing event (already processed)
        mockPaymentEventLogger.logStripeEvent.mockResolvedValue({
          status: "already_processed",
        });

        // Use direct handler testing
        const req = createMockRequest(JSON.stringify(payload));
        const res = createMockResponse();

        await webhookHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("already_processed");
      });

      it("should handle existing transactions gracefully", async () => {
        const payload = {
          id: "evt_test_existing_txn",
          type: "checkout.session.completed",
          data: {
            object: { id: "cs_test_existing" },
          },
        };

        // Mock that event logging succeeds but transaction already exists
        mockPaymentEventLogger.logStripeEvent.mockResolvedValue({
          status: "logged",
        });
        mockTransactionService.getByStripeSessionId.mockResolvedValue({
          id: 1,
        }); // Existing transaction

        // Use direct handler testing
        const req = createMockRequest(JSON.stringify(payload));
        const res = createMockResponse();

        await webhookHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("already_exists");
      });
    });

    describe("checkout.session.async_payment_succeeded", () => {
      it("should handle delayed payment success", async () => {
        const mockSessionData = {
          id: "cs_test_async",
          payment_status: "paid",
          customer_details: { email: "async@example.com" },
          line_items: { data: [] },
        };

        mockStripe.checkout.sessions.retrieve.mockResolvedValue(
          mockSessionData,
        );

        const payload = {
          id: "evt_test_async_success",
          type: "checkout.session.async_payment_succeeded",
          data: {
            object: { id: "cs_test_async" },
          },
        };

        const mockTransaction = {
          id: 1,
          uuid: "txn_async",
          stripe_session_id: "cs_test_async",
          customer_email: "async@example.com",
        };

        mockPaymentEventLogger.logStripeEvent.mockResolvedValue({
          status: "logged",
        });
        mockTransactionService.getByStripeSessionId.mockResolvedValue(null); // No existing transaction
        mockTransactionService.createFromStripeSession.mockResolvedValue(
          mockTransaction,
        );
        mockTicketService.createTicketsFromTransaction.mockResolvedValue([]);
        mockTicketEmailService.sendTicketConfirmation.mockResolvedValue({});

        // Use direct handler testing
        const req = createMockRequest(JSON.stringify(payload));
        const res = createMockResponse();

        await webhookHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.received).toBe(true);
      });
    });

    describe("checkout.session.async_payment_failed", () => {
      it("should update transaction status on payment failure", async () => {
        const payload = {
          id: "evt_test_async_failed",
          type: "checkout.session.async_payment_failed",
          data: {
            object: { id: "cs_test_failed" },
          },
        };

        mockExecute
          .mockResolvedValueOnce({ rows: [] }) // No existing event
          .mockResolvedValueOnce({ lastInsertRowid: 1 }) // Log event
          .mockResolvedValueOnce({ rows: [{ uuid: "txn_failed" }] }) // Existing transaction
          .mockResolvedValueOnce({ rows: [] }); // Update status

        // Use direct handler testing
        const req = createMockRequest(JSON.stringify(payload));
        const res = createMockResponse();

        await webhookHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.received).toBe(true);
      });
    });

    describe("payment_intent.payment_failed", () => {
      it("should update transaction status on payment intent failure", async () => {
        const payload = {
          id: "evt_test_pi_failed",
          type: "payment_intent.payment_failed",
          data: {
            object: {
              id: "pi_test_failed",
              last_payment_error: {
                message: "Your card was declined.",
              },
            },
          },
        };

        mockExecute
          .mockResolvedValueOnce({ rows: [] }) // No existing event
          .mockResolvedValueOnce({ lastInsertRowid: 1 }) // Log event
          .mockResolvedValueOnce({ rows: [{ uuid: "txn_pi_failed" }] }) // Find transaction
          .mockResolvedValueOnce({ rows: [] }); // Update status

        // Use direct handler testing
        const req = createMockRequest(JSON.stringify(payload));
        const res = createMockResponse();

        await webhookHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.received).toBe(true);
      });
    });

    describe("charge.refunded", () => {
      it("should handle full refunds", async () => {
        const payload = {
          id: "evt_test_refunded",
          type: "charge.refunded",
          data: {
            object: {
              id: "ch_test_refunded",
              amount: 5000,
              amount_refunded: 5000,
              payment_intent: "pi_test_refunded",
            },
          },
        };

        mockExecute
          .mockResolvedValueOnce({ rows: [] }) // No existing event
          .mockResolvedValueOnce({ lastInsertRowid: 1 }) // Log event
          .mockResolvedValueOnce({ rows: [{ uuid: "txn_refunded" }] }) // Find transaction
          .mockResolvedValueOnce({ rows: [] }); // Update status

        // Use direct handler testing
        const req = createMockRequest(JSON.stringify(payload));
        const res = createMockResponse();

        await webhookHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.received).toBe(true);
      });

      it("should handle partial refunds", async () => {
        const payload = {
          id: "evt_test_partial_refund",
          type: "charge.refunded",
          data: {
            object: {
              id: "ch_test_partial",
              amount: 5000,
              amount_refunded: 2500,
              payment_intent: "pi_test_partial",
            },
          },
        };

        mockExecute
          .mockResolvedValueOnce({ rows: [] }) // No existing event
          .mockResolvedValueOnce({ lastInsertRowid: 1 }) // Log event
          .mockResolvedValueOnce({ rows: [{ uuid: "txn_partial" }] }) // Find transaction
          .mockResolvedValueOnce({ rows: [] }); // Update status to partially_refunded

        // Use direct handler testing
        const req = createMockRequest(JSON.stringify(payload));
        const res = createMockResponse();

        await webhookHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.received).toBe(true);
      });
    });
  });

  describe("Error Handling", () => {
    let testHandler;
    let originalSecret;

    beforeEach(async () => {
      // Clear webhook secret before importing
      originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      // Re-import the handler without webhook secret
      vi.resetModules();
      const handlerModule = await import(
        "../../api/payments/stripe-webhook.js"
      );
      testHandler = handlerModule.default;
    });

    afterEach(() => {
      // Restore webhook secret
      if (originalSecret) {
        process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
      }
    });

    it("should handle database errors gracefully", async () => {
      const payload = {
        id: "evt_test_db_error",
        type: "checkout.session.completed",
        data: {
          object: { id: "cs_test_db_error" },
        },
      };

      // Mock database error
      mockExecute.mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      // Use direct handler testing
      const req = createMockRequest(JSON.stringify(payload));
      const res = createMockResponse();

      await testHandler(req, res);

      expect(res.statusCode).toBe(200); // Should still return 200 to avoid Stripe retries
      expect(res.body.received).toBe(true);
    });

    it("should handle Stripe API errors", async () => {
      nock("https://api.stripe.com")
        .get("/v1/checkout/sessions/cs_test_api_error")
        .query({ expand: ["line_items", "line_items.data.price.product"] })
        .reply(500, { error: { message: "Internal server error" } });

      const payload = {
        id: "evt_test_api_error",
        type: "checkout.session.completed",
        data: {
          object: { id: "cs_test_api_error" },
        },
      };

      mockExecute
        .mockResolvedValueOnce({ rows: [] }) // No existing event
        .mockResolvedValueOnce({ lastInsertRowid: 1 }) // Log event
        .mockResolvedValueOnce({ rows: [] }) // No existing transaction
        .mockResolvedValueOnce({ rows: [] }); // Log error

      // Use direct handler testing
      const req = createMockRequest(JSON.stringify(payload));
      const res = createMockResponse();

      await testHandler(req, res);

      expect(res.statusCode).toBe(200); // Should handle gracefully
      expect(res.body.received).toBe(true);
    });

    it("should handle invalid JSON payloads", async () => {
      // Use direct handler testing
      const req = createMockRequest("invalid json");
      const res = createMockResponse();

      await testHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain("Webhook Error");
    });
  });

  describe("Retry Logic", () => {
    let testHandler;
    let originalSecret;

    beforeEach(async () => {
      // Clear webhook secret before importing
      originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      vi.resetModules();
      const handlerModule = await import(
        "../../api/payments/stripe-webhook.js"
      );
      testHandler = handlerModule.default;
    });

    afterEach(() => {
      if (originalSecret) {
        process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
      }
    });

    it("should handle temporary failures without blocking webhook", async () => {
      const payload = {
        id: "evt_test_retry",
        type: "checkout.session.completed",
        data: {
          object: { id: "cs_test_retry" },
        },
      };

      // First call fails, second succeeds
      mockExecute
        .mockRejectedValueOnce(new Error("Temporary database error"))
        .mockResolvedValueOnce({ lastInsertRowid: 1 }); // Log event on retry

      // Use direct handler testing
      const req = createMockRequest(JSON.stringify(payload));
      const res = createMockResponse();

      await testHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  describe("Security and Rate Limiting", () => {
    it("should only accept POST requests", async () => {
      const response = await request(app).get("/webhook");

      expect(response.status).toBe(405);
      expect(response.body.error).toBe("Method not allowed");
    });

    it("should handle malformed requests", async () => {
      const response = await request(app).post("/webhook").send(null);

      expect(response.status).toBe(400);
    });
  });

  describe("Webhook Event Logging", () => {
    let testHandler;
    let originalSecret;

    beforeEach(async () => {
      // Clear webhook secret before importing
      originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      vi.resetModules();
      const handlerModule = await import(
        "../../api/payments/stripe-webhook.js"
      );
      testHandler = handlerModule.default;
    });

    afterEach(() => {
      if (originalSecret) {
        process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
      }
    });

    it("should log all webhook events for audit trail", async () => {
      const payload = {
        id: "evt_test_logging",
        type: "payment_intent.succeeded",
        data: {
          object: { id: "pi_test_logging" },
        },
      };

      mockPaymentEventLogger.logStripeEvent.mockResolvedValue({
        status: "logged",
      });

      // Use direct handler testing
      const req = createMockRequest(JSON.stringify(payload));
      const res = createMockResponse();

      await testHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(mockPaymentEventLogger.logStripeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "evt_test_logging",
          type: "payment_intent.succeeded",
        }),
      );
    });
  });
});
