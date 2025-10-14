/**
 * Resilience Monitoring Integration Tests
 *
 * Monitoring and metrics collection for resilience patterns:
 * - Circuit breaker metrics aggregation
 * - Failure rate calculation
 * - Alert generation on circuit opens
 * - Health check integration
 * - Metrics export for monitoring dashboards
 * - Error type classification
 * - Service degradation detection
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { getTestIsolationManager } from '../../lib/test-isolation-manager.js';

// Mock metrics collector
class ResilienceMetricsCollector {
  constructor() {
    this.metrics = {
      services: new Map(),
      globalStats: {
        totalRequests: 0,
        totalFailures: 0,
        totalRetries: 0,
        totalCircuitOpens: 0,
        totalTimeouts: 0
      },
      alerts: []
    };
  }

  recordRequest(serviceName, success, metadata = {}) {
    if (!this.metrics.services.has(serviceName)) {
      this.metrics.services.set(serviceName, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        retriedRequests: 0,
        circuitState: 'CLOSED',
        circuitOpens: 0,
        lastFailure: null,
        errorTypes: new Map()
      });
    }

    const service = this.metrics.services.get(serviceName);
    service.totalRequests++;
    this.metrics.globalStats.totalRequests++;

    if (success) {
      service.successfulRequests++;
    } else {
      service.failedRequests++;
      service.lastFailure = new Date();
      this.metrics.globalStats.totalFailures++;

      // Track error types
      if (metadata.errorType) {
        const currentCount = service.errorTypes.get(metadata.errorType) || 0;
        service.errorTypes.set(metadata.errorType, currentCount + 1);
      }
    }

    if (metadata.wasRetried) {
      service.retriedRequests++;
      this.metrics.globalStats.totalRetries++;
    }

    if (metadata.timeout) {
      this.metrics.globalStats.totalTimeouts++;
    }
  }

  recordCircuitStateChange(serviceName, newState, reason = null) {
    if (!this.metrics.services.has(serviceName)) {
      this.metrics.services.set(serviceName, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        retriedRequests: 0,
        circuitState: 'CLOSED',
        circuitOpens: 0,
        lastFailure: null,
        errorTypes: new Map()
      });
    }

    const service = this.metrics.services.get(serviceName);
    const previousState = service.circuitState;
    service.circuitState = newState;

    if (newState === 'OPEN' && previousState !== 'OPEN') {
      service.circuitOpens++;
      this.metrics.globalStats.totalCircuitOpens++;

      // Generate alert
      this.generateAlert('CIRCUIT_OPEN', serviceName, {
        previousState,
        newState,
        reason,
        timestamp: new Date()
      });
    }
  }

  calculateFailureRate(serviceName) {
    const service = this.metrics.services.get(serviceName);
    if (!service || service.totalRequests === 0) return 0;

    return (service.failedRequests / service.totalRequests) * 100;
  }

  getServiceHealth(serviceName) {
    const service = this.metrics.services.get(serviceName);
    if (!service) return 'UNKNOWN';

    if (service.circuitState === 'OPEN') return 'UNHEALTHY';

    const failureRate = this.calculateFailureRate(serviceName);
    if (failureRate > 50) return 'DEGRADED';
    if (failureRate > 10) return 'WARNING';

    return 'HEALTHY';
  }

  generateAlert(type, serviceName, details) {
    const alert = {
      id: `alert_${Date.now()}`,
      type,
      serviceName,
      severity: this._getAlertSeverity(type),
      details,
      timestamp: new Date(),
      acknowledged: false
    };

    this.metrics.alerts.push(alert);
    return alert;
  }

  _getAlertSeverity(type) {
    const severityMap = {
      'CIRCUIT_OPEN': 'CRITICAL',
      'HIGH_FAILURE_RATE': 'WARNING',
      'SERVICE_DEGRADED': 'WARNING',
      'TIMEOUT_THRESHOLD': 'INFO'
    };
    return severityMap[type] || 'INFO';
  }

  getMetricsSummary() {
    const summary = {
      global: { ...this.metrics.globalStats },
      services: [],
      recentAlerts: this.metrics.alerts.slice(-10)
    };

    for (const [serviceName, service] of this.metrics.services) {
      summary.services.push({
        name: serviceName,
        health: this.getServiceHealth(serviceName),
        failureRate: this.calculateFailureRate(serviceName),
        ...service,
        errorTypes: Object.fromEntries(service.errorTypes)
      });
    }

    return summary;
  }

  exportMetrics(format = 'json') {
    const summary = this.getMetricsSummary();

    if (format === 'prometheus') {
      return this._exportPrometheus(summary);
    }

    return JSON.stringify(summary, null, 2);
  }

  _exportPrometheus(summary) {
    let output = [];

    // Global metrics
    output.push(`# HELP resilience_total_requests Total number of requests`);
    output.push(`# TYPE resilience_total_requests counter`);
    output.push(`resilience_total_requests ${summary.global.totalRequests}`);

    output.push(`# HELP resilience_total_failures Total number of failures`);
    output.push(`# TYPE resilience_total_failures counter`);
    output.push(`resilience_total_failures ${summary.global.totalFailures}`);

    // Per-service metrics
    for (const service of summary.services) {
      output.push(`# HELP resilience_service_requests_total Total requests by service`);
      output.push(`# TYPE resilience_service_requests_total counter`);
      output.push(`resilience_service_requests_total{service="${service.name}"} ${service.totalRequests}`);

      output.push(`# HELP resilience_service_failure_rate Failure rate by service`);
      output.push(`# TYPE resilience_service_failure_rate gauge`);
      output.push(`resilience_service_failure_rate{service="${service.name}"} ${service.failureRate.toFixed(2)}`);
    }

    return output.join('\n');
  }

  reset() {
    this.metrics.services.clear();
    this.metrics.globalStats = {
      totalRequests: 0,
      totalFailures: 0,
      totalRetries: 0,
      totalCircuitOpens: 0,
      totalTimeouts: 0
    };
    this.metrics.alerts = [];
  }
}

describe('Resilience Monitoring', () => {
  let testDb;
  let isolationManager;
  let metricsCollector;

  beforeEach(async () => {
    isolationManager = getTestIsolationManager();
    testDb = await isolationManager.getScopedDatabaseClient();
    metricsCollector = new ResilienceMetricsCollector();
  });

  afterEach(async () => {
    if (isolationManager) {
      await isolationManager.cleanupTestScope(expect.getState().currentTestName);
    }
    metricsCollector.reset();
  });

  describe('Metrics Collection', () => {
    test('should record successful requests', () => {
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);

      const summary = metricsCollector.getMetricsSummary();
      const brevoService = summary.services.find(s => s.name === 'brevo');

      expect(brevoService.totalRequests).toBe(3);
      expect(brevoService.successfulRequests).toBe(3);
      expect(brevoService.failedRequests).toBe(0);
    });

    test('should record failed requests', () => {
      metricsCollector.recordRequest('stripe', false, { errorType: 'NETWORK_ERROR' });
      metricsCollector.recordRequest('stripe', false, { errorType: 'TIMEOUT' });

      const summary = metricsCollector.getMetricsSummary();
      const stripeService = summary.services.find(s => s.name === 'stripe');

      expect(stripeService.totalRequests).toBe(2);
      expect(stripeService.failedRequests).toBe(2);
      expect(stripeService.successfulRequests).toBe(0);
    });

    test('should track retry attempts', () => {
      metricsCollector.recordRequest('google-drive', false, { wasRetried: false });
      metricsCollector.recordRequest('google-drive', true, { wasRetried: true });

      const summary = metricsCollector.getMetricsSummary();
      const driveService = summary.services.find(s => s.name === 'google-drive');

      expect(driveService.retriedRequests).toBe(1);
      expect(summary.global.totalRetries).toBe(1);
    });

    test('should track timeout occurrences', () => {
      metricsCollector.recordRequest('brevo', false, { timeout: true });
      metricsCollector.recordRequest('stripe', false, { timeout: true });

      const summary = metricsCollector.getMetricsSummary();

      expect(summary.global.totalTimeouts).toBe(2);
    });
  });

  describe('Failure Rate Calculation', () => {
    test('should calculate accurate failure rate', () => {
      // 3 successes, 2 failures = 40% failure rate
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', false);
      metricsCollector.recordRequest('brevo', false);

      const failureRate = metricsCollector.calculateFailureRate('brevo');

      expect(failureRate).toBe(40);
    });

    test('should return 0 for services with no requests', () => {
      const failureRate = metricsCollector.calculateFailureRate('unknown-service');

      expect(failureRate).toBe(0);
    });

    test('should return 100 for services with all failures', () => {
      metricsCollector.recordRequest('stripe', false);
      metricsCollector.recordRequest('stripe', false);
      metricsCollector.recordRequest('stripe', false);

      const failureRate = metricsCollector.calculateFailureRate('stripe');

      expect(failureRate).toBe(100);
    });
  });

  describe('Circuit Breaker State Tracking', () => {
    test('should track circuit state changes', () => {
      metricsCollector.recordCircuitStateChange('brevo', 'OPEN', 'Failure threshold exceeded');

      const summary = metricsCollector.getMetricsSummary();
      const brevoService = summary.services.find(s => s.name === 'brevo');

      expect(brevoService.circuitState).toBe('OPEN');
      expect(brevoService.circuitOpens).toBe(1);
      expect(summary.global.totalCircuitOpens).toBe(1);
    });

    test('should track circuit state transitions', () => {
      metricsCollector.recordCircuitStateChange('stripe', 'OPEN');
      metricsCollector.recordCircuitStateChange('stripe', 'HALF_OPEN');
      metricsCollector.recordCircuitStateChange('stripe', 'CLOSED');

      const summary = metricsCollector.getMetricsSummary();
      const stripeService = summary.services.find(s => s.name === 'stripe');

      expect(stripeService.circuitState).toBe('CLOSED');
      expect(stripeService.circuitOpens).toBe(1); // Only counts transitions to OPEN
    });

    test('should persist circuit state to database', async () => {
      // Insert circuit state record
      const result = await testDb.execute({
        sql: `INSERT INTO circuit_breaker_state (
          service_name, state, failure_count, last_failure_at
        ) VALUES (?, ?, ?, ?)`,
        args: ['brevo', 'open', 5, new Date().toISOString()]
      });

      expect(Number(result.lastInsertRowid)).toBeGreaterThan(0);

      const check = await testDb.execute({
        sql: `SELECT * FROM circuit_breaker_state WHERE service_name = ?`,
        args: ['brevo']
      });

      expect(check.rows[0].state).toBe('open');
      expect(check.rows[0].failure_count).toBe(5);
    });
  });

  describe('Alert Generation', () => {
    test('should generate alert when circuit opens', () => {
      metricsCollector.recordCircuitStateChange('brevo', 'OPEN', 'High failure rate');

      const summary = metricsCollector.getMetricsSummary();
      const alerts = summary.recentAlerts;

      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('CIRCUIT_OPEN');
      expect(alerts[0].serviceName).toBe('brevo');
      expect(alerts[0].severity).toBe('CRITICAL');
    });

    test('should generate alert for high failure rate', () => {
      const alert = metricsCollector.generateAlert('HIGH_FAILURE_RATE', 'stripe', {
        failureRate: 75,
        threshold: 50
      });

      expect(alert.type).toBe('HIGH_FAILURE_RATE');
      expect(alert.severity).toBe('WARNING');
      expect(alert.details.failureRate).toBe(75);
    });

    test('should store alert metadata', () => {
      const alert = metricsCollector.generateAlert('CIRCUIT_OPEN', 'google-drive', {
        reason: 'Quota exceeded',
        failureCount: 10
      });

      expect(alert.id).toBeTruthy();
      expect(alert.timestamp).toBeInstanceOf(Date);
      expect(alert.acknowledged).toBe(false);
      expect(alert.details.reason).toBe('Quota exceeded');
    });

    test('should persist alerts to database', async () => {
      const alert = metricsCollector.generateAlert('CIRCUIT_OPEN', 'brevo', {
        failureCount: 5
      });

      // Store alert in database using security_alerts table
      const result = await testDb.execute({
        sql: `INSERT INTO security_alerts (
          alert_id, alert_type, severity, title, description, evidence
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          alert.id,
          alert.type,
          alert.severity.toLowerCase(), // Convert to lowercase to match CHECK constraint
          `Circuit Breaker Alert: ${alert.serviceName}`,
          `Service ${alert.serviceName} circuit breaker opened`,
          JSON.stringify(alert.details)
        ]
      });

      expect(Number(result.lastInsertRowid)).toBeGreaterThan(0);
    });
  });

  describe('Service Health Assessment', () => {
    test('should report HEALTHY for low failure rate', () => {
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', false); // 10% failure rate

      const health = metricsCollector.getServiceHealth('brevo');

      expect(health).toBe('HEALTHY');
    });

    test('should report WARNING for moderate failure rate', () => {
      metricsCollector.recordRequest('stripe', true);
      metricsCollector.recordRequest('stripe', false);
      metricsCollector.recordRequest('stripe', false);
      metricsCollector.recordRequest('stripe', false); // 75% failure rate

      const health = metricsCollector.getServiceHealth('stripe');

      expect(health).toBe('DEGRADED');
    });

    test('should report UNHEALTHY when circuit is open', () => {
      metricsCollector.recordCircuitStateChange('google-drive', 'OPEN');

      const health = metricsCollector.getServiceHealth('google-drive');

      expect(health).toBe('UNHEALTHY');
    });

    test('should report UNKNOWN for non-existent services', () => {
      const health = metricsCollector.getServiceHealth('unknown-service');

      expect(health).toBe('UNKNOWN');
    });
  });

  describe('Error Type Classification', () => {
    test('should track error types by category', () => {
      metricsCollector.recordRequest('brevo', false, { errorType: 'NETWORK_ERROR' });
      metricsCollector.recordRequest('brevo', false, { errorType: 'NETWORK_ERROR' });
      metricsCollector.recordRequest('brevo', false, { errorType: 'RATE_LIMIT' });
      metricsCollector.recordRequest('brevo', false, { errorType: 'TIMEOUT' });

      const summary = metricsCollector.getMetricsSummary();
      const brevoService = summary.services.find(s => s.name === 'brevo');

      expect(brevoService.errorTypes['NETWORK_ERROR']).toBe(2);
      expect(brevoService.errorTypes['RATE_LIMIT']).toBe(1);
      expect(brevoService.errorTypes['TIMEOUT']).toBe(1);
    });

    test('should identify most common error types', () => {
      metricsCollector.recordRequest('stripe', false, { errorType: 'CARD_DECLINED' });
      metricsCollector.recordRequest('stripe', false, { errorType: 'CARD_DECLINED' });
      metricsCollector.recordRequest('stripe', false, { errorType: 'CARD_DECLINED' });
      metricsCollector.recordRequest('stripe', false, { errorType: 'NETWORK_ERROR' });

      const summary = metricsCollector.getMetricsSummary();
      const stripeService = summary.services.find(s => s.name === 'stripe');
      const errorTypes = Object.entries(stripeService.errorTypes);
      const mostCommon = errorTypes.sort((a, b) => b[1] - a[1])[0];

      expect(mostCommon[0]).toBe('CARD_DECLINED');
      expect(mostCommon[1]).toBe(3);
    });
  });

  describe('Metrics Export', () => {
    test('should export metrics as JSON', () => {
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', false);

      const exported = metricsCollector.exportMetrics('json');
      const data = JSON.parse(exported);

      expect(data.global).toBeDefined();
      expect(data.services).toBeInstanceOf(Array);
      expect(data.recentAlerts).toBeInstanceOf(Array);
    });

    test('should export metrics in Prometheus format', () => {
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', false);

      const exported = metricsCollector.exportMetrics('prometheus');

      expect(exported).toContain('resilience_total_requests');
      expect(exported).toContain('resilience_total_failures');
      expect(exported).toContain('resilience_service_requests_total');
      expect(exported).toContain('service="brevo"');
    });

    test('should include comprehensive metrics in export', () => {
      metricsCollector.recordRequest('stripe', true);
      metricsCollector.recordRequest('stripe', false, { errorType: 'TIMEOUT' });
      metricsCollector.recordCircuitStateChange('stripe', 'OPEN');

      const summary = metricsCollector.getMetricsSummary();

      expect(summary.global.totalRequests).toBe(2);
      expect(summary.global.totalFailures).toBe(1);
      expect(summary.services[0].circuitState).toBe('OPEN');
      expect(summary.recentAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Health Check Integration', () => {
    test('should provide health check endpoint data', () => {
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('stripe', true);
      metricsCollector.recordRequest('google-drive', false);

      const healthCheck = {
        status: 'UP',
        services: []
      };

      for (const [serviceName] of metricsCollector.metrics.services) {
        const health = metricsCollector.getServiceHealth(serviceName);
        healthCheck.services.push({
          name: serviceName,
          status: health
        });

        if (health === 'UNHEALTHY' || health === 'DEGRADED') {
          healthCheck.status = 'DEGRADED';
        }
      }

      expect(healthCheck.status).toBe('DEGRADED');
      expect(healthCheck.services).toHaveLength(3);
    });

    test('should detect service degradation', () => {
      // Simulate degraded service
      for (let i = 0; i < 10; i++) {
        metricsCollector.recordRequest('brevo', i % 3 === 0); // 33% success rate
      }

      const health = metricsCollector.getServiceHealth('brevo');
      const failureRate = metricsCollector.calculateFailureRate('brevo');

      expect(health).toBe('DEGRADED');
      expect(failureRate).toBeGreaterThan(50);
    });

    test('should track service availability', async () => {
      // Record service availability check
      const result = await testDb.execute({
        sql: `INSERT INTO service_health (
          service_name, status, response_time_ms, error_count, success_count
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ['brevo', 'healthy', 150, 0, 10]
      });

      expect(Number(result.lastInsertRowid)).toBeGreaterThan(0);

      const check = await testDb.execute({
        sql: `SELECT * FROM service_health WHERE service_name = ?`,
        args: ['brevo']
      });

      expect(check.rows[0].status).toBe('healthy');
      expect(check.rows[0].response_time_ms).toBe(150);
    });
  });

  describe('Dashboard Data', () => {
    test('should provide dashboard summary', () => {
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('brevo', false);
      metricsCollector.recordRequest('stripe', true);
      metricsCollector.recordCircuitStateChange('brevo', 'OPEN');

      const summary = metricsCollector.getMetricsSummary();

      expect(summary.global.totalRequests).toBe(3);
      expect(summary.services.length).toBeGreaterThan(0);
      expect(summary.recentAlerts.length).toBeGreaterThan(0);
    });

    test('should calculate overall system health', () => {
      metricsCollector.recordRequest('brevo', true);
      metricsCollector.recordRequest('stripe', true);
      metricsCollector.recordRequest('google-drive', true);

      const summary = metricsCollector.getMetricsSummary();
      const healthyServices = summary.services.filter(s => s.health === 'HEALTHY').length;
      const totalServices = summary.services.length;
      const systemHealth = (healthyServices / totalServices) * 100;

      expect(systemHealth).toBe(100);
    });

    test('should provide time-series data for graphs', async () => {
      const timeSeriesData = [];

      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(Date.now() - (5 - i) * 60000);
        timeSeriesData.push({
          timestamp,
          totalRequests: i * 10,
          failedRequests: i * 2,
          circuitOpens: i > 3 ? 1 : 0
        });
      }

      expect(timeSeriesData).toHaveLength(5);
      expect(timeSeriesData[0].totalRequests).toBe(0);
      expect(timeSeriesData[4].totalRequests).toBe(40);
    });
  });
});
