#!/usr/bin/env node

/**
 * Adaptive Health Endpoint Validation Script
 *
 * Tests the /api/health/check endpoint with intelligent port detection
 * and retry logic for different server configurations.
 *
 * Features:
 * - Automatic port detection from environment variables
 * - Fallback port scanning for common ports
 * - Retry logic with exponential backoff
 * - Works with CI, local development, and ngrok environments
 */

import { exec } from "child_process";
import { promisify } from "util";
import { spawn } from "child_process";
import { platform } from "os";

const execAsync = promisify(exec);

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
    
    // If environment port is specified but not active, still prioritize it
    // The server might not be started yet, but this is the intended port
    const primaryEnvPort = envPorts[0];
    console.log(`   ⚠️ Environment port ${primaryEnvPort} not active yet, but will use it as intended port`);
    return primaryEnvPort;
  }

  // 2. Check common ports used by the application
  const commonPorts = [3000, 8000, 5000, 4000, 8080, 3001, 4173, 5173];
  console.log(`   Scanning common ports: ${commonPorts.join(', ')}`);
  
  for (const port of commonPorts) {
    const isActive = await isPortActive(port);
    if (isActive) {
      console.log(`   ✅ Port ${port} is active (from scan)`);
      return port;
    }
  }

  // 3. In CI environments, be more flexible
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.log("   ℹ️ Running in CI environment - will use default port 3000");
    return 3000;
  }

  console.log("   ⚠️ No active server found, using default port 3000");
  return 3000;
}

/**
 * Check if a specific port has an active HTTP server
 * Tries multiple health endpoints for maximum compatibility
 */
async function isPortActive(port) {
  const healthEndpoints = [
    '/api/health/check',
    '/api/health/simple', 
    '/api/health/ping',
    '/health',
    '/'
  ];
  
  for (const endpoint of healthEndpoints) {
    try {
      const result = await execAsync(
        `curl -s --connect-timeout 2 -o /dev/null -w "%{http_code}" http://localhost:${port}${endpoint}`, 
        { timeout: 3000 }
      );
      
      const statusCode = result.stdout.trim();
      // Valid HTTP status codes (2xx, 3xx, 4xx, 5xx) indicate server is active
      if (/^[2-5]\d\d$/.test(statusCode)) {
        return true;
      }
    } catch (error) {
      // Connection failed or timeout - try next endpoint
      continue;
    }
  }
  
  return false;
}

/**
 * Wait for server to be ready with exponential backoff
 * Adapts timeout based on environment
 */
async function waitForServerReady(baseUrl, maxAttempts = null) {
  // Set environment-specific defaults
  if (maxAttempts === null) {
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      maxAttempts = 15; // CI environments can be slower
    } else {
      maxAttempts = 10; // Local development
    }
  }

  console.log("⏳ Waiting for server to be ready...");
  console.log(`   Environment: ${process.env.CI ? 'CI' : 'local'}, max attempts: ${maxAttempts}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await execAsync(
        `curl -s --connect-timeout 3 -o /dev/null -w "%{http_code}" "${baseUrl}/api/health/check"`,
        { timeout: 6000 }
      );
      
      const statusCode = result.stdout.trim();
      if (/^2\d\d$/.test(statusCode)) { // Any 2xx status code is success
        console.log(`   ✅ Server ready after ${attempt} attempt(s) (status: ${statusCode})`);
        return true;
      }
      
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(`   ⏳ Attempt ${attempt}/${maxAttempts}: Server not ready (${statusCode}), waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`   ⏳ Attempt ${attempt}/${maxAttempts}: Connection failed (${error.message}), waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.log(`   ❌ Server not ready after ${maxAttempts} attempts`);
  return false;
}

async function testHealthEndpoint(baseUrl) {
  const healthUrl = `${baseUrl}/api/health/check`;

  console.log("🏥 Testing health endpoint...");
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

    console.log("✅ Health check successful!");
    console.log(`HTTP Status: ${httpCode}`);
    console.log(`Response Time: ${parseFloat(timeTotal) * 1000}ms`);
    console.log("");

    try {
      const healthData = JSON.parse(jsonResponse);
      console.log("📊 Health Status:");
      console.log(`  Overall Status: ${healthData.status}`);
      console.log(`  Health Score: ${healthData.health_score || "N/A"}`);
      console.log("");

      if (healthData.services) {
        console.log("🔧 Service Status:");
        Object.entries(healthData.services).forEach(([service, status]) => {
          const icon =
            status.status === "healthy"
              ? "✅"
              : status.status === "degraded"
                ? "⚠️"
                : "❌";
          console.log(
            `  ${icon} ${service}: ${status.status} (${status.response_time}ms)`,
          );
        });
        console.log("");
      }

      if (healthData.recommendations && healthData.recommendations.length > 0) {
        console.log("💡 Recommendations:");
        healthData.recommendations.forEach((rec) => {
          const icon =
            rec.severity === "critical"
              ? "🚨"
              : rec.severity === "warning"
                ? "⚠️"
                : "ℹ️";
          console.log(`  ${icon} ${rec.service}: ${rec.action}`);
        });
        console.log("");
      }

      return {
        success: httpCode === "200",
        status: healthData.status,
        responseTime: parseFloat(timeTotal) * 1000,
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
    console.error("❌ Health check failed!");
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

function printHelp() {
  console.log("🎪 A Lo Cubano Boulder Fest - Adaptive Health Endpoint Test");
  console.log("===========================================================");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/test-health-endpoint.js [options] [url]");
  console.log("");
  console.log("Options:");
  console.log("  --help, -h          Show this help message");
  console.log("  --port PORT         Test specific port (overrides detection)");
  console.log("  --attempts N        Maximum retry attempts (default: 10 local, 15 CI)");
  console.log("  --timeout MS        Request timeout in milliseconds (default: 5000)");
  console.log("");
  console.log("Examples:");
  console.log("  node scripts/test-health-endpoint.js");
  console.log("  node scripts/test-health-endpoint.js --port 3000");
  console.log("  node scripts/test-health-endpoint.js http://localhost:8000");
  console.log("  node scripts/test-health-endpoint.js --attempts 20");
  console.log("");
  console.log("Environment Variables:");
  console.log("  PORT              Primary port to check");
  console.log("  CI_PORT           CI-specific port");
  console.log("  SERVER_PORT       Server port override");
  console.log("  VERCEL_DEV_PORT   Vercel development port");
  console.log("");
}

async function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    port: null,
    maxAttempts: null,
    timeout: 5000,
    url: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--port' && i + 1 < args.length) {
      options.port = parseInt(args[i + 1]);
      i++; // Skip next argument
    } else if (arg === '--attempts' && i + 1 < args.length) {
      options.maxAttempts = parseInt(args[i + 1]);
      i++; // Skip next argument  
    } else if (arg === '--timeout' && i + 1 < args.length) {
      options.timeout = parseInt(args[i + 1]);
      i++; // Skip next argument
    } else if (arg.startsWith('http')) {
      options.url = arg;
    }
  }

  return options;
}

async function main() {
  const options = await parseArgs();
  
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log("🎪 A Lo Cubano Boulder Fest - Adaptive Health Endpoint Test");
  console.log("===========================================================");
  console.log("");

  let baseUrl;
  
  // Check if URL was provided as command line argument
  if (options.url) {
    baseUrl = options.url;
    console.log(`🎯 Using provided URL: ${baseUrl}`);
    console.log("");
  } else if (options.port) {
    baseUrl = `http://localhost:${options.port}`;
    console.log(`🎯 Using specified port: ${options.port}`);
    console.log("");
  } else {
    // Auto-detect server port and construct URL
    const port = await detectServerPort();
    baseUrl = `http://localhost:${port}`;
    console.log(`🎯 Detected server URL: ${baseUrl}`);
    console.log("");
    
    // Wait for server to be ready before testing
    const serverReady = await waitForServerReady(baseUrl, options.maxAttempts);
    if (!serverReady) {
      console.log("💥 Server not ready - health check failed!");
      console.log("");
      console.log("🔧 Troubleshooting tips:");
      console.log("   • Make sure the server is running with: npm start");
      console.log("   • Check if the server is using a different port");
      console.log("   • Try specifying the URL directly: --url http://localhost:PORT");
      console.log("   • Try specifying the port: --port PORT");
      console.log("   • Verify environment variables: PORT, CI_PORT, SERVER_PORT");
      console.log("   • Increase retry attempts: --attempts 20");
      process.exit(1);
    }
    console.log("");
  }

  const result = await testHealthEndpoint(baseUrl);

  if (result.success) {
    console.log("🎉 Health endpoint test passed!");
    console.log(`📊 Response time: ${result.responseTime}ms`);
    console.log(`📈 Health status: ${result.status}`);
    process.exit(0);
  } else {
    console.log("💥 Health endpoint test failed!");
    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
    }
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

export { testHealthEndpoint };
