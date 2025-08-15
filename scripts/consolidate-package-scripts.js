#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";

async function consolidateScripts() {
  console.log("📦 Starting brutal script consolidation...\n");

  // Read current package.json
  const pkgPath = "package.json";
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));

  // Backup current scripts to tools.json
  const currentScripts = { ...pkg.scripts };
  await writeFile(
    "tools.json",
    JSON.stringify(
      {
        description: "Archived scripts from package.json consolidation",
        date: new Date().toISOString(),
        usage: "npx node scripts/run-tool.js <script-name>",
        scripts: currentScripts,
      },
      null,
      2,
    ),
  );
  console.log("📁 Current scripts backed up to tools.json");

  // Define the ONLY scripts we keep
  const essentialScripts = {
    // Core development (3)
    start: "./scripts/start-with-ngrok.sh",
    dev: "./scripts/start-with-ngrok.sh",
    build: "npm run verify-structure && echo 'Build process completed'",

    // Testing (5) - THIS IS THE LIMIT
    test: "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:meta": "vitest run tests/meta", // For config validation only

    // Quality (1)
    lint: "eslint . && htmlhint pages/",

    // Database (2)
    "migrate:up":
      "DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/migrate.js",
    "db:shell": "sqlite3 data/development.db",

    // Deployment (2)
    "deploy:check": "node scripts/deployment-check.js",
    deploy: "npm run deploy:check && vercel --target production",
  };

  // Calculate reduction
  const before = Object.keys(pkg.scripts).length;
  const after = Object.keys(essentialScripts).length;
  const reduction = Math.round(((before - after) / before) * 100);

  // Update package.json
  pkg.scripts = essentialScripts;

  // Write updated package.json
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  console.log(`\n✅ Script consolidation complete!`);
  console.log(`   Before: ${before} scripts`);
  console.log(`   After: ${after} scripts`);
  console.log(`   Reduction: ${reduction}%`);
  console.log(`\n📌 Other scripts archived in tools.json`);
  console.log(`   Run with: node scripts/run-tool.js <script-name>`);
}

// Add rollback capability
async function rollback() {
  if (!existsSync("tools.json")) {
    console.error("❌ No backup found in tools.json");
    process.exit(1);
  }

  const backup = JSON.parse(await readFile("tools.json", "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  pkg.scripts = backup.scripts;
  await writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");

  console.log("✅ Rolled back to original scripts");
}

// Main execution
const command = process.argv[2];
if (command === "rollback") {
  rollback();
} else {
  consolidateScripts();
}
