/**
 * Optimized Database Query Helpers
 * Pre-built queries for common operations with performance optimizations
 * Designed for Vercel serverless environment
 */

import { query, queryOne, queryMany, transaction } from './client.js';
import { DatabaseError } from './client.js';

/**
 * Order Query Helpers
 */
export class OrderQueries {
  
  /**
   * Get order summary with customer and items count
   * Optimized with single query and joins
   */
  static async getOrderSummary(orderId) {
    const summaryQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.total_cents,
        o.currency,
        o.event_name,
        o.event_date,
        o.created_at,
        c.email as customer_email,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.phone as customer_phone,
        COUNT(oi.id) as item_count,
        SUM(oi.quantity) as total_tickets,
        COUNT(p.id) as payment_count,
        MAX(p.status) as latest_payment_status
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE o.id = $1 AND o.deleted_at IS NULL
      GROUP BY o.id, c.id
    `;
    
    return await queryOne(summaryQuery, [orderId]);
  }

  /**
   * Get daily order statistics for dashboard
   * Optimized for date range queries
   */
  static async getDailyStats(dateFrom, dateTo = null) {
    const endDate = dateTo || new Date().toISOString().split('T')[0];
    
    const statsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_orders,
        SUM(CASE WHEN status = 'completed' THEN total_cents ELSE 0 END) as revenue_cents,
        AVG(CASE WHEN status = 'completed' THEN total_cents END) as avg_order_value_cents
      FROM orders 
      WHERE created_at >= $1 
        AND created_at < $2 + INTERVAL '1 day'
        AND deleted_at IS NULL
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    return await queryMany(statsQuery, [dateFrom, endDate]);
  }

  /**
   * Get top customers by order value
   * Useful for customer analytics
   */
  static async getTopCustomers(limit = 50, dateFrom = null) {
    let whereClause = 'o.status = $1 AND o.deleted_at IS NULL';
    let params = ['completed'];
    let paramIndex = 2;

    if (dateFrom) {
      whereClause += ` AND o.created_at >= $${paramIndex++}`;
      params.push(dateFrom);
    }

    const topCustomersQuery = `
      SELECT 
        c.id,
        c.email,
        c.first_name,
        c.last_name,
        COUNT(o.id) as order_count,
        SUM(o.total_cents) as total_spent_cents,
        AVG(o.total_cents) as avg_order_value_cents,
        MAX(o.created_at) as last_order_date,
        MIN(o.created_at) as first_order_date
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      WHERE ${whereClause}
      GROUP BY c.id
      ORDER BY total_spent_cents DESC
      LIMIT $${paramIndex}
    `;
    
    params.push(limit);
    return await queryMany(topCustomersQuery, params);
  }

  /**
   * Get orders requiring attention (failed payments, expired, etc.)
   * Useful for operations dashboard
   */
  static async getOrdersRequiringAttention() {
    const attentionQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.total_cents,
        o.created_at,
        o.expires_at,
        c.email as customer_email,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        'expired' as attention_reason
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 'pending' 
        AND o.expires_at < NOW()
        AND o.deleted_at IS NULL
      
      UNION ALL
      
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.total_cents,
        o.created_at,
        o.expires_at,
        c.email as customer_email,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        'failed_payment' as attention_reason
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 'failed'
        AND o.created_at > NOW() - INTERVAL '24 hours'
        AND o.deleted_at IS NULL
      
      ORDER BY created_at DESC
      LIMIT 100
    `;
    
    return await queryMany(attentionQuery);
  }

  /**
   * Search orders with full-text search capabilities
   * Optimized for customer service use
   */
  static async searchOrdersFullText(searchTerm, limit = 20) {
    const searchQuery = `
      SELECT 
        o.id,
        o.order_number,
        o.status,
        o.total_cents,
        o.created_at,
        c.email as customer_email,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        COUNT(oi.id) as item_count,
        ts_rank_cd(
          to_tsvector('english', 
            o.order_number || ' ' || 
            c.email || ' ' || 
            COALESCE(c.first_name, '') || ' ' || 
            COALESCE(c.last_name, '')
          ),
          plainto_tsquery('english', $1)
        ) as relevance_score
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE 
        o.deleted_at IS NULL
        AND (
          o.order_number ILIKE $1 OR
          c.email ILIKE $1 OR
          c.first_name ILIKE $1 OR
          c.last_name ILIKE $1 OR
          to_tsvector('english', 
            o.order_number || ' ' || 
            c.email || ' ' || 
            COALESCE(c.first_name, '') || ' ' || 
            COALESCE(c.last_name, '')
          ) @@ plainto_tsquery('english', $1)
        )
      GROUP BY o.id, c.id
      ORDER BY relevance_score DESC, o.created_at DESC
      LIMIT $2
    `;
    
    const searchPattern = `%${searchTerm}%`;
    return await queryMany(searchQuery, [searchPattern, limit]);
  }
}

/**
 * Payment Query Helpers
 */
export class PaymentQueries {
  
  /**
   * Get payment processing statistics
   * Useful for monitoring payment health
   */
  static async getProcessingStats(dateFrom, dateTo = null) {
    const endDate = dateTo || new Date().toISOString();
    
    const statsQuery = `
      SELECT 
        provider,
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
        SUM(CASE WHEN status = 'completed' THEN amount_cents ELSE 0 END) as successful_amount_cents,
        AVG(CASE WHEN status = 'completed' THEN amount_cents END) as avg_successful_amount_cents,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) as avg_processing_time_ms
      FROM payments 
      WHERE created_at >= $1 
        AND created_at <= $2
      GROUP BY provider
      ORDER BY total_attempts DESC
    `;
    
    return await queryMany(statsQuery, [dateFrom, endDate]);
  }

  /**
   * Get failed payments with error analysis
   * Useful for troubleshooting payment issues
   */
  static async getFailedPaymentAnalysis(dateFrom, limit = 100) {
    const failedQuery = `
      SELECT 
        p.id,
        p.provider,
        p.amount_cents,
        p.failure_code,
        p.failure_message,
        p.created_at,
        o.order_number,
        c.email as customer_email,
        COUNT(*) OVER (PARTITION BY p.failure_code) as error_frequency
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE p.status = 'failed' 
        AND p.created_at >= $1
      ORDER BY p.created_at DESC, error_frequency DESC
      LIMIT $2
    `;
    
    return await queryMany(failedQuery, [dateFrom, limit]);
  }

  /**
   * Get payments requiring manual review
   * High-value or suspicious transactions
   */
  static async getPaymentsForReview(thresholdCents = 50000) {
    const reviewQuery = `
      SELECT 
        p.id,
        p.provider,
        p.amount_cents,
        p.status,
        p.authentication_required,
        p.created_at,
        o.order_number,
        c.email as customer_email,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        CASE 
          WHEN p.amount_cents > $1 THEN 'high_value'
          WHEN p.authentication_required = true THEN 'authentication_required'
          WHEN p.created_at < NOW() - INTERVAL '1 hour' AND p.status = 'pending' THEN 'stuck_pending'
          ELSE 'other'
        END as review_reason
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      JOIN customers c ON o.customer_id = c.id
      WHERE 
        (p.amount_cents > $1 OR 
         p.authentication_required = true OR
         (p.created_at < NOW() - INTERVAL '1 hour' AND p.status = 'pending'))
        AND p.status IN ('pending', 'processing')
      ORDER BY p.amount_cents DESC, p.created_at ASC
      LIMIT 50
    `;
    
    return await queryMany(reviewQuery, [thresholdCents]);
  }

  /**
   * Get webhook processing statistics
   * Useful for monitoring webhook health
   */
  static async getWebhookStats(dateFrom, dateTo = null) {
    const endDate = dateTo || new Date().toISOString();
    
    const webhookQuery = `
      SELECT 
        provider,
        event_type,
        COUNT(*) as event_count,
        MIN(processed_at) as first_event,
        MAX(processed_at) as last_event,
        AVG(EXTRACT(EPOCH FROM processed_at)) as avg_processing_time
      FROM webhook_events 
      WHERE processed_at >= $1 
        AND processed_at <= $2
      GROUP BY provider, event_type
      ORDER BY provider, event_count DESC
    `;
    
    return await queryMany(webhookQuery, [dateFrom, endDate]);
  }
}

/**
 * Analytics Query Helpers
 */
export class AnalyticsQueries {
  
  /**
   * Get comprehensive revenue analytics
   * Useful for financial reporting
   */
  static async getRevenueAnalytics(dateFrom, dateTo = null, groupBy = 'day') {
    const endDate = dateTo || new Date().toISOString();
    
    let dateGrouping;
    switch (groupBy) {
      case 'hour':
        dateGrouping = "DATE_TRUNC('hour', o.created_at)";
        break;
      case 'day':
        dateGrouping = "DATE_TRUNC('day', o.created_at)";
        break;
      case 'week':
        dateGrouping = "DATE_TRUNC('week', o.created_at)";
        break;
      case 'month':
        dateGrouping = "DATE_TRUNC('month', o.created_at)";
        break;
      default:
        dateGrouping = "DATE_TRUNC('day', o.created_at)";
    }

    const revenueQuery = `
      SELECT 
        ${dateGrouping} as period,
        COUNT(DISTINCT o.id) as order_count,
        COUNT(DISTINCT o.customer_id) as unique_customers,
        SUM(o.total_cents) as gross_revenue_cents,
        SUM(o.subtotal_cents) as net_revenue_cents,
        SUM(o.tax_cents) as tax_cents,
        SUM(o.fee_cents) as fee_cents,
        SUM(o.discount_cents) as discount_cents,
        AVG(o.total_cents) as avg_order_value_cents,
        SUM(oi.quantity) as total_tickets_sold,
        COUNT(DISTINCT oi.ticket_type) as ticket_types_sold
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status = 'completed'
        AND o.created_at >= $1 
        AND o.created_at <= $2
        AND o.deleted_at IS NULL
      GROUP BY ${dateGrouping}
      ORDER BY period DESC
    `;
    
    return await queryMany(revenueQuery, [dateFrom, endDate]);
  }

  /**
   * Get customer cohort analysis
   * Useful for understanding customer behavior
   */
  static async getCohortAnalysis() {
    const cohortQuery = `
      WITH customer_orders AS (
        SELECT 
          c.id as customer_id,
          c.email,
          DATE_TRUNC('month', MIN(o.created_at)) as cohort_month,
          COUNT(o.id) as total_orders,
          SUM(o.total_cents) as total_spent_cents,
          MIN(o.created_at) as first_order_date,
          MAX(o.created_at) as last_order_date
        FROM customers c
        JOIN orders o ON c.id = o.customer_id
        WHERE o.status = 'completed' AND o.deleted_at IS NULL
        GROUP BY c.id, c.email
      ),
      cohort_data AS (
        SELECT 
          cohort_month,
          COUNT(*) as cohort_size,
          AVG(total_orders) as avg_orders_per_customer,
          AVG(total_spent_cents) as avg_spent_per_customer,
          COUNT(CASE WHEN total_orders > 1 THEN 1 END) as repeat_customers
        FROM customer_orders
        GROUP BY cohort_month
      )
      SELECT 
        cohort_month,
        cohort_size,
        ROUND(avg_orders_per_customer, 2) as avg_orders_per_customer,
        ROUND(avg_spent_per_customer / 100.0, 2) as avg_spent_per_customer_dollars,
        repeat_customers,
        ROUND((repeat_customers::float / cohort_size) * 100, 2) as repeat_customer_rate
      FROM cohort_data
      ORDER BY cohort_month DESC
    `;
    
    return await queryMany(cohortQuery);
  }

  /**
   * Get ticket sales funnel analysis
   * Useful for conversion optimization
   */
  static async getTicketSalesFunnel(dateFrom, dateTo = null) {
    const endDate = dateTo || new Date().toISOString();
    
    const funnelQuery = `
      WITH funnel_data AS (
        SELECT 
          oi.ticket_type,
          COUNT(CASE WHEN o.status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN o.status = 'processing' THEN 1 END) as processing_orders,
          COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN o.status = 'failed' THEN 1 END) as failed_orders,
          SUM(CASE WHEN o.status = 'pending' THEN oi.quantity END) as pending_tickets,
          SUM(CASE WHEN o.status = 'processing' THEN oi.quantity END) as processing_tickets,
          SUM(CASE WHEN o.status = 'completed' THEN oi.quantity END) as completed_tickets,
          SUM(CASE WHEN o.status = 'failed' THEN oi.quantity END) as failed_tickets,
          SUM(CASE WHEN o.status = 'completed' THEN oi.total_price_cents END) as revenue_cents
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= $1 
          AND o.created_at <= $2
          AND o.deleted_at IS NULL
        GROUP BY oi.ticket_type
      )
      SELECT 
        ticket_type,
        pending_orders + processing_orders + completed_orders + failed_orders as total_attempts,
        completed_orders,
        failed_orders,
        ROUND(
          (completed_orders::float / NULLIF(pending_orders + processing_orders + completed_orders + failed_orders, 0)) * 100, 
          2
        ) as conversion_rate,
        completed_tickets,
        revenue_cents
      FROM funnel_data
      ORDER BY total_attempts DESC
    `;
    
    return await queryMany(funnelQuery, [dateFrom, endDate]);
  }

  /**
   * Get geographic sales distribution
   * Based on customer data or IP geolocation
   */
  static async getGeographicDistribution(dateFrom, dateTo = null) {
    const endDate = dateTo || new Date().toISOString();
    
    // This would be enhanced with actual geographic data
    const geoQuery = `
      SELECT 
        COALESCE(
          SUBSTRING(c.phone FROM 1 FOR 3), 
          'Unknown'
        ) as area_code,
        COUNT(DISTINCT o.id) as order_count,
        COUNT(DISTINCT c.id) as customer_count,
        SUM(o.total_cents) as revenue_cents,
        AVG(o.total_cents) as avg_order_value_cents
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 'completed'
        AND o.created_at >= $1 
        AND o.created_at <= $2
        AND o.deleted_at IS NULL
      GROUP BY area_code
      ORDER BY revenue_cents DESC
      LIMIT 20
    `;
    
    return await queryMany(geoQuery, [dateFrom, endDate]);
  }
}

/**
 * Performance Query Helpers
 */
export class PerformanceQueries {
  
  /**
   * Get slow running queries from pg_stat_statements
   * Requires pg_stat_statements extension
   */
  static async getSlowQueries(limit = 20) {
    const slowQueriesQuery = `
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        max_time,
        stddev_time,
        rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
        AND query NOT LIKE '%pg_sleep%'
      ORDER BY total_time DESC
      LIMIT $1
    `;
    
    try {
      return await queryMany(slowQueriesQuery, [limit]);
    } catch (error) {
      // pg_stat_statements might not be enabled
      console.warn('pg_stat_statements not available for query analysis');
      return [];
    }
  }

  /**
   * Get table size and index usage statistics
   * Useful for database optimization
   */
  static async getTableStats() {
    const tableStatsQuery = `
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation,
        most_common_vals,
        most_common_freqs
      FROM pg_stats 
      WHERE schemaname = 'public'
        AND tablename IN ('orders', 'order_items', 'payments', 'customers')
      ORDER BY tablename, attname
    `;
    
    return await queryMany(tableStatsQuery);
  }

  /**
   * Get index usage statistics
   * Helps identify unused indexes
   */
  static async getIndexStats() {
    const indexStatsQuery = `
      SELECT 
        t.tablename,
        indexname,
        c.reltuples AS num_rows,
        pg_size_pretty(pg_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))) AS table_size,
        pg_size_pretty(pg_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.indexname))) AS index_size,
        CASE WHEN indisunique THEN 'Y' ELSE 'N' END AS UNIQUE,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_tables t
      LEFT OUTER JOIN pg_class c ON c.relname=t.tablename
      LEFT OUTER JOIN (
        SELECT 
          c.relname AS ctablename, 
          ipg.relname AS indexname, 
          x.indnatts AS number_of_columns, 
          idx_scan, 
          idx_tup_read, 
          idx_tup_fetch,
          indexrelname, 
          indisunique 
        FROM pg_index x
        JOIN pg_class c ON c.oid = x.indrelid
        JOIN pg_class ipg ON ipg.oid = x.indexrelid
        JOIN pg_stat_all_indexes psai ON x.indexrelid = psai.indexrelid
      ) AS foo ON t.tablename = foo.ctablename
      WHERE t.schemaname='public'
        AND t.tablename IN ('orders', 'order_items', 'payments', 'customers', 'webhook_events')
      ORDER BY 1, 2
    `;
    
    return await queryMany(indexStatsQuery);
  }
}

/**
 * Health Check Queries
 */
export class HealthQueries {
  
  /**
   * Comprehensive database health check
   */
  static async getHealthStatus() {
    try {
      const results = await Promise.allSettled([
        // Basic connectivity
        query('SELECT 1 as connection_test'),
        
        // Recent order activity
        query(`
          SELECT COUNT(*) as recent_orders 
          FROM orders 
          WHERE created_at > NOW() - INTERVAL '1 hour'
        `),
        
        // Payment processing health
        query(`
          SELECT 
            COUNT(*) as total_payments,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments
          FROM payments 
          WHERE created_at > NOW() - INTERVAL '1 hour'
        `),
        
        // Database size
        query(`
          SELECT 
            pg_size_pretty(pg_database_size(current_database())) as database_size,
            (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections
        `),
      ]);

      return {
        status: results.every(r => r.status === 'fulfilled') ? 'healthy' : 'degraded',
        checks: {
          connectivity: results[0].status === 'fulfilled',
          recentOrders: results[1].status === 'fulfilled' ? results[1].value.rows[0].recent_orders : 0,
          paymentHealth: results[2].status === 'fulfilled' ? results[2].value.rows[0] : null,
          databaseSize: results[3].status === 'fulfilled' ? results[3].value.rows[0] : null,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Classes are already exported individually above

// Export convenience functions for common queries
export const getOrderSummary = (orderId) => OrderQueries.getOrderSummary(orderId);
export const getDailyOrderStats = (dateFrom, dateTo) => OrderQueries.getDailyStats(dateFrom, dateTo);
export const getTopCustomers = (limit, dateFrom) => OrderQueries.getTopCustomers(limit, dateFrom);
export const getPaymentProcessingStats = (dateFrom, dateTo) => PaymentQueries.getProcessingStats(dateFrom, dateTo);
export const getRevenueAnalytics = (dateFrom, dateTo, groupBy) => AnalyticsQueries.getRevenueAnalytics(dateFrom, dateTo, groupBy);
export const getDatabaseHealth = () => HealthQueries.getHealthStatus();