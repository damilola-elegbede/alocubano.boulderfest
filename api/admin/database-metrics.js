/**
 * Database Metrics API Endpoint
 *
 * Provides detailed time-series metrics and analytics for database monitoring dashboards:
 * - Historical performance data with time-series analysis
 * - Failure rate analysis and error categorization
 * - Resource usage trends and capacity planning
 * - Connection lifecycle metrics and optimization insights
 * - Real-time operational metrics for dashboard visualization
 */

import { getHealthMonitor } from "../../lib/connection-health-monitor.js";
import { getPoolStatistics } from "../../lib/connection-manager.js";
import { getDatabaseClient } from "../../lib/database.js";
import { logger } from "../../lib/logger.js";
import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";

async function handler(req, res) {
  const startTime = Date.now();

  try {
    // Only allow GET requests for metrics
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
        message: 'Database metrics require admin access'
      });
    }

    // Initialize database service before reading metrics
    await getDatabaseClient();

    // Parse and validate query parameters
    const {
      startTime: queryStartTime,
      endTime: queryEndTime,
      interval = '300000', // 5 minutes default
      metrics: requestedMetrics = 'all',
      granularity = 'medium',
      format = 'json'
    } = req.query;

    const validationErrors = validateQueryParams(req.query);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: validationErrors
      });
    }

    // Calculate time range
    const endTime = queryEndTime ? parseInt(queryEndTime, 10) : Date.now();
    const defaultStartTime = endTime - (24 * 60 * 60 * 1000); // 24 hours ago
    const startTimeMs = queryStartTime ? parseInt(queryStartTime, 10) : defaultStartTime;
    const intervalMs = parseInt(interval, 10);

    // Get health monitor and metrics data
    const healthMonitor = getHealthMonitor();
    const currentPoolStats = await getPoolStatistics();

    // Collect comprehensive metrics
    const metricsData = await collectMetricsData({
      healthMonitor,
      currentPoolStats,
      startTime: startTimeMs,
      endTime,
      interval: intervalMs,
      requestedMetrics,
      granularity
    });

    // Build response based on requested format
    const response = {
      status: 'success',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      timeRange: {
        start: new Date(startTimeMs).toISOString(),
        end: new Date(endTime).toISOString(),
        duration: endTime - startTimeMs,
        interval: intervalMs
      },
      metrics: metricsData,
      metadata: {
        sampleCount: metricsData.timeSeries?.length || 0,
        granularity,
        requestedMetrics: requestedMetrics.split(','),
        dataQuality: assessDataQuality(metricsData)
      }
    };

    // Set appropriate cache headers
    res.setHeader('Cache-Control', 'private, max-age=30'); // 30 second cache for metrics
    res.setHeader('X-Response-Time', `${Date.now() - startTime}ms`);
    res.setHeader('X-Sample-Count', metricsData.timeSeries?.length || 0);

    res.status(200).json(response);

    // Log metrics request for monitoring
    logger.debug('Database metrics request completed', {
      startTime: startTimeMs,
      endTime,
      interval: intervalMs,
      requestedMetrics,
      sampleCount: metricsData.timeSeries?.length || 0,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    logger.error('Database metrics API error:', {
      error: error.message,
      stack: error.stack,
      responseTime: Date.now() - startTime
    });

    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve database metrics',
      message: error.message,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime
    });
  }
}

/**
 * Collect comprehensive metrics data
 */
async function collectMetricsData({
  healthMonitor,
  currentPoolStats,
  startTime,
  endTime,
  interval,
  requestedMetrics,
  granularity
}) {
  const includeAllMetrics = requestedMetrics === 'all';
  const metricsArray = includeAllMetrics ?
    ['performance', 'utilization', 'errors', 'connections', 'alerts'] :
    requestedMetrics.split(',');

  const historicalData = healthMonitor.getHistoricalMetrics(startTime, endTime);
  const alertHistory = healthMonitor.getAlertHistory(1000);

  // Build time series data
  const timeSeries = buildTimeSeries(historicalData, startTime, endTime, interval);

  const result = {
    timeSeries,
    current: getCurrentMetrics(currentPoolStats, healthMonitor)
  };

  // Add specific metric categories based on request
  if (metricsArray.includes('performance')) {
    result.performance = buildPerformanceMetrics(timeSeries, granularity);
  }

  if (metricsArray.includes('utilization')) {
    result.utilization = buildUtilizationMetrics(timeSeries, granularity);
  }

  if (metricsArray.includes('errors')) {
    result.errors = buildErrorMetrics(timeSeries, alertHistory, granularity);
  }

  if (metricsArray.includes('connections')) {
    result.connections = buildConnectionMetrics(timeSeries, granularity);
  }

  if (metricsArray.includes('alerts')) {
    result.alerts = buildAlertMetrics(alertHistory, startTime, endTime);
  }

  if (metricsArray.includes('capacity')) {
    result.capacity = buildCapacityMetrics(timeSeries, currentPoolStats);
  }

  return result;
}

/**
 * Build time series data from historical metrics
 */
function buildTimeSeries(historicalData, startTime, endTime, interval) {
  if (historicalData.length === 0) {
    return [];
  }

  // Group data by time intervals
  const timeSlots = [];
  let currentTime = startTime;

  while (currentTime < endTime) {
    const nextTime = currentTime + interval;
    const slotData = historicalData.filter(
      metric => metric.timestamp >= currentTime && metric.timestamp < nextTime
    );

    if (slotData.length > 0) {
      timeSlots.push({
        timestamp: currentTime,
        timestampISO: new Date(currentTime).toISOString(),
        sampleCount: slotData.length,
        metrics: aggregateSlotMetrics(slotData)
      });
    }

    currentTime = nextTime;
  }

  return timeSlots;
}

/**
 * Aggregate metrics for a time slot
 */
function aggregateSlotMetrics(slotData) {
  const poolMetrics = slotData
    .map(d => d.components?.connectionPool?.metrics)
    .filter(Boolean);

  const circuitBreakerMetrics = slotData
    .map(d => d.components?.circuitBreaker?.metrics)
    .filter(Boolean);

  const stateMachineMetrics = slotData
    .map(d => d.components?.stateMachine?.metrics)
    .filter(Boolean);

  return {
    connectionPool: {
      utilization: calculateAverage(poolMetrics.map(m => m.utilization)),
      totalConnections: calculateAverage(poolMetrics.map(m => m.totalConnections)),
      activeLeases: calculateAverage(poolMetrics.map(m => m.activeLeases)),
      errorRate: calculateAverage(poolMetrics.map(m => m.errorRate)),
      leaseEfficiency: calculateAverage(poolMetrics.map(m => m.leaseEfficiency))
    },
    circuitBreaker: {
      state: getMostCommonValue(circuitBreakerMetrics.map(m => m.state)),
      failureRate: calculateAverage(circuitBreakerMetrics.map(m => m.failureRate)),
      isHealthy: calculatePercentage(circuitBreakerMetrics.map(m => m.isHealthy))
    },
    stateMachine: {
      healthyConnections: calculateAverage(stateMachineMetrics.map(m => m.healthyConnections)),
      totalConnections: calculateAverage(stateMachineMetrics.map(m => m.totalConnections)),
      healthRatio: calculateAverage(stateMachineMetrics.map(m => m.healthRatio))
    },
    alerts: {
      count: slotData.reduce((sum, d) => sum + (d.alertCount || 0), 0) / slotData.length
    }
  };
}

/**
 * Build performance metrics with percentiles and trends
 */
function buildPerformanceMetrics(timeSeries, granularity) {
  const utilizationValues = timeSeries.map(ts => ts.metrics.connectionPool.utilization).filter(Boolean);
  const errorRateValues = timeSeries.map(ts => ts.metrics.connectionPool.errorRate).filter(Boolean);
  const efficiencyValues = timeSeries.map(ts => ts.metrics.connectionPool.leaseEfficiency).filter(Boolean);

  return {
    utilization: {
      current: utilizationValues[utilizationValues.length - 1] || 0,
      average: calculateAverage(utilizationValues),
      median: calculatePercentile([...utilizationValues].sort((a, b) => a - b), 0.5),
      p95: calculatePercentile([...utilizationValues].sort((a, b) => a - b), 0.95),
      p99: calculatePercentile([...utilizationValues].sort((a, b) => a - b), 0.99),
      max: Math.max(...utilizationValues, 0),
      min: Math.min(...utilizationValues, 0),
      trend: calculateTrendDirection(utilizationValues.slice(-10))
    },
    errorRate: {
      current: errorRateValues[errorRateValues.length - 1] || 0,
      average: calculateAverage(errorRateValues),
      max: Math.max(...errorRateValues, 0),
      trend: calculateTrendDirection(errorRateValues.slice(-10))
    },
    efficiency: {
      current: efficiencyValues[efficiencyValues.length - 1] || 100,
      average: calculateAverage(efficiencyValues),
      min: Math.min(...efficiencyValues, 100),
      trend: calculateTrendDirection(efficiencyValues.slice(-10))
    },
    benchmarks: {
      utilizationTarget: 80,
      errorRateTarget: 1,
      efficiencyTarget: 98
    }
  };
}

/**
 * Build utilization metrics for capacity planning
 */
function buildUtilizationMetrics(timeSeries, granularity) {
  const connectionData = timeSeries.map(ts => ({
    timestamp: ts.timestamp,
    total: ts.metrics.connectionPool.totalConnections,
    active: ts.metrics.connectionPool.activeLeases,
    utilization: ts.metrics.connectionPool.utilization
  }));

  const peakUsage = connectionData.reduce((peak, current) =>
    current.active > peak.active ? current : peak,
  { active: 0, timestamp: 0 }
  );

  const averageUsage = calculateAverage(connectionData.map(d => d.active));

  return {
    current: {
      connections: connectionData[connectionData.length - 1]?.total || 0,
      activeLeases: connectionData[connectionData.length - 1]?.active || 0,
      utilization: connectionData[connectionData.length - 1]?.utilization || 0
    },
    historical: {
      peakUsage: {
        connections: peakUsage.active,
        timestamp: peakUsage.timestamp,
        timestampISO: new Date(peakUsage.timestamp).toISOString()
      },
      averageUsage: Math.round(averageUsage),
      utilizationDistribution: calculateUtilizationDistribution(connectionData)
    },
    forecast: {
      recommendedPoolSize: Math.ceil(peakUsage.active * 1.2), // 20% buffer
      warningThreshold: Math.ceil(peakUsage.active * 0.8),
      criticalThreshold: Math.ceil(peakUsage.active * 0.95)
    }
  };
}

/**
 * Build error metrics with categorization
 */
function buildErrorMetrics(timeSeries, alertHistory, granularity) {
  const errorRates = timeSeries.map(ts => ts.metrics.connectionPool.errorRate).filter(Boolean);
  const alertsInRange = alertHistory.filter(alert =>
    alert.timestamp >= timeSeries[0]?.timestamp &&
    alert.timestamp <= timeSeries[timeSeries.length - 1]?.timestamp
  );

  // Categorize alerts
  const alertsByComponent = groupBy(alertsInRange, 'component');
  const alertsBySeverity = groupBy(alertsInRange, 'type');

  return {
    errorRate: {
      current: errorRates[errorRates.length - 1] || 0,
      average: calculateAverage(errorRates),
      max: Math.max(...errorRates, 0),
      trend: calculateTrendDirection(errorRates.slice(-10))
    },
    alerts: {
      total: alertsInRange.length,
      byComponent: Object.fromEntries(
        Object.entries(alertsByComponent).map(([key, alerts]) => [key, alerts.length])
      ),
      bySeverity: Object.fromEntries(
        Object.entries(alertsBySeverity).map(([key, alerts]) => [key, alerts.length])
      ),
      frequency: alertsInRange.length / Math.max(timeSeries.length, 1) // alerts per time slot
    },
    patterns: {
      mostCommonError: findMostCommonErrorPattern(alertsInRange),
      errorBursts: findErrorBursts(alertsInRange),
      recurringIssues: findRecurringIssues(alertsInRange)
    }
  };
}

/**
 * Build connection lifecycle metrics
 */
function buildConnectionMetrics(timeSeries, granularity) {
  const healthRatios = timeSeries.map(ts => ts.metrics.stateMachine.healthRatio).filter(Boolean);
  const totalConnections = timeSeries.map(ts => ts.metrics.stateMachine.totalConnections).filter(Boolean);

  return {
    health: {
      current: healthRatios[healthRatios.length - 1] || 0,
      average: calculateAverage(healthRatios),
      min: Math.min(...healthRatios, 0),
      trend: calculateTrendDirection(healthRatios.slice(-10))
    },
    lifecycle: {
      averageConnections: calculateAverage(totalConnections),
      peakConnections: Math.max(...totalConnections, 0),
      connectionStability: calculateStabilityMetric(totalConnections)
    },
    recommendations: {
      healthTarget: 95,
      stabilityTarget: 90,
      monitoringAlert: healthRatios[healthRatios.length - 1] < 90
    }
  };
}

/**
 * Build alert metrics for alerting dashboard
 */
function buildAlertMetrics(alertHistory, startTime, endTime) {
  const alertsInRange = alertHistory.filter(alert =>
    alert.timestamp >= startTime && alert.timestamp <= endTime
  );

  const recentAlerts = alertHistory.filter(alert =>
    alert.timestamp >= Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
  );

  return {
    summary: {
      total: alertsInRange.length,
      critical: alertsInRange.filter(a => a.type === 'critical').length,
      warnings: alertsInRange.filter(a => a.type === 'warning').length,
      resolved: 0 // Would need additional tracking for resolution
    },
    recent: recentAlerts.slice(0, 10).map(alert => ({
      id: alert.id,
      type: alert.type,
      component: alert.component,
      message: alert.message,
      timestamp: alert.timestamp,
      timestampISO: new Date(alert.timestamp).toISOString()
    })),
    trends: {
      alertFrequency: alertsInRange.length / Math.max(1, (endTime - startTime) / (60 * 60 * 1000)), // per hour
      escalationRate: calculateEscalationRate(alertsInRange),
      responseTime: null // Would need additional tracking
    }
  };
}

/**
 * Build capacity planning metrics
 */
function buildCapacityMetrics(timeSeries, currentPoolStats) {
  const utilizationData = timeSeries.map(ts => ts.metrics.connectionPool.utilization).filter(Boolean);
  const connectionData = timeSeries.map(ts => ts.metrics.connectionPool.totalConnections).filter(Boolean);

  const maxUtilization = Math.max(...utilizationData, 0);
  const avgUtilization = calculateAverage(utilizationData);
  const currentConnections = currentPoolStats?.pool?.maxConnections || 0;

  return {
    current: {
      maxConnections: currentConnections,
      utilization: utilizationData[utilizationData.length - 1] || 0,
      headroom: Math.max(0, 100 - maxUtilization)
    },
    analysis: {
      peakUtilization: maxUtilization,
      averageUtilization: avgUtilization,
      utilizationTrend: calculateTrendDirection(utilizationData.slice(-10)),
      growthRate: calculateGrowthRate(utilizationData)
    },
    recommendations: {
      recommendedPoolSize: Math.ceil(currentConnections * (maxUtilization / 80)), // Target 80% max
      scaleUpThreshold: 85,
      scaleDownThreshold: 40,
      projectedNeed: calculateProjectedCapacity(utilizationData, 30) // 30 days projection
    }
  };
}

/**
 * Get current real-time metrics
 */
function getCurrentMetrics(poolStats, healthMonitor) {
  const monitoringStats = healthMonitor.getMonitoringStats();
  const currentAlerts = healthMonitor.getCurrentAlerts();

  return {
    timestamp: Date.now(),
    timestampISO: new Date().toISOString(),
    pool: {
      utilization: poolStats.pool ?
        (poolStats.pool.activeLeases / poolStats.pool.maxConnections) * 100 : 0,
      connections: poolStats.pool?.totalConnections || 0,
      activeLeases: poolStats.pool?.activeLeases || 0,
      availableConnections: poolStats.pool?.availableConnections || 0
    },
    alerts: {
      active: currentAlerts.length,
      critical: currentAlerts.filter(a => a.type === 'critical').length,
      warnings: currentAlerts.filter(a => a.type === 'warning').length
    },
    monitoring: {
      uptime: monitoringStats.uptimeSeconds,
      healthChecks: monitoringStats.totalHealthChecks,
      lastCheck: new Date(Date.now()).toISOString()
    }
  };
}

// Utility functions

function calculateAverage(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, val) => sum + (val || 0), 0) / values.length;
}

function calculatePercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) {
    return 0;
  }
  const index = percentile * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedArray[lower] || 0;
  }

  const weight = index - lower;
  return (sortedArray[lower] || 0) * (1 - weight) + (sortedArray[upper] || 0) * weight;
}

function calculateTrendDirection(values) {
  if (values.length < 2) {
    return 'stable';
  }

  const firstHalf = values.slice(0, Math.ceil(values.length / 2));
  const secondHalf = values.slice(Math.ceil(values.length / 2));

  const firstAvg = calculateAverage(firstHalf);
  const secondAvg = calculateAverage(secondHalf);

  const change = secondAvg - firstAvg;
  const changePercent = Math.abs(change) / Math.max(firstAvg, 0.01) * 100;

  if (changePercent < 5) {
    return 'stable';
  }
  return change > 0 ? 'increasing' : 'decreasing';
}

function calculatePercentage(booleanValues) {
  if (booleanValues.length === 0) {
    return 0;
  }
  const trueCount = booleanValues.filter(Boolean).length;
  return (trueCount / booleanValues.length) * 100;
}

function getMostCommonValue(values) {
  if (values.length === 0) {
    return null;
  }
  const counts = {};
  values.forEach(val => counts[val] = (counts[val] || 0) + 1);
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const value = item[key];
    if (!groups[value]) {
      groups[value] = [];
    }
    groups[value].push(item);
    return groups;
  }, {});
}

function calculateUtilizationDistribution(connectionData) {
  const buckets = { low: 0, medium: 0, high: 0, critical: 0 };

  connectionData.forEach(data => {
    const util = data.utilization || 0;
    if (util < 50) {
      buckets.low++;
    } else if (util < 75) {
      buckets.medium++;
    } else if (util < 90) {
      buckets.high++;
    } else {
      buckets.critical++;
    }
  });

  return buckets;
}

function findMostCommonErrorPattern(alerts) {
  const patterns = {};
  alerts.forEach(alert => {
    const pattern = `${alert.component}-${alert.metric}`;
    patterns[pattern] = (patterns[pattern] || 0) + 1;
  });

  if (Object.keys(patterns).length === 0) {
    return null;
  }

  const mostCommon = Object.keys(patterns).reduce((a, b) =>
    patterns[a] > patterns[b] ? a : b
  );

  return {
    pattern: mostCommon,
    count: patterns[mostCommon],
    percentage: (patterns[mostCommon] / alerts.length) * 100
  };
}

function findErrorBursts(alerts) {
  // Find periods with high alert frequency (simplified implementation)
  const hourlyBuckets = {};
  alerts.forEach(alert => {
    const hour = Math.floor(alert.timestamp / (60 * 60 * 1000));
    hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
  });

  const burstThreshold = 5; // 5+ alerts per hour
  const bursts = Object.entries(hourlyBuckets)
    .filter(([hour, count]) => count >= burstThreshold)
    .map(([hour, count]) => ({
      startTime: parseInt(hour) * 60 * 60 * 1000,
      alertCount: count
    }));

  return bursts;
}

function findRecurringIssues(alerts) {
  const recurring = {};
  alerts.forEach(alert => {
    const key = `${alert.component}-${alert.metric}`;
    if (!recurring[key]) {
      recurring[key] = { count: 0, firstSeen: alert.timestamp, lastSeen: alert.timestamp };
    }
    recurring[key].count++;
    recurring[key].lastSeen = Math.max(recurring[key].lastSeen, alert.timestamp);
  });

  return Object.entries(recurring)
    .filter(([key, data]) => data.count >= 3) // 3+ occurrences
    .map(([key, data]) => ({
      issue: key,
      occurrences: data.count,
      timeSpan: data.lastSeen - data.firstSeen,
      frequency: data.count / Math.max(1, (data.lastSeen - data.firstSeen) / (24 * 60 * 60 * 1000)) // per day
    }));
}

function calculateStabilityMetric(values) {
  if (values.length < 2) {
    return 100;
  }

  const variance = values.reduce((sum, val, i) => {
    if (i === 0) {
      return 0;
    }
    return sum + Math.abs(val - values[i - 1]);
  }, 0) / (values.length - 1);

  const average = calculateAverage(values);
  const stabilityScore = Math.max(0, 100 - (variance / Math.max(average, 1)) * 100);

  return Math.round(stabilityScore);
}

function calculateEscalationRate(alerts) {
  const criticalAlerts = alerts.filter(a => a.type === 'critical').length;
  return alerts.length > 0 ? (criticalAlerts / alerts.length) * 100 : 0;
}

function calculateGrowthRate(values) {
  if (values.length < 2) {
    return 0;
  }

  const firstValue = values[0] || 1;
  const lastValue = values[values.length - 1] || 1;

  return ((lastValue - firstValue) / firstValue) * 100;
}

function calculateProjectedCapacity(utilizationData, days) {
  if (utilizationData.length < 10) {
    return null;
  }

  const trend = calculateTrendDirection(utilizationData);
  const currentUtilization = utilizationData[utilizationData.length - 1] || 0;
  const growthRate = calculateGrowthRate(utilizationData.slice(-10)); // Last 10 data points

  if (trend === 'increasing' && growthRate > 0) {
    const dailyGrowth = growthRate / utilizationData.length; // Approximation
    return Math.min(100, currentUtilization + (dailyGrowth * days));
  }

  return currentUtilization;
}

function assessDataQuality(metricsData) {
  const totalSamples = metricsData.timeSeries?.length || 0;

  if (totalSamples === 0) {
    return 'no-data';
  }
  if (totalSamples < 10) {
    return 'limited';
  }
  if (totalSamples < 50) {
    return 'sufficient';
  }
  return 'excellent';
}

function validateQueryParams(query) {
  const errors = [];

  if (query.startTime && isNaN(parseInt(query.startTime, 10))) {
    errors.push('startTime must be a valid timestamp (milliseconds)');
  }

  if (query.endTime && isNaN(parseInt(query.endTime, 10))) {
    errors.push('endTime must be a valid timestamp (milliseconds)');
  }

  if (query.interval && isNaN(parseInt(query.interval, 10))) {
    errors.push('interval must be a valid number (milliseconds)');
  }

  const interval = parseInt(query.interval || '300000', 10);
  if (interval < 60000) { // Minimum 1 minute
    errors.push('interval cannot be less than 60000ms (1 minute)');
  }

  if (interval > 3600000) { // Maximum 1 hour
    errors.push('interval cannot exceed 3600000ms (1 hour)');
  }

  const validMetrics = ['all', 'performance', 'utilization', 'errors', 'connections', 'alerts', 'capacity'];
  const requestedMetrics = (query.metrics || 'all').split(',');
  const invalidMetrics = requestedMetrics.filter(metric => !validMetrics.includes(metric.trim()));

  if (invalidMetrics.length > 0) {
    errors.push(`Invalid metrics requested: ${invalidMetrics.join(', ')}. Valid options: ${validMetrics.join(', ')}`);
  }

  const validGranularities = ['low', 'medium', 'high'];
  if (query.granularity && !validGranularities.includes(query.granularity)) {
    errors.push(`Invalid granularity: ${query.granularity}. Valid options: ${validGranularities.join(', ')}`);
  }

  return errors;
}

// Export with security headers and audit
export default withSecurityHeaders(authService.requireAuth(withAdminAudit(handler, {
  logBody: false,
  logMetadata: true,
  skipMethods: [] // Track database metrics monitoring access
})));