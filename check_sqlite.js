import { getDatabaseClient } from './lib/database.js';

async function check() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'file:./test.db';

  const db = await getDatabaseClient();

  // Check SQLite version
  const version = await db.execute("SELECT sqlite_version() as version");
  console.log("SQLite version:", version.rows[0].version);

  // Check compile options
  const options = await db.execute("PRAGMA compile_options");
  console.log("Has CHECK_CONSTRAINTS:", options.rows.some(r => r.compile_option?.includes('CHECK')));

  // Create a table with CHECK constraint and verify
  await db.execute(`
    CREATE TABLE IF NOT EXISTS test_check (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('a', 'b', 'c'))
    )
  `);

  // Get the table SQL
  const sql = await db.execute("SELECT sql FROM sqlite_master WHERE name='test_check'");
  console.log("Created table SQL:", sql.rows[0].sql);

  // Try to insert invalid data
  try {
    await db.execute("INSERT INTO test_check (type) VALUES ('invalid')");
    console.log("ERROR: Insert succeeded when it should have failed!");
  } catch (e) {
    console.log("GOOD: Insert failed as expected:", e.message);
  }

  await db.execute("DROP TABLE test_check");
}

check();
