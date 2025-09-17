/**
 * Database Health Check API Endpoint
 *
 * Provides comprehensive health monitoring for the enterprise database
 * connection management system including:
 * - Real-time component status
 * - Performance metrics summary
 * - Active connection details
 * - Circuit breaker status
 * - Resource utilization metrics
 * - Historical trend analysis
 */

import { performSystemHealthCheck, getHealthMonitor } from '../../lib/connection-health-monitor.js';
import { getPoolStatistics, getPoolHealthStatus } from '../../lib/connection-manager.js';
import { logger } from '../../lib/logger.js';
import authService from '../../lib/auth-service.js';
import { withSecurityHeaders } from '../../lib/security-headers-serverless.js';

async function handler(req, res) {
  const startTime = Date.now();

  try {
    // Only allow GET requests for health checks
    if (req.method !== 'GET') {
      return res.status(405).json({
        error: 'Method not allowed',
        allowedMethods: ['GET']
      });
    }

    // Verify admin authentication for sensitive database metrics
    const authResult = await authService.validateSession(req);
    if (!authResult.isValid) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Database monitoring requires admin access'
      });
    }

    // Parse query parameters for detailed reporting
    const {
      includeHistory = 'false',
      includeAlerts = 'true',
      includePerformance = 'true',
      includeRecommendations = 'true',
      timeRange = '3600000' // 1 hour default
    } = req.query;

    const includeHistoricalData = includeHistory === 'true';
    const includeAlertData = includeAlerts === 'true';
    const includePerformanceData = includePerformance === 'true';
    const includeRecommendationData = includeRecommendations === 'true';
    const timeRangeMs = parseInt(timeRange, 10);

    // Perform comprehensive health check
    const healthCheck = await performSystemHealthCheck();
    const healthMonitor = getHealthMonitor();

    // Gather additional component data
    const [poolStatistics, poolHealth, monitoringStats] = await Promise.all([
      getPoolStatistics(),
      getPoolHealthStatus(),
      Promise.resolve(healthMonitor.getMonitoringStats())
    ]);

    // Build comprehensive response
    const response = {
      status: 'success',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,

      // Core health information
      health: {
        status: healthCheck.status,
        summary: healthCheck.summary,
        lastCheck: healthCheck.timestamp,
        uptime: monitoringStats.uptimeSeconds
      },

      // Component health details
      components: {
        connectionPool: {
          status: healthCheck.components.connectionPool?.status || 'unknown',
          metrics: {
            utilization: healthCheck.components.connectionPool?.metrics?.utilization || 0,
            totalConnections: healthCheck.components.connectionPool?.metrics?.totalConnections || 0,
            activeLeases: healthCheck.components.connectionPool?.metrics?.activeLeases || 0,
            availableConnections: healthCheck.components.connectionPool?.metrics?.availableConnections || 0,
            errorRate: healthCheck.components.connectionPool?.metrics?.errorRate || 0,
            leaseEfficiency: healthCheck.components.connectionPool?.metrics?.leaseEfficiency || 100
          },
          details: includePerformanceData ? poolStatistics : null
        },

        circuitBreaker: {
          status: healthCheck.components.circuitBreaker?.status || 'unknown',
          metrics: healthCheck.components.circuitBreaker?.metrics || {},
          state: healthCheck.components.circuitBreaker?.metrics?.state || 'UNKNOWN'
        },

        stateMachine: {
          status: healthCheck.components.stateMachine?.status || 'unknown',
          metrics: healthCheck.components.stateMachine?.metrics || {},
          healthRatio: healthCheck.components.stateMachine?.metrics?.healthRatio || 0
        }
      },

      // Performance metrics
      performance: includePerformanceData ? {
        connectionAcquisition: healthCheck.performanceMetrics?.connectionAcquisition || {},
        queryExecution: healthCheck.performanceMetrics?.queryExecution || {},
        resourceUtilization: healthCheck.performanceMetrics?.resourceUtilization || {},
        benchmarks: {
          connectionAcquisitionTarget: '<100ms',
          queryExecutionTarget: '<1000ms',
          poolUtilizationTarget: '<80%',
          errorRateTarget: '<1%'
        }
      } : null,

      // Current alerts
      alerts: includeAlertData ? {
        active: healthMonitor.getCurrentAlerts(),
        total: healthCheck.alerts?.length || 0,
        critical: healthCheck.alerts?.filter(a => a.type === 'critical').length || 0,
        warnings: healthCheck.alerts?.filter(a => a.type === 'warning').length || 0
      } : null,

      // Operational recommendations
      recommendations: includeRecommendationData ?
        healthCheck.summary?.recommendations || [] : null,

      // Historical data (if requested)
      historical: includeHistoricalData ? {
        metrics: healthMonitor.getHistoricalMetrics(
          Date.now() - timeRangeMs,
          Date.now()
        ),
        alerts: healthMonitor.getAlertHistory(50),
        trends: calculateTrends(healthMonitor, timeRangeMs)
      } : null,

      // System monitoring information
      monitoring: {
        enabled: true,
        samplingInterval: 30000, // 30 seconds
        lastHealthCheck: healthCheck.timestamp,
        totalHealthChecks: monitoringStats.totalHealthChecks,
        healthCheckFailures: monitoringStats.healthCheckFailures,
        alertsGenerated: monitoringStats.alertsGenerated,
        components: monitoringStats.componentsMonitored
      }
    };

    // Set appropriate cache headers for real-time data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Health-Status', healthCheck.status);
    res.setHeader('X-Response-Time', `${Date.now() - startTime}ms`);

    // Return appropriate HTTP status based on health
    const httpStatus = getHttpStatusFromHealth(healthCheck.status);
    res.status(httpStatus).json(response);

    // Log health check for monitoring
    logger.debug('Database health check completed', {
      status: healthCheck.status,
      responseTime: Date.now() - startTime,
      components: Object.keys(healthCheck.components),
      alertCount: healthCheck.alerts?.length || 0
    });

  } catch (error) {
    logger.error('Database health check API error:', {
      error: error.message,
      stack: error.stack,
      responseTime: Date.now() - startTime
    });

    res.status(500).json({
      status: 'error',
      error: 'Health check failed',
      message: error.message,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      health: {
        status: 'unavailable',
        summary: {
          overallHealth: 'unavailable',
          criticalIssues: 1,
          warnings: 0,
          healthyComponents: 0,
          totalComponents: 0
        }
      }
    });
  }
}

/**
 * Calculate trends from historical data
 */
function calculateTrends(healthMonitor, timeRangeMs) {
  try {
    const startTime = Date.now() - timeRangeMs;
    const metrics = healthMonitor.getHistoricalMetrics(startTime, Date.now());

    if (metrics.length < 2) {
      return {
        available: false,
        reason: 'Insufficient historical data'
      };
    }

    // Calculate utilization trend
    const utilizationValues = metrics
      .map(m => m.components?.connectionPool?.metrics?.utilization)
      .filter(v => v !== undefined);

    const errorRateValues = metrics
      .map(m => m.components?.connectionPool?.metrics?.errorRate)
      .filter(v => v !== undefined);

    const alertCounts = metrics.map(m => m.alertCount || 0);

    return {
      available: true,
      timeRange: timeRangeMs,
      sampleCount: metrics.length,
      utilization: {
        current: utilizationValues[utilizationValues.length - 1] || 0,
        average: utilizationValues.reduce((sum, val) => sum + val, 0) / utilizationValues.length || 0,
        max: Math.max(...utilizationValues) || 0,
        min: Math.min(...utilizationValues) || 0,
        trend: calculateTrendDirection(utilizationValues)
      },
      errorRate: {
        current: errorRateValues[errorRateValues.length - 1] || 0,
        average: errorRateValues.reduce((sum, val) => sum + val, 0) / errorRateValues.length || 0,
        max: Math.max(...errorRateValues) || 0,
        trend: calculateTrendDirection(errorRateValues)
      },
      alerts: {
        current: alertCounts[alertCounts.length - 1] || 0,
        average: alertCounts.reduce((sum, val) => sum + val, 0) / alertCounts.length || 0,
        max: Math.max(...alertCounts) || 0,
        trend: calculateTrendDirection(alertCounts)
      }
    };
  } catch (error) {
    logger.warn('Failed to calculate trends:', error.message);
    return {
      available: false,
      reason: 'Trend calculation error'
    };
  }
}

/**
 * Calculate trend direction from values array
 */
function calculateTrendDirection(values) {
  if (values.length < 2) return 'stable';

  const recentValues = values.slice(-Math.min(5, values.length)); // Last 5 values
  const firstHalf = recentValues.slice(0, Math.ceil(recentValues.length / 2));
  const secondHalf = recentValues.slice(Math.ceil(recentValues.length / 2));

  const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

  const change = secondAvg - firstAvg;
  const changePercent = Math.abs(change) / Math.max(firstAvg, 0.01) * 100;

  if (changePercent < 5) return 'stable';
  return change > 0 ? 'increasing' : 'decreasing';
}

/**
 * Map health status to HTTP status code
 */
function getHttpStatusFromHealth(healthStatus) {
  switch (healthStatus) {
    case 'healthy':
      return 200;
    case 'warning':
      return 200; // Still operational
    case 'critical':
      return 503; // Service unavailable
    case 'unavailable':
      return 503;
    default:
      return 500;
  }
}

/**
 * Validate query parameters
 */
function validateQueryParams(query) {
  const errors = [];

  if (query.timeRange && isNaN(parseInt(query.timeRange, 10))) {
    errors.push('timeRange must be a valid number (milliseconds)');
  }

  const timeRange = parseInt(query.timeRange || '3600000', 10);
  if (timeRange > 604800000) { // 7 days max
    errors.push('timeRange cannot exceed 7 days (604800000ms)');
  }

  return errors;
}

// Export with security headers
export default withSecurityHeaders(handler);