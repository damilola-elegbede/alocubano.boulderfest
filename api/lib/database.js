/**
 * Database Integration Layer for Payment System
 * 
 * Provides secure database operations for:
 * - Order management
 * - Payment tracking
 * - Webhook event idempotency
 * - Customer data handling
 * - Audit logging
 */

import crypto from 'crypto';

// This would be replaced with your actual database client
// Examples: PostgreSQL with pg, MySQL with mysql2, etc.
// For this implementation, we'll use a mock database interface

class DatabaseError extends Error {
  constructor(message, code = 'DB_ERROR', details = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Mock database implementation - replace with actual database client
 */
class MockDatabase {
  constructor() {
    this.tables = {
      webhook_events: new Map(),
      orders: new Map(),
      payments: new Map(),
      customers: new Map(),
      order_items: new Map(),
      refunds: new Map(),
      audit_log: new Map(),
      idempotent_responses: new Map()
    };
  }

  async query(sql, params = []) {
    // Mock implementation - replace with actual database query
    console.log('Mock database query:', sql, params);
    return { rows: [], rowCount: 0 };
  }

  async transaction(callback) {
    // Mock transaction - replace with actual transaction handling
    try {
      return await callback(this);
    } catch (error) {
      throw error;
    }
  }
}

// Initialize database connection
const db = new MockDatabase();

/**
 * Database service class
 */
export class DatabaseService {
  constructor(dbClient = db) {
    this.db = dbClient;
  }

  /**
   * Check if webhook event was already processed (idempotency)
   */
  async isEventProcessed(eventId, provider = 'stripe') {
    try {
      const query = `
        SELECT id FROM webhook_events 
        WHERE provider_event_id = $1 AND provider = $2
        LIMIT 1
      `;
      
      const result = await this.db.query(query, [eventId, provider]);
      return result.rowCount > 0;
      
    } catch (error) {
      console.error('Error checking event processing status:', error);
      throw new DatabaseError('Failed to check event status', 'EVENT_CHECK_ERROR', { eventId, provider });
    }
  }

  /**
   * Record webhook event for idempotency and audit
   */
  async recordEvent(eventId, eventType, payload, provider = 'stripe') {
    try {
      const query = `
        INSERT INTO webhook_events (
          provider, provider_event_id, event_type, payload, processed_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id
      `;
      
      const result = await this.db.query(query, [
        provider,
        eventId,
        eventType,
        JSON.stringify(payload)
      ]);
      
      return result.rows[0]?.id;
      
    } catch (error) {
      console.error('Error recording webhook event:', error);
      throw new DatabaseError('Failed to record webhook event', 'EVENT_RECORD_ERROR', { eventId, eventType });
    }
  }

  /**
   * Update order status and related information
   */
  async updateOrderStatus(paymentIntentId, updates) {
    try {
      return await this.db.transaction(async (tx) => {
        // First, find the order by payment intent ID
        const findOrderQuery = `
          SELECT o.id, o.order_number, o.customer_id, o.status
          FROM orders o
          JOIN payments p ON o.id = p.order_id
          WHERE p.provider_payment_id = $1
          FOR UPDATE
        `;
        
        const orderResult = await tx.query(findOrderQuery, [paymentIntentId]);
        
        if (orderResult.rowCount === 0) {
          throw new DatabaseError('Order not found for payment intent', 'ORDER_NOT_FOUND', { paymentIntentId });
        }
        
        const order = orderResult.rows[0];
        
        // Update order status
        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;
        
        Object.entries(updates).forEach(([key, value]) => {
          if (key === 'updated_at' || value === undefined) return;
          
          updateFields.push(`${key} = $${paramCount++}`);
          updateValues.push(value);
        });
        
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        updateValues.push(order.id);
        
        const updateOrderQuery = `
          UPDATE orders 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramCount}
          RETURNING *
        `;
        
        const updatedOrder = await tx.query(updateOrderQuery, updateValues);
        
        // Log the status change
        await this.logAuditEvent('order', order.id, 'status_update', 'system', null, {
          from_status: order.status,
          to_status: updates.status,
          payment_intent_id: paymentIntentId,
          updates
        });
        
        return updatedOrder.rows[0];
      });
      
    } catch (error) {
      console.error('Error updating order status:', error);
      throw new DatabaseError('Failed to update order status', 'ORDER_UPDATE_ERROR', { paymentIntentId, updates });
    }
  }

  /**
   * Get order details by payment intent ID
   */
  async getOrderByPaymentIntent(paymentIntentId) {
    try {
      const query = `
        SELECT 
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
                'total_price_cents', oi.total_price_cents,
                'attendee_first_name', oi.attendee_first_name,
                'attendee_last_name', oi.attendee_last_name,
                'attendee_email', oi.attendee_email
              )
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'
          ) as items
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN payments p ON o.id = p.order_id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE p.provider_payment_id = $1
        GROUP BY o.id, c.id
      `;
      
      const result = await this.db.query(query, [paymentIntentId]);
      
      if (result.rowCount === 0) {
        return null;
      }
      
      const order = result.rows[0];
      
      // Convert cents to dollars for convenience
      return {
        ...order,
        subtotal: order.subtotal_cents / 100,
        tax: order.tax_cents / 100,
        fee: order.fee_cents / 100,
        discount: order.discount_cents / 100,
        total: order.total_cents / 100,
        items: order.items.map(item => ({
          ...item,
          unit_price: item.unit_price_cents / 100,
          total_price: item.total_price_cents / 100
        }))
      };
      
    } catch (error) {
      console.error('Error getting order by payment intent:', error);
      throw new DatabaseError('Failed to get order', 'ORDER_GET_ERROR', { paymentIntentId });
    }
  }

  /**
   * Record refund information
   */
  async recordRefund(chargeId, refundData) {
    try {
      return await this.db.transaction(async (tx) => {
        // First, find the payment by charge ID
        const findPaymentQuery = `
          SELECT id, order_id FROM payments 
          WHERE provider_data->>'charge_id' = $1
        `;
        
        const paymentResult = await tx.query(findPaymentQuery, [chargeId]);
        
        if (paymentResult.rowCount === 0) {
          throw new DatabaseError('Payment not found for charge', 'PAYMENT_NOT_FOUND', { chargeId });
        }
        
        const payment = paymentResult.rows[0];
        
        // Insert refund record
        const insertRefundQuery = `
          INSERT INTO refunds (
            payment_id, provider, provider_refund_id, status,
            amount_cents, currency, reason, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
          RETURNING *
        `;
        
        const refund = await tx.query(insertRefundQuery, [
          payment.id,
          'stripe',
          refundData.refund_id || crypto.randomBytes(16).toString('hex'),
          'processed',
          refundData.amount_refunded,
          refundData.currency,
          refundData.reason,
          JSON.stringify(refundData)
        ]);
        
        // Update order status if fully refunded
        const totalRefundedQuery = `
          SELECT SUM(amount_cents) as total_refunded
          FROM refunds
          WHERE payment_id = $1 AND status = 'processed'
        `;
        
        const refundSumResult = await tx.query(totalRefundedQuery, [payment.id]);
        const totalRefunded = refundSumResult.rows[0]?.total_refunded || 0;
        
        // Get original payment amount to check if fully refunded
        const paymentAmountQuery = `
          SELECT amount_cents FROM payments WHERE id = $1
        `;
        
        const paymentAmountResult = await tx.query(paymentAmountQuery, [payment.id]);
        const paymentAmount = paymentAmountResult.rows[0]?.amount_cents || 0;
        
        // Update order status based on refund amount
        let newStatus = 'partially_refunded';
        if (totalRefunded >= paymentAmount) {
          newStatus = 'refunded';
        }
        
        await tx.query(
          'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newStatus, payment.order_id]
        );
        
        // Log the refund
        await this.logAuditEvent('refund', refund.rows[0].id, 'refund_processed', 'system', null, {
          charge_id: chargeId,
          amount_refunded: refundData.amount_refunded,
          currency: refundData.currency,
          reason: refundData.reason
        });
        
        return refund.rows[0];
      });
      
    } catch (error) {
      console.error('Error recording refund:', error);
      throw new DatabaseError('Failed to record refund', 'REFUND_RECORD_ERROR', { chargeId, refundData });
    }
  }

  /**
   * Create customer record if not exists
   */
  async upsertCustomer(customerData) {
    try {
      const query = `
        INSERT INTO customers (
          email, first_name, last_name, phone, stripe_customer_id,
          consent_marketing, consent_date, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (email) DO UPDATE SET
          first_name = COALESCE(EXCLUDED.first_name, customers.first_name),
          last_name = COALESCE(EXCLUDED.last_name, customers.last_name),
          phone = COALESCE(EXCLUDED.phone, customers.phone),
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, customers.stripe_customer_id),
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const result = await this.db.query(query, [
        customerData.email,
        customerData.first_name,
        customerData.last_name,
        customerData.phone,
        customerData.stripe_customer_id,
        customerData.consent_marketing || false
      ]);
      
      return result.rows[0];
      
    } catch (error) {
      console.error('Error upserting customer:', error);
      throw new DatabaseError('Failed to create/update customer', 'CUSTOMER_UPSERT_ERROR', { customerData });
    }
  }

  /**
   * Log audit events
   */
  async logAuditEvent(entityType, entityId, action, actorType, actorId, changes = {}, ipAddress = null, userAgent = null) {
    try {
      const query = `
        INSERT INTO payment_audit_log (
          entity_type, entity_id, action, actor_type, actor_id,
          changes, ip_address, user_agent, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        RETURNING id
      `;
      
      const result = await this.db.query(query, [
        entityType,
        entityId,
        action,
        actorType,
        actorId,
        JSON.stringify(changes),
        ipAddress,
        userAgent
      ]);
      
      return result.rows[0]?.id;
      
    } catch (error) {
      console.error('Error logging audit event:', error);
      // Don't throw error for audit logging failures
      return null;
    }
  }

  /**
   * Store idempotent response for API endpoints
   */
  async storeIdempotentResponse(key, response) {
    try {
      const query = `
        INSERT INTO idempotent_responses (key, response, created_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          response = EXCLUDED.response,
          created_at = CURRENT_TIMESTAMP
      `;
      
      await this.db.query(query, [key, JSON.stringify(response)]);
      
    } catch (error) {
      console.error('Error storing idempotent response:', error);
      throw new DatabaseError('Failed to store idempotent response', 'IDEMPOTENT_STORE_ERROR', { key });
    }
  }

  /**
   * Get idempotent response for API endpoints
   */
  async getIdempotentResponse(key) {
    try {
      const query = `
        SELECT response FROM idempotent_responses 
        WHERE key = $1 AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
      `;
      
      const result = await this.db.query(query, [key]);
      
      if (result.rowCount === 0) {
        return null;
      }
      
      return JSON.parse(result.rows[0].response);
      
    } catch (error) {
      console.error('Error getting idempotent response:', error);
      return null; // Don't throw error, let request proceed
    }
  }

  /**
   * Clean up old records for maintenance
   */
  async cleanupOldRecords() {
    try {
      await this.db.transaction(async (tx) => {
        // Clean up old webhook events (keep 30 days)
        await tx.query(`
          DELETE FROM webhook_events 
          WHERE processed_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
        `);
        
        // Clean up old idempotent responses (keep 24 hours)
        await tx.query(`
          DELETE FROM idempotent_responses 
          WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'
        `);
        
        // Clean up old audit logs (keep 1 year)
        await tx.query(`
          DELETE FROM payment_audit_log 
          WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 year'
        `);
      });
      
      console.log('Database cleanup completed successfully');
      
    } catch (error) {
      console.error('Error during database cleanup:', error);
      throw new DatabaseError('Database cleanup failed', 'CLEANUP_ERROR');
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus() {
    try {
      const result = await this.db.query('SELECT 1 as health_check');
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connection: result.rowCount === 1 ? 'active' : 'inactive'
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
export { DatabaseError };
export default databaseService;