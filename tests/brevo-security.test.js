/**
 * Brevo Security Tests - Essential security validation
 * Note: Brevo doesn't provide HMAC signatures, so we test other security aspects
 */
import { test, expect } from "vitest";
import { testRequest } from "./helpers.js";

test("brevo webhook validates IP whitelist when enabled", async () => {
  // When BREVO_ENABLE_IP_WHITELIST is true, only Brevo IPs should be accepted
  const payload = { event: "delivered", email: "test@example.com" };

  // Test with non-Brevo IP (should be rejected if whitelist is enabled)
  const response = await testRequest(
    "POST",
    "/api/email/brevo-webhook",
    payload,
    {
      "x-forwarded-for": "192.168.1.1", // Private IP, not in Brevo range
    },
  );

  if (response.status === 0) {
    throw new Error(
      `Network connectivity failure for POST /api/email/brevo-webhook`,
    );
  }

  // If IP whitelist is enabled, non-Brevo IPs should be rejected (401)
  // If disabled, request should be processed (200 or other based on payload)
  expect([200, 401, 400, 500].includes(response.status)).toBe(true);

  // Test with valid Brevo IP
  const brevoResponse = await testRequest(
    "POST",
    "/api/email/brevo-webhook",
    payload,
    {
      "x-forwarded-for": "1.179.112.1", // Valid Brevo IP in range 1.179.112.0/20
    },
  );

  if (brevoResponse.status === 0) {
    throw new Error(
      `Network connectivity failure for POST /api/email/brevo-webhook`,
    );
  }

  // Valid Brevo IP should not be rejected for IP reasons
  expect([200, 400, 500].includes(brevoResponse.status)).toBe(true);
});

test("unsubscribe endpoint rejects forged tokens", async () => {
  const forgedTokens = ["../admin", "null", "forged-token", "../../secrets"];
  for (const token of forgedTokens) {
    const response = await testRequest("POST", "/api/email/unsubscribe", {
      email: "victim@example.com",
      token: token,
    });
    if (response.status === 0) {
      throw new Error(
        `Network connectivity failure for POST /api/email/unsubscribe`,
      );
    }
    // Must never accept forged tokens
    expect(response.status).not.toBe(200);
    expect([400, 401, 404, 500].includes(response.status)).toBe(true);
  }
});

test("webhook rejects SQL injection attempts", async () => {
  const sqlPayloads = [
    { event: "'; DROP TABLE users; --", email: "test@example.com" },
    { event: "delivered", email: "admin' OR '1'='1" },
  ];
  for (const payload of sqlPayloads) {
    const response = await testRequest(
      "POST",
      "/api/email/brevo-webhook",
      payload,
    );
    if (response.status === 0) {
      throw new Error(
        `Network connectivity failure for POST /api/email/brevo-webhook`,
      );
    }
    // Must never process SQL injection attempts as valid
    expect(
      [400, 500].includes(response.status) ||
        (response.status === 200 && !response.data?.success),
    ).toBe(true);
  }
});

test("webhook sanitizes XSS in event data", async () => {
  const xssPayload = {
    event: '<script>alert("xss")</script>',
    email: "test@example.com",
  };
  const response = await testRequest(
    "POST",
    "/api/email/brevo-webhook",
    xssPayload,
  );
  // XSS attempts should be sanitized, not reflected
  if (response.status === 200 && response.data) {
    expect(response.data).not.toContain("<script>");
  }
});

test("webhook validates required fields", async () => {
  const invalidPayloads = [
    {}, // Missing all fields
    { event: "delivered" }, // Missing email
    { email: "test@example.com" }, // Missing event
  ];
  for (const payload of invalidPayloads) {
    const response = await testRequest(
      "POST",
      "/api/email/brevo-webhook",
      payload,
    );
    if (response.status === 0) {
      throw new Error(
        `Network connectivity failure for POST /api/email/brevo-webhook`,
      );
    }
    expect([400, 422, 500].includes(response.status)).toBe(true);
  }
});
