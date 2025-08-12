/**
 * Database Test Helpers
 * Utilities for cleaning, seeding, and managing test database state
 */

import { getDatabaseClient } from "../../api/lib/database.js";
import { databaseClientValidator } from './database-client-validator.js';
import { testEnvironmentDetector } from './test-environment-detector.js';
import crypto from "crypto";

export class DatabaseTestHelpers {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize database connection with environment-aware validation
   */
  async initialize(testContext = {}) {
    try {
      // Check if we're being called from integration test setup with override
      if (process.env.FORCE_REAL_DATABASE_CLIENT === 'true') {
        // For integration tests, use the integration test database factory
        try {
          const { integrationTestDatabaseFactory } = await import('./integration-test-database-factory.js');
          this.db = await integrationTestDatabaseFactory.createRealDatabaseClient(testContext);
          console.log("✅ Database test helper initialized with real LibSQL client from integration factory");
        } catch (error) {
          console.warn("Warning: Failed to use integration database factory, falling back to standard client:", error.message);
          this.db = await getDatabaseClient();
        }
      } else {
        this.db = await getDatabaseClient();
      }
      
      // Verify we got a valid client with execute method
      if (!this.db || typeof this.db.execute !== 'function') {
        throw new Error('Invalid database client - missing execute method');
      }
      
      // Auto-detect test type if not provided in context
      let detectedTestType = 'unit';
      if (testContext.file && testContext.file.name) {
        detectedTestType = testEnvironmentDetector.detectTestType(testContext);
      } else if (testContext.type) {
        detectedTestType = testContext.type;
      } else {
        // Fallback: try to detect from stack trace or environment
        if (process.env.TEST_TYPE === 'integration') {
          detectedTestType = 'integration';
        } else {
          const stack = new Error().stack;
          if (stack && stack.includes('/integration/')) {
            detectedTestType = 'integration';
          }
        }
      }
      
      if (detectedTestType === 'integration') {
        // Integration tests must use real database clients
        databaseClientValidator.validateIntegrationClient(this.db, testContext);
        console.log("✅ Database test helper initialized with real LibSQL client for integration test");
      } else {
        // Unit tests can use either mocks or real clients
        databaseClientValidator.validateUnitClient(this.db, testContext);
        console.log("✅ Database test helper initialized for unit test");
      }
      
      // Test the connection
      const testResult = await this.db.execute("SELECT 1 as test");
      
      // For integration tests, verify we get proper response format
      if (detectedTestType === 'integration') {
        if (!testResult || !testResult.rows || !Array.isArray(testResult.rows)) {
          throw new Error('Database client test query returned invalid response format for integration test');
        }
        
        // Test insert capability to verify lastInsertRowid support
        try {
          await this.db.execute("CREATE TEMPORARY TABLE test_lastinsert (id INTEGER PRIMARY KEY, value TEXT)");
          const insertResult = await this.db.execute("INSERT INTO test_lastinsert (value) VALUES (?)", ["test"]);
          
          if (!insertResult.hasOwnProperty('lastInsertRowid')) {
            console.warn("⚠️ Database client may not support lastInsertRowid - some integration tests may fail");
          }
          
          await this.db.execute("DROP TABLE test_lastinsert");
        } catch (insertError) {
          console.warn("⚠️ Could not verify lastInsertRowid support:", insertError.message);
        }
      }
      
      return this.db;
    } catch (error) {
      console.error("❌ Failed to initialize database test helper:", error);
      throw error;
    }
  }

  /**
   * Ensure essential tables exist for testing
   */
  async ensureEssentialTables() {
    const db = this.db || await getDatabaseClient();
    
    // Verify we have a valid client
    if (!db || typeof db.execute !== 'function') {
      throw new Error('Invalid database client in ensureEssentialTables');
    }

    const tables = {
      transactions: `
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL DEFAULT 'tickets',
          status TEXT DEFAULT 'pending',
          amount_cents INTEGER NOT NULL,
          currency TEXT DEFAULT 'USD',
          stripe_session_id TEXT UNIQUE,
          stripe_payment_intent_id TEXT,
          stripe_charge_id TEXT,
          payment_method_type TEXT,
          customer_email TEXT NOT NULL,
          customer_name TEXT,
          billing_address TEXT,
          order_data TEXT NOT NULL DEFAULT '{}',
          session_metadata TEXT,
          event_id TEXT,
          source TEXT DEFAULT 'website',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        )
      `,
      tickets: `
        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id TEXT UNIQUE NOT NULL,
          transaction_id INTEGER REFERENCES transactions(id),
          ticket_type TEXT NOT NULL,
          event_id TEXT NOT NULL DEFAULT 'fest-2026',
          event_date DATE,
          price_cents INTEGER NOT NULL,
          attendee_first_name TEXT,
          attendee_last_name TEXT,
          attendee_email TEXT,
          attendee_phone TEXT,
          status TEXT DEFAULT 'valid',
          validation_code TEXT UNIQUE,
          checked_in_at TIMESTAMP,
          checked_in_by TEXT,
          check_in_location TEXT,
          ticket_metadata TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      email_subscribers: `
        CREATE TABLE IF NOT EXISTS email_subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          first_name TEXT,
          last_name TEXT,
          phone TEXT,
          status TEXT DEFAULT 'pending',
          brevo_contact_id TEXT,
          list_ids TEXT DEFAULT '[]',
          attributes TEXT DEFAULT '{}',
          consent_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          consent_source TEXT DEFAULT 'website',
          consent_ip TEXT,
          verification_token TEXT,
          verified_at TIMESTAMP,
          unsubscribed_at TIMESTAMP,
          bounce_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      email_events: `
        CREATE TABLE IF NOT EXISTS email_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subscriber_id INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          event_data TEXT DEFAULT '{}',
          brevo_event_id TEXT,
          occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (subscriber_id) REFERENCES email_subscribers(id)
        )
      `,
      email_audit_log: `
        CREATE TABLE IF NOT EXISTS email_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          actor_id TEXT,
          changes TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
    };

    for (const [tableName, sql] of Object.entries(tables)) {
      try {
        await db.execute(sql);
      } catch (error) {
        console.warn(`Warning creating table ${tableName}:`, error.message);
      }
    }

    // Ensure bounce_count column exists in email_subscribers table
    await this.ensureBounceCountColumn();
  }

  /**
   * Ensure bounce_count column exists in email_subscribers table
   */
  async ensureBounceCountColumn() {
    const db = this.db || await getDatabaseClient();

    try {
      // Check if bounce_count column exists
      const tableInfo = await db.execute(
        "PRAGMA table_info(email_subscribers)",
      );
      const hasBounceCount = tableInfo?.rows?.some(
        (row) => row.name === "bounce_count",
      ) || false;

      if (!hasBounceCount) {
        // Add bounce_count column
        await db.execute(
          "ALTER TABLE email_subscribers ADD COLUMN bounce_count INTEGER DEFAULT 0",
        );
        console.log("✅ Added bounce_count column to email_subscribers table");
      }
    } catch (error) {
      console.warn("Warning adding bounce_count column:", error.message);
    }
  }

  /**
   * Clean all test data from database
   * Only cleans data, preserves schema
   */
  async cleanDatabase() {
    const db = this.db || await getDatabaseClient();

    try {
      // Skip transaction rollback as it causes issues in tests
      // Individual operations will handle their own error states

      // First ensure essential tables exist for testing
      await this.ensureEssentialTables();

      // Temporarily disable foreign key constraints for cleanup
      try {
        await db.execute("PRAGMA foreign_keys = OFF");
      } catch (error) {
        console.warn("Warning disabling foreign keys:", error.message);
      }

      // Tables to clean (in order to respect foreign keys)
      // Must clean child tables before parent tables
      const tablesToClean = [
        "payment_events",
        "email_events", // Child of email_subscribers
        "email_audit_log", // Independent table
        "tickets", // Child of transactions
        "transactions", // Parent table
        "email_subscribers", // Parent table
      ];

      // Clean each table, only if it exists
      for (const table of tablesToClean) {
        try {
          // Check if table exists first
          const tableExists = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            [table],
          );

          if (tableExists?.rows?.length > 0) {
            await db.execute(`DELETE FROM ${table}`);
          }
        } catch (error) {
          // Table might not exist or other issues, continue
          console.warn(`Warning cleaning ${table}:`, error.message);
        }
      }

      // Re-enable foreign key constraints
      try {
        await db.execute("PRAGMA foreign_keys = ON");
      } catch (error) {
        console.warn("Warning re-enabling foreign keys:", error.message);
      }

      // Reset autoincrement counters (SQLite specific)
      try {
        await db.execute(
          "DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'tickets', 'email_subscribers', 'email_events')",
        );
      } catch (error) {
        // Ignore if sqlite_sequence doesn't exist
      }

      console.log("✅ Database cleaned successfully");
    } catch (error) {
      console.error("❌ Failed to clean database:", error.message);
      // Don't throw error to prevent test failures due to cleanup issues
    }
  }

  /**
   * Seed database with initial test data
   */
  async seedDatabase(options = {}) {
    const db = this.db || await getDatabaseClient();
    const {
      transactions = 3,
      tickets = 5,
      subscribers = 10,
      includeCheckedIn = true,
      includeCancelled = false,
    } = options;

    try {
      // Seed transactions (no explicit transaction to avoid rollback issues)
      const transactionIds = [];
      for (let i = 1; i <= transactions; i++) {
        const uuid = `TEST-TXN-${Date.now()}-${i}`;
        const result = await db.execute(
          `INSERT INTO transactions (
            transaction_id, stripe_session_id, stripe_payment_intent_id,
            customer_email, customer_name, amount_cents,
            currency, status, order_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid,
            `cs_test_${crypto.randomBytes(16).toString("hex")}`,
            `pi_test_${crypto.randomBytes(16).toString("hex")}`,
            `test${i}@example.com`,
            `Test User ${i}`,
            19500, // $195.00 in cents
            "USD",
            i === 1 && includeCancelled ? "cancelled" : "completed",
            JSON.stringify({ test: true, seed: i }),
          ],
        );
        if (result?.lastInsertRowid) {
          transactionIds.push(result.lastInsertRowid);
        }
      }

      // Seed tickets - distribute evenly across transactions
      let ticketCount = 0;
      const ticketsPerTransaction = Math.ceil(tickets / transactions);

      for (const transactionId of transactionIds) {
        const remainingTickets = tickets - ticketCount;
        const ticketsForThisTransaction = Math.min(
          ticketsPerTransaction,
          remainingTickets,
        );

        for (
          let j = 0;
          j < ticketsForThisTransaction && ticketCount < tickets;
          j++
        ) {
          ticketCount++;
          const ticketId = `TEST-TICKET-${Date.now()}-${ticketCount}`;
          const isCheckedIn = includeCheckedIn && ticketCount <= 2;

          await db.execute(
            `INSERT INTO tickets (
              ticket_id, transaction_id, ticket_type, event_id, event_date,
              attendee_first_name, attendee_last_name, attendee_email,
              price_cents, status, checked_in_at, validation_code
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ticketId,
              transactionId,
              j === 0 ? "weekend-pass" : "day-pass",
              "fest-2026",
              "2026-05-15",
              `Attendee${ticketCount}`,
              `Lastname${ticketCount}`,
              `attendee${ticketCount}@example.com`,
              j === 0 ? 15000 : 4500,
              ticketCount === 1 && includeCancelled ? "cancelled" : "valid",
              isCheckedIn ? new Date().toISOString() : null,
              crypto.randomBytes(16).toString("hex"),
            ],
          );
        }
      }

      // Seed email subscribers
      for (let i = 1; i <= subscribers; i++) {
        const email = `subscriber${i}@example.com`;
        const status = i <= 2 ? "unsubscribed" : i === 3 ? "bounced" : "active";

        await db.execute(
          `INSERT INTO email_subscribers (
            email, status, consent_source, created_at,
            unsubscribed_at, brevo_contact_id, bounce_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            email,
            status,
            "test_seed",
            new Date(Date.now() - i * 86400000).toISOString(),
            status === "unsubscribed" ? new Date().toISOString() : null,
            i <= 5 ? `brevo_${i}` : null,
            status === "bounced" ? 1 : 0, // Set bounce_count
          ],
        );
      }

      console.log(`✅ Database seeded with:
        - ${transactions} transactions
        - ${ticketCount} tickets
        - ${subscribers} email subscribers`);

      return {
        transactionIds,
        ticketCount,
        subscriberCount: subscribers,
      };
    } catch (error) {
      console.error("❌ Failed to seed database:", error.message);
      throw error;
    }
  }

  /**
   * Create a test transaction with tickets
   */
  async createTestTransaction(options = {}) {
    const db = this.db || await getDatabaseClient();
    const {
      email = "test@example.com",
      name = "Test User",
      amount = 19500,
      ticketCount = 2,
      ticketType = "weekend-pass",
    } = options;

    const transactionId = `TEST-TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    try {
      // Create transaction (no explicit transaction wrapping to avoid rollback issues)
      const transResult = await db.execute(
        `INSERT INTO transactions (
          transaction_id, stripe_session_id, customer_email, 
          customer_name, amount_cents, status, order_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionId,
          `cs_test_${crypto.randomBytes(16).toString("hex")}`,
          email,
          name,
          amount,
          "completed",
          JSON.stringify({ ticketCount, ticketType }),
        ],
      );

      const databaseTransactionId = transResult?.lastInsertRowid;
      if (!databaseTransactionId) {
        throw new Error("Failed to create transaction - no lastInsertRowid returned");
      }

      // Create tickets
      const ticketIds = [];
      for (let i = 0; i < ticketCount; i++) {
        const ticketId = `TICKET-${transactionId}-${i}`;
        await db.execute(
          `INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, event_id,
            attendee_email, price_cents, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ticketId,
            databaseTransactionId,
            ticketType,
            "fest-2026",
            email,
            Math.floor(amount / ticketCount),
            "valid",
          ],
        );
        ticketIds.push(ticketId);
      }

      return {
        transactionId: databaseTransactionId,
        transactionUuid: transactionId,
        ticketIds,
      };
    } catch (error) {
      console.error("Failed to create test transaction:", error);
      throw error;
    }
  }

  /**
   * Create a test email subscriber
   */
  async createTestSubscriber(options = {}) {
    const db = this.db || await getDatabaseClient();
    const {
      email = `test${Date.now()}@example.com`,
      status = "active",
      source = "test",
      firstName = "Test",
      lastName = "User",
    } = options;

    const result = await db.execute(
      `INSERT INTO email_subscribers (email, status, consent_source, first_name, last_name)
       VALUES (?, ?, ?, ?, ?)`,
      [email, status, source, firstName, lastName],
    );

    return {
      id: result?.lastInsertRowid,
      email,
      status,
    };
  }

  /**
   * Get database statistics for testing
   */
  async getDatabaseStats() {
    const db = this.db || await getDatabaseClient();

    const stats = {
      transactions: 0,
      tickets: 0,
      checkedInTickets: 0,
      subscribers: 0,
      activeSubscribers: 0,
    };

    try {
      const transResult = await db.execute(
        "SELECT COUNT(*) as count FROM transactions",
      );
      stats.transactions = transResult?.rows?.[0]?.count || 0;

      const ticketResult = await db.execute(
        "SELECT COUNT(*) as count FROM tickets",
      );
      stats.tickets = ticketResult?.rows?.[0]?.count || 0;

      const checkedInResult = await db.execute(
        "SELECT COUNT(*) as count FROM tickets WHERE checked_in_at IS NOT NULL",
      );
      stats.checkedInTickets = checkedInResult?.rows?.[0]?.count || 0;

      const subResult = await db.execute(
        "SELECT COUNT(*) as count FROM email_subscribers",
      );
      stats.subscribers = subResult?.rows?.[0]?.count || 0;

      const activeSubResult = await db.execute(
        "SELECT COUNT(*) as count FROM email_subscribers WHERE status = 'active'",
      );
      stats.activeSubscribers = activeSubResult?.rows?.[0]?.count || 0;

      return stats;
    } catch (error) {
      console.error("Failed to get database stats:", error);
      return stats;
    }
  }

  /**
   * Wait for database operation to complete
   * Useful for async operations that may take time
   */
  async waitForCondition(conditionFn, timeout = 5000, interval = 100) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await conditionFn()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return false;
  }

  /**
   * Execute raw SQL for custom test scenarios
   */
  async executeSQL(sql, params = []) {
    const db = this.db || await getDatabaseClient();
    return db.execute(sql, params);
  }

  /**
   * Create a snapshot of current database state
   */
  async createSnapshot() {
    const stats = await this.getDatabaseStats();
    const db = this.db || await getDatabaseClient();

    // Get sample data for verification
    const transactions = await db.execute(
      "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 5",
    );

    const tickets = await db.execute(
      "SELECT * FROM tickets ORDER BY created_at DESC LIMIT 5",
    );

    return {
      stats,
      samples: {
        transactions: transactions?.rows || [],
        tickets: tickets?.rows || [],
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify database is in expected state
   */
  async verifyDatabaseState(expectations) {
    const stats = await this.getDatabaseStats();
    const errors = [];

    for (const [key, expected] of Object.entries(expectations)) {
      if (stats[key] !== expected) {
        errors.push(`${key}: expected ${expected}, got ${stats[key]}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Database state mismatch:\n${errors.join("\n")}`);
    }

    return true;
  }
}

// Export singleton instance
export const dbTestHelpers = new DatabaseTestHelpers();

// Export class for custom instances
export default DatabaseTestHelpers;
