import { setSecureCorsHeaders } from '../lib/cors-config.js';
import crypto from 'crypto';
import { getDatabaseClient } from '../lib/database.js';

/**
 * Unified Performance Metrics API Endpoint
 * Consolidates all performance data collection into a single endpoint
 *
 * Handles:
 * - General performance analytics (from /api/performance.js)
 * - Final page unload metrics (from /api/performance-final.js)
 * - Critical performance alerts (from /api/performance-critical.js)
 * - Core Web Vitals and custom metrics
 *
 * POST /api/performance-metrics
 * - Accepts performance metrics data via request body or query parameters
 * - Supports different metric types via 'type' parameter
 * - Processes and stores metrics for analytics
 */

/**
 * Validates the structure of incoming metrics data
 * @param {Object} metrics - The metrics object to validate
 * @param {string} metricType - The type of metric being submitted
 * @returns {Object} - { isValid: boolean, error?: string }
 */
function validateMetrics(metrics, metricType) {
  if (!metrics || typeof metrics !== 'object') {
    return { isValid: false, error: 'Metrics must be an object' };
  }

  // Basic validation for all types
  if (metricType === 'standard') {
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
  }

  // Validation for critical metrics
  if (metricType === 'critical') {
    if (!metrics.metrics || !metrics.timestamp || !metrics.severity) {
      return { isValid: false, error: 'Missing required fields: metrics, timestamp, severity' };
    }
  }

  // Validation for final metrics (less strict, handles sendBeacon)
  if (metricType === 'final') {
    if (!metrics.sessionId && !metrics.metrics) {
      return { isValid: false, error: 'Final metrics must include sessionId or metrics' };
    }
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
      avg: Math.round((sum / values.length) * 100) / 100,
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
    FCP: 1800, // 1.8 seconds for First Contentful Paint
    errorRate: 95, // 95% success rate threshold
    memoryUsage: 80, // 80% memory usage threshold
    fps: 30 // 30 fps minimum
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

  // Check lcp (lowercase variant from Core Web Vitals)
  if (aggregatedMetrics.lcp && aggregatedMetrics.lcp.p95 > thresholds.LCP) {
    alerts.push({
      type: 'performance',
      metric: 'lcp',
      threshold: thresholds.LCP,
      value: aggregatedMetrics.lcp.p95,
      severity: 'high',
      message: `Core Web Vitals LCP P95 (${aggregatedMetrics.lcp.p95}ms) exceeds threshold (${thresholds.LCP}ms)`
    });
  }

  // Check FID (First Input Delay)
  if (aggregatedMetrics.fid && aggregatedMetrics.fid.p95 > 100) {
    alerts.push({
      type: 'performance',
      metric: 'fid',
      threshold: 100,
      value: aggregatedMetrics.fid.p95,
      severity: 'high',
      message: `FID P95 (${aggregatedMetrics.fid.p95}ms) exceeds threshold (100ms)`
    });
  }

  // Check CLS (Cumulative Layout Shift)
  if (aggregatedMetrics.cls && aggregatedMetrics.cls.p95 > 0.1) {
    alerts.push({
      type: 'performance',
      metric: 'cls',
      threshold: 0.1,
      value: aggregatedMetrics.cls.p95,
      severity: 'medium',
      message: `CLS P95 (${aggregatedMetrics.cls.p95}) exceeds threshold (0.1)`
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

  // Check FPS
  if (aggregatedMetrics.fps && aggregatedMetrics.fps.avg < thresholds.fps) {
    alerts.push({
      type: 'performance',
      metric: 'fps',
      threshold: thresholds.fps,
      value: aggregatedMetrics.fps.avg,
      severity: 'medium',
      message: `Average FPS (${aggregatedMetrics.fps.avg}) below threshold (${thresholds.fps})`
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
 * Generates basic performance insights from metrics data
 * @param {Object} data - The metrics data
 * @returns {Array} - Array of insight objects
 */
function generatePerformanceInsights(data) {
  const insights = [];

  try {
    // Core Web Vitals insights
    if (data.coreWebVitals) {
      const { lcp, fid, cls } = data.coreWebVitals;

      if (lcp && lcp < 1200) {
        insights.push({
          type: 'positive',
          message: 'Excellent Largest Contentful Paint'
        });
      } else if (lcp && lcp > 2500) {
        insights.push({
          type: 'warning',
          message: 'LCP optimization needed - consider image optimization'
        });
      }

      if (fid && fid < 50) {
        insights.push({
          type: 'positive',
          message: 'Excellent First Input Delay'
        });
      } else if (fid && fid > 100) {
        insights.push({
          type: 'warning',
          message: 'FID optimization needed - reduce JavaScript execution time'
        });
      }

      if (cls && cls < 0.05) {
        insights.push({
          type: 'positive',
          message: 'Excellent Cumulative Layout Shift'
        });
      } else if (cls && cls > 0.1) {
        insights.push({
          type: 'warning',
          message: 'CLS optimization needed - avoid layout shifts'
        });
      }
    }

    // Memory insights
    if (data.memory && data.memory.utilization) {
      if (data.memory.utilization < 50) {
        insights.push({ type: 'positive', message: 'Healthy memory usage' });
      } else if (data.memory.utilization > 80) {
        insights.push({
          type: 'warning',
          message: 'High memory usage - consider optimizing'
        });
      }
    }

    // Network insights
    if (data.network && data.network.cacheHitRate) {
      const hitRate = parseFloat(data.network.cacheHitRate);
      if (hitRate > 85) {
        insights.push({
          type: 'positive',
          message: 'Excellent cache performance'
        });
      } else if (hitRate < 60) {
        insights.push({
          type: 'warning',
          message: 'Cache optimization opportunity'
        });
      }
    }
  } catch (error) {
    console.warn('[Performance Metrics] Insights generation error:', error.message);
  }

  return insights;
}

/**
 * Stores metrics data to the database
 * @param {Object} processedData - The processed metrics data to store
 */
async function storeMetrics(processedData) {
  try {
    const db = await getDatabaseClient();

    // Log summary to console for debugging
    console.log('=== Performance Metrics Stored ===');
    console.log('Type:', processedData.metricType);
    console.log('Timestamp:', new Date(processedData.timestamp).toISOString());
    console.log('Page:', processedData.page || processedData.url || 'unknown');
    console.log('Session ID:', processedData.sessionId);

    // Prepare metadata
    const metadata = {
      sessionId: processedData.sessionId,
      clientIP: processedData.clientIP,
      insights: processedData.insights || [],
      alerts: processedData.alerts || [],
      metricType: processedData.metricType
    };

    // Insert aggregated metrics into database
    if (processedData.aggregatedMetrics) {
      const insertPromises = [];

      for (const [metricName, metricData] of Object.entries(processedData.aggregatedMetrics)) {
        // Insert avg, min, max, p95 as separate records
        insertPromises.push(
          db.execute({
            sql: `INSERT INTO performance_metrics
                  (metric_name, metric_value, metric_type, endpoint, request_id, user_agent, metadata)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
              metricName + '_avg',
              metricData.avg,
              processedData.metricType || 'standard',
              processedData.page || processedData.url || null,
              processedData.sessionId,
              processedData.userAgent?.substring(0, 255) || null,
              JSON.stringify({
                ...metadata,
                aggregation: 'avg',
                count: metricData.count
              })
            ]
          }),
          db.execute({
            sql: `INSERT INTO performance_metrics
                  (metric_name, metric_value, metric_type, endpoint, request_id, user_agent, metadata)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
              metricName + '_p95',
              metricData.p95,
              processedData.metricType || 'standard',
              processedData.page || processedData.url || null,
              processedData.sessionId,
              processedData.userAgent?.substring(0, 255) || null,
              JSON.stringify({
                ...metadata,
                aggregation: 'p95',
                min: metricData.min,
                max: metricData.max
              })
            ]
          })
        );
      }

      await Promise.all(insertPromises);
      console.log(`✅ Inserted ${insertPromises.length} aggregated metrics`);
    }

    // Insert raw metrics if available
    if (processedData.rawMetrics) {
      const rawInserts = [];

      for (const [metricName, metricValue] of Object.entries(processedData.rawMetrics)) {
        if (typeof metricValue === 'number' && !isNaN(metricValue)) {
          rawInserts.push(
            db.execute({
              sql: `INSERT INTO performance_metrics
                    (metric_name, metric_value, metric_type, endpoint, request_id, user_agent, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
              args: [
                metricName,
                metricValue,
                'raw',
                processedData.page || processedData.url || null,
                processedData.sessionId,
                processedData.userAgent?.substring(0, 255) || null,
                JSON.stringify(metadata)
              ]
            })
          );
        }
      }

      if (rawInserts.length > 0) {
        await Promise.all(rawInserts);
        console.log(`✅ Inserted ${rawInserts.length} raw metrics`);
      }
    }

    // Insert Core Web Vitals if available
    if (processedData.coreWebVitals) {
      const vitalsInserts = [];

      for (const [vitalName, vitalValue] of Object.entries(processedData.coreWebVitals)) {
        if (typeof vitalValue === 'number' && !isNaN(vitalValue)) {
          vitalsInserts.push(
            db.execute({
              sql: `INSERT INTO performance_metrics
                    (metric_name, metric_value, metric_type, endpoint, request_id, user_agent, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
              args: [
                'cwv_' + vitalName,
                vitalValue,
                'core_web_vitals',
                processedData.url || null,
                processedData.sessionId,
                processedData.userAgent?.substring(0, 255) || null,
                JSON.stringify(metadata)
              ]
            })
          );
        }
      }

      if (vitalsInserts.length > 0) {
        await Promise.all(vitalsInserts);
        console.log(`✅ Inserted ${vitalsInserts.length} Core Web Vitals metrics`);
      }
    }

    // Log alerts if triggered
    if (processedData.alerts && processedData.alerts.length > 0) {
      console.log('🚨 ALERTS TRIGGERED:');
      processedData.alerts.forEach((alert) => {
        console.log(
          `  [${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`
        );
      });
    }

    console.log('=====================================');

  } catch (error) {
    console.error('❌ Failed to store performance metrics:', error);
    // Don't throw - metrics collection failures should not break the app
  }
}

/**
 * Main API handler function
 */
export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
    // Determine metric type from query parameter or body
    const metricType = req.query.type || req.body?.type || 'standard';

    // Parse metrics data (handle sendBeacon string bodies)
    let metricsData = req.body;
    if (typeof metricsData === 'string') {
      try {
        metricsData = JSON.parse(metricsData);
      } catch (parseError) {
        console.error('[Performance Metrics] Failed to parse JSON body:', parseError);
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        });
      }
    }

    // Validate request data based on type
    const validation = validateMetrics(metricsData, metricType);
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
    const timestamp = metricsData.timestamp || Date.now();

    // Generate session ID
    const sessionId = metricsData.sessionId || generateSessionId(userAgent, timestamp);

    // Process based on metric type
    let processedData = {
      metricType,
      timestamp,
      sessionId,
      userAgent,
      clientIP,
      receivedAt: Date.now()
    };

    if (metricType === 'standard') {
      // Standard performance metrics processing
      const aggregatedMetrics = processMetrics([metricsData]);
      const alerts = checkAlerts(aggregatedMetrics);

      processedData = {
        ...processedData,
        page: metricsData.page,
        rawMetrics: metricsData.metrics,
        aggregatedMetrics,
        alerts
      };
    } else if (metricType === 'analytics' || metricType === 'general') {
      // General analytics processing
      const insights = generatePerformanceInsights(metricsData);

      processedData = {
        ...processedData,
        url: metricsData.url,
        coreWebVitals: metricsData.coreWebVitals,
        customMetrics: metricsData.customMetrics,
        resourceTiming: metricsData.resourceTiming,
        memory: metricsData.memory,
        network: metricsData.network,
        insights
      };
    } else if (metricType === 'critical') {
      // Critical metrics processing
      processedData = {
        ...processedData,
        url: metricsData.url,
        severity: metricsData.severity,
        metrics: metricsData.metrics,
        alerts: [{
          type: 'critical',
          severity: metricsData.severity || 'high',
          message: 'Critical performance event detected',
          timestamp
        }]
      };

      // Log critical memory issues
      if (metricsData.metrics?.memory && metricsData.metrics.memory.utilization > 90) {
        console.warn('[MEMORY WARNING] High memory utilization detected:', {
          utilization: `${metricsData.metrics.memory.utilization.toFixed(2)}%`,
          used: `${(metricsData.metrics.memory.used / 1024 / 1024).toFixed(2)}MB`,
          total: `${(metricsData.metrics.memory.total / 1024 / 1024).toFixed(2)}MB`,
          url: metricsData.url
        });
      }

      // Log FPS issues
      if (metricsData.metrics?.fps && metricsData.metrics.fps < 30) {
        console.warn('[PERFORMANCE WARNING] Low frame rate detected:', {
          fps: metricsData.metrics.fps,
          url: metricsData.url,
          timestamp: new Date(timestamp).toISOString()
        });
      }
    } else if (metricType === 'final') {
      // Final report processing (page unload)
      processedData = {
        ...processedData,
        sessionId: metricsData.sessionId,
        totalEvents: metricsData.events?.length || 0,
        metrics: metricsData.metrics,
        coreWebVitals: {
          lcp: metricsData.metrics?.lcp?.value,
          fid: metricsData.metrics?.fid?.value,
          cls: metricsData.metrics?.cls?.value
        },
        galleryMetrics: {
          totalImagesLoaded: metricsData.metrics?.totalImagesLoaded,
          cacheHitRatio: metricsData.metrics?.cacheHitRatio
        }
      };

      console.log('[Performance Metrics] Received final metrics:', {
        timestamp: new Date().toISOString(),
        sessionId: metricsData.sessionId,
        totalEvents: metricsData.events?.length || 0,
        coreWebVitals: processedData.coreWebVitals,
        galleryMetrics: processedData.galleryMetrics
      });
    }

    // Store the metrics
    await storeMetrics(processedData);

    // Return success response
    return res.status(200).json({
      success: true,
      message: `${metricType} metrics processed successfully`,
      data: {
        sessionId,
        metricType,
        processedAt: new Date().toISOString(),
        metricsCount: metricsData.metrics ? Object.keys(metricsData.metrics).length : 0,
        alertsTriggered: processedData.alerts?.length || 0,
        alerts: processedData.alerts && processedData.alerts.length > 0 ? processedData.alerts : undefined,
        insights: processedData.insights && processedData.insights.length > 0 ? processedData.insights : undefined
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