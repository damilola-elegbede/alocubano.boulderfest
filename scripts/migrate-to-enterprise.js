#!/usr/bin/env node

/**
 * Enterprise Database Migration Script
 *
 * Safe migration script for production deployment:
 * - Pre-migration validation
 * - Gradual traffic shifting
 * - Health monitoring during migration
 * - Automatic rollback on issues
 * - Zero-downtime deployment procedures
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../lib/logger.js';
import { getDatabaseConfiguration } from '../lib/database-config.js';
import { getFeatureFlagManager, isFeatureEnabled } from '../lib/feature-flags.js';
import { getDatabaseClient } from '../lib/database.js';
import { getConnectionManager } from '../lib/connection-manager.js';
import { DatabaseCircuitBreaker } from '../lib/circuit-breaker.js';
import { getMonitoringService } from '../lib/monitoring/monitoring-service.js';

/**
 * Migration phases for controlled rollout
 */
const MIGRATION_PHASES = {
  VALIDATE: 'validate',
  PREPARE: 'prepare',
  MONITORING: 'monitoring',
  CANARY: 'canary',
  GRADUAL: 'gradual',
  COMPLETE: 'complete',
  ROLLBACK: 'rollback'
};

/**
 * Migration status tracking
 */
class MigrationStatus {
  constructor() {
    this.phase = MIGRATION_PHASES.VALIDATE;
    this.startTime = Date.now();
    this.currentStep = null;
    this.completedSteps = [];
    this.errors = [];
    this.metrics = {};
    this.rolloutPercentage = 0;
    this.healthChecks = [];
    this.lastHealthCheck = null;
  }

  updatePhase(phase, step = null) {
    this.phase = phase;
    this.currentStep = step;
    if (step) {
      this.completedSteps.push({
        step,
        phase,
        timestamp: Date.now()
      });
    }
  }

  addError(error, context = {}) {
    this.errors.push({
      error: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });
  }

  recordMetric(name, value) {
    this.metrics[name] = {
      value,
      timestamp: Date.now()
    };
  }

  recordHealthCheck(status, details = {}) {
    const healthCheck = {
      status,
      details,
      timestamp: Date.now()
    };
    this.healthChecks.push(healthCheck);
    this.lastHealthCheck = healthCheck;

    // Keep only last 20 health checks
    if (this.healthChecks.length > 20) {
      this.healthChecks.shift();
    }
  }

  getDuration() {
    return Date.now() - this.startTime;
  }

  getStatus() {
    return {
      phase: this.phase,
      currentStep: this.currentStep,
      duration: this.getDuration(),
      completedSteps: this.completedSteps.length,
      errors: this.errors.length,
      rolloutPercentage: this.rolloutPercentage,
      lastHealthCheck: this.lastHealthCheck,
      metrics: this.metrics
    };
  }
}

/**
 * Enterprise Migration Manager
 */
class EnterpriseMigration {
  constructor(options = {}) {
    this.status = new MigrationStatus();
    this.config = getDatabaseConfiguration();
    this.featureFlags = getFeatureFlagManager();
    this.monitoring = getMonitoringService();
    this.dryRun = options.dryRun || false;
    this.forceRollback = options.forceRollback || false;
    this.targetPhase = options.targetPhase || MIGRATION_PHASES.COMPLETE;
    this.healthCheckInterval = options.healthCheckInterval || 10000; // 10 seconds
    this.maxErrors = options.maxErrors || 5;
    this.rolloutIncrement = options.rolloutIncrement || 10; // 10% increments
    this.rolloutDelay = options.rolloutDelay || 30000; // 30 seconds between increments

    // Migration state
    this.isRunning = false;
    this.shouldStop = false;
    this.healthCheckTimer = null;
    this.originalFlags = new Map();
    this.migrationLog = [];
  }

  /**
   * Start the migration process
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Migration is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;

    try {
      this.log('Starting enterprise database migration', 'info');

      // Save original flag states for rollback
      await this.saveOriginalState();

      // Execute migration phases
      await this.runMigrationPhases();

      this.log('Migration completed successfully', 'info');
      return this.status.getStatus();

    } catch (error) {
      this.status.addError(error);
      this.log(`Migration failed: ${error.message}`, 'error');

      // Attempt automatic rollback
      if (!this.dryRun) {
        this.log('Attempting automatic rollback', 'warn');
        await this.rollback();
      }

      throw error;

    } finally {
      this.isRunning = false;
      this.stopHealthChecks();
      await this.generateMigrationReport();
    }
  }

  /**
   * Run migration phases sequentially
   */
  async runMigrationPhases() {
    const phases = [
      { phase: MIGRATION_PHASES.VALIDATE, handler: this.validatePreconditions },
      { phase: MIGRATION_PHASES.PREPARE, handler: this.prepareEnvironment },
      { phase: MIGRATION_PHASES.MONITORING, handler: this.enableMonitoring },
      { phase: MIGRATION_PHASES.CANARY, handler: this.runCanaryDeployment },
      { phase: MIGRATION_PHASES.GRADUAL, handler: this.runGradualRollout },
      { phase: MIGRATION_PHASES.COMPLETE, handler: this.completeDeployment }
    ];

    for (const { phase, handler } of phases) {
      if (this.shouldStop) {
        throw new Error('Migration stopped by user request');
      }

      this.status.updatePhase(phase);
      this.log(`Starting phase: ${phase}`, 'info');

      await handler.call(this);

      this.log(`Phase completed: ${phase}`, 'info');

      // Stop if we've reached the target phase
      if (phase === this.targetPhase) {
        break;
      }

      // Brief pause between phases
      await this.delay(2000);
    }
  }

  /**
   * Phase 1: Validate preconditions
   */
  async validatePreconditions() {
    this.status.updatePhase(MIGRATION_PHASES.VALIDATE, 'checking_environment');

    // Check environment
    const environment = this.config.environment;
    this.log(`Environment detected: ${environment}`, 'info');

    if (environment === 'production' && !process.env.PRODUCTION_MIGRATION_APPROVED) {
      throw new Error('Production migration requires PRODUCTION_MIGRATION_APPROVED=true');
    }

    // Validate database connectivity
    this.status.updatePhase(MIGRATION_PHASES.VALIDATE, 'testing_database');
    await this.validateDatabaseConnectivity();

    // Check system resources
    this.status.updatePhase(MIGRATION_PHASES.VALIDATE, 'checking_resources');
    await this.validateSystemResources();

    // Validate configuration
    this.status.updatePhase(MIGRATION_PHASES.VALIDATE, 'validating_config');
    await this.config.validateConfiguration();

    // Check migration dependencies
    this.status.updatePhase(MIGRATION_PHASES.VALIDATE, 'checking_dependencies');
    await this.validateDependencies();

    this.log('All preconditions validated successfully', 'info');
  }

  /**
   * Phase 2: Prepare environment
   */
  async prepareEnvironment() {
    this.status.updatePhase(MIGRATION_PHASES.PREPARE, 'enabling_migration_mode');

    if (!this.dryRun) {
      // Enable migration mode
      this.featureFlags.setOverride('ENABLE_MIGRATION_MODE', true, 'migration');

      // Ensure legacy fallback is enabled
      this.featureFlags.setOverride('ENABLE_LEGACY_FALLBACK', true, 'migration');

      // Enable detailed logging for migration
      if (this.config.environment === 'development') {
        this.featureFlags.setOverride('ENABLE_DETAILED_LOGGING', true, 'migration');
      }
    }

    this.log('Environment prepared for migration', 'info');
  }

  /**
   * Phase 3: Enable monitoring
   */
  async enableMonitoring() {
    this.status.updatePhase(MIGRATION_PHASES.MONITORING, 'enabling_monitoring');

    if (!this.dryRun) {
      // Enable enterprise monitoring
      this.featureFlags.setOverride('ENABLE_ENTERPRISE_MONITORING', true, 'migration');
    }

    // Start health check monitoring
    this.startHealthChecks();

    // Wait for baseline metrics
    this.status.updatePhase(MIGRATION_PHASES.MONITORING, 'collecting_baseline');
    await this.delay(10000); // 10 seconds to collect baseline

    this.log('Monitoring enabled and baseline established', 'info');
  }

  /**
   * Phase 4: Canary deployment
   */
  async runCanaryDeployment() {
    this.status.updatePhase(MIGRATION_PHASES.CANARY, 'starting_canary');

    if (!this.dryRun) {
      // Enable canary testing for small percentage
      this.featureFlags.setOverride('ENABLE_CANARY_TESTING', true, 'migration');
      this.featureFlags.updateRolloutPercentage('ENABLE_CONNECTION_POOL', 5); // 5% canary

      this.status.rolloutPercentage = 5;
    }

    // Monitor canary for specified duration
    this.status.updatePhase(MIGRATION_PHASES.CANARY, 'monitoring_canary');
    await this.monitorDeployment(60000); // 1 minute canary monitoring

    // Validate canary success
    this.status.updatePhase(MIGRATION_PHASES.CANARY, 'validating_canary');
    await this.validateCanarySuccess();

    this.log('Canary deployment successful', 'info');
  }

  /**
   * Phase 5: Gradual rollout
   */
  async runGradualRollout() {
    this.status.updatePhase(MIGRATION_PHASES.GRADUAL, 'starting_rollout');

    const targetPercentage = 100;
    let currentPercentage = 5; // Starting from canary

    while (currentPercentage < targetPercentage && !this.shouldStop) {
      const nextPercentage = Math.min(currentPercentage + this.rolloutIncrement, targetPercentage);

      this.status.updatePhase(MIGRATION_PHASES.GRADUAL, `rollout_${nextPercentage}pct`);
      this.log(`Rolling out to ${nextPercentage}%`, 'info');

      if (!this.dryRun) {
        // Update rollout percentage
        this.featureFlags.updateRolloutPercentage('ENABLE_CONNECTION_POOL', nextPercentage);

        // Enable additional features as rollout progresses
        if (nextPercentage >= 20) {
          this.featureFlags.updateRolloutPercentage('ENABLE_CIRCUIT_BREAKER', nextPercentage);
        }
        if (nextPercentage >= 50) {
          this.featureFlags.updateRolloutPercentage('ENABLE_STATE_MACHINE', nextPercentage);
        }
        if (nextPercentage >= 80) {
          this.featureFlags.updateRolloutPercentage('ENABLE_PERFORMANCE_OPTIMIZATION', nextPercentage);
        }
      }

      this.status.rolloutPercentage = nextPercentage;

      // Monitor this rollout increment
      await this.monitorDeployment(this.rolloutDelay);

      // Validate health before continuing
      const health = await this.checkSystemHealth();
      if (!health.healthy) {
        throw new Error(`System unhealthy at ${nextPercentage}% rollout: ${health.issues.join(', ')}`);
      }

      currentPercentage = nextPercentage;
    }

    this.log('Gradual rollout completed successfully', 'info');
  }

  /**
   * Phase 6: Complete deployment
   */
  async completeDeployment() {
    this.status.updatePhase(MIGRATION_PHASES.COMPLETE, 'finalizing');

    if (!this.dryRun) {
      // Enable all enterprise features at 100%
      const enterpriseFlags = [
        'ENABLE_CONNECTION_POOL',
        'ENABLE_STATE_MACHINE',
        'ENABLE_CIRCUIT_BREAKER',
        'ENABLE_PERFORMANCE_OPTIMIZATION'
      ];

      for (const flagKey of enterpriseFlags) {
        this.featureFlags.setOverride(flagKey, true, 'migration_complete');
      }

      // Disable migration mode
      this.featureFlags.removeOverride('ENABLE_MIGRATION_MODE');

      // Keep legacy fallback enabled for safety
      // This can be manually disabled later after validation
    }

    // Final health check
    this.status.updatePhase(MIGRATION_PHASES.COMPLETE, 'final_validation');
    await this.performFinalValidation();

    this.log('Enterprise database migration completed successfully', 'info');
  }

  /**
   * Rollback to original state
   */
  async rollback() {
    this.status.updatePhase(MIGRATION_PHASES.ROLLBACK, 'starting_rollback');
    this.log('Starting rollback process', 'warn');

    try {
      if (!this.dryRun) {
        // Restore original flag states
        for (const [flagKey, originalValue] of this.originalFlags.entries()) {
          if (originalValue !== null) {
            this.featureFlags.setOverride(flagKey, originalValue, 'rollback');
          } else {
            this.featureFlags.removeOverride(flagKey);
          }
        }

        // Ensure legacy fallback is enabled
        this.featureFlags.setOverride('ENABLE_LEGACY_FALLBACK', true, 'rollback');

        // Disable migration mode
        this.featureFlags.removeOverride('ENABLE_MIGRATION_MODE');
      }

      // Wait for rollback to take effect
      await this.delay(5000);

      // Validate rollback
      const health = await this.checkSystemHealth();
      if (health.healthy) {
        this.log('Rollback completed successfully', 'info');
      } else {
        this.log('Rollback completed but system still unhealthy', 'warn');
      }

    } catch (error) {
      this.log(`Rollback failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Monitor deployment health during rollout
   */
  async monitorDeployment(duration) {
    const startTime = Date.now();
    const endTime = startTime + duration;

    while (Date.now() < endTime && !this.shouldStop) {
      const health = await this.checkSystemHealth();

      if (!health.healthy) {
        throw new Error(`System became unhealthy during rollout: ${health.issues.join(', ')}`);
      }

      // Check error rate
      if (this.status.errors.length > this.maxErrors) {
        throw new Error(`Too many errors during migration: ${this.status.errors.length}`);
      }

      await this.delay(this.healthCheckInterval);
    }
  }

  /**
   * Validate database connectivity
   */
  async validateDatabaseConnectivity() {
    try {
      const client = await getDatabaseClient();
      const result = await client.execute('SELECT 1 as test');

      if (!result.rows || result.rows.length === 0) {
        throw new Error('Database connectivity test failed');
      }

      this.log('Database connectivity validated', 'info');
      return true;

    } catch (error) {
      throw new Error(`Database validation failed: ${error.message}`);
    }
  }

  /**
   * Validate system resources
   */
  async validateSystemResources() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;

      if (heapUsedPercent > 0.8) {
        throw new Error(`High memory usage detected: ${Math.round(heapUsedPercent * 100)}%`);
      }

      this.status.recordMetric('memory_usage_percent', Math.round(heapUsedPercent * 100));
    }

    this.log('System resources validated', 'info');
    return true;
  }

  /**
   * Validate migration dependencies
   */
  async validateDependencies() {
    // Check required environment variables
    const requiredEnvVars = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Required environment variable missing: ${envVar}`);
      }
    }

    this.log('Dependencies validated', 'info');
    return true;
  }

  /**
   * Validate canary deployment success
   */
  async validateCanarySuccess() {
    const health = await this.checkSystemHealth();

    if (!health.healthy) {
      throw new Error(`Canary deployment failed health check: ${health.issues.join(', ')}`);
    }

    // Check if any features are working
    const poolEnabled = isFeatureEnabled('ENABLE_CONNECTION_POOL');
    if (!poolEnabled && !this.dryRun) {
      throw new Error('Connection pool not enabled in canary');
    }

    this.log('Canary deployment validated', 'info');
    return true;
  }

  /**
   * Perform final validation
   */
  async performFinalValidation() {
    // Test enterprise features
    try {
      if (!this.dryRun) {
        // Test connection pool
        const manager = getConnectionManager();
        const stats = manager.getPoolStatistics();
        this.status.recordMetric('final_pool_connections', stats.pool.totalConnections);

        // Test circuit breaker
        const circuitBreaker = new DatabaseCircuitBreaker();
        const metrics = circuitBreaker.getMetrics();
        this.status.recordMetric('final_circuit_breaker_status', metrics.state);
      }

      this.log('Final validation completed', 'info');

    } catch (error) {
      throw new Error(`Final validation failed: ${error.message}`);
    }
  }

  /**
   * Check overall system health
   */
  async checkSystemHealth() {
    const health = {
      healthy: true,
      issues: [],
      checks: {}
    };

    try {
      // Database connectivity
      const dbTest = await this.validateDatabaseConnectivity();
      health.checks.database = dbTest;

    } catch (error) {
      health.healthy = false;
      health.issues.push(`Database: ${error.message}`);
      health.checks.database = false;
    }

    // Memory usage
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;

      if (heapUsedPercent > 0.9) {
        health.healthy = false;
        health.issues.push(`High memory usage: ${Math.round(heapUsedPercent * 100)}%`);
      }
      health.checks.memory = heapUsedPercent < 0.9;
    }

    // Error rate
    const recentErrors = this.status.errors.filter(
      error => Date.now() - error.timestamp < 60000 // Last minute
    );

    if (recentErrors.length > 3) {
      health.healthy = false;
      health.issues.push(`High error rate: ${recentErrors.length} errors/minute`);
    }
    health.checks.errorRate = recentErrors.length <= 3;

    this.status.recordHealthCheck(health.healthy ? 'healthy' : 'unhealthy', health);

    return health;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.checkSystemHealth();
      } catch (error) {
        this.log(`Health check error: ${error.message}`, 'error');
      }
    }, this.healthCheckInterval);

    this.log('Health checks started', 'info');
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      this.log('Health checks stopped', 'info');
    }
  }

  /**
   * Save original flag states
   */
  async saveOriginalState() {
    const flagManager = this.featureFlags;
    const flags = Object.keys(flagManager.flags || {});

    for (const flagKey of flags) {
      // Save current override state (null if no override)
      const currentOverride = flagManager.overrides.get(flagKey);
      this.originalFlags.set(flagKey, currentOverride ? currentOverride.value : null);
    }

    this.log(`Saved original state for ${flags.length} feature flags`, 'info');
  }

  /**
   * Generate migration report
   */
  async generateMigrationReport() {
    const report = {
      migration: {
        status: this.status.getStatus(),
        duration: this.status.getDuration(),
        phase: this.status.phase,
        errors: this.status.errors,
        rolloutPercentage: this.status.rolloutPercentage
      },
      system: {
        environment: this.config.environment,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform
      },
      featureFlags: this.featureFlags.getStatistics(),
      log: this.migrationLog
    };

    const reportPath = path.join(process.cwd(), '.tmp', `migration-report-${Date.now()}.json`);

    try {
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      this.log(`Migration report saved: ${reportPath}`, 'info');
    } catch (error) {
      this.log(`Failed to save migration report: ${error.message}`, 'error');
    }

    return report;
  }

  /**
   * Log migration events
   */
  log(message, level = 'info') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      phase: this.status.phase,
      step: this.status.currentStep
    };

    this.migrationLog.push(logEntry);

    // Also log to console/logger
    logger[level](message);
  }

  /**
   * Utility delay function
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop migration
   */
  stop() {
    this.shouldStop = true;
    this.log('Migration stop requested', 'warn');
  }
}

/**
 * Main migration function
 */
export async function runEnterpriseMigration(options = {}) {
  const migration = new EnterpriseMigration(options);

  // Handle process signals for graceful shutdown
  const signalHandler = () => {
    logger.warn('Migration interrupted by signal, attempting graceful shutdown...');
    migration.stop();
  };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  try {
    const result = await migration.start();
    return result;
  } finally {
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = {
    dryRun: process.argv.includes('--dry-run'),
    forceRollback: process.argv.includes('--rollback'),
    targetPhase: process.argv.find(arg => arg.startsWith('--target='))?.split('=')[1] || MIGRATION_PHASES.COMPLETE
  };

  try {
    logger.log('Starting enterprise database migration...');
    const result = await runEnterpriseMigration(options);
    logger.log('Migration completed:', result);
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error.message);
    process.exit(1);
  }
}

export { EnterpriseMigration, MIGRATION_PHASES };