import { getDatabase } from "../lib/database.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(dirname(__dirname), ".env.local") });

async function checkWebhooks() {
  const db = getDatabase();

  try {
    // Get recent events
    const events = await db.execute(`
      SELECT 
        event_type,
        source,
        COUNT(*) as count,
        MAX(created_at) as last_event
      FROM payment_events
      GROUP BY event_type, source
      ORDER BY last_event DESC
    `);

    console.log("\n📊 Payment Events Summary:");
    console.table(events.rows);

    // Get recent transactions
    const transactions = await db.execute(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total_amount) / 100.0 as total_amount,
        MAX(created_at) as last_transaction
      FROM transactions
      GROUP BY status
    `);

    console.log("\n💳 Transactions Summary:");
    console.table(transactions.rows);

    // Get transaction type breakdown
    const transactionTypes = await db.execute(`
      SELECT 
        order_type,
        COUNT(*) as count,
        SUM(total_amount) / 100.0 as total_amount
      FROM transactions
      GROUP BY order_type
    `);

    console.log("\n🏷️ Transaction Types:");
    console.table(transactionTypes.rows);

    // Get any failed events
    const failed = await db.execute(`
      SELECT source_id, event_type, error_message, created_at
      FROM payment_events
      WHERE error_message IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (failed.rows.length > 0) {
      console.log("\n⚠️  Failed Events:");
      console.table(failed.rows);
    } else {
      console.log("\n✅ No failed events found");
    }

    // Get recent successful transactions
    const recentTransactions = await db.execute(`
      SELECT 
        uuid,
        customer_email,
        total_amount / 100.0 as amount,
        status,
        created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (recentTransactions.rows.length > 0) {
      console.log("\n🕐 Recent Transactions:");
      console.table(recentTransactions.rows);
    }

    // Check for duplicate transactions
    const duplicates = await db.execute(`
      SELECT 
        stripe_checkout_session_id,
        COUNT(*) as count
      FROM transactions
      WHERE stripe_checkout_session_id IS NOT NULL
      GROUP BY stripe_checkout_session_id
      HAVING count > 1
    `);

    if (duplicates.rows.length > 0) {
      console.log("\n⚠️  Duplicate Transactions Found:");
      console.table(duplicates.rows);
    } else {
      console.log("\n✅ No duplicate transactions");
    }

    // Get unprocessed events count
    const unprocessed = await db.execute(`
      SELECT COUNT(*) as count
      FROM payment_events
      WHERE processed_at IS NULL
        AND retry_count < 5
    `);

    if (unprocessed.rows[0].count > 0) {
      console.log(`\n⏳ Unprocessed events: ${unprocessed.rows[0].count}`);
    }
  } catch (error) {
    console.error("Error checking webhooks:", error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the check
checkWebhooks().catch(console.error);
