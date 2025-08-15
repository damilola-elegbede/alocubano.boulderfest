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

    // Firefox-specific optimization for timeout issues
    const isFirefox =
      process.env.PLAYWRIGHT_BROWSER === "firefox" ||
      context._browser._options?.name === "firefox";

    if (isFirefox) {
      console.log("🦊 Applying Firefox-specific optimizations...");
      // Firefox: Use domcontentloaded + manual resource check for better reliability
      await page.goto(`${baseURL}/pages/home.html`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      // Wait for JavaScript to complete loading
      await page.waitForFunction(() => document.readyState === "complete", {
        timeout: 10000,
      });
    } else {
      // Standard browsers: Use networkidle
      await page.goto(`${baseURL}/pages/home.html`, {
        waitUntil: "networkidle",
      });
    }

    // Verify core application functionality
    await page.waitForSelector("body", { timeout: 10000 });

    // Pre-warm the cache if needed
    console.log("🔥 Pre-warming application cache...");
    const cacheWaitUntil = isFirefox ? "domcontentloaded" : "networkidle";
    const cacheTimeout = isFirefox ? 15000 : 10000;

    await page.goto(`${baseURL}/pages/about.html`, {
      waitUntil: cacheWaitUntil,
      timeout: cacheTimeout,
    });
    await page.goto(`${baseURL}/pages/tickets.html`, {
      waitUntil: cacheWaitUntil,
      timeout: cacheTimeout,
    });

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
