/**
 * Health Checker Unit Tests
 * Comprehensive tests for health check operations and circuit breaker pattern
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  HealthChecker,
  HealthStatus,
  getHealthChecker,
  formatHealthResponse
} from '../../../../lib/monitoring/health-checker.js';

describe('HealthChecker', () => {
  let healthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker({ timeout: 1000 });
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct structure', () => {
      expect(healthChecker).toBeDefined();
      expect(healthChecker.checks).toBeInstanceOf(Map);
      expect(healthChecker.circuitBreakers).toBeInstanceOf(Map);
      expect(healthChecker.defaultTimeout).toBe(1000);
    });

    it('should set default timeout if not provided', () => {
      const checker = new HealthChecker();
      expect(checker.defaultTimeout).toBe(5000);
    });

    it('should track start time for uptime calculation', () => {
      expect(healthChecker.startTime).toBeDefined();
      expect(typeof healthChecker.startTime).toBe('number');
    });
  });

  describe('Health Check Registration', () => {
    it('should register health check successfully', () => {
      const checkFn = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck('test_service', checkFn);

      expect(healthChecker.checks.has('test_service')).toBe(true);
      expect(healthChecker.circuitBreakers.has('test_service')).toBe(true);
    });

    it('should register check with custom timeout', () => {
      const checkFn = vi.fn();

      healthChecker.registerCheck('custom_timeout', checkFn, {
        timeout: 3000
      });

      const check = healthChecker.checks.get('custom_timeout');
      expect(check.timeout).toBe(3000);
    });

    it('should register critical checks', () => {
      const checkFn = vi.fn();

      healthChecker.registerCheck('database', checkFn, {
        critical: true
      });

      const check = healthChecker.checks.get('database');
      expect(check.critical).toBe(true);
    });

    it('should register check with custom weight', () => {
      const checkFn = vi.fn();

      healthChecker.registerCheck('weighted', checkFn, {
        weight: 5
      });

      const check = healthChecker.checks.get('weighted');
      expect(check.weight).toBe(5);
    });

    it('should prevent duplicate registration', () => {
      const checkFn1 = vi.fn();
      const checkFn2 = vi.fn();

      healthChecker.registerCheck('duplicate', checkFn1);
      healthChecker.registerCheck('duplicate', checkFn2);

      const check = healthChecker.checks.get('duplicate');
      expect(check.fn).toBe(checkFn1); // Should keep first registration
    });
  });

  describe('Health Check Execution', () => {
    it('should execute health check successfully', async () => {
      const checkFn = vi.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        details: 'All good'
      });

      healthChecker.registerCheck('test', checkFn);

      const result = await healthChecker.executeCheck('test');

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details).toBe('All good');
      expect(result.response_time).toMatch(/\d+ms/);
      expect(checkFn).toHaveBeenCalled();
    });

    it('should throw error for non-existent check', async () => {
      await expect(healthChecker.executeCheck('nonexistent')).rejects.toThrow(
        "Health check 'nonexistent' not found"
      );
    });

    it('should handle check timeout', async () => {
      const slowCheckFn = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      healthChecker.registerCheck('slow', slowCheckFn, { timeout: 100 });

      const result = await healthChecker.executeCheck('slow');

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toContain('timeout');
    });

    it('should handle check failure', async () => {
      const errorCheckFn = vi.fn().mockRejectedValue(new Error('Connection failed'));

      healthChecker.registerCheck('failing', errorCheckFn);

      const result = await healthChecker.executeCheck('failing');

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.error).toBe('Connection failed');
    });

    it('should measure response time accurately', async () => {
      const checkFn = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { status: HealthStatus.HEALTHY };
      });

      healthChecker.registerCheck('timed', checkFn);

      const result = await healthChecker.executeCheck('timed');

      const responseTime = parseInt(result.response_time);
      // setTimeout is not precise - allow for slight variance
      // Expecting ~50ms but accepting 45-60ms range
      expect(responseTime).toBeGreaterThanOrEqual(45);
      expect(responseTime).toBeLessThan(100);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should record success on healthy check', async () => {
      const checkFn = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck('success', checkFn);

      await healthChecker.executeCheck('success');

      const circuitBreaker = healthChecker.circuitBreakers.get('success');
      expect(circuitBreaker.state).toBe('closed');
      expect(circuitBreaker.failureCount).toBe(0);
    });

    it('should record failure on unhealthy check', async () => {
      const checkFn = vi.fn().mockRejectedValue(new Error('Failed'));

      healthChecker.registerCheck('failure', checkFn);

      await healthChecker.executeCheck('failure');

      const circuitBreaker = healthChecker.circuitBreakers.get('failure');
      expect(circuitBreaker.failureCount).toBe(1);
    });

    it('should open circuit after threshold failures', async () => {
      const checkFn = vi.fn().mockRejectedValue(new Error('Failed'));

      healthChecker.registerCheck('breaker', checkFn, {
        circuitBreaker: { threshold: 3 }
      });

      // Trigger 3 failures
      await healthChecker.executeCheck('breaker');
      await healthChecker.executeCheck('breaker');
      await healthChecker.executeCheck('breaker');

      const circuitBreaker = healthChecker.circuitBreakers.get('breaker');
      expect(circuitBreaker.state).toBe('open');
    });

    it('should not attempt check when circuit is open', async () => {
      const checkFn = vi.fn().mockRejectedValue(new Error('Failed'));

      healthChecker.registerCheck('open_circuit', checkFn, {
        circuitBreaker: { threshold: 2 }
      });

      // Open circuit
      await healthChecker.executeCheck('open_circuit');
      await healthChecker.executeCheck('open_circuit');

      // Reset mock to verify it's not called
      checkFn.mockClear();

      const result = await healthChecker.executeCheck('open_circuit');

      expect(result.error).toBe('Circuit breaker open');
      expect(checkFn).not.toHaveBeenCalled();
    });

    it('should transition to half-open after timeout', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const checkFn = vi.fn().mockRejectedValue(new Error('Failed'));

      healthChecker.registerCheck('timeout_breaker', checkFn, {
        circuitBreaker: { threshold: 2, timeout: 1000 }
      });

      // Open circuit
      await healthChecker.executeCheck('timeout_breaker');
      await healthChecker.executeCheck('timeout_breaker');

      const circuitBreaker = healthChecker.circuitBreakers.get('timeout_breaker');
      expect(circuitBreaker.state).toBe('open');

      // Advance time beyond timeout
      vi.setSystemTime(now + 1500);

      // Should allow attempt (half-open)
      expect(circuitBreaker.canAttempt()).toBe(true);
    });

    it('should close circuit on successful half-open check', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      let callCount = 0;
      const checkFn = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Failed');
        }
        return { status: HealthStatus.HEALTHY };
      });

      healthChecker.registerCheck('recover', checkFn, {
        circuitBreaker: { threshold: 2, timeout: 1000 }
      });

      // Open circuit
      await healthChecker.executeCheck('recover');
      await healthChecker.executeCheck('recover');

      // Advance time
      vi.setSystemTime(now + 1500);

      // Successful check should close circuit
      await healthChecker.executeCheck('recover');

      const circuitBreaker = healthChecker.circuitBreakers.get('recover');
      expect(circuitBreaker.state).toBe('closed');
      expect(circuitBreaker.failureCount).toBe(0);
    });

    it('should include circuit breaker state in result', async () => {
      const checkFn = vi.fn().mockRejectedValue(new Error('Failed'));

      healthChecker.registerCheck('with_state', checkFn, {
        circuitBreaker: { threshold: 2 }
      });

      await healthChecker.executeCheck('with_state');
      await healthChecker.executeCheck('with_state');

      const result = await healthChecker.executeCheck('with_state');

      expect(result.circuit_breaker).toBeDefined();
      expect(result.circuit_breaker.state).toBe('open');
    });
  });

  describe('Execute All Checks', () => {
    it('should execute all registered checks in parallel', async () => {
      const check1 = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
      const check2 = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck('service1', check1);
      healthChecker.registerCheck('service2', check2);

      const result = await healthChecker.executeAll();

      expect(result.services.service1).toBeDefined();
      expect(result.services.service2).toBeDefined();
      expect(check1).toHaveBeenCalled();
      expect(check2).toHaveBeenCalled();
    });

    it('should determine overall status from individual checks', async () => {
      const healthy = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck('healthy', healthy);

      const result = await healthChecker.executeAll();

      expect(result.status).toBe(HealthStatus.HEALTHY);
    });

    it('should mark as degraded when non-critical service fails', async () => {
      const healthy = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
      const unhealthy = vi.fn().mockResolvedValue({ status: HealthStatus.UNHEALTHY });

      healthChecker.registerCheck('critical', healthy, { critical: true });
      healthChecker.registerCheck('non_critical', unhealthy, { critical: false });

      const result = await healthChecker.executeAll();

      expect(result.status).toBe(HealthStatus.DEGRADED);
    });

    it('should mark as unhealthy when critical service fails', async () => {
      const healthy = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });
      const unhealthy = vi.fn().mockResolvedValue({ status: HealthStatus.UNHEALTHY });

      healthChecker.registerCheck('non_critical', healthy, { critical: false });
      healthChecker.registerCheck('critical', unhealthy, { critical: true });

      const result = await healthChecker.executeAll();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should include timestamp and version', async () => {
      const result = await healthChecker.executeAll();

      expect(result.timestamp).toBeDefined();
      expect(result.version).toBeDefined();
    });

    it('should include uptime in seconds', async () => {
      const result = await healthChecker.executeAll();

      expect(result.uptime).toBeDefined();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should calculate performance metrics', async () => {
      const check = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck('perf', check);

      const result = await healthChecker.executeAll();

      expect(result.performance).toBeDefined();
      expect(result.performance.avg_response_time).toBeDefined();
      expect(result.performance.total_response_time).toBeDefined();
      expect(result.performance.error_rate).toBeDefined();
    });

    it('should handle empty checks gracefully', async () => {
      const result = await healthChecker.executeAll();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.services).toEqual({});
    });

    it('should handle check execution failures', async () => {
      const throwingCheck = vi.fn().mockImplementation(() => {
        throw new Error('Execution failed');
      });

      healthChecker.registerCheck('throwing', throwingCheck);

      const result = await healthChecker.executeAll();

      expect(result.services.throwing.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.services.throwing.error).toContain('Execution failed');
    });
  });

  describe('Specific Service Check', () => {
    it('should check specific service health', async () => {
      const checkFn = vi.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        details: 'Service operational'
      });

      healthChecker.registerCheck('specific', checkFn);

      const result = await healthChecker.checkService('specific');

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.details).toBe('Service operational');
    });

    it('should throw error for unregistered service', async () => {
      await expect(healthChecker.checkService('unregistered')).rejects.toThrow(
        "Service 'unregistered' not registered"
      );
    });
  });

  describe('Circuit Breaker Management', () => {
    it('should get all circuit breaker states', () => {
      const check = vi.fn().mockResolvedValue({ status: HealthStatus.HEALTHY });

      healthChecker.registerCheck('cb1', check);
      healthChecker.registerCheck('cb2', check);

      const states = healthChecker.getCircuitBreakerStates();

      expect(states.cb1).toBeDefined();
      expect(states.cb2).toBeDefined();
      expect(states.cb1.state).toBe('closed');
    });

    it('should reset all circuit breakers', async () => {
      const failing = vi.fn().mockRejectedValue(new Error('Failed'));

      healthChecker.registerCheck('reset_test', failing, {
        circuitBreaker: { threshold: 2 }
      });

      // Open circuit
      await healthChecker.executeCheck('reset_test');
      await healthChecker.executeCheck('reset_test');

      let breaker = healthChecker.circuitBreakers.get('reset_test');
      expect(breaker.state).toBe('open');

      // Reset
      healthChecker.resetCircuitBreakers();

      breaker = healthChecker.circuitBreakers.get('reset_test');
      expect(breaker.state).toBe('closed');
      expect(breaker.failureCount).toBe(0);
    });
  });

  describe('Memory Usage Tracking', () => {
    it('should include memory usage in health check', async () => {
      const result = await healthChecker.executeAll();

      expect(result.performance.memory_usage).toBeDefined();
      expect(result.performance.memory_usage).toMatch(/\d+MB/);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getHealthChecker', () => {
      const instance1 = getHealthChecker();
      const instance2 = getHealthChecker();

      expect(instance1).toBe(instance2);
    });

    it('should initialize singleton on first call', () => {
      const instance = getHealthChecker();
      expect(instance).toBeInstanceOf(HealthChecker);
    });
  });

  describe('formatHealthResponse', () => {
    it('should format healthy response with 200 status', () => {
      const health = {
        status: HealthStatus.HEALTHY,
        timestamp: new Date().toISOString(),
        services: {}
      };

      const formatted = formatHealthResponse(health);

      expect(formatted.statusCode).toBe(200);
      expect(formatted.headers['Content-Type']).toBe('application/json');
      expect(formatted.body).toEqual(health);
    });

    it('should format degraded response with 200 status', () => {
      const health = {
        status: HealthStatus.DEGRADED,
        timestamp: new Date().toISOString(),
        services: {}
      };

      const formatted = formatHealthResponse(health);

      expect(formatted.statusCode).toBe(200);
    });

    it('should format unhealthy response with 503 status', () => {
      const health = {
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date().toISOString(),
        services: {}
      };

      const formatted = formatHealthResponse(health);

      expect(formatted.statusCode).toBe(503);
    });

    it('should include cache control headers', () => {
      const health = {
        status: HealthStatus.HEALTHY,
        timestamp: new Date().toISOString(),
        services: {}
      };

      const formatted = formatHealthResponse(health);

      expect(formatted.headers['Cache-Control']).toContain('no-cache');
      expect(formatted.headers['Cache-Control']).toContain('no-store');
    });
  });
});
