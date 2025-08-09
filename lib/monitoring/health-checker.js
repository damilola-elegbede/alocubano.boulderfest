/**
 * Centralized health check orchestrator
 * Manages health checks for all services with circuit breaker pattern
 */

// Use Node.js performance API with fallback for browser compatibility
const performance = globalThis.performance || (() => {
  // Fallback for test/browser environments
  return {
    now: () => Date.now()
  };
})();

// Health status levels
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy'
};

// Default timeout for health checks
const DEFAULT_TIMEOUT = 5000; // 5 seconds
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 3; // failures before opening circuit
const DEFAULT_CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds before retry

/**
 * Circuit breaker for managing failing services
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.threshold || DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    this.timeout = options.timeout || DEFAULT_CIRCUIT_BREAKER_TIMEOUT;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'closed'; // closed, open, half-open
  }
  
  /**
   * Check if circuit breaker allows request
   */
  canAttempt() {
    if (this.state === 'closed') {
      return true;
    }
    
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    
    return this.state === 'half-open';
  }
  
  /**
   * Record successful check
   */
  recordSuccess() {
    this.failureCount = 0;
    this.state = 'closed';
    this.lastFailureTime = null;
  }
  
  /**
   * Record failed check
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
    }
  }
  
  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Health check manager
 */
export class HealthChecker {
  constructor(options = {}) {
    this.checks = new Map();
    this.circuitBreakers = new Map();
    this.defaultTimeout = options.timeout || DEFAULT_TIMEOUT;
    this.startTime = Date.now();
  }
  
  /**
   * Register a health check
   */
  registerCheck(name, checkFn, options = {}) {
    // Idempotency check - prevent duplicate registration
    if (this.checks.has(name)) {
      return; // Already registered, skip
    }
    
    this.checks.set(name, {
      fn: checkFn,
      timeout: options.timeout || this.defaultTimeout,
      critical: options.critical || false,
      weight: options.weight || 1
    });
    
    // Create circuit breaker for this check
    this.circuitBreakers.set(name, new CircuitBreaker(name, options.circuitBreaker));
  }
  
  /**
   * Execute a single health check with timeout
   */
  async executeCheck(name) {
    const check = this.checks.get(name);
    const circuitBreaker = this.circuitBreakers.get(name);
    
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }
    
    // Check circuit breaker
    if (!circuitBreaker.canAttempt()) {
      return {
        status: HealthStatus.UNHEALTHY,
        error: 'Circuit breaker open',
        response_time: '0ms',
        circuit_breaker: circuitBreaker.getState()
      };
    }
    
    const startTime = performance.now();
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), check.timeout);
      });
      
      // Race between check and timeout
      const result = await Promise.race([
        check.fn(),
        timeoutPromise
      ]);
      
      const responseTime = Math.round(performance.now() - startTime);
      
      // Record success
      circuitBreaker.recordSuccess();
      
      return {
        ...result,
        response_time: `${responseTime}ms`
      };
    } catch (error) {
      const responseTime = Math.round(performance.now() - startTime);
      
      // Record failure
      circuitBreaker.recordFailure();
      
      return {
        status: HealthStatus.UNHEALTHY,
        error: error.message,
        response_time: `${responseTime}ms`,
        circuit_breaker: circuitBreaker.getState()
      };
    }
  }
  
  /**
   * Execute all health checks in parallel
   */
  async executeAll() {
    const checks = Array.from(this.checks.keys());
    const results = await Promise.allSettled(
      checks.map(name => this.executeCheck(name))
    );
    
    const services = {};
    let overallStatus = HealthStatus.HEALTHY;
    let totalResponseTime = 0;
    let errorCount = 0;
    
    // Process results
    checks.forEach((name, index) => {
      const result = results[index];
      const check = this.checks.get(name);
      
      if (result.status === 'fulfilled') {
        services[name] = result.value;
        
        // Parse response time
        const responseTime = parseInt(result.value.response_time);
        if (!isNaN(responseTime)) {
          totalResponseTime += responseTime;
        }
        
        // Update overall status based on service status
        if (result.value.status === HealthStatus.UNHEALTHY) {
          if (check.critical) {
            overallStatus = HealthStatus.UNHEALTHY;
          } else if (overallStatus !== HealthStatus.UNHEALTHY) {
            overallStatus = HealthStatus.DEGRADED;
          }
          errorCount++;
        } else if (result.value.status === HealthStatus.DEGRADED && overallStatus === HealthStatus.HEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      } else {
        // Check failed to execute
        services[name] = {
          status: HealthStatus.UNHEALTHY,
          error: result.reason?.message || 'Check execution failed',
          response_time: '0ms'
        };
        
        if (check.critical) {
          overallStatus = HealthStatus.UNHEALTHY;
        } else if (overallStatus !== HealthStatus.UNHEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
        errorCount++;
      }
    });
    
    // Calculate uptime
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: uptimeSeconds,
      services,
      performance: {
        avg_response_time: checks.length > 0 ? `${Math.round(totalResponseTime / checks.length)}ms` : '0ms',
        total_response_time: `${totalResponseTime}ms`,
        error_rate: checks.length > 0 ? `${((errorCount / checks.length) * 100).toFixed(2)}%` : '0%',
        memory_usage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
      }
    };
  }
  
  /**
   * Get specific service health
   */
  async checkService(name) {
    if (!this.checks.has(name)) {
      throw new Error(`Service '${name}' not registered`);
    }
    
    return await this.executeCheck(name);
  }
  
  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates() {
    const states = {};
    for (const [name, breaker] of this.circuitBreakers) {
      states[name] = breaker.getState();
    }
    return states;
  }
  
  /**
   * Reset all circuit breakers
   */
  resetCircuitBreakers() {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.failureCount = 0;
      breaker.state = 'closed';
      breaker.lastFailureTime = null;
    }
  }
}

// Singleton instance
let healthChecker = null;

/**
 * Get or create health checker instance
 */
export function getHealthChecker() {
  if (!healthChecker) {
    healthChecker = new HealthChecker();
  }
  return healthChecker;
}

/**
 * Format health check response for HTTP
 */
export function formatHealthResponse(health) {
  const statusCode = health.status === HealthStatus.HEALTHY ? 200 :
                     health.status === HealthStatus.DEGRADED ? 200 : 503;
  
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    },
    body: health
  };
}

export default {
  HealthChecker,
  HealthStatus,
  CircuitBreaker,
  getHealthChecker,
  formatHealthResponse
};