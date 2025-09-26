import { getDatabaseClient } from "../lib/database.js";

async function checkDatabase() {
  const db = await getDatabaseClient();

  console.log("=== Database Status Check ===\n");

  // Check transactions
  const transactionResult = await db.execute(
    "SELECT COUNT(*) as count FROM transactions",
  );
  console.log(`Transactions: ${transactionResult.rows[0].count}`);

  // Check tickets
  const ticketResult = await db.execute(
    "SELECT COUNT(*) as count FROM tickets",
  );
  console.log(`Tickets: ${ticketResult.rows[0].count}`);

  // Check payment events
  const eventResult = await db.execute(
    "SELECT COUNT(*) as count FROM payment_events",
  );
  console.log(`Payment Events: ${eventResult.rows[0].count}`);

  // Get latest transactions
  const latestTransactions = await db.execute(`
    SELECT uuid as transaction_id, customer_email, total_amount as amount_cents, status, created_at
    FROM transactions
    ORDER BY created_at DESC
    LIMIT 5
  `);

  if (latestTransactions.rows.length > 0) {
    console.log("\nLatest Transactions:");
    latestTransactions.rows.forEach((t) => {
      console.log(
        `  - ${t.transaction_id}: ${t.customer_email} - $${(t.amount_cents / 100).toFixed(2)} (${t.status})`,
      );
    });
  }

  // Get latest tickets
  const latestTickets = await db.execute(`
    SELECT ticket_id, ticket_type, attendee_email, status, created_at
    FROM tickets
    ORDER BY created_at DESC
    LIMIT 5
  `);

  if (latestTickets.rows.length > 0) {
    console.log("\nLatest Tickets:");
    latestTickets.rows.forEach((t) => {
      console.log(
        `  - ${t.ticket_id}: ${t.ticket_type} - ${t.attendee_email} (${t.status})`,
      );
    });
  }

  process.exit(0);
}

checkDatabase().catch((error) => {
  console.error("Database check failed:", error);
  process.exit(1);
});
