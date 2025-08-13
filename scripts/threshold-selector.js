#!/usr/bin/env node

/**
 * Threshold Selector Utility
 *
 * Dynamically selects appropriate performance thresholds based on:
 * - Environment detection (CI, Staging, Production)
 * - Test type (ticket-sales, check-in, sustained, stress)
 * - Deployment target
 * - Serverless platform constraints
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ThresholdSelector {
  constructor() {
    this.configPath = path.join(
      __dirname,
      "..",
      "config",
      "environment-thresholds.json",
    );
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configData = fs.readFileSync(this.configPath, "utf8");
      return JSON.parse(configData);
    } catch (error) {
      console.error(`Failed to load threshold configuration: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Detect current environment based on environment variables and patterns
   */
  detectEnvironment() {
    // Check explicit override first
    const override = process.env.PERF_TEST_ENV;
    if (override && this.config.environments[override]) {
      console.log(`Using explicit environment override: ${override}`);
      return override;
    }

    // Check CI indicators
    const ciIndicators =
      this.config.dynamic_threshold_logic.environment_detection.ci_indicators;
    for (const indicator of ciIndicators) {
      if (process.env[indicator]) {
        console.log(`Detected CI environment via ${indicator}`);
        return "ci";
      }
    }

    // Check URL patterns for staging
    const deploymentUrl =
      process.env.LOAD_TEST_BASE_URL || process.env.VERCEL_URL || "";
    const stagingPatterns =
      this.config.dynamic_threshold_logic.environment_detection
        .staging_patterns;

    for (const pattern of stagingPatterns) {
      if (deploymentUrl.includes(pattern)) {
        console.log(
          `Detected staging environment from URL pattern: ${pattern}`,
        );
        return "staging";
      }
    }

    // Check for production patterns
    const productionPatterns =
      this.config.dynamic_threshold_logic.environment_detection
        .production_patterns;
    const branch =
      process.env.GITHUB_REF_NAME || process.env.VERCEL_GIT_COMMIT_REF || "";

    for (const pattern of productionPatterns) {
      if (deploymentUrl.includes(pattern) || branch === pattern) {
        console.log(`Detected production environment from pattern: ${pattern}`);
        return "production";
      }
    }

    // Default fallback
    const fallback = this.config.dynamic_threshold_logic.fallback_hierarchy[0];
    console.log(`No environment detected, using fallback: ${fallback}`);
    return fallback;
  }

  /**
   * Get thresholds for a specific test type and environment
   */
  getThresholds(testType, environment = null) {
    const env = environment || this.detectEnvironment();

    if (!this.config.environments[env]) {
      throw new Error(`Unknown environment: ${env}`);
    }

    if (!this.config.environments[env].thresholds[testType]) {
      throw new Error(
        `Unknown test type '${testType}' for environment '${env}'`,
      );
    }

    const thresholds = this.config.environments[env].thresholds[testType];

    console.log(`Selected thresholds for ${testType} in ${env} environment:`);
    console.log(JSON.stringify(thresholds, null, 2));

    return {
      environment: env,
      testType: testType,
      thresholds: thresholds,
      metadata: {
        description: this.config.environments[env].description,
        context: this.config.environments[env].context,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Generate K6 threshold configuration object
   */
  generateK6Thresholds(testType, environment = null) {
    const thresholdData = this.getThresholds(testType, environment);
    return thresholdData.thresholds;
  }

  /**
   * Generate environment-specific test options
   */
  generateTestOptions(testType, environment = null) {
    const env = environment || this.detectEnvironment();
    const thresholds = this.generateK6Thresholds(testType, env);
    const execParams = this.config.test_execution_parameters[env] || {};

    return {
      thresholds: thresholds,
      execution: {
        maxDuration: execParams.max_duration_minutes
          ? `${execParams.max_duration_minutes}m`
          : "30m",
        maxUsers: execParams.max_concurrent_users || 100,
        testScope: execParams.full_test_scope ? "full" : "reduced",
        includeStress: execParams.include_stress_tests !== false,
      },
      serverless: this.config.serverless_adjustments,
      alerting:
        this.config.alerting_configuration.threshold_breach_notifications[
          env
        ] || {},
    };
  }

  /**
   * Export thresholds for K6 script consumption
   */
  exportForK6(testType, outputPath = null) {
    const environment = this.detectEnvironment();
    const options = this.generateTestOptions(testType, environment);

    const k6Export = {
      // K6 options object
      options: {
        thresholds: options.thresholds,
        tags: {
          environment: environment,
          testType: testType,
          generated: new Date().toISOString(),
        },
      },

      // Additional configuration for test scripts
      config: {
        environment: environment,
        serverless: options.serverless,
        execution: options.execution,
        alerting: options.alerting,
      },
    };

    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(k6Export, null, 2));
      console.log(`Thresholds exported to: ${outputPath}`);
    }

    return k6Export;
  }

  /**
   * Validate thresholds against serverless constraints
   */
  validateServerlessCompatibility(testType, environment = null) {
    const env = environment || this.detectEnvironment();
    const thresholds = this.getThresholds(testType, env);
    const serverless = this.config.serverless_adjustments;

    const warnings = [];
    const errors = [];

    // Check timeout compatibility
    Object.keys(thresholds.thresholds).forEach((key) => {
      if (key.includes("duration") && thresholds.thresholds[key]) {
        thresholds.thresholds[key].forEach((threshold) => {
          const match = threshold.match(/p\(\d+\)<(\d+)/);
          if (match) {
            const timeoutMs = parseInt(match[1]);
            const maxTimeoutMs =
              serverless.timeout_configurations.pro_timeout_s * 1000;

            if (timeoutMs > maxTimeoutMs) {
              errors.push(
                `Threshold ${threshold} exceeds Vercel timeout limit of ${maxTimeoutMs}ms`,
              );
            } else if (timeoutMs > maxTimeoutMs * 0.8) {
              warnings.push(
                `Threshold ${threshold} is close to Vercel timeout limit`,
              );
            }
          }
        });
      }
    });

    return { warnings, errors, valid: errors.length === 0 };
  }

  /**
   * CLI interface
   */
  static cli() {
    const args = process.argv.slice(2);
    const selector = new ThresholdSelector();

    if (args.length === 0) {
      console.log(`
Usage: node threshold-selector.js <command> [options]

Commands:
  detect                          - Detect current environment
  get <test-type> [environment]   - Get thresholds for test type
  export <test-type> [output]     - Export K6-compatible thresholds
  validate <test-type>            - Validate serverless compatibility

Test types: ticket-sales, check-in, sustained, stress
Environments: ci, staging, production

Examples:
  node threshold-selector.js detect
  node threshold-selector.js get ticket-sales ci
  node threshold-selector.js export check-in /tmp/thresholds.json
  node threshold-selector.js validate stress
      `);
      return;
    }

    const command = args[0];

    try {
      switch (command) {
        case "detect":
          const env = selector.detectEnvironment();
          console.log(`Current environment: ${env}`);
          break;

        case "get":
          if (args.length < 2) {
            console.error("Test type required");
            process.exit(1);
          }
          const thresholds = selector.getThresholds(args[1], args[2]);
          console.log(JSON.stringify(thresholds, null, 2));
          break;

        case "export":
          if (args.length < 2) {
            console.error("Test type required");
            process.exit(1);
          }
          const exported = selector.exportForK6(args[1], args[2]);
          if (!args[2]) {
            console.log(JSON.stringify(exported, null, 2));
          }
          break;

        case "validate":
          if (args.length < 2) {
            console.error("Test type required");
            process.exit(1);
          }
          const validation = selector.validateServerlessCompatibility(args[1]);
          console.log("Validation Results:");
          console.log(`Valid: ${validation.valid}`);
          if (validation.warnings.length > 0) {
            console.log("Warnings:");
            validation.warnings.forEach((w) => console.log(`  - ${w}`));
          }
          if (validation.errors.length > 0) {
            console.log("Errors:");
            validation.errors.forEach((e) => console.log(`  - ${e}`));
          }
          process.exit(validation.valid ? 0 : 1);

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  ThresholdSelector.cli();
}

export default ThresholdSelector;
