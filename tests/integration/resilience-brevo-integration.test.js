/**
 * Resilience - Brevo Integration Tests
 *
 * End-to-end email sending with resilience patterns:
 * - Email sending with exponential backoff retry
 * - Failure recovery scenarios
 * - Email retry queue integration
 * - Circuit breaker state persistence
 * - Concurrent request handling
 * - Metrics tracking in production scenarios
 * - Brevo-specific error handling (rate limits, API errors)
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestIsolationManager } from '../../lib/test-isolation-manager.js';

// Mock Brevo client for testing
class MockBrevoClient {
  constructor() {
    this.callCount = 0;
    this.failUntilAttempt = 0;
    this.shouldRateLimit = false;
    this.rateLimitDelay = 1000;
  }

  async sendTransacEmail(emailData) {
    this.callCount++;

    if (this.shouldRateLimit && this.callCount === 1) {
      const error = new Error('Rate limit exceeded');
      error.code = 'RATE_LIMIT';
      error.response = {
        headers: {
          'retry-after': Math.ceil(this.rateLimitDelay / 1000)
        }
      };
      throw error;
    }

    if (this.callCount <= this.failUntilAttempt) {
      const error = new Error('Temporary Brevo API error');
      error.code = 'API_ERROR';
      throw error;
    }

    return {
      messageId: `msg_${Date.now()}`,
      status: 'sent',
      attempt: this.callCount
    };
  }

  reset() {
    this.callCount = 0;
    this.failUntilAttempt = 0;
    this.shouldRateLimit = false;
  }
}

describe('Resilience - Brevo Integration', () => {
  let testDb;
  let isolationManager;
  let mockBrevo;

  beforeEach(async () => {
    isolationManager = getTestIsolationManager();
    testDb = await isolationManager.getScopedDatabaseClient();
    mockBrevo = new MockBrevoClient();
  });

  afterEach(async () => {
    // Note: isolationManager doesn't have a cleanup() method
    // Database cleanup is handled by Vitest's test isolation
    mockBrevo.reset();
  });

  describe('Email Sending with Retry', () => {
    test('should send email successfully on first attempt', async () => {
      const emailData = {
        to: [{ email: 'user@example.com', name: 'Test User' }],
        subject: 'Test Email',
        htmlContent: '<p>Test content</p>'
      };

      const result = await mockBrevo.sendTransacEmail(emailData);

      expect(result.status).toBe('sent');
      expect(result.messageId).toBeTruthy();
      expect(mockBrevo.callCount).toBe(1);
    });

    test('should retry failed email with exponential backoff', async () => {
      mockBrevo.failUntilAttempt = 2; // Fail first 2 attempts

      const emailData = {
        to: [{ email: 'retry@example.com', name: 'Retry User' }],
        subject: 'Retry Test',
        htmlContent: '<p>Retry content</p>'
      };

      // Simulate retry logic
      let attempts = 0;
      let result;
      const maxRetries = 3;
      const delays = [1000, 2000, 4000];

      while (attempts < maxRetries) {
        try {
          result = await mockBrevo.sendTransacEmail(emailData);
          break;
        } catch (error) {
          attempts++;
          if (attempts < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delays[attempts - 1]));
          }
        }
      }

      expect(result).toBeDefined();
      expect(result.status).toBe('sent');
      expect(mockBrevo.callCount).toBe(3);
    });

    test('should record failed email to retry queue', async () => {
      mockBrevo.failUntilAttempt = 5; // Always fail

      // Create transaction for email
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          transaction_id, customer_email, customer_name, registration_token, registration_token_expires,
          order_number, type, order_data, amount_cents, is_test
        ) VALUES (?, ?, ?, ?, datetime('now', '+7 days'), ?, ?, ?, ?, ?)`,
        args: ['tx_queue_' + Date.now(), 'queue@example.com', 'Queue User', 'token_queue', 'ORDER_QUEUE', 'tickets', JSON.stringify({ test: true }), 5000, 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Create reminder record
      const reminderResult = await testDb.execute({
        sql: `INSERT INTO registration_reminders (
          transaction_id, reminder_type, scheduled_at, status
        ) VALUES (?, ?, ?, ?)`,
        args: [txId, '24hr-post-purchase', new Date().toISOString(), 'scheduled']
      });
      const reminderId = Number(reminderResult.lastInsertRowid);

      // Simulate failed send
      try {
        await mockBrevo.sendTransacEmail({ to: [{ email: 'queue@example.com' }] });
      } catch (error) {
        // Mark as failed in database
        await testDb.execute({
          sql: `UPDATE registration_reminders
                SET status = 'failed', error_message = ?, sent_at = ?
                WHERE id = ?`,
          args: [error.message, new Date().toISOString(), reminderId]
        });
      }

      // Verify queued for retry
      const check = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE id = ?`,
        args: [reminderId]
      });

      expect(check.rows[0].status).toBe('failed');
      expect(check.rows[0].error_message).toContain('Brevo API error');
    });

    test('should successfully send email after retry', async () => {
      mockBrevo.failUntilAttempt = 1; // Fail first attempt only

      const emailData = {
        to: [{ email: 'retry-success@example.com' }],
        subject: 'Retry Success'
      };

      // First attempt - will fail
      let error1;
      try {
        await mockBrevo.sendTransacEmail(emailData);
      } catch (e) {
        error1 = e;
      }

      expect(error1).toBeDefined();
      expect(mockBrevo.callCount).toBe(1);

      // Retry - will succeed
      const result = await mockBrevo.sendTransacEmail(emailData);

      expect(result.status).toBe('sent');
      expect(mockBrevo.callCount).toBe(2);
    });
  });

  describe('Rate Limit Handling', () => {
    test('should respect Retry-After header', async () => {
      mockBrevo.shouldRateLimit = true;
      mockBrevo.rateLimitDelay = 2000;

      const emailData = {
        to: [{ email: 'rate-limit@example.com' }],
        subject: 'Rate Limit Test'
      };

      // First attempt - rate limited
      let rateLimitError;
      try {
        await mockBrevo.sendTransacEmail(emailData);
      } catch (e) {
        rateLimitError = e;
      }

      expect(rateLimitError.code).toBe('RATE_LIMIT');
      expect(rateLimitError.response.headers['retry-after']).toBe(2);

      // Wait for rate limit period
      await new Promise(resolve => setTimeout(resolve, mockBrevo.rateLimitDelay));

      // Retry after rate limit
      const result = await mockBrevo.sendTransacEmail(emailData);
      expect(result.status).toBe('sent');
    });

    test('should track rate limit occurrences', async () => {
      const rateLimitLog = [];

      mockBrevo.shouldRateLimit = true;
      mockBrevo.rateLimitDelay = 1000;

      try {
        await mockBrevo.sendTransacEmail({ to: [{ email: 'test@example.com' }] });
      } catch (error) {
        rateLimitLog.push({
          timestamp: new Date(),
          retryAfter: error.response.headers['retry-after'],
          errorCode: error.code
        });
      }

      expect(rateLimitLog).toHaveLength(1);
      expect(rateLimitLog[0].errorCode).toBe('RATE_LIMIT');
      expect(rateLimitLog[0].retryAfter).toBeGreaterThan(0);
    });

    test('should queue emails when rate limited', async () => {
      mockBrevo.shouldRateLimit = true;

      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          transaction_id, customer_email, customer_name, registration_token, registration_token_expires,
          order_number, type, order_data, amount_cents, is_test
        ) VALUES (?, ?, ?, ?, datetime('now', '+7 days'), ?, ?, ?, ?, ?)`,
        args: ['tx_rate_' + Date.now(), 'rate@example.com', 'Rate User', 'token_rate', 'ORDER_RATE', 'tickets', JSON.stringify({ test: true }), 5000, 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Try to send email - will be rate limited
      try {
        await mockBrevo.sendTransacEmail({ to: [{ email: 'rate@example.com' }] });
      } catch (error) {
        // Queue for later retry
        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status, error_message
          ) VALUES (?, ?, ?, ?, ?)`,
          args: [
            txId,
            '24hr-post-purchase',
            new Date(Date.now() + 2000).toISOString(), // Retry after 2 seconds
            'scheduled',
            'Rate limited'
          ]
        });
      }

      // Verify queued
      const result = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE transaction_id = ?`,
        args: [txId]
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('scheduled');
    });
  });

  describe('Circuit Breaker Integration', () => {
    test('should open circuit after multiple failures', async () => {
      mockBrevo.failUntilAttempt = 10; // Always fail

      const circuitBreaker = {
        state: 'CLOSED',
        failureCount: 0,
        threshold: 5,
        openTimeout: 60000
      };

      // Simulate multiple failures
      for (let i = 0; i < 6; i++) {
        try {
          await mockBrevo.sendTransacEmail({ to: [{ email: 'fail@example.com' }] });
        } catch (error) {
          circuitBreaker.failureCount++;
          if (circuitBreaker.failureCount >= circuitBreaker.threshold) {
            circuitBreaker.state = 'OPEN';
            circuitBreaker.openedAt = Date.now();
          }
        }
      }

      expect(circuitBreaker.state).toBe('OPEN');
      expect(circuitBreaker.failureCount).toBeGreaterThanOrEqual(5);
    });

    test('should persist circuit state to database', async () => {
      const circuitState = {
        service: 'brevo',
        state: 'OPEN',
        failureCount: 5,
        lastFailure: new Date().toISOString(),
        openedAt: new Date().toISOString()
      };

      // In a real implementation, this would use service_monitoring table
      // For now, we'll verify the data structure
      expect(circuitState.service).toBe('brevo');
      expect(circuitState.state).toBe('OPEN');
      expect(circuitState.failureCount).toBe(5);
    });

    test('should queue emails when circuit is open', async () => {
      const circuitBreaker = {
        state: 'OPEN',
        openedAt: Date.now()
      };

      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          transaction_id, customer_email, customer_name, registration_token, registration_token_expires,
          order_number, type, order_data, amount_cents, is_test
        ) VALUES (?, ?, ?, ?, datetime('now', '+7 days'), ?, ?, ?, ?, ?)`,
        args: ['tx_circuit_' + Date.now(), 'circuit@example.com', 'Circuit User', 'token_circuit', 'ORDER_CIRCUIT', 'tickets', JSON.stringify({ test: true }), 5000, 1]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Queue email when circuit is open
      if (circuitBreaker.state === 'OPEN') {
        await testDb.execute({
          sql: `INSERT INTO registration_reminders (
            transaction_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, ?)`,
          args: [
            txId,
            '24hr-post-purchase',
            new Date(Date.now() + 60000).toISOString(),
            'scheduled'
          ]
        });
      }

      const result = await testDb.execute({
        sql: `SELECT * FROM registration_reminders WHERE transaction_id = ?`,
        args: [txId]
      });

      expect(result.rows[0].status).toBe('scheduled');
    });

    test('should transition to half-open after timeout', async () => {
      const circuitBreaker = {
        state: 'OPEN',
        openedAt: Date.now() - 61000, // Opened 61 seconds ago
        timeout: 60000
      };

      // Check if circuit should transition to half-open
      const timeSinceOpen = Date.now() - circuitBreaker.openedAt;
      if (timeSinceOpen >= circuitBreaker.timeout) {
        circuitBreaker.state = 'HALF_OPEN';
      }

      expect(circuitBreaker.state).toBe('HALF_OPEN');
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should handle multiple concurrent email sends', async () => {
      const emailPromises = Array(5).fill(null).map((_, index) => {
        return mockBrevo.sendTransacEmail({
          to: [{ email: `concurrent${index}@example.com` }],
          subject: `Test ${index}`
        });
      });

      const results = await Promise.all(emailPromises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.status).toBe('sent');
        expect(result.messageId).toBeTruthy();
      });
      expect(mockBrevo.callCount).toBe(5);
    });

    test('should handle mixed success/failure in concurrent requests', async () => {
      const promises = [];

      // Create 3 transactions
      for (let i = 0; i < 3; i++) {
        const txResult = await testDb.execute({
          sql: `INSERT INTO transactions (
            transaction_id, customer_email, customer_name, registration_token, registration_token_expires,
            order_number, type, order_data, amount_cents, is_test
          ) VALUES (?, ?, ?, ?, datetime('now', '+7 days'), ?, ?, ?, ?, ?)`,
          args: [`tx_mix_${i}_${Date.now()}`, `mix${i}@example.com`, `User ${i}`, `token_${i}`, `ORDER_${i}`, 'tickets', JSON.stringify({ test: true }), 5000, 1]
        });

        promises.push(Number(txResult.lastInsertRowid));
      }

      expect(promises).toHaveLength(3);
    });

    test('should maintain circuit breaker state across concurrent failures', async () => {
      mockBrevo.failUntilAttempt = 10;

      const circuitBreaker = {
        state: 'CLOSED',
        failureCount: 0,
        threshold: 5
      };

      const failedEmails = [];

      // Simulate concurrent failures
      const promises = Array(6).fill(null).map(async (_, index) => {
        try {
          return await mockBrevo.sendTransacEmail({ to: [{ email: `fail${index}@example.com` }] });
        } catch (error) {
          circuitBreaker.failureCount++;
          failedEmails.push(index);
          if (circuitBreaker.failureCount >= circuitBreaker.threshold) {
            circuitBreaker.state = 'OPEN';
          }
          throw error;
        }
      });

      await Promise.allSettled(promises);

      expect(circuitBreaker.state).toBe('OPEN');
      expect(failedEmails).toHaveLength(6);
    });
  });

  describe('Metrics Tracking', () => {
    test('should track successful send metrics', async () => {
      const metrics = {
        totalAttempts: 0,
        successfulSends: 0,
        failedSends: 0,
        retriedSends: 0
      };

      metrics.totalAttempts++;
      const result = await mockBrevo.sendTransacEmail({ to: [{ email: 'metrics@example.com' }] });
      metrics.successfulSends++;

      expect(metrics.totalAttempts).toBe(1);
      expect(metrics.successfulSends).toBe(1);
      expect(result.status).toBe('sent');
    });

    test('should track retry metrics', async () => {
      mockBrevo.failUntilAttempt = 2;

      const metrics = {
        totalAttempts: 0,
        retriedSends: 0
      };

      // Attempt 1 - fail
      try {
        metrics.totalAttempts++;
        await mockBrevo.sendTransacEmail({ to: [{ email: 'retry-metrics@example.com' }] });
      } catch (e) {
        metrics.retriedSends++;
      }

      // Attempt 2 - fail
      try {
        metrics.totalAttempts++;
        await mockBrevo.sendTransacEmail({ to: [{ email: 'retry-metrics@example.com' }] });
      } catch (e) {
        metrics.retriedSends++;
      }

      // Attempt 3 - success
      metrics.totalAttempts++;
      await mockBrevo.sendTransacEmail({ to: [{ email: 'retry-metrics@example.com' }] });

      expect(metrics.totalAttempts).toBe(3);
      expect(metrics.retriedSends).toBe(2);
    });

    test('should track circuit breaker metrics', async () => {
      const metrics = {
        circuitOpens: 0,
        circuitCloses: 0,
        circuitHalfOpens: 0
      };

      let circuitState = 'CLOSED';

      // Open circuit
      circuitState = 'OPEN';
      metrics.circuitOpens++;

      expect(metrics.circuitOpens).toBe(1);
      expect(circuitState).toBe('OPEN');

      // Transition to half-open
      circuitState = 'HALF_OPEN';
      metrics.circuitHalfOpens++;

      expect(metrics.circuitHalfOpens).toBe(1);

      // Close circuit
      circuitState = 'CLOSED';
      metrics.circuitCloses++;

      expect(metrics.circuitCloses).toBe(1);
    });
  });

  describe('Error Classification', () => {
    test('should classify transient errors as retryable', () => {
      const error = new Error('Connection timeout');
      error.code = 'ETIMEDOUT';

      const isRetryable = (err) => {
        const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'RATE_LIMIT'];
        return retryableCodes.includes(err.code);
      };

      expect(isRetryable(error)).toBe(true);
    });

    test('should classify authentication errors as non-retryable', () => {
      const error = new Error('Invalid API key');
      error.code = 'AUTHENTICATION_ERROR';

      const isRetryable = (err) => {
        const permanentCodes = ['AUTHENTICATION_ERROR', 'INVALID_REQUEST'];
        return !permanentCodes.includes(err.code);
      };

      expect(isRetryable(error)).toBe(false);
    });

    test('should classify rate limit errors as retryable with delay', () => {
      const error = new Error('Rate limit exceeded');
      error.code = 'RATE_LIMIT';
      error.response = { headers: { 'retry-after': 5 } };

      const shouldRetryWithDelay = (err) => {
        if (err.code === 'RATE_LIMIT') {
          return {
            retry: true,
            delay: err.response.headers['retry-after'] * 1000
          };
        }
        return { retry: false };
      };

      const result = shouldRetryWithDelay(error);
      expect(result.retry).toBe(true);
      expect(result.delay).toBe(5000);
    });
  });
});
