/**
 * Improved Brevo Email Service Integration Tests
 * Demonstrates proper async initialization and mock handling
 */

import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import nock from "nock";
import crypto from "crypto";
import { setupApiTests } from "../utils/enhanced-test-setup.js";

describe("Brevo Email Service Integration - Improved", () => {
  const { getMockDatabase, getMockServices, setupMockResponses } =
    setupApiTests({
      mockDatabase: true,
      mockExternalServices: false, // Test real service integration
      timeout: 20000,
    });

  let app;

  async function createTestApp() {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(express.raw({ type: "application/json" }));

    // Set test environment variables before importing handlers
    process.env.BREVO_API_KEY = "xkeysib-test123";
    process.env.BREVO_NEWSLETTER_LIST_ID = "123";
    process.env.BREVO_WEBHOOK_SECRET = "webhook_secret_123";
    process.env.NODE_ENV = "test";

    // Dynamic import after environment setup
    const [subscribeModule, webhookModule] = await Promise.all([
      import("../../api/email/subscribe.js"),
      import("../../api/email/brevo-webhook.js"),
    ]);

    testApp.post("/api/email/subscribe", subscribeModule.default);
    testApp.post("/api/email/brevo-webhook", webhookModule.default);

    return testApp;
  }

  describe("Email Subscription Flow with Proper Initialization", () => {
    it("should handle subscription with initialized services", async () => {
      const mockDb = getMockDatabase();

      // Setup database responses for createSubscriber flow
      mockDb.execute
        .mockResolvedValueOnce({ lastInsertRowid: 1 }) // INSERT subscriber
        .mockResolvedValueOnce({ lastInsertRowid: 2 }) // INSERT email event
        .mockResolvedValueOnce({ lastInsertRowid: 3 }); // INSERT audit log

      // Setup Brevo API mock
      nock("https://api.brevo.com")
        .post("/v3/contacts", (body) => {
          expect(body.email).toBe("test@example.com");
          expect(body.attributes.FNAME).toBe("John");
          expect(body.attributes.LNAME).toBe("Doe");
          expect(body.listIds).toEqual([123]);
          return true;
        })
        .reply(201, {
          id: 123456,
          email: "test@example.com",
        });

      app = await createTestApp();

      const response = await request(app).post("/api/email/subscribe").send({
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        source: "newsletter_signup",
        consentToMarketing: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain("Successfully subscribed");

      // Verify database interactions - createSubscriber flow
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO email_subscribers"),
        expect.arrayContaining(["test@example.com", "John", "Doe"]),
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO email_events"),
        expect.arrayContaining([1, "subscribed"]),
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO email_audit_log"),
        expect.arrayContaining(["email_subscribers", 1, "create"]),
      );

      nock.cleanAll();
    });

    it("should handle existing subscriber correctly", async () => {
      const mockDb = getMockDatabase();

      // Setup existing subscriber response
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            email: "existing@example.com",
            status: "subscribed",
          },
        ],
      });

      app = await createTestApp();

      const response = await request(app).post("/api/email/subscribe").send({
        email: "existing@example.com",
        firstName: "Jane",
        lastName: "Smith",
        consentToMarketing: true,
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain("already subscribed");
    });

    it("should handle database errors gracefully", async () => {
      const mockDb = getMockDatabase();

      // Simulate database error
      mockDb.execute.mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      app = await createTestApp();

      const response = await request(app).post("/api/email/subscribe").send({
        email: "error@example.com",
        firstName: "Test",
        consentToMarketing: true,
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("error occurred while processing");
    });

    it("should handle Brevo API errors", async () => {
      const mockDb = getMockDatabase();
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      // Mock Brevo API error
      nock("https://api.brevo.com").post("/v3/contacts").reply(400, {
        code: "invalid_parameter",
        message: "Invalid email format",
      });

      app = await createTestApp();

      const response = await request(app).post("/api/email/subscribe").send({
        email: "error@example.com",
        firstName: "Test",
        consentToMarketing: true,
      });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain("temporarily unavailable");

      nock.cleanAll();
    });
  });

  describe("Webhook Processing with Proper Signature Validation", () => {
    const createWebhookPayload = (eventType, email, additionalData = {}) => ({
      event: eventType,
      email: email,
      date: new Date().toISOString(),
      ...additionalData,
    });

    const createValidSignature = (payload) => {
      return crypto
        .createHmac("sha256", process.env.BREVO_WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest("hex");
    };

    it("should process valid webhook with signature", async () => {
      const mockDb = getMockDatabase();
      const payload = createWebhookPayload("delivered", "test@example.com");
      const signature = createValidSignature(payload);

      mockDb.execute
        .mockResolvedValueOnce({
          rows: [{ id: 1, email: "test@example.com" }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Log event

      app = await createTestApp();

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(JSON.stringify(payload))
        .set("Content-Type", "application/json")
        .set("x-brevo-signature", signature);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Email delivery recorded");

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO email_events"),
        expect.arrayContaining(["test@example.com", "delivered"]),
      );
    });

    it("should reject webhooks with invalid signatures", async () => {
      const payload = createWebhookPayload("delivered", "test@example.com");

      app = await createTestApp();

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(JSON.stringify(payload))
        .set("Content-Type", "application/json")
        .set("x-brevo-signature", "invalid_signature");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should handle unsubscribe events", async () => {
      const mockDb = getMockDatabase();
      const payload = createWebhookPayload(
        "unsubscribed",
        "unsubscribe@example.com",
      );
      const signature = createValidSignature(payload);

      mockDb.execute
        .mockResolvedValueOnce({
          rows: [
            { id: 1, email: "unsubscribe@example.com", status: "subscribed" },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // Update status
        .mockResolvedValueOnce({ rows: [] }); // Log event

      app = await createTestApp();

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(JSON.stringify(payload))
        .set("Content-Type", "application/json")
        .set("x-brevo-signature", signature);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Unsubscribe processed");

      // Verify status update
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE email_subscribers SET status = ?"),
        ["unsubscribed", "unsubscribe@example.com"],
      );
    });

    it("should handle bounce events", async () => {
      const mockDb = getMockDatabase();
      const payload = createWebhookPayload(
        "hard_bounce",
        "bounce@example.com",
        {
          reason: "mailbox_not_found",
        },
      );
      const signature = createValidSignature(payload);

      mockDb.execute
        .mockResolvedValueOnce({
          rows: [{ id: 1, email: "bounce@example.com", status: "subscribed" }],
        })
        .mockResolvedValueOnce({ rows: [] }) // Update status
        .mockResolvedValueOnce({ rows: [] }); // Log event

      app = await createTestApp();

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(JSON.stringify(payload))
        .set("Content-Type", "application/json")
        .set("x-brevo-signature", signature);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        "Hard bounce processed, contact marked as bounced",
      );

      // Verify status update
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE email_subscribers SET status = ?"),
        ["bounced", "bounce@example.com"],
      );
    });

    it("should handle unknown subscribers gracefully", async () => {
      const mockDb = getMockDatabase();
      const payload = createWebhookPayload("delivered", "unknown@example.com");
      const signature = createValidSignature(payload);

      mockDb.execute.mockResolvedValueOnce({ rows: [] }); // No subscriber found

      app = await createTestApp();

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(JSON.stringify(payload))
        .set("Content-Type", "application/json")
        .set("x-brevo-signature", signature);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        "Webhook processed (subscriber not found)",
      );
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should handle invalid JSON gracefully", async () => {
      app = await createTestApp();

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send("invalid json")
        .set("Content-Type", "application/json");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid JSON payload");
    });

    it("should validate required fields", async () => {
      app = await createTestApp();

      // Missing email field
      const response = await request(app).post("/api/email/subscribe").send({
        firstName: "Test",
        lastName: "User",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Email address is required");
    });

    it("should sanitize malicious input", async () => {
      const mockDb = getMockDatabase();
      const maliciousName = "<script>alert('xss')</script>";

      mockDb.execute
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ lastInsertRowid: 1 });

      nock("https://api.brevo.com")
        .post("/v3/contacts", (body) => {
          expect(body.attributes.FNAME).not.toContain("<script>");
          return true;
        })
        .reply(201, { id: 123456, email: "test@example.com" });

      app = await createTestApp();

      const response = await request(app).post("/api/email/subscribe").send({
        email: "test@example.com",
        firstName: maliciousName,
        lastName: "User",
        consentToMarketing: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      nock.cleanAll();
    });
  });
});
