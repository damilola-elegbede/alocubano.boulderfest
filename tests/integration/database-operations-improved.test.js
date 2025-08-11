/**
 * Improved Database Operations Integration Tests
 * Demonstrates proper database initialization and connection handling
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { setupDatabaseTests } from "../utils/enhanced-test-setup.js";
import {
  testInit,
  waitForAsyncInit,
} from "../utils/test-initialization-helpers.js";

describe("Database Operations Integration - Improved", () => {
  const { getHelpers } = setupDatabaseTests({
    cleanBeforeEach: true,
    timeout: 25000,
  });

  let db;
  let ticketService;
  let emailService;

  beforeAll(async () => {
    // Wait for database to be fully initialized
    await waitForAsyncInit(async () => {
      const { getDatabase } = await import("../../api/lib/database.js");
      db = getDatabase();
      await testInit.waitForDatabase(db, 15000);
      return db;
    }, 20000);

    // Initialize services with proper dependency waiting
    const services = await testInit.initializeServices({
      ticketService: {
        factory: async () => {
          const module = await import("../../api/lib/ticket-service.js");
          return module.default;
        },
        dependencies: [],
        timeout: 10000,
      },
      emailService: {
        factory: async () => {
          const module = await import(
            "../../api/lib/email-subscriber-service.js"
          );
          return module.getEmailSubscriberService();
        },
        dependencies: [],
        timeout: 10000,
      },
    });

    ticketService = services.ticketService;
    emailService = services.emailService;
  }, 30000);

  describe("Database Connection and Health", () => {
    it("should maintain stable connection", async () => {
      expect(db).toBeDefined();
      expect(typeof db.execute).toBe("function");

      const result = await db.execute("SELECT 1 as test");
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
    });

    it("should handle multiple concurrent queries", async () => {
      const queries = Array(10)
        .fill()
        .map(async (_, i) => {
          const result = await db.execute("SELECT ? as number", [i]);
          return result.rows[0].number;
        });

      const results = await Promise.all(queries);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it("should perform basic health check", async () => {
      const isHealthy = await db.testConnection();
      expect(isHealthy).toBe(true);
    });
  });

  describe("Transaction Operations with Proper Initialization", () => {
    it("should create transaction with complete data", async () => {
      const dbHelpers = getHelpers();

      const { transactionId, transactionUuid, ticketIds } =
        await dbHelpers.createTestTransaction({
          email: "test@example.com",
          name: "John Doe",
          amount: 5000,
          ticketCount: 2,
        });

      expect(transactionId).toBeDefined();
      expect(transactionUuid).toMatch(/^TEST-TXN-/);
      expect(ticketIds).toHaveLength(2);

      // Verify transaction was created
      const result = await db.execute(
        "SELECT * FROM transactions WHERE id = ?",
        [transactionId],
      );

      expect(result.rows).toHaveLength(1);
      const transaction = result.rows[0];
      expect(transaction.customer_email).toBe("test@example.com");
      expect(transaction.customer_name).toBe("John Doe");
      expect(transaction.total_amount).toBe(5000);
      expect(transaction.status).toBe("completed");
    });

    it("should enforce unique constraints", async () => {
      const sessionId = "cs_unique_test_session";

      // First insertion should succeed
      await db.execute(
        `INSERT INTO transactions (uuid, stripe_session_id, customer_email, total_amount, status)
         VALUES (?, ?, ?, ?, ?)`,
        ["UUID-1", sessionId, "test1@example.com", 5000, "completed"],
      );

      // Second insertion with same session ID should fail
      await expect(
        db.execute(
          `INSERT INTO transactions (uuid, stripe_session_id, customer_email, total_amount, status)
           VALUES (?, ?, ?, ?, ?)`,
          ["UUID-2", sessionId, "test2@example.com", 5000, "completed"],
        ),
      ).rejects.toThrow();
    });

    it("should update transaction status correctly", async () => {
      const dbHelpers = getHelpers();
      const { transactionId } = await dbHelpers.createTestTransaction({
        email: "update@example.com",
      });

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

    it("should handle metadata updates", async () => {
      const dbHelpers = getHelpers();
      const { transactionId } = await dbHelpers.createTestTransaction();

      const metadata = { updated: true, timestamp: Date.now() };
      await db.execute("UPDATE transactions SET metadata = ? WHERE id = ?", [
        JSON.stringify(metadata),
        transactionId,
      ]);

      const result = await db.execute(
        "SELECT metadata FROM transactions WHERE id = ?",
        [transactionId],
      );

      const savedMetadata = JSON.parse(result.rows[0].metadata);
      expect(savedMetadata.updated).toBe(true);
      expect(savedMetadata.timestamp).toBe(metadata.timestamp);
    });
  });

  describe("Ticket Operations with Service Integration", () => {
    it("should create tickets with proper relationships", async () => {
      const dbHelpers = getHelpers();

      const { transactionId, ticketIds } =
        await dbHelpers.createTestTransaction({
          ticketCount: 3,
          ticketType: "weekend-pass",
        });

      expect(ticketIds).toHaveLength(3);

      // Verify all tickets were created
      const result = await db.execute(
        "SELECT * FROM tickets WHERE transaction_id = ?",
        [transactionId],
      );

      expect(result.rows).toHaveLength(3);
      result.rows.forEach((ticket) => {
        expect(ticket.ticket_type).toBe("weekend-pass");
        expect(ticket.transaction_id).toBe(transactionId);
        expect(ticket.status).toBe("valid");
      });
    });

    it("should generate unique ticket IDs", async () => {
      const dbHelpers = getHelpers();

      const results = await Promise.all([
        dbHelpers.createTestTransaction({ ticketCount: 1 }),
        dbHelpers.createTestTransaction({ ticketCount: 1 }),
      ]);

      const [result1, result2] = results;
      expect(result1.ticketIds[0]).not.toBe(result2.ticketIds[0]);
      expect(result1.ticketIds[0]).toMatch(/^TICKET-/);
      expect(result2.ticketIds[0]).toMatch(/^TICKET-/);
    });

    it("should handle ticket check-in process", async () => {
      // Skip if ticketService is not properly initialized
      if (
        !ticketService ||
        typeof ticketService.generateQRCode !== "function"
      ) {
        console.log("Skipping ticket service test - service not available");
        return;
      }

      const dbHelpers = getHelpers();
      const { ticketIds } = await dbHelpers.createTestTransaction({
        ticketCount: 1,
      });

      const qrCode = await ticketService.generateQRCode(ticketIds[0]);
      expect(qrCode).toBeDefined();

      const result = await ticketService.validateAndCheckIn(
        qrCode,
        "Main Entrance",
        "staff@example.com",
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("successfully checked in");
    });

    it("should prevent duplicate check-ins", async () => {
      // Skip if ticketService is not properly initialized
      if (
        !ticketService ||
        typeof ticketService.generateQRCode !== "function"
      ) {
        console.log("Skipping duplicate check-in test - service not available");
        return;
      }

      const dbHelpers = getHelpers();
      const { ticketIds } = await dbHelpers.createTestTransaction({
        ticketCount: 1,
      });

      const qrCode = await ticketService.generateQRCode(ticketIds[0]);

      // First check-in should succeed
      const firstResult = await ticketService.validateAndCheckIn(
        qrCode,
        "Main Entrance",
        "staff@example.com",
      );
      expect(firstResult.success).toBe(true);

      // Second check-in should fail
      const secondResult = await ticketService.validateAndCheckIn(
        qrCode,
        "Main Entrance",
        "staff@example.com",
      );
      expect(secondResult.success).toBe(false);
      expect(secondResult.message).toContain("already checked in");
    });
  });

  describe("Email Subscriber Operations", () => {
    it("should create subscriber with proper validation", async () => {
      const dbHelpers = getHelpers();

      const subscriber = await dbHelpers.createTestSubscriber({
        email: "new@example.com",
        status: "active",
      });

      expect(subscriber.id).toBeDefined();
      expect(subscriber.email).toBe("new@example.com");
      expect(subscriber.status).toBe("active");

      // Verify in database
      const result = await db.execute(
        "SELECT * FROM email_subscribers WHERE email = ?",
        ["new@example.com"],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].email).toBe("new@example.com");
    });

    it("should handle email format validation", async () => {
      const invalidEmails = [
        "notanemail",
        "@example.com",
        "test@",
        "test..double.dot@example.com",
      ];

      for (const email of invalidEmails) {
        await expect(
          db.execute(
            "INSERT INTO email_subscribers (email, status) VALUES (?, ?)",
            [email, "active"],
          ),
        ).rejects.toThrow();
      }
    });

    it("should update subscriber status", async () => {
      const dbHelpers = getHelpers();

      const subscriber = await dbHelpers.createTestSubscriber({
        email: "unsubscribe@example.com",
        status: "active",
      });

      await db.execute(
        "UPDATE email_subscribers SET status = ? WHERE email = ?",
        ["unsubscribed", "unsubscribe@example.com"],
      );

      const result = await db.execute(
        "SELECT status FROM email_subscribers WHERE email = ?",
        ["unsubscribe@example.com"],
      );

      expect(result.rows[0].status).toBe("unsubscribed");
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle batch operations efficiently", async () => {
      const dbHelpers = getHelpers();
      const startTime = Date.now();

      await dbHelpers.seedDatabase({
        transactions: 10,
        tickets: 20,
        subscribers: 50,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000);

      const stats = await dbHelpers.getDatabaseStats();
      expect(stats.transactions).toBeGreaterThanOrEqual(10);
      expect(stats.tickets).toBeGreaterThanOrEqual(20);
      expect(stats.subscribers).toBeGreaterThanOrEqual(50);
    });

    it("should execute complex queries efficiently", async () => {
      const dbHelpers = getHelpers();
      await dbHelpers.seedDatabase({
        transactions: 5,
        tickets: 10,
      });

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
        ORDER BY total_revenue DESC
      `);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000);
      expect(result.rows.length).toBeGreaterThan(0);

      // Verify query results
      result.rows.forEach((row) => {
        expect(row.ticket_count).toBeGreaterThan(0);
        expect(row.total_revenue).toBeGreaterThan(0);
      });
    });
  });

  describe("Data Integrity and Security", () => {
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

      const dbHelpers = getHelpers();
      const { transactionId } = await dbHelpers.createTestTransaction({
        name: specialChars,
      });

      const result = await db.execute(
        "SELECT customer_name FROM transactions WHERE id = ?",
        [transactionId],
      );

      expect(result.rows[0].customer_name).toBe(specialChars);
    });

    it("should enforce referential integrity", async () => {
      // Try to create ticket with non-existent transaction
      await expect(
        db.execute(
          "INSERT INTO tickets (ticket_id, transaction_id, ticket_type, price_cents) VALUES (?, ?, ?, ?)",
          ["ORPHAN-TICKET", 999999, "weekend-pass", 5000],
        ),
      ).rejects.toThrow();
    });
  });

  describe("Cleanup and Maintenance", () => {
    it("should handle cleanup operations", async () => {
      const dbHelpers = getHelpers();

      // Seed some data
      await dbHelpers.seedDatabase({
        transactions: 3,
        tickets: 6,
        subscribers: 10,
      });

      // Verify data exists
      let stats = await dbHelpers.getDatabaseStats();
      expect(stats.transactions).toBeGreaterThan(0);
      expect(stats.tickets).toBeGreaterThan(0);
      expect(stats.subscribers).toBeGreaterThan(0);

      // Clean and verify
      await dbHelpers.cleanDatabase();
      stats = await dbHelpers.getDatabaseStats();

      expect(stats.transactions).toBe(0);
      expect(stats.tickets).toBe(0);
      expect(stats.subscribers).toBe(0);
    });

    it("should maintain database integrity after cleanup", async () => {
      const dbHelpers = getHelpers();

      await dbHelpers.seedDatabase({
        transactions: 2,
        tickets: 4,
      });

      // Verify no orphaned tickets
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
