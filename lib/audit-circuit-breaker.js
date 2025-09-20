/**
 * Audit Circuit Breaker
 * Prevents audit failures from blocking critical business operations
 *
 * CRITICAL: Ensures ticket sales and festival operations continue
 * even if audit system experiences issues
 */

import { logger } from './logger.js';

export class AuditCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000; // 1 minute
    this.resetTimeout = options.resetTimeout || 300000; // 5 minutes

    // Circuit states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
    this.state = 'CLOSED';
    this.failures = 0;
    this.nextAttempt = 0;
    this.successCount = 0;

    // Track metrics for monitoring
    this.metrics = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      bypassedCalls: 0,
      lastFailure: null,
      lastSuccess: null
    };
  }

  /**
   * Execute audit operation with circuit breaker protection
   */
  async executeAudit(operation, context = {}) {
    this.metrics.totalCalls++;

    // Business continuity: If circuit is open, bypass audit
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        return this._bypass('Circuit open - audit bypassed for business continuity', context);
      }

      // Try to recover - move to half-open
      this.state = 'HALF_OPEN';
      this.successCount = 0;
      logger.info('[AuditCircuitBreaker] Attempting recovery - moving to HALF_OPEN');
    }

    try {
      // Execute the audit operation
      const result = await operation();

      // Success - handle state transitions
      this._onSuccess();
      this.metrics.successCalls++;
      this.metrics.lastSuccess = new Date().toISOString();

      return {
        success: true,
        result,
        circuitState: this.state,
        bypassed: false
      };

    } catch (error) {
      // Failure - handle state transitions
      this._onFailure(error);
      this.metrics.failedCalls++;
      this.metrics.lastFailure = {
        timestamp: new Date().toISOString(),
        error: error.message,
        context
      };

      // CRITICAL: Never throw - always allow business operations to continue
      logger.error('[AuditCircuitBreaker] Audit operation failed', {
        error: error.message,
        context,
        circuitState: this.state,
        failures: this.failures
      });

      return {
        success: false,
        error: error.message,
        circuitState: this.state,
        bypassed: false
      };
    }
  }

  /**
   * Bypass audit operation (circuit open)
   */
  _bypass(reason, context) {
    this.metrics.bypassedCalls++;

    logger.warn('[AuditCircuitBreaker] Audit bypassed', {
      reason,
      context,
      circuitState: this.state,
      failures: this.failures
    });

    return {
      success: false,
      bypassed: true,
      reason,
      circuitState: this.state
    };
  }

  /**
   * Handle successful audit operation
   */
  _onSuccess() {
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      // After 3 successful calls in HALF_OPEN, fully recover
      if (this.successCount >= 3) {
        this.state = 'CLOSED';
        logger.info('[AuditCircuitBreaker] Circuit recovered - moving to CLOSED');
      }
    }
  }

  /**
   * Handle failed audit operation
   */
  _onFailure(error) {
    this.failures++;

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.recoveryTimeout;

      logger.error('[AuditCircuitBreaker] Circuit opened due to failures', {
        failures: this.failures,
        threshold: this.failureThreshold,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
        error: error.message
      });
    }
  }

  /**
   * Get circuit breaker status and metrics
   */
  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.failureThreshold,
      nextAttempt: this.nextAttempt ? new Date(this.nextAttempt).toISOString() : null,
      metrics: {
        ...this.metrics,
        successRate: this.metrics.totalCalls > 0
          ? (this.metrics.successCalls / this.metrics.totalCalls * 100).toFixed(2) + '%'
          : '0%',
        bypassRate: this.metrics.totalCalls > 0
          ? (this.metrics.bypassedCalls / this.metrics.totalCalls * 100).toFixed(2) + '%'
          : '0%'
      }
    };
  }

  /**
   * Manually open circuit (for maintenance)
   */
  forceOpen(reason = 'Manual override') {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.resetTimeout;

    logger.warn('[AuditCircuitBreaker] Circuit manually opened', {
      reason,
      nextAttempt: new Date(this.nextAttempt).toISOString()
    });
  }

  /**
   * Manually close circuit (for recovery)
   */
  forceClose(reason = 'Manual override') {
    this.state = 'CLOSED';
    this.failures = 0;
    this.nextAttempt = 0;

    logger.info('[AuditCircuitBreaker] Circuit manually closed', {
      reason
    });
  }

  /**
   * Reset all metrics (for monitoring)
   */
  resetMetrics() {
    this.metrics = {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      bypassedCalls: 0,
      lastFailure: null,
      lastSuccess: null
    };
  }
}

// Create singleton instance with production-ready configuration
const auditCircuitBreaker = new AuditCircuitBreaker({
  failureThreshold: 5,    // Open after 5 consecutive failures
  recoveryTimeout: 60000, // Try recovery after 1 minute
  resetTimeout: 300000    // Manual reset timeout: 5 minutes
});

export default auditCircuitBreaker;
export { auditCircuitBreaker };