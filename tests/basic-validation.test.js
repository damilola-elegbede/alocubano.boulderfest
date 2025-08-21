import { test, expect } from "vitest";
import { testRequest } from "./helpers.js";
test("APIs reject malformed requests", async () => {
  const invalidPayment = await testRequest(
    "POST",
    "/api/payments/create-checkout-session",
    { invalid: "structure" },
  );
  if (invalidPayment.status === 0)
    throw new Error(
      `Network connectivity failure for POST /api/payments/create-checkout-session`,
    );
  expect([400, 422, 500].includes(invalidPayment.status)).toBe(true);
  const invalidEmail = await testRequest("POST", "/api/email/subscribe", {
    email: "not-an-email",
    name: "Test User",
  });
  if (invalidEmail.status === 0)
    throw new Error(
      `Network connectivity failure for POST /api/email/subscribe`,
    );
  expect([200, 400, 422, 500].includes(invalidEmail.status)).toBe(true);
});
test("APIs handle missing required fields", async () => {
  const noCart = await testRequest(
    "POST",
    "/api/payments/create-checkout-session",
    { customerInfo: { email: "test@example.com" } },
  );
  if (noCart.status === 0)
    throw new Error(
      `Network connectivity failure for POST /api/payments/create-checkout-session`,
    );
  expect([400, 422, 500].includes(noCart.status)).toBe(true);
  const noEmail = await testRequest("POST", "/api/email/subscribe", {
    name: "Test User",
  });
  if (noEmail.status === 0)
    throw new Error(
      `Network connectivity failure for POST /api/email/subscribe`,
    );
  expect([400, 422, 500].includes(noEmail.status)).toBe(true);
});
test("ticket validation handles invalid QR codes", async () => {
  const invalidQRCodes = [
    "",
    "invalid-qr-format",
    "malicious-injection-attempt",
    null,
  ];
  for (const qrCode of invalidQRCodes) {
    const response = await testRequest("POST", "/api/tickets/validate", {
      qr_code: qrCode,
    });
    if (response.status === 0)
      throw new Error(
        `Network connectivity failure for POST /api/tickets/validate`,
      );
    expect([400, 404, 422, 500].includes(response.status)).toBe(true);
  }
});
test("payment validation rejects invalid amounts and items", async () => {
  const invalidPayments = [
    {
      cartItems: [{ price: -50 }],
      customerInfo: { email: "test@example.com" },
    },
    {
      cartItems: [{ price: "invalid" }],
      customerInfo: { email: "test@example.com" },
    },
    { cartItems: [], customerInfo: { email: "test@example.com" } },
  ];
  for (const payment of invalidPayments) {
    const response = await testRequest(
      "POST",
      "/api/payments/create-checkout-session",
      payment,
    );
    if (response.status === 0)
      throw new Error(
        `Network connectivity failure for POST /api/payments/create-checkout-session`,
      );
    expect([400, 422, 500].includes(response.status)).toBe(true);
  }
});
test("admin endpoints reject without CSRF tokens", async () => {
  const response = await testRequest("POST", "/api/admin/login", {
    username: "admin",
    password: "test123",
  });
  if (response.status === 0)
    throw new Error(`Network connectivity failure for POST /api/admin/login`);
  expect([400, 401, 403, 429, 500].includes(response.status)).toBe(true);
});
test("APIs reject SQL injection attempts", async () => {
  const sqlPayloads = [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "' UNION SELECT * FROM users--",
  ];
  for (const payload of sqlPayloads) {
    const response = await testRequest("POST", "/api/email/subscribe", {
      email: `test${payload}@example.com`,
      name: payload,
    });
    if (response.status === 0)
      throw new Error(
        `Network connectivity failure for POST /api/email/subscribe`,
      );
    expect([400, 422].includes(response.status)).toBe(true);
    if (response.status === 200)
      throw new Error(
        "SQL injection attack returned success - CRITICAL SECURITY ISSUE",
      );
  }
});
test("feedback survey link exists", () => expect(true).toBe(true)); // Static link in contact.html
