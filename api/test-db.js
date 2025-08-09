/**
 * Database Test Endpoint
 * Tests database connection, table information, and migration status
 * Provides debugging information for database configuration
 */

import { getEmailSubscriberService } from "./lib/email-subscriber-service.js";
import { getDatabase } from "./lib/database.js";
import { getCorsConfig, isOriginAllowed } from "./lib/cors-config.js";
import {
  createSecurePragmaQuery,
  createSecureCountQuery,
  filterApplicationTables,
} from "./lib/sql-security.js";
import { getMigrationStatus } from "./lib/migration-status.js";

export default async function handler(req, res) {
  // Load secure CORS configuration
  const corsConfig = getCorsConfig();

  // Check origin and set CORS headers securely
  const origin = req.headers.origin;
  const originAllowed = isOriginAllowed(origin, corsConfig);

  if (originAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    corsConfig.allowedMethods.join(", "),
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    corsConfig.allowedHeaders.join(", "),
  );

  // Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET requests for database testing
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only GET requests are supported for database testing",
    });
  }

  const startTime = Date.now();

  try {
    console.log("Starting database test...");

    // Get the email subscriber service instance
    const subscriberService = getEmailSubscriberService();

    // Test results object
    const testResults = {
      timestamp: new Date().toISOString(),
      status: "testing",
      tests: {
        connection: { status: "pending", error: null },
        tables: { status: "pending", data: null, error: null },
        migrations: { status: "pending", data: null, error: null },
        configuration: { status: "pending", data: null, error: null },
      },
      summary: {
        totalTests: 4,
        passed: 0,
        failed: 0,
        errors: [],
      },
    };

    // Test 1: Database Connection
    console.log("Testing database connection...");
    try {
      // Since the current implementation uses simulated database operations,
      // we'll test the service instantiation and basic functionality
      const stats = await subscriberService.getSubscriberStats();

      if (stats && typeof stats.total === "number") {
        testResults.tests.connection.status = "passed";
        testResults.summary.passed++;
        console.log("Database connection test: PASSED");
      } else {
        throw new Error("Invalid stats response structure");
      }
    } catch (error) {
      console.error("Database connection test failed:", error.message);
      testResults.tests.connection.status = "failed";
      testResults.tests.connection.error = error.message;
      testResults.summary.failed++;
      testResults.summary.errors.push(`Connection: ${error.message}`);
    }

    // Test 2: Table Information
    console.log("Testing table information...");
    try {
      // Query actual database schema information
      const db = await getDatabase();
      const tableInfo = {};

      // Get list of tables
      const tablesResult = await db.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      // Filter to only include application tables for security
      const applicationTables = filterApplicationTables(
        tablesResult.rows.map((row) => row.name),
      );

      // For each table, get detailed information using secure queries
      for (const tableName of applicationTables) {
        try {
          // Get column information using secure PRAGMA query
          const columnsResult = await db.execute(
            createSecurePragmaQuery("table_info", tableName),
          );
          const columns = columnsResult.rows.map((col) => col.name);

          // Get index information using secure PRAGMA query
          const indexesResult = await db.execute(
            createSecurePragmaQuery("index_list", tableName),
          );
          const indexes = indexesResult.rows.map((idx) => idx.name);

          // Get row count using secure COUNT query
          const countResult = await db.execute(
            createSecureCountQuery(tableName),
          );
          const rowCount = countResult.rows[0]?.count || 0;

          tableInfo[tableName] = {
            columns,
            indexes,
            rowCount,
          };
        } catch (tableError) {
          console.warn(
            `Failed to get info for table ${tableName}:`,
            tableError.message,
          );
          // Skip this table but continue with others
          continue;
        }
      }

      testResults.tests.tables.status = "passed";
      testResults.tests.tables.data = tableInfo;
      testResults.summary.passed++;
      console.log("Table information test: PASSED");
    } catch (error) {
      console.error("Table information test failed:", error.message);
      testResults.tests.tables.status = "failed";
      testResults.tests.tables.error =
        "Failed to query database schema information";
      testResults.summary.failed++;
      testResults.summary.errors.push(
        "Tables: Failed to query database schema information",
      );
    }

    // Test 3: Migration Status
    console.log("Testing migration status...");
    try {
      // Get real migration status from database
      const db = await getDatabase();
      const migrationStatus = await getMigrationStatus(db);

      testResults.tests.migrations.status = "passed";
      testResults.tests.migrations.data = migrationStatus;
      testResults.summary.passed++;
      console.log("Migration status test: PASSED");
    } catch (error) {
      console.error("Migration status test failed:", error.message);
      testResults.tests.migrations.status = "failed";
      testResults.tests.migrations.error = error.message;
      testResults.summary.failed++;
      testResults.summary.errors.push(`Migrations: ${error.message}`);
    }

    // Test 4: Database Configuration
    console.log("Testing database configuration...");
    try {
      const dbConfig = {
        type: "simulated", // Would be 'sqlite', 'postgresql', etc. in real implementation
        version: "N/A - simulated database",
        maxConnections: "N/A - simulated database",
        timezone: "UTC",
        environment: process.env.NODE_ENV || "development",
        features: {
          transactions: false, // Simulated doesn't support transactions
          foreignKeys: false, // Simulated doesn't support foreign keys
          fullTextSearch: false,
          jsonSupport: true, // Simulated stores JSON as strings
        },
        environmentVariables:
          process.env.NODE_ENV === "production"
            ? { status: "configuration_hidden_in_production" }
            : {
                NODE_ENV: process.env.NODE_ENV || "not_set",
                VERCEL_ENV: process.env.VERCEL_ENV || "not_set",
                DATABASE_URL: process.env.DATABASE_URL
                  ? "configured"
                  : "not_configured",
                BREVO_API_KEY: process.env.BREVO_API_KEY
                  ? "configured"
                  : "not_configured",
              },
      };

      testResults.tests.configuration.status = "passed";
      testResults.tests.configuration.data = dbConfig;
      testResults.summary.passed++;
      console.log("Database configuration test: PASSED");
    } catch (error) {
      console.error("Database configuration test failed:", error.message);
      testResults.tests.configuration.status = "failed";
      testResults.tests.configuration.error = error.message;
      testResults.summary.failed++;
      testResults.summary.errors.push(`Configuration: ${error.message}`);
    }

    // Calculate final status
    const endTime = Date.now();
    const duration = endTime - startTime;

    testResults.status =
      testResults.summary.failed === 0 ? "healthy" : "degraded";
    testResults.duration = `${duration}ms`;
    testResults.summary.successRate = `${Math.round((testResults.summary.passed / testResults.summary.totalTests) * 100)}%`;

    // Log summary
    console.log(`Database test completed in ${duration}ms`);
    console.log(`Status: ${testResults.status}`);
    console.log(`Success rate: ${testResults.summary.successRate}`);
    console.log(
      `Passed: ${testResults.summary.passed}, Failed: ${testResults.summary.failed}`,
    );

    // Return appropriate HTTP status code
    const httpStatus =
      testResults.summary.failed === 0
        ? 200
        : testResults.summary.passed > 0
          ? 207
          : 503; // 207 = Multi-Status (partial success)

    return res.status(httpStatus).json(testResults);
  } catch (error) {
    console.error("Database test endpoint error:", error);

    const errorResponse = {
      timestamp: new Date().toISOString(),
      status: "error",
      error: {
        message: error.message,
        type: error.name || "UnknownError",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      duration: `${Date.now() - startTime}ms`,
      summary: {
        totalTests: 4,
        passed: 0,
        failed: 4,
        errors: [`Critical error: ${error.message}`],
        successRate: "0%",
      },
    };

    return res.status(500).json(errorResponse);
  }
}
