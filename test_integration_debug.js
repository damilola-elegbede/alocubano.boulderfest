import { getDbClient } from './tests/setup-integration.js';

async function debugIntegrationTest() {
  console.log("Setting up integration test environment...");
  
  process.env.NODE_ENV = 'test';
  process.env.INTEGRATION_TEST_MODE = 'true';
  process.env.DATABASE_URL = 'file:./test_integration_debug.db';
  
  // Import the setup to initialize database
  await import('./tests/setup-integration.js');
  
  // Wait a bit for setup to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const db = getDbClient();
  
  if (!db) {
    console.log("ERROR: Database client not initialized!");
    process.exit(1);
  }
  
  console.log("Got database client from integration setup");
  
  // Check if foreign keys are enabled
  const fkStatus = await db.execute("PRAGMA foreign_keys");
  console.log("Foreign keys status:", fkStatus.rows);
  
  // Check the transactions table structure
  const tableInfo = await db.execute("PRAGMA table_info(transactions)");
  console.log("Table columns:", tableInfo.rows.map(r => r.name + " " + r.type).join(", "));
  
  // Get the SQL that created the table
  const tableSql = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'");
  console.log("Table SQL:", tableSql.rows[0]?.sql);
  
  process.exit(0);
}

debugIntegrationTest().catch(console.error);
