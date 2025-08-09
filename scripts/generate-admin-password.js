#!/usr/bin/env node

import bcrypt from "bcryptjs";
import { createInterface } from "readline";
import crypto from "crypto";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to prompt for password with hidden input
function promptPassword(prompt) {
  return new Promise((resolve) => {
    // For better security, you might want to use a package like 'prompt' or 'inquirer'
    // that can hide password input. For now, we'll use basic readline
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log("\n=== Admin Password Generator ===\n");
  console.log(
    "This tool will generate a secure hash of your admin password.\n",
  );

  // Get password from user
  const password = await promptPassword("Enter your admin password: ");

  if (!password) {
    console.log("\n❌ Password cannot be empty\n");
    rl.close();
    process.exit(1);
  }

  if (password.length < 12) {
    console.log("\n❌ Password must be at least 12 characters for security\n");
    rl.close();
    process.exit(1);
  }

  // Check password complexity
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!(hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar)) {
    console.log("\n❌ Password must contain:");
    console.log("   - At least one uppercase letter");
    console.log("   - At least one lowercase letter");
    console.log("   - At least one number");
    console.log("   - At least one special character\n");
    rl.close();
    process.exit(1);
  }

  // Confirm password
  const confirmPassword = await promptPassword("Confirm your admin password: ");

  if (password !== confirmPassword) {
    console.log("\n❌ Passwords do not match\n");
    rl.close();
    process.exit(1);
  }

  // Generate hash
  console.log("\n🔐 Generating secure hash...\n");
  const hash = await bcrypt.hash(password, 10);

  // Generate session secret
  const sessionSecret = crypto.randomBytes(32).toString("base64");

  console.log("=== Configuration for .env.local ===\n");
  console.log("# Admin Dashboard Configuration");
  console.log(`ADMIN_PASSWORD=${hash}`);
  console.log(`ADMIN_SECRET=${sessionSecret}`);
  console.log("ADMIN_SESSION_DURATION=3600000  # 1 hour in milliseconds");
  console.log("ADMIN_MAX_LOGIN_ATTEMPTS=5\n");

  console.log("=== Next Steps ===\n");
  console.log("1. Copy the configuration above to your .env.local file");
  console.log("2. Restart your development server");
  console.log("3. Login at: http://localhost:8080/pages/admin/login.html");
  console.log("4. Use the password you just entered (not the hash!)\n");

  console.log("=== Session Duration Examples ===");
  console.log("30 minutes:  ADMIN_SESSION_DURATION=1800000");
  console.log("1 hour:      ADMIN_SESSION_DURATION=3600000  (default)");
  console.log("2 hours:     ADMIN_SESSION_DURATION=7200000");
  console.log("4 hours:     ADMIN_SESSION_DURATION=14400000");
  console.log("8 hours:     ADMIN_SESSION_DURATION=28800000");
  console.log("24 hours:    ADMIN_SESSION_DURATION=86400000\n");

  console.log("✅ Password hash generated successfully!\n");

  rl.close();
}

main().catch((error) => {
  console.error("Error:", error);
  rl.close();
  process.exit(1);
});
