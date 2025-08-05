/**
 * Comprehensive Test Runner Script
 * Orchestrates different test types based on context
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const TestRunner = {
  // Fast tests for development workflow
  runFastTests: () => {
    console.log("🚀 Running fast unit tests...");
    execSync("npm run test:fast", { stdio: "inherit" });
  },

  // Full test suite for CI/CD
  runFullSuite: () => {
    console.log("🔍 Running comprehensive test suite...");
    execSync("npm run test:all", { stdio: "inherit" });
    execSync("npm run test:integration", { stdio: "inherit" });
    execSync("npm run test:performance", { stdio: "inherit" });
  },

  // Coverage validation
  validateCoverage: () => {
    console.log("📊 Validating test coverage...");
    execSync("npm run test:coverage:threshold", { stdio: "inherit" });
  },

  // Test health check
  checkTestHealth: () => {
    console.log("🏥 Running test health check...");
    // Run tests multiple times to detect flaky tests
    for (let i = 0; i < 3; i++) {
      console.log(`Health check run ${i + 1}/3`);
      execSync("npm test -- --silent", { stdio: "inherit" });
    }
  },
};

// Command line interface
const command = process.argv[2];
switch (command) {
  case "fast":
    TestRunner.runFastTests();
    break;
  case "full":
    TestRunner.runFullSuite();
    break;
  case "coverage":
    TestRunner.validateCoverage();
    break;
  case "health":
    TestRunner.checkTestHealth();
    break;
  default:
    console.log(
      "Usage: node scripts/test-runner.js [fast|full|coverage|health]",
    );
}
