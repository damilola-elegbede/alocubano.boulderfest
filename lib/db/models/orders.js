/**
 * Orders Model
 * CRUD operations and business logic for orders
 * Optimized for Vercel serverless environment
 */

import { query, queryOne, queryMany, transaction } from '../client.js';
import { DatabaseError } from '../client.js';

/**
 * Order status enum
 */
export const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing', 
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  CANCELLED: 'cancelled',
};

/**
 * Orders Model Class
 */
export class OrdersModel {
  
  /**
   * Create a new order with customer and order items
   * @param {Object} orderData - Order data
   * @param {Object} customerData - Customer data  
   * @param {Array} items - Order items
   * @returns {Promise<Object>} Created order with items
   */
  static async create(orderData, customerData, items) {
    return await transaction(async (client) => {
      try {
        // First, create or get customer
        const customer = await this.upsertCustomer(client, customerData);
        
        // Generate order number
        const orderNumber = await this.generateOrderNumber();
        
        // Calculate totals
        const totals = this.calculateTotals(items, orderData.discountCents || 0);
        
        // Create order
        const orderQuery = `
          INSERT INTO orders (
            order_number, customer_id, status, subtotal_cents, tax_cents, 
            fee_cents, discount_cents, total_cents, currency, event_id, 
            event_name, event_date, ip_address, user_agent, referrer,
            utm_source, utm_medium, utm_campaign, expires_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          ) RETURNING *
        `;
        
        const order = await client.queryOne(orderQuery, [
          orderNumber,
          customer.id,
          orderData.status || ORDER_STATUS.PENDING,
          totals.subtotalCents,
          totals.taxCents,
          totals.feeCents,
          orderData.discountCents || 0,
          totals.totalCents,
          orderData.currency || 'USD',
          orderData.eventId || 'alocubano-2026',
          orderData.eventName || 'A Lo Cubano Boulder Fest 2026',
          orderData.eventDate || '2026-05-15',
          orderData.ipAddress,
          orderData.userAgent,
          orderData.referrer,
          orderData.utmSource,
          orderData.utmMedium,
          orderData.utmCampaign,
          orderData.expiresAt || new Date(Date.now() + 30 * 60 * 1000) // 30 minutes default
        ]);

        // Create order items
        const orderItems = [];
        for (const item of items) {
          const itemQuery = `
            INSERT INTO order_items (
              order_id, ticket_type, quantity, unit_price_cents, 
              total_price_cents, attendee_first_name, attendee_last_name, attendee_email
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
          `;
          
          const orderItem = await client.queryOne(itemQuery, [
            order.id,
            item.ticketType,
            item.quantity,
            item.unitPriceCents,
            item.totalPriceCents,
            item.attendeeFirstName,
            item.attendeeLastName,
            item.attendeeEmail
          ]);
          
          orderItems.push(orderItem);
        }

        // Log audit entry
        await this.logAuditEntry(client, 'order', order.id, 'created', 'customer', customer.id, {
          orderNumber: order.order_number,
          totalCents: order.total_cents,
          itemCount: items.length,
        }, orderData.ipAddress, orderData.userAgent);

        return {
          ...order,
          customer,
          items: orderItems,
        };

      } catch (error) {
        console.error('Error creating order:', error);
        throw new DatabaseError('Failed to create order', 'ORDER_CREATE_ERROR', null, null);
      }
    });
  }

  /**
   * Get order by ID with customer and items
   * @param {string} orderId - Order UUID
   * @returns {Promise<Object|null>} Order with customer and items
   */
  static async getById(orderId) {
    try {
      const orderQuery = `
        SELECT 
          o.*,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.phone as customer_phone
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE o.id = $1 AND o.deleted_at IS NULL
      `;
      
      const order = await queryOne(orderQuery, [orderId]);
      if (!order) return null;

      // Get order items
      const itemsQuery = `
        SELECT * FROM order_items 
        WHERE order_id = $1 
        ORDER BY created_at ASC
      `;
      const items = await queryMany(itemsQuery, [orderId]);

      // Get payments
      const paymentsQuery = `
        SELECT * FROM payments 
        WHERE order_id = $1 
        ORDER BY created_at DESC
      `;
      const payments = await queryMany(paymentsQuery, [orderId]);

      return {
        ...order,
        customer: {
          email: order.customer_email,
          firstName: order.customer_first_name,
          lastName: order.customer_last_name,
          phone: order.customer_phone,
        },
        items,
        payments,
      };

    } catch (error) {
      console.error('Error getting order:', error);
      throw new DatabaseError('Failed to get order', 'ORDER_GET_ERROR');
    }
  }

  /**
   * Get order by order number
   * @param {string} orderNumber - Order number
   * @returns {Promise<Object|null>} Order with customer and items
   */
  static async getByOrderNumber(orderNumber) {
    try {
      const orderQuery = `
        SELECT 
          o.*,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.phone as customer_phone
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE o.order_number = $1 AND o.deleted_at IS NULL
      `;
      
      const order = await queryOne(orderQuery, [orderNumber]);
      if (!order) return null;

      // Get order items
      const items = await queryMany(`
        SELECT * FROM order_items 
        WHERE order_id = $1 
        ORDER BY created_at ASC
      `, [order.id]);

      return { ...order, items };

    } catch (error) {
      console.error('Error getting order by number:', error);
      throw new DatabaseError('Failed to get order by number', 'ORDER_GET_BY_NUMBER_ERROR');
    }
  }

  /**
   * Update order status
   * @param {string} orderId - Order UUID
   * @param {string} status - New status
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Updated order
   */
  static async updateStatus(orderId, status, metadata = {}) {
    try {
      // Validate status
      if (!Object.values(ORDER_STATUS).includes(status)) {
        throw new DatabaseError('Invalid order status', 'INVALID_STATUS');
      }

      const updateQuery = `
        UPDATE orders 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING *
      `;
      
      const order = await queryOne(updateQuery, [status, orderId]);
      if (!order) {
        throw new DatabaseError('Order not found', 'ORDER_NOT_FOUND');
      }

      // Log audit entry
      await this.logAuditEntry(null, 'order', orderId, 'status_updated', 'system', null, {
        oldStatus: order.status,
        newStatus: status,
        metadata,
      });

      return order;

    } catch (error) {
      console.error('Error updating order status:', error);
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update order status', 'ORDER_UPDATE_ERROR');
    }
  }

  /**
   * Get orders by customer email
   * @param {string} email - Customer email
   * @param {Object} options - Query options (limit, offset, status)
   * @returns {Promise<Array>} Orders list
   */
  static async getByCustomerEmail(email, options = {}) {
    try {
      const { limit = 50, offset = 0, status } = options;
      
      let whereClause = 'c.email = $1 AND o.deleted_at IS NULL';
      let params = [email];
      
      if (status) {
        whereClause += ' AND o.status = $2';
        params.push(status);
      }

      const ordersQuery = `
        SELECT 
          o.*,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          COUNT(oi.id) as item_count
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE ${whereClause}
        GROUP BY o.id, c.email, c.first_name, c.last_name
        ORDER BY o.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      
      params.push(limit, offset);
      const orders = await queryMany(ordersQuery, params);

      return orders;

    } catch (error) {
      console.error('Error getting orders by customer:', error);
      throw new DatabaseError('Failed to get customer orders', 'CUSTOMER_ORDERS_ERROR');
    }
  }

  /**
   * Search orders with filters
   * @param {Object} filters - Search filters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Orders with pagination info
   */
  static async search(filters = {}, options = {}) {
    try {
      const { limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' } = options;
      const { status, eventId, dateFrom, dateTo, customerEmail, orderNumber } = filters;

      let whereConditions = ['o.deleted_at IS NULL'];
      let params = [];
      let paramIndex = 1;

      // Build where conditions
      if (status) {
        whereConditions.push(`o.status = $${paramIndex++}`);
        params.push(status);
      }
      
      if (eventId) {
        whereConditions.push(`o.event_id = $${paramIndex++}`);
        params.push(eventId);
      }
      
      if (dateFrom) {
        whereConditions.push(`o.created_at >= $${paramIndex++}`);
        params.push(dateFrom);
      }
      
      if (dateTo) {
        whereConditions.push(`o.created_at <= $${paramIndex++}`);
        params.push(dateTo);
      }
      
      if (customerEmail) {
        whereConditions.push(`c.email ILIKE $${paramIndex++}`);
        params.push(`%${customerEmail}%`);
      }
      
      if (orderNumber) {
        whereConditions.push(`o.order_number ILIKE $${paramIndex++}`);
        params.push(`%${orderNumber}%`);
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE ${whereClause}
      `;
      const { total } = await queryOne(countQuery, params);

      // Get orders
      const ordersQuery = `
        SELECT 
          o.*,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          COUNT(oi.id) as item_count,
          SUM(oi.total_price_cents) as items_total_cents
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE ${whereClause}
        GROUP BY o.id, c.email, c.first_name, c.last_name
        ORDER BY o.${sortBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      params.push(limit, offset);
      const orders = await queryMany(ordersQuery, params);

      return {
        orders,
        pagination: {
          total: parseInt(total),
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };

    } catch (error) {
      console.error('Error searching orders:', error);
      throw new DatabaseError('Failed to search orders', 'ORDER_SEARCH_ERROR');
    }
  }

  /**
   * Get order statistics
   * @param {Object} filters - Date and event filters
   * @returns {Promise<Object>} Order statistics
   */
  static async getStatistics(filters = {}) {
    try {
      const { dateFrom, dateTo, eventId } = filters;
      
      let whereConditions = ['deleted_at IS NULL'];
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
      
      if (eventId) {
        whereConditions.push(`event_id = $${paramIndex++}`);
        params.push(eventId);
      }

      const whereClause = whereConditions.join(' AND ');

      const statsQuery = `
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_orders,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN total_cents END), 0) as total_revenue_cents,
          COALESCE(AVG(CASE WHEN status = 'completed' THEN total_cents END), 0) as avg_order_value_cents,
          COALESCE(MAX(total_cents), 0) as max_order_value_cents,
          COALESCE(MIN(CASE WHEN status = 'completed' THEN total_cents END), 0) as min_order_value_cents
        FROM orders 
        WHERE ${whereClause}
      `;

      const stats = await queryOne(statsQuery, params);

      return {
        totalOrders: parseInt(stats.total_orders),
        completedOrders: parseInt(stats.completed_orders),
        pendingOrders: parseInt(stats.pending_orders),
        failedOrders: parseInt(stats.failed_orders),
        totalRevenueCents: parseInt(stats.total_revenue_cents),
        averageOrderValueCents: parseFloat(stats.avg_order_value_cents),
        maxOrderValueCents: parseInt(stats.max_order_value_cents),
        minOrderValueCents: parseInt(stats.min_order_value_cents),
        conversionRate: stats.total_orders > 0 ? (stats.completed_orders / stats.total_orders) * 100 : 0,
      };

    } catch (error) {
      console.error('Error getting order statistics:', error);
      throw new DatabaseError('Failed to get order statistics', 'ORDER_STATS_ERROR');
    }
  }

  /**
   * Soft delete order
   * @param {string} orderId - Order UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(orderId) {
    try {
      const deleteQuery = `
        UPDATE orders 
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `;
      
      const result = await queryOne(deleteQuery, [orderId]);
      return !!result;

    } catch (error) {
      console.error('Error deleting order:', error);
      throw new DatabaseError('Failed to delete order', 'ORDER_DELETE_ERROR');
    }
  }

  // Helper methods

  /**
   * Upsert customer (create or update)
   * @private
   */
  static async upsertCustomer(client, customerData) {
    const customerQuery = `
      INSERT INTO customers (email, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) 
      DO UPDATE SET 
        first_name = COALESCE(EXCLUDED.first_name, customers.first_name),
        last_name = COALESCE(EXCLUDED.last_name, customers.last_name),
        phone = COALESCE(EXCLUDED.phone, customers.phone),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    return await client.queryOne(customerQuery, [
      customerData.email,
      customerData.firstName,
      customerData.lastName,
      customerData.phone,
    ]);
  }

  /**
   * Generate unique order number
   * @private
   */
  static async generateOrderNumber() {
    const result = await queryOne('SELECT generate_order_number() as order_number');
    return result.order_number;
  }

  /**
   * Calculate order totals
   * @private
   */
  static calculateTotals(items, discountCents = 0) {
    const subtotalCents = items.reduce((sum, item) => sum + item.totalPriceCents, 0);
    const taxCents = Math.round(subtotalCents * 0.0876); // Boulder County tax rate
    const feeCents = Math.round(subtotalCents * 0.029); // Processing fee
    const totalCents = subtotalCents + taxCents + feeCents - discountCents;

    return {
      subtotalCents,
      taxCents,
      feeCents,
      totalCents: Math.max(0, totalCents), // Ensure non-negative
    };
  }

  /**
   * Log audit entry
   * @private
   */
  static async logAuditEntry(client, entityType, entityId, action, actorType, actorId, changes, ipAddress, userAgent) {
    const auditQuery = `
      INSERT INTO payment_audit_log (
        entity_type, entity_id, action, actor_type, actor_id, 
        changes, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    const queryFunc = client ? client.query : query;
    await queryFunc(auditQuery, [
      entityType, entityId, action, actorType, actorId,
      JSON.stringify(changes), ipAddress, userAgent
    ]);
  }
}

// Export convenience methods
export const createOrder = (orderData, customerData, items) => OrdersModel.create(orderData, customerData, items);
export const getOrder = (orderId) => OrdersModel.getById(orderId);
export const getOrderByNumber = (orderNumber) => OrdersModel.getByOrderNumber(orderNumber);
export const updateOrderStatus = (orderId, status, metadata) => OrdersModel.updateStatus(orderId, status, metadata);
export const getCustomerOrders = (email, options) => OrdersModel.getByCustomerEmail(email, options);
export const searchOrders = (filters, options) => OrdersModel.search(filters, options);
export const getOrderStats = (filters) => OrdersModel.getStatistics(filters);
export const deleteOrder = (orderId) => OrdersModel.delete(orderId);

export default OrdersModel;