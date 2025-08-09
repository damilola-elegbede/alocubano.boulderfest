import { getEnvironmentDetector } from './environment-detector.js';
import { captureMessage } from './sentry-config.js';
import { getAlertManager, AlertCategory, AlertSeverity } from './alert-manager.js';

/**
 * Performance metrics storage
 */
class MetricsStore {
  constructor(maxSamples = 1000) {
    this.maxSamples = maxSamples;
    this.metrics = new Map();
  }
  
  /**
   * Add metric sample
   */
  addSample(endpoint, duration, statusCode, metadata = {}) {
    if (!this.metrics.has(endpoint)) {
      this.metrics.set(endpoint, {
        samples: [],
        errors: 0,
        total: 0
      });
    }
    
    const metric = this.metrics.get(endpoint);
    const sample = {
      duration,
      statusCode,
      timestamp: Date.now(),
      ...metadata
    };
    
    metric.samples.push(sample);
    metric.total++;
    
    if (statusCode >= 400) {
      metric.errors++;
    }
    
    // Trim samples if exceeding max
    if (metric.samples.length > this.maxSamples) {
      metric.samples = metric.samples.slice(-this.maxSamples);
    }
  }
  
  /**
   * Calculate percentiles
   */
  calculatePercentiles(samples) {
    if (samples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = samples
      .map(s => s.duration)
      .sort((a, b) => a - b);
    
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    
    return {
      p50: sorted[p50Index] || 0,
      p95: sorted[p95Index] || sorted[sorted.length - 1],
      p99: sorted[p99Index] || sorted[sorted.length - 1]
    };
  }
  
  /**
   * Get endpoint statistics
   */
  getEndpointStats(endpoint, timeWindow = null) {
    const metric = this.metrics.get(endpoint);
    
    if (!metric) {
      return null;
    }
    
    let samples = metric.samples;
    
    // Filter by time window if specified
    if (timeWindow) {
      const cutoff = Date.now() - timeWindow;
      samples = samples.filter(s => s.timestamp >= cutoff);
    }
    
    if (samples.length === 0) {
      return {
        endpoint,
        sample_count: 0,
        error_rate: 0,
        percentiles: { p50: 0, p95: 0, p99: 0 },
        avg_duration: 0,
        min_duration: 0,
        max_duration: 0
      };
    }
    
    const durations = samples.map(s => s.duration);
    const errors = samples.filter(s => s.statusCode >= 400).length;
    
    return {
      endpoint,
      sample_count: samples.length,
      error_rate: (errors / samples.length) * 100,
      percentiles: this.calculatePercentiles(samples),
      avg_duration: durations.reduce((a, b) => a + b, 0) / durations.length,
      min_duration: Math.min(...durations),
      max_duration: Math.max(...durations),
      errors,
      total: metric.total,
      overall_error_rate: (metric.errors / metric.total) * 100
    };
  }
  
  /**
   * Get all endpoint statistics
   */
  getAllStats(timeWindow = null) {
    const stats = {};
    
    for (const endpoint of this.metrics.keys()) {
      stats[endpoint] = this.getEndpointStats(endpoint, timeWindow);
    }
    
    return stats;
  }
  
  /**
   * Clear old samples
   */
  cleanupOldSamples(maxAge = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAge;
    
    for (const [endpoint, metric] of this.metrics.entries()) {
      metric.samples = metric.samples.filter(s => s.timestamp >= cutoff);
      
      // Remove endpoint if no samples remain
      if (metric.samples.length === 0) {
        this.metrics.delete(endpoint);
      }
    }
  }
}

/**
 * Baseline tracker for regression detection
 */
class BaselineTracker {
  constructor() {
    this.baselines = new Map();
    this.deviationThreshold = 1.5; // 50% deviation triggers alert
  }
  
  /**
   * Update baseline for endpoint
   */
  updateBaseline(endpoint, stats) {
    const current = this.baselines.get(endpoint) || {};
    
    // Use exponential moving average for smooth updates
    const alpha = 0.1; // Smoothing factor
    
    this.baselines.set(endpoint, {
      p50: current.p50 ? 
        (alpha * stats.percentiles.p50 + (1 - alpha) * current.p50) : 
        stats.percentiles.p50,
      p95: current.p95 ? 
        (alpha * stats.percentiles.p95 + (1 - alpha) * current.p95) : 
        stats.percentiles.p95,
      p99: current.p99 ? 
        (alpha * stats.percentiles.p99 + (1 - alpha) * current.p99) : 
        stats.percentiles.p99,
      avg_duration: current.avg_duration ? 
        (alpha * stats.avg_duration + (1 - alpha) * current.avg_duration) : 
        stats.avg_duration,
      error_rate: current.error_rate ? 
        (alpha * stats.error_rate + (1 - alpha) * current.error_rate) : 
        stats.error_rate,
      last_updated: Date.now(),
      sample_count: (current.sample_count || 0) + stats.sample_count
    });
  }
  
  /**
   * Check for performance regression
   */
  checkRegression(endpoint, currentStats) {
    const baseline = this.baselines.get(endpoint);
    
    if (!baseline || baseline.sample_count < 100) {
      // Not enough data for comparison
      return null;
    }
    
    const regressions = [];
    
    // Check P95 regression
    if (currentStats.percentiles.p95 > baseline.p95 * this.deviationThreshold) {
      regressions.push({
        metric: 'p95',
        baseline: baseline.p95,
        current: currentStats.percentiles.p95,
        deviation: ((currentStats.percentiles.p95 / baseline.p95) - 1) * 100
      });
    }
    
    // Check average duration regression
    if (currentStats.avg_duration > baseline.avg_duration * this.deviationThreshold) {
      regressions.push({
        metric: 'avg_duration',
        baseline: baseline.avg_duration,
        current: currentStats.avg_duration,
        deviation: ((currentStats.avg_duration / baseline.avg_duration) - 1) * 100
      });
    }
    
    // Check error rate increase
    if (currentStats.error_rate > baseline.error_rate + 5) {
      regressions.push({
        metric: 'error_rate',
        baseline: baseline.error_rate,
        current: currentStats.error_rate,
        deviation: currentStats.error_rate - baseline.error_rate
      });
    }
    
    return regressions.length > 0 ? regressions : null;
  }
  
  /**
   * Get all baselines
   */
  getBaselines() {
    const baselines = {};
    
    for (const [endpoint, baseline] of this.baselines.entries()) {
      baselines[endpoint] = { ...baseline };
    }
    
    return baselines;
  }
}

/**
 * Performance tracker class
 */
export class PerformanceTracker {
  constructor(options = {}) {
    this.metricsStore = new MetricsStore(options.maxSamples || 1000);
    this.baselineTracker = new BaselineTracker();
    this.alertManager = getAlertManager();
    this.checkInterval = options.checkInterval || 60000; // 1 minute
    this.baselineUpdateInterval = options.baselineUpdateInterval || 3600000; // 1 hour
    this.businessMetrics = new Map();
    
    // Initialize environment detector
    this.environmentDetector = getEnvironmentDetector();
    this.config = this.environmentDetector.getConfiguration();
    this.performance = null;
    
    // Initialize performance API asynchronously
    this.initializePerformanceAPI();
    
    // Start periodic checks only if monitoring is enabled
    if (this.environmentDetector.isMonitoringEnabled()) {
      this.startPeriodicChecks();
    }
  }
  
  /**
   * Initialize performance API based on environment
   */
  async initializePerformanceAPI() {
    try {
      this.performance = await this.environmentDetector.createPerformanceAPI();
    } catch (error) {
      console.warn('Failed to initialize performance API:', error.message);
      this.performance = this.environmentDetector.createMockPerformanceAPI();
    }
  }
  
  /**
   * Track endpoint performance
   */
  async trackEndpointPerformance(endpoint, duration, statusCode, metadata = {}) {
    try {
      // Add sample to store
      this.metricsStore.addSample(endpoint, duration, statusCode, metadata);
      
      // Get current stats
      const stats = this.metricsStore.getEndpointStats(endpoint);
      
      // Check for immediate issues
      if (duration > 5000) {
        // Very slow response - fire-and-forget to avoid request latency
        this.alertManager.processAlert({
          category: AlertCategory.PERFORMANCE,
          service: 'api',
          type: 'slow_response',
          severity: duration > 10000 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
          metrics: {
            endpoint,
            duration,
            statusCode,
            threshold: 5000
          },
          description: `Endpoint ${endpoint} responded in ${duration}ms`
        }).catch(error => {
          console.error('Failed to process performance alert:', error);
        });
      }
      
      // Check for regression
      const regressions = this.baselineTracker.checkRegression(endpoint, stats);
      
      if (regressions) {
        await this.checkPerformanceRegression(endpoint, regressions, stats);
      }
      
      return stats;
    } catch (error) {
      console.error('Error tracking endpoint performance:', error);
    }
  }
  
  /**
   * Track business metric
   */
  trackBusinessMetric(metric, value, metadata = {}) {
    if (!this.businessMetrics.has(metric)) {
      this.businessMetrics.set(metric, {
        values: [],
        total: 0,
        sum: 0
      });
    }
    
    const data = this.businessMetrics.get(metric);
    
    data.values.push({
      value,
      timestamp: Date.now(),
      ...metadata
    });
    
    data.total++;
    data.sum += value;
    
    // Keep only last 1000 values
    if (data.values.length > 1000) {
      data.values = data.values.slice(-1000);
    }
  }
  
  /**
   * Get business metrics summary
   */
  getBusinessMetrics(timeWindow = null) {
    const metrics = {};
    
    for (const [name, data] of this.businessMetrics.entries()) {
      let values = data.values;
      
      if (timeWindow) {
        const cutoff = Date.now() - timeWindow;
        values = values.filter(v => v.timestamp >= cutoff);
      }
      
      if (values.length === 0) {
        metrics[name] = {
          count: 0,
          average: 0,
          total: 0
        };
      } else {
        const sum = values.reduce((a, v) => a + v.value, 0);
        metrics[name] = {
          count: values.length,
          average: sum / values.length,
          total: sum,
          recent: values.slice(-10)
        };
      }
    }
    
    return metrics;
  }
  
  /**
   * Check for performance regression
   */
  async checkPerformanceRegression(endpoint, regressions, stats) {
    const worstRegression = regressions.reduce((worst, r) => 
      r.deviation > worst.deviation ? r : worst
    );
    
    await this.alertManager.processAlert({
      category: AlertCategory.PERFORMANCE,
      service: 'api',
      type: 'regression_detected',
      severity: worstRegression.deviation > 100 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      metrics: {
        endpoint,
        regression: worstRegression,
        current_p95: stats.percentiles.p95,
        current_avg: stats.avg_duration,
        current_error_rate: stats.error_rate
      },
      description: `Performance regression detected for ${endpoint}: ${worstRegression.metric} increased by ${worstRegression.deviation.toFixed(1)}%`
    });
  }
  
  /**
   * Establish baseline for endpoint
   */
  async establishBaseline(endpoint, samples = 100) {
    const stats = this.metricsStore.getEndpointStats(endpoint);
    
    if (!stats || stats.sample_count < samples) {
      return {
        success: false,
        message: `Insufficient samples (${stats?.sample_count || 0}/${samples})`
      };
    }
    
    this.baselineTracker.updateBaseline(endpoint, stats);
    
    return {
      success: true,
      baseline: this.baselineTracker.baselines.get(endpoint)
    };
  }
  
  /**
   * Detect performance anomalies
   */
  async detectPerformanceRegression(endpoint, currentMetrics) {
    const baseline = this.baselineTracker.baselines.get(endpoint);
    
    if (!baseline) {
      return null;
    }
    
    const regressions = this.baselineTracker.checkRegression(endpoint, currentMetrics);
    
    if (regressions) {
      await this.checkPerformanceRegression(endpoint, regressions, currentMetrics);
      return regressions;
    }
    
    return null;
  }
  
  /**
   * Generate performance report
   */
  async generatePerformanceReport(timeWindow = 3600000) {
    const endpointStats = this.metricsStore.getAllStats(timeWindow);
    const baselines = this.baselineTracker.getBaselines();
    const businessMetrics = this.getBusinessMetrics(timeWindow);
    
    // Calculate overall statistics
    let totalRequests = 0;
    let totalErrors = 0;
    let avgResponseTimes = [];
    
    for (const stats of Object.values(endpointStats)) {
      if (stats) {
        totalRequests += stats.sample_count;
        totalErrors += stats.errors;
        avgResponseTimes.push(stats.avg_duration);
      }
    }
    
    const overallErrorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const overallAvgResponse = avgResponseTimes.length > 0 ? 
      avgResponseTimes.reduce((a, b) => a + b, 0) / avgResponseTimes.length : 0;
    
    // Identify slowest endpoints
    const slowestEndpoints = Object.entries(endpointStats)
      .filter(([_, stats]) => stats && stats.sample_count > 0)
      .sort((a, b) => b[1].percentiles.p95 - a[1].percentiles.p95)
      .slice(0, 5)
      .map(([endpoint, stats]) => ({
        endpoint,
        p95: stats.percentiles.p95,
        avg: stats.avg_duration,
        samples: stats.sample_count
      }));
    
    // Identify endpoints with highest error rates
    const errorProneEndpoints = Object.entries(endpointStats)
      .filter(([_, stats]) => stats && stats.errors > 0)
      .sort((a, b) => b[1].error_rate - a[1].error_rate)
      .slice(0, 5)
      .map(([endpoint, stats]) => ({
        endpoint,
        error_rate: stats.error_rate,
        errors: stats.errors,
        total: stats.sample_count
      }));
    
    return {
      timestamp: new Date().toISOString(),
      time_window_ms: timeWindow,
      overall_metrics: {
        total_requests: totalRequests,
        total_errors: totalErrors,
        error_rate: overallErrorRate.toFixed(2) + '%',
        avg_response_time: Math.round(overallAvgResponse) + 'ms'
      },
      endpoint_statistics: endpointStats,
      baselines,
      slowest_endpoints: slowestEndpoints,
      error_prone_endpoints: errorProneEndpoints,
      business_metrics: businessMetrics,
      recommendations: this.generateRecommendations(
        endpointStats, 
        baselines, 
        businessMetrics
      )
    };
  }
  
  /**
   * Generate performance recommendations
   */
  generateRecommendations(endpointStats, baselines, businessMetrics) {
    const recommendations = [];
    
    // Check for slow endpoints
    for (const [endpoint, stats] of Object.entries(endpointStats)) {
      if (stats && stats.percentiles.p95 > 2000) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          endpoint,
          message: `Endpoint ${endpoint} has P95 response time of ${stats.percentiles.p95}ms. Consider optimization.`
        });
      }
      
      if (stats && stats.error_rate > 5) {
        recommendations.push({
          type: 'reliability',
          priority: 'critical',
          endpoint,
          message: `Endpoint ${endpoint} has ${stats.error_rate.toFixed(1)}% error rate. Investigate failures.`
        });
      }
    }
    
    // Check business metrics
    const conversionRate = businessMetrics.ticket_conversion_rate?.average || 0;
    if (conversionRate < 0.5) {
      recommendations.push({
        type: 'business',
        priority: 'medium',
        message: `Low ticket conversion rate (${(conversionRate * 100).toFixed(1)}%). Review checkout flow.`
      });
    }
    
    return recommendations;
  }
  
  /**
   * Start periodic checks
   */
  startPeriodicChecks() {
    // Periodic performance check
    setInterval(async () => {
      try {
        const report = await this.generatePerformanceReport(300000); // Last 5 minutes
        
        // Check for critical issues
        if (report.overall_metrics.error_rate > 10) {
          await this.alertManager.processAlert({
            category: AlertCategory.PERFORMANCE,
            service: 'system',
            type: 'high_error_rate',
            severity: AlertSeverity.HIGH,
            metrics: report.overall_metrics,
            description: `System error rate is ${report.overall_metrics.error_rate}`
          });
        }
        
        // Cleanup old samples
        this.metricsStore.cleanupOldSamples();
      } catch (error) {
        console.error('Performance check error:', error);
      }
    }, this.checkInterval);
    
    // Periodic baseline update
    setInterval(() => {
      try {
        const stats = this.metricsStore.getAllStats();
        
        for (const [endpoint, endpointStats] of Object.entries(stats)) {
          if (endpointStats && endpointStats.sample_count >= 50) {
            this.baselineTracker.updateBaseline(endpoint, endpointStats);
          }
        }
      } catch (error) {
        console.error('Baseline update error:', error);
      }
    }, this.baselineUpdateInterval);
  }
  
  /**
   * Export metrics for external monitoring
   */
  exportMetrics() {
    return {
      endpoints: this.metricsStore.getAllStats(),
      baselines: this.baselineTracker.getBaselines(),
      business: this.getBusinessMetrics()
    };
  }
}

// Singleton instance
let performanceTracker = null;

/**
 * Get or create performance tracker instance
 */
export function getPerformanceTracker() {
  if (!performanceTracker) {
    performanceTracker = new PerformanceTracker();
  }
  return performanceTracker;
}

export default {
  PerformanceTracker,
  MetricsStore,
  BaselineTracker,
  getPerformanceTracker
};