import analyticsService from '../lib/analytics-service.js';
import authService from '../lib/auth-service.js';
import { withSecurityHeaders } from '../lib/security-headers.js';
import rateLimitService from '../lib/rate-limit-service.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Apply rate limiting
  const rateLimitResult = await rateLimitService.checkLimit(req, 'analytics', {
    maxAttempts: 100,
    windowMs: 60000 // 100 requests per minute
  });

  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: rateLimitResult.retryAfter
    });
  }

  // Input validation and sanitization - support both single type and comprehensive
  const { type, eventId = 'all', days = 30 } = req.query;

  // Validate eventId to prevent injection
  const validEventId = eventId === 'all' || /^[a-zA-Z0-9-_]+$/.test(eventId)
    ? eventId
    : 'all';
  if (validEventId !== eventId) {
    return res.status(400).json({
      error:
        'Invalid eventId format. Only \'all\' or alphanumeric characters, hyphens and underscores allowed.'
    });
  }

  // If no type is specified, return comprehensive analytics data
  if (!type) {
    try {
      // Return comprehensive analytics data for analytics dashboard
      const data = await generateComprehensiveAnalytics(validEventId, parseInt(days) || 30);

      res.status(200).json({
        eventId: validEventId,
        days: parseInt(days) || 30,
        generatedAt: new Date().toISOString(),
        ...data
      });
      return;
    } catch (error) {
      console.error('Comprehensive analytics error:', error);
      res.status(500).json({
        error: 'Failed to fetch comprehensive analytics',
        eventId: validEventId
      });
      return;
    }
  }

  try {
    let data;

    switch (type) {
    case 'summary': {
      data = await analyticsService.generateExecutiveSummary(validEventId);
      break;
    }

    case 'statistics': {
      data = await analyticsService.getEventStatistics(validEventId);
      break;
    }

    case 'trend': {
      const trendDays = parseInt(days) || 30;
      if (trendDays < 1 || trendDays > 365) {
        return res.status(400).json({
          error: 'Days parameter must be between 1 and 365'
        });
      }
      data = await analyticsService.getSalesTrend(trendDays, validEventId);
      break;
    }

    case 'hourly': {
      data = await analyticsService.getHourlySalesPattern(validEventId);
      break;
    }

    case 'customers': {
      data = await analyticsService.getCustomerAnalytics(validEventId);
      break;
    }

    case 'checkins': {
      data = await analyticsService.getCheckinAnalytics(validEventId);
      break;
    }

    case 'revenue': {
      data = await analyticsService.getRevenueBreakdown(validEventId);
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
        validEventId
      );
      break;
    }

    case 'wallet': {
      data = await analyticsService.getWalletAnalytics(validEventId);
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

    res.status(200).json({
      type,
      eventId: validEventId,
      generatedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    console.error(`Analytics ${type} error:`, error);
    res.status(500).json({
      error: `Failed to fetch ${type} analytics`,
      type
    });
  }
}

/**
 * Generate comprehensive analytics data for the dashboard
 * @param {string} eventId - Event ID or "all" for aggregate data
 * @param {number} days - Number of days for time-based analytics
 * @returns {Object} Comprehensive analytics data
 */
async function generateComprehensiveAnalytics(eventId, days) {
  try {
    // Gather all the necessary analytics data in parallel
    const [
      statistics,
      salesTrend,
      hourlySales,
      revenueByType,
      customerAnalytics,
      checkinByType,
      walletTrend,
      conversionFunnel
    ] = await Promise.all([
      analyticsService.getEventStatistics(eventId),
      analyticsService.getSalesTrend(days, eventId),
      analyticsService.getHourlySalesPattern(eventId),
      analyticsService.getRevenueBreakdown(eventId),
      analyticsService.getCustomerAnalytics(eventId),
      analyticsService.getCheckinAnalytics(eventId),
      analyticsService.getWalletAnalytics(eventId),
      analyticsService.getConversionFunnel(days, eventId)
    ]);

    // Extract key metrics
    const metrics = {
      totalTickets: statistics.total_tickets || 0,
      grossRevenue: statistics.total_revenue || 0,
      uniqueCustomers: customerAnalytics.unique_customers || 0,
      checkinRate: statistics.checkin_rate || 0,
      conversionRate: conversionFunnel.overall_conversion_rate || 0,
      topTicketType: {
        name: revenueByType.labels?.[0] || 'N/A',
        count: revenueByType.tickets?.[0] || 0
      },
      walletAdoption: walletTrend.overall_adoption_rate || 0,
      digitalShare: (statistics.digital_revenue_share || 0) * 100
    };

    // Calculate comparison data (mock for now - would be real historical comparison)
    const comparison = {
      tickets: Math.random() * 20 - 10, // Random percentage change for demo
      revenue: Math.random() * 15 - 7.5,
      customers: Math.random() * 12 - 6,
      checkinRate: Math.random() * 8 - 4,
      conversionRate: Math.random() * 6 - 3,
      walletAdoption: Math.random() * 25 - 12.5,
      digitalShare: Math.random() * 10 - 5
    };

    // Format chart data
    const chartData = {
      salesTrend: {
        dates: salesTrend.dates || [],
        daily: salesTrend.daily_sales || [],
        cumulative: salesTrend.cumulative_sales || []
      },
      revenueByType: {
        labels: revenueByType.labels || [],
        values: revenueByType.values || []
      },
      hourlySales: {
        hours: hourlySales.hours || [],
        sales: hourlySales.sales || []
      },
      checkinByType: {
        types: checkinByType.ticket_types || [],
        rates: checkinByType.checkin_rates || []
      },
      walletTrend: {
        dates: walletTrend.dates || [],
        adoption: walletTrend.adoption_rates || []
      }
    };

    // Top customers data
    const topCustomers = customerAnalytics.top_customers || [];

    // Generate recommendations based on data
    const recommendations = generateRecommendations(metrics, statistics, customerAnalytics);

    return {
      metrics,
      comparison,
      salesTrend: chartData.salesTrend,
      revenueByType: chartData.revenueByType,
      hourlySales: chartData.hourlySales,
      checkinByType: chartData.checkinByType,
      walletTrend: chartData.walletTrend,
      topCustomers,
      recommendations
    };

  } catch (error) {
    console.error('Error generating comprehensive analytics:', error);
    throw error;
  }
}

/**
 * Generate insights and recommendations based on analytics data
 * @param {Object} metrics - Key metrics
 * @param {Object} statistics - Detailed statistics
 * @param {Object} customerAnalytics - Customer analytics data
 * @returns {Array} Array of recommendations
 */
function generateRecommendations(metrics, statistics, customerAnalytics) {
  const recommendations = [];

  // Conversion rate recommendations
  if (metrics.conversionRate < 50) {
    recommendations.push({
      type: 'warning',
      title: 'Improve Conversion Rate',
      message: `Current conversion rate is ${metrics.conversionRate.toFixed(1)}%. Consider optimizing checkout flow or payment options.`
    });
  }

  // Wallet adoption recommendations
  if (metrics.walletAdoption < 30) {
    recommendations.push({
      type: 'info',
      title: 'Increase Wallet Adoption',
      message: `Only ${metrics.walletAdoption.toFixed(1)}% of customers use digital wallets. Promote Apple/Google Wallet benefits.`
    });
  }

  // Check-in rate recommendations
  if (metrics.checkinRate < 80) {
    recommendations.push({
      type: 'warning',
      title: 'Low Check-in Rate',
      message: `Check-in rate is ${metrics.checkinRate.toFixed(1)}%. Send reminder emails or improve check-in process.`
    });
  }

  // Success metrics
  if (metrics.conversionRate > 70) {
    recommendations.push({
      type: 'success',
      title: 'Excellent Conversion Rate',
      message: `Your ${metrics.conversionRate.toFixed(1)}% conversion rate is outstanding! Current process is working well.`
    });
  }

  return recommendations;
}

export default withSecurityHeaders(authService.requireAuth(handler));
