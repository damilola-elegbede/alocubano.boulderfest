/**
 * API Performance Tests
 * 
 * Tests API endpoint performance under various conditions
 * including response times, throughput, and error handling.
 * 
 * Note: These tests are skipped in CI environments as they require
 * actual API endpoints to be running. Use real HTTP testing for
 * meaningful performance measurements.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { performance } from "perf_hooks";

// Performance thresholds for API endpoints (adjusted for CI)
const getThresholds = () => {
  const multiplier = process.env.CI === 'true' ? 3 : 1; // CI gets more relaxed thresholds
  return {
    health: { max: 100 * multiplier, target: 50 * multiplier },      // Health check endpoints
    gallery: { max: 300 * multiplier, target: 150 * multiplier },    // Gallery API endpoints  
    tickets: { max: 500 * multiplier, target: 250 * multiplier },    // Ticket operations
    payments: { max: 800 * multiplier, target: 400 * multiplier },   // Payment processing
    admin: { max: 600 * multiplier, target: 300 * multiplier },      // Admin operations
    email: { max: 1000 * multiplier, target: 500 * multiplier }      // Email operations
  };
};
const API_THRESHOLDS = getThresholds();

// Mock API response times based on endpoint complexity (adjusted for CI)
const CI_MULTIPLIER = process.env.CI === 'true' ? 2 : 1; // CI is typically slower
const MOCK_RESPONSE_TIMES = {
  "/api/health/check": 25 * CI_MULTIPLIER,
  "/api/health/database": 50 * CI_MULTIPLIER,
  "/api/gallery/years": 100 * CI_MULTIPLIER,
  "/api/gallery/2026": 150 * CI_MULTIPLIER,
  "/api/tickets/validate": 200 * CI_MULTIPLIER,
  "/api/payments/create-checkout-session": 400 * CI_MULTIPLIER,
  "/api/admin/dashboard": 300 * CI_MULTIPLIER,
  "/api/email/subscribe": 250 * CI_MULTIPLIER
};

class APIPerformanceTester {
  constructor() {
    this.results = new Map();
    this.errors = [];
  }

  async testEndpoint(endpoint, iterations = 10) {
    const results = [];
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      try {
        // Make actual HTTP request to test real performance
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: 'GET',
          timeout: 5000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Vitest-Performance-Test'
          }
        });
        
        const duration = performance.now() - startTime;
        results.push({
          success: response.ok,
          duration,
          iteration: i,
          endpoint,
          status: response.status,
          timestamp: Date.now()
        });
      } catch (error) {
        const duration = performance.now() - startTime;
        results.push({
          success: false,
          duration,
          error: error.message,
          iteration: i,
          endpoint,
          timestamp: Date.now()
        });
        this.errors.push({ endpoint, error: error.message, iteration: i });
      }
    }

    this.results.set(endpoint, results);
    return results;
  }

  getStatistics(endpoint) {
    const results = this.results.get(endpoint);
    if (!results || results.length === 0) {
      return null;
    }

    const successfulResults = results.filter(r => r.success);
    const durations = successfulResults.map(r => r.duration);
    durations.sort((a, b) => a - b);

    return {
      endpoint,
      totalRequests: results.length,
      successfulRequests: successfulResults.length,
      successRate: successfulResults.length / results.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50: durations[Math.floor(durations.length * 0.5)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)]
    };
  }

  async testConcurrentRequests(endpoint, concurrency = 5, requests = 20) {
    const promises = [];
    const startTime = performance.now();

    for (let i = 0; i < requests; i++) {
      const promise = this.testSingleRequest(endpoint, i).catch(error => ({
        success: false,
        error: error.message,
        requestId: i,
        endpoint
      }));
      
      promises.push(promise);
      
      // Limit concurrency
      if (promises.length >= concurrency) {
        await Promise.race(promises);
        const completedIndex = promises.findIndex(p => p.isFulfilled || p.isRejected);
        if (completedIndex !== -1) {
          promises.splice(completedIndex, 1);
        }
      }
    }

    const results = await Promise.all(promises);
    const totalTime = performance.now() - startTime;

    return {
      endpoint,
      concurrency,
      totalRequests: requests,
      totalTime,
      results,
      avgConcurrentTime: totalTime / requests,
      throughput: requests / (totalTime / 1000) // requests per second
    };
  }

  async testSingleRequest(endpoint, requestId) {
    const startTime = performance.now();
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Vitest-Performance-Test'
        }
      });
      
      return {
        success: response.ok,
        duration: performance.now() - startTime,
        requestId,
        endpoint,
        status: response.status,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        duration: performance.now() - startTime,
        requestId,
        endpoint,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  reset() {
    this.results.clear();
    this.errors = [];
  }
}

describe.skipIf(process.env.CI === 'true')("API Performance Tests", () => {
  let tester;

  beforeAll(() => {
    // Skip if no base URL is configured
    if (!process.env.TEST_BASE_URL && !process.env.CI) {
      console.warn('⚠️ TEST_BASE_URL not set. Set TEST_BASE_URL=http://localhost:3000 to run performance tests against local server.');
    }
    tester = new APIPerformanceTester();
  });

  beforeEach(() => {
    tester.reset();
  });

  describe("Health Check Performance", () => {
    it("should respond to health checks quickly", async () => {
      const iterations = process.env.CI === 'true' ? 10 : 20; // Fewer iterations in CI
      const results = await tester.testEndpoint("/api/health/check", iterations);
      const stats = tester.getStatistics("/api/health/check");

      expect(stats.successRate).toBe(1.0);
      expect(stats.avgDuration).toBeLessThan(API_THRESHOLDS.health.max);
      expect(stats.p95).toBeLessThan(API_THRESHOLDS.health.max * 1.5);

      console.log(`Health check - Avg: ${stats.avgDuration.toFixed(2)}ms, P95: ${stats.p95.toFixed(2)}ms`);
    }, process.env.CI === 'true' ? 20000 : 10000);

    it("should handle database health checks efficiently", async () => {
      const results = await tester.testEndpoint("/api/health/database", 15);
      const stats = tester.getStatistics("/api/health/database");

      expect(stats.successRate).toBeGreaterThan(0.95);
      expect(stats.avgDuration).toBeLessThan(API_THRESHOLDS.health.max * 2); // Database can be slightly slower

      console.log(`Database health - Avg: ${stats.avgDuration.toFixed(2)}ms`);
    }, 8000);
  });

  describe("Gallery API Performance", () => {
    it("should load gallery years efficiently", async () => {
      const results = await tester.testEndpoint("/api/gallery/years", 15);
      const stats = tester.getStatistics("/api/gallery/years");

      expect(stats.successRate).toBeGreaterThan(0.95);
      expect(stats.avgDuration).toBeLessThan(API_THRESHOLDS.gallery.max);
      expect(stats.p95).toBeLessThan(API_THRESHOLDS.gallery.max * 1.2);

      console.log(`Gallery years - Avg: ${stats.avgDuration.toFixed(2)}ms`);
    }, 10000);

    it("should handle specific gallery requests", async () => {
      const results = await tester.testEndpoint("/api/gallery/2026", 15);
      const stats = tester.getStatistics("/api/gallery/2026");

      expect(stats.successRate).toBeGreaterThan(0.95);
      expect(stats.avgDuration).toBeLessThan(API_THRESHOLDS.gallery.max);

      console.log(`Gallery 2026 - Avg: ${stats.avgDuration.toFixed(2)}ms`);
    }, 10000);
  });

  describe("Ticket API Performance", () => {
    it("should validate tickets within threshold", async () => {
      const results = await tester.testEndpoint("/api/tickets/validate", 15);
      const stats = tester.getStatistics("/api/tickets/validate");

      expect(stats.successRate).toBeGreaterThan(0.95);
      expect(stats.avgDuration).toBeLessThan(API_THRESHOLDS.tickets.max);

      console.log(`Ticket validation - Avg: ${stats.avgDuration.toFixed(2)}ms`);
    }, 10000);
  });

  describe("Payment API Performance", () => {
    it("should create checkout sessions efficiently", async () => {
      const results = await tester.testEndpoint("/api/payments/create-checkout-session", 10);
      const stats = tester.getStatistics("/api/payments/create-checkout-session");

      expect(stats.successRate).toBeGreaterThan(0.90); // Payment operations can have more variability
      expect(stats.avgDuration).toBeLessThan(API_THRESHOLDS.payments.max);
      expect(stats.p99).toBeLessThan(API_THRESHOLDS.payments.max * 1.5);

      console.log(`Payment checkout - Avg: ${stats.avgDuration.toFixed(2)}ms, P99: ${stats.p99.toFixed(2)}ms`);
    }, 15000);
  });

  describe("Concurrent Request Performance", () => {
    it("should handle concurrent health checks", async () => {
      const result = await tester.testConcurrentRequests("/api/health/check", 10, 30);

      const successfulRequests = result.results.filter(r => r.success);
      const avgDuration = successfulRequests.reduce((sum, r) => sum + r.duration, 0) / successfulRequests.length;

      expect(successfulRequests.length).toBeGreaterThan(25); // At least 83% success
      expect(avgDuration).toBeLessThan(API_THRESHOLDS.health.max * 2); // Concurrent requests can be slower
      expect(result.throughput).toBeGreaterThan(10); // At least 10 requests/second

      console.log(`Concurrent health - Throughput: ${result.throughput.toFixed(1)} req/s`);
    }, 15000);

    it("should handle concurrent gallery requests", async () => {
      const result = await tester.testConcurrentRequests("/api/gallery/years", 5, 20);

      const successfulRequests = result.results.filter(r => r.success);
      const avgDuration = successfulRequests.reduce((sum, r) => sum + r.duration, 0) / successfulRequests.length;

      expect(successfulRequests.length).toBeGreaterThan(18); // 90% success rate
      expect(avgDuration).toBeLessThan(API_THRESHOLDS.gallery.max * 1.5);

      console.log(`Concurrent gallery - Avg: ${avgDuration.toFixed(2)}ms`);
    }, 15000);
  });

  describe("Performance Under Load", () => {
    it("should maintain performance under sustained load", async () => {
      const endpoints = ["/api/health/check", "/api/gallery/years", "/api/tickets/validate"];
      const results = new Map();

      for (const endpoint of endpoints) {
        const result = await tester.testEndpoint(endpoint, 25);
        results.set(endpoint, tester.getStatistics(endpoint));
      }

      for (const [endpoint, stats] of results) {
        expect(stats.successRate).toBeGreaterThan(0.95);
        console.log(`${endpoint} - Success: ${(stats.successRate * 100).toFixed(1)}%, Avg: ${stats.avgDuration.toFixed(2)}ms`);
      }
    }, 20000);

    it("should handle mixed endpoint load", async () => {
      const testPromises = [
        tester.testConcurrentRequests("/api/health/check", 3, 10),
        tester.testConcurrentRequests("/api/gallery/years", 2, 8),
        tester.testConcurrentRequests("/api/tickets/validate", 2, 6)
      ];

      const results = await Promise.all(testPromises);
      
      let totalSuccessful = 0;
      let totalRequests = 0;

      results.forEach((result, index) => {
        const successful = result.results.filter(r => r.success).length;
        totalSuccessful += successful;
        totalRequests += result.totalRequests;
        
        console.log(`Endpoint ${index + 1} - Success: ${successful}/${result.totalRequests}`);
      });

      const overallSuccessRate = totalSuccessful / totalRequests;
      expect(overallSuccessRate).toBeGreaterThan(0.90);

      console.log(`Overall mixed load success rate: ${(overallSuccessRate * 100).toFixed(1)}%`);
    }, 15000);
  });

  describe("Performance Regression Detection", () => {
    it("should detect performance degradation", async () => {
      // Establish baseline
      await tester.testEndpoint("/api/health/check", 10);
      const baselineStats = tester.getStatistics("/api/health/check");
      
      tester.reset();
      
      // Simulate degraded performance by using a slower endpoint
      await tester.testEndpoint("/api/payments/create-checkout-session", 10);
      const degradedStats = tester.getStatistics("/api/payments/create-checkout-session");

      const performanceRatio = degradedStats.avgDuration / baselineStats.avgDuration;

      expect(performanceRatio).toBeGreaterThan(3); // Should detect significant degradation
      console.log(`Performance degradation detected: ${performanceRatio.toFixed(2)}x slower`);
    }, 15000);

    it("should track performance consistency", async () => {
      const measurements = [];
      
      for (let i = 0; i < 5; i++) {
        await tester.testEndpoint("/api/gallery/years", 8);
        const stats = tester.getStatistics("/api/gallery/years");
        measurements.push(stats.avgDuration);
        tester.reset();
      }

      const avgMeasurement = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxVariation = Math.max(...measurements) / Math.min(...measurements);

      expect(maxVariation).toBeLessThan(2.5); // Less than 2.5x variation between measurements
      expect(avgMeasurement).toBeLessThan(API_THRESHOLDS.gallery.max);

      console.log(`Consistency check - Avg: ${avgMeasurement.toFixed(2)}ms, Variation: ${maxVariation.toFixed(2)}x`);
    }, 20000);
  });

  afterAll(() => {
    console.log("\n📊 API Performance Test Summary:");
    console.log("  Thresholds tested:");
    for (const [endpoint, threshold] of Object.entries(API_THRESHOLDS)) {
      console.log(`    ${endpoint}: ${threshold.max}ms max, ${threshold.target}ms target`);
    }
    console.log("✅ All API performance tests completed");
  });
});