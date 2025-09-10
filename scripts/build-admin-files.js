#!/usr/bin/env node

/**
 * Build Script: Copy Admin Files to Root Level
 * 
 * This script ensures that admin files from pages/admin/ are copied to admin/
 * at the root level, which is required for Vercel routing to work correctly.
 * 
 * The vercel.json config expects:
 * - /admin/login -> /admin/login.html
 * - /admin/dashboard -> /admin/dashboard.html
 * - etc.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

console.log("🔧 Building Admin Files for Vercel Deployment");
console.log("==============================================");

// Create admin directory in root if it doesn't exist
const rootAdminDir = path.join(projectRoot, "admin");
if (!fs.existsSync(rootAdminDir)) {
  fs.mkdirSync(rootAdminDir, { recursive: true });
  console.log("📁 Created admin/ directory in root");
} else {
  console.log("📁 admin/ directory already exists");
}

// Admin files that need to be copied from pages/admin/ to admin/
const adminFiles = [
  "login.html",
  "dashboard.html", 
  "checkin.html",
  "analytics.html",
  "mfa-settings.html",
  "index.html",
  "registrations.html",
  "tickets.html"
];

let copiedFiles = 0;
let errors = 0;

adminFiles.forEach(filename => {
  const sourcePath = path.join(projectRoot, "pages", "admin", filename);
  const destPath = path.join(rootAdminDir, filename);
  
  try {
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      const stats = fs.statSync(destPath);
      const size = Math.round((stats.size / 1024) * 100) / 100;
      console.log(`✅ Copied ${filename} (${size} KB)`);
      copiedFiles++;
    } else {
      console.log(`⚠️  Source file missing: pages/admin/${filename}`);
    }
  } catch (error) {
    console.log(`❌ Failed to copy ${filename}: ${error.message}`);
    errors++;
  }
});

console.log("");
console.log("📋 Summary:");
console.log(`✅ Successfully copied: ${copiedFiles} files`);
if (errors > 0) {
  console.log(`❌ Errors: ${errors} files`);
}

console.log("");
console.log("🚀 Admin files are now ready for Vercel deployment!");
console.log("   - /admin/login -> admin/login.html");
console.log("   - /admin/dashboard -> admin/dashboard.html"); 
console.log("   - /admin/* -> admin/*.html");

// Exit with error if any files failed to copy
process.exit(errors > 0 ? 1 : 0);