/**
 * Production-Safe Database Health Check Endpoint
 *
 * Checks:
 * - Turso database connection
 * - Migration status
 * - Basic query execution
 *
 * Returns minimal information suitable for production monitoring
 */

import { getDatabaseClient } from "../../lib/database.js";
import { getMigrationStatus } from "../../lib/migration-status.js";

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Set cache headers to prevent caching health status
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const startTime = Date.now();

  const healthCheck = {
    status: "checking",
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    checks: {
      database: { status: "pending" },
      migrations: { status: "pending" },
      query: { status: "pending" }
    }
  };

  try {
    // Get database client once for all checks
    let db;
    try {
      db = await getDatabaseClient();
      if (!db) {
        throw new Error("Database client not initialized");
      }
    } catch (error) {
      // If we can't get the database client, all checks fail
      healthCheck.checks.database.status = "unhealthy";
      healthCheck.checks.database.error = "Connection failed";
      healthCheck.checks.migrations.status = "unhealthy";
      healthCheck.checks.migrations.error = "Database unavailable";
      healthCheck.checks.query.status = "unhealthy";
      healthCheck.checks.query.error = "Database unavailable";
      console.error("Database client acquisition failed:", error.message);

      // Skip to the end since we can't perform any database operations
      const checks = Object.values(healthCheck.checks);
      const unhealthyChecks = checks.filter(check => check.status === "unhealthy");
      healthCheck.status = unhealthyChecks.length > 0 ? "unhealthy" : "healthy";
      healthCheck.responseTime = Date.now() - startTime;
      return res.status(503).json(healthCheck);
    }

    // Check 1: Database Connection (already verified above)
    healthCheck.checks.database.status = "healthy";
    healthCheck.checks.database.type = process.env.TURSO_DATABASE_URL ? "turso" : "sqlite";

    // Check 2: Migration Status
    try {
      const migrationStatus = await getMigrationStatus(db);

      healthCheck.checks.migrations.status = "healthy";
      healthCheck.checks.migrations.applied = Array.isArray(migrationStatus.applied) ? migrationStatus.applied.length : 0;
      healthCheck.checks.migrations.latest = migrationStatus.lastMigration || "none";

      // Check if critical tables exist
      const criticalTables = [
        "email_subscribers",
        "newsletter_subscriptions",
        "registrations",
        "tickets",
        "migrations"
      ];

      const tableCheckResult = await db.execute(`
        SELECT name FROM sqlite_master
        WHERE type='table'
        AND name IN (${criticalTables.map(() => '?').join(',')})
      `, criticalTables);

      const existingTables = tableCheckResult.rows.map(row => row.name);
      const missingTables = criticalTables.filter(table => !existingTables.includes(table));

      if (missingTables.length > 0) {
        healthCheck.checks.migrations.status = "degraded";
        healthCheck.checks.migrations.warning = `Missing tables: ${missingTables.join(", ")}`;
      }
    } catch (error) {
      healthCheck.checks.migrations.status = "unhealthy";
      healthCheck.checks.migrations.error = "Failed to check migrations";
      console.error("Migration check failed:", error.message);
    }

    // Check 3: Basic Query Execution
    try {
      // Measure only the query execution time
      const queryStartTime = Date.now();
      const testQuery = await db.execute("SELECT 1 as test");
      const queryLatency = Date.now() - queryStartTime;

      if (testQuery.rows[0]?.test === 1) {
        healthCheck.checks.query.status = "healthy";
        healthCheck.checks.query.latency = queryLatency;
      } else {
        throw new Error("Query returned unexpected result");
      }
    } catch (error) {
      healthCheck.checks.query.status = "unhealthy";
      healthCheck.checks.query.error = "Query execution failed";
      console.error("Query execution check failed:", error.message);
    }

    // Determine overall status
    const checks = Object.values(healthCheck.checks);
    const unhealthyChecks = checks.filter(check => check.status === "unhealthy");
    const degradedChecks = checks.filter(check => check.status === "degraded");

    if (unhealthyChecks.length > 0) {
      healthCheck.status = "unhealthy";
    } else if (degradedChecks.length > 0) {
      healthCheck.status = "degraded";
    } else {
      healthCheck.status = "healthy";
    }

    // Add response time
    healthCheck.responseTime = Date.now() - startTime;

    // Return appropriate status code based on health
    const statusCode = healthCheck.status === "healthy" ? 200 :
                       healthCheck.status === "degraded" ? 200 : 503;

    return res.status(statusCode).json(healthCheck);

  } catch (error) {
    console.error("Health check failed catastrophically:", error);

    healthCheck.status = "unhealthy";
    healthCheck.error = "Health check failed";
    healthCheck.responseTime = Date.now() - startTime;

    return res.status(503).json(healthCheck);
  }
}
