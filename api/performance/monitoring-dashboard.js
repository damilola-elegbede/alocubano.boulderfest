/**
 * Unified Performance Monitoring Dashboard API
 * Consolidates all performance reporting and dashboard functionality
 *
 * Handles:
 * - Database performance metrics reporting (from /api/performance/database-metrics.js)
 * - Real-time performance dashboard data
 * - Performance analytics and insights
 * - Query optimization recommendations
 *
 * GET /api/performance/monitoring-dashboard?type=TYPE
 * - type=summary: Quick performance summary (default)
 * - type=detailed: Comprehensive performance report
 * - type=health: Service health status
 * - type=alerts: Recent performance alerts
 * - type=recommendations: Optimization recommendations
 * - type=slow-queries: Slow query analysis
 * - type=categories: Query category breakdown
 * - type=export: Exportable metrics data (JSON or CSV)
 * - type=optimize: Trigger manual optimization
 * - type=status: System status
 */

import { getDatabasePerformanceService } from "../../lib/performance/database-performance-service.js";
import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";
import { getRateLimitService } from "../../lib/rate-limit-service.js";

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Apply rate limiting
  const rateLimitResult = await getRateLimitService().checkLimit(
    req,
    'performance-dashboard',
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
            `attachment; filename="performance-metrics-${Date.now()}.csv"`
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

    case 'dashboard':
      // Comprehensive dashboard data
      data = await generateDashboardData(performanceService);
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
          'status',
          'dashboard'
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
    console.error('Performance dashboard API error:', error);
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
 * Generate comprehensive dashboard data
 */
async function generateDashboardData(performanceService) {
  const now = new Date();
  const oneHourAgo = new Date(now - 3600000);
  const oneDayAgo = new Date(now - 86400000);

  // Get basic health status
  const healthStatus = performanceService.getServiceHealth();
  const quickReport = performanceService.generateQuickReport();

  // Performance metrics summary
  const performanceMetrics = {
    status: healthStatus.status,
    overallHealth: quickReport.status,
    memoryUsage: healthStatus.memoryUsage,
    alertCount: healthStatus.alertCount,
    isMonitoring: healthStatus.isMonitoring
  };

  // Recent alerts analysis
  const recentAlerts = performanceService.performanceAlerts.filter(
    (alert) => alert.timestamp > oneHourAgo
  );

  const alertAnalysis = {
    total: recentAlerts.length,
    byType: getAlertBreakdown(recentAlerts),
    bySeverity: getSeverityBreakdown(recentAlerts),
    trend: calculateAlertTrend(performanceService.performanceAlerts)
  };

  // Query performance data
  let queryPerformance = {};
  if (performanceService.optimizer) {
    const topSlowQueries = performanceService.optimizer.getTopSlowQueries(10);
    const categoryBreakdown =
      performanceService.optimizer.getQueryCategoryBreakdown();

    queryPerformance = {
      slowQueries: {
        count: topSlowQueries.length,
        queries: topSlowQueries.map((q) => ({
          category: q.category,
          avgTime: parseFloat(q.avgTime),
          maxTime: parseFloat(q.maxTime),
          executions: q.executions,
          sql: q.sql.substring(0, 80) + '...'
        }))
      },
      categories: Object.entries(categoryBreakdown)
        .map(([name, data]) => ({
          name,
          count: data.count,
          avgTime: Math.round(data.avgTime * 100) / 100,
          totalExecutions: data.executions
        }))
        .sort((a, b) => b.avgTime - a.avgTime)
    };
  }

  // Optimization recommendations
  const recommendations = performanceService.getQuickRecommendations();
  const optimizationData = {
    activeRecommendations: recommendations.length,
    recommendations: recommendations.slice(0, 5), // Top 5
    indexRecommendations:
      performanceService.latestAnalysis?.indexRecommendations?.length || 0,
    optimizationOpportunities:
      performanceService.latestAnalysis?.optimizationOpportunities?.length || 0
  };

  // System metrics
  const systemMetrics = {
    uptime: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
    platform: process.platform
  };

  // Historical trends (simplified)
  const trends = calculatePerformanceTrends(performanceService);

  return {
    performance: performanceMetrics,
    alerts: alertAnalysis,
    queries: queryPerformance,
    optimization: optimizationData,
    system: systemMetrics,
    trends,
    summary: generateExecutiveSummary({
      performanceMetrics,
      alertAnalysis,
      queryPerformance,
      optimizationData
    })
  };
}

/**
 * Get alert breakdown by type
 */
function getAlertBreakdown(alerts) {
  const breakdown = {};
  for (const alert of alerts) {
    breakdown[alert.type] = (breakdown[alert.type] || 0) + 1;
  }
  return breakdown;
}

/**
 * Get alert breakdown by severity
 */
function getSeverityBreakdown(alerts) {
  const breakdown = {};
  for (const alert of alerts) {
    breakdown[alert.severity] = (breakdown[alert.severity] || 0) + 1;
  }
  return breakdown;
}

/**
 * Calculate alert trend
 */
function calculateAlertTrend(allAlerts) {
  const now = new Date();
  const oneHourAgo = new Date(now - 3600000);
  const twoHoursAgo = new Date(now - 7200000);

  const lastHour = allAlerts.filter(
    (alert) => alert.timestamp > oneHourAgo
  ).length;
  const previousHour = allAlerts.filter(
    (alert) => alert.timestamp > twoHoursAgo && alert.timestamp <= oneHourAgo
  ).length;

  let trend = 'stable';
  if (lastHour > previousHour * 1.5) {
    trend = 'increasing';
  } else if (lastHour < previousHour * 0.5) {
    trend = 'decreasing';
  }

  return {
    direction: trend,
    currentHour: lastHour,
    previousHour,
    changePercent:
      previousHour > 0
        ? Math.round(((lastHour - previousHour) / previousHour) * 100)
        : 0
  };
}

/**
 * Calculate performance trends
 */
function calculatePerformanceTrends(performanceService) {
  const trends = {
    queryCount: { trend: 'stable', value: 0 },
    avgResponseTime: { trend: 'stable', value: 0 },
    errorRate: { trend: 'stable', value: 0 },
    slowQueryRate: { trend: 'stable', value: 0 }
  };

  // This is simplified - in a full implementation, you'd analyze historical data
  if (performanceService.optimizer) {
    const totalQueries = Array.from(
      performanceService.optimizer.queryMetrics.values()
    ).reduce((sum, metric) => sum + metric.totalExecutions, 0);

    trends.queryCount.value = totalQueries;

    const avgTime =
      Array.from(performanceService.optimizer.queryMetrics.values()).reduce(
        (sum, metric) => sum + metric.avgTime,
        0
      ) / (performanceService.optimizer.queryMetrics.size || 1);

    trends.avgResponseTime.value = Math.round(avgTime * 100) / 100;

    const slowQueries = Array.from(
      performanceService.optimizer.queryMetrics.values()
    ).filter((metric) => metric.avgTime > 50).length;

    trends.slowQueryRate.value = Math.round(
      (slowQueries / (performanceService.optimizer.queryMetrics.size || 1)) *
        100
    );
  }

  return trends;
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(data) {
  const issues = [];
  const achievements = [];
  let overallScore = 100;

  // Analyze performance
  if (data.performanceMetrics.overallHealth === 'CRITICAL') {
    issues.push('Critical performance issues detected');
    overallScore -= 30;
  } else if (data.performanceMetrics.overallHealth === 'WARNING') {
    issues.push('Performance warnings present');
    overallScore -= 15;
  }

  // Analyze alerts
  if (data.alertAnalysis.total > 10) {
    issues.push(`High alert volume (${data.alertAnalysis.total} in last hour)`);
    overallScore -= 20;
  } else if (data.alertAnalysis.total === 0) {
    achievements.push('No performance alerts in last hour');
  }

  // Analyze slow queries
  if (data.queryPerformance.slowQueries?.count > 5) {
    issues.push(
      `${data.queryPerformance.slowQueries.count} slow queries identified`
    );
    overallScore -= 15;
  }

  // Analyze optimization opportunities
  if (data.optimization.activeRecommendations > 0) {
    issues.push(
      `${data.optimization.activeRecommendations} optimization recommendations available`
    );
    overallScore -= 10;
  } else {
    achievements.push('All optimization recommendations addressed');
  }

  // Memory usage
  if (data.performanceMetrics.memoryUsage > 100) {
    issues.push('High memory usage detected');
    overallScore -= 10;
  }

  return {
    overallScore: Math.max(overallScore, 0),
    status:
      overallScore >= 90
        ? 'EXCELLENT'
        : overallScore >= 75
          ? 'GOOD'
          : overallScore >= 60
            ? 'WARNING'
            : 'CRITICAL',
    issues: issues.slice(0, 5), // Top 5 issues
    achievements: achievements.slice(0, 3), // Top 3 achievements
    recommendation: generateTopRecommendation(issues, data)
  };
}

/**
 * Generate top recommendation
 */
function generateTopRecommendation(issues, data) {
  if (issues.length === 0) {
    return 'System performance is optimal. Continue monitoring.';
  }

  // Prioritize recommendations
  if (data.performanceMetrics.overallHealth === 'CRITICAL') {
    return 'URGENT: Address critical performance issues immediately';
  }

  if (data.optimization.indexRecommendations > 0) {
    return `Apply ${data.optimization.indexRecommendations} index recommendations to improve query performance`;
  }

  if (data.queryPerformance.slowQueries?.count > 0) {
    return `Optimize ${data.queryPerformance.slowQueries.count} slow queries identified`;
  }

  if (data.alertAnalysis.total > 5) {
    return 'Review and address recent performance alerts';
  }

  return 'Review performance metrics and apply available optimizations';
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