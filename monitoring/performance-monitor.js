/**
 * Performance Monitoring System
 * Comprehensive tracking of API responses, database queries, and payment processing
 */

import EventEmitter from 'events';

/**
 * Performance metrics collector
 */
export class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.thresholds = {
      api_response_time: 2000,      // 2 seconds
      db_query_time: 1000,          // 1 second
      payment_processing: 5000,     // 5 seconds
      email_delivery: 3000,         // 3 seconds
      inventory_check: 500          // 500ms
    };
    this.alertCooldowns = new Map();
  }

  /**
   * Record performance metric
   */
  recordMetric(operation, duration, context = {}) {
    const timestamp = Date.now();
    const metric = {
      operation,
      duration,
      timestamp,
      context
    };

    // Store metric
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const operationMetrics = this.metrics.get(operation);
    operationMetrics.push(metric);
    
    // Keep only last 1000 metrics per operation
    if (operationMetrics.length > 1000) {
      operationMetrics.shift();
    }

    // Check for performance issues
    this.checkPerformanceThreshold(operation, duration, context);

    // Emit metric event
    this.emit('metric', metric);

    return metric;
  }

  /**
   * Check if metric exceeds performance threshold
   */
  checkPerformanceThreshold(operation, duration, context) {
    const threshold = this.thresholds[operation];
    if (!threshold) return;

    if (duration > threshold) {
      const alertKey = `${operation}_slow`;
      const now = Date.now();
      const lastAlert = this.alertCooldowns.get(alertKey) || 0;
      
      // Only alert every 5 minutes for the same issue
      if (now - lastAlert > 300000) {
        this.alertCooldowns.set(alertKey, now);
        
        this.emit('performance_alert', {
          type: 'slow_operation',
          operation,
          duration,
          threshold,
          context,
          timestamp: now
        });
      }
    }
  }

  /**
   * Get performance statistics for operation
   */
  getStats(operation, timeWindow = 3600000) { // 1 hour default
    const operationMetrics = this.metrics.get(operation) || [];
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = operationMetrics.filter(m => m.timestamp > cutoff);

    if (recentMetrics.length === 0) {
      return null;
    }

    const durations = recentMetrics.map(m => m.duration);
    durations.sort((a, b) => a - b);

    return {
      operation,
      count: recentMetrics.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: durations[Math.floor(durations.length / 2)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)],
      threshold: this.thresholds[operation],
      violationCount: durations.filter(d => d > (this.thresholds[operation] || Infinity)).length,
      timeWindow
    };
  }

  /**
   * Get all performance statistics
   */
  getAllStats(timeWindow = 3600000) {
    const stats = {};
    for (const operation of this.metrics.keys()) {
      stats[operation] = this.getStats(operation, timeWindow);
    }
    return stats;
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Middleware for API response time monitoring
 */
export function apiPerformanceMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(body) {
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('api_response_time', duration, {
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        endpoint: `${req.method} ${req.path}`,
        userAgent: req.headers['user-agent'],
        contentLength: body ? body.length : 0
      });
      
      originalSend.call(this, body);
    };
    
    next();
  };
}

/**
 * Database query performance wrapper
 */
export function withDbPerformanceMonitoring(queryName, queryFunction) {
  return async (...args) => {
    const startTime = Date.now();
    
    try {
      const result = await queryFunction(...args);
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('db_query_time', duration, {
        query: queryName,
        success: true,
        rowCount: Array.isArray(result) ? result.length : result?.rowCount || 0
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('db_query_time', duration, {
        query: queryName,
        success: false,
        error: error.message
      });
      
      throw error;
    }
  };
}

/**
 * Payment processing performance wrapper
 */
export function withPaymentPerformanceMonitoring(operationName, paymentFunction) {
  return async (...args) => {
    const startTime = Date.now();
    
    try {
      const result = await paymentFunction(...args);
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('payment_processing', duration, {
        operation: operationName,
        success: true,
        amount: result?.amount,
        paymentMethod: result?.paymentMethod
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('payment_processing', duration, {
        operation: operationName,
        success: false,
        error: error.message,
        errorType: error.type
      });
      
      throw error;
    }
  };
}

/**
 * Email delivery performance monitoring
 */
export function withEmailPerformanceMonitoring(emailType, emailFunction) {
  return async (...args) => {
    const startTime = Date.now();
    
    try {
      const result = await emailFunction(...args);
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('email_delivery', duration, {
        emailType,
        success: true,
        messageId: result?.messageId,
        recipientCount: result?.recipientCount || 1
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('email_delivery', duration, {
        emailType,
        success: false,
        error: error.message
      });
      
      throw error;
    }
  };
}

/**
 * Inventory check performance monitoring
 */
export function withInventoryPerformanceMonitoring(inventoryFunction) {
  return async (...args) => {
    const startTime = Date.now();
    
    try {
      const result = await inventoryFunction(...args);
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('inventory_check', duration, {
        success: true,
        itemCount: args[0]?.length || 1,
        available: result?.available
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      performanceMonitor.recordMetric('inventory_check', duration, {
        success: false,
        error: error.message
      });
      
      throw error;
    }
  };
}

/**
 * Real-time performance dashboard data
 */
export class PerformanceDashboard {
  constructor(monitor = performanceMonitor) {
    this.monitor = monitor;
  }

  /**
   * Get current performance snapshot
   */
  getSnapshot() {
    const now = Date.now();
    const stats = this.monitor.getAllStats(300000); // Last 5 minutes
    
    return {
      timestamp: now,
      overall: {
        healthy: this.calculateOverallHealth(stats),
        totalRequests: this.getTotalRequests(stats),
        errorRate: this.getErrorRate(stats)
      },
      apis: this.getApiMetrics(stats),
      database: this.getDatabaseMetrics(stats),
      payments: this.getPaymentMetrics(stats),
      emails: this.getEmailMetrics(stats),
      inventory: this.getInventoryMetrics(stats)
    };
  }

  calculateOverallHealth(stats) {
    let healthyOperations = 0;
    let totalOperations = 0;

    for (const [operation, stat] of Object.entries(stats)) {
      if (!stat) continue;
      
      totalOperations++;
      const violationRate = stat.violationCount / stat.count;
      
      if (violationRate < 0.1) { // Less than 10% violations
        healthyOperations++;
      }
    }

    return totalOperations > 0 ? (healthyOperations / totalOperations) * 100 : 100;
  }

  getTotalRequests(stats) {
    const apiStats = stats.api_response_time;
    return apiStats ? apiStats.count : 0;
  }

  getErrorRate(stats) {
    // This would need to be tracked separately with error counts
    return 0; // Placeholder
  }

  getApiMetrics(stats) {
    const apiStats = stats.api_response_time;
    if (!apiStats) return null;

    return {
      avgResponseTime: Math.round(apiStats.avg),
      p95ResponseTime: Math.round(apiStats.p95),
      requestCount: apiStats.count,
      slowRequestCount: apiStats.violationCount,
      threshold: apiStats.threshold
    };
  }

  getDatabaseMetrics(stats) {
    const dbStats = stats.db_query_time;
    if (!dbStats) return null;

    return {
      avgQueryTime: Math.round(dbStats.avg),
      p95QueryTime: Math.round(dbStats.p95),
      queryCount: dbStats.count,
      slowQueryCount: dbStats.violationCount,
      threshold: dbStats.threshold
    };
  }

  getPaymentMetrics(stats) {
    const paymentStats = stats.payment_processing;
    if (!paymentStats) return null;

    return {
      avgProcessingTime: Math.round(paymentStats.avg),
      p95ProcessingTime: Math.round(paymentStats.p95),
      paymentCount: paymentStats.count,
      slowPaymentCount: paymentStats.violationCount,
      threshold: paymentStats.threshold
    };
  }

  getEmailMetrics(stats) {
    const emailStats = stats.email_delivery;
    if (!emailStats) return null;

    return {
      avgDeliveryTime: Math.round(emailStats.avg),
      p95DeliveryTime: Math.round(emailStats.p95),
      emailCount: emailStats.count,
      slowEmailCount: emailStats.violationCount,
      threshold: emailStats.threshold
    };
  }

  getInventoryMetrics(stats) {
    const inventoryStats = stats.inventory_check;
    if (!inventoryStats) return null;

    return {
      avgCheckTime: Math.round(inventoryStats.avg),
      p95CheckTime: Math.round(inventoryStats.p95),
      checkCount: inventoryStats.count,
      slowCheckCount: inventoryStats.violationCount,
      threshold: inventoryStats.threshold
    };
  }
}

/**
 * Performance metrics exporter for external monitoring tools
 */
export class MetricsExporter {
  constructor(monitor = performanceMonitor) {
    this.monitor = monitor;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics() {
    const stats = this.monitor.getAllStats();
    let output = '';

    for (const [operation, stat] of Object.entries(stats)) {
      if (!stat) continue;

      const sanitizedOperation = operation.replace(/[^a-zA-Z0-9_]/g, '_');
      
      output += `# HELP ${sanitizedOperation}_duration_seconds Duration of ${operation} operations\n`;
      output += `# TYPE ${sanitizedOperation}_duration_seconds histogram\n`;
      output += `${sanitizedOperation}_duration_avg ${(stat.avg / 1000).toFixed(3)}\n`;
      output += `${sanitizedOperation}_duration_p95 ${(stat.p95 / 1000).toFixed(3)}\n`;
      output += `${sanitizedOperation}_duration_p99 ${(stat.p99 / 1000).toFixed(3)}\n`;
      
      output += `# HELP ${sanitizedOperation}_total Total number of ${operation} operations\n`;
      output += `# TYPE ${sanitizedOperation}_total counter\n`;
      output += `${sanitizedOperation}_total ${stat.count}\n`;
      
      output += `# HELP ${sanitizedOperation}_violations_total Number of ${operation} operations exceeding threshold\n`;
      output += `# TYPE ${sanitizedOperation}_violations_total counter\n`;
      output += `${sanitizedOperation}_violations_total ${stat.violationCount}\n\n`;
    }

    return output;
  }

  /**
   * Export metrics as JSON
   */
  exportJSON() {
    return {
      timestamp: Date.now(),
      metrics: this.monitor.getAllStats(),
      thresholds: this.monitor.thresholds
    };
  }

  /**
   * Export metrics for DataDog
   */
  exportDataDogMetrics() {
    const stats = this.monitor.getAllStats();
    const metrics = [];
    const timestamp = Math.floor(Date.now() / 1000);

    for (const [operation, stat] of Object.entries(stats)) {
      if (!stat) continue;

      metrics.push({
        metric: `payment_system.${operation}.avg`,
        points: [[timestamp, stat.avg]],
        tags: [`operation:${operation}`]
      });

      metrics.push({
        metric: `payment_system.${operation}.p95`,
        points: [[timestamp, stat.p95]],
        tags: [`operation:${operation}`]
      });

      metrics.push({
        metric: `payment_system.${operation}.count`,
        points: [[timestamp, stat.count]],
        tags: [`operation:${operation}`]
      });

      metrics.push({
        metric: `payment_system.${operation}.violations`,
        points: [[timestamp, stat.violationCount]],
        tags: [`operation:${operation}`]
      });
    }

    return { series: metrics };
  }
}

// Set up performance monitoring listeners
performanceMonitor.on('performance_alert', (alert) => {
  console.warn('Performance Alert:', alert);
  
  // Here you would typically send to your alerting system
  // For example: send to Sentry, PagerDuty, Slack, etc.
});

performanceMonitor.on('metric', (metric) => {
  // Optional: Log all metrics (be careful about volume)
  if (process.env.DEBUG_PERFORMANCE === 'true') {
    console.log('Performance Metric:', metric);
  }
});

export default {
  performanceMonitor,
  PerformanceMonitor,
  PerformanceDashboard,
  MetricsExporter,
  apiPerformanceMiddleware,
  withDbPerformanceMonitoring,
  withPaymentPerformanceMonitoring,
  withEmailPerformanceMonitoring,
  withInventoryPerformanceMonitoring
};