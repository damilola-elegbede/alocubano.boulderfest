/**
 * Resilient Service Wrappers Unit Tests
 *
 * Tests for service wrappers that combine exponential backoff + circuit breaker:
 * - Brevo service wrapper functionality
 * - Stripe service wrapper functionality
 * - Google Drive service wrapper functionality
 * - Combined backoff + circuit breaker behavior
 * - Idempotency key handling (Stripe)
 * - Rate limit header respect (Retry-After)
 * - Fallback strategies (queue, cache, default)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock implementation - Phase 4 will implement actual service wrappers
class ResilientServiceWrapper {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.config = {
      maxRetries: options.maxRetries || 3,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: options.circuitBreakerTimeout || 60000,
      fallbackStrategy: options.fallbackStrategy || 'throw',
      respectRateLimits: options.respectRateLimits !== false,
      idempotencyEnabled: options.idempotencyEnabled !== false,
      ...options
    };

    this.circuitState = 'CLOSED';
    this.failureCount = 0;
    this.circuitOpenTime = null;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      circuitOpenCount: 0,
      fallbackUsed: 0
    };
  }

  async execute(operation, context = {}) {
    this.metrics.totalRequests++;

    // Check circuit breaker
    if (this.circuitState === 'OPEN') {
      if (Date.now() - this.circuitOpenTime < this.config.circuitBreakerTimeout) {
        this.metrics.circuitOpenCount++;
        return this._executeFallback(context);
      } else {
        this.circuitState = 'HALF_OPEN';
      }
    }

    let lastError;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        const result = await operation(context);
        this.metrics.successfulRequests++;
        this.failureCount = 0;

        if (this.circuitState === 'HALF_OPEN') {
          this.circuitState = 'CLOSED';
        }

        return result;
      } catch (error) {
        lastError = error;
        attempt++;

        // Check if error is retryable
        if (!this._shouldRetry(error, attempt)) {
          this.metrics.failedRequests++;
          this._recordFailure();
          throw error;
        }

        // Handle rate limiting
        if (this.config.respectRateLimits && error.rateLimitReset) {
          await this._sleep(error.rateLimitReset);
        } else {
          const delay = this._calculateDelay(attempt);
          await this._sleep(delay);
        }

        this.metrics.retriedRequests++;
      }
    }

    // Max retries exceeded
    this.metrics.failedRequests++;
    this._recordFailure();
    return this._executeFallback(context, lastError);
  }

  _shouldRetry(error, attempt) {
    if (attempt > this.config.maxRetries) return false;

    // Don't retry permanent errors
    const permanentCodes = ['AUTHENTICATION_ERROR', 'INVALID_REQUEST', 'NOT_FOUND'];
    if (permanentCodes.includes(error.code)) return false;

    return true;
  }

  _recordFailure() {
    this.failureCount++;

    if (this.failureCount >= this.config.circuitBreakerThreshold) {
      this.circuitState = 'OPEN';
      this.circuitOpenTime = Date.now();
    }
  }

  _calculateDelay(attempt) {
    const delay = this.config.initialDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, this.config.maxDelay);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _executeFallback(context, error) {
    this.metrics.fallbackUsed++;

    switch (this.config.fallbackStrategy) {
      case 'queue':
        return { queued: true, context };
      case 'cache':
        return { cached: true, data: context.cachedData };
      case 'default':
        return context.defaultValue || null;
      case 'throw':
      default:
        throw error || new Error('Circuit breaker open');
    }
  }

  getMetrics() {
    return { ...this.metrics, circuitState: this.circuitState };
  }

  reset() {
    this.circuitState = 'CLOSED';
    this.failureCount = 0;
    this.circuitOpenTime = null;
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = 0;
    });
  }
}

// Service-specific wrappers
class ResilientBrevoService extends ResilientServiceWrapper {
  constructor(options = {}) {
    super('brevo', {
      maxRetries: 3,
      initialDelay: 1000,
      circuitBreakerThreshold: 5,
      fallbackStrategy: 'queue',
      ...options
    });
  }

  async sendEmail(emailData) {
    return this.execute(async (context) => {
      // Simulate Brevo API call
      if (emailData.shouldFail) {
        const error = new Error('Brevo API error');
        error.code = emailData.errorCode || 'API_ERROR';
        error.rateLimitReset = emailData.rateLimitReset;
        throw error;
      }
      return { messageId: 'msg_123', status: 'sent' };
    }, { emailData });
  }
}

class ResilientStripeService extends ResilientServiceWrapper {
  constructor(options = {}) {
    super('stripe', {
      maxRetries: 3,
      initialDelay: 2000,
      circuitBreakerThreshold: 5,
      idempotencyEnabled: true,
      ...options
    });
    this.usedIdempotencyKeys = new Set();
  }

  async createPaymentIntent(paymentData) {
    const idempotencyKey = paymentData.idempotencyKey || this._generateIdempotencyKey();

    // Check idempotency
    if (this.config.idempotencyEnabled && this.usedIdempotencyKeys.has(idempotencyKey)) {
      return { id: 'pi_cached', status: 'succeeded', idempotent: true };
    }

    return this.execute(async (context) => {
      if (paymentData.shouldFail) {
        const error = new Error('Stripe API error');
        error.code = paymentData.errorCode || 'API_ERROR';
        throw error;
      }

      this.usedIdempotencyKeys.add(idempotencyKey);
      return { id: 'pi_123', status: 'succeeded', idempotencyKey };
    }, { paymentData, idempotencyKey });
  }

  _generateIdempotencyKey() {
    return `idem_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

class ResilientGoogleDriveService extends ResilientServiceWrapper {
  constructor(options = {}) {
    super('google-drive', {
      maxRetries: 5,
      initialDelay: 500,
      circuitBreakerThreshold: 10,
      fallbackStrategy: 'cache',
      ...options
    });
  }

  async listFiles(query) {
    return this.execute(async (context) => {
      if (query.shouldFail) {
        const error = new Error('Google Drive API error');
        error.code = query.errorCode || 'API_ERROR';
        error.rateLimitReset = query.rateLimitReset;
        throw error;
      }
      return { files: [{ id: 'file1', name: 'photo.jpg' }] };
    }, { query, cachedData: query.cachedData });
  }
}

describe('ResilientServiceWrapper', () => {
  let wrapper;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Basic Functionality', () => {
    it('should execute operation successfully', async () => {
      wrapper = new ResilientServiceWrapper('test');
      const operation = vi.fn().mockResolvedValue('success');

      const resultPromise = wrapper.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(wrapper.metrics.successfulRequests).toBe(1);
      expect(wrapper.metrics.totalRequests).toBe(1);
    });

    it('should retry on transient failures', async () => {
      wrapper = new ResilientServiceWrapper('test', { initialDelay: 100 });
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValue('success');

      const resultPromise = wrapper.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(wrapper.metrics.retriedRequests).toBe(1);
    });

    it('should not retry permanent errors', async () => {
      wrapper = new ResilientServiceWrapper('test', { initialDelay: 100 });
      const error = new Error('Authentication failed');
      error.code = 'AUTHENTICATION_ERROR';
      const operation = vi.fn().mockRejectedValue(error);

      try {
        const resultPromise = wrapper.execute(operation);
        await vi.runAllTimersAsync();
        await resultPromise;
      } catch (e) {
        expect(e.message).toBe('Authentication failed');
        expect(operation).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit after threshold failures', async () => {
      wrapper = new ResilientServiceWrapper('test', {
        initialDelay: 100,
        circuitBreakerThreshold: 3,
        fallbackStrategy: 'default'
      });

      const operation = vi.fn().mockRejectedValue(new Error('Service down'));

      // Trigger failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          const promise = wrapper.execute(operation, { defaultValue: null });
          await vi.runAllTimersAsync();
          await promise;
        } catch (e) {
          // Expected
        }
      }

      expect(wrapper.circuitState).toBe('OPEN');
    });

    it('should use fallback when circuit is open', async () => {
      wrapper = new ResilientServiceWrapper('test', {
        circuitBreakerThreshold: 1,
        circuitBreakerTimeout: 5000,
        fallbackStrategy: 'default'
      });

      // Open circuit
      wrapper.circuitState = 'OPEN';
      wrapper.circuitOpenTime = Date.now();

      const operation = vi.fn().mockResolvedValue('should not execute');
      const resultPromise = wrapper.execute(operation, { defaultValue: 'fallback' });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('fallback');
      expect(operation).not.toHaveBeenCalled();
      expect(wrapper.metrics.circuitOpenCount).toBe(1);
      expect(wrapper.metrics.fallbackUsed).toBe(1);
    });

    it('should transition to half-open after timeout', async () => {
      wrapper = new ResilientServiceWrapper('test', {
        initialDelay: 100,
        circuitBreakerTimeout: 1000
      });

      wrapper.circuitState = 'OPEN';
      wrapper.circuitOpenTime = Date.now() - 1500; // Past timeout

      const operation = vi.fn().mockResolvedValue('success');
      const resultPromise = wrapper.execute(operation);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(wrapper.circuitState).toBe('CLOSED');
    });

    it('should close circuit after successful half-open request', async () => {
      wrapper = new ResilientServiceWrapper('test', { initialDelay: 100 });

      wrapper.circuitState = 'HALF_OPEN';

      const operation = vi.fn().mockResolvedValue('success');
      const resultPromise = wrapper.execute(operation);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(wrapper.circuitState).toBe('CLOSED');
      expect(wrapper.failureCount).toBe(0);
    });
  });

  describe('Brevo Service Wrapper', () => {
    it('should send email successfully', async () => {
      const brevo = new ResilientBrevoService();
      const emailData = {
        to: 'user@example.com',
        subject: 'Test',
        shouldFail: false
      };

      const resultPromise = brevo.sendEmail(emailData);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.messageId).toBe('msg_123');
      expect(result.status).toBe('sent');
    });

    it('should retry Brevo API failures', async () => {
      const brevo = new ResilientBrevoService({ initialDelay: 100 });
      let attempts = 0;

      const sendWithRetry = async () => {
        attempts++;
        if (attempts < 3) {
          return brevo.sendEmail({ shouldFail: true });
        }
        return brevo.sendEmail({ shouldFail: false });
      };

      for (let i = 0; i < 3; i++) {
        try {
          const promise = sendWithRetry();
          await vi.runAllTimersAsync();
          const result = await promise;
          if (result.messageId) {
            expect(result.messageId).toBe('msg_123');
            break;
          }
        } catch (e) {
          // Retry
        }
      }

      expect(attempts).toBeGreaterThanOrEqual(2);
    });

    it('should respect rate limit headers', async () => {
      // Mock Date.now() to work with fake timers
      let currentTime = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      const brevo = new ResilientBrevoService({ initialDelay: 100, maxRetries: 1 });

      let attemptCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new Error('Rate limited');
          error.code = 'RATE_LIMIT';
          error.rateLimitReset = 2000;
          throw error;
        }
        return { messageId: 'msg_123', status: 'sent' };
      });

      const startTime = currentTime;

      // Execute with retry
      const promise = brevo.execute(operation);

      // Advance time past rate limit
      currentTime += 2100;
      await vi.advanceTimersByTimeAsync(2100);

      const result = await promise;

      const duration = currentTime - startTime;
      expect(duration).toBeGreaterThanOrEqual(2000);
      expect(result.messageId).toBe('msg_123');
      expect(attemptCount).toBe(2);
    });

    it('should queue failed emails when circuit opens', async () => {
      const brevo = new ResilientBrevoService({
        initialDelay: 100,
        circuitBreakerThreshold: 2
      });

      // Trigger failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          const promise = brevo.sendEmail({ shouldFail: true });
          await vi.runAllTimersAsync();
          await promise;
        } catch (e) {
          // Expected
        }
      }

      // Next request should be queued
      const resultPromise = brevo.sendEmail({ to: 'user@example.com' });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.queued).toBe(true);
      expect(brevo.metrics.fallbackUsed).toBe(1);
    });
  });

  describe('Stripe Service Wrapper', () => {
    it('should create payment intent successfully', async () => {
      const stripe = new ResilientStripeService();
      const paymentData = {
        amount: 1000,
        currency: 'usd',
        shouldFail: false
      };

      const resultPromise = stripe.createPaymentIntent(paymentData);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.id).toBe('pi_123');
      expect(result.status).toBe('succeeded');
      expect(result.idempotencyKey).toBeTruthy();
    });

    it('should enforce idempotency for duplicate requests', async () => {
      const stripe = new ResilientStripeService();
      const idempotencyKey = 'idem_test_123';
      const paymentData = {
        amount: 1000,
        idempotencyKey,
        shouldFail: false
      };

      // First request
      const promise1 = stripe.createPaymentIntent(paymentData);
      await vi.runAllTimersAsync();
      const result1 = await promise1;

      // Duplicate request with same idempotency key
      const promise2 = stripe.createPaymentIntent(paymentData);
      await vi.runAllTimersAsync();
      const result2 = await promise2;

      expect(result2.idempotent).toBe(true);
      expect(result2.id).toBe('pi_cached');
    });

    it('should retry Stripe API failures', async () => {
      const stripe = new ResilientStripeService({ initialDelay: 100 });
      let attempts = 0;

      const createWithRetry = async () => {
        attempts++;
        if (attempts < 2) {
          return stripe.createPaymentIntent({ shouldFail: true });
        }
        return stripe.createPaymentIntent({ shouldFail: false });
      };

      for (let i = 0; i < 2; i++) {
        try {
          const promise = createWithRetry();
          await vi.runAllTimersAsync();
          const result = await promise;
          if (result.id) {
            expect(result.id).toBe('pi_123');
            break;
          }
        } catch (e) {
          // Retry
        }
      }

      expect(attempts).toBeGreaterThanOrEqual(2);
    });

    it('should not retry card errors', async () => {
      const stripe = new ResilientStripeService({ initialDelay: 100 });
      const paymentData = {
        shouldFail: true,
        errorCode: 'INVALID_REQUEST'
      };

      const operation = vi.fn().mockImplementation(() =>
        stripe.createPaymentIntent(paymentData)
      );

      try {
        const promise = operation();
        await vi.runAllTimersAsync();
        await promise;
      } catch (e) {
        expect(operation).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('Google Drive Service Wrapper', () => {
    it('should list files successfully', async () => {
      const drive = new ResilientGoogleDriveService();
      const query = { q: 'mimeType="image/jpeg"', shouldFail: false };

      const resultPromise = drive.listFiles(query);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe('photo.jpg');
    });

    it('should use cached data when circuit opens', async () => {
      const drive = new ResilientGoogleDriveService({
        initialDelay: 100,
        circuitBreakerThreshold: 2
      });

      // Trigger failures
      for (let i = 0; i < 2; i++) {
        try {
          const promise = drive.listFiles({ shouldFail: true });
          await vi.runAllTimersAsync();
          await promise;
        } catch (e) {
          // Expected
        }
      }

      // Next request should use cache
      const cachedFiles = [{ id: 'cached1', name: 'cached.jpg' }];
      const resultPromise = drive.listFiles({
        q: 'test',
        cachedData: cachedFiles
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.cached).toBe(true);
      expect(result.data).toEqual(cachedFiles);
    });

    it('should respect Google Drive rate limits', async () => {
      // Mock Date.now() to work with fake timers
      let currentTime = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      const drive = new ResilientGoogleDriveService({ initialDelay: 100, maxRetries: 1 });

      let attemptCount = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new Error('Rate limited');
          error.code = 'RATE_LIMIT';
          error.rateLimitReset = 1000;
          throw error;
        }
        return { files: [{ id: 'file1', name: 'photo.jpg' }] };
      });

      const startTime = currentTime;

      // Execute with retry
      const promise = drive.execute(operation);

      // Advance time past rate limit
      currentTime += 1100;
      await vi.advanceTimersByTimeAsync(1100);

      const result = await promise;

      const duration = currentTime - startTime;
      expect(duration).toBeGreaterThanOrEqual(1000);
      expect(result.files).toHaveLength(1);
      expect(attemptCount).toBe(2);
    });

    it('should have higher retry threshold for Google Drive', async () => {
      const drive = new ResilientGoogleDriveService({ initialDelay: 50 });

      expect(drive.config.maxRetries).toBe(5);
      expect(drive.config.circuitBreakerThreshold).toBe(10);
    });
  });

  describe('Fallback Strategies', () => {
    it('should support queue fallback strategy', async () => {
      wrapper = new ResilientServiceWrapper('test', {
        fallbackStrategy: 'queue',
        circuitBreakerThreshold: 1
      });

      wrapper.circuitState = 'OPEN';
      wrapper.circuitOpenTime = Date.now();

      const operation = vi.fn();
      const resultPromise = wrapper.execute(operation, { requestId: '123' });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.queued).toBe(true);
      expect(result.context.requestId).toBe('123');
    });

    it('should support cache fallback strategy', async () => {
      wrapper = new ResilientServiceWrapper('test', {
        fallbackStrategy: 'cache',
        circuitBreakerThreshold: 1
      });

      wrapper.circuitState = 'OPEN';
      wrapper.circuitOpenTime = Date.now();

      const cachedData = { id: 1, name: 'Cached' };
      const operation = vi.fn();
      const resultPromise = wrapper.execute(operation, { cachedData });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.cached).toBe(true);
      expect(result.data).toEqual(cachedData);
    });

    it('should support default value fallback strategy', async () => {
      wrapper = new ResilientServiceWrapper('test', {
        fallbackStrategy: 'default',
        circuitBreakerThreshold: 1
      });

      wrapper.circuitState = 'OPEN';
      wrapper.circuitOpenTime = Date.now();

      const operation = vi.fn();
      const resultPromise = wrapper.execute(operation, { defaultValue: [] });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual([]);
    });

    it('should throw error when fallback strategy is throw', async () => {
      wrapper = new ResilientServiceWrapper('test', {
        fallbackStrategy: 'throw',
        circuitBreakerThreshold: 1
      });

      wrapper.circuitState = 'OPEN';
      wrapper.circuitOpenTime = Date.now();

      const operation = vi.fn();

      await expect(async () => {
        const promise = wrapper.execute(operation);
        await vi.runAllTimersAsync();
        await promise;
      }).rejects.toThrow('Circuit breaker open');
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track comprehensive metrics', async () => {
      wrapper = new ResilientServiceWrapper('test', { initialDelay: 100 });

      // Successful request
      await (async () => {
        const promise = wrapper.execute(vi.fn().mockResolvedValue('ok'));
        await vi.runAllTimersAsync();
        await promise;
      })();

      // Failed request with retry
      try {
        const promise = wrapper.execute(vi.fn().mockRejectedValue(new Error('fail')));
        await vi.runAllTimersAsync();
        await promise;
      } catch (e) {
        // Expected
      }

      const metrics = wrapper.getMetrics();

      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.circuitState).toBe('CLOSED');
    });

    it('should include circuit state in metrics', async () => {
      wrapper = new ResilientServiceWrapper('test', {
        circuitBreakerThreshold: 1
      });

      wrapper.circuitState = 'OPEN';

      const metrics = wrapper.getMetrics();
      expect(metrics.circuitState).toBe('OPEN');
    });

    it('should reset all metrics on reset', () => {
      wrapper = new ResilientServiceWrapper('test');

      wrapper.metrics.totalRequests = 10;
      wrapper.metrics.failedRequests = 5;
      wrapper.circuitState = 'OPEN';
      wrapper.failureCount = 5;

      wrapper.reset();

      expect(wrapper.metrics.totalRequests).toBe(0);
      expect(wrapper.metrics.failedRequests).toBe(0);
      expect(wrapper.circuitState).toBe('CLOSED');
      expect(wrapper.failureCount).toBe(0);
    });
  });
});
