#!/usr/bin/env node

/**
 * Database Health Endpoint Test Script
 *
 * Tests the /api/health/database endpoint with dynamic port detection
 * for CI/CD database health checks.
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Check if a port is active
 */
async function isPortActive(port) {
  try {
    const { stdout } = await execAsync(
      `curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}/api/health/database"`,
      { timeout: 3000 }
    );
    return stdout.trim() === "200";
  } catch {
    return false;
  }
}

/**
 * Detect active server port from various sources
 */
async function detectServerPort() {
  console.log("🔍 Detecting active server port...");
  
  // 1. Check environment variables first
  const envPorts = [
    process.env.PORT,
    process.env.CI_PORT,
    process.env.VERCEL_DEV_PORT,
    process.env.SERVER_PORT
  ].filter(Boolean).map(Number);

  if (envPorts.length > 0) {
    console.log(`   Found environment port(s): ${envPorts.join(', ')}`);
    // Test environment ports first
    for (const port of envPorts) {
      const isActive = await isPortActive(port);
      if (isActive) {
        console.log(`   ✅ Port ${port} is active (from environment)`);
        return port;
      }
    }
  }

  // 2. Check common ports used by the application
  const commonPorts = [3000, 8000, 5000, 4000, 8080, 3001, 4173, 5173];
  console.log(`   Scanning common ports: ${commonPorts.join(', ')}`);
  
  for (const port of commonPorts) {
    const isActive = await isPortActive(port);
    if (isActive) {
      console.log(`   ✅ Port ${port} is active`);
      return port;
    }
  }

  // 3. Fallback to environment or default port
  const fallbackPort = parseInt(process.env.DYNAMIC_PORT || process.env.PORT || process.env.CI_PORT || '3000', 10);
  
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.log(`   ℹ️ Running in CI environment - will use port ${fallbackPort}`);
    return fallbackPort;
  }

  console.log(`   ⚠️ No active server found, using fallback port ${fallbackPort}`);
  return fallbackPort;
}

async function testDatabaseHealth(baseUrl) {
  const healthUrl = `${baseUrl}/api/health/database`;

  console.log("🗃️ Testing database health endpoint...");
  console.log(`URL: ${healthUrl}`);
  console.log("");

  try {
    // Test with curl to simulate CI/CD environment
    const { stdout, stderr } = await execAsync(
      `curl -f -s -w "\\nHTTP_CODE:%{http_code}\\nTIME_TOTAL:%{time_total}" "${healthUrl}"`,
    );

    const lines = stdout.split("\n");
    const httpCode = lines
      .find((line) => line.startsWith("HTTP_CODE:"))
      ?.split(":")[1];
    const timeTotal = lines
      .find((line) => line.startsWith("TIME_TOTAL:"))
      ?.split(":")[1];

    // Parse JSON response (everything except the last two lines)
    const jsonResponse = lines.slice(0, -2).join("\n");

    console.log("✅ Database health check successful!");
    console.log(`HTTP Status: ${httpCode}`);
    console.log(`Response Time: ${parseFloat(timeTotal) * 1000}ms`);
    console.log("");

    try {
      const healthData = JSON.parse(jsonResponse);
      console.log("📊 Database Health Status:");
      console.log(`  Overall Status: ${healthData.status}`);
      console.log(`  Database Type: ${healthData.database?.type || 'N/A'}`);
      console.log(`  Connection Status: ${healthData.database?.status || 'N/A'}`);
      if (healthData.database?.response_time) {
        console.log(`  Database Response Time: ${healthData.database.response_time}ms`);
      }
      console.log("");

      if (healthData.issues && healthData.issues.length > 0) {
        console.log("⚠️ Issues Found:");
        healthData.issues.forEach((issue) => {
          console.log(`  - ${issue}`);
        });
        console.log("");
      }

      return {
        success: httpCode === "200",
        status: healthData.status,
        responseTime: parseFloat(timeTotal) * 1000,
        databaseStatus: healthData.database?.status
      };
    } catch (parseError) {
      console.log("⚠️ Could not parse JSON response, but endpoint responded");
      console.log("Raw response:", jsonResponse);
      return {
        success: httpCode === "200",
        status: "unknown",
        responseTime: parseFloat(timeTotal) * 1000,
      };
    }
  } catch (error) {
    console.error("❌ Database health check failed!");
    console.error(`Error: ${error.message}`);

    // Try to get more details
    try {
      const { stdout: debugOutput } = await execAsync(
        `curl -v "${healthUrl}" 2>&1 || true`,
      );
      console.log("");
      console.log("🔍 Debug output:");
      console.log(debugOutput);
    } catch (debugError) {
      console.error("Could not get debug info:", debugError.message);
    }

    return {
      success: false,
      status: "error",
      error: error.message,
    };
  }
}

async function main() {
  // Dynamic port detection: command line arg > environment variables > auto-detect
  let baseUrl = process.argv[2];
  
  if (!baseUrl) {
    // First check environment variables
    const envPort = process.env.DYNAMIC_PORT || process.env.PORT || process.env.CI_PORT;
    
    if (envPort) {
      baseUrl = `http://localhost:${envPort}`;
      console.log(`🔧 Using environment port: ${envPort}`);
    } else {
      // Fall back to port detection
      const port = await detectServerPort();
      baseUrl = `http://localhost:${port}`;
      console.log(`🎯 Detected server URL: ${baseUrl}`);
    }
  }

  console.log("🎪 A Lo Cubano Boulder Fest - Database Health Test");
  console.log("=================================================");
  console.log("");

  const result = await testDatabaseHealth(baseUrl);

  if (result.success) {
    console.log("🎉 Database health test passed!");
    process.exit(0);
  } else {
    console.log("💥 Database health test failed!");
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
}

export { testDatabaseHealth };