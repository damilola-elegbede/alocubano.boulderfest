/**
 * Email Service for A Lo Cubano Boulder Fest Payment System
 * 
 * Handles transactional emails for:
 * - Order confirmations
 * - Payment receipts
 * - Refund confirmations
 * - Payment failure notifications
 * - Customer support communications
 */

import crypto from 'crypto';

// Email service configuration
const EMAIL_CONFIG = {
  from: {
    email: process.env.SENDGRID_FROM_EMAIL || 'noreply@alocubanoboulderfest.com',
    name: 'A Lo Cubano Boulder Fest'
  },
  templates: {
    orderConfirmation: process.env.SENDGRID_ORDER_CONFIRMATION_TEMPLATE || 'd-orderconfirmation123',
    paymentFailure: process.env.SENDGRID_PAYMENT_FAILURE_TEMPLATE || 'd-paymentfailure123',
    refundConfirmation: process.env.SENDGRID_REFUND_TEMPLATE || 'd-refundconfirmation123'
  },
  retryAttempts: 3,
  retryDelay: 1000 // milliseconds
};

/**
 * Mock SendGrid client - replace with actual SendGrid SDK
 */
class MockEmailClient {
  async send(emailData) {
    console.log('Mock email sent:', {
      to: emailData.to,
      subject: emailData.subject,
      template: emailData.templateId
    });
    
    // Simulate email delivery
    return {
      messageId: crypto.randomBytes(16).toString('hex'),
      status: 'delivered',
      timestamp: new Date().toISOString()
    };
  }
}

// Initialize email client (replace with actual SendGrid client)
const emailClient = new MockEmailClient();

/**
 * Email service error class
 */
class EmailServiceError extends Error {
  constructor(message, code = 'EMAIL_ERROR', details = {}) {
    super(message);
    this.name = 'EmailServiceError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Email template data formatter
 */
class EmailTemplateFormatter {
  /**
   * Format order confirmation template data
   */
  static formatOrderConfirmation(orderData) {
    const {
      order_number,
      customer_email,
      first_name,
      last_name,
      total,
      currency,
      items,
      event_name,
      event_date,
      sessionId,
      created_at
    } = orderData;

    return {
      customer_name: `${first_name} ${last_name}`.trim() || 'Valued Customer',
      order_number,
      order_total: `$${total.toFixed(2)}`,
      currency: currency.toUpperCase(),
      order_date: new Date(created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      event_name,
      event_date: new Date(event_date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      items: items.map(item => ({
        name: this.getTicketDisplayName(item.ticket_type),
        quantity: item.quantity,
        unit_price: `$${item.unit_price.toFixed(2)}`,
        total_price: `$${item.total_price.toFixed(2)}`
      })),
      venue_info: {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Rd, Boulder, CO 80303',
        phone: '(303) 440-7664'
      },
      support_email: 'support@alocubanoboulderfest.com',
      website_url: 'https://alocubanoboulderfest.com',
      view_tickets_url: `https://alocubanoboulderfest.com/my-tickets?order=${order_number}`,
      session_id: sessionId
    };
  }

  /**
   * Format payment failure template data
   */
  static formatPaymentFailure(orderData) {
    const {
      order_number,
      first_name,
      last_name,
      total,
      failureReason,
      failureCode,
      event_name
    } = orderData;

    return {
      customer_name: `${first_name} ${last_name}`.trim() || 'Valued Customer',
      order_number,
      order_total: `$${total.toFixed(2)}`,
      event_name,
      failure_reason: this.getReadableFailureReason(failureCode, failureReason),
      retry_url: `https://alocubanoboulderfest.com/checkout/retry?order=${order_number}`,
      support_email: 'support@alocubanoboulderfest.com',
      help_center_url: 'https://alocubanoboulderfest.com/help'
    };
  }

  /**
   * Format refund confirmation template data
   */
  static formatRefundConfirmation(refundData) {
    const {
      order_number,
      first_name,
      last_name,
      refundAmount,
      currency,
      refundReason,
      event_name
    } = refundData;

    return {
      customer_name: `${first_name} ${last_name}`.trim() || 'Valued Customer',
      order_number,
      refund_amount: `$${refundAmount.toFixed(2)}`,
      currency: currency.toUpperCase(),
      event_name,
      refund_reason: this.getReadableRefundReason(refundReason),
      refund_date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      processing_note: 'Refunds typically appear in your account within 5-10 business days.',
      support_email: 'support@alocubanoboulderfest.com'
    };
  }

  /**
   * Get display name for ticket types
   */
  static getTicketDisplayName(ticketType) {
    const displayNames = {
      'full_festival': 'Full Festival Pass',
      'day_pass': 'Day Pass',
      'workshop_only': 'Workshop Only',
      'social_only': 'Social Dancing Only',
      'vip': 'VIP Experience'
    };
    
    return displayNames[ticketType] || ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Get readable failure reason
   */
  static getReadableFailureReason(code, message) {
    const readableReasons = {
      'card_declined': 'Your card was declined. Please try a different payment method.',
      'insufficient_funds': 'Insufficient funds. Please check your account balance.',
      'expired_card': 'Your card has expired. Please update your payment information.',
      'incorrect_cvc': 'The security code (CVC) is incorrect. Please check and try again.',
      'processing_error': 'A processing error occurred. Please try again.',
      'authentication_required': 'Additional authentication is required. Please complete the verification process.'
    };
    
    return readableReasons[code] || message || 'An error occurred while processing your payment.';
  }

  /**
   * Get readable refund reason
   */
  static getReadableRefundReason(reason) {
    const readableReasons = {
      'customer_request': 'Refund requested by customer',
      'event_cancelled': 'Event cancelled',
      'duplicate_charge': 'Duplicate charge correction',
      'fraudulent': 'Fraudulent charge reversal',
      'full_refund': 'Full refund processed',
      'partial_refund': 'Partial refund processed'
    };
    
    return readableReasons[reason] || 'Refund processed';
  }
}

/**
 * Email delivery service with retry logic
 */
export class EmailService {
  constructor(client = emailClient, config = EMAIL_CONFIG) {
    this.client = client;
    this.config = config;
    this.deliveryLog = new Map(); // For tracking email delivery
  }

  /**
   * Send email with retry logic
   */
  async sendWithRetry(emailData, attempt = 1) {
    try {
      const result = await this.client.send(emailData);
      
      // Log successful delivery
      this.logDelivery(emailData.to, 'delivered', result);
      
      return result;
      
    } catch (error) {
      console.error(`Email delivery attempt ${attempt} failed:`, error.message);
      
      if (attempt < this.config.retryAttempts) {
        // Calculate exponential backoff delay
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.sendWithRetry(emailData, attempt + 1);
      }
      
      // Log failed delivery after all retries
      this.logDelivery(emailData.to, 'failed', { error: error.message });
      
      throw new EmailServiceError(
        `Failed to send email after ${this.config.retryAttempts} attempts`,
        'EMAIL_DELIVERY_FAILED',
        { recipient: emailData.to, attempts: attempt }
      );
    }
  }

  /**
   * Send order confirmation email
   */
  async sendOrderConfirmation(orderData) {
    try {
      const templateData = EmailTemplateFormatter.formatOrderConfirmation(orderData);
      
      const emailData = {
        to: [{
          email: orderData.customer_email,
          name: templateData.customer_name
        }],
        from: this.config.from,
        templateId: this.config.templates.orderConfirmation,
        dynamicTemplateData: templateData,
        subject: `Order Confirmation - A Lo Cubano Boulder Fest #${orderData.order_number}`,
        categories: ['order_confirmation', 'transactional'],
        customArgs: {
          order_id: orderData.id,
          order_number: orderData.order_number,
          event_id: orderData.event_id
        },
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true },
          subscriptionTracking: { enable: false }
        }
      };

      const result = await this.sendWithRetry(emailData);
      
      console.log(`Order confirmation sent to ${orderData.customer_email} for order ${orderData.order_number}`);
      
      return {
        messageId: result.messageId,
        status: 'sent',
        recipient: orderData.customer_email,
        template: 'order_confirmation'
      };
      
    } catch (error) {
      console.error('Error sending order confirmation:', error);
      throw new EmailServiceError(
        'Failed to send order confirmation',
        'ORDER_CONFIRMATION_FAILED',
        { orderData, error: error.message }
      );
    }
  }

  /**
   * Send payment failure notification
   */
  async sendPaymentFailedNotification(orderData) {
    try {
      const templateData = EmailTemplateFormatter.formatPaymentFailure(orderData);
      
      const emailData = {
        to: [{
          email: orderData.customer_email,
          name: templateData.customer_name
        }],
        from: this.config.from,
        templateId: this.config.templates.paymentFailure,
        dynamicTemplateData: templateData,
        subject: `Payment Issue - A Lo Cubano Boulder Fest Order #${orderData.order_number}`,
        categories: ['payment_failure', 'transactional'],
        customArgs: {
          order_id: orderData.id,
          order_number: orderData.order_number,
          failure_code: orderData.failureCode
        }
      };

      const result = await this.sendWithRetry(emailData);
      
      console.log(`Payment failure notification sent to ${orderData.customer_email} for order ${orderData.order_number}`);
      
      return {
        messageId: result.messageId,
        status: 'sent',
        recipient: orderData.customer_email,
        template: 'payment_failure'
      };
      
    } catch (error) {
      console.error('Error sending payment failure notification:', error);
      throw new EmailServiceError(
        'Failed to send payment failure notification',
        'PAYMENT_FAILURE_EMAIL_FAILED',
        { orderData, error: error.message }
      );
    }
  }

  /**
   * Send refund confirmation email
   */
  async sendRefundConfirmation(refundData) {
    try {
      const templateData = EmailTemplateFormatter.formatRefundConfirmation(refundData);
      
      const emailData = {
        to: [{
          email: refundData.customer_email,
          name: templateData.customer_name
        }],
        from: this.config.from,
        templateId: this.config.templates.refundConfirmation,
        dynamicTemplateData: templateData,
        subject: `Refund Confirmation - A Lo Cubano Boulder Fest #${refundData.order_number}`,
        categories: ['refund_confirmation', 'transactional'],
        customArgs: {
          order_id: refundData.order_id,
          order_number: refundData.order_number,
          refund_amount: refundData.refundAmount
        }
      };

      const result = await this.sendWithRetry(emailData);
      
      console.log(`Refund confirmation sent to ${refundData.customer_email} for order ${refundData.order_number}`);
      
      return {
        messageId: result.messageId,
        status: 'sent',
        recipient: refundData.customer_email,
        template: 'refund_confirmation'
      };
      
    } catch (error) {
      console.error('Error sending refund confirmation:', error);
      throw new EmailServiceError(
        'Failed to send refund confirmation',
        'REFUND_CONFIRMATION_FAILED',
        { refundData, error: error.message }
      );
    }
  }

  /**
   * Send custom email (for admin notifications, etc.)
   */
  async sendCustomEmail({ to, subject, htmlContent, textContent, templateId, templateData }) {
    try {
      const emailData = {
        to: Array.isArray(to) ? to : [{ email: to }],
        from: this.config.from,
        subject,
        categories: ['custom', 'notification']
      };

      if (templateId && templateData) {
        emailData.templateId = templateId;
        emailData.dynamicTemplateData = templateData;
      } else {
        emailData.content = [
          {
            type: 'text/plain',
            value: textContent || 'Plain text version not available'
          },
          {
            type: 'text/html',
            value: htmlContent || `<p>${textContent || subject}</p>`
          }
        ];
      }

      const result = await this.sendWithRetry(emailData);
      
      return {
        messageId: result.messageId,
        status: 'sent',
        template: 'custom'
      };
      
    } catch (error) {
      console.error('Error sending custom email:', error);
      throw new EmailServiceError(
        'Failed to send custom email',
        'CUSTOM_EMAIL_FAILED',
        { to, subject, error: error.message }
      );
    }
  }

  /**
   * Log email delivery for tracking
   */
  logDelivery(recipient, status, details = {}) {
    const logEntry = {
      recipient,
      status,
      timestamp: new Date().toISOString(),
      details
    };
    
    const logKey = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    this.deliveryLog.set(logKey, logEntry);
    
    // Keep only last 1000 log entries
    if (this.deliveryLog.size > 1000) {
      const oldestKey = this.deliveryLog.keys().next().value;
      this.deliveryLog.delete(oldestKey);
    }
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const recentLogs = Array.from(this.deliveryLog.values())
      .filter(log => new Date(log.timestamp).getTime() > cutoff);

    const stats = recentLogs.reduce((acc, log) => {
      acc.total++;
      acc[log.status] = (acc[log.status] || 0) + 1;
      return acc;
    }, { total: 0 });

    return {
      ...stats,
      deliveryRate: stats.total > 0 ? ((stats.delivered || 0) / stats.total * 100).toFixed(2) : 0,
      period: `${hours} hours`
    };
  }

  /**
   * Validate email configuration
   */
  validateConfiguration() {
    const errors = [];

    if (!this.config.from.email) {
      errors.push('Missing sender email address');
    }

    if (!this.config.templates.orderConfirmation) {
      errors.push('Missing order confirmation template ID');
    }

    if (!this.config.templates.paymentFailure) {
      errors.push('Missing payment failure template ID');
    }

    if (!this.config.templates.refundConfirmation) {
      errors.push('Missing refund confirmation template ID');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const emailService = new EmailService();
export { EmailServiceError, EmailTemplateFormatter };
export default emailService;