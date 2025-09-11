#!/usr/bin/env node

/**
 * E2E Test Environment Setup
 * Prepares environment for Playwright tests
 */

import fs from "fs";
import path from "path";

async function setupE2EEnvironment() {
  console.log("🚀 Setting up E2E test environment...");

  try {
    // Create necessary directories
    const directories = [
      "test-results",
      "test-results/playwright",
      "playwright-report",
      "coverage",
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    }

    // Check if Playwright browsers are installed
    const playwrightConfig = await import("../tests/config/playwright/playwright.config.js");
    console.log("✅ Playwright configuration loaded");

    // Validate test directory structure
    const e2eTestDir = "./tests/e2e";
    if (!fs.existsSync(e2eTestDir)) {
      fs.mkdirSync(e2eTestDir, { recursive: true });
      console.log(`📁 Created E2E test directory: ${e2eTestDir}`);
    }

    // Create a basic health check test if none exists
    const healthCheckTest = path.join(e2eTestDir, "health-check.test.js");
    if (!fs.existsSync(healthCheckTest)) {
      await createBasicHealthCheckTest(healthCheckTest);
    }

    console.log("✅ E2E environment setup completed");
  } catch (error) {
    console.error("❌ E2E environment setup failed:", error.message);
    process.exit(1);
  }
}

async function createBasicHealthCheckTest(filePath) {
  const testContent = `import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('should load home page successfully', async ({ page }) => {
    await page.goto('/pages/home.html');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check that the page title is set
    await expect(page).toHaveTitle(/A Lo Cubano Boulder Fest/);
    
    // Check for main navigation
    await expect(page.locator('nav')).toBeVisible();
    
    // Verify page content is loaded
    await expect(page.locator('body')).toBeVisible();
    
    console.log('✅ Home page loaded successfully');
  });
  
  test('should navigate between pages', async ({ page }) => {
    // Start at home page
    await page.goto('/pages/home.html');
    await page.waitForLoadState('networkidle');
    
    // Navigate to about page
    await page.click('a[href*="about"]', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the about page
    await expect(page).toHaveURL(/about/);
    
    console.log('✅ Navigation between pages works');
  });
  
  test('should have proper meta tags for SEO', async ({ page }) => {
    await page.goto('/pages/home.html');
    
    // Check for essential meta tags
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
    
    console.log('✅ SEO meta tags are present');
  });
});
`;

  fs.writeFileSync(filePath, testContent);
  console.log(`📝 Created basic health check test: ${filePath}`);
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupE2EEnvironment();
}

export { setupE2EEnvironment };
