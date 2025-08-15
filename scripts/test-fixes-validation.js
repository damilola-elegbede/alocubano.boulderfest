#!/usr/bin/env node

/**
 * Test Fixes Validation Script
 * Validates that all test failures have been resolved
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

const COLORS = {
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  RESET: "\x1b[0m",
};

/**
 * Run a command and capture output
 */
async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: true,
      stdio: "pipe",
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({
        code,
        stdout,
        stderr,
      });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Extract test results from output
 */
function parseTestResults(output) {
  const lines = output.split("\n");
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    failures: [],
  };

  for (const line of lines) {
    // Look for test summary
    if (line.includes("Tests")) {
      const passMatch = line.match(/(\d+) passed/);
      const failMatch = line.match(/(\d+) failed/);
      const skipMatch = line.match(/(\d+) skipped/);

      if (passMatch) results.passed = parseInt(passMatch[1]);
      if (failMatch) results.failed = parseInt(failMatch[1]);
      if (skipMatch) results.skipped = parseInt(skipMatch[1]);
    }

    // Look for specific failures
    if (line.includes("✓") || line.includes("✔")) {
      results.passed++;
    } else if (
      line.includes("✗") ||
      line.includes("✘") ||
      line.includes("FAIL")
    ) {
      if (line.trim()) {
        results.failures.push(line.trim());
      }
    }
  }

  results.total = results.passed + results.failed;
  return results;
}

/**
 * Test specific files
 */
async function testSpecificFiles() {
  const testFiles = [
    "tests/unit/analytics-service.test.js",
    "tests/unit/audit-logger.test.js",
    "tests/integration/database-schema.test.js",
  ];

  console.log(
    `${COLORS.BLUE}Testing specific files that were fixed...${COLORS.RESET}\n`,
  );

  const results = [];

  for (const file of testFiles) {
    console.log(`${COLORS.YELLOW}Testing: ${file}${COLORS.RESET}`);

    const { code, stdout, stderr } = await runCommand("npx", [
      "vitest",
      "run",
      file,
      "--reporter=verbose",
    ]);

    const testResults = parseTestResults(stdout + stderr);

    results.push({
      file,
      passed: code === 0,
      ...testResults,
    });

    if (code === 0) {
      console.log(
        `${COLORS.GREEN}✓ PASSED${COLORS.RESET} - ${testResults.passed} tests passed\n`,
      );
    } else {
      console.log(
        `${COLORS.RED}✗ FAILED${COLORS.RESET} - ${testResults.failed} failures\n`,
      );
      if (testResults.failures.length > 0) {
        console.log("Failures:");
        testResults.failures.forEach((f) => console.log(`  - ${f}`));
      }
    }
  }

  return results;
}

/**
 * Run full test suite
 */
async function runFullTestSuite() {
  console.log(`${COLORS.BLUE}Running full test suite...${COLORS.RESET}\n`);

  const { code, stdout, stderr } = await runCommand("npm", ["test"]);

  const results = parseTestResults(stdout + stderr);

  return {
    passed: code === 0,
    ...results,
  };
}

/**
 * Main validation function
 */
async function validateFixes() {
  console.log(
    `${COLORS.BLUE}═══════════════════════════════════════════════════${COLORS.RESET}`,
  );
  console.log(`${COLORS.BLUE}     Test Fixes Validation Report${COLORS.RESET}`);
  console.log(
    `${COLORS.BLUE}═══════════════════════════════════════════════════${COLORS.RESET}\n`,
  );

  // Test specific fixed files
  const specificResults = await testSpecificFiles();

  console.log(
    `${COLORS.BLUE}═══════════════════════════════════════════════════${COLORS.RESET}`,
  );
  console.log(`${COLORS.BLUE}Individual Test Results:${COLORS.RESET}\n`);

  let allSpecificPassed = true;

  for (const result of specificResults) {
    const status = result.passed
      ? `${COLORS.GREEN}✓ PASS${COLORS.RESET}`
      : `${COLORS.RED}✗ FAIL${COLORS.RESET}`;

    console.log(`${status} ${result.file}`);
    console.log(
      `  Tests: ${result.passed} passed, ${result.failed} failed, ${result.total} total`,
    );

    if (!result.passed) {
      allSpecificPassed = false;
    }
  }

  console.log();

  // Run full suite if individual tests passed
  if (allSpecificPassed) {
    console.log(
      `${COLORS.GREEN}All specific tests passed! Running full suite...${COLORS.RESET}\n`,
    );

    const fullResults = await runFullTestSuite();

    console.log(
      `${COLORS.BLUE}═══════════════════════════════════════════════════${COLORS.RESET}`,
    );
    console.log(`${COLORS.BLUE}Full Test Suite Results:${COLORS.RESET}\n`);

    if (fullResults.passed) {
      console.log(`${COLORS.GREEN}✓ SUCCESS!${COLORS.RESET} All tests passed!`);
      console.log(`  Total: ${fullResults.total} tests`);
      console.log(`  Passed: ${fullResults.passed}`);
      console.log(`  Failed: ${fullResults.failed}`);
      console.log(`  Skipped: ${fullResults.skipped}`);

      console.log(
        `\n${COLORS.GREEN}🎉 100% TEST PASS RATE ACHIEVED! 🎉${COLORS.RESET}\n`,
      );
      process.exit(0);
    } else {
      console.log(
        `${COLORS.RED}✗ FAILURE${COLORS.RESET} Some tests still failing`,
      );
      console.log(`  Total: ${fullResults.total} tests`);
      console.log(`  Passed: ${fullResults.passed}`);
      console.log(`  Failed: ${fullResults.failed}`);
      console.log(`  Skipped: ${fullResults.skipped}`);

      if (fullResults.failures.length > 0) {
        console.log("\nFailures:");
        fullResults.failures.forEach((f) => console.log(`  - ${f}`));
      }

      process.exit(1);
    }
  } else {
    console.log(
      `${COLORS.RED}✗ Individual test fixes failed. Please review the failures above.${COLORS.RESET}\n`,
    );
    process.exit(1);
  }
}

// Run validation
validateFixes().catch((error) => {
  console.error(`${COLORS.RED}Error during validation:${COLORS.RESET}`, error);
  process.exit(1);
});
