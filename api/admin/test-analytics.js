import authService from "../../lib/auth-service.js";
import analyticsService from "../../lib/analytics-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import { isTestMode } from "../../lib/test-mode-utils.js";

/**
 * Test Analytics API
 *
 * Provides test mode-aware analytics endpoints:
 * - GET: Test data analytics and production vs test comparisons
 * - Supports toggling between test and production data views
 * - Includes comprehensive test data quality metrics
 */

async function handler(req, res) {
  try {
    // Set cache headers to prevent caching of analytics data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({
        error: 'Method Not Allowed',
        allowed: ['GET']
      });
    }

    // Parse query parameters
    const {
      eventId = "boulder-fest-2026",
      includeTestData = null,
      analyticsType = "overview",
      days = 30
    } = req.query;

    // Convert query parameters
    const includeTest = includeTestData === 'true' ? true :
                       includeTestData === 'false' ? false :
                       null; // null means auto-detect

    const daysNum = parseInt(days) || 30;

    let response;

    switch (analyticsType) {
      case 'overview':
        response = await handleOverviewAnalytics(eventId, includeTest, req);
        break;
      case 'test_only':
        response = await handleTestOnlyAnalytics(eventId, req);
        break;
      case 'comparison':
        response = await handleComparisonAnalytics(eventId, req);
        break;
      case 'executive':
        response = await handleExecutiveAnalytics(eventId, includeTest, req);
        break;
      case 'trends':
        response = await handleTrendAnalytics(eventId, includeTest, daysNum, req);
        break;
      default:
        return res.status(400).json({
          error: 'Invalid analytics type',
          validTypes: ['overview', 'test_only', 'comparison', 'executive', 'trends']
        });
    }

    return res.status(200).json({
      ...response,
      metadata: {
        eventId,
        includeTestData: includeTest,
        analyticsType,
        requestTestMode: isTestMode(req),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Test analytics API error:', error);

    // Specific error handling
    if (error.code === 'SQLITE_BUSY') {
      return res.status(503).json({ error: 'Database temporarily unavailable' });
    }

    if (error.name === 'TimeoutError') {
      return res.status(408).json({ error: 'Request timeout' });
    }

    return res.status(500).json({
      error: 'Failed to generate analytics',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Handle overview analytics with test mode awareness
 */
async function handleOverviewAnalytics(eventId, includeTestData, req) {
  const [eventStats, testAnalytics, comparison] = await Promise.all([
    analyticsService.getEventStatistics(eventId, includeTestData, req),
    analyticsService.getTestDataAnalytics(eventId, req),
    analyticsService.getProductionVsTestComparison(eventId, req)
  ]);

  return {
    type: 'overview',
    event_statistics: eventStats,
    test_analytics: testAnalytics,
    production_vs_test: comparison,
    insights: {
      data_quality_score: calculateDataQualityScore(testAnalytics, comparison),
      cleanup_recommendations: generateCleanupRecommendations(testAnalytics),
      test_data_health: assessTestDataHealth(testAnalytics)
    }
  };
}

/**
 * Handle test-only analytics
 */
async function handleTestOnlyAnalytics(eventId, req) {
  const [testAnalytics, testTrends, testCustomers] = await Promise.all([
    analyticsService.getTestDataAnalytics(eventId, req),
    analyticsService.getSalesTrend(30, eventId, true, req), // Force include test data
    analyticsService.getCustomerAnalytics(eventId, true, req) // Force include test data
  ]);

  return {
    type: 'test_only',
    test_analytics: testAnalytics,
    test_trends: testTrends,
    test_customers: testCustomers,
    summary: {
      total_test_records: testAnalytics.overview.total_test_tickets,
      avg_age_days: testAnalytics.overview.avg_age_days,
      cleanup_priority: testAnalytics.cleanup_candidates.length > 0 ?
        testAnalytics.cleanup_candidates[0].cleanup_priority : 'none',
      health_status: assessTestDataHealth(testAnalytics)
    }
  };
}

/**
 * Handle comparison analytics
 */
async function handleComparisonAnalytics(eventId, req) {
  const [comparison, productionStats, testStats] = await Promise.all([
    analyticsService.getProductionVsTestComparison(eventId, req),
    analyticsService.getEventStatistics(eventId, false, req), // Production only
    analyticsService.getEventStatistics(eventId, true, req)   // Include test data
  ]);

  // Calculate detailed comparison metrics
  const comparisonMetrics = {
    ticket_volume_ratio: comparison.test.ticket_count / Math.max(comparison.production.ticket_count, 1),
    revenue_ratio: comparison.test.revenue / Math.max(comparison.production.revenue, 1),
    avg_price_difference: Math.abs(comparison.test.avg_ticket_price - comparison.production.avg_ticket_price),
    checkin_rate_comparison: {
      production: comparison.production.checked_in_count / Math.max(comparison.production.ticket_count, 1),
      test: comparison.test.checked_in_count / Math.max(comparison.test.ticket_count, 1)
    }
  };

  return {
    type: 'comparison',
    comparison: comparison,
    production_stats: productionStats,
    combined_stats: testStats,
    metrics: comparisonMetrics,
    analysis: {
      test_contamination_level: calculateContaminationLevel(comparison),
      data_separation_quality: assessDataSeparation(comparisonMetrics),
      impact_assessment: assessTestDataImpact(comparison, comparisonMetrics)
    }
  };
}

/**
 * Handle executive analytics with test mode context
 */
async function handleExecutiveAnalytics(eventId, includeTestData, req) {
  const executiveSummary = await analyticsService.generateTestAwareExecutiveSummary(
    eventId,
    includeTestData,
    req
  );

  return {
    type: 'executive',
    executive_summary: executiveSummary,
    key_insights: {
      data_mode: includeTestData ? 'combined' : 'production_only',
      test_data_impact: executiveSummary.test_data,
      cleanup_urgency: assessCleanupUrgency(executiveSummary.test_data.analytics),
      data_quality_alerts: generateDataQualityAlerts(executiveSummary.test_data)
    }
  };
}

/**
 * Handle trend analytics with test mode awareness
 */
async function handleTrendAnalytics(eventId, includeTestData, days, req) {
  const [salesTrend, testTrend, productionTrend] = await Promise.all([
    analyticsService.getSalesTrend(days, eventId, includeTestData, req),
    analyticsService.getSalesTrend(days, eventId, true, req),  // Test data only
    analyticsService.getSalesTrend(days, eventId, false, req)  // Production only
  ]);

  return {
    type: 'trends',
    combined_trend: salesTrend,
    test_trend: testTrend,
    production_trend: productionTrend,
    trend_analysis: {
      test_vs_production_velocity: calculateTrendVelocity(testTrend, productionTrend),
      seasonality_patterns: analyzeTrendSeasonality(salesTrend),
      data_quality_trends: assessTrendDataQuality(testTrend, productionTrend)
    }
  };
}

/**
 * Calculate data quality score based on test analytics
 */
function calculateDataQualityScore(testAnalytics, comparison) {
  let score = 100;

  // Deduct points for high test data percentage
  const testPercentage = parseFloat(comparison.comparison.test_percentage);
  if (testPercentage > 20) score -= 30;
  else if (testPercentage > 10) score -= 15;
  else if (testPercentage > 5) score -= 5;

  // Deduct points for old test data
  if (testAnalytics.overview.avg_age_days > 60) score -= 25;
  else if (testAnalytics.overview.avg_age_days > 30) score -= 15;
  else if (testAnalytics.overview.avg_age_days > 14) score -= 5;

  // Deduct points for cleanup candidates
  const immediateCleanup = testAnalytics.cleanup_candidates
    .find(c => c.cleanup_priority === 'immediate')?.candidate_count || 0;
  if (immediateCleanup > 0) score -= 20;

  const priorityCleanup = testAnalytics.cleanup_candidates
    .find(c => c.cleanup_priority === 'priority')?.candidate_count || 0;
  if (priorityCleanup > 0) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate cleanup recommendations based on test analytics
 */
function generateCleanupRecommendations(testAnalytics) {
  const recommendations = [];

  // Check for immediate cleanup needs
  const immediateCount = testAnalytics.cleanup_candidates
    .find(c => c.cleanup_priority === 'immediate')?.candidate_count || 0;

  if (immediateCount > 0) {
    recommendations.push({
      priority: 'high',
      type: 'immediate_cleanup',
      message: `${immediateCount} failed test transactions should be cleaned up immediately`,
      action: 'Delete failed/cancelled test transactions older than 7 days'
    });
  }

  // Check for old test data
  if (testAnalytics.overview.avg_age_days > 30) {
    recommendations.push({
      priority: 'medium',
      type: 'scheduled_cleanup',
      message: `Test data is aging (avg ${testAnalytics.overview.avg_age_days.toFixed(1)} days)`,
      action: 'Schedule regular cleanup of test data older than 30 days'
    });
  }

  // Check for high volume of test data
  if (testAnalytics.overview.total_test_tickets > 500) {
    recommendations.push({
      priority: 'medium',
      type: 'volume_cleanup',
      message: `High volume of test data (${testAnalytics.overview.total_test_tickets} records)`,
      action: 'Consider more aggressive cleanup policies'
    });
  }

  return recommendations;
}

/**
 * Assess test data health
 */
function assessTestDataHealth(testAnalytics) {
  const immediateCleanup = testAnalytics.cleanup_candidates
    .find(c => c.cleanup_priority === 'immediate')?.candidate_count || 0;

  const totalTestRecords = testAnalytics.overview.total_test_tickets || 0;
  const avgAge = testAnalytics.overview.avg_age_days || 0;

  if (immediateCleanup > 50 || avgAge > 60) return 'poor';
  if (immediateCleanup > 10 || avgAge > 30 || totalTestRecords > 1000) return 'fair';
  if (totalTestRecords > 100 || avgAge > 14) return 'good';
  return 'excellent';
}

/**
 * Calculate contamination level
 */
function calculateContaminationLevel(comparison) {
  const testPercentage = parseFloat(comparison.comparison.test_percentage);

  if (testPercentage > 25) return 'high';
  if (testPercentage > 10) return 'medium';
  if (testPercentage > 2) return 'low';
  return 'minimal';
}

/**
 * Assess data separation quality
 */
function assessDataSeparation(metrics) {
  // Good separation means test and production data have different patterns
  const priceVariance = metrics.avg_price_difference;
  const volumeRatio = metrics.ticket_volume_ratio;

  if (priceVariance < 5 && volumeRatio > 0.5) return 'poor'; // Too similar
  if (priceVariance < 20 && volumeRatio > 0.2) return 'fair';
  return 'good';
}

/**
 * Assess test data impact on production metrics
 */
function assessTestDataImpact(comparison, metrics) {
  const testPercentage = parseFloat(comparison.comparison.test_percentage);

  return {
    revenue_impact: `${comparison.comparison.test_revenue_percentage}% of total revenue`,
    volume_impact: `${testPercentage}% of total tickets`,
    price_distortion: metrics.avg_price_difference > 10 ? 'significant' : 'minimal',
    recommendation: testPercentage > 5 ?
      'Enable test data filtering in production analytics' :
      'Current test data levels acceptable'
  };
}

/**
 * Assess cleanup urgency
 */
function assessCleanupUrgency(testAnalytics) {
  const immediateCount = testAnalytics.cleanup_candidates
    .find(c => c.cleanup_priority === 'immediate')?.candidate_count || 0;

  if (immediateCount > 100) return 'critical';
  if (immediateCount > 10) return 'high';
  if (testAnalytics.overview.avg_age_days > 45) return 'medium';
  return 'low';
}

/**
 * Generate data quality alerts
 */
function generateDataQualityAlerts(testData) {
  const alerts = [];

  if (testData.comparison.comparison.test_percentage > 15) {
    alerts.push({
      type: 'warning',
      message: 'High test data contamination detected',
      impact: 'Analytics accuracy may be compromised'
    });
  }

  if (testData.analytics.overview.avg_age_days > 45) {
    alerts.push({
      type: 'info',
      message: 'Test data is aging significantly',
      impact: 'Consider scheduling cleanup to maintain database performance'
    });
  }

  return alerts;
}

/**
 * Calculate trend velocity comparison
 */
function calculateTrendVelocity(testTrend, productionTrend) {
  const testVelocity = testTrend.reduce((sum, day) => sum + day.tickets_sold, 0) / Math.max(testTrend.length, 1);
  const productionVelocity = productionTrend.reduce((sum, day) => sum + day.tickets_sold, 0) / Math.max(productionTrend.length, 1);

  return {
    test_daily_average: testVelocity,
    production_daily_average: productionVelocity,
    ratio: testVelocity / Math.max(productionVelocity, 1)
  };
}

/**
 * Analyze trend seasonality patterns
 */
function analyzeTrendSeasonality(trend) {
  if (trend.length < 7) return { pattern: 'insufficient_data' };

  const weekdayAvg = trend.slice(0, 5).reduce((sum, day) => sum + day.tickets_sold, 0) / 5;
  const weekendAvg = trend.slice(5, 7).reduce((sum, day) => sum + day.tickets_sold, 0) / 2;

  return {
    pattern: weekendAvg > weekdayAvg * 1.5 ? 'weekend_heavy' :
            weekdayAvg > weekendAvg * 1.5 ? 'weekday_heavy' : 'balanced',
    weekday_average: weekdayAvg,
    weekend_average: weekendAvg
  };
}

/**
 * Assess trend data quality
 */
function assessTrendDataQuality(testTrend, productionTrend) {
  const testHasData = testTrend.some(day => day.tickets_sold > 0);
  const productionHasData = productionTrend.some(day => day.tickets_sold > 0);

  return {
    test_data_availability: testHasData ? 'good' : 'none',
    production_data_availability: productionHasData ? 'good' : 'none',
    separation_quality: testHasData && productionHasData ? 'properly_separated' : 'mixed_or_incomplete'
  };
}

// Build middleware chain with proper authentication and audit logging
const securedHandler = withSecurityHeaders(
  withAdminAudit(
    authService.requireAuth(handler),
    {
      logBody: false, // Analytics requests don't need body logging
      logMetadata: true,
      skipMethods: [], // Log all methods
      sensitiveFields: ['customer_email', 'attendee_email'] // Redact sensitive data in logs
    }
  )
);

// Export the secured handler with error handling
export default async function safeHandler(req, res) {
  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in test analytics endpoint:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Analytics generation failed',
        timestamp: new Date().toISOString()
      });
    }
  }
}