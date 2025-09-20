#!/usr/bin/env node

/**
 * Test Admin Route Accessibility
 *
 * This script tests if the admin login route is accessible
 * and serving the correct content, mimicking what the E2E test does
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

console.log("🔍 Testing Admin Route Setup");
console.log("============================");

// Check if admin/login.html exists at the root
const adminLoginPath = path.join(projectRoot, "admin", "login.html");
const exists = fs.existsSync(adminLoginPath);

console.log(`📁 Checking for admin/login.html: ${exists ? "✅ EXISTS" : "❌ MISSING"}`);

if (exists) {
  try {
    const content = fs.readFileSync(adminLoginPath, "utf8");

    // Check for expected content that the E2E test looks for
    const hasAdminAccess = content.includes("Admin Access");
    const hasUsernameInput = content.includes('name="username"');
    const hasPasswordInput = content.includes('name="password"');
    const hasSubmitButton = content.includes('type="submit"');

    console.log("📋 Content Validation:");
    console.log(`   - Contains "Admin Access": ${hasAdminAccess ? "✅" : "❌"}`);
    console.log(`   - Has username input: ${hasUsernameInput ? "✅" : "❌"}`);
    console.log(`   - Has password input: ${hasPasswordInput ? "✅" : "❌"}`);
    console.log(`   - Has submit button: ${hasSubmitButton ? "✅" : "❌"}`);

    const allValidationsPass = hasAdminAccess && hasUsernameInput && hasPasswordInput && hasSubmitButton;

    console.log("");
    if (allValidationsPass) {
      console.log("✅ Admin login page is properly configured!");
      console.log("🔗 Route /admin/login should now work in E2E tests");
    } else {
      console.log("❌ Admin login page has validation issues");
      console.log("🔧 This may cause E2E test failures");
    }

  } catch (error) {
    console.log(`❌ Error reading admin/login.html: ${error.message}`);
  }
} else {
  console.log("❌ admin/login.html is missing!");
  console.log("🔧 Run 'npm run build:admin' to copy admin files");
}

console.log("");
console.log("📋 Vercel.json Route Configuration:");
console.log("   /admin/login -> /admin/login.html");
console.log("   Expected file location: admin/login.html (at project root)");

// Check vercel.json configuration
const vercelJsonPath = path.join(projectRoot, "vercel.json");
if (fs.existsSync(vercelJsonPath)) {
  try {
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
    const adminLoginRewrite = vercelConfig.rewrites?.find(r =>
      r.source === "/admin/login" && r.destination === "/admin/login.html"
    );

    console.log(`📄 Vercel config has admin/login route: ${adminLoginRewrite ? "✅" : "❌"}`);

  } catch (error) {
    console.log(`❌ Error parsing vercel.json: ${error.message}`);
  }
}