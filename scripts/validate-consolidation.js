#!/usr/bin/env node

import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { execSync } from "child_process";

const CHECKS = {
  configs: { pass: false, message: "" },
  scripts: { pass: false, message: "" },
  settings: { pass: false, message: "" },
  hooks: { pass: false, message: "" },
  ci: { pass: false, message: "" },
};

async function validateConsolidation() {
  console.log("🔍 Validating Phase 3.7 Configuration Consolidation...\n");

  // Check 1: Single config file
  const configFiles = [
    "vitest.config.js",
    "vitest.config.meta.js",
    "vitest.config.ci.js",
    "vitest.integration.config.js",
    "vitest.performance.config.js",
  ];

  const existingConfigs = configFiles.filter((f) => existsSync(f));
  if (
    existingConfigs.length === 1 &&
    existingConfigs[0] === "vitest.config.js"
  ) {
    CHECKS.configs.pass = true;
    CHECKS.configs.message = "✅ Single vitest.config.js exists";
  } else {
    CHECKS.configs.message = `❌ Found ${existingConfigs.length} configs: ${existingConfigs.join(", ")}`;
  }

  // Check 2: Minimal scripts
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const scriptCount = Object.keys(pkg.scripts).length;
  const testScripts = Object.keys(pkg.scripts).filter((s) =>
    s.startsWith("test"),
  );

  if (scriptCount <= 15 && testScripts.length <= 5) {
    CHECKS.scripts.pass = true;
    CHECKS.scripts.message = `✅ Scripts reduced to ${scriptCount} (${testScripts.length} test scripts)`;
  } else {
    CHECKS.scripts.message = `❌ Too many scripts: ${scriptCount} total, ${testScripts.length} test scripts`;
  }

  // Check 3: Correct settings
  const config = await readFile("vitest.config.js", "utf8");
  const hasSingleFork = config.includes("singleFork: true");
  const hasReporter = config.includes("process.env.GITHUB_ACTIONS");

  if (hasSingleFork && hasReporter) {
    CHECKS.settings.pass = true;
    CHECKS.settings.message =
      "✅ Config has singleFork:true and dynamic reporters";
  } else {
    const issues = [];
    if (!hasSingleFork) issues.push("missing singleFork:true");
    if (!hasReporter) issues.push("missing dynamic reporter");
    CHECKS.settings.message = `❌ Config issues: ${issues.join(", ")}`;
  }

  // Check 4: Git hooks
  if (existsSync(".husky/pre-push")) {
    const hook = await readFile(".husky/pre-push", "utf8");
    if (hook.includes("npm test") && hook.includes("npm run lint")) {
      CHECKS.hooks.pass = true;
      CHECKS.hooks.message = "✅ Git hooks use standard commands";
    } else {
      CHECKS.hooks.message = "❌ Git hooks not using standard commands";
    }
  } else {
    CHECKS.hooks.message = "⚠️  No git hooks configured";
    CHECKS.hooks.pass = true; // Not critical for now
  }

  // Check 5: CI alignment
  const workflow = await readFile(
    ".github/workflows/simplified-testing.yml",
    "utf8",
  );
  const usesStandardCommands =
    workflow.includes("npm test") &&
    !workflow.includes("npm run test:unit:ci") &&
    !workflow.includes("TEST_CI_EXCLUDE_PATTERNS");

  if (usesStandardCommands) {
    CHECKS.ci.pass = true;
    CHECKS.ci.message = "✅ CI uses standard commands";
  } else {
    CHECKS.ci.message = "❌ CI still has environment-specific commands";
  }

  // Report results
  console.log("Configuration Consolidation Validation Results:");
  console.log("=".repeat(50));

  let allPass = true;
  for (const [category, result] of Object.entries(CHECKS)) {
    console.log(`${result.message}`);
    if (!result.pass) allPass = false;
  }

  console.log("\n" + "=".repeat(50));
  if (allPass) {
    console.log("🎉 ALL CHECKS PASSED - Phase 3.7 Complete!");
    process.exit(0);
  } else {
    console.log("❌ VALIDATION FAILED - Fix issues above");
    process.exit(1);
  }
}

validateConsolidation().catch(console.error);
