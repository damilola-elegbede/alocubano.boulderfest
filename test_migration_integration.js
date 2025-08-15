import { createClient } from "@libsql/client";
import { runMigrationsForTest } from "/Users/damilola/Documents/Projects/alocubano.boulderfest/tests/utils/test-migration-runner.js";

async function testMigrationIntegration() {
  const client = createClient({ url: ":memory:" });

  console.log("🧪 Testing migration runner integration...\n");

  try {
    // Run all migrations
    const summary = await runMigrationsForTest(client, { logLevel: "info" });

    console.log("\n✅ Migration Summary:");
    console.log(
      `   Applied: ${summary.appliedMigrations}/${summary.totalMigrations} migrations`,
    );
    console.log(`   Skipped: ${summary.skippedMigrations} migrations`);
    console.log(`   Failed: ${summary.failedMigrations} migrations`);
    console.log(`   Total time: ${summary.totalExecutionTime}ms`);

    // Verify key tables exist
    const tablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );

    console.log("\n📋 Created Tables:");
    tablesResult.rows.forEach((row) => {
      console.log(`   • ${row.name}`);
    });

    // Test basic functionality
    await client.execute({
      sql: "INSERT INTO transactions (transaction_id, type, status, amount_cents, customer_email, order_data) VALUES (?, ?, ?, ?, ?, ?)",
      args: [
        "test-123",
        "tickets",
        "completed",
        5000,
        "test@example.com",
        "{}",
      ],
    });

    const result = await client.execute(
      "SELECT COUNT(*) as count FROM transactions",
    );
    console.log(
      `\n🎯 Test insert successful: ${result.rows[0].count} transaction(s)`,
    );

    console.log("\n🎉 Migration runner integration test PASSED!");
  } catch (error) {
    console.error(
      "❌ Migration runner integration test FAILED:",
      error.message,
    );
    process.exit(1);
  } finally {
    await client.close();
  }
}

testMigrationIntegration();
