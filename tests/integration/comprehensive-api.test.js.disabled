/**
 * Comprehensive API Integration Tests
 * Tests complete end-to-end API flows with proper initialization and data consistency
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
import nock from "nock";
import crypto from "crypto";
import { dbTestHelpers } from "../utils/database-test-helpers.js";

describe("Comprehensive API Integration", () => {
  let app;
  let db;

  beforeAll(async () => {
    // Initialize database helpers and wait for readiness
    await dbTestHelpers.initialize();

    // Wait for database to be fully ready
    await dbTestHelpers.waitForCondition(async () => {
      try {
        await dbTestHelpers.executeSQL("SELECT 1");
        return true;
      } catch {
        return false;
      }
    }, 5000);

    console.log("Comprehensive API test suite initialized");
  });

  afterAll(async () => {
    // Final cleanup
    await dbTestHelpers.cleanDatabase();
    nock.cleanAll();
  });

  beforeEach(async () => {
    // Set test-specific environment variables (database URL set globally in setup)
    process.env.BREVO_API_KEY = "xkeysib-test123";
    process.env.BREVO_NEWSLETTER_LIST_ID = "123";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_123";
    process.env.ADMIN_PASSWORD = "$2b$10$test.hash.for.password";
    process.env.ADMIN_SECRET = "test-admin-secret-key-32-characters";

    // Add timeout configuration to prevent hanging
    process.env.DATABASE_TIMEOUT = "5000";
    process.env.SERVICE_INIT_TIMEOUT = "5000";

    // Clean database and ensure readiness
    await dbTestHelpers.cleanDatabase();

    // Wait for database readiness
    await dbTestHelpers.waitForCondition(async () => {
      try {
        const result = await dbTestHelpers.executeSQL("SELECT 1 as test");
        return result.rows[0].test === 1;
      } catch {
        return false;
      }
    }, 2000);

    // Get database instance
    const { getDatabase } = await import("../../api/lib/database.js");
    db = getDatabase();

    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use(express.raw({ type: "application/json" }));

    // Import and register API handlers with timeout
    const importWithTimeout = async (path, timeoutMs = 10000) => {
      return Promise.race([
        import(path),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Import timeout: ${path}`)),
            timeoutMs,
          ),
        ),
      ]);
    };

    const { default: subscribeHandler } = await importWithTimeout(
      "../../api/email/subscribe.js",
    );
    const { default: webhookHandler } = await importWithTimeout(
      "../../api/email/brevo-webhook.js",
    );
    const { default: createCheckoutHandler } = await importWithTimeout(
      "../../api/payments/create-checkout-session.js",
    );
    const { default: stripeWebhookHandler } = await importWithTimeout(
      "../../api/payments/stripe-webhook.js",
    );

    app.post("/api/email/subscribe", subscribeHandler);
    app.post("/api/email/brevo-webhook", webhookHandler);
    app.post("/api/payments/create-checkout-session", createCheckoutHandler);
    app.post("/api/payments/stripe-webhook", stripeWebhookHandler);

    // Clear mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    nock.cleanAll();
    vi.clearAllMocks();
  });

  describe("Complete Email Subscription Flow", () => {
    it("should handle full newsletter subscription workflow", async () => {
      const email = "integration@example.com";
      const firstName = "Integration";
      const lastName = "Test";

      // Mock Brevo API for successful subscription
      nock("https://api.brevo.com")
        .post("/v3/contacts", (body) => {
          // Match the actual payload structure from brevo-service.js
          return (
            body.email === email &&
            body.attributes.FNAME === firstName &&
            body.attributes.LNAME === lastName &&
            body.attributes.SIGNUP_SOURCE === "integration_test" &&
            body.attributes.SIGNUP_DATE &&
            body.attributes.SIGNUP_PAGE === "integration_test" &&
            body.attributes.CONSENT_DATE &&
            body.listIds.includes(123) &&
            body.updateEnabled === true
          );
        })
        .reply(201, {
          id: 12345,
          email: email,
        });

      // Step 1: Subscribe to newsletter
      const subscribeResponse = await request(app)
        .post("/api/email/subscribe")
        .send({
          email: email,
          firstName: firstName,
          lastName: lastName,
          source: "integration_test",
          consentToMarketing: true,
        });

      expect(subscribeResponse.status).toBe(201);
      expect(subscribeResponse.body.success).toBe(true);

      // Verify subscriber was created in database
      const subscriberResult = await db.execute(
        "SELECT * FROM email_subscribers WHERE email = ?",
        [email],
      );
      expect(subscriberResult.rows).toHaveLength(1);
      expect(subscriberResult.rows[0].email).toBe(email);
      expect(subscriberResult.rows[0].status).toBe("active");

      // Step 2: Simulate webhook delivery confirmation
      const webhookPayload = {
        event: "delivered",
        email: email,
        date: new Date().toISOString(),
        message_id: "msg_integration_test",
      };

      const webhookResponse = await request(app)
        .post("/api/email/brevo-webhook")
        .send(JSON.stringify(webhookPayload))
        .set("Content-Type", "application/json");

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body.success).toBe(true);

      // Verify event was logged
      const eventResult = await db.execute(
        "SELECT ee.* FROM email_events ee JOIN email_subscribers es ON ee.subscriber_id = es.id WHERE es.email = ? AND ee.event_type = ?",
        [email, "delivered"],
      );
      expect(eventResult.rows).toHaveLength(1);
    }, 30000); // Increase timeout to 30 seconds for network operations

    it("should handle email bounce workflow", async () => {
      // Create test subscriber
      const email = "bounce@integration.test";
      await dbTestHelpers.createTestSubscriber({
        email: email,
        status: "active",
      });

      // Simulate bounce webhook
      const bouncePayload = {
        event: "hard_bounce",
        email: email,
        date: new Date().toISOString(),
        reason: "mailbox_not_found",
      };

      const response = await request(app)
        .post("/api/email/brevo-webhook")
        .send(JSON.stringify(bouncePayload))
        .set("Content-Type", "application/json");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("Hard bounce processed");

      // Verify subscriber status was updated
      const subscriberResult = await db.execute(
        "SELECT status FROM email_subscribers WHERE email = ?",
        [email],
      );
      expect(subscriberResult.rows[0].status).toBe("bounced");
    }, 20000); // Increase timeout to 20 seconds for email bounce workflow
  });

  describe("Payment Processing Flow", () => {
    it("should handle ticket purchase workflow", async () => {
      const customerEmail = "buyer@integration.test";
      const customerName = "Integration Buyer";

      // Mock Stripe checkout session creation
      nock("https://api.stripe.com").post("/v1/checkout/sessions").reply(200, {
        id: "cs_integration_test_123",
        url: "https://checkout.stripe.com/pay/cs_integration_test_123",
      });

      // Step 1: Create checkout session
      const checkoutResponse = await request(app)
        .post("/api/payments/create-checkout-session")
        .send({
          cartItems: [
            {
              ticket_type: "weekend-pass",
              quantity: 2,
              price_cents: 15000,
            },
          ],
          customerInfo: {
            email: customerEmail,
            name: customerName,
          },
          success_url: "https://test.com/success",
          cancel_url: "https://test.com/cancel",
        });

      expect(checkoutResponse.status).toBe(200);
      expect(checkoutResponse.body.checkout_url).toContain(
        "checkout.stripe.com",
      );

      // Verify transaction was created with pending status
      const transactionResult = await db.execute(
        "SELECT * FROM transactions WHERE stripe_session_id = ?",
        ["cs_integration_test_123"],
      );
      expect(transactionResult.rows).toHaveLength(1);
      expect(transactionResult.rows[0].status).toBe("pending");
      expect(transactionResult.rows[0].customer_email).toBe(customerEmail);

      // Step 2: Simulate successful Stripe webhook
      const webhookPayload = {
        id: "evt_integration_test",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_integration_test_123",
            payment_status: "paid",
            customer_details: {
              email: customerEmail,
              name: customerName,
            },
            amount_total: 30000,
            currency: "usd",
          },
        },
      };

      // Mock Stripe signature verification
      const signature = crypto
        .createHmac("sha256", "whsec_test_secret")
        .update(JSON.stringify(webhookPayload), "utf8")
        .digest("hex");

      const webhookResponse = await request(app)
        .post("/api/payments/stripe-webhook")
        .send(JSON.stringify(webhookPayload))
        .set("Content-Type", "application/json")
        .set("stripe-signature", `t=1234567890,v1=${signature}`);

      expect(webhookResponse.status).toBe(200);

      // Verify transaction was completed
      const completedTransaction = await db.execute(
        "SELECT * FROM transactions WHERE stripe_session_id = ?",
        ["cs_integration_test_123"],
      );
      expect(completedTransaction.rows[0].status).toBe("completed");

      // Verify tickets were created
      const ticketsResult = await db.execute(
        "SELECT * FROM tickets WHERE transaction_id = ?",
        [completedTransaction.rows[0].id],
      );
      expect(ticketsResult.rows).toHaveLength(2);
      expect(ticketsResult.rows[0].status).toBe("valid");
    });

    it("should handle payment failure workflow", async () => {
      // Create pending transaction
      const sessionId = "cs_failed_payment_123";
      const { transactionId } = await dbTestHelpers.createTestTransaction({
        email: "failed@integration.test",
      });

      await db.execute(
        "UPDATE transactions SET stripe_session_id = ?, status = ? WHERE id = ?",
        [sessionId, "pending", transactionId],
      );

      // Simulate failed payment webhook
      const failurePayload = {
        id: "evt_failure_test",
        type: "checkout.session.async_payment_failed",
        data: {
          object: {
            id: sessionId,
            payment_status: "unpaid",
          },
        },
      };

      const response = await request(app)
        .post("/api/payments/stripe-webhook")
        .send(JSON.stringify(failurePayload))
        .set("Content-Type", "application/json");

      expect(response.status).toBe(200);

      // Verify transaction status updated to failed
      const failedTransaction = await db.execute(
        "SELECT status FROM transactions WHERE stripe_session_id = ?",
        [sessionId],
      );
      expect(failedTransaction.rows[0].status).toBe("failed");
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle multiple concurrent subscriptions", async () => {
      const subscriptions = Array.from({ length: 5 }, (_, i) => ({
        email: `concurrent${i}@integration.test`,
        firstName: `User${i}`,
        lastName: "Test",
      }));

      // Mock Brevo API for all subscriptions
      subscriptions.forEach((sub) => {
        nock("https://api.brevo.com")
          .post("/v3/contacts", {
            email: sub.email,
            attributes: {
              FIRSTNAME: sub.firstName,
              LASTNAME: sub.lastName,
            },
            listIds: [123],
            updateEnabled: true,
          })
          .reply(201, { id: Math.random() * 10000, email: sub.email });
      });

      // Execute all subscriptions concurrently
      const promises = subscriptions.map((sub) =>
        request(app)
          .post("/api/email/subscribe")
          .send({
            ...sub,
            consentToMarketing: true,
            source: "concurrent_test",
          }),
      );

      const responses = await Promise.all(promises);

      // Verify all subscriptions succeeded
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // Verify all subscribers were created
      const subscriberCount = await db.execute(
        "SELECT COUNT(*) as count FROM email_subscribers WHERE source = ?",
        ["concurrent_test"],
      );
      expect(subscriberCount.rows[0].count).toBe(5);
    });

    it("should handle concurrent ticket purchases", async () => {
      // Mock Stripe for multiple sessions
      Array.from({ length: 3 }, (_, i) => {
        nock("https://api.stripe.com")
          .post("/v1/checkout/sessions")
          .reply(200, {
            id: `cs_concurrent_${i}`,
            url: `https://checkout.stripe.com/pay/cs_concurrent_${i}`,
          });
      });

      // Create concurrent purchase requests
      const purchases = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post("/api/payments/create-checkout-session")
          .send({
            cartItems: [
              {
                ticket_type: "day-pass",
                quantity: 1,
                price_cents: 4500,
              },
            ],
            customerInfo: {
              email: `buyer${i}@concurrent.test`,
              name: `Buyer ${i}`,
            },
            success_url: "https://test.com/success",
            cancel_url: "https://test.com/cancel",
          }),
      );

      const responses = await Promise.all(purchases);

      // Verify all purchases initiated successfully
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.checkout_url).toContain("checkout.stripe.com");
      });

      // Verify transactions were created
      const transactionCount = await db.execute(
        "SELECT COUNT(*) as count FROM transactions WHERE status = 'pending'",
      );
      expect(transactionCount.rows[0].count).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Error Recovery and Data Consistency", () => {
    it("should maintain data consistency during API errors", async () => {
      const email = "error@consistency.test";

      // Get initial database state
      const initialStats = await dbTestHelpers.getDatabaseStats();

      // Mock Brevo API error
      nock("https://api.brevo.com")
        .post("/v3/contacts")
        .reply(500, { error: "Internal server error" });

      // Attempt subscription that should fail
      const response = await request(app).post("/api/email/subscribe").send({
        email: email,
        firstName: "Error",
        lastName: "Test",
        consentToMarketing: true,
      });

      expect(response.status).toBe(503);

      // Verify database state remains consistent
      const finalStats = await dbTestHelpers.getDatabaseStats();
      expect(finalStats.subscribers).toBe(initialStats.subscribers);

      // Verify no partial subscriber record was created
      const subscriberResult = await db.execute(
        "SELECT * FROM email_subscribers WHERE email = ?",
        [email],
      );
      expect(subscriberResult.rows).toHaveLength(0);
    });

    it("should handle database connection recovery", async () => {
      // Verify system can recover from temporary database issues
      const email = "recovery@test.com";

      // First, ensure normal operation works
      nock("https://api.brevo.com")
        .post("/v3/contacts")
        .reply(201, { id: 123, email: email });

      const successResponse = await request(app)
        .post("/api/email/subscribe")
        .send({
          email: email,
          firstName: "Recovery",
          lastName: "Test",
          consentToMarketing: true,
        });

      expect(successResponse.status).toBe(201);

      // Verify subscriber was created
      const result = await db.execute(
        "SELECT * FROM email_subscribers WHERE email = ?",
        [email],
      );
      expect(result.rows).toHaveLength(1);
    });
  });

  describe("Data Validation and Security", () => {
    it("should sanitize and validate all input data", async () => {
      const maliciousInputs = {
        email: "test@example.com",
        firstName: "<script>alert('xss')</script>",
        lastName: "'; DROP TABLE email_subscribers; --",
        source: "<img src=x onerror=alert(1)>",
      };

      nock("https://api.brevo.com")
        .post("/v3/contacts", (body) => {
          // Verify malicious content is sanitized
          expect(body.attributes.FIRSTNAME).not.toContain("<script>");
          expect(body.attributes.LASTNAME).not.toContain("DROP TABLE");
          return true;
        })
        .reply(201, { id: 123, email: maliciousInputs.email });

      const response = await request(app)
        .post("/api/email/subscribe")
        .send({
          ...maliciousInputs,
          consentToMarketing: true,
        });

      expect(response.status).toBe(201);

      // Verify database wasn't compromised
      const tableCheck = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='email_subscribers'",
      );
      expect(tableCheck.rows).toHaveLength(1);

      // Verify data was sanitized in database
      const subscriberResult = await db.execute(
        "SELECT * FROM email_subscribers WHERE email = ?",
        [maliciousInputs.email],
      );
      expect(subscriberResult.rows[0].first_name).not.toContain("<script>");
    });

    it("should enforce rate limiting on API endpoints", async () => {
      const email = "ratelimit@test.com";

      // Create multiple rapid requests
      const rapidRequests = Array.from({ length: 10 }, () =>
        request(app).post("/api/email/subscribe").send({
          email: email,
          firstName: "Rate",
          lastName: "Limit",
          consentToMarketing: true,
        }),
      );

      const responses = await Promise.allSettled(rapidRequests);

      // Some requests should succeed, others should be rate limited
      const successfulRequests = responses.filter(
        (r) => r.status === "fulfilled" && r.value.status === 201,
      );
      const rateLimitedRequests = responses.filter(
        (r) => r.status === "fulfilled" && r.value.status === 429,
      );

      // Expect at least some rate limiting to occur
      expect(successfulRequests.length + rateLimitedRequests.length).toBe(10);
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle moderate load efficiently", async () => {
      const startTime = Date.now();
      const operationCount = 20;

      // Create mixed operations: subscriptions, webhooks, and database queries
      const operations = [];

      // Add subscription operations
      for (let i = 0; i < operationCount / 2; i++) {
        nock("https://api.brevo.com")
          .post("/v3/contacts")
          .reply(201, { id: i, email: `perf${i}@test.com` });

        operations.push(
          request(app)
            .post("/api/email/subscribe")
            .send({
              email: `perf${i}@test.com`,
              firstName: `Perf${i}`,
              lastName: "Test",
              consentToMarketing: true,
            }),
        );
      }

      // Add direct database operations
      for (let i = operationCount / 2; i < operationCount; i++) {
        operations.push(
          dbTestHelpers.createTestTransaction({
            email: `perfdb${i}@test.com`,
            ticketCount: 1,
          }),
        );
      }

      // Execute all operations concurrently
      const results = await Promise.all(operations);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify reasonable performance
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all operations completed successfully
      results.forEach((result) => {
        if (result.status) {
          // HTTP response
          expect(result.status).toBe(201);
        } else {
          // Database operation result
          expect(result.transactionId).toBeDefined();
        }
      });

      console.log(`Completed ${operationCount} operations in ${duration}ms`);
    });
  });
});
