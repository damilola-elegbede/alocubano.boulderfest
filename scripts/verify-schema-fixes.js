import { getDatabase } from "../api/lib/database.js";

async function verifySchemaFixes() {
  console.log("🔍 Verifying database schema fixes...\n");

  const db = getDatabase();

  try {
    // Test 1: Check transactions table has uuid, metadata, total_amount columns
    console.log("1️⃣ Testing transactions table columns...");
    await db.execute(
      `
      INSERT INTO transactions (
        transaction_id, uuid, stripe_session_id, customer_email, 
        amount_cents, total_amount, status, order_data, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        "TEST-TXN-001",
        "TEST-TXN-001",
        "cs_test_12345",
        "verify@test.com",
        5000,
        5000,
        "completed",
        "{}",
        '{"test": "metadata"}',
      ],
    );
    console.log(
      "✅ transactions table: uuid, metadata, total_amount columns working",
    );

    // Test 2: Check tickets table has cancellation_reason column
    console.log("\n2️⃣ Testing tickets table cancellation_reason column...");
    const transResult = await db.execute(
      "SELECT id FROM transactions WHERE transaction_id = ?",
      ["TEST-TXN-001"],
    );
    const transId = transResult.rows[0].id;

    await db.execute(
      `
      INSERT INTO tickets (
        ticket_id, transaction_id, ticket_type, event_id,
        attendee_email, price_cents, status, cancellation_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        "TICKET-001",
        transId,
        "weekend-pass",
        "fest-2026",
        "verify@test.com",
        5000,
        "cancelled",
        "Customer request",
      ],
    );
    console.log("✅ tickets table: cancellation_reason column working");

    // Test 3: Check email_audit_log has ip_address, user_agent columns
    console.log(
      "\n3️⃣ Testing email_audit_log table ip_address and user_agent columns...",
    );
    await db.execute(
      `
      INSERT INTO email_audit_log (
        entity_type, entity_id, action, actor_type, actor_id,
        changes, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        "email_subscribers",
        1,
        "create",
        "system",
        "test",
        "{}",
        "192.168.1.1",
        "Mozilla/5.0 (Test Browser)",
      ],
    );
    console.log(
      "✅ email_audit_log table: ip_address, user_agent columns working",
    );

    // Test 4: Verify column queries work
    console.log("\n4️⃣ Testing column queries...");

    const metadataResult = await db.execute(
      "SELECT metadata FROM transactions WHERE id = ?",
      [transId],
    );
    console.log(
      "✅ metadata column query working:",
      JSON.parse(metadataResult.rows[0].metadata),
    );

    const cancelResult = await db.execute(
      "SELECT status, cancellation_reason FROM tickets WHERE ticket_id = ?",
      ["TICKET-001"],
    );
    console.log(
      "✅ cancellation_reason column query working:",
      cancelResult.rows[0].cancellation_reason,
    );

    // Clean up test data
    console.log("\n🧹 Cleaning up test data...");
    await db.execute("DELETE FROM email_audit_log WHERE actor_id = ?", [
      "test",
    ]);
    await db.execute("DELETE FROM tickets WHERE ticket_id = ?", ["TICKET-001"]);
    await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [
      "TEST-TXN-001",
    ]);

    console.log("\n🎉 All schema fixes verified successfully!");
    console.log("\n✅ Fixed Issues:");
    console.log("   • transactions.uuid column - ✅ Working");
    console.log("   • transactions.metadata column - ✅ Working");
    console.log("   • transactions.total_amount column - ✅ Working");
    console.log("   • tickets.cancellation_reason column - ✅ Working");
    console.log("   • email_audit_log.ip_address column - ✅ Working");
    console.log("   • email_audit_log.user_agent column - ✅ Working");
  } catch (error) {
    console.error("\n❌ Schema verification failed:", error.message);
    throw error;
  }
}

await verifySchemaFixes();
