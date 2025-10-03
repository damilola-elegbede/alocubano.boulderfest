import analyticsService from "../../lib/analytics-service.js";
import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { getRateLimitService } from "../../lib/rate-limit-service.js";
import { getDatabaseClient } from "../../lib/database.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";

/**
 * Transform executive summary to match frontend expectations
 * Converts backend structure (overview, performance, trends, wallet, recommendations)
 * to frontend expected structure (metrics, comparison)
 */
function transformSummaryForFrontend(summary) {
  // Extract top ticket type with proper structure
  const topTicket = summary.revenue_breakdown?.[0];
  const topTicketType = topTicket ? {
    name: topTicket.ticket_type || 'N/A',
    count: Number(topTicket.quantity_sold || 0)
  } : {
    name: 'N/A',
    count: 0
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
    comparison: {
      // Calculate comparison from trends data
      tickets: Number(summary.trends.last_7_days || 0),
      revenue: 0, // Not available in current data structure
      customers: 0 // Not available in current data structure
    },
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
    case 'summary': {
      const summary = await analyticsService.generateExecutiveSummary(numericEventId);
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

    // For summary type, return transformed data directly (frontend expects unwrapped)
    // For other types, include metadata wrapper
    if (type === 'summary') {
      res.status(200).json(processDatabaseResult(data));
    } else {
      res.status(200).json(processDatabaseResult({
        type,
        eventId: numericEventId,
        eventSlug: validEventId,
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
