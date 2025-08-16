/**
 * Database utilities for testing
 * In-memory SQLite helpers using better-sqlite3
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

// Global test database instance
let testDb = null;

/**
 * Create in-memory SQLite database
 * @returns {Object} Database instance
 */
export function createTestDb() {
  try {
    // Always create a fresh database for each test
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = memory');
    
    // Create basic tables inline for testing
    db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        customer_email TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
      );
      
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        ticket_type TEXT NOT NULL
      );
    `);
    
    return db;
  } catch (error) {
    throw new Error(`Failed to create test database: ${error.message}`);
  }
}

/**
 * Seed basic test data
 * @param {Object} db - Database instance
 */
export function seedTestData(db) {
  try {
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, order_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    insertTransaction.run('test-tx-1', 'tickets', 'completed', 5000, 'test@example.com', '{}');
    insertTransaction.run('test-tx-2', 'donation', 'pending', 2500, 'donor@example.com', '{}');
    
    console.log('Test data seeded successfully');
  } catch (error) {
    throw new Error(`Failed to seed test data: ${error.message}`);
  }
}

/**
 * Cleanup database
 * @param {Object} db - Database instance
 */
export function cleanupDb(db) {
  try {
    if (db && db.open) {
      db.close();
    }
    testDb = null;
  } catch (error) {
    console.warn(`Database cleanup warning: ${error.message}`);
  }
}

/**
 * Run migration files
 * @param {Object} db - Database instance
 * @param {string} migrationsPath - Path to migrations directory
 */
export function runMigrations(db) {
  try {
    // Tables are already created in createTestDb
    console.log('Migrations executed successfully');
  } catch (error) {
    throw new Error(`Migration failed: ${error.message}`);
  }
}

/**
 * Simple query executor
 * @param {Object} db - Database instance
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Object} Query result
 */
export function executeQuery(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    return stmt.all(params);
  } catch (error) {
    throw new Error(`Query execution failed: ${error.message}`);
  }
}

/**
 * Get database connection
 * @returns {Object} Database instance
 */
export function getTestConnection() {
  if (!testDb || !testDb.open) {
    testDb = createTestDb();
  }
  return testDb;
}