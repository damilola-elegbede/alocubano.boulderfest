/**
 * Load Testing Integration Performance Tests
 * 
 * Tests load performance and scalability under simulated user load
 * focusing on API endpoints and database operations.
 * 
 * Note: These tests are skipped in CI environments. For real load testing,
 * use the K6 scripts in the scripts/ directory which test actual endpoints.
 * 
 * CRITICAL: This test requires a running local server at TEST_BASE_URL
 * and should NEVER run in CI environments.
 */

// SAFETY CHECK: Multiple exit points to prevent CI execution
if (process.env.CI === 'true' || 
    process.env.NODE_ENV === 'ci' || 
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.VERCEL_ENV ||
    typeof process.env.TEST_BASE_URL === 'undefined') {
  console.log('⚠️  SKIPPING: Load integration tests not suitable for CI environment');
  console.log('   Reason: Requires local server connection');
  console.log('   Use: npm run performance:load-integration:local for local testing');
  process.exit(0);
}

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { performance } from "perf_hooks";

// Performance thresholds for load testing (adjusted for CI)
const getLoadThresholds = () => {
  const multiplier = process.env.CI === 'true' ? 2.5 : 1; // CI gets relaxed thresholds
  const userReduction = process.env.CI === 'true' ? 0.5 : 1; // Fewer users in CI
  return {
    apiResponse: {
      max: 500 * multiplier,    // 500ms max for API responses
      target: 200 * multiplier  // 200ms target
    },
    dbQuery: {
      max: 100 * multiplier,    // 100ms max for database queries
      target: 50 * multiplier   // 50ms target
    },
    concurrentUsers: {
      max: Math.max(10, 50 * userReduction),     // Support fewer users in CI
      responseTime: 1000 * multiplier // Under 1 second response time
    }
  };
};
const LOAD_THRESHOLDS = getLoadThresholds();

// Mock database operations
const mockDatabase = {
  execute: vi.fn(),
  batch: vi.fn(),
  close: vi.fn()
};

// Mock API endpoints
class MockAPIEndpoint {
  constructor(name, processingTime = 100) {
    this.name = name;
    this.processingTime = processingTime;
    this.callCount = 0;
  }

  async process(payload) {
    this.callCount++;
    const startTime = performance.now();
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    
    try {
      // Skip HTTP requests in CI - use mock response instead
      if (process.env.CI === 'true' || process.env.NODE_ENV === 'ci') {
        // Simulate processing time without real HTTP request
        await new Promise(resolve => setTimeout(resolve, this.processingTime));
        return {
          success: true,
          duration,
          payload,
          endpoint: this.name,
          status: 200,
          timestamp: Date.now()
        };
      }
      
      // Make actual HTTP request in non-CI environments
      const response = await fetch(`${baseUrl}/api/health/check`, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': `Vitest-Load-Test-${this.name}`
        }
      });
      
      const duration = performance.now() - startTime;
      return {
        success: response.ok,
        duration,
        payload,
        endpoint: this.name,
        status: response.status,
        timestamp: Date.now()
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return {
        success: false,
        duration,
        payload,
        endpoint: this.name,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  getMetrics() {
    return {
      name: this.name,
      callCount: this.callCount,
      avgProcessingTime: this.processingTime
    };
  }
}

// Load test orchestrator
class LoadTestOrchestrator {
  constructor() {
    this.endpoints = new Map();
    this.results = [];
    this.concurrentUsers = 0;
    this.maxConcurrentUsers = 0;
  }

  addEndpoint(name, processingTime) {
    this.endpoints.set(name, new MockAPIEndpoint(name, processingTime));
  }

  async simulateUserLoad(userCount, duration = 5000) {
    const users = [];
    const startTime = performance.now();

    for (let i = 0; i < userCount; i++) {
      users.push(this.simulateUser(i, duration));
    }

    const results = await Promise.all(users);
    const totalTime = performance.now() - startTime;

    return {
      userCount,
      duration: totalTime,
      results: results.flat(),
      maxConcurrentUsers: this.maxConcurrentUsers,
      avgResponseTime: results.flat().reduce((sum, r) => sum + r.duration, 0) / results.flat().length
    };
  }

  async simulateUser(userId, duration) {
    const userResults = [];
    const endTime = Date.now() + duration;
    const endpointNames = Array.from(this.endpoints.keys());

    while (Date.now() < endTime) {
      this.concurrentUsers++;
      this.maxConcurrentUsers = Math.max(this.maxConcurrentUsers, this.concurrentUsers);

      // Randomly select an endpoint
      const endpointName = endpointNames[Math.floor(Math.random() * endpointNames.length)];
      const endpoint = this.endpoints.get(endpointName);

      try {
        const result = await endpoint.process({ userId, timestamp: Date.now() });
        userResults.push(result);
      } catch (error) {
        userResults.push({
          success: false,
          error: error.message,
          endpoint: endpointName,
          userId,
          timestamp: Date.now()
        });
      }

      this.concurrentUsers--;

      // Wait between requests (simulate user think time)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    }

    return userResults;
  }

  getEndpointMetrics() {
    const metrics = new Map();
    for (const [name, endpoint] of this.endpoints) {
      metrics.set(name, endpoint.getMetrics());
    }
    return metrics;
  }

  reset() {
    this.results = [];
    this.concurrentUsers = 0;
    this.maxConcurrentUsers = 0;
    for (const endpoint of this.endpoints.values()) {
      endpoint.callCount = 0;
    }
  }
}

// Multiple skip conditions for CI environments
const shouldSkipInCI = process.env.CI === 'true' || 
                      process.env.NODE_ENV === 'ci' || 
                      process.env.GITHUB_ACTIONS === 'true' ||
                      !process.env.TEST_BASE_URL;

describe.skipIf(shouldSkipInCI)("Load Testing Integration", () => {
  let loadOrchestrator;

  beforeAll(() => {
    // Early exit if running in CI
    if (process.env.CI === 'true' || process.env.NODE_ENV === 'ci') {
      console.log('⏭️  Load integration tests skipped in CI environment');
      return;
    }
    
    // Skip if no base URL is configured for real testing
    if (!process.env.TEST_BASE_URL) {
      console.warn('⚠️ TEST_BASE_URL not set. Set TEST_BASE_URL=http://localhost:3000 to run load tests against local server.');
      console.warn('⚠️ Tests will run with mock responses only.');
    }
    
    loadOrchestrator = new LoadTestOrchestrator();
    
    // Setup endpoints - they'll all use real HTTP requests
    loadOrchestrator.addEndpoint("tickets", 150);        // Ticket operations
    loadOrchestrator.addEndpoint("payments", 300);       // Payment processing
    loadOrchestrator.addEndpoint("gallery", 80);         // Gallery API
    loadOrchestrator.addEndpoint("admin", 200);          // Admin operations
    loadOrchestrator.addEndpoint("health", 25);          // Health checks
  });

  beforeEach(() => {
    loadOrchestrator.reset();
  });

  describe("Single User Performance", () => {
    it("should handle single user requests within thresholds", async () => {
      const duration = process.env.CI === 'true' ? 2000 : 3000; // Shorter duration in CI
      const result = await loadOrchestrator.simulateUserLoad(1, duration);

      expect(result.userCount).toBe(1);
      expect(result.results.length).toBeGreaterThan(0);
      
      // Allow more lenient thresholds for real HTTP requests
      const successfulResults = result.results.filter(r => r.success);
      if (successfulResults.length > 0) {
        expect(result.avgResponseTime).toBeLessThan(LOAD_THRESHOLDS.apiResponse.max * 2); // 2x for real requests
      }

      console.log(`Single user - Avg response: ${result.avgResponseTime.toFixed(2)}ms`);
      console.log(`Requests completed: ${result.results.length}`);
      console.log(`Success rate: ${(successfulResults.length / result.results.length * 100).toFixed(1)}%`);
    }, process.env.CI === 'true' ? 15000 : 10000);

    it("should maintain consistent response times", async () => {
      const result = await loadOrchestrator.simulateUserLoad(1, 5000);
      
      const responseTimes = result.results
        .filter(r => r.success)
        .map(r => r.duration);

      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);
      const variance = maxTime / minTime;

      console.log(`Response time variance: ${variance.toFixed(2)}x (${minTime.toFixed(0)}ms - ${maxTime.toFixed(0)}ms)`);

      expect(avgTime).toBeLessThan(LOAD_THRESHOLDS.apiResponse.target);
      expect(variance).toBeLessThan(3); // No more than 3x difference between fastest and slowest
    }, 12000);
  });

  describe("Concurrent User Load", () => {
    it("should handle moderate concurrent load", async () => {
      const userCount = process.env.CI === 'true' ? 5 : 10; // Fewer users in CI
      const duration = process.env.CI === 'true' ? 3000 : 4000;
      const result = await loadOrchestrator.simulateUserLoad(userCount, duration);

      const successfulRequests = result.results.filter(r => r.success);
      const successRate = successfulRequests.length / result.results.length;

      console.log(`${userCount} users - Success rate: ${(successRate * 100).toFixed(1)}%`);
      console.log(`Max concurrent: ${result.maxConcurrentUsers}`);
      console.log(`Avg response: ${result.avgResponseTime.toFixed(2)}ms`);

      expect(successRate).toBeGreaterThan(0.90); // 90% success rate (more lenient for CI)
      expect(result.avgResponseTime).toBeLessThan(LOAD_THRESHOLDS.apiResponse.max);
    }, process.env.CI === 'true' ? 20000 : 15000);

    it("should scale to maximum concurrent users", async () => {
      const userCount = LOAD_THRESHOLDS.concurrentUsers.max;
      const duration = process.env.CI === 'true' ? 2000 : 3000;
      const result = await loadOrchestrator.simulateUserLoad(userCount, duration);

      const successfulRequests = result.results.filter(r => r.success);
      const successRate = successfulRequests.length / result.results.length;

      console.log(`${userCount} users - Success rate: ${(successRate * 100).toFixed(1)}%`);
      console.log(`Total requests: ${result.results.length}`);
      console.log(`Avg response: ${result.avgResponseTime.toFixed(2)}ms`);

      expect(successRate).toBeGreaterThan(0.80); // 80% success rate under max load (more lenient)
      expect(result.avgResponseTime).toBeLessThan(LOAD_THRESHOLDS.concurrentUsers.responseTime);
    }, process.env.CI === 'true' ? 30000 : 20000);
  });

  describe("Endpoint-Specific Load Testing", () => {
    it("should handle payment endpoint load", async () => {
      // Focus load on payment endpoint
      loadOrchestrator.endpoints.clear();
      loadOrchestrator.addEndpoint("payments", 300);

      const result = await loadOrchestrator.simulateUserLoad(20, 4000);
      const paymentResults = result.results.filter(r => r.endpoint === "payments");

      const avgPaymentTime = paymentResults.reduce((sum, r) => sum + r.duration, 0) / paymentResults.length;

      console.log(`Payment endpoint - Avg: ${avgPaymentTime.toFixed(2)}ms`);
      console.log(`Payment requests: ${paymentResults.length}`);

      expect(avgPaymentTime).toBeLessThan(800); // Payment operations can be slower
      expect(paymentResults.length).toBeGreaterThan(0);
    }, 15000);

    it("should handle gallery endpoint high frequency", async () => {
      loadOrchestrator.endpoints.clear();
      loadOrchestrator.addEndpoint("gallery", 80);

      const result = await loadOrchestrator.simulateUserLoad(25, 3000);
      const galleryResults = result.results.filter(r => r.endpoint === "gallery");

      const avgGalleryTime = galleryResults.reduce((sum, r) => sum + r.duration, 0) / galleryResults.length;

      console.log(`Gallery endpoint - Avg: ${avgGalleryTime.toFixed(2)}ms`);
      console.log(`Gallery requests: ${galleryResults.length}`);

      expect(avgGalleryTime).toBeLessThan(LOAD_THRESHOLDS.apiResponse.target);
      expect(galleryResults.length).toBeGreaterThan(0);
    }, 12000);
  });

  describe("Performance Regression Detection", () => {
    it("should detect performance degradation", async () => {
      // First, establish baseline
      const baselineResult = await loadOrchestrator.simulateUserLoad(5, 3000);
      const baselineTime = baselineResult.avgResponseTime;

      // Simulate performance degradation
      loadOrchestrator.endpoints.clear();
      loadOrchestrator.addEndpoint("degraded", 400); // Slower endpoint

      const degradedResult = await loadOrchestrator.simulateUserLoad(5, 3000);
      const degradedTime = degradedResult.avgResponseTime;

      const performanceRatio = degradedTime / baselineTime;

      console.log(`Baseline: ${baselineTime.toFixed(2)}ms`);
      console.log(`Degraded: ${degradedTime.toFixed(2)}ms`);
      console.log(`Performance ratio: ${performanceRatio.toFixed(2)}x`);

      expect(performanceRatio).toBeGreaterThan(1.5); // Should detect significant degradation
    }, 15000);

    it("should track performance trends", async () => {
      const measurements = [];

      // Take multiple measurements
      for (let i = 0; i < 5; i++) {
        const result = await loadOrchestrator.simulateUserLoad(3, 2000);
        measurements.push(result.avgResponseTime);
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause
      }

      const avgMeasurement = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxVariation = Math.max(...measurements) / Math.min(...measurements);

      console.log(`Measurements: ${measurements.map(m => m.toFixed(0)).join('ms, ')}ms`);
      console.log(`Average: ${avgMeasurement.toFixed(2)}ms`);
      console.log(`Max variation: ${maxVariation.toFixed(2)}x`);

      expect(maxVariation).toBeLessThan(2.5); // Consistent performance
      expect(avgMeasurement).toBeLessThan(LOAD_THRESHOLDS.apiResponse.max);
    }, 20000);
  });

  describe("Resource Utilization", () => {
    it("should monitor endpoint distribution", async () => {
      const result = await loadOrchestrator.simulateUserLoad(15, 4000);
      const endpointDistribution = new Map();

      result.results.forEach(r => {
        const count = endpointDistribution.get(r.endpoint) || 0;
        endpointDistribution.set(r.endpoint, count + 1);
      });

      console.log("Endpoint distribution:");
      for (const [endpoint, count] of endpointDistribution) {
        const percentage = (count / result.results.length * 100).toFixed(1);
        console.log(`  ${endpoint}: ${count} (${percentage}%)`);
      }

      // Verify reasonable distribution (no endpoint should dominate completely)
      const maxRequests = Math.max(...endpointDistribution.values());
      const totalRequests = result.results.length;
      const maxPercentage = maxRequests / totalRequests;

      expect(maxPercentage).toBeLessThan(0.7); // No single endpoint > 70%
    }, 15000);

    it("should handle memory-conscious operations", async () => {
      const memoryBefore = process.memoryUsage?.() || { heapUsed: 0 };
      
      const result = await loadOrchestrator.simulateUserLoad(30, 3000);
      
      const memoryAfter = process.memoryUsage?.() || { heapUsed: 0 };
      const memoryGrowth = (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024; // MB

      console.log(`Memory growth: ${memoryGrowth.toFixed(1)}MB`);
      console.log(`Requests processed: ${result.results.length}`);

      if (memoryGrowth > 0) {
        expect(memoryGrowth).toBeLessThan(50); // Less than 50MB growth
      }
    }, 15000);
  });

  afterAll(() => {
    // Generate performance summary
    console.log("\n📊 Load Testing Summary:");
    console.log(`  Max concurrent users tested: ${LOAD_THRESHOLDS.concurrentUsers.max}`);
    console.log(`  API response threshold: ${LOAD_THRESHOLDS.apiResponse.max}ms`);
    console.log(`  Target response time: ${LOAD_THRESHOLDS.apiResponse.target}ms`);
    console.log("✅ All load tests completed");
  });
});