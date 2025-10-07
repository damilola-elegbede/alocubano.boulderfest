/**
 * Service Circuit Breaker
 * General-purpose circuit breaker for external services (Brevo, Stripe, Google Drive)
 *
 * This is separate from the database circuit breaker to allow different
 * failure thresholds and recovery strategies for different service types.
 */

import { logger } from './logger.js';
import { EventEmitter } from 'events';

// Circuit breaker states
export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit Breaker for External Services
 */
export class ServiceCircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 120000;
    this.name = options.name || 'unnamed-circuit';

    // State
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.stateChangedAt = Date.now();

    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalRejections: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      stateTransitions: {
        [CircuitState.CLOSED]: 0,
        [CircuitState.OPEN]: 0,
        [CircuitState.HALF_OPEN]: 0
      },
      lastFailureTime: null,
      lastSuccessTime: null,
      errors: []
    };

    // Rolling window for failure tracking
    this.recentFailures = [];
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, fallback = null) {
    this.metrics.totalRequests++;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        logger.log(`[Circuit:${this.name}] Transitioning to HALF_OPEN - testing recovery`);
        this._setState(CircuitState.HALF_OPEN);
      } else {
        this.metrics.totalRejections++;

        logger.warn(`[Circuit:${this.name}] Request rejected - circuit is OPEN`, {
          nextAttempt: new Date(this.nextAttempt).toISOString(),
          failureCount: this.failureCount
        });

        if (fallback) {
          logger.debug(`[Circuit:${this.name}] Using fallback function`);
          try {
            return await fallback();
          } catch (fallbackError) {
            logger.error(`[Circuit:${this.name}] Fallback function failed:`, fallbackError);
            throw new Error(`Circuit open and fallback failed: ${fallbackError.message}`);
          }
        }

        const error = new Error(`Circuit breaker is OPEN for ${this.name}`);
        error.code = 'CIRCUIT_OPEN';
        error.nextAttempt = this.nextAttempt;
        throw error;
      }
    }

    // Execute the function
    try {
      const startTime = Date.now();
      const result = await fn();
      const duration = Date.now() - startTime;

      this._recordSuccess(duration);
      return result;

    } catch (error) {
      this._recordFailure(error);
      throw error;
    }
  }

  /**
   * Record successful execution
   * @private
   */
  _recordSuccess(duration) {
    this.metrics.totalSuccesses++;
    this.metrics.consecutiveSuccesses++;
    this.metrics.consecutiveFailures = 0;
    this.metrics.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      logger.debug(`[Circuit:${this.name}] Success in HALF_OPEN (${this.successCount}/${this.successThreshold})`);

      if (this.successCount >= this.successThreshold) {
        logger.log(`[Circuit:${this.name}] Recovery confirmed - closing circuit`);
        this._setState(CircuitState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
        this.recentFailures = [];
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.recentFailures = [];
    }

    this.emit('success', {
      state: this.state,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Record failed execution
   * @private
   */
  _recordFailure(error) {
    const now = Date.now();

    this.metrics.totalFailures++;
    this.metrics.consecutiveFailures++;
    this.metrics.consecutiveSuccesses = 0;
    this.metrics.lastFailureTime = now;

    // Track error details
    this.metrics.errors.push({
      message: error.message,
      code: error.code,
      timestamp: now
    });

    if (this.metrics.errors.length > 10) {
      this.metrics.errors.shift();
    }

    // Add to recent failures
    this.recentFailures.push(now);

    // Remove failures outside monitoring period
    const cutoff = now - this.monitoringPeriod;
    this.recentFailures = this.recentFailures.filter(time => time > cutoff);

    logger.warn(`[Circuit:${this.name}] Failure recorded`, {
      state: this.state,
      recentFailures: this.recentFailures.length,
      threshold: this.failureThreshold,
      error: error.message
    });

    if (this.state === CircuitState.HALF_OPEN) {
      logger.warn(`[Circuit:${this.name}] Failure in HALF_OPEN - reopening circuit`);
      this._setState(CircuitState.OPEN);
      this.successCount = 0;
      this.nextAttempt = now + this.timeout;

    } else if (this.state === CircuitState.CLOSED) {
      if (this.recentFailures.length >= this.failureThreshold) {
        logger.error(`[Circuit:${this.name}] Failure threshold exceeded - opening circuit`, {
          failures: this.recentFailures.length,
          threshold: this.failureThreshold
        });

        this._setState(CircuitState.OPEN);
        this.nextAttempt = now + this.timeout;
      }
    }

    this.emit('failure', {
      state: this.state,
      error: error.message,
      code: error.code,
      recentFailures: this.recentFailures.length,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Change circuit breaker state
   * @private
   */
  _setState(newState) {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;
    this.stateChangedAt = Date.now();
    this.metrics.stateTransitions[newState]++;

    logger.log(`[Circuit:${this.name}] State transition: ${oldState} ’ ${newState}`);

    this.emit('stateChange', {
      from: oldState,
      to: newState,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get current circuit breaker state
   */
  getState() {
    return this.state;
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    const now = Date.now();
    const stateAge = now - this.stateChangedAt;

    return {
      name: this.name,
      state: this.state,
      stateAge: `${Math.round(stateAge / 1000)}s`,
      requests: {
        total: this.metrics.totalRequests,
        successful: this.metrics.totalSuccesses,
        failed: this.metrics.totalFailures,
        rejected: this.metrics.totalRejections
      },
      successRate: this.metrics.totalRequests > 0
        ? `${((this.metrics.totalSuccesses / this.metrics.totalRequests) * 100).toFixed(1)}%`
        : 'N/A',
      recentFailures: this.recentFailures.length,
      lastSuccess: this.metrics.lastSuccessTime
        ? new Date(this.metrics.lastSuccessTime).toISOString()
        : 'never',
      lastFailure: this.metrics.lastFailureTime
        ? new Date(this.metrics.lastFailureTime).toISOString()
        : 'never'
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    logger.log(`[Circuit:${this.name}] Manual reset`);

    this._setState(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.recentFailures = [];
    this.nextAttempt = Date.now();

    this.emit('reset', {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Force circuit to OPEN state
   */
  forceOpen(duration = null) {
    const timeout = duration || this.timeout;

    logger.warn(`[Circuit:${this.name}] Forced OPEN for ${timeout}ms`);

    this._setState(CircuitState.OPEN);
    this.nextAttempt = Date.now() + timeout;

    this.emit('forceOpen', {
      duration: timeout,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowingRequests() {
    if (this.state === CircuitState.OPEN) {
      return Date.now() >= this.nextAttempt;
    }
    return true;
  }

  /**
   * Get health status
   */
  getHealth() {
    const isHealthy = this.state === CircuitState.CLOSED;
    const metrics = this.getMetrics();

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      state: this.state,
      allowingRequests: this.isAllowingRequests(),
      successRate: metrics.successRate,
      recentFailures: this.recentFailures.length,
      timestamp: new Date().toISOString()
    };
  }
}
