// DEPRECATED: This file has been replaced by tests/helpers/setup.js
// Use setupTest() and teardownTest() instead

/**
 * Test Initialization Orchestrator
 *
 * Comprehensive solution for test initialization and isolation
 * Addresses all root causes of test failures through systematic infrastructure
 */

import { getDatabaseClient } from "../../api/lib/database.js";
import { vi } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test Initialization Orchestrator
 * Ensures all services are ready before tests run
 */
export class TestInitializationOrchestrator {
  constructor() {
    this.initialized = false;
    this.services = new Map();
    this.mockRegistry = new Map();
    this.initializationPromise = null;
    this.transactionStack = [];
    this.environmentSnapshot = null;
  }

  /**
   * Initialize all test infrastructure
   */
  async initialize() {
    if (this.initialized) return;

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      this.initialized = true;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   */
  async _performInitialization() {
    // Step 1: Environment setup
    await this.setupTestEnvironment();

    // Step 2: Database initialization
    await this.initializeDatabase();

    // Step 3: Service initialization
    await this.initializeServices();

    // Step 4: Mock configuration
    await this.configureMocks();

    // Step 5: Validation
    await this.validateInitialization();
  }

  /**
   * Setup test environment with all required variables
   */
  async setupTestEnvironment() {
    // Ensure all required environment variables
    const requiredVars = {
      NODE_ENV: "test",
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || ":memory:",
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || "test-token",
      BREVO_API_KEY: process.env.BREVO_API_KEY || "test-key",
      BREVO_NEWSLETTER_LIST_ID: process.env.BREVO_NEWSLETTER_LIST_ID || "2",
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "sk_test_123",
      STRIPE_PUBLISHABLE_KEY:
        process.env.STRIPE_PUBLISHABLE_KEY || "pk_test_123",
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "$2a$10$test",
      ADMIN_SECRET:
        process.env.ADMIN_SECRET || "test-secret-minimum-32-characters-long",
      WALLET_AUTH_SECRET:
        process.env.WALLET_AUTH_SECRET || "test-wallet-secret",
    };

    // Apply environment variables
    Object.entries(requiredVars).forEach(([key, value]) => {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });

    // Create environment snapshot for restoration
    this.environmentSnapshot = { ...process.env };
  }

  /**
   * Initialize database with proper schema
   */
  async initializeDatabase() {
    const db = await getDatabaseClient();

    // Ensure foreign keys are off during setup
    await db.execute("PRAGMA foreign_keys = OFF");

    // Create all required tables
    const schema = this.getDatabaseSchema();
    for (const [tableName, createStatement] of Object.entries(schema)) {
      try {
        await db.execute(createStatement);
      } catch (error) {
        // Table might already exist, that's ok
        if (!error.message.includes("already exists")) {
          console.warn(`Warning creating ${tableName}:`, error.message);
        }
      }
    }

    // Ensure all columns exist
    await this.ensureSchemaConsistency(db);

    // Re-enable foreign keys
    await db.execute("PRAGMA foreign_keys = ON");

    this.services.set("database", db);
  }

  /**
   * Ensure schema has all required columns
   */
  async ensureSchemaConsistency(db) {
    // Add missing columns if they don't exist
    const schemaUpdates = [
      {
        table: "transactions",
        columns: [
          { name: "uuid", type: "TEXT" },
          { name: "metadata", type: "TEXT" },
          { name: "total_amount", type: "INTEGER" },
        ],
      },
      {
        table: "tickets",
        columns: [{ name: "cancellation_reason", type: "TEXT" }],
      },
      {
        table: "email_audit_log",
        columns: [
          { name: "ip_address", type: "TEXT" },
          { name: "user_agent", type: "TEXT" },
        ],
      },
      {
        table: "email_subscribers",
        columns: [{ name: "bounce_count", type: "INTEGER DEFAULT 0" }],
      },
    ];

    for (const update of schemaUpdates) {
      for (const column of update.columns) {
        try {
          await db.execute(
            `ALTER TABLE ${update.table} ADD COLUMN ${column.name} ${column.type}`,
          );
        } catch (error) {
          // Column might already exist
          if (!error.message.includes("duplicate column")) {
            // Ignore, column exists
          }
        }
      }
    }
  }

  /**
   * Initialize all services with proper isolation
   */
  async initializeServices() {
    // Initialize services in dependency order
    const serviceOrder = ["database", "email", "payment", "tickets"];

    for (const serviceName of serviceOrder) {
      if (!this.services.has(serviceName)) {
        await this.initializeService(serviceName);
      }
    }
  }

  /**
   * Initialize individual service
   */
  async initializeService(serviceName) {
    switch (serviceName) {
      case "email":
        // Mock email service for tests
        this.services.set("email", {
          subscribe: vi.fn().mockResolvedValue({ success: true }),
          unsubscribe: vi.fn().mockResolvedValue({ success: true }),
          sendEmail: vi.fn().mockResolvedValue({ success: true }),
        });
        break;

      case "payment":
        // Mock payment service for tests
        this.services.set("payment", {
          createCheckoutSession: vi.fn().mockResolvedValue({
            id: "cs_test_123",
            url: "https://checkout.stripe.com/test",
          }),
          processWebhook: vi.fn().mockResolvedValue({ success: true }),
        });
        break;

      case "tickets":
        // Mock ticket service for tests
        this.services.set("tickets", {
          createTicket: vi.fn().mockResolvedValue({
            id: "ticket_123",
            qrCode: "data:image/png;base64,test",
          }),
          validateTicket: vi.fn().mockResolvedValue({ valid: true }),
        });
        break;
    }
  }

  /**
   * Configure all mocks with proper isolation
   */
  async configureMocks() {
    // Mock fetch for API calls
    global.fetch = vi.fn().mockImplementation((url, options) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
        text: () => Promise.resolve("OK"),
      });
    });

    // Mock timers for consistent timing
    vi.useFakeTimers();

    // Store mock references for cleanup
    this.mockRegistry.set("fetch", global.fetch);
    this.mockRegistry.set("timers", true);
  }

  /**
   * Validate initialization was successful
   */
  async validateInitialization() {
    // Check database connection
    const db = this.services.get("database");
    if (!db) throw new Error("Database not initialized");

    // Verify schema
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const tables = result.rows.map((r) => r.name);

    const requiredTables = ["transactions", "tickets", "email_subscribers"];
    for (const table of requiredTables) {
      if (!tables.includes(table)) {
        throw new Error(`Required table ${table} not found`);
      }
    }
  }

  /**
   * Create isolated test context
   */
  async setupTest() {
    await this.initialize();

    return {
      db: this.services.get("database"),
      services: this.services,
      mocks: this.mockRegistry,
      cleanup: () => this.cleanupTestContext(),
    };
  }

  /**
   * Start transaction for test isolation
   */
  async startTransaction() {
    const db = this.services.get("database");
    if (!db) throw new Error("Database not initialized");

    // Start a savepoint for nested transaction support
    const savepointName = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await db.execute(`SAVEPOINT ${savepointName}`);

    this.transactionStack.push(savepointName);
    return savepointName;
  }

  /**
   * Rollback test transaction
   */
  async rollbackTransaction(savepointName) {
    const db = this.services.get("database");
    if (!db) return;

    if (savepointName && this.transactionStack.includes(savepointName)) {
      try {
        await db.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        await db.execute(`RELEASE SAVEPOINT ${savepointName}`);
      } catch (error) {
        // Ignore rollback errors in test mode
      }

      // Remove from stack
      const index = this.transactionStack.indexOf(savepointName);
      if (index > -1) {
        this.transactionStack.splice(index, 1);
      }
    }
  }

  /**
   * Cleanup test context
   */
  async cleanupTestContext() {
    // Rollback any pending transactions
    while (this.transactionStack.length > 0) {
      const savepoint = this.transactionStack.pop();
      await this.rollbackTransaction(savepoint);
    }

    // Clean database
    await this.cleanDatabase();

    // Reset mocks
    vi.clearAllMocks();

    // Restore timers
    if (this.mockRegistry.get("timers")) {
      vi.useRealTimers();
    }
  }

  /**
   * Clean database for next test
   */
  async cleanDatabase() {
    const db = this.services.get("database");
    if (!db) return;

    try {
      await db.execute("PRAGMA foreign_keys = OFF");

      // Clean in dependency order
      const tables = [
        "tickets",
        "transaction_items",
        "transactions",
        "payment_events",
        "email_events",
        "email_subscribers",
        "email_audit_log",
      ];

      for (const table of tables) {
        try {
          await db.execute(`DELETE FROM ${table}`);
        } catch (error) {
          // Table might not exist
        }
      }

      await db.execute("PRAGMA foreign_keys = ON");
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Get database schema definition
   */
  getDatabaseSchema() {
    return {
      transactions: `
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT UNIQUE NOT NULL,
          uuid TEXT,
          metadata TEXT,
          total_amount INTEGER,
          stripe_checkout_session_id TEXT,
          stripe_payment_intent_id TEXT,
          customer_email TEXT,
          customer_name TEXT,
          status TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      tickets: `
        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id TEXT UNIQUE NOT NULL,
          transaction_id INTEGER,
          ticket_type TEXT,
          attendee_email TEXT,
          status TEXT,
          cancellation_reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        )
      `,
      email_subscribers: `
        CREATE TABLE IF NOT EXISTS email_subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          first_name TEXT,
          last_name TEXT,
          status TEXT DEFAULT 'active',
          bounce_count INTEGER DEFAULT 0,
          consent_source TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      email_audit_log: `
        CREATE TABLE IF NOT EXISTS email_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      payment_events: `
        CREATE TABLE IF NOT EXISTS payment_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER,
          event_type TEXT,
          source TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        )
      `,
      transaction_items: `
        CREATE TABLE IF NOT EXISTS transaction_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER,
          item_type TEXT,
          quantity INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        )
      `,
      email_events: `
        CREATE TABLE IF NOT EXISTS email_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT,
          event_type TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
    };
  }

  /**
   * Reset singleton instance for testing
   */
  reset() {
    this.initialized = false;
    this.services.clear();
    this.mockRegistry.clear();
    this.initializationPromise = null;
    this.transactionStack = [];
    this.environmentSnapshot = null;
  }
}

// Export singleton instance
export const testOrchestrator = new TestInitializationOrchestrator();

/**
 * Helper function for test setup
 */
export async function setupTest() {
  const context = await testOrchestrator.setupTest();
  const savepoint = await testOrchestrator.startTransaction();

  return {
    ...context,
    savepoint,
    cleanup: async () => {
      await testOrchestrator.rollbackTransaction(savepoint);
      await context.cleanup();
    },
  };
}

/**
 * Helper function for test teardown
 */
export async function teardownTest(context) {
  if (context && context.cleanup) {
    await context.cleanup();
  }
}
