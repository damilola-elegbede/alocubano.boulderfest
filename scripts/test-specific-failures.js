#!/usr/bin/env node

/**
 * Test runner for the 4 specific failing tests
 * Runs each test file and reports results
 */

const { execSync } = require("child_process");
const path = require("path");

const testFiles = [
  "tests/unit/browser-compatibility.test.js",
  "tests/unit/cache-management-apis.test.js",
  "tests/unit/cors-performance.test.js",
];

console.log("🔍 Running specific failing test files...\n");

let totalPassed = 0;
let totalFailed = 0;
const results = [];

testFiles.forEach((testFile, index) => {
  console.log(`Running ${index + 1}/${testFiles.length}: ${testFile}`);

  try {
    const cmd = `npx vitest run ${testFile} --reporter=default 2>&1`;
    const output = execSync(cmd, {
      cwd: path.dirname(__dirname),
      encoding: "utf8",
    });

    // Parse output for pass/fail counts
    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);

    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;

    results.push({
      file: testFile,
      passed,
      failed,
    });

    totalPassed += passed;
    totalFailed += failed;

    if (failed === 0) {
      console.log(`  ✅ All ${passed} tests passed`);
    } else {
      console.log(`  ❌ ${failed} tests failed, ${passed} passed`);

      // Extract failed test names
      const failedTests = output.match(/✗ .+/g);
      if (failedTests) {
        console.log("  Failed tests:");
        failedTests.forEach((test) => console.log(`    ${test}`));
      }
    }
    console.log("");
  } catch (error) {
    // Test command failed - try to extract info from error
    const output = error.stdout || error.stderr || error.message;

    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);

    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;

    if (failed > 0 || failMatch) {
      results.push({
        file: testFile,
        passed,
        failed: failed || 1,
      });

      totalPassed += passed;
      totalFailed += failed || 1;

      console.log(`  ❌ ${failed || 1} tests failed`);

      // Extract failed test names
      const failedTests = output.match(/✗ .+/g);
      if (failedTests) {
        console.log("  Failed tests:");
        failedTests.slice(0, 5).forEach((test) => console.log(`    ${test}`));
      }
    } else {
      console.log("  ⚠️  Unable to parse test results");
      results.push({
        file: testFile,
        passed: 0,
        failed: 1,
      });
      totalFailed += 1;
    }
    console.log("");
  }
});

console.log("=".repeat(60));
console.log("SUMMARY:");
console.log("=".repeat(60));

results.forEach((r) => {
  const status = r.failed === 0 ? "✅" : "❌";
  console.log(`${status} ${r.file}`);
  console.log(`   Passed: ${r.passed}, Failed: ${r.failed}`);
});

console.log("=".repeat(60));
console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed === 0) {
  console.log("\n🎉 All previously failing tests are now passing!");
  console.log("Run full test suite to confirm: npm test");
  process.exit(0);
} else {
  console.log(
    `\n❌ ${totalFailed} test(s) still failing. Review the output above.`,
  );

  // Show specific failing tests for targeted investigation
  console.log("\nSpecific failing tests to investigate:");
  if (
    results.some(
      (r) => r.file.includes("browser-compatibility") && r.failed > 0,
    )
  ) {
    console.log(
      '  - browser-compatibility.test.js: "handles intersection observer errors"',
    );
  }
  if (
    results.some((r) => r.file.includes("cache-management") && r.failed > 0)
  ) {
    console.log(
      '  - cache-management-apis.test.js: "should clear all caches" and/or "should warm all sections by default"',
    );
  }
  if (
    results.some((r) => r.file.includes("cors-performance") && r.failed > 0)
  ) {
    console.log(
      '  - cors-performance.test.js: "should invalidate cache when environment variable changes"',
    );
  }

  process.exit(1);
}
