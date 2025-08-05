#!/usr/bin/env node

/**
 * Run tests with memory monitoring and garbage collection enabled
 */

import { spawn } from "child_process";

const args = process.argv.slice(2);

// Add memory monitoring flags
const nodeOptions = [
  "--expose-gc", // Enable manual garbage collection
  "--max-old-space-size=2048", // Limit heap to 2GB
  "--max-semi-space-size=128", // Limit new generation size
].join(" ");

console.log("🧪 Running tests with memory monitoring...\n");
console.log(`Memory limits: 2GB heap, 128MB new generation\n`);

// Run vitest with memory options
const vitest = spawn("npx", ["vitest", ...args], {
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    FORCE_COLOR: "1",
  },
  stdio: "inherit",
});

vitest.on("exit", (code) => {
  if (code === 0) {
    console.log("\n✅ Tests completed successfully with memory monitoring");
  } else {
    console.log(`\n❌ Tests failed with exit code ${code}`);
  }
  process.exit(code);
});
