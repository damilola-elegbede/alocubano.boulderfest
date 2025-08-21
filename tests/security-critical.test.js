/**
 * Security-Critical Tests - Auth and Data Protection
 * Tests JWT manipulation and admin authentication security
 */
import { test, expect } from "vitest";
import { testRequest } from "./helpers.js";

test("admin auth rejects JWT manipulation attempts", async () => {
  // Build JWT with alg:"none" at runtime to avoid tripping secret scanners
  const noneHeader = Buffer.from(
    JSON.stringify({ typ: "JWT", alg: "none" }),
  ).toString("base64url");
  const adminPayload = Buffer.from(JSON.stringify({ id: "admin" })).toString(
    "base64url",
  );
  const noneAlgToken = `${noneHeader}.${adminPayload}.`;
  const maliciousTokens = [
    noneAlgToken,
    "../../../admin-bypass",
    "null",
    "admin-token-injection",
  ];
  for (const token of maliciousTokens) {
    const response = await testRequest("GET", "/api/admin/dashboard", null, {
      Authorization: `Bearer ${token}`,
    });
    if (response.status === 0) {
      throw new Error(
        `Network connectivity failure for GET /api/admin/dashboard`,
      );
    }
    expect([400, 401, 403, 404, 500].includes(response.status)).toBe(true);
  }
});

test("APIs reject XSS payloads in user inputs", async () => {
  const xssPayloads = ['<script>alert("xss")</script>', "javascript:alert(1)"];
  for (const payload of xssPayloads) {
    const response = await testRequest("POST", "/api/email/subscribe", {
      email: payload + "@example.com",
      name: payload,
    });
    if (response.status === 0) {
      throw new Error(
        `Network connectivity failure for POST /api/email/subscribe`,
      );
    }
    // Zero tolerance for successful attacks: do not accept 200 on malicious input
    expect(response.status).not.toBe(200);
    if (response.data) {
      const responseStr =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);
      expect(/<script\b/i.test(responseStr)).toBe(false);
      expect(/javascript:/i.test(responseStr)).toBe(false);
    }
  }
});
