/**
 * Production Migration API Endpoint
 * Secure endpoint for running database migrations in production
 * Use with caution - this modifies the production database
 */

import { MigrationSystem } from "../scripts/migrate.js";

export default async function handler(req, res) {
  // Security: Only allow in development or with special auth
  if (
    process.env.NODE_ENV === "production" &&
    !req.headers["x-migration-key"]
  ) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Production migrations require authentication",
    });
  }

  // Validate migration key in production
  if (
    process.env.NODE_ENV === "production" &&
    req.headers["x-migration-key"] !== process.env.MIGRATION_SECRET_KEY
  ) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid migration key",
    });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only POST requests are supported",
    });
  }

  const { action = "run" } = req.body;

  try {
    const migration = new MigrationSystem();
    let result;

    switch (action) {
      case "run":
        console.log("🚀 Running production migrations...");
        result = await migration.runMigrations();
        break;

      case "status":
        console.log("📊 Getting migration status...");
        result = await migration.status();
        break;

      case "verify":
        console.log("🔍 Verifying migrations...");
        result = await migration.verifyMigrations();
        break;

      default:
        return res.status(400).json({
          error: "Invalid action",
          message: "Action must be one of: run, status, verify",
        });
    }

    return res.status(200).json({
      success: true,
      action,
      result,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    });
  } catch (error) {
    console.error("❌ Migration API error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
