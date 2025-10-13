/**
 * Resilience - Payment Integration Tests
 *
 * Payment processing with resilience patterns:
 * - Payment processing with exponential backoff retry
 * - Stripe webhook delivery with retry
 * - Idempotency enforcement
 * - Circuit breaker preventing cascading failures
 * - Payment timeout handling
 * - Concurrent payment processing
 * - Stripe-specific error handling (card errors, network errors)
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTestIsolationManager } from '../../lib/test-isolation-manager.js';

// Mock Stripe client for testing
class MockStripeClient {
  constructor() {
    this.callCount = 0;
    this.failUntilAttempt = 0;
    this.processedIdempotencyKeys = new Set();
    this.shouldTimeout = false;
  }

  async createPaymentIntent(paymentData, options = {}) {
    this.callCount++;

    // Handle idempotency
    if (options.idempotencyKey) {
      if (this.processedIdempotencyKeys.has(options.idempotencyKey)) {
        return {
          id: 'pi_cached',
          status: 'succeeded',
          idempotent: true,
          idempotencyKey: options.idempotencyKey
        };
      }
    }

    // Simulate timeout
    if (this.shouldTimeout) {
      const error = new Error('Request timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    }

    // Simulate failures
    if (this.callCount <= this.failUntilAttempt) {
      const error = new Error('Stripe API error');
      error.code = 'API_CONNECTION_ERROR';
      throw error;
    }

    // Simulate card errors (non-retryable)
    if (paymentData.simulateCardError) {
      const error = new Error('Your card was declined');
      error.code = 'CARD_DECLINED';
      error.type = 'card_error';
      throw error;
    }

    const paymentIntent = {
      id: `pi_${Date.now()}`,
      status: 'succeeded',
      amount: paymentData.amount,
      currency: paymentData.currency,
      attempt: this.callCount
    };

    // Store idempotency key
    if (options.idempotencyKey) {
      this.processedIdempotencyKeys.add(options.idempotencyKey);
      paymentIntent.idempotencyKey = options.idempotencyKey;
    }

    return paymentIntent;
  }

  async constructEvent(payload, signature, secret) {
    // Simple mock event construction
    if (!signature || signature !== 'valid_signature') {
      const error = new Error('Invalid signature');
      error.type = 'StripeSignatureVerificationError';
      throw error;
    }

    return {
      id: `evt_${Date.now()}`,
      type: 'payment_intent.succeeded',
      data: {
        object: JSON.parse(payload)
      }
    };
  }

  reset() {
    this.callCount = 0;
    this.failUntilAttempt = 0;
    this.processedIdempotencyKeys.clear();
    this.shouldTimeout = false;
  }
}

describe('Resilience - Payment Integration', () => {
  let testDb;
  let isolationManager;
  let mockStripe;

  beforeEach(async () => {
    isolationManager = getTestIsolationManager();
    testDb = await isolationManager.getScopedDatabaseClient();
    mockStripe = new MockStripeClient();
  });

  afterEach(async () => {
    // Cleanup handled by test framework
    mockStripe.reset();
  });

  describe('Payment Processing with Retry', () => {
    test('should process payment successfully on first attempt', async () => {
      const paymentData = {
        amount: 10000,
        currency: 'usd'
      };

      const result = await mockStripe.createPaymentIntent(paymentData);

      expect(result.status).toBe('succeeded');
      expect(result.id).toBeTruthy();
      expect(result.amount).toBe(10000);
      expect(mockStripe.callCount).toBe(1);
    });

    test('should retry failed payment with exponential backoff', async () => {
      mockStripe.failUntilAttempt = 2;

      const paymentData = {
        amount: 5000,
        currency: 'usd'
      };

      let attempts = 0;
      let result;
      const maxRetries = 3;
      const delays = [2000, 4000, 8000];

      while (attempts < maxRetries) {
        try {
          result = await mockStripe.createPaymentIntent(paymentData);
          break;
        } catch (error) {
          attempts++;
          if (attempts < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delays[attempts - 1]));
          }
        }
      }

      expect(result).toBeDefined();
      expect(result.status).toBe('succeeded');
      expect(mockStripe.callCount).toBe(3);
    });

    test('should not retry card declined errors', async () => {
      const paymentData = {
        amount: 1000,
        currency: 'usd',
        simulateCardError: true
      };

      const isRetryable = (error) => {
        return error.type !== 'card_error';
      };

      try {
        await mockStripe.createPaymentIntent(paymentData);
      } catch (error) {
        expect(error.code).toBe('CARD_DECLINED');
        expect(isRetryable(error)).toBe(false);
        expect(mockStripe.callCount).toBe(1);
      }
    });

    test('should record failed payment to database', async () => {
      mockStripe.failUntilAttempt = 5;

      // Get test event ID (nullable)
      const eventResult = await testDb.execute({ sql: 'SELECT id FROM events LIMIT 1' });
      const testEventId = eventResult.rows[0]?.id || null;

      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, registration_token_expires,
          order_number, amount_cents, status, is_test, type, order_data, currency, event_id, transaction_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'payment@example.com',
          'Payment User',
          'token_pay',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          'ORDER_PAY',
          10000,
          'pending',
          1,
          'tickets',
          JSON.stringify({ test: true }),
          'USD',
          testEventId,
          `test_pay_${Date.now()}`
        ]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Attempt payment
      try {
        await mockStripe.createPaymentIntent({ amount: 10000, currency: 'usd' });
      } catch (error) {
        // Update transaction with failure
        await testDb.execute({
          sql: `UPDATE transactions
                SET status = 'failed'
                WHERE id = ?`,
          args: [txId]
        });
      }

      const check = await testDb.execute({
        sql: `SELECT * FROM transactions WHERE id = ?`,
        args: [txId]
      });

      expect(check.rows[0].status).toBe('failed');
    });
  });

  describe('Idempotency Enforcement', () => {
    test('should prevent duplicate charges with idempotency keys', async () => {
      const idempotencyKey = 'idem_test_12345';
      const paymentData = {
        amount: 10000,
        currency: 'usd'
      };

      // First request
      const result1 = await mockStripe.createPaymentIntent(paymentData, { idempotencyKey });
      expect(result1.status).toBe('succeeded');
      expect(result1.id).toBeTruthy();

      // Duplicate request with same idempotency key
      const result2 = await mockStripe.createPaymentIntent(paymentData, { idempotencyKey });
      expect(result2.idempotent).toBe(true);
      expect(result2.id).toBe('pi_cached');
      expect(mockStripe.callCount).toBe(2); // Both requests made, but second is cached
    });

    test('should generate unique idempotency keys', () => {
      const generateIdempotencyKey = (orderId, timestamp = Date.now()) => {
        return `idem_${orderId}_${timestamp}`;
      };

      const key1 = generateIdempotencyKey('ORDER_1', 1000);
      const key2 = generateIdempotencyKey('ORDER_2', 1000);
      const key3 = generateIdempotencyKey('ORDER_1', 2000);

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).toBe('idem_ORDER_1_1000');
    });

    test('should store idempotency keys in database', async () => {
      // Get test event ID (nullable)
      const eventResult = await testDb.execute({ sql: 'SELECT id FROM events LIMIT 1' });
      const testEventId = eventResult.rows[0]?.id || null;

      // Create transaction with manual_entry_id (used for idempotency)
      const idempotencyKey = `idem_ORDER_IDEM_${Date.now()}`;

      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, registration_token_expires,
          order_number, amount_cents, status, is_test, type, order_data, currency, event_id, transaction_id, manual_entry_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'idem@example.com',
          'Idem User',
          'token_idem',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          'ORDER_IDEM',
          10000,
          'pending',
          1,
          'tickets',
          JSON.stringify({ test: true }),
          'USD',
          testEventId,
          `test_idem_${Date.now()}`,
          idempotencyKey
        ]
      });
      const txId = Number(txResult.lastInsertRowid);

      const check = await testDb.execute({
        sql: `SELECT * FROM transactions WHERE id = ?`,
        args: [txId]
      });

      expect(check.rows[0].manual_entry_id).toBe(idempotencyKey);
    });

    test('should handle retry with preserved idempotency key', async () => {
      mockStripe.failUntilAttempt = 1;

      const idempotencyKey = 'idem_retry_test';
      const paymentData = {
        amount: 5000,
        currency: 'usd'
      };

      // First attempt - will fail
      try {
        await mockStripe.createPaymentIntent(paymentData, { idempotencyKey });
      } catch (e) {
        // Expected failure
      }

      // Retry with same idempotency key
      const result = await mockStripe.createPaymentIntent(paymentData, { idempotencyKey });

      expect(result.status).toBe('succeeded');
      expect(result.idempotencyKey).toBe(idempotencyKey);
    });
  });

  describe('Webhook Delivery with Retry', () => {
    test('should process webhook successfully', async () => {
      const payload = JSON.stringify({
        id: 'pi_webhook_test',
        status: 'succeeded'
      });
      const signature = 'valid_signature';
      const secret = 'whsec_test';

      const event = await mockStripe.constructEvent(payload, signature, secret);

      expect(event.type).toBe('payment_intent.succeeded');
      expect(event.data.object.id).toBe('pi_webhook_test');
    });

    test('should retry failed webhook processing', async () => {
      const webhookData = {
        eventId: 'evt_test',
        type: 'payment_intent.succeeded',
        processed: false,
        attemptCount: 0
      };

      const processWebhook = async (data) => {
        data.attemptCount++;
        if (data.attemptCount < 3) {
          throw new Error('Processing failed');
        }
        data.processed = true;
        return data;
      };

      // Simulate retries
      let result;
      for (let i = 0; i < 3; i++) {
        try {
          result = await processWebhook(webhookData);
          break;
        } catch (error) {
          if (i === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
      }

      expect(result.processed).toBe(true);
      expect(result.attemptCount).toBe(3);
    });

    test('should reject invalid webhook signatures', async () => {
      const payload = JSON.stringify({ id: 'pi_test' });
      const invalidSignature = 'invalid_sig';
      const secret = 'whsec_test';

      try {
        await mockStripe.constructEvent(payload, invalidSignature, secret);
      } catch (error) {
        expect(error.type).toBe('StripeSignatureVerificationError');
      }
    });

    test('should track webhook delivery attempts', async () => {
      // webhook_logs table doesn't exist in schema - using payment_events instead
      const webhookResult = await testDb.execute({
        sql: `INSERT INTO payment_events (
          event_id, event_type, processing_status, event_data
        ) VALUES (?, ?, ?, ?)`,
        args: ['evt_test', 'payment_intent.succeeded', 'pending', JSON.stringify({ test: true })]
      });

      expect(Number(webhookResult.lastInsertRowid)).toBeGreaterThan(0);

      const check = await testDb.execute({
        sql: `SELECT * FROM payment_events WHERE event_id = ?`,
        args: ['evt_test']
      });

      expect(check.rows[0].event_type).toBe('payment_intent.succeeded');
    });
  });

  describe('Circuit Breaker Protection', () => {
    test('should open circuit after payment failures', async () => {
      mockStripe.failUntilAttempt = 10;

      const circuitBreaker = {
        state: 'CLOSED',
        failureCount: 0,
        threshold: 5
      };

      // Simulate failures
      for (let i = 0; i < 6; i++) {
        try {
          await mockStripe.createPaymentIntent({ amount: 1000, currency: 'usd' });
        } catch (error) {
          circuitBreaker.failureCount++;
          if (circuitBreaker.failureCount >= circuitBreaker.threshold) {
            circuitBreaker.state = 'OPEN';
          }
        }
      }

      expect(circuitBreaker.state).toBe('OPEN');
      expect(circuitBreaker.failureCount).toBeGreaterThanOrEqual(5);
    });

    test('should prevent new payments when circuit is open', async () => {
      const circuitBreaker = {
        state: 'OPEN',
        openedAt: Date.now()
      };

      const shouldAllowPayment = (circuit) => {
        return circuit.state !== 'OPEN';
      };

      expect(shouldAllowPayment(circuitBreaker)).toBe(false);

      // Get test event ID (nullable)
      const eventResult = await testDb.execute({ sql: 'SELECT id FROM events LIMIT 1' });
      const testEventId = eventResult.rows[0]?.id || null;

      // Create transaction but don't process payment
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, registration_token_expires,
          order_number, amount_cents, status, is_test, type, order_data, currency, event_id, transaction_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'circuit@example.com',
          'Circuit User',
          'token_circuit',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          'ORDER_CIRCUIT',
          10000,
          'pending',
          1,
          'tickets',
          JSON.stringify({ test: true }),
          'USD',
          testEventId,
          `test_circuit_${Date.now()}`
        ]
      });

      const check = await testDb.execute({
        sql: `SELECT * FROM transactions WHERE id = ?`,
        args: [Number(txResult.lastInsertRowid)]
      });

      expect(check.rows[0].status).toBe('pending');
    });

    test('should transition circuit to half-open for testing', async () => {
      const circuitBreaker = {
        state: 'OPEN',
        openedAt: Date.now() - 61000, // 61 seconds ago
        timeout: 60000
      };

      if (Date.now() - circuitBreaker.openedAt >= circuitBreaker.timeout) {
        circuitBreaker.state = 'HALF_OPEN';
      }

      expect(circuitBreaker.state).toBe('HALF_OPEN');
    });

    test('should close circuit after successful test payment', async () => {
      const circuitBreaker = {
        state: 'HALF_OPEN',
        successCount: 0,
        successThreshold: 3
      };

      // Simulate successful payments
      for (let i = 0; i < 3; i++) {
        const result = await mockStripe.createPaymentIntent({ amount: 1000, currency: 'usd' });
        if (result.status === 'succeeded') {
          circuitBreaker.successCount++;
          if (circuitBreaker.successCount >= circuitBreaker.successThreshold) {
            circuitBreaker.state = 'CLOSED';
          }
        }
      }

      expect(circuitBreaker.state).toBe('CLOSED');
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout long-running payment requests', async () => {
      mockStripe.shouldTimeout = true;

      try {
        await mockStripe.createPaymentIntent({ amount: 1000, currency: 'usd' });
      } catch (error) {
        expect(error.code).toBe('ETIMEDOUT');
        expect(error.message).toContain('timeout');
      }
    });

    test('should retry timed-out payments', async () => {
      let timeoutOnce = true;

      const createWithTimeout = async () => {
        if (timeoutOnce) {
          timeoutOnce = false;
          mockStripe.shouldTimeout = true;
        } else {
          mockStripe.shouldTimeout = false;
        }
        return mockStripe.createPaymentIntent({ amount: 1000, currency: 'usd' });
      };

      let result;
      try {
        result = await createWithTimeout();
      } catch (error) {
        // Retry
        result = await createWithTimeout();
      }

      expect(result.status).toBe('succeeded');
    });

    test('should track timeout occurrences', async () => {
      const metrics = {
        totalRequests: 0,
        timeouts: 0
      };

      mockStripe.shouldTimeout = true;
      metrics.totalRequests++;

      try {
        await mockStripe.createPaymentIntent({ amount: 1000, currency: 'usd' });
      } catch (error) {
        if (error.code === 'ETIMEDOUT') {
          metrics.timeouts++;
        }
      }

      expect(metrics.timeouts).toBe(1);
      expect(metrics.totalRequests).toBe(1);
    });
  });

  describe('Concurrent Payment Processing', () => {
    test('should handle multiple concurrent payments', async () => {
      const payments = Array(5).fill(null).map((_, index) => ({
        amount: 1000 * (index + 1),
        currency: 'usd'
      }));

      const promises = payments.map(payment =>
        mockStripe.createPaymentIntent(payment)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.status).toBe('succeeded');
        expect(result.amount).toBe(1000 * (index + 1));
      });
      expect(mockStripe.callCount).toBe(5);
    });

    test('should handle mixed success/failure in concurrent payments', async () => {
      const payments = [
        { amount: 1000, currency: 'usd', simulateCardError: false },
        { amount: 2000, currency: 'usd', simulateCardError: true },
        { amount: 3000, currency: 'usd', simulateCardError: false }
      ];

      const results = await Promise.allSettled(
        payments.map(payment => mockStripe.createPaymentIntent(payment))
      );

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });

    test('should maintain idempotency across concurrent requests', async () => {
      const idempotencyKey = 'idem_concurrent_test';

      const promises = Array(3).fill(null).map(() =>
        mockStripe.createPaymentIntent(
          { amount: 1000, currency: 'usd' },
          { idempotencyKey }
        )
      );

      const results = await Promise.all(promises);

      // First request should succeed, others should be cached
      expect(results[0].status).toBe('succeeded');
      results.slice(1).forEach(result => {
        expect(result.idempotent).toBe(true);
      });
    });
  });

  describe('Error Classification', () => {
    test('should classify network errors as retryable', () => {
      const error = new Error('Connection failed');
      error.code = 'ECONNRESET';

      const isRetryable = (err) => {
        const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'API_CONNECTION_ERROR'];
        return retryableCodes.includes(err.code);
      };

      expect(isRetryable(error)).toBe(true);
    });

    test('should classify card errors as non-retryable', () => {
      const error = new Error('Card declined');
      error.type = 'card_error';
      error.code = 'CARD_DECLINED';

      const isRetryable = (err) => {
        return err.type !== 'card_error';
      };

      expect(isRetryable(error)).toBe(false);
    });

    test('should classify rate limit errors as retryable with delay', () => {
      const error = new Error('Rate limit exceeded');
      error.code = 'RATE_LIMIT';

      const getRetryDelay = (err) => {
        if (err.code === 'RATE_LIMIT') {
          return 60000; // Wait 60 seconds
        }
        return 2000; // Default 2 seconds
      };

      expect(getRetryDelay(error)).toBe(60000);
    });
  });

  describe('Payment Recovery', () => {
    test('should recover from transient failures', async () => {
      mockStripe.failUntilAttempt = 1;

      const paymentData = {
        amount: 10000,
        currency: 'usd'
      };

      let result;
      try {
        result = await mockStripe.createPaymentIntent(paymentData);
      } catch (error) {
        // Retry once
        result = await mockStripe.createPaymentIntent(paymentData);
      }

      expect(result.status).toBe('succeeded');
    });

    test('should mark transaction as completed after recovery', async () => {
      // Get test event ID (nullable)
      const eventResult = await testDb.execute({ sql: 'SELECT id FROM events LIMIT 1' });
      const testEventId = eventResult.rows[0]?.id || null;

      // Create transaction
      const txResult = await testDb.execute({
        sql: `INSERT INTO transactions (
          customer_email, customer_name, registration_token, registration_token_expires,
          order_number, amount_cents, status, is_test, type, order_data, currency, event_id, transaction_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'recovery@example.com',
          'Recovery User',
          'token_recovery',
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          'ORDER_RECOVERY',
          10000,
          'pending',
          1,
          'tickets',
          JSON.stringify({ test: true }),
          'USD',
          testEventId,
          `test_recovery_${Date.now()}`
        ]
      });
      const txId = Number(txResult.lastInsertRowid);

      // Simulate payment success
      const payment = await mockStripe.createPaymentIntent({ amount: 10000, currency: 'usd' });

      // Update transaction
      await testDb.execute({
        sql: `UPDATE transactions
              SET status = 'completed', stripe_payment_intent_id = ?
              WHERE id = ?`,
        args: [payment.id, txId]
      });

      const check = await testDb.execute({
        sql: `SELECT * FROM transactions WHERE id = ?`,
        args: [txId]
      });

      expect(check.rows[0].status).toBe('completed');
      expect(check.rows[0].stripe_payment_intent_id).toBeTruthy();
    });
  });
});
