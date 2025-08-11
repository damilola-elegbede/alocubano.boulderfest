/**
 * Database Test Utilities
 *
 * Provides database isolation, test helpers, and utilities for testing database operations
 * Supports both SQLite and Turso database configurations
 */

import Database from "better-sqlite3";
import { vi } from "vitest";
import { TestDataFactory } from "./test-data-builder.js";

/**
 * Database Test Manager
 * Handles test database creation, isolation, and cleanup
 */
export class DatabaseTestManager {
  constructor() {
    this.testDatabases = new Map();
    this.originalDatabaseClient = null;
    this.transactionStack = [];
    this.isSetup = false;
  }

  /**
   * Setup test database environment
   */
  async setup(options = {}) {
    if (this.isSetup) return;

    const config = {
      inMemory: true,
      isolated: true,
      enableWal: false,
      enableForeignKeys: true,
      ...options,
    };

    // Create test database connection
    const dbPath = config.inMemory ? ":memory:" : `test-${Date.now()}.db`;
    const db = new Database(dbPath);

    // Configure database settings
    if (config.enableForeignKeys) {
      db.pragma("foreign_keys = ON");
    }

    if (config.enableWal && !config.inMemory) {
      db.pragma("journal_mode = WAL");
    }

    // Initialize schema
    await this.initializeSchema(db);

    // Store main test database
    this.testDatabases.set("main", db);
    this.isSetup = true;

    return db;
  }

  /**
   * Initialize database schema for testing
   */
  async initializeSchema(db) {
    const schema = `
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        address_json TEXT,
        preferences_json TEXT DEFAULT '{}',
        metadata_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Email subscriptions table
      CREATE TABLE IF NOT EXISTS email_subscriptions (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        first_name TEXT,
        last_name TEXT,
        status TEXT DEFAULT 'subscribed',
        source TEXT DEFAULT 'website',
        preferences_json TEXT DEFAULT '{}',
        metadata_json TEXT DEFAULT '{}',
        subscription_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        unsubscription_date DATETIME,
        unsubscribe_token TEXT
      );

      -- Tickets table
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        ticket_id TEXT UNIQUE NOT NULL,
        user_id TEXT,
        event_id TEXT NOT NULL DEFAULT 'alocubano-boulderfest-2026',
        type TEXT NOT NULL DEFAULT 'full-pass',
        price DECIMAL(10,2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'active',
        purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        valid_from DATETIME NOT NULL,
        valid_to DATETIME NOT NULL,
        qr_code TEXT UNIQUE,
        wallet_pass_urls_json TEXT DEFAULT '{}',
        metadata_json TEXT DEFAULT '{}',
        used_at DATETIME,
        validated_by TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Payments table
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        payment_intent_id TEXT UNIQUE,
        session_id TEXT,
        amount DECIMAL(10,2) NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'pending',
        payment_method TEXT DEFAULT 'card',
        customer_email TEXT NOT NULL,
        customer_name TEXT,
        billing_address_json TEXT,
        items_json TEXT DEFAULT '[]',
        metadata_json TEXT DEFAULT '{}',
        stripe_customer_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );

      -- Gallery items table
      CREATE TABLE IF NOT EXISTS gallery_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'workshops',
        type TEXT DEFAULT 'image',
        mime_type TEXT DEFAULT 'image/jpeg',
        size INTEGER,
        thumbnail_url TEXT,
        view_url TEXT,
        download_url TEXT,
        metadata_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- QR validation logs table
      CREATE TABLE IF NOT EXISTS qr_validation_logs (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        qr_code TEXT NOT NULL,
        validation_result TEXT NOT NULL, -- 'valid', 'invalid', 'used', 'expired'
        validated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        validated_by TEXT,
        ip_address TEXT,
        user_agent TEXT,
        metadata_json TEXT DEFAULT '{}',
        FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id)
      );

      -- Analytics events table
      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        event_data_json TEXT DEFAULT '{}',
        user_id TEXT,
        session_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        referrer TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata_json TEXT DEFAULT '{}'
      );

      -- Migrations tracking table
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        checksum TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_email_subscriptions_email ON email_subscriptions(email);
      CREATE INDEX IF NOT EXISTS idx_email_subscriptions_status ON email_subscriptions(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON tickets(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON tickets(qr_code);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_payments_payment_intent_id ON payments(payment_intent_id);
      CREATE INDEX IF NOT EXISTS idx_payments_session_id ON payments(session_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_gallery_items_category ON gallery_items(category);
      CREATE INDEX IF NOT EXISTS idx_qr_validation_logs_ticket_id ON qr_validation_logs(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
    `;

    // Execute schema in transaction
    const statements = schema.split(";").filter((stmt) => stmt.trim());

    db.transaction(() => {
      for (const statement of statements) {
        if (statement.trim()) {
          db.exec(statement);
        }
      }
    })();
  }

  /**
   * Create isolated test database for a specific test
   */
  async createIsolatedDatabase(testName) {
    const dbPath = `:memory:`;
    const db = new Database(dbPath);

    db.pragma("foreign_keys = ON");
    await this.initializeSchema(db);

    this.testDatabases.set(testName, db);
    return db;
  }

  /**
   * Get database for testing
   */
  getDatabase(name = "main") {
    return this.testDatabases.get(name);
  }

  /**
   * Start a transaction for test isolation
   */
  beginTransaction(db = null) {
    const database = db || this.getDatabase();
    if (!database) {
      throw new Error("No database available for transaction");
    }

    const transaction = database.transaction(() => {});
    transaction.begin = database.prepare("BEGIN TRANSACTION");
    transaction.commit = database.prepare("COMMIT");
    transaction.rollback = database.prepare("ROLLBACK");

    transaction.begin.run();
    this.transactionStack.push({ database, transaction });

    return transaction;
  }

  /**
   * Rollback current transaction
   */
  rollbackTransaction() {
    const current = this.transactionStack.pop();
    if (current) {
      try {
        current.transaction.rollback.run();
      } catch (error) {
        // Transaction may already be rolled back
        console.warn("Transaction rollback warning:", error.message);
      }
    }
  }

  /**
   * Commit current transaction
   */
  commitTransaction() {
    const current = this.transactionStack.pop();
    if (current) {
      current.transaction.commit.run();
    }
  }

  /**
   * Seed database with test data
   */
  async seedDatabase(db = null, options = {}) {
    const database = db || this.getDatabase();
    if (!database) {
      throw new Error("No database available for seeding");
    }

    const {
      userCount = 5,
      ticketCount = 10,
      subscriptionCount = 20,
      paymentCount = 10,
      galleryItemCount = 15,
    } = options;

    const seedData = {
      users: TestDataFactory.createUsers(userCount),
      tickets: TestDataFactory.createTickets(ticketCount),
      subscriptions:
        TestDataFactory.createEmailSubscriptions(subscriptionCount),
      payments: TestDataFactory.createPayments(paymentCount),
      galleryItems: TestDataFactory.createGalleryItems(galleryItemCount),
    };

    // Insert test data
    await this.insertTestData(database, seedData);

    return seedData;
  }

  /**
   * Insert test data into database
   */
  async insertTestData(db, seedData) {
    const transaction = db.transaction(() => {
      // Insert users
      const insertUser = db.prepare(`
        INSERT INTO users (id, first_name, last_name, email, phone, address_json, preferences_json, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      seedData.users.forEach((user) => {
        insertUser.run(
          user.id,
          user.firstName,
          user.lastName,
          user.email,
          user.phone,
          JSON.stringify(user.address),
          JSON.stringify(user.preferences),
          JSON.stringify(user.metadata),
          user.createdAt.toISOString(),
          user.updatedAt.toISOString(),
        );
      });

      // Insert email subscriptions
      const insertSubscription = db.prepare(`
        INSERT INTO email_subscriptions (id, email, first_name, last_name, status, source, preferences_json, metadata_json, subscription_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      seedData.subscriptions.forEach((sub) => {
        insertSubscription.run(
          sub.id,
          sub.email,
          sub.firstName,
          sub.lastName,
          sub.status,
          sub.source,
          JSON.stringify(sub.preferences),
          JSON.stringify(sub.metadata),
          sub.subscriptionDate.toISOString(),
        );
      });

      // Insert tickets
      const insertTicket = db.prepare(`
        INSERT INTO tickets (id, ticket_id, user_id, event_id, type, price, currency, status, purchase_date, valid_from, valid_to, qr_code, wallet_pass_urls_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      seedData.tickets.forEach((ticket) => {
        insertTicket.run(
          ticket.id,
          ticket.ticketId,
          ticket.userId,
          ticket.eventId,
          ticket.type,
          ticket.price,
          ticket.currency,
          ticket.status,
          ticket.purchaseDate.toISOString(),
          ticket.validFrom.toISOString(),
          ticket.validTo.toISOString(),
          ticket.qrCode,
          JSON.stringify(ticket.walletPassUrls),
          JSON.stringify(ticket.metadata),
        );
      });

      // Insert payments
      const insertPayment = db.prepare(`
        INSERT INTO payments (id, payment_intent_id, session_id, amount, currency, status, payment_method, customer_email, customer_name, billing_address_json, items_json, metadata_json, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      seedData.payments.forEach((payment) => {
        insertPayment.run(
          payment.id,
          payment.paymentIntentId,
          payment.sessionId,
          payment.amount,
          payment.currency,
          payment.status,
          payment.paymentMethod,
          payment.customerEmail,
          payment.customerName,
          JSON.stringify(payment.billingAddress),
          JSON.stringify(payment.items),
          JSON.stringify(payment.metadata),
          payment.createdAt.toISOString(),
          payment.completedAt.toISOString(),
        );
      });

      // Insert gallery items
      const insertGalleryItem = db.prepare(`
        INSERT INTO gallery_items (id, name, category, type, mime_type, size, thumbnail_url, view_url, download_url, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      seedData.galleryItems.forEach((item) => {
        insertGalleryItem.run(
          item.id,
          item.name,
          item.category,
          item.type,
          item.mimeType,
          item.size,
          item.thumbnailUrl,
          item.viewUrl,
          item.downloadUrl,
          JSON.stringify(item.metadata),
          item.createdAt.toISOString(),
          item.createdAt.toISOString(),
        );
      });
    });

    transaction();
  }

  /**
   * Clear all data from database
   */
  clearDatabase(db = null) {
    const database = db || this.getDatabase();
    if (!database) return;

    const tables = [
      "analytics_events",
      "qr_validation_logs",
      "gallery_items",
      "payments",
      "tickets",
      "email_subscriptions",
      "users",
      "migrations",
    ];

    const transaction = database.transaction(() => {
      // Disable foreign key checks temporarily
      database.pragma("foreign_keys = OFF");

      tables.forEach((table) => {
        database.prepare(`DELETE FROM ${table}`).run();
      });

      // Re-enable foreign key checks
      database.pragma("foreign_keys = ON");
    });

    transaction();
  }

  /**
   * Get table row count
   */
  getTableRowCount(tableName, db = null) {
    const database = db || this.getDatabase();
    if (!database) return 0;

    const stmt = database.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
    const result = stmt.get();
    return result.count;
  }

  /**
   * Execute raw SQL query
   */
  query(sql, params = [], db = null) {
    const database = db || this.getDatabase();
    if (!database) {
      throw new Error("No database available for query");
    }

    const stmt = database.prepare(sql);

    if (sql.trim().toUpperCase().startsWith("SELECT")) {
      return params.length > 0 ? stmt.all(params) : stmt.all();
    } else {
      return params.length > 0 ? stmt.run(params) : stmt.run();
    }
  }

  /**
   * Cleanup test databases
   */
  cleanup() {
    // Rollback any remaining transactions
    while (this.transactionStack.length > 0) {
      this.rollbackTransaction();
    }

    // Close all test databases
    for (const [name, db] of this.testDatabases) {
      try {
        db.close();
      } catch (error) {
        console.warn(`Error closing database ${name}:`, error.message);
      }
    }

    this.testDatabases.clear();
    this.isSetup = false;
  }

  /**
   * Create database backup for restoration
   */
  createBackup(db = null) {
    const database = db || this.getDatabase();
    if (!database) return null;

    const backup = new Map();

    const tables = [
      "users",
      "email_subscriptions",
      "tickets",
      "payments",
      "gallery_items",
      "qr_validation_logs",
      "analytics_events",
    ];

    tables.forEach((table) => {
      try {
        const rows = database.prepare(`SELECT * FROM ${table}`).all();
        backup.set(table, rows);
      } catch (error) {
        // Table might not exist
        backup.set(table, []);
      }
    });

    return backup;
  }

  /**
   * Restore database from backup
   */
  restoreFromBackup(backup, db = null) {
    const database = db || this.getDatabase();
    if (!database || !backup) return;

    this.clearDatabase(database);

    const transaction = database.transaction(() => {
      for (const [tableName, rows] of backup) {
        if (rows.length === 0) continue;

        const columnNames = Object.keys(rows[0]);
        const placeholders = columnNames.map(() => "?").join(", ");
        const sql = `INSERT INTO ${tableName} (${columnNames.join(", ")}) VALUES (${placeholders})`;
        const stmt = database.prepare(sql);

        rows.forEach((row) => {
          const values = columnNames.map((col) => row[col]);
          stmt.run(values);
        });
      }
    });

    transaction();
  }
}

/**
 * Database Test Helpers
 * Convenient functions for common database testing patterns
 */
export const DatabaseTestHelpers = {
  /**
   * Assert table has expected row count
   */
  async assertTableRowCount(tableName, expectedCount, db = null) {
    const actualCount = dbTestManager.getTableRowCount(tableName, db);
    if (actualCount !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} rows in ${tableName}, but found ${actualCount}`,
      );
    }
    return true;
  },

  /**
   * Assert record exists
   */
  async assertRecordExists(tableName, conditions, db = null) {
    const database = db || dbTestManager.getDatabase();
    if (!database) {
      throw new Error("No database available");
    }

    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = Object.values(conditions);
    const sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${whereClause}`;

    const result = database.prepare(sql).get(values);
    if (result.count === 0) {
      throw new Error(
        `No record found in ${tableName} with conditions: ${JSON.stringify(conditions)}`,
      );
    }
    return true;
  },

  /**
   * Assert record does not exist
   */
  async assertRecordNotExists(tableName, conditions, db = null) {
    const database = db || dbTestManager.getDatabase();
    if (!database) {
      throw new Error("No database available");
    }

    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = Object.values(conditions);
    const sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${whereClause}`;

    const result = database.prepare(sql).get(values);
    if (result.count > 0) {
      throw new Error(
        `Unexpected record found in ${tableName} with conditions: ${JSON.stringify(conditions)}`,
      );
    }
    return true;
  },

  /**
   * Get record by conditions
   */
  async getRecord(tableName, conditions, db = null) {
    const database = db || dbTestManager.getDatabase();
    if (!database) {
      throw new Error("No database available");
    }

    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = Object.values(conditions);
    const sql = `SELECT * FROM ${tableName} WHERE ${whereClause} LIMIT 1`;

    return database.prepare(sql).get(values);
  },

  /**
   * Insert test record
   */
  async insertRecord(tableName, data, db = null) {
    const database = db || dbTestManager.getDatabase();
    if (!database) {
      throw new Error("No database available");
    }

    const columns = Object.keys(data).join(", ");
    const placeholders = Object.keys(data)
      .map(() => "?")
      .join(", ");
    const values = Object.values(data);
    const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;

    return database.prepare(sql).run(values);
  },

  /**
   * Update test record
   */
  async updateRecord(tableName, data, conditions, db = null) {
    const database = db || dbTestManager.getDatabase();
    if (!database) {
      throw new Error("No database available");
    }

    const setClause = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = [...Object.values(data), ...Object.values(conditions)];
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;

    return database.prepare(sql).run(values);
  },

  /**
   * Delete test record
   */
  async deleteRecord(tableName, conditions, db = null) {
    const database = db || dbTestManager.getDatabase();
    if (!database) {
      throw new Error("No database available");
    }

    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = Object.values(conditions);
    const sql = `DELETE FROM ${tableName} WHERE ${whereClause}`;

    return database.prepare(sql).run(values);
  },
};

/**
 * Mock database client for API testing
 */
export const createMockDatabaseClient = () => {
  const mockClient = {
    query: vi.fn(),
    execute: vi.fn(),
    batch: vi.fn(),
    transaction: vi.fn(),
    close: vi.fn(),
    sync: vi.fn(),
  };

  // Default implementations
  mockClient.query.mockResolvedValue({ rows: [], meta: {} });
  mockClient.execute.mockResolvedValue({ rows: [], meta: {} });
  mockClient.batch.mockResolvedValue([]);
  mockClient.transaction.mockImplementation(async (callback) => {
    return await callback(mockClient);
  });

  return mockClient;
};

/**
 * Global database test manager instance
 */
export const dbTestManager = new DatabaseTestManager();

/**
 * Convenience functions for common database testing scenarios
 */
export const DatabaseScenarios = {
  /**
   * Setup clean database for test
   */
  async cleanDatabase() {
    await dbTestManager.setup();
    dbTestManager.clearDatabase();
    return dbTestManager.getDatabase();
  },

  /**
   * Setup database with seed data
   */
  async seededDatabase(seedOptions = {}) {
    const db = await DatabaseScenarios.cleanDatabase();
    const seedData = await dbTestManager.seedDatabase(db, seedOptions);
    return { db, seedData };
  },

  /**
   * Setup isolated test with transaction rollback
   */
  async isolatedTest(testFn) {
    const db = await DatabaseScenarios.cleanDatabase();
    const transaction = dbTestManager.beginTransaction(db);

    try {
      await testFn(db);
    } finally {
      dbTestManager.rollbackTransaction();
    }
  },

  /**
   * Performance test with large dataset
   */
  async performanceTest(testFn, dataSize = 1000) {
    const db = await DatabaseScenarios.cleanDatabase();
    await dbTestManager.seedDatabase(db, {
      userCount: dataSize,
      ticketCount: dataSize * 2,
      subscriptionCount: dataSize * 3,
      paymentCount: dataSize * 2,
      galleryItemCount: dataSize / 2,
    });

    const startTime = Date.now();
    await testFn(db);
    const endTime = Date.now();

    return { duration: endTime - startTime, recordCount: dataSize };
  },
};
