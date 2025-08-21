/**
 * Test Setup - Minimal Configuration
 * Basic environment setup for streamlined tests.
 * Target: < 20 lines
 */

// Set test environment variables
process.env.NODE_ENV = "test";

// Set test base URL if not provided
if (!process.env.TEST_BASE_URL) {
  process.env.TEST_BASE_URL = "http://localhost:3000";
}

console.log("🧪 Streamlined test setup complete - testing API contracts only");
