import "dotenv/config";
import googleSheetsService from "../lib/google-sheets-service.js";
import { getDatabaseClient } from "../lib/database.js";

async function testSheets() {
  console.log("Testing Google Sheets Integration...\n");

  // Check required environment variables
  const requiredVars = [
    "GOOGLE_SHEET_ID",
    "GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_SHEETS_PRIVATE_KEY",
  ];

  const missingVars = requiredVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    console.error("❌ Missing required environment variables:");
    missingVars.forEach((v) => console.error(`   - ${v}`));
    console.log("\nPlease add these to your .env.vercel file");
    process.exit(1);
  }

  try {
    // Initialize service
    console.log("1. Initializing Google Sheets service...");
    await googleSheetsService.initialize();
    console.log("   ✓ Service initialized\n");

    // Setup sheets
    console.log("2. Setting up sheet structure...");
    await googleSheetsService.setupSheets();
    console.log("   ✓ Sheets configured\n");

    // Test data sync
    console.log("3. Syncing data to sheets...");
    const result = await googleSheetsService.syncAllData();
    console.log(`   ✓ Data synced at ${result.timestamp}\n`);

    // Get stats
    const db = await getDatabaseClient();
    const stats = await db.execute("SELECT COUNT(*) as count FROM tickets");
    const checkedIn = await db.execute(
      "SELECT COUNT(*) as count FROM tickets WHERE checked_in_at IS NOT NULL",
    );
    const revenue = await db.execute(
      'SELECT SUM(total_amount) / 100.0 as total FROM transactions WHERE status = "completed"',
    );

    console.log(`4. Summary:`);
    console.log(`   - Tickets in database: ${stats.rows[0].count}`);
    console.log(`   - Tickets checked in: ${checkedIn.rows[0].count}`);
    console.log(
      `   - Total revenue: $${(revenue.rows[0].total || 0).toFixed(2)}`,
    );
    console.log(`   - Sheet ID: ${process.env.GOOGLE_SHEET_ID}`);
    console.log(
      `   - View at: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}\n`,
    );

    console.log("✅ Google Sheets integration working!");
    console.log("\nNext steps:");
    console.log("1. Share the Google Sheet with your colleagues");
    console.log("2. Deploy to production with environment variables");
    console.log("3. The sheet will sync automatically every 15 minutes");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("\nDebug info:", error);

    if (error.message.includes("Permission")) {
      console.log("\nMake sure you:");
      console.log("1. Created a service account in Google Cloud Console");
      console.log("2. Enabled Google Sheets API");
      console.log("3. Shared the sheet with the service account email");
      console.log("4. Gave the service account Editor permissions");
    }
  }

  process.exit(0);
}

testSheets().catch(console.error);
