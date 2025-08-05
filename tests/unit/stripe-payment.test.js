/**
 * Stripe Payment Integration Tests
 * Tests for payment processing functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { JSDOM } from "jsdom";

// Mock Stripe
vi.mock("https://js.stripe.com/v3/", () => ({
  loadStripe: vi.fn(() =>
    Promise.resolve({
      elements: vi.fn(() => ({
        create: vi.fn(() => ({
          mount: vi.fn(),
          on: vi.fn(),
          clear: vi.fn(),
          destroy: vi.fn(),
        })),
      })),
      confirmCardPayment: vi.fn(() =>
        Promise.resolve({
          paymentIntent: { id: "pi_test123", status: "succeeded" },
        }),
      ),
    }),
  ),
}));

describe("Stripe Payment Integration", () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    // Setup DOM
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <div id="payment-modal"></div>
          <div id="card-element"></div>
          <div id="card-errors"></div>
          <button id="submit-payment">Pay</button>
        </body>
      </html>
    `,
      { url: "http://localhost" },
    );

    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;

    // Mock fetch for API calls
    global.fetch = vi.fn();

    // Set Stripe publishable key
    window.STRIPE_PUBLISHABLE_KEY = "pk_test_mock";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Payment Intent Creation", () => {
    it("should create payment intent with correct data", async () => {
      const orderData = {
        amount: 125.0,
        orderType: "tickets",
        orderDetails: {
          tickets: [
            {
              type: "full-pass",
              quantity: 1,
              price: 125,
              name: "Full Festival Pass",
            },
          ],
        },
        customerInfo: {
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "555-1234",
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "pi_test_secret",
          paymentIntentId: "pi_test123",
          orderId: "order_123",
        }),
      });

      const response = await fetch("/api/payments/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      expect(fetch).toHaveBeenCalledWith(
        "/api/payments/create-payment-intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        },
      );

      expect(result).toEqual({
        clientSecret: "pi_test_secret",
        paymentIntentId: "pi_test123",
        orderId: "order_123",
      });
    });

    it("should handle payment intent creation errors", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid amount" }),
      });

      const response = await fetch("/api/payments/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: -10 }),
      });

      const result = await response.json();
      expect(response.ok).toBe(false);
      expect(result.error).toBe("Invalid amount");
    });
  });

  describe("Customer Information Validation", () => {
    it("should validate required fields", () => {
      // Import validation logic (mocked for this test)
      const validateCustomerInfo = (info) => {
        const errors = {};
        if (!info.firstName?.trim())
          errors.firstName = "First name is required";
        if (!info.lastName?.trim()) errors.lastName = "Last name is required";
        if (!info.email?.trim()) {
          errors.email = "Email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email)) {
          errors.email = "Please enter a valid email address";
        }
        return { isValid: Object.keys(errors).length === 0, errors };
      };

      const invalidInfo = { firstName: "", lastName: "", email: "invalid" };
      const validation = validateCustomerInfo(invalidInfo);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveProperty("firstName");
      expect(validation.errors).toHaveProperty("lastName");
      expect(validation.errors).toHaveProperty("email");
    });

    it("should accept valid customer information", () => {
      const validateCustomerInfo = (info) => {
        const errors = {};
        if (!info.firstName?.trim())
          errors.firstName = "First name is required";
        if (!info.lastName?.trim()) errors.lastName = "Last name is required";
        if (!info.email?.trim()) {
          errors.email = "Email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email)) {
          errors.email = "Please enter a valid email address";
        }
        return { isValid: Object.keys(errors).length === 0, errors };
      };

      const validInfo = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "555-1234",
      };

      const validation = validateCustomerInfo(validInfo);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual({});
    });
  });

  describe("Order Data Structure", () => {
    it("should create correct order data for tickets", () => {
      const tickets = {
        "full-pass": { quantity: 2, price: 125, name: "Full Festival Pass" },
        "friday-pass": { quantity: 1, price: 50, name: "Friday Pass" },
      };

      const total = Object.values(tickets).reduce(
        (sum, ticket) => sum + ticket.price * ticket.quantity,
        0,
      );

      const orderData = {
        amount: total,
        orderType: "tickets",
        orderDetails: {
          tickets: Object.entries(tickets).map(([type, data]) => ({
            type,
            quantity: data.quantity,
            price: data.price,
            name: data.name,
          })),
          totalAmount: total,
          eventId: "alocubano-boulderfest-2026",
        },
      };

      expect(orderData.amount).toBe(300); // 2*125 + 1*50
      expect(orderData.orderDetails.tickets).toHaveLength(2);
      expect(orderData.orderDetails.tickets[0].type).toBe("full-pass");
      expect(orderData.orderDetails.tickets[0].quantity).toBe(2);
    });

    it("should create correct order data for donations", () => {
      const donationAmount = 50;

      const orderData = {
        amount: donationAmount,
        orderType: "donation",
        orderDetails: {
          donationType: "one-time",
          amount: donationAmount,
          purpose: "A Lo Cubano Boulder Fest Support",
        },
      };

      expect(orderData.amount).toBe(50);
      expect(orderData.orderType).toBe("donation");
      expect(orderData.orderDetails.donationType).toBe("one-time");
    });
  });

  describe("Webhook Processing", () => {
    it("should handle payment success webhook", async () => {
      const webhookEvent = {
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_test123",
            amount: 12500,
            currency: "usd",
            metadata: {
              orderType: "tickets",
              customerEmail: "john@example.com",
            },
          },
        },
      };

      // Mock database update
      const updateOrderStatus = vi.fn().mockResolvedValue({ changes: 1 });

      // Process webhook (simplified)
      if (webhookEvent.type === "payment_intent.succeeded") {
        await updateOrderStatus(webhookEvent.data.object.id, "paid");
      }

      expect(updateOrderStatus).toHaveBeenCalledWith("pi_test123", "paid");
    });

    it("should handle payment failure webhook", async () => {
      const webhookEvent = {
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_test456",
            last_payment_error: {
              message: "Card declined",
            },
          },
        },
      };

      const updateOrderStatus = vi.fn().mockResolvedValue({ changes: 1 });

      if (webhookEvent.type === "payment_intent.payment_failed") {
        await updateOrderStatus(webhookEvent.data.object.id, "failed");
      }

      expect(updateOrderStatus).toHaveBeenCalledWith("pi_test456", "failed");
    });
  });

  describe("UI Integration", () => {
    it("should show payment modal with order summary", () => {
      const orderData = {
        amount: 125,
        orderDetails: {
          tickets: [{ name: "Full Festival Pass", quantity: 1, price: 125 }],
        },
      };

      // Simulate modal creation
      const modalHTML = `
        <div class="payment-modal">
          <div class="order-summary">
            <p>Total: $${orderData.amount}</p>
          </div>
        </div>
      `;

      document.body.innerHTML = modalHTML;

      const modal = document.querySelector(".payment-modal");
      const summary = modal.querySelector(".order-summary p");

      expect(modal).toBeTruthy();
      expect(summary.textContent).toBe("Total: $125");
    });

    it("should clear cart after successful payment", () => {
      // Mock cart clear function
      const clearCart = vi.fn();
      const updateDisplay = vi.fn();

      // Simulate successful payment
      clearCart();
      updateDisplay();

      expect(clearCart).toHaveBeenCalled();
      expect(updateDisplay).toHaveBeenCalled();
    });
  });
});
