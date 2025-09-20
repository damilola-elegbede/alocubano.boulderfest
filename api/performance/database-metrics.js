/**
 * Database Performance Metrics API
 * Provides access to query optimization metrics and reports
 * for A Lo Cubano Boulder Fest application
 */

import { getDatabasePerformanceService } from "../../lib/performance/database-performance-service.js";
import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";
import { getRateLimitService } from "../../lib/rate-limit-service.js";

async function handler(req, res) {
  // Only GET requests allowed
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Apply rate limiting
  const rateLimitResult = await getRateLimitService().checkLimit(
    req,
    'database-metrics',
    {
      maxAttempts: 50,
      windowMs: 60000 // 50 requests per minute
    }
  );

  if (!rateLimitResult.allowed) {
    res.setHeader('Retry-After', rateLimitResult.retryAfter);
    res.setHeader('X-RateLimit-Limit', '50');
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: rateLimitResult.retryAfter
    });
  }

  const { type = 'summary', format = 'json' } = req.query;

  try {
    const performanceService = getDatabasePerformanceService();

    let data;
    let contentType = 'application/json';

    switch (type) {
    case 'summary':
      data = performanceService.generateQuickReport();
      break;

    case 'detailed':
      data = performanceService.getDetailedReport();
      break;

    case 'health':
      data = performanceService.getServiceHealth();
      break;

    case 'alerts':
      data = {
        alerts: performanceService.performanceAlerts.slice(-100), // Last 100 alerts
        totalAlerts: performanceService.performanceAlerts.length,
        alertsByType: performanceService.getAlertsByType(),
        timestamp: new Date().toISOString()
      };
      break;

    case 'recommendations':
      data = {
        recommendations: performanceService.getQuickRecommendations(),
        indexRecommendations:
            performanceService.latestAnalysis?.indexRecommendations || [],
        optimizationOpportunities:
            performanceService.latestAnalysis?.optimizationOpportunities?.slice(
              0,
              10
            ) || [],
        timestamp: new Date().toISOString()
      };
      break;

    case 'slow-queries':
      if (performanceService.optimizer) {
        data = {
          slowQueries: performanceService.optimizer.getTopSlowQueries(20),
          slowQueryLog: performanceService.optimizer.slowQueryLog.slice(-50), // Last 50
          thresholds: {
            slowQuery: 50,
            criticalQuery: 100
          },
          timestamp: new Date().toISOString()
        };
      } else {
        data = { error: 'Query optimizer not available' };
      }
      break;

    case 'categories':
      if (performanceService.optimizer) {
        data = {
          categoryBreakdown:
              performanceService.optimizer.getQueryCategoryBreakdown(),
          totalCategories: Object.keys(
            performanceService.optimizer.getQueryCategoryBreakdown()
          ).length,
          timestamp: new Date().toISOString()
        };
      } else {
        data = { error: 'Query optimizer not available' };
      }
      break;

    case 'export':
      if (performanceService.optimizer) {
        data = performanceService.optimizer.exportMetrics();

        // If CSV format requested
        if (format === 'csv') {
          const csv = convertMetricsToCSV(data);
          contentType = 'text/csv';
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="db-metrics-${Date.now()}.csv"`
          );
          res.setHeader('Content-Type', contentType);
          return res.status(200).send(csv);
        }
      } else {
        data = { error: 'Query optimizer not available' };
      }
      break;

    case 'optimize':
      // Trigger manual optimization
      try {
        data = await performanceService.optimizeNow();
      } catch (error) {
        return res.status(500).json({
          error: 'Optimization failed',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
      break;

    case 'status':
      data = {
        isInitialized: performanceService.isInitialized,
        isMonitoring: performanceService.optimizer?.isMonitoring || false,
        version: '1.0.0',
        databaseType: performanceService.optimizer?.dbType || 'unknown',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      };
      break;

    default:
      return res.status(400).json({
        error: 'Invalid type parameter',
        allowedTypes: [
          'summary',
          'detailed',
          'health',
          'alerts',
          'recommendations',
          'slow-queries',
          'categories',
          'export',
          'optimize',
          'status'
        ],
        timestamp: new Date().toISOString()
      });
    }

    // Add metadata to response
    const response = {
      type,
      timestamp: new Date().toISOString(),
      data
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Database metrics API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Performance metrics unavailable',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Convert metrics object to CSV format
 */
function convertMetricsToCSV(metrics) {
  const headers = ['Metric', 'Value', 'Timestamp'];
  const rows = [headers];

  const timestamp = new Date().toISOString();

  for (const [key, value] of Object.entries(metrics)) {
    let csvValue;
    if (typeof value === 'object' && value !== null) {
      csvValue = Array.isArray(value)
        ? `"${value.join(';')}"`
        : `"${JSON.stringify(value).replace(/"/g, '""')}"`;
    } else {
      csvValue = value?.toString() || '';
    }
    rows.push([key, csvValue, timestamp]);
  }

  return rows.map((row) => row.join(',')).join('\n');
}

// Apply security headers and authentication
export default withSecurityHeaders(authService.requireAuth(handler));
