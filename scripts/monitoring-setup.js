#!/usr/bin/env node

/**
 * Monitoring Infrastructure Setup Script
 * Sets up and validates the monitoring system for production
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Load environment variables
dotenv.config({ path: join(projectRoot, ".env.vercel") });
dotenv.config({ path: join(projectRoot, ".env") });

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

/**
 * Print colored message
 */
function print(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Check environment variable
 */
function checkEnvVar(name, required = true) {
  const value = process.env[name];

  if (!value && required) {
    print(`  ❌ ${name}: Missing (REQUIRED)`, "red");
    return false;
  } else if (!value) {
    print(`  ⚠️  ${name}: Missing (optional)`, "yellow");
    return true;
  } else {
    const displayValue =
      name.includes("KEY") || name.includes("SECRET")
        ? value.substring(0, 10) + "..."
        : value;
    print(`  ✅ ${name}: ${displayValue}`, "green");
    return true;
  }
}

/**
 * Validate Sentry configuration
 */
async function validateSentryConfig() {
  print("\n📊 Validating Sentry Configuration...", "cyan");

  let valid = true;

  // Check required environment variables
  valid = checkEnvVar("SENTRY_DSN", false) && valid;
  valid = checkEnvVar("SENTRY_ORG", false) && valid;
  valid = checkEnvVar("SENTRY_PROJECT", false) && valid;

  if (process.env.SENTRY_DSN) {
    try {
      // Validate DSN format
      const url = new URL(process.env.SENTRY_DSN);
      if (
        !url.hostname.includes("sentry.io") &&
        !url.hostname.includes("ingest.sentry.io")
      ) {
        print("  ⚠️  DSN does not appear to be a valid Sentry URL", "yellow");
      }
    } catch (error) {
      print(`  ❌ Invalid SENTRY_DSN format: ${error.message}`, "red");
      valid = false;
    }
  } else {
    print("  ℹ️  Sentry is optional but recommended for production", "blue");
  }

  return valid;
}

/**
 * Test health check endpoints
 */
async function testHealthChecks() {
  print("\n🏥 Testing Health Check Endpoints...", "cyan");

  const baseUrl = process.env.VERCEL_URL || "http://localhost:3000";
  const endpoints = [
    "/api/health/check",
    "/api/health/database",
    "/api/health/stripe",
    "/api/health/brevo",
    "/api/health/analytics",
  ];

  let allHealthy = true;

  for (const endpoint of endpoints) {
    try {
      const url = `${baseUrl}${endpoint}`;
      print(`  Testing ${endpoint}...`, "blue");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok && data.status === "healthy") {
        print(
          `    ✅ ${endpoint}: HEALTHY (${data.response_time || "N/A"})`,
          "green",
        );
      } else if (response.ok && data.status === "degraded") {
        print(`    ⚠️  ${endpoint}: DEGRADED`, "yellow");
        if (data.details?.warnings) {
          data.details.warnings.forEach((warning) => {
            print(`      - ${warning}`, "yellow");
          });
        }
      } else {
        print(`    ❌ ${endpoint}: UNHEALTHY`, "red");
        if (data.error) {
          print(`      Error: ${data.error}`, "red");
        }
        allHealthy = false;
      }
    } catch (error) {
      print(`    ❌ ${endpoint}: Failed to connect`, "red");
      print(`      Error: ${error.message}`, "red");
      allHealthy = false;
    }
  }

  return allHealthy;
}

/**
 * Validate alert configuration
 */
async function validateAlertConfig() {
  print("\n🚨 Validating Alert Configuration...", "cyan");

  let valid = true;

  // Check webhook URLs
  valid = checkEnvVar("ALERT_WEBHOOK_URL", false) && valid;
  valid = checkEnvVar("ESCALATION_WEBHOOK_URL", false) && valid;

  // Check thresholds
  const thresholds = [
    { name: "PAYMENT_FAILURE_THRESHOLD", default: "0.01" },
    { name: "DB_RESPONSE_THRESHOLD", default: "1000" },
    { name: "API_RESPONSE_THRESHOLD", default: "2000" },
    { name: "MEMORY_USAGE_THRESHOLD", default: "80" },
    { name: "ERROR_RATE_THRESHOLD", default: "0.05" },
  ];

  print("  Alert Thresholds:", "blue");
  for (const threshold of thresholds) {
    const value = process.env[threshold.name] || threshold.default;
    print(
      `    ${threshold.name}: ${value} (default: ${threshold.default})`,
      "green",
    );
  }

  // Test webhook if configured
  if (process.env.ALERT_WEBHOOK_URL) {
    try {
      print("  Testing webhook connectivity...", "blue");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Monitoring system test alert",
          username: "Monitoring Setup",
          icon_emoji: ":white_check_mark:",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        print("    ✅ Webhook test successful", "green");
      } else {
        print(`    ⚠️  Webhook returned status ${response.status}`, "yellow");
      }
    } catch (error) {
      print(`    ❌ Webhook test failed: ${error.message}`, "red");
      valid = false;
    }
  }

  return valid;
}

/**
 * Check external service configurations
 */
async function checkExternalServices() {
  print("\n🔗 Checking External Service Configurations...", "cyan");

  let valid = true;

  // Check database
  print("  Database:", "blue");
  valid = checkEnvVar("DATABASE_URL", false) && valid;
  valid = checkEnvVar("DATABASE_AUTH_TOKEN", false) && valid;

  // Check Stripe
  print("  Stripe:", "blue");
  valid = checkEnvVar("STRIPE_SECRET_KEY", true) && valid;
  valid = checkEnvVar("STRIPE_WEBHOOK_ENDPOINT_SECRET", false) && valid;

  // Check Brevo
  print("  Brevo (Email):", "blue");
  valid = checkEnvVar("BREVO_API_KEY", false) && valid;
  valid = checkEnvVar("BREVO_NEWSLETTER_LIST_ID", false) && valid;
  valid = checkEnvVar("BREVO_WELCOME_TEMPLATE_ID", false) && valid;

  // Check Google Sheets
  print("  Google Sheets:", "blue");
  const hasGoogleAuth =
    checkEnvVar("GOOGLE_SHEETS_API_KEY", false) ||
    checkEnvVar("GOOGLE_SERVICE_ACCOUNT_KEY", false);
  valid = checkEnvVar("GOOGLE_SHEETS_SPREADSHEET_ID", false) && valid;

  if (!hasGoogleAuth) {
    print("    ⚠️  No Google Sheets authentication configured", "yellow");
  }

  return valid;
}

/**
 * Generate monitoring dashboard URL
 */
function generateDashboardURLs() {
  print("\n📈 Monitoring Dashboard URLs:", "cyan");

  const baseUrl =
    process.env.VERCEL_URL || "https://alocubanoboulderfest.vercel.app";

  print("  Health Check Dashboard:", "blue");
  print(`    ${baseUrl}/api/health/check`, "green");

  if (process.env.SENTRY_DSN) {
    const sentryOrg = process.env.SENTRY_ORG || "your-org";
    const sentryProject = process.env.SENTRY_PROJECT || "your-project";
    print("  Sentry Dashboard:", "blue");
    print(
      `    https://sentry.io/organizations/${sentryOrg}/projects/${sentryProject}/`,
      "green",
    );
  }

  if (process.env.VERCEL_URL) {
    print("  Vercel Dashboard:", "blue");
    print(`    https://vercel.com/dashboard`, "green");
  }
}

/**
 * Create environment template
 */
async function createEnvTemplate() {
  print("\n📝 Creating Environment Template...", "cyan");

  const template = `# Monitoring Configuration Template
# Copy this to .env.vercel and fill in your values

# Sentry Error Tracking (Optional but recommended)
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=

# Alert Webhooks (Optional)
# Slack webhook: https://api.slack.com/messaging/webhooks
# Discord webhook: https://support.discord.com/hc/en-us/articles/228383668
ALERT_WEBHOOK_URL=
ESCALATION_WEBHOOK_URL=

# Alert Thresholds (Optional - defaults shown)
PAYMENT_FAILURE_THRESHOLD=0.01
DB_RESPONSE_THRESHOLD=1000
API_RESPONSE_THRESHOLD=2000
MEMORY_USAGE_THRESHOLD=80
ERROR_RATE_THRESHOLD=0.05

# External Services (Required for full functionality)
DATABASE_URL=
DATABASE_AUTH_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_ENDPOINT_SECRET=
BREVO_API_KEY=
BREVO_NEWSLETTER_LIST_ID=
BREVO_WELCOME_TEMPLATE_ID=
BREVO_VERIFICATION_TEMPLATE_ID=
GOOGLE_SHEETS_API_KEY=
GOOGLE_SERVICE_ACCOUNT_KEY=
GOOGLE_SHEETS_SPREADSHEET_ID=

# Vercel Environment
VERCEL_ENV=production
VERCEL_URL=
`;

  const templatePath = join(projectRoot, ".env.monitoring.template");

  try {
    await fs.writeFile(templatePath, template);
    print(`  ✅ Template created at: ${templatePath}`, "green");
  } catch (error) {
    print(`  ❌ Failed to create template: ${error.message}`, "red");
  }
}

/**
 * Main setup function
 */
async function main() {
  print("================================================", "magenta");
  print("    A Lo Cubano - Monitoring Setup Validator    ", "magenta");
  print("================================================", "magenta");

  const results = {
    sentry: await validateSentryConfig(),
    alerts: await validateAlertConfig(),
    services: await checkExternalServices(),
  };

  // Only test health checks if running locally or if URL is configured
  if (process.env.VERCEL_URL || process.argv.includes("--test-health")) {
    results.health = await testHealthChecks();
  } else {
    print(
      "\n⏭️  Skipping health check tests (no VERCEL_URL configured)",
      "yellow",
    );
    print("    Run with --test-health to force health check tests", "blue");
  }

  // Generate dashboard URLs
  generateDashboardURLs();

  // Create environment template
  await createEnvTemplate();

  // Summary
  print("\n================================================", "magenta");
  print("                    SUMMARY                     ", "magenta");
  print("================================================", "magenta");

  const allValid = Object.values(results).every((v) => v !== false);

  if (allValid) {
    print("✅ Monitoring system is properly configured!", "green");
    print("\nNext steps:", "cyan");
    print("  1. Deploy to production: npm run deploy:production", "blue");
    print("  2. Test health endpoints after deployment", "blue");
    print("  3. Configure Sentry alerts and dashboards", "blue");
    print("  4. Set up external monitoring (Better Uptime, etc.)", "blue");
  } else {
    print("⚠️  Some monitoring components need configuration", "yellow");
    print("\nRequired fixes:", "cyan");

    if (!results.services) {
      print("  - Configure required external services", "red");
    }

    if (!results.sentry) {
      print(
        "  - Fix Sentry configuration (optional but recommended)",
        "yellow",
      );
    }

    if (!results.alerts) {
      print("  - Fix alert webhook configuration (optional)", "yellow");
    }

    if (results.health === false) {
      print("  - Fix unhealthy services", "red");
    }
  }

  process.exit(allValid ? 0 : 1);
}

// Run setup
main().catch((error) => {
  print(`\n❌ Setup failed: ${error.message}`, "red");
  process.exit(1);
});
