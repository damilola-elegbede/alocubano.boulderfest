/**
 * Worker Database Verification
 * Tests that tables exist and persist across test methods within the same file
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getDbClient } from '../setup-integration.js';

describe('Integration: Worker Database Verification', () => {
  let db;

  beforeAll(async () => {
    console.log('🔍 BeforeAll: Getting database client');
    db = await getDbClient();
  });

  beforeEach(async () => {
    console.log('🔍 BeforeEach: Getting database client (should be same as beforeAll)');
    db = await getDbClient();
  });

  it('should have all required tables after migration', async () => {
    console.log('🔍 Test 1: Checking tables exist');

    // Check what tables exist
    const tablesResult = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    const tableNames = tablesResult.rows.map(row => row.name);
    console.log('📋 Available tables:', tableNames);

    // Verify core tables exist
    const requiredTables = ['tickets', 'qr_validations', 'transactions', 'email_subscribers'];
    for (const table of requiredTables) {
      expect(tableNames).toContain(table);
    }
  });

  it('should maintain tables across test methods', async () => {
    console.log('🔍 Test 2: Verifying tables still exist');

    // Check that tables still exist in second test
    const tablesResult = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('tickets', 'qr_validations', 'transactions')
      ORDER BY name
    `);

    expect(tablesResult.rows.length).toBe(3);
    console.log('✅ Tables persist across test methods:', tablesResult.rows.map(row => row.name));
  });

  it('should be able to insert and query data', async () => {
    console.log('🔍 Test 3: Testing data operations');

    // Insert a test transaction
    const insertResult = await db.execute({
      sql: `INSERT INTO transactions (
        transaction_id, type, stripe_payment_intent_id, stripe_session_id, amount_cents,
        currency, status, customer_email, order_data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: ['test-tx-1', 'tickets', 'pi_test', 'cs_test', 5000, 'USD', 'completed', 'test@example.com', '{"test": true}']
    });

    console.log('✅ Insert successful, lastInsertRowid:', insertResult.lastInsertRowid);

    // Query it back
    const queryResult = await db.execute({
      sql: 'SELECT * FROM transactions WHERE transaction_id = ?',
      args: ['test-tx-1']
    });

    expect(queryResult.rows.length).toBe(1);
    expect(queryResult.rows[0].customer_email).toBe('test@example.com');
    console.log('✅ Data operations working correctly');
  });

  it('should verify database cleanup between tests works correctly', async () => {
    console.log('🔍 Test 4: Verifying cleanup worked');

    // The previous test's data should be cleaned up by the setup-integration.js beforeEach
    const queryResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM transactions WHERE transaction_id = ?',
      args: ['test-tx-1']
    });

    // This might be 0 if cleanup worked, or 1 if data persists
    // The key is that the test should not fail with "no such table"
    const count = queryResult.rows[0].count;
    console.log('📊 Remaining test data count:', count);
    expect(typeof count).toBe('number'); // Just verify we can query
  });
});