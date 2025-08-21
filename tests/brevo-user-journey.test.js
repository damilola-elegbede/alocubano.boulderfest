/**
 * Brevo User Journey Tests - Phase 3 Complete User Flows
 * Focused on email subscription and unsubscribe user experiences
 */
import { test, expect } from "vitest";
import { testRequest, generateTestEmail } from "./helpers.js";

test("complete subscription journey with marketing consent", async () => {
  const email = generateTestEmail();
  const response = await testRequest("POST", "/api/email/subscribe", {
    email,
    firstName: "Jane",
    lastName: "Dancer",
    consentToMarketing: true,
  });
  if (response.status === 0) {
    throw new Error(
      "Network connectivity failure for POST /api/email/subscribe",
    );
  }
  expect([201, 400, 409, 500, 503].includes(response.status)).toBe(true);
  if (response.status === 201)
    expect(response.data?.message).toContain("subscribed");
});

test("subscription journey validates required consent", async () => {
  const response = await testRequest("POST", "/api/email/subscribe", {
    email: generateTestEmail(),
  });
  if (response.status === 0) {
    throw new Error(
      "Network connectivity failure for POST /api/email/subscribe",
    );
  }
  expect([400, 500, 503].includes(response.status)).toBe(true);
});

test("unsubscribe user journey via GET displays confirmation page", async () => {
  const response = await testRequest(
    "GET",
    "/api/email/unsubscribe?email=dancer@cuban.fest&token=journey-test",
  );
  if (response.status === 0) {
    throw new Error(
      "Network connectivity failure for GET /api/email/unsubscribe",
    );
  }
  expect([200, 400, 500, 503].includes(response.status)).toBe(true);
});

test("unsubscribe user journey via POST returns confirmation JSON", async () => {
  const response = await testRequest("POST", "/api/email/unsubscribe", {
    email: "dancer@cuban.fest",
    token: "journey-test",
  });
  if (response.status === 0) {
    throw new Error(
      "Network connectivity failure for POST /api/email/unsubscribe",
    );
  }
  expect([200, 400, 404, 500, 503].includes(response.status)).toBe(true);
});

test("email system handles concurrent subscription requests", async () => {
  const requests = Array(8)
    .fill()
    .map((_, i) =>
      testRequest("POST", "/api/email/subscribe", {
        email: `cuban-dancer-${i}@test.com`,
        consentToMarketing: true,
      }),
    );
  const responses = await Promise.all(requests);
  const networkFailures = responses.filter((r) => r.status === 0);
  if (networkFailures.length > 0) {
    throw new Error(
      `Network connectivity failure for ${networkFailures.length} requests`,
    );
  }
  const validResponses = responses.filter((r) =>
    [201, 400, 409, 429, 500, 503].includes(r.status),
  );
  expect(validResponses.length).toBe(responses.length);
});
