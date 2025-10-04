import { getDatabaseClient } from "./database.js";
import { isTestMode, createTestModeFilter } from "./test-mode-utils.js";

export class AnalyticsService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Ensure database client is initialized
   * @returns {Promise<Object>} The database client instance
   */
  async ensureInitialized() {
    if (this.initialized && this.client) {
      return this.client;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform the actual initialization
   */
  async _performInitialization() {
    try {
      // In integration test mode, use the test isolation manager's database
      if (process.env.INTEGRATION_TEST_MODE === 'true') {
        try {
          const { getTestIsolationManager } = await import('./test-isolation-manager.js');
          const isolationManager = getTestIsolationManager();
          this.client = await isolationManager.getScopedDatabaseClient();
        } catch (error) {
          console.warn('[AnalyticsService] Failed to get test database, falling back to standard database:', error.message);
          this.client = await getDatabaseClient();
        }
      } else {
        this.client = await getDatabaseClient();
      }

      if (!this.client) {
        throw new Error('Failed to get database client - client is null');
      }

      this.initialized = true;
      return this.client;
    } catch (error) {
      this.initialized = false;
      this.client = null;
      throw new Error(`Failed to initialize analytics service: ${error.message}`);
    }
  }

  /**
   * Get comprehensive event statistics
   * @param {string} eventId - Event ID to filter by
   * @param {boolean} includeTestData - Whether to include test data (default: auto-detect from environment)
   * @param {Object} req - Express request object for test mode detection
   */
  async getEventStatistics(eventId = "boulder-fest-2026", includeTestData = null, req = null) {
    try {
      const client = await this.ensureInitialized();

      // Generate test mode filter
      const testFilter = createTestModeFilter('t', includeTestData, req);

      const stats = await client.execute({
        sql: `
        SELECT
          -- Ticket Stats
          COUNT(DISTINCT t.id) as total_tickets,
          COUNT(DISTINCT CASE WHEN t.status = 'valid' THEN t.id END) as valid_tickets,
          COUNT(DISTINCT CASE WHEN t.checked_in_at IS NOT NULL THEN t.id END) as checked_in,
          COUNT(DISTINCT t.transaction_id) as unique_orders,

          -- Revenue Stats
          SUM(CASE WHEN t.status = 'valid' THEN t.price_cents ELSE 0 END) / 100.0 as gross_revenue,
          SUM(CASE WHEN t.status = 'refunded' THEN t.price_cents ELSE 0 END) / 100.0 as refunded_amount,
          AVG(CASE WHEN t.status = 'valid' THEN t.price_cents ELSE NULL END) / 100.0 as avg_ticket_price,

          -- Ticket Type Breakdown
          COUNT(CASE WHEN t.ticket_type LIKE '%vip%' THEN 1 END) as vip_tickets,
          COUNT(CASE WHEN t.ticket_type LIKE '%weekend%' THEN 1 END) as weekend_passes,
          COUNT(CASE WHEN t.ticket_type LIKE '%workshop%' THEN 1 END) as workshop_tickets,
          COUNT(CASE WHEN t.ticket_type LIKE '%friday%' THEN 1 END) as friday_tickets,
          COUNT(CASE WHEN t.ticket_type LIKE '%saturday%' THEN 1 END) as saturday_tickets,
          COUNT(CASE WHEN t.ticket_type LIKE '%sunday%' THEN 1 END) as sunday_tickets,

          -- Wallet Integration Stats
          COUNT(CASE WHEN (t.apple_pass_serial IS NOT NULL OR t.google_pass_id IS NOT NULL) THEN 1 END) as wallet_enabled_tickets,
          COUNT(CASE WHEN t.apple_pass_serial IS NOT NULL THEN 1 END) as apple_wallet_tickets,
          COUNT(CASE WHEN t.google_pass_id IS NOT NULL THEN 1 END) as google_wallet_tickets,

          -- Timing Stats
          MIN(t.created_at) as first_sale,
          MAX(t.created_at) as last_sale,
          COUNT(CASE WHEN date(t.created_at) = date('now') THEN 1 END) as today_sales,
          COUNT(CASE WHEN date(t.created_at) >= date('now', '-7 days') THEN 1 END) as week_sales,
          COUNT(CASE WHEN date(t.created_at) >= date('now', '-30 days') THEN 1 END) as month_sales,

          -- Test Mode Stats (when including test data)
          COUNT(CASE WHEN t.is_test = 1 THEN 1 END) as test_tickets,
          COUNT(CASE WHEN t.is_test = 0 THEN 1 END) as production_tickets

        FROM tickets t
        WHERE t.event_id = ? ${testFilter.sql}
      `,
        args: [eventId, ...testFilter.args],
      });

      return stats.rows[0] || {};
    } catch (error) {
      console.error("Error getting event statistics:", error);
      throw new Error("Failed to retrieve event statistics");
    }
  }

  /**
   * Get sales trend data
   * @param {number} days - Number of days to include in trend
   * @param {string} eventId - Event ID to filter by
   * @param {boolean} includeTestData - Whether to include test data
   * @param {Object} req - Express request object for test mode detection
   */
  async getSalesTrend(days = 30, eventId = "boulder-fest-2026", includeTestData = null, req = null) {
    try {
      const client = await this.ensureInitialized();

      // Generate test mode filter
      const testFilter = createTestModeFilter('', includeTestData, req);

      const trend = await client.execute({
        sql: `
        SELECT
          date(created_at) as sale_date,
          COUNT(*) as tickets_sold,
          SUM(price_cents) / 100.0 as revenue,
          COUNT(DISTINCT transaction_id) as orders,
          AVG(price_cents) / 100.0 as avg_price,
          COUNT(CASE WHEN is_test = 1 THEN 1 END) as test_tickets_sold,
          COUNT(CASE WHEN is_test = 0 THEN 1 END) as production_tickets_sold
        FROM tickets
        WHERE status = 'valid'
          AND event_id = ?
          AND created_at >= date('now', '-' || ? || ' days')
          ${testFilter.sql}
        GROUP BY date(created_at)
        ORDER BY sale_date ASC
      `,
        args: [eventId, days, ...testFilter.args],
      });

      // Calculate cumulative totals
      let cumulativeTickets = 0;
      let cumulativeRevenue = 0;

      return trend.rows.map((row) => {
        cumulativeTickets += Number(row.tickets_sold);
        cumulativeRevenue += Number(row.revenue);

        return {
          sale_date: row.sale_date,
          tickets_sold: Number(row.tickets_sold),
          revenue: Number(row.revenue),
          orders: Number(row.orders),
          avg_price: Number(row.avg_price),
          test_tickets_sold: Number(row.test_tickets_sold),
          production_tickets_sold: Number(row.production_tickets_sold),
          cumulative_tickets: cumulativeTickets,
          cumulative_revenue: cumulativeRevenue,
        };
      });
    } catch (error) {
      console.error("Error getting sales trend:", error);
      throw new Error("Failed to retrieve sales trend data");
    }
  }

  /**
   * Get hourly sales pattern
   * @param {string} eventId - Event ID to filter by
   * @param {boolean} includeTestData - Whether to include test data
   * @param {Object} req - Express request object for test mode detection
   */
  async getHourlySalesPattern(eventId = "boulder-fest-2026", includeTestData = null, req = null) {
    const client = await this.ensureInitialized();

    // Generate test mode filter
    const testFilter = createTestModeFilter('', includeTestData, req);

    const pattern = await client.execute({
      sql: `
        SELECT
          strftime('%H', created_at) as hour,
          COUNT(*) as tickets_sold,
          SUM(price_cents) / 100.0 as revenue
        FROM tickets
        WHERE status = 'valid'
          AND event_id = ?
          ${testFilter.sql}
        GROUP BY strftime('%H', created_at)
        ORDER BY hour
      `,
      args: [eventId, ...testFilter.args],
    });

    // Fill in missing hours with zeros
    const hourlyData = Array(24)
      .fill(null)
      .map((_, hour) => {
        const hourStr = hour.toString().padStart(2, "0");
        const data = pattern.rows.find((r) => r.hour === hourStr);

        return {
          hour: hourStr,
          hour_label: `${hour}:00`,
          tickets_sold: data?.tickets_sold || 0,
          revenue: data?.revenue || 0,
        };
      });

    return hourlyData;
  }

  /**
   * Get customer analytics
   * @param {string} eventId - Event ID to filter by
   * @param {boolean} includeTestData - Whether to include test data
   * @param {Object} req - Express request object for test mode detection
   */
  async getCustomerAnalytics(eventId = "boulder-fest-2026", includeTestData = null, req = null) {
    const client = await this.ensureInitialized();

    // Generate test mode filter
    const testFilter = createTestModeFilter('t', includeTestData, req);

    const analytics = await client.execute({
      sql: `
        WITH customer_stats AS (
          SELECT
            tr.customer_email,
            COUNT(DISTINCT t.id) as tickets_purchased,
            SUM(t.price_cents) / 100.0 as total_spent,
            MIN(t.created_at) as first_purchase,
            MAX(t.created_at) as last_purchase,
            COUNT(DISTINCT t.ticket_type) as unique_ticket_types
          FROM transactions tr
          JOIN tickets t ON t.transaction_id = tr.id
          WHERE t.status = 'valid'
            AND t.event_id = ?
            ${testFilter.sql}
          GROUP BY tr.customer_email
        )
        SELECT
          COUNT(DISTINCT customer_email) as unique_customers,
          AVG(tickets_purchased) as avg_tickets_per_customer,
          AVG(total_spent) as avg_spend_per_customer,
          MAX(tickets_purchased) as max_tickets_single_customer,
          COUNT(CASE WHEN tickets_purchased > 1 THEN 1 END) as repeat_customers,
          COUNT(CASE WHEN tickets_purchased = 1 THEN 1 END) as single_ticket_customers,
          COUNT(CASE WHEN total_spent > 200 THEN 1 END) as high_value_customers
        FROM customer_stats
      `,
      args: [eventId, ...testFilter.args],
    });

    // Get top customers
    const topCustomers = await client.execute({
      sql: `
        SELECT
          tr.customer_email,
          tr.customer_name,
          COUNT(DISTINCT t.id) as tickets_purchased,
          SUM(t.price_cents) / 100.0 as total_spent,
          GROUP_CONCAT(DISTINCT t.ticket_type) as ticket_types
        FROM transactions tr
        JOIN tickets t ON t.transaction_id = tr.id
        WHERE t.status = 'valid'
          AND t.event_id = ?
          ${testFilter.sql}
        GROUP BY tr.customer_email
        ORDER BY total_spent DESC
        LIMIT 10
      `,
      args: [eventId, ...testFilter.args],
    });

    return {
      summary: analytics.rows[0],
      topCustomers: topCustomers.rows,
    };
  }

  /**
   * Get check-in analytics
   */
  async getCheckinAnalytics(eventId = "boulder-fest-2026") {
    const client = await this.ensureInitialized();
    const checkins = await client.execute({
      sql: `
        SELECT
          date(checked_in_at) as checkin_date,
          strftime('%H', checked_in_at) as checkin_hour,
          COUNT(*) as checkins,
          ticket_type,
          checked_in_by
        FROM tickets
        WHERE checked_in_at IS NOT NULL
          AND event_id = ?
        GROUP BY date(checked_in_at), strftime('%H', checked_in_at), ticket_type
        ORDER BY checkin_date, checkin_hour
      `,
      args: [eventId],
    });

    // Get check-in rate by ticket type
    const checkinRates = await client.execute({
      sql: `
        SELECT
          ticket_type,
          COUNT(*) as total_tickets,
          COUNT(CASE WHEN checked_in_at IS NOT NULL THEN 1 END) as checked_in,
          ROUND(COUNT(CASE WHEN checked_in_at IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 2) as checkin_rate
        FROM tickets
        WHERE status = 'valid'
          AND event_id = ?
        GROUP BY ticket_type
        ORDER BY total_tickets DESC
      `,
      args: [eventId],
    });

    return {
      timeline: checkins.rows,
      rates: checkinRates.rows,
    };
  }

  /**
   * Get revenue breakdown
   * @param {string} eventId - Event ID to filter by
   * @param {boolean} includeTestData - Whether to include test data
   * @param {Object} req - Express request object for test mode detection
   */
  async getRevenueBreakdown(eventId = "boulder-fest-2026", includeTestData = null, req = null) {
    const client = await this.ensureInitialized();

    // Generate test mode filter
    const testFilter = createTestModeFilter('', includeTestData, req);

    const breakdown = await client.execute({
      sql: `
        SELECT
          ticket_type,
          COUNT(*) as quantity_sold,
          AVG(price_cents) / 100.0 as avg_price,
          SUM(price_cents) / 100.0 as total_revenue,
          ROUND(SUM(price_cents) * 100.0 / (
            SELECT SUM(price_cents)
            FROM tickets
            WHERE status = 'valid' AND event_id = ? ${testFilter.sql}
          ), 2) as revenue_percentage,
          COUNT(CASE WHEN is_test = 1 THEN 1 END) as test_tickets,
          COUNT(CASE WHEN is_test = 0 THEN 1 END) as production_tickets
        FROM tickets
        WHERE status = 'valid'
          AND event_id = ?
          ${testFilter.sql}
        GROUP BY ticket_type
        ORDER BY total_revenue DESC
      `,
      args: [eventId, ...testFilter.args, eventId, ...testFilter.args],
    });

    return breakdown.rows;
  }

  /**
   * Get wallet adoption analytics
   * @param {string} eventId - Event ID to filter by
   * @param {boolean} includeTestData - Whether to include test data
   * @param {Object} req - Express request object for test mode detection
   */
  async getWalletAnalytics(eventId = "boulder-fest-2026", includeTestData = null, req = null) {
    const client = await this.ensureInitialized();

    // Generate test mode filter
    const testFilter = createTestModeFilter('', includeTestData, req);

    // Run all three wallet queries in parallel for better performance
    const [analytics, summary, roi] = await Promise.all([
      client.execute({
        sql: `
          SELECT
            date(checked_in_at) as checkin_date,
            COUNT(*) as total_checkins,
            COUNT(CASE WHEN (apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL) THEN 1 END) as wallet_checkins,
            COUNT(CASE WHEN (apple_pass_serial IS NULL AND google_pass_id IS NULL) THEN 1 END) as traditional_checkins,
            COUNT(CASE WHEN apple_pass_serial IS NOT NULL THEN 1 END) as apple_wallet_checkins,
            COUNT(CASE WHEN google_pass_id IS NOT NULL THEN 1 END) as google_wallet_checkins,
            ROUND(
              COUNT(CASE WHEN (apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL) THEN 1 END) * 100.0 / COUNT(*), 2
            ) as wallet_adoption_rate
          FROM tickets
          WHERE checked_in_at IS NOT NULL
            AND event_id = ?
            ${testFilter.sql}
          GROUP BY date(checked_in_at)
          ORDER BY checkin_date DESC
        `,
        args: [eventId, ...testFilter.args],
      }),

      // Overall wallet statistics
      client.execute({
        sql: `
          SELECT
            COUNT(CASE WHEN (apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL) THEN 1 END) as total_wallet_users,
            COUNT(*) as total_checkins,
            ROUND(
              COUNT(CASE WHEN (apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL) THEN 1 END) * 100.0 / COUNT(*), 2
            ) as overall_adoption_rate,
            COUNT(DISTINCT CASE WHEN (apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL) THEN attendee_email END) as unique_wallet_users,
            COUNT(CASE WHEN apple_pass_serial IS NOT NULL THEN 1 END) as apple_wallet_users,
            COUNT(CASE WHEN google_pass_id IS NOT NULL THEN 1 END) as google_wallet_users,
            AVG(CASE WHEN (apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL) THEN price_cents ELSE NULL END) / 100.0 as avg_wallet_ticket_price,
            AVG(CASE WHEN (apple_pass_serial IS NULL AND google_pass_id IS NULL) THEN price_cents ELSE NULL END) / 100.0 as avg_traditional_ticket_price
          FROM tickets
          WHERE checked_in_at IS NOT NULL
            AND event_id = ?
            ${testFilter.sql}
        `,
        args: [eventId, ...testFilter.args],
      }),

      // Wallet ROI calculation
      client.execute({
        sql: `
          SELECT
            COUNT(CASE WHEN (apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL) THEN 1 END) as wallet_sales,
            COUNT(CASE WHEN (apple_pass_serial IS NULL AND google_pass_id IS NULL) THEN 1 END) as traditional_sales,
            SUM(CASE WHEN (apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL) THEN price_cents ELSE 0 END) / 100.0 as wallet_revenue,
            SUM(CASE WHEN (apple_pass_serial IS NULL AND google_pass_id IS NULL) THEN price_cents ELSE 0 END) / 100.0 as traditional_revenue,
            COUNT(CASE WHEN apple_pass_serial IS NOT NULL THEN 1 END) as apple_wallet_sales,
            COUNT(CASE WHEN google_pass_id IS NOT NULL THEN 1 END) as google_wallet_sales,
            SUM(CASE WHEN apple_pass_serial IS NOT NULL THEN price_cents ELSE 0 END) / 100.0 as apple_wallet_revenue,
            SUM(CASE WHEN google_pass_id IS NOT NULL THEN price_cents ELSE 0 END) / 100.0 as google_wallet_revenue
          FROM tickets
          WHERE status = 'valid'
            AND event_id = ?
            ${testFilter.sql}
        `,
        args: [eventId, ...testFilter.args],
      }),
    ]);

    return {
      timeline: analytics.rows,
      summary: summary.rows[0],
      roi: roi.rows[0],
    };
  }

  /**
   * Get conversion funnel
   * @param {number} days - Number of days to include
   * @param {string} eventId - Event ID to filter by
   * @param {boolean} includeTestData - Whether to include test data
   * @param {Object} req - Express request object for test mode detection
   */
  async getConversionFunnel(days = 30, eventId = "boulder-fest-2026", includeTestData = null, req = null) {
    // This would require tracking page views and cart abandonment
    // For now, we'll show transaction funnel
    const client = await this.ensureInitialized();

    // Generate test mode filter
    const testFilter = createTestModeFilter('', includeTestData, req);

    const funnel = await client.execute({
      sql: `
        SELECT
          COUNT(DISTINCT CASE WHEN status IN ('pending', 'completed', 'failed') THEN id END) as initiated,
          COUNT(DISTINCT CASE WHEN status = 'completed' THEN id END) as completed,
          COUNT(DISTINCT CASE WHEN status = 'failed' THEN id END) as failed,
          COUNT(DISTINCT CASE WHEN status = 'refunded' THEN id END) as refunded,
          COUNT(DISTINCT CASE WHEN status IN ('pending', 'completed', 'failed') AND is_test = 1 THEN id END) as test_initiated,
          COUNT(DISTINCT CASE WHEN status = 'completed' AND is_test = 1 THEN id END) as test_completed
        FROM transactions
        WHERE created_at >= date('now', '-' || ? || ' days')
          AND (event_id = ? OR event_id IS NULL)
          ${testFilter.sql}
      `,
      args: [days, eventId, ...testFilter.args],
    });

    const data = funnel.rows[0];

    return {
      initiated: data.initiated,
      completed: data.completed,
      failed: data.failed,
      refunded: data.refunded,
      completion_rate:
        data.initiated > 0
          ? Math.round((Number(data.completed) / Number(data.initiated)) * 100)
          : 0,
      failure_rate:
        data.initiated > 0
          ? Math.round((Number(data.failed) / Number(data.initiated)) * 100)
          : 0,
    };
  }

  /**
   * Generate executive summary
   */
  async generateExecutiveSummary(eventId = "boulder-fest-2026") {
    const [stats, trend, customers, revenue, funnel, walletAnalytics] =
      await Promise.all([
        this.getEventStatistics(eventId),
        this.getSalesTrend(7, eventId),
        this.getCustomerAnalytics(eventId),
        this.getRevenueBreakdown(eventId),
        this.getConversionFunnel(30, eventId),
        this.getWalletAnalytics(eventId),
      ]);

    // Calculate key metrics
    const daysUntilEvent = Math.ceil(
      (new Date("2026-05-15") - new Date()) / (1000 * 60 * 60 * 24),
    );

    const salesVelocity =
      trend.length > 0
        ? trend.reduce((sum, day) => sum + day.tickets_sold, 0) / trend.length
        : 0;

    const projectedTotal = Number(stats.valid_tickets) + salesVelocity * daysUntilEvent;

    return {
      overview: {
        tickets_sold: stats.valid_tickets,
        gross_revenue: stats.gross_revenue,
        unique_customers: customers.summary.unique_customers,
        check_in_rate:
          stats.valid_tickets > 0
            ? Math.round((Number(stats.checked_in) / Number(stats.valid_tickets)) * 100)
            : 0,
        days_until_event: daysUntilEvent,
      },
      performance: {
        daily_average: salesVelocity.toFixed(1),
        projected_total: Math.round(projectedTotal),
        top_ticket_type: revenue[0]?.ticket_type || "N/A",
        conversion_rate: funnel.completion_rate,
      },
      trends: {
        last_7_days: stats.week_sales,
        last_30_days: stats.month_sales,
        today: stats.today_sales,
      },
      wallet: {
        adoption_rate: walletAnalytics.summary.overall_adoption_rate,
        total_users: walletAnalytics.summary.total_wallet_users,
        revenue_share:
          (walletAnalytics.roi.wallet_revenue + walletAnalytics.roi.traditional_revenue) > 0
            ? (walletAnalytics.roi.wallet_revenue /
                (walletAnalytics.roi.wallet_revenue +
                  walletAnalytics.roi.traditional_revenue)) *
              100
            : 0,
      },
      revenue_breakdown: revenue, // Include full revenue breakdown for frontend transformation
      recommendations: this.generateRecommendations(
        stats,
        customers,
        revenue,
        walletAnalytics,
      ),
    };
  }

  /**
   * Generate recommendations based on analytics
   */
  generateRecommendations(stats, customers, revenue, walletAnalytics) {
    const recommendations = [];

    // Check-in rate recommendation
    if (stats.valid_tickets > 0) {
      const checkinRate = (Number(stats.checked_in) / Number(stats.valid_tickets)) * 100;
      if (checkinRate < 50 && stats.checked_in > 0) {
        recommendations.push({
          type: "warning",
          message: `Low check-in rate (${checkinRate.toFixed(1)}%). Consider sending reminder emails.`,
        });
      }
    }

    // Sales velocity recommendation
    const daysUntilEvent = Math.ceil(
      (new Date("2026-05-15") - new Date()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilEvent < 30 && stats.week_sales < 10) {
      recommendations.push({
        type: "action",
        message:
          "Sales slowing down close to event. Consider promotional campaign.",
      });
    }

    // Customer concentration
    if (
      customers.summary.repeat_customers >
      customers.summary.single_ticket_customers
    ) {
      recommendations.push({
        type: "success",
        message: "High repeat customer rate indicates strong engagement.",
      });
    }

    // Revenue optimization
    const vipRevenue = revenue.find((r) => r.ticket_type === "vip-pass");
    if (vipRevenue && vipRevenue.revenue_percentage < 20) {
      recommendations.push({
        type: "opportunity",
        message:
          "VIP tickets underperforming. Consider enhanced VIP benefits or marketing.",
      });
    }

    // Wallet adoption recommendations
    if (walletAnalytics && walletAnalytics.summary.overall_adoption_rate < 30) {
      recommendations.push({
        type: "opportunity",
        message: `Wallet adoption at ${walletAnalytics.summary.overall_adoption_rate}%. Promote digital wallet benefits to increase mobile engagement.`,
      });
    } else if (
      walletAnalytics &&
      walletAnalytics.summary.overall_adoption_rate > 60
    ) {
      recommendations.push({
        type: "success",
        message: `Excellent wallet adoption (${walletAnalytics.summary.overall_adoption_rate}%). Consider expanding digital-first features.`,
      });
    }

    // Wallet ROI analysis
    if (
      walletAnalytics &&
      walletAnalytics.summary.avg_wallet_ticket_price >
        walletAnalytics.summary.avg_traditional_ticket_price
    ) {
      const priceDiff = (
        (walletAnalytics.summary.avg_wallet_ticket_price /
          walletAnalytics.summary.avg_traditional_ticket_price -
          1) *
        100
      ).toFixed(1);
      recommendations.push({
        type: "success",
        message: `Wallet users spend ${priceDiff}% more on average. Strong ROI on digital initiatives.`,
      });
    }

    return recommendations;
  }

  /**
   * Get test data analytics summary
   * @param {string} eventId - Event ID to filter by
   * @param {Object} req - Express request object for test mode detection
   */
  async getTestDataAnalytics(eventId = "boulder-fest-2026", req = null) {
    try {
      const client = await this.ensureInitialized();

      // Get test data overview
      const testOverview = await client.execute({
        sql: `
        SELECT
          COUNT(DISTINCT t.id) as total_test_tickets,
          COUNT(DISTINCT t.transaction_id) as test_transactions,
          SUM(t.price_cents) / 100.0 as test_revenue,
          COUNT(DISTINCT tr.customer_email) as unique_test_customers,
          MIN(t.created_at) as first_test_record,
          MAX(t.created_at) as latest_test_record,
          AVG(julianday('now') - julianday(t.created_at)) as avg_age_days
        FROM tickets t
        JOIN transactions tr ON t.transaction_id = tr.id
        WHERE t.is_test = 1 AND t.event_id = ?
      `,
        args: [eventId],
      });

      // Get test data by age distribution
      const ageDistribution = await client.execute({
        sql: `
        SELECT
          CASE
            WHEN julianday('now') - julianday(created_at) < 1 THEN 'very_recent'
            WHEN julianday('now') - julianday(created_at) < 7 THEN 'recent'
            WHEN julianday('now') - julianday(created_at) < 30 THEN 'old'
            ELSE 'very_old'
          END as age_category,
          COUNT(*) as count,
          SUM(price_cents) / 100.0 as revenue
        FROM tickets
        WHERE is_test = 1 AND event_id = ?
        GROUP BY age_category
      `,
        args: [eventId],
      });

      // Get test data by status
      const statusBreakdown = await client.execute({
        sql: `
        SELECT
          status,
          COUNT(*) as count,
          SUM(price_cents) / 100.0 as revenue
        FROM tickets
        WHERE is_test = 1 AND event_id = ?
        GROUP BY status
        ORDER BY count DESC
      `,
        args: [eventId],
      });

      // Get cleanup candidates
      const cleanupCandidates = await client.execute(`
        SELECT
          cleanup_priority,
          COUNT(*) as candidate_count,
          AVG(age_days) as avg_age_days,
          SUM(amount_cents) / 100.0 as total_amount
        FROM v_test_data_cleanup_candidates
        WHERE cleanup_priority != 'retain'
        GROUP BY cleanup_priority
        ORDER BY
          CASE cleanup_priority
            WHEN 'immediate' THEN 1
            WHEN 'priority' THEN 2
            WHEN 'scheduled' THEN 3
            ELSE 4
          END
      `);

      return {
        overview: testOverview.rows[0] || {},
        age_distribution: ageDistribution.rows,
        status_breakdown: statusBreakdown.rows,
        cleanup_candidates: cleanupCandidates.rows,
        test_mode_info: {
          current_test_mode: isTestMode(req),
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error("Error getting test data analytics:", error);
      throw new Error("Failed to retrieve test data analytics");
    }
  }

  /**
   * Get production vs test data comparison
   * @param {string} eventId - Event ID to filter by
   * @param {Object} req - Express request object for test mode detection
   */
  async getProductionVsTestComparison(eventId = "boulder-fest-2026", req = null) {
    try {
      const client = await this.ensureInitialized();

      const comparison = await client.execute({
        sql: `
        SELECT
          'production' as data_type,
          COUNT(*) as ticket_count,
          SUM(price_cents) / 100.0 as revenue,
          COUNT(DISTINCT transaction_id) as transaction_count,
          AVG(price_cents) / 100.0 as avg_ticket_price,
          COUNT(CASE WHEN checked_in_at IS NOT NULL THEN 1 END) as checked_in_count
        FROM tickets
        WHERE is_test = 0 AND event_id = ?

        UNION ALL

        SELECT
          'test' as data_type,
          COUNT(*) as ticket_count,
          SUM(price_cents) / 100.0 as revenue,
          COUNT(DISTINCT transaction_id) as transaction_count,
          AVG(price_cents) / 100.0 as avg_ticket_price,
          COUNT(CASE WHEN checked_in_at IS NOT NULL THEN 1 END) as checked_in_count
        FROM tickets
        WHERE is_test = 1 AND event_id = ?
      `,
        args: [eventId, eventId],
      });

      // Calculate ratios and percentages
      const productionData = comparison.rows.find(r => r.data_type === 'production') || {};
      const testData = comparison.rows.find(r => r.data_type === 'test') || {};

      const totalTickets = Number(productionData.ticket_count || 0) + Number(testData.ticket_count || 0);
      const totalRevenue = Number(productionData.revenue || 0) + Number(testData.revenue || 0);

      return {
        production: productionData,
        test: testData,
        comparison: {
          total_tickets: totalTickets,
          total_revenue: totalRevenue,
          test_percentage: totalTickets > 0 ? (Number(testData.ticket_count || 0) / totalTickets * 100).toFixed(2) : 0,
          test_revenue_percentage: totalRevenue > 0 ? (Number(testData.revenue || 0) / totalRevenue * 100).toFixed(2) : 0,
          production_percentage: totalTickets > 0 ? (Number(productionData.ticket_count || 0) / totalTickets * 100).toFixed(2) : 0
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error("Error getting production vs test comparison:", error);
      throw new Error("Failed to retrieve production vs test comparison");
    }
  }

  /**
   * Generate analytics with test mode awareness
   * Enhanced version of generateExecutiveSummary that includes test mode context
   */
  async generateTestAwareExecutiveSummary(eventId = "boulder-fest-2026", includeTestData = null, req = null) {
    const [stats, trend, customers, revenue, funnel, walletAnalytics, testAnalytics, comparison] =
      await Promise.all([
        this.getEventStatistics(eventId, includeTestData, req),
        this.getSalesTrend(7, eventId, includeTestData, req),
        this.getCustomerAnalytics(eventId, includeTestData, req),
        this.getRevenueBreakdown(eventId, includeTestData, req),
        this.getConversionFunnel(30, eventId, includeTestData, req),
        this.getWalletAnalytics(eventId, includeTestData, req),
        this.getTestDataAnalytics(eventId, req),
        this.getProductionVsTestComparison(eventId, req)
      ]);

    // Calculate key metrics
    const daysUntilEvent = Math.ceil(
      (new Date("2026-05-15") - new Date()) / (1000 * 60 * 60 * 24),
    );

    const salesVelocity =
      trend.length > 0
        ? trend.reduce((sum, day) => sum + day.tickets_sold, 0) / trend.length
        : 0;

    const projectedTotal = Number(stats.valid_tickets) + salesVelocity * daysUntilEvent;

    return {
      overview: {
        tickets_sold: stats.valid_tickets,
        gross_revenue: stats.gross_revenue,
        unique_customers: customers.summary.unique_customers,
        check_in_rate:
          stats.valid_tickets > 0
            ? Math.round((Number(stats.checked_in) / Number(stats.valid_tickets)) * 100)
            : 0,
        days_until_event: daysUntilEvent,
        test_mode_active: isTestMode(req),
        data_includes_test: includeTestData
      },
      performance: {
        daily_average: salesVelocity.toFixed(1),
        projected_total: Math.round(projectedTotal),
        top_ticket_type: revenue[0]?.ticket_type || "N/A",
        conversion_rate: funnel.completion_rate,
      },
      trends: {
        last_7_days: stats.week_sales,
        last_30_days: stats.month_sales,
        today: stats.today_sales,
      },
      wallet: {
        adoption_rate: walletAnalytics.summary.overall_adoption_rate,
        total_users: walletAnalytics.summary.total_wallet_users,
        revenue_share:
          (walletAnalytics.roi.wallet_revenue + walletAnalytics.roi.traditional_revenue) > 0
            ? (walletAnalytics.roi.wallet_revenue /
                (walletAnalytics.roi.wallet_revenue +
                  walletAnalytics.roi.traditional_revenue)) *
              100
            : 0,
      },
      test_data: {
        analytics: testAnalytics,
        comparison: comparison,
        cleanup_needed: testAnalytics.cleanup_candidates.length > 0
      },
      revenue_breakdown: revenue, // Include full revenue breakdown for frontend transformation
      recommendations: this.generateTestAwareRecommendations(
        stats,
        customers,
        revenue,
        walletAnalytics,
        testAnalytics,
        comparison
      ),
    };
  }

  /**
   * Generate recommendations with test mode awareness
   */
  generateTestAwareRecommendations(stats, customers, revenue, walletAnalytics, testAnalytics, comparison) {
    const recommendations = this.generateRecommendations(stats, customers, revenue, walletAnalytics);

    // Add test data specific recommendations
    if (testAnalytics.overview.total_test_tickets > 100) {
      recommendations.push({
        type: "action",
        message: `${testAnalytics.overview.total_test_tickets} test tickets found. Consider cleanup to maintain data quality.`,
      });
    }

    if (testAnalytics.cleanup_candidates.length > 0) {
      const immediateCount = testAnalytics.cleanup_candidates
        .find(c => c.cleanup_priority === 'immediate')?.candidate_count || 0;

      if (immediateCount > 0) {
        recommendations.push({
          type: "warning",
          message: `${immediateCount} test records need immediate cleanup (failed/cancelled transactions).`,
        });
      }
    }

    // Test data contamination warning
    const testPercentage = parseFloat(comparison.comparison.test_percentage);
    if (testPercentage > 10) {
      recommendations.push({
        type: "warning",
        message: `Test data represents ${testPercentage}% of total data. Enable test mode filtering in production analytics.`,
      });
    }

    // Old test data warning
    if (testAnalytics.overview.avg_age_days > 30) {
      recommendations.push({
        type: "action",
        message: `Test data is aging (avg ${testAnalytics.overview.avg_age_days.toFixed(1)} days). Schedule regular cleanup.`,
      });
    }

    return recommendations;
  }
}

export default new AnalyticsService();
