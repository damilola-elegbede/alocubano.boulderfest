/**
 * Payments Model
 * CRUD operations for payments, refunds, and webhook events
 * Handles payment processing workflow and webhook idempotency
 */

import { query, queryOne, queryMany, transaction } from '../client.js';
import { DatabaseError } from '../client.js';

/**
 * Payment status enum
 */
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  CANCELLED: 'cancelled',
};

/**
 * Payment provider enum
 */
export const PAYMENT_PROVIDER = {
  STRIPE: 'stripe',
  PAYPAL: 'paypal',
};

/**
 * Refund status enum
 */
export const REFUND_STATUS = {
  PENDING: 'pending',
  PROCESSED: 'processed',
  FAILED: 'failed',
};

/**
 * Payments Model Class
 */
export class PaymentsModel {

  /**
   * Create a new payment record
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} Created payment
   */
  static async create(paymentData) {
    try {
      // Validate required fields
      if (!paymentData.orderId || !paymentData.provider || !paymentData.providerPaymentId) {
        throw new DatabaseError('Missing required payment fields', 'MISSING_REQUIRED_FIELDS');
      }

      // Validate provider
      if (!Object.values(PAYMENT_PROVIDER).includes(paymentData.provider)) {
        throw new DatabaseError('Invalid payment provider', 'INVALID_PROVIDER');
      }

      const paymentQuery = `
        INSERT INTO payments (
          order_id, payment_method_id, provider, provider_payment_id, status,
          amount_cents, currency, provider_data, authentication_required,
          authentication_status, failure_code, failure_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
        RETURNING *
      `;
      
      const payment = await queryOne(paymentQuery, [
        paymentData.orderId,
        paymentData.paymentMethodId || null,
        paymentData.provider,
        paymentData.providerPaymentId,
        paymentData.status || PAYMENT_STATUS.PENDING,
        paymentData.amountCents,
        paymentData.currency || 'USD',
        JSON.stringify(paymentData.providerData || {}),
        paymentData.authenticationRequired || false,
        paymentData.authenticationStatus || null,
        paymentData.failureCode || null,
        paymentData.failureMessage || null
      ]);

      return payment;

    } catch (error) {
      console.error('Error creating payment:', error);
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create payment', 'PAYMENT_CREATE_ERROR');
    }
  }

  /**
   * Get payment by ID
   * @param {string} paymentId - Payment UUID
   * @returns {Promise<Object|null>} Payment with order details
   */
  static async getById(paymentId) {
    try {
      const paymentQuery = `
        SELECT 
          p.*,
          o.order_number,
          o.status as order_status,
          o.total_cents as order_total_cents,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        WHERE p.id = $1
      `;
      
      return await queryOne(paymentQuery, [paymentId]);

    } catch (error) {
      console.error('Error getting payment:', error);
      throw new DatabaseError('Failed to get payment', 'PAYMENT_GET_ERROR');
    }
  }

  /**
   * Get payment by provider payment ID
   * @param {string} provider - Payment provider
   * @param {string} providerPaymentId - Provider payment ID
   * @returns {Promise<Object|null>} Payment record
   */
  static async getByProviderPaymentId(provider, providerPaymentId) {
    try {
      const paymentQuery = `
        SELECT 
          p.*,
          o.order_number,
          o.status as order_status
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE p.provider = $1 AND p.provider_payment_id = $2
      `;
      
      return await queryOne(paymentQuery, [provider, providerPaymentId]);

    } catch (error) {
      console.error('Error getting payment by provider ID:', error);
      throw new DatabaseError('Failed to get payment by provider ID', 'PAYMENT_GET_BY_PROVIDER_ERROR');
    }
  }

  /**
   * Get payments by order ID
   * @param {string} orderId - Order UUID
   * @returns {Promise<Array>} Payments for order
   */
  static async getByOrderId(orderId) {
    try {
      const paymentsQuery = `
        SELECT * FROM payments 
        WHERE order_id = $1 
        ORDER BY created_at DESC
      `;
      
      return await queryMany(paymentsQuery, [orderId]);

    } catch (error) {
      console.error('Error getting payments by order:', error);
      throw new DatabaseError('Failed to get payments by order', 'PAYMENTS_GET_BY_ORDER_ERROR');
    }
  }

  /**
   * Update payment status
   * @param {string} paymentId - Payment UUID
   * @param {string} status - New status
   * @param {Object} metadata - Additional data to update
   * @returns {Promise<Object>} Updated payment
   */
  static async updateStatus(paymentId, status, metadata = {}) {
    try {
      // Validate status
      if (!Object.values(PAYMENT_STATUS).includes(status)) {
        throw new DatabaseError('Invalid payment status', 'INVALID_STATUS');
      }

      const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
      const params = [status];
      let paramIndex = 2;

      // Add optional fields to update
      if (metadata.failureCode !== undefined) {
        updateFields.push(`failure_code = $${paramIndex++}`);
        params.push(metadata.failureCode);
      }
      
      if (metadata.failureMessage !== undefined) {
        updateFields.push(`failure_message = $${paramIndex++}`);
        params.push(metadata.failureMessage);
      }
      
      if (metadata.providerData !== undefined) {
        updateFields.push(`provider_data = $${paramIndex++}`);
        params.push(JSON.stringify(metadata.providerData));
      }
      
      if (metadata.authenticationStatus !== undefined) {
        updateFields.push(`authentication_status = $${paramIndex++}`);  
        params.push(metadata.authenticationStatus);
      }

      if (status === PAYMENT_STATUS.COMPLETED) {
        updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
      }

      const updateQuery = `
        UPDATE payments 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      
      params.push(paymentId);
      
      const payment = await queryOne(updateQuery, params);
      if (!payment) {
        throw new DatabaseError('Payment not found', 'PAYMENT_NOT_FOUND');
      }

      return payment;

    } catch (error) {
      console.error('Error updating payment status:', error);
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update payment status', 'PAYMENT_UPDATE_ERROR');
    }
  }

  /**
   * Search payments with filters
   * @param {Object} filters - Search filters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Payments with pagination info
   */
  static async search(filters = {}, options = {}) {
    try {
      const { limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' } = options;
      const { 
        status, 
        provider, 
        orderId, 
        orderNumber,
        customerEmail,
        dateFrom, 
        dateTo,
        amountMin,
        amountMax 
      } = filters;

      let whereConditions = ['1=1'];
      let params = [];
      let paramIndex = 1;

      // Build where conditions
      if (status) {
        whereConditions.push(`p.status = $${paramIndex++}`);
        params.push(status);
      }
      
      if (provider) {
        whereConditions.push(`p.provider = $${paramIndex++}`);
        params.push(provider);
      }
      
      if (orderId) {
        whereConditions.push(`p.order_id = $${paramIndex++}`);
        params.push(orderId);
      }
      
      if (orderNumber) {
        whereConditions.push(`o.order_number ILIKE $${paramIndex++}`);
        params.push(`%${orderNumber}%`);
      }
      
      if (customerEmail) {
        whereConditions.push(`c.email ILIKE $${paramIndex++}`);
        params.push(`%${customerEmail}%`);
      }
      
      if (dateFrom) {
        whereConditions.push(`p.created_at >= $${paramIndex++}`);
        params.push(dateFrom);
      }
      
      if (dateTo) {
        whereConditions.push(`p.created_at <= $${paramIndex++}`);
        params.push(dateTo);
      }
      
      if (amountMin) {
        whereConditions.push(`p.amount_cents >= $${paramIndex++}`);
        params.push(amountMin);
      }
      
      if (amountMax) {
        whereConditions.push(`p.amount_cents <= $${paramIndex++}`);
        params.push(amountMax);
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        WHERE ${whereClause}
      `;
      const { total } = await queryOne(countQuery, params);

      // Get payments
      const paymentsQuery = `
        SELECT 
          p.*,
          o.order_number,
          o.status as order_status,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        WHERE ${whereClause}
        ORDER BY p.${sortBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      params.push(limit, offset);
      const payments = await queryMany(paymentsQuery, params);

      return {
        payments,
        pagination: {
          total: parseInt(total),
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };

    } catch (error) {
      console.error('Error searching payments:', error);
      throw new DatabaseError('Failed to search payments', 'PAYMENTS_SEARCH_ERROR');
    }
  }

  /**
   * Get payment statistics
   * @param {Object} filters - Date and provider filters
   * @returns {Promise<Object>} Payment statistics
   */
  static async getStatistics(filters = {}) {
    try {
      const { dateFrom, dateTo, provider } = filters;
      
      let whereConditions = ['1=1'];
      let params = [];
      let paramIndex = 1;

      if (dateFrom) {
        whereConditions.push(`created_at >= $${paramIndex++}`);
        params.push(dateFrom);
      }
      
      if (dateTo) {
        whereConditions.push(`created_at <= $${paramIndex++}`);
        params.push(dateTo);
      }
      
      if (provider) {
        whereConditions.push(`provider = $${paramIndex++}`);
        params.push(provider);
      }

      const whereClause = whereConditions.join(' AND ');

      const statsQuery = `
        SELECT 
          COUNT(*) as total_payments,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
          COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_payments,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_cents END), 0) as total_amount_cents,
          COALESCE(AVG(CASE WHEN status = 'completed' THEN amount_cents END), 0) as avg_payment_cents,
          COALESCE(MAX(amount_cents), 0) as max_payment_cents,
          COALESCE(MIN(CASE WHEN status = 'completed' THEN amount_cents END), 0) as min_payment_cents,
          provider
        FROM payments 
        WHERE ${whereClause}
        GROUP BY provider
      `;

      const stats = await queryMany(statsQuery, params);

      // Calculate totals across all providers
      const totals = stats.reduce((acc, stat) => ({
        totalPayments: acc.totalPayments + parseInt(stat.total_payments),
        completedPayments: acc.completedPayments + parseInt(stat.completed_payments),
        pendingPayments: acc.pendingPayments + parseInt(stat.pending_payments),
        failedPayments: acc.failedPayments + parseInt(stat.failed_payments),
        refundedPayments: acc.refundedPayments + parseInt(stat.refunded_payments),
        totalAmountCents: acc.totalAmountCents + parseInt(stat.total_amount_cents),
      }), {
        totalPayments: 0,
        completedPayments: 0,
        pendingPayments: 0,
        failedPayments: 0,
        refundedPayments: 0,
        totalAmountCents: 0,
      });

      return {
        byProvider: stats.map(stat => ({
          provider: stat.provider,
          totalPayments: parseInt(stat.total_payments),
          completedPayments: parseInt(stat.completed_payments),
          pendingPayments: parseInt(stat.pending_payments),
          failedPayments: parseInt(stat.failed_payments),
          refundedPayments: parseInt(stat.refunded_payments),
          totalAmountCents: parseInt(stat.total_amount_cents),
          avgPaymentCents: parseFloat(stat.avg_payment_cents),
          maxPaymentCents: parseInt(stat.max_payment_cents),
          minPaymentCents: parseInt(stat.min_payment_cents),
          successRate: stat.total_payments > 0 ? (stat.completed_payments / stat.total_payments) * 100 : 0,
        })),
        totals: {
          ...totals,
          avgPaymentCents: totals.completedPayments > 0 ? totals.totalAmountCents / totals.completedPayments : 0,
          successRate: totals.totalPayments > 0 ? (totals.completedPayments / totals.totalPayments) * 100 : 0,
        },
      };

    } catch (error) {
      console.error('Error getting payment statistics:', error);
      throw new DatabaseError('Failed to get payment statistics', 'PAYMENT_STATS_ERROR');
    }
  }

  /**
   * Create a refund record
   * @param {Object} refundData - Refund data
   * @returns {Promise<Object>} Created refund
   */
  static async createRefund(refundData) {
    return await transaction(async (client) => {
      try {
        // Create refund record
        const refundQuery = `
          INSERT INTO refunds (
            payment_id, provider, provider_refund_id, status,
            amount_cents, currency, reason, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
          RETURNING *
        `;
        
        const refund = await client.queryOne(refundQuery, [
          refundData.paymentId,
          refundData.provider,
          refundData.providerRefundId,
          refundData.status || REFUND_STATUS.PENDING,
          refundData.amountCents,
          refundData.currency || 'USD',
          refundData.reason || null,
          JSON.stringify(refundData.metadata || {})
        ]);

        // Update payment status if refund is complete
        if (refundData.status === REFUND_STATUS.PROCESSED) {
          // Check if this is a full or partial refund
          const payment = await client.queryOne(
            'SELECT amount_cents FROM payments WHERE id = $1',
            [refundData.paymentId]
          );
          
          const isFullRefund = refundData.amountCents >= payment.amount_cents;
          const newPaymentStatus = isFullRefund ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED;
          
          await client.query(
            'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPaymentStatus, refundData.paymentId]
          );
        }

        return refund;

      } catch (error) {
        console.error('Error creating refund:', error);
        throw new DatabaseError('Failed to create refund', 'REFUND_CREATE_ERROR');
      }
    });
  }

  /**
   * Update refund status
   * @param {string} refundId - Refund UUID
   * @param {string} status - New status
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Updated refund
   */
  static async updateRefundStatus(refundId, status, metadata = {}) {
    return await transaction(async (client) => {
      try {
        // Validate status
        if (!Object.values(REFUND_STATUS).includes(status)) {
          throw new DatabaseError('Invalid refund status', 'INVALID_REFUND_STATUS');
        }

        const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
        const params = [status];
        let paramIndex = 2;

        if (status === REFUND_STATUS.PROCESSED) {
          updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
        }

        if (metadata.metadata) {
          updateFields.push(`metadata = $${paramIndex++}`);
          params.push(JSON.stringify(metadata.metadata));
        }

        const updateQuery = `
          UPDATE refunds 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING *
        `;
        
        params.push(refundId);
        const refund = await client.queryOne(updateQuery, params);

        if (!refund) {
          throw new DatabaseError('Refund not found', 'REFUND_NOT_FOUND');
        }

        // Update payment status if refund is completed
        if (status === REFUND_STATUS.PROCESSED) {
          const payment = await client.queryOne(
            'SELECT amount_cents FROM payments WHERE id = $1',
            [refund.payment_id]
          );
          
          const isFullRefund = refund.amount_cents >= payment.amount_cents;
          const newPaymentStatus = isFullRefund ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED;
          
          await client.query(
            'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPaymentStatus, refund.payment_id]
          );
        }

        return refund;

      } catch (error) {
        console.error('Error updating refund status:', error);
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError('Failed to update refund status', 'REFUND_UPDATE_ERROR');
      }
    });
  }

  /**
   * Get refunds by payment ID
   * @param {string} paymentId - Payment UUID
   * @returns {Promise<Array>} Refunds for payment
   */
  static async getRefundsByPayment(paymentId) {
    try {
      const refundsQuery = `
        SELECT * FROM refunds 
        WHERE payment_id = $1 
        ORDER BY created_at DESC
      `;
      
      return await queryMany(refundsQuery, [paymentId]);

    } catch (error) {
      console.error('Error getting refunds by payment:', error);
      throw new DatabaseError('Failed to get refunds by payment', 'REFUNDS_GET_BY_PAYMENT_ERROR');
    }
  }
}

/**
 * Webhook Events Model Class
 */
export class WebhookEventsModel {

  /**
   * Record webhook event for idempotency
   * @param {Object} eventData - Webhook event data
   * @returns {Promise<Object>} Created event record
   */
  static async recordEvent(eventData) {
    try {
      const eventQuery = `
        INSERT INTO webhook_events (
          provider, provider_event_id, event_type, payload
        ) VALUES ($1, $2, $3, $4) 
        ON CONFLICT (provider, provider_event_id) 
        DO UPDATE SET processed_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      return await queryOne(eventQuery, [
        eventData.provider,
        eventData.providerEventId,
        eventData.eventType,
        JSON.stringify(eventData.payload)
      ]);

    } catch (error) {
      console.error('Error recording webhook event:', error);
      throw new DatabaseError('Failed to record webhook event', 'WEBHOOK_RECORD_ERROR');
    }
  }

  /**
   * Check if webhook event was already processed
   * @param {string} provider - Payment provider
   * @param {string} providerEventId - Provider event ID
   * @returns {Promise<Object|null>} Existing event record
   */
  static async getExistingEvent(provider, providerEventId) {
    try {
      const eventQuery = `
        SELECT * FROM webhook_events 
        WHERE provider = $1 AND provider_event_id = $2
      `;
      
      return await queryOne(eventQuery, [provider, providerEventId]);

    } catch (error) {
      console.error('Error checking existing webhook event:', error);
      throw new DatabaseError('Failed to check webhook event', 'WEBHOOK_CHECK_ERROR');
    }
  }

  /**
   * Get recent webhook events
   * @param {Object} filters - Filters
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Recent webhook events
   */
  static async getRecentEvents(filters = {}, options = {}) {
    try {
      const { limit = 100, offset = 0 } = options;
      const { provider, eventType, dateFrom } = filters;

      let whereConditions = ['1=1'];
      let params = [];
      let paramIndex = 1;

      if (provider) {
        whereConditions.push(`provider = $${paramIndex++}`);
        params.push(provider);
      }
      
      if (eventType) {
        whereConditions.push(`event_type = $${paramIndex++}`);
        params.push(eventType);
      }
      
      if (dateFrom) {
        whereConditions.push(`processed_at >= $${paramIndex++}`);
        params.push(dateFrom);
      }

      const whereClause = whereConditions.join(' AND ');

      const eventsQuery = `
        SELECT * FROM webhook_events 
        WHERE ${whereClause}
        ORDER BY processed_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      params.push(limit, offset);
      return await queryMany(eventsQuery, params);

    } catch (error) {
      console.error('Error getting recent webhook events:', error);
      throw new DatabaseError('Failed to get webhook events', 'WEBHOOK_GET_EVENTS_ERROR');
    }
  }
}

// Export convenience methods for Payments
export const createPayment = (paymentData) => PaymentsModel.create(paymentData);
export const getPayment = (paymentId) => PaymentsModel.getById(paymentId);
export const getPaymentByProviderPaymentId = (provider, providerPaymentId) => PaymentsModel.getByProviderPaymentId(provider, providerPaymentId);
export const getPaymentsByOrder = (orderId) => PaymentsModel.getByOrderId(orderId);
export const updatePaymentStatus = (paymentId, status, metadata) => PaymentsModel.updateStatus(paymentId, status, metadata);
export const searchPayments = (filters, options) => PaymentsModel.search(filters, options);
export const getPaymentStats = (filters) => PaymentsModel.getStatistics(filters);
export const createRefund = (refundData) => PaymentsModel.createRefund(refundData);
export const updateRefundStatus = (refundId, status, metadata) => PaymentsModel.updateRefundStatus(refundId, status, metadata);
export const getRefundsByPayment = (paymentId) => PaymentsModel.getRefundsByPayment(paymentId);

// Export convenience methods for Webhook Events
export const recordWebhookEvent = (eventData) => WebhookEventsModel.recordEvent(eventData);
export const getExistingWebhookEvent = (provider, providerEventId) => WebhookEventsModel.getExistingEvent(provider, providerEventId);
export const getRecentWebhookEvents = (filters, options) => WebhookEventsModel.getRecentEvents(filters, options);

// Classes are already exported individually above
export default PaymentsModel;