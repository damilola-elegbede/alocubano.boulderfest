import { getDatabase } from "../api/lib/database.js";

async function markMigrationComplete() {
  const db = getDatabase();

  try {
    // Mark migration 006 as complete (idempotent insert)
    await db.execute({
      sql: `INSERT OR IGNORE INTO migrations (filename, executed_at) VALUES (?, CURRENT_TIMESTAMP)`,
      args: ["006_token_system.sql"],
    });

    console.log("✅ Marked migration 006_token_system.sql as complete");

    // Check status
    const migrations = await db.execute(
      "SELECT * FROM migrations ORDER BY executed_at DESC LIMIT 3",
    );
    console.log("\nLatest migrations:");
    migrations.rows.forEach((m) => {
      console.log(`  - ${m.filename}`);
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Close database connection
    try {
      await db.close();
    } catch (closeError) {
      console.error("Error closing database:", closeError);
    }
  }
}

markMigrationComplete();
