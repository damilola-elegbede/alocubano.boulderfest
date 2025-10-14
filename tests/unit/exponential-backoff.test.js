/**
 * Exponential Backoff Unit Tests
 *
 * Comprehensive testing of exponential backoff retry logic including:
 * - Retry logic with exponential delays
 * - Jitter application (±10% randomness)
 * - Max delay capping
 * - Custom retry predicates
 * - Error aggregation across retries
 * - Timeout enforcement per attempt
 * - Logging of retry attempts
 * - Edge cases (immediate success, permanent failure, max retries)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock implementation for testing purposes
// In Phase 4, this will import from lib/exponential-backoff.js
class ExponentialBackoff {
  constructor(options = {}) {
    this.config = {
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      maxRetries: options.maxRetries || 5,
      factor: options.factor || 2,
      jitter: options.jitter !== false,
      jitterPercent: options.jitterPercent || 0.1,
      timeout: options.timeout || 60000,
      retryIf: options.retryIf || (() => true),
      onRetry: options.onRetry || (() => {}),
      ...options
    };
  }

  async execute(operation) {
    const errors = [];
    const startTime = Date.now();
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      // Check overall timeout
      if (Date.now() - startTime > this.config.timeout) {
        const timeoutError = new Error(`Overall timeout exceeded: ${this.config.timeout}ms`);
        timeoutError.code = 'TIMEOUT_ERROR';
        timeoutError.attempts = attempt;
        timeoutError.errors = errors;
        throw timeoutError;
      }

      try {
        const result = await operation();
        return result;
      } catch (error) {
        errors.push({
          attempt: attempt + 1,
          error: error.message || error,
          timestamp: new Date().toISOString()
        });

        attempt++;

        // Check if we should retry
        if (attempt > this.config.maxRetries || !this.config.retryIf(error)) {
          const finalError = new Error(`Operation failed after ${attempt} attempts`);
          finalError.code = 'MAX_RETRIES_EXCEEDED';
          finalError.attempts = attempt;
          finalError.errors = errors;
          finalError.originalError = error;
          throw finalError;
        }

        // Calculate delay with exponential backoff
        const delay = this._calculateDelay(attempt);

        // Call onRetry callback
        this.config.onRetry({
          attempt,
          delay,
          error,
          nextAttempt: attempt + 1
        });

        // Wait before retry
        await this._sleep(delay);
      }
    }
  }

  _calculateDelay(attempt) {
    // Calculate exponential delay: initialDelay * (factor ^ (attempt - 1))
    let delay = this.config.initialDelay * Math.pow(this.config.factor, attempt - 1);

    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelay);

    // Apply jitter if enabled
    if (this.config.jitter) {
      const jitterRange = delay * this.config.jitterPercent;
      const jitterAmount = (Math.random() * 2 - 1) * jitterRange;
      delay = Math.max(0, delay + jitterAmount);
    }

    return Math.round(delay);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Helper function to create backoff instance
function withExponentialBackoff(operation, options = {}) {
  const backoff = new ExponentialBackoff(options);
  return backoff.execute(operation);
}

describe('ExponentialBackoff', () => {
  let backoff;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      backoff = new ExponentialBackoff();

      expect(backoff.config.initialDelay).toBe(1000);
      expect(backoff.config.maxDelay).toBe(30000);
      expect(backoff.config.maxRetries).toBe(5);
      expect(backoff.config.factor).toBe(2);
      expect(backoff.config.jitter).toBe(true);
      expect(backoff.config.jitterPercent).toBe(0.1);
      expect(backoff.config.timeout).toBe(60000);
    });

    it('should accept custom configuration options', () => {
      backoff = new ExponentialBackoff({
        initialDelay: 500,
        maxDelay: 60000,
        maxRetries: 10,
        factor: 3,
        jitter: false,
        timeout: 120000
      });

      expect(backoff.config.initialDelay).toBe(500);
      expect(backoff.config.maxDelay).toBe(60000);
      expect(backoff.config.maxRetries).toBe(10);
      expect(backoff.config.factor).toBe(3);
      expect(backoff.config.jitter).toBe(false);
      expect(backoff.config.timeout).toBe(120000);
    });
  });

  describe('Basic Retry Logic', () => {
    it('should succeed immediately on first attempt', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100 });
      const operation = vi.fn().mockResolvedValue('success');

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100, maxRetries: 3 });
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Attempt 1 failed'))
        .mockRejectedValueOnce(new Error('Attempt 2 failed'))
        .mockResolvedValue('success');

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries exceeded', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100, maxRetries: 2 });
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      const resultPromise = backoff.execute(operation);
      const assertion = expect(resultPromise).rejects.toThrow('Operation failed after 3 attempts');

      await vi.runAllTimersAsync();
      await assertion;

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should aggregate errors across all attempts', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100, maxRetries: 2 });
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'));

      // Capture error for detailed inspection of error aggregation across all retry attempts
      const resultPromise = backoff.execute(operation);
      const errorCapture = resultPromise.catch(error => error);

      await vi.runAllTimersAsync();
      const error = await errorCapture;

      expect(error.errors).toHaveLength(3);
      expect(error.errors[0].attempt).toBe(1);
      expect(error.errors[1].attempt).toBe(2);
      expect(error.errors[2].attempt).toBe(3);
    });
  });

  describe('Exponential Delay Calculation', () => {
    it('should calculate delays with exponential growth', () => {
      backoff = new ExponentialBackoff({
        initialDelay: 1000,
        factor: 2,
        jitter: false
      });

      expect(backoff._calculateDelay(1)).toBe(1000);  // 1000 * 2^0
      expect(backoff._calculateDelay(2)).toBe(2000);  // 1000 * 2^1
      expect(backoff._calculateDelay(3)).toBe(4000);  // 1000 * 2^2
      expect(backoff._calculateDelay(4)).toBe(8000);  // 1000 * 2^3
      expect(backoff._calculateDelay(5)).toBe(16000); // 1000 * 2^4
    });

    it('should cap delays at maxDelay', () => {
      backoff = new ExponentialBackoff({
        initialDelay: 1000,
        maxDelay: 5000,
        factor: 2,
        jitter: false
      });

      expect(backoff._calculateDelay(1)).toBe(1000);
      expect(backoff._calculateDelay(2)).toBe(2000);
      expect(backoff._calculateDelay(3)).toBe(4000);
      expect(backoff._calculateDelay(4)).toBe(5000); // Capped
      expect(backoff._calculateDelay(5)).toBe(5000); // Capped
    });

    it('should apply jitter within ±10% range', () => {
      backoff = new ExponentialBackoff({
        initialDelay: 1000,
        factor: 2,
        jitter: true,
        jitterPercent: 0.1
      });

      const delays = [];
      for (let i = 0; i < 100; i++) {
        const delay = backoff._calculateDelay(1);
        delays.push(delay);
      }

      // All delays should be within 900-1100 range (±10%)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(900);
        expect(delay).toBeLessThanOrEqual(1100);
      });

      // Delays should vary (not all the same)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should not apply jitter when disabled', () => {
      backoff = new ExponentialBackoff({
        initialDelay: 1000,
        factor: 2,
        jitter: false
      });

      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(backoff._calculateDelay(1));
      }

      // All delays should be exactly 1000
      delays.forEach(delay => {
        expect(delay).toBe(1000);
      });
    });

    it('should support custom exponential factors', () => {
      backoff = new ExponentialBackoff({
        initialDelay: 1000,
        factor: 3,
        jitter: false
      });

      expect(backoff._calculateDelay(1)).toBe(1000);  // 1000 * 3^0
      expect(backoff._calculateDelay(2)).toBe(3000);  // 1000 * 3^1
      expect(backoff._calculateDelay(3)).toBe(9000);  // 1000 * 3^2
      expect(backoff._calculateDelay(4)).toBe(27000); // 1000 * 3^3
    });
  });

  describe('Custom Retry Predicates', () => {
    it('should use custom retryIf predicate', async () => {
      const retryIfNetworkError = (error) => {
        return error.message.includes('network');
      };

      backoff = new ExponentialBackoff({
        initialDelay: 100,
        maxRetries: 3,
        retryIf: retryIfNetworkError
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValue('success');

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry when predicate returns false', async () => {
      const retryIfNetworkError = (error) => {
        return error.message.includes('network');
      };

      backoff = new ExponentialBackoff({
        initialDelay: 100,
        maxRetries: 3,
        retryIf: retryIfNetworkError
      });

      const operation = vi.fn().mockRejectedValue(new Error('validation error'));

      const resultPromise = backoff.execute(operation);
      const errorCapture = resultPromise.catch(error => error);

      await vi.runAllTimersAsync();
      const error = await errorCapture;

      expect(error.code).toBe('MAX_RETRIES_EXCEEDED');
      expect(operation).toHaveBeenCalledTimes(1); // No retries
    });

    it('should retry on transient errors only', async () => {
      const isTransientError = (error) => {
        const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'];
        return transientCodes.includes(error.code);
      };

      backoff = new ExponentialBackoff({
        initialDelay: 100,
        maxRetries: 3,
        retryIf: isTransientError
      });

      const timeoutError = new Error('Connection timeout');
      timeoutError.code = 'ETIMEDOUT';

      const operation = vi.fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValue('success');

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on permanent errors', async () => {
      const isRetryableError = (error) => {
        const permanentCodes = ['EPERM', 'EAUTH', 'EINVAL'];
        return !permanentCodes.includes(error.code);
      };

      backoff = new ExponentialBackoff({
        initialDelay: 100,
        maxRetries: 3,
        retryIf: isRetryableError
      });

      const authError = new Error('Authentication failed');
      authError.code = 'EAUTH';

      const operation = vi.fn().mockRejectedValue(authError);

      const resultPromise = backoff.execute(operation);
      const errorCapture = resultPromise.catch(error => error); // Capture to prevent unhandled rejection

      await vi.runAllTimersAsync();
      await errorCapture;

      expect(operation).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('Timeout Enforcement', () => {
    it('should enforce overall timeout', async () => {
      // Mock Date.now() to work with fake timers
      let currentTime = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      backoff = new ExponentialBackoff({
        initialDelay: 1000,
        maxRetries: 10,
        timeout: 5000
      });

      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      const resultPromise = backoff.execute(operation);
      const assertion = expect(resultPromise).rejects.toMatchObject({
        code: 'TIMEOUT_ERROR',
        message: expect.stringContaining('Overall timeout exceeded')
      });

      // Advance time past the timeout
      currentTime += 5100;
      await vi.advanceTimersByTimeAsync(5100);

      await assertion;
    });

    it('should succeed if operation completes before timeout', async () => {
      backoff = new ExponentialBackoff({
        initialDelay: 100,
        maxRetries: 3,
        timeout: 10000
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
    });

    it('should include attempt count in timeout error', async () => {
      // Mock Date.now() to work with fake timers
      let currentTime = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      backoff = new ExponentialBackoff({
        initialDelay: 1000,
        maxRetries: 10,
        timeout: 3000
      });

      const operation = vi.fn().mockRejectedValue(new Error('Slow operation'));

      const resultPromise = backoff.execute(operation);
      const assertion = expect(resultPromise).rejects.toMatchObject({
        attempts: expect.any(Number),
        errors: expect.arrayContaining([
          expect.objectContaining({
            attempt: expect.any(Number)
          })
        ])
      });

      // Advance time past the timeout
      currentTime += 3100;
      await vi.advanceTimersByTimeAsync(3100);

      await assertion;
    });
  });

  describe('Retry Callbacks and Logging', () => {
    it('should call onRetry callback on each retry', async () => {
      const onRetry = vi.fn();

      backoff = new ExponentialBackoff({
        initialDelay: 100,
        maxRetries: 3,
        onRetry
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          delay: expect.any(Number),
          error: expect.any(Error),
          nextAttempt: 2
        })
      );
    });

    it('should provide retry metadata in callback', async () => {
      const onRetry = vi.fn();

      backoff = new ExponentialBackoff({
        initialDelay: 100,
        maxRetries: 2,
        jitter: false,
        onRetry
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValue('success');

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(onRetry).toHaveBeenCalledWith({
        attempt: 1,
        delay: 100,
        error: expect.objectContaining({ message: 'First failure' }),
        nextAttempt: 2
      });
    });

    it('should log retry attempts with increasing delays', async () => {
      const retryLog = [];
      const onRetry = (info) => {
        retryLog.push({
          attempt: info.attempt,
          delay: info.delay
        });
      };

      backoff = new ExponentialBackoff({
        initialDelay: 100,
        factor: 2,
        maxRetries: 3,
        jitter: false,
        onRetry
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'))
        .mockResolvedValue('success');

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(retryLog).toEqual([
        { attempt: 1, delay: 100 },
        { attempt: 2, delay: 200 },
        { attempt: 3, delay: 400 }
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle operations that return null', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100 });
      const operation = vi.fn().mockResolvedValue(null);

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operations that return undefined', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100 });
      const operation = vi.fn().mockResolvedValue(undefined);

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeUndefined();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle synchronous operations', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100 });
      const operation = vi.fn(() => Promise.resolve('sync result'));

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('sync result');
    });

    it('should handle maxRetries of 0', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100, maxRetries: 0 });
      const operation = vi.fn().mockRejectedValue(new Error('Failed'));

      const resultPromise = backoff.execute(operation);
      const errorCapture = resultPromise.catch(error => error);

      await vi.runAllTimersAsync();
      const error = await errorCapture;

      expect(operation).toHaveBeenCalledTimes(1); // Only initial attempt
      expect(error.attempts).toBe(1);
    });

    it('should handle very large retry counts', async () => {
      backoff = new ExponentialBackoff({
        initialDelay: 10,
        maxRetries: 100,
        maxDelay: 1000,
        jitter: false
      });

      let attemptCount = 0;
      const operation = vi.fn(() => {
        attemptCount++;
        if (attemptCount < 50) {
          return Promise.reject(new Error('Not yet'));
        }
        return Promise.resolve('finally succeeded');
      });

      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('finally succeeded');
      expect(attemptCount).toBe(50);
    });
  });

  describe('Helper Function: withExponentialBackoff', () => {
    it('should provide convenient wrapper function', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const resultPromise = withExponentialBackoff(operation, {
        initialDelay: 100,
        maxRetries: 2
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should support default options', async () => {
      const operation = vi.fn().mockResolvedValue('immediate success');

      const resultPromise = withExponentialBackoff(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('immediate success');
    });
  });

  describe('Performance', () => {
    it('should complete fast operations quickly', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 10 });
      const operation = vi.fn().mockResolvedValue('fast');

      const startTime = Date.now();
      const resultPromise = backoff.execute(operation);
      await vi.runAllTimersAsync();
      await resultPromise;
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent retry operations', async () => {
      backoff = new ExponentialBackoff({ initialDelay: 100, maxRetries: 2 });

      const operations = Array(10).fill(null).map((_, index) => {
        let attempts = 0;
        return vi.fn(() => {
          attempts++;
          if (attempts < 2) {
            return Promise.reject(new Error(`Op ${index} attempt ${attempts} failed`));
          }
          return Promise.resolve(`Op ${index} success`);
        });
      });

      const promises = operations.map(op => {
        const b = new ExponentialBackoff({ initialDelay: 100, maxRetries: 2 });
        return b.execute(op);
      });

      const resultsPromise = Promise.all(promises);
      await vi.runAllTimersAsync();
      const results = await resultsPromise;

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result).toBe(`Op ${index} success`);
      });
    });
  });
});
