import { getDatabaseClient } from "../lib/database.js";

async function recreateTicketsTable() {
  const db = await getDatabaseClient();

  console.log("=== Recreating Tickets Table ===\n");

  // Confirm destructive operation
  console.log(
    "⚠️  WARNING: This will permanently delete the existing tickets table and all data!",
  );
  console.log("Press Ctrl+C to cancel, or any other key to continue...");

  // Wait for user input (in a real environment, you might use readline)
  await new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", () => {
      process.stdin.pause();
      resolve();
    });
  });

  // Drop the existing tickets table
  console.log("Dropping existing tickets table...");
  await db.execute("DROP TABLE IF EXISTS tickets");

  // Create the new tickets table with the correct schema
  console.log("Creating new tickets table...");
  await db.execute(`
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
      ticket_type TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_date DATE,
      price_cents INTEGER NOT NULL,
      attendee_first_name TEXT,
      attendee_last_name TEXT,
      attendee_email TEXT,
      attendee_phone TEXT,
      status TEXT DEFAULT 'valid' CHECK (
        status IN ('valid', 'used', 'cancelled', 'refunded', 'transferred')
      ),
      validation_code TEXT UNIQUE,
      checked_in_at TIMESTAMP,
      checked_in_by TEXT,
      check_in_location TEXT,
      ticket_metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Creating trigger for updated_at...");
  await db.execute(`
    CREATE TRIGGER update_tickets_updated_at
      AFTER UPDATE ON tickets
    BEGIN
      UPDATE tickets
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END
  `);

  // Create indexes
  console.log("Creating indexes...");
  await db.execute(
    "CREATE INDEX idx_tickets_transaction_id ON tickets(transaction_id)",
  );
  await db.execute("CREATE INDEX idx_tickets_event_id ON tickets(event_id)");
  await db.execute("CREATE INDEX idx_tickets_status ON tickets(status)");
  await db.execute(
    "CREATE INDEX idx_tickets_attendee_email ON tickets(attendee_email)",
  );

  // Verify the new schema
  const pragma = await db.execute("PRAGMA table_info(tickets)");
  console.log("\n=== New Table Columns ===");
  pragma.rows.forEach((col) => {
    console.log(`  - ${col.name} (${col.type})`);
  });

  console.log("\n✅ Tickets table recreated successfully!");

  process.exit(0);
}

recreateTicketsTable().catch((error) => {
  console.error("Recreation failed:", error);
  process.exit(1);
});
