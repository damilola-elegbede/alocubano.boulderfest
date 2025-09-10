import { getDatabase } from "../lib/database.js";

async function checkTicketsTable() {
  const db = getDatabase();

  console.log("=== Checking Tickets Table ===\n");

  // Get tickets table schema
  const result = await db.execute(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='tickets'
  `);

  if (result.rows.length > 0) {
    console.log("Tickets Table Schema:");
    console.log(result.rows[0].sql);
  } else {
    console.log("Tickets table does not exist!");
  }

  // Try to check if table exists and what columns it has
  try {
    const pragma = await db.execute("PRAGMA table_info(tickets)");
    console.log("\n=== Table Columns ===");
    pragma.rows.forEach((col) => {
      console.log(`  - ${col.name} (${col.type})`);
    });
  } catch (error) {
    console.log("Could not get table info:", error.message);
  }

  process.exit(0);
}

checkTicketsTable().catch((error) => {
  console.error("Check failed:", error);
  process.exit(1);
});
