import {
  getAlertManager,
  AlertSeverity,
  AlertCategory,
} from "./alert-manager.js";
import {
  captureException,
  captureMessage,
  addBreadcrumb,
} from "./sentry-config.js";
import { getPerformanceTracker } from "./performance-tracker.js";

/**
 * Monitoring service configuration
 */
const MONITORING_CONFIG = {
  // Metrics collection intervals
  metricsInterval: 60000, // 1 minute
  healthCheckInterval: 30000, // 30 seconds
  performanceCheckInterval: 300000, // 5 minutes

  // Thresholds
  thresholds: {
    errorRate: 0.05, // 5%
    responseTime: {
      p50: 500, // 500ms median
      p95: 2000, // 2s 95th percentile
      p99: 5000, // 5s 99th percentile
    },
    paymentFailureRate: 0.01, // 1%
    databaseConnectionTime: 1000, // 1 second
    externalApiTimeout: 5000, // 5 seconds
    memoryUsage: 0.8, // 80%
    cpuUsage: 0.9, // 90%
  },

  // Rate limiting
  rateLimits: {
    errorLogging: 100, // Max 100 errors per minute
    metricCollection: 1000, // Max 1000 metrics per minute
    alerting: 10, // Max 10 alerts per minute
  },
};

/**
 * System metrics collector
 */
class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.timers = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
  }

  /**
   * Increment a counter
   */
  incrementCounter(name, value = 1, tags = {}) {
    const key = this.generateKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    // Record metric
    this.recordMetric("counter", name, current + value, tags);
  }

  /**
   * Set a gauge value
   */
  setGauge(name, value, tags = {}) {
    const key = this.generateKey(name, tags);
    this.gauges.set(key, value);

    // Record metric
    this.recordMetric("gauge", name, value, tags);
  }

  /**
   * Record a timer value
   */
  recordTimer(name, duration, tags = {}) {
    const key = this.generateKey(name, tags);
    if (!this.timers.has(key)) {
      this.timers.set(key, []);
    }
    this.timers.get(key).push(duration);

    // Calculate percentiles if enough data
    const values = this.timers.get(key);
    if (values.length >= 10) {
      const percentiles = this.calculatePercentiles(values);
      this.recordMetric("timer", name, percentiles, tags);
    }
  }

  /**
   * Record histogram value
   */
  recordHistogram(name, value, tags = {}) {
    const key = this.generateKey(name, tags);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key).push(value);

    // Calculate statistics
    const values = this.histograms.get(key);
    const stats = this.calculateStatistics(values);
    this.recordMetric("histogram", name, stats, tags);
  }

  /**
   * Generate metric key
   */
  generateKey(name, tags) {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(",");
    return `${name}${tagString ? ":" + tagString : ""}`;
  }

  /**
   * Record metric
   */
  recordMetric(type, name, value, tags) {
    const timestamp = Date.now();
    const metric = {
      type,
      name,
      value,
      tags,
      timestamp,
    };

    // Store metric
    const key = `${type}:${name}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key).push(metric);

    // Trim old metrics (keep last hour)
    const oneHourAgo = timestamp - 3600000;
    const metrics = this.metrics.get(key);
    this.metrics.set(
      key,
      metrics.filter((m) => m.timestamp > oneHourAgo),
    );
  }

  /**
   * Calculate percentiles
   */
  calculatePercentiles(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p75: sorted[Math.floor(len * 0.75)],
      p90: sorted[Math.floor(len * 0.9)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      min: sorted[0],
      max: sorted[len - 1],
      count: len,
    };
  }

  /**
   * Calculate statistics
   */
  calculateStatistics(values) {
    if (values.length === 0) {
      return { count: 0 };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance =
      values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      count: values.length,
      sum,
      mean,
      stdDev,
      ...this.calculatePercentiles(values),
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const result = {};

    // Counters
    this.counters.forEach((value, key) => {
      result[`counter.${key}`] = value;
    });

    // Gauges
    this.gauges.forEach((value, key) => {
      result[`gauge.${key}`] = value;
    });

    // Timers
    this.timers.forEach((values, key) => {
      const stats = this.calculatePercentiles(values);
      Object.entries(stats).forEach(([stat, value]) => {
        result[`timer.${key}.${stat}`] = value;
      });
    });

    // Histograms
    this.histograms.forEach((values, key) => {
      const stats = this.calculateStatistics(values);
      Object.entries(stats).forEach(([stat, value]) => {
        result[`histogram.${key}.${stat}`] = value;
      });
    });

    return result;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.counters.clear();
    this.timers.clear();
    // Keep gauges and histograms
  }
}

/**
 * Transaction monitor
 */
class TransactionMonitor {
  constructor() {
    this.transactions = new Map();
    this.completedTransactions = [];
  }

  /**
   * Start transaction
   */
  startTransaction(id, metadata = {}) {
    this.transactions.set(id, {
      id,
      startTime: Date.now(),
      metadata,
      spans: [],
    });
  }

  /**
   * Add span to transaction
   */
  addSpan(transactionId, spanName, duration, metadata = {}) {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.spans.push({
        name: spanName,
        duration,
        metadata,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * End transaction
   */
  endTransaction(id, status = "success", metadata = {}) {
    const transaction = this.transactions.get(id);
    if (!transaction) {
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - transaction.startTime;

    const completed = {
      ...transaction,
      endTime,
      duration,
      status,
      metadata: { ...transaction.metadata, ...metadata },
    };

    // Store completed transaction
    this.completedTransactions.push(completed);

    // Clean up old transactions (keep last hour)
    const oneHourAgo = Date.now() - 3600000;
    this.completedTransactions = this.completedTransactions.filter(
      (t) => t.endTime > oneHourAgo,
    );

    // Remove from active
    this.transactions.delete(id);

    return completed;
  }

  /**
   * Get transaction statistics
   */
  getStatistics() {
    const stats = {
      active: this.transactions.size,
      completed: this.completedTransactions.length,
      successful: 0,
      failed: 0,
      durations: [],
    };

    this.completedTransactions.forEach((transaction) => {
      if (transaction.status === "success") {
        stats.successful++;
      } else {
        stats.failed++;
      }
      stats.durations.push(transaction.duration);
    });

    if (stats.durations.length > 0) {
      stats.avgDuration =
        stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
      stats.maxDuration = Math.max(...stats.durations);
      stats.minDuration = Math.min(...stats.durations);
    }

    return stats;
  }
}

/**
 * Business metrics tracker
 */
class BusinessMetricsTracker {
  constructor(metricsCollector) {
    this.metricsCollector = metricsCollector;
    this.paymentMetrics = {
      attempts: 0,
      successes: 0,
      failures: 0,
      revenue: 0,
    };
    this.userMetrics = {
      registrations: 0,
      logins: 0,
      activeUsers: new Set(),
    };
    this.ticketMetrics = {
      created: 0,
      validated: 0,
      transferred: 0,
      cancelled: 0,
    };
  }

  /**
   * Track payment
   */
  trackPayment(amount, status, metadata = {}) {
    this.paymentMetrics.attempts++;

    if (status === "success") {
      this.paymentMetrics.successes++;
      this.paymentMetrics.revenue += amount;
      this.metricsCollector.incrementCounter("payment.success", 1, metadata);
      this.metricsCollector.incrementCounter(
        "payment.revenue",
        amount,
        metadata,
      );
    } else {
      this.paymentMetrics.failures++;
      this.metricsCollector.incrementCounter("payment.failure", 1, metadata);

      // Alert on high failure rate
      const failureRate =
        this.paymentMetrics.failures / this.paymentMetrics.attempts;
      if (failureRate > MONITORING_CONFIG.thresholds.paymentFailureRate) {
        this.triggerPaymentAlert(failureRate, metadata);
      }
    }
  }

  /**
   * Track user activity
   */
  trackUserActivity(userId, action, metadata = {}) {
    switch (action) {
      case "registration":
        this.userMetrics.registrations++;
        this.metricsCollector.incrementCounter(
          "user.registration",
          1,
          metadata,
        );
        break;
      case "login":
        this.userMetrics.logins++;
        this.userMetrics.activeUsers.add(userId);
        this.metricsCollector.incrementCounter("user.login", 1, metadata);
        this.metricsCollector.setGauge(
          "user.active",
          this.userMetrics.activeUsers.size,
        );
        break;
      case "logout":
        this.userMetrics.activeUsers.delete(userId);
        this.metricsCollector.setGauge(
          "user.active",
          this.userMetrics.activeUsers.size,
        );
        break;
    }
  }

  /**
   * Track ticket operations
   */
  trackTicketOperation(operation, metadata = {}) {
    switch (operation) {
      case "create":
        this.ticketMetrics.created++;
        this.metricsCollector.incrementCounter("ticket.created", 1, metadata);
        break;
      case "validate":
        this.ticketMetrics.validated++;
        this.metricsCollector.incrementCounter("ticket.validated", 1, metadata);
        break;
      case "transfer":
        this.ticketMetrics.transferred++;
        this.metricsCollector.incrementCounter(
          "ticket.transferred",
          1,
          metadata,
        );
        break;
      case "cancel":
        this.ticketMetrics.cancelled++;
        this.metricsCollector.incrementCounter("ticket.cancelled", 1, metadata);
        break;
    }
  }

  /**
   * Trigger payment alert
   */
  async triggerPaymentAlert(failureRate, metadata) {
    const alertManager = getAlertManager();
    await alertManager.processAlert({
      category: AlertCategory.PAYMENT,
      service: "payment_processing",
      type: "high_failure_rate",
      severity: AlertSeverity.CRITICAL,
      description: `Payment failure rate is ${(failureRate * 100).toFixed(2)}%`,
      metrics: {
        failure_rate: failureRate,
        attempts: this.paymentMetrics.attempts,
        failures: this.paymentMetrics.failures,
      },
      ...metadata,
    });
  }

  /**
   * Get business metrics summary
   */
  getSummary() {
    return {
      payments: {
        ...this.paymentMetrics,
        successRate:
          this.paymentMetrics.attempts > 0
            ? this.paymentMetrics.successes / this.paymentMetrics.attempts
            : 0,
      },
      users: {
        ...this.userMetrics,
        activeCount: this.userMetrics.activeUsers.size,
      },
      tickets: this.ticketMetrics,
    };
  }
}

/**
 * Monitoring service
 */
export class MonitoringService {
  constructor() {
    this.metricsCollector = new MetricsCollector();
    this.transactionMonitor = new TransactionMonitor();
    this.businessMetrics = new BusinessMetricsTracker(this.metricsCollector);
    this.performanceTracker = getPerformanceTracker();
    this.alertManager = getAlertManager();
    this.errorCounts = new Map();
    this.errorTimestamps = [];
    this.lastHealthCheck = null;
    this.initialized = false;
  }

  /**
   * Check if running in test environment
   */
  isTestEnvironment() {
    return (
      process.env.NODE_ENV === "test" ||
      process.env.VITEST === "true" ||
      process.env.CI === "true" ||
      typeof global !== "undefined" && global.__vitest__ ||
      typeof globalThis !== "undefined" && globalThis.__vitest__
    );
  }

  /**
   * Initialize monitoring
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Skip full initialization in test environment
      if (this.isTestEnvironment()) {
        this.initialized = true;
        console.log("Monitoring service initialized (test mode - minimal features)");
        return;
      }

      // Start periodic health checks
      this.startHealthChecks();

      // Start metrics collection
      this.startMetricsCollection();

      // Start performance monitoring
      this.startPerformanceMonitoring();

      this.initialized = true;
      console.log("Monitoring service initialized");
    } catch (error) {
      console.error("Failed to initialize monitoring:", error);
      // In test environment, don't fail on monitoring initialization
      if (this.isTestEnvironment()) {
        this.initialized = true;
        console.log("Monitoring service initialized with degraded features (test mode)");
        return;
      }
      captureException(error);
    }
  }

  /**
   * Start health checks
   */
  startHealthChecks() {
    // Skip in test environment
    if (this.isTestEnvironment()) {
      return;
    }

    setInterval(async () => {
      try {
        const health = await this.checkSystemHealth();
        this.lastHealthCheck = health;

        // Alert on unhealthy status
        if (health.status === "unhealthy") {
          await this.alertManager.processAlert({
            category: AlertCategory.EXTERNAL_SERVICE,
            service: "system",
            type: "health_check_failed",
            severity: AlertSeverity.HIGH,
            description: "System health check failed",
            metrics: health,
          });
        }
      } catch (error) {
        console.error("Health check error:", error);
        captureException(error);
      }
    }, MONITORING_CONFIG.healthCheckInterval);
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    // Skip in test environment
    if (this.isTestEnvironment()) {
      return;
    }

    setInterval(() => {
      try {
        // Collect system metrics
        this.collectSystemMetrics();

        // Reset counters
        this.metricsCollector.reset();
      } catch (error) {
        console.error("Metrics collection error:", error);
        captureException(error);
      }
    }, MONITORING_CONFIG.metricsInterval);
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    // Skip in test environment
    if (this.isTestEnvironment()) {
      return;
    }

    setInterval(async () => {
      try {
        const performanceData = await this.performanceTracker.getMetrics();

        // Check thresholds
        if (
          performanceData.percentiles?.p95 >
          MONITORING_CONFIG.thresholds.responseTime.p95
        ) {
          await this.alertManager.processAlert({
            category: AlertCategory.PERFORMANCE,
            service: "api",
            type: "high_response_time",
            severity: AlertSeverity.MEDIUM,
            description: `API p95 response time is ${performanceData.percentiles.p95}ms`,
            metrics: performanceData.percentiles,
          });
        }
      } catch (error) {
        console.error("Performance monitoring error:", error);
        captureException(error);
      }
    }, MONITORING_CONFIG.performanceCheckInterval);
  }

  /**
   * Check system health
   */
  async checkSystemHealth() {
    const checks = {
      database: "unknown",
      stripe: "unknown",
      brevo: "unknown",
      memory: "unknown",
    };

    // Check memory usage
    if (typeof process !== "undefined" && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;
      checks.memory =
        heapUsedPercent < MONITORING_CONFIG.thresholds.memoryUsage
          ? "healthy"
          : "unhealthy";

      this.metricsCollector.setGauge(
        "system.memory.heap_used",
        memUsage.heapUsed,
      );
      this.metricsCollector.setGauge(
        "system.memory.heap_total",
        memUsage.heapTotal,
      );
      this.metricsCollector.setGauge("system.memory.rss", memUsage.rss);
    }

    // Overall status
    const unhealthyCount = Object.values(checks).filter(
      (s) => s === "unhealthy",
    ).length;
    const status =
      unhealthyCount === 0
        ? "healthy"
        : unhealthyCount > 2
          ? "unhealthy"
          : "degraded";

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    // Process metrics
    if (typeof process !== "undefined") {
      const memUsage = process.memoryUsage();
      this.metricsCollector.setGauge(
        "system.memory.heap_used",
        memUsage.heapUsed,
      );
      this.metricsCollector.setGauge(
        "system.memory.heap_total",
        memUsage.heapTotal,
      );
      this.metricsCollector.setGauge("system.memory.rss", memUsage.rss);

      if (process.cpuUsage) {
        const cpuUsage = process.cpuUsage();
        this.metricsCollector.setGauge("system.cpu.user", cpuUsage.user);
        this.metricsCollector.setGauge("system.cpu.system", cpuUsage.system);
      }
    }

    // Error rates
    const totalErrors = Array.from(this.errorCounts.values()).reduce(
      (a, b) => a + b,
      0,
    );
    this.metricsCollector.setGauge("errors.total", totalErrors);

    // Business metrics
    const businessSummary = this.businessMetrics.getSummary();
    this.metricsCollector.setGauge(
      "business.revenue",
      businessSummary.payments.revenue,
    );
    this.metricsCollector.setGauge(
      "business.users.active",
      businessSummary.users.activeCount,
    );
  }

  /**
   * Track error
   */
  async trackError(error, context = {}) {
    try {
      const errorType = error.name || "UnknownError";
      const count = this.errorCounts.get(errorType) || 0;
      this.errorCounts.set(errorType, count + 1);

      // Track error timestamp for rolling window
      this.errorTimestamps.push(Date.now());

      // Increment counter
      this.metricsCollector.incrementCounter("errors", 1, { type: errorType });

      // Capture in Sentry (skip in test environment)
      if (!this.isTestEnvironment()) {
        captureException(error, context);

        // Add breadcrumb
        addBreadcrumb({
          category: "error",
          message: error.message,
          level: "error",
          data: context,
        });
      }

      // Skip alerting in test environment
      if (this.isTestEnvironment()) {
        return;
      }

      // Check error rate using rolling window (last 5 minutes)
      const now = Date.now();
      const windowSize = 5 * 60 * 1000; // 5 minutes in milliseconds

      // Remove old timestamps outside the window
      this.errorTimestamps = this.errorTimestamps.filter(
        (timestamp) => now - timestamp <= windowSize,
      );

      // Calculate error rate (errors per minute in the last 5 minutes)
      const errorsInWindow = this.errorTimestamps.length;
      const errorRate = errorsInWindow / (windowSize / 60000); // Errors per minute

      if (errorRate > MONITORING_CONFIG.rateLimits.errorLogging) {
        await this.alertManager.processAlert({
          category: AlertCategory.EXTERNAL_SERVICE,
          service: "application",
          type: "high_error_rate",
          severity: AlertSeverity.HIGH,
          description: `Error rate is ${errorRate.toFixed(2)} errors/minute`,
          metrics: {
            error_rate: errorRate,
            errors_in_window: errorsInWindow,
            window_minutes: windowSize / 60000,
            error_types: Object.fromEntries(this.errorCounts),
          },
        });
      }
    } catch (monitoringError) {
      console.error("Error in error tracking:", monitoringError);
      // Don't fail the original operation due to monitoring issues
    }
  }

  /**
   * Track API request
   */
  trackApiRequest(endpoint, method, statusCode, duration, metadata = {}) {
    try {
      // Record in metrics
      this.metricsCollector.incrementCounter("api.requests", 1, {
        endpoint,
        method,
        status: statusCode,
      });

      this.metricsCollector.recordTimer("api.response_time", duration, {
        endpoint,
        method,
      });

      // Track in performance tracker (with error handling)
      try {
        this.performanceTracker.recordMetric(endpoint, duration);
      } catch (perfError) {
        if (!this.isTestEnvironment()) {
          console.error("Performance tracker error:", perfError);
        }
      }

      // Skip external tracking in test environment
      if (this.isTestEnvironment()) {
        return;
      }

      // Add breadcrumb
      addBreadcrumb({
        category: "api",
        message: `${method} ${endpoint}`,
        level: "info",
        data: {
          statusCode,
          duration,
          ...metadata,
        },
      });

      // Check for slow requests
      if (duration > MONITORING_CONFIG.thresholds.responseTime.p99) {
        captureMessage(
          `Slow API request: ${method} ${endpoint} took ${duration}ms`,
          "warning",
          {
            endpoint,
            method,
            statusCode,
            duration,
            ...metadata,
          },
        );
      }
    } catch (monitoringError) {
      if (!this.isTestEnvironment()) {
        console.error("Error in API request tracking:", monitoringError);
      }
      // Don't fail the original operation due to monitoring issues
    }
  }

  /**
   * Start transaction
   */
  startTransaction(id, metadata = {}) {
    this.transactionMonitor.startTransaction(id, metadata);
    return {
      addSpan: (name, duration, spanMetadata = {}) => {
        this.transactionMonitor.addSpan(id, name, duration, spanMetadata);
      },
      end: (status = "success", endMetadata = {}) => {
        return this.transactionMonitor.endTransaction(id, status, endMetadata);
      },
    };
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    try {
      const summary = {
        system: this.metricsCollector.getAllMetrics(),
        transactions: this.transactionMonitor.getStatistics(),
        business: this.businessMetrics.getSummary(),
        health: this.lastHealthCheck,
      };

      // Add performance and alerts with error handling
      try {
        summary.performance = this.performanceTracker.getMetrics();
      } catch (perfError) {
        if (!this.isTestEnvironment()) {
          console.error("Performance tracker error:", perfError);
        }
        summary.performance = {};
      }

      try {
        summary.alerts = this.alertManager.getStatistics();
      } catch (alertError) {
        if (!this.isTestEnvironment()) {
          console.error("Alert manager error:", alertError);
        }
        summary.alerts = {};
      }

      return summary;
    } catch (error) {
      if (!this.isTestEnvironment()) {
        console.error("Error getting metrics summary:", error);
      }
      return {
        system: {},
        transactions: {},
        business: {},
        performance: {},
        alerts: {},
        health: null,
      };
    }
  }

  /**
   * Export metrics for external systems
   */
  exportMetrics(format = "json") {
    const metrics = this.getMetricsSummary();

    switch (format) {
      case "prometheus":
        return this.formatPrometheus(metrics);
      case "datadog":
        return this.formatDatadog(metrics);
      default:
        return metrics;
    }
  }

  /**
   * Format metrics for Prometheus
   */
  formatPrometheus(metrics) {
    const lines = [];

    // System metrics
    Object.entries(metrics.system).forEach(([key, value]) => {
      if (typeof value === "number") {
        lines.push(`alocubano_${key.replace(/\./g, "_")} ${value}`);
      }
    });

    // Business metrics
    lines.push(
      `alocubano_business_revenue_total ${metrics.business.payments.revenue}`,
    );
    lines.push(
      `alocubano_business_users_active ${metrics.business.users.activeCount}`,
    );
    lines.push(
      `alocubano_business_payments_total ${metrics.business.payments.attempts}`,
    );
    lines.push(
      `alocubano_business_payments_success ${metrics.business.payments.successes}`,
    );
    lines.push(
      `alocubano_business_payments_failure ${metrics.business.payments.failures}`,
    );

    return lines.join("\n");
  }

  /**
   * Format metrics for Datadog
   */
  formatDatadog(metrics) {
    const series = [];
    const timestamp = Math.floor(Date.now() / 1000);

    // System metrics
    Object.entries(metrics.system).forEach(([key, value]) => {
      if (typeof value === "number") {
        series.push({
          metric: `alocubano.${key}`,
          points: [[timestamp, value]],
          type: key.includes("counter") ? "count" : "gauge",
        });
      }
    });

    return { series };
  }
}

// Singleton instance
let monitoringService = null;

/**
 * Get or create monitoring service instance
 */
export function getMonitoringService() {
  if (!monitoringService) {
    monitoringService = new MonitoringService();
    monitoringService.initialize();
  }
  return monitoringService;
}

export default {
  MonitoringService,
  getMonitoringService,
  MONITORING_CONFIG,
};
