import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates a fresh in-memory SQLite database for testing
 * Replaces 1,017 lines of complex database infrastructure
 */
export function createTestDatabase() {
  const db = new Database(":memory:");
  const schemaPath = join(__dirname, "..", "test-schema.sql");
  try {
    const schema = readFileSync(schemaPath, "utf8");
    db.exec(schema);
  } catch (error) {
    throw new Error(
      `Failed to load test schema from ${schemaPath}: ${error.message}`,
    );
  }
  return db;
}

/**
 * Seeds test data from fixture files
 */
export function seedTestData(db, fixture = "minimal") {
  const fixturePath = join(__dirname, "..", "fixtures", `${fixture}.sql`);
  const sql = readFileSync(fixturePath, "utf8");
  db.exec(sql);
  return db;
}

/**
 * Helper to create test users
 */
export function createTestUser(db, data = {}) {
  const defaults = {
    email: `test${Date.now()}@example.com`,
    name: "Test User",
    tickets: 1,
    payment_status: "pending",
  };
  const user = { ...defaults, ...data };

  const result = db
    .prepare(
      `INSERT INTO registrations (email, name, tickets, payment_status) 
     VALUES (?, ?, ?, ?)`,
    )
    .run(user.email, user.name, user.tickets, user.payment_status);

  return { id: result.lastInsertRowid, ...user };
}

/**
 * Helper to create test tickets
 */
export function createTestTicket(db, data = {}) {
  const defaults = {
    id: `ticket_${Date.now()}`,
    email: "test@example.com",
    ticket_type: "general",
    status: "active",
    qr_code: `qr_${Date.now()}`,
    qr_token: `token_${Date.now()}`,
  };
  const ticket = { ...defaults, ...data };

  db.prepare(
    `INSERT INTO tickets (id, email, ticket_type, status, qr_code, qr_token) 
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    ticket.id,
    ticket.email,
    ticket.ticket_type,
    ticket.status,
    ticket.qr_code,
    ticket.qr_token,
  );

  return ticket;
}

/**
 * LibSQL adapter for API compatibility
 */
export function createLibSQLAdapter(db) {
  return {
    execute: (sql, params = []) => {
      try {
        // Convert numbered parameters (?1, ?2) to positional (?, ?)
        const convertedSql = sql.replace(/\?(\d+)/g, "?");
        const stmt = db.prepare(convertedSql);
        const isSelect = sql.trim().toUpperCase().startsWith("SELECT");

        if (isSelect) {
          const result = params.length ? stmt.all(...params) : stmt.all();
          return Promise.resolve({
            rows: result,
            rowsAffected: 0,
          });
        } else {
          const result = params.length ? stmt.run(...params) : stmt.run();
          return Promise.resolve({
            rows: [],
            rowsAffected: result.changes,
            lastInsertRowid: result.lastInsertRowid,
          });
        }
      } catch (error) {
        return Promise.reject(error);
      }
    },
    close: () => {
      db.close();
      return Promise.resolve();
    },
  };
}

/**
 * Query helper for common operations
 */
export function queryHelper(db) {
  return {
    findUserByEmail: (email) =>
      db.prepare("SELECT * FROM registrations WHERE email = ?").get(email),
    findTicketById: (id) =>
      db.prepare("SELECT * FROM tickets WHERE id = ?").get(id),
    countUsers: () =>
      db.prepare("SELECT COUNT(*) as count FROM registrations").get().count,
    countTickets: () =>
      db.prepare("SELECT COUNT(*) as count FROM tickets").get().count,
    getAllUsers: () => db.prepare("SELECT * FROM registrations").all(),
    getAllTickets: () => db.prepare("SELECT * FROM tickets").all(),
  };
}

/**
 * Helper to create test transactions
 */
export function createTestTransaction(db, data = {}) {
  const defaults = {
    transaction_id: `txn_${Date.now()}`,
    type: "tickets",
    status: "completed",
    amount_cents: 5000,
    customer_email: "test@example.com",
    customer_name: "Test User",
    order_data: JSON.stringify({ tickets: 1 }),
  };
  const transaction = { ...defaults, ...data };

  const result = db
    .prepare(
      `INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, customer_name, order_data) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      transaction.transaction_id,
      transaction.type,
      transaction.status,
      transaction.amount_cents,
      transaction.customer_email,
      transaction.customer_name,
      transaction.order_data,
    );

  return { id: result.lastInsertRowid, ...transaction };
}

/**
 * Helper to create test newsletter subscriber
 */
export function createTestSubscriber(db, data = {}) {
  const defaults = {
    email: `subscriber${Date.now()}@example.com`,
    status: "active",
  };
  const subscriber = { ...defaults, ...data };

  const result = db
    .prepare(
      `INSERT INTO newsletter_subscribers (email, status) 
     VALUES (?, ?)`,
    )
    .run(subscriber.email, subscriber.status);

  return { id: result.lastInsertRowid, ...subscriber };
}
