/**
 * Circuit Breaker Pattern for Database Operations
 *
 * Provides automatic failure recovery and prevents cascade failures during
 * database connectivity issues in serverless environments.
 *
 * Features:
 * - High-performance operation with minimal overhead
 * - Serverless-optimized state management
 * - Multiple failure type handling
 * - Comprehensive metrics collection
 * - Fast-fail for circuit open states
 */

import { logger } from './logger.js';
import { ErrorFactory, ErrorCodes } from './utils/error-factory.js';

/**
 * Circuit Breaker Error - thrown when circuit is open
 */
export class CircuitBreakerError extends Error {
  constructor(state, lastFailure, metrics = {}) {
    const message = `Circuit breaker is ${state}${lastFailure ? `: ${lastFailure}` : ''}`;
    super(message);
    this.name = 'CircuitBreakerError';
    this.circuitState = state;
    this.lastFailure = lastFailure;
    this.metrics = metrics;
    this.code = ErrorCodes.API_SERVICE_UNAVAILABLE;
    this.context = 'circuit-breaker';
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Failure Types - categorize different database failure modes
 */
export const FailureTypes = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  CONNECTION: 'CONNECTION',
  QUERY: 'QUERY',
  AUTHENTICATION: 'AUTHENTICATION',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Circuit States
 */
export const CircuitStates = Object.freeze({
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failure threshold exceeded, fail fast
  HALF_OPEN: 'HALF_OPEN' // Testing recovery
});

/**
 * High-Performance Database Circuit Breaker
 *
 * Optimized for serverless environments with:
 * - Minimal memory footprint
 * - Fast failure detection
 * - Efficient state management
 * - Comprehensive monitoring
 */
export class DatabaseCircuitBreaker {
  constructor(options = {}) {
    // Circuit state
    this.state = CircuitStates.CLOSED;
    this.lastStateTransition = Date.now();

    // Failure tracking - using circular buffer for memory efficiency
    this.failures = [];
    this.maxFailureHistory = 100; // Keep last 100 failures
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = Date.now();
    this.halfOpenAttempts = 0;

    // Configuration with serverless optimizations
    this.config = {
      // Core circuit breaker settings
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 30000,      // 30s before trying half-open
      halfOpenMaxAttempts: options.halfOpenMaxAttempts || 3,
      monitoringPeriod: options.monitoringPeriod || 60000,    // 1 min sliding window
      fastFailTimeout: options.fastFailTimeout || 100,        // Quick response for open circuit

      // Failure type specific timeouts
      timeoutThreshold: options.timeoutThreshold || 10000,    // 10s query timeout
      connectionRetryDelay: options.connectionRetryDelay || 5000, // 5s for connection issues

      // Serverless optimizations
      coldStartGracePeriod: options.coldStartGracePeriod || 5000,   // Extra tolerance after cold start
      maxFailureAge: options.maxFailureAge || 300000,               // 5 min max age for failure tracking
      memoryOptimization: options.memoryOptimization !== false,     // Enable by default

      // Performance tuning
      successThreshold: options.successThreshold || 3,        // Successes needed to close from half-open
      degradedModeThreshold: options.degradedModeThreshold || 0.7, // 70% failure rate triggers degraded mode

      ...options
    };

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      failedRequests: 0,
      succeededRequests: 0,
      timeoutRequests: 0,
      connectionFailures: 0,
      queryFailures: 0,
      authFailures: 0,
      circuitOpenCount: 0,
      halfOpenAttempts: 0,
      averageResponseTime: 0,
      lastResponseTime: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      uptime: Date.now(),
      lastHealthCheck: Date.now()
    };

    // Response time tracking for performance monitoring
    this.responseTimes = [];
    this.maxResponseTimeHistory = 50;

    // Memory optimization - cleanup old data periodically
    if (this.config.memoryOptimization) {
      this.lastCleanup = Date.now();
      this.cleanupInterval = 60000; // Cleanup every minute
    }

    logger.debug('Circuit breaker initialized', {
      config: this.config,
      state: this.state
    });
  }

  /**
   * Execute operation through circuit breaker
   *
   * @param {Function} operation - Async operation to execute
   * @param {Function|null} fallback - Optional fallback operation
   * @returns {Promise<any>} Operation result
   * @throws {CircuitBreakerError} When circuit is open
   */
  async execute(operation, fallback = null) {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // Memory optimization cleanup
    if (this.config.memoryOptimization && this._shouldCleanup()) {
      this._performCleanup();
    }

    // Fast-fail for open circuit
    if (this.state === CircuitStates.OPEN) {
      if (!this._shouldAttemptRecovery()) {
        this.metrics.circuitOpenCount++;
        const error = new CircuitBreakerError(
          this.state,
          this.lastFailureTime ? `Last failure: ${new Date(this.lastFailureTime).toISOString()}` : null,
          this._getCurrentMetrics()
        );

        // Execute fallback if provided
        if (fallback) {
          try {
            const fallbackResult = await this._executeFallback(fallback, startTime);
            return fallbackResult;
          } catch (fallbackError) {
            logger.warn('Fallback operation failed', { error: fallbackError.message });
            throw error; // Throw original circuit breaker error
          }
        }

        throw error;
      } else {
        // Transition to half-open for recovery attempt
        this._transitionToHalfOpen();
      }
    }

    // Limit concurrent attempts in half-open state
    if (this.state === CircuitStates.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.metrics.circuitOpenCount++;
        throw new CircuitBreakerError(
          'HALF_OPEN_LIMIT_EXCEEDED',
          `Too many half-open attempts (${this.halfOpenAttempts}/${this.config.halfOpenMaxAttempts})`,
          this._getCurrentMetrics()
        );
      }
      this.halfOpenAttempts++;
      this.metrics.halfOpenAttempts++;
    }

    try {
      // Execute the operation with timeout protection
      const result = await this._executeWithTimeout(operation, startTime);

      // Record success
      this._recordSuccess(startTime);

      return result;

    } catch (error) {
      // Record failure and handle state transitions
      this._recordFailure(error, startTime);

      // Execute fallback if provided and not in degraded mode
      if (fallback && this._shouldUseFallback(error)) {
        try {
          const fallbackResult = await this._executeFallback(fallback, startTime);
          logger.warn('Operation failed, fallback succeeded', {
            error: error.message,
            failureType: this._classifyFailure(error)
          });
          return fallbackResult;
        } catch (fallbackError) {
          logger.error('Both operation and fallback failed', {
            primaryError: error.message,
            fallbackError: fallbackError.message
          });
        }
      }

      throw error;
    }
  }

  /**
   * Execute operation with timeout protection
   */
  async _executeWithTimeout(operation, startTime) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(ErrorFactory.createTimeoutError(
          'Database operation',
          this.config.timeoutThreshold,
          { startTime, duration: Date.now() - startTime }
        ));
      }, this.config.timeoutThreshold);
    });

    return Promise.race([operation(), timeoutPromise]);
  }

  /**
   * Execute fallback operation
   */
  async _executeFallback(fallback, startTime) {
    const fallbackStartTime = Date.now();
    try {
      const result = await fallback();
      this._recordFallbackSuccess(fallbackStartTime);
      return result;
    } catch (error) {
      this._recordFallbackFailure(error, fallbackStartTime);
      throw error;
    }
  }

  /**
   * Record successful operation
   */
  _recordSuccess(startTime) {
    const responseTime = Date.now() - startTime;

    this.metrics.succeededRequests++;
    this.metrics.consecutiveSuccesses++;
    this.metrics.consecutiveFailures = 0;
    this.metrics.lastResponseTime = responseTime;
    this.lastSuccessTime = Date.now();

    // Update average response time
    this._updateAverageResponseTime(responseTime);

    // Track response times for performance monitoring
    this.responseTimes.push({
      time: responseTime,
      timestamp: Date.now()
    });

    if (this.responseTimes.length > this.maxResponseTimeHistory) {
      this.responseTimes.shift(); // Remove oldest entry
    }

    // State transitions
    if (this.state === CircuitStates.HALF_OPEN) {
      if (this.metrics.consecutiveSuccesses >= this.config.successThreshold) {
        this._transitionToClosed();
      }
    }

    logger.debug('Circuit breaker recorded success', {
      responseTime,
      consecutiveSuccesses: this.metrics.consecutiveSuccesses,
      state: this.state
    });
  }

  /**
   * Record failed operation
   */
  _recordFailure(error, startTime) {
    const responseTime = Date.now() - startTime;
    const failureType = this._classifyFailure(error);
    const now = Date.now();

    // Update metrics
    this.metrics.failedRequests++;
    this.metrics.consecutiveFailures++;
    this.metrics.consecutiveSuccesses = 0;
    this.metrics.lastResponseTime = responseTime;
    this.lastFailureTime = now;

    // Update failure type specific metrics
    switch (failureType) {
      case FailureTypes.TIMEOUT:
        this.metrics.timeoutRequests++;
        break;
      case FailureTypes.CONNECTION:
        this.metrics.connectionFailures++;
        break;
      case FailureTypes.QUERY:
        this.metrics.queryFailures++;
        break;
      case FailureTypes.AUTHENTICATION:
        this.metrics.authFailures++;
        break;
    }

    // Record failure in circular buffer
    const failure = {
      error: {
        message: error.message,
        code: error.code,
        type: failureType
      },
      timestamp: now,
      responseTime
    };

    this.failures.push(failure);
    if (this.failures.length > this.maxFailureHistory) {
      this.failures.shift(); // Remove oldest failure
    }

    this.failureCount = this._countRecentFailures();

    // State transitions
    if (this.state === CircuitStates.CLOSED || this.state === CircuitStates.HALF_OPEN) {
      if (this.failureCount >= this.config.failureThreshold) {
        this._transitionToOpen();
      }
    }

    logger.warn('Circuit breaker recorded failure', {
      error: error.message,
      failureType,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      state: this.state,
      responseTime
    });
  }

  /**
   * Record fallback operation success
   */
  _recordFallbackSuccess(startTime) {
    const responseTime = Date.now() - startTime;
    this.metrics.lastResponseTime = responseTime;
    this._updateAverageResponseTime(responseTime);

    logger.debug('Fallback operation succeeded', { responseTime });
  }

  /**
   * Record fallback operation failure
   */
  _recordFallbackFailure(error, startTime) {
    const responseTime = Date.now() - startTime;
    this.metrics.lastResponseTime = responseTime;

    logger.warn('Fallback operation failed', {
      error: error.message,
      responseTime
    });
  }

  /**
   * Classify failure type for appropriate handling
   */
  _classifyFailure(error) {
    if (!error) return FailureTypes.UNKNOWN;

    // Check error codes first
    if (error.code) {
      switch (error.code) {
        case ErrorCodes.DB_TIMEOUT_ERROR:
          return FailureTypes.TIMEOUT;
        case ErrorCodes.DB_CONNECTION_ERROR:
          return FailureTypes.CONNECTION;
        case ErrorCodes.DB_AUTH_ERROR:
          return FailureTypes.AUTHENTICATION;
        case ErrorCodes.DB_QUERY_ERROR:
          return FailureTypes.QUERY;
      }
    }

    // Fallback to message analysis
    const message = error.message?.toLowerCase() || '';

    if (message.includes('timeout') || message.includes('timed out')) {
      return FailureTypes.TIMEOUT;
    }

    if (message.includes('connection') || message.includes('connect') ||
        message.includes('network') || message.includes('econnrefused')) {
      return FailureTypes.CONNECTION;
    }

    if (message.includes('auth') || message.includes('permission') ||
        message.includes('unauthorized') || message.includes('forbidden')) {
      return FailureTypes.AUTHENTICATION;
    }

    if (message.includes('syntax') || message.includes('query') ||
        message.includes('table') || message.includes('column')) {
      return FailureTypes.QUERY;
    }

    return FailureTypes.UNKNOWN;
  }

  /**
   * Count recent failures within monitoring period
   */
  _countRecentFailures() {
    const cutoffTime = Date.now() - this.config.monitoringPeriod;
    return this.failures.filter(failure => failure.timestamp > cutoffTime).length;
  }

  /**
   * Check if circuit should attempt recovery
   */
  _shouldAttemptRecovery() {
    return Date.now() - this.lastStateTransition >= this.config.recoveryTimeout;
  }

  /**
   * Check if fallback should be used for this error
   */
  _shouldUseFallback(error) {
    const failureType = this._classifyFailure(error);

    // Don't use fallback for authentication errors
    if (failureType === FailureTypes.AUTHENTICATION) {
      return false;
    }

    // Don't use fallback for query syntax errors
    if (failureType === FailureTypes.QUERY &&
        error.message?.toLowerCase().includes('syntax')) {
      return false;
    }

    return true;
  }

  /**
   * Transition to OPEN state
   */
  _transitionToOpen() {
    if (this.state !== CircuitStates.OPEN) {
      const previousState = this.state;
      this.state = CircuitStates.OPEN;
      this.lastStateTransition = Date.now();
      this.halfOpenAttempts = 0;

      logger.warn('Circuit breaker opened', {
        previousState,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        lastFailure: this.lastFailureTime
      });
    }
  }

  /**
   * Transition to HALF_OPEN state
   */
  _transitionToHalfOpen() {
    if (this.state !== CircuitStates.HALF_OPEN) {
      const previousState = this.state;
      this.state = CircuitStates.HALF_OPEN;
      this.lastStateTransition = Date.now();
      this.halfOpenAttempts = 0;

      logger.log('Circuit breaker entering half-open state', {
        previousState,
        timeSinceLastFailure: this.lastFailureTime ? Date.now() - this.lastFailureTime : null
      });
    }
  }

  /**
   * Transition to CLOSED state
   */
  _transitionToClosed() {
    if (this.state !== CircuitStates.CLOSED) {
      const previousState = this.state;
      const successCount = this.metrics.consecutiveSuccesses;
      this.state = CircuitStates.CLOSED;
      this.lastStateTransition = Date.now();
      this.halfOpenAttempts = 0;
      // Don't reset consecutive successes here - keep them for monitoring

      logger.log('Circuit breaker closed - service recovered', {
        previousState,
        consecutiveSuccesses: successCount
      });
    }
  }

  /**
   * Update average response time using exponential moving average
   */
  _updateAverageResponseTime(responseTime) {
    const alpha = 0.1; // Smoothing factor
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = responseTime;
    } else {
      this.metrics.averageResponseTime =
        (alpha * responseTime) + ((1 - alpha) * this.metrics.averageResponseTime);
    }
  }

  /**
   * Check if cleanup should be performed
   */
  _shouldCleanup() {
    return Date.now() - this.lastCleanup > this.cleanupInterval;
  }

  /**
   * Perform memory optimization cleanup
   */
  _performCleanup() {
    const now = Date.now();
    const cutoffTime = now - this.config.maxFailureAge;

    // Clean old failures
    const oldFailureCount = this.failures.length;
    this.failures = this.failures.filter(failure => failure.timestamp > cutoffTime);

    // Clean old response times
    const oldResponseTimeCount = this.responseTimes.length;
    this.responseTimes = this.responseTimes.filter(rt => rt.timestamp > cutoffTime);

    this.lastCleanup = now;

    if (oldFailureCount > this.failures.length || oldResponseTimeCount > this.responseTimes.length) {
      logger.debug('Circuit breaker performed cleanup', {
        failuresRemoved: oldFailureCount - this.failures.length,
        responseTimesRemoved: oldResponseTimeCount - this.responseTimes.length
      });
    }
  }

  /**
   * Get current metrics snapshot
   */
  _getCurrentMetrics() {
    const now = Date.now();
    const recentFailures = this._countRecentFailures();
    const failureRate = this.metrics.totalRequests > 0 ?
      this.metrics.failedRequests / this.metrics.totalRequests : 0;

    return {
      state: this.state,
      totalRequests: this.metrics.totalRequests,
      failedRequests: this.metrics.failedRequests,
      succeededRequests: this.metrics.succeededRequests,
      failureRate: Math.round(failureRate * 10000) / 100, // Percentage with 2 decimal places
      recentFailures,
      consecutiveFailures: this.metrics.consecutiveFailures,
      consecutiveSuccesses: this.metrics.consecutiveSuccesses,
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      lastResponseTime: this.metrics.lastResponseTime,
      uptime: now - this.metrics.uptime,
      lastStateTransition: this.lastStateTransition,
      timeSinceLastFailure: this.lastFailureTime ? now - this.lastFailureTime : null
    };
  }

  /**
   * Check if circuit breaker is healthy
   *
   * @returns {boolean} True if circuit is healthy
   */
  isHealthy() {
    const now = Date.now();

    // Update health check timestamp
    this.metrics.lastHealthCheck = now;

    // Circuit is unhealthy if open
    if (this.state === CircuitStates.OPEN) {
      return false;
    }

    // Check failure rate in recent period
    const recentFailures = this._countRecentFailures();
    if (recentFailures >= this.config.failureThreshold) {
      return false;
    }

    // Check if we're in degraded mode (high failure rate but not open)
    const failureRate = this.metrics.totalRequests > 0 ?
      this.metrics.failedRequests / this.metrics.totalRequests : 0;

    if (failureRate > this.config.degradedModeThreshold) {
      return false;
    }

    return true;
  }

  /**
   * Get comprehensive metrics for monitoring
   *
   * @returns {Object} Circuit breaker metrics
   */
  getMetrics() {
    const baseMetrics = this._getCurrentMetrics();
    const now = Date.now();

    // Add failure type breakdown
    const failureBreakdown = {
      timeout: this.metrics.timeoutRequests,
      connection: this.metrics.connectionFailures,
      query: this.metrics.queryFailures,
      authentication: this.metrics.authFailures
    };

    // Calculate percentiles for response times
    const sortedResponseTimes = this.responseTimes
      .map(rt => rt.time)
      .sort((a, b) => a - b);

    const responseTimePercentiles = {};
    if (sortedResponseTimes.length > 0) {
      responseTimePercentiles.p50 = this._calculatePercentile(sortedResponseTimes, 0.5);
      responseTimePercentiles.p90 = this._calculatePercentile(sortedResponseTimes, 0.9);
      responseTimePercentiles.p95 = this._calculatePercentile(sortedResponseTimes, 0.95);
      responseTimePercentiles.p99 = this._calculatePercentile(sortedResponseTimes, 0.99);
    }

    return {
      ...baseMetrics,
      config: {
        failureThreshold: this.config.failureThreshold,
        recoveryTimeout: this.config.recoveryTimeout,
        monitoringPeriod: this.config.monitoringPeriod,
        timeoutThreshold: this.config.timeoutThreshold
      },
      failureBreakdown,
      responseTimePercentiles,
      circuitOpenCount: this.metrics.circuitOpenCount,
      halfOpenAttempts: this.metrics.halfOpenAttempts,
      memoryUsage: {
        failuresTracked: this.failures.length,
        responseTimesTracked: this.responseTimes.length,
        maxFailureHistory: this.maxFailureHistory,
        maxResponseTimeHistory: this.maxResponseTimeHistory
      },
      lastHealthCheck: this.metrics.lastHealthCheck,
      isHealthy: this.isHealthy()
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  _calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;

    const index = percentile * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedArray[lower];
    }

    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Reset circuit breaker state (for testing)
   */
  reset() {
    this.state = CircuitStates.CLOSED;
    this.failures = [];
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = Date.now();
    this.halfOpenAttempts = 0;
    this.lastStateTransition = Date.now();
    this.responseTimes = [];

    // Reset metrics
    Object.keys(this.metrics).forEach(key => {
      if (typeof this.metrics[key] === 'number') {
        this.metrics[key] = 0;
      }
    });
    this.metrics.uptime = Date.now();
    this.metrics.lastHealthCheck = Date.now();

    logger.debug('Circuit breaker reset');
  }

  /**
   * Force circuit to specific state (for testing)
   */
  forceState(state) {
    if (Object.values(CircuitStates).includes(state)) {
      this.state = state;
      this.lastStateTransition = Date.now();
      logger.debug(`Circuit breaker forced to ${state} state`);
    } else {
      throw new Error(`Invalid circuit state: ${state}`);
    }
  }
}

export default DatabaseCircuitBreaker;