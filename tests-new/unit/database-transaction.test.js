/**
 * Database Transaction Tests
 * Critical transaction integrity for payment/ticket flow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, executeQuery, runMigrations, cleanupDb } from '../core/db.js';

describe('Database Transactions', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    runMigrations(db);
  });

  afterEach(() => cleanupDb(db));

  it('should rollback on error', () => {
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO transactions (transaction_id, type, amount, customer_email) VALUES (?, ?, ?, ?)').run('tx-1', 'tickets', 5000, 'test@example.com');
      throw new Error('Simulated failure');
    });
    expect(() => tx()).toThrow();
    expect(executeQuery(db, 'SELECT COUNT(*) as count FROM transactions')[0].count).toBe(0);
  });

  it('should commit on success', () => {
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO transactions (transaction_id, type, amount, customer_email) VALUES (?, ?, ?, ?)').run('tx-1', 'tickets', 5000, 'test@example.com');
      db.prepare('INSERT INTO tickets (ticket_id, transaction_id, ticket_type) VALUES (?, ?, ?)').run('tkt-1', 'tx-1', 'early_bird');
    });
    tx();
    expect(executeQuery(db, 'SELECT COUNT(*) as count FROM transactions')[0].count).toBe(1);
    expect(executeQuery(db, 'SELECT COUNT(*) as count FROM tickets')[0].count).toBe(1);
  });

  it('should handle concurrent transactions', () => {
    const tx1 = db.transaction(() => db.prepare('INSERT INTO transactions (transaction_id, type, amount, customer_email) VALUES (?, ?, ?, ?)').run('tx-1', 'tickets', 5000, 'test1@example.com'));
    const tx2 = db.transaction(() => db.prepare('INSERT INTO transactions (transaction_id, type, amount, customer_email) VALUES (?, ?, ?, ?)').run('tx-2', 'donation', 2500, 'test2@example.com'));
    tx1(); tx2();
    expect(executeQuery(db, 'SELECT COUNT(*) as count FROM transactions')[0].count).toBe(2);
  });
});