/**
 * Database Performance Monitoring Dashboard API
 * Real-time performance dashboard for A Lo Cubano Boulder Fest
 */

import { getDatabasePerformanceService } from "../../lib/performance/database-performance-service.js";
import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const performanceService = getDatabasePerformanceService();

    // Get comprehensive dashboard data
    const dashboardData = await generateDashboardData(performanceService);

    res.status(200).json({
      dashboard: dashboardData,
      generatedAt: new Date().toISOString(),
      refreshInterval: 30000, // Suggest 30-second refresh
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    res.status(500).json({
      error: "Failed to generate dashboard data",
      timestamp: new Date().toISOString(),
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
    isMonitoring: healthStatus.isMonitoring,
  };

  // Recent alerts analysis
  const recentAlerts = performanceService.performanceAlerts.filter(
    (alert) => alert.timestamp > oneHourAgo,
  );

  const alertAnalysis = {
    total: recentAlerts.length,
    byType: getAlertBreakdown(recentAlerts),
    bySeverity: getSeverityBreakdown(recentAlerts),
    trend: calculateAlertTrend(performanceService.performanceAlerts),
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
          sql: q.sql.substring(0, 80) + "...",
        })),
      },
      categories: Object.entries(categoryBreakdown)
        .map(([name, data]) => ({
          name,
          count: data.count,
          avgTime: Math.round(data.avgTime * 100) / 100,
          totalExecutions: data.executions,
        }))
        .sort((a, b) => b.avgTime - a.avgTime),
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
      performanceService.latestAnalysis?.optimizationOpportunities?.length || 0,
  };

  // System metrics
  const systemMetrics = {
    uptime: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
    platform: process.platform,
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
      optimizationData,
    }),
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
    (alert) => alert.timestamp > oneHourAgo,
  ).length;
  const previousHour = allAlerts.filter(
    (alert) => alert.timestamp > twoHoursAgo && alert.timestamp <= oneHourAgo,
  ).length;

  let trend = "stable";
  if (lastHour > previousHour * 1.5) trend = "increasing";
  else if (lastHour < previousHour * 0.5) trend = "decreasing";

  return {
    direction: trend,
    currentHour: lastHour,
    previousHour,
    changePercent:
      previousHour > 0
        ? Math.round(((lastHour - previousHour) / previousHour) * 100)
        : 0,
  };
}

/**
 * Calculate performance trends
 */
function calculatePerformanceTrends(performanceService) {
  const trends = {
    queryCount: { trend: "stable", value: 0 },
    avgResponseTime: { trend: "stable", value: 0 },
    errorRate: { trend: "stable", value: 0 },
    slowQueryRate: { trend: "stable", value: 0 },
  };

  // This is simplified - in a full implementation, you'd analyze historical data
  if (performanceService.optimizer) {
    const totalQueries = Array.from(
      performanceService.optimizer.queryMetrics.values(),
    ).reduce((sum, metric) => sum + metric.totalExecutions, 0);

    trends.queryCount.value = totalQueries;

    const avgTime =
      Array.from(performanceService.optimizer.queryMetrics.values()).reduce(
        (sum, metric) => sum + metric.avgTime,
        0,
      ) / (performanceService.optimizer.queryMetrics.size || 1);

    trends.avgResponseTime.value = Math.round(avgTime * 100) / 100;

    const slowQueries = Array.from(
      performanceService.optimizer.queryMetrics.values(),
    ).filter((metric) => metric.avgTime > 50).length;

    trends.slowQueryRate.value = Math.round(
      (slowQueries / (performanceService.optimizer.queryMetrics.size || 1)) *
        100,
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
  if (data.performanceMetrics.overallHealth === "CRITICAL") {
    issues.push("Critical performance issues detected");
    overallScore -= 30;
  } else if (data.performanceMetrics.overallHealth === "WARNING") {
    issues.push("Performance warnings present");
    overallScore -= 15;
  }

  // Analyze alerts
  if (data.alertAnalysis.total > 10) {
    issues.push(`High alert volume (${data.alertAnalysis.total} in last hour)`);
    overallScore -= 20;
  } else if (data.alertAnalysis.total === 0) {
    achievements.push("No performance alerts in last hour");
  }

  // Analyze slow queries
  if (data.queryPerformance.slowQueries?.count > 5) {
    issues.push(
      `${data.queryPerformance.slowQueries.count} slow queries identified`,
    );
    overallScore -= 15;
  }

  // Analyze optimization opportunities
  if (data.optimization.activeRecommendations > 0) {
    issues.push(
      `${data.optimization.activeRecommendations} optimization recommendations available`,
    );
    overallScore -= 10;
  } else {
    achievements.push("All optimization recommendations addressed");
  }

  // Memory usage
  if (data.performanceMetrics.memoryUsage > 100) {
    issues.push("High memory usage detected");
    overallScore -= 10;
  }

  return {
    overallScore: Math.max(overallScore, 0),
    status:
      overallScore >= 90
        ? "EXCELLENT"
        : overallScore >= 75
          ? "GOOD"
          : overallScore >= 60
            ? "WARNING"
            : "CRITICAL",
    issues: issues.slice(0, 5), // Top 5 issues
    achievements: achievements.slice(0, 3), // Top 3 achievements
    recommendation: generateTopRecommendation(issues, data),
  };
}

/**
 * Generate top recommendation
 */
function generateTopRecommendation(issues, data) {
  if (issues.length === 0) {
    return "System performance is optimal. Continue monitoring.";
  }

  // Prioritize recommendations
  if (data.performanceMetrics.overallHealth === "CRITICAL") {
    return "URGENT: Address critical performance issues immediately";
  }

  if (data.optimization.indexRecommendations > 0) {
    return `Apply ${data.optimization.indexRecommendations} index recommendations to improve query performance`;
  }

  if (data.queryPerformance.slowQueries?.count > 0) {
    return `Optimize ${data.queryPerformance.slowQueries.count} slow queries identified`;
  }

  if (data.alertAnalysis.total > 5) {
    return "Review and address recent performance alerts";
  }

  return "Review performance metrics and apply available optimizations";
}

export default withSecurityHeaders(authService.requireAuth(handler));
