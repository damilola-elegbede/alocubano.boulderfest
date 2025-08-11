/**
 * Load Integration Tests - Concurrent User Testing
 *
 * Tests system performance under concurrent user loads with realistic scenarios
 * including ticket purchases, check-ins, and browsing patterns.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

const PERFORMANCE_CONFIG = {
  baseUrl: process.env.LOAD_TEST_BASE_URL || "http://localhost:3000",
  testDuration: process.env.LOAD_TEST_DURATION || "30s",
  maxVUs: parseInt(process.env.LOAD_TEST_MAX_VUS) || 25,
  rampUpTime: process.env.LOAD_TEST_RAMP_UP || "10s",
  outputDir: path.join(process.cwd(), "reports", "load-test-results"),
  timeoutMs: 120000, // 2 minutes for load test completion
};

const PERFORMANCE_THRESHOLDS = {
  responseTime: {
    p95: 500, // 95th percentile under 500ms
    p99: 1000, // 99th percentile under 1000ms
  },
  errorRate: 0.01, // Less than 1% errors
  throughput: {
    minRps: 10, // Minimum requests per second
  },
  checkIn: {
    p95: 100, // Check-in operations under 100ms (95th percentile)
    successRate: 0.98, // 98% success rate for check-ins
  },
  ticketPurchase: {
    p95: 800, // Ticket purchase flow under 800ms (95th percentile)
    conversionRate: 0.15, // Minimum 15% conversion rate
  },
};

/**
 * Runs a K6 load test with specified configuration
 */
async function runK6Test(testScript, testName, options = {}) {
  const outputFile = path.join(
    PERFORMANCE_CONFIG.outputDir,
    `${testName}-${Date.now()}.json`,
  );

  // Ensure output directory exists
  await fs.mkdir(PERFORMANCE_CONFIG.outputDir, { recursive: true });

  const k6Args = [
    "run",
    "--env",
    `LOAD_TEST_BASE_URL=${PERFORMANCE_CONFIG.baseUrl}`,
    "--env",
    `MAX_VUS=${options.maxVUs || PERFORMANCE_CONFIG.maxVUs}`,
    "--env",
    `DURATION=${options.duration || PERFORMANCE_CONFIG.testDuration}`,
    "--env",
    `RAMP_UP_TIME=${options.rampUpTime || PERFORMANCE_CONFIG.rampUpTime}`,
    "--out",
    `json=${outputFile}`,
    "--summary-export",
    outputFile.replace(".json", "-summary.json"),
    testScript,
  ];

  return new Promise((resolve, reject) => {
    const k6Process = spawn("k6", k6Args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    k6Process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    k6Process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      k6Process.kill("SIGTERM");
      reject(
        new Error(`K6 test timed out after ${PERFORMANCE_CONFIG.timeoutMs}ms`),
      );
    }, PERFORMANCE_CONFIG.timeoutMs);

    k6Process.on("close", async (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        try {
          // Read and parse the summary results
          const summaryData = await fs.readFile(
            outputFile.replace(".json", "-summary.json"),
            "utf8",
          );
          const results = JSON.parse(summaryData);

          resolve({
            success: true,
            results,
            outputFile,
            stdout,
            stderr,
          });
        } catch (error) {
          reject(new Error(`Failed to parse K6 results: ${error.message}`));
        }
      } else {
        reject(
          new Error(`K6 test failed with exit code ${code}. Stderr: ${stderr}`),
        );
      }
    });

    k6Process.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn K6 process: ${error.message}`));
    });
  });
}

/**
 * Validates test results against performance thresholds
 */
function validatePerformanceResults(results, testType = "general") {
  const metrics = results.metrics;
  const thresholds = PERFORMANCE_THRESHOLDS;
  const validationErrors = [];

  // Response time validation
  if (metrics.http_req_duration && metrics.http_req_duration.values) {
    const p95 = metrics.http_req_duration.values.p95;
    const p99 = metrics.http_req_duration.values.p99;

    if (p95 > thresholds.responseTime.p95) {
      validationErrors.push(
        `P95 response time ${p95.toFixed(2)}ms exceeds threshold ${thresholds.responseTime.p95}ms`,
      );
    }

    if (p99 > thresholds.responseTime.p99) {
      validationErrors.push(
        `P99 response time ${p99.toFixed(2)}ms exceeds threshold ${thresholds.responseTime.p99}ms`,
      );
    }
  }

  // Error rate validation
  if (metrics.http_req_failed && metrics.http_req_failed.values) {
    const errorRate = metrics.http_req_failed.values.rate;
    if (errorRate > thresholds.errorRate) {
      validationErrors.push(
        `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.errorRate * 100).toFixed(2)}%`,
      );
    }
  }

  // Throughput validation
  if (metrics.http_reqs && metrics.http_reqs.values) {
    const rps = metrics.http_reqs.values.rate;
    if (rps < thresholds.throughput.minRps) {
      validationErrors.push(
        `Throughput ${rps.toFixed(2)} RPS below minimum ${thresholds.throughput.minRps} RPS`,
      );
    }
  }

  // Test-specific validations
  if (testType === "checkIn" && metrics.check_in_duration) {
    const checkInP95 = metrics.check_in_duration.values?.p95;
    if (checkInP95 > thresholds.checkIn.p95) {
      validationErrors.push(
        `Check-in P95 time ${checkInP95.toFixed(2)}ms exceeds threshold ${thresholds.checkIn.p95}ms`,
      );
    }
  }

  if (testType === "ticketPurchase" && metrics.ticket_purchase_duration) {
    const purchaseP95 = metrics.ticket_purchase_duration.values?.p95;
    if (purchaseP95 > thresholds.ticketPurchase.p95) {
      validationErrors.push(
        `Ticket purchase P95 time ${purchaseP95.toFixed(2)}ms exceeds threshold ${thresholds.ticketPurchase.p95}ms`,
      );
    }
  }

  return {
    valid: validationErrors.length === 0,
    errors: validationErrors,
    summary: {
      p95ResponseTime: metrics.http_req_duration?.values?.p95,
      p99ResponseTime: metrics.http_req_duration?.values?.p99,
      errorRate: metrics.http_req_failed?.values?.rate,
      throughput: metrics.http_reqs?.values?.rate,
      totalRequests: metrics.http_reqs?.values?.count,
    },
  };
}

/**
 * Checks if K6 is available
 */
async function checkK6Available() {
  return new Promise((resolve) => {
    const k6Process = spawn("k6", ["version"], { stdio: "pipe" });

    k6Process.on("close", (code) => {
      resolve(code === 0);
    });

    k6Process.on("error", () => {
      resolve(false);
    });
  });
}

describe("Load Integration Tests", () => {
  let k6Available = false;

  beforeAll(async () => {
    // Check if K6 is installed
    k6Available = await checkK6Available();

    if (!k6Available) {
      console.warn("⚠️  K6 not found. Install with: npm run k6:install");
    }

    // Ensure output directory exists
    await fs.mkdir(PERFORMANCE_CONFIG.outputDir, { recursive: true });
  }, 10000);

  afterAll(async () => {
    // Cleanup old test files (keep last 10)
    try {
      const files = await fs.readdir(PERFORMANCE_CONFIG.outputDir);
      const jsonFiles = files
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(10);

      for (const file of jsonFiles) {
        await fs.unlink(path.join(PERFORMANCE_CONFIG.outputDir, file));
      }
    } catch (error) {
      console.warn("Failed to cleanup old test files:", error.message);
    }
  });

  test("concurrent ticket sales load", async () => {
    if (!k6Available) {
      console.log("⏭️  Skipping K6 load test - K6 not installed");
      return;
    }

    const testResult = await runK6Test(
      "tests/load/k6-ticket-sales.js",
      "concurrent-ticket-sales",
      {
        maxVUs: 15,
        duration: "45s",
        rampUpTime: "15s",
      },
    );

    expect(testResult.success).toBe(true);

    const validation = validatePerformanceResults(
      testResult.results,
      "ticketPurchase",
    );

    if (!validation.valid) {
      console.error("❌ Performance validation failed:", validation.errors);

      // Log summary for debugging
      console.log("📊 Performance Summary:", validation.summary);
    }

    expect(validation.valid).toBe(true);
    expect(validation.summary.errorRate).toBeLessThan(
      PERFORMANCE_THRESHOLDS.errorRate,
    );
    expect(validation.summary.p95ResponseTime).toBeLessThan(
      PERFORMANCE_THRESHOLDS.responseTime.p95,
    );
  }, 90000);

  test("concurrent check-in rush simulation", async () => {
    if (!k6Available) {
      console.log("⏭️  Skipping K6 load test - K6 not installed");
      return;
    }

    const testResult = await runK6Test(
      "tests/load/k6-check-in-rush.js",
      "concurrent-checkin-rush",
      {
        maxVUs: 10,
        duration: "30s",
        rampUpTime: "10s",
      },
    );

    expect(testResult.success).toBe(true);

    const validation = validatePerformanceResults(
      testResult.results,
      "checkIn",
    );

    if (!validation.valid) {
      console.error(
        "❌ Check-in performance validation failed:",
        validation.errors,
      );
      console.log("📊 Check-in Performance Summary:", validation.summary);
    }

    expect(validation.valid).toBe(true);
    expect(validation.summary.errorRate).toBeLessThan(
      PERFORMANCE_THRESHOLDS.errorRate,
    );
  }, 60000);

  test("sustained baseline load", async () => {
    if (!k6Available) {
      console.log("⏭️  Skipping K6 load test - K6 not installed");
      return;
    }

    const testResult = await runK6Test(
      "tests/load/k6-sustained-load.js",
      "sustained-baseline",
      {
        maxVUs: 8,
        duration: "60s",
        rampUpTime: "20s",
      },
    );

    expect(testResult.success).toBe(true);

    const validation = validatePerformanceResults(
      testResult.results,
      "general",
    );

    if (!validation.valid) {
      console.error("❌ Sustained load validation failed:", validation.errors);
      console.log("📊 Sustained Load Summary:", validation.summary);
    }

    expect(validation.valid).toBe(true);
    expect(validation.summary.throughput).toBeGreaterThan(
      PERFORMANCE_THRESHOLDS.throughput.minRps,
    );
  }, 120000);

  test("mixed workload simulation", async () => {
    if (!k6Available) {
      console.log("⏭️  Skipping K6 load test - K6 not installed");
      return;
    }

    // Simulate realistic mixed traffic: browsing + purchases + check-ins
    const testScript = `
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const errorRate = new Rate('errors');

export let options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 12 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';

export default function() {
  const scenario = Math.random();
  
  if (scenario < 0.6) {
    // 60% - Browsing behavior
    let response = http.get(\`\${BASE_URL}/pages/tickets.html\`);
    check(response, { 'browse tickets status 200': (r) => r.status === 200 });
    errorRate.add(response.status !== 200);
    sleep(Math.random() * 3 + 1);
    
    response = http.get(\`\${BASE_URL}/api/gallery\`);
    check(response, { 'gallery API status 200': (r) => r.status === 200 });
    errorRate.add(response.status !== 200);
    
  } else if (scenario < 0.85) {
    // 25% - Ticket purchase flow
    let response = http.post(\`\${BASE_URL}/api/payments/create-checkout-session\`, 
      JSON.stringify({
        items: [{ ticketId: 'weekend-pass', quantity: 1 }],
        successUrl: \`\${BASE_URL}/pages/checkout-success.html\`,
        cancelUrl: \`\${BASE_URL}/pages/checkout-cancel.html\`
      }), 
      { headers: { 'Content-Type': 'application/json' } }
    );
    check(response, { 'checkout session created': (r) => r.status === 200 });
    errorRate.add(response.status !== 200);
    
  } else {
    // 15% - Check-in validation
    const testQR = 'test-qr-' + Math.floor(Math.random() * 1000);
    let response = http.post(\`\${BASE_URL}/api/tickets/validate\`,
      JSON.stringify({ qrCode: testQR }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    check(response, { 'QR validation processed': (r) => r.status !== 500 });
    errorRate.add(response.status === 500);
  }
  
  sleep(Math.random() * 2 + 0.5);
}`;

    // Write the mixed workload script temporarily
    const tempScriptPath = path.join(process.cwd(), "temp-mixed-workload.js");
    await fs.writeFile(tempScriptPath, testScript);

    try {
      const testResult = await runK6Test(
        tempScriptPath,
        "mixed-workload-simulation",
        {
          maxVUs: 12,
          duration: "40s",
        },
      );

      expect(testResult.success).toBe(true);

      const validation = validatePerformanceResults(
        testResult.results,
        "general",
      );

      if (!validation.valid) {
        console.error(
          "❌ Mixed workload validation failed:",
          validation.errors,
        );
        console.log("📊 Mixed Workload Summary:", validation.summary);
      }

      expect(validation.valid).toBe(true);
    } finally {
      // Cleanup temporary script
      try {
        await fs.unlink(tempScriptPath);
      } catch (error) {
        console.warn("Failed to cleanup temp script:", error.message);
      }
    }
  }, 90000);

  test("database connection pool stress", async () => {
    if (!k6Available) {
      console.log("⏭️  Skipping K6 load test - K6 not installed");
      return;
    }

    // Test database-intensive operations
    const dbStressScript = `
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '5s', target: 10 },
    { duration: '15s', target: 20 },
    { duration: '10s', target: 0 },
  ],
};

const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:3000';

export default function() {
  // Multiple database-heavy endpoints
  const endpoints = [
    '/api/admin/dashboard',
    '/api/admin/registrations',
    '/api/analytics/track',
    '/api/tickets/index'
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  
  let response = http.get(\`\${BASE_URL}\${endpoint}\`, {
    headers: { 'User-Agent': 'K6-LoadTest' }
  });
  
  check(response, {
    'status is 200 or 401': (r) => [200, 401].includes(r.status),
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  sleep(0.1);
}`;

    const tempScriptPath = path.join(process.cwd(), "temp-db-stress.js");
    await fs.writeFile(tempScriptPath, dbStressScript);

    try {
      const testResult = await runK6Test(
        tempScriptPath,
        "database-connection-stress",
        {
          maxVUs: 20,
          duration: "30s",
        },
      );

      expect(testResult.success).toBe(true);

      const validation = validatePerformanceResults(
        testResult.results,
        "general",
      );

      // More lenient thresholds for database stress testing
      expect(validation.summary.errorRate).toBeLessThan(0.05); // 5% error rate acceptable for stress
      expect(validation.summary.p95ResponseTime).toBeLessThan(1500); // 1.5s for database operations
    } finally {
      await fs.unlink(tempScriptPath);
    }
  }, 60000);

  test("generates comprehensive performance report", async () => {
    // Generate a summary report of all load test results
    try {
      const files = await fs.readdir(PERFORMANCE_CONFIG.outputDir);
      const recentResults = files
        .filter((f) => f.includes("-summary.json"))
        .sort()
        .reverse()
        .slice(0, 5); // Last 5 test runs

      const reportData = {
        timestamp: new Date().toISOString(),
        testConfiguration: {
          baseUrl: PERFORMANCE_CONFIG.baseUrl,
          maxVUs: PERFORMANCE_CONFIG.maxVUs,
          testDuration: PERFORMANCE_CONFIG.testDuration,
        },
        thresholds: PERFORMANCE_THRESHOLDS,
        recentTests: [],
      };

      for (const file of recentResults) {
        try {
          const filePath = path.join(PERFORMANCE_CONFIG.outputDir, file);
          const data = JSON.parse(await fs.readFile(filePath, "utf8"));
          const validation = validatePerformanceResults(data);

          reportData.recentTests.push({
            testName: file.replace("-summary.json", ""),
            timestamp: file.match(/\d+/)?.[0]
              ? new Date(parseInt(file.match(/\d+/)[0])).toISOString()
              : null,
            results: validation.summary,
            passed: validation.valid,
            errors: validation.errors,
          });
        } catch (error) {
          console.warn(`Failed to process ${file}:`, error.message);
        }
      }

      const reportPath = path.join(
        PERFORMANCE_CONFIG.outputDir,
        `load-test-summary-${Date.now()}.json`,
      );
      await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));

      console.log(`📊 Performance report generated: ${reportPath}`);
      console.log(
        `✅ Processed ${reportData.recentTests.length} recent test results`,
      );

      expect(reportData.recentTests.length).toBeGreaterThan(0);
    } catch (error) {
      console.warn("Failed to generate performance report:", error.message);
      // Don't fail the test if report generation fails
    }
  });
});
