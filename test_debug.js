import { getDatabaseClient } from './lib/database.js';

async function debugTest() {
  process.env.NODE_ENV = 'test';
  process.env.INTEGRATION_TEST_MODE = 'true';
  process.env.DATABASE_URL = 'file:./test_debug.db';
  
  try {
    console.log("Getting database client...");
    const db = await getDatabaseClient();
    
    // Check if foreign keys are enabled
    const fkStatus = await db.execute("PRAGMA foreign_keys");
    console.log("Foreign keys status after client init:", fkStatus.rows);
    
    // Create the transactions table with CHECK constraint
    await db.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE NOT NULL,
        uuid TEXT,
        type TEXT NOT NULL CHECK (type IN ('tickets', 'donation', 'merchandise')),
        status TEXT DEFAULT 'pending',
        amount_cents INTEGER NOT NULL,
        total_amount INTEGER,
        currency TEXT DEFAULT 'USD',
        customer_email TEXT NOT NULL,
        order_data TEXT NOT NULL,
        source TEXT
      )
    `);
    console.log("Table created");
    
    // Try to insert invalid data
    const invalidTypeInsert = async () => {
      await db.execute({
        sql: `INSERT INTO transactions (
          transaction_id, uuid, type, status, amount_cents, total_amount, 
          currency, customer_email, order_data, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'TXN-INVALID-' + Date.now(),
          'uuid-invalid-' + Date.now(),
          'invalid_type', // This should fail the CHECK constraint
          'pending',
          1000,
          1000,
          'USD',
          'invalid@example.com',
          '{}',
          'test'
        ]
      });
    };
    
    try {
      await invalidTypeInsert();
      console.log("ERROR: Insert succeeded when it should have failed!");
      process.exit(1);
    } catch (error) {
      console.log("SUCCESS: Insert correctly failed!");
      console.log("Error:", error.message);
    }
    
    // Clean up
    await db.execute("DROP TABLE transactions");
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugTest();
