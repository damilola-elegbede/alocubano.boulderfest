/**
import { setSecureCorsHeaders } from '../lib/cors-config.js';
 * Performance Metrics API Endpoint
 * Collects, processes, and stores performance metrics from client applications
 *
 * POST /api/performance-metrics
 * Accepts performance metrics data and processes it for analytics
 */

import crypto from 'crypto';

/**
 * Validates the structure of incoming metrics data
 * @param {Object} metrics - The metrics object to validate
 * @returns {Object} - { isValid: boolean, error?: string }
 */
function validateMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return { isValid: false, error: 'Metrics must be an object' };
  }

  const requiredFields = ['timestamp', 'page', 'metrics'];
  for (const field of requiredFields) {
    if (!metrics[field]) {
      return { isValid: false, error: `Missing required field: ${field}` };
    }
  }

  if (typeof metrics.timestamp !== 'number') {
    return { isValid: false, error: 'Timestamp must be a number' };
  }

  if (typeof metrics.page !== 'string') {
    return { isValid: false, error: 'Page must be a string' };
  }

  if (!metrics.metrics || typeof metrics.metrics !== 'object') {
    return { isValid: false, error: 'Metrics.metrics must be an object' };
  }

  return { isValid: true };
}

/**
 * Processes and aggregates numeric metrics
 * @param {Array} metricsList - Array of metrics objects
 * @returns {Object} - Aggregated metrics with count, avg, min, max, p95
 */
function processMetrics(metricsList) {
  const aggregated = {};

  // Group metrics by type
  const metricGroups = {};

  metricsList.forEach((metricsData) => {
    const { metrics } = metricsData;

    Object.entries(metrics).forEach(([key, value]) => {
      if (typeof value === 'number' && !isNaN(value)) {
        if (!metricGroups[key]) {
          metricGroups[key] = [];
        }
        metricGroups[key].push(value);
      }
    });
  });

  // Calculate aggregations for each metric type
  Object.entries(metricGroups).forEach(([metricName, values]) => {
    if (values.length === 0) {
      return;
    }

    const sorted = values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    aggregated[metricName] = {
      count: values.length,
      avg: Math.round((sum / values.length) * 100) / 100, // Round to 2 decimal places
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: calculatePercentile(sorted, 95)
    };
  });

  return aggregated;
}

/**
 * Calculates the specified percentile from a sorted array
 * @param {Array} sortedArray - Array of numbers sorted in ascending order
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number} - The percentile value
 */
function calculatePercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) {
    return 0;
  }
  if (sortedArray.length === 1) {
    return sortedArray[0];
  }

  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedArray[lower];
  }

  const weight = index - lower;
  return (
    Math.round(
      (sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight) * 100
    ) / 100
  );
}

/**
 * Checks metrics against alert thresholds and returns any triggered alerts
 * @param {Object} aggregatedMetrics - The aggregated metrics to check
 * @returns {Array} - Array of alert objects for triggered conditions
 */
function checkAlerts(aggregatedMetrics) {
  const alerts = [];

  // Alert thresholds
  const thresholds = {
    LCP: 2500, // 2.5 seconds in milliseconds
    errorRate: 95, // 95% success rate threshold
    memoryUsage: 80 // 80% memory usage threshold
  };

  // Check LCP (Largest Contentful Paint)
  if (aggregatedMetrics.LCP && aggregatedMetrics.LCP.p95 > thresholds.LCP) {
    alerts.push({
      type: 'performance',
      metric: 'LCP',
      threshold: thresholds.LCP,
      value: aggregatedMetrics.LCP.p95,
      severity: 'high',
      message: `LCP P95 (${aggregatedMetrics.LCP.p95}ms) exceeds threshold (${thresholds.LCP}ms)`
    });
  }

  // Check error rate (assuming we have success/error counts)
  if (
    aggregatedMetrics.successCount &&
    aggregatedMetrics.totalCount &&
    aggregatedMetrics.totalCount.avg > 0
  ) {
    const successRate =
      (aggregatedMetrics.successCount.avg / aggregatedMetrics.totalCount.avg) *
      100;
    if (successRate < thresholds.errorRate) {
      alerts.push({
        type: 'reliability',
        metric: 'errorRate',
        threshold: thresholds.errorRate,
        value: Math.round((100 - successRate) * 100) / 100,
        severity: 'high',
        message: `Error rate (${Math.round((100 - successRate) * 100) / 100}%) exceeds threshold (${100 - thresholds.errorRate}%)`
      });
    }
  }

  // Check memory usage
  if (
    aggregatedMetrics.memoryUsage &&
    aggregatedMetrics.memoryUsage.p95 > thresholds.memoryUsage
  ) {
    alerts.push({
      type: 'resource',
      metric: 'memoryUsage',
      threshold: thresholds.memoryUsage,
      value: aggregatedMetrics.memoryUsage.p95,
      severity: 'medium',
      message: `Memory usage P95 (${aggregatedMetrics.memoryUsage.p95}%) exceeds threshold (${thresholds.memoryUsage}%)`
    });
  }

  return alerts;
}

/**
 * Generates a session ID based on user agent and time window
 * @param {string} userAgent - The user agent string
 * @param {number} timestamp - The current timestamp
 * @returns {string} - Generated session ID
 */
function generateSessionId(userAgent, timestamp) {
  // Create 5-minute time windows (300000ms = 5 minutes)
  const timeWindow = Math.floor(timestamp / 300000) * 300000;

  // Create hash from user agent and time window
  const sessionData = `${userAgent}-${timeWindow}`;
  return crypto.createHash('md5').update(sessionData).digest('hex');
}

/**
 * Stores metrics data (currently logs to console, ready for database integration)
 * @param {Object} processedData - The processed metrics data to store
 */
async function storeMetrics(processedData) {
  // TODO: Implement actual database storage
  // For now, log to console for debugging and development

  console.log('=== Performance Metrics Stored ===');
  console.log('Timestamp:', new Date(processedData.timestamp).toISOString());
  console.log('Page:', processedData.page);
  console.log('Session ID:', processedData.sessionId);
  console.log('User Agent:', processedData.userAgent);
  console.log(
    'Aggregated Metrics:',
    JSON.stringify(processedData.aggregatedMetrics, null, 2)
  );

  if (processedData.alerts && processedData.alerts.length > 0) {
    console.log('🚨 ALERTS TRIGGERED:');
    processedData.alerts.forEach((alert) => {
      console.log(
        `  [${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`
      );
    });
  }

  console.log('=====================================');

  // In a real implementation, this would be something like:
  // await database.collection('performance_metrics').insertOne(processedData);
  // await alertingService.sendAlerts(processedData.alerts);
}

/**
 * Main API handler function
 */
export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Only POST requests are accepted.',
      allowedMethods: ['POST']
    });
  }

  try {
    const metricsData = req.body;

    // Validate request data
    const validation = validateMetrics(metricsData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid metrics data: ${validation.error}`,
        receivedData: metricsData
      });
    }

    // Extract request metadata
    const userAgent = req.headers['user-agent'] || '';
    const clientIP =
      req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    const timestamp = metricsData.timestamp;

    // Generate session ID
    const sessionId = generateSessionId(userAgent, timestamp);

    // Process metrics (for now, just process the single metrics object)
    // In a real implementation, you might batch multiple metrics
    const aggregatedMetrics = processMetrics([metricsData]);

    // Check for alerts
    const alerts = checkAlerts(aggregatedMetrics);

    // Prepare data for storage
    const processedData = {
      timestamp,
      page: metricsData.page,
      sessionId,
      userAgent,
      clientIP,
      rawMetrics: metricsData.metrics,
      aggregatedMetrics,
      alerts,
      receivedAt: Date.now()
    };

    // Store the metrics
    await storeMetrics(processedData);

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Metrics processed successfully',
      data: {
        sessionId,
        processedAt: new Date().toISOString(),
        metricsCount: Object.keys(metricsData.metrics).length,
        alertsTriggered: alerts.length,
        alerts: alerts.length > 0 ? alerts : undefined
      }
    });
  } catch (error) {
    console.error('Error processing performance metrics:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error while processing metrics',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
