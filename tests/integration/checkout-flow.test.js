/**
 * Integration Tests for Complete Stripe Checkout Flow
 * Tests the full checkout process including cart processing, webhooks, and success handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMocks } from "node-mocks-http";

// Mock database that maintains state across test operations
const mockDbState = {
  orders: new Map(),
  migrations: [],
};

const mockDb = {
  run: vi.fn((sql, params = []) => {
    if (sql.includes("INSERT INTO orders")) {
      const [
        id,
        stripeId,
        email,
        name,
        phone,
        type,
        details,
        total,
        status,
        requests,
      ] = params;
      mockDbState.orders.set(id, {
        id,
        stripe_payment_intent_id: stripeId,
        customer_email: email,
        customer_name: name,
        customer_phone: phone,
        order_type: type,
        order_details: details,
        order_total: total,
        fulfillment_status: status,
        special_requests: requests,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return Promise.resolve({ changes: 1 });
    } else if (
      sql.includes("UPDATE orders") &&
      sql.includes("stripe_payment_intent_id") &&
      sql.includes("WHERE id = ?")
    ) {
      const [sessionId, orderId] = params;
      const order = mockDbState.orders.get(orderId);
      if (order) {
        order.stripe_payment_intent_id = sessionId;
        order.stripe_checkout_session_id = sessionId; // Also set session ID for lookups
        order.updated_at = new Date().toISOString();
        return Promise.resolve({ changes: 1 });
      }
      return Promise.resolve({ changes: 0 });
    } else if (
      sql.includes("UPDATE orders") &&
      sql.includes("fulfillment_status")
    ) {
      const [identifier] = params;
      // Handle different update types
      if (sql.includes("stripe_payment_intent_id")) {
        // Webhook updates by payment intent
        for (const [orderId, order] of mockDbState.orders) {
          if (order.stripe_payment_intent_id === identifier) {
            if (sql.includes("'paid'")) order.fulfillment_status = "paid";
            else if (sql.includes("'failed'"))
              order.fulfillment_status = "failed";
            else if (sql.includes("'expired'"))
              order.fulfillment_status = "expired";
            order.updated_at = new Date().toISOString();
            return Promise.resolve({ changes: 1 });
          }
        }
      } else if (sql.includes("stripe_checkout_session_id")) {
        // Webhook updates by checkout session ID
        for (const [orderId, order] of mockDbState.orders) {
          if (order.stripe_checkout_session_id === identifier) {
            if (sql.includes("'paid'")) order.fulfillment_status = "paid";
            else if (sql.includes("'failed'"))
              order.fulfillment_status = "failed";
            else if (sql.includes("'expired'"))
              order.fulfillment_status = "expired";
            order.updated_at = new Date().toISOString();
            return Promise.resolve({ changes: 1 });
          }
        }
      } else if (sql.includes("WHERE id = ?")) {
        // Cancel handler updates by order ID
        const order = mockDbState.orders.get(identifier);
        if (order && order.fulfillment_status === "awaiting_payment") {
          order.fulfillment_status = "cancelled";
          order.updated_at = new Date().toISOString();
          return Promise.resolve({ changes: 1 });
        }
      }
      return Promise.resolve({ changes: 0 });
    }
    return Promise.resolve({ changes: 0 });
  }),
  get: vi.fn((sql, params = []) => {
    if (sql.includes("SELECT * FROM orders") && params.length === 1) {
      const [identifier] = params;
      // Find by ID, stripe_payment_intent_id, or stripe_checkout_session_id
      for (const [orderId, order] of mockDbState.orders) {
        if (
          order.id === identifier ||
          order.stripe_payment_intent_id === identifier ||
          order.stripe_checkout_session_id === identifier
        ) {
          return Promise.resolve(order);
        }
      }
      return Promise.resolve(null);
    } else if (
      sql.includes("SELECT id, fulfillment_status") &&
      params.length === 1
    ) {
      const [orderId] = params;
      const order = mockDbState.orders.get(orderId);
      if (order) {
        return Promise.resolve({
          id: order.id,
          fulfillment_status: order.fulfillment_status,
        });
      }
      return Promise.resolve(null);
    } else if (
      sql.includes("SELECT customer_email, customer_name") &&
      params.length === 1
    ) {
      const [identifier] = params;
      // Find by stripe_payment_intent_id
      for (const [orderId, order] of mockDbState.orders) {
        if (order.stripe_payment_intent_id === identifier) {
          return Promise.resolve({
            customer_email: order.customer_email,
            customer_name: order.customer_name,
          });
        }
      }
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  }),
};

// Mock Stripe with realistic behavior
let mockStripeSessionCounter = 1;
const mockStripeSessions = new Map();

const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn((params) => {
        const sessionId = `cs_test_${mockStripeSessionCounter++}`;
        const session = {
          id: sessionId,
          url: `https://checkout.stripe.com/c/pay/${sessionId}`,
          payment_status: "unpaid",
          metadata: params.metadata,
          line_items: params.line_items,
          customer_email: params.customer_email,
          customer_details: {
            email: params.customer_email,
          },
          amount_total: params.line_items.reduce((total, item) => {
            return total + item.price_data.unit_amount * item.quantity;
          }, 0),
        };
        mockStripeSessions.set(sessionId, session);
        return Promise.resolve(session);
      }),
      retrieve: vi.fn((sessionId) => {
        const session = mockStripeSessions.get(sessionId);
        return Promise.resolve(session || null);
      }),
    },
  },
  webhooks: {
    constructEvent: vi.fn((body, signature, secret) => {
      // Parse the event from the body
      try {
        return JSON.parse(body.toString());
      } catch {
        throw new Error("Invalid JSON in webhook body");
      }
    }),
  },
};

// Mock Brevo service
const mockBrevoService = {
  sendTransactionalEmail: vi
    .fn()
    .mockResolvedValue({ messageId: "mock_message_id" }),
};

// Mock modules
vi.mock("../../api/lib/database.js", () => ({
  openDb: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => mockStripe),
}));

vi.mock("../../api/lib/brevo-service.js", () => ({
  getBrevoService: vi.fn(() => mockBrevoService),
}));

// Load handlers
let createCheckoutSessionHandler;
let checkoutSuccessHandler;
let checkoutCancelHandler;
let stripeWebhookHandler;

describe("Complete Checkout Flow Integration", () => {
  beforeEach(async () => {
    // Reset all mocks and state
    vi.clearAllMocks();
    mockDbState.orders.clear();
    mockStripeSessions.clear();
    mockStripeSessionCounter = 1;

    // Set up environment variables
    process.env.STRIPE_SECRET_KEY = "test_stripe_key";
    process.env.STRIPE_WEBHOOK_SECRET = "test_webhook_secret";
    process.env.BREVO_ORDER_CONFIRMATION_TEMPLATE_ID = "2";
    process.env.NODE_ENV = "test";

    // Import handlers after mocks are set up
    const createSessionModule = await import(
      "../../api/payments/create-checkout-session.js"
    );
    const successModule = await import(
      "../../api/payments/checkout-success.js"
    );
    const cancelModule = await import("../../api/payments/checkout-cancel.js");
    const webhookModule = await import("../../api/payments/stripe-webhook.js");

    createCheckoutSessionHandler = createSessionModule.default;
    checkoutSuccessHandler = successModule.default;
    checkoutCancelHandler = cancelModule.default;
    stripeWebhookHandler = webhookModule.default;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.BREVO_ORDER_CONFIRMATION_TEMPLATE_ID;
    delete process.env.NODE_ENV;
  });

  describe("Successful Checkout Flow", () => {
    it("should complete full checkout flow for ticket purchase", async () => {
      const cartItems = [
        {
          name: "Early Bird Ticket",
          price: 25,
          quantity: 2,
          type: "ticket",
          ticketType: "early_bird",
          eventDate: "2026-05-15",
          description: "Festival pass for all 3 days",
        },
      ];

      const customerInfo = {
        email: "integration@test.com",
        firstName: "Integration",
        lastName: "Test",
        phone: "+1234567890",
      };

      // Step 1: Create checkout session
      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: { cartItems, customerInfo },
      });

      await createCheckoutSessionHandler(createReq, createRes);

      expect(createRes._getStatusCode()).toBe(200);
      const createResponse = JSON.parse(createRes._getData());

      expect(createResponse.checkoutUrl).toMatch(
        /^https:\/\/checkout\.stripe\.com/,
      );
      expect(createResponse.sessionId).toMatch(/^cs_test_/);
      expect(createResponse.orderId).toMatch(/^order_/);
      expect(createResponse.totalAmount).toBe(50);

      const { sessionId, orderId } = createResponse;

      // Verify order was created in database
      const createdOrder = mockDbState.orders.get(orderId);
      expect(createdOrder).toMatchObject({
        id: orderId,
        customer_email: "integration@test.com",
        customer_name: "Integration Test",
        customer_phone: "+1234567890",
        order_type: "tickets",
        order_total: 5000, // in cents
        fulfillment_status: "awaiting_payment",
      });

      // Verify order details
      const orderDetails = JSON.parse(createdOrder.order_details);
      expect(orderDetails.items).toEqual(cartItems);
      expect(orderDetails.totalAmount).toBe(50);

      // Verify Stripe session was created
      const stripeSession = mockStripeSessions.get(sessionId);
      expect(stripeSession).toMatchObject({
        id: sessionId,
        customer_email: "integration@test.com",
        amount_total: 5000,
        metadata: expect.objectContaining({
          orderId,
          orderType: "tickets",
          customerName: "Integration Test",
        }),
      });

      // Step 2: Simulate payment completion via webhook
      // The payment intent ID needs to match what the webhook will look for
      const paymentIntentId = `pi_${sessionId.replace("cs_", "")}`;

      // Update the order to have this payment intent ID (simulating what Stripe would do)
      const orderInDb = mockDbState.orders.get(orderId);
      if (orderInDb) {
        orderInDb.stripe_payment_intent_id = paymentIntentId;
      }

      const webhookEvent = {
        type: "checkout.session.completed",
        data: {
          object: {
            id: sessionId,
            payment_intent: paymentIntentId,
          },
        },
      };

      // Update session to paid status for success handler
      stripeSession.payment_status = "paid";

      const { req: webhookReq, res: webhookRes } = createMocks({
        method: "POST",
        headers: {
          "stripe-signature": "test_signature",
        },
      });

      // Mock the async iterator for raw body
      webhookReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(webhookEvent));
      };

      await stripeWebhookHandler(webhookReq, webhookRes);

      expect(webhookRes._getStatusCode()).toBe(200);

      // Verify order status was updated to paid
      const updatedOrder = mockDbState.orders.get(orderId);
      expect(updatedOrder.fulfillment_status).toBe("paid");

      // Verify confirmation email was sent
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledWith(
        "integration@test.com",
        "2",
        expect.objectContaining({
          customerName: "Integration Test",
          orderId,
          orderType: "tickets",
          totalAmount: "50.00",
        }),
      );

      // Step 3: Handle success page visit
      const { req: successReq, res: successRes } = createMocks({
        method: "GET",
        query: { session_id: sessionId },
      });

      await checkoutSuccessHandler(successReq, successRes);

      expect(successRes._getStatusCode()).toBe(200);
      const successResponse = JSON.parse(successRes._getData());

      expect(successResponse).toMatchObject({
        success: true,
        message: "Payment successful! Thank you for your purchase.",
        order: {
          id: orderId,
          customerEmail: "integration@test.com",
          customerName: "Integration Test",
          orderType: "tickets",
          totalAmount: 50,
          items: cartItems,
        },
        session: {
          id: sessionId,
          paymentStatus: "paid",
          customerEmail: "integration@test.com",
          amountTotal: 50,
        },
        instructions: {
          clearCart: true,
          redirectDelay: 5000,
          nextSteps: expect.arrayContaining([
            "Check your email for order confirmation",
            "Save your order confirmation number",
            "Contact us if you have any questions",
          ]),
        },
      });
    });

    it("should complete full checkout flow for donation", async () => {
      const cartItems = [
        {
          name: "Festival Support",
          price: 20,
          quantity: 1,
          type: "donation",
          category: "general",
          description: "Support our festival",
        },
      ];

      const customerInfo = {
        email: "donor@test.com",
        firstName: "Generous",
        lastName: "Donor",
      };

      // Step 1: Create checkout session
      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: { cartItems, customerInfo },
      });

      await createCheckoutSessionHandler(createReq, createRes);

      expect(createRes._getStatusCode()).toBe(200);
      const createResponse = JSON.parse(createRes._getData());

      const { sessionId, orderId } = createResponse;

      // Verify donation order type
      const createdOrder = mockDbState.orders.get(orderId);
      expect(createdOrder.order_type).toBe("donation");

      // Step 2: Complete payment via webhook
      const paymentIntentId = `pi_${sessionId.replace("cs_", "")}`;

      // Update the order to have this payment intent ID (simulating what Stripe would do)
      const orderInDb = mockDbState.orders.get(orderId);
      if (orderInDb) {
        orderInDb.stripe_payment_intent_id = paymentIntentId;
      }

      const webhookEvent = {
        type: "checkout.session.completed",
        data: {
          object: {
            id: sessionId,
            payment_intent: paymentIntentId,
          },
        },
      };

      mockStripeSessions.get(sessionId).payment_status = "paid";

      const { req: webhookReq, res: webhookRes } = createMocks({
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
      });

      // Mock the async iterator for raw body
      webhookReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(webhookEvent));
      };

      await stripeWebhookHandler(webhookReq, webhookRes);

      expect(webhookRes._getStatusCode()).toBe(200);

      // Step 3: Verify success handling
      const { req: successReq, res: successRes } = createMocks({
        method: "GET",
        query: { session_id: sessionId },
      });

      await checkoutSuccessHandler(successReq, successRes);

      expect(successRes._getStatusCode()).toBe(200);
      const successResponse = JSON.parse(successRes._getData());

      expect(successResponse.order.orderType).toBe("donation");
      expect(successResponse.order.totalAmount).toBe(20);
    });

    it("should handle mixed cart (tickets and donations)", async () => {
      const cartItems = [
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
      ];

      const customerInfo = {
        email: "mixed@test.com",
        firstName: "Mixed",
        lastName: "Cart",
      };

      // Create checkout session
      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: { cartItems, customerInfo },
      });

      await createCheckoutSessionHandler(createReq, createRes);

      expect(createRes._getStatusCode()).toBe(200);
      const createResponse = JSON.parse(createRes._getData());

      expect(createResponse.totalAmount).toBe(40); // 25 + 15

      // Verify mixed cart is classified as 'tickets'
      const createdOrder = mockDbState.orders.get(createResponse.orderId);
      expect(createdOrder.order_type).toBe("tickets");

      // Verify Stripe line items
      const stripeSession = mockStripeSessions.get(createResponse.sessionId);
      expect(stripeSession.line_items).toHaveLength(2);
      expect(stripeSession.amount_total).toBe(4000); // 40.00 in cents
    });
  });

  describe("Cancelled Checkout Flow", () => {
    it("should handle checkout cancellation properly", async () => {
      const cartItems = [
        { name: "Test Ticket", price: 30, quantity: 1, type: "ticket" },
      ];

      const customerInfo = {
        email: "cancel@test.com",
        firstName: "Cancel",
        lastName: "Test",
      };

      // Step 1: Create checkout session
      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: { cartItems, customerInfo },
      });

      await createCheckoutSessionHandler(createReq, createRes);

      expect(createRes._getStatusCode()).toBe(200);
      const createResponse = JSON.parse(createRes._getData());

      const { sessionId, orderId } = createResponse;

      // Verify initial order status
      const createdOrder = mockDbState.orders.get(orderId);
      expect(createdOrder.fulfillment_status).toBe("awaiting_payment");

      // Step 2: Handle checkout cancellation
      const { req: cancelReq, res: cancelRes } = createMocks({
        method: "GET",
        query: { session_id: sessionId, order_id: orderId },
      });

      await checkoutCancelHandler(cancelReq, cancelRes);

      expect(cancelRes._getStatusCode()).toBe(200);
      const cancelResponse = JSON.parse(cancelRes._getData());

      expect(cancelResponse).toMatchObject({
        cancelled: true,
        message: "Checkout was cancelled. Your cart items have been preserved.",
        instructions: {
          preserveCart: true,
          redirectUrl: "/tickets",
          redirectDelay: 3000,
          nextSteps: expect.arrayContaining([
            "Your cart items are still saved",
            "You can complete your purchase anytime",
            "Contact us if you experienced any issues",
          ]),
        },
        supportInfo: {
          email: "alocubanoboulderfest@gmail.com",
          instagram: "@alocubano.boulderfest",
          message: "Need help? Contact us for assistance with your purchase.",
        },
      });

      // Verify order status was updated to cancelled
      const cancelledOrder = mockDbState.orders.get(orderId);
      expect(cancelledOrder.fulfillment_status).toBe("cancelled");
    });

    it("should handle cancellation without order_id gracefully", async () => {
      const { req: cancelReq, res: cancelRes } = createMocks({
        method: "GET",
        query: { session_id: "cs_test_no_order" },
      });

      await checkoutCancelHandler(cancelReq, cancelRes);

      expect(cancelRes._getStatusCode()).toBe(200);
      const cancelResponse = JSON.parse(cancelRes._getData());

      expect(cancelResponse.cancelled).toBe(true);
      expect(cancelResponse.instructions.preserveCart).toBe(true);
    });
  });

  describe("Error Scenarios", () => {
    it("should handle webhook processing with invalid session", async () => {
      const webhookEvent = {
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_nonexistent_session",
            payment_intent: "pi_nonexistent",
          },
        },
      };

      const { req: webhookReq, res: webhookRes } = createMocks({
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
      });

      // Mock the async iterator for raw body
      webhookReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(webhookEvent));
      };

      await stripeWebhookHandler(webhookReq, webhookRes);

      // Should still return 200 to prevent Stripe retries
      expect(webhookRes._getStatusCode()).toBe(200);

      // Should not have sent any emails
      expect(mockBrevoService.sendTransactionalEmail).not.toHaveBeenCalled();
    });

    it("should handle success page with invalid session", async () => {
      const { req: successReq, res: successRes } = createMocks({
        method: "GET",
        query: { session_id: "cs_invalid_session" },
      });

      await checkoutSuccessHandler(successReq, successRes);

      expect(successRes._getStatusCode()).toBe(404);
      const successResponse = JSON.parse(successRes._getData());
      expect(successResponse.error).toBe("Session not found");
    });

    it("should handle database failures during checkout creation", async () => {
      // Mock database failure
      mockDb.run.mockRejectedValueOnce(new Error("Database connection failed"));

      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Test Ticket", price: 25, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            email: "dbfail@test.com",
            firstName: "DB",
            lastName: "Fail",
          },
        },
      });

      await createCheckoutSessionHandler(createReq, createRes);

      expect(createRes._getStatusCode()).toBe(500);
      const createResponse = JSON.parse(createRes._getData());
      expect(createResponse.error).toBe("Failed to create preliminary order");

      // Verify Stripe session was not created
      expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("should handle Stripe API failures during checkout creation", async () => {
      // Mock Stripe failure
      const stripeError = new Error("Stripe API Error");
      stripeError.type = "StripeAPIError";
      mockStripe.checkout.sessions.create.mockRejectedValueOnce(stripeError);

      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Test Ticket", price: 25, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            email: "stripefail@test.com",
            firstName: "Stripe",
            lastName: "Fail",
          },
        },
      });

      await createCheckoutSessionHandler(createReq, createRes);

      expect(createRes._getStatusCode()).toBe(500);
      const createResponse = JSON.parse(createRes._getData());
      expect(createResponse.error).toBe("Stripe API error");
      expect(createResponse.message).toBe(
        "Payment service temporarily unavailable",
      );
    });
  });

  describe("Webhook Event Processing", () => {
    it("should handle async payment succeeded events", async () => {
      // Create initial order
      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Async Ticket", price: 35, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            email: "async@test.com",
            firstName: "Async",
            lastName: "Payment",
          },
        },
      });

      await createCheckoutSessionHandler(createReq, createRes);
      const createResponse = JSON.parse(createRes._getData());
      const { sessionId, orderId } = createResponse;

      // Process async payment succeeded webhook
      const paymentIntentId = `pi_${sessionId.replace("cs_", "")}`;

      // Update the order to have this payment intent ID (simulating what Stripe would do)
      const orderInDb = mockDbState.orders.get(orderId);
      if (orderInDb) {
        orderInDb.stripe_payment_intent_id = paymentIntentId;
      }

      const webhookEvent = {
        type: "checkout.session.async_payment_succeeded",
        data: {
          object: {
            id: sessionId,
            payment_intent: paymentIntentId,
          },
        },
      };

      const { req: webhookReq, res: webhookRes } = createMocks({
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
      });

      // Mock the async iterator for raw body
      webhookReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(webhookEvent));
      };

      await stripeWebhookHandler(webhookReq, webhookRes);

      expect(webhookRes._getStatusCode()).toBe(200);

      // Verify order status was updated
      const updatedOrder = mockDbState.orders.get(orderId);
      expect(updatedOrder.fulfillment_status).toBe("paid");

      // Verify confirmation email was sent
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalled();
    });

    it("should handle async payment failed events", async () => {
      // Create initial order
      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Failed Ticket", price: 35, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            email: "failed@test.com",
            firstName: "Failed",
            lastName: "Payment",
          },
        },
      });

      await createCheckoutSessionHandler(createReq, createRes);
      const createResponse = JSON.parse(createRes._getData());
      const { sessionId, orderId } = createResponse;

      // Process async payment failed webhook
      const paymentIntentId = `pi_${sessionId.replace("cs_", "")}`;

      // Update the order to have this payment intent ID (simulating what Stripe would do)
      const orderInDb = mockDbState.orders.get(orderId);
      if (orderInDb) {
        orderInDb.stripe_payment_intent_id = paymentIntentId;
      }

      const webhookEvent = {
        type: "checkout.session.async_payment_failed",
        data: {
          object: {
            id: sessionId,
            payment_intent: paymentIntentId,
          },
        },
      };

      const { req: webhookReq, res: webhookRes } = createMocks({
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
      });

      // Mock the async iterator for raw body
      webhookReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(webhookEvent));
      };

      await stripeWebhookHandler(webhookReq, webhookRes);

      expect(webhookRes._getStatusCode()).toBe(200);

      // Verify order status was updated to failed
      const updatedOrder = mockDbState.orders.get(orderId);
      expect(updatedOrder.fulfillment_status).toBe("failed");

      // Verify no confirmation email was sent
      expect(mockBrevoService.sendTransactionalEmail).not.toHaveBeenCalled();
    });

    it("should handle session expired events", async () => {
      // Create initial order
      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: {
          cartItems: [
            { name: "Expired Ticket", price: 35, quantity: 1, type: "ticket" },
          ],
          customerInfo: {
            email: "expired@test.com",
            firstName: "Expired",
            lastName: "Session",
          },
        },
      });

      await createCheckoutSessionHandler(createReq, createRes);
      const createResponse = JSON.parse(createRes._getData());
      const { sessionId, orderId } = createResponse;

      // Process session expired webhook
      const paymentIntentId = `pi_${sessionId.replace("cs_", "")}`;

      // Update the order to have this payment intent ID (simulating what Stripe would do)
      const orderInDb = mockDbState.orders.get(orderId);
      if (orderInDb) {
        orderInDb.stripe_payment_intent_id = paymentIntentId;
      }

      const webhookEvent = {
        type: "checkout.session.expired",
        data: {
          object: {
            id: sessionId,
            payment_intent: paymentIntentId,
          },
        },
      };

      const { req: webhookReq, res: webhookRes } = createMocks({
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
      });

      // Mock the async iterator for raw body
      webhookReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(JSON.stringify(webhookEvent));
      };

      await stripeWebhookHandler(webhookReq, webhookRes);

      expect(webhookRes._getStatusCode()).toBe(200);

      // Verify order status was updated to expired
      const updatedOrder = mockDbState.orders.get(orderId);
      expect(updatedOrder.fulfillment_status).toBe("expired");
    });
  });

  describe("Performance and Reliability", () => {
    it("should handle multiple concurrent checkout sessions", async () => {
      const concurrentRequests = 5;
      const handlerPromises = [];
      const responseObjects = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const { req, res } = createMocks({
          method: "POST",
          body: {
            cartItems: [
              {
                name: `Concurrent Ticket ${i}`,
                price: 25,
                quantity: 1,
                type: "ticket",
              },
            ],
            customerInfo: {
              email: `concurrent${i}@test.com`,
              firstName: "Concurrent",
              lastName: `User${i}`,
            },
          },
        });

        responseObjects.push(res);
        handlerPromises.push(createCheckoutSessionHandler(req, res));
      }

      await Promise.all(handlerPromises);

      // All requests should succeed
      responseObjects.forEach((res, index) => {
        expect(res._getStatusCode()).toBe(200);
        const responseData = JSON.parse(res._getData());
        expect(responseData.checkoutUrl).toBeDefined();
        expect(responseData.sessionId).toBeDefined();
        expect(responseData.orderId).toBeDefined();
      });

      // Verify all orders were created
      expect(mockDbState.orders.size).toBe(concurrentRequests);

      // Verify all Stripe sessions were created
      expect(mockStripeSessions.size).toBe(concurrentRequests);
    });

    it("should handle order processing with special characters and edge cases", async () => {
      const cartItems = [
        {
          name: 'Special "Quoted" Ticket & More',
          price: 25.99, // Decimal price
          quantity: 1,
          type: "ticket",
          description: "Ticket with special chars: àáâãäåæçèéêë 中文 🎉",
        },
      ];

      const customerInfo = {
        email: "special+chars@test-domain.co.uk",
        firstName: "José",
        lastName: "García-Smith",
        phone: "+44 20 7123 4567",
        specialRequests:
          "Dietary requirements: vegan, gluten-free. Accessibility: wheelchair access needed.",
      };

      const { req: createReq, res: createRes } = createMocks({
        method: "POST",
        body: { cartItems, customerInfo },
      });

      await createCheckoutSessionHandler(createReq, createRes);

      expect(createRes._getStatusCode()).toBe(200);
      const createResponse = JSON.parse(createRes._getData());

      expect(createResponse.totalAmount).toBe(25.99);

      // Verify special characters are handled properly
      const createdOrder = mockDbState.orders.get(createResponse.orderId);
      expect(createdOrder.customer_name).toBe("José García-Smith");
      expect(createdOrder.customer_email).toBe(
        "special+chars@test-domain.co.uk",
      );
      expect(createdOrder.special_requests).toContain("Dietary requirements");
    });
  });
});
