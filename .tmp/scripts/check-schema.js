import { getDatabaseClient } from "../lib/database.js";

async function checkSchema() {
  const db = await getDatabaseClient();

  console.log("=== Checking Table Schema ===\n");

  // Get transactions table info
  const result = await db.execute(`
    SELECT sql FROM sqlite_master
    WHERE type='table' AND name='transactions'
  `);

  if (result.rows.length > 0) {
    console.log("Transactions Table Schema:");
    console.log(result.rows[0].sql);
  }

  // Try to get all columns
  console.log("\n=== Checking Actual Data ===\n");
  const dataResult = await db.execute("SELECT * FROM transactions LIMIT 1");

  if (dataResult.rows.length > 0) {
    console.log("Transaction columns:");
    console.log(Object.keys(dataResult.rows[0]));
    console.log("\nSample transaction:");
    console.log(dataResult.rows[0]);
  } else {
    console.log("No transactions found in database");
  }

  process.exit(0);
}

checkSchema().catch((error) => {
  console.error("Schema check failed:", error);
  process.exit(1);
});
