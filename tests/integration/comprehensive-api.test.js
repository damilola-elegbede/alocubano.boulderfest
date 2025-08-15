/**
 * Comprehensive API Integration Tests
 * Tests complete end-to-end API flows with proper initialization and data consistency
 *
 * Updated to use new simplified test helpers (Phase 2.6)
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import request from "supertest";
import express from "express";
import crypto from "crypto";
import { setupIntegrationTest, teardownTest } from "../helpers/index.js";
import { 
  createTestApp, 
  createWebhookHandler, 
  createMockServiceContainer,
  applyServiceMocks 
} from "../helpers/supertest-app.js";

// Move createSignature to module scope for accessibility
const createSignature = (payload) => {
  return crypto
    .createHmac("sha256", process.env.BREVO_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
};

// Webhook handler creation is now imported from supertest-app.js

describe("Comprehensive API Integration", () => {
  let app;
  let setup;
  let originalFetch;

  beforeAll(async () => {
    // Store original fetch
    originalFetch = global.fetch;

    // CRITICAL: Set up test environment BEFORE importing anything that uses services
    process.env.NODE_ENV = "test";
    process.env.TURSO_DATABASE_URL = ":memory:";
    process.env.TURSO_AUTH_TOKEN = "test-token";
    process.env.BREVO_API_KEY = "fake_brevo_key_for_tests";
    process.env.BREVO_NEWSLETTER_LIST_ID = "123";
    process.env.BREVO_WEBHOOK_SECRET = "test_webhook_secret";

    // Set up the test database first
    const { setupTest } = await import("../helpers/index.js");
    setup = await setupTest({
      database: true,
      env: "complete-test",
      mocks: [], // Don't use the default fetch mock
      seed: false,
      isolate: true,
    });

    // Create a proper fetch mock that will persist across all tests
    global.fetch = vi.fn();

    // Create service mocks using the new helper
    const serviceMocks = createMockServiceContainer({
      database: setup.client,
      email: {
        createSubscriber: vi.fn().mockImplementation(async (data) => ({
          id: Math.floor(Math.random() * 10000),
          email: data.email,
          first_name: data.firstName,
          last_name: data.lastName,
          status: data.status || 'active',
          created_at: new Date().toISOString(),
        })),
        processWebhookEvent: vi.fn().mockImplementation(async (webhookData) => ({
          eventType: webhookData.event,
          email: webhookData.email,
          occurredAt: webhookData.date || new Date().toISOString(),
          data: { messageId: webhookData.messageId }
        }))
      }
    });

    // Apply service mocks
    applyServiceMocks(serviceMocks);

    // Import handlers AFTER environment is set up and services are mocked
    const [subscribeHandler, webhookHandler] = await Promise.all([
      import("../../api/email/subscribe.js"),
      import("../../api/email/brevo-webhook.js"),
    ]);

    // Create test app using the helper
    app = createTestApp({
      routes: [
        { method: 'post', path: '/api/email/subscribe', handler: subscribeHandler.default },
        { method: 'post', path: '/api/email/brevo-webhook', handler: createWebhookHandler(webhookHandler.default) }
      ]
    });

    console.log("🎯 Comprehensive API integration test setup complete");
  }, 45000);

  afterAll(async () => {
    // Restore original fetch
    if (originalFetch) {
      global.fetch = originalFetch;
    }

    await teardownTest(setup);
  });

  beforeEach(async () => {
    // Clean database before each test
    const db = setup.client;
    const tables = ["email_events", "email_subscribers", "email_audit_log"];

    for (const table of tables) {
      try {
        await db.execute(`DELETE FROM ${table}`);
      } catch (error) {
        // Table might not exist
      }
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock for next test
    if (global.fetch) {
      global.fetch.mockClear();
    }
  });

  describe("Email Subscription Flow", () => {
    it("should handle complete subscription with database persistence", async () => {
      // Mock external Brevo API using fetch mock
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes("/v3/contacts") && options.method === "POST") {
          const body = JSON.parse(options.body);
          expect(body.email).toBe("comprehensive@example.com");
          expect(body.attributes.FNAME).toBe("Comprehensive");

          return {
            ok: true,
            status: 201,
            json: async () => ({
              id: 12345,
              email: "comprehensive@example.com",
            }),
            text: async () =>
              JSON.stringify({
                id: 12345,
                email: "comprehensive@example.com",
              }),
          };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });

      const response = await request(app).post("/api/email/subscribe").send({
        email: "comprehensive@example.com",
        firstName: "Comprehensive",
        lastName: "Test",
        source: "comprehensive_test",
        consentToMarketing: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.subscriber.email).toBe("comprehensive@example.com");

      // Verify database persistence
      const db = setup.client;
      const result = await db.execute(
        "SELECT * FROM email_subscribers WHERE email = ?",
        ["comprehensive@example.com"],
      );

      expect(result.rows).toHaveLength(1);
      const subscriber = result.rows[0];
      expect(subscriber.email).toBe("comprehensive@example.com");
      expect(subscriber.first_name).toBe("Comprehensive");
      expect(subscriber.status).toBe("active");
    });

    it("should handle subscription validation properly", async () => {
      const invalidRequests = [
        {
          payload: { email: "invalid-email", firstName: "Test" },
          expectedStatus: 400,
          expectedError: "valid email",
        },
        {
          payload: { email: "test@example.com" },
          expectedStatus: 400,
          expectedError: "required",
        },
        {
          payload: {
            email: "test@example.com",
            firstName: "Test",
            consentToMarketing: false,
          },
          expectedStatus: 400,
          expectedError: "consent",
        },
      ];

      for (const {
        payload,
        expectedStatus,
        expectedError,
      } of invalidRequests) {
        const response = await request(app)
          .post("/api/email/subscribe")
          .send(payload);

        expect(response.status).toBe(expectedStatus);
        expect(response.body.error).toContain(expectedError);
      }
    });

    it("should prevent duplicate subscriptions", async () => {
      const email = "duplicate-test@example.com";

      // Mock Brevo API for both subscription attempts
      let callCount = 0;
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes("/v3/contacts") && options.method === "POST") {
          callCount++;
          // First call succeeds, subsequent calls shouldn't happen but if they do, succeed
          return {
            ok: true,
            status: 201,
            json: async () => ({ id: 54321, email }),
            text: async () => JSON.stringify({ id: 54321, email }),
          };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });

      const firstResponse = await request(app)
        .post("/api/email/subscribe")
        .send({
          email,
          firstName: "First",
          lastName: "User",
          consentToMarketing: true,
        });

      expect(firstResponse.status).toBe(201);

      // Second subscription should fail
      const secondResponse = await request(app)
        .post("/api/email/subscribe")
        .send({
          email,
          firstName: "Second",
          lastName: "User",
          consentToMarketing: true,
        });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.error).toContain("already subscribed");
    });
  });

  describe("Webhook Processing", () => {
    it("should process delivery webhooks correctly", async () => {
      const email = "webhook-test@example.com";

      // Create subscriber first
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes("/v3/contacts") && options.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ id: 99999, email }),
            text: async () => JSON.stringify({ id: 99999, email }),
          };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });

      await request(app).post("/api/email/subscribe").send({
        email,
        firstName: "Webhook",
        lastName: "Test",
        consentToMarketing: true,
      });

      // Send delivery webhook
      const webhookPayload = {
        event: "delivered",
        email,
        date: new Date().toISOString(),
        message_id: "test_message_123",
      };

      const signature = createSignature(webhookPayload);

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(webhookPayload)
        .set("Content-Type", "application/json")
        .set("x-brevo-signature", signature);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify event was logged
      const db = setup.client;
      const eventResult = await db.execute(
        `SELECT ee.* FROM email_events ee
         JOIN email_subscribers es ON ee.subscriber_id = es.id  
         WHERE es.email = ? AND ee.event_type = ?`,
        [email, "delivered"],
      );

      expect(eventResult.rows).toHaveLength(1);
    });

    it("should handle unsubscribe webhooks", async () => {
      const email = "unsubscribe-test@example.com";

      // Create subscriber
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes("/v3/contacts") && options.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ id: 88888, email }),
            text: async () => JSON.stringify({ id: 88888, email }),
          };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });

      await request(app).post("/api/email/subscribe").send({
        email,
        firstName: "Unsubscribe",
        lastName: "Test",
        consentToMarketing: true,
      });

      // Send unsubscribe webhook
      const webhookPayload = {
        event: "unsubscribed",
        email,
        date: new Date().toISOString(),
      };

      const signature = createSignature(webhookPayload);

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(webhookPayload)
        .set("Content-Type", "application/json")
        .set("x-brevo-signature", signature);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify subscriber status updated
      const db = setup.client;
      const result = await db.execute(
        "SELECT status FROM email_subscribers WHERE email = ?",
        [email],
      );

      expect(result.rows[0].status).toBe("unsubscribed");
    });

    it("should reject webhooks with invalid signatures", async () => {
      const webhookPayload = {
        event: "delivered",
        email: "test@example.com",
        date: new Date().toISOString(),
      };

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(webhookPayload)
        .set("Content-Type", "application/json")
        .set("x-brevo-signature", "invalid_signature");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid signature");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle Brevo service failures gracefully", async () => {
      // Mock Brevo failure
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes("/v3/contacts") && options.method === "POST") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ message: "Service Unavailable" }),
            text: async () =>
              JSON.stringify({ message: "Service Unavailable" }),
          };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });

      const response = await request(app).post("/api/email/subscribe").send({
        email: "service-error@example.com",
        firstName: "Service",
        lastName: "Error",
        consentToMarketing: true,
      });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain("temporarily unavailable");
    });

    it("should handle malformed webhook payloads", async () => {
      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send("invalid json")
        .set("Content-Type", "application/json");

      expect(response.status).toBe(400);
    });

    it("should handle concurrent requests without race conditions", async () => {
      const baseEmail = "concurrent-test";
      const requestCount = 3;

      // Setup multiple Brevo mocks
      let callCount = 0;
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes("/v3/contacts") && options.method === "POST") {
          const currentCall = callCount++;
          return {
            ok: true,
            status: 201,
            json: async () => ({
              id: 77000 + currentCall,
              email: `${baseEmail}${currentCall}@example.com`,
            }),
            text: async () =>
              JSON.stringify({
                id: 77000 + currentCall,
                email: `${baseEmail}${currentCall}@example.com`,
              }),
          };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });

      // Send concurrent requests
      const requests = Array(requestCount)
        .fill()
        .map((_, i) =>
          request(app)
            .post("/api/email/subscribe")
            .send({
              email: `${baseEmail}${i}@example.com`,
              firstName: `Concurrent${i}`,
              lastName: "Test",
              consentToMarketing: true,
            }),
        );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.subscriber.email).toBe(
          `${baseEmail}${index}@example.com`,
        );
      });

      // Verify all were persisted
      const db = setup.client;
      const result = await db.execute(
        "SELECT COUNT(*) as count FROM email_subscribers WHERE email LIKE ?",
        [`${baseEmail}%@example.com`],
      );

      expect(result.rows[0].count).toBe(requestCount);
    });
  });

  describe("Data Consistency and Integrity", () => {
    it("should maintain referential integrity between subscribers and events", async () => {
      const email = "integrity-test@example.com";

      // Create subscriber and events
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes("/v3/contacts") && options.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({ id: 66666, email }),
            text: async () => JSON.stringify({ id: 66666, email }),
          };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });

      await request(app).post("/api/email/subscribe").send({
        email,
        firstName: "Integrity",
        lastName: "Test",
        consentToMarketing: true,
      });

      // Add multiple events
      const events = ["delivered", "opened", "clicked"];

      for (const eventType of events) {
        const webhookPayload = {
          event: eventType,
          email,
          date: new Date().toISOString(),
        };

        const signature = createSignature(webhookPayload);

        await request(app)
          .post("/api/email/brevo-webhook")
          .send(webhookPayload)
          .set("Content-Type", "application/json")
          .set("x-brevo-signature", signature);
      }

      // Verify all events are linked to subscriber
      const db = setup.client;
      const result = await db.execute(
        `SELECT ee.event_type, es.email 
         FROM email_events ee
         JOIN email_subscribers es ON ee.subscriber_id = es.id
         WHERE es.email = ?
         ORDER BY ee.occurred_at`,
        [email],
      );

      expect(result.rows).toHaveLength(events.length + 1); // +1 for subscribed event
      expect(result.rows[0].event_type).toBe("subscribed");
    });

    it("should handle transaction rollbacks on database errors", async () => {
      const db = setup.client;

      // Get initial count
      const initialResult = await db.execute(
        "SELECT COUNT(*) as count FROM email_subscribers",
      );
      const initialCount = initialResult.rows[0].count;

      // Mock successful Brevo API call
      global.fetch.mockImplementation(async (url, options) => {
        if (url.includes("/v3/contacts") && options.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              id: 55555,
              email: "rollback-test@example.com",
            }),
            text: async () =>
              JSON.stringify({ id: 55555, email: "rollback-test@example.com" }),
          };
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });

      // Spy on database execute method to force failure on INSERT INTO email_subscribers
      const originalExecute = db.execute.bind(db);
      const executeSpy = vi
        .spyOn(db, "execute")
        .mockImplementation(async (query, params) => {
          // Force failure specifically for email_subscribers INSERT
          if (
            typeof query === "string" &&
            query.includes("INSERT INTO email_subscribers")
          ) {
            throw new Error("Simulated database failure during INSERT");
          }
          // Allow other queries to proceed normally
          return originalExecute(query, params);
        });

      try {
        // Attempt subscription - should fail during database insertion
        const response = await request(app).post("/api/email/subscribe").send({
          email: "rollback-test@example.com",
          firstName: "Rollback",
          lastName: "Test",
          consentToMarketing: true,
        });

        // Should return 500 error due to database failure
        expect(response.status).toBe(500);
        expect(response.body.error).toContain(
          "error occurred while processing",
        );

        // Verify subscriber count remains unchanged (rollback worked)
        const finalResult = await originalExecute(
          "SELECT COUNT(*) as count FROM email_subscribers",
          [],
        );
        const finalCount = finalResult.rows[0].count;

        expect(finalCount).toBe(initialCount);

        // Verify no subscriber record was created
        const subscriberCheck = await originalExecute(
          "SELECT * FROM email_subscribers WHERE email = ?",
          ["rollback-test@example.com"],
        );
        expect(subscriberCheck.rows).toHaveLength(0);
      } finally {
        // Restore original method
        executeSpy.mockRestore();
      }
    });
  });
});
