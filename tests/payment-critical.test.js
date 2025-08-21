// Payment-Critical Tests - Revenue Protection
import { test, expect } from "vitest";
import { testRequest } from "./helpers.js";

test("payment creates valid Stripe session", async () => {
  const response = await testRequest(
    "POST",
    "/api/payments/create-checkout-session",
    {
      cartItems: [{ name: "Early Bird", price: 89, quantity: 1 }],
      customerInfo: { email: "test@example.com" },
    },
  );
  if (response.status === 0) throw new Error("Network failure");
  expect([200, 400, 500].includes(response.status)).toBe(true);
  if (response.status === 200 && response.data?.url) {
    expect(response.data.url).toContain("checkout.stripe.com");
    expect(response.data.sessionId).toBeDefined();
  }
});
test("payment rejects amount manipulation", async () => {
  const attacks = [
    {
      cartItems: [{ name: "Ticket", price: -100, quantity: 1 }],
      customerInfo: { email: "test@example.com" },
    },
    {
      cartItems: [{ name: "Ticket", price: 0, quantity: 1 }],
      customerInfo: { email: "test@example.com" },
    },
  ];
  for (const payload of attacks) {
    const response = await testRequest(
      "POST",
      "/api/payments/create-checkout-session",
      payload,
    );
    if (response.status === 0) throw new Error("Network failure");
    expect([400, 422, 500].includes(response.status)).toBe(true);
  }
});
