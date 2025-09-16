import { getDatabaseClient } from './lib/database.js';
import { promises as fs } from "fs";

async function test() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'file:./test_migration_direct.db';
  
  const db = await getDatabaseClient();
  
  // Read the migration
  const content = await fs.readFile('./migrations/001_core_tables.sql', 'utf8');
  
  // Find just the transactions CREATE TABLE statement
  const start = content.indexOf('CREATE TABLE IF NOT EXISTS transactions');
  const end = content.indexOf(');', start) + 2;
  const createTxnSQL = content.substring(start, end);
  
  console.log("Executing SQL:");
  console.log(createTxnSQL.substring(0, 500));
  
  // Execute it
  try {
    await db.execute(createTxnSQL);
    console.log("\nTable created successfully");
    
    // Check the result
    const sql = await db.execute("SELECT sql FROM sqlite_master WHERE name='transactions'");
    console.log("\nActual table SQL:");
    console.log(sql.rows[0].sql.substring(0, 500));
    
    // Try to insert invalid data
    try {
      await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, status, amount_cents, total_amount,
          currency, customer_email, order_data, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'TXN-TEST-' + Date.now(),
          'uuid-test-' + Date.now(),
          'invalid_type', // Invalid type
          'pending',
          1000,
          1000,
          'USD',
          'test@example.com',
          '{}',
          'test'
        ]
      });
      console.log("\nERROR: Insert succeeded when it should have failed!");
    } catch (e) {
      console.log("\nGOOD: Insert failed as expected:", e.message);
    }
    
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
