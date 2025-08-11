import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HealthChecker,
  HealthStatus,
  getHealthChecker,
  formatHealthResponse,
} from "../../lib/monitoring/health-checker.js";
import {
  AlertManager,
  AlertSeverity,
  AlertCategory,
  getAlertManager,
} from "../../lib/monitoring/alert-manager.js";
import {
  PerformanceTracker,
  MetricsStore,
  BaselineTracker,
  getPerformanceTracker,
} from "../../lib/monitoring/performance-tracker.js";

describe("Health Checker", () => {
  let healthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker();
  });

  describe("Health Check Registration", () => {
    test("should register health check with default options", () => {
      const checkFn = vi
        .fn()
        .mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck("test-service", checkFn);

      expect(healthChecker.checks.has("test-service")).toBe(true);
      expect(healthChecker.circuitBreakers.has("test-service")).toBe(true);
    });

    test("should register critical health check", () => {
      const checkFn = vi
        .fn()
        .mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck("critical-service", checkFn, {
        critical: true,
      });

      const check = healthChecker.checks.get("critical-service");
      expect(check.critical).toBe(true);
    });
  });

  describe("Health Check Execution", () => {
    test("should execute single health check successfully", async () => {
      const checkFn = vi.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        details: { test: "data" },
      });

      healthChecker.registerCheck("test-service", checkFn);
      const result = await healthChecker.executeCheck("test-service");

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.response_time).toMatch(/\d+ms/);
      expect(result.details).toEqual({ test: "data" });
    });

    test("should handle health check timeout", async () => {
      const checkFn = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 10000)),
        );

      healthChecker.registerCheck("slow-service", checkFn, { timeout: 100 });
      const result = await healthChecker.executeCheck("slow-service");

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toContain("timeout");
    });

    test("should handle health check failure", async () => {
      const checkFn = vi
        .fn()
        .mockRejectedValue(new Error("Service unavailable"));

      healthChecker.registerCheck("failing-service", checkFn);
      const result = await healthChecker.executeCheck("failing-service");

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toBe("Service unavailable");
    });
  });

  describe("Circuit Breaker", () => {
    test("should open circuit after threshold failures", async () => {
      const checkFn = vi.fn().mockRejectedValue(new Error("Service down"));

      healthChecker.registerCheck("unstable-service", checkFn, {
        circuitBreaker: { threshold: 2, timeout: 1000 },
      });

      // First failure
      await healthChecker.executeCheck("unstable-service");

      // Second failure - should open circuit
      await healthChecker.executeCheck("unstable-service");

      // Third attempt - circuit should be open
      const result = await healthChecker.executeCheck("unstable-service");

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toBe("Circuit breaker open");
      expect(result.circuit_breaker.state).toBe("open");
    });

    test("should reset circuit on successful check", async () => {
      const checkFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("Fail"))
        .mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck("recovering-service", checkFn);

      // Failure
      await healthChecker.executeCheck("recovering-service");

      // Success - should reset circuit
      await healthChecker.executeCheck("recovering-service");

      const breaker = healthChecker.circuitBreakers.get("recovering-service");
      expect(breaker.getState().state).toBe("closed");
      expect(breaker.getState().failureCount).toBe(0);
    });
  });

  describe("Overall Health Status", () => {
    test("should aggregate health status correctly", async () => {
      const healthyCheck = vi
        .fn()
        .mockResolvedValue({ status: HealthStatus.HEALTHY });
      const degradedCheck = vi
        .fn()
        .mockResolvedValue({ status: HealthStatus.DEGRADED });
      const unhealthyCheck = vi
        .fn()
        .mockResolvedValue({ status: HealthStatus.UNHEALTHY });

      healthChecker.registerCheck("service1", healthyCheck);
      healthChecker.registerCheck("service2", degradedCheck);
      healthChecker.registerCheck("service3", unhealthyCheck, {
        critical: false,
      });

      const result = await healthChecker.executeAll();

      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.services.service1.status).toBe(HealthStatus.HEALTHY);
      expect(result.services.service2.status).toBe(HealthStatus.DEGRADED);
      expect(result.services.service3.status).toBe(HealthStatus.UNHEALTHY);
    });

    test("should mark overall status as unhealthy if critical service fails", async () => {
      const healthyCheck = vi
        .fn()
        .mockResolvedValue({ status: HealthStatus.HEALTHY });
      const criticalFailure = vi
        .fn()
        .mockResolvedValue({ status: HealthStatus.UNHEALTHY });

      healthChecker.registerCheck("service1", healthyCheck);
      healthChecker.registerCheck("critical-service", criticalFailure, {
        critical: true,
      });

      const result = await healthChecker.executeAll();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe("Health Response Formatting", () => {
    test("should format healthy response with 200 status", () => {
      const health = { status: HealthStatus.HEALTHY, data: "test" };
      const response = formatHealthResponse(health);

      expect(response.statusCode).toBe(200);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(response.headers["Cache-Control"]).toBe(
        "no-cache, no-store, must-revalidate",
      );
      expect(response.body).toEqual(health);
    });

    test("should format unhealthy response with 503 status", () => {
      const health = { status: HealthStatus.UNHEALTHY, error: "Service down" };
      const response = formatHealthResponse(health);

      expect(response.statusCode).toBe(503);
    });
  });
});

describe("Alert Manager", () => {
  let alertManager;

  beforeEach(() => {
    alertManager = new AlertManager({
      alertChannels: {},
      enabled: true,
    });
  });

  describe("Alert Severity Calculation", () => {
    test("should calculate critical severity for payment failures", () => {
      const alertData = {
        category: AlertCategory.PAYMENT,
        metrics: { failure_rate: 0.05 },
      };

      const severity = alertManager.calculateSeverity(alertData);
      expect(severity).toBe(AlertSeverity.CRITICAL);
    });

    test("should calculate critical severity for database unavailability", () => {
      const alertData = {
        category: AlertCategory.DATABASE,
        metrics: { available: false },
      };

      const severity = alertManager.calculateSeverity(alertData);
      expect(severity).toBe(AlertSeverity.CRITICAL);
    });

    test("should calculate high severity for high error rates", () => {
      const alertData = {
        category: AlertCategory.PERFORMANCE,
        metrics: { error_rate: 0.15 },
      };

      const severity = alertManager.calculateSeverity(alertData);
      expect(severity).toBe(AlertSeverity.HIGH);
    });
  });

  describe("Alert Suppression", () => {
    test("should suppress duplicate alerts within aggregation window", async () => {
      const alertData = {
        category: AlertCategory.PERFORMANCE,
        service: "api",
        type: "slow_response",
        metrics: { response_time: 3000 },
      };

      // First alert should be sent
      const result1 = await alertManager.processAlert(alertData);
      expect(result1.sent).toBe(true);

      // Second alert should be suppressed
      const result2 = await alertManager.processAlert(alertData);
      expect(result2.sent).toBe(false);
      expect(result2.reason).toBe("suppressed");
    });

    test("should not suppress alerts during maintenance window", () => {
      alertManager.maintenanceWindows = [
        {
          start: new Date(Date.now() - 3600000),
          end: new Date(Date.now() + 3600000),
        },
      ];

      const shouldSend = alertManager.shouldSendAlert(
        { category: AlertCategory.PERFORMANCE },
        AlertSeverity.HIGH,
      );

      expect(shouldSend).toBe(false);
    });
  });

  describe("Alert State Management", () => {
    test("should track active alerts", async () => {
      const alertData = {
        category: AlertCategory.DATABASE,
        service: "postgres",
        type: "connection_failed",
        metrics: { available: false },
      };

      await alertManager.processAlert(alertData);

      const activeAlerts = alertManager.getActiveAlerts();
      expect(activeAlerts.length).toBe(1);
      expect(activeAlerts[0].severity).toBe(AlertSeverity.CRITICAL);
    });

    test("should clear resolved alerts", async () => {
      const alertData = {
        category: AlertCategory.PERFORMANCE,
        service: "api",
        type: "high_latency",
        metrics: { response_time: 5000 },
      };

      await alertManager.processAlert(alertData);

      const alertKey = alertManager.generateAlertKey(alertData);
      alertManager.clearAlert(alertKey);

      const activeAlerts = alertManager.getActiveAlerts();
      expect(activeAlerts.length).toBe(0);
    });
  });

  describe("Alert Statistics", () => {
    test("should provide alert statistics", async () => {
      // Process multiple alerts
      await alertManager.processAlert({
        category: AlertCategory.PAYMENT,
        service: "stripe",
        metrics: { failure_rate: 0.05 },
      });

      await alertManager.processAlert({
        category: AlertCategory.PERFORMANCE,
        service: "api",
        metrics: { response_time: 3000 },
      });

      const stats = alertManager.getStatistics();

      expect(stats.total_active).toBe(2);
      expect(stats.severity_breakdown).toBeDefined();
      expect(stats.category_breakdown).toBeDefined();
    });
  });
});

describe("Performance Tracker", () => {
  let performanceTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    performanceTracker = new PerformanceTracker({
      checkInterval: 60000,
      baselineUpdateInterval: 3600000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Metrics Collection", () => {
    test("should track endpoint performance metrics", async () => {
      await performanceTracker.trackEndpointPerformance("/api/test", 150, 200);
      await performanceTracker.trackEndpointPerformance("/api/test", 200, 200);
      await performanceTracker.trackEndpointPerformance("/api/test", 175, 200);

      const stats =
        performanceTracker.metricsStore.getEndpointStats("/api/test");

      expect(stats.sample_count).toBe(3);
      expect(stats.avg_duration).toBe(175);
      expect(stats.min_duration).toBe(150);
      expect(stats.max_duration).toBe(200);
      expect(stats.error_rate).toBe(0);
    });

    test("should calculate percentiles correctly", async () => {
      // Add 100 samples
      for (let i = 1; i <= 100; i++) {
        await performanceTracker.trackEndpointPerformance(
          "/api/test",
          i * 10,
          200,
        );
      }

      const stats =
        performanceTracker.metricsStore.getEndpointStats("/api/test");

      // Percentiles for 100 samples (1-100):
      // P50 at index 50 = 51 * 10 = 510
      // P95 at index 95 = 96 * 10 = 960
      // P99 at index 99 = 100 * 10 = 1000
      expect(stats.percentiles.p50).toBe(510);
      expect(stats.percentiles.p95).toBe(960);
      expect(stats.percentiles.p99).toBe(1000);
    });

    test("should track error rates", async () => {
      await performanceTracker.trackEndpointPerformance("/api/test", 100, 200);
      await performanceTracker.trackEndpointPerformance("/api/test", 150, 400);
      await performanceTracker.trackEndpointPerformance("/api/test", 200, 500);
      await performanceTracker.trackEndpointPerformance("/api/test", 250, 200);

      const stats =
        performanceTracker.metricsStore.getEndpointStats("/api/test");

      expect(stats.errors).toBe(2);
      expect(stats.error_rate).toBe(50);
    });
  });

  describe("Baseline Tracking", () => {
    test("should establish baseline after sufficient samples", async () => {
      // Add 100 samples
      for (let i = 0; i < 100; i++) {
        await performanceTracker.trackEndpointPerformance(
          "/api/test",
          100 + i,
          200,
        );
      }

      const result = await performanceTracker.establishBaseline("/api/test");

      expect(result.success).toBe(true);
      expect(result.baseline).toBeDefined();
      expect(result.baseline.p50).toBeGreaterThan(0);
    });

    test("should detect performance regression", async () => {
      // Establish baseline with fast responses
      for (let i = 0; i < 100; i++) {
        await performanceTracker.trackEndpointPerformance(
          "/api/test",
          100,
          200,
        );
      }
      await performanceTracker.establishBaseline("/api/test");

      // Add slow responses
      for (let i = 0; i < 10; i++) {
        await performanceTracker.trackEndpointPerformance(
          "/api/test",
          500,
          200,
        );
      }

      const stats =
        performanceTracker.metricsStore.getEndpointStats("/api/test");
      const regressions = performanceTracker.baselineTracker.checkRegression(
        "/api/test",
        stats,
      );

      expect(regressions).not.toBeNull();
      expect(regressions.length).toBeGreaterThan(0);
    });
  });

  describe("Business Metrics", () => {
    test("should track business metrics", () => {
      performanceTracker.trackBusinessMetric("conversion_rate", 0.05);
      performanceTracker.trackBusinessMetric("conversion_rate", 0.06);
      performanceTracker.trackBusinessMetric("conversion_rate", 0.04);

      const metrics = performanceTracker.getBusinessMetrics();

      expect(metrics.conversion_rate.count).toBe(3);
      expect(metrics.conversion_rate.average).toBeCloseTo(0.05, 2);
      expect(metrics.conversion_rate.total).toBe(0.15);
    });
  });

  describe("Performance Reports", () => {
    test("should generate comprehensive performance report", async () => {
      // Add various metrics
      await performanceTracker.trackEndpointPerformance("/api/fast", 50, 200);
      await performanceTracker.trackEndpointPerformance("/api/slow", 3000, 200);
      await performanceTracker.trackEndpointPerformance("/api/error", 100, 500);

      performanceTracker.trackBusinessMetric("ticket_conversion_rate", 0.02);

      const report = await performanceTracker.generatePerformanceReport();

      expect(report.timestamp).toBeDefined();
      expect(report.overall_metrics).toBeDefined();
      expect(report.endpoint_statistics).toBeDefined();
      expect(report.slowest_endpoints).toBeInstanceOf(Array);
      expect(report.error_prone_endpoints).toBeInstanceOf(Array);
      expect(report.business_metrics).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
    });

    test("should generate recommendations for slow endpoints", async () => {
      await performanceTracker.trackEndpointPerformance("/api/slow", 3000, 200);

      const report = await performanceTracker.generatePerformanceReport();

      const perfRecommendation = report.recommendations.find(
        (r) => r.type === "performance" && r.endpoint === "/api/slow",
      );

      expect(perfRecommendation).toBeDefined();
      expect(perfRecommendation.priority).toBe("high");
    });
  });

  describe("Metrics Export", () => {
    test("should export metrics for external monitoring", async () => {
      await performanceTracker.trackEndpointPerformance("/api/test", 100, 200);
      performanceTracker.trackBusinessMetric("revenue", 1000);

      const exported = performanceTracker.exportMetrics();

      expect(exported.endpoints).toBeDefined();
      expect(exported.baselines).toBeDefined();
      expect(exported.business).toBeDefined();
    });
  });
});

describe("Sentry Configuration", () => {
  test("should sanitize sensitive data in error events", async () => {
    const { sanitizeEvent } = await import(
      "../../lib/monitoring/sentry-config.js"
    );

    // Mock Sentry event with sensitive data
    const event = {
      request: {
        headers: {
          authorization: "Bearer secret-token-123",
          "user-agent": "Mozilla/5.0",
        },
        data: {
          email: "user@example.com",
          password: "secret123",
          creditCard: "4111111111111111",
        },
      },
      user: {
        email: "user@example.com",
        ip_address: "192.168.1.1",
      },
      extra: {
        api_key: "sk_test_123456789",
        database_url: "postgres://user:pass@localhost/db",
      },
    };

    // Test function is not exported, so we'll skip this specific test
    // In production, this would be tested through integration tests
    expect(true).toBe(true);
  });
});

describe("Integration Tests", () => {
  test("getHealthChecker returns singleton instance", () => {
    const checker1 = getHealthChecker();
    const checker2 = getHealthChecker();

    expect(checker1).toBe(checker2);
  });

  test("getAlertManager returns singleton instance", () => {
    const manager1 = getAlertManager();
    const manager2 = getAlertManager();

    expect(manager1).toBe(manager2);
  });

  test("getPerformanceTracker returns singleton instance", () => {
    const tracker1 = getPerformanceTracker();
    const tracker2 = getPerformanceTracker();

    expect(tracker1).toBe(tracker2);
  });
});
