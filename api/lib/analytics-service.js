/**
 * Analytics Service for A Lo Cubano Boulder Fest Payment System
 * 
 * Handles tracking for:
 * - Purchase conversions
 * - Payment failures
 * - Cart abandonment
 * - Revenue analytics
 * - Customer behavior
 * - Error monitoring
 */

import crypto from 'crypto';

/**
 * Analytics service error class
 */
class AnalyticsError extends Error {
  constructor(message, code = 'ANALYTICS_ERROR', details = {}) {
    super(message);
    this.name = 'AnalyticsError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Google Analytics 4 integration
 */
class GoogleAnalytics4 {
  constructor(measurementId, apiSecret) {
    this.measurementId = measurementId;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://www.google-analytics.com/mp/collect';
  }

  /**
   * Send event to GA4
   */
  async sendEvent(clientId, events) {
    try {
      const payload = {
        client_id: clientId,
        events: Array.isArray(events) ? events : [events]
      };

      const response = await fetch(`${this.baseUrl}?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`GA4 request failed: ${response.status} ${response.statusText}`);
      }

      return { success: true, timestamp: new Date().toISOString() };

    } catch (error) {
      console.error('GA4 tracking error:', error);
      throw new AnalyticsError('Failed to send GA4 event', 'GA4_SEND_ERROR', { error: error.message });
    }
  }

  /**
   * Generate or retrieve client ID
   */
  generateClientId(userIdentifier = null) {
    if (userIdentifier) {
      // Create consistent client ID based on user identifier
      return crypto.createHash('sha256')
        .update(userIdentifier + process.env.ANALYTICS_SALT || 'default-salt')
        .digest('hex')
        .substring(0, 20);
    }
    
    // Generate random client ID
    return crypto.randomBytes(10).toString('hex');
  }
}

/**
 * Custom analytics for internal tracking
 */
class InternalAnalytics {
  constructor() {
    this.events = new Map();
    this.metrics = new Map();
  }

  /**
   * Record internal event
   */
  recordEvent(eventType, data) {
    const eventId = crypto.randomBytes(8).toString('hex');
    const event = {
      id: eventId,
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    };

    this.events.set(eventId, event);
    
    // Keep only last 10000 events
    if (this.events.size > 10000) {
      const oldestKey = this.events.keys().next().value;
      this.events.delete(oldestKey);
    }

    console.log('Internal analytics event:', event);
    return eventId;
  }

  /**
   * Update metric
   */
  updateMetric(metricName, value, operation = 'set') {
    const current = this.metrics.get(metricName) || 0;
    
    let newValue;
    switch (operation) {
      case 'increment':
        newValue = current + (value || 1);
        break;
      case 'add':
        newValue = current + value;
        break;
      case 'max':
        newValue = Math.max(current, value);
        break;
      case 'min':
        newValue = Math.min(current, value);
        break;
      default:
        newValue = value;
    }

    this.metrics.set(metricName, newValue);
    console.log(`Metric updated: ${metricName} = ${newValue}`);
  }

  /**
   * Get metrics summary
   */
  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 100) {
    const events = Array.from(this.events.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
    
    return events;
  }
}

/**
 * Main analytics service
 */
export class AnalyticsService {
  constructor() {
    this.ga4 = new GoogleAnalytics4(
      process.env.GA_MEASUREMENT_ID,
      process.env.GA_API_SECRET
    );
    this.internal = new InternalAnalytics();
    
    // Configuration
    this.config = {
      enableGA4: !!process.env.GA_MEASUREMENT_ID,
      enableInternal: true,
      batchSize: 20,
      flushInterval: 30000 // 30 seconds
    };

    // Event queue for batching
    this.eventQueue = [];
    this.lastFlush = Date.now();

    // Start background flush if batching is enabled
    if (this.config.flushInterval > 0) {
      setInterval(() => this.flushEvents(), this.config.flushInterval);
    }
  }

  /**
   * Track purchase conversion
   */
  async trackConversion(orderData) {
    try {
      const {
        orderId,
        value,
        currency = 'USD',
        paymentMethod,
        items = [],
        customerEmail,
        sessionId
      } = orderData;

      const clientId = this.ga4.generateClientId(customerEmail);
      
      // GA4 purchase event
      const ga4Event = {
        name: 'purchase',
        params: {
          transaction_id: orderId,
          value: value,
          currency: currency.toUpperCase(),
          payment_type: paymentMethod,
          items: items.map((item, index) => ({
            item_id: item.id || `item_${index}`,
            item_name: item.name || item.ticket_type,
            item_category: 'festival_ticket',
            item_variant: item.ticket_type,
            price: item.unit_price,
            quantity: item.quantity,
            index: index
          })),
          // Custom parameters
          session_id: sessionId,
          customer_type: this.determineCustomerType(customerEmail),
          device_category: 'unknown', // Would be determined from user agent in real implementation
          source: 'website'
        }
      };

      // Send to GA4 if enabled
      if (this.config.enableGA4) {
        await this.ga4.sendEvent(clientId, ga4Event);
      }

      // Internal tracking
      if (this.config.enableInternal) {
        this.internal.recordEvent('purchase_conversion', {
          orderId,
          value,
          currency,
          paymentMethod,
          itemCount: items.length,
          customerEmail: this.hashEmail(customerEmail)
        });

        // Update metrics
        this.internal.updateMetric('total_revenue', value, 'add');
        this.internal.updateMetric('total_orders', 1, 'increment');
        this.internal.updateMetric('average_order_value', value); // Simplified - should calculate properly
      }

      console.log(`Conversion tracked for order ${orderId}: $${value}`);
      
      return { success: true, orderId, value };

    } catch (error) {
      console.error('Error tracking conversion:', error);
      throw new AnalyticsError('Failed to track conversion', 'CONVERSION_TRACK_ERROR', { orderData, error: error.message });
    }
  }

  /**
   * Track payment failure
   */
  async trackPaymentFailure(paymentData) {
    try {
      const {
        orderId,
        failureCode,
        failureMessage,
        amount,
        paymentMethod = 'stripe',
        customerEmail
      } = paymentData;

      const clientId = this.ga4.generateClientId(customerEmail);

      // GA4 payment failure event
      const ga4Event = {
        name: 'payment_failed',
        params: {
          transaction_id: orderId,
          value: amount,
          currency: 'USD',
          payment_method: paymentMethod,
          error_code: failureCode,
          error_message: this.sanitizeErrorMessage(failureMessage)
        }
      };

      // Send to GA4 if enabled
      if (this.config.enableGA4) {
        await this.ga4.sendEvent(clientId, ga4Event);
      }

      // Internal tracking
      if (this.config.enableInternal) {
        this.internal.recordEvent('payment_failure', {
          orderId,
          failureCode,
          amount,
          paymentMethod,
          customerEmail: this.hashEmail(customerEmail)
        });

        // Update failure metrics
        this.internal.updateMetric('failed_payments', 1, 'increment');
        this.internal.updateMetric('failed_revenue', amount, 'add');
        this.internal.updateMetric(`failure_${failureCode}`, 1, 'increment');
      }

      console.log(`Payment failure tracked for order ${orderId}: ${failureCode}`);
      
      return { success: true, orderId, failureCode };

    } catch (error) {
      console.error('Error tracking payment failure:', error);
      throw new AnalyticsError('Failed to track payment failure', 'PAYMENT_FAILURE_TRACK_ERROR', { paymentData, error: error.message });
    }
  }

  /**
   * Track cart abandonment
   */
  async trackCartAbandonment(cartData) {
    try {
      const {
        sessionId,
        items = [],
        totalValue,
        abandonmentStage,
        timeInCart,
        customerEmail
      } = cartData;

      const clientId = this.ga4.generateClientId(customerEmail || sessionId);

      // GA4 cart abandonment event
      const ga4Event = {
        name: 'abandon_cart',
        params: {
          session_id: sessionId,
          value: totalValue,
          currency: 'USD',
          abandonment_stage: abandonmentStage,
          time_in_cart: timeInCart,
          item_count: items.length,
          items: items.map((item, index) => ({
            item_id: item.id || `item_${index}`,
            item_name: item.name || item.ticket_type,
            item_category: 'festival_ticket',
            price: item.unit_price,
            quantity: item.quantity
          }))
        }
      };

      // Send to GA4 if enabled
      if (this.config.enableGA4) {
        await this.ga4.sendEvent(clientId, ga4Event);
      }

      // Internal tracking
      if (this.config.enableInternal) {
        this.internal.recordEvent('cart_abandonment', {
          sessionId,
          totalValue,
          abandonmentStage,
          timeInCart,
          itemCount: items.length,
          customerEmail: customerEmail ? this.hashEmail(customerEmail) : null
        });

        // Update abandonment metrics
        this.internal.updateMetric('cart_abandonments', 1, 'increment');
        this.internal.updateMetric('abandoned_revenue', totalValue, 'add');
        this.internal.updateMetric(`abandon_${abandonmentStage}`, 1, 'increment');
      }

      console.log(`Cart abandonment tracked for session ${sessionId} at stage ${abandonmentStage}`);
      
      return { success: true, sessionId, abandonmentStage };

    } catch (error) {
      console.error('Error tracking cart abandonment:', error);
      throw new AnalyticsError('Failed to track cart abandonment', 'CART_ABANDONMENT_TRACK_ERROR', { cartData, error: error.message });
    }
  }

  /**
   * Track checkout step
   */
  async trackCheckoutStep(checkoutData) {
    try {
      const {
        sessionId,
        step,
        stepName,
        items = [],
        totalValue,
        customerEmail
      } = checkoutData;

      const clientId = this.ga4.generateClientId(customerEmail || sessionId);

      // GA4 checkout progress event
      const ga4Event = {
        name: 'begin_checkout',
        params: {
          session_id: sessionId,
          value: totalValue,
          currency: 'USD',
          checkout_step: step,
          checkout_step_name: stepName,
          items: items.map((item, index) => ({
            item_id: item.id || `item_${index}`,
            item_name: item.name || item.ticket_type,
            item_category: 'festival_ticket',
            price: item.unit_price,
            quantity: item.quantity
          }))
        }
      };

      // Send to GA4 if enabled
      if (this.config.enableGA4) {
        await this.ga4.sendEvent(clientId, ga4Event);
      }

      // Internal tracking
      if (this.config.enableInternal) {
        this.internal.recordEvent('checkout_step', {
          sessionId,
          step,
          stepName,
          totalValue,
          itemCount: items.length
        });

        this.internal.updateMetric(`checkout_step_${step}`, 1, 'increment');
      }

      return { success: true, sessionId, step };

    } catch (error) {
      console.error('Error tracking checkout step:', error);
      throw new AnalyticsError('Failed to track checkout step', 'CHECKOUT_STEP_TRACK_ERROR', { checkoutData, error: error.message });
    }
  }

  /**
   * Track refund
   */
  async trackRefund(refundData) {
    try {
      const {
        orderId,
        refundAmount,
        currency = 'USD',
        refundReason,
        customerEmail
      } = refundData;

      const clientId = this.ga4.generateClientId(customerEmail);

      // GA4 refund event
      const ga4Event = {
        name: 'refund',
        params: {
          transaction_id: orderId,
          value: refundAmount,
          currency: currency.toUpperCase(),
          refund_reason: refundReason
        }
      };

      // Send to GA4 if enabled
      if (this.config.enableGA4) {
        await this.ga4.sendEvent(clientId, ga4Event);
      }

      // Internal tracking
      if (this.config.enableInternal) {
        this.internal.recordEvent('refund', {
          orderId,
          refundAmount,
          currency,
          refundReason,
          customerEmail: this.hashEmail(customerEmail)
        });

        this.internal.updateMetric('total_refunds', 1, 'increment');
        this.internal.updateMetric('refunded_revenue', refundAmount, 'add');
      }

      return { success: true, orderId, refundAmount };

    } catch (error) {
      console.error('Error tracking refund:', error);
      throw new AnalyticsError('Failed to track refund', 'REFUND_TRACK_ERROR', { refundData, error: error.message });
    }
  }

  /**
   * Get analytics summary
   */
  getAnalyticsSummary(timeframe = '24h') {
    if (!this.config.enableInternal) {
      return { error: 'Internal analytics disabled' };
    }

    const metrics = this.internal.getMetrics();
    const recentEvents = this.internal.getRecentEvents(50);

    // Calculate derived metrics
    const conversionRate = metrics.total_orders && metrics.checkout_step_1 ?
      ((metrics.total_orders / metrics.checkout_step_1) * 100).toFixed(2) : 0;

    const failureRate = metrics.total_orders && metrics.failed_payments ?
      ((metrics.failed_payments / (metrics.total_orders + metrics.failed_payments)) * 100).toFixed(2) : 0;

    return {
      timeframe,
      metrics: {
        ...metrics,
        conversion_rate: `${conversionRate}%`,
        failure_rate: `${failureRate}%`,
        net_revenue: (metrics.total_revenue || 0) - (metrics.refunded_revenue || 0)
      },
      recentEvents: recentEvents.map(event => ({
        type: event.type,
        timestamp: event.timestamp,
        // Remove sensitive data
        data: this.sanitizeEventData(event.data)
      )))
    };
  }

  /**
   * Utility methods
   */

  /**
   * Determine customer type (new vs returning)
   */
  determineCustomerType(email) {
    // In a real implementation, this would check against customer database
    return 'unknown';
  }

  /**
   * Hash email for privacy
   */
  hashEmail(email) {
    if (!email) return null;
    return crypto.createHash('sha256')
      .update(email.toLowerCase() + (process.env.ANALYTICS_SALT || 'default-salt'))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Sanitize error message for analytics
   */
  sanitizeErrorMessage(message) {
    if (!message) return 'unknown_error';
    
    // Remove potential sensitive information
    return message
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]') // Credit card numbers
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Email addresses
      .substring(0, 100); // Limit length
  }

  /**
   * Sanitize event data for privacy
   */
  sanitizeEventData(data) {
    const sanitized = { ...data };
    
    // Remove or hash sensitive fields
    if (sanitized.customerEmail) {
      sanitized.customerEmail = this.hashEmail(sanitized.customerEmail);
    }
    
    if (sanitized.paymentMethod) {
      sanitized.paymentMethod = sanitized.paymentMethod; // Keep as is, not sensitive
    }
    
    return sanitized;
  }

  /**
   * Flush batched events (if implementing batching)
   */
  async flushEvents() {
    if (this.eventQueue.length === 0) return;

    console.log(`Flushing ${this.eventQueue.length} analytics events`);
    
    // In a real implementation, this would batch send events
    this.eventQueue = [];
    this.lastFlush = Date.now();
  }

  /**
   * Validate analytics configuration
   */
  validateConfiguration() {
    const errors = [];

    if (this.config.enableGA4 && !process.env.GA_MEASUREMENT_ID) {
      errors.push('GA4 enabled but GA_MEASUREMENT_ID not configured');
    }

    if (this.config.enableGA4 && !process.env.GA_API_SECRET) {
      errors.push('GA4 enabled but GA_API_SECRET not configured');
    }

    return {
      isValid: errors.length === 0,
      errors,
      config: this.config
    };
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export { AnalyticsError };
export default analyticsService;