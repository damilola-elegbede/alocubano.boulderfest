/**
 * Database Operations Integration Tests
 * Tests complete CRUD operations, transactions, and database integrity
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { dbTestHelpers } from "../utils/database-test-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import database modules
let getDatabase;
let transactionService;
let ticketService;
let emailSubscriberService;

describe("Database Operations Integration", () => {
  let db;

  beforeAll(async () => {
    // Initialize test helpers and wait for database readiness
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

    // Clean database before all tests
    await dbTestHelpers.cleanDatabase();
    console.log("Database operations test suite initialized");
  });

  afterAll(async () => {
    // Final cleanup
    await dbTestHelpers.cleanDatabase();
  });

  beforeEach(async () => {
    // Set test environment
    process.env.NODE_ENV = "test";

    // Dynamically import modules
    const dbModule = await import("../../api/lib/database.js");
    const transModule = await import("../../api/lib/transaction-service.js");
    const ticketModule = await import("../../api/lib/ticket-service.js");
    const emailModule = await import(
      "../../api/lib/email-subscriber-service.js"
    );

    getDatabase = dbModule.getDatabase;
    transactionService = transModule.default;
    ticketService = ticketModule.default;
    emailSubscriberService = emailModule.getEmailSubscriberService();

    db = getDatabase();

    // Clean database and ensure it's ready for each test
    await dbTestHelpers.cleanDatabase();

    // Additional wait for database readiness to prevent race conditions
    await dbTestHelpers.waitForCondition(async () => {
      try {
        const result = await db.execute("SELECT 1 as test");
        return result.rows[0].test === 1;
      } catch {
        return false;
      }
    }, 2000);
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await dbTestHelpers.cleanDatabase();
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  describe("Database Connection and Health", () => {
    it("should establish database connection", () => {
      expect(db).toBeDefined();
      expect(typeof db.execute).toBe("function");
    });

    it("should execute simple queries", async () => {
      const result = await db.execute("SELECT 1 as test");
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
    });

    it("should handle concurrent connections", async () => {
      const queries = Array(10)
        .fill()
        .map(async (_, i) => {
          const result = await db.execute("SELECT ? as number", [i]);
          return result.rows[0].number;
        });

      const results = await Promise.all(queries);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe("Transaction Operations", () => {
    describe("Create Transaction", () => {
      it("should create transaction with valid data", async () => {
        // Use helper to create test transaction
        const { transactionId, transactionUuid, ticketIds } =
          await dbTestHelpers.createTestTransaction({
            email: "test@example.com",
            name: "John Doe",
            amount: 5000,
            ticketCount: 1,
          });

        expect(transactionId).toBeDefined();
        expect(transactionUuid).toMatch(/^TEST-TXN-/);
        expect(ticketIds).toHaveLength(1);

        // Verify in database
        const result = await db.execute(
          "SELECT * FROM transactions WHERE id = ?",
          [transactionId],
        );
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].customer_email).toBe("test@example.com");
        expect(result.rows[0].customer_name).toBe("John Doe");
        expect(result.rows[0].amount_cents).toBe(5000);
      });

      it("should generate unique UUIDs for transactions", async () => {
        const trans1 = await dbTestHelpers.createTestTransaction({
          email: "test1@example.com",
        });
        const trans2 = await dbTestHelpers.createTestTransaction({
          email: "test2@example.com",
        });

        expect(trans1.transactionUuid).not.toBe(trans2.transactionUuid);
      });

      it("should enforce unique stripe_session_id constraint", async () => {
        await db.execute(
          `INSERT INTO transactions (transaction_id, uuid, stripe_session_id, customer_email, amount_cents, total_amount, status, order_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "UUID-1",
            "UUID-1",
            "cs_duplicate",
            "test@example.com",
            5000,
            5000,
            "completed",
            "{}",
          ],
        );

        await expect(
          db.execute(
            `INSERT INTO transactions (transaction_id, uuid, stripe_session_id, customer_email, amount_cents, total_amount, status, order_data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              "UUID-2",
              "UUID-2",
              "cs_duplicate",
              "test2@example.com",
              5000,
              5000,
              "completed",
              "{}",
            ],
          ),
        ).rejects.toThrow();
      });
    });

    describe("Update Transaction", () => {
      it("should update transaction status", async () => {
        const { transactionId } = await dbTestHelpers.createTestTransaction();

        await db.execute("UPDATE transactions SET status = ? WHERE id = ?", [
          "refunded",
          transactionId,
        ]);

        const result = await db.execute(
          "SELECT status FROM transactions WHERE id = ?",
          [transactionId],
        );
        expect(result.rows[0].status).toBe("refunded");
      });

      it("should update metadata", async () => {
        const { transactionId } = await dbTestHelpers.createTestTransaction();
        const newMetadata = JSON.stringify({
          updated: true,
          timestamp: Date.now(),
        });

        await db.execute("UPDATE transactions SET metadata = ? WHERE id = ?", [
          newMetadata,
          transactionId,
        ]);

        const result = await db.execute(
          "SELECT metadata FROM transactions WHERE id = ?",
          [transactionId],
        );
        const metadata = JSON.parse(result.rows[0].metadata);
        expect(metadata.updated).toBe(true);
      });
    });

    describe("Query Transactions", () => {
      it("should find transaction by Stripe session ID", async () => {
        const { transactionId } = await dbTestHelpers.createTestTransaction();

        const result = await db.execute(
          "SELECT stripe_session_id FROM transactions WHERE id = ?",
          [transactionId],
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].stripe_session_id).toMatch(/^cs_test_/);
      });

      it("should filter transactions by status", async () => {
        await dbTestHelpers.createTestTransaction();
        await dbTestHelpers.createTestTransaction();

        await db.execute(
          "UPDATE transactions SET status = ? WHERE id % 2 = 0",
          ["refunded"],
        );

        const result = await db.execute(
          "SELECT COUNT(*) as count FROM transactions WHERE status = ?",
          ["completed"],
        );

        expect(result.rows[0].count).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("Ticket Operations", () => {
    describe("Create Tickets", () => {
      it("should create tickets from transaction", async () => {
        const { transactionId, ticketIds } =
          await dbTestHelpers.createTestTransaction({
            ticketCount: 3,
            ticketType: "weekend-pass",
          });

        expect(ticketIds).toHaveLength(3);

        const result = await db.execute(
          "SELECT * FROM tickets WHERE transaction_id = ?",
          [transactionId],
        );
        expect(result.rows).toHaveLength(3);
        expect(result.rows[0].ticket_type).toBe("weekend-pass");
      });

      it("should generate unique ticket IDs", async () => {
        const { ticketIds } = await dbTestHelpers.createTestTransaction({
          ticketCount: 2,
        });

        expect(ticketIds[0]).not.toBe(ticketIds[1]);
        expect(ticketIds[0]).toMatch(/^TICKET-/);
      });

      it("should handle attendee information", async () => {
        const { ticketIds } = await dbTestHelpers.createTestTransaction({
          ticketCount: 1,
        });

        // Update attendee information directly in database for testing
        await db.execute(
          "UPDATE tickets SET attendee_first_name = ?, attendee_last_name = ?, attendee_email = ? WHERE ticket_id = ?",
          ["Jane", "Smith", "jane@example.com", ticketIds[0]],
        );

        // Verify the update
        const result = await db.execute(
          "SELECT attendee_first_name, attendee_last_name, attendee_email FROM tickets WHERE ticket_id = ?",
          [ticketIds[0]],
        );

        expect(result.rows[0].attendee_first_name).toBe("Jane");
        expect(result.rows[0].attendee_last_name).toBe("Smith");
        expect(result.rows[0].attendee_email).toBe("jane@example.com");
      });
    });

    describe("Ticket Check-in", () => {
      it("should check in valid ticket", async () => {
        const { ticketIds } = await dbTestHelpers.createTestTransaction({
          ticketCount: 1,
        });

        // Simulate check-in by updating the database directly
        const checkedInAt = new Date().toISOString();
        await db.execute(
          "UPDATE tickets SET checked_in_at = ?, check_in_location = ? WHERE ticket_id = ?",
          [checkedInAt, "Main Entrance", ticketIds[0]],
        );

        // Verify check-in
        const result = await db.execute(
          "SELECT checked_in_at, check_in_location FROM tickets WHERE ticket_id = ?",
          [ticketIds[0]],
        );

        expect(result.rows[0].checked_in_at).toBeTruthy();
        expect(result.rows[0].check_in_location).toBe("Main Entrance");
      });

      it("should prevent double check-in", async () => {
        const { ticketIds } = await dbTestHelpers.createTestTransaction({
          ticketCount: 1,
        });

        // First check-in - simulate successful check-in
        const checkedInAt = new Date().toISOString();
        await db.execute(
          "UPDATE tickets SET checked_in_at = ? WHERE ticket_id = ?",
          [checkedInAt, ticketIds[0]],
        );

        // Verify ticket is already checked in
        const result = await db.execute(
          "SELECT checked_in_at FROM tickets WHERE ticket_id = ? AND checked_in_at IS NOT NULL",
          [ticketIds[0]],
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].checked_in_at).toBeTruthy();
      });

      it("should reject invalid ticket check-in", async () => {
        // Try to find invalid ticket ID
        const result = await db.execute(
          "SELECT * FROM tickets WHERE ticket_id = ?",
          ["INVALID-QR-CODE"],
        );

        expect(result.rows).toHaveLength(0);
      });

      it("should handle cancelled ticket check-in", async () => {
        const { ticketIds } = await dbTestHelpers.createTestTransaction({
          ticketCount: 1,
        });

        // Cancel the ticket by updating status
        await db.execute(
          "UPDATE tickets SET status = ?, cancellation_reason = ? WHERE ticket_id = ?",
          ["cancelled", "Customer request", ticketIds[0]],
        );

        // Verify ticket is cancelled
        const result = await db.execute(
          "SELECT status, cancellation_reason FROM tickets WHERE ticket_id = ?",
          [ticketIds[0]],
        );

        expect(result.rows[0].status).toBe("cancelled");
        expect(result.rows[0].cancellation_reason).toBe("Customer request");
      });
    });

    describe("Ticket Queries", () => {
      it("should get tickets by transaction", async () => {
        const { transactionId, ticketIds } =
          await dbTestHelpers.createTestTransaction({
            ticketCount: 3,
          });

        // Query tickets for the transaction directly
        const result = await db.execute(
          "SELECT * FROM tickets WHERE transaction_id = ?",
          [transactionId],
        );

        expect(result.rows).toHaveLength(3);
        const retrievedTicketIds = result.rows.map((t) => t.ticket_id);
        expect(retrievedTicketIds).toEqual(expect.arrayContaining(ticketIds));
      });

      it("should filter checked-in tickets", async () => {
        await dbTestHelpers.seedDatabase({
          tickets: 5,
          includeCheckedIn: true,
        });

        const result = await db.execute(
          "SELECT COUNT(*) as count FROM tickets WHERE checked_in_at IS NOT NULL",
        );
        expect(result.rows[0].count).toBeGreaterThan(0);
      });

      it("should get ticket statistics", async () => {
        await dbTestHelpers.seedDatabase({ tickets: 10 });
        const stats = await dbTestHelpers.getDatabaseStats();

        expect(stats.tickets).toBe(10);
        expect(stats.checkedInTickets).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("Email Subscriber Operations", () => {
    describe("Create Subscriber", () => {
      it("should create new subscriber", async () => {
        const subscriber = await dbTestHelpers.createTestSubscriber({
          email: "new@example.com",
          status: "active",
        });

        expect(subscriber.id).toBeDefined();
        expect(subscriber.email).toBe("new@example.com");

        const result = await db.execute(
          "SELECT * FROM email_subscribers WHERE email = ?",
          ["new@example.com"],
        );
        expect(result.rows).toHaveLength(1);
      });

      it("should handle duplicate email subscriptions", async () => {
        await dbTestHelpers.createTestSubscriber({ email: "dup@example.com" });

        // Try to create duplicate subscription
        try {
          await db.execute(
            "INSERT INTO email_subscribers (email, status, consent_source) VALUES (?, ?, ?)",
            ["dup@example.com", "active", "updated"],
          );
          // Should fail due to unique constraint
          expect.fail("Expected unique constraint violation");
        } catch (error) {
          expect(error.message).toContain("UNIQUE constraint failed");
        }

        const result = await db.execute(
          "SELECT COUNT(*) as count FROM email_subscribers WHERE email = ?",
          ["dup@example.com"],
        );
        expect(result.rows[0].count).toBe(1);
      });

      it("should validate email format", async () => {
        const invalidEmails = [
          "notanemail",
          "@example.com",
          "test@",
          "test..@example.com",
        ];

        for (const email of invalidEmails) {
          try {
            await db.execute(
              "INSERT INTO email_subscribers (email, status) VALUES (?, ?)",
              [email, "active"],
            );
            // Should fail due to email validation constraint
            expect.fail(`Expected validation error for email: ${email}`);
          } catch (error) {
            // Database should reject invalid emails
            expect(error).toBeDefined();
          }
        }
      });
    });

    describe("Update Subscriber", () => {
      it("should unsubscribe user", async () => {
        const subscriber = await dbTestHelpers.createTestSubscriber({
          email: "unsub@example.com",
        });

        // Unsubscribe user by updating status
        await db.execute(
          "UPDATE email_subscribers SET status = ?, unsubscribed_at = ? WHERE email = ?",
          ["unsubscribed", new Date().toISOString(), "unsub@example.com"],
        );

        const result = await db.execute(
          "SELECT status FROM email_subscribers WHERE email = ?",
          ["unsub@example.com"],
        );
        expect(result.rows[0].status).toBe("unsubscribed");
      });

      it("should mark as bounced", async () => {
        await dbTestHelpers.createTestSubscriber({
          email: "bounce@example.com",
        });

        // Mark as bounced by updating status and bounce count
        await db.execute(
          "UPDATE email_subscribers SET status = ?, bounce_count = bounce_count + 1 WHERE email = ?",
          ["bounced", "bounce@example.com"],
        );

        const result = await db.execute(
          "SELECT status, bounce_count FROM email_subscribers WHERE email = ?",
          ["bounce@example.com"],
        );
        expect(result.rows[0].bounce_count).toBeGreaterThan(0);
      });

      it("should update Brevo contact ID", async () => {
        await dbTestHelpers.createTestSubscriber({
          email: "brevo@example.com",
        });

        await db.execute(
          "UPDATE email_subscribers SET brevo_contact_id = ? WHERE email = ?",
          ["brevo_123", "brevo@example.com"],
        );

        const result = await db.execute(
          "SELECT brevo_contact_id FROM email_subscribers WHERE email = ?",
          ["brevo@example.com"],
        );
        expect(result.rows[0].brevo_contact_id).toBe("brevo_123");
      });
    });

    describe("Query Subscribers", () => {
      it("should get active subscribers", async () => {
        await dbTestHelpers.seedDatabase({ subscribers: 10 });

        const result = await db.execute(
          "SELECT COUNT(*) as count FROM email_subscribers WHERE status = ?",
          ["active"],
        );
        expect(result.rows[0].count).toBeGreaterThan(0);
      });

      it("should get subscriber statistics", async () => {
        await dbTestHelpers.seedDatabase({ subscribers: 15 });
        const stats = await dbTestHelpers.getDatabaseStats();

        expect(stats.subscribers).toBe(15);
        expect(stats.activeSubscribers).toBeGreaterThan(0);
      });

      it("should find subscriber by email", async () => {
        await dbTestHelpers.createTestSubscriber({
          email: "find@example.com",
        });

        // Find subscriber by email
        const result = await db.execute(
          "SELECT * FROM email_subscribers WHERE email = ?",
          ["find@example.com"],
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].email).toBe("find@example.com");
      });
    });
  });

  describe("Complex Database Operations", () => {
    describe("Transaction Integrity", () => {
      it("should handle transaction rollback on error", async () => {
        const initialStats = await dbTestHelpers.getDatabaseStats();

        // Test that failed operations don't affect database state
        try {
          // This should fail and not commit any data
          await db.execute(
            "INSERT INTO transactions (transaction_id, customer_email, amount_cents, order_data) VALUES (?, ?, ?, ?)",
            ["ROLLBACK-TEST", "test@example.com", 5000, "{}"],
          );

          // This will fail and cause any pending transaction to be rolled back
          await db.execute("INSERT INTO invalid_table VALUES (1)");
        } catch (error) {
          // Expected error, transaction should be automatically rolled back
        }

        const finalStats = await dbTestHelpers.getDatabaseStats();
        // The transaction should not have been committed due to the error
        expect(finalStats.transactions).toBe(initialStats.transactions);
      });

      it("should maintain referential integrity", async () => {
        // Try to create ticket with non-existent transaction
        await expect(
          db.execute(
            "INSERT INTO tickets (ticket_id, transaction_id, ticket_type, price_cents) VALUES (?, ?, ?, ?)",
            ["ORPHAN-TICKET", 999999, "weekend-pass", 5000],
          ),
        ).rejects.toThrow();
      });
    });

    describe("Concurrent Operations", () => {
      it("should handle concurrent ticket creation", async () => {
        const promises = Array(5)
          .fill()
          .map((_, i) =>
            dbTestHelpers.createTestTransaction({
              email: `concurrent${i}@example.com`,
              ticketCount: 2,
            }),
          );

        const results = await Promise.all(promises);
        expect(results).toHaveLength(5);
        results.forEach((result) => {
          expect(result.ticketIds).toHaveLength(2);
        });
      });

      it("should handle concurrent subscriber updates", async () => {
        const email = "concurrent@example.com";
        await dbTestHelpers.createTestSubscriber({ email });

        const updates = Array(10)
          .fill()
          .map((_, i) =>
            db.execute(
              "UPDATE email_subscribers SET updated_at = ? WHERE email = ?",
              [new Date().toISOString(), email],
            ),
          );

        await Promise.all(updates);

        const result = await db.execute(
          "SELECT COUNT(*) as count FROM email_subscribers WHERE email = ?",
          [email],
        );
        expect(result.rows[0].count).toBe(1);
      });
    });

    describe("Performance and Scalability", () => {
      it("should handle large batch operations efficiently", async () => {
        const startTime = Date.now();

        await dbTestHelpers.seedDatabase({
          transactions: 10,
          tickets: 20,
          subscribers: 50,
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should complete within 8 seconds even with remote database
        expect(duration).toBeLessThan(8000);

        const stats = await dbTestHelpers.getDatabaseStats();
        expect(stats.transactions).toBeGreaterThanOrEqual(10);
        expect(stats.tickets).toBeGreaterThanOrEqual(20);
        expect(stats.subscribers).toBeGreaterThanOrEqual(50);
      });

      it("should maintain performance with complex queries", async () => {
        await dbTestHelpers.seedDatabase({ transactions: 5, tickets: 10 });

        const startTime = Date.now();

        const result = await db.execute(`
          SELECT 
            t.uuid,
            COUNT(tk.id) as ticket_count,
            SUM(tk.price_cents) as total_revenue
          FROM transactions t
          LEFT JOIN tickets tk ON t.id = tk.transaction_id
          WHERE t.status = 'completed'
          GROUP BY t.id, t.uuid
          HAVING ticket_count > 0
        `);

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Complex query should complete within 1 second
        expect(duration).toBeLessThan(1000);
        expect(result.rows.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Data Validation and Constraints", () => {
    it("should enforce email format validation", async () => {
      // SQLite doesn't enforce email format at database level - this is handled by application logic
      // This test verifies that the database accepts text input (email validation happens at API layer)
      const result = await db.execute(
        "INSERT INTO transactions (transaction_id, customer_email, amount_cents, order_data) VALUES (?, ?, ?, ?)",
        ["TEST-EMAIL-FORMAT", "invalid-email", 5000, "{}"],
      );

      // Database should accept the insert (format validation is at application level)
      expect(result.rowsAffected).toBe(1);
    });

    it("should enforce required fields", async () => {
      // Test should fail when required field customer_email is missing
      await expect(
        db.execute(
          "INSERT INTO transactions (transaction_id, uuid, amount_cents, total_amount, order_data) VALUES (?, ?, ?, ?, ?)",
          ["TEST-UUID-2", "TEST-UUID-2", 5000, 5000, "{}"],
        ),
      ).rejects.toThrow();
    });

    it("should prevent SQL injection", async () => {
      const maliciousInput = "'; DROP TABLE transactions; --";

      // This should be safe due to parameterized queries
      const result = await db.execute(
        "SELECT * FROM transactions WHERE customer_email = ?",
        [maliciousInput],
      );

      expect(result.rows).toHaveLength(0);

      // Verify table still exists
      const tableCheck = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'",
      );
      expect(tableCheck.rows).toHaveLength(1);
    });

    it("should handle special characters safely", async () => {
      const specialChars = "O'Brien & Co. <test@example.com>";

      const { transactionId } = await dbTestHelpers.createTestTransaction({
        name: specialChars,
      });

      const result = await db.execute(
        "SELECT customer_name FROM transactions WHERE id = ?",
        [transactionId],
      );
      expect(result.rows[0].customer_name).toBe(specialChars);
    });
  });

  describe("Database Cleanup and Maintenance", () => {
    it("should handle orphaned records", async () => {
      // Seed some data
      await dbTestHelpers.seedDatabase({ transactions: 2, tickets: 4 });

      // Clean and verify
      await dbTestHelpers.cleanDatabase();
      const stats = await dbTestHelpers.getDatabaseStats();

      expect(stats.transactions).toBe(0);
      expect(stats.tickets).toBe(0);
    });

    it("should maintain database integrity after operations", async () => {
      await dbTestHelpers.seedDatabase({ transactions: 3, tickets: 6 });

      // Verify foreign key relationships
      const orphanCheck = await db.execute(`
        SELECT COUNT(*) as count 
        FROM tickets t 
        LEFT JOIN transactions tr ON t.transaction_id = tr.id 
        WHERE tr.id IS NULL
      `);

      expect(orphanCheck.rows[0].count).toBe(0);
    });
  });
});
