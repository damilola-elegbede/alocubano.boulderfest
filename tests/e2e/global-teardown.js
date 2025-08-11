/**
 * Playwright Global Teardown
 * Runs once after all test files
 */

async function globalTeardown() {
  console.log("🧹 Starting E2E test global teardown...");

  try {
    // Clean up any test data created during tests
    console.log("💾 Cleaning up test data...");

    // Example cleanup operations:
    // - Remove test user accounts
    // - Clean up test database entries
    // - Reset application state
    // - Clear test caches

    // You can add specific cleanup logic here
    await cleanupTestData();

    // Generate test summary if needed
    await generateTestSummary();

    console.log("✅ E2E test global teardown completed successfully");
  } catch (error) {
    console.error("❌ Global teardown failed:", error.message);
    // Don't throw here - we don't want teardown failures to fail the entire test suite
    console.warn("⚠️ Continuing despite teardown failure...");
  }
}

/**
 * Clean up test data
 */
async function cleanupTestData() {
  // Example: Remove test files, database entries, etc.
  // This would depend on your specific application needs

  console.log("🗑️ Test data cleanup completed");
}

/**
 * Generate test summary
 */
async function generateTestSummary() {
  const timestamp = new Date().toISOString();
  const summary = {
    timestamp,
    testRun: "E2E Tests",
    environment: process.env.NODE_ENV || "test",
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    status: "completed",
  };

  console.log("📊 Test Summary:", JSON.stringify(summary, null, 2));
}

export default globalTeardown;
