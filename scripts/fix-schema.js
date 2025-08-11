import { getDatabase } from "../api/lib/database.js";

async function fixSchema() {
  const db = getDatabase();

  console.log("🔧 Applying schema fixes directly...");

  try {
    // Add missing columns to transactions
    try {
      await db.execute("ALTER TABLE transactions ADD COLUMN uuid TEXT");
      console.log("✅ Added uuid column to transactions");
    } catch (e) {
      if (!e.message.includes("duplicate column")) {
        console.log(
          "⚠️ uuid column might already exist:",
          e.message.substring(0, 50),
        );
      }
    }

    try {
      await db.execute("ALTER TABLE transactions ADD COLUMN metadata TEXT");
      console.log("✅ Added metadata column to transactions");
    } catch (e) {
      if (!e.message.includes("duplicate column")) {
        console.log(
          "⚠️ metadata column might already exist:",
          e.message.substring(0, 50),
        );
      }
    }

    try {
      await db.execute(
        "ALTER TABLE transactions ADD COLUMN total_amount INTEGER",
      );
      console.log("✅ Added total_amount column to transactions");
    } catch (e) {
      if (!e.message.includes("duplicate column")) {
        console.log(
          "⚠️ total_amount column might already exist:",
          e.message.substring(0, 50),
        );
      }
    }

    // Add missing column to tickets
    try {
      await db.execute(
        "ALTER TABLE tickets ADD COLUMN cancellation_reason TEXT",
      );
      console.log("✅ Added cancellation_reason column to tickets");
    } catch (e) {
      if (!e.message.includes("duplicate column")) {
        console.log(
          "⚠️ cancellation_reason column might already exist:",
          e.message.substring(0, 50),
        );
      }
    }

    // Fix email_audit_log table - ensure it has ip_address and user_agent columns
    try {
      await db.execute(
        "ALTER TABLE email_audit_log ADD COLUMN ip_address TEXT",
      );
      console.log("✅ Added ip_address column to email_audit_log");
    } catch (e) {
      if (!e.message.includes("duplicate column")) {
        console.log(
          "⚠️ ip_address column might already exist:",
          e.message.substring(0, 50),
        );
      }
    }

    try {
      await db.execute(
        "ALTER TABLE email_audit_log ADD COLUMN user_agent TEXT",
      );
      console.log("✅ Added user_agent column to email_audit_log");
    } catch (e) {
      if (!e.message.includes("duplicate column")) {
        console.log(
          "⚠️ user_agent column might already exist:",
          e.message.substring(0, 50),
        );
      }
    }

    // Add indexes
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_transactions_uuid ON transactions(uuid)",
    );
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_transactions_total_amount ON transactions(total_amount)",
    );
    console.log("✅ Created indexes");

    // Populate columns with existing data
    await db.execute(
      `UPDATE transactions SET uuid = transaction_id WHERE uuid IS NULL AND transaction_id IS NOT NULL`,
    );
    await db.execute(
      `UPDATE transactions SET metadata = session_metadata WHERE metadata IS NULL AND session_metadata IS NOT NULL`,
    );
    await db.execute(
      `UPDATE transactions SET total_amount = amount_cents WHERE total_amount IS NULL AND amount_cents IS NOT NULL`,
    );
    console.log("✅ Populated new columns with existing data");

    console.log("🎉 Schema fixes applied successfully");
  } catch (error) {
    console.error("❌ Failed to apply schema fixes:", error.message);
    throw error;
  }
}

await fixSchema();
