/**
 * Production-Ready Stripe Webhook Handler
 * 
 * This is an example of how to integrate the webhook handler with actual services.
 * Replace the mock services in the main webhook handler with these implementations.
 */

import Stripe from 'stripe';
import { Pool } from 'pg';
import sgMail from '@sendgrid/mail';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Production Database Service
 */
class ProductionDatabaseService {
  async isEventProcessed(eventId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id FROM webhook_events WHERE provider_event_id = $1 AND provider = $2',
        [eventId, 'stripe']
      );
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  async recordEvent(eventId, eventType, payload) {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO webhook_events (provider, provider_event_id, event_type, payload, processed_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (provider, provider_event_id) DO NOTHING`,
        ['stripe', eventId, eventType, JSON.stringify(payload)]
      );
    } finally {
      client.release();
    }
  }

  async updateOrderStatus(paymentIntentId, updates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find order by payment intent
      const orderResult = await client.query(
        `SELECT o.id, o.order_number, o.customer_id, o.status
         FROM orders o
         JOIN payments p ON o.id = p.order_id
         WHERE p.provider_payment_id = $1`,
        [paymentIntentId]
      );

      if (orderResult.rowCount === 0) {
        throw new Error(`Order not found for payment intent: ${paymentIntentId}`);
      }

      const order = orderResult.rows[0];

      // Update order
      const updateFields = Object.keys(updates)
        .filter(key => key !== 'updated_at')
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');

      const updateValues = Object.values(updates).filter((_, index) => 
        Object.keys(updates)[index] !== 'updated_at'
      );

      await client.query(
        `UPDATE orders 
         SET ${updateFields}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [order.id, ...updateValues]
      );

      // Log audit event
      await client.query(
        `INSERT INTO payment_audit_log (entity_type, entity_id, action, actor_type, actor_id, changes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        ['order', order.id, 'status_update', 'system', 'stripe_webhook', JSON.stringify(updates)]
      );

      await client.query('COMMIT');
      return { ...order, ...updates };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderByPaymentIntent(paymentIntentId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 
           o.*,
           c.email as customer_email,
           c.first_name,
           c.last_name,
           c.phone,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', oi.id,
                 'ticket_type', oi.ticket_type,
                 'quantity', oi.quantity,
                 'unit_price_cents', oi.unit_price_cents,
                 'total_price_cents', oi.total_price_cents
               )
             ) FILTER (WHERE oi.id IS NOT NULL),
             '[]'
           ) as items
         FROM orders o
         JOIN customers c ON o.customer_id = c.id
         JOIN payments p ON o.id = p.order_id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE p.provider_payment_id = $1
         GROUP BY o.id, c.id`,
        [paymentIntentId]
      );

      if (result.rowCount === 0) {
        return null;
      }

      const order = result.rows[0];
      return {
        ...order,
        total: order.total_cents / 100,
        items: order.items.map(item => ({
          ...item,
          unit_price: item.unit_price_cents / 100,
          total_price: item.total_price_cents / 100
        }))
      };
    } finally {
      client.release();
    }
  }

  async recordRefund(chargeId, refundData) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find payment by charge ID
      const paymentResult = await client.query(
        `SELECT id, order_id FROM payments 
         WHERE provider_data->>'charge_id' = $1`,
        [chargeId]
      );

      if (paymentResult.rowCount === 0) {
        throw new Error(`Payment not found for charge: ${chargeId}`);
      }

      const payment = paymentResult.rows[0];

      // Insert refund record
      const refundResult = await client.query(
        `INSERT INTO refunds (payment_id, provider, provider_refund_id, status, amount_cents, currency, reason, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          payment.id,
          'stripe',
          refundData.refund_id || `ref_${Date.now()}`,
          'processed',
          Math.round(refundData.amount_refunded * 100),
          refundData.currency,
          refundData.reason,
          JSON.stringify(refundData)
        ]
      );

      await client.query('COMMIT');
      return refundResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async logAuditEvent(entityType, entityId, action, actorType, actorId, changes, ipAddress, userAgent) {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO payment_audit_log (entity_type, entity_id, action, actor_type, actor_id, changes, ip_address, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        [entityType, entityId, action, actorType, actorId, JSON.stringify(changes), ipAddress, userAgent]
      );
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw error for audit logging failures
    } finally {
      client.release();
    }
  }
}

/**
 * Production Email Service
 */
class ProductionEmailService {
  async sendOrderConfirmation(orderData) {
    const templateData = {
      customer_name: `${orderData.first_name} ${orderData.last_name}`.trim(),
      order_number: orderData.order_number,
      order_total: `$${orderData.total.toFixed(2)}`,
      event_name: orderData.event_name,
      event_date: new Date(orderData.event_date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      items: orderData.items.map(item => ({
        name: this.getTicketDisplayName(item.ticket_type),
        quantity: item.quantity,
        unit_price: `$${item.unit_price.toFixed(2)}`,
        total_price: `$${item.total_price.toFixed(2)}`
      })),
      view_tickets_url: `https://alocubanoboulderfest.com/my-tickets?order=${orderData.order_number}`
    };

    const msg = {
      to: orderData.customer_email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: 'A Lo Cubano Boulder Fest'
      },
      templateId: process.env.SENDGRID_ORDER_CONFIRMATION_TEMPLATE,
      dynamicTemplateData: templateData,
      categories: ['order_confirmation', 'transactional'],
      customArgs: {
        order_id: orderData.id,
        order_number: orderData.order_number
      }
    };

    try {
      const response = await sgMail.send(msg);
      console.log(`Order confirmation sent to ${orderData.customer_email}`);
      return { messageId: response[0].headers['x-message-id'], status: 'sent' };
    } catch (error) {
      console.error('Failed to send order confirmation:', error);
      throw error;
    }
  }

  async sendPaymentFailedNotification(orderData) {
    const templateData = {
      customer_name: `${orderData.first_name} ${orderData.last_name}`.trim(),
      order_number: orderData.order_number,
      order_total: `$${orderData.total.toFixed(2)}`,
      event_name: orderData.event_name,
      failure_reason: this.getReadableFailureReason(orderData.failureCode, orderData.failureReason),
      retry_url: `https://alocubanoboulderfest.com/checkout/retry?order=${orderData.order_number}`
    };

    const msg = {
      to: orderData.customer_email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: 'A Lo Cubano Boulder Fest'
      },
      templateId: process.env.SENDGRID_PAYMENT_FAILURE_TEMPLATE,
      dynamicTemplateData: templateData,
      categories: ['payment_failure', 'transactional']
    };

    try {
      const response = await sgMail.send(msg);
      console.log(`Payment failure notification sent to ${orderData.customer_email}`);
      return { messageId: response[0].headers['x-message-id'], status: 'sent' };
    } catch (error) {
      console.error('Failed to send payment failure notification:', error);
      throw error;
    }
  }

  async sendRefundConfirmation(refundData) {
    const templateData = {
      customer_name: `${refundData.first_name} ${refundData.last_name}`.trim(),
      order_number: refundData.order_number,
      refund_amount: `$${refundData.refundAmount.toFixed(2)}`,
      event_name: refundData.event_name,
      refund_date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };

    const msg = {
      to: refundData.customer_email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: 'A Lo Cubano Boulder Fest'
      },
      templateId: process.env.SENDGRID_REFUND_TEMPLATE,
      dynamicTemplateData: templateData,
      categories: ['refund_confirmation', 'transactional']
    };

    try {
      const response = await sgMail.send(msg);
      console.log(`Refund confirmation sent to ${refundData.customer_email}`);
      return { messageId: response[0].headers['x-message-id'], status: 'sent' };
    } catch (error) {
      console.error('Failed to send refund confirmation:', error);
      throw error;
    }
  }

  getTicketDisplayName(ticketType) {
    const displayNames = {
      'full_festival': 'Full Festival Pass',
      'day_pass': 'Day Pass',
      'workshop_only': 'Workshop Only',
      'social_only': 'Social Dancing Only',
      'vip': 'VIP Experience'
    };
    
    return displayNames[ticketType] || ticketType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getReadableFailureReason(code, message) {
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
}

/**
 * Production Analytics Service
 */
class ProductionAnalyticsService {
  constructor() {
    this.ga4MeasurementId = process.env.GA_MEASUREMENT_ID;
    this.ga4ApiSecret = process.env.GA_API_SECRET;
  }

  async trackConversion(orderData) {
    try {
      // Send to Google Analytics 4
      if (this.ga4MeasurementId && this.ga4ApiSecret) {
        await this.sendGA4Event(orderData.customerEmail, {
          name: 'purchase',
          params: {
            transaction_id: orderData.orderId,
            value: orderData.value,
            currency: orderData.currency.toUpperCase(),
            items: orderData.items?.map((item, index) => ({
              item_id: item.id,
              item_name: item.name,
              item_category: 'festival_ticket',
              price: item.unit_price,
              quantity: item.quantity,
              index: index
            })) || []
          }
        });
      }

      console.log(`Conversion tracked: Order ${orderData.orderId} - $${orderData.value}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to track conversion:', error);
      throw error;
    }
  }

  async trackPaymentFailure(paymentData) {
    try {
      if (this.ga4MeasurementId && this.ga4ApiSecret) {
        await this.sendGA4Event(paymentData.customerEmail, {
          name: 'payment_failed',
          params: {
            transaction_id: paymentData.orderId,
            value: paymentData.amount,
            currency: 'USD',
            error_code: paymentData.failureCode,
            error_message: paymentData.failureMessage?.substring(0, 100)
          }
        });
      }

      console.log(`Payment failure tracked: ${paymentData.failureCode} - Order ${paymentData.orderId}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to track payment failure:', error);
      throw error;
    }
  }

  async trackRefund(refundData) {
    try {
      if (this.ga4MeasurementId && this.ga4ApiSecret) {
        await this.sendGA4Event(refundData.customerEmail, {
          name: 'refund',
          params: {
            transaction_id: refundData.orderId,
            value: refundData.refundAmount,
            currency: refundData.currency.toUpperCase()
          }
        });
      }

      console.log(`Refund tracked: Order ${refundData.orderId} - $${refundData.refundAmount}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to track refund:', error);
      throw error;
    }
  }

  async sendGA4Event(userIdentifier, event) {
    const clientId = this.generateClientId(userIdentifier);
    
    const payload = {
      client_id: clientId,
      events: [event]
    };

    const response = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${this.ga4MeasurementId}&api_secret=${this.ga4ApiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      throw new Error(`GA4 request failed: ${response.status} ${response.statusText}`);
    }
  }

  generateClientId(userIdentifier) {
    const crypto = require('crypto');
    if (userIdentifier) {
      return crypto.createHash('sha256')
        .update(userIdentifier + (process.env.ANALYTICS_SALT || 'default-salt'))
        .digest('hex')
        .substring(0, 20);
    }
    
    return crypto.randomBytes(10).toString('hex');
  }
}

/**
 * Production Inventory Manager
 */
class ProductionInventoryManager {
  async confirmReservation(reservationId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get reservation details
      const reservation = await client.query(
        'SELECT * FROM ticket_reservations WHERE id = $1 AND status = $2',
        [reservationId, 'active']
      );

      if (reservation.rowCount === 0) {
        throw new Error(`Active reservation not found: ${reservationId}`);
      }

      const { ticket_type, quantity } = reservation.rows[0];

      // Update reservation status
      await client.query(
        'UPDATE ticket_reservations SET status = $1, confirmed_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['confirmed', reservationId]
      );

      // Update inventory (if using database inventory tracking)
      await client.query(
        'UPDATE ticket_inventory SET sold = sold + $1 WHERE ticket_type = $2',
        [quantity, ticket_type]
      );

      await client.query('COMMIT');
      console.log(`Reservation confirmed: ${reservationId}`);
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseReservation(reservationId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update reservation status
      await client.query(
        'UPDATE ticket_reservations SET status = $1, released_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['released', reservationId]
      );

      // Return tickets to available inventory
      const reservation = await client.query(
        'SELECT ticket_type, quantity FROM ticket_reservations WHERE id = $1',
        [reservationId]
      );

      if (reservation.rowCount > 0) {
        const { ticket_type, quantity } = reservation.rows[0];
        await client.query(
          'UPDATE ticket_inventory SET reserved = reserved - $1 WHERE ticket_type = $2',
          [quantity, ticket_type]
        );
      }

      await client.query('COMMIT');
      console.log(`Reservation released: ${reservationId}`);
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Export production service instances
export const productionDatabaseService = new ProductionDatabaseService();
export const productionEmailService = new ProductionEmailService();
export const productionAnalyticsService = new ProductionAnalyticsService();
export const productionInventoryManager = new ProductionInventoryManager();

// To use these in the main webhook handler, replace the mock services:
// const databaseService = productionDatabaseService;
// const emailService = productionEmailService;
// const analyticsService = productionAnalyticsService;
// const inventoryManager = productionInventoryManager;