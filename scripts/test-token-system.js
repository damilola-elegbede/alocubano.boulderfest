import { getDatabase } from "../lib/database.js";
import tokenService from "../lib/token-service.js";
import ticketService from "../lib/ticket-service.js";

async function testTokenSystem() {
  const db = getDatabase();

  console.log("=== Testing Three-Tier Token System ===\n");

  try {
    // Test 1: Check tables exist
    console.log("1. Checking token system tables...");

    const tables = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('access_tokens', 'action_tokens')
      ORDER BY name
    `);

    console.log(
      `   Found tables: ${tables.rows.map((t) => t.name).join(", ")}`,
    );

    if (tables.rows.length < 2) {
      console.log("   ⚠ Missing token tables. Run migrations first.");
      return;
    }

    // Test 2: Secure ticket ID generation
    console.log("\n2. Testing secure ticket ID generation...");
    for (let i = 0; i < 3; i++) {
      const ticketId = ticketService.generateTicketId();
      console.log(`   Generated secure ID ${i + 1}: ${ticketId}`);
    }

    // Test 3: Token generation
    console.log("\n3. Testing token generation...");

    // Create a test transaction record
    const testTransaction = await db.execute({
      sql: `INSERT INTO transactions (
        uuid, order_type, order_details, customer_name, customer_email,
        total_amount, payment_method, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "test-" + Date.now(),
        "tickets",
        '{"line_items": [{"description": "Test Ticket", "amount_total": 5000, "quantity": 1}]}',
        "Token Test User",
        "token-test@example.com",
        5000, // $50.00
        "stripe_payment_intent",
        "paid",
        new Date().toISOString(),
      ],
    });

    const transactionId = testTransaction.lastInsertRowid;
    const email = "token-test@example.com";

    // Generate access token
    const accessToken = await tokenService.generateAccessToken(
      transactionId,
      email,
    );
    console.log(
      `   Generated access token: ${accessToken.substring(0, 20)}...`,
    );

    // Generate action token
    const actionToken = await tokenService.generateActionToken(
      "transfer",
      "TKT-TEST-123",
      email,
    );
    console.log(
      `   Generated action token: ${actionToken.substring(0, 20)}...`,
    );

    // Test 4: Token validation
    console.log("\n4. Testing token validation...");

    const accessValidation =
      await tokenService.validateAccessToken(accessToken);
    console.log(`   Access token valid: ${accessValidation.valid}`);
    console.log(`   Access token email: ${accessValidation.email}`);

    const actionValidation = await tokenService.validateActionToken(
      actionToken,
      "transfer",
      "TKT-TEST-123",
    );
    console.log(`   Action token valid: ${actionValidation.valid}`);
    console.log(`   Action token email: ${actionValidation.email}`);

    // Test 5: QR code generation and validation
    console.log("\n5. Testing QR code system...");

    const qrTokenData = tokenService.generateValidationToken(
      "TKT-TEST-QR-123",
      "boulder-fest-2026",
      email,
    );
    console.log(
      `   Generated QR data: ${qrTokenData.qr_data.substring(0, 30)}...`,
    );

    const qrValidation = tokenService.validateQRCode(qrTokenData.qr_data);
    console.log(`   QR code valid: ${qrValidation.valid}`);
    console.log(`   QR ticket ID: ${qrValidation.ticketId}`);

    // Test 6: Rate limiting
    console.log("\n6. Testing rate limiting...");

    const rateLimitCheck = await tokenService.checkRateLimit(
      email,
      "access",
      60,
      10,
    );
    console.log(`   Rate limit allowed: ${rateLimitCheck.allowed}`);
    console.log(`   Requests remaining: ${rateLimitCheck.remaining}`);

    // Test 7: Token cleanup
    console.log("\n7. Testing token cleanup...");

    const cleanupResult = await tokenService.cleanupExpiredTokens();
    console.log(
      `   Cleaned up ${cleanupResult.accessTokensDeleted} access tokens`,
    );
    console.log(
      `   Cleaned up ${cleanupResult.actionTokensDeleted} action tokens`,
    );

    // Test 8: Token statistics
    console.log("\n8. Getting token statistics...");

    const stats = await tokenService.getTokenStats();
    console.log(
      `   Access tokens: ${stats.accessTokens.total} total, ${stats.accessTokens.valid} valid`,
    );
    console.log(
      `   Action tokens: ${stats.actionTokens.total} total, ${stats.actionTokens.valid} valid`,
    );

    // Show why action token is invalid - it was consumed during validation
    console.log(
      "   Note: Action token shows as invalid because it was consumed during validation (single-use)",
    );

    console.log("\n=== All Token System Tests Completed Successfully! ===");

    // Cleanup test data
    await db.execute({
      sql: "DELETE FROM transactions WHERE id = ?",
      args: [transactionId],
    });
  } catch (error) {
    console.error("Token system test failed:", error);
    console.error("Stack:", error.stack);
  }
}

testTokenSystem().catch((error) => {
  console.error("Test script failed:", error);
  process.exit(1);
});
