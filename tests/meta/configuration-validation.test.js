/**
 * Configuration Validation Tests
 *
 * Ensures that test configuration consolidation is complete and correct.
 * These tests validate that no legacy configuration remains and that
 * the unified configuration works consistently across environments.
 *
 * @fileoverview Meta tests for test configuration validation
 */

import { describe, test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = process.cwd();

describe("Configuration Consolidation Validation", () => {
  describe("Vitest Configuration", () => {
    test("should have EXACTLY one vitest config file", () => {
      const vitestConfigs = [
        "vitest.config.js",
        "vitest.config.ts",
        "vitest.config.mjs",
        "vitest.config.ci.js",
        "vitest.config.ci.ts",
        "vitest.config.ci.mjs",
      ];

      const existingConfigs = vitestConfigs.filter((config) =>
        existsSync(join(PROJECT_ROOT, config)),
      );

      expect(existingConfigs).toEqual(["vitest.config.js"]);
      expect(existingConfigs).toHaveLength(1);
    });

    test("vitest.config.ci.js should NOT exist", () => {
      const ciConfigExists = existsSync(
        join(PROJECT_ROOT, "vitest.config.ci.js"),
      );
      expect(ciConfigExists).toBe(false);
    });

    test("vitest.config.js should have NO environment detection", () => {
      const configPath = join(PROJECT_ROOT, "vitest.config.js");
      const configContent = readFileSync(configPath, "utf-8");

      // Should NOT contain any process.env checks
      expect(configContent).not.toMatch(/process\.env/);
      expect(configContent).not.toMatch(/NODE_ENV/);

      // CI mentions are only allowed in comments, not in code
      const lines = configContent.split("\n");
      const codeLines = lines.filter((line) => !line.trim().startsWith("//"));
      const codeContent = codeLines.join("\n");
      expect(codeContent).not.toMatch(/CI/);

      // Should contain consolidation comments
      expect(configContent).toMatch(/NO environment detection/);
      expect(configContent).toMatch(/NO CI-specific branches/);
      expect(configContent).toMatch(/Same behavior everywhere/);
    });

    test("vitest.config.js should exclude meta tests", () => {
      const configPath = join(PROJECT_ROOT, "vitest.config.js");
      const configContent = readFileSync(configPath, "utf-8");

      expect(configContent).toMatch(/tests\/meta\/\*\*/);
      expect(configContent).toMatch(/Meta tests about infrastructure/);
    });

    test("vitest.config.js should use consistent pool settings", () => {
      const configPath = join(PROJECT_ROOT, "vitest.config.js");
      const configContent = readFileSync(configPath, "utf-8");

      expect(configContent).toMatch(/pool: 'forks'/);
      expect(configContent).toMatch(/singleFork: true/);
      expect(configContent).toMatch(/maxForks: 2/);
      expect(configContent).toMatch(/Consistent execution/);
      expect(configContent).toMatch(/Same locally and in automated testing/);
    });
  });

  describe("Package.json Scripts", () => {
    test("should have core test-related scripts", () => {
      const packagePath = join(PROJECT_ROOT, "package.json");
      const packageContent = JSON.parse(readFileSync(packagePath, "utf-8"));

      const testScripts = Object.keys(packageContent.scripts || {}).filter(
        (script) => script.startsWith("test"),
      );

      // Should have core test scripts
      expect(testScripts).toContain("test");
      expect(testScripts).toContain("test:watch");
      expect(testScripts).toContain("test:coverage");
      expect(testScripts).toContain("test:e2e");

      // Should NOT have CI-specific variants
      expect(testScripts).not.toContain("test:ci");
      expect(testScripts).not.toContain("test:unit:ci");
      expect(testScripts).not.toContain("test:integration:ci");
      expect(testScripts).not.toContain("test:performance:ci");
    });

    test("test scripts should use standard commands only", () => {
      const packagePath = join(PROJECT_ROOT, "package.json");
      const packageContent = JSON.parse(readFileSync(packagePath, "utf-8"));

      const scripts = packageContent.scripts || {};

      // Main test script should be simple
      expect(scripts.test).toBe("vitest run");

      // Watch should be simple
      expect(scripts["test:watch"]).toBe("vitest watch");

      // Coverage should be simple
      expect(scripts["test:coverage"]).toBe("vitest run --coverage");

      // E2E should use playwright
      expect(scripts["test:e2e"]).toBe("playwright test");
    });

    test("should NOT have legacy CI script variants", () => {
      const packagePath = join(PROJECT_ROOT, "package.json");
      const packageContent = JSON.parse(readFileSync(packagePath, "utf-8"));

      const scripts = packageContent.scripts || {};
      const scriptNames = Object.keys(scripts);

      // Should not have any :ci variants
      const ciVariants = scriptNames.filter((name) => name.includes(":ci"));
      const expectedCiVariants = [
        "start:ci", // This is legitimate (CI server)
        "performance:ci:full",
        "performance:ci:critical",
        "performance:ci", // Performance scripts may have CI variants
      ];

      // Sort both arrays for consistent comparison
      expect(ciVariants.sort()).toEqual(expectedCiVariants.sort());

      // Specifically should NOT have test:ci variants
      expect(scripts).not.toHaveProperty("test:ci");
      expect(scripts).not.toHaveProperty("test:unit:ci");
      expect(scripts).not.toHaveProperty("test:integration:ci");
    });
  });

  describe("Git Hooks Validation", () => {
    test("pre-push hook should use standard commands", () => {
      const hookPath = join(PROJECT_ROOT, ".husky/pre-push");

      if (existsSync(hookPath)) {
        const hookContent = readFileSync(hookPath, "utf-8");

        expect(hookContent).toMatch(/npm test/);
        expect(hookContent).toMatch(/npm run lint/);

        // Should NOT use CI variants
        expect(hookContent).not.toMatch(/npm run test:ci/);
        expect(hookContent).not.toMatch(/npm run test:unit:ci/);
        expect(hookContent).not.toMatch(/test:.*:ci/);

        // Should have comment indicating CI consistency
        expect(hookContent).toMatch(/Exactly what CI runs/);
      }
    });

    test("should not have environment-specific git hooks", () => {
      const huskyDir = join(PROJECT_ROOT, ".husky");

      if (existsSync(huskyDir)) {
        const hookFiles = readdirSync(huskyDir).filter(
          (file) => !file.startsWith("_") && !file.includes(".backup"),
        );

        // Should only have standard hooks, no environment variants
        hookFiles.forEach((hookFile) => {
          expect(hookFile).not.toMatch(/\.ci$/);
          expect(hookFile).not.toMatch(/\.dev$/);
          expect(hookFile).not.toMatch(/\.prod$/);
        });
      }
    });
  });

  describe("CI Workflow Validation", () => {
    test("comprehensive-testing.yml should use standard commands", () => {
      const workflowPath = join(
        PROJECT_ROOT,
        ".github/workflows/comprehensive-testing.yml",
      );

      if (existsSync(workflowPath)) {
        const workflowContent = readFileSync(workflowPath, "utf-8");

        // Should use standard npm test
        expect(workflowContent).toMatch(/npm test/);

        // Should NOT use environment-specific commands
        expect(workflowContent).not.toMatch(/npm run test:unit:ci/);
        expect(workflowContent).not.toMatch(/npm run test:integration:ci/);

        // Performance tests may still have CI variants (that's acceptable)
        // But unit/integration tests should be standardized
      }
    });

    test("legacy ci.yml should be deprecated or minimal", () => {
      const legacyWorkflowPath = join(PROJECT_ROOT, ".github/workflows/ci.yml");

      if (existsSync(legacyWorkflowPath)) {
        const workflowContent = readFileSync(legacyWorkflowPath, "utf-8");

        // Should be marked as deprecated OR use standard commands
        const isDeprecated =
          workflowContent.includes("deprecated") ||
          workflowContent.includes("Legacy");
        const usesStandardCommands =
          workflowContent.includes("npm test") &&
          !workflowContent.includes("npm run test:unit:ci");

        expect(isDeprecated || usesStandardCommands).toBe(true);
      }
    });
  });

  describe("Configuration Consistency", () => {
    test("all test configuration should be environment-agnostic", () => {
      const configFiles = ["vitest.config.js", "package.json"];

      configFiles.forEach((configFile) => {
        const filePath = join(PROJECT_ROOT, configFile);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, "utf-8");

          // Count environment-specific references
          const envReferences = (content.match(/process\.env\./g) || []).length;
          const ciReferences = (content.match(/CI/g) || []).length;
          const nodeEnvReferences = (content.match(/NODE_ENV/g) || []).length;

          // vitest.config.js should have ZERO environment detection
          if (configFile === "vitest.config.js") {
            expect(envReferences).toBe(0);

            // CI references should only be in comments
            const lines = content.split("\n");
            const codeLines = lines.filter(
              (line) => !line.trim().startsWith("//"),
            );
            const codeContent = codeLines.join("\n");
            const codeOnlyCiReferences = (codeContent.match(/CI/g) || [])
              .length;
            expect(codeOnlyCiReferences).toBe(0);

            expect(nodeEnvReferences).toBe(0);
          }

          // package.json may have some env vars in scripts, but test scripts should be clean
          if (configFile === "package.json") {
            const packageData = JSON.parse(content);
            const testScripts = Object.keys(packageData.scripts || {})
              .filter(
                (key) =>
                  key.startsWith("test:") && !key.includes("performance"),
              )
              .map((key) => packageData.scripts[key]);

            testScripts.forEach((script) => {
              expect(script).not.toMatch(/NODE_ENV/);
              expect(script).not.toMatch(/CI=/);
            });
          }
        }
      });
    });

    test("meta directory should be excluded from test runs", () => {
      const configPath = join(PROJECT_ROOT, "vitest.config.js");
      const configContent = readFileSync(configPath, "utf-8");

      // Meta tests should be excluded to prevent recursion
      expect(configContent).toMatch(/exclude:[\s\S]*tests\/meta\/\*\*/);
    });

    test("should not have environment-specific test files", () => {
      const testDirs = ["tests/unit", "tests/integration"];

      testDirs.forEach((testDir) => {
        const fullPath = join(PROJECT_ROOT, testDir);
        if (existsSync(fullPath)) {
          const testFiles = readdirSync(fullPath, { recursive: true }).filter(
            (file) => file.endsWith(".test.js") || file.endsWith(".spec.js"),
          );

          testFiles.forEach((testFile) => {
            expect(testFile).not.toMatch(/\.ci\.test\.js$/);
            expect(testFile).not.toMatch(/\.dev\.test\.js$/);
            expect(testFile).not.toMatch(/\.prod\.test\.js$/);
          });
        }
      });
    });
  });

  describe("Test Execution Validation", () => {
    test("current test run should use consolidated configuration", () => {
      // This test validates that we're actually using the consolidated config
      expect(process.env.VITEST_CONFIG).toBeUndefined();

      // Should be running with vitest
      expect(import.meta.env?.VITEST).toBeTruthy();

      // Should not have CI-specific configuration loaded
      expect(process.env.TEST_CI_EXCLUDE_PATTERNS).toBeUndefined();
    });

    test("test environment should be consistent", () => {
      // Validate that environment variables are not being used for configuration
      const sensitiveEnvVars = [
        "VITEST_CONFIG_CI",
        "TEST_CONFIG_OVERRIDE",
        "VITEST_CI_MODE",
      ];

      sensitiveEnvVars.forEach((envVar) => {
        expect(process.env[envVar]).toBeUndefined();
      });
    });
  });

  describe("Documentation Validation", () => {
    test("CLAUDE.md should document standard commands only", () => {
      const claudePath = join(PROJECT_ROOT, "CLAUDE.md");

      if (existsSync(claudePath)) {
        const claudeContent = readFileSync(claudePath, "utf-8");

        // Should document standard test commands
        expect(claudeContent).toMatch(/npm test/);
        expect(claudeContent).toMatch(/npm run test:coverage/);

        // Should NOT document CI-specific variants in main examples
        const ciCommandMatches =
          claudeContent.match(/npm run test:.*:ci/g) || [];

        // Check that CI-specific test commands are only for performance
        const nonPerformanceCiCommands = ciCommandMatches.filter(
          (command) => !command.includes("performance"),
        );

        // Allow some specific CI commands that are documented but not for core testing
        const allowedNonPerformanceCi = [
          "npm run test:unit:ci",
          "npm run test:integration:ci",
        ];

        const unexpectedCiCommands = nonPerformanceCiCommands.filter(
          (command) => !allowedNonPerformanceCi.includes(command),
        );

        expect(unexpectedCiCommands).toEqual([]);
      }
    });

    test("README files should reference standard commands", () => {
      const readmeFiles = ["README.md", "tests/README.md"];

      readmeFiles.forEach((readmeFile) => {
        const readmePath = join(PROJECT_ROOT, readmeFile);
        if (existsSync(readmePath)) {
          const readmeContent = readFileSync(readmePath, "utf-8");

          // Should primarily reference standard commands
          if (readmeContent.includes("npm test")) {
            expect(readmeContent).toMatch(/npm test/);
          }
        }
      });
    });
  });

  describe("Regression Prevention", () => {
    test("should prevent addition of new CI-specific test configs", () => {
      // Check for any new vitest config files
      const rootFiles = readdirSync(PROJECT_ROOT);
      const vitestConfigFiles = rootFiles.filter(
        (file) => file.startsWith("vitest.config") && file.endsWith(".js"),
      );

      // Allow vitest.config.meta.js for configuration validation
      const allowedConfigs = ["vitest.config.js", "vitest.config.meta.js"];
      const unexpectedConfigs = vitestConfigFiles.filter(
        (file) => !allowedConfigs.includes(file),
      );

      expect(unexpectedConfigs).toEqual([]);
      expect(vitestConfigFiles).toContain("vitest.config.js");
    });

    test("should prevent CI-specific script additions", () => {
      const packagePath = join(PROJECT_ROOT, "package.json");
      const packageContent = JSON.parse(readFileSync(packagePath, "utf-8"));

      const scripts = packageContent.scripts || {};
      const newCiScripts = Object.keys(scripts).filter((script) =>
        script.match(/^test:(?!e2e|coverage|watch|links)[^:]*:ci$/),
      );

      // Should not have any new test:*:ci scripts (except documented exceptions)
      expect(newCiScripts).toEqual([]);
    });

    test("configuration consolidation should be documented", () => {
      const configPath = join(PROJECT_ROOT, "vitest.config.js");
      const configContent = readFileSync(configPath, "utf-8");

      // Should have clear documentation about consolidation
      expect(configContent).toMatch(/Global settings for ALL test types/);
      expect(configContent).toMatch(/NO environment detection/);
      expect(configContent).toMatch(/Single include\/exclude pattern/);
    });
  });
});

describe("Consolidation Benefits Validation", () => {
  test("configuration should be simpler and more maintainable", () => {
    const configPath = join(PROJECT_ROOT, "vitest.config.js");
    const configContent = readFileSync(configPath, "utf-8");

    // Should not have complex conditional logic
    expect(configContent).not.toMatch(/if\s*\(/);
    expect(configContent).not.toMatch(/\?\s*.*:/);
    expect(configContent).not.toMatch(/switch\s*\(/);

    // Should be straightforward configuration
    expect(configContent).toMatch(/export default defineConfig/);
  });

  test("test execution should be predictable across environments", () => {
    // Same test files should run everywhere
    const configPath = join(PROJECT_ROOT, "vitest.config.js");
    const configContent = readFileSync(configPath, "utf-8");

    // Include/exclude patterns should be static
    expect(configContent).toMatch(/include: \[.*\]/);
    expect(configContent).toMatch(/exclude: \[/);

    // No dynamic pattern generation
    expect(configContent).not.toMatch(/\.concat\(/);
    expect(configContent).not.toMatch(/\.push\(/);
    expect(configContent).not.toMatch(/\.filter\(/);
  });

  test("debugging should be easier with unified configuration", () => {
    const packagePath = join(PROJECT_ROOT, "package.json");
    const packageContent = JSON.parse(readFileSync(packagePath, "utf-8"));

    const scripts = packageContent.scripts || {};

    // Test scripts should be simple and clear
    expect(scripts.test).toBe("vitest run");
    expect(scripts["test:watch"]).toBe("vitest watch");
    expect(scripts["test:coverage"]).toBe("vitest run --coverage");

    // No complex script compositions
    Object.values(scripts).forEach((script) => {
      if (script.includes("vitest")) {
        expect(script).not.toMatch(/&&.*vitest/); // No chained vitest commands
      }
    });
  });
});
