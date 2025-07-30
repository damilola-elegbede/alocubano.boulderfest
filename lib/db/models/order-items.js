/**
 * Order Items Model
 * CRUD operations for order items
 * Handles ticket details and attendee information
 */

import { query, queryOne, queryMany, transaction } from '../client.js';
import { DatabaseError } from '../client.js';

/**
 * Ticket types enum
 */
export const TICKET_TYPES = {
  FULL_FESTIVAL: 'full_festival',
  DAY_PASS: 'day_pass', 
  WORKSHOP_ONLY: 'workshop_only',
  SOCIAL_ONLY: 'social_only',
  VIP: 'vip',
};

/**
 * Order Items Model Class
 */
export class OrderItemsModel {

  /**
   * Create order items for an order
   * @param {string} orderId - Order UUID
   * @param {Array} items - Array of order items
   * @returns {Promise<Array>} Created order items
   */
  static async createItems(orderId, items) {
    return await transaction(async (client) => {
      try {
        const createdItems = [];

        for (const item of items) {
          // Validate ticket type
          if (!Object.values(TICKET_TYPES).includes(item.ticketType)) {
            throw new DatabaseError('Invalid ticket type', 'INVALID_TICKET_TYPE');
          }

          const itemQuery = `
            INSERT INTO order_items (
              order_id, ticket_type, quantity, unit_price_cents, 
              total_price_cents, attendee_first_name, attendee_last_name, attendee_email
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
          `;
          
          const createdItem = await client.queryOne(itemQuery, [
            orderId,
            item.ticketType,
            item.quantity,
            item.unitPriceCents,
            item.totalPriceCents,
            item.attendeeFirstName || null,
            item.attendeeLastName || null,
            item.attendeeEmail || null
          ]);
          
          createdItems.push(createdItem);
        }

        return createdItems;

      } catch (error) {
        console.error('Error creating order items:', error);
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError('Failed to create order items', 'ORDER_ITEMS_CREATE_ERROR');
      }
    });
  }

  /**
   * Get order items by order ID
   * @param {string} orderId - Order UUID
   * @returns {Promise<Array>} Order items
   */
  static async getByOrderId(orderId) {
    try {
      const itemsQuery = `
        SELECT 
          oi.*,
          o.order_number,
          o.status as order_status,
          o.event_name,
          o.event_date
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
      `;
      
      return await queryMany(itemsQuery, [orderId]);

    } catch (error) {
      console.error('Error getting order items:', error);
      throw new DatabaseError('Failed to get order items', 'ORDER_ITEMS_GET_ERROR');
    }
  }

  /**
   * Get order item by ID
   * @param {string} itemId - Order item UUID
   * @returns {Promise<Object|null>} Order item
   */
  static async getById(itemId) {
    try {
      const itemQuery = `
        SELECT 
          oi.*,
          o.order_number,
          o.status as order_status,
          o.event_name,
          o.event_date,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        WHERE oi.id = $1
      `;
      
      return await queryOne(itemQuery, [itemId]);

    } catch (error) {
      console.error('Error getting order item:', error);
      throw new DatabaseError('Failed to get order item', 'ORDER_ITEM_GET_ERROR');
    }
  }

  /**
   * Update order item attendee information
   * @param {string} itemId - Order item UUID
   * @param {Object} attendeeData - Attendee information
   * @returns {Promise<Object>} Updated order item
   */
  static async updateAttendeeInfo(itemId, attendeeData) {
    try {
      const updateQuery = `
        UPDATE order_items 
        SET 
          attendee_first_name = $1,
          attendee_last_name = $2,
          attendee_email = $3
        WHERE id = $4
        RETURNING *
      `;
      
      const updatedItem = await queryOne(updateQuery, [
        attendeeData.firstName,
        attendeeData.lastName, 
        attendeeData.email,
        itemId
      ]);

      if (!updatedItem) {
        throw new DatabaseError('Order item not found', 'ORDER_ITEM_NOT_FOUND');
      }

      return updatedItem;

    } catch (error) {
      console.error('Error updating attendee info:', error);
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update attendee info', 'ATTENDEE_UPDATE_ERROR');
    }
  }

  /**
   * Get ticket statistics by type
   * @param {Object} filters - Date and event filters
   * @returns {Promise<Array>} Ticket statistics
   */
  static async getTicketStats(filters = {}) {
    try {
      const { dateFrom, dateTo, eventId } = filters;
      
      let whereConditions = ['o.deleted_at IS NULL'];
      let params = [];
      let paramIndex = 1;

      if (dateFrom) {
        whereConditions.push(`o.created_at >= $${paramIndex++}`);
        params.push(dateFrom);
      }
      
      if (dateTo) {
        whereConditions.push(`o.created_at <= $${paramIndex++}`);
        params.push(dateTo);
      }
      
      if (eventId) {
        whereConditions.push(`o.event_id = $${paramIndex++}`);
        params.push(eventId);
      }

      const whereClause = whereConditions.join(' AND ');

      const statsQuery = `
        SELECT 
          oi.ticket_type,
          COUNT(*) as total_items,
          SUM(oi.quantity) as total_quantity,
          SUM(CASE WHEN o.status = 'completed' THEN oi.quantity ELSE 0 END) as sold_quantity,
          SUM(CASE WHEN o.status = 'completed' THEN oi.total_price_cents ELSE 0 END) as revenue_cents,
          AVG(oi.unit_price_cents) as avg_price_cents,
          MIN(oi.unit_price_cents) as min_price_cents,
          MAX(oi.unit_price_cents) as max_price_cents
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE ${whereClause}
        GROUP BY oi.ticket_type
        ORDER BY sold_quantity DESC
      `;

      const stats = await queryMany(statsQuery, params);

      return stats.map(stat => ({
        ticketType: stat.ticket_type,
        totalItems: parseInt(stat.total_items),
        totalQuantity: parseInt(stat.total_quantity),
        soldQuantity: parseInt(stat.sold_quantity),
        revenueCents: parseInt(stat.revenue_cents),
        avgPriceCents: parseFloat(stat.avg_price_cents),
        minPriceCents: parseInt(stat.min_price_cents),
        maxPriceCents: parseInt(stat.max_price_cents),
      }));

    } catch (error) {
      console.error('Error getting ticket stats:', error);
      throw new DatabaseError('Failed to get ticket statistics', 'TICKET_STATS_ERROR');
    }
  }

  /**
   * Get attendee list for an event
   * @param {string} eventId - Event ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Attendee list
   */
  static async getAttendeeList(eventId, options = {}) {
    try {
      const { ticketType, limit = 1000, offset = 0 } = options;
      
      let whereConditions = [
        'o.event_id = $1',
        'o.status = $2',
        'o.deleted_at IS NULL'
      ];
      let params = [eventId, 'completed'];
      let paramIndex = 3;

      if (ticketType) {
        whereConditions.push(`oi.ticket_type = $${paramIndex++}`);
        params.push(ticketType);
      }

      const whereClause = whereConditions.join(' AND ');

      const attendeeQuery = `
        SELECT 
          oi.id as item_id,
          oi.ticket_type,
          oi.quantity,
          oi.attendee_first_name,
          oi.attendee_last_name,
          oi.attendee_email,
          o.order_number,
          o.event_name,
          o.event_date,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.phone as customer_phone
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        WHERE ${whereClause}
        ORDER BY oi.ticket_type, oi.attendee_last_name, oi.attendee_first_name
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      params.push(limit, offset);
      return await queryMany(attendeeQuery, params);

    } catch (error) {
      console.error('Error getting attendee list:', error);
      throw new DatabaseError('Failed to get attendee list', 'ATTENDEE_LIST_ERROR');
    }
  }

  /**
   * Search order items with filters
   * @param {Object} filters - Search filters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Items with pagination info
   */
  static async search(filters = {}, options = {}) {
    try {
      const { limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'DESC' } = options;
      const { 
        ticketType, 
        orderId, 
        orderNumber, 
        customerEmail, 
        attendeeEmail,
        eventId,
        dateFrom,
        dateTo 
      } = filters;

      let whereConditions = ['o.deleted_at IS NULL'];
      let params = [];
      let paramIndex = 1;

      // Build where conditions
      if (ticketType) {
        whereConditions.push(`oi.ticket_type = $${paramIndex++}`);
        params.push(ticketType);
      }
      
      if (orderId) {
        whereConditions.push(`oi.order_id = $${paramIndex++}`);
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
      
      if (attendeeEmail) {
        whereConditions.push(`oi.attendee_email ILIKE $${paramIndex++}`);
        params.push(`%${attendeeEmail}%`);
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

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        WHERE ${whereClause}
      `;
      const { total } = await queryOne(countQuery, params);

      // Get items
      const itemsQuery = `
        SELECT 
          oi.*,
          o.order_number,
          o.status as order_status,
          o.event_name,
          o.event_date,
          c.email as customer_email,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        WHERE ${whereClause}
        ORDER BY oi.${sortBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      params.push(limit, offset);
      const items = await queryMany(itemsQuery, params);

      return {
        items,
        pagination: {
          total: parseInt(total),
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };

    } catch (error) {
      console.error('Error searching order items:', error);
      throw new DatabaseError('Failed to search order items', 'ORDER_ITEMS_SEARCH_ERROR');
    }
  }

  /**
   * Bulk update attendee information
   * @param {Array} updates - Array of {itemId, attendeeData}
   * @returns {Promise<Array>} Updated items
   */
  static async bulkUpdateAttendeeInfo(updates) {
    return await transaction(async (client) => {
      try {
        const updatedItems = [];

        for (const update of updates) {
          const { itemId, attendeeData } = update;
          
          const updateQuery = `
            UPDATE order_items 
            SET 
              attendee_first_name = $1,
              attendee_last_name = $2,
              attendee_email = $3
            WHERE id = $4
            RETURNING *
          `;
          
          const updatedItem = await client.queryOne(updateQuery, [
            attendeeData.firstName,
            attendeeData.lastName,
            attendeeData.email,
            itemId
          ]);

          if (updatedItem) {
            updatedItems.push(updatedItem);
          }
        }

        return updatedItems;

      } catch (error) {
        console.error('Error bulk updating attendees:', error);
        throw new DatabaseError('Failed to bulk update attendee info', 'BULK_ATTENDEE_UPDATE_ERROR');
      }
    });
  }

  /**
   * Get revenue breakdown by ticket type
   * @param {Object} filters - Date and event filters
   * @returns {Promise<Object>} Revenue breakdown
   */
  static async getRevenueBreakdown(filters = {}) {
    try {
      const { dateFrom, dateTo, eventId } = filters;
      
      let whereConditions = ['o.deleted_at IS NULL', 'o.status = $1'];
      let params = ['completed'];
      let paramIndex = 2;

      if (dateFrom) {
        whereConditions.push(`o.created_at >= $${paramIndex++}`);
        params.push(dateFrom);
      }
      
      if (dateTo) {
        whereConditions.push(`o.created_at <= $${paramIndex++}`);
        params.push(dateTo);
      }
      
      if (eventId) {
        whereConditions.push(`o.event_id = $${paramIndex++}`);
        params.push(eventId);
      }

      const whereClause = whereConditions.join(' AND ');

      const revenueQuery = `
        SELECT 
          oi.ticket_type,
          COUNT(*) as total_items,
          SUM(oi.quantity) as total_tickets,
          SUM(oi.total_price_cents) as revenue_cents,
          AVG(oi.unit_price_cents) as avg_price_cents,
          SUM(oi.total_price_cents) * 100.0 / SUM(SUM(oi.total_price_cents)) OVER() as revenue_percentage
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE ${whereClause}
        GROUP BY oi.ticket_type
        ORDER BY revenue_cents DESC
      `;

      const breakdown = await queryMany(revenueQuery, params);

      const totalRevenue = breakdown.reduce((sum, item) => sum + parseInt(item.revenue_cents), 0);
      const totalTickets = breakdown.reduce((sum, item) => sum + parseInt(item.total_tickets), 0);

      return {
        breakdown: breakdown.map(item => ({
          ticketType: item.ticket_type,
          totalItems: parseInt(item.total_items),
          totalTickets: parseInt(item.total_tickets),
          revenueCents: parseInt(item.revenue_cents),
          avgPriceCents: Math.round(parseFloat(item.avg_price_cents)),
          revenuePercentage: parseFloat(item.revenue_percentage),
        })),
        summary: {
          totalRevenueCents: totalRevenue,
          totalTickets,
          avgTicketPriceCents: totalTickets > 0 ? Math.round(totalRevenue / totalTickets) : 0,
        },
      };

    } catch (error) {
      console.error('Error getting revenue breakdown:', error);
      throw new DatabaseError('Failed to get revenue breakdown', 'REVENUE_BREAKDOWN_ERROR');
    }
  }

  /**
   * Delete order item (should rarely be used)
   * @param {string} itemId - Order item UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(itemId) {
    try {
      const deleteQuery = `
        DELETE FROM order_items 
        WHERE id = $1
        RETURNING id
      `;
      
      const result = await queryOne(deleteQuery, [itemId]);
      return !!result;

    } catch (error) {
      console.error('Error deleting order item:', error);
      throw new DatabaseError('Failed to delete order item', 'ORDER_ITEM_DELETE_ERROR');
    }
  }
}

// Export convenience methods
export const createOrderItems = (orderId, items) => OrderItemsModel.createItems(orderId, items);
export const getOrderItems = (orderId) => OrderItemsModel.getByOrderId(orderId);
export const getOrderItem = (itemId) => OrderItemsModel.getById(itemId);
export const updateAttendeeInfo = (itemId, attendeeData) => OrderItemsModel.updateAttendeeInfo(itemId, attendeeData);
export const getTicketStatistics = (filters) => OrderItemsModel.getTicketStats(filters);
export const getAttendeeList = (eventId, options) => OrderItemsModel.getAttendeeList(eventId, options);
export const searchOrderItems = (filters, options) => OrderItemsModel.search(filters, options);
export const bulkUpdateAttendeeInfo = (updates) => OrderItemsModel.bulkUpdateAttendeeInfo(updates);
export const getRevenueBreakdown = (filters) => OrderItemsModel.getRevenueBreakdown(filters);
export const deleteOrderItem = (itemId) => OrderItemsModel.delete(itemId);

export default OrderItemsModel;