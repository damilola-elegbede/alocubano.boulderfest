/**
 * Festival-Specific Query Optimizer
 * Specialized optimizations for A Lo Cubano Boulder Fest query patterns
 */

import { performance } from "perf_hooks";
import { safeStringify } from "../bigint-serializer.js";

/**
 * Festival-specific query patterns and optimizations
 */
export class FestivalQueryOptimizer {
  constructor(databaseService) {
    this.db = databaseService;
    this.queryCache = new Map();
    this.optimizedQueries = new Map();

    // Festival-specific patterns
    this.patterns = {
      TICKET_LOOKUP_BY_ID: /SELECT.*FROM tickets.*WHERE.*ticket_id\s*=\s*\?/i,
      TICKETS_BY_EMAIL: /SELECT.*FROM tickets.*WHERE.*attendee_email\s*=\s*\?/i,
      QR_CODE_VALIDATION: /SELECT.*FROM tickets.*WHERE.*qr_code_data\s*=\s*\?/i,
      EVENT_TICKETS: /SELECT.*FROM tickets.*WHERE.*event_id\s*=\s*\?/i,
      DAILY_SALES_REPORT:
        /SELECT.*COUNT.*FROM.*transactions.*created_at.*BETWEEN/i,
      CHECKIN_STATUS: /SELECT.*FROM tickets.*WHERE.*status\s*=\s*['"]used['"]/i,
      ANALYTICS_REVENUE: /SELECT.*SUM.*amount.*FROM.*transactions/i,
      ADMIN_DASHBOARD_COUNTS: /SELECT.*COUNT.*FROM.*GROUP BY/i,
    };
  }

  /**
   * Optimize ticket lookup by ID (most critical)
   */
  optimizeTicketLookup(ticketId) {
    const query = `
      SELECT ticket_id, transaction_id, ticket_type, event_id, event_date,
             attendee_first_name, attendee_last_name, attendee_email,
             status, created_at, checked_in_at
      FROM tickets
      WHERE ticket_id = ?
      LIMIT 1
    `;

    return this.executeOptimized("TICKET_LOOKUP", query, [ticketId]);
  }

  /**
   * Optimize QR code validation (performance critical for check-ins)
   */
  async optimizeQRValidation(qrData) {
    // Use covering index to avoid additional lookups
    const query = `
      SELECT ticket_id, attendee_first_name, attendee_last_name,
             attendee_email, ticket_type, event_id, status,
             validation_signature
      FROM tickets
      WHERE qr_code_data = ? AND status IN ('valid', 'transferred')
      LIMIT 1
    `;

    return this.executeOptimized("QR_VALIDATION", query, [qrData]);
  }

  /**
   * Optimize ticket lookup by email (customer support)
   */
  async optimizeTicketsByEmail(email) {
    // Join with transactions for order information
    const query = `
      SELECT t.ticket_id, t.ticket_type, t.event_id, t.event_date,
             t.attendee_first_name, t.attendee_last_name, t.status,
             t.created_at, tr.uuid as order_number, tr.amount_total
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE t.attendee_email = ? OR tr.customer_email = ?
      ORDER BY t.created_at DESC
    `;

    return this.executeOptimized("TICKETS_BY_EMAIL", query, [email, email]);
  }

  /**
   * Optimize event statistics (admin dashboard)
   */
  async optimizeEventStatistics(eventId) {
    // Single query with multiple aggregations
    const query = `
      SELECT
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN status = 'valid' THEN 1 END) as valid_tickets,
        COUNT(CASE WHEN status = 'used' THEN 1 END) as used_tickets,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_tickets,
        COUNT(CASE WHEN checked_in_at IS NOT NULL THEN 1 END) as checked_in,
        MIN(created_at) as first_sale,
        MAX(created_at) as last_sale
      FROM tickets
      WHERE event_id = ?
    `;

    return this.executeOptimized("EVENT_STATISTICS", query, [eventId]);
  }

  /**
   * Optimize daily sales report
   */
  async optimizeDailySalesReport(eventId, days = 30) {
    const query = `
      SELECT
        DATE(t.created_at) as sale_date,
        COUNT(*) as tickets_sold,
        COUNT(DISTINCT t.transaction_id) as transactions,
        SUM(tr.amount_total) as revenue,
        COUNT(CASE WHEN t.ticket_type LIKE '%workshop%' THEN 1 END) as workshop_tickets,
        COUNT(CASE WHEN t.ticket_type LIKE '%social%' THEN 1 END) as social_tickets
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE t.event_id = ?
        AND t.created_at >= DATE('now', '-${days} days')
        AND tr.status = 'completed'
      GROUP BY DATE(t.created_at)
      ORDER BY sale_date DESC
    `;

    return this.executeOptimized("DAILY_SALES_REPORT", query, [eventId]);
  }

  /**
   * Optimize real-time check-in dashboard
   */
  async optimizeCheckinDashboard(eventId) {
    // Single query for check-in dashboard
    const query = `
      SELECT
        COUNT(CASE WHEN status = 'used' THEN 1 END) as checked_in_count,
        COUNT(CASE WHEN status = 'valid' THEN 1 END) as pending_checkin,
        MAX(checked_in_at) as last_checkin_time,
        COUNT(CASE WHEN checked_in_at >= DATETIME('now', '-1 hour') THEN 1 END) as checkins_last_hour,
        ticket_type,
        COUNT(*) as type_count
      FROM tickets
      WHERE event_id = ? AND status IN ('valid', 'used')
      GROUP BY ticket_type
    `;

    return this.executeOptimized("CHECKIN_DASHBOARD", query, [eventId]);
  }

  /**
   * Optimize analytics revenue breakdown
   */
  async optimizeRevenueBreakdown(eventId) {
    const query = `
      SELECT
        t.ticket_type,
        COUNT(*) as tickets_sold,
        SUM(tr.amount_total) as total_revenue,
        AVG(tr.amount_total) as avg_transaction_value,
        MIN(tr.created_at) as first_sale,
        MAX(tr.created_at) as last_sale
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE t.event_id = ? AND tr.status = 'completed'
      GROUP BY t.ticket_type
      ORDER BY total_revenue DESC
    `;

    return this.executeOptimized("REVENUE_BREAKDOWN", query, [eventId]);
  }

  /**
   * Optimize hourly sales pattern (for load planning)
   */
  async optimizeHourlySalesPattern(eventId) {
    const query = `
      SELECT
        CAST(strftime('%H', t.created_at) AS INTEGER) as hour,
        COUNT(*) as tickets_sold,
        COUNT(DISTINCT DATE(t.created_at)) as days,
        CAST(COUNT(*) AS FLOAT) / COUNT(DISTINCT DATE(t.created_at)) as avg_per_hour
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE t.event_id = ?
        AND tr.status = 'completed'
        AND t.created_at >= DATE('now', '-30 days')
      GROUP BY CAST(strftime('%H', t.created_at) AS INTEGER)
      ORDER BY hour
    `;

    return this.executeOptimized("HOURLY_SALES_PATTERN", query, [eventId]);
  }

  /**
   * Optimize customer analytics
   */
  async optimizeCustomerAnalytics(eventId) {
    const query = `
      SELECT
        tr.customer_email,
        COUNT(*) as total_tickets,
        SUM(tr.amount_total) as total_spent,
        MIN(tr.created_at) as first_purchase,
        MAX(tr.created_at) as last_purchase,
        COUNT(DISTINCT tr.id) as total_transactions,
        GROUP_CONCAT(DISTINCT t.ticket_type) as ticket_types
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE t.event_id = ? AND tr.status = 'completed'
      GROUP BY tr.customer_email
      HAVING COUNT(*) > 1  -- Only repeat customers
      ORDER BY total_spent DESC
      LIMIT 100
    `;

    return this.executeOptimized("CUSTOMER_ANALYTICS", query, [eventId]);
  }

  /**
   * Execute query with optimization tracking
   */
  async executeOptimized(queryType, sql, params = []) {
    const startTime = performance.now();
    const cacheKey = `${queryType}:${safeStringify(params)}`;

    try {
      // Don't cache QR validation results (security sensitive)
      if (queryType !== "QR_VALIDATION") {
        // Check cache for recent results (5-minute cache for most queries)
        const cached = this.queryCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 300000) {
          return {
            data: cached.data,
            executionTime: 0,
            fromCache: true,
            queryType,
          };
        }
      }

      // Execute query
      const result = await this.db.execute({ sql, args: params });
      const executionTime = performance.now() - startTime;

      // Cache result (but not QR validation)
      if (queryType !== "QR_VALIDATION") {
        this.queryCache.set(cacheKey, {
          data: result.rows,
          timestamp: Date.now(),
        });
      }

      // Clean cache periodically
      if (this.queryCache.size > 1000) {
        this.cleanCache();
      }

      // Track optimization metrics
      this.trackOptimization(queryType, executionTime, result.rows.length);

      return {
        data: result.rows,
        executionTime,
        fromCache: false,
        queryType,
        rowCount: result.rows.length,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;

      console.error(`Festival query optimization failed for ${queryType}:`, {
        error: error.message,
        executionTime,
        sql: sql.substring(0, 100) + "...",
      });

      throw error;
    }
  }

  /**
   * Track optimization metrics
   */
  trackOptimization(queryType, executionTime, rowCount) {
    if (!this.optimizedQueries.has(queryType)) {
      this.optimizedQueries.set(queryType, {
        executions: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        totalRows: 0,
        cacheHits: 0,
      });
    }

    const metrics = this.optimizedQueries.get(queryType);
    metrics.executions++;
    metrics.totalTime += executionTime;
    metrics.minTime = Math.min(metrics.minTime, executionTime);
    metrics.maxTime = Math.max(metrics.maxTime, executionTime);
    metrics.totalRows += rowCount;
    metrics.avgTime = metrics.totalTime / metrics.executions;
    metrics.avgRows = metrics.totalRows / metrics.executions;
  }

  /**
   * Clean old cache entries
   */
  cleanCache() {
    const cutoff = Date.now() - 600000; // 10 minutes

    for (const [key, value] of this.queryCache) {
      if (value.timestamp < cutoff) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    const stats = {};

    for (const [queryType, metrics] of this.optimizedQueries) {
      stats[queryType] = {
        executions: metrics.executions,
        avgTime: Math.round(metrics.avgTime * 100) / 100,
        minTime: Math.round(metrics.minTime * 100) / 100,
        maxTime: Math.round(metrics.maxTime * 100) / 100,
        avgRows: Math.round(metrics.avgRows),
        cacheHitRate: (metrics.cacheHits / metrics.executions) * 100,
      };
    }

    return {
      queryTypes: Object.keys(stats).length,
      totalExecutions: Array.from(this.optimizedQueries.values()).reduce(
        (sum, m) => sum + m.executions,
        0,
      ),
      cacheSize: this.queryCache.size,
      stats,
    };
  }

  /**
   * Create festival-specific indexes
   */
  async createFestivalIndexes() {
    const indexes = [
      // Critical performance indexes
      "CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id_status ON tickets(ticket_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_tickets_qr_validation ON tickets(qr_code_data, status, validation_signature)",
      "CREATE INDEX IF NOT EXISTS idx_tickets_email_created ON tickets(attendee_email, created_at DESC)",

      // Analytics indexes
      "CREATE INDEX IF NOT EXISTS idx_tickets_event_type_status ON tickets(event_id, ticket_type, status)",
      "CREATE INDEX IF NOT EXISTS idx_tickets_created_date ON tickets(DATE(created_at), event_id)",
      "CREATE INDEX IF NOT EXISTS idx_tickets_checkin_time ON tickets(checked_in_at, event_id) WHERE checked_in_at IS NOT NULL",

      // Transaction joining indexes
      "CREATE INDEX IF NOT EXISTS idx_transactions_id_status ON transactions(id, status)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_customer_email_created ON transactions(customer_email, created_at DESC)",

      // Covering indexes for common queries
      "CREATE INDEX IF NOT EXISTS idx_tickets_covering_lookup ON tickets(ticket_id, attendee_first_name, attendee_last_name, attendee_email, status, event_id)",
      "CREATE INDEX IF NOT EXISTS idx_tickets_covering_checkin ON tickets(event_id, status, checked_in_at, ticket_type) WHERE status IN ('valid', 'used')",
    ];

    const results = [];
    for (const indexSql of indexes) {
      try {
        await this.db.execute(indexSql);
        results.push({ sql: indexSql, success: true });
      } catch (error) {
        results.push({
          sql: indexSql,
          success: false,
          error: error.message.includes("already exists")
            ? "already_exists"
            : error.message,
        });
      }
    }

    this.indexesCreated = true;
    return results;
  }

  /**
   * Get festival query recommendations
   */
  getFestivalRecommendations() {
    const stats = this.getOptimizationStats();
    const recommendations = [];

    // Check for slow queries
    for (const [queryType, metrics] of Object.entries(stats.stats)) {
      if (metrics.avgTime > 50) {
        recommendations.push({
          type: "SLOW_QUERY",
          queryType,
          avgTime: metrics.avgTime,
          recommendation: `Consider optimizing ${queryType} queries (avg: ${metrics.avgTime}ms)`,
          priority: metrics.avgTime > 100 ? "HIGH" : "MEDIUM",
        });
      }
    }

    // Cache efficiency recommendations
    const overallCacheHitRate =
      Object.values(stats.stats).reduce(
        (sum, s) => sum + (s.cacheHitRate || 0),
        0,
      ) / Object.keys(stats.stats).length;

    if (overallCacheHitRate < 30) {
      recommendations.push({
        type: "LOW_CACHE_EFFICIENCY",
        cacheHitRate: Math.round(overallCacheHitRate),
        recommendation:
          "Consider increasing cache TTL or optimizing cache keys",
        priority: "MEDIUM",
      });
    }

    // Index recommendations
    if (!this.indexesCreated) {
      recommendations.push({
        type: "MISSING_INDEXES",
        recommendation:
          "Create festival-specific indexes for better performance",
        priority: "HIGH",
        action: "Run createFestivalIndexes()",
      });
    }

    return recommendations;
  }
}

export default FestivalQueryOptimizer;
