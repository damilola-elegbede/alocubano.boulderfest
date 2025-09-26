import { getDatabaseClient } from "../lib/database.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(dirname(__dirname), ".env.local") });

async function checkTables() {
  const db = await getDatabaseClient();

  try {
    // Get table info for payment_events
    const paymentEventsInfo = await db.execute(`
      PRAGMA table_info(payment_events)
    `);

    console.log("\n📊 payment_events table structure:");
    console.table(paymentEventsInfo.rows);

    // Get table info for transactions
    const transactionsInfo = await db.execute(`
      PRAGMA table_info(transactions)
    `);

    console.log("\n📊 transactions table structure:");
    console.table(transactionsInfo.rows);

    // Get table info for transaction_items
    const transactionItemsInfo = await db.execute(`
      PRAGMA table_info(transaction_items)
    `);

    console.log("\n📊 transaction_items table structure:");
    console.table(transactionItemsInfo.rows);

    // Check if any data exists
    const transactionCount = await db.execute(
      "SELECT COUNT(*) as count FROM transactions",
    );
    console.log(`\n📈 Total transactions: ${transactionCount.rows[0].count}`);

    const eventCount = await db.execute(
      "SELECT COUNT(*) as count FROM payment_events",
    );
    console.log(`📈 Total payment events: ${eventCount.rows[0].count}`);
  } catch (error) {
    console.error("Error checking tables:", error);
    process.exit(1);
  }

  process.exit(0);
}

checkTables().catch(console.error);
