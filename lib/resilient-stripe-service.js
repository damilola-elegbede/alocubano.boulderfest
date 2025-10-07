/**
 * Resilient Stripe Payment Service
 * Wraps Stripe API calls with circuit breaker and exponential backoff
 *
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Circuit breaker to prevent cascading failures
 * - Idempotency key management for safe retries
 * - Rate limit handling with proper backoff
 * - Comprehensive metrics and monitoring
 */

import Stripe from 'stripe';
import { ServiceCircuitBreaker } from './service-circuit-breaker.js';
import { withExponentialBackoff } from './exponential-backoff.js';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';

/**
 * Resilient Stripe Service with circuit breaker and retry logic
 */
class ResilientStripeService {
  constructor() {
    // Initialize Stripe client
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16', // Use latest stable API version
      maxNetworkRetries: 0, // Disable Stripe's built-in retries (we handle this)
      timeout: 15000 // 15 second timeout
    });

    // Initialize circuit breaker for Stripe API
    this.breaker = new ServiceCircuitBreaker({
      name: 'stripe-payments',
      failureThreshold: 5,       // Open circuit after 5 failures
      successThreshold: 2,        // Close circuit after 2 successes
      timeout: 120000,            // Try again after 2 minutes (Stripe may need longer)
      monitoringPeriod: 180000    // Track failures over 3 minutes
    });

    // Track metrics
    this.metrics = {
      checkoutSessionsCreated: 0,
      paymentIntentsCreated: 0,
      webhooksProcessed: 0,
      refundsProcessed: 0,
      failures: 0,
      retryAttempts: 0,
      circuitBreaks: 0
    };

    // Idempotency key cache (for retry safety)
    this.idempotencyKeys = new Map();
    this.maxIdempotencyKeyAge = 24 * 60 * 60 * 1000; // 24 hours

    // Listen to circuit breaker events
    this.breaker.on('stateChange', (event) => {
      logger.log(`[ResilientStripe] Circuit breaker state changed: ${event.from} → ${event.to}`);
      if (event.to === 'OPEN') {
        this.metrics.circuitBreaks++;
      }
    });
  }

  /**
   * Generate or retrieve idempotency key for safe retries
   * @private
   */
  _getIdempotencyKey(operationId) {
    const now = Date.now();

    // Clean old keys
    for (const [key, data] of this.idempotencyKeys.entries()) {
      if (now - data.timestamp > this.maxIdempotencyKeyAge) {
        this.idempotencyKeys.delete(key);
      }
    }

    // Get or create key
    if (!this.idempotencyKeys.has(operationId)) {
      this.idempotencyKeys.set(operationId, {
        key: randomUUID(),
        timestamp: now
      });
    }

    return this.idempotencyKeys.get(operationId).key;
  }

  /**
   * Custom retry predicate for Stripe-specific errors
   * @private
   */
  _shouldRetryStripeError(error) {
    // Check Stripe error type
    if (error.type) {
      // Always retry rate limit errors
      if (error.type === 'StripeRateLimitError') {
        return true;
      }

      // Retry connection errors
      if (error.type === 'StripeConnectionError') {
        return true;
      }

      // Retry API errors (temporary failures)
      if (error.type === 'StripeAPIError') {
        return true;
      }

      // Don't retry authentication errors
      if (error.type === 'StripeAuthenticationError') {
        return false;
      }

      // Don't retry invalid request errors (bad params)
      if (error.type === 'StripeInvalidRequestError') {
        return false;
      }
    }

    // Check status code
    const statusCode = error.statusCode || error.status;
    if (statusCode) {
      // Retry server errors
      if (statusCode >= 500) {
        return true;
      }

      // Retry rate limits
      if (statusCode === 429) {
        return true;
      }

      // Don't retry client errors (except rate limits)
      if (statusCode >= 400 && statusCode < 500) {
        return false;
      }
    }

    // Retry network errors
    const message = error.message?.toLowerCase() || '';
    if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused')) {
      return true;
    }

    return false;
  }

  /**
   * Create checkout session with resilience
   */
  async createCheckoutSession(sessionData, operationId = null) {
    // Generate operation ID for idempotency if not provided
    const opId = operationId || `checkout_${Date.now()}_${randomUUID()}`;
    const idempotencyKey = this._getIdempotencyKey(opId);

    try {
      const result = await this.breaker.execute(
        () => withExponentialBackoff(
          () => this.stripe.checkout.sessions.create(sessionData, {
            idempotencyKey
          }),
          {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            factor: 2,
            shouldRetry: this._shouldRetryStripeError.bind(this),
            operationName: 'Stripe createCheckoutSession'
          }
        )
      );

      this.metrics.checkoutSessionsCreated++;
      return result;

    } catch (error) {
      this.metrics.failures++;
      logger.error('[ResilientStripe] Failed to create checkout session', {
        error: error.message,
        type: error.type,
        statusCode: error.statusCode
      });
      throw error;
    }
  }

  /**
   * Create payment intent with resilience
   */
  async createPaymentIntent(intentData, operationId = null) {
    const opId = operationId || `payment_intent_${Date.now()}_${randomUUID()}`;
    const idempotencyKey = this._getIdempotencyKey(opId);

    try {
      const result = await this.breaker.execute(
        () => withExponentialBackoff(
          () => this.stripe.paymentIntents.create(intentData, {
            idempotencyKey
          }),
          {
            maxRetries: 3,
            initialDelay: 1000,
            shouldRetry: this._shouldRetryStripeError.bind(this),
            operationName: 'Stripe createPaymentIntent'
          }
        )
      );

      this.metrics.paymentIntentsCreated++;
      return result;

    } catch (error) {
      this.metrics.failures++;
      logger.error('[ResilientStripe] Failed to create payment intent', {
        error: error.message,
        type: error.type
      });
      throw error;
    }
  }

  /**
   * Retrieve checkout session with resilience
   */
  async retrieveCheckoutSession(sessionId) {
    try {
      return await this.breaker.execute(
        () => withExponentialBackoff(
          () => this.stripe.checkout.sessions.retrieve(sessionId),
          {
            maxRetries: 3,
            initialDelay: 500,
            shouldRetry: this._shouldRetryStripeError.bind(this),
            operationName: 'Stripe retrieveCheckoutSession'
          }
        )
      );

    } catch (error) {
      this.metrics.failures++;
      logger.error('[ResilientStripe] Failed to retrieve checkout session', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Create refund with resilience
   */
  async createRefund(refundData, operationId = null) {
    const opId = operationId || `refund_${Date.now()}_${randomUUID()}`;
    const idempotencyKey = this._getIdempotencyKey(opId);

    try {
      const result = await this.breaker.execute(
        () => withExponentialBackoff(
          () => this.stripe.refunds.create(refundData, {
            idempotencyKey
          }),
          {
            maxRetries: 3,
            initialDelay: 1000,
            shouldRetry: this._shouldRetryStripeError.bind(this),
            operationName: 'Stripe createRefund'
          }
        )
      );

      this.metrics.refundsProcessed++;
      return result;

    } catch (error) {
      this.metrics.failures++;
      logger.error('[ResilientStripe] Failed to create refund', {
        error: error.message,
        refundData
      });
      throw error;
    }
  }

  /**
   * Construct webhook event with resilience
   * Note: This doesn't use circuit breaker as it's a local operation
   */
  constructWebhookEvent(payload, signature, secret) {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      logger.error('[ResilientStripe] Failed to construct webhook event', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get raw Stripe client for advanced operations
   */
  getRawClient() {
    return this.stripe;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      service: 'stripe',
      ...this.metrics,
      idempotencyKeysInCache: this.idempotencyKeys.size,
      circuitBreaker: this.breaker.getMetrics()
    };
  }

  /**
   * Get health status
   */
  async healthCheck() {
    try {
      // Test Stripe API with a simple balance retrieval
      await this.breaker.execute(
        () => withExponentialBackoff(
          () => this.stripe.balance.retrieve(),
          {
            maxRetries: 2,
            initialDelay: 500,
            shouldRetry: this._shouldRetryStripeError.bind(this),
            operationName: 'Stripe healthCheck'
          }
        )
      );

      const circuitHealth = this.breaker.getHealth();

      return {
        status: circuitHealth.status,
        circuitBreaker: circuitHealth,
        metrics: this.metrics,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        type: error.type,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reset circuit breaker (for testing/admin)
   */
  resetCircuitBreaker() {
    this.breaker.reset();
    logger.log('[ResilientStripe] Circuit breaker reset');
  }

  /**
   * Clear idempotency key cache (for testing)
   */
  clearIdempotencyKeys() {
    this.idempotencyKeys.clear();
    logger.log('[ResilientStripe] Idempotency keys cleared');
  }
}

// Export singleton instance
let resilientStripeServiceInstance = null;

/**
 * Get resilient Stripe service singleton
 */
export function getResilientStripeService() {
  if (!resilientStripeServiceInstance) {
    resilientStripeServiceInstance = new ResilientStripeService();
  }
  return resilientStripeServiceInstance;
}

/**
 * Reset singleton for testing
 */
export function resetResilientStripeService() {
  resilientStripeServiceInstance = null;
}

export { ResilientStripeService };
