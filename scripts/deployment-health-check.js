#!/usr/bin/env node

/**
 * Deployment Health Check Script
 *
 * Comprehensive health validation and monitoring for enterprise database deployment:
 * - Connection system validation
 * - Performance baseline comparison
 * - Error rate monitoring
 * - Success criteria verification
 * - Automated rollback triggers
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';
import { getDatabaseConfiguration } from '../lib/database-config.js';
import { getFeatureFlagManager, isFeatureEnabled } from '../lib/feature-flags.js';
import { getDatabaseClient } from '../lib/database.js';
import { getConnectionManager, getPoolHealthStatus, getPoolStatistics } from '../lib/connection-manager.js';
import { DatabaseCircuitBreaker } from '../lib/circuit-breaker.js';
import { getMonitoringService } from '../lib/monitoring/monitoring-service.js';

/**
 * Health check categories and their weights
 */
const HEALTH_CATEGORIES = {
  DATABASE_CONNECTIVITY: { weight: 0.3, critical: true },
  CONNECTION_POOL: { weight: 0.25, critical: false },
  CIRCUIT_BREAKER: { weight: 0.15, critical: false },
  PERFORMANCE: { weight: 0.2, critical: false },
  FEATURE_FLAGS: { weight: 0.1, critical: false }
};

/**
 * Performance thresholds for different environments
 */
const PERFORMANCE_THRESHOLDS = {
  development: {
    maxResponseTime: 2000,    // 2 seconds
    maxErrorRate: 0.05,       // 5%
    minSuccessRate: 0.90,     // 90%
    maxMemoryUsage: 0.8       // 80%
  },
  preview: {
    maxResponseTime: 1500,    // 1.5 seconds
    maxErrorRate: 0.03,       // 3%
    minSuccessRate: 0.95,     // 95%
    maxMemoryUsage: 0.75      // 75%
  },
  production: {
    maxResponseTime: 1000,    // 1 second
    maxErrorRate: 0.01,       // 1%
    minSuccessRate: 0.99,     // 99%
    maxMemoryUsage: 0.7       // 70%
  },
  test: {
    maxResponseTime: 3000,    // 3 seconds (more lenient for tests)
    maxErrorRate: 0.1,        // 10%
    minSuccessRate: 0.85,     // 85%
    maxMemoryUsage: 0.9       // 90%
  }
};

/**
 * Success criteria for deployment validation
 */
const SUCCESS_CRITERIA = {
  // Minimum health score (0-100)
  minHealthScore: 85,

  // Maximum consecutive failures before rollback
  maxConsecutiveFailures: 3,

  // Minimum duration for stable health (ms)
  minStableDuration: 60000, // 1 minute

  // Required uptime percentage
  minUptimePercentage: 99.0,

  // Performance regression tolerance
  maxPerformanceRegression: 0.2 // 20% slower than baseline
};

/**
 * Health check result structure
 */
class HealthCheckResult {
  constructor(category, name) {
    this.category = category;
    this.name = name;
    this.status = 'unknown';
    this.score = 0;
    this.message = '';
    this.details = {};
    this.metrics = {};
    this.timestamp = Date.now();
    this.duration = 0;
    this.critical = HEALTH_CATEGORIES[category]?.critical || false;
  }

  setSuccess(message = 'Check passed', details = {}, metrics = {}) {
    this.status = 'success';
    this.score = 100;
    this.message = message;
    this.details = details;
    this.metrics = metrics;
  }

  setWarning(message = 'Check passed with warnings', score = 70, details = {}, metrics = {}) {
    this.status = 'warning';
    this.score = Math.max(0, Math.min(100, score));
    this.message = message;
    this.details = details;
    this.metrics = metrics;
  }

  setFailure(message = 'Check failed', details = {}, metrics = {}) {
    this.status = 'failure';
    this.score = 0;
    this.message = message;
    this.details = details;
    this.metrics = metrics;
  }

  setDuration(startTime) {
    this.duration = Date.now() - startTime;
  }
}

/**
 * Deployment Health Monitor
 */
export class DeploymentHealthCheck {
  constructor(options = {}) {
    this.config = getDatabaseConfiguration();
    this.featureFlags = getFeatureFlagManager();
    this.monitoring = getMonitoringService();
    this.environment = this.config.environment;
    this.thresholds = PERFORMANCE_THRESHOLDS[this.environment] || PERFORMANCE_THRESHOLDS.production;

    // Options
    this.continuous = options.continuous || false;
    this.interval = options.interval || 30000; // 30 seconds
    this.maxDuration = options.maxDuration || 600000; // 10 minutes
    this.enableRollback = options.enableRollback || false;
    this.baselineFile = options.baselineFile || null;

    // State
    this.isRunning = false;
    this.shouldStop = false;
    this.checkTimer = null;
    this.results = [];
    this.baseline = null;
    this.consecutiveFailures = 0;
    this.lastHealthScore = 0;
    this.stableHealthStart = null;
    this.reportPath = null;
  }

  /**
   * Start health check monitoring
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Health check is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;

    try {
      logger.log('Starting deployment health check', {
        environment: this.environment,
        continuous: this.continuous,
        enableRollback: this.enableRollback
      });

      // Load baseline if provided
      if (this.baselineFile) {
        await this.loadBaseline();
      }

      // Run initial check
      const initialResult = await this.runHealthCheck();
      this.evaluateResult(initialResult);

      if (this.continuous) {
        await this.runContinuousMonitoring();
      }

      return this.generateReport();

    } catch (error) {
      logger.error('Health check failed:', error.message);
      throw error;

    } finally {
      this.isRunning = false;
      this.stopMonitoring();
    }
  }

  /**
   * Run a single comprehensive health check
   */
  async runHealthCheck() {
    const startTime = Date.now();
    const results = [];

    logger.debug('Running comprehensive health check...');

    // Database connectivity checks
    results.push(...await this.checkDatabaseConnectivity());

    // Connection pool checks
    if (isFeatureEnabled('ENABLE_CONNECTION_POOL')) {
      results.push(...await this.checkConnectionPool());
    }

    // Circuit breaker checks
    if (isFeatureEnabled('ENABLE_CIRCUIT_BREAKER')) {
      results.push(...await this.checkCircuitBreaker());
    }

    // Performance checks
    results.push(...await this.checkPerformance());

    // Feature flag checks
    results.push(...await this.checkFeatureFlags());

    // Calculate overall health score
    const healthScore = this.calculateHealthScore(results);
    const overallStatus = this.determineOverallStatus(results, healthScore);

    const checkResult = {
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      healthScore,
      status: overallStatus,
      results,
      environment: this.environment,
      thresholds: this.thresholds,
      summary: this.generateSummary(results)
    };

    this.results.push(checkResult);
    this.lastHealthScore = healthScore;

    logger.log(`Health check completed: ${overallStatus} (score: ${healthScore})`, {
      duration: checkResult.duration,
      checks: results.length
    });

    return checkResult;
  }

  /**
   * Check database connectivity and basic operations
   */
  async checkDatabaseConnectivity() {
    const results = [];

    // Basic connectivity test
    const connectivityCheck = new HealthCheckResult('DATABASE_CONNECTIVITY', 'basic_connectivity');
    const startTime = Date.now();

    try {
      const client = await getDatabaseClient();
      const result = await client.execute('SELECT 1 as test, datetime("now") as timestamp');

      if (result.rows && result.rows.length > 0) {
        connectivityCheck.setSuccess('Database connectivity verified', {
          rows: result.rows.length,
          timestamp: result.rows[0].timestamp
        });
      } else {
        connectivityCheck.setFailure('Database query returned no results');
      }

    } catch (error) {
      connectivityCheck.setFailure(`Database connectivity failed: ${error.message}`, {
        error: error.message,
        code: error.code
      });
    }

    connectivityCheck.setDuration(startTime);
    results.push(connectivityCheck);

    // Connection latency test
    const latencyCheck = new HealthCheckResult('DATABASE_CONNECTIVITY', 'connection_latency');
    const latencyStart = Date.now();

    try {
      const client = await getDatabaseClient();
      await client.execute('SELECT 1');
      const latency = Date.now() - latencyStart;

      if (latency < this.thresholds.maxResponseTime / 2) {
        latencyCheck.setSuccess(`Low latency: ${latency}ms`, { latency });
      } else if (latency < this.thresholds.maxResponseTime) {
        latencyCheck.setWarning(`Moderate latency: ${latency}ms`, 80, { latency });
      } else {
        latencyCheck.setFailure(`High latency: ${latency}ms`, { latency });
      }

    } catch (error) {
      latencyCheck.setFailure(`Latency test failed: ${error.message}`);
    }

    latencyCheck.setDuration(latencyStart);
    results.push(latencyCheck);

    return results;
  }

  /**
   * Check connection pool health and performance
   */
  async checkConnectionPool() {
    const results = [];

    // Pool statistics check
    const statsCheck = new HealthCheckResult('CONNECTION_POOL', 'pool_statistics');
    const startTime = Date.now();

    try {
      const stats = getPoolStatistics();

      if (stats.status === 'not_initialized') {
        statsCheck.setWarning('Connection pool not initialized', 60, stats);
      } else {
        const utilizationRate = stats.pool.activeLeases / stats.pool.maxConnections;

        if (utilizationRate < 0.8) {
          statsCheck.setSuccess('Pool utilization healthy', stats, {
            utilizationRate: Math.round(utilizationRate * 100)
          });
        } else if (utilizationRate < 0.9) {
          statsCheck.setWarning('High pool utilization', 70, stats, {
            utilizationRate: Math.round(utilizationRate * 100)
          });
        } else {
          statsCheck.setFailure('Pool utilization critical', stats, {
            utilizationRate: Math.round(utilizationRate * 100)
          });
        }
      }

    } catch (error) {
      statsCheck.setFailure(`Pool statistics check failed: ${error.message}`);
    }

    statsCheck.setDuration(startTime);
    results.push(statsCheck);

    // Pool health status check
    const healthCheck = new HealthCheckResult('CONNECTION_POOL', 'pool_health');
    const healthStart = Date.now();

    try {
      const health = await getPoolHealthStatus();

      if (health.status === 'healthy') {
        healthCheck.setSuccess('Pool health good', health);
      } else if (health.status === 'not_initialized') {
        healthCheck.setWarning('Pool not initialized', 60, health);
      } else {
        healthCheck.setFailure(`Pool unhealthy: ${health.issues?.join(', ') || 'Unknown issues'}`, health);
      }

    } catch (error) {
      healthCheck.setFailure(`Pool health check failed: ${error.message}`);
    }

    healthCheck.setDuration(healthStart);
    results.push(healthCheck);

    return results;
  }

  /**
   * Check circuit breaker status and metrics
   */
  async checkCircuitBreaker() {
    const results = [];

    const cbCheck = new HealthCheckResult('CIRCUIT_BREAKER', 'circuit_breaker_status');
    const startTime = Date.now();

    try {
      const circuitBreaker = new DatabaseCircuitBreaker();
      const metrics = circuitBreaker.getMetrics();

      if (metrics.state === 'CLOSED' && metrics.isHealthy) {
        cbCheck.setSuccess('Circuit breaker healthy', metrics);
      } else if (metrics.state === 'HALF_OPEN') {
        cbCheck.setWarning('Circuit breaker in recovery', 80, metrics);
      } else if (metrics.state === 'OPEN') {
        cbCheck.setFailure('Circuit breaker open', metrics);
      } else {
        cbCheck.setWarning('Circuit breaker in unknown state', 60, metrics);
      }

    } catch (error) {
      cbCheck.setFailure(`Circuit breaker check failed: ${error.message}`);
    }

    cbCheck.setDuration(startTime);
    results.push(cbCheck);

    return results;
  }

  /**
   * Check system performance metrics
   */
  async checkPerformance() {
    const results = [];

    // Memory usage check
    const memoryCheck = new HealthCheckResult('PERFORMANCE', 'memory_usage');
    const startTime = Date.now();

    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;

        if (heapUsedPercent < this.thresholds.maxMemoryUsage * 0.7) {
          memoryCheck.setSuccess(`Memory usage healthy: ${Math.round(heapUsedPercent * 100)}%`, {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            heapUsedPercent: Math.round(heapUsedPercent * 100)
          });
        } else if (heapUsedPercent < this.thresholds.maxMemoryUsage) {
          memoryCheck.setWarning(`Memory usage elevated: ${Math.round(heapUsedPercent * 100)}%`, 75, {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            heapUsedPercent: Math.round(heapUsedPercent * 100)
          });
        } else {
          memoryCheck.setFailure(`Memory usage critical: ${Math.round(heapUsedPercent * 100)}%`, {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            heapUsedPercent: Math.round(heapUsedPercent * 100)
          });
        }
      } else {
        memoryCheck.setWarning('Memory usage monitoring not available', 80);
      }

    } catch (error) {
      memoryCheck.setFailure(`Memory check failed: ${error.message}`);
    }

    memoryCheck.setDuration(startTime);
    results.push(memoryCheck);

    // Response time check (if monitoring is available)
    const responseTimeCheck = new HealthCheckResult('PERFORMANCE', 'response_time');
    const responseStart = Date.now();

    try {
      // Perform a test database operation and measure time
      const testStart = Date.now();
      const client = await getDatabaseClient();
      await client.execute('SELECT count(*) as count FROM sqlite_master WHERE type="table"');
      const responseTime = Date.now() - testStart;

      if (responseTime < this.thresholds.maxResponseTime * 0.5) {
        responseTimeCheck.setSuccess(`Response time excellent: ${responseTime}ms`, { responseTime });
      } else if (responseTime < this.thresholds.maxResponseTime) {
        responseTimeCheck.setWarning(`Response time acceptable: ${responseTime}ms`, 80, { responseTime });
      } else {
        responseTimeCheck.setFailure(`Response time poor: ${responseTime}ms`, { responseTime });
      }

    } catch (error) {
      responseTimeCheck.setFailure(`Response time check failed: ${error.message}`);
    }

    responseTimeCheck.setDuration(responseStart);
    results.push(responseTimeCheck);

    return results;
  }

  /**
   * Check feature flag system health
   */
  async checkFeatureFlags() {
    const results = [];

    const flagCheck = new HealthCheckResult('FEATURE_FLAGS', 'feature_flag_system');
    const startTime = Date.now();

    try {
      const stats = this.featureFlags.getStatistics();

      if (stats.totalFlags > 0) {
        flagCheck.setSuccess('Feature flag system operational', stats, {
          totalFlags: stats.totalFlags,
          overrides: stats.overrides
        });
      } else {
        flagCheck.setWarning('No feature flags configured', 70, stats);
      }

    } catch (error) {
      flagCheck.setFailure(`Feature flag check failed: ${error.message}`);
    }

    flagCheck.setDuration(startTime);
    results.push(flagCheck);

    return results;
  }

  /**
   * Calculate weighted health score
   */
  calculateHealthScore(results) {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const result of results) {
      const categoryWeight = HEALTH_CATEGORIES[result.category]?.weight || 0.1;
      totalWeight += categoryWeight;
      weightedScore += result.score * categoryWeight;
    }

    return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
  }

  /**
   * Determine overall status based on results
   */
  determineOverallStatus(results, healthScore) {
    const criticalFailures = results.filter(r => r.critical && r.status === 'failure');
    const failures = results.filter(r => r.status === 'failure');
    const warnings = results.filter(r => r.status === 'warning');

    if (criticalFailures.length > 0) {
      return 'critical';
    } else if (failures.length > 0 || healthScore < 60) {
      return 'unhealthy';
    } else if (warnings.length > 0 || healthScore < 80) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Generate summary of check results
   */
  generateSummary(results) {
    const summary = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      warning: results.filter(r => r.status === 'warning').length,
      failure: results.filter(r => r.status === 'failure').length,
      critical: results.filter(r => r.critical && r.status === 'failure').length,
      categories: {}
    };

    // Group by category
    for (const category of Object.keys(HEALTH_CATEGORIES)) {
      const categoryResults = results.filter(r => r.category === category);
      summary.categories[category] = {
        total: categoryResults.length,
        success: categoryResults.filter(r => r.status === 'success').length,
        warning: categoryResults.filter(r => r.status === 'warning').length,
        failure: categoryResults.filter(r => r.status === 'failure').length,
        avgScore: categoryResults.length > 0 ?
          Math.round(categoryResults.reduce((sum, r) => sum + r.score, 0) / categoryResults.length) : 0
      };
    }

    return summary;
  }

  /**
   * Run continuous monitoring
   */
  async runContinuousMonitoring() {
    const startTime = Date.now();

    logger.log('Starting continuous health monitoring', {
      interval: this.interval,
      maxDuration: this.maxDuration
    });

    while (!this.shouldStop && (Date.now() - startTime) < this.maxDuration) {
      await this.delay(this.interval);

      if (this.shouldStop) break;

      try {
        const result = await this.runHealthCheck();
        this.evaluateResult(result);

      } catch (error) {
        logger.error('Continuous health check error:', error.message);
        this.consecutiveFailures++;

        if (this.consecutiveFailures >= SUCCESS_CRITERIA.maxConsecutiveFailures) {
          logger.error('Maximum consecutive failures reached, stopping monitoring');
          break;
        }
      }
    }
  }

  /**
   * Evaluate health check result and take action
   */
  evaluateResult(result) {
    const { status, healthScore } = result;

    // Track consecutive failures
    if (status === 'critical' || status === 'unhealthy') {
      this.consecutiveFailures++;
      this.stableHealthStart = null;
    } else {
      this.consecutiveFailures = 0;

      // Track stable health duration
      if (healthScore >= SUCCESS_CRITERIA.minHealthScore) {
        if (!this.stableHealthStart) {
          this.stableHealthStart = Date.now();
        }
      } else {
        this.stableHealthStart = null;
      }
    }

    // Check for rollback conditions
    if (this.enableRollback && this.shouldTriggerRollback(result)) {
      logger.error('Rollback conditions met, triggering emergency rollback');
      this.triggerRollback(result);
    }

    // Log significant status changes
    if (this.results.length > 1) {
      const previousStatus = this.results[this.results.length - 2].status;
      if (status !== previousStatus) {
        logger.log(`Health status changed: ${previousStatus} → ${status}`, {
          healthScore,
          consecutiveFailures: this.consecutiveFailures
        });
      }
    }
  }

  /**
   * Check if rollback should be triggered
   */
  shouldTriggerRollback(result) {
    // Critical failures should trigger immediate rollback
    if (result.status === 'critical') {
      return true;
    }

    // Too many consecutive failures
    if (this.consecutiveFailures >= SUCCESS_CRITERIA.maxConsecutiveFailures) {
      return true;
    }

    // Health score below minimum for extended period
    if (result.healthScore < SUCCESS_CRITERIA.minHealthScore && this.results.length >= 3) {
      const recentScores = this.results.slice(-3).map(r => r.healthScore);
      if (recentScores.every(score => score < SUCCESS_CRITERIA.minHealthScore)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Trigger emergency rollback
   */
  async triggerRollback(result) {
    try {
      logger.warn('Triggering emergency rollback due to health check failures');

      // Disable enterprise features
      this.featureFlags.emergencyKillswitch('health_check_failure');

      // Record rollback event
      const rollbackEvent = {
        timestamp: Date.now(),
        reason: 'health_check_failure',
        triggeringResult: result,
        consecutiveFailures: this.consecutiveFailures
      };

      // Add to results for reporting
      this.results.push({
        ...result,
        rollbackTriggered: true,
        rollbackEvent
      });

      logger.warn('Emergency rollback completed');

    } catch (error) {
      logger.error('Emergency rollback failed:', error.message);
    }
  }

  /**
   * Load performance baseline from file
   */
  async loadBaseline() {
    try {
      if (!this.baselineFile) return;

      const baselineData = await fs.readFile(this.baselineFile, 'utf8');
      this.baseline = JSON.parse(baselineData);

      logger.log('Performance baseline loaded', {
        file: this.baselineFile,
        timestamp: this.baseline.timestamp
      });

    } catch (error) {
      logger.warn(`Failed to load baseline: ${error.message}`);
    }
  }

  /**
   * Generate comprehensive health report
   */
  async generateReport() {
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        environment: this.environment,
        duration: this.results.length > 0 ? Date.now() - this.results[0].timestamp : 0,
        checkCount: this.results.length,
        version: process.env.npm_package_version || 'unknown'
      },
      summary: {
        overallStatus: this.results.length > 0 ? this.results[this.results.length - 1].status : 'unknown',
        currentHealthScore: this.lastHealthScore,
        consecutiveFailures: this.consecutiveFailures,
        stableHealthDuration: this.stableHealthStart ? Date.now() - this.stableHealthStart : 0,
        criteriasMet: this.evaluateSuccessCriteria()
      },
      thresholds: this.thresholds,
      successCriteria: SUCCESS_CRITERIA,
      results: this.results,
      baseline: this.baseline,
      featureFlags: this.featureFlags.getStatistics()
    };

    // Save report to file
    this.reportPath = path.join(process.cwd(), '.tmp', `health-check-${Date.now()}.json`);

    try {
      await fs.mkdir(path.dirname(this.reportPath), { recursive: true });
      await fs.writeFile(this.reportPath, JSON.stringify(report, null, 2));
      logger.log(`Health check report saved: ${this.reportPath}`);
    } catch (error) {
      logger.warn(`Failed to save health check report: ${error.message}`);
    }

    return report;
  }

  /**
   * Evaluate if success criteria are met
   */
  evaluateSuccessCriteria() {
    const criteria = {
      minHealthScore: this.lastHealthScore >= SUCCESS_CRITERIA.minHealthScore,
      maxConsecutiveFailures: this.consecutiveFailures < SUCCESS_CRITERIA.maxConsecutiveFailures,
      minStableDuration: this.stableHealthStart ?
        (Date.now() - this.stableHealthStart) >= SUCCESS_CRITERIA.minStableDuration : false,
      noRollbackTriggered: !this.results.some(r => r.rollbackTriggered)
    };

    criteria.allMet = Object.values(criteria).every(met => met);

    return criteria;
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.shouldStop = true;
    this.stopMonitoring();
  }

  /**
   * Stop monitoring timers
   */
  stopMonitoring() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Utility delay function
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Run deployment health check
 */
export async function runDeploymentHealthCheck(options = {}) {
  const healthCheck = new DeploymentHealthCheck(options);

  // Handle process signals for graceful shutdown
  const signalHandler = () => {
    logger.warn('Health check interrupted by signal, stopping...');
    healthCheck.stop();
  };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  try {
    const report = await healthCheck.start();
    return report;
  } finally {
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = {
    continuous: process.argv.includes('--continuous'),
    enableRollback: process.argv.includes('--enable-rollback'),
    interval: parseInt(process.argv.find(arg => arg.startsWith('--interval='))?.split('=')[1] || '30000', 10),
    maxDuration: parseInt(process.argv.find(arg => arg.startsWith('--duration='))?.split('=')[1] || '600000', 10),
    baselineFile: process.argv.find(arg => arg.startsWith('--baseline='))?.split('=')[1]
  };

  try {
    logger.log('Starting deployment health check...');
    const report = await runDeploymentHealthCheck(options);

    const { summary } = report;
    logger.log('Health check completed:', {
      status: summary.overallStatus,
      healthScore: summary.currentHealthScore,
      criteriasMet: summary.criteriasMet.allMet
    });

    // Exit with appropriate code
    const exitCode = summary.criteriasMet.allMet ? 0 : 1;
    process.exit(exitCode);

  } catch (error) {
    logger.error('Health check failed:', error.message);
    process.exit(1);
  }
}

export { HealthCheckResult, HEALTH_CATEGORIES, PERFORMANCE_THRESHOLDS, SUCCESS_CRITERIA };