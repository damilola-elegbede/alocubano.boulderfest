#!/usr/bin/env node

import { readFile } from "fs/promises";
import { spawn } from "child_process";
import { existsSync } from "fs";

async function runTool(scriptName) {
  try {
    // Input validation
    if (!scriptName || typeof scriptName !== "string") {
      throw new Error("Invalid script name provided");
    }

    // Sanitize script name to prevent injection
    const sanitizedName = scriptName.replace(/[^a-zA-Z0-9:_-]/g, "");
    if (sanitizedName !== scriptName) {
      console.error(`❌ Invalid characters in script name: ${scriptName}`);
      console.error("Only alphanumeric characters, colons, underscores, and hyphens are allowed");
      process.exit(1);
    }

    if (!existsSync("tools.json")) {
      console.error("❌ tools.json not found. Run consolidation first.");
      process.exit(1);
    }

    const tools = JSON.parse(await readFile("tools.json", "utf8"));
    const script = tools.scripts[sanitizedName];

    if (!script) {
      console.error(`❌ Script '${sanitizedName}' not found in tools.json`);
      console.log("\nAvailable scripts:");
      Object.keys(tools.scripts)
        .sort()
        .forEach((s) => console.log(`  - ${s}`));
      process.exit(1);
    }

    console.log(`🔧 Running archived script: ${sanitizedName}`);
    console.log(`   Command: ${script}\n`);

    // Execute the script with proper environment isolation
    const child = spawn(script, [], {
      shell: true,
      stdio: "inherit",
      env: { ...process.env }, // Isolate environment
    });

    child.on("exit", (code) => {
      process.exit(code);
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

const scriptName = process.argv[2];
if (!scriptName) {
  console.error("Usage: node scripts/run-tool.js <script-name>");
  console.error("Examples:");
  console.error("  node scripts/run-tool.js performance");
  console.error("  node scripts/run-tool.js health:check");
  process.exit(1);
}

runTool(scriptName);
