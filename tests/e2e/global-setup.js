/**
 * Playwright Global Setup
 * Runs once before all test files
 */

import { chromium } from "@playwright/test";

async function globalSetup() {
  console.log("🚀 Starting E2E test global setup...");

  // Create a browser instance for setup operations
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for the application to be ready
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
    console.log(`🔗 Testing connection to: ${baseURL}`);

    // Test that the server is responding
    await page.goto(`${baseURL}/pages/home.html`, { waitUntil: "networkidle" });

    // Verify core application functionality
    await page.waitForSelector("body", { timeout: 10000 });

    // Pre-warm the cache if needed
    console.log("🔥 Pre-warming application cache...");
    await page.goto(`${baseURL}/pages/about.html`);
    await page.goto(`${baseURL}/pages/tickets.html`);

    // Set up any required test data or state
    console.log("💾 Setting up test environment...");

    // You can add authentication setup here if needed
    // await setupTestAuthentication(page);

    console.log("✅ E2E test global setup completed successfully");
  } catch (error) {
    console.error("❌ Global setup failed:", error.message);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Setup test authentication (if needed)
 */
async function setupTestAuthentication(page) {
  // Example: Login as test admin user
  // await page.goto('/admin/login');
  // await page.fill('[data-testid="username"]', process.env.TEST_ADMIN_USERNAME);
  // await page.fill('[data-testid="password"]', process.env.TEST_ADMIN_PASSWORD);
  // await page.click('[data-testid="login-button"]');
  // await page.waitForURL('**/admin/dashboard');
}

export default globalSetup;
