import analyticsService from "../../lib/analytics-service.js";
import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { getRateLimitService } from "../../lib/rate-limit-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";

/**
 * Transform sales trend data for Chart.js format
 */
function transformTrendData(trendArray) {
  if (!trendArray || !Array.isArray(trendArray) || trendArray.length === 0) {
    return {
      dates: [],
      daily: [],
      cumulative: []
    };
  }

  return {
    dates: trendArray.map(d => d.sale_date || d.date || ''),
    daily: trendArray.map(d => Number(d.tickets_sold || 0)),
    cumulative: trendArray.map(d => Number(d.cumulative_tickets || 0))
  };
}

/**
 * Transform revenue breakdown for Chart.js doughnut format
 */
function transformRevenueData(revenueArray) {
  if (!revenueArray || !Array.isArray(revenueArray) || revenueArray.length === 0) {
    return {
      labels: [],
      values: []
    };
  }

  return {
    labels: revenueArray.map(r => r.ticket_type || 'Unknown'),
    values: revenueArray.map(r => Number(r.total_revenue || 0))
  };
}

/**
 * Transform hourly sales pattern for Chart.js bar format
 */
function transformHourlyData(hourlyData) {
  if (!hourlyData || !Array.isArray(hourlyData) || hourlyData.length === 0) {
    return {
      hours: [],
      sales: []
    };
  }

  return {
    hours: hourlyData.map(h => `${h.hour || '00'}:00`),
    sales: hourlyData.map(h => Number(h.tickets_sold || 0))
  };
}

/**
 * Transform checkin analytics for Chart.js bar format
 */
function transformCheckinData(checkinData) {
  const rates = checkinData?.rates;
  if (!rates || !Array.isArray(rates) || rates.length === 0) {
    return {
      types: [],
      rates: []
    };
  }

  return {
    types: rates.map(t => t.ticket_type || 'Unknown'),
    rates: rates.map(t => Number(t.checkin_rate || 0))
  };
}

/**
 * Transform wallet analytics for trend chart
 */
function transformWalletTrendData(walletData) {
  const timeline = walletData?.timeline;
  if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
    return {
      dates: [],
      adoption: []
    };
  }

  return {
    dates: timeline.map(t => t.checkin_date || ''),
    adoption: timeline.map(t => Number(t.wallet_adoption_rate || 0))
  };
}

/**
 * Transform top customers data from backend to frontend format
 * Backend returns: customer_name, customer_email, tickets_purchased, total_spent, last_purchase
 * Frontend expects: name, email, ticketCount, totalSpent, lastPurchase
 */
function transformTopCustomers(customersArray) {
  if (!customersArray || !Array.isArray(customersArray)) {
    return [];
  }

  return customersArray.map(customer => ({
    name: customer.customer_name || 'N/A',
    email: customer.customer_email || '',
    ticketCount: Number(customer.tickets_purchased || 0),
    totalSpent: Number(customer.total_spent || 0),
    lastPurchase: customer.last_purchase || ''
  }));
}

/**
 * Calculate period-over-period percentage change
 * @param {number} current - Current period value
 * @param {number} previous - Previous period value
 * @returns {number} Percentage change (e.g., 15.5 for 15.5% increase)
 */
function calculatePercentageChange(current, previous) {
  if (!previous || previous === 0) return 0;
  if (!current) current = 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Calculate smart period-over-period comparison from trend data
 * Uses available trend data to compute actual deltas
 * @param {Array} trendData - Trend data from getSalesTrend
 * @param {Object} summary - Summary object with customer data
 * @returns {Object} Comparison object with percentage changes
 */
function calculateSmartComparison(trendData, summary) {
  if (!trendData || !Array.isArray(trendData) || trendData.length === 0) {
    return {
      tickets: 0,
      revenue: 0,
      customers: 0
    };
  }

  // Split trend data into two halves for comparison
  const midpoint = Math.floor(trendData.length / 2);
  const firstHalf = trendData.slice(0, midpoint);
  const secondHalf = trendData.slice(midpoint);

  // Calculate totals for each period
  const firstHalfTickets = firstHalf.reduce((sum, day) => sum + Number(day.tickets_sold || 0), 0);
  const secondHalfTickets = secondHalf.reduce((sum, day) => sum + Number(day.tickets_sold || 0), 0);

  const firstHalfRevenue = firstHalf.reduce((sum, day) => sum + Number(day.revenue || 0), 0);
  const secondHalfRevenue = secondHalf.reduce((sum, day) => sum + Number(day.revenue || 0), 0);

  // Calculate percentage changes
  const ticketsChange = calculatePercentageChange(secondHalfTickets, firstHalfTickets);
  const revenueChange = calculatePercentageChange(secondHalfRevenue, firstHalfRevenue);

  // For customers, use summary data if available
  let customersChange = 0;
  if (summary && summary.overview) {
    // Estimate customer change based on ticket change (reasonable approximation)
    customersChange = ticketsChange;
  }

  return {
    tickets: Number(ticketsChange.toFixed(1)),
    revenue: Number(revenueChange.toFixed(1)),
    customers: Number(customersChange.toFixed(1))
  };
}

/**
 * Transform executive summary to match frontend expectations
 * Converts backend structure (overview, performance, trends, wallet, recommendations)
 * to frontend expected structure (metrics, comparison)
 */
function transformSummaryForFrontend(summary, trendData = null) {
  // Extract top ticket type with proper structure
  const topTicket = summary.revenue_breakdown?.[0];
  const topTicketType = topTicket ? {
    name: topTicket.ticket_type || 'N/A',
    count: Number(topTicket.quantity_sold || 0)
  } : {
    name: 'N/A',
    count: 0
  };

  // Calculate smart comparison if trend data is available
  // Seed with all required fields (including those consumed by metrics cards)
  const comparison = {
    tickets: 0,
    revenue: 0,
    customers: 0,
    checkinRate: 0,
    conversionRate: 0,
    walletAdoption: 0,
    digitalShare: 0,
    ...calculateSmartComparison(trendData, summary)
  };

  return {
    // Frontend-expected structure with camelCase properties
    // ALL fields must be in metrics object for frontend compatibility
    metrics: {
      // Core metrics
      totalTickets: Number(summary.overview.tickets_sold || 0),
      grossRevenue: Number(summary.overview.gross_revenue || 0),
      uniqueCustomers: Number(summary.overview.unique_customers || 0),
      checkinRate: Number(summary.overview.check_in_rate || 0),
      daysUntilEvent: Number(summary.overview.days_until_event || 0),

      // Performance metrics (previously separate)
      conversionRate: Number(summary.performance.conversion_rate || 0),
      topTicketType: topTicketType,

      // Wallet metrics (previously separate)
      walletAdoption: Number(summary.wallet.adoption_rate || 0),
      digitalShare: Number(summary.wallet.revenue_share || 0)
    },
    comparison: comparison,
    // Performance metrics (for future use)
    performance: {
      dailyAverage: parseFloat(summary.performance.daily_average || 0),
      projectedTotal: Number(summary.performance.projected_total || 0),
      topTicketType: summary.performance.top_ticket_type || 'N/A',
      conversionRate: Number(summary.performance.conversion_rate || 0)
    },
    // Trends data (for future use)
    trends: {
      last7Days: Number(summary.trends.last_7_days || 0),
      last30Days: Number(summary.trends.last_30_days || 0),
      today: Number(summary.trends.today || 0)
    },
    // Wallet analytics (for future use)
    wallet: {
      adoptionRate: Number(summary.wallet.adoption_rate || 0),
      totalUsers: Number(summary.wallet.total_users || 0),
      revenueShare: Number(summary.wallet.revenue_share || 0)
    },
    // Recommendations
    recommendations: summary.recommendations || [],
    // Preserve full backend data for future enhancements
    _details: summary
  };
}

async function handler(req, res) {
  // Add cache headers for browser caching (30-second TTL)
  res.setHeader('Cache-Control', 'private, max-age=30');
  res.setHeader('Vary', 'Authorization');

  // Initialize database client
  await getDatabaseClient();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Apply rate limiting
  const rateLimitResult = await getRateLimitService().checkLimit(req, 'analytics', {
    maxAttempts: 100,
    windowMs: 60000 // 100 requests per minute
  });

  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: rateLimitResult.retryAfter
    });
  }

  // Input validation and sanitization
  let { type, eventId, days = 30 } = req.query;

  if (!type) {
    return res.status(400).json({
      error: 'Missing required parameter: type',
      allowedTypes: [
        'dashboard',
        'summary',
        'statistics',
        'trend',
        'hourly',
        'customers',
        'checkins',
        'revenue',
        'funnel',
        'wallet'
      ]
    });
  }

  // Handle special cases - reject only the 'all' string (negative IDs are valid test events)
  if (eventId === 'all') {
    return res.status(400).json({
      error: 'Event selection required. Please select a specific event.',
      hint: 'Please select an event from the dropdown.'
    });
  }

  // Convert eventId to numeric ID (matches dashboard API behavior)
  let numericEventId;

  if (!eventId) {
    // No event specified - return error instead of dangerous fallback
    return res.status(400).json({
      error: 'Event selection required',
      hint: 'Please select an event from the dropdown.'
    });
  }

  // If it's already numeric, use it directly
  if (/^-?\d+$/.test(eventId)) {
    numericEventId = parseInt(eventId, 10);
  } else {
    // It's a slug - convert to numeric ID
    try {
      const db = await getDatabaseClient();
      const eventResult = await db.execute({
        sql: 'SELECT id FROM events WHERE slug = ?',
        args: [eventId]
      });

      if (!eventResult.rows || eventResult.rows.length === 0) {
        return res.status(404).json({
          error: `Event not found: ${eventId}`
        });
      }

      numericEventId = eventResult.rows[0].id;
    } catch (error) {
      console.error('Failed to lookup event by slug:', error);
      return res.status(500).json({
        error: 'Failed to lookup event'
      });
    }
  }

  try {
    let data;

    switch (type) {
    case 'dashboard': {
      // Comprehensive analytics for dashboard page - single request with all data
      // Handle "All Time" explicitly - treat missing/null/"all" as null (no date filter)
      let trendDays = null;
      if (days && days !== 'all' && days !== '') {
        const parsed = parseInt(days, 10);
        if (!isNaN(parsed) && parsed > 0) {
          trendDays = parsed;
        }
      }
      // Default to 30 days only if explicitly zero or invalid non-all values
      if (trendDays === null && days && days !== 'all' && days !== '') {
        trendDays = 30;
      }

      const [summary, trend, hourly, customers, checkins, revenue, wallet] = await Promise.all([
        analyticsService.generateTestAwareExecutiveSummary(numericEventId),
        analyticsService.getSalesTrend(trendDays, numericEventId),
        analyticsService.getHourlySalesPattern(numericEventId),
        analyticsService.getCustomerAnalytics(numericEventId),
        analyticsService.getCheckinAnalytics(numericEventId),
        analyticsService.getRevenueBreakdown(numericEventId),
        analyticsService.getWalletAnalytics(numericEventId)
      ]);

      // Transform summary with trend data for smart comparison calculation
      const transformedSummary = transformSummaryForFrontend(summary, trend);

      data = {
        metrics: transformedSummary.metrics,
        comparison: transformedSummary.comparison,
        salesTrend: transformTrendData(trend),
        revenueByType: transformRevenueData(revenue),
        hourlySales: transformHourlyData(hourly),
        checkinByType: transformCheckinData(checkins),
        walletTrend: transformWalletTrendData(wallet),
        topCustomers: transformTopCustomers(customers.topCustomers || []),
        recommendations: summary.recommendations || []
      };
      break;
    }

    case 'summary': {
      const summary = await analyticsService.generateTestAwareExecutiveSummary(numericEventId);
      data = transformSummaryForFrontend(summary);
      break;
    }

    case 'statistics': {
      data = await analyticsService.getEventStatistics(numericEventId);
      break;
    }

    case 'trend': {
      const trendDays = parseInt(days) || 30;
      if (trendDays < 1 || trendDays > 365) {
        return res.status(400).json({
          error: 'Days parameter must be between 1 and 365'
        });
      }
      data = await analyticsService.getSalesTrend(trendDays, numericEventId);
      break;
    }

    case 'hourly': {
      data = await analyticsService.getHourlySalesPattern(numericEventId);
      break;
    }

    case 'customers': {
      data = await analyticsService.getCustomerAnalytics(numericEventId);
      break;
    }

    case 'checkins': {
      data = await analyticsService.getCheckinAnalytics(numericEventId);
      break;
    }

    case 'revenue': {
      data = await analyticsService.getRevenueBreakdown(numericEventId);
      break;
    }

    case 'funnel': {
      const funnelDays = parseInt(days) || 30;
      if (funnelDays < 1 || funnelDays > 365) {
        return res.status(400).json({
          error: 'Days parameter must be between 1 and 365'
        });
      }
      data = await analyticsService.getConversionFunnel(
        funnelDays,
        numericEventId
      );
      break;
    }

    case 'wallet': {
      data = await analyticsService.getWalletAnalytics(numericEventId);
      break;
    }

    default: {
      return res.status(400).json({
        error: `Unknown analytics type: ${type}`,
        allowedTypes: [
          'dashboard',
          'summary',
          'statistics',
          'trend',
          'hourly',
          'customers',
          'checkins',
          'revenue',
          'funnel',
          'wallet'
        ]
      });
    }
    }

    // For summary and dashboard types, return transformed data directly (frontend expects unwrapped)
    // For other types, include metadata wrapper
    if (type === 'summary' || type === 'dashboard') {
      res.status(200).json(processDatabaseResult(data));
    } else {
      res.status(200).json(processDatabaseResult({
        type,
        eventId: numericEventId,
        eventSlug: eventId,
        generatedAt: new Date().toISOString(),
        data
      }));
    }
  } catch (error) {
    console.error(`Analytics ${type} error:`, error);
    res.status(500).json({
      error: `Failed to fetch ${type} analytics`,
      type
    });
  }
}

export default withSecurityHeaders(authService.requireAuth(withAdminAudit(handler, {
  logBody: false, // Analytics requests don't need body logging
  logMetadata: true,
  skipMethods: [] // Log all analytics access for compliance
})));
