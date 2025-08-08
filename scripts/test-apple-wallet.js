#!/usr/bin/env node

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config({ path: path.join(__dirname, "..", ".env.local") });

console.log("🎫 Testing Apple Wallet Pass Configuration\n");
console.log("========================================\n");

// Check required environment variables
const requiredVars = {
  APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  APPLE_PASS_TYPE_ID: process.env.APPLE_PASS_TYPE_ID,
  APPLE_PASS_CERT: process.env.APPLE_PASS_CERT?.substring(0, 50) + "...",
  APPLE_WWDR_CERT: process.env.APPLE_WWDR_CERT?.substring(0, 50) + "...",
  APPLE_PASS_ORGANIZATION: process.env.APPLE_PASS_ORGANIZATION,
  WALLET_BASE_URL: process.env.WALLET_BASE_URL,
};

let allConfigured = true;

console.log("📋 Environment Variables Check:\n");
for (const [key, value] of Object.entries(requiredVars)) {
  if (!value || value === "...") {
    console.log(`❌ ${key}: NOT SET`);
    allConfigured = false;
  } else {
    console.log(`✅ ${key}: ${value}`);
  }
}

console.log("\n========================================\n");

if (allConfigured) {
  console.log("✅ All Apple Wallet Pass variables are configured!");
  console.log("\n📱 Your passes will:");
  console.log(`   - Be signed by Team: ${process.env.APPLE_TEAM_ID}`);
  console.log(`   - Use Pass Type ID: ${process.env.APPLE_PASS_TYPE_ID}`);
  console.log(`   - Show organization: ${process.env.APPLE_PASS_ORGANIZATION}`);
  console.log(`   - Link to: ${process.env.WALLET_BASE_URL}`);
  console.log("\n🚀 Ready to generate Apple Wallet passes!");
} else {
  console.log(
    "⚠️  Some variables are missing. Please check your .env.local file.",
  );
  process.exit(1);
}

console.log("\n📋 For Vercel Production, add these same variables:");
console.log("   - APPLE_PASS_TYPE_ID");
console.log("   - APPLE_PASS_CERT (the full base64 string)");
console.log("   - APPLE_PASS_PASSWORD (empty string if no password)");
console.log("   - APPLE_WWDR_CERT (the full base64 string)");
console.log("   - APPLE_PASS_ORGANIZATION");
console.log("   - WALLET_BASE_URL");
