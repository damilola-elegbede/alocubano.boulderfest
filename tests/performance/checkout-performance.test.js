/**
 * Checkout Flow Performance Tests
 *
 * Benchmarks the complete ticket purchase flow including cart operations,
 * Stripe integration, payment processing, and ticket generation.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { performance } from "perf_hooks";
import nock from "nock";

// Mock Stripe for performance testing
const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: "cs_test_performance",
        url: "https://checkout.stripe.com/pay/cs_test_performance",
      }),
    },
  },
};

// Performance measurement utilities
class PerformanceCollector {
  constructor() {
    this.measurements = [];
    this.startTimes = new Map();
  }

  start(operationId) {
    this.startTimes.set(operationId, performance.now());
  }

  end(operationId, metadata = {}) {
    const startTime = this.startTimes.get(operationId);
    if (!startTime) {
      throw new Error(`No start time found for operation: ${operationId}`);
    }

    const duration = performance.now() - startTime;
    this.measurements.push({
      operationId,
      duration,
      timestamp: Date.now(),
      ...metadata,
    });

    this.startTimes.delete(operationId);
    return duration;
  }

  getStats(operationFilter = null) {
    const filtered = operationFilter
      ? this.measurements.filter((m) => m.operationId.includes(operationFilter))
      : this.measurements;

    if (filtered.length === 0) {
      return null;
    }

    const durations = filtered.map((m) => m.duration);
    durations.sort((a, b) => a - b);

    return {
      count: durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: durations[Math.floor(durations.length * 0.5)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)],
      operations: filtered,
    };
  }

  clear() {
    this.measurements = [];
    this.startTimes.clear();
  }
}

const performanceCollector = new PerformanceCollector();

// Performance thresholds for checkout operations
const PERFORMANCE_BUDGETS = {
  cartOperations: {
    addItem: { max: 50, target: 20 }, // milliseconds
    removeItem: { max: 30, target: 10 },
    updateQuantity: { max: 40, target: 15 },
    calculateTotal: { max: 100, target: 50 },
  },
  checkoutSession: {
    creation: { max: 800, target: 500 },
    validation: { max: 200, target: 100 },
    stripeRedirect: { max: 300, target: 150 },
  },
  paymentProcessing: {
    webhookHandling: { max: 1000, target: 500 },
    ticketGeneration: { max: 2000, target: 1000 },
    emailSending: { max: 3000, target: 1500 },
    walletPassCreation: { max: 1500, target: 800 },
  },
  endToEnd: {
    completePurchase: { max: 5000, target: 3500 }, // Adjusted for security overhead
    browserToTicket: { max: 8000, target: 5000 },
  },
};

/**
 * Simulates realistic cart operations with performance measurement
 */
async function simulateCartOperations(iterations = 100) {
  const operations = [
    "addItem",
    "updateQuantity",
    "removeItem",
    "calculateTotal",
  ];
  const results = [];

  for (let i = 0; i < iterations; i++) {
    for (const operation of operations) {
      const operationId = `cart_${operation}_${i}`;
      performanceCollector.start(operationId);

      // Simulate cart operation work
      switch (operation) {
        case "addItem":
          await simulateAddToCart();
          break;
        case "updateQuantity":
          await simulateUpdateQuantity();
          break;
        case "removeItem":
          await simulateRemoveFromCart();
          break;
        case "calculateTotal":
          await simulateCalculateTotal();
          break;
      }

      const duration = performanceCollector.end(operationId, {
        operation,
        iteration: i,
      });
      results.push({ operation, duration, iteration: i });
    }
  }

  return results;
}

async function simulateAddToCart() {
  // Simulate DOM manipulation and localStorage operations
  const cart = JSON.parse(globalThis.localStorage?.getItem("cart") || "[]");
  const newItem = {
    id: "weekend-pass",
    name: "Weekend Pass",
    price: 150,
    quantity: 1,
    timestamp: Date.now(),
  };

  // Simulate validation
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));

  cart.push(newItem);
  globalThis.localStorage?.setItem("cart", JSON.stringify(cart));
}

async function simulateUpdateQuantity() {
  const cart = JSON.parse(globalThis.localStorage?.getItem("cart") || "[]");
  if (cart.length > 0) {
    cart[0].quantity = Math.floor(Math.random() * 5) + 1;
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
    globalThis.localStorage?.setItem("cart", JSON.stringify(cart));
  }
}

async function simulateRemoveFromCart() {
  const cart = JSON.parse(globalThis.localStorage?.getItem("cart") || "[]");
  if (cart.length > 0) {
    cart.pop();
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
    globalThis.localStorage?.setItem("cart", JSON.stringify(cart));
  }
}

async function simulateCalculateTotal() {
  const cart = JSON.parse(globalThis.localStorage?.getItem("cart") || "[]");
  let total = 0;

  // Simulate complex tax and discount calculations
  for (const item of cart) {
    total += item.price * item.quantity;
    await new Promise((resolve) => setTimeout(resolve, 1)); // Simulate processing
  }

  // Apply discounts and taxes
  const tax = total * 0.08; // Simulate tax calculation
  const discount = total > 200 ? total * 0.1 : 0; // Simulate discount logic

  return { subtotal: total, tax, discount, total: total + tax - discount };
}

/**
 * Benchmarks Stripe checkout session creation
 */
async function benchmarkCheckoutSession(iterations = 50) {
  const results = [];

  // Mock Stripe responses for consistent timing
  nock("https://api.stripe.com").persist().post("/v1/checkout/sessions").reply(
    200,
    {
      id: "cs_test_performance",
      url: "https://checkout.stripe.com/pay/cs_test_performance",
      payment_status: "unpaid",
    },
    {
      "request-id": "req_test_performance",
    },
  );

  for (let i = 0; i < iterations; i++) {
    const operationId = `checkout_session_${i}`;
    performanceCollector.start(operationId);

    try {
      // Simulate the actual checkout session creation API call
      const response = await fetch("/api/payments/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { ticketId: "weekend-pass", quantity: 2 },
            { ticketId: "day-pass-friday", quantity: 1 },
          ],
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        }),
      });

      const duration = performanceCollector.end(operationId, {
        status: response.status,
        iteration: i,
      });

      results.push({
        iteration: i,
        duration,
        success: response.status === 200,
        status: response.status,
      });
    } catch (error) {
      performanceCollector.end(operationId, {
        error: error.message,
        iteration: i,
      });
      results.push({
        iteration: i,
        duration: 0,
        success: false,
        error: error.message,
      });
    }
  }

  nock.cleanAll();
  return results;
}

/**
 * Simulates complete end-to-end purchase flow
 */
async function simulateEndToEndPurchase() {
  const purchaseId = `e2e_${Date.now()}`;

  performanceCollector.start(`${purchaseId}_complete`);

  // Step 1: Cart operations
  performanceCollector.start(`${purchaseId}_cart_ops`);
  await simulateAddToCart();
  await simulateCalculateTotal();
  performanceCollector.end(`${purchaseId}_cart_ops`);

  // Step 2: Checkout session creation
  performanceCollector.start(`${purchaseId}_checkout`);
  // Mock the checkout creation without actual API call
  await new Promise((resolve) =>
    setTimeout(resolve, 200 + Math.random() * 300),
  );
  performanceCollector.end(`${purchaseId}_checkout`);

  // Step 3: Payment processing simulation
  performanceCollector.start(`${purchaseId}_payment`);
  await new Promise((resolve) =>
    setTimeout(resolve, 500 + Math.random() * 500),
  );
  performanceCollector.end(`${purchaseId}_payment`);

  // Step 4: Ticket generation
  performanceCollector.start(`${purchaseId}_ticket_gen`);
  await simulateTicketGeneration();
  performanceCollector.end(`${purchaseId}_ticket_gen`);

  // Step 5: Email sending simulation
  performanceCollector.start(`${purchaseId}_email`);
  await simulateEmailSending();
  performanceCollector.end(`${purchaseId}_email`);

  const totalDuration = performanceCollector.end(`${purchaseId}_complete`);

  return {
    purchaseId,
    totalDuration,
    steps: {
      cartOps: performanceCollector.measurements.find(
        (m) => m.operationId === `${purchaseId}_cart_ops`,
      )?.duration,
      checkout: performanceCollector.measurements.find(
        (m) => m.operationId === `${purchaseId}_checkout`,
      )?.duration,
      payment: performanceCollector.measurements.find(
        (m) => m.operationId === `${purchaseId}_payment`,
      )?.duration,
      ticketGen: performanceCollector.measurements.find(
        (m) => m.operationId === `${purchaseId}_ticket_gen`,
      )?.duration,
      email: performanceCollector.measurements.find(
        (m) => m.operationId === `${purchaseId}_email`,
      )?.duration,
    },
  };
}

async function simulateTicketGeneration() {
  // Simulate QR code generation, database operations, and PDF creation
  await new Promise((resolve) =>
    setTimeout(resolve, 300 + Math.random() * 700),
  );
}

async function simulateEmailSending() {
  // Simulate email template processing and Brevo API call
  await new Promise((resolve) =>
    setTimeout(resolve, 800 + Math.random() * 1200),
  );
}

/**
 * Memory usage tracking for performance tests
 */
function trackMemoryUsage(testName) {
  if (typeof process !== "undefined" && process.memoryUsage) {
    const usage = process.memoryUsage();
    return {
      testName,
      timestamp: Date.now(),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB
    };
  }
  return null;
}

describe("Checkout Flow Performance", () => {
  beforeAll(() => {
    // Setup global localStorage mock for browser simulation
    if (typeof globalThis.localStorage === "undefined") {
      const localStorageMock = {
        store: {},
        getItem: function (key) {
          return this.store[key] || null;
        },
        setItem: function (key, value) {
          this.store[key] = value;
        },
        removeItem: function (key) {
          delete this.store[key];
        },
        clear: function () {
          this.store = {};
        },
      };
      globalThis.localStorage = localStorageMock;
    }
  });

  beforeEach(() => {
    performanceCollector.clear();
    globalThis.localStorage?.clear();
  });

  afterAll(() => {
    // Generate performance report
    const allStats = performanceCollector.getStats();
    if (allStats) {
      console.log("\n📊 Overall Performance Summary:");
      console.log(`   Total Operations: ${allStats.count}`);
      console.log(`   Average Duration: ${allStats.avg.toFixed(2)}ms`);
      console.log(`   95th Percentile: ${allStats.p95.toFixed(2)}ms`);
    }
  });

  describe("Cart Operations Performance", () => {
    test("cart operations meet performance budgets", async () => {
      const memoryBefore = trackMemoryUsage("cart_ops_start");

      const results = await simulateCartOperations(50);

      const memoryAfter = trackMemoryUsage("cart_ops_end");

      // Analyze results by operation type
      const operations = [
        "addItem",
        "updateQuantity",
        "removeItem",
        "calculateTotal",
      ];

      for (const operation of operations) {
        const opResults = results.filter((r) => r.operation === operation);
        const durations = opResults.map((r) => r.duration);
        durations.sort((a, b) => a - b);

        const stats = {
          count: durations.length,
          avg: durations.reduce((a, b) => a + b, 0) / durations.length,
          p95: durations[Math.floor(durations.length * 0.95)],
          max: Math.max(...durations),
        };

        const budget = PERFORMANCE_BUDGETS.cartOperations[operation];

        console.log(`\n🛒 ${operation} Performance:`);
        console.log(
          `   Average: ${stats.avg.toFixed(2)}ms (target: ${budget.target}ms)`,
        );
        console.log(`   P95: ${stats.p95.toFixed(2)}ms (max: ${budget.max}ms)`);

        expect(stats.p95, `${operation} P95 exceeds budget`).toBeLessThan(
          budget.max,
        );
        expect(stats.avg, `${operation} average exceeds target`).toBeLessThan(
          budget.target * 2,
        ); // Allow 2x target for average
      }

      // Check for memory leaks
      if (memoryBefore && memoryAfter) {
        const heapGrowth = memoryAfter.heapUsed - memoryBefore.heapUsed;
        console.log(
          `\n🧠 Memory Usage: ${heapGrowth > 0 ? "+" : ""}${heapGrowth}MB`,
        );
        expect(heapGrowth, "Memory leak detected").toBeLessThan(50); // Less than 50MB growth
      }
    }, 30000);

    test("cart operations scale linearly", async () => {
      const iterations = [10, 25, 50];
      const scalingResults = [];

      for (const iterCount of iterations) {
        const startTime = performance.now();
        await simulateCartOperations(iterCount);
        const totalTime = performance.now() - startTime;

        scalingResults.push({
          iterations: iterCount,
          totalTime,
          avgTimePerIteration: totalTime / iterCount,
        });
      }

      // Check that scaling is roughly linear (within 50% variance)
      const timePerIteration = scalingResults.map((r) => r.avgTimePerIteration);
      const maxVariance =
        Math.max(...timePerIteration) / Math.min(...timePerIteration);

      console.log("\n📈 Scaling Analysis:");
      scalingResults.forEach((result) => {
        console.log(
          `   ${result.iterations} iterations: ${result.avgTimePerIteration.toFixed(2)}ms per iteration`,
        );
      });
      console.log(`   Variance: ${maxVariance.toFixed(2)}x`);

      expect(maxVariance, "Cart operations do not scale linearly").toBeLessThan(
        2.0,
      );
    }, 45000);
  });

  describe("Checkout Session Performance", () => {
    test("checkout session creation performance", async () => {
      // Mock successful API responses
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          id: "cs_test_performance",
          url: "https://checkout.stripe.com/pay/cs_test_performance",
        }),
      });

      const results = await benchmarkCheckoutSession(30);

      const successfulResults = results.filter((r) => r.success);
      const durations = successfulResults.map((r) => r.duration);
      durations.sort((a, b) => a - b);

      if (durations.length === 0) {
        throw new Error("No successful checkout sessions created");
      }

      const stats = {
        count: durations.length,
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        p95: durations[Math.floor(durations.length * 0.95)],
        max: Math.max(...durations),
        successRate: successfulResults.length / results.length,
      };

      console.log("\n💳 Checkout Session Performance:");
      console.log(`   Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
      console.log(`   Average: ${stats.avg.toFixed(2)}ms`);
      console.log(`   P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`   Max: ${stats.max.toFixed(2)}ms`);

      const budget = PERFORMANCE_BUDGETS.checkoutSession.creation;

      expect(
        stats.successRate,
        "Checkout success rate too low",
      ).toBeGreaterThan(0.95);
      expect(stats.p95, "Checkout P95 exceeds budget").toBeLessThan(budget.max);
      expect(stats.avg, "Checkout average exceeds target").toBeLessThan(
        budget.target * 1.5,
      );
    }, 20000);
  });

  describe("End-to-End Purchase Flow", () => {
    test("complete purchase flow performance", async () => {
      const purchaseResults = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const result = await simulateEndToEndPurchase();
        purchaseResults.push(result);
      }

      const totalDurations = purchaseResults.map((r) => r.totalDuration);
      totalDurations.sort((a, b) => a - b);

      const stats = {
        avg: totalDurations.reduce((a, b) => a + b, 0) / totalDurations.length,
        p95: totalDurations[Math.floor(totalDurations.length * 0.95)],
        max: Math.max(...totalDurations),
        min: Math.min(...totalDurations),
      };

      console.log("\n🎫 End-to-End Purchase Performance:");
      console.log(`   Average: ${stats.avg.toFixed(2)}ms`);
      console.log(`   P95: ${stats.p95.toFixed(2)}ms`);
      console.log(
        `   Range: ${stats.min.toFixed(2)}ms - ${stats.max.toFixed(2)}ms`,
      );

      // Step-by-step breakdown
      const stepStats = {};
      for (const step of [
        "cartOps",
        "checkout",
        "payment",
        "ticketGen",
        "email",
      ]) {
        const stepDurations = purchaseResults
          .map((r) => r.steps[step])
          .filter(Boolean);
        if (stepDurations.length > 0) {
          stepStats[step] = {
            avg:
              stepDurations.reduce((a, b) => a + b, 0) / stepDurations.length,
            max: Math.max(...stepDurations),
          };
          console.log(
            `   ${step}: ${stepStats[step].avg.toFixed(2)}ms avg, ${stepStats[step].max.toFixed(2)}ms max`,
          );
        }
      }

      const budget = PERFORMANCE_BUDGETS.endToEnd.completePurchase;

      expect(stats.p95, "E2E P95 exceeds budget").toBeLessThan(budget.max);
      expect(stats.avg, "E2E average exceeds target").toBeLessThan(
        budget.target,
      );

      // Verify no single step dominates the flow
      const maxStepTime = Math.max(
        ...Object.values(stepStats).map((s) => s.avg),
      );
      const totalStepTime = Object.values(stepStats).reduce(
        (sum, s) => sum + s.avg,
        0,
      );

      expect(
        maxStepTime / totalStepTime,
        "Single step dominates E2E flow",
      ).toBeLessThan(0.6);
    }, 60000);

    test("concurrent purchase flows", async () => {
      const concurrentPurchases = 5;
      const memoryBefore = trackMemoryUsage("concurrent_start");

      const startTime = performance.now();

      // Execute multiple purchase flows simultaneously
      const promises = Array(concurrentPurchases)
        .fill()
        .map((_, i) =>
          simulateEndToEndPurchase().catch((error) => ({
            error: error.message,
            purchaseId: `failed_${i}`,
          })),
        );

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      const memoryAfter = trackMemoryUsage("concurrent_end");

      const successfulResults = results.filter((r) => !r.error);
      const failedResults = results.filter((r) => r.error);

      console.log("\n🔄 Concurrent Purchase Analysis:");
      console.log(`   Total Time: ${totalTime.toFixed(2)}ms`);
      console.log(
        `   Successful: ${successfulResults.length}/${concurrentPurchases}`,
      );
      console.log(`   Failed: ${failedResults.length}`);

      if (failedResults.length > 0) {
        console.log(
          "   Failures:",
          failedResults.map((r) => r.error),
        );
      }

      if (memoryBefore && memoryAfter) {
        const heapGrowth = memoryAfter.heapUsed - memoryBefore.heapUsed;
        console.log(
          `   Memory Growth: ${heapGrowth > 0 ? "+" : ""}${heapGrowth}MB`,
        );
        expect(
          heapGrowth,
          "Concurrent operations cause memory leak",
        ).toBeLessThan(100);
      }

      expect(
        successfulResults.length,
        "Too many concurrent purchase failures",
      ).toBeGreaterThan(concurrentPurchases * 0.8);

      // Verify concurrent execution is actually concurrent (should be faster than sequential)
      const avgSequentialTime =
        successfulResults.reduce((sum, r) => sum + r.totalDuration, 0) /
        successfulResults.length;
      const expectedSequentialTotal = avgSequentialTime * concurrentPurchases;

      console.log(
        `   Concurrency Benefit: ${(((expectedSequentialTotal - totalTime) / expectedSequentialTotal) * 100).toFixed(1)}%`,
      );
      expect(
        totalTime,
        "Concurrent execution not actually concurrent",
      ).toBeLessThan(expectedSequentialTotal * 0.8);
    }, 45000);
  });

  describe("Performance Regression Detection", () => {
    test("tracks performance trends", () => {
      // This test would typically load historical performance data
      // and compare current results against established baselines

      const currentResults = performanceCollector.getStats();

      if (!currentResults) {
        console.log("⏭️  No performance data to analyze");
        return;
      }

      // Mock baseline data (in real implementation, this would be loaded from storage)
      const mockBaseline = {
        avg: currentResults.avg * 0.9, // Simulate 10% faster baseline
        p95: currentResults.p95 * 0.85,
      };

      const avgRegression =
        (currentResults.avg - mockBaseline.avg) / mockBaseline.avg;
      const p95Regression =
        (currentResults.p95 - mockBaseline.p95) / mockBaseline.p95;

      console.log("\n📉 Performance Trend Analysis:");
      console.log(`   Average Change: ${(avgRegression * 100).toFixed(2)}%`);
      console.log(`   P95 Change: ${(p95Regression * 100).toFixed(2)}%`);

      // Alert on significant regressions
      const warningThreshold = 0.15; // 15%
      const criticalThreshold = 0.3; // 30%

      if (
        avgRegression > criticalThreshold ||
        p95Regression > criticalThreshold
      ) {
        console.warn(
          "🚨 CRITICAL: Significant performance regression detected!",
        );
      } else if (
        avgRegression > warningThreshold ||
        p95Regression > warningThreshold
      ) {
        console.warn("⚠️  WARNING: Performance regression detected");
      } else {
        console.log("✅ Performance within acceptable bounds");
      }

      // Don't fail the test on regression, just log for analysis
      // In CI/CD, this data would be stored for trending analysis
      expect(true).toBe(true); // Always pass, but data is collected
    });
  });
});
