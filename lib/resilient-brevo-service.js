/**
 * Resilient Brevo Email Service
 * Wraps Brevo service with circuit breaker and exponential backoff for resilience
 *
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Circuit breaker to prevent cascading failures
 * - Fallback to email retry queue when circuit is open
 * - Comprehensive metrics and monitoring
 * - Rate limit handling with backoff
 */

import { getBrevoService } from './brevo-service.js';
import { ServiceCircuitBreaker } from './service-circuit-breaker.js';
import { withExponentialBackoff } from './exponential-backoff.js';
import { logger } from './logger.js';
import { getDatabaseClient } from './database.js';

/**
 * Resilient Brevo Service with circuit breaker and retry logic
 */
class ResilientBrevoService {
  constructor() {
    // Initialize circuit breaker for Brevo API
    this.breaker = new ServiceCircuitBreaker({
      name: 'brevo-email',
      failureThreshold: 5,      // Open circuit after 5 failures
      successThreshold: 2,       // Close circuit after 2 successes
      timeout: 60000,            // Try again after 60 seconds
      monitoringPeriod: 120000   // Track failures over 2 minutes
    });

    // Get the underlying Brevo service
    this.brevoService = null;
    this.initialized = false;
    this.initializationPromise = null;

    // Track metrics
    this.metrics = {
      emailsSent: 0,
      emailsFailed: 0,
      emailsQueued: 0,
      retryAttempts: 0,
      circuitBreaks: 0
    };

    // Listen to circuit breaker events
    this.breaker.on('stateChange', (event) => {
      logger.log(`[ResilientBrevo] Circuit breaker state changed: ${event.from} → ${event.to}`);
      if (event.to === 'OPEN') {
        this.metrics.circuitBreaks++;
      }
    });
  }

  /**
   * Ensure service is initialized using Promise-based singleton pattern
   * @private
   */
  async _ensureInitialized() {
    // Fast path: already initialized
    if (this.initialized) {
      return;
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
    } catch (error) {
      // Clear promise on error to allow retry
      this.initializationPromise = null;
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Perform actual initialization
   * @private
   */
  async _performInitialization() {
    try {
      this.brevoService = getBrevoService();
      await this.brevoService.ensureInitialized();
      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Send email with resilience patterns
   *
   * @param {Object} emailData - Email data
   * @returns {Promise<Object>} Send result
   */
  async sendEmail(emailData) {
    await this._ensureInitialized();

    // Custom retry predicate for Brevo-specific errors
    const shouldRetryBrevoError = (error) => {
      const message = error.message?.toLowerCase() || '';
      const statusCode = error.statusCode || error.status || error.response?.status;

      // Always retry rate limits
      if (statusCode === 429 || message.includes('rate limit')) {
        return true;
      }

      // Retry temporary Brevo API failures
      if (statusCode >= 500 || message.includes('temporary')) {
        return true;
      }

      // Retry network errors
      if (message.includes('network') || message.includes('timeout')) {
        return true;
      }

      // Don't retry auth failures or bad requests
      if (statusCode === 401 || statusCode === 403 || statusCode === 400) {
        return false;
      }

      return false;
    };

    try {
      // Execute with circuit breaker and exponential backoff
      const result = await this.breaker.execute(
        () => withExponentialBackoff(
          () => this._sendEmailInternal(emailData),
          {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            factor: 2,
            shouldRetry: shouldRetryBrevoError,
            operationName: 'Brevo sendEmail'
          }
        ),
        () => this._queueForRetry(emailData) // Fallback: queue to database
      );

      if (result && result.queued) {
        // Already counted in emailsQueued by _queueForRetry
        return result;
      } else {
        this.metrics.emailsSent++;
        return result;
      }

    } catch (error) {
      this.metrics.emailsFailed++;
      logger.error('[ResilientBrevo] Failed to send email', {
        error: error.message,
        to: emailData.to,
        metrics: this.metrics
      });
      throw error;
    }
  }

  /**
   * Send email internally using Brevo service
   * @private
   */
  async _sendEmailInternal(emailData) {
    return this.brevoService.sendTransactionalEmail(emailData);
  }

  /**
   * Queue email for retry (fallback when circuit is open)
   * @private
   */
  async _queueForRetry(emailData) {
    try {
      const client = await getDatabaseClient();

      // Insert into email_retry_queue table
      await client.execute({
        sql: `
          INSERT INTO email_retry_queue (email_data, retry_count, created_at, next_retry_at)
          VALUES (?, 0, datetime('now'), datetime('now', '+5 minutes'))
        `,
        args: [JSON.stringify(emailData)]
      });

      this.metrics.emailsQueued++;

      logger.warn('[ResilientBrevo] Email queued for retry', {
        to: emailData.to,
        queuedCount: this.metrics.emailsQueued
      });

      return {
        queued: true,
        message: 'Email queued for retry due to service unavailability'
      };

    } catch (queueError) {
      logger.error('[ResilientBrevo] Failed to queue email for retry', {
        error: queueError.message,
        originalEmail: emailData
      });
      throw new Error(`Failed to send email and failed to queue: ${queueError.message}`);
    }
  }

  /**
   * Subscribe to newsletter with resilience
   */
  async subscribeToNewsletter(subscriberData) {
    await this._ensureInitialized();

    try {
      const result = await this.breaker.execute(
        () => withExponentialBackoff(
          () => this.brevoService.subscribeToNewsletter(subscriberData),
          {
            maxRetries: 3,
            initialDelay: 1000,
            operationName: 'Brevo subscribeToNewsletter'
          }
        )
      );

      return result;

    } catch (error) {
      logger.error('[ResilientBrevo] Failed to subscribe to newsletter', {
        error: error.message,
        email: subscriberData.email
      });
      throw error;
    }
  }

  /**
   * Add ticket holder to mailing list with resilience
   */
  async addTicketHolder(ticketHolderData) {
    await this._ensureInitialized();

    try {
      const result = await this.breaker.execute(
        () => withExponentialBackoff(
          () => this.brevoService.addTicketHolder(ticketHolderData),
          {
            maxRetries: 3,
            initialDelay: 1000,
            operationName: 'Brevo addTicketHolder'
          }
        )
      );

      return result;

    } catch (error) {
      logger.error('[ResilientBrevo] Failed to add ticket holder', {
        error: error.message,
        email: ticketHolderData.email
      });
      throw error;
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      service: 'brevo',
      ...this.metrics,
      circuitBreaker: this.breaker.getMetrics()
    };
  }

  /**
   * Get health status
   */
  async healthCheck() {
    await this._ensureInitialized();

    try {
      const brevoHealth = await this.brevoService.healthCheck();
      const circuitHealth = this.breaker.getHealth();

      return {
        status: brevoHealth.status === 'healthy' && circuitHealth.status === 'healthy'
          ? 'healthy'
          : 'degraded',
        brevo: brevoHealth,
        circuitBreaker: circuitHealth,
        metrics: this.metrics,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reset circuit breaker (for testing/admin)
   */
  resetCircuitBreaker() {
    this.breaker.reset();
    logger.log('[ResilientBrevo] Circuit breaker reset');
  }
}

// Export singleton instance
let resilientBrevoServiceInstance = null;

/**
 * Get resilient Brevo service singleton
 */
export function getResilientBrevoService() {
  if (!resilientBrevoServiceInstance) {
    resilientBrevoServiceInstance = new ResilientBrevoService();
  }
  return resilientBrevoServiceInstance;
}

/**
 * Reset singleton for testing
 */
export function resetResilientBrevoService() {
  resilientBrevoServiceInstance = null;
}

export { ResilientBrevoService };
