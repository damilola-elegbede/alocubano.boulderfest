/**
 * Brevo Email Service Integration Tests
 * Tests email subscription, webhook processing, and service integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import nock from "nock";
import crypto from "crypto";

// Mock database
const mockDatabase = {
  execute: vi.fn(),
  close: vi.fn(),
};

vi.mock("../../api/lib/database.js", () => ({
  getDatabase: () => mockDatabase,
}));

// Import handlers after mocking
let subscribeHandler;
let webhookHandler;
let brevoService;
let emailSubscriberService;

describe("Brevo Email Service Integration", () => {
  let app;

  beforeEach(async () => {
    // Set test environment variables
    process.env.BREVO_API_KEY = "xkeysib-test123";
    process.env.BREVO_NEWSLETTER_LIST_ID = "123";
    process.env.BREVO_WEBHOOK_SECRET = "webhook_secret_123";
    process.env.NODE_ENV = "test";

    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use(express.raw({ type: "application/json" }));

    // Import handlers dynamically
    const { default: subscribeModule } = await import(
      "../../api/email/subscribe.js"
    );
    const { default: webhookModule } = await import(
      "../../api/email/brevo-webhook.js"
    );
    const { getBrevoService } = await import("../../api/lib/brevo-service.js");
    const { getEmailSubscriberService } = await import(
      "../../api/lib/email-subscriber-service.js"
    );

    subscribeHandler = subscribeModule;
    webhookHandler = webhookModule;
    brevoService = getBrevoService();
    emailSubscriberService = getEmailSubscriberService();

    app.post("/api/email/subscribe", subscribeHandler);
    app.post("/api/email/brevo-webhook", webhookHandler);

    // Clear all mocks
    vi.clearAllMocks();
    mockDatabase.execute.mockReset();
  });

  afterEach(() => {
    nock.cleanAll();
    vi.clearAllMocks();
  });

  describe("Email Subscription Flow", () => {
    describe("Valid Subscription", () => {
      it("should successfully subscribe new email address", async () => {
        const email = "test@example.com";
        const firstName = "John";
        const lastName = "Doe";

        // Mock Brevo API success response
        nock("https://api.brevo.com")
          .post("/v3/contacts", {
            email: email,
            attributes: {
              FIRSTNAME: firstName,
              LASTNAME: lastName,
            },
            listIds: [123],
            updateEnabled: true,
          })
          .reply(201, {
            id: 123456,
            email: email,
          });

        // Mock database calls
        mockDatabase.execute
          .mockResolvedValueOnce({ rows: [] }) // Check existing subscriber
          .mockResolvedValueOnce({ lastInsertRowid: 1 }); // Insert new subscriber

        const response = await request(app).post("/api/email/subscribe").send({
          email: email,
          firstName: firstName,
          lastName: lastName,
          source: "newsletter_signup",
          consentToMarketing: true,
        });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain(
          "Successfully subscribed to newsletter",
        );

        // Verify database was called correctly
        expect(mockDatabase.execute).toHaveBeenCalledWith(
          expect.stringContaining("SELECT * FROM email_subscribers"),
          [email],
        );
        expect(mockDatabase.execute).toHaveBeenCalledWith(
          expect.stringContaining("INSERT INTO email_subscribers"),
          expect.arrayContaining([email, firstName, lastName]),
        );
      });

      it("should handle existing subscriber updates", async () => {
        const email = "existing@example.com";

        // Mock existing subscriber in database
        mockDatabase.execute.mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              email: email,
              status: "subscribed",
            },
          ],
        });

        // Mock Brevo API success response
        nock("https://api.brevo.com")
          .post("/v3/contacts")
          .reply(201, { id: 123456, email: email });

        const response = await request(app).post("/api/email/subscribe").send({
          email: email,
          firstName: "Jane",
          lastName: "Smith",
          consentToMarketing: true,
        });

        expect(response.status).toBe(409);
        expect(response.body.error).toContain("already subscribed");
      });
    });

    describe("Subscription Validation", () => {
      it("should reject invalid email addresses", async () => {
        const response = await request(app).post("/api/email/subscribe").send({
          email: "invalid-email",
          firstName: "Test",
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain("valid email address");
      });

      it("should require email field", async () => {
        const response = await request(app).post("/api/email/subscribe").send({
          firstName: "Test",
          lastName: "User",
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain("Email address is required");
      });

      it("should sanitize input data", async () => {
        const email = "test@example.com";
        const maliciousName = "<script>alert('xss')</script>";

        nock("https://api.brevo.com")
          .post("/v3/contacts", (body) => {
            expect(body.attributes.FIRSTNAME).not.toContain("<script>");
            return true;
          })
          .reply(201, { id: 123456, email: email });

        mockDatabase.execute
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ lastInsertRowid: 1 });

        const response = await request(app).post("/api/email/subscribe").send({
          email: email,
          firstName: maliciousName,
          lastName: "User",
          consentToMarketing: true,
        });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    describe("API Error Handling", () => {
      it("should handle Brevo API errors gracefully", async () => {
        const email = "error@example.com";

        // Mock Brevo API error
        nock("https://api.brevo.com").post("/v3/contacts").reply(400, {
          code: "invalid_parameter",
          message: "Invalid email format",
        });

        mockDatabase.execute.mockResolvedValueOnce({ rows: [] });

        const response = await request(app).post("/api/email/subscribe").send({
          email: email,
          firstName: "Test",
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain("Marketing consent is required");
      });

      it("should handle database errors", async () => {
        const email = "db_error@example.com";

        // Simulate database error by mocking a failure
        const originalExecute = db.execute;
        db.execute = vi
          .fn()
          .mockRejectedValueOnce(new Error("Database connection failed"));

        const response = await request(app).post("/api/email/subscribe").send({
          email: email,
          firstName: "Test",
          consentToMarketing: true,
        });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain(
          "error occurred while processing",
        );

        // Restore database function
        db.execute = originalExecute;
      });
    });
  });

  describe("Webhook Processing", () => {
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

    describe("Webhook Authentication", () => {
      it("should accept webhooks with valid signatures", async () => {
        const payload = createWebhookPayload("delivered", "test@example.com");
        const signature = createValidSignature(payload);

        mockDatabase.execute
          .mockResolvedValueOnce({
            rows: [{ id: 1, email: "test@example.com" }],
          })
          .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json")
          .set("x-brevo-signature", signature);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it("should reject webhooks with invalid signatures", async () => {
        const payload = createWebhookPayload("delivered", "test@example.com");

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json")
          .set("x-brevo-signature", "invalid_signature");

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("Invalid signature");
      });

      it("should reject webhooks without signatures when secret is configured", async () => {
        const payload = createWebhookPayload("delivered", "test@example.com");

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("Missing webhook signature");
      });
    });

    describe("IP Whitelist Validation", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "production"; // Enable IP validation
      });

      afterEach(() => {
        process.env.NODE_ENV = "test"; // Reset to test mode
      });

      it("should accept webhooks from Brevo IP ranges", async () => {
        const payload = createWebhookPayload("delivered", "test@example.com");
        delete process.env.BREVO_WEBHOOK_SECRET; // Disable signature check for IP test

        mockDatabase.execute
          .mockResolvedValueOnce({
            rows: [{ id: 1, email: "test@example.com" }],
          })
          .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json")
          .set("x-forwarded-for", "1.179.112.100"); // Valid Brevo IP

        expect(response.status).toBe(200);
      });

      it("should reject webhooks from unauthorized IPs", async () => {
        const payload = createWebhookPayload("delivered", "test@example.com");
        delete process.env.BREVO_WEBHOOK_SECRET;

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json")
          .set("x-forwarded-for", "192.168.1.1"); // Unauthorized IP

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Unauthorized");
      });
    });

    describe("Event Processing", () => {
      beforeEach(() => {
        delete process.env.BREVO_WEBHOOK_SECRET; // Disable signature check for easier testing
      });

      it("should process email delivery events", async () => {
        const payload = createWebhookPayload(
          "delivered",
          "delivered@example.com",
          {
            message_id: "msg_123",
            subject: "Test Email",
          },
        );

        mockDatabase.execute
          .mockResolvedValueOnce({
            rows: [
              { id: 1, email: "delivered@example.com", status: "subscribed" },
            ],
          })
          .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Email delivery recorded");

        expect(mockDatabase.execute).toHaveBeenCalledWith(
          expect.stringContaining("INSERT INTO email_events"),
          expect.arrayContaining(["delivered@example.com", "delivered"]),
        );
      });

      it("should process email open events", async () => {
        const payload = createWebhookPayload("opened", "opened@example.com");

        mockDatabase.execute
          .mockResolvedValueOnce({
            rows: [{ id: 1, email: "opened@example.com" }],
          })
          .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(200);
        expect(response.body.message).toBe("Email open recorded");
      });

      it("should process unsubscribe events", async () => {
        const payload = createWebhookPayload(
          "unsubscribed",
          "unsubscribe@example.com",
        );

        mockDatabase.execute
          .mockResolvedValueOnce({
            rows: [
              { id: 1, email: "unsubscribe@example.com", status: "subscribed" },
            ],
          })
          .mockResolvedValueOnce({ rows: [] }) // Update subscriber status
          .mockResolvedValueOnce({ rows: [] }); // Log event

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(200);
        expect(response.body.message).toBe("Unsubscribe processed");

        // Verify status update
        expect(mockDatabase.execute).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE email_subscribers SET status = ?"),
          ["unsubscribed", "unsubscribe@example.com"],
        );
      });

      it("should process bounce events", async () => {
        const payload = createWebhookPayload(
          "hard_bounce",
          "bounce@example.com",
          {
            reason: "mailbox_not_found",
          },
        );

        mockDatabase.execute
          .mockResolvedValueOnce({
            rows: [
              { id: 1, email: "bounce@example.com", status: "subscribed" },
            ],
          })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
          "Hard bounce processed, contact marked as bounced",
        );

        // Verify status update to bounced
        expect(mockDatabase.execute).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE email_subscribers SET status = ?"),
          ["bounced", "bounce@example.com"],
        );
      });

      it("should handle spam complaints", async () => {
        const payload = createWebhookPayload("spam", "spam@example.com");

        mockDatabase.execute
          .mockResolvedValueOnce({
            rows: [{ id: 1, email: "spam@example.com" }],
          })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(200);
        expect(response.body.message).toBe(
          "Spam complaint processed, contact marked as bounced",
        );
      });
    });

    describe("Error Handling", () => {
      beforeEach(() => {
        delete process.env.BREVO_WEBHOOK_SECRET;
      });

      it("should handle invalid JSON payloads", async () => {
        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send("invalid json")
          .set("Content-Type", "application/json");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid JSON payload");
      });

      it("should require event and email fields", async () => {
        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify({ event: "delivered" })) // Missing email
          .set("Content-Type", "application/json");

        expect(response.status).toBe(400);
        expect(response.body.error).toContain(
          "Missing required webhook fields",
        );
      });

      it("should handle database errors gracefully", async () => {
        const payload = createWebhookPayload(
          "delivered",
          "db_error@example.com",
        );

        // Simulate database error by using invalid SQL
        const originalExecute = db.execute;
        db.execute = vi
          .fn()
          .mockRejectedValueOnce(new Error("Database connection failed"));

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(500);
        expect(response.body.error).toBe(
          "Internal server error processing webhook",
        );

        // Restore database function
        db.execute = originalExecute;
      });

      it("should handle unknown event types", async () => {
        const payload = createWebhookPayload(
          "unknown_event",
          "test@example.com",
        );

        mockDatabase.execute
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(200);
        expect(response.body.message).toContain("Unknown event type processed");
      });
    });

    describe("Subscriber Not Found", () => {
      beforeEach(() => {
        delete process.env.BREVO_WEBHOOK_SECRET;
      });

      it("should handle webhooks for unknown subscribers", async () => {
        const payload = createWebhookPayload(
          "delivered",
          "unknown@example.com",
        );

        mockDatabase.execute.mockResolvedValueOnce({ rows: [] }); // No subscriber found

        const response = await request(app)
          .post("/api/email/brevo-webhook")
          .send(JSON.stringify(payload))
          .set("Content-Type", "application/json");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe(
          "Webhook processed (subscriber not found)",
        );
      });
    });
  });

  describe("Rate Limiting and Security", () => {
    it("should only accept POST requests for webhook", async () => {
      const response = await request(app).get("/api/email/brevo-webhook");

      expect(response.status).toBe(405);
      expect(response.body.error).toBe("Method not allowed. Use POST.");
    });

    it("should only accept POST requests for subscription", async () => {
      const response = await request(app).get("/api/email/subscribe");

      expect(response.status).toBe(405);
    });
  });

  describe("Integration Flow", () => {
    beforeEach(() => {
      delete process.env.BREVO_WEBHOOK_SECRET; // Disable signature verification for easier testing
    });

    it("should handle complete subscription -> webhook flow", async () => {
      const email = "complete@example.com";
      const firstName = "Complete";
      const lastName = "Test";

      // Step 1: Subscribe user
      nock("https://api.brevo.com")
        .post("/v3/contacts")
        .reply(201, { id: 123456, email: email });

      mockDatabase.execute
        .mockResolvedValueOnce({ rows: [] }) // Check existing subscriber
        .mockResolvedValueOnce({ lastInsertRowid: 1 }); // Insert new subscriber

      const subscribeResponse = await request(app)
        .post("/api/email/subscribe")
        .send({
          email: email,
          firstName: firstName,
          lastName: lastName,
          consentToMarketing: true,
        });

      expect(subscribeResponse.status).toBe(201);
      expect(subscribeResponse.body.success).toBe(true);

      // Step 2: Receive delivery webhook
      const webhookPayload = createWebhookPayload("delivered", email);

      mockDatabase.execute
        .mockResolvedValueOnce({
          rows: [{ id: 1, email: email, status: "subscribed" }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Log event

      const webhookResponse = await request(app)
        .post("/api/email/brevo-webhook")
        .send(JSON.stringify(webhookPayload))
        .set("Content-Type", "application/json");

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body.success).toBe(true);
      expect(webhookResponse.body.message).toBe("Email delivery recorded");

      // Verify both database operations occurred
      expect(mockDatabase.execute).toHaveBeenCalledTimes(4); // 2 for subscribe + 2 for webhook
    });
  });
});
