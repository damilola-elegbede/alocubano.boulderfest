/**
 * Test Database Configuration
 * Provides utilities for test database setup and cleanup
 */

import { createClient } from '../../lib/db/client.js';

let testDbClient = null;

/**
 * Get test database client
 */
export async function getTestDbClient() {
  if (!testDbClient) {
    testDbClient = await createClient({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 5, // Smaller pool for tests
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 2000,
    });
  }
  return testDbClient;
}

/**
 * Close test database connections
 */
export async function closeTestDb() {
  if (testDbClient) {
    await testDbClient.end();
    testDbClient = null;
  }
}

/**
 * Clean all test data
 */
export async function cleanTestData() {
  const client = await getTestDbClient();
  
  // Clean tables in dependency order
  await client.query('TRUNCATE TABLE order_items CASCADE');
  await client.query('TRUNCATE TABLE orders CASCADE');
  await client.query('TRUNCATE TABLE payments CASCADE');
  await client.query('TRUNCATE TABLE inventory CASCADE');
  
  // Reset sequences
  await client.query('ALTER SEQUENCE orders_id_seq RESTART WITH 1');
  await client.query('ALTER SEQUENCE payments_id_seq RESTART WITH 1');
  await client.query('ALTER SEQUENCE order_items_id_seq RESTART WITH 1');
}

/**
 * Insert test data
 */
export async function insertTestData() {
  const client = await getTestDbClient();
  
  // Insert test inventory
  await client.query(`
    INSERT INTO inventory (ticket_type, available_quantity, total_quantity, price, updated_at)
    VALUES 
      ('full-festival', 100, 100, 300.00, NOW()),
      ('workshop-only', 200, 200, 150.00, NOW()),
      ('social-only', 300, 300, 75.00, NOW()),
      ('donation', 9999, 9999, 0.00, NOW())
  `);
  
  console.log('✅ Test data inserted');
}

/**
 * Create test order
 */
export async function createTestOrder(orderData = {}) {
  const client = await getTestDbClient();
  
  const defaultOrder = {
    customer_email: 'test@example.com',
    customer_name: 'Test Customer',
    total_amount: 30000, // $300.00 in cents
    currency: 'usd',
    status: 'pending',
    stripe_session_id: `cs_test_${Date.now()}`,
    created_at: new Date(),
    updated_at: new Date(),
    ...orderData
  };
  
  const result = await client.query(`
    INSERT INTO orders (
      customer_email, customer_name, total_amount, currency, status,
      stripe_session_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    defaultOrder.customer_email,
    defaultOrder.customer_name,
    defaultOrder.total_amount,
    defaultOrder.currency,
    defaultOrder.status,
    defaultOrder.stripe_session_id,
    defaultOrder.created_at,
    defaultOrder.updated_at
  ]);
  
  return result.rows[0];
}

/**
 * Create test payment
 */
export async function createTestPayment(paymentData = {}) {
  const client = await getTestDbClient();
  
  const defaultPayment = {
    order_id: null,
    stripe_payment_intent_id: `pi_test_${Date.now()}`,
    amount: 30000,
    currency: 'usd',
    status: 'requires_payment_method',
    created_at: new Date(),
    updated_at: new Date(),
    ...paymentData
  };
  
  const result = await client.query(`
    INSERT INTO payments (
      order_id, stripe_payment_intent_id, amount, currency, status,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [
    defaultPayment.order_id,
    defaultPayment.stripe_payment_intent_id,
    defaultPayment.amount,
    defaultPayment.currency,
    defaultPayment.status,
    defaultPayment.created_at,
    defaultPayment.updated_at
  ]);
  
  return result.rows[0];
}

/**
 * Get test database statistics
 */
export async function getTestDbStats() {
  const client = await getTestDbClient();
  
  const stats = {};
  const tables = ['orders', 'payments', 'order_items', 'inventory'];
  
  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
    stats[table] = parseInt(result.rows[0].count);
  }
  
  return stats;
}