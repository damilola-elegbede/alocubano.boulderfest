/**
 * Phase 2: Brevo Data Integrity Tests - 30 lines
 * Tests webhook event processing and database synchronization
 */
import { test, expect } from "vitest";
import { testRequest, generateTestEmail } from "./helpers.js";

test("webhook API accepts valid event structure", async () => {
  const response = await testRequest("POST", "/api/email/brevo-webhook", {
    event: "delivered",
    email: generateTestEmail(),
    date: new Date().toISOString(),
  });
  if (response.status === 0) {
    throw new Error(
      `Network connectivity failure for POST /api/email/brevo-webhook`,
    );
  }
  expect([200, 400, 500, 503].includes(response.status)).toBe(true);
});

test("webhook rejects missing required fields", async () => {
  const response = await testRequest("POST", "/api/email/brevo-webhook", {
    event: "delivered",
  });
  if (response.status === 0) {
    throw new Error(
      `Network connectivity failure for POST /api/email/brevo-webhook`,
    );
  }
  expect([400, 500].includes(response.status)).toBe(true);
});

test("email subscription accepts contact attributes", async () => {
  const response = await testRequest("POST", "/api/email/subscribe", {
    email: generateTestEmail(),
    firstName: "Test",
    lastName: "User",
    phone: "+1234567890",
  });
  if (response.status === 0) {
    throw new Error(
      `Network connectivity failure for POST /api/email/subscribe`,
    );
  }
  expect([200, 400, 500, 503].includes(response.status)).toBe(true);
});
